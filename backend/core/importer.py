"""导入仓库: how a project repo gets into the app's list.

  inspect  read only. The repo's top level (a subfolder: its top level; a linked worktree: its main checkout), git or
           not, the current and the default branch (origin/HEAD, else main / master), origin and the GitLab it
           suggests, clean or dirty, brain-kit (.brain/kit.json, committed or not, on the default branch or not), AI-DLC
           Lean, the Brain files, AGENTS.md, KiroCrew's checks (crewcheck), already in the list. Each check says why
           and what to do.
  clone    ``git clone`` of a URL into a parent folder: no shell, no prompt (GIT_TERMINAL_PROMPT=0, askpass that
           answers nothing, ssh in batch mode, a new session so no terminal can be asked), a time limit; the usual
           failures said in plain Chinese.
  install  ``brain install`` on a NEW branch (default brain/install) in its own worktree under work_root, made from the
           default branch: the person's checkout is never touched. Then the form's kit.json values, ``brain doctor``,
           the changed files, and a commit with the person's own git identity (their hooks run; nothing is bypassed).
  publish  push that branch and open its MR with the person's GitLab token (brain-kit's GitLab client, as the app
           reads MRs), or the exact commands when the app cannot.
  Records  what the app installed where (``imports.json`` in its data dir), so a listed repo whose brain-kit is only on
           the unmerged install branch shows 「安装在 brain/install 分支上，合并后生效」 instead of an error.

Every path from the page is checked: absolute, no ``..``, a real directory, no symlink on the way that the OS user could
have made (agents run as that user; root's own aliases such as macOS's /tmp are fine), and from then on its realpath.
Every git call has a time limit. Nothing here reads, logs or returns a token: it stays inside brain-kit's client.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import re
import secrets
import shlex
import shutil
import signal
import stat
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote, urlsplit, urlunsplit

from . import bk, crewcheck
from .constants import GIT_BIN
from .intake import brain_cmd
from .repo import GIT_ENV, Git

DEFAULT_BRANCH = "brain/install"
KIT = ".brain/kit.json"
GIT_TIMEOUT_S = 30
STATUS_TIMEOUT_S = 60
WORKTREE_TIMEOUT_S = 180
CLONE_TIMEOUT_S = 900
INSTALL_TIMEOUT_S = 300
DOCTOR_TIMEOUT_S = 180
COMMIT_TIMEOUT_S = 300
PUSH_TIMEOUT_S = 300
CREW_TIMEOUT_S = 60
MAX_OUT = 20000
MAX_FILES = 500
WORK_DIRS = ("workplace", "workplaces", "workspace", "workspaces")
# what `brain install` writes (brain-kit's kit/, Lean's install.sh, the kit config, the Brain, AGENTS.md, .gitignore):
# a symlink committed at one of these would make it write somewhere else
INSTALL_TARGETS = (".kiro", ".brain", "aidlc-docs", "brain", "AGENTS.md", ".gitignore")
LEAN_SCRIPT = ".kiro/aidlc-lean/aidlc_lean.py"
LEAN_CONFIG = "aidlc-docs/lean.json"
BRAIN_FILES = ("PRODUCT.md", "TECH.md", "IMPROVEMENT.md", "PROJECT.md")

CTRL_RE = re.compile(r"[\x00-\x1f\x7f\u2028\u2029]")
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
SCP_RE = re.compile(r"^(?P<user>[A-Za-z0-9._-]+)@(?P<host>[A-Za-z0-9][A-Za-z0-9.-]*):(?P<path>[A-Za-z0-9._~][A-Za-z0-9._~/-]*)$")
PROJECT_RE = re.compile(r"^[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)+$")
BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$")
PREFIX_RE = re.compile(r"^[A-Z][A-Z0-9]{0,9}$")
BASE_RE = re.compile(r"^https?://[A-Za-z0-9][A-Za-z0-9.-]*(?::[0-9]{1,5})?(?:/[A-Za-z0-9._~-]+)*$")
DOCTOR_RE = re.compile(r"^(OK|WARN|FAIL)\s+(.+)$")
CRED_RE = re.compile(r"(?i)\b((?:https?|ssh|git)://)[^/@\s]+@")
NOT_GITLAB = {"github.com", "www.github.com", "bitbucket.org", "codeberg.org"}
FALSE_BIN = shutil.which("false") or "/usr/bin/false"

CLONE_STEPS = (("clone", "克隆"),)
INSTALL_STEPS = (("branch", "建分支和工作目录"), ("install", "跑 brain install"), ("kit", "写 kit.json"),
                 ("doctor", "跑 brain doctor"), ("commit", "提交"))
KIND_LABEL = {"clone": "克隆", "install": "安装"}


class ImportFail(Exception):
    """A refusal or a failure, said in plain Chinese (the route answers it as an AppError). *result*: what was done
    before it (shown with the error)."""

    def __init__(self, message: str, code: str = "import_failed", status: int = 400, result: Any = None) -> None:
        super().__init__(message)
        self.code, self.status, self.result = code, status, result


class NotARepo(Exception):
    """The folder is not (inside) a git checkout; *todo* says what to do."""

    def __init__(self, why: str, todo: str) -> None:
        super().__init__(why)
        self.todo = todo


# ---- paths --------------------------------------------------------------------------------------------------------- #

def planted_link(path: str) -> tuple[str, str] | None:
    """The first symlink on the way to *path* that this OS user (or any user but root) could have made: (the link, where
    it points). Root's own links (macOS's /tmp, /var, /etc) are system aliases and fine. None: there is none, or the
    rest of the path does not exist yet."""
    cur = os.sep
    for part in [p for p in path.split(os.sep) if p]:
        cur = os.path.join(cur, part)
        try:
            st = os.lstat(cur)
        except OSError:
            return None
        if stat.S_ISLNK(st.st_mode) and st.st_uid != 0:
            try:
                to = os.readlink(cur)
            except OSError:
                to = "?"
            return cur, to
    return None


def checked_path(raw: Any, what: str = "目录") -> str:
    """*raw* as an absolute, normalized path (``~`` expanded) with no planted symlink on the way, not resolved yet."""
    if not isinstance(raw, str) or not raw.strip():
        raise ImportFail("先写%s" % what, "invalid_path")
    s = raw.strip()
    if len(s) > 1024 or CTRL_RE.search(s):
        raise ImportFail("%s里有不该有的字符" % what, "invalid_path")
    p = os.path.expanduser(s)
    if not os.path.isabs(p):
        raise ImportFail("%s要写绝对路径（以 / 或 ~ 开头）：%s" % (what, s), "invalid_path")
    if ".." in p.split(os.sep):
        raise ImportFail("%s里不要有 ..：直接写完整的路径" % what, "invalid_path")
    p = os.path.normpath(p)
    link = planted_link(p)
    if link:
        raise ImportFail("%s经过一个符号链接：%s → %s。不顺着链接走：直接写它指向的真实目录" % (what, link[0], link[1]),
                         "symlink")
    return p


def clean_dir(raw: Any, what: str = "目录") -> str:
    """An existing directory the page named, as its realpath (see checked_path)."""
    p = checked_path(raw, what)
    real = os.path.realpath(p)
    if not os.path.exists(real):
        raise ImportFail("找不到%s：%s" % (what, p), "not_found", 404)
    if not os.path.isdir(real):
        raise ImportFail("这不是一个目录：%s" % p, "not_a_directory")
    return real


def under_work_dirs(path: str) -> bool:
    """*path* is ~/workplace or ~/workspace (or under it): where KiroCrew lets agents work."""
    home = os.path.realpath(os.path.expanduser("~"))
    rp = os.path.realpath(path)
    return any(rp == os.path.join(home, w) or rp.startswith(os.path.join(home, w) + os.sep) for w in WORK_DIRS)


def default_parent(work_root: str) -> str:
    """Where a clone goes unless the person says otherwise: the folder that holds work_root (~/workplace for the
    default ~/workplace/brain-app), else ~/workplace. Never work_root itself: the requirement worktrees go there, under
    work_root/<repo name>/."""
    wr = os.path.realpath(os.path.expanduser(work_root or ""))
    parent = os.path.dirname(wr) if work_root else ""
    if parent and under_work_dirs(parent):
        return parent
    return os.path.join(os.path.realpath(os.path.expanduser("~")), "workplace")


# ---- git ------------------------------------------------------------------------------------------------------------ #

def run_quiet(cmd: list[str], cwd: str, timeout: float, env: dict[str, str] | None = None) -> subprocess.CompletedProcess:
    """A command that may ask for something (git over the network, hooks, brain-kit): no shell, stdin closed, its own
    session (so no terminal can be asked for a password), killed with its children after *timeout* (exit 124)."""
    try:
        p = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace",
                             start_new_session=True)
    except OSError as exc:
        return subprocess.CompletedProcess(cmd, 127, "", str(exc))
    try:
        out, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except OSError:
            p.kill()
        out, err = p.communicate()
        return subprocess.CompletedProcess(cmd, 124, out or "", (err or "") + "\n（超过 %d 秒，停掉了）" % timeout)
    return subprocess.CompletedProcess(cmd, p.returncode, out or "", err or "")


def quiet_env(cwd: str | None = None) -> dict[str, str]:
    """The environment for git over the network: never a prompt (no terminal, an askpass that answers nothing, Git
    Credential Manager not interactive, ssh in batch mode unless the person set their own ssh command), English
    messages for the error texts below. Credential helpers and ssh-agent still work."""
    e = dict(os.environ)
    e.update(GIT_ENV)
    e.update({"GIT_ASKPASS": FALSE_BIN, "SSH_ASKPASS": FALSE_BIN, "SSH_ASKPASS_REQUIRE": "never",
              "GCM_INTERACTIVE": "never", "PYTHONIOENCODING": "utf-8"})
    if not e.get("GIT_SSH_COMMAND") and not e.get("GIT_SSH"):
        own = Git(cwd or os.path.expanduser("~")).run("config", "--get", "core.sshCommand", timeout=10)
        if own.returncode != 0 or not own.stdout.strip():
            e["GIT_SSH_COMMAND"] = "ssh -o BatchMode=yes -o ConnectTimeout=20"
    return e


def tail(p: subprocess.CompletedProcess, limit: int = MAX_OUT) -> str:
    text = ((p.stdout or "") + (("\n" + p.stderr) if p.stderr else "")).strip()
    return hide_credentials(text[-limit:])


def hide_credentials(text: str) -> str:
    """A user:password@ (or token@) in a URL in git's output, hidden."""
    return CRED_RE.sub(lambda m: m.group(1) + "[已隐去]@", text or "")


def last_lines(text: str, n: int = 6) -> str:
    lines = [x for x in (text or "").strip().splitlines() if x.strip()]
    return "\n".join(lines[-n:])


# The usual git failures, by what git (LC_ALL=C), ssh and GitLab print; first match wins.
FAILS = (
    ("exists", ("already exists and is not an empty directory",)),
    ("notfound", ("repository not found", "could not be found", "does not appear to be a git repository",
                  "returned error: 404", "not found", "no such file or directory", "does not exist")),
    ("hook", ("hook declined", "pre-receive hook", "pre-push hook", "rejected by", "push declined")),
    ("rejected", ("[rejected]", "non-fast-forward", "fetch first", "failed to push some refs")),
    ("auth", ("permission denied", "host key verification failed", "authentication failed", "could not read username",
              "could not read password", "terminal prompts disabled", "returned error: 401", "returned error: 403",
              "access denied", "invalid username or password", "too many authentication failures",
              "no supported authentication methods", "sign_and_send_pubkey", "you are not allowed")),
    ("unreachable", ("could not resolve host", "could not resolve hostname", "name or service not known",
                     "nodename nor servname", "temporary failure in name resolution", "connection timed out",
                     "operation timed out", "connection refused", "network is unreachable", "no route to host",
                     "failed to connect", "couldn't connect", "connection reset", "ssl certificate problem",
                     "unable to access")),
    ("auth", ("could not read from remote repository",)),
)


def git_failure(p: subprocess.CompletedProcess, what: str, url: str = "") -> tuple[str, str]:
    """(kind, plain Chinese) for a failed git network command: auth (refresh the SSH credentials and retry), exists,
    notfound, unreachable, rejected, hook, timeout, other (git's last lines)."""
    text = (p.stderr or "") + "\n" + (p.stdout or "")
    if p.returncode == 124:
        if what == "克隆":
            span = "%d 分钟" % (CLONE_TIMEOUT_S // 60) if CLONE_TIMEOUT_S >= 60 else "%d 秒" % CLONE_TIMEOUT_S
            return "timeout", ("克隆超过 %s 还没完：网络太慢或仓库太大。可以在终端里自己 git clone，再回来用「本机目录」"
                               "导入。" % span)
        return "timeout", "%s超时了：网络太慢。稍后再试。" % what
    low = text.lower()
    https = url.lower().startswith("http")
    for kind, needles in FAILS:
        if any(n in low for n in needles):
            if kind == "exists":
                return kind, "目标目录已经有了：换个目录名；它要是就是这个仓库，用「本机目录」导入它。"
            if kind == "notfound":
                return kind, "找不到这个仓库，或者你没有权限看它：检查地址，确认你在 GitLab 网页上能打开它。"
            if kind == "hook":
                return kind, "%s被 hook 拦下了，它说：\n%s" % (what, last_lines(hide_credentials(text), 12))
            if kind == "rejected":
                return kind, "远端已经有这个分支，而且和这里的不一样：换个分支名重装，或者先在 GitLab 上看看它是谁的。"
            if kind == "auth":
                if https:
                    return kind, ("https 登录没过：git 没有能用的凭据（这里不会弹窗问密码）。改用 SSH 地址，或者先在终端里 "
                                  "git clone 一次让 git 记住凭据，再试。")
                return kind, ("SSH 登录没过（密钥或证书不对，或者过期了）：刷新你的 SSH 凭据（比如重新跑 mwinit，或者 "
                              "ssh-add 加上密钥），再试一次。")
            host = _host_of(url)
            return kind, "连不上%s：检查地址、网络或 VPN，再试一次。" % (" " + host if host else "这个地址")
    return "other", "%s没成功：%s" % (what, last_lines(hide_credentials(text)) or "（git 什么也没说，退出码 %d）" % p.returncode)


def _host_of(url: str) -> str:
    m = SCP_RE.match(url or "")
    if m:
        return m.group("host")
    if "://" in (url or ""):
        return urlsplit(url).hostname or ""
    return ""


def _main_worktree(top: str) -> tuple[str | None, bool]:
    """(the main worktree's path, whether it is bare) from git's list (the first entry is the main one)."""
    p = Git(top).run("worktree", "list", "--porcelain", timeout=GIT_TIMEOUT_S)
    path, bare = None, False
    for line in p.stdout.splitlines() if p.returncode == 0 else []:
        if not line:
            break
        if line.startswith("worktree "):
            path = line[9:]
        elif line == "bare":
            bare = True
    return path, bare


def locate(real: str) -> dict[str, str]:
    """The checkout *real* (an existing directory) belongs to: {top, note}. A subfolder: its top level; a linked worktree
    (the app's own requirement worktrees too): its main checkout. NotARepo when it is no checkout."""
    g = Git(real)
    p = g.run("rev-parse", "--show-toplevel", timeout=GIT_TIMEOUT_S)
    if p.returncode != 0:
        err = (p.stderr or "").lower()
        if "dubious ownership" in err or "safe.directory" in err:
            raise NotARepo("git 不信任这个目录（它属于别的系统用户）", "用你自己的检出")
        if g.out("rev-parse", "--is-bare-repository") == "true":
            raise NotARepo("这是一个裸仓库（没有检出的文件）", "用「克隆」，地址写这个路径，克隆出一个检出再导入")
        if g.out("rev-parse", "--is-inside-git-dir") == "true":
            raise NotARepo("这是仓库的 .git 目录", "选仓库本身的目录（.git 的上一层）")
        raise NotARepo("不是 git 仓库", "在终端里 git init 并提交一次；或者用「克隆」")
    top = os.path.realpath(p.stdout.strip())
    gitdir = g.out("rev-parse", "--absolute-git-dir")
    common = g.out("rev-parse", "--path-format=absolute", "--git-common-dir")
    if not common:  # git older than 2.31: relative to the folder git was run in
        rel = g.out("rev-parse", "--git-common-dir")
        common = os.path.join(real, rel) if rel else ""
    note = ""
    if gitdir and common and os.path.realpath(gitdir) != os.path.realpath(common):
        main, bare = _main_worktree(top)
        if not main or bare:
            raise NotARepo("这是一个工作区，它的主仓库是裸仓库（没有检出）", "导入一个普通的检出")
        link = planted_link(main)
        if link:
            raise ImportFail("主仓库的路径经过一个符号链接：%s → %s" % link, "symlink")
        main = os.path.realpath(main)
        if not os.path.isdir(main):
            raise NotARepo("这是一个工作区，可它的主仓库 %s 不在了" % main, "导入主仓库的检出")
        note = "你选的是一个工作区（%s），用它的主仓库" % top
        top = main
    elif top != real:
        note = "你选的是仓库里的子目录，用仓库的顶层"
    sup = Git(top).out("rev-parse", "--show-superproject-working-tree")
    if sup:
        note = (note + "；" if note else "") + "它是 %s 的子模块" % sup
    return {"top": top, "note": note}


def default_branch(g: Git) -> tuple[str | None, str]:
    """(the default branch, how it was found): origin/HEAD, else main or master (origin's, else the local one)."""
    head = g.out("symbolic-ref", "-q", "refs/remotes/origin/HEAD")
    if head.startswith("refs/remotes/origin/") and g.ok("rev-parse", "-q", "--verify", head + "^{commit}"):
        return head[len("refs/remotes/origin/"):], "origin/HEAD"
    for name in ("main", "master"):
        for ref, how in (("refs/remotes/origin/" + name, "没有 origin/HEAD，origin 上有 %s" % name),
                         ("refs/heads/" + name, "没有 origin/HEAD，本机有 %s" % name)):
            if g.ok("rev-parse", "-q", "--verify", ref + "^{commit}"):
                return name, how
    return None, ""


def base_ref(g: Git, d: str) -> tuple[str, str] | None:
    """(the ref an install branch starts from, its commit): origin/<d> (what GitLab has: local commits that were never
    pushed do not go into the MR), else the local <d>."""
    for ref in ("refs/remotes/origin/" + d, "refs/heads/" + d):
        sha = g.out("rev-parse", "-q", "--verify", ref + "^{commit}")
        if re.match(r"^[0-9a-f]{40,64}$", sha or ""):
            return ref, sha
    return None


def short_ref(ref: str) -> str:
    return ref.replace("refs/remotes/", "").replace("refs/heads/", "")


def shown_url(url: str) -> str:
    """A remote URL as the page may show it: no password, and no user at all in an http(s) URL (it may be a token)."""
    url = (url or "").strip()
    if "://" not in url:
        return url
    try:
        sp = urlsplit(url)
    except ValueError:
        return hide_credentials(url)
    if not (sp.username or sp.password):
        return url
    host = sp.hostname or ""
    if sp.port:
        host += ":%d" % sp.port
    if sp.scheme not in ("http", "https") and sp.username and not sp.password:
        return url
    if sp.scheme not in ("http", "https") and sp.username:
        host = "%s@%s" % (sp.username, host)
    return urlunsplit((sp.scheme, host, sp.path, sp.query, sp.fragment))


def gitlab_of(url: str) -> dict[str, str]:
    """The GitLab an origin URL suggests: {"base": "https://host", "project": "group/repo"}; empty when it is not a
    hosted git URL (a local path, GitHub)."""
    host, path, scheme = "", "", "https"
    m = SCP_RE.match(url or "")
    if m:
        host, path = m.group("host"), m.group("path")
    elif "://" in (url or ""):
        try:
            sp = urlsplit(url)
            port = sp.port
        except ValueError:
            return {"base": "", "project": ""}
        if sp.scheme in ("ssh", "git", "https", "http") and sp.hostname:
            host, path = sp.hostname, sp.path
            if sp.scheme == "http":
                scheme = "http"
            if sp.scheme in ("http", "https") and port:
                host += ":%d" % port
    path = path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if not host or host.lower() in NOT_GITLAB or not PROJECT_RE.match(path):
        return {"base": "", "project": ""}
    return {"base": "%s://%s" % (scheme, host), "project": path}


def origin_of(g: Git) -> dict[str, str] | None:
    url = g.out("remote", "get-url", "origin")
    if not url:
        return None
    return {"url": shown_url(url), **gitlab_of(url)}


def has_at(g: Git, ref: str, rel: str) -> bool:
    return g.ok("cat-file", "-e", "%s:%s" % (ref, rel))


def dirty_files(g: Git) -> tuple[list[str] | None, int]:
    """(up to 10 changed paths, how many) of the checkout; None when git status did not finish in time. Read only:
    no optional locks, no fsmonitor hook."""
    p = g.run("-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--untracked-files=normal",
              timeout=STATUS_TIMEOUT_S)
    if p.returncode != 0:
        return None, 0
    rows = _status_rows(p.stdout)
    return [r["path"] for r in rows[:10]], len(rows)


def _status_rows(z: str) -> list[dict[str, str]]:
    out, items, i = [], (z or "").split("\0"), 0
    while i < len(items):
        e = items[i]
        i += 1
        if len(e) < 4:
            continue
        code, path = e[:2], e[3:]
        if code[0] in "RC":
            i += 1  # the rename's source follows
        change = "added" if code == "??" or "A" in code else "deleted" if "D" in code else \
            "modified" if ("M" in code or "R" in code or "T" in code) else "other"
        out.append({"change": change, "path": path})
    return out


# ---- the install records ------------------------------------------------------------------------------------------- #

class Records:
    """imports.json in the app's data dir: {repo top level: what the app installed there}. Small; read on each use,
    written atomically under a lock.

      branch, worktree, base (origin/main), base_sha, commit (null until committed), kit (the form's values), files,
      doctor ({ok, warn, fail} counts), at, pushed, mr_iid, mr_url, brainkit (the version)."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._lock = threading.Lock()

    def all(self) -> dict[str, dict[str, Any]]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, dict)} if isinstance(data, dict) else {}

    def get(self, top: str) -> dict[str, Any] | None:
        return self.all().get(top)

    def put(self, top: str, rec: dict[str, Any]) -> None:
        with self._lock:
            data = self.all()
            data[top] = rec
            self._save(data)

    def update(self, top: str, **kw: Any) -> dict[str, Any]:
        with self._lock:
            data = self.all()
            rec = dict(data.get(top) or {})
            rec.update(kw)
            data[top] = rec
            self._save(data)
            return rec

    def _save(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(self.path.parent), prefix=".imports.")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise


def pending_state(top: str, rec: dict[str, Any] | None, *, token: bool = False) -> dict[str, Any] | None:
    """A repo whose checkout has no .brain/kit.json yet but will: brain-kit is on the default branch already (merged:
    the checkout needs a pull), on the install branch the app made (or a local brain/install branch), or installed in
    that branch's worktree and not committed yet. None: nothing of the sort."""
    g = Git(top)
    kit = (rec or {}).get("kit") or {}
    d = kit.get("default_branch") or default_branch(g)[0]
    origin = origin_of(g)
    if d:
        for ref in ("refs/remotes/origin/" + d, "refs/heads/" + d):
            if has_at(g, ref, KIT):
                return _pending("merged", short_ref(ref), rec, origin, d, token,
                                "已经合并到 %s：这个目录还没更新" % short_ref(ref),
                                "在这个目录里切到 %s 并 git pull，就能用了" % d)
    b = (rec or {}).get("branch") or (DEFAULT_BRANCH if g.ok("rev-parse", "-q", "--verify", "refs/heads/" + DEFAULT_BRANCH)
                                       else None)
    if b and has_at(g, "refs/heads/" + b, KIT):
        p = _pending("branch", b, rec, origin, d, token, "安装在 %s 分支上，合并后生效" % b, "")
        p["commit"] = (g.out("rev-parse", "-q", "--verify", "refs/heads/%s^{commit}" % b) or "")[:12] or None
        p["next"] = ("在 GitLab 上审核并合并 MR，然后在这个目录里 git pull" if p["mr_url"] else
                     "推送并开 MR（在「导入仓库」里），合并以后就能用了")
        return p
    wt = (rec or {}).get("worktree")
    if b and wt and os.path.isfile(os.path.join(wt, KIT)) and g.ok("rev-parse", "-q", "--verify", "refs/heads/" + b):
        return _pending("uncommitted", b, rec, origin, d, token, "装在 %s 分支的工作目录里，还没提交" % b,
                        "在「导入仓库」里检查这个仓库，再提交一次")
    return None


def _pending(state: str, branch: str, rec: dict[str, Any] | None, origin: dict[str, str] | None, target: str | None,
             token: bool, text: str, nxt: str) -> dict[str, Any]:
    rec = rec or {}
    kit = rec.get("kit") or {}
    wt = rec.get("worktree")
    base = kit.get("gitlab_base") or (origin or {}).get("base") or ""
    project = kit.get("gitlab_project") or (origin or {}).get("project") or ""
    return {"state": state, "branch": branch, "worktree": wt if wt and os.path.isdir(wt) else None, "commit": None,
            "pushed": bool(rec.get("pushed")), "mr_url": rec.get("mr_url") if isinstance(rec.get("mr_url"), str) else None,
            "text": text, "next": nxt, "target": target or "", "remote_url": (origin or {}).get("url") or "",
            "gitlab_base": base, "gitlab_project": project, "can_open_mr": bool(token and base and project)}


# ---- 检查 (read only) ----------------------------------------------------------------------------------------------- #

def row(cid: str, level: str, label: str, why: str, todo: str = "") -> dict[str, str]:
    return {"id": cid, "level": level, "label": label, "why": why, "todo": todo}


def blank_inspect(raw: Any) -> dict[str, Any]:
    return {"input": raw if isinstance(raw, str) else "", "path": None, "note": "", "checks": [],
            "crew": {"rows": [], "fix": {"agent": False, "engine": False}}, "next": "fix", "listed": None,
            "kit": {"state": "none", "values": None}, "form": None, "branch": DEFAULT_BRANCH, "pending": None,
            "origin": None, "default_branch": None, "current_branch": None, "error": ""}


def kit_view(cfg: dict[str, Any]) -> dict[str, str]:
    g = cfg.get("gitlab") or {}
    return {"tracker": str(cfg.get("tracker") or ""), "req_prefix": str(cfg.get("req_prefix") or ""),
            "default_branch": str(cfg.get("default_branch") or ""), "gitlab_base": str(g.get("base") or ""),
            "gitlab_project": str(g.get("project") or "")}


def form_defaults(top: str, origin: dict[str, str] | None, d: str | None) -> dict[str, str]:
    """The install form, prefilled: a key prefix from the folder's name, GitLab from origin, the default branch."""
    letters = re.sub(r"[^A-Z0-9]", "", os.path.basename(top).upper())[:10]
    return {"req_prefix": letters if PREFIX_RE.match(letters) else "REQ", "tracker": "none", "jira_base": "",
            "gitlab_base": (origin or {}).get("base") or "", "gitlab_project": (origin or {}).get("project") or "",
            "default_branch": d or "main", "team": ""}


def listed_id(top: str, listed: list[str]) -> str | None:
    for i, p in enumerate(listed, 1):
        if os.path.realpath(os.path.expanduser(p)) == top:
            return "r%d" % i
    return None


def bounded(fn: Callable[[], Any], timeout: float, default: Any) -> Any:
    """fn() in a worker, given up on after *timeout* (brain-kit's own git calls have no time limit)."""
    ex = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="brain-import")
    fut = ex.submit(fn)
    try:
        return fut.result(timeout=timeout)
    except concurrent.futures.TimeoutError:
        return default
    finally:
        ex.shutdown(wait=False)


def inspect(raw: Any, *, listed: list[str], records: Records, token: bool = False) -> dict[str, Any]:
    """Every check of the 检查 step (blocking: call it in a thread). Writes nothing."""
    out = blank_inspect(raw)
    checks = out["checks"]
    try:
        real = clean_dir(raw)
    except ImportFail as exc:
        out["error"] = str(exc)
        checks.append(row("path", "FAIL", "目录", str(exc), "换一个目录"))
        return out
    try:
        loc = locate(real)
    except NotARepo as exc:
        out["path"] = real
        checks.append(row("path", "OK", "目录", real))
        checks.append(row("git", "FAIL", "git 仓库", str(exc), exc.todo))
        return out
    except ImportFail as exc:
        out["error"] = str(exc)
        checks.append(row("path", "FAIL", "目录", str(exc), "换一个目录"))
        return out
    top = loc["top"]
    g = Git(top)
    out.update(path=top, note=loc["note"])
    checks.append(row("path", "OK", "仓库目录", top + ("（%s）" % loc["note"] if loc["note"] else "")))
    head = g.out("rev-parse", "-q", "--verify", "HEAD^{commit}")
    if not head:
        checks.append(row("git", "FAIL", "git 仓库", "是 git 仓库，但还没有任何提交", "先提交一次，再检查"))
        return out
    checks.append(row("git", "OK", "git 仓库", "是 git 仓库"))
    cur = g.out("symbolic-ref", "-q", "--short", "HEAD")
    out["current_branch"] = cur or None
    checks.append(row("branch", "OK", "当前分支", "在 %s 上" % cur) if cur else
                  row("branch", "WARN", "当前分支", "不在任何分支上（detached HEAD）", "不影响导入"))
    d, how = default_branch(g)
    cfg, kit_err = None, ""
    has_kit = os.path.isfile(os.path.join(top, KIT))
    if has_kit and bk.ok():
        try:
            cfg = bk.m("config").load(top)
        except Exception as exc:  # noqa: BLE001 - brain-kit says what is wrong with it
            kit_err = str(exc).split("\n", 1)[0][:300]
    if cfg and d and cfg.get("default_branch") != d:
        checks.append(row("default", "WARN", "默认分支", "kit.json 写的是 %s，git 看是 %s（%s）" % (
            cfg.get("default_branch"), d, how), "app 按 kit.json 的来：不对就改 kit.json"))
        d = str(cfg.get("default_branch"))
    elif cfg and not d:
        d = str(cfg.get("default_branch"))
        checks.append(row("default", "OK", "默认分支", "%s（按 kit.json）" % d))
    elif d:
        checks.append(row("default", "OK", "默认分支", "%s（%s）" % (d, how)))
    else:
        checks.append(row("default", "FAIL", "默认分支", "找不到：没有 origin/HEAD，也没有 main 或 master",
                          "装的时候在表单里写默认分支"))
    out["default_branch"] = d
    origin = origin_of(g)
    out["origin"] = origin
    if origin is None:
        checks.append(row("origin", "WARN", "origin", "没有 origin", "推送和开 MR 要它：git remote add origin <地址>"))
    elif origin["project"]:
        checks.append(row("origin", "OK", "origin", "%s（GitLab %s，项目 %s）" % (origin["url"], origin["base"],
                                                                              origin["project"])))
    else:
        checks.append(row("origin", "WARN", "origin", "%s：看不出 GitLab 项目" % origin["url"],
                          "开 MR 要 GitLab：装的时候在表单里写 GitLab 地址和项目"))
    files, n = dirty_files(g)
    if files is None:
        checks.append(row("clean", "WARN", "工作区", "看不出来（git status 没在 %d 秒内结束）" % STATUS_TIMEOUT_S, ""))
    elif n:
        checks.append(row("clean", "WARN", "工作区", "有 %d 个改动没提交：%s%s" % (n, "、".join(files), " …" if n > len(files)
                                                                               else ""),
                          "不影响：安装在单独的工作目录里做，你的检出不会动"))
    else:
        checks.append(row("clean", "OK", "工作区", "没有没提交的改动"))
    rec = records.get(top)
    pend = None if has_kit else pending_state(top, rec, token=token)
    on_default = bool(d) and any(has_at(g, r, KIT) for r in ("refs/remotes/origin/" + d, "refs/heads/" + d))
    if has_kit and not bk.ok():
        out["kit"]["state"] = "invalid"
        checks.append(row("kit", "FAIL", "brain-kit", "有 .brain/kit.json，可 brain-kit 没装载，读不了它",
                          "先在设置里写对 brain-kit 的位置"))
    elif has_kit and kit_err:
        out["kit"]["state"] = "invalid"
        checks.append(row("kit", "FAIL", "brain-kit", "装了，但 kit.json 有问题：%s" % kit_err, "改好 .brain/kit.json 再检查"))
    elif has_kit:
        out["kit"] = {"state": "checkout", "values": kit_view(cfg or {})}
        tracked = has_at(g, "HEAD", KIT)
        changed = bool(g.out("-c", "core.fsmonitor=false", "status", "--porcelain", "--", KIT))
        if not tracked:
            checks.append(row("kit", "WARN", "brain-kit", "装了，但 .brain/kit.json 还没提交",
                              "提交到 %s：app 给每个需求建的工作目录从默认分支来" % (d or "默认分支")))
        elif not on_default:
            checks.append(row("kit", "WARN", "brain-kit", "装了，已提交，但 %s 上还没有" % (d or "默认分支"),
                              "合并到 %s：app 给每个需求建的工作目录从那里来" % (d or "默认分支")))
        elif changed:
            checks.append(row("kit", "WARN", "brain-kit", "装了，但 .brain/kit.json 有没提交的改动", "改完记得提交"))
        else:
            checks.append(row("kit", "OK", "brain-kit", "装了，已提交（.brain/kit.json）"))
    elif pend:
        out["kit"]["state"] = pend["state"]
        checks.append(row("kit", "WARN", "brain-kit", pend["text"], pend["next"]))
    elif not bk.ok():
        checks.append(row("kit", "FAIL", "brain-kit", "没装（没有 .brain/kit.json），app 现在也没装载 brain-kit，装不了",
                          "先在设置里写对 brain-kit 的位置"))
    else:
        checks.append(row("kit", "FAIL", "brain-kit", "没装（没有 .brain/kit.json）", "下面可以装到一个新分支上"))
        got = base_ref(g, d) if d else None
        links = _symlinks_on_targets(g, got[1]) if got else []
        if links:
            out["kit"]["state"] = "blocked"
            checks.append(row("links", "FAIL", "符号链接", "仓库里 %s 是符号链接：brain install 会顺着它写到别处" %
                              "、".join(links), "先把它换成普通的目录或文件，提交，再检查"))
    todo = "在仓库里重跑 brain install" if has_kit else "装 brain-kit 时一起装上"
    lean_ok = os.path.isfile(os.path.join(top, LEAN_SCRIPT)) and os.path.isfile(os.path.join(top, LEAN_CONFIG))
    checks.append(row("lean", "OK", "AI-DLC Lean", "装了（%s）" % LEAN_SCRIPT) if lean_ok else
                  row("lean", "FAIL", "AI-DLC Lean", "没装", todo))
    bdir = str((cfg or {}).get("brain_dir") or "brain")
    missing = [n for n in ((cfg or {}).get("brain_files") or BRAIN_FILES) if not os.path.isfile(os.path.join(top, bdir, n))]
    checks.append(row("brain", "OK", "Brain 文件", "%s/ 下的 %d 个文件都在" % (bdir, len(BRAIN_FILES))) if not missing else
                  row("brain", "FAIL", "Brain 文件", "缺 %s" % "、".join("%s/%s" % (bdir, m) for m in missing), todo))
    checks.append(row("agents", "OK", "AGENTS.md", "有") if os.path.isfile(os.path.join(top, "AGENTS.md")) else
                  row("agents", "FAIL", "AGENTS.md", "没有", todo))
    rid = listed_id(top, listed)
    out["listed"] = rid
    checks.append(row("listed", "OK", "列表", "已经在列表里（%s）" % rid if rid else "还不在列表里"))
    crew = bounded(lambda: crewcheck.checks([top] if cfg else []), CREW_TIMEOUT_S,
                   {"rows": [{"level": "WARN", "text": "KiroCrew 的检查没在 %d 秒内做完" % CREW_TIMEOUT_S}],
                    "fix": {"agent": False, "engine": False}})
    out["crew"] = {"rows": list(crew.get("rows") or []), "fix": dict(crew.get("fix") or {"agent": False, "engine": False})}
    out["form"] = form_defaults(top, origin, d)
    out["pending"] = pend
    if rid:
        out["next"] = "listed"
    elif out["kit"]["state"] == "checkout":
        out["next"] = "add"
    elif pend:
        out["next"] = "pending"
    elif out["kit"]["state"] == "none" and bk.ok():
        out["next"] = "install"
    return out


# ---- 克隆 ----------------------------------------------------------------------------------------------------------- #

def check_url(raw: Any) -> str:
    """A git URL the app clones: https://, http://, ssh://, git://, git@host:group/repo.git, file:///path, or a path on
    this machine. No user name or password in an http(s) URL (it may be a token), no transport helpers (foo::bar)."""
    if not isinstance(raw, str) or not raw.strip():
        raise ImportFail("先写仓库地址", "invalid_url")
    u = raw.strip()
    if len(u) > 2048 or CTRL_RE.search(u) or " " in u:
        raise ImportFail("仓库地址里有空格或不该有的字符", "invalid_url")
    if u.startswith("-") or "::" in u:
        raise ImportFail("这种地址不支持：用 https://…、ssh://…、git@主机:组/仓库.git，或者本机的路径", "invalid_url")
    if "://" in u:
        try:
            sp = urlsplit(u)
            sp.port
        except ValueError:
            raise ImportFail("看不懂这个仓库地址", "invalid_url")
        if sp.scheme not in ("https", "http", "ssh", "git", "file"):
            raise ImportFail("这种地址不支持（%s://）：用 https://、ssh://、git@主机:组/仓库.git，或者本机的路径" % sp.scheme,
                             "invalid_url")
        if sp.password or (sp.username and sp.scheme in ("http", "https")):
            raise ImportFail("地址里不要带用户名、密码或 token：用 SSH 地址，或者让 git 的凭据管理来登录", "credentials_in_url")
        if sp.scheme == "file":
            clean_dir(sp.path, "仓库地址（本机路径）")
        elif not sp.hostname:
            raise ImportFail("地址里没有主机名", "invalid_url")
        return u
    if SCP_RE.match(u):
        return u
    if u.startswith("/") or u.startswith("~"):
        return clean_dir(u, "仓库地址（本机路径）")
    raise ImportFail("看不懂这个仓库地址：用 https://…、ssh://…、git@主机:组/仓库.git，或者本机的路径", "invalid_url")


def name_from_url(url: str) -> str:
    tail_ = re.split(r"[/:]", url.rstrip("/"))[-1]
    return tail_[:-4] if tail_.endswith(".git") else tail_


def clone_plan(url_raw: Any, parent_raw: Any, name_raw: Any, work_root: str) -> dict[str, str]:
    """What a clone will do, checked before it starts: {url, parent, name, dest}. The parent folder may be new (it is
    made, under the home folder only); the target folder must not exist; never inside work_root."""
    url = check_url(url_raw)
    parent = checked_path(parent_raw if parent_raw not in (None, "") else default_parent(work_root), "上级目录")
    if not os.path.exists(parent):
        home = os.path.realpath(os.path.expanduser("~"))
        if not os.path.realpath(parent).startswith(home + os.sep):
            raise ImportFail("找不到上级目录：%s（只会在你的 home 目录下面新建）" % parent, "not_found", 404)
    elif not os.path.isdir(parent):
        raise ImportFail("上级目录不是一个目录：%s" % parent, "not_a_directory")
    name = str(name_raw).strip() if isinstance(name_raw, str) and name_raw.strip() else name_from_url(url)
    if not NAME_RE.match(name) or name.endswith(".lock"):
        raise ImportFail("目录名只能用字母、数字和 . _ -（开头是字母或数字）：%s" % name, "invalid_name")
    dest = os.path.join(os.path.realpath(parent) if os.path.exists(parent) else parent, name)
    if os.path.lexists(dest):
        raise ImportFail("%s 已经有了：换个目录名；它要是就是这个仓库，用「本机目录」导入它" % dest, "exists", 409)
    wr = os.path.realpath(os.path.expanduser(work_root)) if work_root else ""
    if wr and (dest == wr or dest.startswith(wr + os.sep)):
        raise ImportFail("不要克隆到「每个需求的工作目录」（%s）里面：app 会在那里给每个需求建目录，会撞在一起。换个上级目录"
                         % work_root, "inside_work_root")
    return {"url": url, "parent": parent, "name": name, "dest": dest}


def clone(plan: dict[str, str], step: Callable[..., None]) -> dict[str, Any]:
    """git clone (blocking: run it in a thread). A failed clone leaves nothing behind (git's own cleanup, or this one's
    after a timeout: only the folder this clone made)."""
    step("clone", "running", "%s → %s" % (shown_url(plan["url"]), plan["dest"]))
    parent = plan["parent"]
    made_parent = not os.path.exists(parent)
    os.makedirs(parent, exist_ok=True)
    if planted_link(plan["dest"]) or os.path.lexists(plan["dest"]):
        raise ImportFail("%s 已经有了：换个目录名" % plan["dest"], "exists", 409)
    p = run_quiet([GIT_BIN, "clone", "--", plan["url"], plan["dest"]], parent, CLONE_TIMEOUT_S, quiet_env(parent))
    if p.returncode != 0:
        if os.path.isdir(plan["dest"]) and not os.path.islink(plan["dest"]):
            shutil.rmtree(plan["dest"], ignore_errors=True)
        if made_parent:
            try:
                os.rmdir(parent)
            except OSError:
                pass
        kind, text = git_failure(p, "克隆", plan["url"])
        step("clone", "fail", text)
        raise ImportFail(text, "clone_" + kind, 502 if kind in ("auth", "unreachable", "timeout") else 400,
                         result={"path": None, "output": tail(p), "kind": kind})
    dest = os.path.realpath(plan["dest"])
    step("clone", "ok", dest)
    return {"path": dest, "output": tail(p), "kind": "ok"}


# ---- 安装到新分支 ----------------------------------------------------------------------------------------------------- #

def check_branch(raw: Any) -> str:
    b = str(raw).strip() if isinstance(raw, str) and raw.strip() else DEFAULT_BRANCH
    if not BRANCH_RE.match(b) or ".." in b or "//" in b or b.endswith(("/", ".", ".lock")) or "/." in b or "@{" in b:
        raise ImportFail("分支名只能用字母、数字和 . _ - /，比如 brain/install", "invalid_branch")
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
    parts = ["需求号 %s-n" % kit["req_prefix"], "跟踪 %s" % kit["tracker"], "默认分支 %s" % kit["default_branch"]]
    if kit.get("gitlab_project"):
        parts.append("GitLab %s（%s）" % (kit["gitlab_project"], kit["gitlab_base"]))
    if kit.get("team"):
        parts.append("团队 %s" % kit["team"])
    return " · ".join(parts)


def _symlinks_on_targets(g: Git, sha: str) -> list[str]:
    """Committed symlinks at the paths brain install writes (in the tree it will be installed on)."""
    p = g.run("ls-tree", "-r", "-z", "--full-tree", sha, timeout=GIT_TIMEOUT_S)
    out = []
    for e in (p.stdout.split("\0") if p.returncode == 0 else []):
        meta, _, path = e.partition("\t")
        if meta.startswith("120000 ") and any(path == t or path.startswith(t + "/") for t in INSTALL_TARGETS):
            out.append(path)
    return out[:10]


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


def doctor_rows(text: str) -> list[dict[str, str]]:
    out = []
    for line in (text or "").splitlines():
        m = DOCTOR_RE.match(line.strip())
        if m:
            out.append({"level": m.group(1), "text": m.group(2).strip()[:500]})
    return out


def brain_env() -> dict[str, str]:
    e = dict(os.environ)
    e.update({"GIT_TERMINAL_PROMPT": "0", "PYTHONIOENCODING": "utf-8", "GIT_OPTIONAL_LOCKS": "0"})
    return e


def install(top: str, kit: dict[str, str], branch: str, work_root: str, records: Records,
            step: Callable[..., None]) -> dict[str, Any]:
    """brain install on a new branch in its own worktree (blocking: run it in a thread). The person's checkout, its
    branch, index and files are never touched; a failure before the commit takes back the worktree and the branch."""
    res: dict[str, Any] = {"path": top, "branch": branch, "base": None, "base_sha": None, "worktree": None,
                           "output": "", "kit": kit, "doctor": {"ran": False, "rows": [], "output": ""}, "files": [],
                           "commit": {"ok": False, "sha": None, "blocked": False, "text": "", "output": ""}}
    step("branch", "running")
    if not bk.ok():
        raise ImportFail("brain-kit 没装载：先在设置里写对它的位置", "no_brainkit", 409, res)
    g = Git(top)
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
        raise ImportFail("%s 上已经有 .brain/kit.json：在这个目录里切到 %s 并 git pull 就行，不用再装" % (
            short_ref(ref), kit["default_branch"]), "installed", 409, res)
    links = _symlinks_on_targets(g, sha)
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
        step("doctor", "warn", "brain doctor 没给出结果（退出码 %d）" % p.returncode)
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


def commit_message(kit: dict[str, str]) -> tuple[str, str]:
    return ("Install brain-kit (brain install)",
            "AI-DLC Lean, the KiroCrew hook adapter, .brain/kit.json, the Brain files and AGENTS.md, made by brain-kit's "
            "`brain install` in a worktree of its own (the Brain app's 导入仓库).\n\nkit.json: %s" % kit_line(kit))


def commit(top: str, records: Records, step: Callable[..., None] | None = None) -> dict[str, Any]:
    """git add -A and git commit in the install worktree, with the person's own identity (their git config) and their
    hooks: a hook that says no is shown as it said it, nothing is bypassed. Again after a hook said no: the same."""
    step = step or (lambda *a, **k: None)
    out = {"ok": False, "sha": None, "blocked": False, "text": "", "output": ""}
    rec = records.get(top)
    if not rec or not rec.get("worktree") or not os.path.isdir(rec["worktree"]):
        raise ImportFail("找不到安装用的工作目录：重新检查一下", "no_worktree", 409)
    wt, branch = rec["worktree"], rec["branch"]
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
    subject, body = commit_message(rec.get("kit") or {})
    p = run_quiet([GIT_BIN, "-C", wt, "commit", "-q", "-m", subject, "-m", body], wt, COMMIT_TIMEOUT_S, brain_env())
    out["output"] = tail(p)
    if p.returncode == 0:
        sha = g.out("rev-parse", "-q", "--verify", "HEAD^{commit}")
        who = g.out("log", "-1", "--format=%an <%ae>", "HEAD")
        out.update(ok=True, sha=sha, text="提交了 %s（作者 %s）" % (sha[:8], who))
        records.update(top, commit=sha, committed_by=who)
        step("commit", "ok", out["text"])
        return out
    low = (p.stderr + p.stdout).lower()
    if "please tell me who you are" in low or "empty ident" in low or "unable to auto-detect email" in low:
        out["text"] = ("git 不知道你是谁：在终端里设好 git config --global user.name 和 user.email（这里不替你填），"
                       "再点「再提交一次」")
    elif "nothing to commit" in low or "nothing added to commit" in low:
        out["text"] = "没有可提交的改动：brain install 什么也没写？看看工作目录 %s" % wt
    else:
        out["blocked"] = True
        out["text"] = "提交被拦下了（多半是 git hook），它说：\n%s\n\n改动还在 %s 里：处理好以后点「再提交一次」。" % (
            last_lines(out["output"], 15) or "（什么也没说，退出码 %d）" % p.returncode, wt)
    step("commit", "fail", out["text"])
    return out


# ---- 推送并开 MR ------------------------------------------------------------------------------------------------------ #

def mr_title() -> str:
    return "装上 brain-kit（brain install）"


FILE_GROUPS = (
    (".kiro/aidlc-lean/", "AI-DLC Lean 本体"), (".kiro/hooks/", "Lean 的 hook"), (".kiro/brain/", "KiroCrew 的 Lean hook 适配"),
    (".kiro/agents/", "brain-dev agent"), (".kiro/skills/", "skills（Lean 的和 brain 的）"),
    (".kiro/steering/", "steering"), ("aidlc-docs/", "Lean 的配置和记录（lean.json 的 fingerprint_exclude 加了 runs/**）"),
    (".brain/", "brain-kit 的配置 kit.json"), ("brain/", "Brain：PRODUCT、TECH、IMPROVEMENT、PROJECT"),
    ("AGENTS.md", "AGENTS.md"), (".gitignore", ".gitignore（.brain-materials/ 不进 git）"),
)


def mr_description(rec: dict[str, Any]) -> str:
    """What the install adds, as a plain list (made inert like brain-kit's own MR texts when mrdesc is there)."""
    kit = rec.get("kit") or {}
    files = [f for f in rec.get("files") or [] if isinstance(f, dict)]
    groups: dict[str, list[str]] = {}
    for f in files:
        path = str(f.get("path") or "")
        label = next((lab for pre, lab in FILE_GROUPS if path == pre or path.startswith(pre)), "其他")
        key = next((pre for pre, _ in FILE_GROUPS if path == pre or path.startswith(pre)), path)
        groups.setdefault("%s\0%s" % (key, label), []).append(path)
    lines = ["用 brain-kit%s 的 `brain install` 装进这个仓库。在单独的工作目录里做的，原来的检出没动。" % (
        " " + str(rec["brainkit"]) if rec.get("brainkit") else ""), "", "**装了什么**", ""]
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
    lines += ["", "合并以后在各自的检出里 git pull，Brain app 里这个仓库就能用了（app 给每个需求建的工作目录从默认分支来）。"]
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


def mr_commands(top: str, branch: str, target: str, base: str, project: str, desc: str) -> list[str]:
    q = shlex.quote
    cmds = ["git -C %s push origin %s" % (q(top), q(branch))]
    repo = "%s/%s" % (base.rstrip("/"), project) if base and project else ""
    cmds.append("glab mr create %s--source-branch %s --target-branch %s --title %s --description %s --yes" % (
        "-R %s " % q(repo) if repo else "", q(branch), q(target), q(mr_title()), q(desc)))
    return cmds


def publish(top: str, records: Records, confirm: dict[str, Any], *, transport: Any = None) -> dict[str, Any]:
    """Push the install branch to origin and open its MR with the person's GitLab token (blocking: run it in a thread).
    *confirm* is what the person confirmed on the page: the branch, the remote URL and the target; anything else is
    refused (the page was out of date). Without a token or a GitLab project, the exact commands instead."""
    rec = records.get(top)
    if not rec or not rec.get("branch"):
        raise ImportFail("这个仓库没有 app 装的分支：先「安装到新分支」", "no_install", 409)
    if not rec.get("commit"):
        raise ImportFail("还没提交：先提交，再推送", "not_committed", 409)
    g = Git(top)
    branch, kit = rec["branch"], rec.get("kit") or {}
    target = kit.get("default_branch") or "main"
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
    desc = mr_description(rec)
    out = {"ok": False, "pushed": False, "branch": branch, "target": target, "remote_url": origin["url"],
           "mr": None, "text": "", "output": "", "commands": mr_commands(top, branch, target, base, project, desc),
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
            mr = gl.create_mr(project, branch, target, mr_title(), [], description=desc)
        iid = int((mr or {}).get("iid") or 0)
        url = (mr or {}).get("web_url") or "%s/%s/-/merge_requests/%d" % (base.rstrip("/"), project, iid)
        out["mr"] = {"iid": iid, "url": url, "existing": existing}
        records.update(top, mr_iid=iid, mr_url=url)
        out.update(ok=True, text=("推上去了，MR !%d 本来就开着" if existing else "推上去了，开了 MR !%d") % iid)
    except Exception as exc:  # noqa: BLE001 - GitLab down, no rights: the branch is pushed, the MR is the person's
        out.update(ok=True, text="推上去了，但 MR 没开成（%s）：用下面的命令或链接自己开。" % str(exc).split("\n", 1)[0][:200])
    return out


# ---- jobs (clone, install) ------------------------------------------------------------------------------------------- #

class Jobs:
    """The long steps (clone, install) run in a worker thread; the page polls their state and steps. In memory only:
    what they leave on disk (a clone, a branch and its worktree, imports.json) is what 检查 reads afterwards."""

    KEEP = 30

    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self.now = now
        self._rows: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self.tasks: dict[str, Any] = {}

    def start(self, kind: str, target: str, steps: tuple) -> str:
        with self._lock:
            for j in self._rows.values():
                if j["target"] == target and j["state"] == "running":
                    raise ImportFail("这个仓库正在%s，等它做完" % KIND_LABEL.get(j["kind"], j["kind"]), "busy", 409)
            jid = secrets.token_hex(6)
            self._rows[jid] = {"id": jid, "kind": kind, "target": target, "state": "running",
                               "steps": [{"id": s, "label": label, "state": "todo", "detail": ""} for s, label in steps],
                               "started_at": self.now(), "ended_at": None, "error": "", "result": None}
            done = [k for k, j in self._rows.items() if j["state"] != "running"]
            for k in done[:max(0, len(self._rows) - self.KEEP)]:
                self._rows.pop(k, None)
                self.tasks.pop(k, None)
            return jid

    def step(self, jid: str, sid: str, state: str, detail: str = "") -> None:
        with self._lock:
            j = self._rows.get(jid)
            for s in (j or {}).get("steps") or []:
                if s["id"] == sid:
                    s["state"], s["detail"] = state, str(detail or "")[:4000]

    def finish(self, jid: str, result: Any = None, error: str = "") -> None:
        with self._lock:
            j = self._rows.get(jid)
            if j is None:
                return
            j.update(state="failed" if error else "done", ended_at=self.now(), error=error, result=result)
            for s in j["steps"]:
                if s["state"] == "running":
                    s["state"] = "fail" if error else "ok"

    def view(self, jid: str) -> dict[str, Any] | None:
        with self._lock:
            j = self._rows.get(jid)
            return json.loads(json.dumps(j, default=str)) if j else None
