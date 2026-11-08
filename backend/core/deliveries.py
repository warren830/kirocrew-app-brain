"""交付总览: one row per requirement, where it is, what it waits on, its credits; overlaps; the decision funnel; Eval.

A row's state comes from the repo facts (repo.py) and, when known, the MR (mrinfo.py on a person's machine) or the
bridge ledger (team mode). What it waits on is said plainly; for a pending Lean approval the row carries the exact
line the person types in the session themselves (the app never sends it).
"""

from __future__ import annotations

import inspect
import time
from typing import Any

from . import bk, lean_view

STATE_LABEL = {"claimed": "已认领", "local": "本地开发中", "handed_over": "已交接", "rejected": "接手被拒",
               "running": "运行机在跑", "parked": "停下等回答", "acceptance": "等验收", "merged": "已合并",
               "closed": "已关闭"}
OPEN_STATES = ("claimed", "local", "handed_over", "running", "parked", "acceptance", "rejected")
KIND_LABEL = {"clarify": "澄清", "design": "设计", "plan": "计划", "acceptance": "验收", "action": "危险动作",
              "other": "其他", "requirements": "需求批准"}
ASK_WHO = {"product": "product", "builder": "builder", "owner": "you", "security": "people", "data": "people"}
CAT_LABEL = {"person": "人", "check": "确定性检查", "brain": "Brain 条目（引用）", "agent": "agent 自己定（权限内）",
             "unknown": "看不出"}
CAT_ORDER = ("person", "check", "brain", "agent", "unknown")


def park_waiting(park: Any) -> bool:
    return isinstance(park, dict) and park.get("status") == "waiting" and not park.get("invalid")


def park_is_acceptance(park: dict[str, Any]) -> bool:
    lr = str(park.get("lean_request") or "")
    return park.get("kind") == "acceptance" or lr.startswith("RELEASE ")


def base_row(repo_id: str, f: dict[str, Any]) -> dict[str, Any]:
    run = f.get("run") or {}
    claim = f.get("claim") or {}
    title = str(claim.get("title") or "")
    if not title and f.get("branch"):
        slug = f["branch"].rsplit("/", 1)[-1].split("-", 2)[-1]
        title = slug.replace("-", " ")
    lean = lean_view.summary(f.get("stages") or lean_view.stages([]))
    return {
        "repo": repo_id, "key": f["key"], "title": title or f["key"], "owner": f.get("owner"),
        "source": str(claim.get("source") or "product"), "state": "claimed", "state_label": STATE_LABEL["claimed"],
        "where": f.get("where") or "claim", "branch": f.get("branch"), "intent": run.get("intent"),
        "lean": lean, "waits": {"who": "nobody", "text": "", "line": None}, "credits": None,
        "updated_at": None, "mr": None, "worktree": f.get("worktree"), "run_ids": [], "sessions": 0,
        "overlap": [], "open_questions": [],
        "expected_paths": [p for p in run.get("expected_paths") or [] if isinstance(p, str)][:50],
    }


def classify(row: dict[str, Any], f: dict[str, Any], *, mr: dict[str, Any] | None, slot: dict[str, Any] | None,
             cfg: dict[str, Any], bot_commits: int = 0) -> None:
    """Fill in state, state_label and waits (person mode)."""
    run, park, claim = f.get("run"), f.get("park"), f.get("claim") or {}
    pending = [a for a in f.get("approvals") or [] if a["state"] == "pending" and a.get("line")]

    def put(state: str, who: str, text: str, line: str | None = None) -> None:
        row["state"], row["state_label"] = state, STATE_LABEL[state]
        row["waits"] = {"who": who, "text": text, "line": line}

    if claim.get("closed"):
        why = (claim["closed"] or {}).get("reason") if isinstance(claim.get("closed"), dict) else ""
        return put("closed", "nobody", "已关闭" + ("：%s" % str(why)[:80] if why else ""))
    if f.get("merged"):
        return put("merged", "nobody", "已合并")
    if not run:
        return put("claimed", "you", "认领了，还没开工")
    if not run.get("handoff"):
        if pending:
            a = pending[0]
            return put("local", "you", "等你批准%s：在会话里自己打一行" % lean_view.KIND_LABEL.get(a["kind"], a["kind"]),
                       a["line"])
        if park_waiting(park):
            return put("parked", "you", "agent 停下等你回答（%s）" % KIND_LABEL.get(str(park.get("kind")), "问题"))
        if slot and slot.get("busy"):
            return put("local", "agent", "agent 在做")
        if slot and slot.get("awaiting"):
            return put("local", "you", "会话里有一个工具调用等你批准")
        if slot:
            return put("local", "you", "会话空着：轮到你回话")
        return put("local", "you", "本地开发中" + ("" if f.get("worktree") else "（这台机器上没有它的工作区）"))
    labels = set((mr or {}).get("labels") or [])
    if mr and mr.get("state") == "merged":
        return put("merged", "nobody", "MR 已合并")
    if mr and mr.get("state") == "closed":
        return put("closed", "nobody", "MR 已关闭")
    if cfg.get("rejected_label") in labels:
        return put("rejected", "you", "接手被拒：" + (str((mr or {}).get("rejected_reason") or "看 MR 上的说明")[:200]))
    open_q = [q for q in (mr or {}).get("questions") or [] if q.get("state") == "open"]
    if park_waiting(park) or open_q:
        q = open_q[-1] if open_q else {}
        kind = str(q.get("kind") or (park or {}).get("kind") or "other")
        did = q.get("id")
        if (park and park_waiting(park) and park_is_acceptance(park)) or kind in ("acceptance", "验收"):
            return put("acceptance", "product", "等产品验收" + ("（%s）" % did if did else ""))
        who = ASK_WHO.get(str((park or {}).get("ask") or ""), "people")
        return put("parked", who, "等回答%s（%s）" % (" " + did if did else "", KIND_LABEL.get(kind, kind)))
    if cfg.get("running_label") in labels or bot_commits:
        return put("running", "runner", "运行机在跑")
    return put("handed_over", "bridge", "等桥核对交接")


def team_classify(row: dict[str, Any], run_row: dict[str, Any], decisions: list[dict[str, Any]],
                  park: Any) -> None:
    """Team mode: the ledger's run state and its open decisions."""
    st = run_row.get("state")
    open_d = [d for d in decisions if d.get("state") in ("open", "signing")]

    def put(state: str, who: str, text: str) -> None:
        row["state"], row["state_label"] = state, STATE_LABEL[state]
        row["waits"] = {"who": who, "text": text, "line": None}

    row["open_questions"] = [d["id"] for d in open_d]
    if st == "closed":
        return put("merged", "nobody", "MR 已合并或关闭，运行结束")
    if st == "failed":
        return put("rejected", "people", "工作区没建成，要人看一下")
    if st in ("spooled", "ready"):
        return put("handed_over", "runner", "运行机在准备工作区")
    if st == "send_unknown":
        return put("running", "people", "消息送没送到不清楚：要人看一下会话 %s" % (run_row.get("slot") or ""))
    if open_d:
        d = open_d[-1]
        if d.get("kind") == "acceptance":
            return put("acceptance", "product", "等产品验收（%s，在 MR 上回答）" % d["id"])
        return put("parked", "people", "等回答 %s（%s，在 MR 上回答）" % (d["id"], KIND_LABEL.get(str(d.get("kind")), d.get("kind"))))
    if park_waiting(park):
        return put("parked", "bridge", "run 停下了：等桥把问题贴到 MR 上")
    return put("running", "runner", "运行机在跑")


def overlaps(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Open requirements whose expected paths overlap (same path, or one inside the other), as the bridge warns."""
    live = [r for r in rows if r["state"] in OPEN_STATES and r["expected_paths"]]
    out = []
    for i, a in enumerate(live):
        mine = [p.rstrip("/") for p in a["expected_paths"] if p]
        for b in live[i + 1:]:
            if a["repo"] != b["repo"] or a["key"] == b["key"]:
                continue
            theirs = [p.rstrip("/") for p in b["expected_paths"] if p]
            both = sorted({x for x in mine for t in theirs if x == t or x.startswith(t + "/") or t.startswith(x + "/")})
            if both:
                out.append({"keys": [a["key"], b["key"]], "paths": both[:10]})
                a["overlap"].append(b["key"])
                b["overlap"].append(a["key"])
    return out


def category(d: dict[str, Any]) -> str:
    """Who settled a decisions.md row (the app's fallback for brainkit.evaluate's funnel)."""
    if d.get("by") in ("person", "bridge"):
        return "person"
    if d.get("by") == "check":
        return "check"
    if d.get("cites"):
        return "brain"
    if d.get("by") == "agent":
        return "agent"
    return "unknown"


def funnel_app(decisions: list[dict[str, Any]], questions: dict[str, int]) -> dict[str, Any]:
    counts = {c: 0 for c in CAT_ORDER}
    for d in decisions:
        counts[category(d)] += 1
    return {"source": "app", "total": sum(counts.values()),
            "rows": [{"id": c, "label": CAT_LABEL[c], "count": counts[c]} for c in CAT_ORDER],
            "questions": {"asked": int(questions.get("asked", 0)), "answered": int(questions.get("answered", 0)),
                          "delivered": int(questions.get("delivered", 0))}}


def _call(fn: Any, *args: Any, **kw: Any) -> Any:
    """Call a brain-kit function that is still growing with only the keyword arguments it takes."""
    try:
        params = inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return fn(*args, **kw)
    if any(p.kind == p.VAR_KEYWORD for p in params.values()):
        return fn(*args, **kw)
    return fn(*args, **{k: v for k, v in kw.items() if k in params})


def _pair(x: Any) -> list[int] | None:
    if isinstance(x, (list, tuple)) and len(x) == 2 and all(isinstance(v, (int, float)) for v in x):
        return [int(x[0]), int(x[1])]
    return None


def evaluate(repo_path: str, cfg: dict[str, Any], ref: str | None, credits: dict[str, Any] | None,
             ledger_path: str | None = None, vouchers_dir: str | None = None) -> tuple[dict[str, Any], dict | None]:
    """(EvalView, the funnel from brainkit.evaluate or None). Without the module: available false."""
    view = {"available": False, "error": "", "ref": ref, "metrics": [], "queue": []}
    if not bk.has("evaluate"):
        view["error"] = "brain-kit 还没有 evaluate 模块" + (
            "（%s）" % bk.info()["module_errors"].get("evaluate") if bk.info()["module_errors"].get("evaluate") else "")
        return view, None
    ev = bk.m("evaluate")
    try:
        data = _call(ev.collect, repo_path, cfg, ref=ref, credits=credits, ledger_path=ledger_path,
                     vouchers_dir=vouchers_dir)
    except Exception as exc:  # noqa: BLE001 - a module still being written must not break the overview
        view["error"] = "evaluate 跑不起来：%s" % str(exc)[:200]
        return view, None
    if not isinstance(data, dict):
        view["error"] = "evaluate 返回的不是对象"
        return view, None

    def rule(k: str) -> str:
        v = data.get(k)
        return str(v.get("rule") or "")[:300] if isinstance(v, dict) else ""

    def val(k: str) -> Any:
        v = data.get(k)
        return _pair(v.get("value")) if isinstance(v, dict) else _pair(v)

    cost = data.get("cost") if isinstance(data.get("cost"), dict) else {}
    stale = data.get("staleness") if isinstance(data.get("staleness"), dict) else {}
    view["metrics"] = [
        {"id": "autonomy", "label": "自主度", "value": val("autonomy"), "rule": rule("autonomy")},
        {"id": "delivery", "label": "交付正确率", "value": val("delivery"), "rule": rule("delivery")},
        {"id": "judgment", "label": "介入落在判断点", "value": val("judgment"), "rule": rule("judgment")},
        {"id": "repeat_rate", "label": "重复纠正率", "value": _pair(data.get("repeat_rate")),
         "rule": "correction 的重复次数 ÷ 全部纠正（越低越好）"},
        {"id": "useful", "label": "知识有用率", "value": _pair(data.get("useful")), "rule": "被引用过的条目 ÷ 现有条目"},
        {"id": "staleness", "label": "过时与冲突", "value": stale.get("total") if isinstance(stale.get("total"), int)
         else None, "rule": "过时引用 + 同名术语 + 本期覆盖或撤回"},
        {"id": "credits_per_success", "label": "每个正确交付的 credits",
         "value": cost.get("per_success") if isinstance(cost.get("per_success"), (int, float)) else None,
         "rule": str(cost.get("rule") or "")[:300]},
    ]
    queue = []
    for q in data.get("review_queue") or []:
        if isinstance(q, dict) and q.get("key"):
            queue.append({"key": str(q["key"]), "intent": q.get("intent"),
                          "reasons": [str(r.get("text") if isinstance(r, dict) else r)[:200]
                                      for r in q.get("reasons") or []][:10]})
    view.update(available=True, queue=queue, ref=data.get("ref") or ref)
    f = data.get("funnel") if isinstance(data.get("funnel"), dict) else None
    funnel = None
    if f and isinstance(f.get("counts"), dict):
        counts = f["counts"]
        cats = [c for c in CAT_ORDER if c in counts] + [c for c in counts if c not in CAT_ORDER]
        funnel = {"source": "evaluate", "total": int(f.get("total") or 0),
                  "rows": [{"id": c, "label": CAT_LABEL.get(c, c), "count": int(counts[c] or 0)} for c in cats],
                  "questions": {"asked": 0, "answered": 0, "delivered": 0}}
    return view, funnel


def counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Every state, zeros included (the page draws a chip per state)."""
    out: dict[str, int] = {k: 0 for k in STATE_LABEL}
    for r in rows:
        out[r["state"]] = out.get(r["state"], 0) + 1
    return out


def updated_at(f: dict[str, Any], slot: dict[str, Any] | None) -> float | None:
    ats = [f.get("tip_at")] + [e.get("_at") for e in (f.get("events") or [])[-3:]]
    if slot:
        ats.append(slot.get("last_activity"))
    ats = [a for a in ats if isinstance(a, (int, float))]
    return max(ats) if ats else None


def now() -> float:
    return time.time()
