"""The UI's fixtures (ui/src/test/fixtures/*.json, typed against ui/src/types.ts at compile time) have exactly the
keys the backend answers with, recursively: the page is tested on the shapes it will get."""

import json

from appkit import ROOT
from brainfix import (install_brain_dev, make_project, make_service, needs_brainkit, request_requirements, run, sh,
                      start_in_worktree, FakeGateway, brain)

pytestmark = needs_brainkit
FIX = ROOT / "ui" / "src" / "test" / "fixtures"


def fixture(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def diff_keys(fix, real, path="", skip=()):
    if path in skip or fix is None or real is None:
        return []
    out = []
    if isinstance(fix, dict) and isinstance(real, dict):
        a, b = set(fix), set(real)
        if a != b:
            out.append("%s: only in the fixture %s, only in the backend %s" % (path or "/", sorted(a - b), sorted(b - a)))
        for k in a & b:
            out += diff_keys(fix[k], real[k], "%s.%s" % (path, k), skip)
    elif isinstance(fix, list) and isinstance(real, list) and fix and isinstance(fix[0], dict):
        for r in real:
            out += diff_keys(fix[0], r, path + "[]", skip)
    return out


def scenario(tmp_path, home):
    repo = make_project(tmp_path)
    install_brain_dev(home)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款", "--paths", "src/pay")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    request_requirements(wt, intent)
    dec = wt / "aidlc-docs" / intent / "decisions.md"
    dec.write_text(dec.read_text() + "| D-2 | 2026-11-08 | requirements | 按 T-PAY-1-2 | Brain | agent |\n\n"
                   "```brain-proposal\nfile: TECH\ntype: pitfall\nrel: new\nsrc: D-2\n---\n对账按自然日。\n```\n")
    (wt / "runs" / "PAY-1" / "park.json").write_text(json.dumps({
        "schema": 1, "status": "waiting", "kind": "clarify", "ask": "owner", "question": "要不要人工审核？",
        "options": [{"id": "A", "text": "要"}], "recommend": "A", "refs": []}))
    start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "report", "report", "报表", "--paths", "src/pay/r")
    brain(repo, "claim", "--title", "只认领")
    gw = FakeGateway()
    gw.templates = {"brain-dev"}
    return repo, gw


def test_the_backend_answers_with_the_fixtures_keys(tmp_path, home):
    repo, gw = scenario(tmp_path, home)
    svc = make_service(tmp_path, [repo], gw=gw)
    docs = tmp_path / "doc.md"
    docs.write_text("# 需求\n- AC-1\n")

    async def go():
        await svc.start()
        try:
            await svc.open_session("r1", "PAY-1")
            gw.finish(next(iter(gw.slot_rows)))
            for _ in range(6):
                await svc.sessions.poll()
            body = {"repo": "r1", "slug": "x", "title": "x", "docs": [str(docs)], "consent": True,
                    "classification": "internal", "business": "", "exclude": []}
            return {
                "status.json": await svc.status(), "settings.json": svc.settings_view(),
                "overview.json": await svc.overview("all"), "detail.json": await svc.requirement("r1", "PAY-1"),
                "board.json": await svc.board("r1", "PAY-1"),
                "todo.json": await svc.todo(), "brain.json": await svc.brain("r1"),
                "intake-next.json": await svc.intake_next("r1"), "intake-check.json": await svc.intake_check(body),
                "crew.json": await svc.crew_checks(), "reflect-preview.json": await svc.reflect_preview("r1", "PAY-1"),
                "start.json": await svc.intake_start(dict(body, slug="y", title="y", docs=[], paths=[], open_session=True,
                                                          trust=True)),
            }
        finally:
            await svc.stop()

    got = run(go())
    problems = []
    for name, real in got.items():
        problems += ["%s %s" % (name, p) for p in diff_keys(fixture(name), json.loads(json.dumps(real)))]
    assert not problems, "\n".join(problems)
    assert got["detail.json"]["sessions"] and got["detail.json"]["decisions"] and got["todo.json"]["items"]
    assert got["overview.json"]["counts"].keys() == fixture("overview.json")["counts"].keys()
    assert got["overview.json"]["cto"].keys() == fixture("overview.json")["cto"].keys()
    board = got["board.json"]
    assert [a["key"] for a in board["actors"]] == [a["key"] for a in fixture("board.json")["actors"]]
    assert board["events"] and board["checks"]["cells"] and board["accept"]["state"]


def test_the_import_routes_answer_with_the_fixtures_keys(tmp_path, home, monkeypatch):
    """导入仓库's answers (ui/src/test/fixtures/import-*.json): defaults, a 检查 before and after the install (pending),
    the clone and install jobs as the page polls them (on a new branch, and in place), the push and MR (a fake GitLab, a
    token made at run time), 「合并到 main」, 「拉取」, 推送, the choices of a kit update, and the kit fix's job (POST
    /import/upgrade) on a repo whose kit on main is older."""
    import secrets

    from test_import import KIT, FakeGitLab, plain_repo
    from test_upgrade import older_kit
    repo, bare = plain_repo(tmp_path, "refund")
    team, _ = plain_repo(tmp_path, "orders")
    shop = older_kit(tmp_path, name="shop")
    svc = make_service(tmp_path, [], transport=FakeGitLab())

    async def go():
        await svc.start()
        try:
            out = {"import-defaults.json": await svc.import_defaults(),
                   "import-inspect.json": await svc.import_inspect({"path": str(repo)})}
            job = (await svc.import_clone({"url": str(bare), "parent": str(home / "workplace"), "name": "copy"}))["job"]
            out["import-clone-job.json"] = await svc.wait_job(job["id"])
            job = (await svc.import_install({"path": str(repo), "kit": dict(KIT, gitlab_project="grp/pay")}))["job"]
            out["import-job.json"] = await svc.wait_job(job["id"])
            out["import-inspect-pending.json"] = await svc.import_inspect({"path": str(repo)})
            p = out["import-inspect-pending.json"]["pending"]
            monkeypatch.setenv("GITLAB_TOKEN", "fake-" + secrets.token_hex(8))
            out["import-publish.json"] = await svc.import_publish({"path": str(repo), "branch": p["branch"],
                                                                   "target": p["target"], "remote_url": p["remote_url"]})
            out["import-merge.json"] = await svc.import_merge({"path": str(repo), "confirm": True})
            out["import-push.json"] = await svc.import_push({"path": str(repo), "branch": "main",
                                                             "remote_url": p["remote_url"]})
            out["import-pull.json"] = await svc.import_pull({"path": str(repo)})
            job = (await svc.import_install({"path": str(team), "kit": KIT, "mode": "inplace"}))["job"]
            out["import-inplace-job.json"] = await svc.wait_job(job["id"])
            out["import-choices.json"] = await svc.import_choices({"path": str(shop), "purpose": "upgrade"})
            job = (await svc.import_upgrade({"path": str(shop)}))["job"]
            out["import-upgrade-job.json"] = await svc.wait_job(job["id"])
            return out
        finally:
            await svc.stop()

    got = run(go())
    assert got["import-job.json"]["state"] == "done" and got["import-publish.json"]["mr"]
    assert got["import-upgrade-job.json"]["state"] == "done" and got["import-upgrade-job.json"]["result"]["changed"]
    assert got["import-merge.json"]["ok"] and got["import-push.json"]["pushed"] and got["import-pull.json"]["ok"]
    assert got["import-inplace-job.json"]["result"]["mode"] == "inplace" and got["import-choices.json"]["options"]
    assert got["import-inspect.json"]["install"] and got["import-inspect-pending.json"]["pending"]["merge"]
    problems = []
    for name, real in got.items():
        problems += ["%s %s" % (name, p) for p in diff_keys(fixture(name), json.loads(json.dumps(real)))]
    assert not problems, "\n".join(problems)
