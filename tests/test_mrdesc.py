"""需求详情's 变更说明 and the overview row's first line of it (brain-kit's `brain mr-desc`, 72b278e; 48b6b97 commits
runs/<KEY>/MR.md into the hand-over): MR.md as committed when the branch has it, else made from the run's records at
that commit (mrdesc.build / render). Never from uncommitted files, never through a symlink, and never by running the
project's own Lean; the text is inert (no @mention, HTML, quick action, approval or answer line acts when it is pasted
into GitLab)."""

import json
import os
import time

from appkit import mod
from brainfix import make_project, make_service, needs_brainkit, run, sh, start_in_worktree

pytestmark = needs_brainkit

REQ = """# Requirements: 退款单导出 CSV

Size: small

## Goal
退款单可以导出成 CSV，给财务对账用。导出按自然日。

## Not doing
- 不做 Excel 导出

## Acceptance criteria
| ID | Given / When | Then |
|---|---|---|
| AC-1 | 选一段日期 | 下载这段时间的退款单 CSV |
"""

MR_MD = """## PAY-1 · 退款单导出 CSV

**一句话**：退款单可以导出成 CSV（规模 small）。现在：在本地开发（还没交接）。
@carol 请看一下
/merge
approve RELEASE 1234abcd
answer D-1 approve
<!-- 藏起来的内容 -->
![x](https://evil.example/pixel.png)
"""


def local_run(tmp_path, home):
    repo = make_project(tmp_path)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款单导出 CSV")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    req = wt / "aidlc-docs" / intent / "inception" / "requirements" / "requirements.md"
    req.parent.mkdir(parents=True, exist_ok=True)
    req.write_text(REQ, encoding="utf-8")
    sh("git", "-C", wt, "add", "-A")
    sh("git", "-C", wt, "commit", "-qm", "requirements")
    return repo, wt, req


def tip(wt):
    return sh("git", "-C", wt, "rev-parse", "HEAD").stdout.strip()


def views(svc, *, wait_first=False):
    async def go():
        await svc.start()
        try:
            first = await svc.overview("r1")
            deadline = time.monotonic() + 60
            while wait_first and time.monotonic() < deadline:
                ov = await svc.overview("r1")
                if all(r["summary"] for r in ov["rows"] if r["key"] == "PAY-1"):
                    break
                time.sleep(0.2)
            d = await svc.requirement("r1", "PAY-1")
            return first, await svc.overview("r1"), d
        finally:
            await svc.stop()

    return run(go())


def files(wt):
    """Every file of the worktree (but .git) with its mtime: what running the project's own code would change."""
    out = {}
    for d, dirs, names in os.walk(wt):
        dirs[:] = [x for x in dirs if x != ".git"]
        for n in names:
            p = os.path.join(d, n)
            out[os.path.relpath(p, wt)] = os.lstat(p).st_mtime_ns
    return out


def test_made_from_the_records_at_the_commit(tmp_path, home):
    repo, wt, req = local_run(tmp_path, home)
    req.write_text(REQ.replace("给财务对账用", "这句还没提交"), encoding="utf-8")     # not committed: not in it
    before = files(wt)
    svc = make_service(tmp_path, [repo])
    started = time.monotonic()
    first, ov, d = views(svc, wait_first=True)
    m = d["mr_desc"]
    assert m["available"] is True and m["source"] == "records" and m["error"] == "", m
    assert m["ref"] == tip(wt)[:12] and m["path"] == "runs/PAY-1/MR.md"
    assert m["text"].startswith("## PAY-1 · 退款单导出 CSV") and "brain mr-desc" in m["text"]
    assert m["first"].startswith("退款单可以导出成 CSV，给财务对账用（规模 small）") and "这句还没提交" not in m["text"]
    # the overview row: nothing while it is being made in the background, then its first line
    assert first["rows"][0]["summary"] is None
    # in plain words (OVERVIEW-16): no Markdown, no source references, 规模小; where it is the row says itself
    assert ov["rows"][0]["summary"] == "退款单可以导出成 CSV，给财务对账用（规模小）。"
    assert time.monotonic() - started < 60
    # nothing of the project was run (Lean's fingerprint would write its stat cache in .aidlc-lean/), nothing written
    assert files(wt) == before


def test_the_committed_mr_md_is_shown_inert(tmp_path, home):
    repo, wt, _ = local_run(tmp_path, home)
    md = wt / "runs" / "PAY-1" / "MR.md"
    md.write_text(MR_MD, encoding="utf-8")
    sh("git", "-C", wt, "add", "-A")
    sh("git", "-C", wt, "commit", "-qm", "MR.md")
    md.write_text("not committed\n", encoding="utf-8")                               # the commit's counts
    svc = make_service(tmp_path, [repo])
    _, ov, d = views(svc, wait_first=True)
    m = d["mr_desc"]
    assert m["source"] == "file" and m["ref"] == tip(wt)[:12] and m["path"] == "runs/PAY-1/MR.md", m
    t = m["text"]
    assert "not committed" not in t and "## PAY-1 · 退款单导出 CSV" in t
    assert "@" not in t and "＠carol 请看一下" in t                                     # no mention
    assert "\n\\/merge\n" in t                                                         # no quick action
    assert "\n> approve RELEASE 1234abcd\n" in t and "\n> answer D-1 approve\n" in t    # no approval, no answer
    assert "<" not in t and "＜!-- 藏起来的内容 --＞" in t.replace(">", "＞")              # no HTML comment
    assert "![" not in t                                                               # no image loaded
    assert m["first"] == "退款单可以导出成 CSV（规模 small）。现在：在本地开发（还没交接）。"
    assert ov["rows"][0]["summary"] == "退款单可以导出成 CSV（规模小）。"


def test_a_symlinked_mr_md_is_not_read(tmp_path, home):
    """A run that commits runs/<KEY>/MR.md as a symlink (to a file on this machine) gets the description from its
    records: the link is not followed, its target never shows."""
    repo, wt, _ = local_run(tmp_path, home)
    secret = home / ".brain" / "gitlab-token"
    secret.parent.mkdir(parents=True, exist_ok=True)
    secret.write_text("glpat-not-for-the-page\n")
    os.symlink(str(secret), str(wt / "runs" / "PAY-1" / "MR.md"))
    sh("git", "-C", wt, "add", "-A")
    sh("git", "-C", wt, "commit", "-qm", "a link")
    svc = make_service(tmp_path, [repo])
    _, _, d = views(svc)
    m = d["mr_desc"]
    assert m["source"] == "records" and "glpat" not in json.dumps(d) and "gitlab-token" not in m["text"], m


def test_a_claim_without_a_run_has_none(tmp_path, home):
    from brainfix import brain
    repo = make_project(tmp_path)
    brain(repo, "claim", "--title", "只认领")
    svc = make_service(tmp_path, [repo])
    _, ov, d = views(svc)
    assert ov["rows"][0]["summary"] is None
    assert d["mr_desc"]["text"] == "" and d["mr_desc"]["source"] is None and "开工以后" in d["mr_desc"]["error"]


def test_first_line_and_the_cache():
    mv = mod("mrdesc_view")
    assert mv.first_line("## K · t\n\n**一句话**：做了 A。现在：B。\n（分支 x）\n") == "做了 A。现在：B。"
    assert mv.first_line("# 标题\n\n| a | b |\n- 一条\n真正的第一句。\n") == "真正的第一句。"
    assert mv.first_line("") is None
    cache = mv.DescCache()
    made = []

    def make():
        made.append(1)
        return {"first": "一句", "text": "x"}

    assert cache.first(("p", "s", "m", "K", 1.0), make) is None                # made in the background
    deadline = time.monotonic() + 10
    while cache.get(("p", "s", "m", "K", 1.0)) is None and time.monotonic() < deadline:
        time.sleep(0.01)
    assert cache.first(("p", "s", "m", "K", 2.5), make) == "一句"             # other credits: the same commits
    assert cache.get_or_make(("p", "s", "m", "K", 1.0), make)["text"] == "x" and len(made) == 1
    assert cache.get_or_make(("p", "s2", "m", "K", None), make) and len(made) == 2
