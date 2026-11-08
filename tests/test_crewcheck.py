"""KiroCrew checks: brain-dev carries Lean's three hooks, the engine is kas, the repo has the hook adapter; the two
fixes run only when asked (a temp HOME and a fake kirocrew CLI here: the live KiroCrew is never touched)."""

import json

from appkit import BRAINKIT, mod
from brainfix import install_brain_dev, make_project, make_service, needs_brainkit, run

pytestmark = needs_brainkit


def levels(rows):
    return [(r["level"], r["text"]) for r in rows]


def test_checks_and_fixes(tmp_path, home):
    repo = make_project(tmp_path)
    (tmp_path / "engine").write_text("kiro\n")
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            first = await svc.crew_checks()
            fixed_agent = await svc.crew_fix("agent")
            fixed_engine = await svc.crew_fix("engine")
            return first, fixed_agent, fixed_engine
        finally:
            await svc.stop()

    first, fa, fe = run(go())
    assert first["fix"] == {"agent": True, "engine": True}
    assert any(l == "FAIL" and "brain-dev.json" in t for l, t in levels(first["rows"]))
    assert any(l == "WARN" and "kiro" in t for l, t in levels(first["rows"]))
    assert fa["ok"] and "装好了" in fa["text"]
    spec = json.loads((home / ".kiro" / "agents" / "brain-dev.json").read_text())
    assert spec == json.loads((BRAINKIT / "crew" / "brain-dev.json").read_text())
    assert fe["ok"] and (tmp_path / "engine").read_text().strip() == "kas"
    assert all(r["level"] == "OK" for r in fe["rows"])


def test_a_different_brain_dev_is_kept_as_a_backup(tmp_path, home):
    repo = make_project(tmp_path)
    p = install_brain_dev(home)
    spec = json.loads(p.read_text())
    spec["description"] = "mine"
    p.write_text(json.dumps(spec))
    cc = mod("crewcheck")
    make_service(tmp_path, [repo]).reload_sync()  # brain-kit loaded, no background tasks
    rows = cc.checks([str(repo)])["rows"]
    assert ("WARN", "brain-dev.json 和 brain-kit 带的版本不一样") in levels(rows)
    assert cc.agent_ok(rows)  # the hooks are there: a drift does not block a session
    text = cc.fix_agent()
    assert "原来的留在" in text and list((home / ".kiro" / "agents").glob("brain-dev.json.bak-*"))


def test_a_repo_without_the_hook_adapter_fails(tmp_path, home):
    repo = make_project(tmp_path)
    (repo / ".kiro" / "brain" / "lean-hook.py").unlink()
    install_brain_dev(home)
    cc = mod("crewcheck")
    make_service(tmp_path, [repo]).reload_sync()
    rows = cc.checks([str(repo)])["rows"]
    assert any(r["level"] == "FAIL" and "lean-hook.py" in r["text"] for r in rows)
