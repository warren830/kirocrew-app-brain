"""The 'kit' fix (POST /import/upgrade): brain install again on a new branch in its own worktree, for a repo that has
brain-kit and an older kit (Lean counting runs/** as code; d46765f: an older hook adapter). The person's checkout is
never touched, the commit is theirs, nothing to change takes everything back, the upgrade records stay apart from the
install ones, and publish with purpose "upgrade" opens the MR on the fake GitLab. Severity: what matters only to the
team runner is a reminder (WARN) for a local-only repo and FAIL for one handed to the runner (kit.json bridge_user, or
a requirement with a hand-over). Throwaway repos in temp dirs, a bare repo as origin; no network."""

import json

import pytest

from appkit import BRAINKIT, mod, sh
from brainfix import install_brain_dev, make_project, make_service, needs_brainkit, run
from http_fakes import AppRoute, FakeWeb, call
from test_import import FakeGitLab, checkout_state, fake_token, plain_repo

pytestmark = needs_brainkit
installer = mod("installer")
service = mod("service")
AppError = mod("httpkit").AppError
ADAPTER = ".kiro/brain/lean-hook.py"
GITLAB = {"base": "https://gitlab.example.com", "project": "grp/pay"}
HAS_VERSION_CHECK = "def crew_hook_problem" in (BRAINKIT / "brainkit" / "cli.py").read_text(encoding="utf-8") \
    if (BRAINKIT / "brainkit" / "cli.py").is_file() else False
needs_d4 = pytest.mark.skipif(not HAS_VERSION_CHECK, reason="this brain-kit has no crew_hook_problem (older than d46765f)")


def older_kit(tmp_path, *, origin=True, kit=None, adapter=None, runs=True, name="pay"):
    """A project with brain-kit committed on main (pushed to its bare origin), the person's own identity, and an older
    kit on main: lean.json without runs/** (*runs*), and (*adapter*) an older hook adapter (no ADAPTER_VERSION line, as
    48b6b97's kit has it)."""
    repo = make_project(tmp_path, name=name, origin=origin, kit=dict({"gitlab": GITLAB}, **(kit or {})))
    sh("git", "-C", repo, "config", "user.name", "Alice Example")
    sh("git", "-C", repo, "config", "user.email", "alice@example.com")
    if runs:
        lj = repo / "aidlc-docs" / "lean.json"
        cfg = json.loads(lj.read_text(encoding="utf-8"))
        cfg["fingerprint_exclude"] = [p for p in cfg.get("fingerprint_exclude") or [] if p != "runs/**"]
        lj.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    if adapter:
        hook = repo / ADAPTER
        hook.write_text("".join(x for x in hook.read_text(encoding="utf-8").splitlines(True)
                                if not x.startswith("ADAPTER_VERSION")), encoding="utf-8")
    sh("git", "-C", repo, "commit", "-qam", "an older kit on main")
    if origin:
        sh("git", "-C", repo, "push", "-q", "origin", "main")
        sh("git", "-C", repo, "fetch", "-q", "origin")
    return repo


def repo_rows(crew, repo):
    return [r for r in crew["rows"] if r["repo"] == str(repo)]


def started(svc, coro_fn):
    async def go():
        await svc.start()
        try:
            return await coro_fn()
        finally:
            await svc.stop()
    return run(go())


async def upgrade(svc, path, branch=None, mode=None):
    body = {"path": str(path)}
    if branch:
        body["branch"] = branch
    if mode:
        body["mode"] = mode
    job = (await svc.import_upgrade(body))["job"]
    assert job["kind"] == "upgrade" and job["state"] == "running"
    assert [s["id"] for s in job["steps"]] == [s for s, _ in installer.UPGRADE_STEPS]
    return await svc.wait_job(job["id"])


def lean_json_at(repo, ref):
    return json.loads(sh("git", "-C", repo, "show", "%s:aidlc-docs/lean.json" % ref).stdout)


# ---- the fix -------------------------------------------------------------------------------------------------------- #

def test_the_kit_fix_reinstalls_on_a_new_branch_and_never_touches_the_checkout(tmp_path, home, monkeypatch, caplog):
    repo = older_kit(tmp_path, adapter=HAS_VERSION_CHECK)
    install_brain_dev(home)
    (repo / "README.md").write_text("# pay, my edit\n")      # the person's own work in progress
    (repo / "scratch.txt").write_text("mine\n")
    before = checkout_state(repo)
    gl = FakeGitLab()
    tok = fake_token()
    svc = make_service(tmp_path, [repo], transport=gl)

    async def go():
        out = {"crew": await svc.crew_checks(), "todo": await svc.todo()}
        out["first"] = await upgrade(svc, repo)
        out["second"] = await upgrade(svc, repo)            # brain/upgrade-kit is taken now: -2
        out["status"] = await svc.status()
        r = out["second"]["result"]
        with pytest.raises(AppError) as e:                  # the install records know nothing of it
            await svc.import_publish({"path": str(repo), "branch": r["branch"], "target": r["target"],
                                      "remote_url": r["remote_url"]})
        out["not_install"] = e.value
        monkeypatch.setenv("GITLAB_TOKEN", tok)
        out["published"] = await svc.import_publish({"path": str(repo), "branch": r["branch"], "target": r["target"],
                                                     "remote_url": r["remote_url"], "purpose": "upgrade"})
        out["after"] = svc.crew
        return out

    got = started(svc, go)
    rows = repo_rows(got["crew"], repo)
    fp = [r for r in rows if r["text"] == "Lean 把 runs/ 下的记录算成代码"]
    assert len(fp) == 1 and fp[0]["level"] == "WARN" and fp[0]["fix"] == "kit", rows    # a local-only repo: a reminder
    assert fp[0]["todo"].startswith("只有把需求交给运行机时才要紧") and "指纹" in fp[0]["raw"]
    if HAS_VERSION_CHECK:
        old = [r for r in rows if "是旧版" in r["text"]]
        assert len(old) == 1 and old[0]["level"] == "WARN" and old[0]["fix"] == "kit"
        assert old[0]["text"] == ".kiro/brain/lean-hook.py 是旧版（第 0 版，要第 2 版）"
        assert "is an older adapter (version 0, needs 2)" in old[0]["raw"]
    assert not [i for i in got["todo"]["items"] if i["kind"] == "crew"]                 # a WARN is no 待办 item

    done = got["first"]
    assert done["state"] == "done", done
    st = {s["id"]: s["state"] for s in done["steps"]}
    assert [st[k] for k in ("branch", "install", "commit")] == ["ok"] * 3 and st["doctor"] in ("ok", "warn"), done["steps"]
    r = done["result"]
    wt = r["worktree"]
    assert r["branch"] == "brain/upgrade-kit" and r["base"] == "origin/main" and r["changed"] is True
    assert wt == str((home / "workplace" / "brain-app" / "pay" / "_brain-upgrade-kit").resolve())
    assert r["kit"]["req_prefix"] == "PAY" and r["kit"]["default_branch"] == "main"
    assert (r["remote_url"], r["target"], r["gitlab_project"], r["can_open_mr"]) == (
        str((tmp_path / "pay-origin.git").resolve()), "main", "grp/pay", False)
    assert r["text"] == "提交在新分支 brain/upgrade-kit 上：推送并开 MR，合进 main 以后点「拉取」"
    assert r["doctor"]["rows"] and all(set(x) == {"level", "text", "todo", "fix", "repo", "raw"} for x in r["doctor"]["rows"])
    paths = {f["path"] for f in r["files"]}
    assert "aidlc-docs/lean.json" in paths and (ADAPTER in paths) == HAS_VERSION_CHECK
    assert "runs/**" in lean_json_at(repo, "brain/upgrade-kit")["fingerprint_exclude"]
    assert "runs/**" not in lean_json_at(repo, "main")["fingerprint_exclude"]      # main is the person's to merge into
    if HAS_VERSION_CHECK:
        shipped = (BRAINKIT / "kit" / ".kiro" / "brain" / "lean-hook.py").read_text(encoding="utf-8")
        assert sh("git", "-C", repo, "show", "brain/upgrade-kit:" + ADAPTER).stdout == shipped
        assert "\nADAPTER_VERSION = 2" in shipped
    c = r["commit"]
    assert c["ok"] and not c["blocked"] and "Alice Example <alice@example.com>" in c["text"]
    log = sh("git", "-C", repo, "log", "-1", "--format=%an <%ae>|%cn <%ce>|%s|%P", "brain/upgrade-kit").stdout.strip()
    assert log == "Alice Example <alice@example.com>|Alice Example <alice@example.com>|Update brain-kit's kit files " \
                  "(brain install)|" + sh("git", "-C", repo, "rev-parse", "origin/main").stdout.strip()
    assert sh("git", "-C", wt, "status", "--porcelain").stdout == ""
    assert checkout_state(repo) == before                     # HEAD, branch, index, files: all as they were

    second = got["second"]["result"]
    assert got["second"]["state"] == "done" and second["branch"] == "brain/upgrade-kit-2" and second["commit"]["ok"]
    assert second["worktree"].endswith("_brain-upgrade-kit-2")
    top = str(repo.resolve())
    assert svc.upgrades.get(top)["branch"] == "brain/upgrade-kit-2" and svc.upgrades.get(top)["purpose"] == "upgrade"
    assert svc.imports.get(top) is None                       # never taken for a pending install
    assert got["status"]["repos"][0]["ok"] is True and got["status"]["repos"][0]["pending"] is None
    assert got["not_install"].code == "no_install"

    pub = got["published"]
    assert pub["ok"] and pub["pushed"] and pub["mr"]["iid"] == 7 and pub["text"] == "推上去了，开了 MR !7"
    made = [x for x in gl.calls if x[0] == "POST"]
    assert len(made) == 1
    body = made[0][3]
    assert (body["source_branch"], body["target_branch"], body["title"]) == (
        "brain/upgrade-kit-2", "main", "更新 brain-kit 的 kit 文件（brain install）")
    assert body["description"].split("\n", 1)[0].startswith("用 brain-kit") and "更新这个仓库的 kit 文件" in \
        body["description"].split("\n", 1)[0] and "**改了什么**" in body["description"]
    assert sh("git", "-C", tmp_path / "pay-origin.git", "rev-parse", "brain/upgrade-kit-2").stdout == \
        sh("git", "-C", repo, "rev-parse", "brain/upgrade-kit-2").stdout
    assert sh("git", "-C", tmp_path / "pay-origin.git", "branch", "--list", "brain/upgrade-kit").stdout == ""
    assert svc.upgrades.get(top)["mr_iid"] == 7 and svc.imports.get(top) is None
    assert set(gl.tokens) == {tok} and tok not in json.dumps(got["published"]) and tok not in caplog.text
    assert got["after"]["checked_at"] >= got["crew"]["checked_at"]     # checked again after the push
    assert checkout_state(repo) == before


def test_without_a_remote_a_branch_update_is_on_a_local_branch_and_the_text_says_how_it_gets_in(tmp_path, home):
    """(Without a remote the default is in place, test_inplace.py; a person may still pick the branch.)"""
    repo = older_kit(tmp_path, origin=False)
    before = checkout_state(repo)
    svc = make_service(tmp_path, [repo])
    done = started(svc, lambda: upgrade(svc, repo, mode="branch"))
    r = done["result"]
    assert done["state"] == "done" and r["commit"]["ok"] and r["base"] == "main" and r["remote_url"] == ""
    assert r["mode"] == "branch" and r["text"] == "提交在本机分支 brain/upgrade-kit 上（这个仓库没有远端）：点「合并到 main」就生效"
    assert r["can_open_mr"] is False and "runs/**" in lean_json_at(repo, "brain/upgrade-kit")["fingerprint_exclude"]
    assert checkout_state(repo) == before


def test_nothing_to_change_takes_back_the_worktree_and_the_branch(tmp_path, home):
    repo = make_project(tmp_path, origin=True)
    before = checkout_state(repo)
    svc = make_service(tmp_path, [repo])
    done = started(svc, lambda: upgrade(svc, repo))
    r = done["result"]
    assert done["state"] == "done" and r["changed"] is False and r["text"] == "已经是最新的：没有要提交的改动", done
    assert r["worktree"] is None and r["files"] == [] and r["commit"]["sha"] is None
    assert {s["id"]: s["state"] for s in done["steps"]}["commit"] == "ok"
    assert sh("git", "-C", repo, "branch", "--list", "brain/upgrade-kit*").stdout == ""
    assert not (home / "workplace" / "brain-app" / "pay" / "_brain-upgrade-kit").exists()
    assert len([x for x in sh("git", "-C", repo, "worktree", "list", "--porcelain").stdout.splitlines()
                if x.startswith("worktree ")]) == 1
    assert svc.upgrades.get(str(repo.resolve())) is None and checkout_state(repo) == before


def test_upgrade_refuses_what_it_should_and_leaves_nothing_behind(tmp_path, home):
    plain, _ = plain_repo(tmp_path, "shop")
    repo = older_kit(tmp_path)
    svc = make_service(tmp_path, [])
    routes = mod("handlers").build_routes(svc, AppRoute, web=FakeWeb(), is_owner=lambda _r: True)
    not_owner = mod("handlers").build_routes(svc, AppRoute, web=FakeWeb(), is_owner=lambda _r: False)

    async def go():
        out = {"plain": await upgrade(svc, plain)}
        with pytest.raises(AppError) as e:
            await svc.import_upgrade({"path": str(repo), "branch": "bad..name"})
        out["branch"] = e.value
        with pytest.raises(AppError) as e:
            await svc.import_commit({"path": str(repo), "purpose": "other"})
        out["purpose"] = e.value
        out["rel"] = await call(routes, "POST", "/import/upgrade", json_body={"path": "pay"})
        out["owner"] = await call(not_owner, "POST", "/import/upgrade", json_body={"path": str(repo)})
        return out

    got = started(svc, go)
    assert got["plain"]["state"] == "failed" and "还没有 .brain/kit.json" in got["plain"]["error"]
    assert got["branch"].code == "invalid_branch" and got["purpose"].code == "invalid_purpose"
    assert (got["rel"].status, got["rel"].body["code"]) == (400, "invalid_path")
    assert got["owner"].status in (401, 403)
    for r in (plain, repo):
        assert sh("git", "-C", r, "branch", "--list", "brain/upgrade-kit*").stdout == ""
    assert not (home / "workplace" / "brain-app").exists()


def test_a_hook_that_says_no_keeps_the_upgrade_for_another_commit(tmp_path, home, monkeypatch):
    import appkit
    repo = older_kit(tmp_path)
    for k in appkit.NO_HOOKS_KEYS:            # this test needs the repo's own hooks to run
        monkeypatch.delenv(k, raising=False)
    hooks = tmp_path / "hooks"
    hooks.mkdir()
    pre = hooks / "pre-commit"
    pre.write_text("#!/bin/sh\necho '密钥扫描：先别提交' >&2\nexit 1\n")
    pre.chmod(0o755)
    sh("git", "-C", repo, "config", "core.hooksPath", str(hooks))
    svc = make_service(tmp_path, [repo])

    async def go():
        done = await upgrade(svc, repo)
        pre.write_text("#!/bin/sh\nexit 0\n")
        again = await svc.import_commit({"path": str(repo), "purpose": "upgrade"})
        return done, again

    done, again = started(svc, go)
    c = done["result"]["commit"]
    assert done["state"] == "done" and c["blocked"] and "密钥扫描：先别提交" in c["text"] and "再提交一次" in c["text"]
    assert done["result"]["text"] == c["text"] and done["result"]["worktree"]
    assert again["ok"] and sh("git", "-C", repo, "log", "-1", "--format=%s", "brain/upgrade-kit").stdout.strip() == \
        "Update brain-kit's kit files (brain install)"


# ---- severity: runner-only problems ---------------------------------------------------------------------------------- #

@pytest.mark.parametrize("team", [False, True])
def test_runs_in_the_fingerprint_is_a_reminder_locally_and_fail_for_a_team_repo(tmp_path, home, team):
    repo = older_kit(tmp_path, kit={"bridge_user": "brain-bridge"} if team else None)
    svc = make_service(tmp_path, [repo])

    async def go():
        return await svc.crew_checks(), await svc.todo(), await svc.import_inspect({"path": str(repo)})

    crew, todo, inspected = started(svc, go)
    fp = [r for r in repo_rows(crew, repo) if r["text"] == "Lean 把 runs/ 下的记录算成代码"]
    assert len(fp) == 1 and fp[0]["level"] == ("FAIL" if team else "WARN") and fp[0]["fix"] == "kit"
    assert fp[0]["todo"].startswith("交接会被拒") if team else fp[0]["todo"].startswith("只有把需求交给运行机时才要紧")
    items = [i for i in todo["items"] if i["kind"] == "crew" and i["title"] != "KiroCrew 检查"]   # the repo's, not brain-dev's
    assert len(items) == (1 if team else 0), todo["items"]
    if team:
        assert items[0]["title"] == "KiroCrew 检查 · pay" and items[0]["text"].startswith("Lean 把 runs/ 下的记录算成代码。交接会被拒")
    assert [r["level"] for r in repo_rows(inspected["crew"], repo)] == [fp[0]["level"]]   # 检查 says the same


@needs_d4
@pytest.mark.parametrize("team", [False, True])
def test_an_older_adapter_is_a_reminder_locally_and_fail_for_a_team_repo(tmp_path, home, team):
    repo = older_kit(tmp_path, adapter=True, runs=False, kit={"bridge_user": "brain-bridge"} if team else None)
    svc = make_service(tmp_path, [repo])

    async def go():
        return await svc.crew_checks(), mod("bk").m("cli").runner_kit_problems(str(repo))

    crew, probs = started(svc, go)
    rows = repo_rows(crew, repo)
    assert len(rows) == 1, rows
    r = rows[0]
    assert (r["level"], r["text"], r["fix"]) == ("FAIL" if team else "WARN", ".kiro/brain/lean-hook.py 是旧版（第 0 版，要第 2 版）",
                                                 "kit")
    assert r["raw"] == probs[0]      # brain-kit's own words


def test_a_repo_counts_as_handed_to_the_runner_by_bridge_user_or_a_hand_over():
    assert service.runner_repo({"bridge_user": "brain-bridge"}, []) is True
    assert service.runner_repo({"bridge_user": ""}, [{"run": {"handoff": None}}, {"run": None}]) is False
    assert service.runner_repo({}, [{"run": {"handoff": {"requested_at": "2026-11-09T10:00:00Z", "by": "alice"}}}])


def test_the_mapping_knows_what_this_brain_kit_says(tmp_path, home):
    """problems.py's table against the brain-kit under test: its own functions' words map to the app's."""
    P = mod("problems")
    repo = older_kit(tmp_path, origin=False)
    make_service(tmp_path, []).reload_sync()
    bk = mod("bk")
    cli, M = bk.m("cli"), bk.m("mrdesc")
    cfg = bk.m("config").load(str(repo))
    why = M.write_problem(str(repo), cfg)
    assert why, "this brain-kit does not say that Lean counts runs/ as code"
    for raw in (why, "%s。%s" % (why.rstrip("。"), M.exclude_fix(cfg))):
        assert P.row("FAIL", raw, repo="/r", team=True)["text"] == "Lean 把 runs/ 下的记录算成代码"
    if hasattr(cli, "crew_hook_problem"):
        raw = cli.crew_hook_problem("")
        assert P.row("FAIL", raw, repo="/r", team=True)["text"] == ".kiro/brain/lean-hook.py 是旧版（第 0 版，要第 %d 版）" % \
            cli.CREW_HOOK_VERSION
