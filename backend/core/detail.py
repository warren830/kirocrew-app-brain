"""需求详情: one requirement in full — Lean progress, Session notes, decisions with their Brain citations, the questions
it parked and their answers, the run trace timeline (brainkit.trace when present, else the Lean ledger), the sessions
this app opened for it with their credits, and what it took from the Brain.
"""

from __future__ import annotations

import re
from typing import Any

from . import bk, lean_view
from .deliveries import KIND_LABEL, park_waiting

CITE_RE = re.compile(r"(?<![A-Za-z0-9-])([PTIJ]-[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,3})(?![0-9-])")
VOUCHER_RE = re.compile(r"(?<![0-9A-Za-z])V-[0-9a-f]{10}(?![0-9a-f])")
# decisions.md Who, in the runner's vocabulary (brainkit.trace.classify_who, brain-kit 9935b11), each optionally
# followed by a note in brackets: agent | a kit bot user | brain <entry id>[, <id>] | check | <P-xxxx> <V-xxxxxxxxxx> |
# owner. Anything else is "unclassified": not guessed, and not shown (it may be a real name).
_ENTRY = r"[PTIJ]-(?:[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,3}|[0-9]{1,5})"
_NOTE = r"(?:\s*[(（][^()（）]*[)）])?"
WHO_WORD_RE = re.compile(r"^(?i:(agent|check))" + _NOTE + r"$")
WHO_BRAIN_RE = re.compile(r"^(?i:brain)\s+(%s(?:\s*[,，、;；]\s*%s)*)" % (_ENTRY, _ENTRY) + _NOTE + r"$")
WHO_PERSON_RE = re.compile(r"^(P-[0-9A-F]{4})\s+V-[0-9a-f]{10}" + _NOTE + r"$")
WHO_OWNER_RE = re.compile(r"^(?i:owner)" + _NOTE + r"$")
NO_TOKENS = "KiroCrew 只报 credits，input / output / cache token 都是 0"
# brainkit.trace's outcome.merged_at.how (72b278e: docs/eval.md section 2, rules M1-M6), in words; another value as is
MERGE_HOW = {
    "merge commit": "合并提交",
    "squash and merge commit (the branch is still here)": "squash 加合并提交（分支还在）",
    "fast-forward": "快进",
    "rebase merge (the branch is still here)": "rebase 合并（分支还在）",
    "squash merge (the branch is still here)": "squash 合并（分支还在）",
    "squash merge (the branch is gone): the commit that brought run.json": "squash 合并（分支已删）：带来 run.json 的提交",
    "fast-forward or rebase merge (the branch is gone): the last run commit": "快进或 rebase 合并（分支已删）：run 的最后一个提交",
}


# ---------------------------------------------------------------- decisions

def _cells(line: str) -> list[str]:
    return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line.strip().strip("|"))]


def classify_who(who: str | None, bot_users: list[str]) -> tuple[str | None, str | None]:
    """(by, who shown) of a Who cell: brainkit.trace.classify_who when it is there, else the same rules."""
    if bk.has("trace") and hasattr(bk.m("trace"), "classify_who"):
        try:
            return bk.m("trace").classify_who(who, bot_users)
        except Exception:  # noqa: BLE001 - the same rules below
            pass
    w = str(who or "").strip().strip("`").strip()
    if not w:
        return None, None
    if w.lower() in {str(b).lower() for b in bot_users}:
        return "agent", w.lower()
    m = WHO_WORD_RE.match(w)
    if m:
        return m.group(1).lower(), m.group(1).lower()
    m = WHO_BRAIN_RE.match(w)
    if m:
        return "brain", ", ".join(re.findall(_ENTRY, m.group(1)))
    m = WHO_PERSON_RE.match(w)
    if m:
        return "person", m.group(1)
    if WHO_OWNER_RE.match(w):
        return "person", "owner"
    return "unclassified", None


def decisions(text: str | None, path: str, bot_users: list[str]) -> list[dict[str, Any]]:
    """decisions.md's table rows: brainkit.trace.md_decisions when it is there (the same reading Eval uses), else a
    small reader of the same table (ID | Date | Stage | Decision | Why | Who)."""
    if not text:
        return []
    rows: list[dict[str, Any]] = []
    if bk.has("trace"):
        try:
            for d in bk.m("trace").md_decisions(text, path, bot_users):
                rows.append({"id": str(d.get("id")), "date": d.get("at"), "stage": d.get("stage"),
                             "text": str(d.get("text") or "")[:1000], "why": (str(d["why"])[:500] if d.get("why") else None),
                             "who": d.get("who"), "by": d.get("by"), "cites": list(d.get("cites") or []),
                             "vouchers": list((d.get("refs") or {}).get("vouchers") or []), "src": str(d.get("src") or path)})
            return rows
        except Exception:  # noqa: BLE001 - fall back to the small reader
            rows = []
    header, fence = None, False
    for n, line in enumerate(text.split("\n"), 1):
        if re.match(r"^\s*(```|~~~)", line):
            fence, header = not fence, None
            continue
        if fence or not line.strip().startswith("|"):
            header = None if not fence else header
            continue
        cells = _cells(line)
        if header is None:
            low = [c.lower() for c in cells]
            if "id" in low and "decision" in low:
                header = low
            continue
        if all(re.match(r"^:?-{2,}:?$", c) for c in cells if c):
            continue
        row = dict(zip(header, cells + [""] * (len(header) - len(cells))))
        did, dec = row.get("id", ""), row.get("decision", "")
        if not did or not dec:
            continue
        whole = " ".join(v for k, v in row.items() if k != "id")
        by, who = classify_who(row.get("who"), bot_users)
        rows.append({"id": did, "date": row.get("date") if re.match(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", row.get("date") or "")
                     else None, "stage": row.get("stage") or None, "text": dec[:1000], "why": row.get("why") or None,
                     "who": who, "by": by,
                     "cites": sorted(set(CITE_RE.findall(whole))), "vouchers": sorted(set(VOUCHER_RE.findall(whole))),
                     "src": "%s:%d" % (path, n)})
    return rows


# ---------------------------------------------------------------- questions

def park_question(park: dict[str, Any] | None, *, answerable: bool, via: str | None) -> dict[str, Any] | None:
    if not isinstance(park, dict) or park.get("invalid"):
        return None
    kind = str(park.get("kind") or "other")
    opts = [{"id": str(o.get("id")), "text": str(o.get("text") or "")[:500]} for o in park.get("options") or []
            if isinstance(o, dict) and o.get("id")]
    return {"source": "park", "id": None, "kind": kind, "kind_label": KIND_LABEL.get(kind, kind),
            "question": str(park.get("question") or "")[:2000], "options": opts,
            "recommend": str(park["recommend"]) if park.get("recommend") else None,
            "lean_request": str(park["lean_request"]) if park.get("lean_request") else None,
            "refs": [str(x)[:60] for x in park.get("refs") or []][:10], "state": str(park.get("status") or "?"),
            "answer": None, "answerer": None, "voucher_id": None, "mr_url": None, "at": None,
            "answerable_here": bool(answerable and park_waiting(park) and kind == "clarify"
                                    and not park.get("lean_request")),
            "answer_via": via if answerable else None}


def mr_questions(mr: dict[str, Any] | None, *, own: bool, can_post: bool) -> list[dict[str, Any]]:
    out = []
    for q in (mr or {}).get("questions") or []:
        ok = own and can_post and q.get("state") == "open" and q.get("kind") == "clarify" and not q.get("lean_request")
        out.append({"source": "mr", "id": q.get("id"), "kind": q.get("kind") or "other",
                    "kind_label": q.get("kind_label") or KIND_LABEL.get(str(q.get("kind")), "其他"),
                    "question": q.get("question") or "", "options": q.get("options") or [],
                    "recommend": q.get("recommend"), "lean_request": q.get("lean_request"),
                    "refs": q.get("refs") or [], "state": q.get("state") or "open", "answer": q.get("answer"),
                    "answerer": q.get("answerer"), "voucher_id": q.get("voucher_id"), "mr_url": (mr or {}).get("url"),
                    "at": lean_view.epoch(q.get("at")), "answerable_here": bool(ok), "answer_via": "mr" if ok else None})
    return out


def ledger_questions(rows: list[dict[str, Any]], mr_url: str | None) -> list[dict[str, Any]]:
    """Team mode: the bridge's decisions (never answerable on this dashboard: answers are made on GitLab)."""
    out = []
    for d in rows:
        kind = str(d.get("kind") or "other")
        out.append({"source": "bridge", "id": d.get("id"), "kind": kind, "kind_label": KIND_LABEL.get(kind, kind),
                    "question": "", "options": [], "recommend": None, "lean_request": d.get("lean_request"),
                    "refs": [], "state": d.get("state") or "?", "answer": d.get("answer"),
                    "answerer": None, "voucher_id": d.get("voucher_id"), "mr_url": mr_url,
                    "at": lean_view.epoch(d.get("created")), "answerable_here": False, "answer_via": None})
    return out


# ---------------------------------------------------------------- timeline

def _human_label(h: dict[str, Any]) -> str:
    kind, what, choice = h.get("kind"), h.get("what"), h.get("choice")
    name = lean_view.KIND_LABEL.get(str(what), KIND_LABEL.get(str(what), str(what or "")))
    if kind == "approval":
        return "批准%s" % name
    if kind == "rejection":
        return "驳回%s" % name
    if kind == "answer":
        return "回答 %s：%s" % (h.get("decision") or "", choice or "")
    if kind == "approval_refused":
        return "审批口令没被接受（%s）" % (h.get("check") or name)
    if kind == "push_after_handover":
        return "交接后有人推了代码" if what == "code" else "交接后有人改了记录"
    if kind == "allow_test_change":
        return "允许改验收测试"
    return str(kind or "人")


def trace_timeline(t: dict[str, Any]) -> list[dict[str, Any]]:
    """Timeline items from brainkit.trace.build's record (who is a username, a pseudonym or a role, never an email)."""
    items = []
    for s in t.get("stages") or []:
        items.append({"at": s.get("at"), "kind": "stage",
                      "label": "%s：%s" % (lean_view.STAGE_LABEL.get(str(s.get("id", "")).split("/")[0], s.get("id")),
                                          {"started": "开始", "done": "完成", "skipped": "跳过"}.get(s.get("state"), s.get("state"))),
                      "detail": s.get("note"), "who": None, "src": s.get("src")})
    for h in t.get("humans") or []:
        items.append({"at": h.get("at"), "kind": "human", "label": _human_label(h), "detail": h.get("voucher_id"),
                      "who": h.get("who"), "src": ", ".join(h.get("src") or [])[:200] or None})
    a = t.get("actions") or {}
    for c in a.get("commits") or []:
        # brain-kit 72b278e: "at" is the author date; committed_at the committer date (later: rebased or amended)
        detail = str(c.get("sha") or "")[:12]
        if c.get("committed_at") and c.get("committed_at") != c.get("at"):
            detail += " · 提交于 %s" % _iso_minute(c["committed_at"])
        items.append({"at": c.get("at"), "kind": "commit",
                      "label": ("运行机提交" if c.get("by") == "bot" else "提交") + ("（只改记录）" if c.get("records_only") else ""),
                      "detail": detail, "who": c.get("who"), "src": c.get("src")})
    for b in a.get("blocked") or []:
        items.append({"at": b.get("at"), "kind": "blocked", "label": "Lean 拦下（%s）" % (b.get("gate") or "?"),
                      "detail": b.get("path") or b.get("tool"), "who": None, "src": b.get("src")})
    for h in a.get("handovers") or []:
        label = {"requested": "交接", "voucher": "桥签了接手合同"}.get(h.get("kind"), "桥：%s" % h.get("kind"))
        items.append({"at": h.get("at"), "kind": "handover", "label": label,
                      "detail": h.get("run_id") or h.get("reason") or h.get("commit"), "who": h.get("by"), "src": h.get("src")})
    for q in a.get("questions") or []:
        items.append({"at": q.get("at"), "kind": "question",
                      "label": "park：%s（%s）" % (KIND_LABEL.get(str(q.get("kind")), q.get("kind") or "?"), q.get("status") or "?"),
                      "detail": q.get("lean_request"), "who": None, "src": q.get("src")})
    for d in t.get("decisions") or []:
        if d.get("source") == "bridge":
            items.append({"at": d.get("at") or d.get("asked_at"), "kind": "decision",
                          "label": "%s %s" % (d.get("id"), d.get("state") or ""), "detail": d.get("choice"),
                          "who": d.get("who"), "src": ", ".join(d.get("src") or [])[:200] or None})
    for r in (t.get("checks") or {}).get("verify") or []:
        items.append({"at": r.get("at"), "kind": "verify", "label": "verify %s" % ("通过" if r.get("ok") else "没过"),
                      "detail": None, "who": None, "src": r.get("src")})
    m = ((t.get("outcome") or {}).get("merged_at") or {})
    if m.get("value"):
        how = MERGE_HOW.get(str(m.get("how") or ""), str(m.get("how") or ""))
        detail = " ".join(x for x in (str(m.get("commit") or "")[:12], "（%s）" % how if how else "",
                                      str(m.get("note") or "")[:300]) if x)
        items.append({"at": m.get("value"), "kind": "merge", "label": "合并进默认分支", "detail": detail or None,
                      "who": None, "src": m.get("src")})
    elif m.get("note"):   # e.g. the bridge ledger says merged (bridge_state) but this clone has no merge of it
        items.append({"at": None, "kind": "merge", "label": "桥的账本说已合并，这里看不到合并（要先取最新？）"
                      if "merged" in (m.get("bridge_state") or []) else "合并：看不清",
                      "detail": str(m["note"])[:300], "who": None, "src": m.get("src")})
    items.sort(key=lambda x: (x["at"] or "", x["kind"]))
    return items


def _iso_minute(ts: Any) -> str:
    """2026-11-09T02:05:33Z -> 2026-11-09 02:05Z (UTC, as brain-kit writes it)."""
    m = re.match(r"^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}:[0-9]{2})", str(ts or ""))
    return "%s %sZ" % (m.group(1), m.group(2)) if m else str(ts)[:40]


# brainkit.trace's "missing": a source it could not read (its own words, an English name and why in brackets) -> in
# Chinese; and whether it matters only once a requirement is handed over (then a local run, or a repo done only on
# this machine, is not missing it)
MISSING = (("bridge ledger", "桥的账本（这台机器上没有：交接以后的问答在 MR 上看）", True),
           ("vouchers", "签名凭证（这台机器上没有）", True),
           ("pushes", "推送记录（git 不记推送：交接以后的提交代替它）", True),
           ("ci pipelines", "CI 流水线（在 GitLab 上，这里读不到）", False))


def missing_text(raw: list[Any], *, handed_over: bool, local_only: bool) -> list[str]:
    """The sources brainkit.trace could not read that matter for this requirement, in Chinese. A requirement not
    handed over has no bridge, vouchers or pushes to miss; a repo done only on this machine has no CI either."""
    out = []
    for x in raw:
        low = str(x).strip().lower()
        hit = next((m for m in MISSING if low.startswith(m[0])), None)
        if hit is None:
            out.append("brain-kit 还有一个来源没读到")
        elif not local_only and (handed_over or not hit[2]):
            out.append(hit[1])
    return sorted(set(out), key=out.index)


def timeline(repo_path: str, cfg: dict[str, Any], key: str, *, ref: str | None, events: list[dict[str, Any]],
             credits: Any = None, ledger_path: str | None = None, vouchers_dir: str | None = None,
             allowed_signers: str | None = None, app_events: list[dict[str, Any]] | None = None,
             has_run: bool = True) -> dict[str, Any]:
    """The timeline: brainkit.trace's record, else the Lean ledger's. A requirement only claimed has no run to trace
    (nothing recorded yet is not an error)."""
    out = {"source": "app", "items": [], "missing": [], "error": "", "brain": None, "cost": None, "trace": None}
    if has_run and bk.has("trace"):
        try:
            from .deliveries import _call
            t = _call(bk.m("trace").build, repo_path, cfg, key, ref=ref, ledger_path=ledger_path,
                      vouchers_dir=vouchers_dir, credits=credits, allowed_signers=allowed_signers)
            out.update(source="trace", items=trace_timeline(t), missing=[str(x)[:200] for x in t.get("missing") or []],
                       brain=t.get("brain"), cost=t.get("cost"), trace=t)
        except Exception:  # noqa: BLE001 - said in Chinese; the Lean ledger's items stand in
            out["error"] = "brain-kit 读不出这个需求的完整记录：下面只有 Lean 自己记下的事"
    elif has_run:
        out["error"] = "brain-kit 还没有 trace 模块：时间线只有 Lean 的记录（在设置里换新一点的 brain-kit）"
    if out["source"] == "app":
        out["items"] = lean_view.stage_events(events)
    out["items"] += app_events or []
    out["items"].sort(key=lambda x: (x["at"] or "", x["kind"]))
    return out


def brain_block(trace_brain: dict[str, Any] | None, usage_row: dict[str, Any] | None,
                decisions_text: str | None) -> dict[str, Any]:
    if isinstance(trace_brain, dict):
        props = trace_brain.get("proposals")
        return {"loaded": trace_brain.get("loaded"), "cited": list(trace_brain.get("cited") or []),
                "stale": list(trace_brain.get("stale") or []), "unknown": list(trace_brain.get("unknown") or []),
                "proposals": props.get("total") if isinstance(props, dict) else None}
    u = usage_row or {}
    n = None
    if decisions_text is not None:
        n = len(re.findall(r"^\s*```+\s*brain-proposal\s*$", decisions_text, re.M))
    return {"loaded": u.get("loaded"), "cited": list(u.get("cited") or []), "stale": list(u.get("stale") or []),
            "unknown": list(u.get("unknown") or []), "proposals": n}
