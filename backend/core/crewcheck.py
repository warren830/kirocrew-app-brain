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
  from main, so a file that is only on this disk is not there. d46765f: the committed adapter is new enough for the
  team runner (``crew_hook_problem``: version 2 lets a run write its own park.json in every Lean approval state).
- every repo's aidlc-docs/lean.json leaves runs/** out of Lean's code fingerprint (``mrdesc.write_problem``, brain-kit
  72b278e; 48b6b97's `brain doctor` FAILs and `brain handoff` refuses without it: a park.json or MR.md written after
  `lean release` would void the RELEASE approval). The file is the person's (the agent cannot edit it).
  Fix for these repo rows ('kit'): 导入仓库's reinstall on a new branch (installer.upgrade: `brain install` there
  refreshes the kit files and adds runs/** to lean.json, then a commit and an MR the person reviews).
  The adapter's version and runs/** matter only to a repo handed to the team runner (``team_paths``): FAIL there, a
  WARN reminder for a local-only repo. Not committed stays FAIL everywhere.

Every row is a problems.py CheckRow: short Chinese, 做什么, the fix, the repo, brain-kit's own words in ``raw``.
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
from . import problems as P
from .constants import kirocrew_bin

TRIGGER_NAMES = P.TRIGGER_NAMES
NEEDS = ("CREW_HOOK", "CREW_EVENTS", "agent_hook_commands", "missing_lean_hooks", "add_lean_hooks",
         "runner_kit_problems")
AGENT_OK = P.AGENT_OK   # the one row agent_ok accepts (always the start of its text)


def _engine() -> tuple[str | None, str, str]:
    """(the engine, '' | no_kirocrew | failed, the error text)."""
    kc = kirocrew_bin()
    if not kc:
        return None, "no_kirocrew", ""
    try:
        p = subprocess.run([kc, "config", "get", "agent.acp_backend"], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, "failed", str(exc)[:300]
    lines = [x.strip() for x in (p.stdout or "").splitlines() if x.strip()]
    return (lines[-1] if lines else ""), "", ""


def _load(path: str) -> tuple[dict[str, Any] | None, str]:
    """(spec, "") for a spec brain-kit can read and extend; (None, why in Chinese) for anything else."""
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError as exc:
        return None, "读不了（%s）" % exc   # agent_unreadable splits the OS error off into raw
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


def checks(repo_paths: list[str], team_paths: Any = None) -> dict[str, Any]:
    """The rows (problems.py CheckRows) and which fix buttons apply. *team_paths*: the repos handed to the team runner
    (service.team_paths); None: not known, so a runner-only problem is as brain-kit says it (FAIL)."""
    rows: list[dict[str, Any]] = []
    fix = {"agent": False, "engine": False}
    if not bk.ok():
        return {"rows": [P.brainkit_missing()], "fix": fix, "checked_at": time.time()}
    cli = bk.m("cli")
    lacking = [n for n in NEEDS if not hasattr(cli, n)]
    if lacking:
        return {"rows": [P.brainkit_old(lacking)], "fix": fix, "checked_at": time.time()}
    path = cli.crew_agent_path()
    if not os.path.exists(path):
        rows.append(P.agent_missing())
        fix["agent"] = True
    else:
        spec, why = _load(path)
        if spec is None:
            rows.append(_unreadable_row(why))
        else:
            missing = cli.missing_lean_hooks(spec)
            if missing:
                rows.append(P.agent_lacks(missing))
                fix["agent"] = True
            else:
                others = sum(1 for cmds in cli.agent_hook_commands(spec).values() for c in cmds
                             if cli.CREW_HOOK not in c)
                rows.append(P.agent_ok(others))
                custom = _custom_fields(cli, spec)
                if custom:
                    rows.append(P.agent_custom(custom))
    team = None if team_paths is None else {os.path.realpath(p) for p in team_paths}
    for rp in repo_paths:
        is_team = None if team is None else os.path.realpath(rp) in team
        try:
            probs = cli.runner_kit_problems(rp)
        except Exception as exc:  # noqa: BLE001 - one unreadable repo must not hide the other checks
            rows.append(P.repo_unreadable(rp, str(exc)))
            probs = []
        for p in probs:
            rows.append(P.row("FAIL", p, repo=rp, team=is_team))
        for p in kit_files_missing(rp):
            rows.append(P.row("FAIL", p, repo=rp, team=is_team))
        why = _records_counted(rp)
        if why:
            rows.append(P.row("FAIL", why, repo=rp, team=is_team))
    be, how, detail = _engine()
    rows.append(P.engine(be, how, detail))
    if be not in (None, "kas", ""):
        fix["engine"] = True
    return {"rows": rows, "fix": fix, "checked_at": time.time()}


BRAIN_FILES = ("PRODUCT.md", "TECH.md", "IMPROVEMENT.md", "PROJECT.md")   # brain install's Brain (kit.json brain_files)


def kit_files_missing(rp: str) -> list[str]:
    """The kit files `brain install` puts in a checkout that are not in this one (the Brain files, AGENTS.md), in
    `brain doctor`'s words, so their rows offer 重装 kit 文件 as its rows do."""
    try:
        cfg = bk.m("config").load(rp)
    except Exception:  # noqa: BLE001 - no readable kit.json: the repo's own row says so
        return []
    bdir = str(cfg.get("brain_dir") or "brain")
    names = [n for n in cfg.get("brain_files") or BRAIN_FILES if not os.path.isfile(os.path.join(rp, bdir, n))]
    out = ["Brain files in %s/: missing %s" % (bdir, ", ".join(names))] if names else []
    return out + ([] if os.path.isfile(os.path.join(rp, "AGENTS.md")) else ["AGENTS.md at repo root"])


def _unreadable_row(why: str) -> dict[str, Any]:
    """读不了（<OS error>）: the OS error goes into raw."""
    if why.startswith("读不了（") and why.endswith("）"):
        return P.agent_unreadable("读不了", why[len("读不了（"):-1])
    return P.agent_unreadable(why)


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


def agent_ok(rows: list[dict[str, Any]]) -> bool:
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
