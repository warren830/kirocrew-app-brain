"""Real brain-kit projects for the tests: ``brain install`` into a temp git repo (with the AI-DLC Lean vendored in the
brain-kit checkout), ``brain start`` runs, Lean commands, and a Service wired to an in-memory Kiro Crew.

Needs the brain-kit checkout (``$BRAIN_TEST_BRAINKIT``, default ~/warren_ws/brain-kit); tests skip without it.
HOME is a temp folder in every test (brain-kit keeps its intake store and ~/.kiro/agents there).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from appkit import BRAINKIT, FakeGateway, commit_file, git_repo, mod, sh

HAVE_BRAINKIT = (BRAINKIT / "brainkit" / "__init__.py").is_file() and (
    BRAINKIT / "vendor" / "aidlc-lean" / "install.sh").is_file()
needs_brainkit = pytest.mark.skipif(not HAVE_BRAINKIT, reason="brain-kit checkout not found")
PY = "/usr/bin/python3" if os.access("/usr/bin/python3", os.X_OK) else sys.executable


def brain(repo: Path, *args: str, check: bool = True, env: dict | None = None) -> subprocess.CompletedProcess:
    e = {"GIT_TERMINAL_PROMPT": "0"}
    e.update(env or {})
    return sh(PY, "-I", BRAINKIT / "bin" / "brain", *args, cwd=repo, check=check, env=e)


def lean(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return sh(PY, ".kiro/aidlc-lean/aidlc_lean.py", *args, cwd=repo, check=check)


def make_project(root: Path, name: str = "pay", prefix: str = "PAY", origin: bool = False,
                 kit: dict | None = None) -> Path:
    repo = git_repo(root / name)
    commit_file(repo, "README.md", "# %s\n" % name, "init")
    brain(repo, "install", ".", "--prefix", prefix)
    if kit:
        p = repo / ".brain" / "kit.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        data.update(kit)
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    sh("git", "-C", repo, "add", "-A")
    sh("git", "-C", repo, "commit", "-q", "-m", "brain-kit")
    sh("git", "-C", repo, "config", "brain.user", "alice")
    if origin:
        bare = root / (name + "-origin.git")
        sh("git", "clone", "-q", "--bare", repo, bare)
        sh("git", "-C", repo, "remote", "add", "origin", str(bare))
        sh("git", "-C", repo, "fetch", "-q", "origin")
        sh("git", "-C", repo, "branch", "-q", "--set-upstream-to", "origin/main", "main")
    return repo


def start_in_worktree(repo: Path, wt: Path, slug: str, title: str, *extra: str) -> Path:
    """What the app does: a detached worktree of main, then `brain start` in it."""
    wt.parent.mkdir(parents=True, exist_ok=True)
    sh("git", "-C", repo, "worktree", "add", "-q", "--detach", wt, "main")
    brain(wt, "start", slug, "--title", title, *extra)
    return wt


def request_requirements(wt: Path, intent: str, text: str = "# Requirements\n\nSize: small\n\n- AC-1 退款\n") -> str:
    """Lean: requirements started, written, approval requested; returns the line the person would type."""
    lean(wt, "stage", "skip", "reverse-engineering", "--reason", "greenfield")
    lean(wt, "stage", "start", "requirements")
    (wt / "aidlc-docs" / intent / "inception" / "requirements" / "requirements.md").write_text(text, encoding="utf-8")
    out = lean(wt, "request", "REQUIREMENTS").stdout
    return next(line.strip() for line in out.splitlines() if line.strip().startswith("approve REQUIREMENTS"))


def make_service(tmp: Path, repos: list[Path], *, gw: FakeGateway | None = None, team: dict | None = None,
                 transport: Any = None, kick: Any = None) -> Any:
    service = mod("service")
    sessions = mod("sessions")
    data = tmp / "data"
    data.mkdir(parents=True, exist_ok=True)
    home = Path(os.environ["HOME"])
    (data / "settings.json").write_text(json.dumps({
        "brainkit": str(BRAINKIT), "repos": [str(r) for r in repos],
        "work_root": str(home / "workplace" / "brain-app"),
        "team": team or {"enabled": False}}), encoding="utf-8")
    gw = gw or FakeGateway()
    ctx = SimpleNamespace(name="brain", logger=logging.getLogger("brain-test"), data_dir=str(data))
    mgr = sessions.SessionManager(gw, app="brain", state_file=data / "sessions.json", log=ctx.logger)
    svc = service.Service(ctx, sessions=mgr, transport=transport, signer_kick=kick, sign_timeout=5)
    return svc


def run(coro: Any) -> Any:
    return asyncio.run(coro)


@pytest.fixture
def home(tmp_path, monkeypatch):
    h = tmp_path / "home"
    (h / ".kiro" / "agents").mkdir(parents=True)
    monkeypatch.setenv("HOME", str(h))
    for k in ("BRAIN_USER", "GITLAB_TOKEN", "BRAIN_GITLAB_TOKEN_FILE", "BRAIN_INTAKE_DIR", "BRAINKIT_HOME"):
        monkeypatch.delenv(k, raising=False)
    fake_kc = tmp_path / "bin" / "kirocrew"
    fake_kc.parent.mkdir(parents=True)
    fake_kc.write_text("#!/bin/sh\nif [ \"$2\" = get ]; then cat \"%s\" 2>/dev/null; exit 0; fi\n"
                       "echo \"$4\" > \"%s\"; echo set\n" % (tmp_path / "engine", tmp_path / "engine"), encoding="utf-8")
    fake_kc.chmod(0o755)
    (tmp_path / "engine").write_text("kas\n", encoding="utf-8")
    monkeypatch.setenv("BRAIN_APP_KIROCREW", str(fake_kc))
    return h


def install_brain_dev(home: Path) -> Path:
    """~/.kiro/agents/brain-dev.json as `brain crew-agent` writes it."""
    src = BRAINKIT / "crew" / "brain-dev.json"
    dst = home / ".kiro" / "agents" / "brain-dev.json"
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return dst


__all__ = ["needs_brainkit", "brain", "lean", "make_project", "start_in_worktree", "request_requirements",
           "make_service", "run", "home", "install_brain_dev", "FakeGateway", "commit_file", "sh", "mod"]


def filled_notes(text: str, status: str, nxt: str = "把这一单元剩下的步骤写完，再跑一次自动检查") -> str:
    """aidlc-state.md as a session leaves it: its Status, and a real '### Next' item. brain-kit R1-28 (8df9556) refuses a
    hand-over whose Next is still Lean's template."""
    text = text.replace("Status: Inception: starting", status)
    return re.sub(r"(^### Next[ \t]*\n)(.*?)(?=^### |\Z)", lambda m: m.group(1) + "1. " + nxt + "\n\n", text, count=1,
                  flags=re.M | re.S)
