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


ROW_KEYS = {"level", "text", "todo", "fix", "repo", "raw"}


def levels(rows):
    assert all(set(r) == ROW_KEYS for r in rows), rows      # every row is a problems.py CheckRow
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
    assert any(l == "FAIL" and "brain-dev" in t for l, t in levels(first["rows"]))
    assert any(l == "WARN" and "kiro" in t for l, t in levels(first["rows"]))
    assert fa["ok"] and "装好了" in fa["text"]
    spec = json.loads((home / ".kiro" / "agents" / "brain-dev.json").read_text())
    assert spec == json.loads((BRAINKIT / "crew" / "brain-dev.json").read_text())
    assert fe["ok"] and (tmp_path / "engine").read_text().strip() == "kas"
    assert all(r["level"] == "OK" for r in fe["rows"])
    agent = next(r for r in first["rows"] if r["fix"] == "agent")
    assert agent["text"] == "KiroCrew 里还没有 brain-dev" and "点「装上 brain-dev」" in agent["todo"] and agent["repo"] is None
    engine = next(r for r in first["rows"] if r["fix"] == "engine")
    assert engine["level"] == "WARN" and engine["text"] == "KiroCrew 引擎是 kiro，不是 kas" and "kas" in engine["todo"]


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
    assert levels(got["rows"])[0] == ("OK", "brain-dev 的设置里 Lean 的拦截都在")
    assert not [r for r in got["rows"] if r["level"] != "OK"]  # no drift warning: only Lean's hooks matter
    # brain-kit 72b278e: the person's own fields stay (`brain crew-agent --force` only adds what is missing): said
    custom = next(r for r in got["rows"] if r["text"] == "brain-dev 用的是你自己的说明、提示词")
    assert custom["level"] == "OK" and custom["todo"] == "" and custom["fix"] is None
    assert custom["raw"] == "brain-dev 用的是你自己的 description、prompt（`brain crew-agent --reset` 换回 brain-kit 的；" \
                            "--force 只补缺的）"
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
    row = next(r for r in rows if r["repo"] == str(repo))
    assert (row["level"], row["text"], row["fix"], row["raw"]) == ("FAIL", "Lean 的适配文件没提交到 git", "kit", probs[0])
    assert "点「重装 kit 文件」" in row["todo"] and "新分支" in row["todo"]
    # not committed matters to every repo (the app's worktrees are made from main): FAIL for a local-only one too
    local = cc.checks([str(repo)], team_paths=[])["rows"]
    assert [r["level"] for r in local if r["repo"] == str(repo)] == ["FAIL"]
    assert cc.agent_ok(rows)  # the repo's problem does not make brain-dev unusable


def test_kiros_list_format_with_orca_gets_only_the_missing_lean_hooks(tmp_path, home):
    p = write_spec(home, kiro_spec(list_hooks({"agentSpawn"})))
    before, raw = json.loads(p.read_text(encoding="utf-8")), p.read_bytes()
    cc = loaded(tmp_path)
    got = cc.checks([])
    row = agent_row(got["rows"])
    assert row["level"] == "FAIL" and "发消息" in row["text"] and "调用工具前" in row["text"]
    assert "会话开始" not in row["text"] and row["fix"] == "agent" and "只补上缺的" in row["todo"]
    assert got["fix"]["agent"] is True and not cc.agent_ok(got["rows"])

    text = cc.fix_agent()
    assert text.startswith("给 brain-dev 的设置补上了 Lean 的拦截：发消息、调用工具前。") and "userPromptSubmit" not in text
    assert "改之前的那份留作备份：brain-dev.json.bak-" in text            # the one place its name is said
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
    ok = agent_row(again["rows"])
    assert (ok["level"], ok["text"], ok["todo"], ok["fix"]) == (
        "OK", "brain-dev 的设置里 Lean 的拦截都在（另有 3 个别的工具加的拦截，留着不动）", "", None)
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
    (b'{"hooks": [{"trigger": "agentSpawn",', "读不懂：文件格式坏了"),
    (b'[{"trigger": "agentSpawn"}]\n', "读不懂：里面不是一份设置"),
    (b'{"hooks": {"agentSpawn": "python3 .kiro/brain/lean-hook.py SessionStart"}}\n', "读不懂：拦截那一段的写法认不出"),
])
def test_a_spec_that_cannot_be_read_is_never_overwritten(tmp_path, home, raw, why):
    p = home / ".kiro" / "agents" / "brain-dev.json"
    p.write_bytes(raw)
    cc = loaded(tmp_path)
    got = cc.checks([])
    row = agent_row(got["rows"])
    assert (row["level"], row["text"], row["fix"]) == ("FAIL", "brain-dev 的设置" + why, None)
    assert "自己修好它" in row["todo"] and str(p).replace(str(home), "~") in row["raw"]   # where it is: 细节
    assert got["fix"]["agent"] is False and not cc.agent_ok(got["rows"])
    with pytest.raises(RuntimeError, match="^没改：brain-dev 的设置%s。自己修好它" % why):
        cc.fix_agent()
    assert p.read_bytes() == raw and not backups(home)


def test_agent_ok_needs_the_checks_to_have_found_leans_hooks():
    cc = mod("crewcheck")
    assert not cc.agent_ok([])
    assert not cc.agent_ok([{"level": "FAIL", "text": "brain-kit 没装载：先在设置里写对它的位置"}])
    assert not cc.agent_ok([{"level": "WARN", "text": "brain-dev 的设置里 Lean 的拦截都在"}])
    assert cc.agent_ok([{"level": "OK", "text": "brain-dev 的设置里 Lean 的拦截都在"},
                        {"level": "FAIL", "text": "仓库 pay：.kiro/brain/lean-hook.py is not committed"}])


def test_a_session_refused_names_the_button_settings_shows_for_brain_dev(tmp_path, home):
    """NEW-4: why brain-dev cannot be opened is said by the row 设置's KiroCrew shows, so the button it names is the
    one there: brain-dev.json missing → 装上 brain-dev; hooks missing → 补上 Lean 的拦截; the file unreadable or
    brain-kit not loaded → what to do, no button."""
    cc, P = mod("crewcheck"), mod("problems")
    make_service(tmp_path, [make_project(tmp_path)]).reload_sync()  # brain-kit loaded, no background tasks
    agent = home / ".kiro" / "agents" / "brain-dev.json"
    said = cc.not_ready(cc.checks([])["rows"])
    assert not agent.exists() and said == "KiroCrew 里还没有 brain-dev。在「设置」的 KiroCrew 里点「装上 brain-dev」：" \
        "装上 brain-kit 带的那一份；没有它，Lean 的拦截在 KiroCrew 里不会跑", said
    agent.parent.mkdir(parents=True, exist_ok=True)
    agent.write_text(json.dumps({"name": "brain-dev", "hooks": {}}))
    assert "在「设置」的 KiroCrew 里点「补上 Lean 的拦截」" in cc.not_ready(cc.checks([])["rows"])
    agent.write_text("{ not json")
    said = cc.not_ready(cc.checks([])["rows"])
    assert said.startswith("brain-dev 的设置读不懂") and "点「" not in said and "自己修好它" in said, said
    assert cc.not_ready([P.brainkit_missing()]) == "brain-kit 没装载。在「设置」里写对 brain-kit 的位置"


def test_a_repo_whose_lean_counts_the_run_records_as_code_fails(tmp_path, home):
    """brain-kit 72b278e / 48b6b97: Lean must leave runs/** out of its code fingerprint (aidlc-docs/lean.json
    fingerprint_exclude), or a park.json or MR.md written after `lean release` voids the RELEASE approval; `brain
    handoff` refuses then. The check says so per repo with brain-kit's fix (the file is the person's: no fix here)."""
    repo = make_project(tmp_path)
    install_brain_dev(home)
    cc = loaded(tmp_path)
    lj = repo / "aidlc-docs" / "lean.json"
    cfg = json.loads(lj.read_text(encoding="utf-8"))
    if "runs/**" not in (cfg.get("fingerprint_exclude") or []):
        pytest.skip("this brain-kit's install does not add runs/** (older than 48b6b97)")
    assert not [r for r in cc.checks([str(repo)])["rows"] if r["repo"]]
    cfg["fingerprint_exclude"] = [p for p in cfg["fingerprint_exclude"] if p != "runs/**"]
    lj.write_text(json.dumps(cfg), encoding="utf-8")
    got = cc.checks([str(repo)])
    row = [r for r in got["rows"] if r["repo"] == str(repo)]
    assert len(row) == 1 and row[0]["level"] == "FAIL" and row[0]["text"] == "Lean 把变更说明和 AI 停下来写的问题也算成代码", got["rows"]
    assert row[0]["fix"] == "kit" and "Lean 就不算它们了" in row[0]["todo"] and "交接会被拒" in row[0]["todo"]
    assert "指纹" in row[0]["raw"] and "runs/**" in row[0]["raw"]        # brain-kit's own words, kept for the page
    assert got["fix"] == {"agent": False, "engine": False} and cc.agent_ok(got["rows"])


def test_a_checkout_missing_its_brain_files_or_agents_md_offers_the_kit_fix(tmp_path, home):
    """importer's 检查 says to click 重装 kit 文件 when only AGENTS.md or Brain files are missing: the KiroCrew checks
    (设置, and the import page's KiroCrew block) offer that very button for the repo."""
    repo = make_project(tmp_path)
    install_brain_dev(home)
    cc = loaded(tmp_path)
    assert not [r for r in cc.checks([str(repo)])["rows"] if r["repo"]]
    (repo / "AGENTS.md").unlink()
    (repo / "brain" / "TECH.md").unlink()
    rows = [r for r in cc.checks([str(repo)])["rows"] if r["repo"] == str(repo)]
    assert [(r["text"], r["fix"]) for r in rows] == [("缺 Brain 文件：TECH.md", "kit"), ("仓库根目录没有 AGENTS.md", "kit")]
    assert all("点「重装 kit 文件」" in r["todo"] for r in rows)


def test_the_engine_fix_says_why_it_did_not_change_in_words(tmp_path, monkeypatch):
    """The fix's answer has no 细节: what went wrong in words, then the command (when the app cannot run it) or
    KiroCrew's own error."""
    cc = mod("crewcheck")
    monkeypatch.setattr(cc, "kirocrew_bin", lambda: "")
    with pytest.raises(RuntimeError) as e:
        cc.fix_engine()
    said = str(e.value)
    assert said.startswith("没换成：找不到 KiroCrew 的命令行工具。") and said.endswith("：kirocrew config set agent.acp_backend kas")
    bad = tmp_path / "kirocrew"
    bad.write_text("#!/bin/sh\necho 'config: permission denied' >&2\nexit 2\n", encoding="utf-8")
    bad.chmod(0o755)
    monkeypatch.setattr(cc, "kirocrew_bin", lambda: str(bad))
    with pytest.raises(RuntimeError) as e:
        cc.fix_engine()
    assert str(e.value) == "引擎没换成 kas：KiroCrew 报了错。看下面它的原话，改好以后再点一次\nconfig: permission denied"
