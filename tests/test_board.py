"""需求看板 (GET /board/{repo}/{key}): on real brain-kit projects, the actors' states, their histories for 回放, the
events, the conveyor, the check wall and 验收 — a local requirement waiting for its requirements approval, one approved
and handed over, one merged; the approval line is shown, never sent; the route is the owner's only. And the snapshot
board.build folds from Lean's own records, read the way the page reads it: where the time went (a quiet session waits
for the person, the merge ends the requirement's time), what the check wall counts, who is asked, the one step."""

import json
import subprocess
import time

from appkit import mod
from brainfix import (PY, brain, lean, make_project, make_service, needs_brainkit, request_requirements, run, sh,
                      start_in_worktree)

board = mod("board")


def approve(wt, line):
    """The person types the approval line in the session: Lean's UserPromptSubmit hook records it."""
    p = subprocess.run([PY, ".kiro/aidlc-lean/aidlc_lean.py", "hook", "UserPromptSubmit"], cwd=wt, text=True,
                       capture_output=True, timeout=60,
                       input=json.dumps({"prompt": line, "cwd": str(wt), "session_id": "s-test"}))
    assert p.returncode == 0, p.stderr


def actors(b):
    return {a["key"]: a for a in b["actors"]}


@needs_brainkit
def test_a_local_requirement_waits_for_its_approval_on_the_board(tmp_path, home):
    repo = make_project(tmp_path)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款导出")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    line = request_requirements(wt, intent)
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            return await svc.board("r1", "PAY-1")
        finally:
            await svc.stop()

    b = run(go())
    a = actors(b)
    assert [x["key"] for x in b["actors"]] == ["local", "req", "design", "handover", "bridge", "signer", "runner", "ci",
                                                "release", "reflect"]
    # the requirements approval waits for the person, with the exact line to type (shown, never sent)
    assert a["req"]["status"] == "awaiting_approval" and a["req"]["line"] == line
    assert a["local"]["status"] in ("done", "awaiting_approval", "stalled")
    assert b["person"]["status"] == "awaiting_approval" and b["person"]["owner"] == "alice"
    assert b["accept"]["step"]["line"] == line and b["accept"]["state"] == "not_yet"
    # a repo without GitLab: the runner's half is not on this requirement's way
    assert all(a[k]["status"] == "skipped" for k in ("handover", "bridge", "signer", "runner"))
    assert b["direct"] is True and ["design", "ci"] in b["edges"]
    # the events, in time order, numbered; the stage events are Lean's detail
    kinds = [e["kind"] for e in b["events"]]
    assert "start" in kinds and "request" in kinds and [e["seq"] for e in b["events"]] == list(range(1, len(b["events"]) + 1))
    assert all(e["detail"] for e in b["events"] if e["kind"] == "stage")
    req = next(e for e in b["events"] if e["kind"] == "request")
    assert req["to"] == "req" and req["from"] == "local"
    # the gate's history says when it began to wait: the replay shows it
    assert a["req"]["history"] and a["req"]["history"][-1]["status"] == "awaiting_approval"
    assert a["req"]["spans"] and a["req"]["spans"][-1]["kind"] == "wait" and a["req"]["spans"][-1]["b"] is None
    # the check wall: the requirements gate waits, verify has not run
    cells = {c["id"]: c for c in b["checks"]["cells"]}
    assert cells["gate-REQUIREMENTS"]["status"] == "wait" and cells["verify"]["status"] == "skip"
    assert b["row"]["key"] == "PAY-1" and b["mr_desc"]["available"] in (True, False)
    assert "approve REQUIREMENTS" not in json.dumps(b["events"])  # the line itself only in the gate and the step


@needs_brainkit
def test_an_approved_requirement_handed_over_and_one_merged(tmp_path, home):
    # handed over through GitLab: a remote too (without one a repo is done only on this machine)
    repo = make_project(tmp_path, origin=True, kit={"gitlab": {"base": "https://gitlab.example.com", "project": "shop/pay"}})
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    line = request_requirements(wt, intent)
    approve(wt, line)
    (wt / "src").mkdir(exist_ok=True)
    (wt / "src" / "refund.py").write_text("def refund():\n    return 1\n", encoding="utf-8")
    sh("git", "-C", wt, "add", "-A")
    sh("git", "-C", wt, "commit", "-qm", "refund: the CSV export")
    state = wt / "aidlc-docs" / intent / "aidlc-state.md"
    state.write_text(state.read_text().replace("Status: Inception: starting", "Status: Construction step 2 of 4"))
    sh("git", "-C", wt, "commit", "-qam", "notes")
    brain(wt, "handoff", "--no-push")
    wt2 = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "done", "done", "做完了")
    sh("git", "-C", repo, "merge", "-q", "--no-ff", "-m", "merge PAY-2", "ai/alice/PAY-2-done")
    sh("git", "-C", repo, "push", "-q", "origin", "main")
    sh("git", "-C", repo, "worktree", "remove", "--force", wt2)
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            return await svc.board("r1", "PAY-1"), await svc.board("r1", "PAY-2"), await svc.requirement("r1", "PAY-1")
        finally:
            await svc.stop()

    b1, b2, d1 = run(go())
    a1 = actors(b1)
    assert a1["req"]["status"] == "merged" and a1["req"]["line"] is None
    assert a1["local"]["status"] == "done" and a1["handover"]["status"] == "queued"
    assert a1["bridge"]["status"] == "running"
    ok = next(e for e in b1["events"] if e["kind"] == "approve")
    assert ok["from"] == "person" and ok["to"] == "req"
    if b1["source"] == "trace":
        # the conveyor: the person's commits on the run branch and the hand-over commit
        kinds = [x["kind"] for x in b1["belt"]]
        assert "handover" in kinds and kinds.index("handover") == len(kinds) - 1
        subj = [x["text"] for x in b1["belt"] if x["kind"] == "commit"]
        assert any("refund: the CSV export" in s for s in subj)
        assert any(e["kind"] == "handover" and e["to"] == "handover" for e in b1["events"])
        # BOARD-21: each commit with the files it changed, as git says it
        export = next(x for x in b1["belt"] if x["kind"] == "commit" and "refund: the CSV export" in x["text"])
        assert {"path": "src/refund.py", "added": 2, "removed": 0, "status": "A"} in export["changes"]
        # the sources brain-kit could not read, in words, said the same on the board and in 需求详情 (DETAIL-6)
        assert b1["missing"] and b1["missing"] == d1["timeline"]["missing"]
        assert not any(w in json.dumps(b1["missing"]) for w in ("ledger", "--", "not given"))
    cells = {c["id"]: c for c in b1["checks"]["cells"]}
    assert cells["gate-REQUIREMENTS"]["status"] == "pass" and cells["bridge"]["status"] == "wait"
    a2 = actors(b2)
    assert b2["row"]["state"] == "merged" and b2["accept"]["state"] == "merged"
    if b2["source"] == "trace":
        assert b2["ended_at"] is not None and any(e["kind"] == "merge" for e in b2["events"])
        assert all(a2[k]["status"] in ("merged", "skipped") for k in ("local", "req", "design", "ci", "release")), \
            sorted((k, a2[k]["status"], a2[k]["doing"]) for k in a2 if a2[k]["status"] not in ("merged", "skipped"))
        # a merged requirement that never went to the runner: its runner half is skipped
        assert all(a2[k]["status"] == "skipped" for k in ("handover", "bridge", "signer", "runner"))
    text = json.dumps([b1, b2])
    assert "glpat-" not in text and "gitlab_token" not in text.lower() and "@example" not in text  # no secret, no email


@needs_brainkit
def test_an_idle_session_waits_since_one_moment_and_a_claim_has_nothing_to_trace(tmp_path, home):
    """The row (交付总览, 待办) and the board say one moment the session went quiet: not before Lean's last step, even
    when KiroCrew reported only the kickoff's time. A requirement only claimed has no run: no error on its board
    (BOARD-6)."""
    from brainfix import FakeGateway, install_brain_dev
    repo = make_project(tmp_path)
    install_brain_dev(home)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款")
    brain(repo, "claim", "--title", "只认领")
    gw = FakeGateway()
    gw.templates = {"brain-dev"}
    svc = make_service(tmp_path, [repo], gw=gw)

    async def go():
        await svc.start()
        try:
            await svc.open_session("r1", "PAY-1")
            gw.finish(next(iter(gw.slot_rows)))
            for _ in range(6):
                await svc.sessions.poll()
            lean(wt, "stage", "skip", "reverse-engineering", "--reason", "greenfield")
            svc.repos["r1"].invalidate()
            rows = {r["key"]: r for r in (await svc.overview("all"))["rows"]}
            return rows, await svc.board("r1", "PAY-1"), await svc.board("r1", "PAY-2")
        finally:
            await svc.stop()

    rows, b, claimed = run(go())
    w = rows["PAY-1"]["waits"]
    assert (w["who"], w["do"]) == ("you", "reply")
    assert w["since"] > time.time() - 600          # the Lean step just now, not the transcript's 2026-11-08 stamp
    local = actors(b)["local"]
    assert local["status"] == "awaiting_approval" and local["since"] == w["since"] == b["row"]["waits"]["since"]
    assert local["history"][-1]["who"] == "you"            # the replay says whose turn each wait was
    assert claimed["row"]["state"] == "claimed" and claimed["error"] == "" and claimed["source"] == "app"


@needs_brainkit
def test_the_board_route_is_the_owners_only_and_checks_its_path(tmp_path):
    """Only the dashboard's owner gets a board (never an app token), and a bad repo id or key is refused before anything
    runs (test_skeleton checks every route the same way; this one is named here)."""
    import asyncio
    from types import SimpleNamespace

    import backend.routes as routes
    from http_fakes import FakeRequest, FakeWeb

    class Route:
        def __init__(self, method, path, handler):
            self.method, self.path, self.handler = method, path, handler

    def handler(owner):
        svc = routes.service.Service(SimpleNamespace(name="brain", logger=None, data_dir=str(tmp_path / "data")))
        r = {(x.method, x.path): x.handler for x in routes.handlers.build_routes(svc, Route, web=FakeWeb(),
                                                                                  is_owner=lambda _r: owner)}
        return r[("GET", "/board/{repo}/{key}")]

    def call(h, **req):
        return asyncio.run(h(FakeRequest(**req), None))

    h = handler(False)
    assert call(h, user=None).status == 401
    assert call(h, app="brain").status == 403
    assert call(h).status == 403
    h = handler(True)
    resp = call(h, match_info={"repo": "../etc", "key": "PAY-1"})
    assert resp.status == 404 and resp.body["code"] == "no_repo"
    resp = call(h, match_info={"repo": "r1", "key": "pay-1; rm"})
    assert resp.status == 400 and resp.body["code"] == "invalid_key"


# ---------------------------------------------------------------- the fold, on Lean's own records

T = 1794185486.0   # DEMO-3's claim (2026-11-09 08:51:25 +08)
M, H = 60, 3600
SESSION = "sess_3ac8"


def iso(t):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def ev(at, event, **data):
    return {"event": event, "ts": iso(at), "_at": at, "data": data}


def turn(at, n, **data):
    return ev(at, "HUMAN_TURN", session=SESSION, turn=n, chars=4, **data)


def demo3_events():
    """DEMO-3 as Lean recorded it: the app's kickoff, the person's answer to Q1 and Q2, the approval line, then code,
    a green verify; nothing after 09:07."""
    return [ev(T + 1, "STAGE_STARTED", stage="requirements"), ev(T + 21, "SESSION_START", session=SESSION),
            turn(T + 22, 1), ev(T + 4 * M, "STAGE_STARTED", stage="reverse-engineering"),
            ev(T + 4 * M + 30, "STAGE_COMPLETED", stage="reverse-engineering"), turn(T + 6 * M + 17, 2),
            ev(T + 9 * M + 12, "STAGE_COMPLETED", stage="requirements"),
            ev(T + 9 * M + 16, "STAGE_SKIPPED", stage="user-stories", reason="只有一类用户"),
            ev(T + 9 * M + 24, "STAGE_SKIPPED", stage="application-design", reason="Size: small"),
            ev(T + 9 * M + 50, "APPROVAL_REQUESTED", kind="REQUIREMENTS", sha256="dfc1969f" * 8),
            turn(T + 11 * M + 2, 3), ev(T + 11 * M + 2.2, "APPROVED", kind="REQUIREMENTS", sha256="dfc1969f" * 8),
            ev(T + 11 * M + 30, "STAGE_SKIPPED", stage="functional-design", unit="app", reason="没有新实体"),
            ev(T + 11 * M + 47, "STAGE_STARTED", stage="code-generation", unit="app"),
            ev(T + 14 * M + 4, "STAGE_COMPLETED", stage="code-generation", unit="app"),
            ev(T + 14 * M + 13, "VERIFY", ok=True, results=[{"cmd": "python3 -m unittest discover -s tests", "exit": 0}]),
            ev(T + 14 * M + 13, "STAGE_COMPLETED", stage="build-and-test")]


STAGES = [{"id": sid, "label": label, "n": n, "state": st} for n, (sid, label, st) in enumerate((
    ("reverse-engineering", "逆向工程", "done"), ("requirements", "需求分析", "done"), ("user-stories", "用户故事", "skipped"),
    ("application-design", "应用设计", "skipped"), ("units", "拆分单元", "skipped"),
    ("functional-design", "功能设计", "skipped"), ("nfr-design", "非功能设计", "skipped"),
    ("infrastructure-design", "基础设施设计", "skipped"), ("code-generation", "代码生成", "done"),
    ("build-and-test", "构建测试", "done"), ("release", "发布", "todo")), 1)]


def facts(events, *, key="DEMO-3", owner="ychchen", run=True, handoff=None, merged=False, approvals=(), park=None,
          state_text=None):
    r = {"key": key, "owner": owner, "branch": "ai/%s/%s-x" % (owner, key), "intent": "261109-x", "created_at": iso(T + 1)}
    if handoff:
        r["handoff"] = handoff
    return {"key": key, "owner": owner, "claim": {"owner": owner, "title": "计算器乘法", "created_at": iso(T)},
            "run": r if run else None, "branch": r["branch"] if run else None, "events": events, "merged": merged,
            "approvals": list(approvals), "stages": STAGES if run else [], "park": park, "state_text": state_text,
            "tip_at": None}


def row_of(state, who, text, **waits):
    return {"key": "DEMO-3", "state": state, "waits": dict({"who": who, "text": text, "line": None, "raw": ""}, **waits),
            "lean": {"stage": "release" if state != "claimed" else None, "done": 10, "total": 11}, "mr": None,
            "run_ids": []}


def snapshot(f, row, *, t=None, sessions=(), me="ychchen", now=T + 11.5 * H, local_only=True, mr=None,
             app_events=(), reflect_refs=(), brain_=None, team_decisions=(), changes=None):
    return board.build(f, row, t, mr=mr, sessions=list(sessions), app_events=list(app_events),
                       team_decisions=list(team_decisions), subjects={}, reflect_refs=list(reflect_refs),
                       default_branch="main", local_only=local_only, kit_rows=[], decisions=[], brain=brain_, me=me, now=now,
                       changes=changes)


def session(last, busy=False, awaiting=False):
    return {"slot": "brain-r1-demo-3-1", "url": "/chat?sid=brain-r1-demo-3-1", "kind": "local", "busy": busy,
            "awaiting": awaiting, "last_activity": last, "credits": 36.954}


def actor(b, key):
    return next(a for a in b["actors"] if a["key"] == key)


def spent(b, kinds, end):
    """Seconds of the actors' spans of *kinds*, an open one drawn to *end* (as 需求详情's 时间花在哪 draws it)."""
    return sum((s["b"] if s["b"] is not None else end) - s["a"] for a in b["actors"] for s in a["spans"] if s["kind"] in kinds)


def test_a_quiet_session_waits_for_the_person_from_its_last_message_not_works_on():
    """DEMO-3 (UI问题清单 #2): the AI worked about 15 minutes, then its session sat quiet for eleven hours. The board
    says the session waits for the person since its last message, and the hours are waiting, not AI work."""
    last = T + 15 * M + 43   # the session's last message, 09:07:08
    b = snapshot(facts(demo3_events()), row_of("local", "you", "会话空着：轮到你回话"), sessions=[session(last)])
    local = actor(b, "local")
    assert local["status"] == "awaiting_approval" and local["since"] == last
    assert local["spans"][-1] == {"a": last, "b": None, "kind": "wait"}
    assert all(s["b"] is not None and s["b"] <= last for s in local["spans"] if s["kind"] != "wait")
    assert not b["live"]
    now = T + 11.5 * H
    assert spent(b, ("work", "fix"), now) < 16 * M
    assert spent(b, ("wait",), now) > 11 * H
    # the person's own reply in the session is a person's act; the kickoff and the approval line are not replies
    assert [e["text"] for e in b["events"] if e["kind"] == "answer"] == ["你在会话里回话了"]


def test_a_reply_after_a_long_quiet_does_not_turn_the_quiet_into_ai_work():
    """The person answers the next morning: the night is still a wait, and the AI works from the reply on."""
    reply = T + 24 * H
    evs = demo3_events() + [turn(reply, 4), ev(reply + 20 * M, "STAGE_STARTED", stage="release")]
    b = snapshot(facts(evs), row_of("local", "agent", "AI 在做"), sessions=[session(reply + 20 * M, busy=True)],
                 now=reply + 30 * M)
    local = actor(b, "local")
    assert local["status"] == "running" and b["live"]
    assert spent(b, ("work", "fix"), reply + 30 * M) < 16 * M + 30 * M
    assert any(s["kind"] == "wait" and s["a"] <= T + 16 * M and s["b"] == reply for s in local["spans"])


def test_the_idle_step_says_what_to_say_next_and_where():
    """BOARD-4: an idle session's one step names Lean's next stage, gives the line to copy, and opens the session."""
    notes = ("## Session notes\nStatus: done\n### Next\n1. owner 开一个新会话做审查（这个会话写了代码，不能自己审）。"
             "对新会话说：「审查 intent 261109-x：看 `git diff 5d331b4..HEAD`」。\n### Open questions and blockers\n- 无\n")
    last = T + 15 * M + 43
    b = snapshot(facts(demo3_events(), state_text=notes), row_of("local", "you", "会话空着：轮到你回话"),
                 sessions=[session(last)])
    step = b["accept"]["step"]
    assert step["who"] == "你" and step["session_url"] == "/chat?sid=brain-r1-demo-3-1" and step["mr_url"] is None
    assert "下一步是「发布」" in step["text"] and "你开一个新会话做审查" in step["text"]
    # the line for the new session is Lean's own review line, the one 开审查会话 sends: the session that wrote the code
    # does not word its reviewer's task
    review = "Review intent 261109-x against its requirements, design and plans, using the diff, and write " \
             "construction/build-and-test/review.md."
    assert step["line"] == review
    assert "`" not in step["text"] + step["line"] and "owner" not in step["text"]
    # without Lean's notes it still says what to do: the review first, then the release
    b = snapshot(facts(demo3_events()), row_of("local", "you", "会话空着：轮到你回话"), sessions=[session(last)])
    assert "先开一个新会话做审查" in b["accept"]["step"]["text"] and b["accept"]["step"]["line"] == review
    reviewed = dict(facts(demo3_events()), review={"at": None})
    b = snapshot(reviewed, row_of("local", "you", "会话空着：轮到你回话"), sessions=[session(last)])
    assert "在会话里让它接着做「发布」" in b["accept"]["step"]["text"] and b["accept"]["step"]["line"] == "接着做下一步：发布"


def test_a_design_lean_skipped_is_not_needed_and_the_wall_says_what_is_still_to_come():
    """BOARD-3, BOARD-12, DETAIL-19: past code generation without a DESIGN or PLAN request the design approval is not on
    the way; the wall counts what happened and names the release approval still to come; no citation is no check."""
    b = snapshot(facts(demo3_events()), row_of("local", "you", "会话空着：轮到你回话"), sessions=[session(T + 16 * M)],
                 t={"brain": {"loaded": 5, "cited": [], "stale": [], "unknown": []}})
    design = actor(b, "design")
    assert design["status"] == "skipped" and design["doing"].startswith("这次不需要")
    cells = {c["id"]: c for c in b["checks"]["cells"]}
    assert cells["gate-DESIGN"]["status"] == "not_needed"
    assert "brain-cite" not in cells
    w = b["checks"]
    assert (w["passed"], w["failed"], w["total"], w["todo"]) == (2, 0, 2, ["发布审批"])
    assert b["accept"]["checks"] == "目前 2 项都过 · 还剩 发布审批"
    assert "自动检查通过（1 项）" in [e["text"] for e in b["events"] if e["kind"] == "verify"]


def merged_trace(merged_at, window_end):
    return {"brain": {"loaded": 3, "cited": ["T-1"], "stale": [], "unknown": []},
            "humans": [{"at": iso(T + 11 * M), "kind": "approval", "what": "RELEASE", "who": "G-3F2A1C", "channel": "local"}],
            "outcome": {"merged_at": {"value": iso(merged_at), "how": "merge commit", "commit": "c" * 40},
                        "reverted_or_hotfixed_within_14d": {"value": None, "window_end": iso(window_end)}}}


def test_the_merge_ends_the_requirements_time_and_its_14_days_are_watched_not_waited():
    """DETAIL-2, BOARD-13: nothing after the merge is this requirement's time (the write-back waits fifteen hours after
    it); the 14 days after it are watched, nobody's turn, and still to come."""
    merged_at = T + 20 * M
    evs = demo3_events() + [ev(T + 15 * M, "APPROVAL_REQUESTED", kind="RELEASE", sha256="ab" * 32),
                            ev(T + 16 * M, "APPROVED", kind="RELEASE", sha256="ab" * 32)]
    b = snapshot(facts(evs, merged=True), row_of("merged", "nobody", "已合并"), sessions=[session(T + 17 * M)],
                 t=merged_trace(merged_at, merged_at + 14 * 86400), brain_={"proposals": 2},
                 app_events=[{"at": iso(merged_at + 15 * H), "label": "回写 Brain：成功", "detail": "brain/DEMO-3-reflect-1"}],
                 reflect_refs=[("brain/DEMO-3-reflect-1", merged_at + 15 * H, None)], now=merged_at + 2 * 86400)
    assert b["ended_at"] == merged_at
    assert all(s["b"] is not None and s["b"] <= merged_at for a in b["actors"] for s in a["spans"])
    cells = {c["id"]: c for c in b["checks"]["cells"]}
    assert cells["after-14d"]["status"] == "watch" and cells["after-14d"]["detail"].startswith("观察中")
    # watched is not still to come: nothing is left, one cell is watched
    assert b["checks"]["todo"] == [] and b["checks"]["passed"] == b["checks"]["total"]
    assert b["accept"]["checks"] == "目前 %d 项都过 · 1 项在观察" % b["checks"]["passed"]
    # one write-back, one event
    assert [e["text"] for e in b["events"] if e["kind"] == "reflect"] == ["回写 Brain：成功（回写分支 brain/DEMO-3-reflect-1）"]
    # the owner approved the release in their own session: they are named, never a pseudonym
    assert b["accept"]["done"]["who"] == "ychchen"
    # DETAIL-25: the write-back branch waits to be merged, then it is in the default branch
    assert (actor(b, "reflect")["status"], actor(b, "reflect")["doing"]) == ("done", "回写 Brain：成功（回写分支 brain/DEMO-3-reflect-1）")
    b = snapshot(facts(evs, merged=True), row_of("merged", "nobody", "已合并"), t=merged_trace(merged_at, merged_at + 14 * 86400),
                 brain_={"proposals": 2}, reflect_refs=[("brain/DEMO-3-reflect-1", merged_at + 15 * H, merged_at + 16 * H)],
                 now=merged_at + 2 * 86400)
    a = actor(b, "reflect")
    assert (a["status"], a["doing"], a["since"]) == ("merged", "回写分支 brain/DEMO-3-reflect-1 已合并", merged_at + 16 * H)


def test_the_replay_knows_whose_turn_each_wait_was():
    """A release asked on the MR after the hand-over waits for the product, not for you: each history entry of a wait
    says whom it is on, as Waits.who does."""
    hand = T + 16 * M
    evs = demo3_events() + [ev(T + 40 * M, "APPROVAL_REQUESTED", kind="RELEASE", sha256="cd" * 32)]
    b = snapshot(facts(evs, handoff={"requested_at": iso(hand), "by": "ychchen"}),
                 row_of("acceptance", "product", "等产品在 MR 上验收 D-3（approve / reject）", do="accept"),
                 local_only=False, now=T + 2 * H)
    waits = [(h["doing"], h["who"]) for h in actor(b, "release")["history"] if h["status"] == "awaiting_approval"]
    assert waits and all(who == "product" for _, who in waits) and waits[0][0] == "等产品在 MR 上批准发布"
    assert [h["who"] for h in actor(b, "req")["history"] if h["status"] == "awaiting_approval"] == ["you"]
    assert (actor(b, "release")["title"], actor(b, "release")["sub"]) == ("发布验收", "发布审批 · 验收")


def test_a_repo_done_only_here_has_no_runner_half_and_reads_no_runner_sources():
    """#5 (BOARD-9, DETAIL-6): no remote, so the runner's half is 这次不需要, says nothing, and its sources are not missing."""
    b = snapshot(facts(demo3_events()), dict(row_of("local", "you", "会话空着：轮到你回话"), local_only=True),
                 sessions=[session(T + 16 * M)], local_only=False,
                 t={"missing": ["bridge ledger (--ledger not given)", "vouchers (--vouchers not given and no intake store)",
                                "pushes (git keeps no push log; person commits after hand-over stand in for them)",
                                "CI pipelines (GitLab, not readable here)", "credits (not passed in)"]})
    for k in ("handover", "bridge", "signer", "runner"):
        a = actor(b, k)
        assert a["status"] == "skipped" and a["doing"].startswith("这次不需要") and a["facts"] == []
    assert not [c for c in b["checks"]["cells"] if c["group"] == "handover"]
    assert b["missing"] == ["花费：KiroCrew 还没报 credits"]
    # nobody accepts it on an MR: its release is Lean's approval, named so on the graph and the lanes
    assert (actor(b, "release")["title"], actor(b, "release")["sub"]) == ("发布审批", "Lean 请人批发布")


def test_someone_elses_requirement_names_them_and_a_question_for_the_product_is_not_yours():
    """BOARD-11, BOARD-5, BOARD-8: carol's requirement, read by alice, says carol approved; parked on D-2 for the
    product, the owner's node does not ask for anyone here and the step is on the MR, not a line in a session."""
    hand = T + 30 * M
    evs = demo3_events()[:12]
    f = facts(evs, owner="carol", handoff={"requested_at": iso(hand), "by": "carol"})
    mr = {"url": "https://gitlab.example.com/p/-/merge_requests/41",
          "questions": [{"id": "D-2", "kind": "clarify", "state": "open", "at": iso(hand + H),
                         "options": [{"id": "A", "text": "按商户"}, {"id": "B", "text": "按门店"}]}]}
    row = dict(row_of("parked", "product", "等回答 D-2（澄清）"), mr={"iid": 41, "url": mr["url"], "state": "opened"})
    b = snapshot(f, row, me="alice", mr=mr, local_only=False, now=hand + 3 * H)
    text = json.dumps(b, ensure_ascii=False)
    assert "carol 批准了需求" in [e["text"] for e in b["events"]] and "你批准了" not in text
    assert b["person"]["status"] != "awaiting_approval" and b["person"]["me"] is False
    step = b["accept"]["step"]
    assert step["who"] == "产品" and step["text"].startswith("在 MR 上回答 D-2（A / B）")
    assert step["mr_url"] == mr["url"] and step["line"] is None and step["session_url"] is None
    assert "在会话里" not in step["text"]
    # the team runner's board of it, whoever reads it (or nobody known), names carol too
    for me in ("alice", None):
        b = snapshot(f, dict(row, where="runner", repo="runner"), me=me, mr=mr, local_only=False, now=hand + 3 * H)
        assert "carol 批准了需求" in [e["text"] for e in b["events"]], (me, [e["text"] for e in b["events"]])


def test_a_claim_not_started_says_since_when_and_to_start_it():
    """#3 (BOARD-6): a claim only: the session's node says since the claim, the step is to start this very key."""
    b = snapshot(facts([], run=False), row_of("claimed", "you", "认领了，还没开工"), now=T + 12 * H)
    local = actor(b, "local")
    assert local["status"] == "waiting" and local["since"] == T and local["facts"] == []
    assert b["accept"]["step"]["text"] == "认领了，还没开工：在开需求里开工 DEMO-3"
    b = snapshot(facts([], run=False, owner="carol"), row_of("claimed", "people", "已认领，还没开工"), me="alice")
    assert b["accept"]["step"]["text"] == "carol 认领的，等 carol 开工"


def test_each_commit_on_the_conveyor_carries_the_files_it_changed(tmp_path):
    """BOARD-21: git's own answer to the board's one log call (board.GIT_LOG), read back: each commit's files with
    their status and lines, a rename as R under its new name; the merge has none."""
    g = ["git", "-C", str(tmp_path), "-c", "user.email=a@example.com", "-c", "user.name=a"]
    subprocess.run(g[:3] + ["init", "-q"], check=True)
    (tmp_path / "keep.py").write_text("a\nb\n")
    (tmp_path / "old.py").write_text("x\ny\nz\n")
    (tmp_path / "gone.py").write_text("gone\n")
    subprocess.run(g + ["add", "-A"], check=True)
    subprocess.run(g + ["commit", "-qm", "one"], check=True)
    (tmp_path / "keep.py").write_text("a\nB\nc\n")
    subprocess.run(g + ["mv", "old.py", "new.py"], check=True)
    subprocess.run(g + ["rm", "-q", "gone.py"], check=True)
    (tmp_path / "add.py").write_text("n\n")
    subprocess.run(g + ["add", "-A"], check=True)
    subprocess.run(g + ["commit", "-qm", "two: 改"], check=True)
    shas = subprocess.run(g + ["rev-list", "HEAD"], capture_output=True, text=True, check=True).stdout.split()
    log = subprocess.run(g + list(board.GIT_LOG) + shas, capture_output=True, text=True, check=True).stdout
    assert board.subjects_from_log(log) == {shas[0]: "two: 改", shas[1]: "one"}
    got = board.changes_from_log(log)
    assert sorted(got[shas[0]], key=lambda c: c["path"]) == [
        {"path": "add.py", "added": 1, "removed": 0, "status": "A"},
        {"path": "gone.py", "added": 0, "removed": 1, "status": "D"},
        {"path": "keep.py", "added": 2, "removed": 1, "status": "M"},
        {"path": "new.py", "added": 0, "removed": 0, "status": "R"}]
    assert {c["path"] for c in got[shas[1]]} == {"keep.py", "old.py", "gone.py"}
    t = merged_trace(T + 20 * M, T + 15 * 86400)
    t["actions"] = {"commits": [{"sha": shas[0], "at": iso(T + 5 * M), "by": "person", "files": 4}]}
    b = snapshot(facts(demo3_events(), merged=True), row_of("merged", "nobody", "已合并"), t=t, changes=got)
    belt = {x["kind"]: x for x in b["belt"]}
    assert belt["commit"]["changes"] == got[shas[0]] and belt["merge"]["changes"] == []


def test_the_replay_says_what_the_session_is_doing_while_it_works():
    """A stage done inside another (逆向工程 inside 需求分析) leaves the session at work on the outer one: the replay
    never shows 「做完…」 for a session at work; the progress itself is the KPI's, not a lane fact."""
    b = snapshot(facts(demo3_events()), row_of("local", "you", "会话空着：轮到你回话"), sessions=[session(T + 16 * M)])
    local = actor(b, "local")
    running = [h["doing"] for h in local["history"] if h["status"] == "running"]
    assert "在做：需求分析" in running[running.index("在做：逆向工程") + 1:]
    assert not [d for d in running if d.startswith("做完")]
    assert not [x for x in local["facts"] if x.startswith("Lean")]


def test_a_gate_history_stays_in_time_order_with_no_repeats_under_a_later_plan():
    """Measured on PAY-3's replay: the approved DESIGN was said again at its own time after a later PLAN request, so
    设计审批 read 已批准 during the first plan's wait, and the second plan's wait was listed twice."""
    d, p1, p2 = T + 1 * H, T + 2 * H, T + 5 * H
    req = lambda at, kind, h, **u: ev(at, "APPROVAL_REQUESTED", kind=kind, sha256=h * 64, **u)  # noqa: E731
    ok = lambda at, kind, h, **u: ev(at, "APPROVED", kind=kind, sha256=h * 64, **u)  # noqa: E731
    evs = [req(T + 30 * M, "DESIGN", "a"), ok(d, "DESIGN", "a"), req(p1 - 20 * M, "PLAN", "b", unit="export"),
           ok(p1, "PLAN", "b", unit="export"), req(p2, "PLAN", "c", unit="api")]
    approvals = [{"kind": k, "unit": u, "state": st, "sha8": h * 8, "at": at, "line": line, "path": None}
                 for k, u, st, h, at, line in (("DESIGN", None, "approved", "a", d, None),
                                               ("PLAN", "export", "approved", "b", p1, None),
                                               ("PLAN", "api", "pending", "c", p2, "approve PLAN cccccccc"))]
    b = snapshot(facts(evs, approvals=approvals),
                 row_of("local", "you", "等你批准 api 的代码生成计划：读完再在会话里自己打那一行", do="approve"), now=p2 + H)
    design = actor(b, "design")
    h = design["history"]
    assert [x["at"] for x in h] == sorted(x["at"] for x in h)
    assert len({(x["at"], x["status"]) for x in h}) == len(h)
    assert (h[-1]["status"], h[-1]["at"], design["line"]) == ("awaiting_approval", p2, "approve PLAN cccccccc")
    during_first_plan = [x for x in h if x["at"] <= p1 - 10 * M][-1]
    assert during_first_plan["status"] == "awaiting_approval"


def test_a_push_without_its_label_waits_on_the_person_not_on_the_runner():
    """DETAIL-1 (PAY-10): pushed, but the MR has no hand-over label, so nothing was handed over. The hours since are
    the person's to label it, not the bridge or the runner at work."""
    hand = T + 30 * M
    f = facts(demo3_events()[:12], handoff={"requested_at": iso(hand), "by": "ychchen"})
    row = row_of("handed_over", "you", "推上去了，但 MR 上没有交接标签：什么也没交出去。看一眼 MR，再交接一次",
                 do="label_handoff", since=hand)
    now = hand + 7 * H + 46 * M
    b = snapshot(f, row, local_only=False, now=now)
    runners = [s for a in b["actors"] if a["key"] in ("handover", "bridge", "signer", "runner") for s in a["spans"]
               if s["kind"] == "work"]
    assert runners == [], runners
    assert spent(b, ("wait",), now) >= 7 * H + 46 * M
    assert actor(b, "handover")["history"][-1]["who"] == "you"


def test_a_question_the_runner_asks_on_the_mr_waits_on_whom_park_json_asks_as_the_row_says():
    """Preview r1/PAY-2: after the hand-over the runner's 澄清 asks the owner (park.json's ask), yet the replay said
    等别人 to the owner. Each wait on the runner's side is on whom the row's waits would name (deliveries.classify):
    park.json's ask, the owner being 你 only to the owner; the bridge's D-n asks whom its park.json asks; a code
    generation plan asked of the builder on the MR waits for the builder."""
    hand, q_at, plan_at = T + 30 * M, T + 90 * M, T + 3 * H
    plan = "PLAN " + "b" * 8

    def trace(ask):
        return {"actions": {"questions": [
            {"at": iso(q_at), "kind": "clarify", "ask": ask, "status": "waiting", "lean_request": None},
            {"at": iso(q_at + 40 * M), "kind": "clarify", "ask": ask, "status": "answered", "lean_request": None},
            {"at": iso(plan_at + M), "kind": "plan", "ask": "builder", "status": "waiting", "lean_request": plan}]},
            "decisions": [{"source": "bridge", "id": "D-1", "kind": "clarify", "state": "delivered",
                           "asked_at": iso(q_at + M), "at": iso(q_at + 30 * M), "choice": "A"}]}

    evs = demo3_events()[:12] + [ev(plan_at, "APPROVAL_REQUESTED", kind="PLAN", unit="api", sha256="b" * 64)]
    f = facts(evs, handoff={"requested_at": iso(hand), "by": "ychchen"})
    row = row_of("parked", "builder", "等开发的人在 MR 上回答 D-2（approve / reject）", do="answer", where="mr")

    def waits(b, key):
        return [(h["doing"], h["who"]) for h in actor(b, key)["history"] if h["status"] == "awaiting_approval"]

    b = snapshot(f, row, t=trace("owner"), local_only=False, now=plan_at + H)
    assert waits(b, "runner")[:2] == [("停下问你：澄清", "you"), ("停下问你：澄清（D-1）", "you")]
    assert {"停下问你：澄清", "D-1 在 MR 上问你：澄清"} <= {e["text"] for e in b["events"]}
    assert waits(b, "design")[-1] == ("等开发的人在 MR 上批准代码生成计划", "builder")
    assert "请开发的人在 MR 上批准代码生成计划" in [e["text"] for e in b["events"]]
    b = snapshot(f, row, t=trace("owner"), me="alice", local_only=False, now=plan_at + H)
    assert waits(b, "runner")[:2] == [("停下问 ychchen：澄清", "people"), ("停下问 ychchen：澄清（D-1）", "people")]
    b = snapshot(f, row, t=trace("product"), local_only=False, now=plan_at + H)
    assert waits(b, "runner")[:2] == [("停下问产品：澄清", "product"), ("停下问产品：澄清（D-1）", "product")]


def test_the_board_says_the_bridges_refusal_the_repos_kit_and_what_it_could_not_read_in_words():
    """REST-29: the bridge's English reason for a refused hand-over is said as the MR's is; the kit's cells are named
    in words (适配 for the hook adapter, as brain-kit's own line tells, 记录 for Lean counting runs/ as code), never a
    glob; a source it could not read is said without its file name; an event's source says what record it is."""
    hand = T + 30 * M
    t = {"actions": {"handovers": [{"at": iso(hand + 2 * M), "kind": "bridge rejected", "reason": "MR comes from a fork"}]},
         "missing": ["Lean audit (no aidlc-docs/audit/*.jsonl in worktree)", "aidlc-docs/261109-x/decisions.md (not in worktree)",
                     "runs/DEMO-3/run.json: intent is not a string (ignored)"]}
    rows = [{"level": "FAIL", "text": ".kiro/brain/lean-hook.py 是旧版（第 1 版，要第 2 版）", "todo": "点「重装 kit 文件」",
             "repo": "/r", "raw": ".kiro/brain/lean-hook.py is an older adapter (version 1, needs 2)"},
            {"level": "FAIL", "text": "Lean 把 runs/ 下的记录算成代码", "todo": "点「重装 kit 文件」", "repo": "/r", "raw": ""},
            {"level": "FAIL", "text": "仓库根目录没有 AGENTS.md", "todo": "点「重装 kit 文件」", "repo": "/r",
             "raw": "AGENTS.md at repo root"}]
    f = facts(demo3_events()[:12], handoff={"requested_at": iso(hand), "by": "ychchen"})
    b = board.build(f, row_of("rejected", "you", "接手被拒：MR 是从复制出去的仓库开的", do="redo_handoff"), t, mr=None,
                    sessions=[], app_events=[], team_decisions=[], subjects={}, reflect_refs=[], default_branch="main",
                    local_only=False, kit_rows=board.kit_cells(rows, "/r"), decisions=[], brain=None, me="ychchen",
                    now=hand + H)
    assert "桥拒绝接手：MR 是从复制出去的仓库开的" in [e["text"] for e in b["events"]]
    assert [c["label"] for c in b["checks"]["cells"] if c["id"].startswith("kit")] == ["适配", "记录", "kit 文件"]
    assert b["missing"] == ["Lean 的记录：这个需求的分支上没有，阶段和审批都看不到", "决定记录：AI 还没写下决定",
                            "开工记录里有一项格式不对，没用上"]
    assert {e["kind"]: e["src"] for e in b["events"] if e["src"]} == {
        "claim": "认领记录 claim/DEMO-3", "start": "开工记录 runs/DEMO-3/run.json"}


def test_a_write_back_branch_says_when_it_was_merged_into_the_default_branch(tmp_path):
    """DETAIL-25: brain/<KEY>-reflect-<n> fast-forwarded into main is merged at its own time, one merged with a merge
    commit at that commit's, and one still waiting is not merged."""
    from appkit import commit_file, git_repo, sh
    svc = mod("service")
    repo = git_repo(tmp_path / "r")
    commit_file(repo, "a.md", "a\n", "init")
    for n, how in ((1, "ff"), (2, "merge"), (3, "wait")):
        sh("git", "-C", repo, "checkout", "-q", "-b", "brain/DEMO-3-reflect-%d" % n, "main")
        commit_file(repo, "b%d.md" % n, "b\n", "Brain: DEMO-3 reflect %d" % n)
        sh("git", "-C", repo, "checkout", "-q", "main")
        if how == "ff":
            sh("git", "-C", repo, "merge", "-q", "--ff-only", "brain/DEMO-3-reflect-1")
        elif how == "merge":
            commit_file(repo, "c.md", "c\n", "main moves on")
            sh("git", "-C", repo, "merge", "-q", "--no-ff", "-m", "merge reflect 2", "brain/DEMO-3-reflect-2",
               env={"GIT_COMMITTER_DATE": "2030-01-01T00:00:00Z", "GIT_AUTHOR_DATE": "2030-01-01T00:00:00Z"})
    git = mod("repo").Git(repo)
    got = {ref: (at, merged) for ref, at, merged in svc.Service._reflect_refs(git, "DEMO-3", "main")}
    assert got["brain/DEMO-3-reflect-1"][1] == got["brain/DEMO-3-reflect-1"][0]
    assert got["brain/DEMO-3-reflect-2"][1] == 1893456000.0
    assert got["brain/DEMO-3-reflect-3"][1] is None
