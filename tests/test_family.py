"""大需求拆成小需求 through the app (backend/core/family.py, the service's family_* routes), against brain-kit's own split
(0d52e97): a bare origin, alice's checkout listed in the app (her big requirement PAY-1 started the app's way, its
Inception done and approved with a real AI-DLC Lean: three units api, web (depends on api), jobs), and bob in a clone
of his own. The split's preview then the split, the rows and their families, first one wins on a claim, a start held
by its dependency and the one built on its branch (--on), 同步, 放弃认领, 待办, and the guards (only a child, only its
owner, only the big one's owner splits)."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from appkit import BRAINKIT, mod, no_hooks_config, sh
from brainfix import PY, FakeGateway, brain, install_brain_dev, lean, make_project, make_service, needs_brainkit, run, \
    start_in_worktree

HAVE_SPLIT = (BRAINKIT / "brainkit" / "split.py").is_file()
pytestmark = [needs_brainkit, pytest.mark.skipif(not HAVE_SPLIT, reason="brain-kit before 0d52e97 has no brain split")]

REQUIREMENTS = """# Requirements: 退款大需求

AI-DLC stage: Inception · Requirements Analysis · Intent: {intent}
Size: large

## Goal
买家在订单页申请退款，后台按规则自动审核，每晚对账。

## Acceptance criteria
| ID | Given / when | Then (expected) |
|---|---|---|
| AC-1 | POST /refunds 一个 14 天内的订单 | 201，退款单状态 pending |
| AC-2 | 订单页点"申请退款" | 显示退款单状态 |
| AC-3 | 每晚 02:00 对账任务 | 两边笔数一致 |
"""
STORIES = """# User Stories: 退款大需求

## Stories
| ID | As a | I want | So that | ACs |
|---|---|---|---|---|
| US-1 | 买家 | 通过接口提交退款 | 钱能退回 | AC-1 |
| US-2 | 买家 | 在订单页看到退款状态 | 知道进度 | AC-2 |
| US-3 | 运营 | 每晚自动对账 | 账不出错 | AC-3 |
"""
DESIGN = """# Application Design: 退款大需求

## Components and responsibilities
| Component | Responsibility | New / changed / existing |
|---|---|---|
| refunds api | 建退款单 | new |
| web | 订单页退款按钮 | changed |
| jobs | 夜间对账 | new |

## Key decisions
- 三个单元，api 先做，web 用它的接口
"""
UNITS = """# Units of Work: 退款大需求

| Unit | Owner team | Paths | Depends on | Contracts | Stories / ACs | Status |
|---|---|---|---|---|---|---|
| api | api | services/api/** | - | - | US-1 | not started |
| web | web | web/** | api | - | US-2 | not started |
| jobs | jobs | jobs/** | - | - | US-3 | not started |
"""


def approve(wt: Path, kind: str) -> None:
    """The person types the approval line Lean asked for (Lean's own prompt hook records it)."""
    p = lean(wt, "request", kind, check=False)
    m = re.search(r"approve %s ([0-9a-f]{8})" % kind, p.stdout + p.stderr)
    assert m, p.stdout + p.stderr
    p = subprocess.run([PY, ".kiro/aidlc-lean/aidlc_lean.py", "hook", "UserPromptSubmit"], cwd=wt, text=True,
                       capture_output=True, input=json.dumps({"prompt": "approve %s %s" % (kind, m.group(1)),
                                                              "session_id": "s-%s" % kind.lower()}))
    assert p.returncode == 0 and "NOT recorded" not in p.stdout + p.stderr, p.stdout + p.stderr


def write(base: Path, rel: str, text: str) -> None:
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def inception(wt: Path, key: str = "PAY-1", design: bool = True) -> str:
    """The big requirement's Inception, as its brain-dev session would leave it: requirements, stories, the design and
    its unit split, REQUIREMENTS and DESIGN approved (the units recorded before), all committed."""
    intent = json.loads((wt / "runs" / key / "run.json").read_text(encoding="utf-8"))["intent"]
    docs = "aidlc-docs/%s" % intent
    lean(wt, "stage", "skip", "reverse-engineering", "--reason", "greenfield")
    write(wt, docs + "/inception/requirements/requirements.md", REQUIREMENTS.format(intent=intent))
    lean(wt, "stage", "done", "requirements", "--note", "AC-1..3")
    lean(wt, "stage", "start", "user-stories")
    write(wt, docs + "/inception/user-stories/stories.md", STORIES)
    lean(wt, "stage", "done", "user-stories", "--note", "US-1..3")
    lean(wt, "stage", "start", "application-design")
    write(wt, docs + "/inception/application-design/application-design.md", DESIGN)
    lean(wt, "stage", "done", "application-design", "--note", "three units")
    lean(wt, "stage", "start", "units")
    write(wt, docs + "/inception/application-design/unit-of-work.md", UNITS)
    lean(wt, "stage", "done", "units", "--note", "api, web, jobs")
    approve(wt, "REQUIREMENTS")
    if design:
        approve(wt, "DESIGN")
    sh("git", "-C", wt, "add", "-A")
    sh("git", "-C", wt, "commit", "-q", "-m", "%s: inception" % key)
    return intent


def person(tmp: Path, origin: Path, name: str) -> Path:
    """Someone else's clone of the project (their name is brain.user there)."""
    path = tmp / name
    sh("git", "clone", "-q", origin, path)
    with open(path / ".git" / "config", "a", encoding="utf-8") as f:
        f.write("[user]\n\tname = %s\n\temail = %s@example.com\n[commit]\n\tgpgsign = false\n[brain]\n\tuser = %s\n"
                % (name, name, name) + no_hooks_config(path))
    return path


@pytest.fixture
def world(tmp_path, home):
    repo = make_project(tmp_path, origin=True)
    install_brain_dev(home)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "big", "big", "退款大需求")
    intent = inception(wt)
    gw = FakeGateway()
    gw.templates = {"brain-dev"}
    svc = make_service(tmp_path, [repo], gw=gw)
    return SimpleNamespace(repo=repo, wt=wt, intent=intent, origin=tmp_path / "pay-origin.git", tmp=tmp_path, home=home,
                           svc=svc, gw=gw)


def rows_of(ov):
    return {r["key"]: r for r in ov["rows"]}


def claim_ref(repo: Path, key: str) -> bool:
    return sh("git", "-C", repo, "rev-parse", "-q", "--verify", "refs/remotes/origin/claim/%s" % key, check=False).returncode == 0


def started(w, fn):
    async def go():
        await w.svc.start()
        try:
            return await fn()
        finally:
            await w.svc.stop()
    return run(go())


def test_the_preview_files_nothing_then_the_split_files_three_small_ones(world):
    """A big one with its units approved: 拆成小需求 is offered to its owner; the preview lists the units, their paths
    and dependencies and files nothing; the split files three small ones nobody has (待认领), their rows and the big
    one's roll-up from brain-kit's own listing."""
    w = world

    async def go():
        before = rows_of(await w.svc.overview("all"))["PAY-1"]
        pre = await w.svc.family_split("r1", "PAY-1", False)
        none_yet = not claim_ref(w.repo, "PAY-2")
        done = await w.svc.family_split("r1", "PAY-1", True)
        return before, pre, none_yet, done, await w.svc.overview("all"), await w.svc.board("r1", "PAY-1")

    before, pre, none_yet, done, ov, board = started(w, go)
    fam = before["family"]
    assert fam["role"] == "big" and fam["acts"]["split"] == {"ok": True, "why": ""}, fam
    assert pre["ok"] and pre["dry_run"] and none_yet, pre
    assert [(a["unit"], a["kind"], a["key"]) for a in pre["actions"]] == [("api", "new", None), ("web", "new", None),
                                                                           ("jobs", "new", None)]
    assert pre["actions"][0]["paths"] == ["services/api/**"] and pre["actions"][1]["depends_on"] == ["api（新）"]
    assert pre["actions"][0]["kind_label"] == "新登记（待认领）" and pre["text"].startswith("会拆成 3 个小需求"), pre
    assert pre["units_sha"] and pre["design_sha"] and pre["branch"] == "ai/alice/PAY-1-big"
    assert done["ok"] and not done["dry_run"] and [a["key"] for a in done["actions"]] == ["PAY-2", "PAY-3", "PAY-4"]
    rows = rows_of(ov)
    for k, unit in (("PAY-2", "api"), ("PAY-3", "web"), ("PAY-4", "jobs")):
        r = rows[k]
        assert r["state"] == "unclaimed" and r["state_label"] == "待认领", r
        f = r["family"]
        assert (f["role"], f["parent"], f["unit"], f["state"], f["owner"], f["source"]) == (
            "child", "PAY-1", unit, "unclaimed", None, "brainkit"), f
        assert f["acts"]["claim"] == {"ok": True, "why": ""} and f["acts"]["release"] is None
    web = rows["PAY-3"]["family"]
    assert web["blocked_by"] == ["PAY-2"] and web["depends_on"][0]["text"] == "PAY-2（api，待认领）", web
    assert web["acts"]["start"]["ok"] is False and "PAY-2（api，待认领）" in web["acts"]["start"]["why"]
    assert web["acts"]["start_on"] is None                     # nobody has started api: no branch to build on
    assert rows["PAY-4"]["family"]["acts"]["start"] == {"ok": True, "why": ""}
    p = rows["PAY-1"]["family"]
    assert p["role"] == "parent" and [c["key"] for c in p["children"]] == ["PAY-2", "PAY-3", "PAY-4"]
    assert p["progress"]["total"] == 3 and p["progress"]["unclaimed"] == 3 and p["family_state"] == "in_progress"
    assert rows["PAY-1"]["waits"]["text"].startswith("等小需求合进来：已合并 0/3"), rows["PAY-1"]["waits"]
    assert board["row"]["family"]["role"] == "parent" and "rollup" in board
    assert "token" not in json.dumps(done).lower()


def test_first_one_wins_and_the_loser_sees_who_has_it(world):
    """bob claims api from his clone; alice's 认领 of it, a moment later through the app, is refused with who has it.
    Her 认领 of jobs works, 待办 says she can start it, and 放弃认领 makes it 待认领 again."""
    w = world
    bob = person(w.tmp, w.origin, "bob")

    async def go():
        await w.svc.family_split("r1", "PAY-1", True)
        assert brain(bob, "claim", "PAY-2").returncode == 0
        lost = await w.svc.family_claim("r1", "PAY-2", False)
        won = await w.svc.family_claim("r1", "PAY-4", False)
        todo = await w.svc.todo()
        again = await w.svc.family_claim("r1", "PAY-4", True)
        return lost, won, todo, again, rows_of(await w.svc.overview("all"))

    lost, won, todo, again, rows = started(w, go)
    assert lost["ok"] is False and lost["owner"] == "bob" and lost["text"] == "晚了一步：PAY-2 已经被 bob 认领了", lost
    assert lost["problem"]["todo"] == "换一个待认领的小需求" and "claimed by bob" in lost["problem"]["raw"]
    assert won["ok"] and won["text"] == "认领了 PAY-4" and won["owner"] == "alice", won
    item = next(i for i in todo["items"] if i["kind"] == "child_start")
    assert item["key"] == "PAY-4" and "可以开工" in item["text"], todo["items"]
    assert again["ok"] and again["text"] == "放回去了：PAY-4 又是待认领", again
    assert rows["PAY-4"]["state"] == "unclaimed" and rows["PAY-2"]["family"]["owner"] == "bob"
    w = rows["PAY-2"]["waits"]
    assert (w["who"], w["do"], w["text"], w["where"]) == ("people", "start", "等 bob 开工", "app"), w


def test_a_start_waits_for_its_dependency_or_builds_on_its_branch(world):
    """web depends on api. While bob has only claimed api, alice's 开工 of web is refused, naming api and who has it,
    with no way to build on it; once bob started api, brain-kit lets her start web on its branch (--on): her worktree
    under the work root, its brain-dev session told the unit; 同步 then merges the big one's branch in."""
    w = world
    bob = person(w.tmp, w.origin, "bob")

    async def go():
        await w.svc.family_split("r1", "PAY-1", True)
        assert brain(bob, "claim", "PAY-2").returncode == 0
        held = await w.svc.family_start("r1", "PAY-3", None, True, True)
        out = brain(bob, "start", "--key", "PAY-2", env={"HOME": str(w.home)})
        assert out.returncode == 0, out.stdout + out.stderr
        await w.svc.refresh("r1")
        await w.svc.overview("all")
        w.svc.families.make_now("r1", str(w.repo))
        acts = rows_of(await w.svc.overview("all"))["PAY-3"]["family"]["acts"]
        on = await w.svc.family_start("r1", "PAY-3", "PAY-2", True, True)
        sync = await w.svc.family_sync("r1", "PAY-3")
        return held, acts, on, sync, rows_of(await w.svc.overview("all"))

    held, acts, on, sync, rows = started(w, go)
    assert held["ok"] is False and held["can_on"] is None, held
    assert [(d["key"], d["unit"], d["owner"]) for d in held["blocked"]] == [("PAY-2", "api", "bob")]
    assert held["text"] == "PAY-3 要等 PAY-2（api，bob 认领了）合进大需求的分支 ai/alice/PAY-1-big 才能开工", held
    assert acts["start"]["ok"] is False and acts["start_on"] == "PAY-2", acts
    assert on["ok"] and on["on"] == "PAY-2" and on["branch"] == "ai/alice/PAY-3-web", on
    wt = Path(on["worktree"])
    assert wt == (w.home / "workplace" / "brain-app" / "pay" / "pay-3-web").resolve() or wt.name == "pay-3-web"
    assert json.loads((wt / "runs" / "PAY-3" / "run.json").read_text())["built_on"] == "PAY-2"
    assert on["url"] and on["slot"], on
    sent = [m for msgs in w.gw.msgs.values() for m in msgs if m.get("role") == "user"]
    assert any("单元 web" in m["content"] and "runs/PAY-3/intent.md" in m["content"] for m in sent), sent
    assert sync["ok"] and sync["result"] in ("up_to_date", "merged"), sync
    f = rows["PAY-3"]["family"]
    assert f["state"] == "in_progress" and f["owner"] == "alice" and f["acts"]["sync"] == {"ok": True, "why": ""}
    assert rows["PAY-3"]["state"] == "local"


def test_the_guards(world):
    """Only a small one is claimed or started here, never someone else's; only the big one's owner splits; a
    dependency to build on must be one of its own."""
    w = world
    AppError = mod("httpkit").AppError

    async def go():
        await w.svc.family_split("r1", "PAY-1", True)
        out = {}
        for name, call in (("claim_parent", w.svc.family_claim("r1", "PAY-1", False)),
                           ("split_child", w.svc.family_split("r1", "PAY-2", False)),
                           ("on_other", w.svc.family_start("r1", "PAY-3", "PAY-4", False, True)),
                           ("release_unowned", w.svc.family_claim("r1", "PAY-4", True)),
                           ("runner", w.svc.family_claim("runner", "PAY-4", False))):
            try:
                out[name] = await call
            except AppError as e:
                out[name] = e
        return out

    got = started(w, go)
    assert got["claim_parent"].status == 409 and "只有拆出来的小需求" in str(got["claim_parent"])
    assert got["split_child"].status in (404, 409)
    assert got["on_other"].status == 400 and "不依赖" in str(got["on_other"])
    assert got["release_unowned"].status == 409
    assert got["runner"].status == 404


def test_without_the_design_approval_the_split_is_off_and_the_preview_says_why(tmp_path, home):
    repo = make_project(tmp_path, origin=True)
    install_brain_dev(home)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "big", "big", "退款大需求")
    inception(wt, design=False)
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            row = rows_of(await svc.overview("all"))["PAY-1"]
            return row, await svc.family_split("r1", "PAY-1", False)
        finally:
            await svc.stop()

    row, pre = run(go())
    act = row["family"]["acts"]["split"]
    assert act["ok"] is False and act["why"].startswith("批了设计以后才能拆"), act
    assert pre["ok"] is False and pre["dry_run"], pre
    assert any(p["text"].startswith("设计还没批") for p in pre["problems"]), pre["problems"]
    assert all(p["todo"] or p["level"] == "OK" for p in pre["problems"])


def test_a_big_one_opened_here_says_so_and_its_session_is_told(tmp_path, home):
    """开需求's 「大需求：先拆成小需求」: the row is a big one before any unit-of-work.md, and the kickoff tells the
    brain-dev session to split the design into units with brain-split before the DESIGN approval."""
    repo = make_project(tmp_path)
    install_brain_dev(home)
    gw = FakeGateway()
    gw.templates = {"brain-dev"}
    svc = make_service(tmp_path, [repo], gw=gw)

    async def go():
        await svc.start()
        try:
            nxt = await svc.intake_next("r1")
            out = await svc.intake_start({"repo": "r1", "slug": "big", "title": "退款大需求", "docs": [], "paths": [],
                                          "open_session": True, "trust": True, "big": True})
            return nxt, out, rows_of(await svc.overview("all"))
        finally:
            await svc.stop()

    nxt, out, rows = run(go())
    assert nxt["big"] == {"ok": True, "why": ""}
    assert out["ok"] and out["url"], out
    fam = rows[out["key"]]["family"]
    assert fam["role"] == "big" and fam["acts"]["split"]["ok"] is False and "批了设计" in fam["acts"]["split"]["why"]
    sent = [m["content"] for msgs in gw.msgs.values() for m in msgs if m.get("role") == "user"]
    assert any("skill brain-split" in m and "unit-of-work.md" in m for m in sent), sent
