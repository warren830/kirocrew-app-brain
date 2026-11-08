"""Is this KiroCrew ready for brain-dev? The checks of brain-kit's ``crew_checks`` / ``cmd_crew_agent``
(brainkit/cli.py), said in Chinese, and their two fixes, each only when the person clicks it:

- ~/.kiro/agents/brain-dev.json carries Lean's three hooks (SessionStart, UserPromptSubmit, PreToolUse through
  .kiro/brain/lean-hook.py): KiroCrew never reads a project's .kiro/hooks/; on the kas engine it runs agent-spec hooks
  from the user level only. Fix: install brain-kit's crew/brain-dev.json (an existing different file is kept as
  brain-dev.json.bak-<time>).
- the engine (``agent.acp_backend``) is kas: Lean via agent hooks is tested there only. Fix:
  ``kirocrew config set agent.acp_backend kas``.
- every repo has .kiro/brain/lean-hook.py (``brain install``); there is no fix from here.

The kirocrew CLI lives in ~/.local/bin, which is not on the gateway's PATH: constants.kirocrew_bin finds it.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from typing import Any

from . import bk
from .constants import kirocrew_bin

EVENTS = ("SessionStart", "UserPromptSubmit", "PreToolUse")


def _engine() -> tuple[str | None, str]:
    kc = kirocrew_bin()
    if not kc:
        return None, "找不到 kirocrew 命令（~/.local/bin/kirocrew）：看不了引擎设置"
    try:
        p = subprocess.run([kc, "config", "get", "agent.acp_backend"], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, "kirocrew config get 跑不了：%s" % exc
    lines = [x.strip() for x in (p.stdout or "").splitlines() if x.strip()]
    return (lines[-1] if lines else ""), ""


def checks(repo_paths: list[str]) -> dict[str, Any]:
    rows: list[dict[str, str]] = []
    fix = {"agent": False, "engine": False}
    if not bk.ok():
        return {"rows": [{"level": "FAIL", "text": "brain-kit 没装载：先在设置里写对它的位置"}], "fix": fix,
                "checked_at": time.time()}
    cli = bk.m("cli")
    path = cli.crew_agent_path()
    hook = getattr(cli, "CREW_HOOK", ".kiro/brain/lean-hook.py")
    if not os.path.exists(path):
        rows.append({"level": "FAIL", "text": "没有 ~/.kiro/agents/brain-dev.json：Lean 的 hook 在 KiroCrew 里不会跑"})
        fix["agent"] = True
    else:
        try:
            with open(path, encoding="utf-8") as f:
                spec = json.load(f)
            cmds = [h.get("command", "") for hs in (spec.get("hooks") or {}).values() for h in hs if isinstance(h, dict)]
            ok = all(any(hook in c and ev in c for c in cmds) for ev in EVENTS)
        except (OSError, ValueError, AttributeError, TypeError):
            spec, ok = None, False
        if spec is None:
            rows.append({"level": "FAIL", "text": "~/.kiro/agents/brain-dev.json 不是合法的 JSON"})
            fix["agent"] = True
        elif not ok:
            rows.append({"level": "FAIL", "text": "brain-dev.json 没带上 Lean 的三个 hook（会话开始、发消息、调用工具前）"})
            fix["agent"] = True
        else:
            rows.append({"level": "OK", "text": "brain-dev 带着 Lean 的三个 hook"})
            try:
                with open(cli.CREW_AGENT_SRC, encoding="utf-8") as f:
                    if json.load(f) != spec:
                        rows.append({"level": "WARN", "text": "brain-dev.json 和 brain-kit 带的版本不一样"})
                        fix["agent"] = True
            except (OSError, ValueError):
                pass
    for rp in repo_paths:
        if not os.path.exists(os.path.join(rp, hook)):
            rows.append({"level": "FAIL", "text": "%s 里没有 %s：先在这个项目里 brain install" % (os.path.basename(rp), hook)})
    be, why = _engine()
    if be is None:
        rows.append({"level": "WARN", "text": why})
    elif be in ("kas", ""):
        rows.append({"level": "OK", "text": "KiroCrew 引擎：%s" % (be or "默认（kas）")})
    else:
        rows.append({"level": "WARN", "text": "KiroCrew 引擎是 %s：Lean 的 hook 只在 kas（v3）上测过" % be})
        fix["engine"] = True
    return {"rows": rows, "fix": fix, "checked_at": time.time()}


def agent_ok(rows: list[dict[str, str]]) -> bool:
    """brain-dev may be opened: its spec is there and carries the hooks (a version drift is only a warning)."""
    return not any(r["level"] == "FAIL" and ("brain-dev" in r["text"]) for r in rows)


def fix_agent() -> str:
    cli = bk.m("cli")
    path = cli.crew_agent_path()
    with open(cli.CREW_AGENT_SRC, encoding="utf-8") as f:
        spec = json.load(f)
    note = ""
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                same = json.load(f) == spec
        except (OSError, ValueError):
            same = False
        if same:
            return "brain-dev.json 已经是 brain-kit 的版本"
        bak = "%s.bak-%s" % (path, time.strftime("%Y%m%d-%H%M%S"))
        shutil.copy2(path, bak)
        note = "，原来的留在 %s" % os.path.basename(bak)
    bk.m("common").write_json(path, spec)
    return "装好了 ~/.kiro/agents/brain-dev.json%s。新开的会话才会带上它。" % note


def fix_engine() -> str:
    kc = kirocrew_bin()
    if not kc:
        raise RuntimeError("找不到 kirocrew 命令：自己跑 kirocrew config set agent.acp_backend kas")
    p = subprocess.run([kc, "config", "set", "agent.acp_backend", "kas"], capture_output=True, text=True, timeout=30)
    if p.returncode != 0:
        raise RuntimeError("kirocrew config set 失败：%s" % (p.stderr or p.stdout).strip()[:300])
    return "引擎设成了 kas。KiroCrew 可能要重开才生效。"
