"""Is this KiroCrew ready for brain-dev? The checks of brain-kit's ``crew_checks`` / ``cmd_crew_agent`` /
``runner_kit_problems`` (brainkit/cli.py), said in Chinese, and their two fixes, each only when the person clicks it:

- ~/.kiro/agents/brain-dev.json carries Lean's three hooks (SessionStart, UserPromptSubmit, PreToolUse through
  .kiro/brain/lean-hook.py) under the right triggers: KiroCrew never reads a project's .kiro/hooks/; on the kas engine
  it runs agent-spec hooks from the user level only. Kiro rewrites the specs (2026-11-08: a hooks list and kiroUpgrade)
  and other tools add their own hooks, so only Lean's hooks are checked (brain-kit's ``missing_lean_hooks`` reads both
  formats); a spec that differs from brain-kit's crew/brain-dev.json is fine.
  Fix: no file -> install brain-kit's crew/brain-dev.json. A file that lacks some of Lean's hooks -> brain-kit's
  ``add_lean_hooks`` adds only those, in the file's own format; everything else (other tools' hooks, kiroUpgrade,
  every other key and the order of keys and hooks) stays, and the old file is kept as brain-dev.json.bak-<time>.
  A file that is not valid JSON (or not a spec we can extend) is never written: the person fixes or removes it.
- the engine (``agent.acp_backend``) is kas: Lean via agent hooks is tested there only. Fix:
  ``kirocrew config set agent.acp_backend kas``.
- every repo has Lean and the hook adapter committed in git (``runner_kit_problems``): the app's worktrees are made
  from main, so a file that is only on this disk is not there. There is no fix from here (commit it through an MR).
- every repo's aidlc-docs/lean.json leaves runs/** out of Lean's code fingerprint (``mrdesc.write_problem``, brain-kit
  72b278e; 48b6b97's `brain doctor` FAILs and `brain handoff` refuses without it: a park.json or MR.md written after
  `lean release` would void the RELEASE approval). The file is the person's (the agent cannot edit it): no fix from
  here; `brain install <repo>` adds it, then it is reviewed and committed.
- brain-kit 72b278e: a spec that sets its own model, tools, resources or prompt keeps them (`brain crew-agent
  --force` only adds what is missing; `--reset` takes brain-kit's): said in an OK row, nothing to fix.

The kirocrew CLI lives in ~/.local/bin, which is not on the gateway's PATH: constants.kirocrew_bin finds it.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
from typing import Any

from . import bk
from .constants import kirocrew_bin

TRIGGER_NAMES = {"agentSpawn": "会话开始", "userPromptSubmit": "发消息", "preToolUse": "调用工具前"}
NEEDS = ("CREW_HOOK", "CREW_EVENTS", "agent_hook_commands", "missing_lean_hooks", "add_lean_hooks",
         "runner_kit_problems")
AGENT_OK = "brain-dev 带着 Lean 的三个 hook"   # the one row agent_ok accepts (always the start of its text)


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


def _load(path: str) -> tuple[dict[str, Any] | None, str]:
    """(spec, "") for a spec brain-kit can read and extend; (None, why in Chinese) for anything else."""
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError as exc:
        return None, "读不了（%s）" % exc
    try:
        spec = json.loads(raw.decode("utf-8"))
    except ValueError:
        return None, "不是合法的 JSON"
    if not isinstance(spec, dict):
        return None, "不是一个 JSON 对象"
    hooks = spec.get("hooks")
    if not (hooks is None or isinstance(hooks, list) or
            (isinstance(hooks, dict) and all(isinstance(v, list) for v in hooks.values()))):
        return None, "的 hooks 格式认不出"
    return spec, ""


def _unreadable(why: str) -> str:
    return "~/.kiro/agents/brain-dev.json %s：自己修好或删掉它（这里不会覆盖它）" % why


def _names(missing: list[tuple[str, str]]) -> str:
    return "、".join("%s（%s）" % (TRIGGER_NAMES.get(t, t), t) for t, _ in missing)


def _write_in_place(path: str, spec: dict[str, Any]) -> None:
    """Atomic like brain-kit's write_json, but the keys keep their order (no sort_keys) and the file its mode;
    a symlinked spec is written through the link."""
    target = os.path.realpath(path)
    mode = os.stat(target).st_mode & 0o7777
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(target), prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(spec, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.chmod(tmp, mode)
        os.replace(tmp, target)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def checks(repo_paths: list[str]) -> dict[str, Any]:
    rows: list[dict[str, str]] = []
    fix = {"agent": False, "engine": False}
    if not bk.ok():
        return {"rows": [{"level": "FAIL", "text": "brain-kit 没装载：先在设置里写对它的位置"}], "fix": fix,
                "checked_at": time.time()}
    cli = bk.m("cli")
    lacking = [n for n in NEEDS if not hasattr(cli, n)]
    if lacking:
        return {"rows": [{"level": "FAIL", "text": "brain-kit 太旧（没有 %s）：先把它更新" % "、".join(lacking)}],
                "fix": fix, "checked_at": time.time()}
    path = cli.crew_agent_path()
    if not os.path.exists(path):
        rows.append({"level": "FAIL", "text": "没有 ~/.kiro/agents/brain-dev.json：Lean 的 hook 在 KiroCrew 里不会跑"})
        fix["agent"] = True
    else:
        spec, why = _load(path)
        if spec is None:
            rows.append({"level": "FAIL", "text": _unreadable(why)})
        else:
            missing = cli.missing_lean_hooks(spec)
            if missing:
                rows.append({"level": "FAIL", "text": "brain-dev.json 缺 Lean 的 hook：%s。修复只补上缺的，"
                                                      "别的 hook 和设置都不动" % _names(missing)})
                fix["agent"] = True
            else:
                others = sum(1 for cmds in cli.agent_hook_commands(spec).values() for c in cmds
                             if cli.CREW_HOOK not in c)
                rows.append({"level": "OK", "text": AGENT_OK + ("（另有 %d 个别的 hook，留着不动）" % others
                                                                 if others else "")})
                custom = _custom_fields(cli, spec)
                if custom:
                    rows.append({"level": "OK", "text": "brain-dev 用的是你自己的 %s（`brain crew-agent --reset` 换回 "
                                                        "brain-kit 的；--force 只补缺的）" % "、".join(custom)})
    for rp in repo_paths:
        name = os.path.basename(os.path.normpath(rp))
        try:
            probs = cli.runner_kit_problems(rp)
        except Exception as exc:  # noqa: BLE001 - one unreadable repo must not hide the other checks
            probs = ["查不了它的 git：%s" % str(exc)[:200]]
        for p in probs:
            rows.append({"level": "FAIL", "text": "仓库 %s：%s" % (name, p)})
        why = _records_counted(rp)
        if why:
            rows.append({"level": "FAIL", "text": "仓库 %s：%s" % (name, why)})
    be, why = _engine()
    if be is None:
        rows.append({"level": "WARN", "text": why})
    elif be in ("kas", ""):
        rows.append({"level": "OK", "text": "KiroCrew 引擎：%s" % (be or "默认（kas）")})
    else:
        rows.append({"level": "WARN", "text": "KiroCrew 引擎是 %s：Lean 的 hook 只在 kas（v3）上测过" % be})
        fix["engine"] = True
    return {"rows": rows, "fix": fix, "checked_at": time.time()}


def _custom_fields(cli: Any, spec: dict[str, Any]) -> list[str]:
    """brain-kit's fields the spec sets to values of its own (cli.crew_agent_custom, 72b278e); [] when unknown."""
    fn = getattr(cli, "crew_agent_custom", None)
    if fn is None:
        return []
    try:
        return [str(k) for k in fn(spec, bk.m("common").load_json(cli.CREW_AGENT_SRC))]
    except Exception:  # noqa: BLE001 - informational only
        return []


def _records_counted(repo_path: str) -> str:
    """Why Lean counts the repo's runs/ records as code (mrdesc.write_problem), with brain-kit's fix; "" when it does
    not, or when brain-kit cannot tell."""
    if not bk.has("mrdesc") or not hasattr(bk.m("mrdesc"), "write_problem"):
        return ""
    M = bk.m("mrdesc")
    try:
        cfg = bk.m("config").load(repo_path)
        why = M.write_problem(repo_path, cfg)
        fix = M.exclude_fix(cfg) if why and hasattr(M, "exclude_fix") else ""
    except Exception:  # noqa: BLE001 - one unreadable repo must not hide the other checks
        return ""
    return ("%s。%s" % (str(why).rstrip("。"), fix) if fix else str(why)) if why else ""


def agent_ok(rows: list[dict[str, str]]) -> bool:
    """brain-dev may be opened: the checks found its spec carrying Lean's three hooks. Only that OK row counts, so a
    missing, unreadable or incomplete spec, brain-kit not loaded, or rows from elsewhere all say no."""
    return any(r.get("level") == "OK" and str(r.get("text", "")).startswith(AGENT_OK) for r in rows)


def fix_agent() -> str:
    cli = bk.m("cli")
    path = cli.crew_agent_path()
    if not os.path.exists(path):
        with open(cli.CREW_AGENT_SRC, encoding="utf-8") as f:
            spec = json.load(f)
        bk.m("common").write_json(path, spec)
        return "装好了 ~/.kiro/agents/brain-dev.json（brain-kit 带的版本）。新开的会话才会带上它。"
    spec, why = _load(path)
    if spec is None:
        raise RuntimeError(_unreadable(why))
    missing = cli.missing_lean_hooks(spec)
    if not missing:
        return "brain-dev.json 已经带着 Lean 的三个 hook：什么都没改"
    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak, n = "%s.bak-%s" % (path, stamp), 1
    while os.path.exists(bak):
        bak, n = "%s.bak-%s-%d" % (path, stamp, n), n + 1
    shutil.copy2(path, bak)
    _write_in_place(path, cli.add_lean_hooks(spec, missing))
    return ("给 brain-dev.json 补上了 Lean 的 hook：%s；别的 hook 和设置都没动，原来的留在 %s。新开的会话才会带上它。"
            % (_names(missing), os.path.basename(bak)))


def fix_engine() -> str:
    kc = kirocrew_bin()
    if not kc:
        raise RuntimeError("找不到 kirocrew 命令：自己跑 kirocrew config set agent.acp_backend kas")
    p = subprocess.run([kc, "config", "set", "agent.acp_backend", "kas"], capture_output=True, text=True, timeout=30)
    if p.returncode != 0:
        raise RuntimeError("kirocrew config set 失败：%s" % (p.stderr or p.stdout).strip()[:300])
    return "引擎设成了 kas。KiroCrew 可能要重开才生效。"
