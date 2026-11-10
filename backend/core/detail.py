"""需求详情: one requirement in full — Lean progress, Session notes, decisions with their Brain citations, the questions
it parked and their answers, the run trace timeline (brainkit.trace when present, else the Lean ledger), the sessions
this app opened for it with their credits, and what it took from the Brain.
"""

from __future__ import annotations

import re
from typing import Any

from . import bk, lean_view, problems
from .deliveries import KIND_LABEL, park_waiting

CITE_RE = re.compile(r"(?<![A-Za-z0-9-])([PTIJ]-[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,3})(?![0-9-])")
VOUCHER_RE = re.compile(r"(?<![0-9A-Za-z])V-[0-9a-f]{10}(?![0-9a-f])")
# a question the AI asked straight in the session, as decisions.md records its answer (「Q1 选 A」, 「Q2 答"按推荐"」)
ASKED_RE = re.compile(r"(?<![A-Za-z0-9])Q([1-9][0-9]{0,2})(?![0-9A-Za-z])")


def asked_in(*texts: Any) -> list[str]:
    """The in-session questions (Q1 …) a decision row records the answer of, from its text and its why."""
    return list(dict.fromkeys("Q" + n for t in texts if t for n in ASKED_RE.findall(str(t))))
# decisions.md Who, in the runner's vocabulary (brainkit.trace.classify_who, brain-kit 9935b11), each optionally
# followed by a note in brackets: agent | a kit bot user | brain <entry id>[, <id>] | check | <P-xxxx> <V-xxxxxxxxxx> |
# owner. Anything else is "unclassified": not guessed, and not shown (it may be a real name).
_ENTRY = r"[PTIJ]-(?:[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,3}|[0-9]{1,5})"
_NOTE = r"(?:\s*[(（][^()（）]*[)）])?"
WHO_WORD_RE = re.compile(r"^(?i:(agent|check))" + _NOTE + r"$")
WHO_BRAIN_RE = re.compile(r"^(?i:brain)\s+(%s(?:\s*[,，、;；]\s*%s)*)" % (_ENTRY, _ENTRY) + _NOTE + r"$")
WHO_PERSON_RE = re.compile(r"^(P-[0-9A-F]{4})\s+V-[0-9a-f]{10}" + _NOTE + r"$")
WHO_OWNER_RE = re.compile(r"^(?i:owner)" + _NOTE + r"$")
NO_TOKENS = "KiroCrew 只报 credits，没有别的用量数"
# brainkit.trace's outcome.merged_at.how (72b278e: docs/eval.md section 2, rules M1-M6), in words; another value as is
MERGE_HOW = {
    "merge commit": "合并提交",
    "squash and merge commit (the branch is still here)": "压缩成一个提交，再用合并提交（分支还在）",
    "fast-forward": "快进",
    "rebase merge (the branch is still here)": "变基后合并（分支还在）",
    "squash merge (the branch is still here)": "压缩成一个提交合并（分支还在）",
    "squash merge (the branch is gone): the commit that brought run.json": "压缩成一个提交合并（分支已删）：带来开工记录的那个提交",
    "fast-forward or rebase merge (the branch is gone): the last run commit": "快进或变基后合并（分支已删）：需求分支的最后一个提交",
}
# brainkit.trace's merged_at.note (landing, _same_changes), in words; the bridge's "merged, not here" is the label's
MERGE_NOTE = (
    (re.compile(r"^the squash commit carries exactly the branch's changes$"), lambda m: "压缩出来的提交正好是分支的全部改动"),
    (re.compile(r"^the squash commit differs from the branch's changes"),
     lambda m: "压缩出来的提交和分支的改动不一样（解决过冲突，或者分支后来又有提交）"),
    (re.compile(r"^(\d+) of the commits on (\S+) are copies of the branch's$"),
     lambda m: "%s上有 %s 个提交是分支上提交的副本" % (_ref_said(m.group(2)), m.group(1))),
    (re.compile(r"^the bridge ledger says the MR was merged"), lambda m: None),
)
CHOICE_SAID = {"approve": "通过", "reject": "退回"}   # an answer on the MR without options


def _ref_said(ref: str) -> str:
    """refs/remotes/origin/main, origin/main: 远端的 main; a local branch by its name."""
    name = re.sub(r"^refs/(?:heads|remotes)/", "", ref)
    return "远端的 %s " % name[len("origin/"):] if name.startswith("origin/") else "%s " % name


def merge_note(note: Any) -> str | None:
    """A merged_at.note in words (one brain-kit has no words for here is shown as it is)."""
    if not isinstance(note, str) or not note.strip():
        return None
    for rx, say in MERGE_NOTE:
        m = rx.match(note.strip())
        if m:
            return say(m)
    return note[:300]


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
                             "vouchers": list((d.get("refs") or {}).get("vouchers") or []), "src": str(d.get("src") or path),
                             "asked": asked_in(d.get("text"), d.get("why"))})
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
                     "src": "%s:%d" % (path, n), "asked": asked_in(dec, row.get("why"))})
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
        return "退回%s" % name
    if kind == "answer":
        did, said = h.get("decision"), CHOICE_SAID.get(str(choice), choice)
        if did or said:
            return "回答%s%s" % (" %s" % did if did else "", "：%s" % said if said else "")
        return "回答了%s问题" % (name or "一个")
    if kind == "approval_refused":
        return "%s（%s）" % (lean_view.REFUSED, name) if name else lean_view.REFUSED
    if kind == "push_after_handover":
        return "交接后有人推了代码" if what == "code" else "交接后有人改了记录"
    if kind == "allow_test_change":
        return "允许改验收测试"
    if str(kind or "").startswith("platform_"):   # brainkit.trace: a manual act KiroCrew reported
        return "在 KiroCrew 上手动操作了一次"
    return "人介入了一次"


# brainkit.trace's hand-over records and the bridge's question states, said as the board says them
HANDOVER_LABEL = {"requested": "交接", "voucher": "签名服务签了接手合同", "bridge accepted": "桥接手了",
                  "bridge rejected": "桥拒绝接手"}
DECISION_SAID = {"open": "%s 在 MR 上问人", "posting": "%s 等桥贴到 MR 上", "asking": "%s 等桥贴到 MR 上",
                 "answered": "%s 回答了", "delivered": "%s 回答了，桥签好送回运行机", "delivery_unknown": "%s 回答了，送没送到不清楚",
                 "refused": "%s 的回答签名服务不签", "void": "%s 作废了", "invalid": "%s 发不出去"}


def trace_timeline(t: dict[str, Any]) -> list[dict[str, Any]]:
    """Timeline items from brainkit.trace.build's record (who is a username, a pseudonym or a role, never an email)."""
    items = []
    for s in t.get("stages") or []:
        stage, _, unit = str(s.get("id", "")).partition("/")     # brainkit.trace: <stage>/<unit> for a unit's stage
        items.append({"at": s.get("at"), "kind": "stage",
                      "label": "%s：%s" % (lean_view.STAGE_LABEL.get(stage, stage),
                                          {"started": "开始", "done": "完成", "skipped": "跳过"}.get(s.get("state"), s.get("state")))
                      + ("（%s）" % unit if unit else ""),
                      "detail": lean_view.say_note(s.get("note")), "who": None, "src": s.get("src")})
    for h in t.get("humans") or []:
        detail = lean_view.refused_why(h.get("check")) if h.get("kind") == "approval_refused" else \
            "凭证 %s" % h["voucher_id"] if h.get("voucher_id") else None
        items.append({"at": h.get("at"), "kind": "human", "label": _human_label(h), "detail": detail,
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
        items.append({"at": b.get("at"), "kind": "blocked", "label": "%s：%s" % (lean_view.BLOCKED, lean_view.block_rule(b.get("gate"))),
                      "detail": lean_view.block_what(b.get("path"), b.get("tool")), "who": None, "src": b.get("src")})
    for h in a.get("handovers") or []:
        label = HANDOVER_LABEL.get(str(h.get("kind")), "桥记下了这次交接")
        why = problems.reasons_text(str(h.get("reason") or "").split("; "), 200)[0]   # the bridge's English, as the MR's
        items.append({"at": h.get("at"), "kind": "handover", "label": label,
                      "detail": h.get("run_id") or why or str(h.get("commit") or "")[:12] or None, "who": h.get("by"),
                      "src": h.get("src")})
    for q in a.get("questions") or []:
        what = KIND_LABEL.get(str(q.get("kind")), "问题")
        lean = str(q.get("lean_request") or "").split(" ")[0]
        items.append({"at": q.get("at"), "kind": "question",
                      "label": "%s的问题回答了，接着做" % what if q.get("status") == "answered" else "停下问人：%s" % what,
                      "detail": "要批准%s" % lean_view.KIND_LABEL.get(lean, lean) if lean else None, "who": None,
                      "src": q.get("src")})
    for d in t.get("decisions") or []:
        if d.get("source") == "bridge":
            items.append({"at": d.get("at") or d.get("asked_at"), "kind": "decision",
                          "label": DECISION_SAID.get(str(d.get("state")), "%s 在 MR 上问人") % d.get("id"),
                          "detail": CHOICE_SAID.get(str(d.get("choice")), d.get("choice")),
                          "who": d.get("who"), "src": ", ".join(d.get("src") or [])[:200] or None})
    for r in (t.get("checks") or {}).get("verify") or []:
        items.append({"at": r.get("at"), "kind": "verify", "label": "自动检查%s" % ("通过" if r.get("ok") else "没过"),
                      "detail": None, "who": None, "src": r.get("src")})
    m = ((t.get("outcome") or {}).get("merged_at") or {})
    if m.get("value"):
        how = MERGE_HOW.get(str(m.get("how") or ""), str(m.get("how") or ""))
        detail = " ".join(x for x in (str(m.get("commit") or "")[:12], "（%s）" % how if how else "",
                                      merge_note(m.get("note")) or "") if x)
        items.append({"at": m.get("value"), "kind": "merge", "label": "合并进默认分支", "detail": detail or None,
                      "who": None, "src": m.get("src")})
    elif m.get("note"):   # e.g. the bridge ledger says merged (bridge_state) but this clone has no merge of it
        items.append({"at": None, "kind": "merge", "label": "桥的账本说已合并，这里看不到合并（要先取最新？）"
                      if "merged" in (m.get("bridge_state") or []) else "合并：看不清",
                      "detail": merge_note(m["note"]), "who": None, "src": m.get("src")})
    items.sort(key=lambda x: (x["at"] or "", x["kind"]))
    return items


def _iso_minute(ts: Any) -> str:
    """2026-11-09T02:05:33Z -> 2026-11-09 02:05Z (UTC, as brain-kit writes it)."""
    m = re.match(r"^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}:[0-9]{2})", str(ts or ""))
    return "%s %sZ" % (m.group(1), m.group(2)) if m else str(ts)[:40]


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
        except Exception as exc:  # noqa: BLE001 - the Lean ledger's items stand in; brain-kit's words for 细节
            out["error"] = "brain-kit 读不出这个需求的完整记录：这里只有 Lean 自己记下的事。brain-kit 的原话：%s" % (
                str(exc).split("\n", 1)[0][:300])
    elif has_run:
        out["error"] = "这个 brain-kit 读不出完整的运行记录（它太旧，或者没装好）：这里只有 Lean 自己记下的事。" \
                       "在设置里换新一点的 brain-kit"
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
