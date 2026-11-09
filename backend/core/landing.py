"""A branch install's way forward: the install branches 导入仓库 made before installs went in place by default, and the
ones a person picks for an MR.

  merge  「合并到 <default>」: ``git merge --ff-only <branch>`` in the person's checkout, only when importer.merge_check
         says it can be fast-forwarded (on the default branch, no uncommitted tracked change, in the middle of nothing,
         the default branch still where the install branch started). A repo with a remote only after the person
         confirmed that the remote does not have it until they push. Then the install worktree (``git worktree remove``,
         never --force: a change in it stays) and the merged branch (``git branch -d``) go, and so does the record.
  pull   「拉取」 after the MR was merged on GitLab: ``git pull --no-rebase --ff-only origin <default>`` (no prompt, a time
         limit, plain Chinese errors) when importer.pull_check allows it; then the same cleanup when brain-kit came in.
  sweep  the background check: a record whose repo folder is gone, whose install branch is gone (or whose worktree is
         gone with nothing committed), whose kit.json is on the default branch in the checkout (an install merged), or
         whose commit the default branch has (an upgrade merged) is cleared. An in-place record goes once none of its
         paths has anything left to commit. Nothing is deleted on disk by the sweep.
"""

from __future__ import annotations

import os
from typing import Any

from .constants import GIT_BIN
from .importer import (KIT, ImportFail, Records, default_branch, git_failure, has_at, last_lines, merge_check,
                       origin_of, pull_check, quiet_env, run_quiet, tail)
from .installer import PUSH_TIMEOUT_S, brain_env, install_branch_ok, worktrees_of
from .repo import Git

MERGE_TIMEOUT_S = 120
PULL_TIMEOUT_S = PUSH_TIMEOUT_S


def _default_of(g: Git, rec: dict[str, Any]) -> str:
    return str(((rec.get("kit") or {}).get("default_branch")) or "") or (default_branch(g)[0] or "")


def cleanup(top: str, rec: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Remove the install worktree (only a clean one) and the install branch (only when merged): (removed, kept)."""
    g = Git(top)
    removed: list[str] = []
    kept: list[str] = []
    wt, b = rec.get("worktree"), str(rec.get("branch") or "")
    if wt and os.path.isdir(wt) and os.path.realpath(wt) in worktrees_of(top):
        p = g.run("worktree", "remove", wt, timeout=60)
        if p.returncode == 0:
            removed.append("工作目录 %s" % wt)
        else:
            kept.append("工作目录 %s（里面有改动，没删）" % wt)
    if b and g.ok("rev-parse", "-q", "--verify", "refs/heads/" + b):
        p = g.run("branch", "-d", b, timeout=30)
        if p.returncode == 0:
            removed.append("分支 %s" % b)
        else:
            kept.append("分支 %s（没合进来，可能是压缩合并的：确认不用了再自己删）" % b)
    return removed, kept


def merge(top: str, records: Records, *, confirm: bool = False) -> dict[str, Any]:
    """「合并到 <default>」 (blocking: run it in a thread)."""
    rec = records.get(top)
    if not rec or rec.get("mode") == "inplace" or not rec.get("branch"):
        raise ImportFail("这个仓库没有 app 装的分支：重新检查一下", "no_install", 409)
    g = Git(top)
    b, d = str(rec["branch"]), _default_of(g, rec)
    if not install_branch_ok(b, d):
        raise ImportFail("记下的安装分支 %s 不对：不合并" % b, "bad_record", 409)
    if not has_at(g, "refs/heads/" + b, KIT):
        raise ImportFail("分支 %s 上还没有提交好的安装：先提交" % b, "not_committed", 409)
    ok, why = merge_check(g, b, rec.get("base_sha"), d)
    if not ok:
        raise ImportFail(why, "cannot_merge", 409)
    origin = origin_of(g)
    if origin is not None and not confirm:
        raise ImportFail("这个仓库有远端：在本机合并以后，远端还没有它，要你自己推送。确认了再合并", "needs_confirm", 409)
    tip = g.out("rev-parse", "-q", "--verify", "refs/heads/%s^{commit}" % b)
    p = run_quiet([GIT_BIN, "-C", top, "merge", "--ff-only", "-q", b], top, MERGE_TIMEOUT_S, brain_env())
    if p.returncode != 0:
        low = (p.stderr + p.stdout).lower()
        if "would be overwritten" in low:
            raise ImportFail("有没跟踪的文件会被合进来的文件盖掉：先挪走再合并。\n%s" % last_lines(tail(p), 8), "merge_failed", 409)
        raise ImportFail("合并没成功：%s" % (last_lines(tail(p)) or "退出码 %d" % p.returncode), "merge_failed", 409)
    removed, kept = cleanup(top, rec)
    records.remove(top)
    text = "合进 %s 了（快进到 %s）：这个仓库现在就能用。" % (d, tip[:8])
    if origin is not None:
        text += "远端还没有它：要推送就点「推送」。"
    return {"ok": True, "text": text, "branch": d, "sha": tip, "removed": removed, "kept": kept,
            "remote_url": (origin or {}).get("url") or "", "output": tail(p, 4000)}


def pull(top: str, records: Records) -> dict[str, Any]:
    """「拉取」 (blocking: run it in a thread). Works without a record too (brain-kit merged by a teammate)."""
    g = Git(top)
    rec = records.get(top) or {}
    d = _default_of(g, rec)
    if not d:
        raise ImportFail("找不到默认分支：拉取不了", "no_default_branch", 409)
    ok, why = pull_check(g, d)
    if not ok:
        raise ImportFail(why, "cannot_pull", 409)
    origin = origin_of(g) or {}
    out: dict[str, Any] = {"ok": False, "text": "", "output": "", "removed": [], "kept": []}
    p = run_quiet([GIT_BIN, "-C", top, "pull", "--no-rebase", "--ff-only", "origin", d], top, PULL_TIMEOUT_S,
                  quiet_env(top))
    out["output"] = tail(p, 8000)
    if p.returncode != 0:
        low = (p.stderr + p.stdout).lower()
        if "not possible to fast-forward" in low or "diverg" in low:
            out["text"] = "本机的 %s 和 origin/%s 分开了：快进不了。在终端里处理（比如 git pull --rebase），再点「拉取」" % (d, d)
        else:
            out["text"] = git_failure(p, "拉取", origin.get("url") or "")[1]
        return out
    has = os.path.isfile(os.path.join(top, KIT))
    if has and rec:
        if rec.get("mode") != "inplace":
            out["removed"], out["kept"] = cleanup(top, rec)
        records.remove(top)
    out.update(ok=True, text="拉取了 origin/%s：%s" % (d, "brain-kit 到了，这个仓库现在就能用" if has else
                                                   "这个目录更新了，可还是没有 .brain/kit.json"))
    return out


def stale(top: str, rec: dict[str, Any], purpose: str = "install") -> bool:
    """Nothing waits for this record any more (see the module doc). Read only."""
    if not os.path.isdir(top):
        return True
    g = Git(top)
    if rec.get("mode") == "inplace":
        paths = [p for p in rec.get("paths") or [] if isinstance(p, str) and p and not p.startswith("/")]
        if not paths:
            return True
        left = g.run("status", "--porcelain=v1", "-z", "--untracked-files=all", "--", *paths)
        return left.returncode == 0 and not left.stdout.strip("\0")
    b = str(rec.get("branch") or "")
    if not b or not g.ok("rev-parse", "-q", "--verify", "refs/heads/" + b):
        return True
    d = _default_of(g, rec)
    wt = rec.get("worktree")
    wt_gone = not (wt and os.path.isdir(wt))
    if purpose == "upgrade":
        c = rec.get("commit")
        if c and d and g.ok("merge-base", "--is-ancestor", c, "refs/heads/" + d):
            return True
        return wt_gone and not c
    if d and os.path.isfile(os.path.join(top, KIT)) and has_at(g, "refs/heads/" + d, KIT):
        return True
    return wt_gone and not has_at(g, "refs/heads/" + b, KIT)


def sweep(records: Records, purpose: str = "install") -> list[str]:
    """Clear the records nothing waits for (the background check, every 30 s): the tops cleared."""
    cleared = []
    for top, rec in records.all().items():
        try:
            if stale(top, rec, purpose):
                records.remove(top)
                cleared.append(top)
        except Exception:  # noqa: BLE001 - one unreadable repo must not stop the others
            continue
    return cleared
