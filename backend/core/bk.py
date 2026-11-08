"""brain-kit as a library, imported from a configured checkout (never edited by this app).

The checkout's ``brainkit`` package is loaded under a private name (``_brainapp_brainkit``), the way the app's own
modules are: nothing goes on ``sys.path``, and nothing else in the gateway process sees it. Every module of brain-kit
imports its siblings relatively, so the package works under any name.

Required modules (the app does nothing without them): common, config, claims, runrec, lean, entries, brainlint, usage,
reflect, sign, cli, intake.package, bridge.handoff, bridge.decisions, bridge.runnerd, rest.
Optional ones, added while this app was written, are guarded: trace, evaluate, golden, intents. A missing or broken
optional module turns its feature off (``has()``), with the import error kept for the page.
The public interfaces of brain-kit c9e59d1 are required too (NEEDS: the spool signer, the answer verifier, the
question's first line, the agent-spec hook functions, GitLab's MR versions): an older checkout is refused with a clear
error instead of half working.

The checkout must not be writable by the agents' OS user in production: whatever is in it runs inside the gateway.
"""

from __future__ import annotations

import importlib
import importlib.machinery
import importlib.util
import os
import sys
import threading
from pathlib import Path
from types import ModuleType
from typing import Any

PKG = "_brainapp_brainkit"
REQUIRED = ("common", "config", "claims", "runrec", "lean", "entries", "brainlint", "usage", "reflect", "sign", "cli",
            "rest", "intake.package", "bridge.handoff", "bridge.decisions", "bridge.runnerd", "bridge.ledger")
OPTIONAL = ("trace", "evaluate", "golden", "intents")
CANDIDATES = ("~/brain-kit", "~/warren_ws/brain-kit", "~/workplace/brain-kit", "/opt/brain-kit")
NEEDS = (("sign", "SpoolSigner"), ("sign", "SignerRefused"), ("sign", "signer_from_config"),
         ("bridge.decisions", "check_answer"), ("bridge.decisions", "Q_HEAD_RE"), ("bridge.ledger", "Ledger"),
         ("cli", "missing_lean_hooks"), ("cli", "add_lean_hooks"), ("cli", "runner_kit_problems"),
         ("rest", "head_pushed_at"))

_lock = threading.RLock()
_state: dict[str, Any] = {"path": None, "mods": {}, "errors": {}, "error": "", "version": None}


def default_path() -> str:
    """$BRAINKIT_HOME, else the first usual place that holds a brain-kit checkout, else ~/brain-kit."""
    env = os.environ.get("BRAINKIT_HOME", "").strip()
    if env:
        return os.path.expanduser(env)
    for c in CANDIDATES:
        p = os.path.expanduser(c)
        if os.path.isfile(os.path.join(p, "brainkit", "__init__.py")):
            return p
    return os.path.expanduser(CANDIDATES[0])


def unload() -> None:
    """Drop every module of the private package (a new path, or the app stopping)."""
    with _lock:
        for k in [k for k in sys.modules if k == PKG or k.startswith(PKG + ".")]:
            sys.modules.pop(k, None)
        _state.update(path=None, mods={}, errors={}, error="", version=None)


def load(path: str) -> dict[str, Any]:
    """Import brain-kit from *path* (a checkout with ``brainkit/``). Returns info(); never raises."""
    path = os.path.realpath(os.path.expanduser(path or ""))
    with _lock:
        if _state["path"] == path and (_state["mods"] or _state["error"]):
            return info()
        unload()
        _state["path"] = path
        pkg_dir = os.path.join(path, "brainkit")
        if not os.path.isfile(os.path.join(pkg_dir, "__init__.py")):
            _state["error"] = "这里没有 brain-kit（找不到 %s/__init__.py）" % pkg_dir
            return info()
        try:
            spec = importlib.util.spec_from_file_location(PKG, os.path.join(pkg_dir, "__init__.py"),
                                                          submodule_search_locations=[pkg_dir])
            root = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
            sys.modules[PKG] = root
            spec.loader.exec_module(root)  # type: ignore[union-attr]
            _state["version"] = str(getattr(root, "__version__", "") or "") or None
            mods = {}
            for name in REQUIRED:
                mods[name] = importlib.import_module("%s.%s" % (PKG, name))
        except Exception as exc:  # noqa: BLE001 - a broken checkout must not take the app down
            unload()
            _state["path"] = path
            _state["error"] = "brain-kit 导入失败：%s: %s" % (type(exc).__name__, str(exc)[:300])
            return info()
        lacking = ["%s.%s" % (mod, attr) for mod, attr in NEEDS if not hasattr(mods[mod], attr)]
        if lacking:
            unload()
            _state["path"] = path
            _state["error"] = "brain-kit 太旧（没有 %s）：要 c9e59d1 或更新的版本" % "、".join(lacking)
            return info()
        for name in OPTIONAL:
            try:
                mods[name] = importlib.import_module("%s.%s" % (PKG, name))
            except Exception as exc:  # noqa: BLE001
                _state["errors"][name] = "%s: %s" % (type(exc).__name__, str(exc)[:200])
        _state["mods"] = mods
        return info()


def info() -> dict[str, Any]:
    return {"path": _state["path"] or "", "ok": bool(_state["mods"]) and not _state["error"],
            "version": _state["version"], "error": _state["error"],
            "modules": {n: n in _state["mods"] for n in OPTIONAL}, "module_errors": dict(_state["errors"])}


def ok() -> bool:
    return bool(_state["mods"]) and not _state["error"]


def has(name: str) -> bool:
    return name in _state["mods"]


def m(name: str) -> ModuleType:
    """A loaded brain-kit module (``m("config")``, ``m("bridge.handoff")``); BrainKitMissing when it is not there."""
    mod = _state["mods"].get(name)
    if mod is None:
        raise BrainKitMissing(name, _state["errors"].get(name) or _state["error"] or "brain-kit 没有装载")
    return mod


def brain_error() -> type:
    """brain-kit's BrainError class (what its functions raise for a user-facing failure)."""
    return m("common").BrainError


def root() -> Path:
    return Path(_state["path"] or default_path())


class BrainKitMissing(RuntimeError):
    def __init__(self, name: str, why: str) -> None:
        super().__init__("brain-kit 的 %s 用不了：%s" % (name, why))
        self.name = name
