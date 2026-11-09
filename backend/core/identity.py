"""Who brain-kit will say the person is in a repo, by brain-kit's own rule (cli._me), without asking GitLab:

  a GitLab token and kit.json gitlab.base   the GitLab username (GitLab says it; the app does not ask)
  $BRAIN_USER, else git config brain.user   that name (it must pass brain-kit's USER_RE, lowercased)
  no GitLab (gitlab.base empty)             the machine's login name, when brain-kit falls back to it (brain-kit after
                                            48b6b97: the app looks for cli._login_name); an older brain-kit asks
  GitLab and none of the above              brain-kit refuses ("who are you?"): the page asks for the GitLab username

``set_name`` writes ``git config brain.user <name>`` in the repo (its own .git/config, which its worktrees share): the
name checked with brain-kit's USER_RE, git run without a shell, with a time limit. No token is asked for or stored.
"""

from __future__ import annotations

import getpass
import os
import re
from typing import Any

from . import bk
from .constants import GIT_BIN
from .repo import Git

USER_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")   # brain-kit 48b6b97 common.USER_RE, while brain-kit is not loaded
SET_TIMEOUT_S = 15
RULE = "只能用小写字母、数字和 . _ -（字母或数字开头，最多 64 个）"
LABEL_GITLAB = "你的 GitLab 用户名"
LABEL_NAME = "你的名字"
WHY_GITLAB = "这个仓库用 GitLab：认领和交接都按这个名字认人，要和你在 GitLab 上的用户名一样"
WHY_OLD = "要一个名字，认领需求时用：这个仓库不用 GitLab，用登录名就行"
WHY_LOGIN = "这台机器的登录名不能当名字用：写一个"
WHY_LOCAL = "这个仓库不用 GitLab：名字只在认领需求时用"


def user_re() -> "re.Pattern[str]":
    try:
        rx = bk.m("common").USER_RE
        return rx if hasattr(rx, "match") else USER_RE
    except Exception:  # noqa: BLE001 - brain-kit not loaded: the same rule, copied
        return USER_RE


def valid(name: Any) -> bool:
    return isinstance(name, str) and bool(user_re().match(name))


def login_name() -> str:
    """The login name, lowercased, when it is a usable name (brain-kit's cli._login_name); '' otherwise."""
    try:
        name = getpass.getuser().strip().lower()
    except Exception:  # noqa: BLE001 - no login name (no USER, no passwd entry)
        return ""
    return name if valid(name) else ""


def falls_back() -> bool:
    """The loaded brain-kit uses the login name in a repo without GitLab."""
    try:
        return callable(getattr(bk.m("cli"), "_login_name", None))
    except Exception:  # noqa: BLE001 - brain-kit not loaded
        return False


def of(top: str, gitlab_base: str, *, token: bool) -> dict[str, Any]:
    """Who brain-kit will say the person is in the repo at *top* (see the module doc). Read only.

    name     the name brain-kit uses here (None: GitLab's, with a token; or brain-kit would refuse)
    source   token | env | git | login | none
    text     one line for the page; ask: the page shows the input (label, why, suggest: the login name); error: what
             is wrong with the name that is set"""
    base = str(gitlab_base or "")
    out: dict[str, Any] = {"name": None, "source": "none", "gitlab": base, "text": "", "ask": False, "label": "",
                           "why": "", "suggest": "", "error": ""}
    if base and token:
        out.update(source="token", text="GitLab token 认你：用你在 GitLab 上的用户名")
        return out
    env = os.environ.get("BRAIN_USER", "").strip()
    conf = "" if env else Git(top).out("config", "brain.user").strip()
    who = env or conf
    if who and valid(who.lower()):
        out.update(name=who.lower(), source="env" if env else "git",
                   text="%s（%s）" % (who.lower(), "环境变量 BRAIN_USER 里写的" if env else "你在这个仓库的名字"))
        return out
    if env:     # git config does not win over it: nothing to fix here
        out.update(source="env", error="环境变量 BRAIN_USER（%s）不能用：%s。改掉它" % (env[:64], RULE))
        return out
    login = login_name()
    if not who and not base and falls_back() and login:
        out.update(name=login, source="login", text="%s（这台机器的登录名：这个仓库不用 GitLab）" % login)
        return out
    if who:
        out["error"] = "你在这个仓库的名字「%s」不能用：%s" % (who[:64], RULE)
    why = WHY_GITLAB if base else WHY_LOCAL if who else WHY_LOGIN if falls_back() else WHY_OLD
    out.update(ask=True, suggest=login, label=LABEL_GITLAB if base else LABEL_NAME, why=why)
    return out


class NameRefused(ValueError):
    pass


def set_name(top: str, name: Any) -> str:
    """``git config brain.user <name>`` in the repo at *top* (a checked repo top level): the name lowercased, as
    brain-kit reads it. Raises NameRefused (a bad name, git said no)."""
    n = name.strip().lower() if isinstance(name, str) else ""
    if not valid(n):
        raise NameRefused("名字%s" % RULE)
    from .importer import last_lines, run_quiet, tail       # here: importer imports this module
    p = run_quiet([GIT_BIN, "-C", top, "config", "--local", "brain.user", n], top, SET_TIMEOUT_S)
    if p.returncode != 0:
        raise NameRefused("git config 没成功：%s" % (last_lines(tail(p), 3) or "退出码 %d" % p.returncode))
    return n
