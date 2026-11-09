"""problems.py, pure: every pattern with the exact strings brain-kit 48b6b97 / d46765f print (copied from its sources:
cli.runner_kit_problems, crew_hook_problem, doctor_checks, crew_checks, mrdesc.write_problem / exclude_fix, brainlint,
the bridge's verify, the signer), the fallbacks, the levels, and the runner-only severity. No brain-kit, no git."""

import re

import pytest

from appkit import mod

P = mod("problems")
REPO = "/w/demo"
KEYS = {"level", "text", "todo", "fix", "repo", "raw"}
ADAPTER = ".kiro/brain/lean-hook.py"
OLDER = ("%s is an older adapter (version 0, needs 2): the team runner could not write runs/<KEY>/park.json, its only "
         "way to ask a person, before the Lean approvals; run `brain install` and commit it on main through an MR"
         % ADAPTER)
WRITE_PROBLEM = ("runs/ 下的文件（MR.md、park.json）算在 Lean 的代码指纹里：verify 之后写它们，Lean 会当成代码改了（提交被拦，"
                 "release 和 RELEASE 审批要重来）。请人在 aidlc-docs/lean.json 的 fingerprint_exclude 里加上 \"runs/**\"（AI 改不了"
                 "这个文件）")
EXCLUDE_FIX = ("修法：`brain install <项目目录>` 会把 \"runs/**\" 加进 aidlc-docs/lean.json（只加不删），或者手工加；由人看过再提交（"
               "最好经 MR 合进 main）。改了以后 Lean 的代码指纹会变，之前的 lean verify 要重跑")


def ok_row(r):
    assert set(r) == KEYS, r
    assert r["level"] in ("OK", "WARN", "FAIL") and r["text"] and r["fix"] in (None, "agent", "engine", "kit")
    assert P.chinese(r["text"]) or len(P.WORD_RE.findall(r["text"])) <= 3, r["text"]   # no English sentence
    if r["level"] == "OK":
        assert r["todo"] == "" and r["fix"] is None
    return r


# ---- runner_kit_problems, write_problem: the 'kit' fix, and the runner-only severity --------------------------------- #

def test_the_older_adapter_is_fail_for_a_team_repo_and_a_reminder_for_a_local_one():
    team = ok_row(P.row("FAIL", OLDER, repo=REPO, team=True))
    local = ok_row(P.row("FAIL", OLDER, repo=REPO, team=False))
    unknown = ok_row(P.row("FAIL", OLDER, repo=REPO))
    assert team["text"] == local["text"] == ".kiro/brain/lean-hook.py 是旧版（第 0 版，要第 2 版）"
    assert (team["level"], local["level"], unknown["level"]) == ("FAIL", "WARN", "FAIL")
    assert team["fix"] == local["fix"] == "kit" and team["repo"] == REPO
    assert "park.json" in team["todo"] and "点「重装 kit 文件」" in team["todo"]
    assert local["todo"].startswith("只有把需求交给运行机时才要紧") and "点「重装 kit 文件」" in local["todo"]
    assert team["raw"] == local["raw"] == OLDER                 # brain-kit's words, never dropped


def test_an_adapter_that_can_ask_already_is_said_by_what_it_still_lacks():
    """oms-brain's (version 2, brain-kit wants 3): the run can ask a person; what is missing is the refusal after the
    kit's own files changed. Saying 「写不了 park.json」 there would be wrong."""
    raw = (".kiro/brain/lean-hook.py is an older adapter (version 2, needs 3): it does not refuse tool calls after the kit's "
           "own files (.kiro/, .brain/kit.json, gates/) were changed; run `brain install` and commit it on main through an MR")
    team = ok_row(P.row("FAIL", raw, repo=REPO, team=True))
    local = ok_row(P.row("FAIL", raw, repo=REPO, team=False))
    assert team["text"] == ".kiro/brain/lean-hook.py 是旧版（第 2 版，要第 3 版）"
    for r in (team, local):
        assert "不会拦下工具调用" in r["todo"] and "park.json" not in r["todo"] and "点「重装 kit 文件」" in r["todo"]


def test_the_users_example_with_the_apps_older_prefix_is_mapped_too():
    r = ok_row(P.row("FAIL", "仓库 demo：" + OLDER, repo=REPO, team=False))
    assert r["level"] == "WARN" and r["text"].endswith("是旧版（第 0 版，要第 2 版）") and r["raw"].startswith("仓库 demo：")


@pytest.mark.parametrize("raw, text", [
    (".kiro/aidlc-lean/aidlc_lean.py is not committed: AI-DLC Lean; commit it on main through an MR",
     "AI-DLC Lean 没提交到 git"),
    (".kiro/brain/lean-hook.py is not committed: the KiroCrew hook adapter (brain install wrote it); commit it on main "
     "through an MR", ".kiro/brain/lean-hook.py 没提交到 git"),
    ("tools/x.py is not committed: something new; commit it on main through an MR", "tools/x.py 没提交到 git"),
])
def test_not_committed_is_fail_everywhere_with_the_kit_fix(raw, text):
    for team in (True, False, None):
        r = ok_row(P.row("FAIL", raw, repo=REPO, team=team))
        assert (r["level"], r["text"], r["fix"], r["raw"]) == ("FAIL", text, "kit", raw)
        assert "默认分支" in r["todo"] and "点「重装 kit 文件」" in r["todo"]


def test_lean_counting_the_run_records_as_code():
    crew = "%s。%s" % (WRITE_PROBLEM.rstrip("。"), EXCLUDE_FIX)          # crewcheck's row
    doctor = "aidlc-docs/lean.json fingerprint_exclude: %s。%s" % (WRITE_PROBLEM, EXCLUDE_FIX)   # brain doctor's
    for raw in (WRITE_PROBLEM, crew, doctor):
        team = ok_row(P.row("FAIL", raw, repo=REPO, team=True))
        local = ok_row(P.row("FAIL", raw, repo=REPO, team=False))
        assert team["text"] == local["text"] == "Lean 把 runs/ 下的记录算成代码"
        assert (team["level"], local["level"]) == ("FAIL", "WARN") and team["fix"] == local["fix"] == "kit"
        assert "交接会被拒" in team["todo"] and "runs/**" in team["todo"] and "lean.json" in team["todo"]
        assert local["todo"].startswith("只有把需求交给运行机时才要紧") and team["raw"] == raw
    assert P.row("FAIL", WRITE_PROBLEM)["fix"] is None              # no repo, nothing to reinstall into


def test_the_handoff_refusals_brain_prints():
    r = ok_row(P.row("FAIL", "brain: not handed over: Lean would refuse this run's RELEASE approval later. %s。%s"
                     % (WRITE_PROBLEM, EXCLUDE_FIX), repo=REPO))
    assert r["fix"] == "kit" and "runs/" in r["text"]
    r = ok_row(P.row("FAIL", "the team runner could not run this branch: " + OLDER, repo=REPO))
    assert r["text"] == "没交出去：运行机跑不了这个分支" and r["fix"] == "kit"


# ---- brain doctor's lines (doctor_checks, crew_checks) --------------------------------------------------------------- #

DOCTOR = [
    ("OK", "kit config valid (.brain/kit.json), tracker none, keys PAY-<n>", "这个仓库的 brain-kit 设置没问题（需求号 PAY-n，不用 Jira）",
     None),
    ("OK", "AI-DLC Lean doctor: ok", "AI-DLC Lean 自检通过", None),
    ("WARN", "AI-DLC Lean doctor: something else Lean says", "AI-DLC Lean 自检有提醒", None),
    ("OK", "Lean does not count runs/ as code (aidlc-docs/lean.json fingerprint_exclude)", "Lean 不把 runs/ 下的记录算成代码",
     None),
    ("OK", ".kiro/brain/lean-hook.py lets a run write its own runs/<KEY>/park.json whatever Lean's approvals (version 2)",
     ".kiro/brain/lean-hook.py 是新版（第 2 版）", None),
    ("FAIL", OLDER, ".kiro/brain/lean-hook.py 是旧版（第 0 版，要第 2 版）", "kit"),
    ("FAIL", ".kiro/brain/lean-hook.py missing in this repo (run `brain install`): KiroCrew sessions, the team runner's "
     "too, run Lean through it", "仓库里没有 .kiro/brain/lean-hook.py", "kit"),
    ("FAIL", ".kiro/brain/lean-hook.py missing in this repo (run `brain install`)", "仓库里没有 .kiro/brain/lean-hook.py",
     "kit"),
    ("FAIL", "AI-DLC Lean not installed", "没装 AI-DLC Lean", "kit"),
    ("OK", "brain-dev model: claude-opus-5.5 (want claude-opus-5.5)", "brain-dev 的模型是 claude-opus-5.5", None),
    ("FAIL", "brain-dev model: - (want claude-opus-5.5)", "brain-dev 的模型是 -，要 claude-opus-5.5", None),
    ("OK", "brain-dev forbidden tools: none", "brain-dev 没带禁用的工具", None),
    ("FAIL", "brain-dev forbidden tools: shell, aws", "brain-dev 带着禁用的工具：shell, aws", None),
    ("FAIL", "missing .kiro/agents/brain-dev.md (run `brain install`)", "没有 .kiro/agents/brain-dev.md", "kit"),
    ("OK", "Brain files in brain/: all present", "Brain 文件都在（brain/）", None),
    ("FAIL", "Brain files in brain/: missing PRODUCT.md, TECH.md", "缺 Brain 文件：PRODUCT.md, TECH.md", "kit"),
    ("OK", "AGENTS.md at repo root", "有 AGENTS.md", None),
    ("FAIL", "AGENTS.md at repo root", "仓库根目录没有 AGENTS.md", "kit"),
    ("OK", ".brain-materials/ is git-ignored (materials never get committed)", ".brain-materials/ 不进 git", None),
    ("FAIL", ".brain-materials/ is git-ignored (materials never get committed)", ".brain-materials/ 没被 git 忽略", "kit"),
    ("WARN", "cannot fetch origin/main: Brain freshness unknown", "取不到 origin/main：不知道 Brain 是不是最新", None),
    ("OK", "Brain vs origin/main: same", "Brain 和 origin/main 一样", None),
    ("WARN", "Brain vs origin/main: differs, merge or rebase", "Brain 和 origin/main 不一样", None),
    ("WARN", "no origin remote: Brain freshness not checked", "没有 origin：没查 Brain 是不是最新", None),
    ("WARN", "kiro-cli not found on PATH", "PATH 里找不到 kiro-cli", None),
    ("WARN", "kirocrew not found on PATH", "PATH 里找不到 kirocrew", None),
    ("FAIL", "kiro-cli version kiro-cli 3.0.1, pinned 3.1", "kiro-cli 版本是 kiro-cli 3.0.1，要 3.1", None),
    ("OK", "kiro-cli kiro-cli 3.1.0 (not pinned)", "kiro-cli 3.1.0", None),
    ("OK", "kirocrew kirocrew 0.11.2", "kirocrew 0.11.2", None),
    ("WARN", "KiroCrew: ~/.kiro/agents/brain-dev.json missing; Lean's hooks will not run in KiroCrew (run `brain "
     "crew-agent`)", "没有 ~/.kiro/agents/brain-dev.json", "agent"),
    ("OK", "KiroCrew brain-dev carries Lean's 3 hooks", "KiroCrew 的 brain-dev 带着 Lean 的三个 hook", None),
    ("FAIL", "KiroCrew brain-dev.json lacks Lean's userPromptSubmit, preToolUse hook(s) as Lean needs them (run `brain "
     "crew-agent --force`)", "brain-dev.json 缺 Lean 的 hook：发消息、调用工具前", "agent"),
    ("WARN", "KiroCrew brain-dev.json has no model, tools (`brain crew-agent --force` adds brain-kit's)",
     "brain-dev.json 没有 model, tools", None),
    ("OK", "KiroCrew brain-dev uses your own description, prompt (`brain crew-agent --reset` takes brain-kit's)",
     "brain-dev 用的是你自己的 description, prompt", None),
    ("FAIL", "~/.kiro/agents/brain-dev.json is not valid JSON", "brain-dev.json 不是合法的 JSON", None),
    ("OK", "KiroCrew engine: kas", "KiroCrew 引擎：kas", None),
    ("OK", "KiroCrew engine: default (KAS)", "KiroCrew 引擎：默认（kas）", None),
    ("WARN", "KiroCrew engine: kiro (Lean via agent hooks is tested on kas / v3 only)", "KiroCrew 引擎是 kiro，不是 kas",
     "engine"),
]


def test_hooks_that_never_ran_right_after_an_install_are_a_note_not_a_warning():
    """SETUP-28: brain doctor warns about it, there is nothing to do: an OK row, not counted as 注意."""
    r = ok_row(P.row("WARN", "AI-DLC Lean doctor: hooks have never run here: start `kiro-cli --v3` in this folder and trust "
                             "the workspace"))
    assert (r["level"], r["todo"]) == ("OK", "") and r["text"].startswith("Lean 的 hook 在这里还没跑过：")


def test_every_fix_row_names_the_button_the_page_shows():
    """UI问题清单 #12: 做什么 says 点「<the button's name>」, never a 「修复」 no button is called; no brain-dev.json at all is
    「装上 brain-dev」."""
    raws = [r for _, r, _, f in DOCTOR if f] + [OLDER, WRITE_PROBLEM,
                                              ".kiro/aidlc-lean/aidlc_lean.py is not committed: AI-DLC Lean; commit it on main"
                                              " through an MR"]
    rows = [P.agent_missing(), P.agent_lacks([("preToolUse", "PreToolUse")]), P.engine("kiro")] + \
        [P.row("FAIL", raw, repo=REPO, team=team) for raw in raws for team in (True, False)]
    names = set(P.FIX_BUTTON.values()) | {P.AGENT_NEW}
    for r in (x for x in rows if x["fix"]):
        assert "「修复」" not in r["todo"], r
        named = [n for n in names if "点「%s」" % n in r["todo"]]
        assert named == [P.AGENT_NEW if r["text"] == "没有 ~/.kiro/agents/brain-dev.json" else P.FIX_BUTTON[r["fix"]]], r


@pytest.mark.parametrize("level, raw, text, fix", DOCTOR)
def test_brain_doctors_lines(level, raw, text, fix):
    r = ok_row(P.row(level, raw, repo=REPO))
    assert (r["level"], r["text"], r["fix"], r["raw"]) == (level, text, fix, raw)
    assert bool(r["todo"]) == (level != "OK")
    if fix == "kit":
        assert P.row(level, raw)["fix"] is None        # in an install worktree (no repo): nothing to reinstall into


def test_doctor_rows_never_start_with_the_agent_ok_text():
    """crewcheck.agent_ok trusts only its own OK row: no doctor line may look like it."""
    for level, raw, _, _ in DOCTOR:
        assert not P.row(level, raw)["text"].startswith(P.AGENT_OK)


# ---- crewcheck's own rows -------------------------------------------------------------------------------------------- #

def test_the_apps_own_rows():
    assert ok_row(P.brainkit_missing())["text"] == "brain-kit 没装载" and "设置" in P.brainkit_missing()["todo"]
    old = ok_row(P.brainkit_old(["crew_hook_problem", "CREW_EVENTS"]))
    assert old["text"] == "brain-kit 太旧" and "crew_hook_problem、CREW_EVENTS" in old["todo"]
    no = ok_row(P.agent_missing())
    assert (no["level"], no["text"], no["fix"]) == ("FAIL", "没有 ~/.kiro/agents/brain-dev.json", "agent")
    bad = ok_row(P.agent_unreadable("读不了", "Permission denied"))
    assert bad["text"] == "brain-dev.json 读不了" and bad["raw"] == "Permission denied" and bad["fix"] is None
    assert "自己修好或删掉" in bad["todo"]
    assert P.agent_unreadable("的 hooks 格式认不出")["text"] == "brain-dev.json的 hooks 格式认不出"
    lacks = ok_row(P.agent_lacks([("userPromptSubmit", "UserPromptSubmit"), ("preToolUse", "PreToolUse")]))
    assert lacks["text"] == "brain-dev.json 缺 Lean 的 hook：发消息、调用工具前" and lacks["fix"] == "agent"
    assert lacks["todo"] == "点「补上 Lean 的 hook」：只补上缺的（发消息、调用工具前），别的 hook 和设置都不动"
    assert lacks["raw"] == "缺的 hook：userPromptSubmit、preToolUse"          # the trigger names only under 细节
    assert ok_row(P.agent_ok(0))["text"] == P.AGENT_OK
    assert P.agent_ok(2)["text"] == P.AGENT_OK + "（另有 2 个别的 hook，留着不动）"
    custom = ok_row(P.agent_custom(["model"]))
    assert custom["text"] == "brain-dev 用的是你自己的 model" and "--reset" in custom["raw"] and custom["todo"] == ""
    assert ok_row(P.engine("kas"))["text"] == "KiroCrew 引擎：kas" and P.engine("")["text"] == "KiroCrew 引擎：默认（kas）"
    other = ok_row(P.engine("kiro"))
    assert (other["level"], other["fix"]) == ("WARN", "engine") and "kas" in other["todo"]
    assert ok_row(P.engine(None, "no_kirocrew"))["text"] == "找不到 kirocrew 命令"
    failed = ok_row(P.engine(None, "failed", "[Errno 13] Permission denied"))
    assert failed["level"] == "WARN" and failed["raw"] == "[Errno 13] Permission denied"
    git = ok_row(P.repo_unreadable(REPO, "fatal: not a git repository"))
    assert git["repo"] == REPO and git["raw"] == "fatal: not a git repository" and git["level"] == "FAIL"
    assert ok_row(P.crew_timeout(60))["level"] == "WARN"


# ---- brain lint ------------------------------------------------------------------------------------------------------ #

LINT = [
    ("FAIL", "TECH.md:12: id T-PAY-1-1 already used at TECH.md:3", "brain/TECH.md 第 12 行：条目号 T-PAY-1-1 重复了"),
    ("FAIL", "TECH.md:4: bad id 'T-1x' (want e.g. T-OMS-12-1)", "brain/TECH.md 第 4 行：条目号 T-1x 不对"),
    ("WARN", "PRODUCT.md:2: legacy sequential id P-7; new entries use <side>-<KEY>-<n>", "brain/PRODUCT.md 第 2 行：P-7 是旧式条目号"),
    ("FAIL", "TECH.md:9: entry T-PAY-1-2 has no text", "brain/TECH.md 第 9 行：条目 T-PAY-1-2 没有正文"),
    ("FAIL", "TECH.md:9: type must be one of pitfall, convention, decision (TECH)",
     "brain/TECH.md 第 9 行：类型不对：TECH 里只能用 pitfall, convention, decision"),
    ("FAIL", "TECH.md:9: side must be one of product, tech", "brain/TECH.md 第 9 行：side 不对：只能是 product, tech"),
    ("FAIL", "TECH.md:9: side must be tech in TECH", "brain/TECH.md 第 9 行：side 不对：TECH 里是 tech"),
    ("FAIL", "TECH.md:9: rel must be one of new, replaces", "brain/TECH.md 第 9 行：rel 不对：只能是 new, replaces"),
    ("WARN", "TECH.md:9: T-PAY-1-2 came back 3 times: make it a gate (a check that fails), not more text",
     "brain/TECH.md 第 9 行：T-PAY-1-2 已经重复出现 3 次"),
    ("WARN", "T-PAY-2-1: term '对账' is also defined in T-PAY-1-1 (same name, different entries)",
     "T-PAY-2-1：术语「对账」在 T-PAY-1-1 里也定义了"),
    ("WARN", "T-PAY-2-1 (TECH.md): comes from a requirement document: review this entry on its own",
     "T-PAY-2-1（brain/TECH.md）：这条来自需求文档"),
    ("WARN", "TECH.md: 2 line(s) of text outside entries (not tracked as knowledge; read them): 注意对账",
     "brain/TECH.md：有 2 行文字不在条目里"),
    ("FAIL", "TECH.md:9: T-PAY-1-1 was purged; it may not come back", "brain/TECH.md 第 9 行：T-PAY-1-1 清除过，不能再出现"),
    ("WARN", "T-PAY-1-1: purged in this change: sec-lead must approve this MR; the text is still in git history until "
             "someone rewrites it", "T-PAY-1-1：这次清除了一条"),
    ("FAIL", "T-PAY-1-1 (TECH.md): text edited in place; only same, adds-to (old text first), replaces, withdraws are "
             "allowed", "T-PAY-1-1（brain/TECH.md）：条目的正文被直接改了"),
    ("FAIL", "TECH.md:9: source '见群聊' is not a reference (D01#S003, PKG-…, D-3, V-<10 hex>, RUN-…, an entry id, an intent, "
             "a key)", "brain/TECH.md 第 9 行：出处「见群聊」不是引用"),
    ("FAIL", "TECH.md (outside entries): looks like a secret (aws-key)", "brain/TECH.md（条目外的文字）：像是有密钥或密码"),
    ("FAIL", "AGENTS.md: instruction-like line (ignore-previous)", "AGENTS.md：有像指令的句子"),
    ("FAIL", "brain is a symlink: the Brain must be real files", "Brain 里有符号链接"),
    ("FAIL", "T-PAY-3-1: this id was taken on the target branch meanwhile (another MR merged first): rebase on it and run "
             "brain reflect again", "T-PAY-3-1：这个条目号在目标分支上被别人占了"),
]


@pytest.mark.parametrize("level, raw, text", LINT)
def test_brain_lint_lines(level, raw, text):
    r = ok_row(P.lint(level, raw, repo=REPO))
    assert (r["level"], r["text"], r["raw"], r["repo"], r["fix"]) == (level, text, raw, REPO, None)
    assert r["todo"]


COMMAND = r"brain (?:handoff|reflect|claim|entry|start)\b|lean verify|D01#S|PKG-|（gate）|每个 run"


def test_what_to_do_is_said_in_words_never_a_command_or_a_code_name():
    """REST-29: a 做什么 line says the step; a command a person types is in a copy line or under 细节, never here."""
    rows = [P.lint(lv, raw) for lv, raw, _ in LINT] + [P.reason(raw) for raw, _ in REASONS]
    assert [r["todo"] for r in rows if re.search(COMMAND, r["todo"])] == []


def test_an_unknown_lint_line_keeps_its_where():
    r = ok_row(P.lint("FAIL", "TECH.md:12: something brain-kit learns tomorrow"))
    assert r["text"] == "brain/TECH.md 第 12 行：格式不对" and r["raw"] == "TECH.md:12: something brain-kit learns tomorrow"
    w = ok_row(P.lint("WARN", "T-PAY-1-1 (PROJECT.md): a new warning", brain_dir="docs/brain"))
    assert w["text"] == "T-PAY-1-1（docs/brain/PROJECT.md）：要看一眼" and w["level"] == "WARN"


# ---- why a hand-over (or an answer) was not taken -------------------------------------------------------------------- #

REASONS = [
    ("branch feature/x is not ai/<owner>/<JIRA>-<slug>", "分支名不对"),
    ("MR comes from a fork", "MR 来自 fork"),
    ("MR targets develop, not main", "MR 的目标分支是 develop，不是 main"),
    ("bot branches are not handed over", "机器人账号的分支不能交接"),
    ("label 'ai-handoff' was added by bob, not by the branch owner alice", "标签是 bob 打的，不是负责人 alice"),
    ("GitLab shows no MR version with head 0123456789ab: add the label 'ai-handoff' again once the push shows on the MR",
     "GitLab 还没记下这次推送"),
    ("0123456789ab was pushed (2026-11-09T10:00:00Z) after the label 'ai-handoff' was added (2026-11-09T09:00:00Z): that "
     "commit was not handed over; look at it, then run `brain handoff` again (it hands over a new commit on top)",
     "打标签之后分支又有了新推送"),
    ("alice is not in brain-authz identities", "alice 不在 brain-authz 的身份表里"),
    ("PAY-3 has no claim (branch claim/PAY-3); run `brain claim`", "PAY-3 没认领"),
    ("run.json missing at 0123456789ab", "这次提交里没有 run.json"),
    ("run.json has no hand-over (run `brain handoff`)", "这个分支还没交接过"),
    ("run.json: intent must be a Lean intent folder name (yymmdd-slug)", "run.json 有问题"),
    ("the MR head 0123456789ab is a merge, not the hand-over commit `brain handoff` makes: run it again",
     "MR 最新的提交是一个合并，不是交接提交"),
    ("the MR head 0123456789ab was made by a bot account (bot@example.com), not by `brain handoff`: a runner's commit is "
     "never handed over; look at it, then run `brain handoff` again", "MR 最新的提交是机器人账号做的"),
    ("the MR head 0123456789ab is not the hand-over commit (it does not change runs/PAY-3/run.json): a commit pushed after "
     "`brain handoff` was not handed over; look at it, then run `brain handoff` again", "MR 最新的提交不是交接提交"),
    ("material PKG-PAY-3-1 is not published to brain-intake", "材料 PKG-PAY-3-1 还没发布到 brain-intake"),
    ("material PKG-PAY-3-1 in brain-intake differs from run.json", "brain-intake 里的材料 PKG-PAY-3-1 和 run.json 对不上"),
    ("Lean hand-over note aidlc-docs/261109-pay/aidlc-state.md missing", "没有 Lean 的交接说明"),
    ("hand-over note: Session notes have no '### Next' items", "Lean 的交接说明没写好"),
    ("brain_commit 0123456789ab does not exist", "run.json 里的 brain_commit 不存在"),
    ("PAY-3 already has an open run on the team runner", "PAY-3 在运行机上已经有一个没结束的 run"),
    ("凭证和签名服务按 GitLab 重建的不一样：sha、branch", "凭证和 GitLab 上的对不上"),
    ("D-2 收到不同的回答，不签", "D-2 收到了不同的回答"),
    ("MR 上没有可以回答 D-1 的人的有效回答", "D-1 还没有有效回答"),
    ("the signer did not answer handoff-RUN-PAY-9-1-0a1b2c3d4e5f within 30s", "签名服务 30 秒内没答复"),
    ("grp/pay: .brain/kit.json not found on main", "grp/pay 的默认分支 main 上没有 .brain/kit.json"),
    ("GET /projects/grp%2Fpay/merge_requests -> HTTP 401: {\"message\":\"401 Unauthorized\"}", "GitLab 拒绝了桥的 token（HTTP 401）"),
    ("D-2 作废：问题发出后分支又有了新推送（the MR head moved from 0123456789ab to ba9876543210 after the question）",
     "D-2 作废：分支又有了新推送"),
]


@pytest.mark.parametrize("raw, text", REASONS)
def test_handover_and_signer_reasons(raw, text):
    r = ok_row(P.reason(raw))
    assert (r["level"], r["text"], r["raw"]) == ("FAIL", text, raw) and r["todo"]


def test_reasons_joined_for_one_field_keep_the_raw():
    text, raw = P.reasons_text(["run.json has no hand-over (run `brain handoff`)", "MR 不是打开的", ""])
    assert text == "这个分支还没交接过；MR 不是打开的"
    assert raw == "run.json has no hand-over (run `brain handoff`); MR 不是打开的"


# ---- the fallbacks and the levels ------------------------------------------------------------------------------------ #

def test_unknown_text_gets_a_generic_line_by_level_and_keeps_the_raw():
    for level, text in (("FAIL", "brain-kit 报了一个问题"), ("WARN", "brain-kit 提醒了一件事"), ("OK", "brain-kit：这项通过")):
        r = ok_row(P.row(level, "Something brain-kit learns tomorrow: details", repo=REPO))
        assert (r["level"], r["text"], r["raw"], r["repo"]) == (level, text, "Something brain-kit learns tomorrow: details",
                                                                REPO)
        assert bool(r["todo"]) == (level != "OK")
    assert ok_row(P.reason("a reason the bridge learns tomorrow"))["text"] == "brain-kit 报了一个问题"


def test_a_chinese_line_nobody_mapped_is_shown_as_it_is():
    short = ok_row(P.row("WARN", "签名服务这一轮没答复"))
    assert short["text"] == "签名服务这一轮没答复" and short["raw"] == ""
    long = "这是一句很长很长的中文说明：后面还有很多很多的细节，一直说下去，说到超过四十个字为止，还要再多一点点才行"
    r = ok_row(P.row("FAIL", long))
    assert r["text"] == "这是一句很长很长的中文说明" and r["raw"] == long and r["todo"]


def test_levels_are_normalized_and_whitespace_folded():
    assert P.row("fail", "AI-DLC Lean not installed")["level"] == "FAIL"
    assert P.row("bogus", "AI-DLC Lean not installed")["level"] == "WARN"
    assert P.row("OK", "  Brain vs   origin/main:\n same ")["text"] == "Brain 和 origin/main 一样"
    assert P.row("WARN", "")["text"] == "brain-kit 提醒了一件事"
    # a runner-only problem said at WARN becomes FAIL for a team repo; an OK row stays OK whoever it is for
    assert P.row("WARN", OLDER, repo=REPO, team=True)["level"] == "FAIL"
    assert P.row("OK", "Lean does not count runs/ as code (x)", team=False)["level"] == "OK"
    assert P.mk("OK", "好", "不该有", "kit")["todo"] == "" and P.mk("FAIL", "坏", fix="nope")["fix"] is None
