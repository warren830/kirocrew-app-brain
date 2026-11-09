"""装到新分支, and 推送并开 MR: brain-kit into a repo on a new branch, without touching the person's checkout. The
default is to install in place (inplace.py, as brain-kit's own CLI does); this route is the one a person picks for a
team repo (an MR) or when their uncommitted changes touch what brain install writes. landing.py gets such a branch in:
「合并到 <default>」, 「拉取」 after the MR, and the sweep of records nothing waits for.

  install  a NEW branch (default brain/install) from the default branch (origin's: what GitLab has), in its own worktree
           under work_root; ``brain install`` there (brain-kit's CLI from the configured checkout, as a command with a
           time limit, its output kept); the form's kit.json values (checked by brain-kit's config.validate);
           ``brain doctor --offline``; the changed files; a commit with the person's own git identity and their hooks
           (a hook that says no is shown as it said it: nothing is bypassed, 「再提交一次」 runs them again). A failure
           before the commit takes back the worktree and the branch it made.
  upgrade  the same for a repo that HAS brain-kit (the 'kit' fix of a KiroCrew check row: an older hook adapter, Lean
           or the adapter not committed, Lean counting runs/** as code): a new branch (default brain/upgrade-kit; -2,
           -3 … when that name is taken here or on origin) from the default branch in its own worktree, ``brain
           install`` there (kit.json is kept: brain-kit refreshes the kit files and adds runs/** to lean.json),
           ``brain doctor --offline``, the changed files, the person's commit. Nothing changed: said so, and the
           worktree and the branch are taken back.
  publish  only after the person confirmed the branch, the remote and the target: ``git push origin <branch>`` (no
           force, no prompt), then the MR with the person's GitLab token through brain-kit's GitLab client (an open
           MR of that branch is reused), its description a plain list of what the install adds. Without a token or a
           GitLab project: the exact git / glab commands and GitLab's new-MR link.

What the app installed where is kept in importer.Records (imports.json), so 检查 and the list know a repo whose
brain-kit is on the unmerged install branch. The upgrades have Records of their own (upgrades.json): a listed repo
with an upgrade branch is never taken for a pending install. *purpose* ("install" | "upgrade") picks the commit
message, the MR title and the MR description's first line.
"""

from __future__ import annotations

import os
import re
import shlex
import shutil
import time
from typing import Any, Callable
from urllib.parse import quote

from . import bk
from . import problems
from .constants import GIT_BIN
from .importer import (CTRL_RE, DEFAULT_BRANCH, GIT_TIMEOUT_S, KIT, PREFIX_RE, PROJECT_RE, STATUS_TIMEOUT_S, ImportFail,
                       Records, _status_rows, base_ref, default_branch, git_failure, has_at, last_lines, origin_of,
                       planted_link, quiet_env, run_quiet, short_ref, symlinks_on_targets, tail)
from .intake import brain_cmd
from .repo import Git

WORKTREE_TIMEOUT_S = 180
INSTALL_TIMEOUT_S = 300
DOCTOR_TIMEOUT_S = 180
COMMIT_TIMEOUT_S = 300
PUSH_TIMEOUT_S = 300
MAX_FILES = 500
BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$")
BASE_RE = re.compile(r"^https?://[A-Za-z0-9][A-Za-z0-9.-]*(?::[0-9]{1,5})?(?:/[A-Za-z0-9._~-]+)*$")
DOCTOR_RE = re.compile(r"^(OK|WARN|FAIL)\s+(.+)$")
INSTALL_STEPS = (("branch", "建分支和工作目录"), ("install", "装 brain-kit 的文件"), ("kit", "写这个仓库的设置"),
                 ("doctor", "自检"), ("commit", "提交"))
UPGRADE_BRANCH = "brain/upgrade-kit"
UPGRADE_STEPS = (("branch", "建分支和工作目录"), ("install", "更新 kit 文件"), ("doctor", "自检"), ("commit", "提交"))
PURPOSES = ("install", "upgrade")
UP_TO_DATE = "已经是最新的：没有要提交的改动"
# Lean's install.sh starts a new audit file (one INIT event) each time it runs: a reinstall that adds nothing else
# changed nothing. When something else changed, it is committed with the rest, as `brain install` + `git add -A` would.
LEAN_AUDIT = "aidlc-docs/audit/"


# ---- 安装到新分支 ----------------------------------------------------------------------------------------------------- #

def check_branch(raw: Any, default: str = DEFAULT_BRANCH) -> str:
    b = str(raw).strip() if isinstance(raw, str) and raw.strip() else default
    if not BRANCH_RE.match(b) or ".." in b or "//" in b or b.endswith(("/", ".", ".lock")) or "/." in b or "@{" in b:
        raise ImportFail("分支名只能用字母、数字和 . _ - /，比如 %s" % default, "invalid_branch")
    p = Git(os.path.expanduser("~")).run("check-ref-format", "--branch", b, timeout=10)
    if p.returncode != 0:
        raise ImportFail("git 不接受这个分支名：%s" % b, "invalid_branch")
    return b


def check_kit(raw: Any) -> dict[str, str]:
    """The install form's kit.json values, checked (plain Chinese), then by brain-kit's own config.validate."""
    if not isinstance(raw, dict):
        raise ImportFail("kit 要是一个对象（需求号前缀、跟踪方式、GitLab、默认分支、团队）", "invalid_kit")

    def s(k: str, limit: int = 200) -> str:
        v = raw.get(k)
        v = v.strip() if isinstance(v, str) else ""
        if len(v) > limit or CTRL_RE.search(v):
            raise ImportFail("%s 太长或有不该有的字符" % k, "invalid_kit")
        return v

    prefix = s("req_prefix", 10).upper()
    if not PREFIX_RE.match(prefix):
        raise ImportFail("需求号前缀要像 PAY：大写字母开头，后面是大写字母或数字，最多 10 个", "invalid_kit")
    tracker = s("tracker", 10) or "none"
    if tracker not in ("none", "jira"):
        raise ImportFail("跟踪方式只能是 none（不用 Jira）或 jira", "invalid_kit")
    jira = s("jira_base").rstrip("/")
    if tracker == "jira" and not BASE_RE.match(jira):
        raise ImportFail("用 Jira 要写 Jira 的地址，比如 https://jira.example.com", "invalid_kit")
    base = s("gitlab_base").rstrip("/")
    if base and not BASE_RE.match(base):
        raise ImportFail("GitLab 地址要像 https://gitlab.example.com（不带用户名和密码）", "invalid_kit")
    project = s("gitlab_project").strip("/")
    if project and not PROJECT_RE.match(project):
        raise ImportFail("GitLab 项目要像 组/仓库，比如 shop/shop-pay", "invalid_kit")
    if bool(base) != bool(project):
        raise ImportFail("GitLab 地址和项目要么都写，要么都不写", "invalid_kit")
    d = s("default_branch", 100)
    if not d or not BRANCH_RE.match(d) or ".." in d:
        raise ImportFail("写默认分支，比如 main", "invalid_kit")
    team = " ".join(s("team", 60).split())
    out = {"req_prefix": prefix, "tracker": tracker, "jira_base": jira if tracker == "jira" else "",
           "gitlab_base": base, "gitlab_project": project, "default_branch": d, "team": team}
    if bk.ok():
        C = bk.m("config")
        probs = C.validate(C.merged(C.DEFAULTS, kit_data(dict(C.DEFAULTS), out)))
        if probs:
            raise ImportFail("brain-kit 不接受这些值：%s" % "；".join(str(p) for p in probs), "invalid_kit")
    return out


def kit_data(data: dict[str, Any], kit: dict[str, str]) -> dict[str, Any]:
    """*data* (kit.json as brain install wrote it) with the form's values in."""
    data = dict(data)
    data.update(req_prefix=kit["req_prefix"], tracker=kit["tracker"], default_branch=kit["default_branch"],
                team=kit["team"])
    gl = dict(data.get("gitlab") or {})
    gl.update(base=kit["gitlab_base"], project=kit["gitlab_project"])
    data["gitlab"] = gl
    if kit["tracker"] == "jira":
        jr = dict(data.get("jira") or {})
        jr["base"] = kit["jira_base"]
        data["jira"] = jr
    return data


def kit_line(kit: dict[str, str]) -> str:
    parts = ["需求号 %s-n" % kit["req_prefix"], problems.TRACKER_NAME.get(kit["tracker"], "跟踪 %s" % kit["tracker"]),
             "默认分支 %s" % kit["default_branch"]]
    if kit.get("gitlab_project"):
        parts.append("GitLab %s（%s）" % (kit["gitlab_project"], kit["gitlab_base"]))
    if kit.get("team"):
        parts.append("团队 %s" % kit["team"])
    return " · ".join(parts)


def _worktree_dir(work_root: str, top: str, branch: str) -> str:
    base = os.path.join(os.path.realpath(os.path.expanduser(work_root)), os.path.basename(top))
    stem = "_" + branch.replace("/", "-")
    for n in range(1, 100):
        p = os.path.join(base, stem if n == 1 else "%s-%d" % (stem, n))
        if not os.path.lexists(p):
            return p
    raise ImportFail("工作目录的名字都被占了：%s" % base, "worktree_taken")


def _drop(top: str, wt: str, branch: str, base_sha: str) -> None:
    """Take back what a failed install made: its worktree, and its branch while nothing is committed on it."""
    g = Git(top)
    g.run("worktree", "remove", "--force", wt, timeout=60)
    if os.path.isdir(wt) and not os.path.islink(wt):  # the folder this install chose (it did not exist before)
        shutil.rmtree(wt, ignore_errors=True)
        g.run("worktree", "prune", timeout=30)
    if g.out("rev-parse", "-q", "--verify", "refs/heads/%s^{commit}" % branch) == base_sha:
        g.run("branch", "-D", branch, timeout=30)


def install_branch_ok(branch: str, default: str) -> bool:
    """The install branch a record names may be committed on and pushed: a plain branch name, never the default branch
    (imports.json is in the app's data dir, which the agents' OS user can write: it is read, not trusted)."""
    return bool(BRANCH_RE.match(branch or "")) and ".." not in branch and branch != default and ":" not in branch


def worktrees_of(top: str) -> set[str]:
    p = Git(top).run("worktree", "list", "--porcelain", timeout=GIT_TIMEOUT_S)
    return {os.path.realpath(x[9:]) for x in (p.stdout.splitlines() if p.returncode == 0 else []) if x.startswith("worktree ")}


def doctor_rows(text: str) -> list[dict[str, Any]]:
    """`brain doctor`'s lines as CheckRows (problems.row: short Chinese, brain-kit's line in raw). They are about the
    install worktree, not a listed repo: no 'kit' fix on them."""
    out = []
    for line in (text or "").splitlines():
        m = DOCTOR_RE.match(line.strip())
        # its KiroCrew lines are this machine's, which the page's own KiroCrew checks list (with their fixes) already
        if m and not m.group(2).strip().startswith("KiroCrew"):
            out.append(problems.row(m.group(1), m.group(2).strip()[:500]))
    return out


def brain_env() -> dict[str, str]:
    e = dict(os.environ)
    e.update({"GIT_TERMINAL_PROMPT": "0", "PYTHONIOENCODING": "utf-8", "GIT_OPTIONAL_LOCKS": "0"})
    return e


def install(top: str, kit: dict[str, str], branch: str, work_root: str, records: Records,
            step: Callable[..., None]) -> dict[str, Any]:
    """brain install on a new branch in its own worktree (blocking: run it in a thread). The person's checkout, its
    branch, index and files are never touched; a failure before the commit takes back the worktree and the branch."""
    g = Git(top)
    res: dict[str, Any] = {"mode": "branch", "path": top, "branch": branch, "base": None, "base_sha": None,
                           "worktree": None, "output": "", "kit": kit, "doctor": {"ran": False, "rows": [], "output": ""},
                           "files": [], "commit": {"ok": False, "sha": None, "blocked": False, "text": "", "output": ""},
                           "remote_url": (origin_of(g) or {}).get("url") or "", "target": kit["default_branch"]}
    step("branch", "running")
    if not bk.ok():
        raise ImportFail("brain-kit 没装载：先在设置里写对它的位置", "no_brainkit", 409, res)
    if os.path.exists(os.path.join(top, KIT)):
        raise ImportFail("这个仓库已经装了 brain-kit：直接「加入列表」", "installed", 409, res)
    if g.ok("rev-parse", "-q", "--verify", "refs/heads/" + branch):
        raise ImportFail("已经有 %s 分支了：先看看「检查」里它的状态，或者换个分支名" % branch, "branch_exists", 409, res)
    if g.ok("rev-parse", "-q", "--verify", "refs/remotes/origin/" + branch):
        raise ImportFail("origin 上已经有 %s 分支：换个分支名" % branch, "branch_exists", 409, res)
    got = base_ref(g, kit["default_branch"])
    if not got:
        raise ImportFail("找不到默认分支 %s（origin 上和本机都没有）：改一下表单里的默认分支" % kit["default_branch"],
                         "no_default_branch", 400, res)
    ref, sha = got
    res.update(base=short_ref(ref), base_sha=sha)
    if has_at(g, sha, KIT):
        raise ImportFail("%s 上已经装好 brain-kit 了：在这个目录里切到 %s、拉取最新的就行，不用再装" % (
            short_ref(ref), kit["default_branch"]), "installed", 409, res)
    links = symlinks_on_targets(g, sha)
    if links:
        raise ImportFail("仓库里 %s 是符号链接：brain install 会顺着它写到别处，这里不装。先把它换成普通的目录或文件" %
                         "、".join(links), "symlink", 409, res)
    if not work_root:
        raise ImportFail("设置里没有「每个需求的工作目录」", "no_work_root", 409, res)
    wr = os.path.realpath(os.path.expanduser(work_root))
    link = planted_link(os.path.join(os.path.expanduser(work_root), os.path.basename(top)))
    if link:
        raise ImportFail("工作目录的路径经过一个符号链接：%s → %s" % link, "symlink", 409, res)
    wt = _worktree_dir(wr, top, branch)
    os.makedirs(os.path.dirname(wt), exist_ok=True)
    p = run_quiet([GIT_BIN, "-C", top, "worktree", "add", "--no-track", "-b", branch, wt, sha], top, WORKTREE_TIMEOUT_S,
                  brain_env())
    if p.returncode != 0:
        if os.path.isdir(wt):
            _drop(top, wt, branch, sha)
        text = "建分支和工作目录没成功：%s" % last_lines(tail(p))
        step("branch", "fail", text)
        raise ImportFail(text, "worktree_failed", 500, res)
    res["worktree"] = os.path.realpath(wt)
    wt = res["worktree"]
    step("branch", "ok", "%s，从 %s（%s）建的，在 %s" % (branch, short_ref(ref), sha[:8], wt))

    step("install", "running")
    args = ["install", wt, "--prefix", kit["req_prefix"]] + (["--team", kit["team"]] if kit["team"] else [])
    p = run_quiet(brain_cmd() + args, wt, INSTALL_TIMEOUT_S, brain_env())
    res["output"] = tail(p)
    if p.returncode != 0 or not os.path.isfile(os.path.join(wt, KIT)):
        _drop(top, wt, branch, sha)
        res["worktree"] = None
        text = "brain install 没成功（退出码 %d），装了一半的分支和工作目录已经删掉：\n%s" % (p.returncode, last_lines(res["output"], 12))
        step("install", "fail", text)
        raise ImportFail(text, "install_failed", 500, res)
    step("install", "ok", "brain-kit %s" % (bk.info().get("version") or ""))

    step("kit", "running")
    try:
        path = os.path.join(wt, KIT)
        if os.path.islink(path) or os.path.islink(os.path.dirname(path)):
            raise ImportFail("%s 是符号链接：不写" % KIT, "symlink")
        C = bk.m("common")
        data = kit_data(C.load_json(path), kit)
        cm = bk.m("config")
        probs = cm.validate(cm.merged(cm.DEFAULTS, data))
        if probs:
            raise ImportFail("brain-kit 不接受这些值：%s" % "；".join(str(x) for x in probs), "invalid_kit")
        C.write_json(path, data)
    except ImportFail as exc:
        _drop(top, wt, branch, sha)
        res["worktree"] = None
        step("kit", "fail", str(exc))
        raise ImportFail(str(exc), exc.code, 400, res)
    except (OSError, ValueError) as exc:
        _drop(top, wt, branch, sha)
        res["worktree"] = None
        text = "写不了 kit.json：%s" % str(exc)[:200]
        step("kit", "fail", text)
        raise ImportFail(text, "kit_failed", 500, res)
    step("kit", "ok", kit_line(kit))

    step("doctor", "running")
    p = run_quiet(brain_cmd() + ["doctor", "--offline"], wt, DOCTOR_TIMEOUT_S, brain_env())
    rows = doctor_rows(p.stdout)
    res["doctor"] = {"ran": True, "rows": rows, "output": tail(p, 8000)}
    fails = sum(1 for r in rows if r["level"] == "FAIL")
    warns = sum(1 for r in rows if r["level"] == "WARN")
    if not rows:
        step("doctor", "warn", "自检没给出结果（退出码 %d）" % p.returncode)
    else:
        step("doctor", "warn" if fails else "ok", "%d 项通过，%d 项注意，%d 项没过" % (len(rows) - fails - warns, warns, fails))

    res["files"] = _status_rows(Git(wt).run("status", "--porcelain=v1", "-z", "--untracked-files=all",
                                            timeout=STATUS_TIMEOUT_S).stdout)[:MAX_FILES]
    records.put(top, {"branch": branch, "worktree": wt, "base": short_ref(ref), "base_sha": sha, "commit": None,
                      "kit": kit, "files": res["files"], "doctor": {"ok": len(rows) - fails - warns, "warn": warns,
                                                                    "fail": fails},
                      "at": time.time(), "pushed": False, "mr_iid": None, "mr_url": None,
                      "brainkit": bk.info().get("version")})
    res["commit"] = commit(top, records, step)
    return res


# ---- 更新 kit 文件 (the 'kit' fix) ----------------------------------------------------------------------------------- #

def free_branch(g: Git, branch: str) -> str:
    """*branch*, or *branch*-2, -3 … : the first name that is neither a local branch nor one on origin."""
    for n in range(1, 100):
        b = branch if n == 1 else "%s-%d" % (branch, n)
        if not (g.ok("rev-parse", "-q", "--verify", "refs/heads/" + b) or
                g.ok("rev-parse", "-q", "--verify", "refs/remotes/origin/" + b)):
            return b
    raise ImportFail("%s、%s-2 … 到 -99 都有了：换个分支名" % (branch, branch), "branch_exists", 409)


def kit_form(cfg: dict[str, Any]) -> dict[str, str]:
    """A repo's kit.json values in the install form's shape (KitForm)."""
    gl = cfg.get("gitlab") if isinstance(cfg.get("gitlab"), dict) else {}
    jr = cfg.get("jira") if isinstance(cfg.get("jira"), dict) else {}
    return {"req_prefix": str(cfg.get("req_prefix") or ""), "tracker": str(cfg.get("tracker") or ""),
            "jira_base": str(jr.get("base") or ""), "gitlab_base": str(gl.get("base") or ""),
            "gitlab_project": str(gl.get("project") or ""), "default_branch": str(cfg.get("default_branch") or ""),
            "team": str(cfg.get("team") or "")}


def _kit_of(path: str) -> dict[str, Any] | None:
    """brain-kit's config of the repo at *path* (kit.json merged with the defaults), None when it cannot be read."""
    if os.path.islink(os.path.join(path, KIT)) or not os.path.isfile(os.path.join(path, KIT)):
        return None
    try:
        return bk.m("config").load(path)
    except Exception:  # noqa: BLE001 - brain-kit says what is wrong with it elsewhere (检查)
        return None


def upgrade_text(res: dict[str, Any]) -> str:
    c = res.get("commit") or {}
    if not res.get("changed"):
        return UP_TO_DATE
    if not c.get("ok"):
        return c.get("text") or "还没提交"
    if res.get("remote_url"):
        return "提交在新分支 %s 上：推送并开 MR，合进 %s 以后点「拉取」" % (res["branch"], res["target"])
    return "提交在本机分支 %s 上（这个仓库没有远端）：点「合并到 %s」就生效" % (res["branch"], res["target"])


def upgrade(top: str, branch: str, work_root: str, records: Records, step: Callable[..., None], *,
            token: bool = False) -> dict[str, Any]:
    """brain install again, for a repo that has brain-kit, on a new branch in its own worktree (blocking: run it in a
    thread). *branch*: the name asked for (a taken one gets -2, -3 …); *records*: the upgrade records (upgrades.json),
    never the install ones. The person's checkout, its branch, index and files are never touched; a failure before
    the commit, or nothing to commit, takes back the worktree and the branch."""
    res: dict[str, Any] = {"mode": "branch", "path": top, "branch": branch, "base": None, "base_sha": None,
                           "worktree": None, "output": "", "kit": kit_form({}),
                           "doctor": {"ran": False, "rows": [], "output": ""},
                           "files": [], "commit": {"ok": False, "sha": None, "blocked": False, "text": "", "output": ""},
                           "changed": False, "remote_url": "", "target": "", "gitlab_project": "", "can_open_mr": False,
                           "text": ""}
    step("branch", "running")
    if not bk.ok():
        raise ImportFail("brain-kit 没装载：先在设置里写对它的位置", "no_brainkit", 409, res)
    g = Git(top)
    cfg = _kit_of(top)
    d = str((cfg or {}).get("default_branch") or "") or (default_branch(g)[0] or "")
    origin = origin_of(g)
    res["remote_url"] = (origin or {}).get("url") or ""
    got = base_ref(g, d) if d else None
    if not got:
        raise ImportFail("找不到默认分支%s（origin 上和本机都没有）" % (" " + d if d else ""), "no_default_branch", 409, res)
    ref, sha = got
    res.update(base=short_ref(ref), base_sha=sha, target=d)
    if not has_at(g, sha, KIT):
        raise ImportFail("%s 上还没有 .brain/kit.json：先在「导入仓库」里装上 brain-kit" % short_ref(ref),
                         "not_installed", 409, res)
    links = symlinks_on_targets(g, sha)
    if links:
        raise ImportFail("仓库里 %s 是符号链接：brain install 会顺着它写到别处，这里不装。先把它换成普通的目录或文件" %
                         "、".join(links), "symlink", 409, res)
    if not work_root:
        raise ImportFail("设置里没有「每个需求的工作目录」", "no_work_root", 409, res)
    wr = os.path.realpath(os.path.expanduser(work_root))
    link = planted_link(os.path.join(os.path.expanduser(work_root), os.path.basename(top)))
    if link:
        raise ImportFail("工作目录的路径经过一个符号链接：%s → %s" % link, "symlink", 409, res)
    branch = free_branch(g, branch)
    if not install_branch_ok(branch, d):
        raise ImportFail("分支名 %s 不能用（不能是默认分支）" % branch, "invalid_branch", 400, res)
    res["branch"] = branch
    wt = _worktree_dir(wr, top, branch)
    os.makedirs(os.path.dirname(wt), exist_ok=True)
    p = run_quiet([GIT_BIN, "-C", top, "worktree", "add", "--no-track", "-b", branch, wt, sha], top, WORKTREE_TIMEOUT_S,
                  brain_env())
    if p.returncode != 0:
        if os.path.isdir(wt):
            _drop(top, wt, branch, sha)
        text = "建分支和工作目录没成功：%s" % last_lines(tail(p))
        step("branch", "fail", text)
        raise ImportFail(text, "worktree_failed", 500, res)
    wt = os.path.realpath(wt)
    res["worktree"] = wt
    step("branch", "ok", "%s，从 %s（%s）建的，在 %s" % (branch, short_ref(ref), sha[:8], wt))
    try:
        step("install", "running")
        p = run_quiet(brain_cmd() + ["install", wt], wt, INSTALL_TIMEOUT_S, brain_env())
        res["output"] = tail(p)
        wcfg = _kit_of(wt) if p.returncode == 0 else None
        if wcfg is None:
            text = ("brain install 没成功（退出码 %d），新建的分支和工作目录已经删掉：\n%s" % (
                p.returncode, last_lines(res["output"], 12)) if p.returncode != 0 else
                "brain install 跑完了，可读不了 .brain/kit.json（默认分支上的它就有问题？）：新建的分支和工作目录已经删掉")
            step("install", "fail", text)
            raise ImportFail(text, "install_failed", 500, res)
        step("install", "ok", "brain-kit %s" % (bk.info().get("version") or ""))
        kit = kit_form(wcfg)
        kit["default_branch"] = kit["default_branch"] or d
        res["kit"] = kit
        base = kit["gitlab_base"] or (origin or {}).get("base") or ""
        res["gitlab_project"] = kit["gitlab_project"] or (origin or {}).get("project") or ""
        res["can_open_mr"] = bool(token and origin and base and res["gitlab_project"])

        step("doctor", "running")
        p = run_quiet(brain_cmd() + ["doctor", "--offline"], wt, DOCTOR_TIMEOUT_S, brain_env())
        rows = doctor_rows(p.stdout)
        res["doctor"] = {"ran": True, "rows": rows, "output": tail(p, 8000)}
        fails = sum(1 for r in rows if r["level"] == "FAIL")
        warns = sum(1 for r in rows if r["level"] == "WARN")
        if not rows:
            step("doctor", "warn", "自检没给出结果（退出码 %d）" % p.returncode)
        else:
            step("doctor", "warn" if fails else "ok", "%d 项通过，%d 项注意，%d 项没过" % (len(rows) - fails - warns, warns,
                                                                                 fails))
        res["files"] = _status_rows(Git(wt).run("status", "--porcelain=v1", "-z", "--untracked-files=all",
                                                timeout=STATUS_TIMEOUT_S).stdout)[:MAX_FILES]
    except BaseException:
        _drop(top, wt, branch, sha)
        res["worktree"] = None
        raise
    if not [f for f in res["files"] if not (f["change"] == "added" and f["path"].startswith(LEAN_AUDIT))]:
        _drop(top, wt, branch, sha)
        res.update(worktree=None, files=[], text=UP_TO_DATE)
        res["commit"]["text"] = UP_TO_DATE
        step("commit", "ok", UP_TO_DATE)
        return res
    res["changed"] = True
    records.put(top, {"purpose": "upgrade", "branch": branch, "worktree": wt, "base": short_ref(ref), "base_sha": sha,
                      "commit": None, "kit": res["kit"], "files": res["files"],
                      "doctor": {"ok": len(rows) - fails - warns, "warn": warns, "fail": fails}, "at": time.time(),
                      "pushed": False, "mr_iid": None, "mr_url": None, "brainkit": bk.info().get("version")})
    res["commit"] = commit(top, records, step, purpose="upgrade")
    res["text"] = upgrade_text(res)
    return res


def commit_message(kit: dict[str, str], purpose: str = "install", version: Any = None,
                   inplace: bool = False) -> tuple[str, str]:
    where_zh = "在这个检出里" if inplace else "在单独的工作目录里"
    where_en = "in place, on the checkout's branch" if inplace else "in a worktree of its own"
    if purpose == "upgrade":
        return ("Update brain-kit's kit files (brain install)",
                "brain-kit%s 的 `brain install` %s重装了这个仓库的 kit 文件（AI-DLC Lean、KiroCrew 的 hook "
                "适配、aidlc-docs/lean.json 的 fingerprint_exclude 加上 runs/** 等）；.brain/kit.json 没动。由 Brain app "
                "的「重装 kit 文件」发起。\n\nkit.json: %s" % (" " + str(version) if version else "", where_zh, kit_line(kit)))
    return ("Install brain-kit (brain install)",
            "AI-DLC Lean, the KiroCrew hook adapter, .brain/kit.json, the Brain files and AGENTS.md, made by brain-kit's "
            "`brain install` %s (the Brain app's 导入仓库).\n\nkit.json: %s" % (where_en, kit_line(kit)))


def commit_failure(p: Any, where: str, purpose: str = "install") -> tuple[bool, str]:
    """(a hook said no, the plain words) for a `git commit` that did not go through."""
    low = ((p.stderr or "") + (p.stdout or "")).lower()
    if "please tell me who you are" in low or "empty ident" in low or "unable to auto-detect email" in low:
        return False, ("git 不知道你是谁：在终端里设好 git config --global user.name 和 user.email（这里不替你填），"
                       "再点「再提交一次」")
    if "nothing to commit" in low or "nothing added to commit" in low or "no changes added to commit" in low:
        return False, (UP_TO_DATE if purpose == "upgrade" else "没有可提交的改动：brain install 什么也没写？看看 %s" % where)
    return True, "提交被拦下了（多半是 git hook），它说：\n%s\n\n改动还在 %s 里：处理好以后点「再提交一次」。" % (
        last_lines(tail(p), 15) or "（什么也没说，退出码 %d）" % p.returncode, where)


def commit(top: str, records: Records, step: Callable[..., None] | None = None, *,
           purpose: str = "install") -> dict[str, Any]:
    """git add -A and git commit in the install (or upgrade) worktree, with the person's own identity (their git
    config) and their hooks: a hook that says no is shown as it said it, nothing is bypassed. Again after a hook said
    no: the same. *records*: the install records, or the upgrade records for purpose "upgrade"."""
    step = step or (lambda *a, **k: None)
    out = {"ok": False, "sha": None, "blocked": False, "text": "", "output": ""}
    rec = records.get(top)
    if not rec or not rec.get("worktree") or not os.path.isdir(rec["worktree"]):
        raise ImportFail("找不到安装用的工作目录：重新检查一下", "no_worktree", 409)
    wt, branch = os.path.realpath(rec["worktree"]), str(rec.get("branch") or "")
    if not install_branch_ok(branch, (rec.get("kit") or {}).get("default_branch") or "") or wt not in worktrees_of(top):
        raise ImportFail("记下的安装分支或工作目录不对（%s，%s）：不提交。重新检查一下" % (branch, wt), "bad_record", 409)
    g = Git(wt)
    step("commit", "running")
    if g.out("symbolic-ref", "-q", "--short", "HEAD") != branch:
        raise ImportFail("工作目录 %s 不在 %s 分支上了：不提交" % (wt, branch), "wrong_branch", 409)
    head = g.out("rev-parse", "-q", "--verify", "HEAD^{commit}")
    if head and head != rec.get("base_sha") and has_at(g, "HEAD", KIT):
        out.update(ok=True, sha=head, text="已经提交过了：%s" % head[:8])
        records.update(top, commit=head)
        step("commit", "ok", out["text"])
        return out
    p = run_quiet([GIT_BIN, "-C", wt, "add", "-A"], wt, GIT_TIMEOUT_S * 2, brain_env())
    if p.returncode != 0:
        out.update(text="git add 没成功：%s" % last_lines(tail(p)), output=tail(p))
        step("commit", "fail", out["text"])
        return out
    subject, body = commit_message(rec.get("kit") or {}, purpose, rec.get("brainkit"))
    p = run_quiet([GIT_BIN, "-C", wt, "commit", "-q", "-m", subject, "-m", body], wt, COMMIT_TIMEOUT_S, brain_env())
    out["output"] = tail(p)
    if p.returncode == 0:
        sha = g.out("rev-parse", "-q", "--verify", "HEAD^{commit}")
        who = g.out("log", "-1", "--format=%an <%ae>", "HEAD")
        out.update(ok=True, sha=sha, text="提交了 %s（作者 %s）" % (sha[:8], who))
        records.update(top, commit=sha, committed_by=who)
        step("commit", "ok", out["text"])
        return out
    out["blocked"], out["text"] = commit_failure(p, "工作目录 %s" % wt, purpose)
    step("commit", "fail", out["text"])
    return out


# ---- 推送并开 MR ------------------------------------------------------------------------------------------------------ #

def mr_title(purpose: str = "install") -> str:
    return "更新 brain-kit 的 kit 文件（brain install）" if purpose == "upgrade" else "装上 brain-kit（brain install）"


FILE_GROUPS = (
    (".kiro/aidlc-lean/", "AI-DLC Lean 本体"), (".kiro/hooks/", "Lean 的 hook"), (".kiro/brain/", "KiroCrew 的 Lean hook 适配"),
    (".kiro/agents/", "brain-dev agent"), (".kiro/skills/", "skills（Lean 的和 brain 的）"),
    (".kiro/steering/", "steering"), ("aidlc-docs/", "Lean 的配置和记录（lean.json 的 fingerprint_exclude 加了 runs/**）"),
    (".brain/", "brain-kit 的配置 kit.json"), ("brain/", "Brain：PRODUCT、TECH、IMPROVEMENT、PROJECT"),
    ("AGENTS.md", "给 agent 的总说明"), (".gitignore", "加了 .brain-materials/（需求材料不进 git）"),
)


def mr_description(rec: dict[str, Any], purpose: str = "install") -> str:
    """What the install adds (or the upgrade changes), as a plain list (made inert like brain-kit's own MR texts when
    mrdesc is there)."""
    kit = rec.get("kit") or {}
    files = [f for f in rec.get("files") or [] if isinstance(f, dict)]
    groups: dict[str, list[str]] = {}
    for f in files:
        path = str(f.get("path") or "")
        label = next((lab for pre, lab in FILE_GROUPS if path == pre or path.startswith(pre)), "其他")
        key = next((pre for pre, _ in FILE_GROUPS if path == pre or path.startswith(pre)), path)
        groups.setdefault("%s\0%s" % (key, label), []).append(path)
    version = " " + str(rec["brainkit"]) if rec.get("brainkit") else ""
    if purpose == "upgrade":
        lines = ["用 brain-kit%s 的 `brain install` 更新这个仓库的 kit 文件（.brain/kit.json 没动）。在单独的工作目录里做的，"
                 "原来的检出没动。" % version, "", "**改了什么**", ""]
    else:
        lines = ["用 brain-kit%s 的 `brain install` 装进这个仓库。在单独的工作目录里做的，原来的检出没动。" % version, "",
                 "**装了什么**", ""]
    for k, paths in groups.items():
        pre, label = k.split("\0", 1)
        lines.append("- `%s`：%s（%d 个文件）" % (pre, label, len(paths)))
    lines += ["", "**.brain/kit.json**", "",
              "- 需求号：%s-1、%s-2 …（跟踪：%s）" % (kit.get("req_prefix"), kit.get("req_prefix"), kit.get("tracker")),
              "- 默认分支：%s" % kit.get("default_branch")]
    if kit.get("gitlab_project"):
        lines.append("- GitLab：%s（%s）" % (kit.get("gitlab_project"), kit.get("gitlab_base")))
    if kit.get("team"):
        lines.append("- 团队：%s" % kit.get("team"))
    d = rec.get("doctor") or {}
    if d:
        lines += ["", "`brain doctor`：%s 项通过，%s 项注意，%s 项没过" % (d.get("ok", 0), d.get("warn", 0), d.get("fail", 0))]
    lines += ["", "合并以后在各自的检出里 git pull，Brain app 里这个仓库就能用了（app 给每个需求建的工作目录从默认分支来）。"
              if purpose != "upgrade" else
              "合并以后在各自的检出里 git pull：app 给每个需求建的工作目录从默认分支来，新的 kit 文件从那时起生效。"]
    text = "\n".join(lines)
    try:
        return bk.m("mrdesc").inert(text) if bk.has("mrdesc") and hasattr(bk.m("mrdesc"), "inert") else text
    except Exception:  # noqa: BLE001
        return text


def new_mr_link(base: str, project: str, branch: str, target: str) -> str | None:
    if not base or not project:
        return None
    return "%s/%s/-/merge_requests/new?%s=%s&%s=%s" % (
        base.rstrip("/"), project, quote("merge_request[source_branch]", safe=""), quote(branch, safe=""),
        quote("merge_request[target_branch]", safe=""), quote(target, safe=""))


def mr_commands(top: str, branch: str, target: str, base: str, project: str, desc: str,
                purpose: str = "install") -> list[str]:
    q = shlex.quote
    cmds = ["git -C %s push origin %s" % (q(top), q(branch))]
    repo = "%s/%s" % (base.rstrip("/"), project) if base and project else ""
    cmds.append("glab mr create %s--source-branch %s --target-branch %s --title %s --description %s --yes" % (
        "-R %s " % q(repo) if repo else "", q(branch), q(target), q(mr_title(purpose)), q(desc)))
    return cmds


def publish(top: str, records: Records, confirm: dict[str, Any], *, transport: Any = None,
            purpose: str = "install") -> dict[str, Any]:
    """Push the install (or upgrade) branch to origin and open its MR with the person's GitLab token (blocking: run it
    in a thread). *confirm* is what the person confirmed on the page: the branch, the remote URL and the target;
    anything else is refused (the page was out of date). Without a token or a GitLab project, the exact commands
    instead. *records*: the install records, or the upgrade records for purpose "upgrade"."""
    rec = records.get(top)
    if not rec or not rec.get("branch"):
        raise ImportFail("这个仓库没有 app 更新 kit 文件的分支：先点「重装 kit 文件」" if purpose == "upgrade" else
                         "这个仓库没有 app 装的分支：先装到新分支", "no_install", 409)
    if not rec.get("commit"):
        raise ImportFail("还没提交：先提交，再推送", "not_committed", 409)
    g = Git(top)
    branch, kit = str(rec["branch"]), rec.get("kit") or {}
    target = kit.get("default_branch") or "main"
    if not install_branch_ok(branch, target):
        raise ImportFail("记下的安装分支 %s 不对：不推送" % branch, "bad_record", 409)
    sha = g.out("rev-parse", "-q", "--verify", "refs/heads/%s^{commit}" % branch)
    if not sha:
        raise ImportFail("分支 %s 不在了" % branch, "no_branch", 409)
    origin = origin_of(g)
    if origin is None:
        raise ImportFail("没有 origin：推不了。先 git remote add origin <地址>", "no_origin", 409)
    if (confirm.get("branch"), confirm.get("target"), confirm.get("remote_url")) != (branch, target, origin["url"]):
        raise ImportFail("页面上的信息过期了：重新检查一下，再确认", "stale_confirm", 409)
    base = kit.get("gitlab_base") or origin["base"]
    project = kit.get("gitlab_project") or origin["project"]
    desc = mr_description(rec, purpose)
    out = {"ok": False, "pushed": False, "branch": branch, "target": target, "remote_url": origin["url"],
           "mr": None, "text": "", "output": "",
           "commands": mr_commands(top, branch, target, base, project, desc, purpose),
           "new_mr_url": new_mr_link(base, project, branch, target)}
    p = run_quiet([GIT_BIN, "-C", top, "push", "origin", "refs/heads/%s:refs/heads/%s" % (branch, branch)], top,
                  PUSH_TIMEOUT_S, quiet_env(top))
    out["output"] = tail(p, 8000)
    if p.returncode != 0:
        _, text = git_failure(p, "推送", origin["url"])
        out["text"] = text
        return out
    out["pushed"] = True
    records.update(top, pushed=True, pushed_at=time.time(), pushed_sha=sha)
    if not base or not project:
        out.update(ok=True, text="推上去了。kit.json 里没写 GitLab 项目，MR 要你自己开：用下面的命令或链接。")
        return out
    rest = bk.m("rest")
    try:
        tok = rest.read_token()
    except Exception as exc:  # noqa: BLE001 - a token file others can read is refused, as brain-kit does
        out.update(ok=True, text="推上去了。GitLab token 读不了（%s），MR 要你自己开：用下面的命令或链接。" %
                   str(exc).split("\n", 1)[0][:200])
        return out
    if not tok:
        out.update(ok=True, text="推上去了。这台机器上没有 GitLab token（$GITLAB_TOKEN 或 ~/.brain/gitlab-token），MR "
                                 "要你自己开：用下面的命令或链接。")
        return out
    try:
        gl = rest.GitLab(base, tok, transport)
        mr = gl.mr_for_branch(project, branch)
        existing = bool(mr)
        if not mr:
            mr = gl.create_mr(project, branch, target, mr_title(purpose), [], description=desc)
        iid = int((mr or {}).get("iid") or 0)
        url = (mr or {}).get("web_url") or "%s/%s/-/merge_requests/%d" % (base.rstrip("/"), project, iid)
        out["mr"] = {"iid": iid, "url": url, "existing": existing}
        records.update(top, mr_iid=iid, mr_url=url)
        out.update(ok=True, text=("推上去了，MR !%d 本来就开着" if existing else "推上去了，开了 MR !%d") % iid)
    except Exception as exc:  # noqa: BLE001 - GitLab down, no rights: the branch is pushed, the MR is the person's
        out.update(ok=True, text="推上去了，但 MR 没开成（%s）：用下面的命令或链接自己开。" % str(exc).split("\n", 1)[0][:200])
    return out
