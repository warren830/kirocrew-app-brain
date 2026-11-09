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
APPROVAL_EVENTS = ("APPROVAL_REQUESTED", "APPROVED", "REJECTED", "APPROVAL_REFUSED")
KIND_LABEL = {"REQUIREMENTS": "需求", "DESIGN": "设计", "INCEPTION": "需求和设计", "PLAN": "代码生成计划",
              "RELEASE": "发布"}
CHECKBOX_RE = re.compile(rb"(?m)^([ \t]*[-*] )\[[xX ]\]")
PLAN_RE = re.compile(r"/construction/plans/[^/]+-code-generation-plan\.md$")

Reader = Callable[[str], Optional[bytes]]   # repo-relative path -> bytes or None
Lister = Callable[[str], list]              # repo-relative prefix -> repo-relative paths


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
                    "note": str(note)[:300] if isinstance(note, str) else None,
                    "at": latest.get("_at") if latest else (whole.get("_at") if whole else None)})
    return out


def summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """The current stage of Lean's 11 (the row the overview shows, the same stages the detail view lists): the one
    furthest along that is started; else the next one to do after the last one done or skipped; else (nothing left
    after it) that last one, done. None only when Lean has recorded no stage at all."""
    started = [r for r in rows if r["state"] == "started"]
    cur = started[-1] if started else None
    if cur is None:
        done_n = [r["n"] for r in rows if r["state"] in ("done", "skipped")]
        if done_n:
            last = max(done_n)
            cur = next((r for r in rows if r["state"] == "todo" and r["n"] > last), None) or \
                next(r for r in rows if r["n"] == last)
    return {"stage": cur["id"] if cur else None, "stage_label": cur["label"] if cur else None,
            "stage_n": cur["n"] if cur else None, "stage_state": cur["state"] if cur else None,
            "done": sum(1 for r in rows if r["state"] in ("done", "skipped")), "total": len(rows)}


STAGE_HINT = {"todo": "（下一步）", "done": "（做完）", "skipped": "（做完）"}


def stage_text(lean: dict[str, Any]) -> str | None:
    """``9/11 代码生成``; ``3/11 用户故事（下一步）``; ``11/11 发布（做完）``; None before Lean recorded a stage."""
    if not lean.get("stage_n"):
        return None
    return "%d/%d %s%s" % (lean["stage_n"], lean["total"], lean.get("stage_label") or lean.get("stage") or "",
                           STAGE_HINT.get(str(lean.get("stage_state")), ""))


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
            out.append({"at": at, "kind": "stage", "label": label, "detail": (d.get("note") or d.get("reason") or None),
                        "who": None, "src": src})
        elif ev in APPROVAL_EVENTS:
            kind = str(d.get("kind") or "")
            verb = {"APPROVAL_REQUESTED": "请求批准", "APPROVED": "批准", "REJECTED": "驳回",
                    "APPROVAL_REFUSED": "审批口令没被接受"}[ev]
            out.append({"at": at, "kind": "approval", "label": "%s %s" % (verb, KIND_LABEL.get(kind, kind)),
                        "detail": ("sha %s" % str(d.get("sha256"))[:8]) if d.get("sha256") else (d.get("check") or None),
                        "who": None, "src": src})
        elif ev == "BLOCKED":
            out.append({"at": at, "kind": "blocked", "label": "Lean 拦下（%s）" % (d.get("gate") or "?"),
                        "detail": str(d.get("path") or d.get("tool") or "")[:120] or None, "who": None, "src": src})
        elif ev == "VERIFY":
            out.append({"at": at, "kind": "verify", "label": "verify %s" % ("通过" if d.get("ok") else "没过"),
                        "detail": None, "who": None, "src": src})
        elif ev in ("SESSION_START", "HUMAN_TURN"):
            out.append({"at": at, "kind": "session", "label": "会话开始" if ev == "SESSION_START" else "人发了一条消息",
                        "detail": None, "who": None, "src": src})
    return out
