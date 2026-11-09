"""What brain-kit (and the app's own checks) say, as a person reads it: plain short Chinese, one 做什么 line, the
one-click fix when the app has one, and brain-kit's own words kept (``raw``: the page shows them folded, for
debugging). Pure: no I/O, no brain-kit import; the patterns are brain-kit 48b6b97's and d46765f's strings (and
91e2fee's words for who the person is; 0d52e97's hook adapter version 3: cli.runner_hook_problems and the adapter's
``[brain-kit] blocked (kit file…)`` refusals).

A CheckRow is ``{"level", "text", "todo", "fix", "repo", "raw"}``:

  level  OK | WARN | FAIL (WARN: a reminder, stops nothing)
  text   what is wrong (or right), short; code names (`brain-dev.json`, `lean.json`, `runs/**`) are fine
  todo   做什么, one line ('' for an OK row, or when there is nothing to do)
  fix    'agent' (add Lean's hooks to ~/.kiro/agents/brain-dev.json), 'engine' (kirocrew engine kas), 'kit'
         (reinstall brain-kit and commit it, POST /import/upgrade: in the checkout on its branch by default, or on a
         new branch for an MR), 'me' (the name brain-kit goes by in the repo: the page's input, POST /me/name, which
         sets git config brain.user there), or None
  repo   the repo path the row is about (None: machine-wide)
  raw    the original text ('' when the row is the app's own words and there is nothing more to show)

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
ME_TODO = "在下面填上，存进这个仓库的 git config brain.user"
ME_GITLAB = "要你在 GitLab 上的用户名：认领的分支 ai/<名字>/… 和交接都按它认人。" + ME_TODO + "（或者设好 GITLAB_TOKEN）"
AGENT_OK = "brain-dev 带着 Lean 的三个 hook"   # crewcheck.agent_ok accepts the OK row whose text starts with it
TRIGGER_NAMES = {"agentSpawn": "会话开始", "userPromptSubmit": "发消息", "preToolUse": "调用工具前"}
EVENT_TRIGGER = {"SessionStart": "agentSpawn", "UserPromptSubmit": "userPromptSubmit", "PreToolUse": "preToolUse"}

REINSTALL = "点「修复」：重装 brain-kit 并提交（默认直接在当前分支上，团队仓库可以选新分支开 MR）"
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
    anywhere in the line, not only at its start."""

    def __init__(self, rx: str, text: Any, todo: Any = "", fix: str | None = None, *, runner: bool = False,
                 local: Any = "", search: bool = False) -> None:
        self.rx = re.compile(rx, re.S)
        self.text, self.todo, self.fix = text, todo, fix
        self.runner, self.local, self.search = runner, local, search

    def match(self, s: str) -> "re.Match | None":
        return self.rx.search(s) if self.search else self.rx.match(s)


def _f(v: Any, g: dict[str, str], level: str) -> str:
    if callable(v):
        return str(v(g, level))
    return str(v).format(**g) if v else ""


def _tool(g: dict[str, str], level: str) -> str:
    have = g["have"].strip()
    if have.lower().startswith(g["tool"].lower()):
        have = have[len(g["tool"]):].strip()
    return "%s %s" % (g["tool"], have)


HOOK_WHY = (("cannot be read", "命令读不懂"), ("does not name its Python by an absolute path", "Python 没写绝对路径"),
            ("does not run Python isolated", "Python 没带 -I"),
            ("does not run the installed brain-kit's adapter", "跑的不是运行机装的 lean-hook.py（工作区里那份 run 能改）"),
            ("is not `", "参数不是 --runner <runnerd.json> <事件>"), ("has matcher", "匹配不是 *：有的工具调用绕过了 Lean"))


def _hook_why(why: str) -> str:
    return next((cn for en, cn in HOOK_WHY if why.startswith(en)), why[:80])


def _hook_names(raw: str) -> str:
    """'agentSpawn, preToolUse' (brain-kit's trigger names) as the Chinese names."""
    names = [x.strip() for x in raw.split(",") if x.strip()]
    return "、".join(TRIGGER_NAMES.get(n, TRIGGER_NAMES.get(EVENT_TRIGGER.get(n, ""), n)) for n in names)


def _old_adapter(g: dict[str, str], level: str) -> str:
    """What an older hook adapter lacks, by its version (brain-kit d46765f: 2 lets a run write park.json; 0d52e97: 3
    refuses tool calls once the kit's own files differ from the commit)."""
    have, need = int(g.get("have") or 0), int(g.get("need") or 0)
    lacks = []
    if need >= 3:
        lacks.append("改了 kit 自己的文件（.kiro/、.brain/kit.json、gates/）以后它不拦工具调用")
    if have < 2:
        lacks.append("运行机上的 run 停下来问人时写不了 park.json")
    return ("旧版%s。" % "，".join(lacks)) if lacks else ""


RULES: list[Rule] = [
    # cli.runner_kit_problems / doctor_checks (d46765f, 0d52e97: version 3): the hook adapter is too old for the runner
    Rule(r"^(?P<path>\S+) is an older adapter \(version (?P<have>\d+), needs (?P<need>\d+)\)",
         "{path} 是旧版（第 {have} 版，要第 {need} 版）",
         lambda g, lv: _old_adapter(g, lv) + REINSTALL, "kit", runner=True,
         local=lambda g, lv: LOCAL_ONLY + "（运行机只跑新版，交接会被拒）。要交的话点「修复」：重装 kit 文件，装上第 %s 版" % g["need"]),
    # cli.runner_hook_problems (0d52e97): what the team runner's sessions need from the brain-kit installed there
    Rule(r"^the installed brain-kit \((?P<kit>[^)]*)\) has no hook adapter (?P<a>\S+?):", "运行机装的 brain-kit 里没有 hook 适配器",
         "在运行机上装好完整的 brain-kit（带 kit/ 目录），或者把 runnerd.json 的 kit_dir 写对：在那之前 brain-runnerd 不建工作区"),
    Rule(r"^the installed brain-kit's hook adapter (?P<a>\S+) is version (?P<have>\d+), needs (?P<need>\d+)",
         "运行机的 brain-kit 带的 hook 适配器是旧版（第 {have} 版，要第 {need} 版）",
         "在运行机上更新 brain-kit：在那之前 brain-runnerd 不建工作区"),
    Rule(r"^the runner's agent spec (?P<spec>\S+) cannot be read", "读不了运行机的 agent 文件 {spec}",
         "看看 runnerd.json 的 agent_spec 写对没有、文件在不在"),
    Rule(r"^(?P<spec>\S+) has no (?P<t>\w+) hook running Lean's (?P<ev>\w+)",
         lambda g, lv: "%s 没有跑 Lean 的「%s」hook" % (g["spec"], TRIGGER_NAMES.get(g["t"], g["t"])),
         "照 brain-kit 的 remote/agents/brain-run.json 补上：用运行机装的 lean-hook.py --runner"),
    Rule(r"^(?P<spec>\S+): the (?P<t>\w+) hook `(?P<cmd>[^`]*)` (?P<why>.+)$",
         lambda g, lv: "%s 的「%s」hook 不对：%s" % (g["spec"], TRIGGER_NAMES.get(g["t"], g["t"]), _hook_why(g["why"])),
         "照 brain-kit 的 remote/agents/brain-run.json 改：<python 绝对路径> -I <运行机装的 lean-hook.py> --runner "
         "<runnerd.json> <事件>"),
    # kit/.kiro/brain/lean-hook.py (0d52e97, version 3): the adapter's refusals in a session
    Rule(r"^\[brain-kit\] blocked \(kit file\): the target of this tool call could not be checked",
         "hook 拦下了一次工具调用：看不清它要改哪个文件", "不用管：只拦这一次；一直这样就看一下这台机器上的 lean-hook.py"),
    Rule(r"^\[brain-kit\] blocked \(kit file\): (?P<path>\S+) is one of the kit's own files",
         "hook 拦下了一次改 kit 文件的调用（{path}）", "不用管：会话不能改 kit 自己的文件；真要改，走合进默认分支的 MR"),
    Rule(r"^\[brain-kit\] blocked \(kit files changed\): the kit's own files are not those of (?P<ref>.+?): (?P<what>.+?)\. "
         r"They decide", "会话被锁住了：kit 自己的文件和 {ref} 不一样（{what}）",
         "要人来恢复：git checkout HEAD -- <路径>，删掉新加的；是人故意改的就提交。改好之前每次工具调用都被拦，会话里的批准也记不进 Lean"),
    Rule(r"^\[brain-kit\] blocked \(kit files not checked\): the kit's own files could not be checked: (?P<why>.+?)\. "
         r"Until they can", "会话被锁住了：查不了 kit 自己的文件",
         "要人看一下下面的原因：查得了之前每次工具调用都被拦，会话里的批准也记不进 Lean"),
    # cli.runner_kit_problems: Lean / the adapter only on this disk, not in git (worktrees are made from main)
    Rule(r"^(?P<path>\S+) is not committed: AI-DLC Lean;", "AI-DLC Lean 没提交到 git",
         "app 的工作目录从默认分支建，没提交的 Lean 不在里面。" + REINSTALL, "kit"),
    Rule(r"^(?P<path>\S+) is not committed: the KiroCrew hook adapter", "{path} 没提交到 git",
         "app 的工作目录从默认分支建，没有它会话里每次调用工具都会被拦。" + REINSTALL, "kit"),
    Rule(r"^(?P<path>\S+) is not committed: (?P<what>.+?); commit it on main through an MR", "{path} 没提交到 git",
         "app 的工作目录从默认分支建，没提交的文件不在里面。" + REINSTALL, "kit"),
    # mrdesc.write_problem (+ exclude_fix), in crewcheck's row and in brain doctor's
    Rule(r"(?P<runs>[^\s/：:]+)/ 下的文件（MR\.md、park\.json）算在 Lean 的代码指纹里",
         "Lean 把 {runs}/ 下的记录算成代码",
         "交接会被拒。点「修复」：重装会把 {runs}/** 加进 aidlc-docs/lean.json（由人看过再合并）", "kit", runner=True,
         local=LOCAL_ONLY + "（那时交接会被拒）。要交的话点「修复」：重装会把 {runs}/** 加进 lean.json", search=True),
    # cli.doctor_checks
    Rule(r"^kit config valid \((?P<path>[^)]+)\), tracker (?P<tracker>\S+), keys (?P<prefix>\S+)-<n>$",
         "kit.json 没问题（需求号 {prefix}-n，跟踪 {tracker}）"),
    Rule(r"^AI-DLC Lean doctor: ok$", "AI-DLC Lean 自检通过"),
    Rule(r"^AI-DLC Lean doctor: .*hooks have never run here", "Lean 的 hook 在这里还没跑过",
         "不用管：在这个仓库里开过 brain-dev 会话（信任工作区）以后就有了"),
    Rule(r"^AI-DLC Lean doctor: (?P<last>.+)$", "AI-DLC Lean 自检有提醒",
         "看下面 Lean 的原话（它只提醒，不拦东西）"),
    Rule(r"^Lean does not count (?P<runs>\S+?)/ as code", "Lean 不把 {runs}/ 下的记录算成代码"),
    Rule(r"^(?P<path>\S+) lets a run write its own \S+/<KEY>/park\.json .*\(version (?P<v>\d+)\)$",
         "{path} 是新版（第 {v} 版）"),
    Rule(r"^(?P<path>\S+) missing in this repo \(run `brain install`\)", "仓库里没有 {path}",
         "KiroCrew 的会话靠它跑 Lean。" + REINSTALL, "kit"),
    Rule(r"^AI-DLC Lean not installed$", "没装 AI-DLC Lean", REINSTALL, "kit"),
    Rule(r"^brain-dev model: (?P<have>\S+) \(want (?P<want>[^)]*)\)$",
         lambda g, lv: ("brain-dev 的模型是 %s" % g["have"]) if lv == "OK" else
         ("brain-dev 的模型是 %s，要 %s" % (g["have"], g["want"])),
         "改 .kiro/agents/brain-dev.md 的 model，或者重装 brain-kit"),
    Rule(r"^brain-dev forbidden tools: none$", "brain-dev 没带禁用的工具"),
    Rule(r"^brain-dev forbidden tools: (?P<bad>.+)$", "brain-dev 带着禁用的工具：{bad}",
         "从 .kiro/agents/brain-dev.md 的 tools 里去掉它们"),
    Rule(r"^missing \.kiro/agents/brain-dev\.md", "没有 .kiro/agents/brain-dev.md", REINSTALL, "kit"),
    Rule(r"^Brain files in (?P<dir>[^:]+?)/: all present$", "Brain 文件都在（{dir}/）"),
    Rule(r"^Brain files in (?P<dir>[^:]+?)/: missing (?P<names>.+)$", "缺 Brain 文件：{names}",
         "重装 brain-kit 会补上缺的（已有的不动）", "kit"),
    Rule(r"^AGENTS\.md at repo root$", lambda g, lv: "有 AGENTS.md" if lv == "OK" else "仓库根目录没有 AGENTS.md",
         "重装 brain-kit 会补上它", "kit"),
    Rule(r"^(?P<dir>\S+?)/ is git-ignored", lambda g, lv: ("%s/ 不进 git" % g["dir"]) if lv == "OK" else
         ("%s/ 没被 git 忽略" % g["dir"]), "需求材料不能进 git：重装 brain-kit 会把它加进 .gitignore", "kit"),
    Rule(r"^cannot fetch origin/(?P<b>\S+): Brain freshness unknown$", "取不到 origin/{b}：不知道 Brain 是不是最新",
         "检查网络或登录（比如 mwinit），再检查一次"),
    Rule(r"^Brain vs origin/(?P<b>\S+): same$", "Brain 和 origin/{b} 一样"),
    Rule(r"^Brain vs origin/(?P<b>\S+): differs", "Brain 和 origin/{b} 不一样", "在这个目录里 git pull（或 rebase）"),
    Rule(r"^no origin remote: Brain freshness not checked$", "没有 origin：没查 Brain 是不是最新",
         "要推送和开 MR 时再加：git remote add origin <地址>"),
    Rule(r"^(?P<tool>kiro-cli|kirocrew) not found on PATH$", "PATH 里找不到 {tool}",
         lambda g, lv: "app 自己会去 ~/.local/bin 找它，一般不用管" if g["tool"] == "kirocrew" else
         "装上 kiro-cli，或者把它加进 PATH"),
    Rule(r"^(?P<tool>kiro-cli|kirocrew) version (?P<have>.+), pinned (?P<want>.+)$", "{tool} 版本是 {have}，要 {want}",
         "换成 kit.json pins 里写的版本，或者改 pins"),
    Rule(r"^(?P<tool>kiro-cli|kirocrew) (?P<have>.+?)(?: \(not pinned\))?$", _tool),
    # cli.crew_checks (brain doctor's KiroCrew lines)
    Rule(r"^KiroCrew: ~/\.kiro/agents/brain-dev\.json missing", "没有 ~/.kiro/agents/brain-dev.json",
         "点「修复」装上 brain-kit 带的版本：没有它，Lean 的 hook 在 KiroCrew 里不会跑", "agent"),
    Rule(r"^KiroCrew brain-dev carries Lean's 3 hooks$", "KiroCrew 的 brain-dev 带着 Lean 的三个 hook"),
    Rule(r"^KiroCrew brain-dev\.json lacks Lean's (?P<t>.+?) hook\(s\)",
         lambda g, lv: "brain-dev.json 缺 Lean 的 hook：%s" % _hook_names(g["t"]),
         "点「修复」：只补上缺的，别的 hook 和设置都不动", "agent"),
    Rule(r"^KiroCrew brain-dev\.json has no (?P<f>.+?) \(", "brain-dev.json 没有 {f}",
         "在终端里跑 brain crew-agent --force 补上（你自己的设置都留着）"),
    Rule(r"^KiroCrew brain-dev uses your own (?P<f>.+?) \(", "brain-dev 用的是你自己的 {f}"),
    Rule(r"^~/\.kiro/agents/brain-dev\.json is not valid JSON", "brain-dev.json 不是合法的 JSON",
         "自己修好或删掉 ~/.kiro/agents/brain-dev.json（这里不会覆盖它）"),
    Rule(r"^KiroCrew engine: (?P<be>default \(KAS\)|kas)$",
         lambda g, lv: "KiroCrew 引擎：%s" % ("默认（kas）" if g["be"].startswith("default") else "kas")),
    Rule(r"^KiroCrew engine: (?P<be>\S+)", "KiroCrew 引擎是 {be}，不是 kas",
         "点「修复」设成 kas：Lean 的 hook 只在 kas（v3）上测过", "engine"),
    # cli._me: brain-kit does not know who the person is (48b6b97's words, and the ones after it)
    Rule(r"^who are you\? this repo uses GitLab \((?P<base>[^)]*)\)", "brain-kit 不知道你是谁：这个仓库用 GitLab（{base}）",
         ME_GITLAB, "me"),
    Rule(r"^who are you\? your login name is not usable", "brain-kit 不知道你是谁：这台机器的登录名不能当名字",
         "写一个名字（小写字母、数字、. _ -）。" + ME_TODO, "me"),
    Rule(r"^who are you\?", "brain-kit 不知道你是谁",
         "填上你的名字（用 GitLab 的仓库填 GitLab 用户名）。" + ME_TODO, "me"),
    Rule(r"^brain\.user '?(?P<u>.*?)'? is not a GitLab username", "git config brain.user（{u}）不能当名字用",
         "改成你在 GitLab 上的用户名（小写字母、数字、. _ -）。" + ME_TODO, "me"),
    # brain: BrainError as `brain` prints it for a refused hand-over (cmd_handoff)
    Rule(r"^not handed over: Lean would refuse this run's RELEASE approval later", "没交出去：Lean 把 runs/ 下的记录算成代码",
         "点「修复」：重装会把 runs/** 加进 aidlc-docs/lean.json（由人看过再合并），再交接", "kit"),
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
        g = {k: (v or "") for k, v in hit.groupdict().items()}
        level_now = lv
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
        return mk(level_now, text, todo, fix, repo, s)
    return fallback(lv, s, repo=repo)


def who_row(output: Any, *, repo: str | None = None) -> dict[str, Any] | None:
    """The line of brain's *output* that says brain-kit does not know who the person is, as a FAIL row with the 'me'
    fix; None when there is none."""
    for line in str(output or "").splitlines():
        r = row("FAIL", line, repo=repo)
        if r["fix"] == "me":
            return r
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
    return mk("FAIL", "brain-kit 太旧", "把 brain-kit 更新到新版本（这个版本缺 %s）" % "、".join(lacking))


def agent_missing() -> dict[str, Any]:
    return mk("FAIL", "没有 ~/.kiro/agents/brain-dev.json",
              "点「修复」装上 brain-kit 带的版本：没有它，Lean 的 hook 在 KiroCrew 里不会跑", "agent")


def agent_unreadable(why: str, detail: str = "") -> dict[str, Any]:
    """*why*: 读不了 / 不是合法的 JSON / 不是一个 JSON 对象 / 的 hooks 格式认不出; *detail*: the OS error, if any."""
    sep = "" if why.startswith("的") else " "
    return mk("FAIL", "brain-dev.json%s%s" % (sep, why), "自己修好或删掉 ~/.kiro/agents/brain-dev.json（这里不会覆盖它）",
              None, None, detail)


def trigger_names(missing: list[tuple[str, str]], *, english: bool = False) -> str:
    return "、".join(("%s（%s）" % (TRIGGER_NAMES.get(t, t), t)) if english else TRIGGER_NAMES.get(t, t)
                    for t, _ in missing)


def agent_lacks(missing: list[tuple[str, str]]) -> dict[str, Any]:
    return mk("FAIL", "brain-dev.json 缺 Lean 的 hook：%s" % trigger_names(missing),
              "点「修复」：只补上缺的（%s），别的 hook 和设置都不动" % "、".join(t for t, _ in missing), "agent")


def agent_ok(others: int) -> dict[str, Any]:
    return mk("OK", AGENT_OK + ("（另有 %d 个别的 hook，留着不动）" % others if others else ""))


def agent_custom(fields: list[str]) -> dict[str, Any]:
    names = "、".join(fields)
    return mk("OK", "brain-dev 用的是你自己的 %s" % names, raw="brain-dev 用的是你自己的 %s（`brain crew-agent --reset` 换回 "
                                                         "brain-kit 的；--force 只补缺的）" % names)


def engine(be: str | None, why: str = "", detail: str = "") -> dict[str, Any]:
    """The KiroCrew engine row: *be* None (not known: *why* is no_kirocrew or failed), '' or 'kas', or another."""
    if be is None:
        if why == "no_kirocrew":
            return mk("WARN", "找不到 kirocrew 命令", "看不了引擎设置：确认 ~/.local/bin/kirocrew 在（KiroCrew 装好了）")
        return mk("WARN", "kirocrew config get 跑不了", "看不了引擎设置：在终端里试试 kirocrew config get agent.acp_backend",
                  raw=detail)
    if be in ("kas", ""):
        return mk("OK", "KiroCrew 引擎：%s" % (be or "默认（kas）"))
    return mk("WARN", "KiroCrew 引擎是 %s，不是 kas" % be, "点「修复」设成 kas：Lean 的 hook 只在 kas（v3）上测过。KiroCrew "
              "可能要重开才生效", "engine")


def repo_unreadable(repo: str, detail: str) -> dict[str, Any]:
    return mk("FAIL", "查不了这个仓库的 git", "看看这个目录还在不在、是不是 git 仓库", None, repo, detail[:300])


def crew_timeout(seconds: int) -> dict[str, Any]:
    return mk("WARN", "KiroCrew 的检查没在 %d 秒内做完" % seconds, "过一会儿再检查一次")


# ---- brain lint (brainkit/brainlint.py): "<where>: <message>" ------------------------------------------------------ #

LINT_WHERE = re.compile(r"^(?P<where>\S+?(?::\d+)?(?: \([^)]*\))?): (?P<msg>.+)$", re.S)
LINT_RULES: list[tuple[re.Pattern, str, str]] = [(re.compile(rx, re.S), t, d) for rx, t, d in (
    (r"^id (?P<id>\S+) already used at (?P<at>\S+)", "条目号 {id} 重复了", "给后来的那条换一个号（brain entry 会自己取号）"),
    (r"^bad id '?(?P<id>.+?)'? \(want", "条目号 {id} 不对", "条目号要像 T-OMS-12-1"),
    (r"^legacy sequential id (?P<id>\S+);", "{id} 是旧式条目号", "不用改；新条目用 <字母>-<需求号>-<n>"),
    (r"^entry (?P<id>\S+) has no text$", "条目 {id} 没有正文", "写上正文，或者撤回它"),
    (r"^type must be one of (?P<types>.+) \((?P<file>\w+)\)$", "类型不对：{file} 里只能用 {types}", "改成其中一个"),
    (r"^side must be one of (?P<s>.+)$", "side 不对：只能是 {s}", "改成其中一个"),
    (r"^side must be (?P<s>\S+) in (?P<file>\w+)$", "side 不对：{file} 里是 {s}", "改成 {s}"),
    (r"^rel must be one of (?P<r>.+)$", "rel 不对：只能是 {r}", "改成其中一个"),
    (r"^(?P<id>\S+) came back (?P<n>\d+) times", "{id} 已经重复出现 {n} 次", "把它做成一个会失败的检查（gate），别再加文字"),
    (r"^term '(?P<t>.+)' is also defined in (?P<o>\S+)", "术语「{t}」在 {o} 里也定义了", "合成一条，或者换个名字"),
    (r"^comes from a requirement document", "这条来自需求文档", "合并前单独看一遍这条"),
    (r"^(?P<n>\d+) line\(s\) of text outside entries", "有 {n} 行文字不在条目里",
     "它们不算知识，可每个 run 都会读到：看一眼，要的话写成条目"),
    (r"^(?P<id>\S+) was purged; it may not come back", "{id} 清除过，不能再出现", "去掉它，写一条新的"),
    (r"^purged in this change: (?P<who>\S+) must approve", "这次清除了一条", "要 {who} 批准这个 MR；原文还在 git 历史里"),
    (r"^purged, but (?P<who>\S+) is not in purge_approvers", "清除没有可批准的人",
     "批准人 {who} 要写在默认分支 kit.json 的 purge_approvers 里"),
    (r"^purged, but it was never an entry", "清除的不是一个条目", "从 PURGED.md 去掉这一行"),
    (r"^removed or changed in PURGED\.md", "PURGED.md 被改了", "PURGED.md 只能加行：改回去"),
    (r"^text edited in place", "条目的正文被直接改了", "只能 same、adds-to（旧正文在前）、replaces 或 withdraws：用 brain entry 改"),
    (r"^file, type or side changed", "条目换了文件、类型或 side", "改用 replaces 写一条新的"),
    (r"^repeats went down", "repeats 变小了", "repeats 只能变大：改回去"),
    (r"^sources or proposal hashes removed", "出处被删了", "出处只能加：改回去"),
    (r"^source '?(?P<s>.+?)'? is not a reference", "出处「{s}」不是引用", "出处写 D01#S003、PKG-…、D-3、V-…、RUN-… 或条目号"),
    (r"^prop .* is not a proposal hash", "prop 不是提案的哈希", "用 brain reflect 写，不要手改"),
    (r"^a new entry needs src$", "新条目没写出处", "加上 src"),
    (r"^a new entry is rel:new or rel:replaces", "新条目的 rel 不对", "写 rel:new 或 rel:replaces <条目号>"),
    (r"^replaces (?P<t>\S+), which is not a current entry", "替换的 {t} 不是现有条目", "检查条目号"),
    (r"^replaces (?P<t>\S+), but (?P=t) is not in an \*-archive\.md", "替换的 {t} 没进归档", "用 brain entry replace 来替换"),
    (r"^deleted; entries leave only by", "条目被删了", "只能 replaces、withdraws（进归档）或 purge：改回去，用 brain entry"),
    (r"^archived id brought back", "归档的条目号又用上了", "写一条新条目"),
    (r"^(?:archived with different text|changed inside|removed from)", "归档被改了", "归档只能加：改回去"),
    (r"^this id was taken on the target branch meanwhile", "这个条目号在目标分支上被别人占了",
     "rebase 到目标分支上，再跑一次 brain reflect"),
    (r"^entry header must be on its own line", "条目头要单独一行", "把条目头放到单独一行"),
    (r"^attribute (?P<k>\S+) given twice", "属性 {k} 写了两次", "留一个"),
    (r"^unknown header attributes (?P<k>.+)$", "条目头有不认识的属性：{k}", "去掉它们"),
    (r"^header has unreadable parts", "条目头有看不懂的部分", "照 brain entry 写的格式改"),
    (r"^(?:status must be|by must be|archived must be|repeats must be|rel target)", "条目头的值不对", "照 brain entry 写的格式改"),
    (r"^unknown file in the Brain", "Brain 里有不认识的文件", "移走它：Brain 只放 PRODUCT、TECH、IMPROVEMENT、PROJECT 和归档"),
    (r"^symlink in the Brain|.* is a symlink", "Brain 里有符号链接", "换成普通文件：lint 和 CI 看不到链接指向的内容"),
    (r"^subdirectory in the Brain", "Brain 里有子目录", "移走它"),
    (r"^not UTF-8 text", "不是 UTF-8 文本", "存成 UTF-8"),
    (r"^malformed line", "格式不对的一行", "照 - <条目号> · <日期> · pii|secret|confidential · approved by <人> 写"),
    (r"^looks like a secret", "像是有密钥或密码", "去掉它：Brain 每个 run 都会读"),
    (r"^personal data", "有个人信息", "去掉它：Brain 每个 run 都会读"),
    (r"^(?:amount|contract number) .*write the rule, not the number", "写了具体数字", "写规则，不写具体的金额或合同号"),
    (r"^names a company", "提到了公司名", "团队能共享才留着"),
    (r"^may be personal data or a secret", "可能是个人信息或密钥", "合并前看一眼：是的话去掉"),
    (r"^instruction-like line", "有像指令的句子", "改成陈述：Brain 每个 run 都会读"),
    (r"^masked placeholder", "有打了码的占位符", "写清楚它指什么，或者去掉"),
    (r"^relaxes a safety or quality rule", "放宽了安全或质量规则", "要 Builder 和安全负责人批准"),
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


def lint(level: Any, raw: Any, *, brain_dir: str = "brain", repo: str | None = None) -> dict[str, Any]:
    """One of brain lint's errors (FAIL) or warnings (WARN), "<where>: <message>", as a CheckRow: 「brain/TECH.md 第
    12 行：条目号 T-1 重复了」. One nobody mapped: 「…：格式不对」 (an error) / 「…：要看一眼」 (a warning)."""
    lv = norm_level(level)
    s = " ".join(str(raw or "").split())
    m = LINT_WHERE.match(s)
    where, msg = (m.group("where"), m.group("msg")) if m else ("", s)
    for rx, text, todo in LINT_RULES:
        hit = rx.match(msg)
        if hit:
            g = {k: (v or "") for k, v in hit.groupdict().items()}
            t = text.format(**g)
            return mk(lv, "%s：%s" % (where_text(where, brain_dir), t) if where else t, todo.format(**g), None, repo, s)
    t = "格式不对" if lv == "FAIL" else "要看一眼"
    return mk(lv, "%s：%s" % (where_text(where, brain_dir), t) if where else GENERIC_TEXT[lv],
              "看下面 brain lint 的原话" if lv != "OK" else "", None, repo, s)


# ---- why a hand-over was not taken: the bridge's verify (bridge/handoff.py) and the signer ----------------------- #

HANDOFF = "，再跑一次 brain handoff"
REASON_RULES: list[tuple[re.Pattern, str, str]] = [(re.compile(rx, re.S), t, d) for rx, t, d in (
    (r"^branch (?P<b>\S+) is not (?P<p>[^/\s]+)/<owner>/", "分支名不对", "分支要像 {p}/<你的账号>/<需求号>-<名字>（brain start 建的）"),
    (r"^MR comes from a fork$", "MR 来自 fork", "在项目本身的分支上开 MR"),
    (r"^MR targets (?P<t>\S+), not (?P<d>\S+)$", "MR 的目标分支是 {t}，不是 {d}", "把 MR 的目标改成 {d}"),
    (r"^bot branches are not handed over$", "机器人账号的分支不能交接", "用你自己的分支"),
    (r"^label '(?P<l>[^']+)' was added by (?P<who>\S+), not by the branch owner (?P<o>\S+)$",
     "标签是 {who} 打的，不是负责人 {o}", "让 {o} 自己跑 brain handoff（它会打标签）"),
    (r"^the '(?P<l>[^']+)' label event has no time", "GitLab 没记下打标签的时间", "再打一次标签 {l}"),
    (r"^GitLab shows no MR version with head (?P<sha>\w+)", "GitLab 还没记下这次推送", "等推送在 MR 上出现，再打一次标签"),
    (r"^(?P<sha>[0-9a-f]{7,40}) was pushed \(.*\) after the label", "打标签之后分支又有了新推送", "看看后来的提交" + HANDOFF),
    (r"^(?P<o>\S+) is not in brain-authz identities$", "{o} 不在 brain-authz 的身份表里", "请运行机负责人把 {o} 加进 brain-authz"),
    (r"^tracker is jira but (?P<o>\S+) has no Jira id", "{o} 没有 Jira 账号记录", "请运行机负责人在 brain-authz 里补上 {o} 的 Jira 账号"),
    (r"^Jira issue (?P<k>\S+): HTTP (?P<s>\d+)$", "查不了 Jira 上的 {k}（HTTP {s}）", "确认 Jira 上有它，再打一次标签"),
    (r"^(?P<k>\S+) is not assigned to (?P<o>\S+) in Jira$", "Jira 上 {k} 没分给 {o}", "在 Jira 上分给 {o}，再打一次标签"),
    (r"^(?P<k>\S+) is '(?P<st>[^']*)', not in ", "Jira 上 {k} 的状态是「{st}」，还不能交接", "改好 Jira 上的状态，再打一次标签"),
    (r"^(?P<k>\S+) has no claim \(branch claim/", "{k} 没认领", "先 brain claim，再打一次标签"),
    (r"^claim/(?P<k>\S+): claim\.json is not JSON$", "{k} 的认领文件坏了", "重新 brain claim"),
    (r"^claim\.json (?P<f>key|owner) ", "{f} 和认领对不上", "看看 claim/<需求号> 分支上的 claim.json"),
    (r"^run\.json missing at (?P<sha>\w+)$", "这次提交里没有 run.json", "在 brain start 建的分支上" + HANDOFF[1:]),
    (r"^run\.json is not valid JSON$", "run.json 不是合法的 JSON", "改好它" + HANDOFF),
    (r"^run\.json has no hand-over", "run.json 里没有交接记录", "在分支上跑 brain handoff"),
    (r"^run\.json: ", "run.json 有问题", "改好它" + HANDOFF),
    (r"^GitLab does not show the parent of", "GitLab 看不到这个提交的上一个", "过一会儿再打一次标签"),
    (r"^the MR head (?P<sha>\w+) is a merge", "MR 最新的提交是一个合并，不是交接提交", "在分支上" + HANDOFF[1:]),
    (r"^GitLab does not show who authored and committed", "GitLab 看不到提交人", "过一会儿再打一次标签"),
    (r"^the MR head (?P<sha>\w+) was made by a bot account", "MR 最新的提交是机器人账号做的", "看看那个提交" + HANDOFF),
    (r"^the MR head (?P<sha>\w+) is not the hand-over commit", "MR 最新的提交不是交接提交", "看看后来的提交" + HANDOFF),
    (r"^the run uses material packages but the bridge has no intake_dir$", "运行机没配 brain-intake",
     "请运行机负责人在 bridge.json 里配上 intake_dir"),
    (r"^material (?P<p>\S+) is not published to brain-intake$", "材料 {p} 还没发布到 brain-intake",
     "在本机分支上" + HANDOFF[1:] + "（它会发布材料）"),
    (r"^material (?P<p>\S+) in brain-intake differs from run\.json$", "brain-intake 里的材料 {p} 和 run.json 对不上",
     "在本机分支上" + HANDOFF[1:]),
    (r"^material (?P<p>\S+): ", "材料 {p} 有问题", "看下面的原话"),
    (r"^Lean hand-over note (?P<path>\S+) missing$", "没有 Lean 的交接说明", "写好 aidlc-state.md 的交接说明" + HANDOFF),
    (r"^hand-over note: ", "Lean 的交接说明没写好", "补好 aidlc-state.md 的 Session notes" + HANDOFF),
    (r"^brain_commit (?P<c>\w+) does not exist$", "run.json 里的 brain_commit 不存在", "把分支 rebase 到默认分支上" + HANDOFF),
    (r"^(?P<k>\S+) already has an open run on the team runner$", "{k} 在运行机上已经有一个没结束的 run",
     "等它结束（或在运行机上关掉它），再交接"),
    (r"^signer: ", "签名服务没签", "请运行机负责人看签名服务的记录"),
    # a round that could not check an MR (TeamHandover.error): brain-kit's BrainError, the SpoolSigner's wait
    (r"^the signer did not answer \S+ within (?P<s>\d+)s$", "签名服务 {s} 秒内没答复",
     "不用管：下一轮桥会再要同一份凭证；一直这样就看看签名服务在不在跑"),
    (r"^(?P<p>\S+): \.brain/kit\.json not found on (?P<b>\S+)$", "{p} 的默认分支 {b} 上没有 .brain/kit.json",
     "先把 brain-kit 装进这个项目并合进 {b}"),
    (r"^(?P<p>\S+): kit config: ", "{p} 默认分支上的 kit.json 有问题", "改好 .brain/kit.json 合进默认分支，再重启运行机的桥"),
    (r"^(?P<p>\S+): GitLab reports no default branch$", "GitLab 上看不到 {p} 的默认分支", "检查 bridge.json 里的项目名和 token 的权限"),
    (r"^cannot reach (?P<h>\S+): ", "连不上 {h}", "检查运行机的网络，下一轮会再试"),
    (r"^\S+ \S+ -> HTTP (?P<s>40[13])\b", "GitLab 拒绝了桥的 token（HTTP {s}）", "检查 bridge.json 里 GitLab token 的权限和有效期"),
    (r"^\S+ \S+ -> HTTP (?P<s>\d{3})\b", "GitLab 返回了 HTTP {s}", "下一轮会再试；一直这样就看看 GitLab"),
    # the signer's own (signer/brain_signer.py), already Chinese: shorter, the whole kept in raw
    (r"^凭证和签名服务按 GitLab 重建的不一样", "凭证和 GitLab 上的对不上", "请运行机负责人看签名服务的记录"),
    (r"^MR 的最新提交不是凭证里的", "MR 又有了新推送", "下一轮桥会按新的提交重新核对"),
    (r"^issued_at 和这台机器的时间差太多", "运行机和签名服务的时钟差太多", "请运行机负责人校准两台机器的时间"),
    (r"^默认分支的 \.brain/kit\.json 没写 bridge_user", "kit.json 没写 bridge_user", "在默认分支的 .brain/kit.json 里写上桥的 GitLab 账号"),
    (r"^kit\.json 的 bridge_user (?P<u>\S+) 不在", "bridge_user {u} 不在签名服务的名单里", "请运行机负责人核对 bridge_users"),
    (r"^MR 上没有可以回答 (?P<d>D-\d+) 的人的有效回答", "{d} 还没有有效回答", "等有权回答的人在 MR 上回答"),
    (r"^(?P<d>D-\d+) 收到不同的回答", "{d} 收到了不同的回答", "在 MR 上说清楚以哪个为准"),
    (r"^(?P<d>D-\d+) 有能回答的人的回复被改过", "{d} 的回复被改过", "请回答的人重新回复一条"),
    (r"^(?P<d>D-\d+) 作废：问题发出后分支又有了新推送", "{d} 作废：分支又有了新推送", "run 会按新的推送重新提问"),
    (r"^(?P<d>D-\d+) 作废：问题没有绑在", "{d} 作废：问题没绑上这次推送", "run 要重新推送才会重新提问"),
    (r"^(?P<d>D-\d+) 在问题评论 \d+ 之前已经有人回答过", "{d} 的问题被重新贴过", "请运行机负责人看一下 MR 上的评论"),
)]


def reason(raw: Any, *, repo: str | None = None) -> dict[str, Any]:
    """One reason a hand-over (or an answer) was not taken, as a FAIL CheckRow: the bridge's verify problems, the
    signer's refusals."""
    s = " ".join(str(raw or "").split())
    for rx, text, todo in REASON_RULES:
        hit = rx.match(s)
        if hit:
            g = {k: (v or "") for k, v in hit.groupdict().items()}
            return mk("FAIL", text.format(**g), todo.format(**g), None, repo, s)
    return fallback("FAIL", s, repo=repo, todo="看下面的原话")


def reasons_text(raws: Iterable[Any], limit: int = 200) -> tuple[str, str]:
    """(the reasons in short Chinese joined by 「；」, the raw ones joined by 「; 」) for one text field."""
    rs = [reason(r) for r in raws if str(r or "").strip()]
    text = "；".join(dict.fromkeys(r["text"] for r in rs))
    return text[:limit], "; ".join(r["raw"] or r["text"] for r in rs)[:2000]
