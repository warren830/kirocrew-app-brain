"""开需求: the five gates' dry run (brain-kit's findings verbatim), the start in its own worktree, the brain-dev
session (strict agent, in the worktree, a kickoff of ids only), and the refusals."""

import json

import pytest

from appkit import mod
from brainfix import FakeGateway, install_brain_dev, make_project, make_service, needs_brainkit, run

pytestmark = needs_brainkit
AppError = mod("httpkit").AppError


def docs(tmp_path):
    d = tmp_path / "需求文档"
    d.mkdir()
    (d / "退款需求.md").write_text("# 退款\n\n联系人：13812345678\n单笔退款不超过 1,000,000 元。\n\n- AC-1 能退款\n",
                                   encoding="utf-8")
    return d


def body(tmp_path, **kw):
    b = {"repo": "r1", "slug": "refund", "title": "退款", "docs": [str(docs(tmp_path))], "consent": True,
         "classification": "internal", "business": "", "exclude": []}
    b.update(kw)
    return b


def test_the_dry_run_lists_every_finding_verbatim_and_what_would_stop_the_start(tmp_path, home):
    repo = make_project(tmp_path)
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            nxt = await svc.intake_next("r1")
            first = await svc.intake_check(body(tmp_path))
            fixed = await svc.intake_check(dict(body(tmp_path / "b"), business="mask"))
            unsure = await svc.intake_check(dict(body(tmp_path / "c"), business="mask", classification="unsure"))
            no_consent = await svc.intake_check(dict(body(tmp_path / "d"), consent=False))
            return nxt, first, fixed, unsure, no_consent
        finally:
            await svc.stop()

    (tmp_path / "b").mkdir(), (tmp_path / "c").mkdir(), (tmp_path / "d").mkdir()
    nxt, first, fixed, unsure, no_consent = run(go())
    assert nxt == {"repo": "r1", "key": "PAY-1", "tracker": "none", "prefix": "PAY", "error": ""}
    assert first["ok"] is False and any(b.startswith("门 3：") for b in first["blocking"])
    assert first["findings"] and first["findings"][0].startswith("- **D01 ")
    assert fixed["ok"] is True and not fixed["blocking"] and "个人信息（已打码）" in fixed["findings"][0]
    assert fixed["package"] == "PKG-PAY-1-1" and fixed["classification"] == "internal" and fixed["segments"] >= 1
    assert unsure["ok"] is False and any(b.startswith("门 2：") for b in unsure["blocking"])
    assert no_consent["error"].startswith("门 1")
    assert "13812345678" not in json.dumps([first, fixed])  # the masked value never comes back


def test_start_makes_a_worktree_runs_brain_start_and_opens_brain_dev_there(tmp_path, home):
    repo = make_project(tmp_path)
    install_brain_dev(home)
    gw = FakeGateway()
    gw.templates = {"brain-dev"}
    svc = make_service(tmp_path, [repo], gw=gw)

    async def go():
        await svc.start()
        try:
            out = await svc.intake_start(dict(body(tmp_path, business="mask"), paths=["src/pay"], open_session=True,
                                              trust=True))
            view = await svc.overview("r1")
            again = await svc.open_session("r1", out["key"])
            return out, view, again
        finally:
            await svc.stop()

    out, view, again = run(go())
    assert out["ok"] and out["key"] == "PAY-1" and out["branch"] == "ai/alice/PAY-1-refund"
    wt = home / "workplace" / "brain-app" / "pay" / "refund"
    assert out["worktree"] == str(wt) and (wt / "runs" / "PAY-1" / "run.json").exists()
    assert "Started PAY-1 on ai/alice/PAY-1-refund" in out["output"]
    rec = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())
    assert rec["materials"][0]["package"] == "PKG-PAY-1-1" and rec["expected_paths"] == ["src/pay"]
    assert (home / ".brain" / "intake" / "packages" / "PKG-PAY-1-1").is_dir()  # materials stay out of the repo
    assert not list(repo.glob("**/PKG-PAY-1-1/segments"))  # (the read-only copy lives in the worktree's ignored dir)
    assert out["slot"] and out["url"] == "/chat?sid=%s" % out["slot"] and not out["session_error"]
    assert ("agent", "brain-dev", "template") in gw.calls
    assert gw.slot_rows[out["slot"]]["project"] == str(wt) and gw.slot_rows[out["slot"]]["trust"]
    folders = [c[1] for c in gw.calls if c[0] == "folder"]
    assert folders == ["Brain 需求", "PAY-1 · refund"]
    kick = gw.msgs[out["slot"]][0]["content"]
    assert "PAY-1" in kick and "PKG-PAY-1-1" in kick and "approve" not in kick.lower() and "退款" not in kick
    row = {r["key"]: r for r in view["rows"]}["PAY-1"]
    assert row["state"] == "local" and row["sessions"] == 1 and row["worktree"] == str(wt)
    assert again["slot"] == out["slot"]  # a live session is reused, not opened twice


def test_no_session_without_brain_dev_carrying_leans_hooks(tmp_path, home):
    repo = make_project(tmp_path)
    (home / ".kiro" / "agents" / "brain-dev.json").write_text(json.dumps({"name": "brain-dev", "hooks": {}}))
    gw = FakeGateway()
    svc = make_service(tmp_path, [repo], gw=gw)

    async def go():
        await svc.start()
        try:
            return await svc.intake_start(dict(body(tmp_path, business="mask"), paths=[], open_session=True, trust=True))
        finally:
            await svc.stop()

    out = run(go())
    assert out["ok"] and out["slot"] is None and "hook" in out["session_error"]
    assert not gw.slot_rows


def test_a_missing_brain_dev_template_fails_closed_instead_of_crews_default_agent(tmp_path, home):
    repo = make_project(tmp_path)
    install_brain_dev(home)
    gw = FakeGateway()
    gw.templates = set()  # KiroCrew does not have it
    svc = make_service(tmp_path, [repo], gw=gw)

    async def go():
        await svc.start()
        try:
            return await svc.intake_start(dict(body(tmp_path, business="mask"), paths=[], open_session=True, trust=True))
        finally:
            await svc.stop()

    out = run(go())
    assert out["ok"] and out["slot"] is None and "brain-dev" in out["session_error"]
    assert not any(c[0] == "agent" and c[1] == "" for c in gw.calls) and not gw.slot_rows


def test_expected_paths_as_a_list_or_one_string(tmp_path, home):
    """Live regression 2026-11-09: the start API refused "paths": "calc.py,tests". A list or one string separated by
    commas, spaces or new lines is accepted; brain start gets them comma separated."""
    intake = mod("intake")
    assert intake.expected_paths("calc.py,tests") == ["calc.py", "tests"]
    assert intake.expected_paths(" src/pay  tests\ndocs，src/pay、x.py ") == ["src/pay", "tests", "docs", "x.py"]
    assert intake.expected_paths(["src/my module", "tests"]) == ["src/my module", "tests"]   # a list item is one path
    assert intake.expected_paths(None) == [] and intake.expected_paths("") == [] and intake.expected_paths([]) == []
    for bad in ({"a": 1}, ["a", 2], 7):
        with pytest.raises(intake.IntakeError, match="paths"):
            intake.expected_paths(bad)
    repo = make_project(tmp_path)
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            out = await svc.intake_start({"repo": "r1", "slug": "calc", "title": "计算", "docs": [], "consent": False,
                                          "classification": "", "business": "", "exclude": [],
                                          "paths": "calc.py,tests", "open_session": False})
            with pytest.raises(AppError, match="相对路径"):
                await svc.intake_start({"repo": "r1", "slug": "abs", "title": "x", "docs": [], "paths": "/etc,x",
                                        "open_session": False})
            return out
        finally:
            await svc.stop()

    out = run(go())
    assert out["ok"], out["output"]
    wt = home / "workplace" / "brain-app" / "pay" / "calc"
    assert json.loads((wt / "runs" / out["key"] / "run.json").read_text())["expected_paths"] == ["calc.py", "tests"]


def test_form_errors(tmp_path, home):
    repo = make_project(tmp_path)
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            with pytest.raises(AppError, match="英文短名"):
                await svc.intake_start(dict(body(tmp_path), slug="退款"))
            with pytest.raises(AppError, match="绝对路径"):
                await svc.intake_start(dict(body(tmp_path / "x"), docs=["relative.md"]))
            with pytest.raises(AppError, match="PAY-"):
                await svc.intake_start(dict(body(tmp_path / "y"), key="OMS-1"))
            with pytest.raises(AppError, match="相对路径"):
                await svc.intake_start(dict(body(tmp_path / "z"), paths=["../etc"]))
        finally:
            await svc.stop()

    for d in ("x", "y", "z"):
        (tmp_path / d).mkdir()
    run(go())


def test_what_may_be_a_name_is_listed_under_review(tmp_path, home):
    """brain-kit 72b278e: a value that looks like a name (or a password) but may as well be a word is neither masked
    nor refused: findings.md lists it for the submitter (请你确认). The check lists it per file on its own as well, and
    it stops nothing."""
    repo = make_project(tmp_path)
    d = tmp_path / "需求"
    d.mkdir()
    (d / "退款需求.md").write_text("# 退款\n\n对接人：张三李四\n\n- AC-1 能退款\n", encoding="utf-8")
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            return await svc.intake_check(dict(body(tmp_path / "x"), docs=[str(d)]))
        finally:
            await svc.stop()

    (tmp_path / "x").mkdir()
    got = run(go())
    assert got["ok"] is True and got["blocking"] == [], got
    assert len(got["review"]) == 1 and got["review"][0].startswith("D01 需求/退款需求.md：请你确认 1 处（"), got["review"]
    assert "「对接人：张三李四」" in got["review"][0] and got["review"][0] in got["findings"][0].replace("**：", "：")
    assert "请你确认" in got["findings"][0]                                  # brain-kit's line, verbatim
