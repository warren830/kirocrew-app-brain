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
               "closed": "已关闭", "unclaimed": "待认领", "merged_into_parent": "已合进大需求"}
OPEN_STATES = ("claimed", "local", "handed_over", "running", "parked", "acceptance", "rejected", "unclaimed")
KIND_LABEL = {"clarify": "澄清", "design": "设计", "plan": "计划", "acceptance": "验收", "action": "危险动作",
              "other": "其他", "requirements": "需求批准"}
ASK_WHO = {"product": "product", "builder": "builder", "owner": "you", "security": "people", "data": "people"}
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
        "lean": lean, "stage": lean_view.stage_text(lean), "waits": {"who": "nobody", "text": "", "line": None, "raw": ""},
        "summary": None,     # the first line of its 变更说明 (mrdesc_view), filled in by the service
        "credits": None,
        "updated_at": None, "mr": None, "worktree": f.get("worktree"), "run_ids": [], "sessions": 0,
        "overlap": [], "open_questions": [],
        "expected_paths": [p for p in run.get("expected_paths") or [] if isinstance(p, str)][:50],
        "family": None,      # a 大需求 or one of its 小需求 (family.families), filled in by the service
    }


def classify(row: dict[str, Any], f: dict[str, Any], *, mr: dict[str, Any] | None, slot: dict[str, Any] | None,
             cfg: dict[str, Any], bot_commits: int = 0, at_handover: bool = False) -> None:
    """Fill in state, state_label and waits (person mode). *at_handover*: the branch tip is the hand-over commit
    `brain handoff` made (its parent is run.json's handoff.local_head)."""
    run, park, claim = f.get("run"), f.get("park"), f.get("claim") or {}
    pending = [a for a in f.get("approvals") or [] if a["state"] == "pending" and a.get("line")]

    def put(state: str, who: str, text: str, line: str | None = None, raw: str = "") -> None:
        row["state"], row["state_label"] = state, STATE_LABEL[state]
        row["waits"] = {"who": who, "text": text, "line": line, "raw": raw}

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
    note = fresh_note(mr, f)
    if cfg.get("rejected_label") in labels:
        if note and note["kind"] == "failed":     # brain-kit 0d52e97: the run could not start (labelled rejected)
            return put("rejected", "you", note["text"][:200], raw=str(note.get("raw") or "")[:2000])
        return put("rejected", "you", "接手被拒：" + (str((mr or {}).get("rejected_reason") or "看 MR 上的说明")[:200]),
                   raw=str((mr or {}).get("rejected_raw") or "")[:2000])   # the bridge's own words (problems.reason)
    qs = (mr or {}).get("questions") or []
    open_q = [q for q in qs if q.get("state") == "open"]
    if park_waiting(park) and not open_q:
        # brain-kit 0d52e97 trace's `answered`: park.json still waits, but the bridge has its answer (nobody answers
        # again): the run (or the bridge) has not gone on yet
        h = str(f.get("park_sha") or "")[:12]
        got = [q for q in qs if h and q.get("park") == h and q.get("state") in ANSWERED_TEXT]
        if got:
            q = got[-1]
            who, text = ANSWERED_TEXT[q["state"]]
            return put("parked", who, text % q["id"])
    if park_waiting(park) or open_q:
        q = open_q[-1] if open_q else {}
        kind = str(q.get("kind") or (park or {}).get("kind") or "other")
        did = q.get("id")
        if (park and park_waiting(park) and park_is_acceptance(park)) or kind in ("acceptance", "验收"):
            return put("acceptance", "product", "等产品验收" + ("（%s）" % did if did else ""))
        who = ASK_WHO.get(str((park or {}).get("ask") or ""), "people")
        return put("parked", who, "等回答%s（%s）" % (" " + did if did else "", KIND_LABEL.get(kind, kind)))
    if cfg.get("running_label") in labels or bot_commits:
        if note and note["kind"] in RUNNING_NOTES:      # e.g. the acceptance question held until CI is green
            return put("running", RUNNING_NOTES[note["kind"]], note["text"][:200], raw=str(note.get("raw") or "")[:2000])
        return put("running", "runner", "运行机在跑")
    if at_handover and not_labelled(f, mr, cfg):
        return put("handed_over", "you", NOT_LABELLED % cfg.get("handoff_label"))
    if note and note["kind"] in WAITING_NOTES:          # taken, but the runner has not started it yet
        return put("handed_over", WAITING_NOTES[note["kind"]], note["text"][:200], raw=str(note.get("raw") or "")[:2000])
    return put("handed_over", "bridge", "等桥核对交接")


# the bridge holds the answer while park.json at the tip still waits (who it waits on, the line)
ANSWERED_TEXT = {"held": ("bridge", "%s 有了回复：等 GitLab 能查回复有没有被改过再核对（不用重新回复）"),
                 "answered": ("bridge", "%s 有了回答：桥还在签名、送回 run（不用再答）"),
                 "delivered": ("runner", "%s 的回答送到了，run 还没接着做：去 KiroCrew 看它的会话"),
                 "delivery_unknown": ("bridge", "%s 的回答不知道送到没有：桥每轮看一下会话，确认没送到才再送；一直这样就要人去 KiroCrew 看一下（不用再答）")}
# the run's own MR notes (mrinfo.RUNNER_NOTES) that say why a running run waits, and on whom
RUNNING_NOTES = {"ci_wait": "runner", "ci_person": "people", "ci_red": "people", "nobody": "people",
                 "gaveup": "people", "send_unknown": "bridge"}
# ... and why a taken hand-over has not started on the runner yet
WAITING_NOTES = {"runnerd_silent": "people", "runnerd_retry": "runner", "setup": "people", "queued": "runner",
                 "send_unknown": "bridge", "gaveup": "people"}


def fresh_note(mr: dict[str, Any] | None, f: dict[str, Any]) -> dict[str, Any] | None:
    """The run's newest own note on the MR (mrinfo's ``runner``), only while nothing was pushed after it: a later
    commit means the run went on (the note is about an older head)."""
    note = (mr or {}).get("runner") if isinstance((mr or {}).get("runner"), dict) else None
    if not note or not note.get("kind"):
        return None
    at, tip = lean_view.epoch(note.get("at")), f.get("tip_at")
    if isinstance(tip, (int, float)) and at is not None and tip > at:
        return None
    return note


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


# brain-kit 0d52e97's ledger notices (bridge/delivery.py tell_mr_once, the counters): the key's first part -> (kind,
# who it waits on, the plain line). Only what tells why a run waits; the rest (replies, conflicts) is the MR's.
NOTICE_KIND = {
    "ciheld": ("ci_wait", "runner", "验收问题等 MR 的流水线通过才发（通过以后桥自动发）"),
    "ciheld-wait": ("ci_wait", "runner", "流水线跑了很久还没完：验收问题还在等它"),
    "ciheld-person": ("ci_person", "people", "流水线要有人处理（重新运行，或跑完手动的 job），验收问题才发"),
    "ciheld-red": ("ci_red", "people", "流水线一直没过：验收问题没发，请负责人看一下"),
    "ci-accepted": ("ci_red", "people", "产品验收以后流水线没过：请负责人决定怎么办"),
    "runnerd-silent": ("runnerd_silent", "people", "运行机很久没准备好工作区、也没报错：请负责人看一下 brain-runnerd"),
    "runnerd-retry": ("runnerd_retry", "runner", "运行机建工作区没成，过一会儿再试"),
    "setup": ("setup", "people", "KiroCrew 开会话失败，桥每轮重试：一直这样就看一下 KiroCrew"),
    "queued": ("queued", "runner", "在排队：运行机上的 run 满了，有空位就开始"),
    "send_unknown": ("send_unknown", "people", "接手消息送没送到不清楚：桥每轮看会话，看到了就接着做；一直这样就要人看一下"),
    "gaveup": ("gaveup", "people", "消息送了 3 次都没进会话：桥接着送，一直不行就看一下 KiroCrew"),
    "failed": ("failed", "people", "没能开始：MR 上写了原因，处理好以后重新 brain handoff"),
    "nobody": ("nobody", "people", "问题发不出：没人能回答这类决定（配 decision_roles）"),
    "edits-down-told": ("held", "bridge", "%s 的回答先等着：GitLab 查不到回复有没有被改过（不用重新回复）"),
}
OUTBOX_WHAT = {"handover": "接手消息", "answer": "%s 的回答", "notice": "给 run 的通知"}


def team_note(n: dict[str, Any]) -> dict[str, Any] | None:
    """A ledger notice as a TeamNote {kind, text, at}, or None (one that tells nothing about why a run waits, or is
    still being told)."""
    key = str(n.get("key") or "")
    head, _, rest = key.partition(":")
    hit = NOTICE_KIND.get(head)
    if not hit or n.get("state") not in ("told", "counting"):
        return None
    kind, _, text = hit
    if "%s" in text:
        text = text % (rest.split(":", 1)[0] or "?")
    return {"kind": kind, "text": text, "at": lean_view.epoch(n.get("updated") or n.get("created"))}


def outbox_note(o: dict[str, Any]) -> dict[str, Any] | None:
    """A message into the run's session that is not known to have landed, or that is not sent any more (brain-kit
    0d52e97's outbox: sending, interrupted, sent, unknown, dropped), as a TeamNote; None for one that landed."""
    st = str(o.get("state") or "")
    if st not in ("unknown", "interrupted", "dropped"):
        return None
    what, _, rest = str(o.get("what") or "").partition(":")
    name = OUTBOX_WHAT.get(what, "消息")
    if "%s" in name:
        name = name % (rest or "?")
    tries = int(o.get("tries") or 0)
    text = {"unknown": "%s不知道送到会话没有（送过 %d 次）：桥每轮看一下会话，看到了就算送到；一直这样就要人看一下会话" % (name, tries),
            "interrupted": "%s送的时候桥停了：桥每轮看一下会话，看到了就算送到；一直这样就要人看一下会话" % name,
            "dropped": "%s不送了：%s" % (name, "KiroCrew 一直没收下，这个 run 算没能开始" if what == "handover"
                                        else "分支有了新推送，或者 run 结束了" if what == "answer" else "已经不适用")}[st]
    return {"kind": "outbox_" + st, "text": text, "at": lean_view.epoch(o.get("updated") or o.get("created"))}


def team_classify(row: dict[str, Any], run_row: dict[str, Any], decisions: list[dict[str, Any]],
                  park: Any, notes: list[dict[str, Any]] | None = None) -> None:
    """Team mode: the ledger's run state and its decisions (brain-kit's states). A run id reserved while the signer
    signs its contract (``signing``) is a hand-over not taken yet; a decision whose answer the signer refused, that is
    void, or that could not be asked leaves the run waiting until a person looks. *notes* (team_note, outbox_note):
    what brain-kit 0d52e97's bridge holds about the run, e.g. the acceptance question held until CI is green."""
    st = run_row.get("state")
    notes = sorted(notes or [], key=lambda x: x.get("at") or 0)
    latest = {x["kind"]: x for x in notes}
    open_d = [d for d in decisions if d.get("state") == "open"]
    posting = [d for d in decisions if d.get("state") in NOT_POSTED]    # brain-kit: not on the MR yet
    mine = [d for d in decisions if not run_row.get("run_id") or d.get("run_id") in (None, run_row.get("run_id"))]

    def put(state: str, who: str, text: str) -> None:
        row["state"], row["state_label"] = state, STATE_LABEL[state]
        row["waits"] = {"who": who, "text": text, "line": None, "raw": ""}

    row["open_questions"] = [d["id"] for d in open_d]
    if st == "closed":
        return put("merged", "nobody", "MR 已合并或关闭，运行结束")
    if st == "failed":     # 0d52e97: runnerd failed for good, or KiroCrew never took the hand-over
        return put("rejected", "people", "没能开始（工作区没建成，或接手消息一直送不进会话）：要人看一下，处理好以后重新交接")
    if st == "signing":
        return put("handed_over", "bridge", "签名服务在签接手合同（%s 先占着）" % (run_row.get("run_id") or "run 号"))
    if st in ("spooled", "ready"):
        for k in ("runnerd_silent", "setup", "runnerd_retry", "queued", "gaveup", "outbox_unknown"):
            if k in latest:
                _, who, _ = NOTICE_KIND.get({"runnerd_silent": "runnerd-silent", "runnerd_retry": "runnerd-retry"}.get(
                    k, k), ("", "runner", ""))
                return put("handed_over", who if k != "outbox_unknown" else "bridge", latest[k]["text"])
        return put("handed_over", "runner", "运行机在准备工作区")
    if st == "send_unknown":
        # the app's KiroCrew adapter shows the bridge a slot's messages only (no running / queue): brain-kit sees a send
        # that landed, never one that did not, so it does not send it again by itself
        return put("running", "people", "接手消息送没送到不清楚：桥每轮看一下会话 %s，看到了就接着做；一直这样就要人看一下它"
                   % (run_row.get("slot") or ""))
    if open_d:
        d = open_d[-1]
        if d.get("kind") == "acceptance":
            return put("acceptance", "product", "等产品验收（%s，在 MR 上回答）" % d["id"])
        return put("parked", "people", "等回答 %s（%s，在 MR 上回答）" % (d["id"], KIND_LABEL.get(str(d.get("kind")), d.get("kind"))))
    if posting:
        return put("parked", "bridge", "run 停下了：等桥把问题贴到 MR 上")
    last = mine[-1] if mine else None
    if last and last.get("state") in STUCK_DECISION and (park is None or park_waiting(park)) and \
            (not run_row.get("last_sha") or not last.get("sha") or last["sha"] == run_row["last_sha"]):
        return put("parked", "people", STUCK_DECISION[last["state"]] % last["id"])
    answered = [d for d in mine if d.get("state") in ("answered", "delivered", "delivery_unknown")]
    if park_waiting(park) and answered and answered[-1] is last:
        # brain-kit 0d52e97's `answered`: the bridge has the answer, park.json still waits
        who, text = ANSWERED_TEXT[answered[-1]["state"]]
        return put("parked", who, text % answered[-1]["id"])
    if park_waiting(park):
        if "nobody" in latest:
            return put("parked", "people", latest["nobody"]["text"])
        return put("parked", "bridge", "run 停下了：等桥把问题贴到 MR 上")
    for k in ("ci_red", "ci_person", "ci_wait", "gaveup"):
        if k in latest:
            return put("running", NOTICE_KIND.get({"ci_red": "ciheld-red", "ci_person": "ciheld-person",
                                                   "ci_wait": "ciheld"}.get(k, k), ("", "runner", ""))[1], latest[k]["text"])
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
    view = {"available": False, "error": "", "ref": ref, "metrics": [], "queue": [], "skipped": [], "notes": [],
            "families": []}
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
    view.update(available=True, queue=queue, ref=data.get("ref") or ref, skipped=skipped, notes=notes,
                families=family_rows(data))
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

# a handed-over run whose eval state ends it without a delivery (brain-kit evaluate.ENDED, 0d52e97)
ENDED = ("failed", "closed")
ACT_LABEL = {"approval": "批准", "rejection": "退回", "answer": "回答问题", "approval_refused": "口令没被接受",
             "push_after_handover": "交接后推代码", "allow_test_change": "允许改验收测试",
             # brain-kit 0d52e97: a handed-over run that ended without delivering is never autonomous
             "runner_failed": "运行机没能开始", "closed_unmerged": "MR 关了没合并"}
# brain-kit's eval states of a run (evaluate.STATE_LABEL, 0d52e97), its families' and its deliveries': brain-kit's own
# words when the loaded brain-kit has them, else these (the same ones)
EVAL_STATE = {"merged": "已合并", "accepted": "验收过了、没合并", "waiting": "在等回答",
              "answered": "有了回答、run 没接着做", "open": "进行中", "closed": "MR 关了（没合并）", "failed": "运行机失败",
              "unknown": "派单结果不明", "merged_not_here": "桥说已合并（这里的 main 没有）",
              "not_readable": "读不到（只有桥上的记录）", "unreadable": "run.json 读不了", "merged_into_parent": "已合进大需求"}
EVAL_FAMILY = {"in_progress": "小需求在做", "ready_to_release": "小需求都合进了，等发布"}
EVAL_DELIVERY = {"correct": "对", "wrong": "不对", "pending": "14 天未满", "wrong_open": "有问题（14 天未满）",
                 "unknown": "没有验收记录", "open": "还没合并", "closed": "没合并",
                 "merged_not_here": "桥说合并了（这里读不到合并，对不对不知道）"}


def eval_words(name: str, mine: dict[str, str]) -> dict[str, str]:
    """brain-kit's own table of words (evaluate.STATE_LABEL …) over the app's copy of it."""
    got = getattr(bk.m("evaluate"), name, None) if bk.has("evaluate") else None
    return {**mine, **{str(k): str(v) for k, v in got.items()}} if isinstance(got, dict) else dict(mine)


def state_label(state: Any) -> str:
    """An eval state (or a family's) in brain-kit's words; another value as it is."""
    s = str(state or "")
    words = eval_words("STATE_LABEL", EVAL_STATE)
    words.update({k: v for k, v in eval_words("FAMILY_LABEL", EVAL_FAMILY).items() if k not in words})
    return words.get(s, s)


def delivery_label(delivery: Any) -> str:
    d = str(delivery or "")
    return eval_words("DELIVERY_LABEL", EVAL_DELIVERY).get(d, d)


def family_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    """brain-kit's eval ``families`` (0d52e97): one row per big requirement split into small ones; [] without. Since
    1238919 (R1-89) ``total`` counts the small ones not closed, those not started included, as `brain intent list`
    does; ``not_started`` and ``closed`` name them (absent before)."""
    out = []
    for x in data.get("families") or []:
        if not isinstance(x, dict) or not x.get("key"):
            continue
        j = _pair(x.get("judgment")) or [0, 0]
        c = x.get("credits")
        out.append({"key": str(x["key"]), "repo": "", "children": [str(k) for k in x.get("children") or []][:50],
                    "merged": int(x.get("merged") or 0), "total": int(x.get("total") or 0),
                    "not_started": [str(k) for k in x.get("not_started") or [] if isinstance(k, str)][:50],
                    "closed": [str(k) for k in x.get("closed") or [] if isinstance(k, str)][:50],
                    "state": str(x.get("state") or ""), "state_label": state_label(x.get("state")),
                    "at_points": j[0], "outside": j[1], "questions": int(x.get("questions") or 0),
                    "credits": round(float(c), 2) if isinstance(c, (int, float)) and not isinstance(c, bool) else None})
    return out[:100]


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
    # brain-kit 0d52e97: each run of the batch with its state, a split child's parent, what blocks its autonomy
    batch = {str(b.get("key")): b for b in data.get("batch") or [] if isinstance(b, dict) and b.get("key")}
    runs = []
    for t in data.get("traces") or []:
        if not isinstance(t, dict) or not t.get("key"):
            continue
        key = str(t["key"])
        r = rows.get(key) or {}
        b = batch.get(key) or {}
        o = t.get("outcome") if isinstance(t.get("outcome"), dict) else {}
        handed = bool((o.get("handed_over") or {}).get("value"))
        st = r.get("status")
        landed = bool((o.get("merged_at") or {}).get("value")) or b.get("state") in ("merged", "merged_into_parent")
        if handed and (b.get("state") in ENDED or st in ENDED):
            how = "ended"           # handed over, ended without a delivery: the runner failed, or the MR was closed
        elif st == "local only" or (not handed and landed):
            how = "local"           # done on this machine (merged; a small one: into its big one's branch)
        elif not handed:
            how = "pending"         # 0d52e97's eval reads unmerged runs too: one still being built is not judged yet
        elif st == "counted":
            how = "unattended" if r.get("autonomous") and r.get("correct") == "correct" else "people"
        else:
            how = "pending"
        humans = [h for h in t.get("humans") or [] if isinstance(h, dict)]
        beyond = sorted({act_label(str(x).split(" ", 1)[0]) for x in (r.get("beyond") or []) + (b.get("beyond") or [])})
        cost = t.get("cost") if isinstance(t.get("cost"), dict) else {}
        c = cost.get("credits")
        fam = t.get("family") if isinstance(t.get("family"), dict) else {}
        runs.append({"key": key, "repo": "", "how": how, "beyond": beyond,
                     "at_points": sum(1 for h in humans if h.get("judgment_point")),
                     "outside": sum(1 for h in humans if not h.get("judgment_point")),
                     "credits": round(float(c), 2) if isinstance(c, (int, float)) and not isinstance(c, bool) else None,
                     "merged_at": lean_view.epoch(((o.get("merged_at") or {}).get("value"))),
                     "state": str(b["state"]) if b.get("state") else None,
                     # 1238919 (R1-89): a small one whose claim was closed is `closed` too, closed_by "claim"
                     "state_label": ("需求关了（没合并）" if b.get("closed_by") == "claim" else state_label(b.get("state")))
                     if b.get("state") else "",
                     "stuck": b["stuck"] if isinstance(b.get("stuck"), bool) else None,
                     "delivery": str(b["delivery"]) if b.get("delivery") else None,
                     "delivery_label": delivery_label(b.get("delivery")) if b.get("delivery") else "",
                     "parent": str(b.get("parent") or fam.get("parent") or "") or None})
    j = data.get("judgment") if isinstance(data.get("judgment"), dict) else {}
    kinds: dict[tuple, int] = {}
    for k, n in (j.get("by_kind") or {}).items():
        point = "（判断点）" in str(k)
        kind = str(k).split("（", 1)[0]
        kinds[(act_label(kind), point)] = kinds.get((act_label(kind), point), 0) + int(n or 0)
    return {"unattended": _pair(a.get("value")), "judgment": _pair(j.get("value")),
            "kinds": [{"label": lab, "n": n, "point": pt} for (lab, pt), n in sorted(kinds.items(), key=lambda kv: (not kv[0][1], -kv[1]))],
            "runs": runs, "ref": data.get("ref")}


def _week(t: float) -> str:
    d = time.gmtime(t - ((time.gmtime(t).tm_wday) * 86400))
    return "%04d-%02d-%02d" % (d.tm_year, d.tm_mon, d.tm_mday)


def cto_numbers(parts: list[tuple[str, dict[str, Any]]], rows: list[dict[str, Any]], *, available: bool, now: float,
                weeks: int = 12) -> dict[str, Any]:
    """CtoNumbers for the page: the repos' parts added up; credits per requirement from the rows (the sessions this
    app opened); the merges of the last *weeks* weeks, by how they went. Without brainkit.evaluate: the rows only."""
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
            if w in weekly and r["how"] in weekly[w]:
                weekly[w][r["how"]] += 1
    for row in rows:
        if row.get("state") == "merged" and (row.get("repo"), row.get("key")) not in judged and row.get("updated_at"):
            w = _week(float(row["updated_at"]))
            if w in weekly:
                weekly[w]["pending"] += 1
    ref = next((p.get("ref") for _, p in parts if p.get("ref")), None)
    return {"available": bool(available and parts), "sentence": cto_sentence(unattended, stepped, credits),
            "ref": ref, "unattended": unattended, "stepped_in": stepped, "credits": credits, "runs": runs,
            "weekly": list(weekly.values())}


def cto_sentence(unattended: list[int] | None, stepped: dict[str, Any] | None, credits: dict[str, Any]) -> str:
    parts = []
    if unattended and unattended[1]:
        parts.append("交给运行机的 %d 个需求里，%d 个交接以后没人插手就做完了" % (unattended[1], unattended[0]))
    elif unattended is not None:
        parts.append("还没有交给运行机、已经评估完的需求")
    if stepped is not None:
        n = stepped["at_points"] + stepped["outside"]
        parts.append("人介入 %d 次，%d 次落在判断点上" % (n, stepped["at_points"]) if n else "人还没有介入过")
    if credits.get("per_req") is not None:
        parts.append("每个需求平均 %s credits" % credits["per_req"])
    return ("；".join(parts) + "。") if parts else "还没有可以算的数：需求合并以后，这里会说它们是怎么交付的。"

