"""导入仓库: 检查 (read only: each check, a subfolder and a linked worktree point at the top level, dirty, already listed),
克隆 (a local bare URL; the failures said plainly), 安装到新分支 (the person's checkout untouched, their identity, their
hooks), 加入列表 (installed, or pending on the install branch, then merged), 移出列表 (the list only), 推送并开 MR (the
fake GitLab, the person's token never shown), and the paths the routes refuse. Throwaway repos in temp dirs only; no
network (a bare repo is the remote, a fake ssh plays the failures)."""

import asyncio
import json
import os
import secrets
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

import pytest

import appkit
from appkit import commit_file, git_repo, mod, sh
from brainfix import make_project, make_service, needs_brainkit, run
from http_fakes import AppRoute, FakeWeb, call

pytestmark = needs_brainkit
importer = mod("importer")
installer = mod("installer")
AppError = mod("httpkit").AppError

KIT = {"req_prefix": "PAY", "tracker": "none", "jira_base": "", "gitlab_base": "https://gitlab.example.com",
       "gitlab_project": "grp/pay", "default_branch": "main", "team": "支付组"}


def plain_repo(tmp_path, name="pay"):
    """A project without brain-kit, its remote a bare repo next to it (origin/HEAD set, as a clone has it), the
    person's own git identity in its config."""
    repo = git_repo(tmp_path / name)
    sh("git", "-C", repo, "config", "user.name", "Alice Example")
    sh("git", "-C", repo, "config", "user.email", "alice@example.com")
    commit_file(repo, "README.md", "# %s\n" % name, "init")
    commit_file(repo, "src/pay.py", "x = 1\n", "code")
    bare = tmp_path / (name + "-origin.git")
    sh("git", "clone", "-q", "--bare", repo, bare)
    sh("git", "-C", repo, "remote", "add", "origin", str(bare))
    sh("git", "-C", repo, "fetch", "-q", "origin")
    sh("git", "-C", repo, "remote", "set-head", "origin", "main")
    sh("git", "-C", repo, "branch", "-q", "--set-upstream-to", "origin/main", "main")
    return repo, bare


def checkout_state(repo):
    """What the person's checkout is: its HEAD, its branch, its status, its files (the install must change none)."""
    files = sorted(str(p.relative_to(repo)) for p in Path(repo).rglob("*") if ".git" not in p.relative_to(repo).parts)
    return (sh("git", "-C", repo, "rev-parse", "HEAD").stdout, sh("git", "-C", repo, "symbolic-ref", "HEAD").stdout,
            sh("git", "-C", repo, "status", "--porcelain", "--untracked-files=all").stdout, files)


def checks(got):
    return {c["id"]: c for c in got["checks"]}


def started(svc, coro_fn):
    async def go():
        await svc.start()
        try:
            return await coro_fn()
        finally:
            await svc.stop()
    return run(go())


async def install(svc, path, kit=None, branch=None, mode="branch"):
    """安装 on a new branch (the way these tests follow; in place is the recommended one, test_inplace.py's)."""
    body = {"path": str(path), "kit": dict(kit or KIT)}
    if branch:
        body["branch"] = branch
    if mode:
        body["mode"] = mode
    job = (await svc.import_install(body))["job"]
    steps = [s["id"] for s in job["steps"]]      # a new branch (a repo with a remote), else in place
    assert job["state"] == "running" and steps in ([s for s, _ in installer.INSTALL_STEPS],
                                                   [s for s, _ in mod("inplace").INSTALL_STEPS])
    return await svc.wait_job(job["id"])


class FakeGitLab:
    """GitLab's MR API for grp/pay: list by source branch, create; every request's token kept."""

    def __init__(self):
        self.calls, self.mrs, self.tokens = [], [], []

    def __call__(self, method, url, headers, body):
        u = urlsplit(url)
        path, q = unquote(u.path), dict(parse_qsl(u.query))
        data = json.loads(body.decode()) if body else None
        self.calls.append((method, path, q, data))
        self.tokens.append(headers.get("PRIVATE-TOKEN"))
        if path == "/api/v4/projects/grp/pay/merge_requests" and method == "GET":
            rows = [m for m in self.mrs if m["source_branch"] == q.get("source_branch") and m["state"] == q.get("state")]
            return 200, json.dumps(rows).encode()
        if path == "/api/v4/projects/grp/pay/merge_requests" and method == "POST":
            iid = 7 + len(self.mrs)
            mr = dict(data, iid=iid, state="opened", web_url="https://gitlab.example.com/grp/pay/-/merge_requests/%d" % iid)
            self.mrs.append(mr)
            return 201, json.dumps(mr).encode()
        return 404, b'{"message": "404 (fake)"}'


def fake_token():
    return "fake-" + secrets.token_hex(12)   # made at run time: no token-looking text in the source


# ---- 检查 ---------------------------------------------------------------------------------------------------------- #

def test_an_installed_repo_is_one_click_inspect_then_add(tmp_path, home):
    repo = make_project(tmp_path)
    svc = make_service(tmp_path, [])

    async def go():
        got = await svc.import_inspect({"path": str(repo)})
        added = await svc.import_add({"path": str(repo)})
        again = await svc.import_inspect({"path": str(repo)})
        return got, added, again

    got, added, again = started(svc, go)
    c = checks(got)
    assert got["path"] == str(repo.resolve()) and got["error"] == "" and got["next"] == "add"
    assert [c[k]["level"] for k in ("path", "git", "branch", "default", "clean", "kit", "lean", "brain", "agents", "listed")] \
        == ["OK"] * 10, got["checks"]
    assert c["branch"]["why"] == "在 main 上" and c["default"]["why"].startswith("main")
    assert c["kit"]["why"] == "装了，已提交" and c["listed"]["why"] == "还不在列表里"
    # a repo done only on this machine: no origin is no warning (UI问题清单 #5)
    assert c["origin"]["level"] == "OK" and c["origin"]["why"].startswith("没有 origin：这个仓库只在本机做")
    assert got["kit"]["state"] == "checkout" and got["kit"]["values"]["req_prefix"] == "PAY"
    assert any(r["text"].startswith("KiroCrew 引擎") for r in got["crew"]["rows"])   # crewcheck's rows for it
    assert added["ok"] and added["id"] == "r1" and added["status"]["repos"][0]["ok"] is True
    assert json.loads((tmp_path / "data" / "settings.json").read_text())["repos"] == [str(repo.resolve())]
    assert again["next"] == "listed" and again["listed"] == "r1" and checks(again)["listed"]["why"] == "已经在列表里（r1）"


def test_a_subfolder_and_a_linked_worktree_point_at_the_main_checkout(tmp_path, home):
    repo = make_project(tmp_path)
    wt = home / "workplace" / "brain-app" / "pay" / "refund"
    wt.parent.mkdir(parents=True)
    sh("git", "-C", repo, "worktree", "add", "-q", "--detach", wt, "main")
    svc = make_service(tmp_path, [repo])

    async def go():
        return (await svc.import_inspect({"path": str(repo / "brain")}),
                await svc.import_inspect({"path": str(wt / ".kiro")}))

    sub, linked = started(svc, go)
    assert sub["path"] == str(repo.resolve()) and "子目录" in sub["note"]
    assert linked["path"] == str(repo.resolve()) and "工作区" in linked["note"] and str(wt.resolve()) in linked["note"]
    assert linked["next"] == "listed" and linked["listed"] == "r1"     # the same repo, already in the list
    assert checks(linked)["path"]["why"].startswith(str(repo.resolve()))


def test_a_plain_dirty_repo_each_check_says_why_and_the_form_is_prefilled(tmp_path, home):
    repo, _ = plain_repo(tmp_path)
    sh("git", "-C", repo, "remote", "set-url", "origin", "git@gitlab.example.com:grp/pay.git")
    (repo / "README.md").write_text("# pay, edited\n")
    (repo / "notes.txt").write_text("todo\n")
    before = checkout_state(repo)
    svc = make_service(tmp_path, [])
    got = started(svc, lambda: svc.import_inspect({"path": "  %s  " % repo}))
    c = checks(got)
    assert got["next"] == "install" and got["pending"] is None and got["listed"] is None
    assert c["default"]["level"] == "OK" and c["default"]["why"] == "main（origin/HEAD）"
    assert c["origin"]["level"] == "OK" and "GitLab https://gitlab.example.com，项目 grp/pay" in c["origin"]["why"]
    assert got["origin"] == {"url": "git@gitlab.example.com:grp/pay.git", "base": "https://gitlab.example.com",
                             "project": "grp/pay"}
    # SETUP-2: true for the way that is picked by default (in place): only the install's own files are committed
    assert c["clean"]["level"] == "WARN" and "有 2 个改动没提交" in c["clean"]["why"] and "原样留着" in c["clean"]["todo"]
    # SETUP-7: not installed yet is where an import starts: one row (Lean, the Brain, AGENTS.md come with it), no ✗
    assert c["kit"]["why"] == "还没装（会一起装上 AI-DLC Lean、Brain 文件、AGENTS.md）" and c["kit"]["todo"] == "下一步：在下面装上"
    assert not any(k in c for k in ("lean", "brain", "agents")) and "FAIL" not in {x["level"] for x in got["checks"]}
    assert got["install"]["recommend"] == "inplace"           # a requirement can be opened today (after 推送)
    assert got["form"] == {"req_prefix": "PAY", "tracker": "none", "jira_base": "", "gitlab_base": "https://gitlab.example.com",
                           "gitlab_project": "grp/pay", "default_branch": "main", "team": ""}
    assert got["current_branch"] == "main" and got["default_branch"] == "main"
    assert checkout_state(repo) == before   # read only


def test_inspect_says_what_is_wrong_with_a_path_or_a_folder(tmp_path, home):
    repo = make_project(tmp_path)
    (tmp_path / "plain").mkdir()
    (tmp_path / "a-file").write_text("x")
    os.symlink(str(repo), str(tmp_path / "link-to-pay"))
    sh("git", "clone", "-q", "--bare", repo, tmp_path / "bare.git")
    svc = make_service(tmp_path, [])

    async def go():
        out = {}
        for k, p in (("rel", "pay"), ("dots", str(tmp_path / "x" / ".." / "pay")), ("file", str(tmp_path / "a-file")),
                     ("missing", str(tmp_path / "nope")), ("link", str(tmp_path / "link-to-pay")),
                     ("plain", str(tmp_path / "plain")), ("bare", str(tmp_path / "bare.git")),
                     ("gitdir", str(repo / ".git")), ("empty", "")):
            out[k] = await svc.import_inspect({"path": p})
        return out

    got = started(svc, go)
    why = {k: (v["error"] or "") + " ".join(c["why"] for c in v["checks"] if c["level"] == "FAIL") for k, v in got.items()}
    assert "绝对路径" in why["rel"] and ".." in why["dots"] and "不是一个目录" in why["file"]
    assert "找不到" in why["missing"] and "符号链接" in why["link"] and str(repo) in why["link"]
    assert "不是 git 仓库" in why["plain"] and "裸仓库" in why["bare"] and ".git 目录" in why["gitdir"]
    assert "先写目录" in why["empty"]
    assert all(v["next"] == "fix" for v in got.values())


# ---- 克隆 ---------------------------------------------------------------------------------------------------------- #

def test_clone_a_local_bare_url_into_workplace_then_inspect_it(tmp_path, home):
    src, bare = plain_repo(tmp_path)
    svc = make_service(tmp_path, [])

    async def go():
        d = await svc.import_defaults()
        job = (await svc.import_clone({"url": str(bare), "parent": "", "name": ""}))["job"]
        done = await svc.wait_job(job["id"])
        second = (await svc.import_clone({"url": "file://" + str(bare), "parent": str(home / "code"), "name": "pay2"}))["job"]
        done2 = await svc.wait_job(second["id"])
        got = await svc.import_inspect({"path": done["result"]["path"]})
        return d, done, done2, got

    d, done, done2, got = started(svc, go)
    assert d["clone_parent"] == str((home / "workplace").resolve()) and d["branch"] == "brain/install"
    assert done["state"] == "done" and done["steps"][0]["state"] == "ok", done
    assert done["result"]["path"] == str((home / "workplace" / "pay-origin").resolve())
    assert done2["state"] == "done" and done2["result"]["path"] == str((home / "code" / "pay2").resolve())
    assert sh("git", "-C", done["result"]["path"], "log", "--format=%s").stdout.split() == ["code", "init"]
    assert got["next"] == "install" and got["origin"]["url"] == str(bare.resolve()) and got["origin"]["project"] == ""


def test_clone_failures_are_said_in_plain_chinese(tmp_path, home, monkeypatch):
    src, bare = plain_repo(tmp_path)
    (home / "workplace" / "taken").mkdir(parents=True)
    (tmp_path / "not-a-repo").mkdir()
    svc = make_service(tmp_path, [])

    def ssh_says(text, sleep=0):
        p = tmp_path / ("ssh-%s" % secrets.token_hex(3))
        p.write_text("#!/bin/sh\n%scat >&2 <<'EOF'\n%s\nEOF\nexit 255\n" % ("sleep %d\n" % sleep if sleep else "", text))
        p.chmod(0o755)
        monkeypatch.setenv("GIT_SSH_COMMAND", str(p))

    async def clone(url, name=""):
        job = (await svc.import_clone({"url": url, "parent": str(home / "workplace"), "name": name}))["job"]
        return await svc.wait_job(job["id"])

    async def refused(url, name=""):
        with pytest.raises(AppError) as e:
            await svc.import_clone({"url": url, "parent": str(home / "workplace"), "name": name})
        return e.value

    async def go():
        out = {"exists": await refused(str(bare), "taken"),
               "creds": await refused("https://alice:" + fake_token() + "@gitlab.example.com/grp/pay.git"),
               "ext": await refused("ext::sh -c touch% /tmp/pwned"),
               "inside": await refused(str(bare), "brain-app"),
               "notrepo": await clone(str(tmp_path / "not-a-repo"), "n1")}
        ssh_says("git@gitlab.example.com: Permission denied (publickey).")
        out["auth"] = await clone("git@gitlab.example.com:grp/pay.git", "a1")
        ssh_says("ssh: Could not resolve hostname gitlab.example.com: nodename nor servname provided, or not known")
        out["dns"] = await clone("git@gitlab.example.com:grp/pay.git", "a2")
        ssh_says("remote: The project you were looking for could not be found or you don't have permission to view it.")
        out["404"] = await clone("ssh://git@gitlab.example.com/grp/nope.git", "a3")
        monkeypatch.setattr(importer, "CLONE_TIMEOUT_S", 1)
        ssh_says("slow", sleep=20)
        out["slow"] = await clone("git@gitlab.example.com:grp/pay.git", "a4")
        return out

    got = started(svc, go)
    assert got["exists"].code == "exists" and got["exists"].status == 409 and "已经有了" in str(got["exists"])
    assert got["creds"].code == "credentials_in_url" and "token" in str(got["creds"])
    assert got["ext"].code == "invalid_url" and got["inside"].code == "inside_work_root"
    assert got["notrepo"]["state"] == "failed" and "找不到这个仓库" in got["notrepo"]["error"]
    assert got["auth"]["state"] == "failed" and "刷新你的 SSH 登录凭证" in got["auth"]["error"] and "再试" in got["auth"]["error"]
    assert "连不上 gitlab.example.com" in got["dns"]["error"]
    assert "找不到这个仓库，或者你没有权限" in got["404"]["error"]
    assert "克隆超过" in got["slow"]["error"] and got["slow"]["steps"][0]["state"] == "fail"
    for name in ("n1", "a1", "a2", "a3", "a4"):
        assert not (home / "workplace" / name).exists(), name   # a failed clone leaves nothing behind


def test_git_over_the_network_never_prompts(home):
    env = importer.quiet_env()
    assert env["GIT_TERMINAL_PROMPT"] == "0" and env["SSH_ASKPASS_REQUIRE"] == "never" and env["GCM_INTERACTIVE"] == "never"
    assert os.path.basename(env["GIT_ASKPASS"]) == "false" and os.path.basename(env["SSH_ASKPASS"]) == "false"
    assert "BatchMode=yes" in env.get("GIT_SSH_COMMAND", "BatchMode=yes")
    p = importer.run_quiet(["/bin/sh", "-c", "sleep 30 & sleep 30"], "/", 1)
    assert p.returncode == 124 and "停掉了" in p.stderr


# ---- 安装到新分支 --------------------------------------------------------------------------------------------------- #

def test_install_goes_on_a_new_branch_in_its_own_worktree_and_never_touches_the_checkout(tmp_path, home):
    repo, bare = plain_repo(tmp_path)
    (repo / "README.md").write_text("# pay, my edit\n")      # the person's own work in progress
    (repo / "scratch.txt").write_text("mine\n")
    before = checkout_state(repo)
    svc = make_service(tmp_path, [])

    async def go():
        done = await install(svc, repo)
        got = await svc.import_inspect({"path": str(repo)})
        return done, got

    done, got = started(svc, go)
    assert done["state"] == "done", done
    st = {s["id"]: s for s in done["steps"]}
    assert [st[k]["state"] for k in ("branch", "install", "kit", "commit")] == ["ok"] * 4, done["steps"]
    assert st["doctor"]["state"] in ("ok", "warn") and done["result"]["doctor"]["rows"]
    r = done["result"]
    wt = Path(r["worktree"])
    assert r["branch"] == "brain/install" and r["base"] == "origin/main"
    assert wt == (home / "workplace" / "brain-app" / "pay" / "_brain-install").resolve()
    assert sh("git", "-C", wt, "symbolic-ref", "--short", "HEAD").stdout.strip() == "brain/install"
    assert checkout_state(repo) == before                     # HEAD, branch, status, files: all as they were
    assert not (repo / ".brain").exists()
    kit = json.loads(sh("git", "-C", repo, "show", "brain/install:.brain/kit.json").stdout)
    assert (kit["req_prefix"], kit["tracker"], kit["default_branch"], kit["team"], kit["gitlab"]) == (
        "PAY", "none", "main", "支付组", {"base": "https://gitlab.example.com", "project": "grp/pay"})
    paths = {f["path"] for f in r["files"]}
    assert {".brain/kit.json", "AGENTS.md", "brain/PRODUCT.md", ".kiro/brain/lean-hook.py", "aidlc-docs/lean.json",
            ".gitignore"} <= paths and all(f["change"] == "added" for f in r["files"] if f["path"] != ".gitignore")
    c = r["commit"]
    assert c["ok"] and not c["blocked"] and "Alice Example <alice@example.com>" in c["text"]
    log = sh("git", "-C", repo, "log", "-1", "--format=%an <%ae>|%cn <%ce>|%s|%P", "brain/install").stdout.strip()
    assert log == "Alice Example <alice@example.com>|Alice Example <alice@example.com>|Install brain-kit (brain install)|" + \
        sh("git", "-C", repo, "rev-parse", "origin/main").stdout.strip()
    assert sh("git", "-C", wt, "status", "--porcelain").stdout == ""          # everything brain install wrote is committed
    assert sh("git", "-C", bare, "branch", "--list", "brain/install").stdout == ""   # nothing pushed
    # listed once its commit went in (SETUP-18); the install branch still waits to go in
    assert got["next"] == "listed" and got["listed"] == "r1" and got["kit"]["state"] == "branch"
    p = got["pending"]
    assert p["text"] == "装在 brain/install 分支上，还没推送：合进 main 以后生效" and p["branch"] == "brain/install" and not p["pushed"]
    assert p["remote_url"] == str(bare.resolve()) and p["target"] == "main" and p["gitlab_project"] == "grp/pay"
    assert p["commit"] == c["sha"][:12] and p["worktree"] == str(wt)
    assert checks(got)["kit"]["level"] == "WARN" and "推送并开 MR" in checks(got)["kit"]["todo"]


def test_install_refuses_what_it_should_and_leaves_nothing_behind(tmp_path, home):
    repo = make_project(tmp_path)
    plain, _ = plain_repo(tmp_path, "shop")
    linked, _ = plain_repo(tmp_path, "linked")
    os.symlink("/etc", str(linked / ".kiro"))
    sh("git", "-C", linked, "add", "-A")
    sh("git", "-C", linked, "commit", "-qm", "a symlink where brain install writes")
    sh("git", "-C", linked, "push", "-q", "origin", "main")
    sh("git", "-C", linked, "fetch", "-q", "origin")
    svc = make_service(tmp_path, [])

    async def refused(body):
        with pytest.raises(AppError) as e:
            await svc.import_install(body)
        return e.value

    async def go():
        out = {"prefix": await refused({"path": str(plain), "kit": dict(KIT, req_prefix="pay-1")}),
               "half_gitlab": await refused({"path": str(plain), "kit": dict(KIT, gitlab_project="")}),
               "jira": await refused({"path": str(plain), "kit": dict(KIT, tracker="jira")}),
               "branch": await refused({"path": str(plain), "kit": KIT, "branch": "bad..name", "mode": "branch"}),
               "no_kit": await refused({"path": str(plain)})}
        out["installed"] = await install(svc, repo)
        out["no_default"] = await install(svc, plain, dict(KIT, default_branch="develop"))
        out["symlink"] = await install(svc, linked)
        out["inspect_linked"] = await svc.import_inspect({"path": str(linked)})
        return out

    got = started(svc, go)
    assert "需求号前缀" in str(got["prefix"]) and "都写" in str(got["half_gitlab"]) and "Jira 的地址" in str(got["jira"])
    assert got["branch"].code == "invalid_branch" and got["no_kit"].code == "invalid_kit"
    assert got["installed"]["state"] == "failed" and "已经装了 brain-kit" in got["installed"]["error"]
    assert got["no_default"]["state"] == "failed" and "找不到默认分支 develop" in got["no_default"]["error"]
    assert got["symlink"]["state"] == "failed" and ".kiro" in got["symlink"]["error"] and "符号链接" in got["symlink"]["error"]
    assert checks(got["inspect_linked"])["links"]["level"] == "FAIL" and got["inspect_linked"]["next"] == "fix"
    for r in (plain, linked):
        assert sh("git", "-C", r, "branch", "--list", "brain/install").stdout == ""
    assert not (home / "workplace" / "brain-app").exists()      # no worktree was made for any of them


def test_a_hook_that_says_no_is_shown_as_it_said_it_and_nothing_is_bypassed(tmp_path, home, monkeypatch):
    repo, _ = plain_repo(tmp_path)
    for k in appkit.NO_HOOKS_KEYS:            # this test needs the repo's own hooks to run
        monkeypatch.delenv(k, raising=False)
    hooks, ran = tmp_path / "hooks", tmp_path / "hook-ran"
    hooks.mkdir()
    pre = hooks / "pre-commit"
    pre.write_text("#!/bin/sh\necho ran >> '%s'\necho '密钥扫描：AGENTS.md 里像是有一个 token，先别提交' >&2\nexit 1\n" % ran)
    pre.chmod(0o755)
    sh("git", "-C", repo, "config", "core.hooksPath", str(hooks))
    svc = make_service(tmp_path, [repo])

    async def go():
        done = await install(svc, repo)
        done["tip"] = sh("git", "-C", repo, "rev-parse", "brain/install").stdout
        pending = await svc.import_inspect({"path": str(repo)})
        status = await svc.status()
        with pytest.raises(AppError) as e:
            await svc.import_publish({"path": str(repo), "branch": "brain/install", "target": "main",
                                      "remote_url": pending["pending"]["remote_url"]})
        pre.write_text("#!/bin/sh\necho ran >> '%s'\nexit 0\n" % ran)
        again = await svc.import_commit({"path": str(repo)})
        after = await svc.import_inspect({"path": str(repo)})
        return done, pending, status, e.value, again, after

    done, pending, status, refused, again, after = started(svc, go)
    c = done["result"]["commit"]
    assert done["state"] == "done" and not c["ok"] and c["blocked"]
    assert "密钥扫描：AGENTS.md 里像是有一个 token，先别提交" in c["text"] and "再提交一次" in c["text"]
    assert {s["id"]: s["state"] for s in done["steps"]}["commit"] == "fail"
    assert done["tip"] == sh("git", "-C", repo, "rev-parse", "origin/main").stdout     # nothing was committed
    assert pending["kit"]["state"] == "uncommitted" and "还没提交" in pending["pending"]["text"]
    assert status["repos"][0]["pending"]["state"] == "uncommitted" and status["repos"][0]["error"] == ""
    assert refused.code == "not_committed"
    assert again["ok"] and again["sha"] and after["kit"]["state"] == "branch"
    assert ran.read_text().count("ran") == 2     # the hook ran both times: nothing went around it


# ---- 加入列表, 移出列表 ------------------------------------------------------------------------------------------------ #

def test_add_installed_and_pending_repos_then_merge_and_pull(tmp_path, home):
    ready = make_project(tmp_path)
    repo, bare = plain_repo(tmp_path, "shop")
    svc = make_service(tmp_path, [])

    async def go():
        out = {}
        with pytest.raises(AppError) as e:
            await svc.import_add({"path": str(repo)})
        out["refused"] = e.value
        out["ready"] = await svc.import_add({"path": str(ready)})
        await install(svc, repo)
        out["pending"] = await svc.import_add({"path": str(repo / "src")})          # a subfolder: its top level
        out["overview"] = await svc.overview("all")
        # merged on the remote (as GitLab would after the MR), fetched here, the checkout not pulled yet
        sh("git", "-C", repo, "push", "-q", "origin", "brain/install:main")
        sh("git", "-C", repo, "fetch", "-q", "origin")
        out["changed"] = await asyncio.to_thread(svc._pending_changed)   # what the background loop asks every 30 s
        out["merged"] = (await svc.save_settings({}))["status"]
        sh("git", "-C", repo, "pull", "-q", "--ff-only")
        out["pulled_seen"] = await asyncio.to_thread(svc._pending_changed)
        await asyncio.to_thread(svc.reload_sync)                           # ... and then it reads the list again
        out["pulled"] = await svc.status()
        return out

    got = started(svc, go)
    assert got["refused"].code == "not_installed" and "还没装 brain-kit" in str(got["refused"])
    assert got["ready"]["status"]["repos"][0]["ok"] is True
    r2 = got["pending"]["status"]["repos"][1]
    # the install listed it by itself (SETUP-18): 加入列表 afterwards only says so
    assert got["pending"]["id"] == "r2" and got["pending"]["text"] == "已经在列表里了（r2）"
    assert r2["path"] == str(repo.resolve()) and r2["ok"] is False and r2["error"] == "" and r2["kit"] is None
    assert r2["pending"]["state"] == "branch" and r2["pending"]["text"] == "装在 brain/install 分支上，还没推送：合进 main 以后生效"
    assert "推送并开 MR" in r2["pending"]["next"]
    assert got["overview"]["errors"] == []                                      # pending is no error
    assert got["changed"] is True and got["pulled_seen"] is True
    m = got["merged"]["repos"][1]
    assert m["pending"]["state"] == "merged" and "已经合进 origin/main" in m["pending"]["text"] and "「拉取」" in m["pending"]["next"]
    assert got["pulled"]["repos"][1]["ok"] is True and got["pulled"]["repos"][1]["pending"] is None


def test_remove_from_the_list_touches_no_file(tmp_path, home):
    a = make_project(tmp_path, name="pay")
    b = make_project(tmp_path, name="shop", prefix="SHOP")
    gone = make_project(tmp_path, name="gone", prefix="GONE")
    svc = make_service(tmp_path, [a, b, gone])

    async def go():
        before = await svc.status()
        removed = await svc.repo_remove({"path": str(a)})
        import shutil
        shutil.rmtree(gone)
        removed_gone = await svc.repo_remove({"path": str(gone)})
        with pytest.raises(AppError) as e:
            await svc.repo_remove({"path": str(tmp_path / "never-listed")})
        return before, removed, removed_gone, e.value

    before, removed, removed_gone, missing = started(svc, go)
    assert [r["name"] for r in before["repos"]] == ["pay", "shop", "gone"]
    assert removed["ok"] and "没动" in removed["text"]
    assert [r["name"] for r in removed["status"]["repos"]] == ["shop", "gone"]
    assert [r["name"] for r in removed_gone["status"]["repos"]] == ["shop"]
    assert (a / ".brain" / "kit.json").is_file() and sh("git", "-C", a, "status", "--porcelain").stdout == ""
    assert missing.code == "not_listed" and missing.status == 404
    assert json.loads((tmp_path / "data" / "settings.json").read_text())["repos"] == [str(b.resolve())]


# ---- 推送并开 MR ------------------------------------------------------------------------------------------------------ #

def test_publish_pushes_the_branch_and_opens_the_mr_with_the_persons_token(tmp_path, home, monkeypatch, caplog):
    repo, bare = plain_repo(tmp_path)
    gl = FakeGitLab()
    tok = fake_token()
    svc = make_service(tmp_path, [repo], transport=gl)

    async def go():
        await install(svc, repo)
        p = (await svc.import_inspect({"path": str(repo)}))["pending"]
        confirm = {"path": str(repo), "branch": p["branch"], "target": p["target"], "remote_url": p["remote_url"]}
        with pytest.raises(AppError) as stale:
            await svc.import_publish(dict(confirm, target="release"))
        no_token = await svc.import_publish(confirm)
        monkeypatch.setenv("GITLAB_TOKEN", tok)
        first = await svc.import_publish(confirm)
        again = await svc.import_publish(confirm)
        status = await svc.status()
        return p, stale.value, no_token, first, again, status

    p, stale, no_token, first, again, status = started(svc, go)
    assert p["can_open_mr"] is False and stale.code == "stale_confirm"
    assert no_token["ok"] and no_token["pushed"] and no_token["mr"] is None and "没有 GitLab token" in no_token["text"]
    assert no_token["commands"][0] == "git -C %s push origin brain/install" % repo.resolve()
    assert no_token["commands"][1].startswith("glab mr create -R https://gitlab.example.com/grp/pay --source-branch "
                                              "brain/install --target-branch main")
    assert no_token["new_mr_url"] == ("https://gitlab.example.com/grp/pay/-/merge_requests/new?merge_request%5Bsource_branch"
                                      "%5D=brain%2Finstall&merge_request%5Btarget_branch%5D=main")
    assert sh("git", "-C", bare, "rev-parse", "brain/install").stdout == sh("git", "-C", repo, "rev-parse", "brain/install").stdout
    assert first["mr"] == {"iid": 7, "url": "https://gitlab.example.com/grp/pay/-/merge_requests/7", "existing": False}
    assert first["text"] == "推上去了，开了 MR !7" and again["mr"]["existing"] and again["mr"]["iid"] == 7
    made = [c for c in gl.calls if c[0] == "POST"]
    assert len(made) == 1 and made[0][1] == "/api/v4/projects/grp/pay/merge_requests"
    body = made[0][3]
    assert (body["source_branch"], body["target_branch"], body["title"]) == ("brain/install", "main", "装上 brain-kit（brain install）")
    for part in ("`brain install`", "`.kiro/aidlc-lean/`", "`.brain/`", "`brain/`", "`AGENTS.md`", "需求号：PAY-1",
                 "默认分支：main", "GitLab：grp/pay", "团队：支付组", "原来的检出没动"):
        assert part in body["description"], part
    assert set(gl.tokens) == {tok}                                    # the person's own token, for every call ...
    shown = json.dumps([no_token, first, again, status], ensure_ascii=False)
    assert tok not in shown and tok not in caplog.text                # ... and never shown or logged
    assert status["repos"][0]["pending"]["mr_url"] == "https://gitlab.example.com/grp/pay/-/merge_requests/7"
    assert "在 GitLab 上合并 MR" in status["repos"][0]["pending"]["next"] and status["repos"][0]["pending"]["word"] == "MR 等合并"


def test_a_push_that_fails_says_why_and_shows_the_commands(tmp_path, home, monkeypatch):
    repo, bare = plain_repo(tmp_path)
    svc = make_service(tmp_path, [])

    async def go():
        await install(svc, repo)
        p = (await svc.import_inspect({"path": str(repo)}))["pending"]
        # the remote moved away (another branch of that name, pushed by someone else)
        other = tmp_path / "other"
        sh("git", "clone", "-q", bare, other)
        commit_file(other, "x.txt", "x", "someone else's")
        sh("git", "-C", other, "push", "-q", "origin", "HEAD:refs/heads/brain/install")
        return await svc.import_publish({"path": str(repo), "branch": p["branch"], "target": p["target"],
                                         "remote_url": p["remote_url"]})

    got = started(svc, go)
    assert got["ok"] is False and got["pushed"] is False and "远端已经有这个分支" in got["text"]
    assert got["commands"] and got["output"]


def test_a_tampered_install_record_is_not_trusted(tmp_path, home):
    """imports.json is in the app's data dir (the agents' OS user can write it): a record that names the default branch
    or a folder that is no worktree of the repo is refused before anything is committed or pushed."""
    repo, bare = plain_repo(tmp_path)
    other = git_repo(tmp_path / "elsewhere")
    commit_file(other, "x.txt", "x", "x")
    svc = make_service(tmp_path, [])

    async def go():
        await install(svc, repo)
        p = (await svc.import_inspect({"path": str(repo)}))["pending"]
        top = str(repo.resolve())
        svc.imports.update(top, branch="main")
        with pytest.raises(AppError) as push:
            await svc.import_publish({"path": str(repo), "branch": "main", "target": "main", "remote_url": p["remote_url"]})
        svc.imports.update(top, branch="brain/install", worktree=str(other))
        with pytest.raises(AppError) as again:
            await svc.import_commit({"path": str(repo)})
        return push.value, again.value

    push, again = started(svc, go)
    assert push.code == "bad_record" and again.code == "bad_record"
    assert sh("git", "-C", bare, "log", "--format=%s", "main").stdout.split() == ["code", "init"]   # main untouched
    assert sh("git", "-C", tmp_path / "elsewhere", "log", "--format=%s").stdout.split() == ["x"]


# ---- the routes ---------------------------------------------------------------------------------------------------- #

def test_the_routes_refuse_bad_paths_before_anything_runs(tmp_path, home):
    repo, _ = plain_repo(tmp_path)
    (tmp_path / "a-file").write_text("x")
    os.symlink(str(repo), str(tmp_path / "link"))
    svc = make_service(tmp_path, [])
    routes = mod("handlers").build_routes(svc, AppRoute, web=FakeWeb(), is_owner=lambda _r: True)

    async def go():
        out = {}
        for name, path, body in (
                ("rel", "/import/install", {"path": "pay", "kit": KIT}),
                ("missing", "/import/install", {"path": str(tmp_path / "nope"), "kit": KIT}),
                ("file", "/import/add", {"path": str(tmp_path / "a-file")}),
                ("link", "/import/add", {"path": str(tmp_path / "link")}),
                ("dots", "/import/commit", {"path": str(repo / ".." / "pay")}),
                ("ctrl", "/import/publish", {"path": str(repo) + "\x01x", "confirm": True}),
                ("unconfirmed", "/import/publish", {"path": str(repo)}),
                ("clone_parent", "/import/clone", {"url": str(repo), "parent": "relative"}),
                ("remove_rel", "/repos/remove", {"path": "pay"}),
                ("not_list", "/import/inspect", ["x"])):
            out[name] = await call(routes, "POST", path, json_body=body)
        out["job"] = await call(routes, "GET", "/import/jobs/zzz")
        out["job2"] = await call(routes, "GET", "/import/jobs/0123456789ab")
        return out

    got = started(svc, go)
    want = {"rel": (400, "invalid_path"), "missing": (404, "not_found"), "file": (400, "not_a_directory"),
            "link": (400, "symlink"), "dots": (400, "invalid_path"), "ctrl": (400, "invalid_path"),
            "unconfirmed": (400, "not_confirmed"), "clone_parent": (400, "invalid_path"),
            "remove_rel": (400, "invalid_path"), "not_list": (400, "invalid_json"), "job2": (404, "no_job")}
    assert {k: (got[k].status, got[k].code) for k in want} == want
    assert got["job"].status == 404
    assert "绝对路径" in got["rel"].body["error"] and "符号链接" in got["link"].body["error"]
    assert not (home / "workplace" / "brain-app").exists()
    assert sh("git", "-C", repo, "branch", "--list", "brain/install").stdout == ""


def test_pure_helpers():
    assert importer.gitlab_of("git@gitlab.aws.dev:grp/sub/pay.git") == {"base": "https://gitlab.aws.dev", "project": "grp/sub/pay"}
    assert importer.gitlab_of("https://gitlab.example.com:8443/grp/pay") == {"base": "https://gitlab.example.com:8443",
                                                                          "project": "grp/pay"}
    assert importer.gitlab_of("git@github.com:a/b.git") == {"base": "", "project": ""}
    secret = fake_token()
    assert secret not in importer.shown_url("https://oauth2:%s@gitlab.example.com/grp/pay.git" % secret)
    assert secret not in importer.hide_credentials("fatal: unable to access 'https://x:%s@h/p.git/'" % secret)
    assert importer.shown_url("ssh://git@h:2222/g/p.git") == "ssh://git@h:2222/g/p.git"
    assert importer.form_defaults("/x/shop-pay", None, None)["req_prefix"] == "SHOPPAY"
    assert importer.form_defaults("/x/123", None, None)["req_prefix"] == "REQ"
    fail = lambda err, code=128: importer.git_failure(  # noqa: E731
        __import__("subprocess").CompletedProcess([], code, "", err), "推送", "https://gitlab.example.com/g/p.git")[0]
    assert fail("remote: GitLab: You are not allowed to push\n ! [remote rejected] x (pre-receive hook declined)") == "hook"
    assert fail(" ! [rejected]        x -> x (fetch first)\nerror: failed to push some refs") == "rejected"
    assert fail("fatal: could not read Username for 'https://h': terminal prompts disabled") == "auth"
    assert fail("fatal: unable to access 'https://h/': Could not resolve host: h") == "unreachable"
    assert fail("whatever", 124) == "timeout"
    assert importer.planted_link(os.path.realpath("/tmp")) is None
