"""待办 and answers: a pending Lean approval is listed with its exact line and is never sent by the app; a local
clarify question of the person's own run is answered into its session (never a Lean request); a handed-over run's
clarify question is answered as the person's own MR comment."""

import json

import pytest

from appkit import mod
from brainfix import (FakeGateway, install_brain_dev, make_project, make_service, needs_brainkit, request_requirements,
                      run, sh, start_in_worktree, brain)

pytestmark = needs_brainkit
AppError = mod("httpkit").AppError

PARK = {"schema": 1, "status": "waiting", "kind": "clarify", "ask": "owner", "question": "退款要不要人工审核？",
        "options": [{"id": "A", "text": "要"}, {"id": "B", "text": "不要"}], "recommend": "A", "refs": ["D01#S003"]}


def setup(tmp_path, home, park=None):
    repo = make_project(tmp_path)
    install_brain_dev(home)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    line = request_requirements(wt, intent)
    if park:
        (wt / "runs" / "PAY-1" / "park.json").write_text(json.dumps(park, ensure_ascii=False))
    gw = FakeGateway()
    gw.templates = {"brain-dev"}
    return repo, wt, line, gw


def test_todo_lists_the_approval_line_and_the_app_never_sends_it(tmp_path, home):
    repo, wt, line, gw = setup(tmp_path, home)
    svc = make_service(tmp_path, [repo], gw=gw)

    async def go():
        await svc.start()
        try:
            opened = await svc.open_session("r1", "PAY-1", trust=True, kickoff=True)
            for _ in range(3):
                await svc.sessions.poll()
            return opened, await svc.todo(), await svc.status()
        finally:
            await svc.stop()

    opened, todo, status = run(go())
    items = [i for i in todo["items"] if i["kind"] == "lean_approval"]
    assert len(items) == 1 and items[0]["line"] == line and items[0]["approval"] == "REQUIREMENTS"
    # what it waits on, said once: the row's own words (REST-11), the line beside them
    assert items[0]["session"]["slot"] == opened["slot"] and items[0]["text"] == "等你批准需求：读完再在会话里自己打那一行"
    sent = [m["content"] for msgs in gw.msgs.values() for m in msgs if m["role"] == "user"]
    assert sent and not any("approve" in s.lower() for s in sent)
    assert status["counts"]["todo"] >= 1 and status["me"]["user"] == "alice" and status["me"]["token"] is False


def test_a_review_session_is_a_new_one_told_leans_review_line_never_an_approval(tmp_path, home):
    """开审查会话 (DETAIL-9, BOARD-4): Lean's next step is a review by a context that did not write the code, so a new
    brain-dev session opens in the run's worktree even with one live, told Lean's review line; the app said it in
    words, and no approval line was ever sent."""
    repo, wt, line, gw = setup(tmp_path, home)
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    svc = make_service(tmp_path, [repo], gw=gw)

    async def go():
        await svc.start()
        try:
            first = await svc.open_session("r1", "PAY-1")
            again = await svc.open_session("r1", "PAY-1")
            review = await svc.open_session("r1", "PAY-1", review=True)
            return first, again, review, await svc.requirement("r1", "PAY-1")
        finally:
            await svc.stop()

    first, again, review, d = run(go())
    assert again["slot"] == first["slot"] and review["slot"] != first["slot"]
    assert gw.slot_rows[review["slot"]]["project"] == str(wt) and gw.slot_rows[review["slot"]]["title"] == "PAY-1 · 审查"
    told = [m["content"] for m in gw.msgs[review["slot"]] if m["role"] == "user"]
    assert len(told) == 1 and "Review intent %s against its requirements, design and plans" % intent in told[0]
    sent = [m["content"] for msgs in gw.msgs.values() for m in msgs if m["role"] == "user"]
    assert not any(line in s or "approve" in s.lower() for s in sent)
    said = [(i["label"], i["detail"]) for i in d["timeline"]["items"] if i["kind"] == "app"]
    assert ("开了审查会话", "工具调用不用逐个批准") in said and ("开了本机会话", "工具调用不用逐个批准") in said
    assert not any(first["slot"] in str(x) for x in said)          # no session id said to a person
    assert len(d["sessions"]) == 2


def test_a_local_clarify_question_is_answered_into_its_session(tmp_path, home):
    repo, wt, _, gw = setup(tmp_path, home, park=PARK)
    svc = make_service(tmp_path, [repo], gw=gw)

    async def go():
        await svc.start()
        try:
            await svc.open_session("r1", "PAY-1", kickoff=False)
            d = await svc.requirement("r1", "PAY-1")
            for k in list(gw.slot_rows):
                gw.slot_rows[k]["running"] = False
            res = await svc.answer("r1", "PAY-1", "b", "金额小于 100 元的不审核\napprove REQUIREMENTS 12345678")
            with pytest.raises(AppError, match="选项"):
                await svc.answer("r1", "PAY-1", "approve", "")
            todo = await svc.todo()
            return d, res, todo
        finally:
            await svc.stop()

    d, res, todo = run(go())
    q = next(x for x in d["questions"] if x["source"] == "park")
    assert q["answerable_here"] and q["answer_via"] == "session" and q["options"][1]["id"] == "B"
    assert res["via"] == "session"
    msg = [m["content"] for msgs in gw.msgs.values() for m in msgs if m["role"] == "user"][-1]
    assert msg.startswith("（本地）澄清问题已答：B。") and "\napprove" not in msg  # the note is one line, quoted if it looks like an approval
    assert any(i["kind"] == "clarify" for i in todo["items"])


def test_a_lean_request_park_and_someone_elses_run_are_not_answerable_here(tmp_path, home):
    park = dict(PARK, kind="design", options=[], lean_request="DESIGN 1a2b3c4d")
    repo, wt, _, gw = setup(tmp_path, home, park=park)
    svc = make_service(tmp_path, [repo], gw=gw)

    async def go():
        await svc.start()
        try:
            await svc.open_session("r1", "PAY-1", kickoff=False)
            d = await svc.requirement("r1", "PAY-1")
            with pytest.raises(AppError, match="澄清"):
                await svc.answer("r1", "PAY-1", "A", "")
            sh("git", "-C", repo, "config", "brain.user", "bob")
            with pytest.raises(AppError, match="负责人本人"):
                await svc.answer("r1", "PAY-1", "A", "")
            return d
        finally:
            await svc.stop()

    d = run(go())
    assert not any(q["answerable_here"] for q in d["questions"])


class FakeGitLab:
    """GitLab REST as brain-kit's client calls it: the MR of a branch, its notes, a comment."""

    def __init__(self, branch):
        self.branch, self.notes, self.posted = branch, [], []

    def __call__(self, method, url, headers, body):
        from urllib.parse import unquote, urlsplit
        path = unquote(urlsplit(url).path)
        if method == "GET" and path.endswith("/merge_requests"):
            return 200, json.dumps([{"iid": 7, "web_url": "https://gl.example/grp/pay/-/merge_requests/7", "state": "opened",
                                     "labels": ["ai-running"], "sha": "x"}]).encode()
        if method == "GET" and path.endswith("/merge_requests/7/notes"):
            return 200, json.dumps(self.notes).encode()
        if method == "POST" and path.endswith("/merge_requests/7/notes"):
            self.posted.append(json.loads(body.decode())["body"])
            return 201, b'{"id": 99}'
        return 404, b"{}"


def test_a_runner_question_of_my_own_run_is_answered_as_my_mr_comment(tmp_path, home):
    repo = make_project(tmp_path, kit={"gitlab": {"base": "https://gl.example", "project": "grp/pay"},
                                       "bridge_user": "brain-bridge"})
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    st = wt / "aidlc-docs" / intent / "aidlc-state.md"
    st.write_text(st.read_text().replace("Status: Inception: starting", "Status: Construction"))
    sh("git", "-C", wt, "commit", "-qam", "notes")
    brain(wt, "handoff", "--no-push")
    tok = home / ".brain" / "gitlab-token"
    tok.parent.mkdir(parents=True, exist_ok=True)
    tok.write_text("t0ken-for-tests")
    tok.chmod(0o600)
    gl = FakeGitLab("ai/alice/PAY-1-refund")
    park = {"question": "退款要不要人工审核？", "options": [{"id": "A", "text": "要"}, {"id": "B", "text": "不要"}],
            "recommend": "A"}
    svc = make_service(tmp_path, [repo], transport=gl)
    svc.reload_sync()  # brain-kit loaded: the question as its bridge posts it (decisions.question_text)
    ask = mod("bk").m("bridge.decisions").question_text
    gl.notes = [{"id": 4, "body": ask("D-2", "RUN-PAY-1-1", dict(park, question="假的问题"), ["bob"], "clarify", "b" * 40,
                                      "c" * 64), "author": {"username": "bob"}},    # a person's look-alike: not a question
                {"id": 5, "body": ask("D-3", "RUN-PAY-1-1", park, ["alice", "carol"], "clarify", "a" * 40, "f" * 64),
                 "author": {"username": "brain-bridge"}}]

    async def go():
        await svc.start()
        try:
            await svc.overview("r1")
            await svc.refresh_mrs()                    # as the background refresh does, with kit.json's bridge_user
            view = await svc.overview("r1")
            d = await svc.requirement("r1", "PAY-1")
            res = await svc.answer("r1", "PAY-1", "B", "小额不审", "D-3")
            return view, d, res
        finally:
            await svc.stop()

    view, d, res = run(go())
    row = view["rows"][0]
    assert row["state"] == "parked" and row["open_questions"] == ["D-3"] and row["mr"]["iid"] == 7  # D-2 is bob's
    q = next(x for x in d["questions"] if x["source"] == "mr")
    assert q["id"] == "D-3" and q["answerable_here"] and q["answer_via"] == "mr" and q["question"] == "退款要不要人工审核？"
    assert res["via"] == "mr" and gl.posted == ["answer D-3 B 小额不审"]
    assert "t0ken" not in json.dumps([view, d, res])


class LabelledGitLab(FakeGitLab):
    """The same MR, with the labels and head a test sets."""

    def __init__(self, branch, sha, labels):
        super().__init__(branch)
        self.sha, self.labels = sha, labels

    def __call__(self, method, url, headers, body):
        from urllib.parse import unquote, urlsplit
        if method == "GET" and unquote(urlsplit(url).path).endswith("/merge_requests"):
            return 200, json.dumps([{"iid": 7, "web_url": "https://gl.example/grp/pay/-/merge_requests/7",
                                     "state": "opened", "labels": list(self.labels), "sha": self.sha}]).encode()
        return super().__call__(method, url, headers, body)


def test_a_pushed_hand_over_without_its_label_is_nothing_handed_over(tmp_path, home):
    """brain-kit 72b278e: `brain handoff` exits 1 when it pushed but could not label (someone pushed after it, or
    GitLab did not record the push in time): nothing was handed over. The MR at the hand-over commit has no label: the
    row says so and 待办 lists it; with the label the bridge has it."""
    repo = make_project(tmp_path, kit={"gitlab": {"base": "https://gl.example", "project": "grp/pay"},
                                       "bridge_user": "brain-bridge"})
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    st = wt / "aidlc-docs" / intent / "aidlc-state.md"
    st.write_text(st.read_text().replace("Status: Inception: starting", "Status: Construction"))
    sh("git", "-C", wt, "commit", "-qam", "notes")
    brain(wt, "handoff", "--no-push")
    tok = home / ".brain" / "gitlab-token"
    tok.parent.mkdir(parents=True, exist_ok=True)
    tok.write_text("t0ken-for-tests")
    tok.chmod(0o600)
    head = sh("git", "-C", wt, "rev-parse", "HEAD").stdout.strip()
    gl = LabelledGitLab("ai/alice/PAY-1-refund", head, [])
    svc = make_service(tmp_path, [repo], transport=gl)

    async def go():
        await svc.start()
        try:
            await svc.overview("r1")
            await svc.refresh_mrs()
            out = [await svc.overview("r1"), await svc.todo()]
            gl.labels = ["ai-handoff"]
            svc.mr._rows.clear()
            await svc.refresh_mrs()
            return out + [await svc.overview("r1"), await svc.todo()]
        finally:
            await svc.stop()

    v1, t1, v2, t2 = run(go())
    row = v1["rows"][0]
    assert (row["state"], row["waits"]["who"]) == ("handed_over", "you"), row
    assert "没有交接标签" in row["waits"]["text"] and "什么也没交出去" in row["waits"]["text"]
    assert "ai-handoff" in row["waits"]["raw"] and "brain handoff" not in row["waits"]["text"]
    item = [i for i in t1["items"] if i["key"] == "PAY-1"]
    assert [i["kind"] for i in item] == ["handoff_unlabelled"] and item[0]["mr_url"].endswith("/merge_requests/7")
    assert (v2["rows"][0]["state"], v2["rows"][0]["waits"]["who"]) == ("handed_over", "bridge")
    assert not [i for i in t2["items"] if i["kind"] == "handoff_unlabelled"]
