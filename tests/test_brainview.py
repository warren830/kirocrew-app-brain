"""Brain: entries by file and section with sources and usage, lint, reflect preview (nothing written) and apply
(brain-kit's own command: a new brain/<KEY>-reflect-<n> branch)."""

import json

from appkit import mod
from brainfix import brain, make_project, make_service, needs_brainkit, run, sh, start_in_worktree

pytestmark = needs_brainkit

PROPOSAL = """
## Brain proposals

```brain-proposal
file: TECH
type: pitfall
rel: new
section: 外部系统
src: D-2
---
退款单号以产品确认为准：样例文件里的位数是旧格式。
```
"""


def test_entries_usage_lint_and_reflect(tmp_path, home):
    repo = make_project(tmp_path)
    brain(repo, "entry", "add", "TECH", "pitfall", "--key", "PAY-9", "--src", "D-1", "--section", "外部系统",
          "--text", "对账文件按自然日切分。")
    sh("git", "-C", repo, "add", "-A")
    sh("git", "-C", repo, "commit", "-qm", "brain entry")
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    dec = wt / "aidlc-docs" / intent / "decisions.md"
    dec.write_text(dec.read_text() + "| D-2 | 2026-11-08 | requirements | 按 T-PAY-9-1 切分 | Brain | agent |\n" + PROPOSAL)
    sh("git", "-C", wt, "commit", "-qam", "decisions")
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            view = await svc.brain("r1")
            item = await svc.requirement("r1", "PAY-1")
            prev = await svc.reflect_preview("r1", "PAY-1")
            applied = await svc.reflect_apply("r1", "PAY-1", push=False)
            again = await svc.reflect_preview("r1", "PAY-1")
            return view, item, prev, applied, again
        finally:
            await svc.stop()

    view, item, prev, applied, again = run(go())
    tech = next(f for f in view["files"] if f["key"] == "TECH")
    assert tech["count"] == 1 and tech["sections"][0]["title"] == "外部系统"
    e = tech["sections"][0]["entries"][0]
    assert e["id"] == "T-PAY-9-1" and e["type"] == "pitfall" and e["src"] == ["D-1"] and "自然日" in e["text"]
    assert view["lint"]["errors"] == [] and view["ref"] == "main"
    # the run is not merged: the Brain's numbers (merged runs only) leave it out, and it is listed on its own with the
    # numbers 需求详情 shows for it
    assert view["usage"]["runs"] == [] and view["usage"]["useful"] == [0, 1]
    assert view["usage"]["unmerged"] == [{"key": "PAY-1", "loaded": 1, "cited": ["T-PAY-9-1"], "where": "worktree"}]
    assert (item["brain"]["loaded"], item["brain"]["cited"]) == (1, ["T-PAY-9-1"])
    assert [r["key"] for r in view["reflect"]] == ["PAY-1"]
    assert prev["error"] == "" and prev["problems"] == [] and prev["substantive"] is True
    assert [(o["kind"], o["file"], o["type"], o["section"]) for o in prev["ops"]] == [("new", "TECH", "pitfall", "外部系统")]
    assert applied["ok"] and applied["branch"] == "brain/PAY-1-reflect-1", applied["output"]
    assert sh("git", "-C", repo, "rev-parse", "--verify", "-q", "brain/PAY-1-reflect-1").returncode == 0
    # live regression 2026-11-09: the reply names the worktree brain-kit wrote the branch in (it printed it)
    wt_reflect = applied["worktree"]
    assert wt_reflect and wt_reflect in applied["output"], applied
    assert sh("git", "-C", wt_reflect, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip() == "brain/PAY-1-reflect-1"
    assert wt_reflect.startswith(str(home / ".brain" / "worktrees")) and "brain-PAY-1-reflect-1" in wt_reflect
    assert sh("git", "-C", repo, "status", "--porcelain", "--untracked-files=no").stdout.strip() == ""
    # the same proposal is not written twice; brain-kit's English is said in Chinese, its own words kept for 细节
    assert again["ops"] == [] and again["notes"] == ["第 13 行的提议已经在回写分支 brain/PAY-1-reflect-1 上了（MR 还没合并），跳过"]
    assert again["raw"] == ["proposal at line 13: already on brain/PAY-1-reflect-1 (MR not merged yet), skipped"]
    assert applied["mr_url"] is None and applied["pushed"] is False


def test_a_bad_proposal_is_a_problem_in_the_preview(tmp_path, home):
    repo = make_project(tmp_path)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "x", "x", "x")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    dec = wt / "aidlc-docs" / intent / "decisions.md"
    dec.write_text(dec.read_text() + PROPOSAL.replace("type: pitfall", "type: fantasy"))
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            return await svc.reflect_preview("r1", "PAY-1")
        finally:
            await svc.stop()

    prev = run(go())
    assert prev["problems"] and prev["problems"][0].startswith("第 ") and "类型不对：技术只收 原则、" in prev["problems"][0], prev
    assert "fantasy" in prev["raw"][-1]


def test_reflect_says_brainkit_in_chinese_and_any_other_english_points_to_the_details():
    bv = mod("brainview")
    assert bv.reflect_says("proposal at line 27: already in the Brain as P-DEMO-1-1, skipped") == \
        "第 27 行的提议 Brain 里已经有了（P-DEMO-1-1），跳过"
    assert bv.reflect_says("D-3 (V-1a2b) was rejected, but no correction or repeats proposal cites it") == \
        "D-3 被否了（凭证 V-1a2b），可是没有一条纠正或「又出现」的提议提到它"
    assert bv.reflect_says("T-PAY-2-1 只加来源，不改文字") == "T-PAY-2-1 只加来源，不改文字"
    assert bv.reflect_says("a sentence nobody translated") == "brain-kit 说了一句这里还没翻译的话：原话在「细节」里"


def test_brain_kit_failing_to_read_the_use_is_said_in_words_its_own_in_raw(tmp_path, home, monkeypatch):
    """REST-29: 「Brain 用量读不出来」 says what still shows; brain-kit's exception is kept for 细节, not in the sentence."""
    repo = make_project(tmp_path)
    brain(repo, "entry", "add", "TECH", "pitfall", "--key", "PAY-9", "--src", "D-1", "--text", "对账文件按自然日切分。")
    sh("git", "-C", repo, "add", "-A")
    sh("git", "-C", repo, "commit", "-qm", "brain entry")
    svc = make_service(tmp_path, [repo])

    def broken(*a, **k):
        raise RuntimeError("usage.collect: cannot read runs/PAY-1/run.json at refs/heads/main")

    async def go():
        await svc.start()
        try:
            monkeypatch.setattr(mod("bk").m("usage"), "collect", broken)
            return await svc.brain("r1")
        finally:
            await svc.stop()

    view = run(go())
    assert view["error"] == mod("brainview").NO_USAGE and "run.json" not in view["error"]
    assert view["raw"] == "usage.collect: cannot read runs/PAY-1/run.json at refs/heads/main"
    assert [e["id"] for f in view["files"] for s in f["sections"] for e in s["entries"]] == ["T-PAY-9-1"]
