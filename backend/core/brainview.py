"""Brain: the entries on the default branch by file and section with their sources, how runs use them
(brainkit.usage: the runs merged into the default branch; a run not merged yet is listed on its own, read where
需求详情 reads it, so the two pages say the same numbers), lint (brainkit.brainlint, static rules; each line a
CheckRow, the legacy ids one quiet note: problems.lint_rows), and reflect (brainkit.reflect).

brain-kit says what reflect found in English (``proposal at line 27: already in the Brain as P-7, skipped``): the
preview carries each line in Chinese (REFLECT_SAYS) and the originals in ``raw``, for the page to fold.

Reflect preview is the planning half of ``brain reflect`` (cmd_reflect): parse the run's brain-proposal and brain-gap
blocks, plan them against the Brain on main (ids used on open brain/* branches skipped, proposals already written
skipped), lint the dry run; nothing is written. ``--apply`` / ``--push`` are brain-kit's own command, run as is (a new
branch brain/<KEY>-reflect-<n> in its own worktree under ~/.brain/worktrees/<repo>/; with --push the MR); its output
is shown verbatim, and the reply names the branch and that worktree (git's own list: the worktree that has the new
branch checked out; else the folder brain-kit printed).
"""

from __future__ import annotations

import os
import re
import subprocess
from typing import Any

from . import bk, problems
from .intake import brain_cmd
from .repo import Repo

MIN_RUNS = 3
SECTION_RE = re.compile(r"^##\s+(.+?)\s*$")
BRANCH_RE = re.compile(r"brain/[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-reflect-[1-9][0-9]*")
# what `brain reflect --apply --push` prints (cmd_reflect): the MR it opened; pushed (also without a GitLab token)
MR_URL_RE = re.compile(r"已推送并开 MR：(https?://\S+)")
PUSHED_RE = re.compile(r"^已推送", re.M)
# what `brain reflect --apply` prints about its worktree (cmd_reflect): committed, not committed, pushed without a token
PRINTED_WT_RE = (re.compile(r"已提交到本地分支 \S+（(/[^（）\n]+)）"), re.compile(r"写在 (/[^（\n]+?)（分支 "),
                 re.compile(r"描述在 (/[^\n]+?)\.mr\.md"))


# what the page says when brain-kit cannot read the Brain or its use (brain-kit's own words go in ``raw``, folded)
UNREADABLE = "读不出这个仓库默认分支上的 Brain：细节里是 brain-kit 的原话，看不懂就发给维护 brain-kit 的人"
NO_USAGE = "Brain 用量读不出来：条目照常显示，有用率和每次运行这次没有数字。细节里是 brain-kit 的原话"
FILE_NAME = {"PRODUCT": "产品", "TECH": "技术", "IMPROVEMENT": "改进", "PROJECT": "项目"}
TYPE_NAME = {"principle": "原则", "correction": "纠正", "decision": "决定", "model": "模型", "guideline": "准则",
             "pitfall": "坑", "process": "流程"}
_AT = r"(?P<w>proposal|gap) at line (?P<n>\d+): "


def _names(text: str, table: dict[str, str]) -> str:
    return "、".join(table.get(x.strip(" '\""), x.strip()) for x in text.split(","))


# brain reflect's English (reflect.parse, plan, plan_gaps, rejected_without_correction, source_text) → one Chinese line
REFLECT_SAYS: list[tuple[re.Pattern[str], Any]] = [(re.compile(rx), say) for rx, say in [
    (_AT + r"already in the Brain as (?P<id>\S+), skipped$", "{at} Brain 里已经有了（{id}），跳过"),
    (_AT + r"already on (?P<br>\S+) \(MR not merged yet\), skipped$", "{at}已经在回写分支 {br} 上了（MR 还没合并），跳过"),
    (_AT + r"same text as (?P<id>\S+): recorded as same \(sources added\)$", "{at}和 {id} 的文字一样：只给 {id} 补来源"),
    (_AT + r"unknown fields (?P<f>.+)$", "{at}有认不出的字段：{f}"),
    (_AT + r"rel must be one of .+$", "{at}和已有条目的关系写错了"),
    (_AT + r"src is required .*$", "{at}没写来源：要写出自哪一段、哪个决定或哪次运行"),
    (_AT + r"source (?P<s>.+) is not a reference$", "{at}来源 {s} 不是认得出的出处"),
    (_AT + r"rel \S+ needs an entry id$", "{at}要改已有的条目，却没写是哪一条"),
    (_AT + r"(?P<id>\S+) is archived$", "{at}要改的 {id} 已经归档了"),
    (_AT + r"(?P<id>\S+) is not in the Brain$", "{at}要改的 {id} 不在 Brain 里"),
    (_AT + r"(?P<id>\S+) is in (?P<a>[A-Z]+), not (?P<b>[A-Z]+)$",
     lambda m, at: "%s写错了文件：%s 在%s里，不在%s里" % (at, m["id"], FILE_NAME.get(m["a"], m["a"]), FILE_NAME.get(m["b"], m["b"]))),
    (_AT + r"(?P<f>[A-Z]+) takes (?P<t>.+), not (?P<x>.+)$",
     lambda m, at: "%s类型不对：%s只收 %s" % (at, FILE_NAME.get(m["f"], m["f"]), _names(m["t"], TYPE_NAME))),
    (_AT + r"text is empty.*$", "{at}没有正文"),
    (_AT + r"file is required$", "{at}没写放进哪个文件"),
    (_AT + r"section is only for new entries$", "{at}只有新条目能写小节"),
    (_AT + r"section: up to 40 characters.*$", "{at}小节名太长，或用了不能用的字符（最多 40 个字）"),
    (_AT + r"kind must be one of .+$", "{at}种类写错了：只能是知识、测试或其他"),
    (r"^line (?P<n>\d+): \S+ block is not closed$", "第 {n} 行的块没有结束（少了收尾的 ```）"),
    (r"^line (?P<n>\d+): (?P<k>\S+) given twice$", "第 {n} 行：{k} 写了两次"),
    (r"^line (?P<n>\d+): expected 'key: value' or '---'$", "第 {n} 行的格式不对：要写成「名字: 内容」或 ---"),
    (r"^(?P<item>\S+) in (?P<d>\S+) \((?P<v>[^)]*)\) was rejected, but no correction or repeats proposal cites \S+$",
     "{d} 里的 {item} 被否了（凭证 {v}），可是没有一条纠正或「又出现」的提议提到它"),
    (r"^(?P<d>\S+) \((?P<v>[^)]*)\) was rejected, but no correction or repeats proposal cites it$",
     "{d} 被否了（凭证 {v}），可是没有一条纠正或「又出现」的提议提到它"),
    (r"^no run for (?P<key>\S+) (?:on this machine|here)\b.*$", "这台机器上没有 {key} 的运行记录：合并以后再回写，或者先把它的分支拉下来"),
    (r"^\S+ not found here; pass --ref .*$", "这台机器上找不到这次运行的记录：合并以后再回写"),
    (r"^\S+ has no \S+$", "读不到这次运行的记录：合并以后再回写"),
    (r"^\S+ not found$", "读不到这次运行的决定记录"),
    (r"^\S+ is not valid JSON: .*$", "这次运行的记录坏了，读不出来"),
    (r"^\S+ has no valid intent$", "这次运行的记录不完整"),
]]
_CJK = re.compile(r"[\u4e00-\u9fff]")


def reflect_says(line: str) -> str:
    """One line brain reflect said, in Chinese: a known sentence translated, Chinese as it is, any other English as a
    note that the original is in 细节."""
    line = str(line).strip()
    for rx, say in REFLECT_SAYS:
        m = rx.match(line)
        if m:
            g = m.groupdict()
            at = ("第 %s 行的%s" % (g["n"], "提议" if g["w"] == "proposal" else "缺口")) if g.get("w") else ""
            return say(m, at) if callable(say) else say.format(at=at, **{k: v for k, v in g.items() if v is not None})
    return line if _CJK.search(line) else "brain-kit 说了一句这里还没翻译的话：原话在「细节」里"


def _brain(repo: Repo) -> tuple[Any, str]:
    E = bk.m("entries")
    ref = repo.main_ref()
    if ref:
        return E.Brain.from_git(repo.path, ref, repo.cfg["brain_dir"]), ref.replace("refs/remotes/", "").replace(
            "refs/heads/", "").replace("origin/", "")
    return E.Brain.load(os.path.join(repo.path, repo.cfg["brain_dir"])), "工作区"


def unmerged_usage(repo: Repo) -> list[dict[str, Any]]:
    """The Brain use of each run not merged into the default branch yet, read where 需求详情 reads it (its worktree,
    else its branch) with the same brainkit.usage row: its intent and key, else its intent."""
    groups: dict[tuple[str, str | None], list[dict[str, Any]]] = {}
    for f in repo.scan():
        run = f.get("run") or {}
        if f.get("merged") or not run.get("intent") or not (f.get("worktree") or f.get("ref")):
            continue
        groups.setdefault(_where(repo, f), []).append(f)
    out = []
    for (src, ref), facts in groups.items():
        try:
            u = bk.m("usage").collect(src, repo.cfg, ref=ref)
        except Exception:  # noqa: BLE001 - one unreadable run does not take the page down
            continue
        runs = u.get("runs") or []
        for f in facts:
            intent = f["run"]["intent"]
            r = next((x for x in runs if x.get("intent") == intent and x.get("key") == f["key"]), None) or \
                next((x for x in runs if x.get("intent") == intent), None)
            if r is not None:
                out.append({"key": f["key"], "loaded": r.get("loaded"), "cited": list(r.get("cited") or []),
                            "where": "worktree" if f.get("worktree") else "branch"})
    return sorted(out, key=lambda x: x["key"])


def view(repo: Repo, reflectable: list[dict[str, Any]]) -> dict[str, Any]:
    """BrainView (blocking: call it in a thread)."""
    E = bk.m("entries")
    out: dict[str, Any] = {"repo": repo.id, "ref": "", "files": [], "lint": {"errors": [], "warnings": []},
                           "usage": {"useful": [0, 0], "repeat_rate": [0, 0], "archived": 0, "purged": 0, "runs": [],
                                     "never_cited": [], "repeats_any": [], "unmerged": []},
                           "reflect": reflectable, "error": "", "raw": ""}
    try:
        brain, label = _brain(repo)
    except bk.brain_error() as exc:
        out["error"], out["raw"] = UNREADABLE, str(exc)[:2000]
        return out
    out["ref"] = label
    try:
        u = bk.m("usage").collect(repo.path, repo.cfg, ref=repo.main_ref())
    except Exception as exc:  # noqa: BLE001 - usage is a view: the entries still show
        u = None
        out["error"], out["raw"] = NO_USAGE, str(exc)[:2000]
    used = {x["id"]: x for x in (u or {}).get("entries") or []}
    for key in E.FILES:
        f = brain.files.get("%s.md" % key)
        sections: list[dict[str, Any]] = []
        cur = {"title": "", "entries": []}
        count = 0
        for b in (f.blocks if f is not None else []):
            if isinstance(b, str):
                m = SECTION_RE.match(b)
                if m:
                    if cur["entries"] or cur["title"]:
                        sections.append(cur)
                    cur = {"title": m.group(1)[:60], "entries": []}
                continue
            x = used.get(b.id, {})
            count += 1
            cur["entries"].append({
                "id": b.id, "type": b.type, "side": b.attrs.get("side", ""), "rel": b.attrs.get("rel", "new"),
                "repeats": max(b.repeats, 0), "src": b.src, "text": b.text()[:4000],
                "cites": int(x.get("cites") or 0), "runs": int(x.get("runs") or 0),
                "loaded_by": int(x.get("loaded_by") or 0),
                "candidate": bool(x) and not x.get("cites") and int(x.get("loaded_by") or 0) >= MIN_RUNS})
        if cur["entries"] or cur["title"]:
            sections.append(cur)
        sections = [s for s in sections if s["entries"]]
        meta = E.FILES[key]
        out["files"].append({"key": key, "letter": meta["letter"], "side": meta["side"], "types": list(meta["types"]),
                             "count": count, "sections": sections})
    errors, warnings = bk.m("brainlint").check(brain)
    out["lint"] = problems.lint_rows(errors, warnings, brain_dir=str(repo.cfg.get("brain_dir") or "brain"),
                                     repo=repo.path, prefix=str(repo.cfg.get("req_prefix") or ""))
    if u:
        out["usage"] = {
            "useful": list(u.get("useful") or [0, 0]), "repeat_rate": list(u.get("repeat_rate") or [0, 0]),
            "archived": int(u.get("archived") or 0), "purged": int(u.get("purged") or 0),
            "runs": [{"intent": r["intent"], "key": r.get("key") or "", "loaded": r.get("loaded"),
                      "cited": list(r.get("cited") or []), "stale": list(r.get("stale") or []),
                      "unknown": list(r.get("unknown") or [])} for r in u.get("runs") or []],
            "never_cited": [x["id"] for x in u.get("entries") or [] if not x["cites"] and x["loaded_by"] >= MIN_RUNS],
            "repeats_any": [[i, n] for i, n in u.get("repeats_any") or []], "unmerged": []}
    out["usage"]["unmerged"] = unmerged_usage(repo)
    return out


def _where(repo: Repo, facts: dict[str, Any]) -> tuple[str, str | None]:
    """(the repo to read the run from, the ref): its worktree's files, else its branch or main."""
    if facts.get("worktree"):
        return facts["worktree"], None
    return repo.path, facts.get("ref")


def preview(repo: Repo, facts: dict[str, Any], vouchers_dir: str | None) -> dict[str, Any]:
    R, E = bk.m("reflect"), bk.m("entries")
    key = facts["key"]
    out = {"repo": repo.id, "key": key, "source": "", "ops": [], "gaps": [], "notes": [], "warnings": [],
           "problems": [], "substantive": False, "error": "", "raw": []}
    base = repo.main_ref()
    if not base:
        out["error"] = "这个仓库没有 %s 分支" % repo.cfg["default_branch"]
        return out
    src_repo, ref = _where(repo, facts)
    try:
        mcfg = R.main_cfg(repo.path, base)
        text, label = R.source_text(src_repo, repo.cfg, key, ref=ref)
        out["source"] = re.sub(r"^refs/(?:remotes/origin|remotes|heads)/", "", label)
        proposals, probs = R.parse(text)
        gaps = []
        if hasattr(R, "parse_gaps"):
            gaps, more = R.parse_gaps(text)
            probs += more
        brain = E.Brain.from_git(repo.path, base, mcfg["brain_dir"])
        used, pending = R.open_branches(repo.path, mcfg["brain_dir"])
        ops, more, notes = R.plan(brain, proposals, key, pending=pending, used_extra=used)
        probs += more
        rows = []
        if gaps and hasattr(R, "plan_gaps"):
            rows, more = R.plan_gaps(repo.path, repo.cfg, gaps, key)
            probs += more
        lost = R.rejected_without_correction(vouchers_dir, key, proposals) if vouchers_dir else []
    except bk.brain_error() as exc:
        out["raw"] = [str(exc)]
        out["error"] = reflect_says(str(exc).split("\n", 1)[0])
        return out
    out["ops"] = [{"kind": op.kind, "target": op.kw.get("eid"), "file": op.kw.get("file"), "type": op.kw.get("type"),
                   "section": op.kw.get("section"), "src": list(op.p.src), "text": E.norm(op.p.body)[:2000]}
                  for op in ops]
    for r in rows:
        g = r.get("gap")
        if g is None:
            continue
        what = "之前已登记 %s" % (r["existing"] or {}).get("key") if r.get("existing") else "写入时登记成新需求"
        out["gaps"].append({"title": str(getattr(g, "title", ""))[:200], "kind": str(getattr(g, "kind", "")), "what": what})
    said = [str(n) for n in notes], [str(w) for w in lost], [str(p) for p in probs]
    out["notes"], out["warnings"], out["problems"] = ([reflect_says(x) for x in xs] for xs in said)
    out["raw"] = [x for xs in said for x in xs]
    out["substantive"] = bool(ops) and R.substantive(ops)
    return out


def apply(repo: Repo, facts: dict[str, Any], push: bool) -> dict[str, Any]:
    """``brain reflect --key KEY [--ref REF] --apply [--push]`` (blocking)."""
    src_repo, ref = _where(repo, facts)
    args = ["reflect", "--key", facts["key"], "--apply"]
    if ref:
        args += ["--ref", ref]
    if push:
        args.append("--push")
    env = dict(os.environ)
    env.update({"GIT_TERMINAL_PROMPT": "0", "PYTHONIOENCODING": "utf-8"})
    try:
        p = subprocess.run(brain_cmd() + args, cwd=src_repo, capture_output=True, text=True, timeout=600, env=env)
        text, code = ((p.stdout or "") + (("\n" + p.stderr) if p.stderr else "")).strip(), p.returncode
    except subprocess.TimeoutExpired:
        text, code = "brain reflect 超过 600 秒没结束", 124
    except OSError as exc:
        text, code = "跑不了 brain：%s" % exc, 127
    m = BRANCH_RE.search(text)
    branch = m.group(0) if m else None
    mr = MR_URL_RE.search(text) if code == 0 else None
    repo.invalidate()
    return {"ok": code == 0, "output": text[-20000:], "branch": branch,
            "worktree": reflect_worktree(repo, branch, text) if code == 0 else None,
            "mr_url": mr.group(1) if mr else None, "pushed": code == 0 and push and bool(PUSHED_RE.search(text))}


def reflect_worktree(repo: Repo, branch: str | None, text: str) -> str | None:
    """The worktree `brain reflect --apply` wrote *branch* in: the one git lists with that branch checked out (the
    truth, whatever brain-kit printed), else the folder its output names."""
    if branch:
        for w in repo.git.worktrees():
            if w.get("branch") == "refs/heads/" + branch and os.path.isdir(w.get("path") or ""):
                return w["path"]
    for rx in PRINTED_WT_RE:
        hit = rx.search(text)
        if hit and os.path.isdir(hit.group(1)):
            return hit.group(1)
    return None
