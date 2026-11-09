"""大需求拆成小需求: a big requirement's approved unit split filed as small requirements that others claim and build in
parallel, merged back into the big one's run branch (brain-kit's split, phase 1: docs/安装和使用.md §4.7).

Read: brain-kit's own listing, ``brain intent list --all --json`` (docs/intents.md §2.5): every claim with its state
and, for a split, each parent's children, progress, family_state and released, each child's blocked_by. It is run in
the background (Families: a worker thread, at most every FAMILY_TTL_S per repo that has split requirements, and again
right after an action here or 「从远端取最新」); like ``brain intent list`` it fetches the claims and the parent's branch
from origin, here with no prompt and a time limit. Until it has answered, a row says what this machine's refs say (the
child's claim.json as last fetched: parent, unit, depends_on, owner). ``families`` turns either into each row's
ReqFamily (ui/src/types.ts), with what this person can do on it here (acts).

Act: each one `<brainkit>/bin/brain` as a command (run_brain: no shell, stdin closed, its own session, the network
without a prompt, a time limit that sends SIGINT first so brain-kit gives back what it took, then kills), its output
said in plain Chinese (the RULES below; brain-kit's own words kept as raw):
  split    ``brain split <PARENT> --dry-run --json`` (the preview: units, paths, dependencies, warnings), then on
           confirm ``brain split <PARENT> --json``, in the big requirement's worktree on this machine
  claim    ``brain claim <KEY>`` (first one wins) / ``brain claim --release <KEY>``, in the repo; only for a child
           ``brain split`` filed (brain-kit files a new claim for any other key)
  start    ``brain start --key <CHILD> [--on <DEP>] --worktree <work_root>/<repo>/<key>-<unit>`` in the repo (its
           worktree under work_root, where KiroCrew lets agents work); AIDLC_LEAN_TEAM is not passed on
  sync     ``brain sync`` in the child's worktree
"""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from . import importer, problems
from .constants import KEY_RE

FAMILY_TTL_S = 60.0
TIMEOUT_S = {"list": 90, "split": 300, "claim": 120, "start": 600, "sync": 300}
MAX_OUT = 20000
UNIT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")         # brain-kit's intents.UNIT_RE (Lean's)
USER_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
UNITS_DOC = "inception/application-design/unit-of-work.md"         # split.UNITS_DOC
CHILD_STATES = ("unclaimed", "claimed", "in_progress", "merged", "closed")
FAMILY_STATES = ("in_progress", "ready_to_release", "done", "closed")
# brain-kit's words (commands/intent_cmd.STATE_TEXT, FAMILY_TEXT), shorter where the page has less room
STATE_TEXT = {"unclaimed": "待认领", "claimed": "%s 认领了", "in_progress": "%s 在做", "merged": "已合并", "closed": "已关闭"}
FAMILY_TEXT = {"in_progress": "小需求在做", "ready_to_release": "都合并了：等大需求评审和发布",
               "done": "发布了、小需求都合并了", "closed": "已关闭"}
# commands/split_cmd.KIND_TEXT
KIND_TEXT = {"new": "新登记（待认领）", "same": "没变", "update": "改了（还没人认领，已更新）",
             "changed": "拆分变了，但已经有人认领或开工：没改", "close": "单元没了，关掉（还没人认领）",
             "removed": "单元没了，但已经有人认领或开工：没关", "close_duplicate": "重复，关掉",
             "duplicate": "重复，但已经有人认领：没关", "raced": "同时拆了两次，这个关掉"}
ATTENTION = ("changed", "removed", "duplicate")


# ---- running brain-kit -------------------------------------------------------------------------------------------- #

def run_brain(args: list[str], cwd: str, timeout: float) -> subprocess.CompletedProcess:
    """``bin/brain <args>`` in *cwd*: no shell, stdin closed, its own session (no terminal to ask anything), git over
    the network without a prompt (importer.quiet_env). At *timeout* it gets SIGINT first (brain-kit gives back a claim
    it took, a half-made worktree), then SIGKILL; exit 124."""
    env = importer.quiet_env(cwd)
    env.pop("AIDLC_LEAN_TEAM", None)       # brain-kit refuses a child start when it is set (it overrides the team)
    from .intake import brain_cmd
    cmd = brain_cmd() + list(args)
    try:
        p = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace",
                             start_new_session=True)
    except OSError as exc:
        return subprocess.CompletedProcess(cmd, 127, "", "跑不了 brain：%s" % exc)
    try:
        out, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        for sig, wait in ((signal.SIGINT, 15), (signal.SIGKILL, None)):
            try:
                os.killpg(p.pid, sig)
            except OSError:
                p.kill()
            try:
                out, err = p.communicate(timeout=wait)
                break
            except subprocess.TimeoutExpired:
                continue
        return subprocess.CompletedProcess(cmd, 124, out or "", (err or "") + "\n（超过 %d 秒，停掉了）" % timeout)
    return subprocess.CompletedProcess(cmd, p.returncode, out or "", err or "")


def output(p: subprocess.CompletedProcess) -> str:
    """What brain printed, stdout then stderr, credentials in URLs hidden, cut."""
    text = ((p.stdout or "").strip() + ("\n" + p.stderr.strip() if (p.stderr or "").strip() else "")).strip()
    return importer.hide_credentials(text[-MAX_OUT:])


def refusals(p: subprocess.CompletedProcess) -> list[str]:
    """brain-kit's refusal (`brain: <message>` on stderr, exit 2), its lines; the reasons of a list each on their own."""
    text = (p.stderr or "").strip()
    if text.startswith("brain: "):
        text = text[len("brain: "):]
    lines = [x.strip() for x in text.splitlines() if x.strip()]
    out = []
    for x in lines:
        x = x[2:].strip() if x.startswith("- ") else x
        if x.endswith(":") and out == [] and len(lines) > 1:
            continue       # "no approved unit split in …:" heads the list of reasons
        out.append(x)
    return out[:20] or ([text[:500]] if text else [])


# ---- what brain-kit says, in plain Chinese ------------------------------------------------------------------------ #

K = r"(?P<k>[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6})"
RULES: list[tuple[re.Pattern, str, str]] = [(re.compile(rx, re.S), t, d) for rx, t, d in (
    # brain split (split.py plan / approved_split / parse_units), brain claim, brain start --key, brain sync
    (r"^current branch (?P<b>\S+) is not a run branch", "这里不是大需求自己的运行分支（{b}）",
     "在大需求的工作区里拆（brain start 开的那个）"),
    (r"^this branch \((?P<b>\S+)\) is the run of %s, not (?P<p>\S+?):" % K, "这个工作区是 {k} 的，不是 {p} 的",
     "在 {p} 自己的工作区里做"),
    (r"^%s's run belongs to (?P<o>\S+); only its owner splits it" % K, "只有 {k} 的负责人 {o} 能拆它", "请 {o} 来拆"),
    (r"^%s is itself a child of (?P<p>\S+?) \(unit (?P<u>[^)]+)\)" % K, "{k} 自己就是 {p} 拆出来的小需求（{u}）",
     "拆大需求 {p}，不是拆小需求"),
    (r"^%s has no claim" % K, "{k} 没有认领记录", "先认领它（brain claim {k}）"),
    (r"^%s is claimed by (?P<o>\S+?); only they split it" % K, "{k} 是 {o} 认领的：只有 {o} 能拆", "请 {o} 来拆"),
    (r"^tracker is (?P<t>\S+?): children are claims", "这个仓库用 {t} 管需求：只有 tracker none 的仓库能拆",
     "小需求是 brain-kit 的认领记录：接 Jira 的仓库还不能拆"),
    (r"^(?P<u>\S+) is a bot account", "{u} 是机器人账号：不能拆，也不能认领", ""),
    (r"^commit Lean's records first", "Lean 的记录还没提交",
     "先提交 aidlc-docs/ 和 runs/ 的改动（在会话里让 agent 提交，或者 git commit），再拆"),
    (r"^requirements\.md is (?P<s>\w+)", "需求还没批（requirements.md 是 {s}）", "先在会话里批 REQUIREMENTS"),
    (r"^application-design\.md is (?P<s>\w+)", "设计还没批（application-design.md 是 {s}）",
     "在会话里批 DESIGN：批 DESIGN 就是批了这个拆法"),
    (r"^the application design was skipped", "设计这一步跳过了：没有可拆的单元", "大需求要做应用设计和拆单元"),
    (r"^(?P<f>\S+) is missing: run Units Generation", "还没拆单元（没有 unit-of-work.md）",
     "在会话里让 agent 按 skill brain-split 拆单元、lean stage done units，再请你批 DESIGN"),
    (r"^Units Generation has no record", "Lean 没记下拆单元这一步", "lean stage done units，再批一次 DESIGN"),
    (r"^Units Generation was skipped", "拆单元这一步跳过了（只有一个单元）", "只有一个单元就不用拆"),
    (r"^Units Generation is in progress again", "又在拆单元了", "做完以后 lean stage done units，再批一次 DESIGN"),
    (r"^unit-of-work\.md changed after `lean stage done units` recorded it", "unit-of-work.md 记下以后又改过",
     "重新 lean stage done units，再批一次 DESIGN"),
    (r"^Units Generation was recorded in another Lean clone", "拆单元和 DESIGN 批准记在了不同的 Lean 副本里",
     "在同一个工作区里重新 lean stage done units，再批 DESIGN"),
    (r"^the unit split \(unit-of-work\.md sha \w+\) is not the one recorded last before the DESIGN approval",
     "现在的拆法不是 DESIGN 批准前最后记下的那个", "lean stage done units，再批一次 DESIGN（设计没改也可以再批）"),
    (r"^(?P<i>\S+) is released", "已经发布了：不能再拆", ""),
    (r"^unit-of-work\.md lists 1 unit", "unit-of-work.md 只有一个单元：不用拆", ""),
    (r"^no approved unit split", "还不能拆：设计和拆法没批好", "看下面每一条"),
    (r"^command failed \(\d+\): git .*\bpush\b", "推不上去", "检查网络或登录（比如 mwinit），再试一次"),
    (r"^the units name contracts, but aidlc-docs/lean\.json is not multi-team", "单元写了契约，但 lean.json 没开多团队",
     "要按 Lean 的变更申请（CR）改契约，由人在 aidlc-docs/lean.json 设 \"multi_team\": true，并写 contracts/OWNERS"),
    (r"^not filed \(refused, not masked\): unit (?P<u>\S+?):", "单元 {u} 没登记：有的文字过不了 Brain 的内容检查",
     "改掉 unit-of-work.md 或用户故事里那段文字，再批 DESIGN、再拆"),
    # brain claim
    (r"^%s is claimed by (?P<o>[a-z0-9][a-z0-9._-]*)$" % K, "晚了一步：{k} 已经被 {o} 认领了", "换一个待认领的小需求"),
    (r"^%s was just claimed by (?P<o>\S+?): their claim reached the server first" % K, "晚了一步：{o} 先认领了 {k}",
     "换一个待认领的小需求"),
    (r"^%s is claimed by (?P<o>\S+?); only they may release it" % K, "{k} 是 {o} 认领的：只有 {o} 能放回", ""),
    (r"^%s has your run branch (?P<b>\S+?): hand the run over or delete the branch first" % K,
     "已经开工了（分支 {b}）：不能放回", "做完交 MR；不做了，先删掉这个分支（本机和远端）再放回"),
    (r"^%s is closed" % K, "{k} 已经关了", ""),
    (r"^could not (?P<what>claim|release) %s:" % K, "没成：推不上去", "检查网络或登录（比如 mwinit），再试一次"),
    # brain start --key (split.start_child)
    (r"^--on (?P<d>\S+?): it has no run branch of its owner \((?P<o>[^)]*)\) yet", "{d} 还没人开工（{o}）：不能在它的分支上先做",
     "等 {d} 开工，或者等它合进大需求"),
    (r"^--on (?P<d>\S+?): it has merged into (?P<b>\S+?) already", "{d} 已经合进大需求了：直接开工就行", ""),
    (r"^--on (?P<d>\S+?): %s does not depend on it" % K, "{k} 不依赖 {d}", ""),
    (r"^--on (?P<d>\S+?): (?P<b>\S+) is not its run of unit", "{b} 不是 {d} 从这次拆分开工的分支", "问一下 {d} 的负责人"),
    (r"^%s's parent run branch (?P<b>\S+) is not here or on origin" % K, "大需求的分支 {b} 这里和远端都没有",
     "请大需求的负责人推送它"),
    (r"^(?P<b>\S+) does not contain the commit (?P<p>\S+) was split at", "大需求的分支 {b} 上没有拆分时的那个提交",
     "请大需求的负责人推送它"),
    (r"^unit (?P<u>\S+) is no longer in (?P<p>\S+?)'s unit split", "单元 {u} 已经不在 {p} 的拆法里了",
     "问大需求的负责人；不做了就关掉这个小需求"),
    (r"^%s depends on unit (?P<u>\S+), which has no open child" % K, "{k} 依赖的单元 {u} 没有对应的小需求",
     "请大需求的负责人再拆一次（brain split）"),
    (r"^(?P<f>\S+) already exists on (?P<r>\S+): this requirement already has a run", "它已经有运行记录了（{r}）", ""),
    (r"^%s already has your run: (?P<b>.+)$" % K, "你已经开工了：{b}", "在需求看板上打开它的会话"),
    (r"^(?P<w>\S+) exists and is not empty", "工作区目录 {w} 已经有东西了", "换一个目录，或者先 git worktree remove 它"),
    (r"^AIDLC_LEAN_TEAM is set", "环境变量 AIDLC_LEAN_TEAM 设了别的团队", "unset AIDLC_LEAN_TEAM 再开工"),
    # brain sync (split.sync)
    (r"^commit or stash your changes first", "还有没提交的改动", "先提交或 stash（Lean 自己的记录会自动提交），再同步"),
    (r"^%s is not a child of a split" % K, "{k} 不是拆出来的小需求", ""),
    (r"^this run belongs to (?P<o>\S+)", "这是 {o} 的运行：只有 {o} 能同步", ""),
    (r"^(?P<b>\S+) is not here or on origin", "{b} 这里和远端都没有", "请大需求的负责人推送它"),
    (r"^(?P<b>\S+) is not a commit here", "{b} 这里没有", "先「从远端取最新」"),
)]


def say(raw: str, level: str = "FAIL", repo: str | None = None) -> dict[str, Any]:
    """One of brain-kit's lines as a CheckRow: the rules above, else problems.row (brain-kit's other words, its hook
    refusals among them), else its generic line with the raw kept."""
    s = " ".join(str(raw or "").split())
    if s.startswith("brain: "):
        s = s[len("brain: "):]
    for rx, text, todo in RULES:
        m = rx.match(s)
        if m:
            g = {k: (v or "") for k, v in m.groupdict().items()}
            return problems.mk(level, text.format(**g), todo.format(**g), None, repo, s[:2000])
    return problems.row(level, s, repo=repo)


WHO_RE = re.compile(r"%s \(unit (?P<u>[^,()]+), (?P<who>[^()]+)\)" % K)


def who_text(who: str) -> tuple[str | None, str | None, str]:
    """split._who ('unclaimed', 'claimed by X', 'X is building it', 'merged', 'closed', 'not filed') as (state,
    owner, words)."""
    w = who.strip()
    m = re.match(r"^claimed by (\S+)$", w)
    if m:
        return "claimed", m.group(1), "%s 认领了" % m.group(1)
    m = re.match(r"^(\S+) is building it$", w)
    if m:
        return "in_progress", m.group(1), "%s 在做" % m.group(1)
    return ({"unclaimed": ("unclaimed", None, "待认领"), "merged": ("merged", None, "已合并"),
             "closed": ("closed", None, "已关闭"), "not filed": (None, None, "没登记")}.get(w, (None, None, w)))


def blocked_deps(text: str) -> tuple[list[dict[str, Any]], str]:
    """The dependencies a refused child start waits for (`… depends on PAY-2 (unit api, claimed by alice), which has
    not merged into <branch> yet`), and the branch."""
    m = re.search(r"depends on (?P<deps>.+?), which (?:has|have) not merged into (?P<b>\S+?) yet", text)
    if not m:
        return [], ""
    out = []
    for d in WHO_RE.finditer(m.group("deps")):
        st, owner, words = who_text(d.group("who"))
        out.append({"key": d.group("k"), "unit": d.group("u").strip(), "state": st, "owner": owner, "merged": False,
                    "text": "%s（%s，%s）" % (d.group("k"), d.group("u").strip(), words)})
    return out, m.group("b")


# ---- the listing -------------------------------------------------------------------------------------------------- #

def listing(repo_path: str) -> tuple[list[dict[str, Any]] | None, str]:
    """``brain intent list --all --json``: (its documents, '') or (None, why in Chinese)."""
    p = run_brain(["intent", "list", "--all", "--json"], repo_path, TIMEOUT_S["list"])
    if p.returncode != 0:
        why = refusals(p)
        return None, say(why[0] if why else output(p))["text"]
    try:
        docs = json.loads(p.stdout or "[]")
    except ValueError:
        return None, "brain intent list 的输出不是 JSON"
    if not isinstance(docs, list):
        return None, "brain intent list 的输出不是列表"
    return [d for d in docs if isinstance(d, dict) and KEY_RE.match(str(d.get("key") or ""))], ""


class Families:
    """brain-kit's listing per repo, made in the background: {rid: (made at, epoch, docs or None, error)}."""

    def __init__(self) -> None:
        self._rows: dict[str, tuple[float, float, list[dict[str, Any]] | None, str]] = {}
        self._running: set[str] = set()
        self._lock = threading.Lock()

    def get(self, rid: str) -> tuple[list[dict[str, Any]] | None, float | None, str]:
        got = self._rows.get(rid)
        return (got[2], got[1], got[3]) if got else (None, None, "")

    def want(self, rid: str, path: str, *, now: bool = False) -> None:
        """Make it again in the background when it is older than FAMILY_TTL_S (or *now*)."""
        with self._lock:
            got = self._rows.get(rid)
            if rid in self._running or (got and not now and time.monotonic() - got[0] < FAMILY_TTL_S):
                return
            self._running.add(rid)
        threading.Thread(target=self._make, args=(rid, path), daemon=True, name="brain-family").start()

    def make_now(self, rid: str, path: str) -> None:
        """Make it here (blocking: after an action, so the answer has it)."""
        with self._lock:
            self._running.add(rid)
        self._make(rid, path)

    def _make(self, rid: str, path: str) -> None:
        try:
            docs, err = listing(path)
            old = self._rows.get(rid)
            if docs is None and old and old[2] is not None:      # keep the last good copy, and say why it is old
                self._rows[rid] = (time.monotonic(), old[1], old[2], err)
            else:
                self._rows[rid] = (time.monotonic(), time.time(), docs, err)
        except Exception as exc:  # noqa: BLE001 - a listing that fails says so on the page
            self._rows[rid] = (time.monotonic(), time.time(), None, str(exc)[:200])
        finally:
            with self._lock:
                self._running.discard(rid)

    def forget(self, rid: str) -> None:
        self._rows.pop(rid, None)


def has_family(facts: list[dict[str, Any]]) -> bool:
    """A repo with split requirements, as this machine's refs show it: a claim or run.json naming a parent."""
    for f in facts:
        c, run = f.get("claim") or {}, f.get("run") or {}
        if c.get("parent") or c.get("source") == "split" or run.get("parent"):
            return True
    return False


# ---- each row's family -------------------------------------------------------------------------------------------- #

def _strs(v: Any, limit: int = 50) -> list[str]:
    return [str(x)[:300] for x in v or [] if isinstance(x, str)][:limit] if isinstance(v, list) else []


def state_label(state: Any, owner: Any) -> str:
    t = STATE_TEXT.get(str(state or ""), str(state or ""))
    return t % (owner or "?") if "%s" in t else t


def _local_state(doc: dict[str, Any], f: dict[str, Any] | None) -> str:
    """A child's state from this machine's refs only (before brain-kit's listing answered): closed, merged (its
    run.json is on the default branch), in_progress (its owner's run branch), unclaimed, claimed."""
    if doc.get("closed"):
        return "closed"
    if f and f.get("merged"):
        return "merged"
    if f and f.get("branch") and doc.get("owner") and f.get("owner") == doc.get("owner"):
        return "in_progress"
    return "unclaimed" if not doc.get("owner") else "claimed"


def designed(f: dict[str, Any]) -> bool:
    """Lean's DESIGN (or INCEPTION) is approved now for this requirement."""
    return any(a.get("kind") in ("DESIGN", "INCEPTION") and a.get("state") == "approved" for a in f.get("approvals") or [])


def released(f: dict[str, Any]) -> bool:
    return any(a.get("kind") == "RELEASE" and a.get("state") == "approved" for a in f.get("approvals") or [])


def units_here(f: dict[str, Any]) -> bool:
    """Its worktree on this machine has the intent's unit-of-work.md (the units it would be split into)."""
    intent = (f.get("run") or {}).get("intent")
    wt = f.get("worktree")
    return bool(wt and isinstance(intent, str) and re.match(r"^[0-9]{6}-[a-z0-9][a-z0-9-]{0,80}$", intent)
                and os.path.isfile(os.path.join(wt, "aidlc-docs", intent, UNITS_DOC)))


def families(facts: list[dict[str, Any]], docs: list[dict[str, Any]] | None, *, me: str | None, cfg: dict[str, Any],
             can_split: bool, big: set[str], at: float | None) -> dict[str, dict[str, Any]]:
    """{key: ReqFamily} for the rows of one repo that are in a family (or opened as a big one): from brain-kit's
    listing *docs* when it answered, else from the claims in *facts* (repo.scan). *big*: the keys opened here as a big
    requirement; *can_split*: the loaded brain-kit has brain split."""
    by_fact = {f["key"]: f for f in facts}
    src = "brainkit" if docs is not None else "local"
    if docs is None:
        docs = []
        for f in facts:
            c = f.get("claim")
            if isinstance(c, dict) and c.get("key") == f["key"]:
                d = dict(c)
                d["state"] = _local_state(d, f) if d.get("parent") else ("closed" if d.get("closed") else "claimed")
                docs.append(d)
    by_key = {str(d["key"]): d for d in docs if d.get("key")}
    kids: dict[str, list[dict[str, Any]]] = {}
    for d in docs:
        if d.get("parent") and KEY_RE.match(str(d["parent"])):
            kids.setdefault(str(d["parent"]), []).append(d)
    if src == "local":
        for d in docs:
            if d.get("parent"):
                d["blocked_by"] = [k for k in _strs(d.get("depends_on")) if (by_key.get(k) or {}).get("state") != "merged"]
    tracker_ok = cfg.get("tracker") == "none"
    out: dict[str, dict[str, Any]] = {}

    def base(role: str, key: str, pkey: str) -> dict[str, Any]:
        p = by_key.get(pkey) or {}
        return {"role": role, "parent": pkey, "parent_title": str(p.get("title") or (by_fact.get(pkey, {}).get("claim") or {})
                                                                   .get("title") or "")[:200],
                "branch": None, "unit": None, "state": None, "state_label": "", "owner": None, "depends_on": [],
                "blocked_by": [], "paths": [], "contracts": [], "children": [], "progress": None, "family_state": None,
                "family_label": "", "released": False,
                "acts": {"split": None, "claim": None, "release": None, "start": None, "start_on": None, "sync": None},
                "source": src, "at": at if src == "brainkit" else None}

    def dep(k: str) -> dict[str, Any]:
        d = by_key.get(k) or {}
        st = d.get("state") if d.get("state") in CHILD_STATES else None
        words = state_label(st, d.get("owner")) if st else "没登记"
        unit = str(d.get("unit") or "") or None
        return {"key": k, "unit": unit, "state": st, "owner": d.get("owner"), "merged": st == "merged",
                "text": "%s（%s）" % (k, "，".join(x for x in (unit, words) if x))}

    for pkey, children in kids.items():
        children = sorted(children, key=lambda d: _order(d["key"]))
        pdoc = by_key.get(pkey) or {}
        fam = base("parent", pkey, pkey)
        branch = next((d["split"]["branch"] for d in reversed(children) if isinstance(d.get("split"), dict)
                       and isinstance(d["split"].get("branch"), str)), None)
        prog = pdoc.get("progress") if isinstance(pdoc.get("progress"), dict) else None
        if prog is None:          # from the children (brain-kit's split.families counts the same)
            count = {s: sum(1 for d in children if d.get("state") == s) for s in CHILD_STATES}
            total = sum(1 for d in children if d.get("state") != "closed")
            prog = {"merged": count["merged"], "total": total, "unclaimed": count["unclaimed"],
                    "claimed": count["claimed"], "in_progress": count["in_progress"], "closed": count["closed"],
                    "text": "%d/%d merged" % (count["merged"], total)}
        pf = by_fact.get(pkey) or {}
        rel = bool(pdoc.get("released")) if "released" in pdoc else released(pf)
        st = pdoc.get("family_state") if pdoc.get("family_state") in FAMILY_STATES else (
            "closed" if pdoc.get("closed") else "done" if prog["total"] and prog["merged"] == prog["total"] and rel
            else "ready_to_release" if prog["total"] and prog["merged"] == prog["total"] else "in_progress")
        fam.update(branch=branch, owner=pdoc.get("owner") or pf.get("owner"),
                   children=[{"key": str(d["key"]), "unit": str(d.get("unit") or "") or None,
                              "title": str(d.get("title") or "")[:200],
                              "state": d.get("state") if d.get("state") in CHILD_STATES else "claimed",
                              "state_label": state_label(d.get("state"), d.get("owner")), "owner": d.get("owner"),
                              "depends_on": _strs(d.get("depends_on")), "blocked_by": _strs(d.get("blocked_by"))}
                             for d in children],
                   progress={k: (int(prog.get(k) or 0) if k != "text" else str(prog.get("text") or "")[:60])
                             for k in ("merged", "total", "unclaimed", "claimed", "in_progress", "closed", "text")},
                   family_state=st, family_label=FAMILY_TEXT.get(st, st), released=rel)
        fam["acts"]["split"] = split_act(pf, me, tracker_ok, can_split) if pf else None
        out[pkey] = fam
        for d in children:
            key = str(d["key"])
            f = by_fact.get(key) or {}
            c = base("child", key, pkey)
            sp = d.get("split") if isinstance(d.get("split"), dict) else {}
            st = d.get("state") if d.get("state") in CHILD_STATES else _local_state(d, f)
            blocked = _strs(d.get("blocked_by"))
            c.update(branch=sp.get("branch") if isinstance(sp.get("branch"), str) else branch,
                     unit=str(d.get("unit") or "") or None, state=st, state_label=state_label(st, d.get("owner")),
                     owner=d.get("owner"), depends_on=[dep(k) for k in _strs(d.get("depends_on"))],
                     blocked_by=blocked, paths=_strs(d.get("expected_paths")), contracts=_strs(d.get("contracts")))
            c["acts"] = child_acts(c, f, me, can_split, by_key)
            out[key] = c
    for key in big:
        f = by_fact.get(key)
        if f and key not in out and not (f.get("claim") or {}).get("parent") and not (f.get("run") or {}).get("parent"):
            fam = base("big", key, key)
            fam.update(owner=f.get("owner"), family_label="大需求：批了 DESIGN 以后拆成小需求")
            fam["acts"]["split"] = split_act(f, me, tracker_ok, can_split)
            out[key] = fam
    return out


def _order(key: str) -> tuple:
    pre, _, n = key.rpartition("-")
    return (pre, int(n) if n.isdigit() else 0)


def split_act(f: dict[str, Any], me: str | None, tracker_ok: bool, can_split: bool) -> dict[str, Any] | None:
    """拆成小需求 on a big (or split) requirement: offered to its owner only; why it cannot be done now."""
    if not f or not me or f.get("owner") != me or not f.get("run"):
        return None
    why = ("brain-kit 太旧：没有 brain split（要 0d52e97 或更新）" if not can_split
           else "这个仓库接 Jira：只有 tracker none 的仓库能拆" if not tracker_ok
           else "已经发布了：不能再拆" if released(f)
           else "要在它的工作区里拆：这台机器上没有它的工作区" if not f.get("worktree")
           else "批了 DESIGN 以后才能拆：设计里要有拆好的单元（unit-of-work.md）" if not designed(f) else "")
    return {"ok": not why, "why": why}


def child_acts(c: dict[str, Any], f: dict[str, Any], me: str | None, can_split: bool,
               by_key: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """What this person can do on a small requirement here: 认领, 放弃认领, 开工 (with why not: the dependency named),
    「在 <DEP> 的分支上先做」 when brain-kit allows it, 同步."""
    acts: dict[str, Any] = {"split": None, "claim": None, "release": None, "start": None, "start_on": None, "sync": None}
    st, owner = c["state"], c["owner"]
    old = "" if can_split else "brain-kit 太旧：没有 brain split（要 0d52e97 或更新）"
    if not me:
        old = old or "先在设置里填上你在这个仓库里的名字"
    if st == "unclaimed":
        acts["claim"] = {"ok": not old, "why": old}
    if st == "claimed" and owner and owner == me:
        acts["release"] = {"ok": not old, "why": old}
    if st in ("unclaimed", "claimed") and (not owner or owner == me):
        deps = [d for d in c["depends_on"] if d["key"] in c["blocked_by"]] or \
               [{"key": k, "text": "%s（还没登记）" % k} for k in c["blocked_by"]]
        why = old or ("要等 %s合进大需求的分支%s" % ("、".join(d["text"] for d in deps),
                                                 "（%s）" % c["branch"] if c["branch"] else "") if deps else "")
        acts["start"] = {"ok": not why, "why": why}
        # brain-kit lets it start on a dependency's branch (--on) only when that one is its only unmerged dependency
        # and that dependency's owner has a run branch (split.start_child; intents' in_progress)
        if not old and len(c["blocked_by"]) == 1:
            d = by_key.get(c["blocked_by"][0]) or {}
            if d.get("state") == "in_progress" and d.get("owner"):
                acts["start_on"] = c["blocked_by"][0]
    if st == "in_progress" and owner and owner == me:
        wt = f.get("worktree")
        acts["sync"] = {"ok": bool(wt) and not old, "why": old or ("" if wt else "这台机器上没有它的工作区")}
    return acts


def classify(row: dict[str, Any], fam: dict[str, Any] | None, f: dict[str, Any], me: str | None) -> None:
    """A row's state and what it waits on, as a family member: a small requirement nobody has (待认领), one merged
    into its big one's branch (已合进大需求), one claimed by someone else, one waiting for its dependencies, one whose MR
    waits for the big one's owner; a big one waiting for its small ones, or ready to be released. What the row says
    otherwise (deliveries.classify: an approval line, a question) stays."""
    from .deliveries import STATE_LABEL

    def put(state: str, who: str, text: str) -> None:
        row["state"], row["state_label"] = state, STATE_LABEL[state]
        row["waits"] = {"who": who, "text": text, "line": None, "raw": ""}

    if not fam:
        return
    st, owner = fam.get("state"), fam.get("owner")
    if fam["role"] == "child":
        if row["state"] in ("merged", "closed"):
            return
        blocked = "、".join(d["text"] for d in fam["depends_on"] if d["key"] in fam["blocked_by"])
        if st == "closed":
            return put("closed", "nobody", "已关闭")
        if st == "merged":
            return put("merged_into_parent", "nobody", "已合进大需求 %s 的分支：等它评审、发布" % fam["parent"])
        if st == "unclaimed" and row["state"] == "claimed":
            return put("unclaimed", "people", "待认领：谁做都可以认领" + ("（开工要等 %s合进大需求）" % blocked if blocked else ""))
        if row["state"] == "claimed":
            if owner and owner != me:
                return put("claimed", "people", "%s 认领了，还没开工" % owner)
            if blocked:
                return put("claimed", "people", "认领了：要等 %s合进大需求才能开工" % blocked)
            return put("claimed", "you", "认领了，依赖都合进来了：可以开工")
        if row["state"] == "local" and st == "in_progress" and owner and owner != me:
            return put("local", "people", "%s 在做" % owner)       # someone else's run (their machine, their session)
        if row["state"] == "local" and isinstance((f.get("run") or {}).get("mr"), dict) and \
                row["waits"].get("who") in ("you", "agent") and not row["waits"].get("line"):
            return put("local", "people", "交了 MR：等大需求的负责人合进 %s" % (fam.get("branch") or "大需求的分支"))
        return
    if fam["role"] == "parent" and row["state"] == "local" and not row["waits"].get("line"):
        pr = fam.get("progress") or {}
        if fam.get("family_state") == "ready_to_release":
            mine = bool(me) and owner == me
            return put("local", "you" if mine else "people",
                       "小需求都合进来了：%s评审、lean release，再批 RELEASE（或者 brain handoff 交给运行机）" % ("" if mine else "等负责人"))
        if fam.get("family_state") == "in_progress" and row["waits"].get("who") in ("you", "agent", "nobody"):
            left = ["%d 个待认领" % pr["unclaimed"] if pr.get("unclaimed") else "",
                    "%d 个认领了" % pr["claimed"] if pr.get("claimed") else "",
                    "%d 个在做" % pr["in_progress"] if pr.get("in_progress") else ""]
            return put("local", "people", "等小需求合进来：已合并 %s/%s%s" % (
                pr.get("merged", 0), pr.get("total", 0), "（%s）" % "，".join(x for x in left if x) if any(left) else ""))


# ---- acting -------------------------------------------------------------------------------------------------------- #

def split(worktree: str, key: str, apply: bool) -> dict[str, Any]:
    """``brain split <KEY> [--dry-run] --json`` in the big requirement's worktree -> SplitResult."""
    p = run_brain(["split", key, "--json"] + ([] if apply else ["--dry-run"]), worktree, TIMEOUT_S["split"])
    out = {"ok": False, "dry_run": not apply, "parent": key, "branch": None, "units_sha": None, "design_sha": None,
           "actions": [], "warnings": [], "text": "", "problems": [], "output": output(p)}
    data = None
    if p.returncode == 0:
        try:
            data = json.loads(p.stdout or "")
        except ValueError:
            data = None
    if not isinstance(data, dict):
        rows = [say(x) for x in refusals(p)] or [say(output(p) or "brain split 失败（退出码 %d）" % p.returncode)]
        out.update(problems=rows, text=("没拆：" if apply else "还不能拆：") + "；".join(
            dict.fromkeys(r["text"] for r in rows[:3])))
        return out
    acts = []
    for a in data.get("actions") or []:
        if not isinstance(a, dict):
            continue
        fl = a.get("fields") if isinstance(a.get("fields"), dict) else {}
        deps = []
        for d in _strs(fl.get("depends_on")):
            m = re.match(r"^\(new (.+)\)$", d)
            deps.append("%s（新）" % m.group(1) if m else d)
        kind = str(a.get("kind") or "")
        acts.append({"unit": str(a.get("unit") or ""), "kind": kind, "kind_label": KIND_TEXT.get(kind, kind),
                     "key": str(a["key"]) if a.get("key") else None, "title": str(fl.get("title") or "")[:200],
                     "paths": _strs(fl.get("expected_paths")), "depends_on": deps, "contracts": _strs(fl.get("contracts")),
                     "why": _strs(a.get("why"), 10), "attention": kind in ATTENTION})
    new = [a for a in acts if a["kind"] == "new"]
    keep = [a for a in acts if a["kind"] == "same"]
    need = [a for a in acts if a["attention"]]
    head = ("会拆成 %d 个小需求" % len(acts) if not apply else "拆好了：%d 个小需求" % len(acts))
    parts = [x for x in ("新登记 %d 个（待认领）" % len(new) if new else "", "没变 %d 个" % len(keep) if keep else "",
                         "%d 个已经有人认领或开工，没改：要和他们说一声" % len(need) if need else "") if x]
    tail = "" if not apply else "。大家可以认领了：在交付总览的「待认领」里，或者在每个小需求的需求看板上"
    out.update(ok=True, branch=str(data.get("branch") or "") or None,
               units_sha=str(data.get("units_sha256") or "")[:8] or None,
               design_sha=str(data.get("design_sha256") or "")[:8] or None, actions=acts,
               warnings=[say(w, "WARN") for w in _strs(data.get("warnings"), 20)],
               text=head + ("（%s）" % "，".join(parts) if parts else "") + tail)
    return out


def claim(repo_path: str, key: str, release: bool, me: str | None) -> dict[str, Any]:
    """``brain claim <KEY>`` / ``brain claim --release <KEY>`` -> ClaimResult."""
    args = ["claim", "--release", key] if release else ["claim", key]
    p = run_brain(args, repo_path, TIMEOUT_S["claim"])
    out = {"ok": p.returncode == 0, "text": "", "owner": None, "problem": None, "output": output(p)}
    if p.returncode == 0:
        said = p.stdout or ""
        if release:
            out["text"] = "放回去了：%s 又是待认领" % key
        elif "already yours" in said:
            out.update(text="%s 已经是你的了" % key, owner=me)
        else:
            out.update(text="认领了 %s" % key, owner=me)
        return out
    why = refusals(p)
    row = say(why[0] if why else out["output"] or "brain claim 失败（退出码 %d）" % p.returncode)
    m = re.search(r"(?:is claimed by|was just claimed by) ([a-z0-9][a-z0-9._-]*)", " ".join(why))
    out.update(text=row["text"], problem=row, owner=m.group(1) if m else None)
    return out


def start(repo_path: str, key: str, worktree: str, on: str | None) -> dict[str, Any]:
    """``brain start --key <KEY> [--on <DEP>] --worktree <dir>`` in the repo -> ChildStartResult (no session yet)."""
    args = ["start", "--key", key, "--worktree", worktree] + (["--on", on] if on else [])
    p = run_brain(args, repo_path, TIMEOUT_S["start"])
    out = {"ok": False, "key": key, "branch": None, "worktree": None, "on": on, "text": "", "blocked": [],
           "can_on": None, "problem": None, "output": output(p), "slot": None, "url": None, "session_error": ""}
    said = p.stdout or ""
    m = re.search(r"^Started %s \(unit (?P<u>[^)]+) of (?P<p>\S+)\) on (?P<b>\S+) from (?P<f>.+?) \(" % re.escape(key),
                  said, re.M)
    if p.returncode == 0 and m:
        w = re.search(r"^Worktree: (?P<w>.+?) \(its own Lean clone\)", said, re.M)
        out.update(ok=True, branch=m.group("b"), worktree=(w.group("w").strip() if w else worktree),
                   text="开工了：%s（%s），分支 %s%s" % (key, m.group("u"), m.group("b"),
                                                  "，从 %s 的分支开始" % on if on else ""))
        if "WARN: not pushed" in said:
            out["text"] += "；还没推上去：在工作区里 git push -u origin %s" % m.group("b")
        return out
    why = refusals(p)
    text = " ".join(why)
    deps, branch = blocked_deps(text)
    if deps:
        out.update(blocked=deps, text="%s 要等 %s合进大需求的分支 %s 才能开工" % (key, "、".join(d["text"] for d in deps),
                                                                            branch))
        if len(deps) == 1 and deps[0]["state"] == "in_progress":
            out["can_on"] = deps[0]["key"]
        out["problem"] = problems.mk("FAIL", out["text"], "等它合进来；%s" % (
            "或者在 %s 的分支上先做" % out["can_on"] if out["can_on"] else "它开工以后，也可以在它的分支上先做"), None, None,
            text[:2000])
        return out
    row = say(why[0] if why else out["output"] or "brain start 失败（退出码 %d）" % p.returncode)
    out.update(problem=row, text=row["text"])
    return out


def sync(worktree: str) -> dict[str, Any]:
    """``brain sync`` in the child's worktree -> SyncResult."""
    p = run_brain(["sync"], worktree, TIMEOUT_S["sync"])
    said = p.stdout or ""
    out = {"ok": p.returncode == 0, "result": "refused", "text": "", "conflicts": [], "problem": None,
           "output": output(p)}
    if p.returncode == 0:
        if "already has" in said:
            out.update(result="up_to_date", text="已经是最新的：大需求的分支早就合进来了")
        else:
            m = re.search(r"^Merged (\S+) into", said, re.M)
            out.update(result="merged", text="合进来了：%s%s" % (
                re.sub(r"^refs/remotes/origin/", "", m.group(1)) if m else "大需求的分支",
                "，Lean 自己的文件已经自动解决" if "resolved" in said else ""))
        return out
    if p.returncode == 1 and "conflicts left for you" in said:
        files = [x.strip().split(" ", 1)[0] for x in said.splitlines()[1:] if x.startswith("  ") and x.strip()]
        out.update(result="conflicts", conflicts=files[:30],
                   text="合进来了，还有 %d 个冲突要你解决" % len(files),
                   problem=problems.mk("WARN", "合并留下了冲突：%s" % "、".join(files[:5]),
                                       "在工作区里解决它们，git add，再 git commit；lean status 会重写 Lean 的进度",
                                       None, None, said[:2000]))
        return out
    why = refusals(p)
    row = say(why[0] if why else out["output"] or "brain sync 失败（退出码 %d）" % p.returncode)
    out.update(problem=row, text=row["text"])
    return out


def worktree_for(work_root: str, repo_name: str, key: str, unit: str | None) -> str:
    """A fresh folder for a child's worktree under work_root (KiroCrew lets agents work there):
    <work_root>/<repo>/<key>-<unit>, -2, -3 … when taken."""
    slug = re.sub(r"[^a-z0-9-]+", "-", ("%s-%s" % (key, unit or "")).lower()).strip("-")[:60] or key.lower()
    base = Path(work_root).expanduser() / repo_name
    for n in range(1, 100):
        p = base / (slug if n == 1 else "%s-%d" % (slug, n))
        if not p.exists():
            return str(p)
    raise ValueError("工作区目录名都被占用了：%s" % base)


def kickoff(key: str, branch: str, intent: str | None, parent: str, unit: str) -> str:
    """The first message to a small requirement's brain-dev session: ids only, each checked against its format, no
    requirement text; a line that reads like an approval is dropped (intake.kickoff does the same)."""
    from .intake import APPROVAL_LINE_RE, INTENT_RE
    from .repo import parse_branch
    key = key if KEY_RE.match(key or "") else "?"
    parent = parent if KEY_RE.match(parent or "") else "?"
    unit = unit if UNIT_RE.match(unit or "") else "?"
    branch = branch if parse_branch(branch or "", (branch or "ai").split("/", 1)[0]) else "?"
    intent = intent if isinstance(intent, str) and INTENT_RE.match(intent) else None
    lines = ["这是 %s 的本地开发会话：它是大需求 %s 拆出来的小需求，单元 %s。分支 %s%s。" % (
                 key, parent, unit, branch, "，Lean intent %s" % intent if intent else ""),
             "按 brain-dev 的步骤开始：先读 AGENTS.md 和 brain/ 下的四个文件，再读 runs/%s/intent.md（这个单元的路径、依赖、契约、验收标准）和 "
             "runs/%s/run.json。只做单元 %s（lean stage … --unit %s）。" % (key, key, unit, unit),
             "做完写好 aidlc-state.md 里自己那节 ### Next (team …)，brain handoff 开 MR 合进大需求的分支。有问题一次问完，每题带推荐答案。"]
    return "\n".join(x for x in lines if not APPROVAL_LINE_RE.match(x))


BIG_KICKOFF = ("这是个大需求：照常做需求和设计；设计里按 skill brain-split 拆单元（写 unit-of-work.md，每个单元写 Unit、Owner team、"
               "Paths、Depends on、Contracts、Stories / ACs），先 lean stage done units，再请人批 DESIGN：批 DESIGN 就是批了这个拆法。")


__all__ = ["Families", "families", "has_family", "split", "claim", "start", "sync", "worktree_for", "kickoff",
           "listing", "say", "run_brain", "BIG_KICKOFF"]
