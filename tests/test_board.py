"""需求看板 (GET /board/{repo}/{key}) on real brain-kit projects: the actors' states, their histories for 回放, the
events, the conveyor, the check wall and 验收 — a local requirement waiting for its requirements approval, one approved
and handed over, one merged; the approval line is shown, never sent; the route is the owner's only."""

import json
import subprocess

from brainfix import (PY, brain, lean, make_project, make_service, needs_brainkit, request_requirements, run, sh,
                      start_in_worktree)

pytestmark = needs_brainkit


def approve(wt, line):
    """The person types the approval line in the session: Lean's UserPromptSubmit hook records it."""
    p = subprocess.run([PY, ".kiro/aidlc-lean/aidlc_lean.py", "hook", "UserPromptSubmit"], cwd=wt, text=True,
                       capture_output=True, timeout=60,
                       input=json.dumps({"prompt": line, "cwd": str(wt), "session_id": "s-test"}))
    assert p.returncode == 0, p.stderr


def actors(b):
    return {a["key"]: a for a in b["actors"]}


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


def test_an_approved_requirement_handed_over_and_one_merged(tmp_path, home):
    repo = make_project(tmp_path, kit={"gitlab": {"base": "https://gitlab.example.com", "project": "shop/pay"}})
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
    sh("git", "-C", repo, "worktree", "remove", "--force", wt2)
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            return await svc.board("r1", "PAY-1"), await svc.board("r1", "PAY-2")
        finally:
            await svc.stop()

    b1, b2 = run(go())
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
