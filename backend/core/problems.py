"""What brain-kit (and the app's own checks) say, as a person reads it: plain short Chinese, one 做什么 line, the
one-click fix when the app has one, and brain-kit's own words kept (``raw``: the page shows them folded, for
debugging). Pure: no I/O, no brain-kit import; the patterns are brain-kit 48b6b97's and d46765f's strings (and
91e2fee's words for who the person is).

A CheckRow is ``{"level", "text", "todo", "fix", "repo", "raw"}``:

  level  OK | WARN | FAIL (WARN: a reminder, stops nothing)
  text   what is wrong (or right), short plain Chinese: file names, fields, values and commands go in raw
  todo   做什么, one line ('' for an OK row, or when there is nothing to do), in words too
  fix    'agent' (add Lean's hooks to ~/.kiro/agents/brain-dev.json), 'engine' (kirocrew engine kas), 'kit'
         (reinstall brain-kit and commit it, POST /import/upgrade: in the checkout on its branch by default, or on a
         new branch for an MR), 'me' (the name brain-kit goes by in the repo: the page's input, POST /me/name, which
         sets git config brain.user there), or None
  repo   the repo path the row is about (None: machine-wide)
  raw    the original text ('' when the row is the app's own words and there is nothing more to show), and the
         way to do the 做什么 by hand (a command, the file to edit) as 「做法：…」

Severity: what matters only to a repo that is handed to the team runner (the hook adapter's version, Lean counting
runs/** as code) is FAIL for such a repo (``team=True``), a WARN reminder for a local-only one (``team=False``), and
as brain-kit said it when that is not known (``team=None``). A 'kit' fix needs a repo to reinstall into: a row
without ``repo`` (brain doctor's lines in an install worktree) has none.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

LEVELS = ("OK", "WARN", "FAIL")
FIXES = ("agent", "engine", "kit", "me")
ME_TODO = "在下面填上，点「保存」（记在这个仓库的 git 设置里）"
ME_GITLAB = "要你在 GitLab 上的用户名：认领和交接都按它认人。" + ME_TODO
AGENT_OK = "brain-dev 的设置里 Lean 的拦截都在"   # crewcheck.agent_ok accepts the OK row whose text starts with it
AGENT_MISSING = "KiroCrew 里还没有 brain-dev"
AGENT_PATH = "~/.kiro/agents/brain-dev.json"
TRIGGER_NAMES = {"agentSpawn": "会话开始", "userPromptSubmit": "发消息", "preToolUse": "调用工具前"}
TRACKER_NAME = {"none": "不用 Jira", "jira": "用 Jira"}
EVENT_TRIGGER = {"SessionStart": "agentSpawn", "UserPromptSubmit": "userPromptSubmit", "PreToolUse": "preToolUse"}

# brain-kit's values in its lines, by the names the app shows for them (the Brain page's, ui/src/views/Brain.tsx):
# a regex group of one of these names holds such values (one, or a list joined by ", ")
VALUE_NAMES: dict[str, dict[str, str]] = {
    "types": {"principle": "原则", "correction": "纠正", "decision": "决定", "model": "模型", "guideline": "准则",
              "pitfall": "坑", "process": "流程"},
    "side": {"product": "产品", "builder": "开发", "shared": "共用"},
    "rels": {"new": "新", "same": "只加来源", "adds-to": "补充", "replaces": "取代", "repeats": "又出现", "withdraws": "撤回"},
    "file": {"PRODUCT": "产品知识", "TECH": "技术知识", "IMPROVEMENT": "改进知识", "PROJECT": "项目知识"},
    # brain-dev.json's fields brain-kit owns (cli.CREW_OWNED_FIELDS)
    "fields": {"name": "名字", "description": "说明", "model": "模型", "prompt": "提示词", "tools": "工具", "resources": "资料"},
}

# the fix buttons' names (ui.tsx CheckRows shows the name a row's 做什么 gives in 点「…」, these): every text that
# points at a button says its name
FIX_BUTTON = {"agent": "补上 Lean 的拦截", "engine": "把引擎换成 kas", "kit": "重装 kit 文件"}
AGENT_NEW = "装上 brain-dev"      # the agent fix when ~/.kiro/agents/brain-dev.json is not there at all
REINSTALL = "点「%s」：重装 brain-kit 并提交（默认直接在当前分支上，团队仓库可以选新分支开 MR）" % FIX_BUTTON["kit"]
AGENT_NEW_TODO = "点「%s」：装上 brain-kit 带的那一份；没有它，Lean 的拦截在 KiroCrew 里不会跑" % AGENT_NEW
UNREADABLE_TODO = "自己修好它，或者删掉它再装一份新的（这里不会覆盖它）"
ADAPTER = "Lean 的适配文件"         # .kiro/brain/lean-hook.py: KiroCrew sessions run Lean's hooks through it
RECORDS = "变更说明和 AI 停下来写的问题"   # runs/<KEY>/MR.md and park.json, which Lean's code fingerprint must leave out
LOCAL_ONLY = "只有把需求交给运行机时才要紧"
GENERIC_TEXT = {"FAIL": "brain-kit 报了一个问题", "WARN": "brain-kit 提醒了一件事", "OK": "brain-kit：这项通过"}
GENERIC_TODO = {"FAIL": "看下面 brain-kit 的原话；看不懂就问维护 brain-kit 的人",
                "WARN": "看一眼下面 brain-kit 的原话（只是提醒，不拦东西）", "OK": ""}


def mk(level: str, text: str, todo: str = "", fix: str | None = None, repo: str | None = None,
       raw: str = "") -> dict[str, Any]:
    """A CheckRow in the app's own words."""
    return {"level": norm_level(level), "text": text, "todo": todo if norm_level(level) != "OK" else "",
            "fix": fix if fix in FIXES else None, "repo": repo or None, "raw": raw or ""}


def norm_level(level: Any) -> str:
    lv = str(level or "").strip().upper()
    return lv if lv in LEVELS else "WARN"


# ---- the pattern table ------------------------------------------------------------------------------------------ #

class Rule:
    """One of brain-kit's sayings. *text* / *todo*: format strings over the regex's named groups, or callables of
    (groups, level) when the words depend on the level (brain doctor says some lines at OK or FAIL); *runner*: it
    matters only to a repo handed to the team runner (*local*: the todo for a local-only one); *search*: found
    anywhere in the line, not only at its start; *level*: the level the app says it at, whatever brain-kit said (a
    note brain-kit warns about that needs nothing done); *how*: how to do the 做什么 by hand (the command, the file
    to edit), kept with the raw (细节) as 「做法：…」, never in the 做什么 line."""

    def __init__(self, rx: str, text: Any, todo: Any = "", fix: str | None = None, *, runner: bool = False,
                 local: Any = "", search: bool = False, level: str | None = None, how: str = "") -> None:
        self.rx = re.compile(rx, re.S)
        self.text, self.todo, self.fix = text, todo, fix
        self.runner, self.local, self.search, self.level, self.how = runner, local, search, level, how

    def match(self, s: str) -> "re.Match | None":
        return self.rx.search(s) if self.search else self.rx.match(s)


def _f(v: Any, g: dict[str, str], level: str) -> str:
    if callable(v):
        return str(v(g, level))
    return str(v).format(**g) if v else ""


def said(kind: str, v: str) -> str:
    """brain-kit's value(s) *v* of a VALUE_NAMES kind by the app's names, joined by 「、」 (one it does not know stays)."""
    names = VALUE_NAMES[kind]
    return "、".join(names.get(x.strip(), x.strip()) for x in v.split(",") if x.strip())


def _groups(hit: "re.Match") -> dict[str, str]:
    """A match's groups, those that hold brain-kit's values (VALUE_NAMES) by the app's names, a ref origin/<b> as
    远端的 <b>."""
    g = {k: v or "" for k, v in hit.groupdict().items()}
    for k, v in g.items():
        if k in VALUE_NAMES:
            g[k] = said(k, v)
        elif k == "ref" and v.startswith("origin/"):
            g[k] = "远端的 " + v[len("origin/"):]
    return g


def _tool_name(tool: str) -> str:
    return "KiroCrew" if tool == "kirocrew" else tool


def _version(g: dict[str, str], key: str) -> str:
    """kiro-cli prints its name before its version ('kiro-cli 3.0.1'): the version alone."""
    v = g[key].strip()
    return v[len(g["tool"]):].strip() if v.lower().startswith(g["tool"].lower()) else v


OLDER_REFUSES = "改了 kit 文件（Lean 的文件、brain-kit 设置、检查规则）以后，它不会拦下工具调用"


def _older_adapter(g: dict[str, str]) -> str:
    """What an older hook adapter cannot do (brain-kit cli.crew_hook_problem): before version 2 the run on the team
    runner cannot stop to ask a person before the Lean approvals; before 3 it lets tool calls on after the kit's own
    files were changed."""
    if int(g.get("have") or 0) < 2:
        return "运行机上的 AI 在 Lean 审批之前没法停下来问人"
    return OLDER_REFUSES


def _hook_names(raw: str) -> str:
    """'agentSpawn, preToolUse' (brain-kit's trigger names) as the Chinese names."""
    names = [x.strip() for x in raw.split(",") if x.strip()]
    return "、".join(TRIGGER_NAMES.get(n, TRIGGER_NAMES.get(EVENT_TRIGGER.get(n, ""), n)) for n in names)


RULES: list[Rule] = [
    # cli.runner_kit_problems / doctor_checks (d46765f): the hook adapter is too old for the team runner
    Rule(r"^(?P<path>\S+) is an older adapter \(version (?P<have>\d+), needs (?P<need>\d+)\)",
         ADAPTER + "是旧版（第 {have} 版，要第 {need} 版）",
         lambda g, lv: _older_adapter(g) + "。" + REINSTALL, "kit", runner=True,
         # this machine's KiroCrew sessions run the same adapter: what every older version lacks here too
         local=lambda g, lv: "本机会话里也一样：%s。点「%s」" % (OLDER_REFUSES, FIX_BUTTON["kit"])),
    # cli.runner_kit_problems: Lean / the adapter only on this disk, not in git (worktrees are made from main)
    Rule(r"^(?P<path>\S+) is not committed: AI-DLC Lean;", "AI-DLC Lean 没提交到 git",
         "app 的工作目录从默认分支建，没提交的 Lean 不在里面。" + REINSTALL, "kit"),
    Rule(r"^(?P<path>\S+) is not committed: the KiroCrew hook adapter", ADAPTER + "没提交到 git",
         "app 的工作目录从默认分支建，没有它会话里每次调用工具都会被拦。" + REINSTALL, "kit"),
    Rule(r"^(?P<path>\S+) is not committed: (?P<what>.+?); commit it on main through an MR", "有一个 kit 文件没提交到 git",
         "app 的工作目录从默认分支建，没提交的文件不在里面。" + REINSTALL, "kit"),
    # mrdesc.write_problem (+ exclude_fix), in crewcheck's row and in brain doctor's
    Rule(r"(?P<runs>[^\s/：:]+)/ 下的文件（MR\.md、park\.json）算在 Lean 的代码指纹里",
         "Lean 把%s也算成代码" % RECORDS,
         "交接会被拒。点「%s」：重装以后 Lean 就不算它们了（由人看过再合并）" % FIX_BUTTON["kit"], "kit",
         runner=True, local=LOCAL_ONLY + "（那时交接会被拒）。要交的话点「%s」：重装以后 Lean 就不算它们了"
         % FIX_BUTTON["kit"], search=True),
    # cli.doctor_checks
    Rule(r"^kit config valid \((?P<path>[^)]+)\), tracker (?P<tracker>\S+), keys (?P<prefix>\S+)-<n>$",
         lambda g, lv: "这个仓库的 brain-kit 设置没问题（需求号 %s-n，%s）" % (
             g["prefix"], TRACKER_NAME.get(g["tracker"], g["tracker"]))),
    Rule(r"^AI-DLC Lean doctor: ok$", "AI-DLC Lean 自检通过"),
    Rule(r"^AI-DLC Lean doctor: .*hooks have never run here", "Lean 的拦截在这里还没跑过：开过 brain-dev 会话以后就有了",
         level="OK"),
    Rule(r"^AI-DLC Lean doctor: (?P<last>.+)$", "AI-DLC Lean 自检有提醒",
         "看下面 Lean 的原话（它只提醒，不拦东西）"),
    Rule(r"^Lean does not count (?P<runs>\S+?)/ as code", "Lean 不把%s算成代码" % RECORDS),
    Rule(r"^(?P<path>\S+) lets a run write its own \S+/<KEY>/park\.json .*\(version (?P<v>\d+)\)$",
         ADAPTER + "是新版（第 {v} 版）"),
    Rule(r"^(?P<path>\S+) missing in this repo \(run `brain install`\)", "仓库里没有 " + ADAPTER,
         "KiroCrew 的会话靠它跑 Lean。" + REINSTALL, "kit"),
    Rule(r"^AI-DLC Lean not installed$", "没装 AI-DLC Lean", REINSTALL, "kit"),
    Rule(r"^brain-dev model: (?P<have>\S+) \(want (?P<want>[^)]*)\)$",
         lambda g, lv: ("brain-dev 的模型是 %s" % g["have"]) if lv == "OK" else
         ("brain-dev 的模型是 %s，要 %s" % (g["have"], g["want"])),
         "改仓库里 brain-dev 的模型，或者重装 brain-kit", how="改 .kiro/agents/brain-dev.md 开头的 model"),
    Rule(r"^brain-dev forbidden tools: none$", "brain-dev 没带禁用的工具"),
    Rule(r"^brain-dev forbidden tools: (?P<bad>.+)$", "brain-dev 带着禁用的工具：{bad}",
         "从仓库里 brain-dev 的工具里去掉它们", how="改 .kiro/agents/brain-dev.md 开头的 tools"),
    Rule(r"^missing \.kiro/agents/brain-dev\.md", "仓库里没有 brain-dev", REINSTALL, "kit"),
    Rule(r"^Brain files in (?P<dir>[^:]+?)/: all present$", "Brain 文件都在"),
    Rule(r"^Brain files in (?P<dir>[^:]+?)/: missing (?P<names>.+)$", "缺 Brain 文件：{names}",
         "点「%s」：会补上缺的（已有的不动）" % FIX_BUTTON["kit"], "kit"),
    Rule(r"^AGENTS\.md at repo root$", lambda g, lv: "有 AGENTS.md" if lv == "OK" else "仓库根目录没有 AGENTS.md",
         "点「%s」：会补上它" % FIX_BUTTON["kit"], "kit"),
    Rule(r"^(?P<dir>\S+?)/ is git-ignored", lambda g, lv: "需求材料不进 git" if lv == "OK" else "需求材料可能被提交进 git",
         "需求材料不能进 git：点「%s」，会让 git 忽略它们" % FIX_BUTTON["kit"], "kit"),
    Rule(r"^cannot fetch origin/(?P<b>\S+): Brain freshness unknown$", "取不到远端的 {b}：不知道 Brain 是不是最新",
         "检查网络，或者刷新你的 SSH 凭据（ssh-add 加上密钥，或者重新登录你们的 SSH 证书），再检查一次"),
    Rule(r"^Brain vs origin/(?P<b>\S+): same$", "Brain 和远端 {b} 上的一样"),
    Rule(r"^Brain vs origin/(?P<b>\S+): differs", "Brain 和远端 {b} 上的不一样",
         "把远端 {b} 的新提交拉进这个仓库", how="git pull"),
    Rule(r"^no origin remote: Brain freshness not checked$", "没有远端：没查 Brain 是不是最新",
         "只在本机做就不用管；要推送和开 MR 时，再给这个仓库加上远端地址", how="git remote add origin <地址>"),
    Rule(r"^kirocrew not found on PATH$", "找不到 KiroCrew 的命令行工具", "app 会自己去 KiroCrew 装的地方找它，一般不用管"),
    Rule(r"^kiro-cli not found on PATH$", "找不到 kiro-cli", "装上 kiro-cli，或者让终端找得到它",
         how="把 kiro-cli 所在的目录加进 PATH"),
    Rule(r"^(?P<tool>kiro-cli|kirocrew) version (?P<have>.+), pinned (?P<want>.+)$",
         lambda g, lv: "%s 的版本是 %s，要 %s" % (_tool_name(g["tool"]), _version(g, "have"), _version(g, "want")),
         "换成 brain-kit 设置里定的版本，或者改那里定的版本", how="改 .brain/kit.json 的 pins"),
    Rule(r"^(?P<tool>kiro-cli|kirocrew) (?P<have>.+?)(?: \(not pinned\))?$",
         lambda g, lv: "%s %s" % (_tool_name(g["tool"]), _version(g, "have"))),
    # cli.crew_checks (brain doctor's KiroCrew lines)
    Rule(r"^KiroCrew: ~/\.kiro/agents/brain-dev\.json missing", AGENT_MISSING, AGENT_NEW_TODO, "agent"),
    Rule(r"^KiroCrew brain-dev carries Lean's 3 hooks$", "KiroCrew 的 brain-dev 设置里 Lean 的拦截都在"),
    Rule(r"^KiroCrew brain-dev\.json lacks Lean's (?P<t>.+?) hook\(s\)",
         lambda g, lv: "brain-dev 的设置缺 Lean 的拦截：%s" % _hook_names(g["t"]),
         lambda g, lv: "点「%s」：只补上缺的（%s），别的都不动" % (FIX_BUTTON["agent"], _hook_names(g["t"])),
         "agent"),
    Rule(r"^KiroCrew brain-dev\.json has no (?P<fields>.+?) \(", "brain-dev 的设置里没有{fields}",
         "让 brain-kit 在终端里补上缺的设置（你自己的设置都留着）", how="brain crew-agent --force"),
    Rule(r"^KiroCrew brain-dev uses your own (?P<fields>.+?) \(", "brain-dev 用的是你自己的{fields}"),
    Rule(r"^~/\.kiro/agents/brain-dev\.json is not valid JSON", "brain-dev 的设置读不懂：文件格式坏了", UNREADABLE_TODO),
    Rule(r"^KiroCrew engine: (?P<be>default \(KAS\)|kas)$",
         lambda g, lv: "KiroCrew 引擎：%s" % ("默认（kas）" if g["be"].startswith("default") else "kas")),
    Rule(r"^KiroCrew engine: (?P<be>\S+)", "KiroCrew 引擎是 {be}，不是 kas",
         "点「%s」：Lean 的拦截只在 kas 上测过" % FIX_BUTTON["engine"], "engine"),
    # cli._me: brain-kit does not know who the person is (48b6b97's words, and the ones after it)
    Rule(r"^who are you\? this repo uses GitLab \((?P<base>[^)]*)\)", "brain-kit 不知道你是谁：这个仓库用 GitLab（{base}）",
         ME_GITLAB, "me"),
    Rule(r"^who are you\? your login name is not usable", "brain-kit 不知道你是谁：这台机器的登录名不能当名字",
         "写一个名字（小写字母、数字、. _ -）。" + ME_TODO, "me"),
    Rule(r"^who are you\?", "brain-kit 不知道你是谁",
         "填上你的名字（用 GitLab 的仓库填 GitLab 用户名）。" + ME_TODO, "me"),
    Rule(r"^brain\.user '?(?P<u>.*?)'? is not a GitLab username", "这个仓库记下的名字（{u}）不能用",
         "改成你在 GitLab 上的用户名（小写字母、数字、. _ -）。" + ME_TODO, "me"),
    # brain: BrainError as `brain` prints it for a refused hand-over (cmd_handoff)
    Rule(r"^not handed over: Lean would refuse this run's RELEASE approval later", "没交出去：Lean 把%s也算成代码" % RECORDS,
         "点「%s」：重装以后 Lean 就不算它们了（由人看过再合并），再交接" % FIX_BUTTON["kit"], "kit"),
    Rule(r"^the team runner could not run this branch: ", "没交出去：运行机跑不了这个分支", REINSTALL, "kit"),
]

# the app's older texts of the same rows (before this module): read back the same way
OLD_PREFIX = re.compile(r"^仓库 (?P<name>[^：\s]+)：")


def row(level: Any, raw: Any, *, repo: str | None = None, team: bool | None = None) -> dict[str, Any]:
    """*raw* (what brain-kit, or the app's older code, said) as a CheckRow. Unknown text: a generic Chinese line by
    level, the raw kept; a Chinese line nobody mapped is shown as it is."""
    lv = norm_level(level)
    s = " ".join(str(raw or "").split())
    body = s
    m = OLD_PREFIX.match(body)
    if m:
        body = body[m.end():]
    if body.startswith("brain: "):
        body = body[len("brain: "):]
    for r in RULES:
        hit = r.match(body)
        if not hit:
            continue
        g = _groups(hit)
        level_now = r.level or lv
        text, todo = _f(r.text, g, level_now), _f(r.todo, g, level_now)
        if r.runner and team is not None:
            if not team and level_now == "FAIL":
                level_now = "WARN"
            if not team:
                todo = _f(r.local, g, level_now) or todo
            elif level_now == "WARN":
                level_now = "FAIL"
        fix = r.fix if level_now != "OK" else None
        if fix in ("kit", "me") and not repo:
            fix = None
        more = r.how and level_now != "OK" and r.how not in s       # brain-kit's words may name it already
        return mk(level_now, text, todo, fix, repo, "%s\n做法：%s" % (s, r.how) if more else s)
    return fallback(lv, s, repo=repo)


def who_row(output: Any, *, repo: str | None = None) -> dict[str, Any] | None:
    """The line of brain's *output* that says brain-kit does not know who the person is, as a FAIL row with the 'me'
    fix; None when there is none."""
    for line in str(output or "").splitlines():
        r = row("FAIL", line, repo=repo)
        if r["fix"] == "me":
            return r
    return None


# why `brain start` stopped (cmd_start, claims.claim), said as what to do on the page
START_RULES: list[tuple[re.Pattern, str, str]] = [(re.compile(rx), t, d) for rx, t, d in (
    (r"^(?P<k>\S+) is (?:already )?claimed by (?P<o>\S+)$", "{k} 是 {o} 认领的", "只有 {o} 能开工：问问 {o}，或者开一个新需求"),
    (r"^(?P<k>\S+) is closed \((?P<why>.*)\)$", "{k} 已经关了（{why}）", "开一个新需求"),
    (r"^(?P<p>\S+) already exists on (?P<ref>\S+): this requirement already has a run$", "这个需求已经开过工了",
     "{ref} 上已经有它的开工记录：去需求看板看它"),
    (r"^branch (?P<b>\S+) already exists(?: on origin)?$", "分支 {b} 已经有了", "换一个英文短名再开工"),
    (r"^\.brain/kit\.json is missing", "开工的地方没有 brain-kit",
     "开工从远端的默认分支建分支，那里还没有 brain-kit：先推送默认分支（导入仓库里「推送」），或者等 MR 合并"),
    (r"^AI-DLC Lean is not installed", "开工的地方没有 AI-DLC Lean",
     "默认分支上要有 Lean：在「设置」的 KiroCrew 里点「%s」，提交并推送" % FIX_BUTTON["kit"]),
    (r"^could not push claim (?P<k>\S+): ", "认领 {k} 没推上去", "看细节里的原话：多半是网络或权限"),
)]


def start_row(output: Any, *, repo: str | None = None) -> dict[str, Any] | None:
    """Why `brain start` stopped, from its *output*: not knowing who the person is (the 'me' fix, who_row), or one of
    START_RULES, as a FAIL row with the line kept in raw; None when no line is known."""
    who = who_row(output, repo=repo)
    if who:
        return who
    for line in str(output or "").splitlines():
        s = " ".join(line.split())
        body = s[len("brain: "):] if s.startswith("brain: ") else s
        for rx, text, todo in START_RULES:
            hit = rx.match(body)
            if hit:
                g = _groups(hit)
                return mk("FAIL", text.format(**g), todo.format(**g), None, repo, s)
    return None


def fallback(level: Any, raw: str, *, repo: str | None = None, todo: str = "") -> dict[str, Any]:
    """A text no rule knows: Chinese stays as it is (cut at its first 「：」 when long, the rest kept in raw); anything
    else gets the generic line by level. The raw is never dropped."""
    lv = norm_level(level)
    s = " ".join(str(raw or "").split())
    if chinese(s):
        if len(s) <= 40:
            return mk(lv, s, todo, None, repo, "")
        head = re.split(r"[：；。（]", s, 1)[0].strip() or s[:30]
        return mk(lv, head[:40], todo or GENERIC_TODO[lv], None, repo, s)
    return mk(lv, GENERIC_TEXT[lv], todo or GENERIC_TODO[lv], None, repo, s)


CJK_RE = re.compile(r"[㐀-鿿豈-﫿]")
WORD_RE = re.compile(r"(?<![\w./`<~-])[A-Za-z]{2,}(?![\w./`>-])")


def chinese(s: str) -> bool:
    """Mostly Chinese (code names such as `lean.json` or runs/** do not count as English)."""
    cjk = len(CJK_RE.findall(s or ""))
    return cjk >= 2 and cjk >= 2 * len(WORD_RE.findall(s or ""))


def rows(level_text: Iterable[tuple[Any, Any]], *, repo: str | None = None,
         team: bool | None = None) -> list[dict[str, Any]]:
    return [row(lv, t, repo=repo, team=team) for lv, t in level_text]


# ---- the app's own rows (crewcheck) ---------------------------------------------------------------------------- #

def brainkit_missing() -> dict[str, Any]:
    return mk("FAIL", "brain-kit 没装载", "在「设置」里写对 brain-kit 的位置")


def brainkit_old(lacking: list[str]) -> dict[str, Any]:
    return mk("FAIL", "brain-kit 太旧", "把 brain-kit 更新到新版本", raw="这个版本的 brain-kit 缺：%s" % "、".join(lacking))


def agent_missing() -> dict[str, Any]:
    return mk("FAIL", AGENT_MISSING, AGENT_NEW_TODO, "agent", raw="没有 %s" % AGENT_PATH)


def agent_unreadable(why: str, detail: str = "") -> dict[str, Any]:
    """*why*: 读不了 or 读不懂：<what> (crewcheck._load); *detail*: the OS error, if any."""
    return mk("FAIL", "brain-dev 的设置" + why, UNREADABLE_TODO, None, None,
              "\n".join(x for x in (detail, "文件：" + AGENT_PATH) if x))


def trigger_names(missing: list[tuple[str, str]]) -> str:
    return "、".join(TRIGGER_NAMES.get(t, t) for t, _ in missing)


def agent_lacks(missing: list[tuple[str, str]]) -> dict[str, Any]:
    return mk("FAIL", "brain-dev 的设置缺 Lean 的拦截：%s" % trigger_names(missing),
              "点「%s」：只补上缺的（%s），别的都不动" % (FIX_BUTTON["agent"], trigger_names(missing)), "agent",
              raw="缺的 hook：%s" % "、".join(t for t, _ in missing))


def agent_ok(others: int) -> dict[str, Any]:
    return mk("OK", AGENT_OK + ("（另有 %d 个别的工具加的拦截，留着不动）" % others if others else ""))


def agent_custom(fields: list[str]) -> dict[str, Any]:
    names = "、".join(fields)
    return mk("OK", "brain-dev 用的是你自己的%s" % said("fields", ",".join(fields)),
              raw="brain-dev 用的是你自己的 %s（`brain crew-agent --reset` 换回 brain-kit 的；--force 只补缺的）" % names)


def engine(be: str | None, why: str = "", detail: str = "") -> dict[str, Any]:
    """The KiroCrew engine row: *be* None (not known: *why* is no_kirocrew or failed), '' or 'kas', or another."""
    if be is None:
        if why == "no_kirocrew":
            return mk("WARN", "找不到 KiroCrew 的命令行工具", "看不了引擎设置：确认 KiroCrew 装好了",
                      raw="kirocrew 不在 ~/.local/bin、/opt/homebrew/bin、/usr/local/bin，也不在 PATH 上")
        return mk("WARN", "读不了 KiroCrew 的引擎设置", "确认 KiroCrew 装好了、在终端里能用，再检查一次",
                  raw="%s\n做法：kirocrew config get agent.acp_backend" % detail if detail else
                  "做法：kirocrew config get agent.acp_backend")
    if be in ("kas", ""):
        return mk("OK", "KiroCrew 引擎：%s" % (be or "默认（kas）"))
    return mk("WARN", "KiroCrew 引擎是 %s，不是 kas" % be, "点「%s」：Lean 的拦截只在 kas 上测过。KiroCrew "
              "可能要重开才生效" % FIX_BUTTON["engine"], "engine")


def repo_unreadable(repo: str, detail: str) -> dict[str, Any]:
    return mk("FAIL", "查不了这个仓库的 git", "看看这个目录还在不在、是不是 git 仓库", None, repo, detail[:300])


def crew_timeout(seconds: int) -> dict[str, Any]:
    return mk("WARN", "KiroCrew 的检查没在 %d 秒内做完" % seconds, "过一会儿再检查一次")


# ---- brain lint (brainkit/brainlint.py): "<where>: <message>" ------------------------------------------------------ #

LINT_WHERE = re.compile(r"^(?P<where>\S+?(?::\d+)?(?: \([^)]*\))?): (?P<msg>.+)$", re.S)
# an entry id from before brain-kit's <side>-<KEY>-<n>: brain lint warns about each one, and there is nothing to change
LEGACY_ID = re.compile(r"^legacy sequential id (?P<id>\S+);")
LEGACY_SHOWN = 8
LINT_RULES: list[tuple[re.Pattern, str, str]] = [(re.compile(rx, re.S), t, d) for rx, t, d in (
    (r"^id (?P<id>\S+) already used at (?P<at>\S+)", "条目号 {id} 重复了", "给后来的那条换一个号"),
    (r"^bad id '?(?P<id>.+?)'? \(want", "条目号 {id} 不对", "改成 字母-需求号-序号，比如 {example}"),
    (r"^entry (?P<id>\S+) has no text$", "条目 {id} 没有正文", "写上正文，或者撤回它"),
    (r"^type must be one of (?P<types>.+) \((?P<file>\w+)\)$", "类型不对：{file}里只能用 {types}", "改成其中一个"),
    (r"^side must be one of (?P<side>.+)$", "归属不对：只能是 {side}", "改成其中一个"),
    (r"^side must be (?P<side>\S+) in (?P<file>\w+)$", "归属不对：{file}的条目归「{side}」", "把归属改成「{side}」"),
    (r"^rel must be one of (?P<rels>.+)$", "和别的条目的关系不对：只能是 {rels}", "改成其中一个"),
    (r"^(?P<id>\S+) came back (?P<n>\d+) times", "{id} 已经重复出现 {n} 次", "把它做成一个会失败的检查，别再加文字"),
    (r"^term '(?P<t>.+)' is also defined in (?P<o>\S+)", "术语「{t}」在 {o} 里也定义了", "合成一条，或者换个名字"),
    (r"^comes from a requirement document", "这条来自需求文档", "合并前单独看一遍这条"),
    (r"^(?P<n>\d+) line\(s\) of text outside entries", "有 {n} 行文字不在条目里",
     "它们不算知识，可每次运行都会读到：看一眼，要的话写成条目"),
    (r"^(?P<id>\S+) was purged; it may not come back", "{id} 清除过，不能再出现", "去掉它，写一条新的"),
    (r"^purged in this change: (?P<who>\S+) must approve", "这次清除了一条", "要 {who} 批准这个 MR；原文还在 git 历史里"),
    (r"^purged, but (?P<who>\S+) is not in purge_approvers", "清除没有可批准的人",
     "批准人 {who} 要写进默认分支上 brain-kit 设置里能批准清除的人"),
    (r"^purged, but it was never an entry", "清除的不是一个条目", "从清除记录里去掉这一行"),
    (r"^removed or changed in PURGED\.md", "清除记录被改了", "清除记录只能加行：改回去"),
    (r"^text edited in place", "条目的正文被直接改了", "正文不能直接改：改回去，再写一条取代它的新条目，或者撤回它"),
    (r"^file, type or side changed", "条目换了文件、类型或归属", "改回去，再写一条取代它的新条目"),
    (r"^repeats went down", "重复次数变小了", "重复次数只能变大：改回去"),
    (r"^sources or proposal hashes removed", "来源被删了", "来源只能加：改回去"),
    (r"^source '?(?P<s>.+?)'? is not a reference", "来源「{s}」不是引用", "来源写成查得到的引用：需求文档的段落、材料、决定号、凭证号、运行号或条目号"),
    (r"^prop .* is not a proposal hash", "条目头里回写留下的记号不对", "在 Brain 页用「回写 Brain」写，不要手改"),
    (r"^a new entry needs src$", "新条目没写来源", "在条目头里写上来源"),
    (r"^a new entry is rel:new or rel:replaces", "新条目和别的条目的关系不对", "新条目只能是「新」，或者「取代」一条现有的条目"),
    (r"^replaces (?P<t>\S+), which is not a current entry", "取代的 {t} 不是现有条目", "检查条目号"),
    (r"^replaces (?P<t>\S+), but (?P=t) is not in an \*-archive\.md", "取代的 {t} 没进归档", "改回去，用「取代」重写：旧条目会进归档"),
    (r"^deleted; entries leave only by", "条目被删了", "条目只能被取代、撤回（进归档）或清除：改回去"),
    (r"^archived id brought back", "归档的条目号又用上了", "写一条新条目"),
    (r"^(?:archived with different text|changed inside|removed from)", "归档被改了", "归档只能加：改回去"),
    (r"^this id was taken on the target branch meanwhile", "这个条目号在目标分支上被别人占了",
     "让回写分支跟上目标分支的最新版，再回写一次"),
    (r"^entry header must be on its own line", "条目头要单独一行", "把条目头放到单独一行"),
    (r"^attribute \S+ given twice", "条目头里有一项写了两次", "只留一个"),
    (r"^unknown header attributes ", "条目头里有不认识的项", "去掉它们"),
    (r"^header has unreadable parts", "条目头有看不懂的部分", "照别的条目头的样子改"),
    (r"^(?:status must be|by must be|archived must be|repeats must be|rel target)", "条目头的值不对", "照别的条目头的样子改"),
    (r"^unknown file in the Brain", "Brain 里有不认识的文件", "移走它：Brain 里只放产品、技术、改进、项目四个文件，和它们的归档、清除记录"),
    (r"^symlink in the Brain|.* is a symlink", "Brain 里有符号链接", "换成普通文件：链接指向的文件改了，Brain 的检查和 CI 都看不到"),
    (r"^subdirectory in the Brain", "Brain 里有子目录", "移走它"),
    (r"^not UTF-8 text", "文件编码不是 UTF-8", "用 UTF-8 编码另存"),
    (r"^malformed line", "有一行格式不对", "照别的行的样子改：条目号 · 日期 · 原因 · 谁批准的"),
    (r"^looks like a secret", "像是有密钥或密码", "去掉它：每次运行都会读 Brain"),
    (r"^personal data", "有个人信息", "去掉它：每次运行都会读 Brain"),
    (r"^(?:amount|contract number) .*write the rule, not the number", "写了具体数字", "写规则，不写具体的金额或合同号"),
    (r"^names a company", "提到了公司名", "团队能共享才留着"),
    (r"^may be personal data or a secret", "可能是个人信息或密钥", "合并前看一眼：是的话去掉"),
    (r"^instruction-like line", "有像指令的句子", "改成陈述：每次运行都会读 Brain"),
    (r"^masked placeholder", "有打了码的占位符", "写清楚它指什么，或者去掉"),
    (r"^relaxes a safety or quality rule", "放宽了安全或质量规则", "要开发和安全的负责人批准"),
)]


def where_text(where: str, brain_dir: str = "brain") -> str:
    """brain-kit's <where> said plainly: TECH.md:12 → brain/TECH.md 第 12 行; T-PAY-1-2 (TECH.md) → T-PAY-1-2（brain/TECH.md）."""
    bd = (brain_dir or "brain").strip("/")

    def path(name: str) -> str:
        return name if name == "AGENTS.md" or "/" in name else "%s/%s" % (bd, name)

    m = re.match(r"^(?P<f>[^:\s]+\.md):(?P<n>\d+)$", where)
    if m:
        return "%s 第 %s 行" % (path(m.group("f")), m.group("n"))
    m = re.match(r"^(?P<f>[^:\s]+\.md) \(outside entries\)$", where)
    if m:
        return "%s（条目外的文字）" % path(m.group("f"))
    m = re.match(r"^(?P<id>\S+) \((?P<f>[^)]+\.md)\)$", where)
    if m:
        return "%s（%s）" % (m.group("id"), path(m.group("f")))
    if re.match(r"^[^:\s]+\.md$", where):
        return path(where)
    return where


def _lint_parts(raw: Any) -> tuple[str, str, str]:
    """(the line on one line, its <where>, its <message>)."""
    s = " ".join(str(raw or "").split())
    m = LINT_WHERE.match(s)
    return (s, m.group("where"), m.group("msg")) if m else (s, "", s)


def id_example(prefix: str = "") -> str:
    """A new entry id in the repo's own keys: P-PAY-3-1 (side letter, requirement key, its n-th entry)."""
    return "P-%s-3-1" % (prefix or "PAY")


def legacy_ids(ids: list[str], raws: list[str], *, prefix: str = "", repo: str | None = None) -> dict[str, Any]:
    """The entry ids from before the side-key-n scheme, all in one quiet note: nothing is wrong, nothing to do."""
    shown = "、".join(ids[:LEGACY_SHOWN]) + (" 等 %d 条" % len(ids) if len(ids) > LEGACY_SHOWN else " ")
    return mk("OK", "%s是旧式条目号，不用改。新条目的编号是 字母-需求号-序号，比如 %s" % (shown, id_example(prefix)),
              repo=repo, raw="\n".join(raws))


def lint(level: Any, raw: Any, *, brain_dir: str = "brain", repo: str | None = None, prefix: str = "") -> dict[str, Any]:
    """One of brain lint's errors (FAIL) or warnings (WARN), "<where>: <message>", as a CheckRow: 「brain/TECH.md 第
    12 行：条目号 T-1 重复了」. One nobody mapped: 「…：格式不对」 (an error) / 「…：要看一眼」 (a warning). A legacy id
    is the quiet note legacy_ids makes. *prefix*: the repo's requirement prefix, for the id example."""
    lv = norm_level(level)
    s, where, msg = _lint_parts(raw)
    old = LEGACY_ID.match(msg)
    if old:
        return legacy_ids([old.group("id")], [s], prefix=prefix, repo=repo)
    for rx, text, todo in LINT_RULES:
        hit = rx.match(msg)
        if hit:
            g = _groups(hit)
            t = text.format(**g)
            return mk(lv, "%s：%s" % (where_text(where, brain_dir), t) if where else t,
                      todo.format(example=id_example(prefix), **g), None, repo, s)
    t = "格式不对" if lv == "FAIL" else "要看一眼"
    return mk(lv, "%s：%s" % (where_text(where, brain_dir), t) if where else GENERIC_TEXT[lv],
              "看下面 brain-kit 的原话" if lv != "OK" else "", None, repo, s)


def lint_rows(errors: Iterable[Any], warnings: Iterable[Any], *, brain_dir: str = "brain", repo: str | None = None,
              prefix: str = "", limit: int = 100) -> dict[str, list[dict[str, Any]]]:
    """brain lint's whole answer as the Brain page's rows: the errors (FAIL), then the warnings (WARN), the legacy ids
    among them gathered into one quiet note at the end (an OK row: brain-kit warns about each one, a person has
    nothing to do about any)."""
    warns, ids, raws = [], [], []
    for w in warnings:
        s, _, msg = _lint_parts(w)
        old = LEGACY_ID.match(msg)
        if old:
            ids.append(old.group("id"))
            raws.append(s)
        else:
            warns.append(lint("WARN", w, brain_dir=brain_dir, repo=repo, prefix=prefix))
    return {"errors": [lint("FAIL", e, brain_dir=brain_dir, repo=repo, prefix=prefix) for e in errors][:limit],
            "warnings": warns[:limit] + ([legacy_ids(ids, raws, prefix=prefix, repo=repo)] if ids else [])}


# ---- why a hand-over was not taken: the bridge's verify (bridge/handoff.py) and the signer ----------------------- #

HANDOFF = "，再交接一次"
# (the bridge's or the signer's words, what is wrong, what to do[, the command it takes, for 细节])
REASON_RULES: list[tuple[re.Pattern, str, str, str]] = [(re.compile(rx, re.S), t, d, (cmd or [""])[0]) for rx, t, d, *cmd in (
    (r"^branch (?P<b>\S+) is not (?P<p>[^/\s]+)/<owner>/", "这个分支不是开工时建的", "在开工时建的那个分支上" + HANDOFF[1:]),
    (r"^MR comes from a fork$", "MR 是从复制出去的仓库开的", "在项目本身的分支上开 MR"),
    (r"^MR targets (?P<t>\S+), not (?P<d>\S+)$", "MR 要合进 {t}，不是 {d}", "把 MR 要合进的分支改成 {d}"),
    (r"^bot branches are not handed over$", "机器人账号的分支不能交接", "用你自己的分支"),
    (r"^label '(?P<l>[^']+)' was added by (?P<who>\S+), not by the branch owner (?P<o>\S+)$",
     "标签是 {who} 打的，不是负责人 {o}", "让 {o} 自己交接（交接时会打标签）"),
    (r"^the '(?P<l>[^']+)' label event has no time", "GitLab 没记下打标签的时间", "再打一次交接标签"),
    (r"^GitLab shows no MR version with head (?P<sha>\w+)", "GitLab 还没记下这次推送", "等推送在 MR 上出现，再打一次标签"),
    (r"^(?P<sha>[0-9a-f]{7,40}) was pushed \(.*\) after the label", "打标签之后分支又有了新推送", "看看后来的提交" + HANDOFF),
    (r"^(?P<o>\S+) is not in brain-authz identities$", "运行机的身份名单里没有 {o}", "请运行机负责人把 {o} 加进运行机的身份名单"),
    (r"^tracker is jira but (?P<o>\S+) has no Jira id", "运行机不知道 {o} 的 Jira 账号", "请运行机负责人在身份名单里补上 {o} 的 Jira 账号"),
    (r"^Jira issue (?P<k>\S+): HTTP (?P<s>\d+)$", "查不到 Jira 上的 {k}", "确认 Jira 上有它，再打一次标签"),
    (r"^(?P<k>\S+) is not assigned to (?P<o>\S+) in Jira$", "Jira 上 {k} 没分给 {o}", "在 Jira 上分给 {o}，再打一次标签"),
    (r"^(?P<k>\S+) is '(?P<st>[^']*)', not in ", "Jira 上 {k} 的状态是「{st}」，还不能交接", "改好 Jira 上的状态，再打一次标签"),
    (r"^(?P<k>\S+) has no claim \(branch claim/", "{k} 没认领", "先认领它，再打一次标签"),
    (r"^claim/(?P<k>\S+): claim\.json is not JSON$", "{k} 的认领记录读不懂", "在开需求里重新认领它"),
    (r"^claim\.json key ", "需求号和认领记录对不上", "在认领过的需求上开工，再交接"),
    (r"^claim\.json owner ", "负责人和认领记录对不上", "让认领它的人交接，或者先把认领转给你"),
    (r"^run\.json missing at (?P<sha>\w+)$", "这次提交里没有开工记录", "在开工时建的分支上" + HANDOFF[1:]),
    (r"^run\.json is not valid JSON$", "开工记录读不懂", "按细节里的原话改好开工记录" + HANDOFF),
    (r"^run\.json has no hand-over", "这个分支还没交接过", "在这个需求的分支上交接"),
    (r"^run\.json: ", "开工记录有问题", "按细节里的原话改好开工记录" + HANDOFF),
    (r"^GitLab does not show the parent of", "GitLab 看不到这个提交的上一个", "过一会儿再打一次标签"),
    (r"^the MR head (?P<sha>\w+) is a merge", "MR 最新的提交是一个合并，不是交接提交", "在分支上" + HANDOFF[1:]),
    (r"^GitLab does not show who authored and committed", "GitLab 看不到提交人", "过一会儿再打一次标签"),
    (r"^the MR head (?P<sha>\w+) was made by a bot account", "MR 最新的提交是机器人账号做的", "看看那个提交" + HANDOFF),
    (r"^the MR head (?P<sha>\w+) is not the hand-over commit", "MR 最新的提交不是交接提交", "看看后来的提交" + HANDOFF),
    (r"^the run uses material packages but the bridge has no intake_dir$", "运行机没配材料库",
     "请运行机负责人给桥配上材料库"),
    (r"^material (?P<p>\S+) is not published to brain-intake$", "有一份材料还没发布到材料库",
     "在本机分支上" + HANDOFF[1:] + "（交接时会发布材料）"),
    (r"^material (?P<p>\S+) in brain-intake differs from run\.json$", "材料库里的一份材料和开工时的不一样",
     "在本机分支上" + HANDOFF[1:]),
    (r"^material (?P<p>\S+): ", "有一份材料有问题", "看细节里的原话"),
    (r"^Lean hand-over note (?P<path>\S+) missing$", "还没有交接说明", "在会话里让 AI 写好交接说明" + HANDOFF),
    (r"^hand-over note: ", "交接说明没写好", "在会话里让 AI 补好交接说明" + HANDOFF),
    (r"^brain_commit (?P<c>\w+) does not exist$", "开工时用的那一版 Brain 在仓库里找不到了",
     "让这个分支跟上默认分支的最新版" + HANDOFF, "git rebase <默认分支>"),
    (r"^(?P<k>\S+) already has an open run on the team runner$", "运行机上 {k} 还有一次没做完",
     "等它做完（或在运行机上关掉它），再交接"),
    (r"^signer: ", "签名服务没签", "请运行机负责人看签名服务的记录"),
    # a round that could not check an MR (TeamHandover.error): brain-kit's BrainError, the SpoolSigner's wait
    (r"^the signer did not answer \S+ within (?P<s>\d+)s$", "签名服务 {s} 秒内没答复",
     "不用管：下一轮桥会再要同一份凭证；一直这样就看看签名服务在不在跑"),
    (r"^(?P<p>\S+): \.brain/kit\.json not found on (?P<b>\S+)$", "{p} 的默认分支 {b} 上还没装 brain-kit",
     "先把 brain-kit 装进这个项目并合进 {b}"),
    (r"^(?P<p>\S+): kit config: ", "{p} 默认分支上的 brain-kit 设置有问题", "按细节里的原话改好设置、合进默认分支，再重启运行机的桥"),
    (r"^(?P<p>\S+): GitLab reports no default branch$", "GitLab 上看不到 {p} 的默认分支", "请运行机负责人检查桥配置里的项目名和 GitLab 令牌的权限"),
    (r"^cannot reach (?P<h>\S+): ", "连不上 {h}", "检查运行机的网络，下一轮会再试"),
    (r"^\S+ \S+ -> HTTP (?P<s>40[13])\b", "GitLab 不认桥的令牌", "请运行机负责人检查桥的 GitLab 令牌：权限和有效期"),
    (r"^\S+ \S+ -> HTTP (?P<s>\d{3})\b", "GitLab 出错了", "下一轮会再试；一直这样就看看 GitLab"),
    # the signer's own (signer/brain_signer.py), already Chinese: shorter, the whole kept in raw
    (r"^凭证和签名服务按 GitLab 重建的不一样", "凭证和 GitLab 上的对不上", "请运行机负责人看签名服务的记录"),
    (r"^MR 的最新提交不是凭证里的", "MR 又有了新推送", "下一轮桥会按新的提交重新核对"),
    (r"^issued_at 和这台机器的时间差太多", "运行机和签名服务的时钟差太多", "请运行机负责人校准两台机器的时间"),
    (r"^默认分支的 \.brain/kit\.json 没写 bridge_user", "brain-kit 设置里没写桥的 GitLab 账号", "在默认分支的 brain-kit 设置里写上桥的 GitLab 账号"),
    (r"^kit\.json 的 bridge_user (?P<u>\S+) 不在", "桥的账号 {u} 不在签名服务的名单里", "请运行机负责人核对签名服务认的桥账号"),
    (r"^MR 上没有可以回答 (?P<d>D-\d+) 的人的有效回答", "{d} 还没有有效回答", "等有权回答的人在 MR 上回答"),
    (r"^(?P<d>D-\d+) 收到不同的回答", "{d} 收到了不同的回答", "在 MR 上说清楚以哪个为准"),
    (r"^(?P<d>D-\d+) 有能回答的人的回复被改过", "{d} 的回复被改过", "请回答的人重新回复一条"),
    (r"^(?P<d>D-\d+) 作废：问题发出后分支又有了新推送", "{d} 作废：分支又有了新推送", "运行机会按新的推送重新提问"),
    (r"^(?P<d>D-\d+) 作废：问题没有绑在", "{d} 作废：问题没绑上这次推送", "要重新推送一次，运行机才会重新提问"),
    (r"^(?P<d>D-\d+) 在问题评论 \d+ 之前已经有人回答过", "{d} 的问题被重新贴过", "请运行机负责人看一下 MR 上的评论"),
)]


def reason(raw: Any, *, repo: str | None = None) -> dict[str, Any]:
    """One reason a hand-over (or an answer) was not taken, as a FAIL CheckRow: the bridge's verify problems, the
    signer's refusals."""
    s = " ".join(str(raw or "").split())
    for rx, text, todo, cmd in REASON_RULES:
        hit = rx.match(s)
        if hit:
            g = {k: (v or "") for k, v in hit.groupdict().items()}
            return mk("FAIL", text.format(**g), todo.format(**g), None, repo, s + ("\n做法：%s" % cmd if cmd else ""))
    return fallback("FAIL", s, repo=repo, todo="看下面的原话")


def reasons_text(raws: Iterable[Any], limit: int = 200) -> tuple[str, str]:
    """(the reasons in short Chinese joined by 「；」, the raw ones joined by 「; 」) for one text field."""
    rs = [reason(r) for r in raws if str(r or "").strip()]
    text = "；".join(dict.fromkeys(r["text"] for r in rs))
    return text[:limit], "; ".join(r["raw"] or r["text"] for r in rs)[:2000]


# ---- why the team runner's bridge did not start (bridgehost.TeamRuntime.start) ------------------------------------- #

SAME_USER_BOX = "本机试用：签名器和 app 用同一个系统用户"     # 设置's checkbox (ui/src/views/Settings.tsx)
START_TODO = "看设置里团队模式填的两个配置文件（桥的、运行机的）对不对，改好再跑一轮"
# (the app's own start errors and brain-kit's load_bridge_config ones, what is wrong, what to do): the file names and
# keys stay in raw (细节)
START_RULES: list[tuple[re.Pattern, str, str]] = [(re.compile(rx, re.S), t, d) for rx, t, d in (
    (r"^bridge\.json 不能写 signing_key", "桥的配置文件里写了私钥",
     "把私钥从桥的配置文件里删掉：私钥只给签名服务，桥只把要签的东西交给签名服务"),
    (r"^bridge\.json 要有 \"signer\"|^bridge\.json 的 signer 不是签名服务|^bridge config: signing_key is required",
     "桥的配置文件里没写签名服务", "在桥的配置文件里写上签名服务那一段（设置里「细节」有写法）：这个 app 只通过签名服务签名"),
    (r"^bridge config: signer\.", "桥的配置文件里签名服务那一段没写对", "按设置里「细节」的写法改好签名服务那一段"),
    (r"^找不到 bridge\.json signer\.allowed_signers", "找不到签名服务的公钥名单",
     "看桥的配置文件里签名服务那一段写的公钥名单在不在那个位置"),
    (r"^签名服务的 signed/、refused/ 这个 app 的系统用户能写", "签名服务的答复这个 app 也能写：签名服务就拦不住它了",
     "让签名服务用它自己的系统用户跑；只在本机试用的话，在设置里勾上「%s」" % SAME_USER_BOX),
    (r"^这些配置这个 app 的系统用户能改", "运行机的配置文件这个 app 也能改",
     "把这些配置文件交给系统管理员或跑签名服务的那个系统用户，对这个 app 只读"),
    (r"^runnerd\.json 的 spool_dir 和 bridge\.json 的不一样", "运行机的配置和桥的配置写的不是同一个排队目录",
     "把两个配置文件里的排队目录改成同一个"),
    (r"^bridge config: (?:identities|vouchers_dir|spool_dir|ledger) is required", "桥的配置文件少写了一项",
     "按细节里的原话补上那一项"),
    (r"^bridge config: projects is empty", "桥的配置文件里没写要看的项目", "在桥的配置文件里写上要看的 GitLab 项目"),
    (r"^bridge\.json 的 gitlab\.base 没写，或者读不到 GitLab token", "桥连不上 GitLab：没写 GitLab 的地址，或者找不到桥的 GitLab 令牌",
     "在桥的配置文件里写上 GitLab 的地址，再把桥的 GitLab 令牌放到配置里说的地方"),
    (r"^\[Errno 2\]|^No such file", "找不到配置文件", "看设置里团队模式填的配置文件路径对不对"),
    (r"^\[Errno 13\]|^Permission denied", "这个 app 读不了配置文件", "让这个 app 的系统用户能读那个文件（只读就够）"),
    (r"^(?:Expecting|Extra data|Unterminated|Invalid control)", "配置文件不是合法的 JSON", "按细节里的原话改好那个文件"),
    (r"^brain-kit 没装载", "brain-kit 没装载", "在设置里写对 brain-kit 的位置"),
)]


def team_start(raw: Any) -> dict[str, str]:
    """Why the team runner's bridge did not start, as {text, todo, raw}: what is wrong and what to do in words, the
    error as it was (file names, keys) for 细节; all '' when it started."""
    s = " ".join(str(raw or "").split())
    if not s:
        return {"text": "", "todo": "", "raw": ""}
    for rx, text, todo in START_RULES:
        if rx.search(s):
            return {"text": text, "todo": todo, "raw": s}
    return {"text": "桥没准备好", "todo": START_TODO, "raw": s}
