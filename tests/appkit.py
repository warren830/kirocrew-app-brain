"""Shared test helpers: the app's modules through its private namespace, an in-memory Kiro Crew chat API, git repos."""

from __future__ import annotations

import importlib
import itertools
import json
import os
import subprocess
from pathlib import Path
from typing import Any

import backend.routes  # noqa: F401  (bootstraps the private namespace the app's modules live in)

ROOT = Path(__file__).resolve().parents[1]
BRAINKIT = Path(os.environ.get("BRAIN_TEST_BRAINKIT") or Path.home() / "warren_ws" / "brain-kit")


def mod(name: str) -> Any:
    return importlib.import_module(f"_brainapp_backend.core.{name}")


GatewayError = mod("gateway").GatewayError


class FakeGateway:
    """The chat API the session runner calls, in memory: a turn starts busy and ends with the scripted rows."""

    def __init__(self, app: str = "brain") -> None:
        self.app = app
        self.folder_rows, self.slot_rows, self.msgs = [], {}, {}
        self.calls, self.script = [], []
        self.ids = itertools.count(1)
        self.absent = ()          # Crew members that are not there (a slot asking for one as a member gets 409)
        self.templates = None     # the template files of ~/.kiro/agents (None: any template asked for is there)
        self.fail_send = False

    async def folders(self):
        return list(self.folder_rows)

    async def create_folder(self, name, parent_id=None, project_dir=None):
        f = {"id": f"f{next(self.ids)}", "name": name, "parent_id": parent_id, "owner_app": self.app,
             "project_dir": project_dir}
        self.folder_rows.append(f)
        self.calls.append(("folder", name, parent_id))
        return f

    async def hide_folder(self, fid):
        for f in self.folder_rows:
            if f["id"] == fid:
                f["hidden"] = True
        self.calls.append(("hide_folder", fid))

    async def slots(self):
        return list(self.slot_rows.values())

    async def create_slot(self, name, title, folder_id, model="", memory_mode="incognito", agent="", agent_kind=""):
        if agent and agent_kind == "member" and agent in self.absent:
            raise GatewayError(409, "no such member", "agent_choice_unavailable")
        if agent and agent_kind == "template" and self.templates is not None and agent not in self.templates:
            raise GatewayError(409, "no such template", "agent_choice_unavailable")
        if name in self.slot_rows:
            raise GatewayError(409, "slot exists", "slot_exists")
        self.calls.append(("agent", agent, agent_kind))
        self.slot_rows[name] = {"key": name, "title": title, "folder_id": folder_id, "app": self.app, "running": False}
        self.msgs[name] = []
        self.calls.append(("slot", name, title, model))
        return {"key": name}

    async def set_project(self, key, project):
        self.slot_rows[key]["project"] = project
        self.calls.append(("project", key, project))

    async def trust(self, key):
        self.slot_rows[key]["trust"] = True
        self.calls.append(("trust", key))

    async def send(self, key, message, send_id):
        if self.fail_send:
            raise GatewayError(500, "boom", "send_failed")
        self.calls.append(("send", key, send_id))
        self.msgs[key].append({"role": "user", "content": message, "meta": {"sendId": send_id},
                               "ts": "2026-11-08T10:00:00Z"})
        rows = self.script.pop(0) if self.script else [{"role": "assistant", "content": "好了", "meta": {}}]
        self.slot_rows[key]["running"] = True
        self.slot_rows[key]["_pending"] = rows
        return {"ok": True}

    def finish(self, key):
        row = self.slot_rows[key]
        self.msgs[key].extend(row.pop("_pending", []))
        row["running"] = False

    async def messages(self, key, limit=120):
        return list(self.msgs[key])[-limit:]

    async def stop(self, key):
        self.calls.append(("stop", key))
        self.slot_rows[key]["running"] = False

    async def delete_slot(self, key):
        self.slot_rows.pop(key, None)
        self.calls.append(("delete_slot", key))

    async def close(self):
        return None


GIT_ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@example.com", "GIT_TERMINAL_PROMPT": "0"}


def sh(*cmd: str, cwd: Any = None, check: bool = True, env: dict | None = None) -> subprocess.CompletedProcess:
    e = dict(os.environ)
    e.update(GIT_ENV)
    e.update(env or {})
    p = subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True, text=True, env=e)
    if check and p.returncode != 0:
        raise AssertionError(f"{' '.join(map(str, cmd))} failed: {p.stdout} {p.stderr}")
    return p


def git_repo(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    sh("git", "init", "-q", "-b", "main", path)
    for k, v in (("user.name", "t"), ("user.email", "t@example.com"), ("commit.gpgsign", "false")):
        sh("git", "-C", path, "config", k, v)
    return path


def commit_file(repo: Path, rel: str, text: str, msg: str = "c") -> str:
    p = Path(repo) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    sh("git", "-C", repo, "add", "--", rel)
    sh("git", "-C", repo, "commit", "-q", "-m", msg)
    return sh("git", "-C", repo, "rev-parse", "HEAD").stdout.strip()


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
