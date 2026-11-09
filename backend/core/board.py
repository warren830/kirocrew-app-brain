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
    ("req", "需求审批", "Lean 请人批需求", "req"),
    ("design", "设计审批", "设计 · 代码生成计划", "design"),
    ("handover", "交接", "本机做完交给运行机", "handover"),
    ("bridge", "桥", "核对交接 · 转问题", "bridge"),
    ("signer", "签名", "接手合同 · 回答凭证", "signer"),
    ("runner", "运行机", "brain-run · 无人值守", "runner"),
    ("ci", "CI 检查", "构建和测试的自动检查", "ci"),
    ("release", "发布验收", "发布审批 · 验收", "release"),
    ("reflect", "回写 Brain", "合并后写回新知识", "brain"),
)
RUNNER_SIDE = ("handover", "bridge", "signer", "runner")
DESIGN_STAGES = ("user-stories", "application-design", "units", "functional-design", "nfr-design", "infrastructure-design")
AFTER_PLAN = ("build-and-test", "release")   # Lean is past code generation, and so past any PLAN approval
# what an actor waits for before its turn (its line while 还没轮到)
WAIT_TEXT = {
    "local": "等开工", "req": "等 Lean 走到需求审批", "design": "等需求批准以后的设计", "handover": "等本机做完再交接",
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
NOT_NEEDED = "这次不需要"
# Lean's BLOCKED gates (aidlc_lean.py block()) and tools, in words
BLOCK_GATE = {"records": "记录文件只能由 Lean 自己写", "protected": "受保护的文件", "danger": "危险命令", "intent": "还没选需求",
              "contract": "别的团队的文件：要先开变更请求", "verify": "还没过 verify", "requirements": "需求还没批",
              "design": "设计还没批", "inception": "需求和设计还没批", "ideation": "构思还没批", "released": "已经发布了"}
BLOCK_TOOL = {"fs_write": "写文件", "write": "写文件", "execute_bash": "跑命令", "shell": "跑命令", "bash": "跑命令"}
# brainkit.trace's `missing` sources (trace.py): the ones a repo done only on this machine, or a requirement not handed
# over yet, has nothing to read from are not missing
MISSING = (("bridge ledger", "runner", "桥的账本：这台机器上读不到，交接以后桥的核对和转的问题看不全"),
           ("vouchers", "runner", "签名凭证：这台机器上读不到，看不到签名服务签了什么"),
           ("pushes", "runner", "推送记录：git 不记推送，交接以后人的提交当作推送"),
           ("CI pipelines", "remote", "CI 流水线：在 GitLab 上，这里读不到"),
           ("credits", None, "花费：KiroCrew 还没报 credits"),
           ("Lean audit", None, "Lean 的记录：没找到 aidlc-docs/audit，阶段和审批都看不到"),
           ("run branch", None, "需求的分支：本机、远端、默认分支上都没找到"))


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

    def put(self, key: str, status: str, doing: str, at: float | None, who: str | None = None) -> None:
        """*who*: whom a wait for a person is on (Waits.who: you, product, people …), so the replay says it."""
        x = self.a[key]
        doing = " ".join(doing.split())
        if x["status"] == status and x["doing"] == doing:
            return
        x["status"], x["doing"] = status, doing
        if at is not None:
            x["since"] = at
            x["history"].append({"at": at, "status": status, "doing": doing, "who": who})

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

    def rest(self, key: str, at: float) -> None:
        """*key* stopped working at *at* (its session went quiet): its open work or fix span ends there and a wait for
        the person begins (a wait already open stays as it is)."""
        spans = self.a[key]["spans"]
        if spans and spans[-1]["kind"] == "wait" and spans[-1]["b"] in (None, at):
            spans[-1]["b"] = None
            return
        if spans and spans[-1]["b"] is None:
            spans[-1]["b"] = max(at, spans[-1]["a"])
            at = spans[-1]["b"]
        spans.append({"a": at, "b": None, "kind": "wait"})


def _who(you: str) -> str:
    """The requirement's person as Waits.who: you, or someone else (people)."""
    return "you" if you == "你" else "people"


def _you(me: str | None, owner: str | None) -> str:
    """Who the requirement's person is to the one reading the board: 你, or their name (UI问题清单 BOARD-11)."""
    if not me or not owner or me == owner:
        return "你"
    return " %s " % owner


def _first(*xs: Any) -> float | None:
    """The first of *xs* that is a moment."""
    for x in xs:
        t = _epoch(x)
        if t is not None:
            return t
    return None


def missing_sources(raw: list[Any], *, local_only: bool, handed: bool) -> list[str]:
    """brainkit.trace's `missing`, in plain Chinese, without the sources this requirement has no use for: a repo done
    only here has no runner, bridge, signer or GitLab CI; before the hand-over the runner's half has nothing yet."""
    out = []
    for x in raw:
        s = str(x)
        hit = next((m for m in MISSING if s.startswith(m[0])), None)
        if hit:
            if (hit[1] == "runner" and (local_only or not handed)) or (hit[1] == "remote" and local_only):
                continue
            text = hit[2]
        elif "decisions.md" in s:
            text = "决定记录：decisions.md 还没有"
        elif s.endswith("(ignored)"):
            text = "run.json 里有一项格式不对，没用上"
        else:
            text = "还有一个来源没读到"
        if text not in out:
            out.append(text)
    return out


def events_of(f: dict[str, Any], t: dict[str, Any] | None, *, mr: dict[str, Any] | None, app_events: list[dict[str, Any]],
              team_decisions: list[dict[str, Any]], subjects: dict[str, str], reflect_refs: list[tuple[str, float]],
              default_branch: str, you: str = "你") -> list[dict[str, Any]]:
    """Every recorded event of the requirement, oldest first, in the board's words (BoardEvent without seq). *you*: the
    requirement's person as the reader calls them (你, or their name)."""
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
    add(_epoch(run.get("created_at")), "start", "person", "local", "开工：在它自己的工作目录里",
        src="runs/%s/run.json" % f["key"])
    humans = [h for h in (t or {}).get("humans") or [] if isinstance(h, dict)]

    def approver(kind: str, at: float | None, s: str) -> str:
        """Who approved: on this machine's run the person typed the line in their session; on the runner's, whoever
        answered on the MR (their user name when brain-kit read it, never a pseudonym)."""
        if s == "local":
            return you
        h = min((h for h in humans if h.get("what") in (kind, "acceptance") and _epoch(h.get("at")) is not None
                 and at is not None and abs(_epoch(h.get("at")) - at) < 3600), default=None,
                key=lambda h: abs(_epoch(h.get("at")) - at))
        who = str((h or {}).get("who") or "")
        if re.match(r"^[a-z0-9][a-z0-9._-]*$", who):
            return " %s " % who
        return "产品在 MR 上" if kind == "RELEASE" else "有人在 MR 上"   # the acceptance is asked of the product

    # Lean's ledger
    evs = [e for e in f.get("events") or [] if isinstance(e, dict)]
    sessions_seen: set[str] = set()
    for i, e in enumerate(evs):
        ev, d, at = e.get("event"), e.get("data") if isinstance(e.get("data"), dict) else {}, e.get("_at")
        s = side(at)
        if ev == "HUMAN_TURN" and s == "local":
            # the person typed in the session: the session's first prompt is its task, a prompt Lean read as an
            # approval line is the approval itself (the next event); any other is the person stepping in (BOARD-16)
            first = str(d.get("session") or "") not in sessions_seen
            sessions_seen.add(str(d.get("session") or ""))
            nxt = evs[i + 1] if i + 1 < len(evs) else {}
            line = nxt.get("event") in ("APPROVED", "REJECTED", "APPROVAL_REFUSED") and \
                (_epoch(nxt.get("_at")) or 0) - (at or 0) < 5
            if not first and not line:
                add(at, "answer", "person", "local", "%s允许这一轮改受保护的文件" % you if d.get("allow_protected")
                    else "%s在会话里回话了" % you, turn=True)
            continue
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
            if ev == "APPROVAL_REQUESTED":
                add(at, "request", s, gates[0], "请%s批准%s" % (you, name) if s == "local" else "请人在 MR 上批准%s" % name,
                    gates=list(gates), lean=kind)
            elif ev == "APPROVED":
                add(at, "approve", "person", gates[0], "%s批准了%s" % (approver(kind, at, s), name), gates=list(gates),
                    lean=kind, who=approver(kind, at, s))
            elif ev == "REJECTED":
                add(at, "reject", "person", gates[0], "%s退回了%s" % (approver(kind, at, s), name), gates=list(gates),
                    lean=kind, who=approver(kind, at, s))
            else:
                add(at, "refused", gates[0], gates[0], "批准的那一行没被接受（%s）" % name, gates=list(gates), lean=kind)
        elif ev == "BLOCKED":
            what = "写 %s" % _clip(d.get("path"), 50) if d.get("path") else "一次%s" % BLOCK_TOOL.get(str(d.get("tool") or ""), "工具调用")
            add(at, "blocked", s, s, "Lean 拦下了%s：%s" % (what, BLOCK_GATE.get(str(d.get("gate") or ""), "它的规则不让")),
                detail=True)
        elif ev == "VERIFY":
            res = [r for r in d.get("results") or [] if isinstance(r, dict)] if isinstance(d.get("results"), list) else []
            bad = [_cmd_name(r.get("cmd")) for r in res if r.get("exit") not in (0, None)]
            ok = bool(d.get("ok"))
            text = ("verify 通过（%d 项）" % len(res) if res else "verify 通过") if ok else \
                "verify 没过：%s" % ("、".join(bad[:3]) or "有检查失败")
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
            add(at, "handover", "local", "handover", "交给运行机（提交 %s）" % sha[:8], sha=sha, by="person",
                files=c.get("files") or 0, records=bool(c.get("records_only")), subject=subj or "交接")
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
        add(hand_at, "handover", "local", "handover", "交给运行机", by="person", sha=(handoff or {}).get("local_head") or "")
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
            add(at, "question", s, "person", "停下问%s：%s" % (you if s == "local" else "人", label), park=True, qkind=q.get("kind"))
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
        elif label.startswith("回写 Brain"):
            add(at, "reflect", "person", "reflect", "回写 Brain：%s" % label.split("：")[-1], ref=e.get("detail") or None)
        elif "开工" in label:
            continue   # run.created_at says it already
        else:
            add(at, "app", "person", "person", label)
    applied = [e for e in out if e["kind"] == "reflect"]
    for ref, at in reflect_refs:   # the branch this app's write-back made is the same write-back: one event (BOARD-32)
        hit = next((e for e in applied if e.get("ref") == ref or (not e.get("ref") and abs(e["at"] - at) < 120)), None)
        if hit:
            hit["text"] = _clip("%s（回写分支 %s）" % (hit["text"], ref), 200)
            hit["ref"] = ref
        else:
            add(at, "reflect", "person", "reflect", "写好了回写分支 %s" % ref, ref=ref)
    out.sort(key=lambda x: (x["at"], x["_n"]))
    return out


def build(f: dict[str, Any], row: dict[str, Any], t: dict[str, Any] | None, *, mr: dict[str, Any] | None,
          sessions: list[dict[str, Any]], app_events: list[dict[str, Any]], team_decisions: list[dict[str, Any]],
          subjects: dict[str, str], reflect_refs: list[tuple[str, float]], default_branch: str, local_only: bool,
          kit_rows: list[dict[str, Any]], decisions: list[dict[str, Any]], brain: dict[str, Any] | None,
          me: str | None, now: float, changes: dict[str, list[dict[str, Any]]] | None = None) -> dict[str, Any]:
    """The board's graph part (actors, events, belt, checks, accept, person, live, direct, missing); the service adds
    the requirement's detail (decisions, questions, 变更说明, sessions, credits). *changes*: changes_from_log of the
    commits (GIT_LOG), by full sha."""
    run = f.get("run") or {}
    handoff = run.get("handoff") if isinstance(run.get("handoff"), dict) else None
    hand_at = _epoch((handoff or {}).get("requested_at"))
    local_only = bool(local_only or row.get("local_only"))
    you = _you(me, f.get("owner"))
    evs = events_of(f, t, mr=mr, app_events=app_events, team_decisions=team_decisions, subjects=subjects,
                    reflect_refs=reflect_refs, default_branch=default_branch, you=you)
    fo = _Fold()
    A = fo.a
    proposals = ((brain or {}).get("proposals") or 0) if isinstance(brain, dict) else 0
    merged_at = next((e["at"] for e in evs if e["kind"] == "merge"), None)
    first_at = evs[0]["at"] if evs else None
    if local_only:
        for k in RUNNER_SIDE:
            fo.put(k, "skipped", "%s：这个仓库只在本机做" % NOT_NEEDED, first_at)

    def past_design(at: float) -> None:
        """Lean went past the design and the code-generation plan without asking for either: that approval is not on
        this requirement's way (a later PLAN request brings it back)."""
        if A["design"]["status"] == "waiting":
            fo.put("design", "skipped", "%s：Lean %s" % (NOT_NEEDED, "跳过了设计" if all(
                x.get("state") == "skipped" for x in evs if x["kind"] == "stage" and x.get("stage") in DESIGN_STAGES)
                else "没有请人批设计和代码计划"), at)

    last_local = [None]   # the last moment the local session was seen at work (a Lean step, a commit, a turn)
    open_stages: dict[str, list[str]] = {"local": [], "runner": []}   # stages begun and not done, by side
    for e in evs:
        at, kind = e["at"], e["kind"]
        if hand_at is None or at <= hand_at:
            if kind in ("start", "stage", "request", "blocked", "verify", "session") or (
                    kind == "commit" and e.get("actor") == "local"):
                last_local[0] = at
        if kind == "start":
            fo.put("local", "running", "开工：读需求、按 Lean 推进", at)
            fo.open("local", "work", at)
        elif kind == "stage":
            s = e["from"]
            if A[s]["status"] in ("skipped",):
                continue
            label = lean_view.STAGE_LABEL.get(str(e.get("stage") or ""), "一个阶段")
            doing = open_stages[s]
            if label in doing:
                doing.remove(label)
            if e.get("state") == "started":
                doing.append(label)
                fo.put(s, "fixing" if A[s]["status"] == "fixing" else "running", "在做：%s" % label, at)
                fo.open(s, "fix" if A[s]["status"] == "fixing" else "work", at)
                if e.get("stage") == "build-and-test" and A["ci"]["status"] == "waiting":
                    fo.put("ci", "running", "跑 verify：构建和测试", at)
                    fo.open("ci", "work", at)
            elif e.get("state") == "done" and A[s]["status"] in ("running", "fixing"):
                # still at work: on the stage it had begun before this one, else on the next one
                fo.put(s, A[s]["status"], "在做：%s" % (doing[-1] if doing else "下一个阶段"), at)
            if e.get("stage") in AFTER_PLAN or (e.get("stage") == "code-generation" and e.get("state") == "done"):
                past_design(at)
        elif kind == "request":
            if e.get("lean") == "RELEASE":
                past_design(at)
            for g in e.get("gates") or []:
                fo.put(g, "awaiting_approval", "等%s批准%s" % (you if e["from"] == "local" else "人在 MR 上",
                                                          GATE_KIND_LABEL.get(e.get("lean") or "", "")), at,
                       _who(you) if e["from"] == "local" else "product" if e.get("lean") == "RELEASE" else "people")
                fo.open(g, "wait", at)
                fo.mark(g, at, "request", e["text"])
            s = e["from"]
            if A[s]["status"] not in FINAL:
                fo.put(s, "done", "交给%s批准%s" % (you if s == "local" else "人", GATE_KIND_LABEL.get(e.get("lean") or "", "")), at)
                fo.close(s, at)
            if e.get("lean") == "RELEASE":
                for k in ("ci",):
                    if A[k]["status"] in ("running", "done"):
                        fo.put(k, "done", A[k]["doing"], at)
        elif kind == "approve":
            for g in e.get("gates") or []:
                fo.put(g, "merged", "%s批准了 · %s" % (e.get("who") or you, GATE_KIND_LABEL.get(e.get("lean") or "", "")), at)
                fo.close(g, at, "wait")
                fo.mark(g, at, "approved", e["text"])
            if A["design"]["status"] == "waiting" and e.get("lean") == "REQUIREMENTS":
                fo.put("design", "waiting", "等 Lean 做完设计再请人批（小需求它会跳过）", at)
            s = "runner" if hand_at is not None and at > hand_at else "local"
            if A[s]["status"] == "done" and e.get("lean") != "RELEASE":   # the approval line is a turn: it goes on
                fo.put(s, "running", "批准了，接着做", at)
                fo.open(s, "work", at)
        elif kind == "reject":
            for g in e.get("gates") or []:
                fo.put(g, "fixing", "%s退回了：等它改好再请%s批" % (e.get("who") or you, you), at)
                fo.close(g, at, "wait")
                fo.mark(g, at, "rejected", e["text"])
            s = "runner" if hand_at is not None and at > hand_at else "local"
            fo.put(s, "fixing", "按%s的意见重写" % (e.get("who") or you), at)
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
            fo.put("local", "awaiting_approval", "接手被拒：改好后重新交接", at, _who(you))
            fo.open("local", "wait", at)
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
                fo.put(s, "awaiting_approval", "停下问%s：%s%s" % (you if s == "local" else "人", label,
                                                                  "（%s）" % e["did"] if e.get("did") else ""), at,
                       _who(you) if s == "local" else "product" if e.get("qkind") == "acceptance" else "people")
                fo.open(s, "wait", at)
            fo.mark(s, at, "question", e["text"])
            if e["from"] == "bridge":
                fo.mark("bridge", at, "question", e["text"])
        elif kind == "answer" and e.get("turn"):
            # the person spoke in the session: the session had been waiting for them since its last step
            if A["local"]["status"] in ("running", "fixing") and last_local[0] is not None and last_local[0] < at:
                fo.rest("local", last_local[0])
            if A["local"]["status"] not in FINAL:
                fo.put("local", A["local"]["status"] if A["local"]["status"] == "fixing" else "running",
                       "按%s的话接着做" % you, at)
                fo.open("local", "fix" if A["local"]["status"] == "fixing" else "work", at)
            fo.mark("local", at, "answer", e["text"])
            last_local[0] = at
        elif kind == "answer":
            s = "local" if e["to"] == "local" else "runner"
            if A[s]["status"] == "awaiting_approval":
                fo.put(s, "running", "按回答接着做", at)
                fo.open(s, "work", at)
            fo.mark(s, at, "answer", e["text"])
            if e["to"] == "runner" and e["from"] == "bridge":
                fo.mark("signer", at, "signed", "签了回答凭证")
        elif kind == "verify":
            fo.mark("ci", at, "verify-ok" if e.get("ok") else "verify-fail", e["text"])
            if e.get("ok"):
                fo.put("ci", "done", e["text"], at)
                fo.close("ci", at)
            else:
                fo.put("ci", "fixing" if A["ci"]["status"] in ("done", "fixing", "failed") else "failed", e["text"], at)
                fo.open("ci", "fix", at)
        elif kind == "merge":
            _merged(fo, at, hand_at, proposals, you=you)
        elif kind == "reflect":
            fo.put("reflect", "done", e["text"].replace("写好了回写分支 ", "回写分支 "), at)
            fo.close("reflect", at)
            fo.mark("reflect", at, "reflect", e["text"])
        elif kind == "session":
            fo.mark("local", at, "session", e["text"])
    if merged_at is not None:   # what the clocks put a moment after the merge (Lean's ms, git's seconds) ends there too
        _merged(fo, merged_at, hand_at, proposals, again=True, you=you)
    _live_overlay(fo, f, row, sessions, now, hand_at, merged_at, evs, last_local[0], you)
    last = evs[-1]["at"] if evs else None
    for x in A.values():   # spans still open end at the last event (or at the merge)
        for s in x["spans"]:
            if s["b"] is None and x["status"] in FINAL + ("done",):
                s["b"] = max(s["a"], last or s["a"])
    if merged_at is not None:   # the requirement's time ends at the merge: the wait for the write-back is not in it
        for x in A.values():
            x["spans"] = [dict(s, b=merged_at if s["b"] is None or s["b"] > merged_at else s["b"])
                          for s in x["spans"] if s["a"] < merged_at]
    for x in A.values():
        x["spans"] = [s for s in x["spans"] if s["b"] is None or s["b"] > s["a"]]
    asked = {"you": you, "product": "产品"}.get(str((row.get("waits") or {}).get("who")), "人")
    checks = _checks(f, evs, A, kit_rows, t, local_only, hand_at, merged_at, you, asked)
    actors = [A[k] for k, *_ in ACTORS]
    _facts(fo, f, evs, row, sessions, proposals)
    person = _person(row, me, f)
    accept = _accept(f, row, A, checks, decisions, t, sessions, merged_at, proposals, you, mr, team_decisions)
    belt = _belt(evs, changes or {})
    direct = hand_at is None and (local_only or merged_at is not None or A["ci"]["status"] != "waiting"
                                  or A["release"]["status"] != "waiting")
    live = any(x["status"] in ("running", "fixing") for x in actors) and row.get("state") not in ("merged", "closed")
    for i, e in enumerate(evs, 1):
        e["seq"] = i
    events = [{k: e[k] for k in ("seq", "at", "kind", "from", "to", "text", "detail", "src")} for e in evs][-MAX_EVENTS:]
    return {"actors": actors, "events": events, "belt": belt, "checks": checks, "accept": accept, "person": person,
            "live": bool(live), "direct": bool(direct), "started_at": first_at, "ended_at": merged_at,
            "missing": missing_sources((t or {}).get("missing") or [], local_only=local_only, handed=hand_at is not None)}


def _merged(fo: _Fold, at: float, hand_at: float | None, proposals: int, again: bool = False, you: str = "你") -> None:
    """The merge into the default branch: every actor that took part is finished (green), the others were not on the
    way; the write-back into the Brain waits for the person when the run proposed new knowledge."""
    A = fo.a
    for k, *_ in ACTORS:
        if k == "reflect" or A[k]["status"] in ("skipped", "failed", "merged"):
            continue
        fo.close(k, at)
        if A[k]["status"] == "waiting":
            fo.put(k, "skipped", NOT_NEEDED, at)
        else:
            fo.put(k, "merged", "已合并", at)
    if hand_at is None:
        for k in RUNNER_SIDE:
            if A[k]["status"] != "skipped":
                fo.put(k, "skipped", "%s：在本机做完了" % NOT_NEEDED, at)
    if again and A["reflect"]["status"] != "waiting":
        return
    if proposals:
        fo.put("reflect", "awaiting_approval", "等%s回写 %d 条新知识" % (you, proposals), at, _who(you))
        fo.open("reflect", "wait", at)
    else:
        fo.put("reflect", "skipped", "这次没有要回写的知识", at)


def _live_overlay(fo: _Fold, f: dict[str, Any], row: dict[str, Any], sessions: list[dict[str, Any]], now: float,
                  hand_at: float | None, merged_at: float | None, evs: list[dict[str, Any]], last_local: float | None,
                  you: str) -> None:
    """What is true right now and is not an event: the sessions, the pending approvals (their lines), the state the
    requirement's row says (the MR, the bridge ledger). Each state is stamped with the moment it really began (the
    row's waits.since, else the event or the session's last activity that says it), never with this poll's time."""
    A = fo.a
    state = row.get("state")
    waits = row.get("waits") or {}
    since = _epoch(waits.get("since"))
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

    def held(k: str, at: float) -> float:
        """An actor already waiting for a person keeps the moment it began to (the row only words it better)."""
        return _first(A[k]["since"], at) if A[k]["status"] == "awaiting_approval" else at

    def last_of(*kinds: str, side: str | None = None) -> float | None:
        ats = [e["at"] for e in evs if e["kind"] in kinds and (side is None or (side == "runner") == (
            hand_at is not None and e["at"] > hand_at))]
        return ats[-1] if ats else None

    for a in f.get("approvals") or []:
        gates = GATES_OF.get(str(a.get("kind") or ""), ())
        for g in gates:
            if a.get("state") == "pending":
                # a line to type only on this machine's own run: after the hand-over the runner's approvals are answered
                # on the MR (the bridge brings the answer back), never typed here
                A[g]["line"] = a.get("line") if hand_at is None else None
                if A[g]["status"] != "awaiting_approval":
                    fo.put(g, "awaiting_approval", "等%s批准%s" % (you if hand_at is None else "人在 MR 上",
                                                              GATE_KIND_LABEL.get(a["kind"], "")), _first(a.get("at"), now),
                           _who(you) if hand_at is None else "product" if a.get("kind") == "RELEASE" else "people")
            elif a.get("state") == "stale" and A[g]["status"] != "merged":
                fo.put(g, "stalled", "文件改过了：要重新请求批准", _first(a.get("at"), now))
            elif a.get("state") == "approved" and A[g]["status"] in ("waiting", "awaiting_approval"):
                fo.put(g, "merged", "已批准", _first(a.get("at"), now))
    if state == "local" and not hand_at:
        s = local[-1] if local else None
        pend = any(a.get("state") == "pending" for a in f.get("approvals") or [])
        # the moment the session went quiet: its last message, not before its last recorded step; the row's waits.since
        # says it (deliveries.updated_at), so the board and every list agree on it
        quiet = since if waits.get("do") in ("reply", "tool") and since is not None else max(
            [x for x in (_epoch((s or {}).get("last_activity")), last_local) if x is not None], default=now)
        def quiet_down() -> None:
            fo.close("ci", quiet, "fix")   # nobody fixes a red verify in a session that waits either
            fo.close("ci", quiet, "work")
            fo.rest("local", quiet)

        if s and s.get("awaiting"):   # busy too: a turn that waits for a tool call's approval
            quiet_down()
            fo.put("local", "awaiting_approval", "会话里有一个工具调用等%s批准" % you, quiet, _who(you))
        elif s and s.get("busy"):
            if A["local"]["status"] not in ("running", "fixing"):
                fo.put("local", "running", "AI 在做", _first(s.get("last_activity"), now))
                fo.open("local", "work", _first(s.get("last_activity"), now))
        elif s and not pend and A["local"]["status"] in ("running", "fixing", "waiting", "done"):
            quiet_down()
            fo.put("local", "awaiting_approval", "会话空着：轮到%s回话" % you, quiet, _who(you))
        elif not s and A["local"]["status"] == "running" and not pend:
            fo.put("local", "stalled", "这台机器上还没有它的会话：开一个", _first(since, last_local, now))
    elif state == "parked" and not hand_at and park_waiting(f.get("park")):
        at = held("local", _first(since, last_of("question", side="local"), now))
        fo.put("local", "awaiting_approval", waits.get("text") or "停下等%s回答" % you, at, waits.get("who") or _who(you))
        fo.rest("local", at)
    elif state == "claimed":
        fo.put("local", "waiting", "认领了，还没开工", _first(since, (f.get("claim") or {}).get("created_at")))
    elif state == "handed_over":
        if waits.get("who") == "you":
            fo.put("handover", "stalled", "推上去了，但 MR 上没有交接标签", _first(since, hand_at, now))
            fo.put("bridge", "waiting", "MR 上没有交接标签：桥不会接", _first(since, hand_at, now))
        else:
            if A["handover"]["status"] not in ("queued",):
                fo.put("handover", "queued", "等桥核对交接", _first(since, hand_at, now))
            if A["bridge"]["status"] not in ("running",):
                fo.put("bridge", "running", waits.get("text") or "核对交接", _first(since, hand_at, now))
                fo.open("bridge", "work", _first(since, hand_at, now))
    elif state == "rejected":
        at = _first(A["bridge"]["since"] if A["bridge"]["status"] == "failed" else None, since, now)
        fo.put("handover", "failed", "接手被拒", at)
        fo.put("bridge", "failed", _clip(waits.get("text") or "接手被拒", 80), at)
        fo.put("local", "awaiting_approval", "接手被拒：改好后重新交接", at, _who(you))
        fo.rest("local", at)
    elif state in ("running", "parked", "acceptance"):
        # the bridge had taken it by the runner's first step at the latest
        took = _first(last_of("accepted"), next((e["at"] for e in evs if hand_at is not None and e["at"] > hand_at
                                                  and e["from"] == "runner"), None), since, now)
        for k, st, doing in (("handover", "merged", "桥接手了"), ("bridge", "done", "接手了 · 转问题和回答"),
                             ("signer", "merged", "签了接手合同")):
            if A[k]["status"] in ("waiting", "queued", "running"):
                fo.put(k, st, doing, took)
                fo.close(k, took)
        if state == "running" and A["runner"]["status"] not in ("running", "fixing"):
            fo.put("runner", "running", waits.get("text") or "运行机在做", took)
            fo.open("runner", "work", took)
        if state == "parked":
            at = held("runner", _first(since, last_of("question", side="runner"), now))
            fo.put("runner", "awaiting_approval", _clip(waits.get("text") or "停下等人回答", 80), at, waits.get("who") or "people")
            fo.open("runner", "wait", at)
        if state == "acceptance":
            at = held("release", _first(since, last_of("request", side="runner"), last_of("question", side="runner"), now))
            fo.put("release", "awaiting_approval", _clip(waits.get("text") or "等产品验收", 80), at, waits.get("who") or "product")
            fo.open("release", "wait", at)
            if A["runner"]["status"] not in FINAL:
                fo.put("runner", "done", "交给产品验收", at)
                fo.close("runner", at)


def _belt(evs: list[dict[str, Any]], changes: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """The conveyor: each commit and the hand-over with the files it changed (BOARD-21's 改动 block), then the merge."""
    out = []
    for e in evs:
        if e["kind"] == "commit" and e.get("sha"):
            out.append({"kind": "commit", "at": e["at"], "sha": e["sha"][:12], "by": e.get("by") or "person",
                        "text": _clip(e.get("subject") or ("运行机的提交" if e.get("by") == "bot" else "提交"), 80),
                        "files": int(e.get("files") or 0), "records_only": bool(e.get("records")),
                        "actor": e.get("actor") or "local", "changes": list(changes.get(e["sha"]) or [])})
        elif e["kind"] == "handover":   # brain-kit's own commit ("<KEY>: hand off to team runner"): said in words
            out.append({"kind": "handover", "at": e["at"], "sha": str(e.get("sha") or "")[:12], "by": "person",
                        "text": "交给运行机", "files": int(e.get("files") or 0),
                        "records_only": bool(e.get("records")), "actor": "handover",
                        "changes": list(changes.get(str(e.get("sha") or "")) or [])})
        elif e["kind"] == "merge":
            out.append({"kind": "merge", "at": e["at"], "sha": str(e.get("sha") or "")[:12], "by": "person",
                        "text": e["text"], "files": 0, "records_only": False, "actor": "release", "changes": []})
    return out[-MAX_BELT:]


def _checks(f: dict[str, Any], evs: list[dict[str, Any]], A: dict[str, dict[str, Any]], kit_rows: list[dict[str, Any]],
            t: dict[str, Any] | None, local_only: bool, hand_at: float | None, merged_at: float | None,
            you: str, asked: str = "人") -> dict[str, Any]:
    """The check wall. It counts what has happened (pass, fail, and wait: asked of a person); what is still to come on
    this requirement's way is `todo`, by name; what is not on its way (a design Lean skipped, the runner of a repo done
    only here) is not_needed or left out; the 14 days after the merge are watched, nobody's turn."""
    cells: list[dict[str, Any]] = []
    todo: list[str] = []
    ahead = merged_at is None and A["release"]["status"] not in FINAL

    def cell(cid: str, group: str, label: str, name: str, status: str, at: float | None, detail: str, actor: str | None,
             later: str | None = None) -> None:
        cells.append({"id": cid, "group": group, "label": label, "name": name, "status": status, "at": at,
                      "detail": _clip(detail, 160), "actor": actor})
        if later and status == "skip" and ahead and later not in todo:
            todo.append(later)

    # Lean's approvals: each gate's last word
    last: dict[str, dict[str, Any]] = {}
    for e in evs:
        if e["kind"] in ("request", "approve", "reject") and e.get("lean"):
            last[e["lean"]] = e
    pend = {a["kind"]: a for a in f.get("approvals") or [] if a.get("state") == "pending"}
    for lean, label, name, actor in (("REQUIREMENTS", "需求", "需求审批", "req"), ("DESIGN", "设计", "设计审批", "design"),
                                     ("PLAN", "计划", "代码生成计划审批", "design"), ("RELEASE", "发布", "发布审批", "release")):
        e = last.get(lean) or (last.get("INCEPTION") if lean in ("REQUIREMENTS", "DESIGN") else None)
        if lean in pend:
            cell("gate-" + lean, "gate", label, name, "wait", None,
                 "等%s在会话里打这一行批准：%s" % (you, pend[lean].get("line")) if hand_at is None and pend[lean].get("line")
                 else "等%s在 MR 上回答（approve 通过 / reject 退回）" % asked, actor)
        elif not e:
            if lean == "DESIGN" and A["design"]["status"] == "skipped" and A["design"]["doing"].startswith(NOT_NEEDED) \
                    and "PLAN" not in last:
                cell("gate-DESIGN", "gate", label, "设计和代码计划审批", "not_needed", None, A["design"]["doing"], actor)
            elif lean in ("REQUIREMENTS", "RELEASE") or any(x.get("lean") == lean for x in evs):
                cell("gate-" + lean, "gate", label, name, "skip", None, "还没到这一步", actor, later=name)
        elif e["kind"] == "approve":
            cell("gate-" + lean, "gate", label, name, "pass", e["at"], "%s批准了" % (e.get("who") or you), actor)
        elif e["kind"] == "reject":
            cell("gate-" + lean, "gate", label, name, "fail", e["at"], "%s退回了：等它改好再批" % (e.get("who") or you), actor)
        else:
            cell("gate-" + lean, "gate", label, name, "wait", None,
                 "等%s批准" % (you if e["from"] == "local" else "人在 MR 上"), actor)
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
            cell("verify", "verify", "verify", "自动检查", "pass" if r.get("ok") else "fail", r["at"], r["text"], "ci")
        seen: dict[str, int] = {}
        for name, ok in res:
            n = seen[name] = seen.get(name, 0) + 1
            cell("verify-%s-%d" % (name, n), "verify", name, "自动检查：%s" % name, "pass" if ok else "fail", r["at"],
                 "通过" if ok else "没过：在会话里看 verify 的输出", "ci")
    else:
        cell("verify", "verify", "verify", "自动检查", "skip", None, "还没跑过 verify（构建和测试阶段跑）", "ci", later="verify")
    # the hand-over: the bridge and the signer (not on the way of a repo done only here, or of one done here and merged)
    if not local_only and not (hand_at is None and merged_at is not None):
        cell("bridge", "handover", "桥", "桥核对交接", "pass" if A["handover"]["status"] == "merged" else
             "fail" if A["handover"]["status"] == "failed" else "wait" if hand_at else "skip",
             A["handover"]["since"] if A["handover"]["status"] in ("merged", "failed") else None,
             {"merged": "接手了", "failed": A["bridge"]["doing"]}.get(A["handover"]["status"], "还没交接" if not hand_at else "在核对"),
             "bridge")
        cell("signer", "handover", "签名", "签名服务签接手合同", "pass" if A["signer"]["status"] == "merged" else
             "fail" if A["signer"]["status"] == "failed" else "skip", A["signer"]["since"] if A["signer"]["status"] == "merged" else None,
             "签了" if A["signer"]["status"] == "merged" else "还没签", "signer",
             later="签接手合同" if hand_at and A["handover"]["status"] != "failed" else None)
    # the repo's kit (what the team runner needs committed): a ! reminder matters once a requirement is handed over, so
    # for a repo done only on this machine it is not on the way
    for i, k in enumerate(kit_rows):
        warn = k.get("level") == "WARN"
        cell("kit-%d" % i, "brain", k.get("label") or "kit", k.get("text") or "", "fail" if k.get("level") == "FAIL" else
             ("not_needed" if local_only else "wait") if warn else "pass", None,
             "只在本机做，用不上：交给运行机时才要紧" if warn and local_only else (k.get("todo") or k.get("text") or ""), None)
    # the Brain the run used: a citation that is stale or unknown fails; no citation is no check at all
    b = (t or {}).get("brain") or {}
    if b.get("cited") or b.get("unknown") or b.get("stale"):
        bad = list(b.get("unknown") or [])
        stale = list(b.get("stale") or [])
        cell("brain-cite", "brain", "引用", "引用的 Brain 条目", "fail" if bad else "wait" if stale else "pass", None,
             ("引用了 Brain 里没有的 %s" % "、".join(bad[:3])) if bad else ("引用了过时的 %s" % "、".join(stale[:3])) if stale
             else "引用了 %d 条，都在" % len(b.get("cited") or []), "reflect")
    # the 14 days after the merge: watched until the window ends
    r14 = ((t or {}).get("outcome") or {}).get("reverted_or_hotfixed_within_14d") or {}
    if r14.get("window_end"):
        v = r14.get("value")
        cell("after-14d", "after", "14 天", "合并后 14 天没有回滚或热修", "fail" if v is True else "pass" if v is False else "watch",
             _epoch(r14.get("window_end")) if v is not None else None,
             "有回滚或热修" if v is True else "14 天里没有回滚、热修或缺陷" if v is False else "观察中：到 %s" % str(r14["window_end"])[:10],
             "release")
    passed = sum(1 for c in cells if c["status"] == "pass")
    failed = sum(1 for c in cells if c["status"] == "fail")
    total = sum(1 for c in cells if c["status"] in ("pass", "fail", "wait"))
    ats = [c["at"] for c in cells if c["at"] is not None]
    return {"cells": cells, "passed": passed, "failed": failed, "total": total, "todo": todo,
            "at": max(ats) if ats else None, "history": history}


def _facts(fo: _Fold, f: dict[str, Any], evs: list[dict[str, Any]], row: dict[str, Any], sessions: list[dict[str, Any]],
           proposals: int) -> None:
    A = fo.a
    n_commits = {"local": 0, "runner": 0}
    for e in evs:
        if e["kind"] == "commit" and e.get("actor") in n_commits:
            n_commits[e["actor"]] += 1
    blocked = {"local": 0, "runner": 0}
    for e in evs:
        if e["kind"] == "blocked" and e["from"] in blocked:
            blocked[e["from"]] += 1
    A["local"]["facts"] = [x for x in (
        "提交 %d 次" % n_commits["local"] if n_commits["local"] else "",
        "Lean 拦下 %d 次" % blocked["local"] if blocked["local"] else "",
        "会话 %d 个" % len([s for s in sessions if s.get("kind", "local") == "local"]) if sessions else "") if x]
    asked = sum(1 for e in evs if e["kind"] == "question" and e["from"] in ("runner", "bridge"))
    A["runner"]["facts"] = [x for x in (
        "提交 %d 次" % n_commits["runner"] if n_commits["runner"] else "",
        "Lean 拦下 %d 次" % blocked["runner"] if blocked["runner"] else "",
        "停下问人 %d 次" % asked if asked else "",
        ", ".join(row.get("run_ids") or [])) if x]
    for g, lean_kinds in (("req", ("REQUIREMENTS", "INCEPTION")), ("design", ("DESIGN", "INCEPTION", "PLAN")), ("release", ("RELEASE",))):
        reqs = [e for e in evs if e["kind"] == "request" and e.get("lean") in lean_kinds]
        backs = [e for e in evs if e["kind"] == "reject" and e.get("lean") in lean_kinds]
        A[g]["facts"] = [x for x in ("请求批准 %d 次" % len(reqs) if reqs else "", "退回 %d 次" % len(backs) if backs else "",
                                     "批准的那一行由人在会话里自己打" if A[g]["line"] else "") if x]
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
    for x in A.values():   # an actor not on this requirement's way has nothing to say
        if x["status"] == "skipped":
            x["facts"] = []


def _person(row: dict[str, Any], me: str | None, f: dict[str, Any]) -> dict[str, Any]:
    """The owner's node: it asks for the person only when the requirement waits on them (waits.who `you`); a question
    for the product or someone else is said, not flashed at the owner (BOARD-5)."""
    waits = row.get("waits") or {}
    owner = f.get("owner")
    st = row.get("state")
    who = waits.get("who")
    if st in ("merged", "closed"):
        status, doing = ("merged", waits.get("text") if waits.get("do") == "write_back" and waits.get("text") else "已合并") \
            if st == "merged" else ("skipped", "已关闭")
    elif who == "you":
        status, doing = "awaiting_approval", waits.get("text") or "轮到你了"
    elif who in ("agent", "runner", "bridge"):
        status, doing = "running", waits.get("text") or "AI 在做"
    else:
        status, doing = "waiting", waits.get("text") or "没有等你的事"
    return {"status": status, "doing": _clip(doing, 80), "owner": owner, "me": bool(me) and me == owner}


def _lines(s: str) -> str:
    return "\n".join(" ".join(x.split()) for x in s.split("\n") if x.strip())


def _do_of(row: dict[str, Any], f: dict[str, Any], A: dict[str, dict[str, Any]], hand: bool, local: list[dict[str, Any]],
           merged: bool) -> str:
    """The step the requirement waits for (Waits.do); a row from before the contract had it gets it from its state."""
    waits = row.get("waits") or {}
    if waits.get("do"):
        return str(waits["do"])
    st, who = row.get("state"), waits.get("who")
    if merged:
        return "write_back" if A["reflect"]["status"] == "awaiting_approval" else "none"
    if st == "claimed":
        return "start"
    if not hand and any(a.get("state") == "pending" and a.get("line") for a in f.get("approvals") or []):
        return "approve"
    return {"acceptance": "accept", "parked": "answer", "rejected": "redo_handoff"}.get(str(st)) or (
        "label_handoff" if st == "handed_over" and who == "you" else
        ("tool" if local and local[-1].get("awaiting") else "reply") if st == "local" and who == "you" else "none")


def _open_question(mr: dict[str, Any] | None, team_decisions: list[dict[str, Any]], t: dict[str, Any] | None) -> dict[str, Any]:
    """The question on the MR that waits for its answer (the newest): its D-n, kind and options."""
    qs = [q for q in (mr or {}).get("questions") or [] if q.get("state") == "open"]
    qs += [d for d in team_decisions if d.get("state") == "open"]
    qs += [d for d in (t or {}).get("decisions") or [] if d.get("source") == "bridge" and not d.get("choice")
           and d.get("state") in (None, "open")]
    return qs[-1] if qs else {}


def _said(note: str, you: str) -> tuple[str, str | None]:
    """Lean's own next step from its Session notes (aidlc-state.md, 「Next」), in plain words: what it says to do, and
    the words it says to type (「…」 after 说：) as the line to copy."""
    note = re.sub(r"\bowner\b\s*", you.strip() + ("" if you == "你" else " "), note.replace("`", ""))
    m = re.search(r"说[：:]\s*「(.+?)」", note)
    if not m:
        return _clip(note, 200), None
    return _clip(note[:m.start()] + "说下面这一行", 200), _clip(m.group(1), 400)


def _reply_step(row: dict[str, Any], f: dict[str, Any], you: str) -> tuple[str, str | None]:
    """An idle local session (BOARD-4): where Lean is, its next stage, and what to say to the session."""
    stages = f.get("stages") or []
    lean = row.get("lean") or {}
    if "next" in lean:
        nxt = lean.get("next")
    else:
        end = max([r["n"] for r in stages if r.get("state") in ("done", "skipped")], default=0)
        nxt = next((r for r in stages if r.get("state") == "started"), None) or \
            next((r for r in stages if r.get("state") == "todo" and r["n"] > end), None)
    done = [r for r in stages if r.get("state") == "done"]
    head = "会话空着，轮到%s回话。" % you
    if done:
        head += "Lean 做完了「%s」，" % max(done, key=lambda r: r["n"])["label"]
    head += "下一步是「%s」。" % nxt["label"] if nxt else "Lean 的阶段都做完了。"
    # before the release, the review in a new session: the line to say is Lean's own (the one 开审查会话 sends), never
    # one the session that wrote the code worded for its reviewer
    w = row.get("waits") or {}
    needed = w["review"] if "review" in w else bool(nxt and nxt.get("id") == "release" and not lean_view.review_current(
        (f.get("review") or {}).get("at"), bool(f.get("review")), f.get("events") or []))
    review = lean_view.review_line(run_of(f).get("intent")) if needed else None
    # an English note (Lean's notes are the agent's words) is not shown: the stage names say it in Chinese
    notes = [x for x in lean_view.notes(f.get("state_text")).get("next") or [] if re.search(r"[\u4e00-\u9fff]", x)]
    if notes:
        text, line = _said(notes[0], you)
        return _lines("%s\nLean 留的下一步：%s" % (head, text)), review or line
    if review:
        return _lines("%s\n先开一个新会话做审查（这个会话写了代码，不能自己审），审查写好再回这个会话接着发布" % head), review
    if nxt:
        tail = "（做完会请%s批准发布）" % you if nxt.get("id") == "release" else ""
        return _lines("%s\n在会话里让它接着做「%s」%s" % (head, nxt["label"], tail)), "接着做下一步：%s" % nxt["label"]
    return head, None


def _accept(f: dict[str, Any], row: dict[str, Any], A: dict[str, dict[str, Any]], checks: dict[str, Any],
            decisions: list[dict[str, Any]], t: dict[str, Any] | None, sessions: list[dict[str, Any]],
            merged_at: float | None, proposals: int, you: str, mr: dict[str, Any] | None,
            team_decisions: list[dict[str, Any]]) -> dict[str, Any]:
    rel = A["release"]["status"]
    st = row.get("state")
    merged = merged_at is not None or st == "merged"
    state = "merged" if merged else "waiting" if rel == "awaiting_approval" or st == "acceptance" \
        else "accepted" if rel == "merged" else "rejected" if rel == "fixing" else "not_yet"
    waits = row.get("waits") or {}
    local = [s for s in sessions if s.get("kind", "local") == "local" and not s.get("missing")]
    session_url = local[-1]["url"] if local else None
    mr_url = (row.get("mr") or {}).get("url")
    hand = isinstance(run_of(f).get("handoff"), dict)
    do = _do_of(row, f, A, hand, local, merged)
    where = waits.get("where") or ("app" if do == "start" else "mr" if hand else "session")
    who = {"product": "产品", "people": "别人", "builder": "开发的人"}.get(str(waits.get("who")), you.strip())
    step = {"text": "", "who": "", "line": None, "mr_url": None, "session_url": None}
    q = _open_question(mr, team_decisions, t)
    on_mr = "在 MR 上回答%s（%s）：桥会把回答带回运行机" % (
        " " + q["id"] if q.get("id") else "",
        " / ".join(str(o.get("id")) for o in q.get("options") or [] if isinstance(o, dict) and o.get("id"))
        or ("approve 通过 / reject 退回" if do in ("accept", "approve") or q.get("kind") == "acceptance" else "选一个答案"))
    if do == "approve" and where != "mr":
        pend = next((a for a in f.get("approvals") or [] if a.get("state") == "pending" and a.get("line")), None)
        if pend:
            step = {"text": "在会话里自己打这一行，批准%s" % GATE_KIND_LABEL.get(pend["kind"], pend["kind"]), "who": who,
                    "line": pend["line"], "mr_url": None, "session_url": session_url}
    elif do in ("approve", "accept") or (do == "answer" and where == "mr"):
        step = {"text": on_mr, "who": who, "line": None, "mr_url": mr_url, "session_url": None}
    elif do == "answer":
        step = {"text": "在会话里回答它的问题（%s）" % KIND_LABEL.get(str((f.get("park") or {}).get("kind")), "问题"),
                "who": who, "line": None, "mr_url": None, "session_url": session_url}
    elif do == "reply":
        text, line = _reply_step(row, f, you)
        step = {"text": text, "who": who, "line": line, "mr_url": None, "session_url": session_url}
    elif do == "tool":
        step = {"text": "会话里有一个工具调用等%s批准：打开会话，批准或拒绝它" % you, "who": who, "line": None, "mr_url": None,
                "session_url": session_url}
    elif do == "start":
        step = {"text": "认领了，还没开工：在开需求里开工 %s" % f["key"] if you == "你" else "%s认领的，等%s开工" % (you, you),
                "who": you.strip(), "line": None, "mr_url": None, "session_url": None}
    elif do == "redo_handoff":
        why = re.sub(r"^接手被拒[：:]\s*", "", str(waits.get("text") or "")) or "看 MR 上桥写的原因"
        step = {"text": _lines("接手被拒：%s\n改好后，在这个需求的分支上重新交接（交接会提交、推送、打标签）" % why),
                "who": who, "line": None, "mr_url": mr_url, "session_url": None}
    elif do == "label_handoff":
        step = {"text": waits.get("text") or "在 MR 上补上交接标签", "who": who, "line": None, "mr_url": mr_url,
                "session_url": None}
    elif do == "write_back" and proposals:
        step = {"text": "去 Brain 页回写这次的 %d 条新知识：先预览，再写到新分支" % proposals, "who": who, "line": None,
                "mr_url": None, "session_url": None}
    step["text"] = _lines(step["text"]) if step["text"] else ""
    counts = {c: 0 for c in CAT_ORDER}
    for d in decisions:
        counts[category(d)] = counts.get(category(d), 0) + 1
    by = [{"id": c, "label": CAT_LABEL[c], "count": counts[c]} for c in CAT_ORDER if counts.get(c)]
    done = None
    if state == "merged":
        m = ((t or {}).get("outcome") or {}).get("merged_at") or {}
        h = next((h for h in reversed((t or {}).get("humans") or []) if h.get("what") in ("RELEASE", "acceptance")
                  and h.get("kind") == "approval"), None) or {}
        name = str(h.get("who") or "")
        # a user name brain-kit read is said, never a pseudonym (G-…, P-…): on the owner's own run it was the owner,
        # after the hand-over the product accepted it on the MR
        who_done = name if re.match(r"^[a-z0-9][a-z0-9._-]*$", name) else ("产品" if hand else f.get("owner")) if h else None
        done = {"at": merged_at or _epoch(f.get("tip_at")) or 0, "who": who_done,
                "how": {"merge commit": "合并提交", "fast-forward": "快进"}.get(str(m.get("how") or ""), "已合并")}
    elif state == "accepted":
        done = {"at": A["release"]["since"] or 0, "who": None, "how": "发布已批准，等合并"}
    return {"state": state, "step": step, "by": by, "checks": checks_line(checks), "done": done}


def checks_line(checks: dict[str, Any]) -> str:
    """The checks in one line: 「目前 3 项都过 · 还剩 发布审批」, 「检查 2/4 过 · 没过：pytest · 等人：发布审批」."""
    cells, todo = checks["cells"], checks.get("todo") or []
    bad = [c["name"] for c in cells if c["status"] == "fail"]
    wait = [c["name"] for c in cells if c["status"] == "wait"]
    watched = sum(1 for c in cells if c["status"] == "watch")
    later = (" · 还剩 %s" % "、".join(todo) if todo else "") + (" · %d 项在观察" % watched if watched else "")
    if not checks["total"]:
        return "还没有检查结果" + later
    if not bad and not wait:
        return ("目前 %d 项都过" % checks["passed"] + later) if later else "全部 %d 项都过" % checks["passed"]
    return "检查 %d/%d 过%s%s%s" % (checks["passed"], checks["total"], " · 没过：%s" % "、".join(bad[:3]) if bad else "",
                                  " · 等人：%s" % "、".join(wait[:3]) if wait else "", later)


def run_of(f: dict[str, Any]) -> dict[str, Any]:
    return f.get("run") if isinstance(f.get("run"), dict) else {}


# the one git call the board's commits are read with (read only): each commit's subject, and the files it changed with
# their status (--raw) and lines added and removed (--numstat), renames found (-M)
GIT_LOG = ("log", "--no-walk=unsorted", "-M", "--raw", "--numstat", "--format=%x01%H%x00%s")
MAX_CHANGES = 40


def subjects_from_log(text: str) -> dict[str, str]:
    """`git log` output in GIT_LOG's format (or `--format=%H%x00%s`) → {sha: subject}."""
    out = {}
    for line in (text or "").splitlines():
        sha, _, subj = line.lstrip("\x01").partition("\0")
        if re.match(r"^[0-9a-f]{40}$", sha) and "\0" in line:
            out[sha] = subj.strip()[:200]
    return out


def changes_from_log(text: str) -> dict[str, list[dict[str, Any]]]:
    """`git log` output in GIT_LOG's format → {sha: [{path, added, removed, status}]}: status A, M, D or R (a copy is
    an A, a type change an M); a binary file's lines are 0. git prints the --raw and the --numstat lines of a commit
    in the same order, so the n-th of one is the n-th of the other (no rename paths to parse)."""
    out: dict[str, list[dict[str, Any]]] = {}
    for block in (text or "").split("\x01")[1:]:
        head, _, body = block.partition("\n")
        sha = head.partition("\0")[0]
        if not re.match(r"^[0-9a-f]{40}$", sha):
            continue
        raw, nums = [], []
        for line in body.splitlines():
            if line.startswith(":"):
                meta, *paths = line.split("\t")
                letter = (meta.split() or ["M"])[-1][:1]
                raw.append(({"C": "A", "T": "M"}.get(letter, letter) if letter in "AMDRCT" else "M", paths[-1] if paths else ""))
            elif line.count("\t") >= 2:
                a, r, _ = line.split("\t", 2)
                nums.append((int(a) if a.isdigit() else 0, int(r) if r.isdigit() else 0))
        out[sha] = [{"path": path[:300], "added": n[0], "removed": n[1], "status": st}
                    for (st, path), n in zip(raw, nums + [(0, 0)] * (len(raw) - len(nums)))][:MAX_CHANGES]
    # Lean names its audit file after the clone (the host): shown by its label, as everywhere else
    audit = lean_view.audit_labels(sorted({c["path"] for cs in out.values() for c in cs
                                           if re.match(r"^aidlc-docs/audit/[^/]+\.jsonl$", c["path"])}))
    for cs in out.values():
        for c in cs:
            c["path"] = audit.get(c["path"], c["path"])
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
