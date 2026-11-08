"""KiroCrew checks: brain-dev carries Lean's three hooks (in either spec format Kiro writes, next to other tools' hooks),
the engine is kas, the repo has Lean and the hook adapter committed; the two fixes run only when asked, and the agent
fix only adds Lean's missing hooks (a temp HOME and a fake kirocrew CLI here: the live KiroCrew is never touched)."""

import json

import pytest

from appkit import BRAINKIT, mod
from brainfix import install_brain_dev, make_project, make_service, needs_brainkit, run, sh

pytestmark = needs_brainkit

ORCA = ("if [ -f '/Users/x/.orca/agent-hooks/kiro-hook.sh' ] && command -v sh >/dev/null 2>&1; "
        "then /bin/sh '/Users/x/.orca/agent-hooks/kiro-hook.sh'; else exit 0; fi")
UPGRADE = {"revision": 2, "fingerprint": "sha256:" + "a" * 64, "source": "sha256:" + "b" * 64}
LEAN = {"agentSpawn": "SessionStart", "userPromptSubmit": "UserPromptSubmit", "preToolUse": "PreToolUse"}


def levels(rows):
    return [(r["level"], r["text"]) for r in rows]


def lean_cmd(trigger):
    return "python3 .kiro/brain/lean-hook.py %s" % LEAN[trigger]


def loaded(tmp_path):
    """crewcheck with brain-kit loaded (no repos, no background tasks)."""
    make_service(tmp_path, []).reload_sync()
    return mod("crewcheck")


def kiro_spec(hooks):
    """brain-kit's brain-dev as Kiro rewrites it: its keys in Kiro's order, the given hooks, kiroUpgrade last."""
    src = json.loads((BRAINKIT / "crew" / "brain-dev.json").read_text(encoding="utf-8"))
    return {"name": src["name"], "description": src["description"], "prompt": src["prompt"], "mcpServers": {},
            "tools": src["tools"], "toolAliases": {}, "allowedTools": [], "resources": src["resources"],
            "hooks": hooks, "toolsSettings": {}, "model": src["model"], "kiroUpgrade": dict(UPGRADE)}


def list_hooks(lean_triggers):
    """The list format: Lean's hooks for *lean_triggers*, Orca's under agentSpawn, userPromptSubmit and preToolUse."""
    out, seen = [], {}
    for t in ("agentSpawn", "userPromptSubmit", "preToolUse"):
        for cmd in ([lean_cmd(t)] if t in lean_triggers else []) + [ORCA]:
            h = {"name": "%s-%d" % (t, seen.get(t, 0)), "trigger": t, "action": {"type": "command", "command": cmd},
                 "timeout": 10}
            if t == "preToolUse":
                h["matcher"] = "*"
            seen[t] = seen.get(t, 0) + 1
            out.append(h)
    return out


def write_spec(home, spec):
    p = home / ".kiro" / "agents" / "brain-dev.json"
    p.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return p


def backups(home):
    return sorted((home / ".kiro" / "agents").glob("brain-dev.json.bak-*"))


def agent_row(rows):
    found = [r for r in rows if "brain-dev" in r["text"]]
    assert len(found) == 1, rows
    return found[0]


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


def test_a_different_brain_dev_with_leans_hooks_is_left_alone(tmp_path, home):
    repo = make_project(tmp_path)
    p = install_brain_dev(home)
    spec = json.loads(p.read_text())
    spec["description"] = "mine"
    spec["prompt"] = "my own prompt"
    p.write_text(json.dumps(spec))
    before = p.read_bytes()
    cc = mod("crewcheck")
    make_service(tmp_path, [repo]).reload_sync()  # brain-kit loaded, no background tasks
    got = cc.checks([str(repo)])
    assert levels(got["rows"])[0] == ("OK", "brain-dev 带着 Lean 的三个 hook")
    assert not [r for r in got["rows"] if r["level"] != "OK"]  # no drift warning: only Lean's hooks matter
    assert got["fix"]["agent"] is False and cc.agent_ok(got["rows"])
    assert "什么都没改" in cc.fix_agent()
    assert p.read_bytes() == before and not backups(home)


def test_a_repo_without_the_hook_adapter_in_git_fails(tmp_path, home):
    repo = make_project(tmp_path)
    sh("git", "-C", repo, "rm", "-q", "--cached", ".kiro/brain/lean-hook.py")
    sh("git", "-C", repo, "commit", "-q", "-m", "adapter only on this disk")
    assert (repo / ".kiro" / "brain" / "lean-hook.py").exists()  # on disk is not enough: worktrees come from main
    install_brain_dev(home)
    cc = mod("crewcheck")
    make_service(tmp_path, [repo]).reload_sync()
    rows = cc.checks([str(repo)])["rows"]
    probs = mod("bk").m("cli").runner_kit_problems(str(repo))
    assert len(probs) == 1 and ".kiro/brain/lean-hook.py is not committed" in probs[0]
    assert ("FAIL", "仓库 pay：" + probs[0]) in levels(rows)
    assert cc.agent_ok(rows)  # the repo's problem does not make brain-dev unusable


def test_kiros_list_format_with_orca_gets_only_the_missing_lean_hooks(tmp_path, home):
    p = write_spec(home, kiro_spec(list_hooks({"agentSpawn"})))
    before, raw = json.loads(p.read_text(encoding="utf-8")), p.read_bytes()
    cc = loaded(tmp_path)
    got = cc.checks([])
    row = agent_row(got["rows"])
    assert row["level"] == "FAIL" and "发消息" in row["text"] and "调用工具前" in row["text"]
    assert "会话开始" not in row["text"]
    assert got["fix"]["agent"] is True and not cc.agent_ok(got["rows"])

    text = cc.fix_agent()
    assert "补上了" in text and "发消息" in text and "调用工具前" in text and "原来的留在 brain-dev.json.bak-" in text
    after = json.loads(p.read_text(encoding="utf-8"))
    assert list(after) == list(before)  # every key kept, in Kiro's order
    assert {k: v for k, v in after.items() if k != "hooks"} == {k: v for k, v in before.items() if k != "hooks"}
    assert after["kiroUpgrade"] == UPGRADE
    assert isinstance(after["hooks"], list) and after["hooks"][:len(before["hooks"])] == before["hooks"]
    added = after["hooks"][len(before["hooks"]):]
    assert [(h["trigger"], h["action"]["command"]) for h in added] == [
        ("userPromptSubmit", lean_cmd("userPromptSubmit")), ("preToolUse", lean_cmd("preToolUse"))]
    assert sum(1 for h in after["hooks"] if h["action"]["command"] == ORCA) == 3  # Orca's hooks are all there
    assert [b.read_bytes() for b in backups(home)] == [raw]

    again = cc.checks([])
    assert agent_row(again["rows"]) == {"level": "OK", "text": "brain-dev 带着 Lean 的三个 hook（另有 3 个别的 hook，留着不动）"}
    assert again["fix"]["agent"] is False and cc.agent_ok(again["rows"])
    fixed = p.read_bytes()
    assert "什么都没改" in cc.fix_agent()
    assert p.read_bytes() == fixed and len(backups(home)) == 1


def test_kiros_list_format_with_leans_hooks_and_orcas_is_ok(tmp_path, home):
    p = write_spec(home, kiro_spec(list_hooks(set(LEAN))))
    raw = p.read_bytes()
    cc = loaded(tmp_path)
    got = cc.checks([])
    assert agent_row(got["rows"])["level"] == "OK"
    assert not [r for r in got["rows"] if r["level"] != "OK"]
    assert got["fix"] == {"agent": False, "engine": False} and cc.agent_ok(got["rows"])
    assert "什么都没改" in cc.fix_agent()
    assert p.read_bytes() == raw and not backups(home)


def test_the_dict_format_gets_only_the_missing_hook_in_the_dict_format(tmp_path, home):
    orca = {"command": ORCA, "timeout_ms": 5000}
    hooks = {"agentSpawn": [{"command": lean_cmd("agentSpawn")}, dict(orca)],
             "userPromptSubmit": [dict(orca)],
             "preToolUse": [{"matcher": "*", "command": lean_cmd("preToolUse")}, dict(orca, matcher="*")]}
    p = write_spec(home, kiro_spec(hooks))
    before = json.loads(p.read_text(encoding="utf-8"))
    cc = loaded(tmp_path)
    row = agent_row(cc.checks([])["rows"])
    assert row["level"] == "FAIL" and "发消息" in row["text"]
    assert "会话开始" not in row["text"] and "调用工具前" not in row["text"]

    assert "发消息" in cc.fix_agent()
    after = json.loads(p.read_text(encoding="utf-8"))
    assert list(after) == list(before) and list(after["hooks"]) == list(before["hooks"])
    assert after["hooks"]["userPromptSubmit"] == [orca, {"command": lean_cmd("userPromptSubmit")}]
    assert after["hooks"]["agentSpawn"] == before["hooks"]["agentSpawn"]
    assert after["hooks"]["preToolUse"] == before["hooks"]["preToolUse"]
    assert {k: v for k, v in after.items() if k != "hooks"} == {k: v for k, v in before.items() if k != "hooks"}
    assert len(backups(home)) == 1
    assert cc.agent_ok(cc.checks([])["rows"])


@pytest.mark.parametrize("raw, why", [
    (b'{"hooks": [{"trigger": "agentSpawn",', "不是合法的 JSON"),
    (b'[{"trigger": "agentSpawn"}]\n', "不是一个 JSON 对象"),
    (b'{"hooks": {"agentSpawn": "python3 .kiro/brain/lean-hook.py SessionStart"}}\n', "hooks 格式认不出"),
])
def test_a_spec_that_cannot_be_read_is_never_overwritten(tmp_path, home, raw, why):
    p = home / ".kiro" / "agents" / "brain-dev.json"
    p.write_bytes(raw)
    cc = loaded(tmp_path)
    got = cc.checks([])
    row = agent_row(got["rows"])
    assert row["level"] == "FAIL" and why in row["text"] and "自己修好或删掉它" in row["text"]
    assert got["fix"]["agent"] is False and not cc.agent_ok(got["rows"])
    with pytest.raises(RuntimeError, match="自己修好或删掉它"):
        cc.fix_agent()
    assert p.read_bytes() == raw and not backups(home)


def test_agent_ok_needs_the_checks_to_have_found_leans_hooks():
    cc = mod("crewcheck")
    assert not cc.agent_ok([])
    assert not cc.agent_ok([{"level": "FAIL", "text": "brain-kit 没装载：先在设置里写对它的位置"}])
    assert not cc.agent_ok([{"level": "WARN", "text": "brain-dev 带着 Lean 的三个 hook"}])
    assert cc.agent_ok([{"level": "OK", "text": "brain-dev 带着 Lean 的三个 hook"},
                        {"level": "FAIL", "text": "仓库 pay：.kiro/brain/lean-hook.py is not committed"}])
