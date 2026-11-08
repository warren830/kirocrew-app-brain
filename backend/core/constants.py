"""Names and paths shared by every module."""

import os as _os
import re as _re
import shutil as _shutil
from pathlib import Path as _Path

APP_NAME = "brain"
VERSION = "0.1.0"

# Sidebar folders of the sessions this app opens (apart from aidlc-team's 「AI-DLC 团队」, so both apps can be installed).
LOCAL_FOLDER = "Brain 需求"        # brain-dev sessions on this machine, one subfolder per requirement
RUNNER_FOLDER = "Brain 运行机"     # brain-run sessions the team runner dispatches, one subfolder per run

LOCAL_AGENT = "brain-dev"          # ~/.kiro/agents/brain-dev.json (brain crew-agent), carries Lean's three hooks
RUNNER_AGENT = "brain-run"         # ~/.kiro/agents/brain-run.json on the team runner

# KiroCrew lets an agent work only under ~/workspace(s) or ~/workplace(s): every requirement's worktree lives here.
WORK_ROOT = _Path.home() / "workplace" / "brain-app"

APP_ROOT = _Path(__file__).resolve().parents[2]  # the app's folder: the installed copy or the dev checkout

TICK_S = 2.0            # sessions are polled this often
TEAM_INTERVAL_S = 60.0  # the bridge loop's default interval (bridge.json "interval" wins)
CACHE_S = 4.0           # a repo scan is reused for this long

KEY_RE = _re.compile(r"^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}$")
SLUG_RE = _re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
RUN_ID_RE = _re.compile(r"^RUN-[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,5}$")
REPO_ID_RE = _re.compile(r"^(r[1-9][0-9]{0,2}|runner)$")


def _binary(env: str, preferred: tuple, name: str) -> str:
    """An executable: ``$env``, else the first of *preferred* that exists, else *name* on PATH or the usual places."""
    if _os.environ.get(env):
        return _os.environ[env]
    for path in preferred:
        if _os.access(path, _os.X_OK):
            return path
    path = _os.pathsep.join([_os.environ.get("PATH", ""), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"])
    return _shutil.which(name, path=path) or name


# The real git before macOS's /usr/bin/git, an xcrun shim that costs ~30 ms per call.
GIT_BIN = _binary("BRAIN_APP_GIT", ("/opt/homebrew/bin/git", "/usr/local/bin/git",
                                    "/Library/Developer/CommandLineTools/usr/bin/git",
                                    "/Applications/Xcode.app/Contents/Developer/usr/bin/git"), "git")
# python3 for brain-kit's CLI: the system one (brain-kit is stdlib-only, 3.8+), not the gateway's bundled interpreter.
PYTHON_BIN = _binary("BRAIN_APP_PYTHON", ("/usr/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"),
                     "python3")


def kirocrew_bin() -> str:
    """The kirocrew CLI (``~/.local/bin`` is not on the gateway's PATH); "" when there is none."""
    if _os.environ.get("BRAIN_APP_KIROCREW"):
        return _os.environ["BRAIN_APP_KIROCREW"]
    for p in (_os.path.expanduser("~/.local/bin/kirocrew"), "/opt/homebrew/bin/kirocrew", "/usr/local/bin/kirocrew"):
        if _os.access(p, _os.X_OK):
            return p
    return _shutil.which("kirocrew") or ""
