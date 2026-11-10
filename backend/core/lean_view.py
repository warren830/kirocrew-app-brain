"""AI-DLC Lean, read only: stages, approvals and the Session notes of one intent, from its audit ledger
(``aidlc-docs/audit/*.jsonl``, one hash-chained file per clone) and its files, in a worktree or at a git ref.

Nothing of Lean is imported or run: the project's own ``.kiro/aidlc-lean/`` is agent-writable, so the app never
executes it; ``lean status`` would also rewrite aidlc-state.md. What a pending approval needs is small and stable
(Lean 0.2): an APPROVAL_REQUESTED event not answered by a later APPROVED / REJECTED of the same file, while the file
still has the hash the request recorded (for a code-generation plan: with its task boxes read as unticked). The line
the person types is ``approve <KIND> <first 8 hex of that hash>`` (``lean request`` prints exactly that).
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import Any, Callable, Optional

DOCS = "aidlc-docs"
# Lean 0.2's stages in order: (id, Chinese label, per unit)
STAGES = (
    ("reverse-engineering", "逆向工程", False),
    ("requirements", "需求分析", False),
    ("user-stories", "用户故事", False),
    ("application-design", "应用设计", False),
    ("units", "拆分单元", False),
    ("functional-design", "功能设计", True),
    ("nfr-design", "非功能设计", True),
    ("infrastructure-design", "基础设施设计", True),
    ("code-generation", "代码生成", True),
    ("build-and-test", "构建测试", False),
    ("release", "发布", False),
)
STAGE_LABEL = {s[0]: s[1] for s in STAGES}
STAGE_N = {s[0]: i for i, s in enumerate(STAGES, 1)}
STAGE_STATE = {"STAGE_STARTED": "started", "STAGE_COMPLETED": "done", "STAGE_SKIPPED": "skipped"}
# the notes Lean writes itself (aidlc_lean.py: verify's build-and-test completion, the RELEASE approval's, `lean new`'s
# Ideation skip), said in words; a note the agent wrote is its own and stays as written
LEAN_NOTES = (
    (re.compile(r"^verify PASS: (\d+) checks? on code fingerprint [0-9a-f]*$"), lambda m: "%s 项自动检查都过了" % m.group(1)),
    (re.compile(r"^RELEASE approved \(sha [0-9a-f]*\)$"), lambda m: "发布审批通过了"),
    (re.compile(r"^not requested \(lean new without --ideation\)$"), lambda m: "这次没要构思这一段"),
)


def say_note(note: Any) -> str | None:
    """A stage's note as the page says it: Lean's own lines in words (LEAN_NOTES), the agent's as written."""
    if not isinstance(note, str) or not note.strip():
        return None
    for rx, say in LEAN_NOTES:
        m = rx.match(note.strip())
        if m:
            return say(m)
    return note
PASSED_OVER = "Lean 没记这一步，直接往后做了"
APPROVAL_EVENTS = ("APPROVAL_REQUESTED", "APPROVED", "REJECTED", "APPROVAL_REFUSED")
KIND_LABEL = {"REQUIREMENTS": "需求", "DESIGN": "设计", "INCEPTION": "需求和设计", "PLAN": "代码生成计划",
              "RELEASE": "发布", "IDEATION": "构思"}
# an approval line Lean did not take (APPROVAL_REFUSED), as the board says it, and why (aidlc_lean.py record_approval's
# checks), in words
REFUSED = "批准的那一行没被接受"
REFUSED_CHECK = {"target": "没有等它批准的请求", "hash": "那一行的编号和请求对不上（文件改过了，或者没带编号）",
                 "release": "发布还没准备好", "ideation": "要先做完构思的交接", "approvers": "批的人不在批准人名单里",
                 "team": "要别的团队的人批"}
# Lean's BLOCKED gates (aidlc_lean.py block()) and tools, in words
BLOCK_GATE = {"records": "记录文件只能由 Lean 自己写", "protected": "受保护的文件", "danger": "危险命令", "intent": "还没选需求",
              "contract": "别的团队的文件：要先开变更请求", "verify": "还没过自动检查", "requirements": "需求还没批",
              "design": "设计还没批", "inception": "需求和设计还没批", "ideation": "构思还没批", "released": "已经发布了",
              "plan": "代码生成计划还没批"}
BLOCK_TOOL = {"fs_write": "写文件", "write": "写文件", "execute_bash": "跑命令", "shell": "跑命令", "bash": "跑命令"}
BLOCKED = "Lean 拦下了一个不该做的改动"
CHECKBOX_RE = re.compile(rb"(?m)^([ \t]*[-*] )\[[xX ]\]")
PLAN_RE = re.compile(r"/construction/plans/[^/]+-code-generation-plan\.md$")

Reader = Callable[[str], Optional[bytes]]   # repo-relative path -> bytes or None
Lister = Callable[[str], list]              # repo-relative prefix -> repo-relative paths


def block_rule(gate: Any) -> str:
    """Which of Lean's rules a BLOCKED record broke, in words."""
    return BLOCK_GATE.get(str(gate or ""), "它的规则不让")


def block_what(path: Any, tool: Any) -> str | None:
    """What a BLOCKED record stopped: the file it would have written, else the kind of tool call, in words."""
    return str(path)[:120] if path else BLOCK_TOOL.get(str(tool or ""), "工具调用") if tool else None


def refused_why(check: Any) -> str | None:
    """Why Lean did not take an approval line (APPROVAL_REFUSED's check), in words; None when it is not one it knows."""
    return REFUSED_CHECK.get(str(check or ""))


def epoch(ts: Any) -> float | None:
    if not isinstance(ts, str) or not ts.strip():
        return None
    try:
        return datetime.fromisoformat(ts.strip().replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def events(read: Reader, ls: Lister, intent: str) -> list[dict[str, Any]]:
    """The intent's ledger records of every clone, oldest first (a torn or foreign line is skipped)."""
    out = []
    for path in sorted(p for p in ls(DOCS + "/audit") if p.endswith(".jsonl")):
        raw = read(path)
        if not raw:
            continue
        for line in raw.decode("utf-8", "replace").splitlines():
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            if isinstance(rec, dict) and rec.get("intent") == intent:
                rec["_at"] = epoch(rec.get("ts"))
                rec["_file"] = path
                out.append(rec)
    out.sort(key=lambda r: (r.get("ts") or "", r["_file"], r.get("seq") if isinstance(r.get("seq"), int) else 0))
    return out


def _data(e: dict[str, Any]) -> dict[str, Any]:
    d = e.get("data")
    return d if isinstance(d, dict) else {}


def stages(evs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Lean's 11 stages with state done | skipped | started | todo; per-unit stages with each unit's state."""
    last: dict[tuple, dict[str, Any]] = {}
    for e in evs:
        if e.get("event") not in STAGE_STATE:
            continue
        d = _data(e)
        last[(str(d.get("stage") or ""), str(d.get("unit") or ""))] = e
    out = []
    for n, (sid, label, per_unit) in enumerate(STAGES, 1):
        rows = {u: e for (s, u), e in last.items() if s == sid}
        units = sorted((u, STAGE_STATE[e["event"]]) for u, e in rows.items() if u)
        whole = rows.get("")
        states = [STAGE_STATE[e["event"]] for e in rows.values()]
        if not states:
            state = "todo"
        elif "started" in states:
            state = "started"
        elif all(s == "skipped" for s in states):
            state = "skipped"
        else:
            state = "done"
        latest = max(rows.values(), key=lambda e: e.get("ts") or "") if rows else None
        d = _data(latest) if latest else {}
        note = d.get("note") if latest and latest.get("event") == "STAGE_COMPLETED" else \
            d.get("reason") if latest and latest.get("event") == "STAGE_SKIPPED" else None
        out.append({"id": sid, "label": label, "n": n, "state": state,
                    "units": [{"unit": u, "state": s} for u, s in units] if per_unit else [],
                    "note": say_note(str(note)[:300]) if isinstance(note, str) else None,
                    "at": latest.get("_at") if latest else (whole.get("_at") if whole else None)})
    # a stage Lean went past without a word (a later one is recorded) was not on this intent's way: skipped
    last = max((r["n"] for r in out if r["state"] != "todo"), default=0)
    for r in out:
        if r["state"] == "todo" and r["n"] < last:
            r.update(state="skipped", note=PASSED_OVER)
    return out


def summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """The current stage of Lean's 11 (the row the overview shows, the same stages the detail view lists): the one
    furthest along that is started; else the next one to do after the last one done or skipped; else (nothing left
    after it) that last one, done. None only when Lean has recorded no stage at all. done_n / skipped_n / next say
    the progress the one way the app says it (ui/src/vocab.ts leanProgress): next is the stage to do now (the
    started one, else the first not reached), None once every stage is done or skipped."""
    started = [r for r in rows if r["state"] == "started"]
    cur = started[-1] if started else None
    if cur is None:
        done_n = [r["n"] for r in rows if r["state"] in ("done", "skipped")]
        if done_n:
            last = max(done_n)
            cur = next((r for r in rows if r["state"] == "todo" and r["n"] > last), None) or \
                next(r for r in rows if r["n"] == last)
    nxt = cur if cur and cur["state"] in ("started", "todo") else \
        None if cur else next((r for r in rows if r["state"] == "todo"), None)
    return {"stage": cur["id"] if cur else None, "stage_label": cur["label"] if cur else None,
            "stage_n": cur["n"] if cur else None, "stage_state": cur["state"] if cur else None,
            "done": sum(1 for r in rows if r["state"] in ("done", "skipped")), "total": len(rows),
            "done_n": sum(1 for r in rows if r["state"] == "done"),
            "skipped_n": sum(1 for r in rows if r["state"] == "skipped"),
            "next": {"id": nxt["id"], "label": nxt["label"], "n": nxt["n"]} if nxt else None}


def stage_text(lean: dict[str, Any]) -> str | None:
    """「做完 4 · 跳过 6 · 下一步：发布」, said exactly as ui/src/vocab.ts leanProgress says it: a next stage already
    started is 「在做：发布」, the end 「全部做完（跳过 6）」; None before Lean recorded a stage."""
    if not lean.get("stage_n"):
        return None
    nxt = lean.get("next")
    if not nxt:
        return "全部做完（跳过 %d）" % lean["skipped_n"] if lean.get("skipped_n") else "全部做完"
    parts = ["做完 %d" % lean["done_n"]] + (["跳过 %d" % lean["skipped_n"]] if lean.get("skipped_n") else [])
    started = lean.get("stage_state") == "started" and lean.get("stage") in (None, nxt["id"])
    parts.append("%s：%s" % ("在做" if started else "下一步", nxt["label"]))
    return " · ".join(parts)


REVIEW_DOC = "construction/build-and-test/review.md"   # Lean's release review (skill aidlc-lean-release)
INTENT_RE = re.compile(r"^[0-9]{6}-[a-z0-9][a-z0-9-]{0,80}$")
# what Lean's release skill tells the person to say in a new chat: the review is made by a context that did not write
# the code (and is not told how by the one that did)
REVIEW_LINE = ("Review intent %s against its requirements, design and plans, using the diff, and write "
               "construction/build-and-test/review.md.")


def review_line(intent: Any) -> str | None:
    """Lean's review line for *intent* (run.json is agent-writable: an intent not in Lean's format gets none)."""
    return REVIEW_LINE % intent if isinstance(intent, str) and INTENT_RE.match(intent) else None


def review_current(review_at: float | None, exists: bool, evs: list[dict[str, Any]]) -> bool:
    """Lean's review_is_current: review.md is there and newer than the last verify. A review read at a commit has no
    time of its own (*review_at* None): its being there counts."""
    if not exists:
        return False
    verified = [e["_at"] for e in evs if e.get("event") == "VERIFY" and isinstance(e.get("_at"), (int, float))]
    return review_at is None or not verified or review_at > max(verified)


def idle_step(rows: list[dict[str, Any]], *, review_ok: bool, default_branch: str) -> str:
    """What the person tells an idle local session, from Lean's state: the stage it stopped in, or the next one (the
    release starts with a review in a new session: the one that wrote the code cannot review it)."""
    lean = summary(rows)
    nxt = lean["next"]
    if nxt is None:
        return "Lean 的阶段都做完了：可以把分支合并进 %s 了" % default_branch
    if lean["stage_state"] == "started":
        return "「%s」做到一半，会话停下了：看它最后问了什么，回它" % nxt["label"]
    before = [r for r in rows if r["state"] in ("done", "skipped") and r["n"] < nxt["n"]]
    if not before:
        return "会话停下了，Lean 还没记下阶段：看它最后说了什么，回它"
    prev = max(before, key=lambda r: r["n"])["label"]
    if nxt["id"] == "release":
        if review_ok:
            return "审查写好了，下一步是发布：回会话让它接着发布（它会请你批准发布）"
        return "%s做完了，下一步是发布：先开一个新会话做审查（这个会话写了代码，不能自己审）" % prev
    return "%s做完了，下一步是%s：在会话里让它接着做" % (prev, nxt["label"])


def _approval_sha(path: str, raw: bytes | None) -> str | None:
    if raw is None:
        return None
    if PLAN_RE.search("/" + path):
        raw = CHECKBOX_RE.sub(rb"\1[ ]", raw)
    return hashlib.sha256(raw).hexdigest()


def _files(d: dict[str, Any]) -> dict[str, str]:
    """{path: sha256} an approval event covers (INCEPTION covers two files)."""
    if isinstance(d.get("files"), dict):
        return {str(k): str(v) for k, v in d["files"].items()}
    return {str(d["path"]): str(d.get("sha256") or "")} if d.get("path") else {}


def approvals(evs: list[dict[str, Any]], read: Reader) -> list[dict[str, Any]]:
    """Each kind's latest state (PLAN: per unit): approved | pending | rejected | stale | refused; a pending one
    carries the exact approval line. A request counts as answered when a later approval or rejection covers one of its
    files, whatever its kind (an INCEPTION approval answers a REQUIREMENTS request), as Lean's pending_request does."""
    cache: dict[str, str | None] = {}

    def now_sha(path: str) -> str | None:
        if path not in cache:
            cache[path] = _approval_sha(path, read(path))
        return cache[path]

    latest: dict[tuple, int] = {}
    seq = [e for e in evs if e.get("event") in APPROVAL_EVENTS]
    for i, e in enumerate(seq):
        kind = str(_data(e).get("kind") or "")
        if not kind or kind.startswith("CR-"):
            continue
        k = (kind, str(_data(e).get("unit") or ""))
        if e["event"] == "APPROVAL_REFUSED" and k in latest and seq[latest[k]]["event"] in ("APPROVED", "REJECTED"):
            continue  # a refused line after a decision does not undo it
        latest[k] = i
    out = []
    for (kind, unit), i in sorted(latest.items(), key=lambda kv: (seq[kv[1]].get("ts") or "")):
        e = seq[i]
        d = _data(e)
        files = _files(d)
        sha = str(d.get("sha256") or "") or None
        ev, via = e["event"], None
        if ev == "APPROVAL_REQUESTED":  # answered later by a decision on one of its files?
            for later in seq[i + 1:]:
                if later["event"] in ("APPROVED", "REJECTED") and set(_files(_data(later))) & set(files):
                    ev, via = later["event"], str(_data(later).get("kind") or "") or None
                    files = {p: h for p, h in _files(_data(later)).items() if p in files} or files
        fresh = all(now_sha(p) == h for p, h in files.items()) if files else False
        state = {"APPROVED": "approved" if fresh else "stale", "REJECTED": "rejected",
                 "APPROVAL_REQUESTED": "pending" if fresh else "stale", "APPROVAL_REFUSED": "refused"}[ev]
        out.append({"kind": kind, "unit": unit or None, "state": state, "sha8": sha[:8] if sha else None,
                    "at": e.get("_at"), "line": "approve %s %s" % (kind, sha[:8]) if state == "pending" and sha else None,
                    "path": d.get("path") or (" + ".join(d.get("paths") or []) or None),
                    "via": via if via and via != kind else None})
    return out


def notes(text: str | None) -> dict[str, Any]:
    """aidlc-state.md's Session notes: Status, Next, Open questions and blockers."""
    text = text or ""
    status = None
    m = re.search(r"^Status:\s*(.+)$", text, re.M)
    if m:
        status = m.group(1).strip()[:300]

    def items(head: str) -> list[str]:
        mm = re.search(r"^### %s[^\n]*$(.*?)(?=^### |^## |\Z)" % head, text, re.M | re.S)
        if not mm:
            return []
        out = []
        for line in mm.group(1).splitlines():
            s = re.sub(r"^\s*(?:[-*]|\d+[.)])\s*", "", line).strip()
            if s and not s.startswith("<!--") and s.lower() != "none":
                out.append(s[:300])
        return out[:20]

    return {"status": status, "next": items("Next"), "open_questions": items("Open questions")}


def audit_labels(paths: list[str]) -> dict[str, str]:
    """{audit file: label}. Lean names its file after the clone (<host>-<6 hex>.jsonl): the page shows the label
    brainkit.trace.audit_labels gives it (aidlc-docs/audit/L-<6 hex of sha256(path)>.jsonl), never the host name."""
    try:
        from . import bk
        if bk.has("trace") and hasattr(bk.m("trace"), "audit_labels"):
            return dict(bk.m("trace").audit_labels(paths))
    except Exception:  # noqa: BLE001 - the same rule below
        pass
    out, used = {}, set()
    for p in sorted(set(paths)):
        h, n = hashlib.sha256(p.encode()).hexdigest().upper(), 6
        while "L-" + h[:n] in used:
            n += 2
        used.add("L-" + h[:n])
        out[p] = "%s/audit/L-%s.jsonl" % (DOCS, h[:n])
    return out


def stage_events(evs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Timeline items from the ledger (when brainkit.trace is not there): stages, approvals, blocked tool calls,
    verify rounds, human turns. Never the text a person typed, nor the audit file's host name."""
    out = []
    labels = audit_labels([str(e.get("_file") or "") for e in evs])
    for e in evs:
        ev, d = e.get("event"), _data(e)
        at = e.get("ts") if isinstance(e.get("ts"), str) else None
        src = "%s#%s" % (labels.get(str(e.get("_file") or ""), DOCS + "/audit"), e.get("seq"))
        if ev in STAGE_STATE:
            label = "%s：%s" % (STAGE_LABEL.get(str(d.get("stage")), str(d.get("stage"))),
                               {"started": "开始", "done": "完成", "skipped": "跳过"}[STAGE_STATE[ev]])
            if d.get("unit"):
                label += "（%s）" % d["unit"]
            out.append({"at": at, "kind": "stage", "label": label, "detail": say_note(d.get("note") or d.get("reason")),
                        "who": None, "src": src})
        elif ev in APPROVAL_EVENTS:
            kind = str(d.get("kind") or "")
            name = KIND_LABEL.get(kind, kind)
            label = "%s（%s）" % (REFUSED, name) if ev == "APPROVAL_REFUSED" else \
                {"APPROVAL_REQUESTED": "请求批准", "APPROVED": "批准", "REJECTED": "退回"}[ev] + name
            out.append({"at": at, "kind": "approval", "label": label,
                        "detail": refused_why(d.get("check")) if ev == "APPROVAL_REFUSED" else None, "who": None, "src": src})
        elif ev == "BLOCKED":
            out.append({"at": at, "kind": "blocked", "label": "%s：%s" % (BLOCKED, block_rule(d.get("gate"))),
                        "detail": block_what(d.get("path"), d.get("tool")), "who": None, "src": src})
        elif ev == "VERIFY":
            out.append({"at": at, "kind": "verify", "label": "自动检查%s" % ("通过" if d.get("ok") else "没过"),
                        "detail": None, "who": None, "src": src})
        elif ev in ("SESSION_START", "HUMAN_TURN"):
            out.append({"at": at, "kind": "session", "label": "会话开始" if ev == "SESSION_START" else "人发了一条消息",
                        "detail": None, "who": None, "src": src})
    return out
