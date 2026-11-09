"""交付总览: one row per requirement, where it is, what it waits on, its credits; overlaps; the decision funnel; Eval.

A row's state comes from the repo facts (repo.py) and, when known, the MR (mrinfo.py on a person's machine) or the
bridge ledger (team mode). What it waits on (``waits``) is the one judgment every view reads (待办, the badges, the
overview's lanes, the board): who, the step they take (``do``), since when, where (the session, the MR, this app), in
one plain sentence; for a pending Lean approval the exact line the person types in the session themselves (the app
never sends it).
"""

from __future__ import annotations

import inspect
import re
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
ASK_NAME = {"product": "产品", "builder": "开发的人", "you": "你", "people": "人"}
WATCH_S = 14 * 86400    # brain-kit's 14 days after a merge (eval.md: a delivery counts once they are over)
# who settled a decision (brainkit.evaluate's categories and labels; "unclassified": a Who outside the runner's
# vocabulary, listed and never guessed)
CAT_LABEL = {"person": "人", "check": "确定性检查", "brain": "Brain 条目（引用）", "agent": "agent 自己定（权限内）",
             "unknown": "看不出（Who 空着）", "unclassified": "没归类（Who 不是规定的写法）"}
CAT_ORDER = ("person", "check", "brain", "agent", "unknown", "unclassified")
# brain-kit's ledger states of a decision that leave the run waiting for good: nobody can answer it any more (the
# signer refused the answer, the question is void, or it could not be asked) until the run pushes again
# a pushed hand-over the MR carries no label for (`brain handoff` exits 1 then): nothing was handed over
NOT_LABELLED = "推上去了，但 MR 上没有交接标签 %s：什么也没交出去。看一眼 MR，再在分支上跑一次 brain handoff"
# brain-kit's ledger states of a question the bridge has not put on the MR yet: posting (to be posted), asking (one
# bridge process is posting it right now, 72b278e)
NOT_POSTED = ("posting", "asking")
STUCK_DECISION = {"refused": "%s 的回答签名服务不签：看运行机页的拒签原因",
                  "void": "%s 作废（问题没绑上这次推送和 park.json）：run 要重新推送才会重新提问",
                  "invalid": "%s 发不出去（park.json 不对）：run 要改好重新推送"}


def park_waiting(park: Any) -> bool:
    return isinstance(park, dict) and park.get("status") == "waiting" and not park.get("invalid")


def park_is_acceptance(park: dict[str, Any]) -> bool:
    lr = str(park.get("lean_request") or "")
    return park.get("kind") == "acceptance" or lr.startswith("RELEASE ")


def waits(who: str, do: str, text: str, *, where: str | None = None, since: float | None = None,
          line: str | None = None, raw: str = "") -> dict[str, Any]:
    """A row's ``waits`` (ui/src/types.ts Waits): who, the step (WaitDo), where it is taken, since when."""
    return {"who": who, "text": text, "line": line, "raw": raw, "do": do,
            "since": float(since) if isinstance(since, (int, float)) and not isinstance(since, bool) else None,
            "where": where}


def base_row(repo_id: str, f: dict[str, Any], *, local_only: bool = False) -> dict[str, Any]:
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
        "lean": lean, "stage": lean_view.stage_text(lean), "waits": waits("nobody", "none", ""),
        "summary": None,     # the first line of its 变更说明 (mrdesc_view), filled in by the service
        "credits": None,
        "updated_at": None, "mr": None, "worktree": f.get("worktree"), "run_ids": [], "sessions": 0,
        "overlap": [], "open_questions": [],
        "expected_paths": [p for p in run.get("expected_paths") or [] if isinstance(p, str)][:50],
        "local_only": bool(local_only),
    }


def proposals(decisions_text: str | None) -> int:
    """The Brain proposals a run wrote in its decisions.md (what `brain reflect` writes back after the merge)."""
    return len(re.findall(r"^\s*```+\s*brain-proposal\s*$", decisions_text or "", re.M))


def _merged(put: Any, f: dict[str, Any], *, now: float | None, reflected: bool, text: str = "已合并") -> None:
    """Merged: the write-back into the Brain waits for the person when the run proposed knowledge not written back
    yet; else the 14 days after the merge are watched (nobody's turn), then nothing is left."""
    at = f.get("merged_at")
    n = proposals(f.get("decisions_text"))
    if n and not reflected:
        return put("merged", "you", "write_back", "%s，有 %d 条新知识等你回写 Brain" % (text, n), where="app", since=at)
    if at is None or now is None or now - at < WATCH_S:
        end = time.strftime("%m-%d", time.localtime(at + WATCH_S)) if at is not None else None
        return put("merged", "nobody", "watch", "%s，在观察合并后的 14 天%s" % (text, "（到 %s）" % end if end else ""),
                   since=at)
    return put("merged", "nobody", "none", text, since=at)


def classify(row: dict[str, Any], f: dict[str, Any], *, mr: dict[str, Any] | None, slot: dict[str, Any] | None,
             cfg: dict[str, Any], bot_commits: int = 0, at_handover: bool = False, me: str | None = None,
             reflected: bool = False, now: float | None = None) -> None:
    """Fill in state, state_label and waits (person mode). *at_handover*: the branch tip is the hand-over commit
    `brain handoff` made (its parent is run.json's handoff.local_head). *me*: who this machine's person is (None: not
    known, every requirement counts as theirs); someone else's requirement waits for them, not for "you". *reflected*:
    its Brain proposals were written back already (a brain/<KEY>-reflect-<n> branch)."""
    run, park, claim = f.get("run"), f.get("park"), f.get("claim") or {}
    pending = [a for a in f.get("approvals") or [] if a["state"] == "pending" and a.get("line")]
    owner = f.get("owner") or claim.get("owner")
    mine = not me or not owner or me == owner
    you = "you" if mine else "people"
    them = "你" if mine else str(owner)

    def put(state: str, who: str, do: str, text: str, **kw: Any) -> None:
        row["state"], row["state_label"] = state, STATE_LABEL[state]
        row["waits"] = waits(who, do, text, **kw)

    if claim.get("closed"):
        closed = claim["closed"] if isinstance(claim.get("closed"), dict) else {}
        why = closed.get("reason")
        return put("closed", "nobody", "none", "已关闭" + ("：%s" % str(why)[:80] if why else ""),
                   since=lean_view.epoch(closed.get("at")))
    if f.get("merged"):
        return _merged(put, f, now=now, reflected=reflected)
    if not run:
        return put("claimed", you, "start", "认领了，还没开工" if mine else "等 %s 开工" % owner, where="app",
                   since=lean_view.epoch(claim.get("created_at")))
    if not run.get("handoff"):
        if pending:
            a = pending[0]
            what = lean_view.KIND_LABEL.get(a["kind"], a["kind"])
            what = " %s 的%s" % (a["unit"], what) if a.get("unit") else what
            return put("local", you, "approve", "等%s批准%s：读完再在会话里自己打那一行" % (them, what),
                       where="session", since=a.get("at"), line=a["line"] if mine else None)
        if park_waiting(park):
            kind = str(park.get("kind") or "other")
            here = mine and slot is not None and kind == "clarify" and not park.get("lean_request")
            return put("parked", you, "answer", "AI 停下等%s回答（%s）" % (them, KIND_LABEL.get(kind, "问题")),
                       where="app" if here else "session", since=f.get("park_at"))
        if not mine:
            return put("local", "people", "none", "%s 在自己的机器上做" % owner, since=f.get("tip_at"))
        if slot and slot.get("busy"):
            nxt = (row.get("lean") or {}).get("next")
            return put("local", "agent", "none", "AI 在做" + ("「%s」" % nxt["label"] if nxt else ""))
        if slot and slot.get("awaiting"):
            return put("local", "you", "tool", "会话里有一个工具调用等你批准", where="session",
                       since=slot.get("last_activity"))
        step = lean_view.idle_step(f.get("stages") or lean_view.stages([]), default_branch=str(
            cfg.get("default_branch") or "main"), review_ok=lean_view.review_current(
                (f.get("review") or {}).get("at"), bool(f.get("review")), f.get("events") or []))
        if slot:
            return put("local", "you", "reply", step, where="session", since=slot.get("last_activity"))
        if f.get("worktree"):
            return put("local", "you", "reply", "没有开着的会话：打开会话接着做。" + step, where="app",
                       since=updated_at(f, None))
        return put("local", "you", "reply", "这台机器上没有它的工作区：先检出分支 %s，再打开会话接着做" % f.get("branch"),
                   since=updated_at(f, None))
    labels = set((mr or {}).get("labels") or [])
    if mr and mr.get("state") == "merged":
        return _merged(put, f, now=now, reflected=reflected, text="MR 已合并")
    if mr and mr.get("state") == "closed":
        return put("closed", "nobody", "none", "MR 已关闭")
    if cfg.get("rejected_label") in labels:
        return put("rejected", you, "redo_handoff",
                   "接手被拒：" + (str((mr or {}).get("rejected_reason") or "看 MR 上的说明")[:200]), where="session",
                   raw=str((mr or {}).get("rejected_raw") or "")[:2000])   # the bridge's own words (problems.reason)
    open_q = [q for q in (mr or {}).get("questions") or [] if q.get("state") == "open"]
    if park_waiting(park) or open_q:
        q = open_q[-1] if open_q else {}
        kind = str(q.get("kind") or (park or {}).get("kind") or "other")
        did = q.get("id")
        since = lean_view.epoch(q.get("at")) or f.get("park_at")
        if (park and park_waiting(park) and park_is_acceptance(park)) or kind in ("acceptance", "验收"):
            return put("acceptance", "product", "accept", mr_ask("product", "验收", did, approval=True),
                       where="mr", since=since)
        who = ASK_WHO.get(str((park or {}).get("ask") or ""), "people")
        who = you if who == "you" else who
        lean_req = q.get("lean_request") or (park or {}).get("lean_request")
        return put("parked", who, "answer", mr_ask(who, KIND_LABEL.get(kind, kind), did, approval=bool(lean_req),
                                                   owner=None if mine else owner), where="mr", since=since)
    if cfg.get("running_label") in labels or bot_commits:
        return put("running", "runner", "none", "运行机在跑")
    if at_handover and not_labelled(f, mr, cfg):
        return put("handed_over", you, "label_handoff", NOT_LABELLED % cfg.get("handoff_label"), where="session",
                   since=f.get("tip_at"))
    return put("handed_over", "bridge", "none", "等桥核对交接", since=f.get("tip_at"))


def mr_ask(who: str, what: str, did: Any, *, approval: bool, owner: str | None = None) -> str:
    """A question on the MR, said with who answers it where and how: 「等产品在 MR 上回答 D-3（approve / reject）」.
    A Lean approval or an acceptance is answered approve / reject there (never typed in a session after the
    hand-over)."""
    name = owner if who == "people" and owner else ASK_NAME.get(who, "人")
    verb = "验收" if what == "验收" else "回答"
    return "等%s在 MR 上%s%s（%s）" % (name, verb, " " + str(did) if did else "",
                                   "approve / reject" if approval else what)


def not_labelled(f: dict[str, Any], mr: dict[str, Any] | None, cfg: dict[str, Any]) -> bool:
    """A hand-over that was pushed but is not labelled: the MR (open, its head the branch tip this machine sees) has
    no hand-over label, and neither the running nor the rejected one. Then the bridge takes nothing (brain-kit 72b278e:
    `brain handoff` exits 1 when it could not label; the bridge's process() says "unlabelled" while the newest label
    event takes the label off). Unknown MR: not said. The caller makes sure the tip is the hand-over commit (so a
    run whose labels were tidied away after the runner's work is not taken for one)."""
    if not mr or mr.get("state") != "opened" or not cfg.get("handoff_label"):
        return False
    labels = set(mr.get("labels") or [])
    if labels & {cfg.get("handoff_label"), cfg.get("running_label"), cfg.get("rejected_label")}:
        return False
    tip = f.get("tip")
    return not tip or not mr.get("sha") or mr.get("sha") == tip


def team_classify(row: dict[str, Any], run_row: dict[str, Any], decisions: list[dict[str, Any]],
                  park: Any) -> None:
    """Team mode: the ledger's run state and its decisions (brain-kit's states). A run id reserved while the signer
    signs its contract (``signing``) is a hand-over not taken yet; a decision whose answer the signer refused, that is
    void, or that could not be asked leaves the run waiting until a person looks."""
    st = run_row.get("state")
    open_d = [d for d in decisions if d.get("state") == "open"]
    posting = [d for d in decisions if d.get("state") in NOT_POSTED]    # brain-kit: not on the MR yet
    mine = [d for d in decisions if not run_row.get("run_id") or d.get("run_id") in (None, run_row.get("run_id"))]

    def put(state: str, who: str, do: str, text: str, **kw: Any) -> None:
        row["state"], row["state_label"] = state, STATE_LABEL[state]
        row["waits"] = waits(who, do, text, **kw)

    row["open_questions"] = [d["id"] for d in open_d]
    if st == "closed":
        return put("merged", "nobody", "none", "MR 已合并或关闭，运行结束")
    if st == "failed":
        return put("rejected", "people", "redo_handoff", "工作区没建成，要人看一下", where="mr")
    if st == "signing":
        return put("handed_over", "bridge", "none", "签名服务在签接手合同（%s 先占着）" % (run_row.get("run_id") or "run 号"))
    if st in ("spooled", "ready"):
        return put("handed_over", "runner", "none", "运行机在准备工作区")
    if st == "send_unknown":
        return put("running", "people", "none", "消息送没送到不清楚：要人看一下会话 %s" % (run_row.get("slot") or ""))
    if open_d:
        d = open_d[-1]
        since = lean_view.epoch(d.get("created"))
        if d.get("kind") == "acceptance":
            return put("acceptance", "product", "accept", mr_ask("product", "验收", d["id"], approval=True),
                       where="mr", since=since)
        return put("parked", "people", "answer", mr_ask("people", KIND_LABEL.get(str(d.get("kind")), str(d.get("kind"))),
                                                       d["id"], approval=bool(d.get("lean_request"))),
                   where="mr", since=since)
    if posting:
        return put("parked", "bridge", "none", "run 停下了：等桥把问题贴到 MR 上")
    last = mine[-1] if mine else None
    if last and last.get("state") in STUCK_DECISION and (park is None or park_waiting(park)) and \
            (not run_row.get("last_sha") or not last.get("sha") or last["sha"] == run_row["last_sha"]):
        return put("parked", "people", "answer", STUCK_DECISION[last["state"]] % last["id"], where="mr")
    if park_waiting(park):
        return put("parked", "bridge", "none", "run 停下了：等桥把问题贴到 MR 上")
    return put("running", "runner", "none", "运行机在跑")


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


ANSWERED = ("answered", "delivered", "delivery_unknown", "refused")   # brain-kit's states of a question answered


def questions_asked(f: dict[str, Any], mr: dict[str, Any] | None) -> dict[str, int]:
    """Person mode: the questions a requirement stopped and asked a person, {asked, answered, delivered}: the bridge's
    D-n on its MR once handed over (one not posted, or that could not be asked, is not counted), else its local
    park.json."""
    out = {"asked": 0, "answered": 0, "delivered": 0}
    if (f.get("run") or {}).get("handoff"):
        for q in (mr or {}).get("questions") or []:
            if q.get("state") in ("invalid",) + NOT_POSTED:
                continue
            out["asked"] += 1
            out["answered"] += q.get("state") in ANSWERED
            out["delivered"] += q.get("state") == "delivered"
    elif isinstance(f.get("park"), dict) and not f["park"].get("invalid"):
        out["asked"] += 1
        out["answered"] += f["park"].get("status") == "answered"
    return out


def category(d: dict[str, Any]) -> str:
    """Who settled a decisions.md row (the app's fallback for brainkit.evaluate's funnel, the same order)."""
    if d.get("by") in ("person", "bridge"):
        return "person"
    if d.get("by") in ("check", "brain", "unclassified"):
        return d["by"]
    if d.get("cites"):
        return "brain"
    if d.get("by") == "agent":
        return "agent"
    return "unknown"


def funnel_app(decisions: list[dict[str, Any]], questions: dict[str, int]) -> dict[str, Any]:
    """*decisions*: detail.decisions rows, each with the "key" of its requirement."""
    counts = {c: 0 for c in CAT_ORDER}
    unclassified = []
    for d in decisions:
        c = category(d)
        counts[c] += 1
        if c == "unclassified":
            unclassified.append({"key": str(d.get("key") or ""), "id": str(d.get("id") or ""),
                                 "src": str(d.get("src") or "")})
    return {"source": "app", "total": sum(counts.values()),
            "rows": [{"id": c, "label": CAT_LABEL[c], "count": counts[c]} for c in CAT_ORDER],
            "questions": {"asked": int(questions.get("asked", 0)), "answered": int(questions.get("answered", 0)),
                          "delivered": int(questions.get("delivered", 0))},
            "unclassified": unclassified}


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
    view = {"available": False, "error": "", "ref": ref, "metrics": [], "queue": [], "skipped": [], "notes": []}
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
        {"id": "useful", "label": "知识有用率", "value": _pair(data.get("useful")),
         "rule": "已经合并进默认分支的需求引用过的条目 ÷ Brain 里现有的条目（还在分支上、没合并的需求引用的不算）"},
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
    skipped = [{"key": str(x.get("key") or ""), "why": str(x.get("why") or "")[:300]}
               for x in data.get("skipped") or [] if isinstance(x, dict)][:50]
    notes = []
    if cost.get("note"):
        notes.append(str(cost["note"])[:300])
    d = data.get("delivery") if isinstance(data.get("delivery"), dict) else {}
    wrong_open = [str(k) for k in d.get("wrong_open") or []]
    if wrong_open:
        notes.append("已知有问题、14 天还没满（满了再算进交付正确率）：%s" % "、".join(wrong_open[:20]))
    # brain-kit 72b278e: a run whose acceptance was rejected waits for its merge and 14 days like a merged one
    # (autonomy.runs[].correct "wrong_open"); the merged ones are in the line above already
    a = data.get("autonomy") if isinstance(data.get("autonomy"), dict) else {}
    unmerged = sorted({str(r["key"]) for r in a.get("runs") or [] if isinstance(r, dict) and r.get("key")
                       and r.get("correct") == "wrong_open"} - set(wrong_open))
    if unmerged:
        notes.append("已知有问题、还没合并（验收被驳回过；合并满 14 天才算进自主度）：%s" % "、".join(unmerged[:20]))
    view.update(available=True, queue=queue, ref=data.get("ref") or ref, skipped=skipped, notes=notes)
    view["_cto"] = cto_part(data)   # the 交付总览's numbers (the service takes it out before the page gets the view)
    f = data.get("funnel") if isinstance(data.get("funnel"), dict) else None
    funnel = None
    if f and isinstance(f.get("counts"), dict):
        counts = f["counts"]
        cats = [c for c in CAT_ORDER if c in counts] + [c for c in counts if c not in CAT_ORDER]
        funnel = {"source": "evaluate", "total": int(f.get("total") or 0),
                  "rows": [{"id": c, "label": CAT_LABEL.get(c, c), "count": int(counts[c] or 0)} for c in cats],
                  "questions": {"asked": 0, "answered": 0, "delivered": 0},
                  "unclassified": [{"key": str(x.get("key") or ""), "id": str(x.get("id") or ""),
                                    "src": str(x.get("src") or "")}
                                   for x in f.get("unclassified") or [] if isinstance(x, dict)][:100]}
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


# ---------------------------------------------------------------- the 交付总览's three numbers (the CTO 视图's)

ACT_LABEL = {"approval": "批准", "rejection": "退回", "answer": "回答问题", "approval_refused": "口令没被接受",
             "push_after_handover": "交接后推代码", "allow_test_change": "允许改验收测试"}


def act_label(kind: str) -> str:
    """A person's act in brain-kit's words (trace humans[].kind), in Chinese."""
    k = str(kind or "")
    if k.startswith("platform_"):
        return "平台上的手动操作"
    return ACT_LABEL.get(k, k or "别的")


def cto_part(data: dict[str, Any]) -> dict[str, Any]:
    """One repo's part of the numbers, from brainkit.evaluate's data: each run (how it went, what a person did, its
    credits, its merge), autonomy's [unattended, judged] and judgment's acts."""
    a = data.get("autonomy") if isinstance(data.get("autonomy"), dict) else {}
    rows = {str(r.get("key")): r for r in a.get("runs") or [] if isinstance(r, dict) and r.get("key")}
    runs = []
    for t in data.get("traces") or []:
        if not isinstance(t, dict) or not t.get("key"):
            continue
        key = str(t["key"])
        r = rows.get(key) or {}
        o = t.get("outcome") if isinstance(t.get("outcome"), dict) else {}
        handed = bool((o.get("handed_over") or {}).get("value"))
        st = r.get("status")
        merged_at = lean_view.epoch(((o.get("merged_at") or {}).get("value")))
        if not handed or st == "local only":
            how = "local" if merged_at else "pending"     # 本机做完 is a merged one; one still on its branch: 还没评
        elif st == "counted":
            how = "unattended" if r.get("autonomous") and r.get("correct") == "correct" else "people"
        else:
            how = "pending"
        humans = [h for h in t.get("humans") or [] if isinstance(h, dict)]
        beyond = sorted({act_label(str(x).split(" ", 1)[0]) for x in r.get("beyond") or []})
        cost = t.get("cost") if isinstance(t.get("cost"), dict) else {}
        c = cost.get("credits")
        runs.append({"key": key, "repo": "", "how": how, "beyond": beyond,
                     "at_points": sum(1 for h in humans if h.get("judgment_point")),
                     "outside": sum(1 for h in humans if not h.get("judgment_point")),
                     "credits": round(float(c), 2) if isinstance(c, (int, float)) and not isinstance(c, bool) else None,
                     "merged_at": merged_at})
    j = data.get("judgment") if isinstance(data.get("judgment"), dict) else {}
    kinds: dict[tuple, int] = {}
    for k, n in (j.get("by_kind") or {}).items():
        point = "（判断点）" in str(k)
        kind = str(k).split("（", 1)[0]
        kinds[(act_label(kind), point)] = kinds.get((act_label(kind), point), 0) + int(n or 0)
    cost = data.get("cost") if isinstance(data.get("cost"), dict) else {}
    return {"unattended": _pair(a.get("value")), "judgment": _pair(j.get("value")),
            "kinds": [{"label": lab, "n": n, "point": pt} for (lab, pt), n in sorted(kinds.items(), key=lambda kv: (not kv[0][1], -kv[1]))],
            "runs": runs, "ref": data.get("ref"),
            # what 每个正确交付的 credits is made of, so several repos add up (an average does not)
            "credits_total": cost.get("credits_total") if isinstance(cost.get("credits_total"), (int, float)) else None,
            "correct": cost.get("correct_deliveries") if isinstance(cost.get("correct_deliveries"), int) else None}


def _week(t: float) -> str:
    d = time.gmtime(t - ((time.gmtime(t).tm_wday) * 86400))
    return "%04d-%02d-%02d" % (d.tm_year, d.tm_mon, d.tm_mday)


def branch_words(refs: list[tuple[str, str | None]]) -> str | None:
    """[(repo name, the ref read)] in words: 「main 分支」, 「远端的 main 分支」, 「各仓库的 main 分支」,
    「demo 的 main 分支、oms-brain 的 master 分支」 (never refs/heads/…)."""
    def word(ref: str) -> tuple[str, str]:
        for pre, where in (("refs/remotes/origin/", "远端的 "), ("origin/", "远端的 "), ("refs/heads/", "")):
            if ref.startswith(pre):
                return where, "%s 分支" % ref[len(pre):]
        return "", "%s 分支" % ref

    def of(whose: str, w: tuple[str, str]) -> str:
        return "%s%s%s" % (whose, w[0] if w[0] else "的 ", w[1]) if whose else w[0] + w[1]
    got = [(name, word(ref)) for name, ref in refs if ref]
    if not got:
        return None
    if len(got) == 1:
        return of("", got[0][1])
    if len({w for _, w in got}) == 1:
        return of("各仓库", got[0][1])
    return "、".join(of(name + " ", w) for name, w in got)


def cto_numbers(parts: list[tuple[str, dict[str, Any]]], rows: list[dict[str, Any]], *, available: bool, now: float,
                weeks: int = 12, names: dict[str, str] | None = None, local_repos: int = 0,
                repos: int = 0) -> dict[str, Any]:
    """CtoNumbers for the page: the repos' parts added up; credits per requirement from the rows (the sessions this
    app opened); the merges of the last *weeks* weeks, by how they went. Without brainkit.evaluate: the rows only.
    *names*: repo id -> name (the ref is said with it); *local_repos* of *repos* are done only on this machine."""
    runs = []
    for rid, p in parts:
        for r in p.get("runs") or []:
            runs.append(dict(r, repo=rid))
    pairs = [p["unattended"] for _, p in parts if p.get("unattended")]
    unattended = [sum(x[0] for x in pairs), sum(x[1] for x in pairs)] if pairs else None
    js = [p["judgment"] for _, p in parts if p.get("judgment")]
    kinds: dict[tuple, int] = {}
    for _, p in parts:
        for k in p.get("kinds") or []:
            kinds[(k["label"], k["point"])] = kinds.get((k["label"], k["point"]), 0) + int(k["n"])
    stepped = None
    if js:
        at_points, all_ = sum(x[0] for x in js), sum(x[1] for x in js)
        stepped = {"at_points": at_points, "outside": max(0, all_ - at_points),
                   "kinds": [{"label": lab, "n": n, "point": pt} for (lab, pt), n in
                             sorted(kinds.items(), key=lambda kv: (not kv[0][1], -kv[1]))]}
    with_c = [r for r in rows if isinstance(r.get("credits"), (int, float)) and r.get("credits")]
    total = round(sum(float(r["credits"]) for r in with_c), 1) if with_c else None
    credits = {"per_req": round(total / len(with_c), 1) if with_c else None, "total": total, "reqs": len(with_c)}
    # the weekly merges: a run brain-kit judged says how it went; a merged row it did not judge is counted as pending
    first = _week(now) if now else ""
    starts = []
    if first:
        y, m, d = (int(x) for x in first.split("-"))
        base = time.mktime((y, m, d, 12, 0, 0, 0, 0, 0))
        starts = [_week(base - 7 * 86400 * i) for i in range(weeks - 1, -1, -1)]
    weekly = {w: {"week": w, "unattended": 0, "people": 0, "local": 0, "pending": 0} for w in starts}
    judged = set()
    for r in runs:
        if r.get("merged_at"):
            judged.add((r["repo"], r["key"]))
            w = _week(r["merged_at"])
            if w in weekly:
                weekly[w][r["how"]] += 1
    for row in rows:
        at = (row.get("waits") or {}).get("since") or row.get("updated_at")
        if row.get("state") == "merged" and (row.get("repo"), row.get("key")) not in judged and at:
            w = _week(float(at))
            if w in weekly:
                weekly[w]["pending"] += 1
    ref = branch_words([((names or {}).get(rid, rid), p.get("ref")) for rid, p in parts])
    return {"available": bool(available and parts),
            "sentence": cto_sentence(unattended, stepped, credits, local_repos=local_repos, repos=repos),
            "ref": ref, "unattended": unattended, "stepped_in": stepped, "credits": credits, "runs": runs,
            "weekly": list(weekly.values())}


def cto_sentence(unattended: list[int] | None, stepped: dict[str, Any] | None, credits: dict[str, Any], *,
                 local_repos: int = 0, repos: int = 0) -> str:
    """The sentence over the three numbers, each part a whole sentence. 人介入 counts what people did on every
    requirement, on this machine too (brain-kit's judgment metric); 无人值守 only the handed-over ones."""
    parts = []
    if repos and local_repos == repos:
        parts.append("这个仓库只在本机做，不交给运行机" if repos == 1 else "这 %d 个仓库都只在本机做，不交给运行机" % repos)
    elif unattended and unattended[1]:
        parts.append("交给运行机的 %d 个需求里，%d 个交接以后没人插手就做完了" % (unattended[1], unattended[0]))
    elif unattended is not None:
        parts.append("还没有交给运行机、已经评完的需求（交接以后合并满 14 天才评）")
    if stepped is not None:
        n = stepped["at_points"] + stepped["outside"]
        parts.append("人介入了 %d 次（本机做的也算），%d 次落在判断点上" % (n, stepped["at_points"]) if n else "人还没有介入过")
    if credits.get("per_req") is not None:
        parts.append("有 credits 的 %d 个需求，平均每个 %s credits" % (credits["reqs"], credits["per_req"]))
    return ("。".join(parts) + "。") if parts else "还没有可以算的数：需求合并以后，这里会说它们是怎么交付的。"
