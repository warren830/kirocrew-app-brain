"""Brain: the entries on the default branch by file and section with their sources, how runs use them
(brainkit.usage), lint (brainkit.brainlint, static rules), and reflect (brainkit.reflect).

Reflect preview is the planning half of ``brain reflect`` (cmd_reflect): parse the run's brain-proposal and brain-gap
blocks, plan them against the Brain on main (ids used on open brain/* branches skipped, proposals already written
skipped), lint the dry run; nothing is written. ``--apply`` / ``--push`` are brain-kit's own command, run as is (a new
branch brain/<KEY>-reflect-<n> in its own worktree under ~/.brain/worktrees/<repo>/; with --push the MR); its output
is shown verbatim, and the reply names the branch and that worktree (git's own list: the worktree that has the new
branch checked out; else the folder brain-kit printed).
"""

from __future__ import annotations

import os
import re
import subprocess
from typing import Any

from . import bk
from .intake import brain_cmd
from .repo import Repo

MIN_RUNS = 3
SECTION_RE = re.compile(r"^##\s+(.+?)\s*$")
BRANCH_RE = re.compile(r"brain/[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-reflect-[1-9][0-9]*")
# what `brain reflect --apply` prints about its worktree (cmd_reflect): committed, not committed, pushed without a token
PRINTED_WT_RE = (re.compile(r"已提交到本地分支 \S+（(/[^（）\n]+)）"), re.compile(r"写在 (/[^（\n]+?)（分支 "),
                 re.compile(r"描述在 (/[^\n]+?)\.mr\.md"))


def _brain(repo: Repo) -> tuple[Any, str]:
    E = bk.m("entries")
    ref = repo.main_ref()
    if ref:
        return E.Brain.from_git(repo.path, ref, repo.cfg["brain_dir"]), ref.replace("refs/remotes/", "").replace(
            "refs/heads/", "")
    return E.Brain.load(os.path.join(repo.path, repo.cfg["brain_dir"])), "working tree"


def view(repo: Repo, reflectable: list[dict[str, Any]]) -> dict[str, Any]:
    """BrainView (blocking: call it in a thread)."""
    E = bk.m("entries")
    out: dict[str, Any] = {"repo": repo.id, "ref": "", "files": [], "lint": {"errors": [], "warnings": []},
                           "usage": {"useful": [0, 0], "repeat_rate": [0, 0], "archived": 0, "purged": 0, "runs": [],
                                     "never_cited": [], "repeats_any": []}, "reflect": reflectable, "error": ""}
    try:
        brain, label = _brain(repo)
    except bk.brain_error() as exc:
        out["error"] = str(exc)
        return out
    out["ref"] = label
    try:
        u = bk.m("usage").collect(repo.path, repo.cfg, ref=repo.main_ref())
    except Exception as exc:  # noqa: BLE001 - usage is a view: the entries still show
        u = None
        out["error"] = "Brain 用量读不出来：%s" % str(exc)[:200]
    used = {x["id"]: x for x in (u or {}).get("entries") or []}
    for key in E.FILES:
        f = brain.files.get("%s.md" % key)
        sections: list[dict[str, Any]] = []
        cur = {"title": "", "entries": []}
        count = 0
        for b in (f.blocks if f is not None else []):
            if isinstance(b, str):
                m = SECTION_RE.match(b)
                if m:
                    if cur["entries"] or cur["title"]:
                        sections.append(cur)
                    cur = {"title": m.group(1)[:60], "entries": []}
                continue
            x = used.get(b.id, {})
            count += 1
            cur["entries"].append({
                "id": b.id, "type": b.type, "side": b.attrs.get("side", ""), "rel": b.attrs.get("rel", "new"),
                "repeats": max(b.repeats, 0), "src": b.src, "text": b.text()[:4000],
                "cites": int(x.get("cites") or 0), "runs": int(x.get("runs") or 0),
                "loaded_by": int(x.get("loaded_by") or 0),
                "candidate": bool(x) and not x.get("cites") and int(x.get("loaded_by") or 0) >= MIN_RUNS})
        if cur["entries"] or cur["title"]:
            sections.append(cur)
        sections = [s for s in sections if s["entries"]]
        meta = E.FILES[key]
        out["files"].append({"key": key, "letter": meta["letter"], "side": meta["side"], "types": list(meta["types"]),
                             "count": count, "sections": sections})
    errors, warnings = bk.m("brainlint").check(brain)
    out["lint"] = {"errors": [str(e) for e in errors][:100], "warnings": [str(w) for w in warnings][:100]}
    if u:
        out["usage"] = {
            "useful": list(u.get("useful") or [0, 0]), "repeat_rate": list(u.get("repeat_rate") or [0, 0]),
            "archived": int(u.get("archived") or 0), "purged": int(u.get("purged") or 0),
            "runs": [{"intent": r["intent"], "key": r.get("key") or "", "loaded": r.get("loaded"),
                      "cited": list(r.get("cited") or []), "stale": list(r.get("stale") or []),
                      "unknown": list(r.get("unknown") or [])} for r in u.get("runs") or []],
            "never_cited": [x["id"] for x in u.get("entries") or [] if not x["cites"] and x["loaded_by"] >= MIN_RUNS],
            "repeats_any": [[i, n] for i, n in u.get("repeats_any") or []]}
    return out


def _where(repo: Repo, facts: dict[str, Any]) -> tuple[str, str | None]:
    """(the repo to read the run from, the ref): its worktree's files, else its branch or main."""
    if facts.get("worktree"):
        return facts["worktree"], None
    return repo.path, facts.get("ref")


def preview(repo: Repo, facts: dict[str, Any], vouchers_dir: str | None) -> dict[str, Any]:
    R, E = bk.m("reflect"), bk.m("entries")
    key = facts["key"]
    out = {"repo": repo.id, "key": key, "source": "", "ops": [], "gaps": [], "notes": [], "warnings": [],
           "problems": [], "substantive": False, "error": ""}
    base = repo.main_ref()
    if not base:
        out["error"] = "这个仓库没有 %s 分支" % repo.cfg["default_branch"]
        return out
    src_repo, ref = _where(repo, facts)
    try:
        mcfg = R.main_cfg(repo.path, base)
        text, label = R.source_text(src_repo, repo.cfg, key, ref=ref)
        out["source"] = label
        proposals, probs = R.parse(text)
        gaps = []
        if hasattr(R, "parse_gaps"):
            gaps, more = R.parse_gaps(text)
            probs += more
        brain = E.Brain.from_git(repo.path, base, mcfg["brain_dir"])
        used, pending = R.open_branches(repo.path, mcfg["brain_dir"])
        ops, more, notes = R.plan(brain, proposals, key, pending=pending, used_extra=used)
        probs += more
        rows = []
        if gaps and hasattr(R, "plan_gaps"):
            rows, more = R.plan_gaps(repo.path, repo.cfg, gaps, key)
            probs += more
        lost = R.rejected_without_correction(vouchers_dir, key, proposals) if vouchers_dir else []
    except bk.brain_error() as exc:
        out["error"] = str(exc)
        return out
    out["ops"] = [{"kind": op.kind, "target": op.kw.get("eid"), "file": op.kw.get("file"), "type": op.kw.get("type"),
                   "section": op.kw.get("section"), "src": list(op.p.src), "text": E.norm(op.p.body)[:2000]}
                  for op in ops]
    for r in rows:
        g = r.get("gap")
        if g is None:
            continue
        what = "之前已登记 %s" % (r["existing"] or {}).get("key") if r.get("existing") else "写入时登记成新需求"
        out["gaps"].append({"title": str(getattr(g, "title", ""))[:200], "kind": str(getattr(g, "kind", "")), "what": what})
    out["notes"], out["warnings"], out["problems"] = [str(n) for n in notes], [str(w) for w in lost], [str(p) for p in probs]
    out["substantive"] = bool(ops) and R.substantive(ops)
    return out


def apply(repo: Repo, facts: dict[str, Any], push: bool) -> dict[str, Any]:
    """``brain reflect --key KEY [--ref REF] --apply [--push]`` (blocking)."""
    src_repo, ref = _where(repo, facts)
    args = ["reflect", "--key", facts["key"], "--apply"]
    if ref:
        args += ["--ref", ref]
    if push:
        args.append("--push")
    env = dict(os.environ)
    env.update({"GIT_TERMINAL_PROMPT": "0", "PYTHONIOENCODING": "utf-8"})
    try:
        p = subprocess.run(brain_cmd() + args, cwd=src_repo, capture_output=True, text=True, timeout=600, env=env)
        text, code = ((p.stdout or "") + (("\n" + p.stderr) if p.stderr else "")).strip(), p.returncode
    except subprocess.TimeoutExpired:
        text, code = "brain reflect 超过 600 秒没结束", 124
    except OSError as exc:
        text, code = "跑不了 brain：%s" % exc, 127
    m = BRANCH_RE.search(text)
    branch = m.group(0) if m else None
    repo.invalidate()
    return {"ok": code == 0, "output": text[-20000:], "branch": branch,
            "worktree": reflect_worktree(repo, branch, text) if code == 0 else None}


def reflect_worktree(repo: Repo, branch: str | None, text: str) -> str | None:
    """The worktree `brain reflect --apply` wrote *branch* in: the one git lists with that branch checked out (the
    truth, whatever brain-kit printed), else the folder its output names."""
    if branch:
        for w in repo.git.worktrees():
            if w.get("branch") == "refs/heads/" + branch and os.path.isdir(w.get("path") or ""):
                return w["path"]
    for rx in PRINTED_WT_RE:
        hit = rx.search(text)
        if hit and os.path.isdir(hit.group(1)):
            return hit.group(1)
    return None
