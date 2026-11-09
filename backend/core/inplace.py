"""直接装: brain-kit into the person's checkout, on the branch it is on, committed there, the way brain-kit's own CLI is
used (``brain install`` in the working tree, then the person commits). The repo is usable at once: nothing waits.

  install  where it goes is importer.choices' "inplace" option: refused when the checkout is on no branch, in the middle
           of a merge or rebase, or has uncommitted changes that touch what brain install writes. Then ``brain install``
           in the checkout, the form's kit.json values, ``brain doctor --offline``, and a commit of exactly the paths the
           install wrote: git status before and after, within what brain install writes (importer.write_targets). The
           person's own uncommitted changes are neither committed nor touched (``git commit --only`` of those paths:
           what they staged stays staged). A failure before the commit takes back what the install wrote (paths that
           were clean before only). The commit is the person's: their identity, their hooks; a hook that says no keeps
           the paths in the install record for 「再提交一次」, which commits the same paths again.
  upgrade  the same for a repo that has brain-kit (the 'kit' fix of a check row): kit.json is kept, the kit files are
           refreshed; when nothing but Lean's INIT audit file changed, that file is taken back and nothing is committed.
  push     never on its own: ``git push origin <branch>`` of the checkout's branch, no force, no prompt, after the person
           confirmed the branch and the remote on the page.
"""

from __future__ import annotations

import os
import time
from typing import Any, Callable

from . import bk
from .constants import GIT_BIN
from .importer import (GIT_TIMEOUT_S, KIT, ImportFail, Records, choices, default_branch, git_failure, last_lines,
                       origin_of, quiet_env, run_quiet, status_map, symlinks_on_targets, tail, touches, write_targets)
from .installer import (COMMIT_TIMEOUT_S, DOCTOR_TIMEOUT_S, INSTALL_TIMEOUT_S, LEAN_AUDIT, MAX_FILES, PUSH_TIMEOUT_S,
                        UP_TO_DATE, _kit_of, brain_env, commit_failure, commit_message, doctor_rows, kit_data, kit_form,
                        kit_line)
from .intake import brain_cmd
from .repo import Git

INSTALL_STEPS = (("check", "看能不能直接装"), ("install", "跑 brain install"), ("kit", "写 kit.json"),
                 ("doctor", "跑 brain doctor"), ("commit", "提交"))
UPGRADE_STEPS = (("check", "看能不能直接装"), ("install", "跑 brain install（更新 kit 文件）"), ("doctor", "跑 brain doctor"),
                 ("commit", "提交"))
MAX_WATCH = 2000      # the person's uncommitted files watched for a change during the install (size, mtime)


def _stat(top: str, rel: str) -> tuple | None:
    try:
        st = os.lstat(os.path.join(top, rel))
        return st.st_size, st.st_mtime_ns, st.st_mode
    except OSError:
        return None


def _links_in_tree(top: str, targets: list[str]) -> list[str]:
    """A symlink in the working tree on the way to something brain install writes (committed or not)."""
    out = []
    for t in targets:
        cur = top
        for part in t.split("/"):
            cur = os.path.join(cur, part)
            if os.path.islink(cur):
                out.append(os.path.relpath(cur, top))
                break
            if not os.path.exists(cur):
                break
    return sorted(set(out))


def _safe_rel(p: Any) -> bool:
    return isinstance(p, str) and bool(p) and not p.startswith("/") and "\0" not in p and ".." not in p.split("/")


def take_back(top: str, before: dict[str, str], targets: list[str]) -> bool:
    """Undo what an install wrote in the checkout: paths within *targets* whose state differs from *before* (they were
    clean then, so nothing of the person's is lost). Tracked ones come back from HEAD, new files are removed, and the
    folders that only held them. True when there was something to undo."""
    g = Git(top)
    after = status_map(g) or {}
    changed = sorted(p for p, ch in after.items() if before.get(p) != ch and touches(p, targets) and _safe_rel(p))
    if not changed:
        return False
    in_head = [p for p in changed if g.ok("cat-file", "-e", "HEAD:%s" % p)]
    if in_head:
        run_quiet([GIT_BIN, "-C", top, "checkout", "-q", "HEAD", "--", *in_head], top, GIT_TIMEOUT_S * 2, brain_env())
    for p in changed:
        if p in in_head:
            continue
        full = os.path.join(top, p)
        if os.path.islink(full) or os.path.isfile(full):
            try:
                os.remove(full)
            except OSError:
                continue
        d = os.path.dirname(full)
        while d.startswith(top + os.sep) and touches(os.path.relpath(d, top), targets):
            try:
                os.rmdir(d)          # only an empty one
            except OSError:
                break
            d = os.path.dirname(d)
    return True


def install(top: str, kit: dict[str, str] | None, records: Records, step: Callable[..., None], *,
            purpose: str = "install", token: bool = False) -> dict[str, Any]:
    """brain install in the checkout, committed on its branch (blocking: run it in a thread). *kit*: the form's values
    (purpose "install"); None for an upgrade (kit.json is kept). *records*: imports.json, or upgrades.json for an
    upgrade; the record lives only until the commit went through."""
    upgrade = purpose == "upgrade"
    g = Git(top)
    origin = origin_of(g)
    head = g.out("rev-parse", "-q", "--verify", "HEAD^{commit}") or None
    cur = g.out("symbolic-ref", "-q", "--short", "HEAD")
    res: dict[str, Any] = {"mode": "inplace", "path": top, "branch": cur, "base": cur or None, "base_sha": head,
                           "worktree": None, "output": "", "kit": kit or kit_form({}),
                           "doctor": {"ran": False, "rows": [], "output": ""}, "files": [],
                           "commit": {"ok": False, "sha": None, "blocked": False, "text": "", "output": ""},
                           "remote_url": (origin or {}).get("url") or "", "target": ""}
    if upgrade:
        res.update(changed=False, gitlab_project="", can_open_mr=False, text="")
    step("check", "running")
    if not bk.ok():
        raise ImportFail("brain-kit 没装载：先在设置里写对它的位置", "no_brainkit", 409, res)
    cfg = None
    if upgrade:
        cfg = _kit_of(top)
        if cfg is None:
            raise ImportFail("这个检出里没有能读的 .brain/kit.json：先装上 brain-kit", "not_installed", 409, res)
        kit = kit_form(cfg)
        kit["default_branch"] = kit["default_branch"] or (default_branch(g)[0] or "")
        res["kit"] = kit
    elif os.path.lexists(os.path.join(top, KIT)):
        raise ImportFail("这个仓库已经装了 brain-kit：直接「加入列表」", "installed", 409, res)
    if head is None:
        raise ImportFail("仓库还没有任何提交：先提交一次", "no_commit", 409, res)
    c = choices(top, purpose=purpose, cfg=cfg)
    res["target"] = c["target"]
    opt = c["options"][0]
    if not opt["ok"]:
        step("check", "fail", opt["why"])
        raise ImportFail("不能直接装：%s。可以装到新分支" % opt["why"], "inplace_refused", 409, res)
    targets = write_targets(cfg)
    links = sorted(set(_links_in_tree(top, targets) + symlinks_on_targets(g, head)))
    if links:
        text = "仓库里 %s 是符号链接：brain install 会顺着它写到别处，这里不装。先把它换成普通的目录或文件" % "、".join(links)
        step("check", "fail", text)
        raise ImportFail(text, "symlink", 409, res)
    before = status_map(g)
    if before is None:
        raise ImportFail("看不出有没有没提交的改动（git status 没结束）：不直接装", "status_timeout", 409, res)
    mine = {p: _stat(top, p) for p in sorted(before)[:MAX_WATCH]}
    step("check", "ok", "在 %s 上%s" % (cur, "，检出是干净的" if not before else "；你没提交的 %d 个改动不碰" % len(before)))

    step("install", "running")
    args = ["install", top] if upgrade else ["install", top, "--prefix", kit["req_prefix"]] + (
        ["--team", kit["team"]] if kit["team"] else [])
    p = run_quiet(brain_cmd() + args, top, INSTALL_TIMEOUT_S, brain_env())
    res["output"] = tail(p)
    if p.returncode != 0 or not os.path.isfile(os.path.join(top, KIT)) or (upgrade and _kit_of(top) is None):
        undone = take_back(top, before, targets)
        text = "brain install 没成功（退出码 %d）%s：\n%s" % (p.returncode, "，它写了一半的文件已经还原" if undone else "",
                                                       last_lines(res["output"], 12))
        step("install", "fail", text)
        raise ImportFail(text, "install_failed", 500, res)
    step("install", "ok", "brain-kit %s" % (bk.info().get("version") or ""))

    if not upgrade:
        step("kit", "running")
        try:
            path = os.path.join(top, KIT)
            if os.path.islink(path) or os.path.islink(os.path.dirname(path)):
                raise ImportFail("%s 是符号链接：不写" % KIT, "symlink")
            C = bk.m("common")
            data = kit_data(C.load_json(path), kit)
            cm = bk.m("config")
            probs = cm.validate(cm.merged(cm.DEFAULTS, data))
            if probs:
                raise ImportFail("brain-kit 不接受这些值：%s" % "；".join(str(x) for x in probs), "invalid_kit")
            C.write_json(path, data)
        except (ImportFail, OSError, ValueError) as exc:
            take_back(top, before, targets)
            text = str(exc) if isinstance(exc, ImportFail) else "写不了 kit.json：%s" % str(exc)[:200]
            step("kit", "fail", text)
            raise ImportFail(text + "（装的文件已经还原）", getattr(exc, "code", "kit_failed"), 400, res)
        step("kit", "ok", kit_line(kit))

    step("doctor", "running")
    p = run_quiet(brain_cmd() + ["doctor", "--offline"], top, DOCTOR_TIMEOUT_S, brain_env())
    rows = doctor_rows(p.stdout)
    res["doctor"] = {"ran": True, "rows": rows, "output": tail(p, 8000)}
    fails = sum(1 for r in rows if r["level"] == "FAIL")
    warns = sum(1 for r in rows if r["level"] == "WARN")
    if not rows:
        step("doctor", "warn", "brain doctor 没给出结果（退出码 %d）" % p.returncode)
    else:
        step("doctor", "warn" if fails else "ok", "%d 项通过，%d 项注意，%d 项没过" % (len(rows) - fails - warns, warns, fails))

    after = status_map(g) or {}
    written = sorted(x for x, ch in after.items() if before.get(x) != ch and touches(x, targets) and _safe_rel(x))
    res["files"] = [{"change": after[x], "path": x} for x in written][:MAX_FILES]
    moved = [x for x, st in mine.items() if _stat(top, x) != st]      # the person's own: must be as they were
    if upgrade and not [x for x in written if not x.startswith(LEAN_AUDIT)]:
        take_back(top, before, targets)          # Lean's INIT audit file of this run: nothing else changed
        res.update(files=[], text=UP_TO_DATE)
        res["commit"]["text"] = UP_TO_DATE
        step("commit", "ok", UP_TO_DATE)
        return res
    if upgrade:
        base = kit.get("gitlab_base") or (origin or {}).get("base") or ""
        res.update(changed=True, gitlab_project=kit.get("gitlab_project") or (origin or {}).get("project") or "")
        res["can_open_mr"] = bool(token and origin and base and res["gitlab_project"])
    records.put(top, {"mode": "inplace", "purpose": purpose, "branch": cur, "base_sha": head, "paths": written,
                      "kit": kit, "files": res["files"], "doctor": {"ok": len(rows) - fails - warns, "warn": warns,
                                                                   "fail": fails},
                      "at": time.time(), "pushed": False, "commit": None, "brainkit": bk.info().get("version")})
    res["commit"] = commit(top, records, step, purpose=purpose)
    if moved:
        res["commit"]["text"] += "\n另外：你没提交的 %s 在安装时变了，没提交它，看一下。" % "、".join(moved[:5])
    if upgrade:
        res["text"] = done_text(res)
    return res


def done_text(res: dict[str, Any]) -> str:
    c = res.get("commit") or {}
    if not c.get("ok"):
        return c.get("text") or "还没提交"
    if res.get("remote_url"):
        return "提交在 %s 上了，现在就生效。远端还没有它：要推送就点「推送」" % res.get("branch")
    return "提交在 %s 上了，现在就生效" % res.get("branch")


def _present(g: Git, top: str, paths: list[str]) -> list[str]:
    """The paths git add can take: on disk, or known to git (a deleted file)."""
    p = g.run("ls-files", "-z", "--", *paths, timeout=GIT_TIMEOUT_S)
    known = set(x for x in p.stdout.split("\0") if x) if p.returncode == 0 else set()
    return [x for x in paths if x in known or os.path.lexists(os.path.join(top, x))]


def commit(top: str, records: Records, step: Callable[..., None] | None = None, *,
           purpose: str = "install") -> dict[str, Any]:
    """Commit the paths an in-place install wrote, on the checkout's branch, with the person's identity and hooks;
    ``git commit --only`` of exactly those paths, so what the person staged themselves stays staged and uncommitted.
    The same again after a hook said no. The record goes once the commit went through."""
    step = step or (lambda *a, **k: None)
    out = {"ok": False, "sha": None, "blocked": False, "text": "", "output": ""}
    rec = records.get(top)
    if not rec or rec.get("mode") != "inplace" or not rec.get("paths"):
        raise ImportFail("没有要提交的直接安装：重新检查一下", "no_install", 409)
    g = Git(top)
    targets = write_targets(_kit_of(top))
    paths = [x for x in rec["paths"] if _safe_rel(x) and touches(x, targets)]
    cur = g.out("symbolic-ref", "-q", "--short", "HEAD")
    if cur != rec.get("branch"):
        raise ImportFail("检出现在在 %s 上，不在装的时候的 %s：不提交" % (cur or "一个提交上", rec.get("branch")), "wrong_branch", 409)
    step("commit", "running")
    left = g.run("status", "--porcelain=v1", "-z", "--untracked-files=all", "--", *paths, timeout=GIT_TIMEOUT_S)
    if left.returncode == 0 and not left.stdout.strip("\0") and g.ok("cat-file", "-e", "HEAD:%s" % KIT):
        sha = g.out("rev-parse", "-q", "--verify", "HEAD^{commit}")
        out.update(ok=True, sha=sha, text="已经提交过了：%s" % sha[:8])
        records.remove(top)
        step("commit", "ok", out["text"])
        return out
    paths = _present(g, top, paths)
    p = run_quiet([GIT_BIN, "-C", top, "add", "-A", "--", *paths], top, GIT_TIMEOUT_S * 2, brain_env())
    if p.returncode != 0:
        out.update(text="git add 没成功：%s" % last_lines(tail(p)), output=tail(p))
        step("commit", "fail", out["text"])
        return out
    subject, body = commit_message(rec.get("kit") or {}, purpose, rec.get("brainkit"), inplace=True)
    p = run_quiet([GIT_BIN, "-C", top, "commit", "-q", "--only", "-m", subject, "-m", body, "--", *paths], top,
                  COMMIT_TIMEOUT_S, brain_env())
    out["output"] = tail(p)
    if p.returncode == 0:
        sha = g.out("rev-parse", "-q", "--verify", "HEAD^{commit}")
        who = g.out("log", "-1", "--format=%an <%ae>", "HEAD")
        out.update(ok=True, sha=sha, text="提交了 %s（作者 %s），在 %s 上" % (sha[:8], who, cur))
        records.remove(top)
        step("commit", "ok", out["text"])
        return out
    out["blocked"], out["text"] = commit_failure(p, "这个检出（%s）" % top, purpose)
    step("commit", "fail", out["text"])
    return out


def push(top: str, confirm: dict[str, Any]) -> dict[str, Any]:
    """``git push origin <branch>`` of the checkout's branch (no force, no prompt, a time limit), only with the branch and
    the remote the person confirmed on the page (blocking: run it in a thread)."""
    g = Git(top)
    origin = origin_of(g)
    if origin is None:
        raise ImportFail("这个仓库没有 origin：推不了", "no_origin", 409)
    cur = g.out("symbolic-ref", "-q", "--short", "HEAD")
    if not cur:
        raise ImportFail("检出不在任何分支上：推不了", "detached", 409)
    if (confirm.get("branch"), confirm.get("remote_url")) != (cur, origin["url"]):
        raise ImportFail("页面上的信息过期了：重新检查一下，再确认", "stale_confirm", 409)
    out = {"ok": False, "pushed": False, "branch": cur, "remote_url": origin["url"], "text": "", "output": ""}
    p = run_quiet([GIT_BIN, "-C", top, "push", "origin", "refs/heads/%s:refs/heads/%s" % (cur, cur)], top, PUSH_TIMEOUT_S,
                  quiet_env(top))
    out["output"] = tail(p, 8000)
    if p.returncode != 0:
        kind, text = git_failure(p, "推送", origin["url"])
        if kind in ("hook", "rejected") and cur == (default_branch(g)[0] or ""):
            text += "\n%s 在远端多半受保护：改用「装到新分支，开 MR 给团队看」。" % cur
        out["text"] = text
        return out
    out.update(ok=True, pushed=True, text="推上去了：%s → origin" % cur)
    return out
