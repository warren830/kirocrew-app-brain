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


# a file name, a path, a field, a command or a code word in what a person reads (REST-29); the Brain's own files and
# AGENTS.md may be named, and a button by its name (「补上 Lean 的拦截」)
CODE_WORD = re.compile(r"`|~/|\.kiro|aidlc-docs|\bruns/|\.json\b|\.py\b|\.gitignore|\b[a-z]+(?:_[a-z]+)+\b|\b(?:hook|hooks|"
                       r"PATH|pins|lint|rel|src|side|repeats|replaces|prop|run|origin|model|tools|rebase|kirocrew)\b")
BRAIN_MD = re.compile(r"^(?:[\w-]+/)*(?:PRODUCT|TECH|IMPROVEMENT|PROJECT|PURGED)(?:-archive)?\.md$|^AGENTS\.md$")


def code_words(s):
    for name in list(P.FIX_BUTTON.values()) + [P.AGENT_NEW]:
        s = s.replace("「%s」" % name, "")
    return CODE_WORD.findall(s) + [w for w in re.findall(r"[\w./-]+\.md\b", s) if not BRAIN_MD.match(w)]


def ok_row(r):
    assert set(r) == KEYS, r
    assert r["level"] in ("OK", "WARN", "FAIL") and r["text"] and r["fix"] in (None, "agent", "engine", "kit")
    assert P.chinese(r["text"]) or len(P.WORD_RE.findall(r["text"])) <= 3, r["text"]   # no English sentence
    assert code_words(r["text"] + " " + r["todo"]) == [], r
    if r["level"] == "OK":
        assert r["todo"] == "" and r["fix"] is None
    return r


# ---- runner_kit_problems, write_problem: the 'kit' fix, and the runner-only severity --------------------------------- #

def test_the_older_adapter_is_fail_for_a_team_repo_and_a_reminder_for_a_local_one():
    team = ok_row(P.row("FAIL", OLDER, repo=REPO, team=True))
    local = ok_row(P.row("FAIL", OLDER, repo=REPO, team=False))
    unknown = ok_row(P.row("FAIL", OLDER, repo=REPO))
    assert team["text"] == local["text"] == "Lean 的适配文件是旧版（第 0 版，要第 2 版）"
    assert (team["level"], local["level"], unknown["level"]) == ("FAIL", "WARN", "FAIL")
    assert team["fix"] == local["fix"] == "kit" and team["repo"] == REPO
    assert "没法停下来问人" in team["todo"] and "点「重装 kit 文件」" in team["todo"]
    # a repo done only here: what this machine's own sessions lack, never the runner's park.json
    assert "不会拦下工具调用" in local["todo"] and "park.json" not in local["todo"] and "运行机" not in local["todo"]
    assert "点「重装 kit 文件」" in local["todo"]
    assert team["raw"] == local["raw"] == OLDER                 # brain-kit's words, never dropped


def test_an_adapter_that_can_ask_already_is_said_by_what_it_still_lacks():
    """oms-brain's (version 2, brain-kit wants 3): the run can ask a person; what is missing is the refusal after the
    kit's own files changed. Saying 「写不了 park.json」 there would be wrong."""
    raw = (".kiro/brain/lean-hook.py is an older adapter (version 2, needs 3): it does not refuse tool calls after the kit's "
           "own files (.kiro/, .brain/kit.json, gates/) were changed; run `brain install` and commit it on main through an MR")
    team = ok_row(P.row("FAIL", raw, repo=REPO, team=True))
    local = ok_row(P.row("FAIL", raw, repo=REPO, team=False))
    assert team["text"] == "Lean 的适配文件是旧版（第 2 版，要第 3 版）"
    for r in (team, local):
        assert "不会拦下工具调用" in r["todo"] and "park.json" not in r["todo"] and "点「重装 kit 文件」" in r["todo"]


def test_the_users_example_with_the_apps_older_prefix_is_mapped_too():
    r = ok_row(P.row("FAIL", "仓库 demo：" + OLDER, repo=REPO, team=False))
    assert r["level"] == "WARN" and r["text"].endswith("是旧版（第 0 版，要第 2 版）") and r["raw"].startswith("仓库 demo：")


@pytest.mark.parametrize("raw, text", [
    (".kiro/aidlc-lean/aidlc_lean.py is not committed: AI-DLC Lean; commit it on main through an MR",
     "AI-DLC Lean 没提交到 git"),
    (".kiro/brain/lean-hook.py is not committed: the KiroCrew hook adapter (brain install wrote it); commit it on main "
     "through an MR", "Lean 的适配文件没提交到 git"),
    ("tools/x.py is not committed: something new; commit it on main through an MR", "有一个 kit 文件没提交到 git"),
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
        assert team["text"] == local["text"] == "Lean 把变更说明和 AI 停下来写的问题也算成代码"
        assert (team["level"], local["level"]) == ("FAIL", "WARN") and team["fix"] == local["fix"] == "kit"
        assert "交接会被拒" in team["todo"] and "Lean 就不算它们了" in team["todo"]
        assert local["todo"].startswith("只有把需求交给运行机时才要紧") and "Lean 就不算它们了" in local["todo"]
        assert team["raw"] == raw and "runs/**" in raw and "lean.json" in raw    # the file and the pattern: 细节
    assert P.row("FAIL", WRITE_PROBLEM)["fix"] is None              # no repo, nothing to reinstall into


def test_the_handoff_refusals_brain_prints():
    r = ok_row(P.row("FAIL", "brain: not handed over: Lean would refuse this run's RELEASE approval later. %s。%s"
                     % (WRITE_PROBLEM, EXCLUDE_FIX), repo=REPO))
    assert r["fix"] == "kit" and r["text"] == "Lean 把变更说明和 AI 停下来写的问题也算成代码" and "交接会被拒" in r["todo"]
    r = ok_row(P.row("FAIL", "the team runner could not run this branch: " + OLDER, repo=REPO))
    assert r["text"] == "没交出去：运行机跑不了这个分支" and r["fix"] == "kit"


# ---- brain doctor's lines (doctor_checks, crew_checks) --------------------------------------------------------------- #

DOCTOR = [
    ("OK", "kit config valid (.brain/kit.json), tracker none, keys PAY-<n>", "这个仓库的 brain-kit 设置没问题（需求号 PAY-n，不用 Jira）",
     None),
    ("OK", "AI-DLC Lean doctor: ok", "AI-DLC Lean 自检通过", None),
    ("WARN", "AI-DLC Lean doctor: something else Lean says", "AI-DLC Lean 自检有提醒", None),
    ("OK", "Lean does not count runs/ as code (aidlc-docs/lean.json fingerprint_exclude)", "Lean 不把变更说明和 AI 停下来写的问题算成代码",
     None),
    ("OK", ".kiro/brain/lean-hook.py lets a run write its own runs/<KEY>/park.json whatever Lean's approvals (version 2)",
     "Lean 的适配文件是新版（第 2 版）", None),
    ("FAIL", OLDER, "Lean 的适配文件是旧版（第 0 版，要第 2 版）", "kit"),
    ("FAIL", ".kiro/brain/lean-hook.py missing in this repo (run `brain install`): KiroCrew sessions, the team runner's "
     "too, run Lean through it", "仓库里没有 Lean 的适配文件", "kit"),
    ("FAIL", ".kiro/brain/lean-hook.py missing in this repo (run `brain install`)", "仓库里没有 Lean 的适配文件", "kit"),
    ("FAIL", "AI-DLC Lean not installed", "没装 AI-DLC Lean", "kit"),
    ("OK", "brain-dev model: claude-opus-5.5 (want claude-opus-5.5)", "brain-dev 的模型是 claude-opus-5.5", None),
    ("FAIL", "brain-dev model: - (want claude-opus-5.5)", "brain-dev 的模型是 -，要 claude-opus-5.5", None),
    ("OK", "brain-dev forbidden tools: none", "brain-dev 没带禁用的工具", None),
    ("FAIL", "brain-dev forbidden tools: shell, aws", "brain-dev 带着禁用的工具：shell, aws", None),
    ("FAIL", "missing .kiro/agents/brain-dev.md (run `brain install`)", "仓库里没有 brain-dev", "kit"),
    ("OK", "Brain files in brain/: all present", "Brain 文件都在", None),
    ("FAIL", "Brain files in brain/: missing PRODUCT.md, TECH.md", "缺 Brain 文件：PRODUCT.md, TECH.md", "kit"),
    ("OK", "AGENTS.md at repo root", "有 AGENTS.md", None),
    ("FAIL", "AGENTS.md at repo root", "仓库根目录没有 AGENTS.md", "kit"),
    ("OK", ".brain-materials/ is git-ignored (materials never get committed)", "需求材料不进 git", None),
    ("FAIL", ".brain-materials/ is git-ignored (materials never get committed)", "需求材料可能被提交进 git", "kit"),
    ("WARN", "cannot fetch origin/main: Brain freshness unknown", "取不到远端的 main：不知道 Brain 是不是最新", None),
    ("OK", "Brain vs origin/main: same", "Brain 和远端 main 上的一样", None),
    ("WARN", "Brain vs origin/main: differs, merge or rebase", "Brain 和远端 main 上的不一样", None),
    ("WARN", "no origin remote: Brain freshness not checked", "没有远端：没查 Brain 是不是最新", None),
    ("WARN", "kiro-cli not found on PATH", "找不到 kiro-cli", None),
    ("WARN", "kirocrew not found on PATH", "找不到 KiroCrew 的命令行工具", None),
    ("FAIL", "kiro-cli version kiro-cli 3.0.1, pinned 3.1", "kiro-cli 的版本是 3.0.1，要 3.1", None),
    ("OK", "kiro-cli kiro-cli 3.1.0 (not pinned)", "kiro-cli 3.1.0", None),
    ("OK", "kirocrew kirocrew 0.11.2", "KiroCrew 0.11.2", None),
    ("WARN", "KiroCrew: ~/.kiro/agents/brain-dev.json missing; Lean's hooks will not run in KiroCrew (run `brain "
     "crew-agent`)", "KiroCrew 里还没有 brain-dev", "agent"),
    ("OK", "KiroCrew brain-dev carries Lean's 3 hooks", "KiroCrew 的 brain-dev 设置里 Lean 的拦截都在", None),
    ("FAIL", "KiroCrew brain-dev.json lacks Lean's userPromptSubmit, preToolUse hook(s) as Lean needs them (run `brain "
     "crew-agent --force`)", "brain-dev 的设置缺 Lean 的拦截：发消息、调用工具前", "agent"),
    ("WARN", "KiroCrew brain-dev.json has no model, tools (`brain crew-agent --force` adds brain-kit's)",
     "brain-dev 的设置里没有模型、工具", None),
    ("OK", "KiroCrew brain-dev uses your own description, prompt (`brain crew-agent --reset` takes brain-kit's)",
     "brain-dev 用的是你自己的说明、提示词", None),
    ("FAIL", "~/.kiro/agents/brain-dev.json is not valid JSON", "brain-dev 的设置读不懂：文件格式坏了", None),
    ("OK", "KiroCrew engine: kas", "KiroCrew 引擎：kas", None),
    ("OK", "KiroCrew engine: default (KAS)", "KiroCrew 引擎：默认（kas）", None),
    ("WARN", "KiroCrew engine: kiro (Lean via agent hooks is tested on kas / v3 only)", "KiroCrew 引擎是 kiro，不是 kas",
     "engine"),
]


def test_hooks_that_never_ran_right_after_an_install_are_a_note_not_a_warning():
    """SETUP-28: brain doctor warns about it, there is nothing to do: an OK row, not counted as 注意."""
    r = ok_row(P.row("WARN", "AI-DLC Lean doctor: hooks have never run here: start `kiro-cli --v3` in this folder and trust "
                             "the workspace"))
    assert (r["level"], r["todo"]) == ("OK", "") and r["text"].startswith("Lean 的拦截在这里还没跑过：")


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
        assert named == [P.AGENT_NEW if r["text"] == "KiroCrew 里还没有 brain-dev" else P.FIX_BUTTON[r["fix"]]], r


@pytest.mark.parametrize("level, raw, text, fix", DOCTOR)
def test_brain_doctors_lines(level, raw, text, fix):
    r = ok_row(P.row(level, raw, repo=REPO))
    assert (r["level"], r["text"], r["fix"], r["raw"].split("\n做法：")[0]) == (level, text, fix, raw)
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
    assert (old["text"], old["todo"]) == ("brain-kit 太旧", "把 brain-kit 更新到新版本")
    assert "crew_hook_problem、CREW_EVENTS" in old["raw"]                    # what it lacks: 细节
    no = ok_row(P.agent_missing())
    assert (no["level"], no["text"], no["fix"]) == ("FAIL", "KiroCrew 里还没有 brain-dev", "agent")
    assert no["raw"] == "没有 ~/.kiro/agents/brain-dev.json"                  # where it goes: 细节
    bad = ok_row(P.agent_unreadable("读不了", "Permission denied"))
    assert bad["text"] == "brain-dev 的设置读不了" and bad["fix"] is None
    assert bad["raw"] == "Permission denied\n文件：~/.kiro/agents/brain-dev.json"   # the OS error and the file: 细节
    assert bad["todo"] == "自己修好它，或者删掉它再装一份新的（这里不会覆盖它）"
    unread = ok_row(P.agent_unreadable("读不懂：拦截那一段的写法认不出"))
    assert unread["text"] == "brain-dev 的设置读不懂：拦截那一段的写法认不出" and unread["raw"] == "文件：~/.kiro/agents/brain-dev.json"
    lacks = ok_row(P.agent_lacks([("userPromptSubmit", "UserPromptSubmit"), ("preToolUse", "PreToolUse")]))
    assert lacks["text"] == "brain-dev 的设置缺 Lean 的拦截：发消息、调用工具前" and lacks["fix"] == "agent"
    assert lacks["todo"] == "点「补上 Lean 的拦截」：只补上缺的（发消息、调用工具前），别的都不动"
    assert lacks["raw"] == "缺的 hook：userPromptSubmit、preToolUse"          # the trigger names only under 细节
    assert ok_row(P.agent_ok(0))["text"] == P.AGENT_OK == "brain-dev 的设置里 Lean 的拦截都在"
    assert P.agent_ok(2)["text"] == P.AGENT_OK + "（另有 2 个别的工具加的拦截，留着不动）"
    custom = ok_row(P.agent_custom(["model", "resources"]))
    assert custom["text"] == "brain-dev 用的是你自己的模型、资料" and custom["todo"] == ""
    assert custom["raw"].startswith("brain-dev 用的是你自己的 model、resources（") and "--reset" in custom["raw"]
    assert ok_row(P.engine("kas"))["text"] == "KiroCrew 引擎：kas" and P.engine("")["text"] == "KiroCrew 引擎：默认（kas）"
    other = ok_row(P.engine("kiro"))
    assert (other["level"], other["fix"]) == ("WARN", "engine") and "kas" in other["todo"]
    none = ok_row(P.engine(None, "no_kirocrew"))
    assert none["text"] == "找不到 KiroCrew 的命令行工具" and "~/.local/bin" in none["raw"]
    failed = ok_row(P.engine(None, "failed", "[Errno 13] Permission denied"))
    assert failed["level"] == "WARN" and failed["raw"] == ("[Errno 13] Permission denied\n"
                                                           "做法：kirocrew config get agent.acp_backend")
    git = ok_row(P.repo_unreadable(REPO, "fatal: not a git repository"))
    assert git["repo"] == REPO and git["raw"] == "fatal: not a git repository" and git["level"] == "FAIL"
    assert ok_row(P.crew_timeout(60))["level"] == "WARN"


# ---- brain lint ------------------------------------------------------------------------------------------------------ #

LINT = [
    ("FAIL", "TECH.md:12: id T-PAY-1-1 already used at TECH.md:3", "brain/TECH.md 第 12 行：条目号 T-PAY-1-1 重复了"),
    ("FAIL", "TECH.md:4: bad id 'T-1x' (want e.g. T-OMS-12-1)", "brain/TECH.md 第 4 行：条目号 T-1x 不对"),
    ("FAIL", "TECH.md:9: entry T-PAY-1-2 has no text", "brain/TECH.md 第 9 行：条目 T-PAY-1-2 没有正文"),
    ("FAIL", "TECH.md:9: type must be one of principle, decision, model, guideline, pitfall, correction (TECH)",
     "brain/TECH.md 第 9 行：类型不对：技术知识里只能用 原则、决定、模型、准则、坑、纠正"),
    ("FAIL", "TECH.md:9: side must be one of product, builder, shared", "brain/TECH.md 第 9 行：归属不对：只能是 产品、开发、共用"),
    ("FAIL", "TECH.md:9: side must be builder in TECH", "brain/TECH.md 第 9 行：归属不对：技术知识的条目归「开发」"),
    ("FAIL", "TECH.md:9: rel must be one of new, same, adds-to, replaces, repeats, withdraws",
     "brain/TECH.md 第 9 行：和别的条目的关系不对：只能是 新、只加来源、补充、取代、又出现、撤回"),
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
             "a key)", "brain/TECH.md 第 9 行：来源「见群聊」不是引用"),
    ("FAIL", "T-PAY-1-1 (TECH.md): file, type or side changed: replace the entry instead",
     "T-PAY-1-1（brain/TECH.md）：条目换了文件、类型或归属"),
    ("FAIL", "T-PAY-3-1 (TECH.md): a new entry is rel:new or rel:replaces <id>, not same",
     "T-PAY-3-1（brain/TECH.md）：新条目和别的条目的关系不对"),
    ("FAIL", "T-PAY-3-1 (TECH.md): a new entry needs src", "T-PAY-3-1（brain/TECH.md）：新条目没写来源"),
    ("FAIL", "T-PAY-1-1 (TECH.md): repeats went down (3 -> 1)", "T-PAY-1-1（brain/TECH.md）：重复次数变小了"),
    ("FAIL", "TECH.md:9: prop 'xyz' is not a proposal hash", "brain/TECH.md 第 9 行：条目头里回写留下的记号不对"),
    ("FAIL", "T-PAY-1-1: purged, but carol is not in purge_approvers (.brain/kit.json on the target branch)",
     "T-PAY-1-1：清除没有可批准的人"),
    ("FAIL", "T-PAY-1-1: purged, but it was never an entry", "T-PAY-1-1：清除的不是一个条目"),
    ("FAIL", "T-PAY-1-1: removed or changed in PURGED.md (it only grows)", "T-PAY-1-1：清除记录被改了"),
    ("FAIL", "PURGED.md: malformed line '- T-1 2026' (- <id> · <date> · pii|secret|confidential · approved by <user>)",
     "brain/PURGED.md：有一行格式不对"),
    ("FAIL", "TECH.md:9: attribute src given twice", "brain/TECH.md 第 9 行：条目头里有一项写了两次"),
    ("FAIL", "TECH.md: symlink in the Brain (lint and CI would not see edits to its target)", "brain/TECH.md：Brain 里有符号链接"),
    ("WARN", "TECH.md:9: relaxes a safety or quality rule: needs Builder and security approval",
     "brain/TECH.md 第 9 行：放宽了安全或质量规则"),
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


COMMAND = (r"brain (?:handoff|reflect|claim|entry|start|crew-agent)\b|lean verify|git (?:pull|push|fetch|rebase|remote)\b|"
           r"kirocrew config|D01#S|PKG-|（gate）|每个 run")


def test_what_to_do_is_said_in_words_never_a_command_or_a_code_name():
    """REST-29: a 做什么 line says the step; a command a person types is in a copy line or under 细节, never here."""
    rows = [P.lint(lv, raw) for lv, raw, _ in LINT] + [P.reason(raw) for raw, _ in REASONS] + \
        [P.row(lv, raw, repo=REPO) for lv, raw, _, _ in DOCTOR] + [P.engine(None, "failed", "x"), P.engine("kiro")]
    assert [r["todo"] for r in rows if re.search(COMMAND, r["todo"])] == []
    # the command that does it is kept with brain-kit's words, for a person who wants the terminal
    pull = P.row("WARN", "Brain vs origin/main: differs, merge or rebase")
    assert pull["raw"] == "Brain vs origin/main: differs, merge or rebase\n做法：git pull" and "拉进" in pull["todo"]
    model = P.row("FAIL", "brain-dev model: - (want claude-opus-5.5)", repo=REPO)
    assert model["raw"].endswith("\n做法：改 .kiro/agents/brain-dev.md 开头的 model")   # the file to edit: 细节
    assert P.row("WARN", "no origin remote: Brain freshness not checked")["raw"].endswith("git remote add origin <地址>")


def test_brain_kits_values_are_said_by_the_brain_pages_names():
    """A type, a side, a relation and a Brain file in brain lint's line are said as the Brain page names them; one the
    app has no name for stays as brain-kit wrote it; the 做什么 says it in words, the field to write is in its line."""
    r = P.lint("FAIL", "TECH.md:9: type must be one of pitfall, convention (TECH)")
    assert r["text"] == "brain/TECH.md 第 9 行：类型不对：技术知识里只能用 坑、convention"
    purge = ok_row(P.lint("FAIL", "T-PAY-1-1: purged, but carol is not in purge_approvers (.brain/kit.json on the target branch)"))
    assert purge["todo"] == "批准人 carol 要写进默认分支上 brain-kit 设置里能批准清除的人" and "purge_approvers" in purge["raw"]
    new = ok_row(P.lint("FAIL", "T-PAY-3-1 (TECH.md): a new entry is rel:new or rel:replaces <id>, not same"))
    assert new["todo"] == "新条目只能是「新」，或者「取代」一条现有的条目" and "rel:new" in new["raw"]
    moved = ok_row(P.lint("FAIL", "T-PAY-1-1 (TECH.md): file, type or side changed: replace the entry instead"))
    assert moved["todo"] == "改回去，再写一条取代它的新条目"
    odd = ok_row(P.lint("WARN", "TECH.md:12: a warning brain-kit learns tomorrow"))
    assert odd["todo"] == "看下面 brain-kit 的原话"


def legacy(where, eid):
    return "%s: legacy sequential id %s; new entries use <side>-<KEY>-<n>" % (where, eid)


def test_the_old_entry_ids_are_one_quiet_note_that_says_the_new_pattern_in_words():
    """brain lint warns about every entry id from before <side>-<KEY>-<n>: on a Brain of old entries that filled half
    the page and counted as 提醒 that need nothing. They are one OK note, at the end, naming them all."""
    real = "TECH.md:14: T-PAY-2-1 came back 2 times: make it a gate (a check that fails), not more text"
    olds = [legacy("PRODUCT.md:13", "P-7"), legacy("PROJECT.md:11", "J-3"), legacy("TECH.md:11", "T-12")]
    got = P.lint_rows(["TECH.md:20: source '见群聊' is not a reference (D01#S003)"], olds[:2] + [real] + olds[2:],
                      repo=REPO, prefix="ORD")
    assert [r["level"] for r in got["errors"]] == ["FAIL"]
    assert [r["level"] for r in got["warnings"]] == ["WARN", "OK"]
    note = ok_row(got["warnings"][-1])
    assert note["text"] == "P-7、J-3、T-12 是旧式条目号，不用改。新条目的编号是 字母-需求号-序号，比如 P-ORD-3-1"
    assert note["todo"] == "" and note["raw"] == "\n".join(olds) and note["repo"] == REPO
    many = P.lint_rows([], [legacy("TECH.md:%d" % i, "T-%d" % i) for i in range(1, 13)])["warnings"]
    assert len(many) == 1 and many[0]["text"].startswith("T-1、T-2、T-3、T-4、T-5、T-6、T-7、T-8 等 12 条是旧式条目号")
    assert "比如 P-PAY-3-1" in many[0]["text"]
    assert ok_row(P.lint("WARN", olds[0]))["level"] == "OK"
    assert P.lint_rows([], [real]) == {"errors": [], "warnings": [P.lint("WARN", real)]}


def test_an_unknown_lint_line_keeps_its_where():
    r = ok_row(P.lint("FAIL", "TECH.md:12: something brain-kit learns tomorrow"))
    assert r["text"] == "brain/TECH.md 第 12 行：格式不对" and r["raw"] == "TECH.md:12: something brain-kit learns tomorrow"
    w = ok_row(P.lint("WARN", "T-PAY-1-1 (PROJECT.md): a new warning", brain_dir="docs/brain"))
    assert w["text"] == "T-PAY-1-1（docs/brain/PROJECT.md）：要看一眼" and w["level"] == "WARN"


# ---- why a hand-over (or an answer) was not taken -------------------------------------------------------------------- #

REASONS = [
    ("branch feature/x is not ai/<owner>/<JIRA>-<slug>", "这个分支不是开工时建的"),
    ("MR comes from a fork", "MR 是从复制出去的仓库开的"),
    ("MR targets develop, not main", "MR 要合进 develop，不是 main"),
    ("bot branches are not handed over", "机器人账号的分支不能交接"),
    ("label 'ai-handoff' was added by bob, not by the branch owner alice", "标签是 bob 打的，不是负责人 alice"),
    ("GitLab shows no MR version with head 0123456789ab: add the label 'ai-handoff' again once the push shows on the MR",
     "GitLab 还没记下这次推送"),
    ("0123456789ab was pushed (2026-11-09T10:00:00Z) after the label 'ai-handoff' was added (2026-11-09T09:00:00Z): that "
     "commit was not handed over; look at it, then run `brain handoff` again (it hands over a new commit on top)",
     "打标签之后分支又有了新推送"),
    ("alice is not in brain-authz identities", "运行机的身份名单里没有 alice"),
    ("PAY-3 has no claim (branch claim/PAY-3); run `brain claim`", "PAY-3 没认领"),
    ("claim.json owner bob is not the branch owner alice", "负责人和认领记录对不上"),
    ("run.json missing at 0123456789ab", "这次提交里没有开工记录"),
    ("run.json has no hand-over (run `brain handoff`)", "这个分支还没交接过"),
    ("run.json: intent must be a Lean intent folder name (yymmdd-slug)", "开工记录有问题"),
    ("the MR head 0123456789ab is a merge, not the hand-over commit `brain handoff` makes: run it again",
     "MR 最新的提交是一个合并，不是交接提交"),
    ("the MR head 0123456789ab was made by a bot account (bot@example.com), not by `brain handoff`: a runner's commit is "
     "never handed over; look at it, then run `brain handoff` again", "MR 最新的提交是机器人账号做的"),
    ("the MR head 0123456789ab is not the hand-over commit (it does not change runs/PAY-3/run.json): a commit pushed after "
     "`brain handoff` was not handed over; look at it, then run `brain handoff` again", "MR 最新的提交不是交接提交"),
    ("material PKG-PAY-3-1 is not published to brain-intake", "有一份材料还没发布到材料库"),
    ("material PKG-PAY-3-1 in brain-intake differs from run.json", "材料库里的一份材料和开工时的不一样"),
    ("Lean hand-over note aidlc-docs/261109-pay/aidlc-state.md missing", "还没有交接说明"),
    ("hand-over note: Session notes have no '### Next' items", "交接说明没写好"),
    ("brain_commit 0123456789ab does not exist", "开工时用的那一版 Brain 在仓库里找不到了"),
    ("PAY-3 already has an open run on the team runner", "运行机上 PAY-3 还有一次没做完"),
    ("凭证和签名服务按 GitLab 重建的不一样：sha、branch", "凭证和 GitLab 上的对不上"),
    ("D-2 收到不同的回答，不签", "D-2 收到了不同的回答"),
    ("MR 上没有可以回答 D-1 的人的有效回答", "D-1 还没有有效回答"),
    ("the signer did not answer handoff-RUN-PAY-9-1-0a1b2c3d4e5f within 30s", "签名服务 30 秒内没答复"),
    ("grp/pay: .brain/kit.json not found on main", "grp/pay 的默认分支 main 上还没装 brain-kit"),
    ("GET /projects/grp%2Fpay/merge_requests -> HTTP 401: {\"message\":\"401 Unauthorized\"}", "GitLab 不认桥的令牌"),
    ("D-2 作废：问题发出后分支又有了新推送（the MR head moved from 0123456789ab to ba9876543210 after the question）",
     "D-2 作废：分支又有了新推送"),
]


@pytest.mark.parametrize("raw, text", REASONS)
def test_handover_and_signer_reasons(raw, text):
    """REST-12: what is wrong and what to do in words; brain-kit's line (and the command it takes) under 细节."""
    r = ok_row(P.reason(raw))
    assert (r["level"], r["text"]) == ("FAIL", text) and r["raw"].startswith(raw) and r["todo"]
    said = r["text"] + r["todo"]
    assert not re.search(r"\.json|\.md|\brun\b|rebase|token|brain-authz|brain-intake|claim/|PKG-|`", said), said


def test_a_reason_that_takes_a_command_keeps_it_under_details():
    r = P.reason("brain_commit 0123456789ab does not exist")
    assert r["todo"] == "让这个分支跟上默认分支的最新版，再交接一次" and r["raw"].endswith("做法：git rebase <默认分支>")


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
    assert P.row("OK", "  Brain vs   origin/main:\n same ")["text"] == "Brain 和远端 main 上的一样"
    assert P.row("WARN", "")["text"] == "brain-kit 提醒了一件事"
    # a runner-only problem said at WARN becomes FAIL for a team repo; an OK row stays OK whoever it is for
    assert P.row("WARN", OLDER, repo=REPO, team=True)["level"] == "FAIL"
    assert P.row("OK", "Lean does not count runs/ as code (x)", team=False)["level"] == "OK"
    assert P.mk("OK", "好", "不该有", "kit")["todo"] == "" and P.mk("FAIL", "坏", fix="nope")["fix"] is None


# ---- why the team runner's bridge did not start ---------------------------------------------------------------------- #

def _start_errors() -> list[str]:
    """Every error bridgehost.TeamRuntime.start raises itself, read from its source (the first string literal, %s
    filled), and brain-kit's load_bridge_config ones (bridge/handoff.py, sign.signer_problems)."""
    import ast
    from pathlib import Path
    src = (Path(__file__).resolve().parents[1] / "backend" / "core" / "team" / "bridgehost.py").read_text(encoding="utf-8")
    own = [ast.literal_eval(m.group(1)).replace("%s", "/etc/brain/x.json")
           for m in re.finditer(r'BrainError\(("(?:[^"\\]|\\.)*")', src)]
    assert len(own) >= 8, own
    return own + ["bridge config: spool_dir is required", "bridge config: signing_key is required (or a signer of type spool)",
                  "bridge config: signer.allowed_signers is required for a spool signer", "bridge config: projects is empty",
                  "[Errno 2] No such file or directory: '/etc/brain/bridge.json'", "brain-kit 没装载"]


@pytest.mark.parametrize("raw", _start_errors())
def test_a_bridge_that_did_not_start_says_what_is_wrong_and_what_to_do_in_words(raw):
    """运行机 page (REST-29): the start error in words with its 做什么; the file names and keys only under 细节."""
    got = P.team_start(raw)
    assert got["raw"] == " ".join(raw.split())
    assert got["text"] != "桥没准备好", raw              # every one the app or brain-kit says has its own words
    said = got["text"] + got["todo"]
    assert got["todo"] and not CODE_WORD.search(said) and not re.search(r"[A-Za-z]{4,}|/", re.sub("GitLab|brain-kit", "", said)), got


def test_a_bridge_error_nobody_mapped_keeps_it_under_details():
    assert P.team_start("something brain-kit says tomorrow") == {
        "text": "桥没准备好", "todo": P.TEAM_START_TODO, "raw": "something brain-kit says tomorrow"}
    assert P.team_start("") == {"text": "", "todo": "", "raw": ""}


def test_no_backend_module_defines_a_name_twice():
    """A second top-level START_RULES in problems.py once replaced the first, so `brain start`'s 「PAY-2 是 bob 认领的」
    quietly fell back to brain-kit's English: a module-level name (rule table, function, class) is defined once."""
    import ast
    import collections
    from pathlib import Path
    twice = {}
    for f in sorted((Path(__file__).resolve().parents[1] / "backend" / "core").glob("*.py")):
        seen = collections.Counter()
        for n in ast.parse(f.read_text(encoding="utf-8")).body:
            if isinstance(n, ast.Assign):
                seen.update(t.id for t in n.targets if isinstance(t, ast.Name))
            elif isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name):
                seen[n.target.id] += 1
            elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                seen[n.name] += 1
        dup = sorted(k for k, v in seen.items() if v > 1 and k != "__all__")
        if dup:
            twice[f.name] = dup
    assert twice == {}
