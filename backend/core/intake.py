"""开需求: claim a key, take documents through brain-kit's five gates, start the run, open its brain-dev session.

- ``next_key``: the key a start would claim (tracker none), from the claims this machine has seen; GitLab decides at
  the start (brain-kit pushes claim/<KEY>; two people racing get two keys).
- ``check``: brain-kit's dry run in this process (intake.package.build, dry_run=True): every finding, every gate
  that would stop it, verbatim; nothing is written (the intake store folder is created if missing, as brain does).
- ``start``: ``brain start`` itself, run as a command in a fresh worktree of the repo (one folder per requirement
  under work_root, so several requirements can be open at once and each session has its own directory); its output
  verbatim. Materials go to the person's intake store, never into a repo.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any

from . import bk
from .constants import KEY_RE, PYTHON_BIN, SLUG_RE
from .repo import Repo, parse_branch

CLASSES = ("public", "internal", "confidential", "secret", "unsure")
MAX_DOCS = 50
START_TIMEOUT_S = 900
MAX_OUT = 20000


class IntakeError(Exception):
    pass


def next_key(repo: Repo) -> dict[str, Any]:
    cfg = repo.cfg
    out = {"repo": repo.id, "key": None, "tracker": cfg["tracker"], "prefix": cfg["req_prefix"], "error": ""}
    if cfg["tracker"] != "none":
        return out
    rx = re.compile(r"^refs/(?:heads|remotes/origin)/claim/%s-([1-9][0-9]*)$" % re.escape(cfg["req_prefix"]))
    taken = {int(m.group(1)) for m in (rx.match(r) for r in repo.git.refs("refs/heads/claim/",
                                                                          "refs/remotes/origin/claim/")) if m}
    out["key"] = "%s-%d" % (cfg["req_prefix"], max(taken or {0}) + 1)
    return out


def _lines(v: Any, limit: int = MAX_DOCS) -> list[str]:
    if isinstance(v, str):
        v = v.splitlines()
    if not isinstance(v, list):
        return []
    return [str(x).strip() for x in v if isinstance(x, str) and str(x).strip()][:limit]


def clean_body(repo: Repo, body: dict[str, Any], *, start: bool) -> dict[str, Any]:
    """The form, checked; IntakeError says what is wrong (in Chinese)."""
    cfg = repo.cfg
    slug = str(body.get("slug") or "").strip().lower()
    if not SLUG_RE.match(slug):
        raise IntakeError("英文短名只能是小写字母、数字和 -（最多 40 个字）")
    title = " ".join(str(body.get("title") or "").split())[:200]
    if start and not title:
        raise IntakeError("写一个需求标题")
    key = str(body.get("key") or "").strip().upper()
    if key and not KEY_RE.match(key):
        raise IntakeError("需求号要像 %s-12" % cfg["req_prefix"])
    if key and cfg["tracker"] == "none" and not key.startswith(cfg["req_prefix"] + "-"):
        raise IntakeError("这个仓库的需求号以 %s- 开头" % cfg["req_prefix"])
    if cfg["tracker"] == "jira" and not key:
        raise IntakeError("这个仓库接 Jira：要写 Jira 的需求号")
    docs = _lines(body.get("docs"))
    for d in docs:
        p = os.path.expanduser(d)
        if not os.path.isabs(p):
            raise IntakeError("文档要写这台电脑上的绝对路径：%s" % d)
        if not os.path.exists(p):
            raise IntakeError("找不到：%s" % d)
    cls = str(body.get("classification") or "")
    if docs and cls not in CLASSES:
        raise IntakeError("门 2：选一个密级（公开、内部、机密、绝密、不确定）")
    business = str(body.get("business") or "")
    if business not in ("", "keep", "mask"):
        raise IntakeError("门 3：商业敏感内容选「原样保留」或「换成占位符」")
    if docs and body.get("consent") is not True:
        raise IntakeError("门 1：确认你是作者，或已取得作者同意")
    exclude = _lines(body.get("exclude"), 30)
    paths = _lines(body.get("paths"), 50)
    for p in paths:
        if not re.match(r"^[A-Za-z0-9_./*-][A-Za-z0-9_./* -]{0,199}$", p) or ".." in p:
            raise IntakeError("预计改动的路径要是仓库里的相对路径：%s" % p)
    return {"slug": slug, "title": title, "key": key, "docs": [os.path.expanduser(d) for d in docs],
            "classification": cls, "business": business, "consent": body.get("consent") is True,
            "exclude": exclude, "paths": paths}


def check(repo: Repo, body: dict[str, Any], me: str | None) -> dict[str, Any]:
    """brain-kit's dry run of the five gates (blocking: call it in a thread)."""
    out = {"ok": False, "key": None, "package": None, "classification": None, "segments": 0, "sources": 0,
           "findings": [], "blocking": [], "refused": [], "error": ""}
    try:
        b = clean_body(repo, body, start=False)
    except IntakeError as exc:
        out["error"] = str(exc)
        return out
    key = b["key"] or next_key(repo)["key"]
    out["key"] = key
    if not b["docs"]:
        out["error"] = "没有文档：不用检查，可以直接开工"
        return out
    pkg = bk.m("intake.package")
    cli = bk.m("cli")
    try:
        store = cli._store(repo.path, None)
        rep = pkg.build(b["docs"], key, store, submitter=me or "unknown", consent=b["consent"],
                        classification=b["classification"], business=b["business"] or None,
                        kit_intake=repo.cfg["intake"], dry_run=True, exclude=b["exclude"])
    except bk.brain_error() as exc:
        out["error"] = str(exc)
        return out
    except (OSError, ValueError) as exc:
        out["error"] = "读不了文档：%s" % str(exc)[:300]
        return out
    out.update(ok=not rep.get("blocking"), package=rep.get("package"), classification=rep.get("classification"),
               segments=int(rep.get("segments") or 0), sources=int(rep.get("sources") or 0),
               findings=[str(x) for x in rep.get("findings") or []], blocking=[str(x) for x in rep.get("blocking") or []],
               refused=[{"id": str(r.get("id")), "name": str(r.get("name")), "reason": str(r.get("reason"))}
                        for r in rep.get("refused") or []])
    return out


def _worktree_for(repo: Repo, work_root: str, slug: str) -> Path:
    base = Path(work_root).expanduser() / repo.name
    for n in range(1, 100):
        p = base / (slug if n == 1 else "%s-%d" % (slug, n))
        if not p.exists():
            return p
    raise IntakeError("工作区目录名都被占用了：%s" % base)


def brain_cmd() -> list[str]:
    return [PYTHON_BIN, "-I", str(bk.root() / "bin" / "brain")]


def start(repo: Repo, body: dict[str, Any], work_root: str) -> dict[str, Any]:
    """``brain start`` in a new worktree (blocking: call it in a thread)."""
    out = {"ok": False, "key": None, "branch": None, "intent": None, "worktree": None, "output": "", "slot": None,
           "url": None, "session_error": ""}
    b = clean_body(repo, body, start=True)
    if b["docs"] and not b["consent"]:
        raise IntakeError("门 1：确认你是作者，或已取得作者同意")
    wt = _worktree_for(repo, work_root, b["slug"])
    wt.parent.mkdir(parents=True, exist_ok=True)
    d = repo.cfg["default_branch"]
    base = next((r for r in ("refs/remotes/origin/" + d, "refs/heads/" + d, "HEAD")
                 if repo.git.ok("rev-parse", "-q", "--verify", r + "^{commit}")), "HEAD")
    p = repo.git.run("worktree", "add", "-q", "--detach", str(wt), base, timeout=120)
    if p.returncode != 0:
        raise IntakeError("建工作区失败：%s" % (p.stderr or p.stdout).strip()[:300])
    args = ["start", b["slug"], "--title", b["title"]]
    preview = next_key(repo)["key"]
    if b["key"] and not (repo.cfg["tracker"] == "none" and b["key"] == preview):
        args += ["--key", b["key"]]  # the next free key is taken by brain-kit itself (it asks GitLab, this did not)
    if b["paths"]:
        args += ["--paths", ",".join(b["paths"])]
    if b["docs"]:
        args += ["--classification", b["classification"], "--consent"]
        if b["business"]:
            args += ["--business", b["business"]]
        for g in b["exclude"]:
            args += ["--exclude", g]
        args += ["--doc", *b["docs"]]
    env = dict(os.environ)
    env.update({"GIT_TERMINAL_PROMPT": "0", "PYTHONIOENCODING": "utf-8"})
    try:
        r = subprocess.run(brain_cmd() + args, cwd=str(wt), capture_output=True, text=True, timeout=START_TIMEOUT_S,
                           env=env)
        text = ((r.stdout or "") + (("\n" + r.stderr) if r.stderr else "")).strip()
        code = r.returncode
    except subprocess.TimeoutExpired:
        text, code = "brain start 超过 %d 秒没结束" % START_TIMEOUT_S, 124
    except OSError as exc:
        text, code = "跑不了 brain：%s" % exc, 127
    out["output"] = text[-MAX_OUT:]
    branch = repo.git.run("rev-parse", "--abbrev-ref", "HEAD", cwd=str(wt)).stdout.strip()
    parsed = parse_branch(branch, repo.cfg["branch_prefix"])
    if code != 0 or not parsed:
        if not parsed:  # nothing was started in it: no worktree is left behind
            repo.git.run("worktree", "remove", "--force", str(wt))
        out["output"] = out["output"] or "brain start 失败（退出码 %d）" % code
        repo.invalidate()
        return out
    key = parsed["key"]
    rec = None
    try:
        import json
        rec = json.loads((wt / repo.cfg["runs_dir"] / key / "run.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        rec = None
    out.update(ok=True, key=key, branch=branch, intent=(rec or {}).get("intent"), worktree=str(wt))
    repo.invalidate()
    return out


INTENT_RE = re.compile(r"^[0-9]{6}-[a-z0-9][a-z0-9-]{0,80}$")
PKG_RE = re.compile(r"^PKG-[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,4}$")
APPROVAL_LINE_RE = re.compile(r"(?im)^[ \t>*-]*(approve|approved|reject|批准|同意|驳回|拒绝)\b")


def kickoff(key: str, branch: str, intent: str | None, materials: list[str]) -> str:
    """The first message to a requirement's brain-dev session: ids only, each checked against its format (run.json is
    agent-writable: an "intent" with a line break must not smuggle an approval line in), no requirement text, nothing a
    person typed; a line that reads like an approval is dropped whatever happens."""
    key = key if KEY_RE.match(key or "") else "?"
    branch = branch if parse_branch(branch or "", branch.split("/", 1)[0] if branch else "ai") else "?"
    intent = intent if isinstance(intent, str) and INTENT_RE.match(intent) else None
    pkgs = [p for p in materials if isinstance(p, str) and PKG_RE.match(p)]
    lines = ["这是需求 %s 的本地开发会话。分支 %s%s。" % (key, branch, "，Lean intent %s" % intent if intent else ""),
             "按 brain-dev 的步骤开始：先读 AGENTS.md 和 brain/ 下的四个文件，再读 runs/%s/run.json" % key
             + ("" if not pkgs else "，然后读材料包 .brain-materials/%s/toc.md" % pkgs[0]) + "。",
             "有问题一次问完，每题带推荐答案。"]
    return "\n".join(l for l in lines if not APPROVAL_LINE_RE.match(l))
