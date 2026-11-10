"""直接装 (the default) and the way forward for a branch install: in place on a clean checkout (usable at once), with the
person's unrelated changes (only the install's paths committed, theirs untouched byte for byte), refused when their
changes touch what brain install writes, on a detached HEAD or in the middle of a rebase or merge; the recommended
option per case; the kit update in place; 「合并到 <default>」 (a fast-forward, then the worktree and the branch go), refused
when the default branch moved or the checkout is dirty, confirmed first for a repo with a remote; 「拉取」 after the MR
(a bare repo as the remote); the stale records clearing themselves; no 「等合并」 for a repo without a remote.
Throwaway repos in temp dirs; no network."""

import json

import pytest

from appkit import BRAINKIT, commit_file, git_repo, mod, sh
from brainfix import make_project, make_service, needs_brainkit
from http_fakes import AppRoute, FakeWeb, call
from test_import import KIT, install, plain_repo, started
from test_upgrade import ADAPTER, HAS_VERSION_CHECK, lean_json_at, older_kit

pytestmark = needs_brainkit
importer = mod("importer")
inplace = mod("inplace")
AppError = mod("httpkit").AppError
LOCAL_KIT = dict(KIT, gitlab_base="", gitlab_project="")


def local_repo(tmp_path, name="pay"):
    """A project without brain-kit and without a remote (like a repo that lives on this machine only)."""
    repo = git_repo(tmp_path / name)
    sh("git", "-C", repo, "config", "user.name", "Alice Example")
    sh("git", "-C", repo, "config", "user.email", "alice@example.com")
    commit_file(repo, "README.md", "# %s\n" % name, "init")
    commit_file(repo, "src/pay.py", "x = 1\n", "code")
    return repo


def head(repo, ref="HEAD"):
    return sh("git", "-C", repo, "rev-parse", ref).stdout.strip()


def names_in(repo, ref="HEAD"):
    return set(sh("git", "-C", repo, "show", "--name-only", "--format=", ref).stdout.split())


def worktrees(repo):
    return [x[9:] for x in sh("git", "-C", repo, "worktree", "list", "--porcelain").stdout.splitlines()
            if x.startswith("worktree ")]


async def upgrade(svc, path, mode=None):
    body = {"path": str(path)}
    if mode:
        body["mode"] = mode
    job = (await svc.import_upgrade(body))["job"]
    return await svc.wait_job(job["id"])


async def install_mode(svc, path, mode=None, kit=None):
    body = {"path": str(path), "kit": dict(kit or LOCAL_KIT)}
    if mode:
        body["mode"] = mode
    job = (await svc.import_install(body))["job"]
    return await svc.wait_job(job["id"])


# ---- 直接装 -------------------------------------------------------------------------------------------------------- #

def test_in_place_on_a_clean_checkout_commits_on_its_branch_and_is_usable_at_once(tmp_path, home):
    repo = local_repo(tmp_path)
    before = head(repo)
    svc = make_service(tmp_path, [repo])

    async def go():
        got = await svc.import_inspect({"path": str(repo)})
        done = await install_mode(svc, repo)                  # no mode: the recommended one
        status = await svc.status()
        again = await svc.import_inspect({"path": str(repo)})
        return got, done, status, again

    got, done, status, again = started(svc, go)
    c = got["install"]
    assert c["recommend"] == "inplace" and [o["mode"] for o in c["options"]] == ["inplace"]   # nothing to choose
    assert c["options"][0] == {"mode": "inplace", "title": "直接装在 main", "ok": True, "why": "",
                               "line": "装在你现在的检出里，提交在 main 上，马上能开需求"}
    assert done["state"] == "done", done
    assert [s["id"] for s in done["steps"]] == [s for s, _ in inplace.INSTALL_STEPS]
    assert all(s["state"] in ("ok", "warn") for s in done["steps"]), done["steps"]
    r = done["result"]
    assert r["mode"] == "inplace" and r["branch"] == "main" and r["worktree"] is None and r["remote_url"] == ""
    assert r["commit"]["ok"] and "Alice Example <alice@example.com>" in r["commit"]["text"] and "在 main 上" in r["commit"]["text"]
    assert head(repo, "HEAD~1") == before and sh("git", "-C", repo, "symbolic-ref", "--short", "HEAD").stdout.strip() == "main"
    assert names_in(repo) == {f["path"] for f in r["files"]} and ".brain/kit.json" in names_in(repo)
    kit = json.loads(sh("git", "-C", repo, "show", "HEAD:.brain/kit.json").stdout)
    assert (kit["req_prefix"], kit["default_branch"], kit["team"]) == ("PAY", "main", "支付组")
    assert sh("git", "-C", repo, "status", "--porcelain").stdout == ""               # all of it committed
    assert sh("git", "-C", repo, "branch", "--list", "brain/*").stdout == "" and len(worktrees(repo)) == 1
    assert svc.imports.get(str(repo.resolve())) is None                              # nothing waits: no record
    assert status["repos"][0]["ok"] is True and status["repos"][0]["pending"] is None
    assert again["next"] == "listed" and again["kit"]["state"] == "checkout"


def test_in_place_with_unrelated_changes_commits_only_what_brain_install_wrote(tmp_path, home):
    repo = local_repo(tmp_path)
    (repo / "README.md").write_text("# pay, my edit\n")                   # modified, not staged
    (repo / "src" / "pay.py").write_text("x = 2  # staged\n")
    sh("git", "-C", repo, "add", "src/pay.py")                              # staged
    (repo / "notes.txt").write_bytes(b"mine\x00\xff\n")                     # untracked, binary
    (repo / "docs").mkdir()
    (repo / "docs" / "plan.md").write_text("# plan\n")                      # an untracked folder
    mine = {p: (repo / p).read_bytes() for p in ("README.md", "src/pay.py", "notes.txt", "docs/plan.md")}
    status_before = sh("git", "-C", repo, "status", "--porcelain").stdout
    svc = make_service(tmp_path, [])

    async def go():
        c = (await svc.import_inspect({"path": str(repo)}))["install"]
        done = await install_mode(svc, repo, "inplace")
        return c, done, await svc.import_choices({"path": str(repo), "purpose": "upgrade"})

    c, done, up = started(svc, go)
    assert svc.settings["repos"] == [done["result"]["path"]]   # listed once its commit went in, page open or not (SETUP-18)
    assert c["recommend"] == "inplace" and [o["mode"] for o in c["options"]] == ["inplace", "branch"]   # offered
    # said once: an install's line leaves it to 导入仓库's safety line next to it; the kit update's picker has none
    assert c["options"][0]["ok"] and "只提交安装写的文件" not in c["options"][0]["line"]
    assert "只提交安装写的文件，你自己没提交的改动不动" in up["options"][0]["line"]
    assert c["overlap"] == [] and set(c["dirty"]) == set(mine)
    assert done["state"] == "done" and done["result"]["commit"]["ok"], done
    committed = names_in(repo)
    assert committed and not committed & set(mine) and ".brain/kit.json" in committed
    assert committed == {f["path"] for f in done["result"]["files"]}
    assert {p: (repo / p).read_bytes() for p in mine} == mine                     # byte for byte
    assert sh("git", "-C", repo, "status", "--porcelain").stdout == status_before  # still theirs, still uncommitted
    assert sh("git", "-C", repo, "diff", "--cached", "--name-only").stdout.split() == ["src/pay.py"]   # still staged
    assert sh("git", "-C", repo, "show", "HEAD:src/pay.py").stdout == "x = 1\n"


def test_in_place_is_refused_when_changes_touch_what_it_writes_or_the_checkout_is_busy(tmp_path, home):
    overlap = local_repo(tmp_path, "overlap")
    commit_file(overlap, ".gitignore", "*.log\n", "ignore")
    (overlap / ".gitignore").write_text("*.log\n*.tmp\n")                  # theirs, where brain install writes
    detached = local_repo(tmp_path, "detached")
    sh("git", "-C", detached, "checkout", "-q", "--detach")
    rebasing = local_repo(tmp_path, "rebasing")
    sh("git", "-C", rebasing, "checkout", "-q", "-b", "side")
    commit_file(rebasing, "README.md", "side\n", "side")
    sh("git", "-C", rebasing, "checkout", "-q", "main")
    commit_file(rebasing, "README.md", "main\n", "main")
    assert sh("git", "-C", rebasing, "rebase", "side", check=False).returncode != 0      # stops on the conflict
    merging = local_repo(tmp_path, "merging")
    sh("git", "-C", merging, "checkout", "-q", "-b", "side")
    commit_file(merging, "README.md", "side\n", "side")
    sh("git", "-C", merging, "checkout", "-q", "main")
    commit_file(merging, "README.md", "main\n", "main")
    assert sh("git", "-C", merging, "merge", "side", check=False).returncode != 0
    repos = {"overlap": overlap, "detached": detached, "rebasing": rebasing, "merging": merging}
    states = {k: sh("git", "-C", r, "status", "--porcelain").stdout for k, r in repos.items()}
    svc = make_service(tmp_path, [])

    async def go():
        out = {}
        for k, r in repos.items():
            c = (await svc.import_inspect({"path": str(r)}))["install"]
            with pytest.raises(AppError) as e:
                await svc.import_install({"path": str(r), "kit": LOCAL_KIT, "mode": "inplace"})
            out[k] = (c, e.value)
        return out

    got = started(svc, go)
    for k, (c, err) in got.items():
        opt = c["options"][0]
        assert opt["ok"] is False and c["recommend"] == "branch" and c["options"][1]["mode"] == "branch", (k, c)
        assert err.code == "inplace_refused" and err.status == 409 and opt["why"] in str(err), k
        assert str(err).endswith("可以装到新分支")
    assert ".gitignore" in got["overlap"][0]["options"][0]["why"] and got["overlap"][0]["overlap"] == [".gitignore"]
    assert "不在任何分支上" in got["detached"][0]["options"][0]["why"]
    assert "正在变基的中间" in got["rebasing"][0]["options"][0]["why"] and "git rebase --abort" in got["rebasing"][0]["options"][0]["why"]
    assert "合并" in got["merging"][0]["options"][0]["why"]
    for k, r in repos.items():
        assert sh("git", "-C", r, "status", "--porcelain").stdout == states[k] and not (r / ".brain").exists(), k


def test_the_recommended_option_follows_the_remote_and_the_changes(tmp_path, home):
    alone = local_repo(tmp_path, "alone")
    dirty = local_repo(tmp_path, "dirty")
    (dirty / "notes.txt").write_text("x\n")
    team, _ = plain_repo(tmp_path, "team")                                   # a bare repo as its origin
    feature = local_repo(tmp_path, "feature")
    sh("git", "-C", feature, "checkout", "-q", "-b", "wip")
    svc = make_service(tmp_path, [])

    async def go():
        return {k: (await svc.import_choices({"path": str(r)})) for k, r in
                (("alone", alone), ("dirty", dirty), ("team", team), ("feature", feature))}

    got = started(svc, go)
    plan = {k: (c["recommend"], [(o["mode"], o["ok"]) for o in c["options"]]) for k, c in got.items()}
    # UI问题清单 #11: the recommended way is the one that lets the person open a requirement today, a team repo too
    assert plan == {"alone": ("inplace", [("inplace", True)]),
                    "dirty": ("inplace", [("inplace", True), ("branch", True)]),
                    "team": ("inplace", [("inplace", True), ("branch", True)]),
                    "feature": ("inplace", [("inplace", True)])}
    t = got["team"]
    assert "推送到远端以后就能开需求" in t["options"][0]["line"] and "直接改团队的 main，没有 MR 评审" in t["options"][0]["line"]
    assert t["options"][1]["title"] == "装到新分支，开 MR 给团队看"
    assert t["options"][1]["line"].startswith("从远端的 main 建新分支") and "MR 合进 main 以后才能开需求" in t["options"][1]["line"]
    assert "马上能开需求" in got["alone"]["options"][0]["line"]
    assert got["dirty"]["options"][1]["title"] == "装到新分支" and "「合并到 main」" in got["dirty"]["options"][1]["line"]
    assert got["feature"]["options"][0]["title"] == "直接装在 wip" and "wip 不是默认分支 main" in got["feature"]["options"][0]["line"]


def test_a_team_repo_installed_in_place_pushes_only_when_asked(tmp_path, home):
    repo, bare = plain_repo(tmp_path)
    svc = make_service(tmp_path, [])
    routes = mod("handlers").build_routes(svc, AppRoute, web=FakeWeb(), is_owner=lambda _r: True)

    async def go():
        done = await install_mode(svc, repo, "inplace", KIT)
        r = done["result"]
        unconfirmed = await call(routes, "POST", "/import/push", json_body={"path": str(repo), "branch": "main",
                                                                           "remote_url": r["remote_url"]})
        with pytest.raises(AppError) as stale:
            await svc.import_push({"path": str(repo), "branch": "other", "remote_url": r["remote_url"]})
        before_push = head(bare, "main")
        pushed = await svc.import_push({"path": str(repo), "branch": "main", "remote_url": r["remote_url"]})
        return done, unconfirmed, stale.value, before_push, pushed

    done, unconfirmed, stale, before_push, pushed = started(svc, go)
    r = done["result"]
    assert r["mode"] == "inplace" and r["commit"]["ok"] and r["remote_url"] == str(bare.resolve())
    assert before_push == head(repo, "HEAD~1")                       # the install did not push by itself
    assert (unconfirmed.status, unconfirmed.body["code"]) == (400, "not_confirmed") and stale.code == "stale_confirm"
    assert pushed["ok"] and pushed["pushed"] and pushed["text"] == "推上去了：main → 远端"
    assert head(bare, "main") == head(repo)


def test_the_kit_update_in_place_refreshes_the_kit_files_on_the_current_branch(tmp_path, home):
    repo = older_kit(tmp_path, origin=False, adapter=HAS_VERSION_CHECK)
    kit_before = (repo / ".brain" / "kit.json").read_bytes()
    before = head(repo)
    svc = make_service(tmp_path, [repo])

    async def go():
        c = await svc.import_choices({"path": str(repo), "purpose": "upgrade"})
        first = await upgrade(svc, repo)                        # no mode: no remote, so in place
        first["head"] = head(repo)
        second = await upgrade(svc, repo)
        return c, first, second

    c, first, second = started(svc, go)
    assert c["recommend"] == "inplace" and c["options"][0]["title"] == "直接更新在 main" and len(c["options"]) == 1
    assert first["state"] == "done", first
    assert [s["id"] for s in first["steps"]] == [s for s, _ in inplace.UPGRADE_STEPS]
    r = first["result"]
    assert r["mode"] == "inplace" and r["changed"] is True and r["commit"]["ok"] and r["worktree"] is None
    assert r["text"] == "提交在 main 上了，现在就生效"
    assert head(repo, "HEAD~1") == before and "aidlc-docs/lean.json" in names_in(repo)
    assert (ADAPTER in names_in(repo)) == HAS_VERSION_CHECK and ".brain/kit.json" not in names_in(repo)
    assert (repo / ".brain" / "kit.json").read_bytes() == kit_before
    assert "runs/**" in lean_json_at(repo, "HEAD")["fingerprint_exclude"]
    log = sh("git", "-C", repo, "log", "-1", "--format=%an <%ae>|%s").stdout.strip()
    assert log == "Alice Example <alice@example.com>|Update brain-kit's kit files (brain install)"
    assert sh("git", "-C", repo, "branch", "--list", "brain/*").stdout == "" and len(worktrees(repo)) == 1
    s = second["result"]
    assert second["state"] == "done" and s["changed"] is False and s["text"] == "已经是最新的：没有要提交的改动"
    assert head(repo) == first["head"] and sh("git", "-C", repo, "status", "--porcelain").stdout == ""   # no commit
    assert svc.upgrades.get(str(repo.resolve())) is None
    if HAS_VERSION_CHECK:
        assert sh("git", "-C", repo, "show", "HEAD:" + ADAPTER).stdout == \
            (BRAINKIT / "kit" / ".kiro" / "brain" / "lean-hook.py").read_text(encoding="utf-8")


def test_a_hook_that_says_no_to_an_in_place_commit_keeps_only_the_install_paths_for_another_try(tmp_path, home,
                                                                                               monkeypatch):
    import appkit
    repo = local_repo(tmp_path)
    (repo / "notes.txt").write_text("mine\n")
    for k in appkit.NO_HOOKS_KEYS:
        monkeypatch.delenv(k, raising=False)
    hooks = tmp_path / "hooks"
    hooks.mkdir()
    pre = hooks / "pre-commit"
    pre.write_text("#!/bin/sh\necho '密钥扫描：先别提交' >&2\nexit 1\n")
    pre.chmod(0o755)
    sh("git", "-C", repo, "config", "core.hooksPath", str(hooks))
    svc = make_service(tmp_path, [repo])

    async def go():
        done = await install_mode(svc, repo, "inplace")
        status = await svc.status()
        pre.write_text("#!/bin/sh\nexit 0\n")
        again = await svc.import_commit({"path": str(repo)})
        return done, status, again

    done, status, again = started(svc, go)
    c = done["result"]["commit"]
    assert not c["ok"] and c["blocked"] and "密钥扫描：先别提交" in c["text"] and "再提交一次" in c["text"]
    assert status["repos"][0]["ok"] is True          # kit.json is in the checkout: usable already, nothing pending
    assert again["ok"] and "notes.txt" not in names_in(repo) and ".brain/kit.json" in names_in(repo)
    assert sh("git", "-C", repo, "status", "--porcelain").stdout == "?? notes.txt\n"
    assert svc.imports.get(str(repo.resolve())) is None


# ---- a branch install's way forward ----------------------------------------------------------------------------------- #

def test_merge_fast_forwards_a_local_branch_install_and_cleans_up(tmp_path, home):
    repo = local_repo(tmp_path)
    svc = make_service(tmp_path, [repo])

    async def go():
        done = await install_mode(svc, repo, "branch")
        status = await svc.status()
        merged = await svc.import_merge({"path": str(repo)})
        after = await svc.status()
        return done, status, merged, after

    done, status, merged, after = started(svc, go)
    tip = done["result"]["commit"]["sha"]
    p = status["repos"][0]["pending"]
    assert p["state"] == "branch" and p["word"] == "还没合进 main" and p["merge"] == {"ok": True, "why": "", "confirm": False}
    assert p["text"] == "装在本机分支 brain/install 上，还没合进 main" and "「合并到 main」" in p["next"]
    assert "等合并" not in json.dumps(status, ensure_ascii=False)               # no remote: nothing to wait for
    assert merged["ok"] and merged["sha"] == tip and head(repo) == tip and merged["text"].startswith("合进 main 了")
    assert merged["removed"] == ["工作目录 %s" % done["result"]["worktree"], "分支 brain/install"] and merged["kept"] == []
    assert len(worktrees(repo)) == 1 and sh("git", "-C", repo, "branch", "--list", "brain/*").stdout == ""
    assert svc.imports.get(str(repo.resolve())) is None
    assert after["repos"][0]["ok"] is True and after["repos"][0]["pending"] is None


def test_an_install_branch_main_moved_past_is_replaced_by_an_install_in_place(tmp_path, home):
    """SETUP-6: 「合并到 main」 cannot fast-forward any more: 检查 offers 直接装在 main (that way only); once it is
    committed there, the install branch that was never pushed and its worktree go."""
    repo = local_repo(tmp_path)
    svc = make_service(tmp_path, [])

    async def go():
        first = await install_mode(svc, repo, "branch")
        commit_file(repo, "src/more.py", "y = 1\n", "more work on main")
        stuck = await svc.import_inspect({"path": str(repo)})
        again = await install_mode(svc, repo, "inplace")
        after = await svc.import_inspect({"path": str(repo)})
        return first, stuck, again, after

    first, stuck, again, after = started(svc, go)
    wt = first["result"]["worktree"]
    assert stuck["next"] == "listed" and stuck["pending"]["merge"]["ok"] is False   # listed by the install itself
    assert [o["mode"] for o in stuck["install"]["options"]] == ["inplace"] and stuck["install"]["recommend"] == "inplace"
    assert again["state"] == "done" and again["result"]["commit"]["ok"]
    assert "删掉了没推送的那次安装" in again["result"]["commit"]["text"] and "分支 brain/install" in again["result"]["commit"]["text"]
    assert sh("git", "-C", repo, "branch", "--list", "brain/*").stdout == "" and len(worktrees(repo)) == 1
    assert not (tmp_path / wt).exists() and has_kit_on(repo, "main")
    assert after["kit"]["state"] == "checkout" and after["install"] is None


def has_kit_on(repo, ref):
    return sh("git", "-C", repo, "cat-file", "-e", "%s:.brain/kit.json" % ref, check=False).returncode == 0


def test_merge_is_refused_when_main_moved_or_the_checkout_is_dirty(tmp_path, home):
    moved = local_repo(tmp_path, "moved")
    dirty = local_repo(tmp_path, "dirty")
    svc = make_service(tmp_path, [moved, dirty])

    async def go():
        for r in (moved, dirty):
            await install_mode(svc, r, "branch")
        commit_file(moved, "src/more.py", "y = 1\n", "more work on main")
        (dirty / "README.md").write_text("# dirty, my edit\n")
        status = await svc.save_settings({})
        out = {}
        for k, r in (("moved", moved), ("dirty", dirty)):
            with pytest.raises(AppError) as e:
                await svc.import_merge({"path": str(r)})
            out[k] = e.value
        return status["status"], out

    status, out = started(svc, go)
    m, d = status["repos"][0]["pending"], status["repos"][1]["pending"]
    assert m["merge"]["ok"] is False and "又有了新提交" in m["merge"]["why"] and m["next"] == m["merge"]["why"]
    assert "改成直接装在 main 上" in m["merge"]["why"]
    assert d["merge"]["ok"] is False and "没提交的改动（README.md）" in d["merge"]["why"]
    assert out["moved"].code == "cannot_merge" and str(out["moved"]) == m["merge"]["why"]
    assert out["dirty"].code == "cannot_merge" and "git stash" in str(out["dirty"])
    for r in (moved, dirty):
        assert sh("git", "-C", r, "rev-parse", "-q", "--verify", "refs/heads/brain/install", check=False).returncode == 0


def test_a_repo_with_a_remote_merges_locally_only_after_a_confirm(tmp_path, home):
    repo, bare = plain_repo(tmp_path)
    svc = make_service(tmp_path, [repo])

    async def go():
        await install(svc, repo)                        # a remote: the recommended route is the new branch
        status = await svc.status()
        with pytest.raises(AppError) as e:
            await svc.import_merge({"path": str(repo)})
        merged = await svc.import_merge({"path": str(repo), "confirm": True})
        return status, e.value, merged

    status, unconfirmed, merged = started(svc, go)
    p = status["repos"][0]["pending"]
    assert p["merge"] == {"ok": True, "why": "", "confirm": True} and p["word"] == "还没推送"
    assert unconfirmed.code == "needs_confirm" and "远端还没有它" in str(unconfirmed)
    assert merged["ok"] and "远端还没有它" in merged["text"] and "「推送」" in merged["text"]
    assert merged["remote_url"] == str(bare.resolve()) and head(bare, "main") != head(repo)


def test_pull_after_the_mr_was_merged_and_the_install_branch_goes(tmp_path, home):
    repo, bare = plain_repo(tmp_path)
    svc = make_service(tmp_path, [repo])

    async def go():
        done = await install(svc, repo)
        p = (await svc.import_inspect({"path": str(repo)}))["pending"]
        await svc.import_publish({"path": str(repo), "branch": p["branch"], "target": p["target"],
                                  "remote_url": p["remote_url"]})            # no token: pushed, the MR is the person's
        other = tmp_path / "teammate"
        sh("git", "clone", "-q", bare, other)                                 # the MR merged on the remote
        sh("git", "-C", other, "merge", "-q", "--ff-only", "origin/brain/install")
        sh("git", "-C", other, "push", "-q", "origin", "main")
        sh("git", "-C", repo, "fetch", "-q", "origin")
        (repo / "README.md").write_text("# pay, my edit\n")
        dirty = (await svc.save_settings({}))["status"]["repos"][0]["pending"]
        with pytest.raises(AppError) as e:
            await svc.import_pull({"path": str(repo)})
        sh("git", "-C", repo, "checkout", "-q", "--", "README.md")
        ready = (await svc.save_settings({}))["status"]["repos"][0]["pending"]
        pulled = await svc.import_pull({"path": str(repo)})
        after = await svc.status()
        return done, dirty, e.value, ready, pulled, after

    done, dirty, refused, ready, pulled, after = started(svc, go)
    assert dirty["state"] == "merged" and dirty["pull"]["ok"] is False and "没提交的改动" in dirty["pull"]["why"]
    assert refused.code == "cannot_pull"
    assert ready["pull"] == {"ok": True, "why": ""} and ready["word"] == "要拉取" and "「拉取」" in ready["next"]
    assert pulled["ok"] and pulled["text"] == "拉取了远端的 main：brain-kit 到了，这个仓库现在就能用"
    assert (repo / ".brain" / "kit.json").is_file() and head(repo) == head(bare, "main")
    assert pulled["removed"] == ["工作目录 %s" % done["result"]["worktree"], "分支 brain/install"]
    assert after["repos"][0]["ok"] is True and svc.imports.get(str(repo.resolve())) is None


def test_stale_records_clear_themselves_on_the_next_background_check(tmp_path, home):
    by_hand = local_repo(tmp_path, "oms")                   # what was done by hand to oms-brain
    gone = local_repo(tmp_path, "gone")
    svc = make_service(tmp_path, [by_hand, gone])

    async def go():
        a = await install_mode(svc, by_hand, "branch")
        b = await install_mode(svc, gone, "branch")
        sh("git", "-C", by_hand, "merge", "-q", "--ff-only", "brain/install")
        sh("git", "-C", by_hand, "worktree", "remove", a["result"]["worktree"])
        sh("git", "-C", by_hand, "branch", "-d", "brain/install")
        sh("git", "-C", gone, "worktree", "remove", "--force", b["result"]["worktree"])
        sh("git", "-C", gone, "branch", "-D", "brain/install")
        kept = dict(svc.imports.all())
        cleared = svc._sweep()
        changed = svc._pending_changed()
        await svc.save_settings({})
        return kept, cleared, changed, await svc.status()

    kept, cleared, changed, status = started(svc, go)
    tops = {str(by_hand.resolve()), str(gone.resolve())}
    assert set(kept) == tops and set(cleared) == tops and svc.imports.all() == {}
    assert changed is True
    r1, r2 = status["repos"]
    assert r1["ok"] is True and r1["pending"] is None                         # merged by hand: usable
    assert r2["ok"] is False and r2["pending"] is None and "还没装 brain-kit" in r2["error"]   # gone: said plainly
    assert "等合并" not in json.dumps(status, ensure_ascii=False)


def test_the_new_routes_refuse_bad_bodies(tmp_path, home):
    repo = local_repo(tmp_path)
    svc = make_service(tmp_path, [])
    routes = mod("handlers").build_routes(svc, AppRoute, web=FakeWeb(), is_owner=lambda _r: True)

    async def go():
        return {"choices": await call(routes, "POST", "/import/choices", json_body={"path": "rel"}),
                "purpose": await call(routes, "POST", "/import/choices", json_body={"path": str(repo), "purpose": "x"}),
                "mode": await call(routes, "POST", "/import/install", json_body={"path": str(repo), "kit": LOCAL_KIT,
                                                                                "mode": "sideways"}),
                "merge": await call(routes, "POST", "/import/merge", json_body={"path": str(repo)}),
                "pull": await call(routes, "POST", "/import/pull", json_body={"path": str(repo)})}

    got = started(svc, go)
    assert {k: (v.status, v.body["code"]) for k, v in got.items()} == {
        "choices": (400, "invalid_path"), "purpose": (400, "invalid_purpose"), "mode": (400, "invalid_mode"),
        "merge": (409, "no_install"), "pull": (409, "cannot_pull")}
    assert "没有远端" in got["pull"].body["error"]


def test_a_branch_kit_update_merges_locally_too(tmp_path, home):
    repo = older_kit(tmp_path, origin=False)
    svc = make_service(tmp_path, [repo])

    async def go():
        done = await upgrade(svc, repo, "branch")
        merged = await svc.import_merge({"path": str(repo), "purpose": "upgrade"})
        return done, merged

    done, merged = started(svc, go)
    r = done["result"]
    assert r["mode"] == "branch" and r["commit"]["ok"] and "「合并到 main」" in r["text"]
    assert merged["ok"] and head(repo) == r["commit"]["sha"] and "runs/**" in lean_json_at(repo, "HEAD")["fingerprint_exclude"]
    assert sh("git", "-C", repo, "branch", "--list", "brain/*").stdout == "" and len(worktrees(repo)) == 1
    assert svc.upgrades.get(str(repo.resolve())) is None and svc.imports.get(str(repo.resolve())) is None
