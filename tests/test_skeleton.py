"""The app's frame: the manifest names it apart from aidlc-team, every route but /health is the dashboard owner's
only (never an app token), and the routes answer under plain pytest with the fake aiohttp."""

import asyncio
import json
from types import SimpleNamespace

import pytest

from http_fakes import FakeRequest, FakeWeb

import backend.routes as routes
from appkit import ROOT


class Route:
    def __init__(self, method, path, handler):
        self.method, self.path, self.handler = method, path, handler


def build(tmp_path, owner=True):
    ctx = SimpleNamespace(name="brain", logger=None, data_dir=str(tmp_path / "data"))
    svc = routes.service.Service(ctx)
    return svc, {(r.method, r.path): r.handler for r in routes.handlers.build_routes(svc, Route, web=FakeWeb(),
                                                                                    is_owner=lambda _r: owner)}


def call(handler, **req):
    return asyncio.run(handler(FakeRequest(**req), None))


def test_the_manifest_is_brains_own():
    m = json.loads((ROOT / "app.json").read_text())
    assert m["name"] == "brain" and m["ui"]["pages"][0]["route"] == "/apps/brain"
    assert m["permissions"]["api"] == ["/api/apps/brain", "/api/chat"] and m["permissions"]["sessionApproval"] is True
    assert "aidlc" not in json.dumps(m).lower()
    c = routes.service  # the private namespace differs from aidlc-team's
    assert c.__name__.startswith("_brainapp_backend.")
    from appkit import mod
    k = mod("constants")
    assert (k.APP_NAME, k.LOCAL_FOLDER, k.RUNNER_FOLDER) == ("brain", "Brain 需求", "Brain 运行机")
    assert "aidlc-team" not in str(k.WORK_ROOT)


def test_health_needs_no_login(tmp_path):
    _, r = build(tmp_path)
    resp = call(r[("GET", "/health")])
    assert resp.status == 200 and resp.body["ok"] is True


def test_every_other_route_is_the_owners_only(tmp_path):
    _, r = build(tmp_path, owner=False)
    for (method, path), h in r.items():
        if path == "/health":
            continue
        assert call(h, method=method, user=None).status == 401, path
        assert call(h, method=method, app="brain").status == 403, path  # an app token, this app's included
        assert call(h, method=method).status == 403, path  # signed in, but not the owner


def test_bad_ids_are_refused_before_anything_runs(tmp_path):
    _, r = build(tmp_path)
    resp = call(r[("GET", "/requirements/{repo}/{key}")], match_info={"repo": "../etc", "key": "PAY-1"})
    assert resp.status == 404 and resp.body["code"] == "no_repo"
    resp = call(r[("GET", "/requirements/{repo}/{key}")], match_info={"repo": "r1", "key": "pay-1; rm"})
    assert resp.status == 400 and resp.body["code"] == "invalid_key"
    resp = call(r[("POST", "/crew/fix")], json_body={"what": "everything"})
    assert resp.status == 400 and resp.body["code"] == "invalid_fix"
    resp = call(r[("POST", "/requirements/{repo}/{key}/answer")], match_info={"repo": "r1", "key": "PAY-1"},
                json_body={"choice": "A", "id": "approve"})
    assert resp.status == 400 and resp.body["code"] == "invalid_id"


def test_settings_are_checked_before_they_are_saved(tmp_path, home):
    svc, r = build(tmp_path)
    resp = call(r[("POST", "/settings")], json_body={"repos": ["relative/path"], "work_root": "/tmp/elsewhere",
                                                     "team": {"enabled": True}})
    assert resp.status == 400 and "绝对路径" in resp.body["error"] and "workplace" in resp.body["error"]
    assert "就要填「桥的配置文件」" in resp.body["error"]       # 设置's own label, not team.bridge_config
    assert not (tmp_path / "data" / "settings.json").exists()


OLDER = [
    # 9935b11: the hand-over commit rule (a method: nothing else imports it, so the copy still imports)
    ("bridge/handoff.py", lambda t: t.replace("def handoff_commit_problems(", "def _handoff_commit_problems_gone("),
     "bridge.handoff.Bridge.handoff_commit_problems"),
    # 72b278e: the edit signal (GitLab GraphQL's lastEditedBy, through rest.GitLab.note_edits)
    ("rest.py", lambda t: t.replace("def note_edits(", "def _note_edits_gone("), "rest.GitLab.note_edits"),
]


@pytest.mark.parametrize("path,cut,lacks", OLDER, ids=["9935b11", "72b278e"])
def test_an_older_brainkit_is_refused(tmp_path, path, cut, lacks):
    """The app (and its signer) need brain-kit 72b278e's interfaces: a checkout without one of them is refused with a
    message naming what it lacks and the commit needed, not half used. (A copy of the checkout with one taken out.)"""
    import shutil
    from appkit import BRAINKIT, mod
    if not (BRAINKIT / "brainkit" / "__init__.py").is_file():
        pytest.skip("brain-kit checkout not found")
    old = tmp_path / "old-brain-kit"
    shutil.copytree(BRAINKIT / "brainkit", old / "brainkit", ignore=shutil.ignore_patterns("__pycache__"))
    f = old / "brainkit" / path
    f.write_text(cut(f.read_text(encoding="utf-8")), encoding="utf-8")
    bk = mod("bk")
    try:
        got = bk.load(str(old))
        assert got["ok"] is False and lacks in got["error"] and "72b278e" in got["error"], got
        assert bk.load(str(BRAINKIT))["ok"] is True
    finally:
        bk.unload()
    # the signer refuses it too (its own process, as it runs)
    import subprocess
    import sys
    probe = "import sys; sys.path.insert(0, %r); import brain_signer; brain_signer.load_brainkit(sys.argv[1])" % str(
        ROOT / "signer")
    p = subprocess.run([sys.executable, "-I", "-c", probe, str(old)], capture_output=True, text=True)
    assert p.returncode != 0 and lacks in p.stderr and "72b278e" in p.stderr, p.stderr
    p = subprocess.run([sys.executable, "-I", "-c", probe, str(BRAINKIT)], capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
