"""Brain: entries by file and section with sources and usage, lint, reflect preview (nothing written) and apply
(brain-kit's own command: a new brain/<KEY>-reflect-<n> branch)."""

import json

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
            prev = await svc.reflect_preview("r1", "PAY-1")
            applied = await svc.reflect_apply("r1", "PAY-1", push=False)
            again = await svc.reflect_preview("r1", "PAY-1")
            return view, prev, applied, again
        finally:
            await svc.stop()

    view, prev, applied, again = run(go())
    tech = next(f for f in view["files"] if f["key"] == "TECH")
    assert tech["count"] == 1 and tech["sections"][0]["title"] == "外部系统"
    e = tech["sections"][0]["entries"][0]
    assert e["id"] == "T-PAY-9-1" and e["type"] == "pitfall" and e["src"] == ["D-1"] and "自然日" in e["text"]
    assert view["lint"]["errors"] == [] and view["ref"] == "main"
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
    assert again["ops"] == [] and any("already" in n for n in again["notes"])  # the same proposal is not written twice


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
    assert prev["problems"] and "fantasy" in prev["problems"][0]
