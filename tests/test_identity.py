"""你是谁: the name brain-kit goes by in a repo, shown where the app shows who you are (status, 开需求, 检查), and
「你的 GitLab 用户名」 / 「你的名字」 when brain-kit would not know: git config brain.user in that repo (brain-kit's
USER_RE, no shell, no token). Both brain-kits: the clean clone (48b6b97: no name, no start) and a copy of it with
brain-kit 91e2fee's rule applied (a repo without GitLab uses the login name). Throwaway repos only."""

import json
import shutil

import pytest

import brainfix
from appkit import BRAINKIT, mod, sh
from brainfix import make_project, make_service, needs_brainkit, run
from http_fakes import AppRoute, FakeWeb, call

pytestmark = needs_brainkit
identity = mod("identity")
problems = mod("problems")
bk = mod("bk")

GITLAB = {"gitlab": {"base": "https://gitlab.example.com", "project": "grp/pay"}}
OLD_ME = '''    if not who:
        raise BrainError("who are you? set GITLAB_TOKEN (preferred) or `git config brain.user <gitlab-username>`")
'''
NEW_ME = '''    if not who and not cfg["gitlab"]["base"]:
        who = _login_name()
        if not who:
            raise BrainError("who are you? your login name is not usable as a name here: "
                             "`git config brain.user <name>` (lowercase letters, digits, . _ -)")
    if not who:
        raise BrainError("who are you? this repo uses GitLab (%s): set GITLAB_TOKEN (preferred) or "
                         "`git config brain.user <your GitLab username>`; it must be your GitLab username: GitLab "
                         "checks who pushes ai/<name>/... and the bridge checks who handed over" % cfg["gitlab"]["base"])
'''
LOGIN = '''

def _login_name() -> str:
    import getpass
    try:
        name = getpass.getuser().strip().lower()
    except Exception:  # noqa: BLE001
        return ""
    return name if USER_RE.match(name) else ""


def _store('''


@pytest.fixture(scope="module")
def fallback_kit(tmp_path_factory):
    """The clean clone with brain-kit 91e2fee's identity rule (cli._me falls back to the login name without GitLab)."""
    dst = tmp_path_factory.mktemp("bk") / "brain-kit"
    shutil.copytree(BRAINKIT, dst, ignore=shutil.ignore_patterns(".git", "__pycache__"))
    cli = dst / "brainkit" / "cli.py"
    src = cli.read_text(encoding="utf-8")
    assert OLD_ME in src and "\n\ndef _store(" in src
    cli.write_text(src.replace(OLD_ME, NEW_ME).replace("\n\ndef _store(", LOGIN, 1), encoding="utf-8")
    return dst


@pytest.fixture
def login(monkeypatch):
    for k in ("LOGNAME", "USER", "LNAME", "USERNAME"):
        monkeypatch.setenv(k, "Yingchu")       # getpass.getuser(), here and in brain's own process
    return "yingchu"


def project(tmp_path, kit=None):
    repo = make_project(tmp_path, kit=kit)
    sh("git", "-C", repo, "config", "--unset", "brain.user")      # make_project names alice
    return repo


def started(svc, coro_fn):
    async def go():
        await svc.start()
        try:
            return await coro_fn()
        finally:
            await svc.stop()
    return run(go())


def start_body(**kw):
    return dict({"repo": "r1", "slug": "refund", "title": "退款", "docs": [], "open_session": False}, **kw)


def test_without_gitlab_the_old_brainkit_asks_for_a_name_and_the_start_says_why(tmp_path, home, login):
    repo = project(tmp_path)
    svc = make_service(tmp_path, [repo])
    routes = mod("handlers").build_routes(svc, AppRoute, web=FakeWeb(), is_owner=lambda _r: True)

    async def go():
        assert not identity.falls_back()                              # the clean clone: no login-name rule
        st = await svc.status()
        first = await svc.intake_start(start_body())
        saved = await call(routes, "POST", "/me/name", json_body={"path": str(repo), "name": first["me"]["suggest"]})
        again = await svc.intake_start(start_body())
        return st, first, saved, again

    st, first, saved, again = started(svc, go)
    me = st["repos"][0]["me"]
    assert me["ask"] and me["name"] is None and me["label"] == "你的名字" and me["suggest"] == login
    assert me["why"] == identity.WHY_OLD and me["gitlab"] == ""
    assert st["me"] == {"user": None, "token": False, "how": "GitLab token（没有）"}
    assert first["ok"] is False and "who are you?" in first["output"]
    p = first["problem"]
    assert p["fix"] == "me" and p["text"] == "brain-kit 不知道你是谁" and p["repo"] == str(repo)
    assert "点「保存」" in p["todo"] and first["me"]["ask"]
    assert saved.status == 200 and saved.body["me"]["name"] == login and saved.body["me"]["source"] == "git"
    assert sh("git", "-C", repo, "config", "--local", "brain.user").stdout.strip() == login
    assert next(r for r in saved.body["status"]["repos"] if r["id"] == "r1")["me"]["ask"] is False
    assert again["ok"] and again["branch"] == "ai/%s/PAY-1-refund" % login and again["problem"] is None


def test_without_gitlab_the_new_brainkit_uses_the_login_name_and_no_input(tmp_path, home, login, fallback_kit,
                                                                          monkeypatch):
    monkeypatch.setattr(brainfix, "BRAINKIT", fallback_kit)
    repo = project(tmp_path)
    svc = make_service(tmp_path, [repo])

    async def go():
        assert identity.falls_back()                                  # 91e2fee's rule
        st = await svc.status()
        got = await svc.import_inspect({"path": str(repo)})
        out = await svc.intake_start(start_body())
        return st, got, out, svc.me_in(svc.repos["r1"])

    try:
        st, got, out, mine = started(svc, go)
        me = st["repos"][0]["me"]
        assert me == dict(me, name=login, source="login", ask=False, error="")
        assert me["text"] == "%s（这台机器的登录名：这个仓库不用 GitLab）" % login
        assert st["me"] == {"user": login, "token": False, "how": "GitLab token（没有）；" + me["text"]}
        row = next(c for c in got["checks"] if c["id"] == "me")
        assert row["level"] == "OK" and row["why"] == me["text"] and got["me"]["name"] == login
        assert out["ok"] and out["branch"] == "ai/%s/PAY-1-refund" % login        # brain-kit used it too
        assert mine == login                                                    # and the app owns what it claimed
    finally:
        bk.unload()


@pytest.mark.parametrize("kit_path", ["clean", "fallback"])
def test_with_gitlab_and_no_token_both_brainkits_ask_for_the_gitlab_username(tmp_path, home, login, fallback_kit,
                                                                             monkeypatch, kit_path):
    if kit_path == "fallback":
        monkeypatch.setattr(brainfix, "BRAINKIT", fallback_kit)
    repo = project(tmp_path, kit=GITLAB)
    svc = make_service(tmp_path, [repo])

    async def go():
        got = await svc.import_inspect({"path": str(repo)})
        out = await svc.intake_start(start_body())
        return got, out

    try:
        got, out = started(svc, go)
        me = got["me"]
        assert me["ask"] and me["label"] == "你的 GitLab 用户名" and me["suggest"] == login
        assert me["why"] == identity.WHY_GITLAB and me["gitlab"] == "https://gitlab.example.com"
        row = next(c for c in got["checks"] if c["id"] == "me")
        assert row["level"] == "WARN" and row["todo"] == "在下面填上你的 GitLab 用户名，点「保存」"
        assert out["ok"] is False and out["problem"]["fix"] == "me" and out["me"]["label"] == "你的 GitLab 用户名"
        if kit_path == "fallback":
            assert out["problem"]["text"] == "brain-kit 不知道你是谁：这个仓库用 GitLab（https://gitlab.example.com）"
    finally:
        bk.unload()


def test_with_a_token_gitlab_says_who_and_a_set_name_wins_otherwise(tmp_path, home, login, monkeypatch):
    repo = project(tmp_path, kit=GITLAB)
    monkeypatch.setenv("GITLAB_TOKEN", "fake-" + "0" * 20)
    assert identity.of(str(repo), "https://gitlab.example.com", token=True) == dict(
        identity.of(str(repo), "https://gitlab.example.com", token=True), source="token", ask=False, name=None)
    monkeypatch.delenv("GITLAB_TOKEN")
    sh("git", "-C", repo, "config", "brain.user", "Dave")
    got = identity.of(str(repo), "https://gitlab.example.com", token=False)
    assert (got["name"], got["source"], got["ask"]) == ("dave", "git", False)
    sh("git", "-C", repo, "config", "brain.user", "Bad Name")
    bad = identity.of(str(repo), "", token=False)
    assert bad["ask"] and bad["name"] is None and "Bad Name" in bad["error"] and bad["why"] == identity.WHY_LOCAL
    monkeypatch.setenv("BRAIN_USER", "erin")
    env = identity.of(str(repo), "https://gitlab.example.com", token=False)
    assert (env["name"], env["source"]) == ("erin", "env")


def test_the_name_route_takes_brainkits_names_only_runs_no_shell_and_stores_no_token(tmp_path, home, login):
    repo = project(tmp_path, kit=GITLAB)
    svc = make_service(tmp_path, [repo])
    routes = mod("handlers").build_routes(svc, AppRoute, web=FakeWeb(), is_owner=lambda _r: True)
    planted = tmp_path / "planted"
    token = "fake-" + "1" * 24

    async def go():
        out = {}
        for i, name in enumerate(["a b", "-x", "x" * 65, "$(touch %s)" % planted, "alice;touch %s" % planted, "", None,
                                  42, "名字", "../x"]):
            out["bad%d" % i] = await call(routes, "POST", "/me/name", json_body={"path": str(repo), "name": name})
        out["rel"] = await call(routes, "POST", "/me/name", json_body={"path": "pay", "name": "alice"})
        out["ok"] = await call(routes, "POST", "/me/name", json_body={"path": str(repo), "name": " Alice.W-1 ",
                                                                     "token": token})
        out["same_rule"] = identity.user_re() is bk.m("common").USER_RE
        return out

    got = started(svc, go)
    for k in [k for k in got if k.startswith("bad")]:
        assert (got[k].status, got[k].code) == (400, "invalid_name"), k
        assert "小写字母" in got[k].body["error"]
    assert (got["rel"].status, got["rel"].code) == (400, "invalid_path")
    assert not planted.exists()
    assert got["ok"].status == 200 and got["ok"].body["me"]["name"] == "alice.w-1"
    assert got["ok"].body["text"] == "这个仓库的 git config brain.user 设成了 alice.w-1"
    assert sh("git", "-C", repo, "config", "--local", "brain.user").stdout.strip() == "alice.w-1"
    assert token not in json.dumps(got["ok"].body) and token not in (repo / ".git" / "config").read_text()
    assert got["same_rule"] and identity.valid("alice") and not identity.valid("Alice")


def test_who_are_you_in_plain_chinese_with_the_input_as_the_fix():
    old = "brain: who are you? set GITLAB_TOKEN (preferred) or `git config brain.user <gitlab-username>`"
    new = ("brain: who are you? this repo uses GitLab (https://gitlab.example.com): set GITLAB_TOKEN (preferred) or "
           "`git config brain.user <your GitLab username>`; it must be your GitLab username: GitLab checks who pushes "
           "ai/<name>/... and the bridge checks who handed over")
    login = ("brain: who are you? your login name is not usable as a name here: `git config brain.user <name>` "
             "(lowercase letters, digits, . _ -)")
    bad = "brain: brain.user 'Bad Name' is not a GitLab username"
    rows = {k: problems.row("FAIL", t, repo="/r") for k, t in (("old", old), ("new", new), ("login", login), ("bad", bad))}
    assert {k: r["fix"] for k, r in rows.items()} == {"old": "me", "new": "me", "login": "me", "bad": "me"}
    assert rows["old"]["text"] == "brain-kit 不知道你是谁"
    assert rows["new"]["text"] == "brain-kit 不知道你是谁：这个仓库用 GitLab（https://gitlab.example.com）"
    assert rows["new"]["todo"].startswith("要你在 GitLab 上的用户名：认领和交接都按它认人")
    assert rows["login"]["text"] == "brain-kit 不知道你是谁：这台机器的登录名不能当名字"
    assert rows["bad"]["text"] == "这个仓库记下的名字（Bad Name）不能用"
    assert all(r["raw"] and "点「保存」" in r["todo"] for r in rows.values())        # the command only under 细节 (raw)
    assert problems.row("FAIL", old)["fix"] is None                    # no repo: nothing to set it in
    assert problems.who_row("Started nothing\n" + new + "\n", repo="/r")["text"] == rows["new"]["text"]
    assert problems.who_row("brain: no such requirement", repo="/r") is None
