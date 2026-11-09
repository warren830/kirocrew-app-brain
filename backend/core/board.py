"""需求看板: one requirement as the sample team board shows a run — its actors as nodes (the owner, the local brain-dev
session, Lean's approvals, the hand-over, the bridge, the signer, the runner's brain-run session, the checks, the
release acceptance, the write-back into the Brain), each actor's lane on one time axis, the run branch's commits on a
conveyor, a check wall, the events, and 验收 (the sample's 签字单).

Built from what is already recorded, never guessed: the Lean ledger (aidlc-docs/audit, read by repo.py), the run trace
(brainkit.trace: commits, the hand-over, the bridge's ledger and vouchers when this machine has them, park.json's
history, the merge and the 14 days after it), the MR (person mode: mrinfo.py), the bridge ledger (team mode), this
app's own events and the Kiro Crew sessions it opened. Every event is folded in time order into each actor's status,
so each actor carries its status history and the page can play the requirement again (回放) from the same snapshot.
Pure: no I/O here (the service reads and passes everything in).
"""

from __future__ import annotations

import re
from typing import Any, Callable

from . import lean_view
from .deliveries import CAT_LABEL, CAT_ORDER, KIND_LABEL, category, park_waiting

# (key, title, sub, icon): the actors in the order of the way
ACTORS = (
    ("local", "本机会话", "brain-dev · AI-DLC Lean", "laptop"),
    ("req", "需求审批", "REQUIREMENTS", "req"),
    ("design", "设计审批", "DESIGN · PLAN", "design"),
    ("handover", "交接", "brain handoff", "handover"),
    ("bridge", "桥", "核对交接 · 转问题", "bridge"),
    ("signer", "签名", "接手合同 · 回答凭证", "signer"),
    ("runner", "运行机", "brain-run · 无人值守", "runner"),
    ("ci", "CI 检查", "lean verify", "ci"),
    ("release", "发布验收", "RELEASE · 验收", "release"),
    ("reflect", "回写 Brain", "brain reflect", "brain"),
)
RUNNER_SIDE = ("handover", "bridge", "signer", "runner")
# what an actor waits for before its turn (its line while 还没轮到)
WAIT_TEXT = {
    "local": "等你开工", "req": "等 Lean 走到需求审批", "design": "等需求批准以后的设计", "handover": "等本机做完再 brain handoff",
    "bridge": "等交接以后核对", "signer": "等桥核对完签接手合同", "runner": "等签好合同以后接手", "ci": "等提交以后跑 verify",
    "release": "等 Lean 走到发布审批", "reflect": "等合并以后写回 Brain",
}
# Lean's approval kinds -> the gate actors they ask
GATES_OF = {"REQUIREMENTS": ("req",), "INCEPTION": ("req", "design"), "DESIGN": ("design",), "PLAN": ("design",),
            "RELEASE": ("release",)}
GATE_KIND_LABEL = {"REQUIREMENTS": "需求", "INCEPTION": "需求和设计", "DESIGN": "设计", "PLAN": "代码生成计划",
                   "RELEASE": "发布"}
FINAL = ("merged", "skipped", "failed")
MAX_EVENTS = 400
MAX_BELT = 80


def _epoch(x: Any) -> float | None:
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        return float(x)
    return lean_view.epoch(x) if isinstance(x, str) else None


def _clip(s: Any, n: int) -> str:
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[: n - 1] + "…"


def _stage_label(d: dict[str, Any]) -> str:
    sid = str(d.get("stage") or "")
    label = lean_view.STAGE_LABEL.get(sid, sid or "一个阶段")
    return "%s（%s）" % (label, d["unit"]) if d.get("unit") else label


def _cmd_name(cmd: Any) -> str:
    """The check's short name: its program (pytest, npm test → npm, python -m pytest → pytest)."""
    words = [w for w in re.split(r"\s+", str(cmd or "").strip()) if w and not re.match(r"^[A-Z_]+=", w)]
    if not words:
        return "检查"
    if len(words) >= 3 and words[0].startswith("python") and words[1] == "-m":
        return words[2][:16]
    name = words[0].rsplit("/", 1)[-1]
    if name in ("npm", "pnpm", "yarn", "npx") and len(words) > 1:
        return ("%s %s" % (name, words[2] if words[1] == "run" and len(words) > 2 else words[1]))[:16]
    return name[:16]


class _Fold:
    """The actors' state, folded from the events in time order (each change kept: the replay reads it)."""

    def __init__(self) -> None:
        self.a: dict[str, dict[str, Any]] = {}
        for key, title, sub, icon in ACTORS:
            self.a[key] = {"key": key, "title": title, "sub": sub, "icon": icon, "status": "waiting", "doing": WAIT_TEXT[key],
                           "since": None, "history": [], "spans": [], "marks": [], "facts": [], "credits": None,
                           "session": None, "line": None}

    def put(self, key: str, status: str, doing: str, at: float | None) -> None:
        x = self.a[key]
        if x["status"] == status and x["doing"] == doing:
            return
        x["status"], x["doing"] = status, doing
        if at is not None:
            x["since"] = at
            x["history"].append({"at": at, "status": status, "doing": doing})

    def open(self, key: str, kind: str, at: float | None) -> None:
        if at is None:
            return
        spans = self.a[key]["spans"]
        if spans and spans[-1]["b"] is None and spans[-1]["kind"] == kind:
            return
        self.close(key, at)
        spans.append({"a": at, "b": None, "kind": kind})

    def close(self, key: str, at: float | None, kind: str | None = None) -> None:
        spans = self.a[key]["spans"]
        if spans and spans[-1]["b"] is None and (kind is None or spans[-1]["kind"] == kind) and at is not None:
            spans[-1]["b"] = max(at, spans[-1]["a"])

    def mark(self, key: str, at: float | None, kind: str, title: str) -> None:
        if at is not None:
            self.a[key]["marks"].append({"at": at, "kind": kind, "title": _clip(title, 160)})

    def status(self, key: str) -> str:
        return self.a[key]["status"]


def events_of(f: dict[str, Any], t: dict[str, Any] | None, *, mr: dict[str, Any] | None, app_events: list[dict[str, Any]],
              team_decisions: list[dict[str, Any]], subjects: dict[str, str], reflect_refs: list[tuple[str, float]],
              default_branch: str) -> list[dict[str, Any]]:
    """Every recorded event of the requirement, oldest first, in the board's words (BoardEvent without seq)."""
    run = f.get("run") or {}
    handoff = run.get("handoff") if isinstance(run.get("handoff"), dict) else None
    hand_at = _epoch((handoff or {}).get("requested_at"))
    out: list[dict[str, Any]] = []
    order = [0]

    def add(at: float | None, kind: str, frm: str | None, to: str | None, text: str, *, detail: bool = False,
            src: str | None = None, **data: Any) -> None:
        if at is None:
            return
        order[0] += 1
        out.append({"at": at, "kind": kind, "from": frm, "to": to, "text": _clip(text, 200), "detail": detail,
                    "src": src, "_n": order[0], **data})

    def side(at: float | None) -> str:
        return "runner" if hand_at is not None and at is not None and at > hand_at else "local"

    claim = f.get("claim") or {}
    add(_epoch(claim.get("created_at")), "claim", "person", "person", "认领 %s：%s" % (f["key"], _clip(claim.get("title"), 40)),
        src="claim/%s" % f["key"])
    add(_epoch(run.get("created_at")), "start", "person", "local", "开工：brain start，在它自己的工作目录里",
        src="runs/%s/run.json" % f["key"])
    # Lean's ledger
    for e in f.get("events") or []:
        ev, d, at = e.get("event"), e.get("data") if isinstance(e.get("data"), dict) else {}, e.get("_at")
        s = side(at)
        if ev == "STAGE_STARTED":
            add(at, "stage", s, s, "开始「%s」" % _stage_label(d), detail=True, stage=d.get("stage"), state="started")
        elif ev == "STAGE_COMPLETED":
            add(at, "stage", s, s, "做完「%s」" % _stage_label(d), detail=True, stage=d.get("stage"), state="done")
        elif ev == "STAGE_SKIPPED":
            add(at, "stage", s, s, "跳过「%s」%s" % (_stage_label(d), "：%s" % _clip(d.get("reason"), 60) if d.get("reason") else ""),
                detail=True, stage=d.get("stage"), state="skipped")
        elif ev in ("APPROVAL_REQUESTED", "APPROVED", "REJECTED", "APPROVAL_REFUSED"):
            kind = str(d.get("kind") or "")
            gates = GATES_OF.get(kind)
            if not gates:
                continue
            name = GATE_KIND_LABEL.get(kind, kind)
            sha = str(d.get("sha256") or "")[:8]
            if ev == "APPROVAL_REQUESTED":
                add(at, "request", s, gates[0], "请你批准%s（%s%s）" % (name, kind, " · " + sha if sha else ""), gates=list(gates),
                    lean=kind)
            elif ev == "APPROVED":
                add(at, "approve", "person", gates[0], "你批准了%s" % name, gates=list(gates), lean=kind)
            elif ev == "REJECTED":
                add(at, "reject", "person", gates[0], "你退回了%s" % name, gates=list(gates), lean=kind)
            else:
                add(at, "refused", gates[0], gates[0], "审批口令没被接受（%s）" % _clip(d.get("check") or name, 40),
                    gates=list(gates), lean=kind)
        elif ev == "BLOCKED":
            what = "写 %s" % _clip(d.get("path"), 50) if d.get("path") else "一次 %s" % _clip(d.get("tool") or "工具调用", 30)
            add(at, "blocked", s, s, "Lean 拦下了%s（%s）" % (what, _clip(d.get("gate") or "规则", 30)), detail=True)
        elif ev == "VERIFY":
            res = [r for r in d.get("results") or [] if isinstance(r, dict)] if isinstance(d.get("results"), list) else []
            bad = [_cmd_name(r.get("cmd")) for r in res if r.get("exit") not in (0, None)]
            ok = bool(d.get("ok"))
            text = "verify 通过：%d 项都过了" % len(res) if ok else "verify 没过：%s" % ("、".join(bad[:3]) or "有检查失败")
            add(at, "verify", "branch", "checks", text, ok=ok,
                results=[[_cmd_name(r.get("cmd")), r.get("exit") in (0, None)] for r in res][:40])
    # the trace: commits, the hand-over and the bridge, questions, the merge
    commits = ((t or {}).get("actions") or {}).get("commits") or []
    hand_sha = None
    hands = ((t or {}).get("actions") or {}).get("handovers") or []
    for h in hands:
        if h.get("kind") == "requested" and h.get("commit"):
            hand_sha = h["commit"]
    seen_hand = False
    for c in commits:
        at, sha = _epoch(c.get("at")), str(c.get("sha") or "")
        subj = subjects.get(sha, "")
        if sha and sha == hand_sha:
            seen_hand = True
            add(at, "handover", "local", "handover", "交接：brain handoff（%s）" % sha[:8], sha=sha, by="person",
                files=c.get("files") or 0, records=bool(c.get("records_only")), subject=subj or "brain handoff")
        elif c.get("by") == "bot":
            add(at, "commit", "runner", "branch", "运行机提交 %s%s" % (sha[:8], "：%s" % _clip(subj, 60) if subj else ""), sha=sha,
                by="bot", files=c.get("files") or 0, records=bool(c.get("records_only")), subject=subj, actor="runner")
        elif c.get("after_handover"):
            add(at, "commit", "person", "branch", "交接以后有人推了%s（%s）" % ("记录" if c.get("records_only") else "代码", sha[:8]),
                sha=sha, by="person", files=c.get("files") or 0, records=bool(c.get("records_only")), subject=subj,
                actor="runner", outside=True)
        else:
            add(at, "commit", "local", "branch", "提交 %s%s" % (sha[:8], "：%s" % _clip(subj, 60) if subj else ""), sha=sha,
                by="person", files=c.get("files") or 0, records=bool(c.get("records_only")), subject=subj, actor="local")
    if hand_at is not None and not seen_hand:
        add(hand_at, "handover", "local", "handover", "交接：brain handoff", by="person", sha=(handoff or {}).get("local_head") or "")
    for h in hands:
        at, kind = _epoch(h.get("at")), str(h.get("kind") or "")
        if kind == "bridge accepted":
            add(at, "accepted", "handover", "bridge", "桥接手了%s" % (" !%s" % h["mr_iid"] if h.get("mr_iid") else ""))
        elif kind == "bridge rejected":
            add(at, "rejected", "bridge", "handover", "桥拒绝接手%s" % ("：%s" % _clip(h.get("reason"), 90) if h.get("reason") else ""))
        elif kind == "voucher":
            add(at, "signed", "bridge", "signer", "签名服务签了接手合同（%s）" % (h.get("run_id") or ""), run_id=h.get("run_id"))
    for q in ((t or {}).get("actions") or {}).get("questions") or []:
        at, st = _epoch(q.get("at")), q.get("status")
        s = side(at)
        label = KIND_LABEL.get(str(q.get("kind")), q.get("kind") or "问题")
        if st == "waiting":
            add(at, "question", s, "person", "停下问%s：%s" % ("你" if s == "local" else "人", label), park=True, qkind=q.get("kind"))
        elif st == "answered":
            add(at, "answer", "person", s, "%s的问题回答了，接着做" % label, park=True)
    decisions = [d for d in (t or {}).get("decisions") or [] if d.get("source") == "bridge"] or [
        dict(d, source="bridge", asked_at=d.get("created"), at=d.get("updated") if d.get("answer") else None, choice=d.get("answer"))
        for d in team_decisions]
    for d in decisions:
        label = KIND_LABEL.get(str(d.get("kind")), d.get("kind") or "问题")
        add(_epoch(d.get("asked_at")), "question", "bridge", "person", "%s 在 MR 上问人：%s" % (d.get("id"), label),
            did=d.get("id"), qkind=d.get("kind"))
        if d.get("choice"):
            add(_epoch(d.get("at")), "answer", "person", "bridge", "%s 回答了：%s" % (d.get("id"), _clip(d.get("choice"), 20)), did=d.get("id"))
            if d.get("state") == "delivered":
                add((_epoch(d.get("at")) or 0) + 1 if _epoch(d.get("at")) else None, "answer", "bridge", "runner",
                    "桥把 %s 的回答签好送回运行机" % d.get("id"), did=d.get("id"))
    if not decisions:   # person mode without the ledger: the MR's questions, at the time they were posted
        for q in (mr or {}).get("questions") or []:
            add(_epoch(q.get("at")), "question", "bridge", "person", "%s 在 MR 上问人：%s" % (q.get("id"), q.get("kind_label") or "问题"),
                did=q.get("id"), qkind=q.get("kind"))
    m = ((t or {}).get("outcome") or {}).get("merged_at") or {}
    if m.get("value"):
        how = {"merge commit": "合并提交", "fast-forward": "快进"}.get(str(m.get("how") or ""), "")
        add(_epoch(m.get("value")), "merge", "branch", "branch", "合并进 %s%s" % (default_branch, "（%s）" % how if how else ""),
            sha=str(m.get("commit") or ""))
    elif f.get("merged") and not m.get("value"):
        add(_epoch(f.get("tip_at")) or None, "merge", "branch", "branch", "已在 %s 上" % default_branch)
    # this app's own record
    for e in app_events:
        at, label = _epoch(e.get("at")), str(e.get("label") or "")
        if "会话" in label:
            add(at, "session", "person", "local", label)
        elif "回答" in label:
            add(at, "answer", "person", "local" if "澄清" in label else "bridge", label)
        elif "reflect" in label:
            add(at, "reflect", "person", "reflect", "回写 Brain：%s" % label.split("：")[-1])
        elif "开工" in label:
            continue   # run.created_at says it already
        else:
            add(at, "app", "person", "person", label)
    for ref, at in reflect_refs:
        add(at, "reflect", "person", "reflect", "写好了回写分支 %s" % ref, ref=ref)
    out.sort(key=lambda x: (x["at"], x["_n"]))
    return out


def build(f: dict[str, Any], row: dict[str, Any], t: dict[str, Any] | None, *, mr: dict[str, Any] | None,
          sessions: list[dict[str, Any]], app_events: list[dict[str, Any]], team_decisions: list[dict[str, Any]],
          subjects: dict[str, str], reflect_refs: list[tuple[str, float]], default_branch: str, local_only: bool,
          kit_rows: list[dict[str, Any]], decisions: list[dict[str, Any]], brain: dict[str, Any] | None,
          me: str | None, now: float) -> dict[str, Any]:
    """The board's graph part (actors, events, belt, checks, accept, person, live, direct); the service adds the
    requirement's detail (decisions, questions, 变更说明, sessions, credits)."""
    run = f.get("run") or {}
    handoff = run.get("handoff") if isinstance(run.get("handoff"), dict) else None
    hand_at = _epoch((handoff or {}).get("requested_at"))
    evs = events_of(f, t, mr=mr, app_events=app_events, team_decisions=team_decisions, subjects=subjects,
                    reflect_refs=reflect_refs, default_branch=default_branch)
    fo = _Fold()
    A = fo.a
    proposals = ((brain or {}).get("proposals") or 0) if isinstance(brain, dict) else 0
    merged_at = next((e["at"] for e in evs if e["kind"] == "merge"), None)
    first_at = evs[0]["at"] if evs else None
    if local_only:
        for k in RUNNER_SIDE:
            fo.put(k, "skipped", "这个仓库只在本机做：不交给运行机", first_at)
    verify_seen = False
    gate_wait: dict[str, float] = {}
    for e in evs:
        at, kind = e["at"], e["kind"]
        if kind == "start":
            fo.put("local", "running", "开工：读需求、按 Lean 推进", at)
            fo.open("local", "work", at)
        elif kind == "stage":
            s = e["from"]
            if A[s]["status"] in ("skipped",):
                continue
            label = lean_view.STAGE_LABEL.get(str(e.get("stage") or ""), "一个阶段")
            if e.get("state") == "started":
                fo.put(s, "fixing" if A[s]["status"] == "fixing" else "running", "在做：%s" % label, at)
                fo.open(s, "fix" if A[s]["status"] == "fixing" else "work", at)
                if e.get("stage") == "build-and-test" and A["ci"]["status"] == "waiting":
                    fo.put("ci", "running", "跑 verify：构建和测试", at)
                    fo.open("ci", "work", at)
            elif e.get("state") == "done" and A[s]["status"] in ("running", "fixing"):
                fo.put(s, A[s]["status"], "做完%s" % label, at)
        elif kind == "request":
            for g in e.get("gates") or []:
                fo.put(g, "awaiting_approval", "等你批准%s" % GATE_KIND_LABEL.get(e.get("lean") or "", ""), at)
                fo.open(g, "wait", at)
                gate_wait[g] = at
                fo.mark(g, at, "request", e["text"])
            s = e["from"]
            if A[s]["status"] not in FINAL:
                fo.put(s, "done", "交给你批准%s" % GATE_KIND_LABEL.get(e.get("lean") or "", ""), at)
                fo.close(s, at)
            if e.get("lean") == "RELEASE":
                for k in ("ci",):
                    if A[k]["status"] in ("running", "done"):
                        fo.put(k, "done", A[k]["doing"], at)
        elif kind == "approve":
            for g in e.get("gates") or []:
                fo.put(g, "merged", "你批准了 · %s" % GATE_KIND_LABEL.get(e.get("lean") or "", ""), at)
                fo.close(g, at, "wait")
                fo.mark(g, at, "approved", e["text"])
        elif kind == "reject":
            for g in e.get("gates") or []:
                fo.put(g, "fixing", "你退回了：等它改好再请你批", at)
                fo.close(g, at, "wait")
                fo.mark(g, at, "rejected", e["text"])
            s = "runner" if hand_at is not None and at > hand_at else "local"
            fo.put(s, "fixing", "按你的意见重写", at)
            fo.open(s, "fix", at)
        elif kind == "refused":
            for g in e.get("gates") or []:
                fo.mark(g, at, "refused", e["text"])
        elif kind == "blocked":
            fo.mark(e["from"], at, "blocked", e["text"])
        elif kind == "commit":
            fo.mark(e.get("actor") or "local", at, "commit", e["text"])
            if e["from"] == "runner" and A["runner"]["status"] in ("waiting", "queued"):
                fo.put("runner", "running", "在做：运行机接手了", at)
                fo.open("runner", "work", at)
        elif kind == "handover":
            fo.put("local", "done", "交给运行机了", at)
            fo.close("local", at)
            fo.put("handover", "queued", "等桥核对交接", at)
            fo.mark("handover", at, "handover", e["text"])
            fo.mark("local", at, "handover", e["text"])
            fo.put("bridge", "running", "核对交接：标签、提交、材料", at)
            fo.open("bridge", "work", at)
        elif kind == "accepted":
            fo.put("handover", "merged", "桥接手了", at)
            fo.put("bridge", "done", "接手了 · 转问题和回答", at)
            fo.close("bridge", at)
            fo.mark("bridge", at, "accepted", e["text"])
            if A["signer"]["status"] == "waiting":
                fo.put("signer", "merged", "签了接手合同", at)
            if A["runner"]["status"] in ("waiting", "queued"):
                fo.put("runner", "running", "在做：运行机接手了", at)
                fo.open("runner", "work", at)
        elif kind == "rejected":
            fo.put("handover", "failed", "接手被拒：改好后重新交接", at)
            fo.put("bridge", "failed", e["text"].replace("桥拒绝接手：", "拒绝接手："), at)
            fo.close("bridge", at)
            fo.mark("bridge", at, "rejected", e["text"])
            fo.put("local", "awaiting_approval", "接手被拒：改好后重新 brain handoff", at)
        elif kind == "signed":
            fo.put("signer", "merged", "签了接手合同", at)
            fo.mark("signer", at, "signed", e["text"])
            if A["runner"]["status"] in ("waiting", "queued"):
                fo.put("runner", "running", "在做：拿到签好的合同，开工", at)
                fo.open("runner", "work", at)
        elif kind == "question":
            s = "local" if e["from"] == "local" else "runner"
            label = KIND_LABEL.get(str(e.get("qkind") or ""), "问题")
            if A[s]["status"] not in FINAL:
                fo.put(s, "awaiting_approval", "停下问%s：%s%s" % ("你" if s == "local" else "人", label,
                                                                  "（%s）" % e["did"] if e.get("did") else ""), at)
                fo.open(s, "wait", at)
            fo.mark(s, at, "question", e["text"])
            if e["from"] == "bridge":
                fo.mark("bridge", at, "question", e["text"])
        elif kind == "answer":
            s = "local" if e["to"] == "local" else "runner"
            if A[s]["status"] == "awaiting_approval":
                fo.put(s, "running", "按回答接着做", at)
                fo.open(s, "work", at)
            fo.mark(s, at, "answer", e["text"])
            if e["to"] == "runner" and e["from"] == "bridge":
                fo.mark("signer", at, "signed", "签了回答凭证")
        elif kind == "verify":
            verify_seen = True
            fo.mark("ci", at, "verify-ok" if e.get("ok") else "verify-fail", e["text"])
            if e.get("ok"):
                fo.put("ci", "done", e["text"], at)
                fo.close("ci", at)
            else:
                fo.put("ci", "fixing" if A["ci"]["status"] in ("done", "fixing", "failed") else "failed", e["text"], at)
                fo.open("ci", "fix", at)
        elif kind == "merge":
            _merged(fo, at, hand_at, proposals)
        elif kind == "reflect":
            fo.put("reflect", "done", e["text"].replace("写好了回写分支 ", "回写分支 "), at)
            fo.close("reflect", at)
            fo.mark("reflect", at, "reflect", e["text"])
        elif kind == "session":
            fo.mark("local", at, "session", e["text"])
    if merged_at is not None:   # what the clocks put a moment after the merge (Lean's ms, git's seconds) ends there too
        _merged(fo, merged_at, hand_at, proposals, again=True)
    _live_overlay(fo, f, row, sessions, now, hand_at, local_only, merged_at, proposals)
    last = evs[-1]["at"] if evs else None
    for x in A.values():   # spans still open end now (or at the merge)
        for s in x["spans"]:
            if s["b"] is None and x["status"] in FINAL + ("done",):
                s["b"] = max(s["a"], last or s["a"])
    checks = _checks(f, evs, A, kit_rows, t, local_only, hand_at)
    actors = [A[k] for k, *_ in ACTORS]
    _facts(fo, f, evs, row, sessions, proposals)
    person = _person(row, me, f)
    accept = _accept(f, row, A, checks, decisions, t, sessions, merged_at, proposals)
    belt = _belt(evs)
    direct = hand_at is None and (local_only or merged_at is not None or A["ci"]["status"] != "waiting"
                                  or A["release"]["status"] != "waiting")
    live = any(x["status"] in ("running", "fixing") for x in actors) and row.get("state") not in ("merged", "closed")
    for i, e in enumerate(evs, 1):
        e["seq"] = i
    events = [{k: e[k] for k in ("seq", "at", "kind", "from", "to", "text", "detail", "src")} for e in evs][-MAX_EVENTS:]
    return {"actors": actors, "events": events, "belt": belt, "checks": checks, "accept": accept, "person": person,
            "live": bool(live), "direct": bool(direct), "started_at": first_at, "ended_at": merged_at}


def _merged(fo: _Fold, at: float, hand_at: float | None, proposals: int, again: bool = False) -> None:
    """The merge into the default branch: every actor that took part is finished (green), the others were not on the
    way; the write-back into the Brain waits for the person when the run proposed new knowledge."""
    A = fo.a
    for k, *_ in ACTORS:
        if k == "reflect" or A[k]["status"] in ("skipped", "failed", "merged"):
            continue
        fo.close(k, at)
        if A[k]["status"] == "waiting":
            fo.put(k, "skipped", "这次没用上", at)
        else:
            fo.put(k, "merged", "已合并", at)
    if hand_at is None:
        for k in RUNNER_SIDE:
            if A[k]["status"] != "skipped":
                fo.put(k, "skipped", "没交给运行机：在本机做完", at)
    if again and A["reflect"]["status"] != "waiting":
        return
    if proposals:
        fo.put("reflect", "awaiting_approval", "等你回写 %d 条新知识" % proposals, at)
        fo.open("reflect", "wait", at)
    else:
        fo.put("reflect", "skipped", "这次没有要回写的知识", at)


def _live_overlay(fo: _Fold, f: dict[str, Any], row: dict[str, Any], sessions: list[dict[str, Any]], now: float,
                  hand_at: float | None, local_only: bool, merged_at: float | None, proposals: int) -> None:
    """What is true right now and is not an event: the sessions, the pending approvals (their lines), the state the
    requirement's row says (the MR, the bridge ledger)."""
    A = fo.a
    state = row.get("state")
    waits = row.get("waits") or {}
    local = [s for s in sessions if s.get("kind", "local") == "local" and not s.get("missing")]
    runner = [s for s in sessions if s.get("kind") == "runner" and not s.get("missing")]
    if local:
        s = local[-1]
        A["local"]["session"] = {"slot": s["slot"], "url": s["url"], "busy": bool(s.get("busy"))}
        A["local"]["credits"] = sum(x.get("credits") or 0 for x in local) or None
    if runner:
        s = runner[-1]
        A["runner"]["session"] = {"slot": s["slot"], "url": s["url"], "busy": bool(s.get("busy"))}
        A["runner"]["credits"] = sum(x.get("credits") or 0 for x in runner) or None
    if state == "closed":
        for k in A:
            if A[k]["status"] not in ("merged",):
                fo.put(k, "skipped", "需求已关闭", now)
        return
    if merged_at is not None or state == "merged":
        return
    for a in f.get("approvals") or []:
        gates = GATES_OF.get(str(a.get("kind") or ""), ())
        for g in gates:
            if a.get("state") == "pending":
                # a line to type only on this machine's own run: after the hand-over the runner's approvals are answered
                # on the MR (the bridge brings the answer back), never typed here
                A[g]["line"] = a.get("line") if hand_at is None else None
                if A[g]["status"] != "awaiting_approval":
                    fo.put(g, "awaiting_approval", "等你批准%s" % GATE_KIND_LABEL.get(a["kind"], ""), a.get("at") or now)
            elif a.get("state") == "stale" and A[g]["status"] != "merged":
                fo.put(g, "stalled", "文件改过了：要重新请求批准", a.get("at") or now)
            elif a.get("state") == "approved" and A[g]["status"] in ("waiting", "awaiting_approval"):
                fo.put(g, "merged", "已批准", a.get("at") or now)
    if state == "local" and not hand_at:
        s = local[-1] if local else None
        pend = any(a.get("state") == "pending" for a in f.get("approvals") or [])
        if s and s.get("busy"):
            fo.put("local", "running", "agent 在做", now)
            fo.open("local", "work", now)
        elif s and s.get("awaiting"):
            fo.put("local", "awaiting_approval", "会话里有一个工具调用等你批准", now)
        elif s and not pend and A["local"]["status"] in ("running", "fixing", "waiting"):
            fo.put("local", "awaiting_approval", "会话空着：轮到你回话", now)
        elif not s and A["local"]["status"] == "running" and not pend:
            fo.put("local", "stalled", "这台机器上还没有它的会话：开一个", now)
    elif state == "parked" and not hand_at and park_waiting(f.get("park")):
        fo.put("local", "awaiting_approval", waits.get("text") or "停下等你回答", now)
    elif state == "claimed":
        fo.put("local", "waiting", "认领了，还没开工", None)
    elif state == "handed_over":
        if waits.get("who") == "you":
            fo.put("handover", "stalled", "推上去了，但 MR 上没有交接标签", now)
            fo.put("bridge", "waiting", "MR 上没有交接标签：桥不会接", now)
        else:
            if A["handover"]["status"] not in ("queued",):
                fo.put("handover", "queued", "等桥核对交接", now)
            if A["bridge"]["status"] not in ("running",):
                fo.put("bridge", "running", waits.get("text") or "核对交接", now)
                fo.open("bridge", "work", now)
    elif state == "rejected":
        fo.put("handover", "failed", "接手被拒", now)
        fo.put("bridge", "failed", _clip(waits.get("text") or "接手被拒", 80), now)
        fo.put("local", "awaiting_approval", "接手被拒：改好后重新 brain handoff", now)
    elif state in ("running", "parked", "acceptance"):
        for k, st, doing in (("handover", "merged", "桥接手了"), ("bridge", "done", "接手了 · 转问题和回答"),
                             ("signer", "merged", "签了接手合同")):
            if A[k]["status"] in ("waiting", "queued", "running"):
                fo.put(k, st, doing, now)
                fo.close(k, now)
        if state == "running" and A["runner"]["status"] not in ("running", "fixing"):
            fo.put("runner", "running", waits.get("text") or "运行机在做", now)
            fo.open("runner", "work", now)
        if state == "parked":
            fo.put("runner", "awaiting_approval", _clip(waits.get("text") or "停下等人回答", 80), now)
            fo.open("runner", "wait", now)
        if state == "acceptance":
            fo.put("release", "awaiting_approval", _clip(waits.get("text") or "等产品验收", 80), now)
            fo.open("release", "wait", now)
            if A["runner"]["status"] not in FINAL:
                fo.put("runner", "done", "交给产品验收", now)
                fo.close("runner", now)


def _belt(evs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for e in evs:
        if e["kind"] == "commit" and e.get("sha"):
            out.append({"kind": "commit", "at": e["at"], "sha": e["sha"][:12], "by": e.get("by") or "person",
                        "text": _clip(e.get("subject") or ("运行机的提交" if e.get("by") == "bot" else "提交"), 80),
                        "files": int(e.get("files") or 0), "records_only": bool(e.get("records")),
                        "actor": e.get("actor") or "local"})
        elif e["kind"] == "handover":
            out.append({"kind": "handover", "at": e["at"], "sha": str(e.get("sha") or "")[:12], "by": "person",
                        "text": _clip(e.get("subject") or "brain handoff", 80), "files": int(e.get("files") or 0),
                        "records_only": bool(e.get("records")), "actor": "handover"})
        elif e["kind"] == "merge":
            out.append({"kind": "merge", "at": e["at"], "sha": str(e.get("sha") or "")[:12], "by": "person",
                        "text": e["text"], "files": 0, "records_only": False, "actor": "release"})
    return out[-MAX_BELT:]


def _checks(f: dict[str, Any], evs: list[dict[str, Any]], A: dict[str, dict[str, Any]], kit_rows: list[dict[str, Any]],
            t: dict[str, Any] | None, local_only: bool, hand_at: float | None) -> dict[str, Any]:
    cells: list[dict[str, Any]] = []

    def cell(cid: str, group: str, label: str, name: str, status: str, at: float | None, detail: str, actor: str | None) -> None:
        cells.append({"id": cid, "group": group, "label": label, "name": name, "status": status, "at": at,
                      "detail": _clip(detail, 160), "actor": actor})

    # Lean's approvals: each gate's last word
    last: dict[str, dict[str, Any]] = {}
    for e in evs:
        if e["kind"] in ("request", "approve", "reject") and e.get("lean"):
            last[e["lean"]] = e
    pend = {a["kind"]: a for a in f.get("approvals") or [] if a.get("state") == "pending"}
    for lean, label, name, actor in (("REQUIREMENTS", "需求", "需求审批（REQUIREMENTS）", "req"),
                                     ("DESIGN", "设计", "设计审批（DESIGN）", "design"),
                                     ("PLAN", "计划", "代码生成计划（PLAN）", "design"),
                                     ("RELEASE", "发布", "发布审批（RELEASE）", "release")):
        e = last.get(lean) or (last.get("INCEPTION") if lean in ("REQUIREMENTS", "DESIGN") else None)
        if lean in pend:
            cell("gate-" + lean, "gate", label, name, "wait", None, "等你批准：在会话里打 %s" % pend[lean].get("line"), actor)
        elif not e:
            if lean in ("REQUIREMENTS", "RELEASE") or any(x.get("lean") == lean for x in evs):
                cell("gate-" + lean, "gate", label, name, "skip", None, "还没到这一步", actor)
        elif e["kind"] == "approve":
            cell("gate-" + lean, "gate", label, name, "pass", e["at"], "你批准了", actor)
        elif e["kind"] == "reject":
            cell("gate-" + lean, "gate", label, name, "fail", e["at"], "你退回了：等它改好再批", actor)
        else:
            cell("gate-" + lean, "gate", label, name, "wait", None, "等你批准", actor)
    # verify: the last round's checks
    rounds = [e for e in evs if e["kind"] == "verify"]
    history = []
    for r in rounds:
        res = r.get("results") or []
        history.append({"at": r["at"], "passed": sum(1 for _, ok in res if ok), "failed": sum(1 for _, ok in res if not ok)})
    if rounds:
        r = rounds[-1]
        res = r.get("results") or []
        if not res:
            cell("verify", "verify", "verify", "lean verify", "pass" if r.get("ok") else "fail", r["at"], r["text"], "ci")
        seen: dict[str, int] = {}
        for name, ok in res:
            n = seen[name] = seen.get(name, 0) + 1
            cell("verify-%s-%d" % (name, n), "verify", name, "lean verify：%s" % name, "pass" if ok else "fail", r["at"],
                 "通过" if ok else "没过：在会话里看 verify 的输出", "ci")
    else:
        cell("verify", "verify", "verify", "lean verify", "skip", None, "还没跑过 verify（构建和测试阶段跑）", "ci")
    # the hand-over: the bridge and the signer
    if not local_only:
        hb = A["bridge"]["status"]
        cell("bridge", "handover", "桥", "桥核对交接", "pass" if A["handover"]["status"] == "merged" else
             "fail" if A["handover"]["status"] == "failed" else "wait" if hand_at else "skip",
             A["handover"]["since"] if A["handover"]["status"] in ("merged", "failed") else None,
             {"merged": "接手了", "failed": A["bridge"]["doing"]}.get(A["handover"]["status"], "还没交接" if not hand_at else "在核对"),
             "bridge")
        cell("signer", "handover", "签名", "签名服务签接手合同", "pass" if A["signer"]["status"] == "merged" else
             "fail" if A["signer"]["status"] == "failed" else "skip", A["signer"]["since"] if A["signer"]["status"] == "merged" else None,
             "签了" if A["signer"]["status"] == "merged" else "还没签", "signer")
    # the repo's kit (what the team runner needs committed)
    # (a ! reminder of a repo done only on this machine waits for nobody: it matters once a requirement is handed over)
    for i, k in enumerate(kit_rows):
        warn = k.get("level") == "WARN"
        cell("kit-%d" % i, "brain", k.get("label") or "kit", k.get("text") or "", "fail" if k.get("level") == "FAIL" else
             ("skip" if local_only else "wait") if warn else "pass", None,
             ("只在本机做，现在不碍事；" if warn and local_only else "") + (k.get("todo") or k.get("text") or ""), None)
    # the Brain the run used: stale or unknown citations
    b = (t or {}).get("brain") or {}
    if b.get("loaded") is not None or b.get("cited"):
        bad = list(b.get("unknown") or [])
        stale = list(b.get("stale") or [])
        cell("brain-cite", "brain", "引用", "引用的 Brain 条目", "fail" if bad else "wait" if stale else "pass", None,
             ("引用了 Brain 里没有的 %s" % "、".join(bad[:3])) if bad else ("引用了过时的 %s" % "、".join(stale[:3])) if stale
             else "引用了 %d 条，都在" % len(b.get("cited") or []), "reflect")
    # the 14 days after the merge
    r14 = ((t or {}).get("outcome") or {}).get("reverted_or_hotfixed_within_14d") or {}
    if r14.get("window_end"):
        v = r14.get("value")
        cell("after-14d", "after", "14 天", "合并后 14 天没有回滚或热修", "fail" if v is True else "pass" if v is False else "wait",
             _epoch(r14.get("window_end")) if v is not None else None,
             "有回滚或热修" if v is True else "14 天里没有回滚、热修或缺陷" if v is False else "还在观察：到 %s" % str(r14["window_end"])[:10],
             "release")
    passed = sum(1 for c in cells if c["status"] == "pass")
    failed = sum(1 for c in cells if c["status"] == "fail")
    total = sum(1 for c in cells if c["status"] in ("pass", "fail", "wait"))
    ats = [c["at"] for c in cells if c["at"] is not None]
    return {"cells": cells, "passed": passed, "failed": failed, "total": total, "at": max(ats) if ats else None,
            "history": history}


def _facts(fo: _Fold, f: dict[str, Any], evs: list[dict[str, Any]], row: dict[str, Any], sessions: list[dict[str, Any]],
           proposals: int) -> None:
    A = fo.a
    lean = row.get("lean") or {}
    n_commits = {"local": 0, "runner": 0}
    for e in evs:
        if e["kind"] == "commit" and e.get("actor") in n_commits:
            n_commits[e["actor"]] += 1
    blocked = {"local": 0, "runner": 0}
    for e in evs:
        if e["kind"] == "blocked" and e["from"] in blocked:
            blocked[e["from"]] += 1
    A["local"]["facts"] = [x for x in (
        "Lean 做完 %d/%d 个阶段" % (lean.get("done") or 0, lean.get("total") or 11) if lean else "",
        "提交 %d 次" % n_commits["local"] if n_commits["local"] else "",
        "Lean 拦下 %d 次" % blocked["local"] if blocked["local"] else "",
        "会话 %d 个" % len([s for s in sessions if s.get("kind", "local") == "local"]) if sessions else "") if x]
    A["runner"]["facts"] = [x for x in (
        "提交 %d 次" % n_commits["runner"] if n_commits["runner"] else "",
        "Lean 拦下 %d 次" % blocked["runner"] if blocked["runner"] else "",
        "停下问人 %d 次" % sum(1 for e in evs if e["kind"] == "question" and e["from"] in ("runner", "bridge")) or "",
        ", ".join(row.get("run_ids") or [])) if x]
    for g, lean_kinds in (("req", ("REQUIREMENTS", "INCEPTION")), ("design", ("DESIGN", "INCEPTION", "PLAN")), ("release", ("RELEASE",))):
        reqs = [e for e in evs if e["kind"] == "request" and e.get("lean") in lean_kinds]
        backs = [e for e in evs if e["kind"] == "reject" and e.get("lean") in lean_kinds]
        A[g]["facts"] = [x for x in ("请求批准 %d 次" % len(reqs) if reqs else "", "退回 %d 次" % len(backs) if backs else "",
                                     "approve 那一行在会话里自己打" if A[g]["line"] else "") if x]
    rounds = [e for e in evs if e["kind"] == "verify"]
    A["ci"]["facts"] = [x for x in ("verify %d 次" % len(rounds) if rounds else "",
                                    "没过 %d 次" % sum(1 for r in rounds if not r.get("ok")) if any(not r.get("ok") for r in rounds) else "",
                                    rounds[-1]["text"] if rounds else "") if x]
    A["handover"]["facts"] = [x for x in ("MR !%s" % (row.get("mr") or {}).get("iid") if row.get("mr") else "",
                                          "分支 %s" % f.get("branch") if f.get("branch") else "") if x]
    A["bridge"]["facts"] = ["转了 %d 个问题" % sum(1 for e in evs if e["kind"] == "question" and e["from"] == "bridge")] \
        if any(e["kind"] == "question" and e["from"] == "bridge" for e in evs) else []
    A["signer"]["facts"] = [x for x in ("签了 %d 张凭证" % sum(1 for e in evs if e["kind"] == "signed"),) if not x.startswith("签了 0")]
    A["reflect"]["facts"] = [x for x in ("提议 %d 条新知识" % proposals if proposals else "",) if x]


def _person(row: dict[str, Any], me: str | None, f: dict[str, Any]) -> dict[str, Any]:
    waits = row.get("waits") or {}
    owner = f.get("owner")
    st = row.get("state")
    if st in ("merged", "closed"):
        status, doing = "merged" if st == "merged" else "skipped", "已合并" if st == "merged" else "已关闭"
    elif waits.get("who") in ("you", "product", "people"):
        status, doing = "awaiting_approval", waits.get("text") or "等人"
    elif waits.get("who") in ("agent", "runner", "bridge"):
        status, doing = "running", waits.get("text") or "AI 在做"
    else:
        status, doing = "waiting", waits.get("text") or "没有等你的事"
    return {"status": status, "doing": _clip(doing, 80), "owner": owner, "me": bool(me) and me == owner}


def _accept(f: dict[str, Any], row: dict[str, Any], A: dict[str, dict[str, Any]], checks: dict[str, Any],
            decisions: list[dict[str, Any]], t: dict[str, Any] | None, sessions: list[dict[str, Any]],
            merged_at: float | None, proposals: int) -> dict[str, Any]:
    rel = A["release"]["status"]
    st = row.get("state")
    state = "merged" if (merged_at is not None or st == "merged") else "waiting" if rel == "awaiting_approval" or st == "acceptance" \
        else "accepted" if rel == "merged" else "rejected" if rel == "fixing" else "not_yet"
    waits = row.get("waits") or {}
    local = [s for s in sessions if s.get("kind", "local") == "local" and not s.get("missing")]
    session_url = local[-1]["url"] if local else None
    mr_url = (row.get("mr") or {}).get("url")
    hand = isinstance(run_of(f).get("handoff"), dict)
    pend = None if hand else next((a for a in f.get("approvals") or [] if a.get("state") == "pending" and a.get("line")), None)
    if pend:
        step = {"text": "在会话里自己打这一行，批准%s" % GATE_KIND_LABEL.get(pend["kind"], pend["kind"]), "who": "你",
                "line": pend["line"], "mr_url": None, "session_url": session_url}
    elif st == "acceptance":
        step = {"text": waits.get("text") or "在 MR 上验收", "who": "你" if waits.get("who") == "you" else "产品", "line": None,
                "mr_url": mr_url, "session_url": None}
    elif st == "parked":
        step = {"text": waits.get("text") or "回答问题", "who": "你" if waits.get("who") == "you" else "人", "line": None,
                "mr_url": mr_url, "session_url": session_url if waits.get("who") == "you" else None}
    elif st == "rejected":
        step = {"text": "改好后在分支上重新 brain handoff（它提交交接、推送并打标签）", "who": "你", "line": None, "mr_url": mr_url,
                "session_url": session_url}
    elif st == "handed_over" and waits.get("who") == "you":
        step = {"text": waits.get("text") or "", "who": "你", "line": None, "mr_url": mr_url, "session_url": None}
    elif state == "merged" and A["reflect"]["status"] == "awaiting_approval":
        step = {"text": "在 Brain 里回写这次的 %d 条新知识（brain reflect：先预览，再写到新分支）" % proposals, "who": "你",
                "line": None, "mr_url": None, "session_url": None}
    elif st == "local" and waits.get("who") == "you":
        step = {"text": waits.get("text") or "", "who": "你", "line": None, "mr_url": None, "session_url": session_url}
    else:
        step = {"text": "", "who": "", "line": None, "mr_url": None, "session_url": None}
    counts = {c: 0 for c in CAT_ORDER}
    for d in decisions:
        counts[category(d)] = counts.get(category(d), 0) + 1
    by = [{"id": c, "label": CAT_LABEL[c], "count": counts[c]} for c in CAT_ORDER if counts.get(c)]
    passed, total = checks["passed"], checks["total"]
    gates_ok = [c["label"] for c in checks["cells"] if c["group"] == "gate" and c["status"] == "pass"]
    vr = [c for c in checks["cells"] if c["group"] == "verify"]
    checks_line = "检查 %d/%d 通过" % (passed, total) if total else "还没有检查结果"
    if vr and all(c["status"] == "pass" for c in vr):
        checks_line += "：verify %d 项都过了" % len(vr)
    elif any(c["status"] == "fail" for c in vr):
        checks_line += "：verify 有没过的"
    if gates_ok:
        checks_line += "；%s已批准" % "、".join(gates_ok)
    done = None
    if state == "merged":
        m = ((t or {}).get("outcome") or {}).get("merged_at") or {}
        who = next((h.get("who") for h in reversed((t or {}).get("humans") or []) if h.get("what") in ("RELEASE", "acceptance")
                    and h.get("kind") == "approval"), None)
        done = {"at": merged_at or _epoch(f.get("tip_at")) or 0, "who": who,
                "how": {"merge commit": "合并提交", "fast-forward": "快进"}.get(str(m.get("how") or ""), "已合并")}
    elif state == "accepted":
        done = {"at": A["release"]["since"] or 0, "who": None, "how": "发布已批准，等合并"}
    return {"state": state, "step": step, "by": by, "checks": checks_line, "done": done}


def run_of(f: dict[str, Any]) -> dict[str, Any]:
    return f.get("run") if isinstance(f.get("run"), dict) else {}


def subjects_from_log(text: str) -> dict[str, str]:
    """`git log --no-walk --format=%H%x00%s` output → {sha: subject}."""
    out = {}
    for line in (text or "").splitlines():
        sha, _, subj = line.partition("\0")
        if re.match(r"^[0-9a-f]{40}$", sha):
            out[sha] = subj.strip()[:200]
    return out


def kit_cells(rows: list[dict[str, Any]], repo_path: str) -> list[dict[str, Any]]:
    """The KiroCrew rows about this repo (what the team runner needs committed), as the check wall's kit cells."""
    out = []
    for r in rows:
        if r.get("repo") and repo_path and r.get("repo") != repo_path:
            continue
        if not r.get("repo") and "仓库" not in str(r.get("text") or ""):
            continue
        txt = str(r.get("text") or "")
        label = "适配" if ("适配" in txt or "adapter" in txt) else "Lean" if "Lean" in txt and "提交" in txt else \
            "runs/**" if "runs/" in txt else "kit"
        out.append({"level": r.get("level"), "label": label, "text": txt, "todo": r.get("todo") or ""})
    return out


Fn = Callable[..., Any]
