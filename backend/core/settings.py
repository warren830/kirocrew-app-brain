"""The app's settings: ``settings.json`` in its data dir, edited on the page (owner only), checked before saving.

  brainkit    the brain-kit checkout to import (default: $BRAINKIT_HOME or a usual place, see bk.default_path)
  repos       project repos with brain-kit installed, shown on this machine (ids r1, r2 … in this order)
  work_root   where each requirement's worktree goes (KiroCrew lets agents work under ~/workplace or ~/workspace only)
  team        team mode (the team runner only): the bridge loop and runnerd run inside the app
    enabled          on / off
    bridge_config    brain-kit's bridge.json (projects, gitlab, identities, ledger, spool_dir, vouchers_dir …) with
                     "signer": {"type": "spool", "spool_dir", "allowed_signers"} and no signing_key: the separate
                     signer (signer/) holds the key; brain-kit's SpoolSigner talks to it and verifies every signature
    runnerd_config   brain-kit's runnerd.json (empty: runnerd runs elsewhere)
    dev_same_user    local trial only: the signer runs as the same OS user (it could sign whatever the app asks)
Settings of an older version (team.signer_spool, team.allowed_signers) are dropped on reading: they are in
bridge.json's signer block now.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from . import bk
from .constants import WORK_ROOT

MAX_REPOS = 20


def defaults() -> dict[str, Any]:
    return {"brainkit": bk.default_path(), "repos": [], "work_root": str(WORK_ROOT),
            "team": {"enabled": False, "bridge_config": "", "runnerd_config": "", "dev_same_user": False}}


def load(path: Path) -> dict[str, Any]:
    out = defaults()
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return out
    if isinstance(data, dict):
        clean, _ = check(data)
        out.update({k: v for k, v in clean.items() if k != "team"})
        out["team"].update(clean.get("team") or {})
    return out


def save(path: Path, settings: dict[str, Any]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".settings.")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(settings, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _path(v: Any) -> str:
    return os.path.expanduser(v.strip()) if isinstance(v, str) else ""


def check(data: Any) -> tuple[dict[str, Any], list[str]]:
    """(the settings that hold, what is wrong). Only absolute paths; nothing is created here."""
    probs: list[str] = []
    out = defaults()
    if not isinstance(data, dict):
        return out, ["设置必须是一个 JSON 对象"]
    if "brainkit" in data:
        p = _path(data["brainkit"])
        if p and not os.path.isabs(p):
            probs.append("brain-kit 的位置要写绝对路径")
        elif p:
            out["brainkit"] = p
    repos = data.get("repos", [])
    if not isinstance(repos, list) or not all(isinstance(r, str) for r in repos):
        probs.append("repos 是项目目录的列表")
        repos = []
    seen = []
    for r in repos[:MAX_REPOS]:
        p = _path(r)
        if not p:
            continue
        if not os.path.isabs(p):
            probs.append("项目目录要写绝对路径：%s" % r)
            continue
        p = os.path.realpath(p)
        if p not in seen:
            seen.append(p)
    out["repos"] = seen
    if "work_root" in data:
        p = _path(data["work_root"])
        home = os.path.realpath(os.path.expanduser("~"))
        rp = os.path.realpath(p) if p else ""
        if p and not os.path.isabs(p):
            probs.append("工作区根目录要写绝对路径")
        elif rp and not any(rp == os.path.join(home, w) or rp.startswith(os.path.join(home, w) + os.sep)
                            for w in ("workplace", "workplaces", "workspace", "workspaces")):
            probs.append("工作区根目录要在 ~/workplace 或 ~/workspace 下面（KiroCrew 只让 agent 在那里干活）")
        elif p:
            out["work_root"] = p
    team = data.get("team")
    if team is not None:
        if not isinstance(team, dict):
            probs.append("team 是一个对象")
        else:
            t = out["team"]
            t["enabled"] = team.get("enabled") is True
            t["dev_same_user"] = team.get("dev_same_user") is True
            for k in ("bridge_config", "runnerd_config"):
                p = _path(team.get(k, ""))
                if p and not os.path.isabs(p):
                    probs.append("team.%s 要写绝对路径" % k)
                    continue
                t[k] = p
            if t["enabled"] and not t["bridge_config"]:
                probs.append("打开运行机模式要填 team.bridge_config")
    return out, probs
