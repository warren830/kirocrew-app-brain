"""On a person's machine: the MR of each handed-over run, read from GitLab with the person's own token (read the way
brainkit.rest.read_token reads it: $GITLAB_TOKEN, else ~/.brain/gitlab-token, only if no one else can read the file).

What the bridge wrote on the MR is parsed back: its questions (the first line brain-kit's ``decisions.Q_HEAD_RE``
reads: ``**D-5 · 澄清 · RUN-PAY-3-1** · 提交 <sha12> · park <hash12> · 需要 @… 回答``; a question of an older bridge
without commit and park counts for nothing and is asked again), their answers, stale (a new push), void (not bound to
its push or park.json, or its question note deleted), refused (the signer would not sign the answer), answered (the
bridge has the answer but could not sign it this round: it sends it later, nobody answers again) and invalid ones, and
the hand-over refusal. The bridge's 「变更说明」 comment (brain-kit 48b6b97: runs/<KEY>/MR.md posted before an acceptance
question, first line ``decisions.DESC_TITLE``) is none of these and is skipped whole: the MR.md text in it is the
run's, whatever it looks like.
Only the notes of the bridge's account count when kit.json names it (``bridge_user``): a look-alike posted by a person
is not a question. The token never leaves brain-kit's GitLab client: it is not logged, stored or returned. Refreshed
in the background (``refresh``), at most every TTL_S per MR; the overview only reads the cache.

brain-kit 0d52e97 (QA rounds 3 and 4) tells the MR more, and every new note is read by its first words like the old
ones: a held reply (「D-n：GitLab 现在查不到回复有没有被别人改过…」: the answer waits, nobody replies again), an answer
whose delivery is not known (「D-n 的回答（凭证 V-…）不知道送到 run 没有」), 「收到了回答，但桥这一轮没能…」 in both its
wordings, and the run's own notes, which start with its run id: runnerd silent, runnerd retrying, the run that could
not start (it also gets the rejected label), KiroCrew not opening the session, queued, a hand-over send not known,
sends that keep failing, an acceptance question held until the head pipeline is green (running, red, or waiting for a
person), a question nobody may answer. The newest such note since the last 「AI 已接手」 is ``runner``: {kind, text in
short Chinese, raw, at}.
"""

from __future__ import annotations

import re
import threading
import time
from typing import Any
from urllib.parse import quote

from . import bk, problems

TTL_S = 60.0
# the answerer: a GitLab username (brain-kit's decisions.USER), as the bridge writes it (lower case)
DELIVERED_FMT = r"^(D-[1-9][0-9]*) 已收到 @(%s) 的回答：([A-Za-z]+)[^（(]*[（(]凭证 (V-[0-9a-f]{10})"
VOID_RE = re.compile(r"^(D-[1-9][0-9]*) 作废(：|（)")      # 作废：a new push (stale); 作废（why）: not bound (void)
REFUSED_RE = re.compile(r"^(D-[1-9][0-9]*) 的回答没有送回 run：签名服务不签")
# DecisionLoop._tell_not_signed: 「…没能签名…」, 0d52e97 also 「…没能把签好的回答存进 brain-intake…」
NOT_SIGNED_RE = re.compile(r"^(D-[1-9][0-9]*) 收到了回答，但桥这一轮没能")
# 0d52e97: GitLab GraphQL cannot say whether a reply was edited: the answer waits (not counted, not lost)
HELD_RE = re.compile(r"^(D-[1-9][0-9]*)：GitLab 现在查不到回复有没有被别人改过")
DELIVERY_UNKNOWN_RE = re.compile(r"^(D-[1-9][0-9]*) 的回答（凭证 (V-[0-9a-f]{10})）不知道送到 run 没有")
INVALID_RE = re.compile(r"^(D-[1-9][0-9]*) 无法发出")
REJECT_HEAD = "AI 接手被拒"
RUN = r"(RUN-[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,5})"
# the run's own notes (brain-kit 0d52e97 handoff.py, delivery.py, decisions.py), newest first wins: (rx, kind, text)
RUNNER_NOTES: list[tuple[re.Pattern, str, Any]] = [(re.compile(rx), kind, text) for rx, kind, text in (
    (r"^%s 还没开始：运行机（brain-runnerd）(?P<m>\d+) 分钟里没有准备好工作区" % RUN, "runnerd_silent",
     "运行机 {m} 分钟没准备好工作区，也没报错：请运行机负责人看一下 brain-runnerd（桥接着等，不用重新交接）"),
    (r"^%s 的工作区还没建成：运行机这几次都没做成" % RUN, "runnerd_retry", "运行机建工作区没成，过一会儿再试（不用做什么）"),
    (r"^%s 没能开始：(?P<why>.+?)。处理好以后" % RUN, "failed", "运行机没能开始：{why}。处理好以后在分支上重新交接"),
    (r"^%s 还没开始：KiroCrew 开会话失败" % RUN, "setup", "运行机开会话失败，桥每轮重试：一直这样就请负责人看一下 KiroCrew"),
    (r"^%s 在排队：(?P<where>.*?)已经有 (?P<n>\d+) 个 run 在跑（上限 (?P<max>\d+)）" % RUN, "queued",
     "在排队：运行机上已经有 {n} 个运行在跑（上限 {max}），有空位就开始"),
    (r"^%s 的接手消息不知道送到没有" % RUN, "send_unknown", "接手消息送没送到不清楚：桥每轮看一下会话，确认没送到才再送；一直这样就要人去 KiroCrew 看一下"),
    (r"^%s：桥把消息 \S+（(?P<what>[^）]*)）送了 (?P<n>\d+) 次" % RUN, "gaveup",
     "桥送了 {n} 次消息，运行机的会话一直没收到：桥接着送；一直不行就请负责人看一下 KiroCrew"),
    (r"^%s 的验收问题（提交 \w+）在等 MR 的流水线 #(?P<p>\d+) 跑完" % RUN, "ci_wait",
     "验收问题等流水线 #{p} 跑完才发（通过以后桥自动发）"),
    (r"^%s 的验收问题（提交 \w+）等 MR 的流水线通过才发：流水线 #(?P<p>\d+) 现在是 (?P<st>[^，,]+)" % RUN, "ci_person",
     "验收问题等流水线通过才发：流水线 #{p} 是 {st}，要有人处理（重新运行，或跑完手动的 job）"),
    (r"^%s 的验收问题（提交 \w+）没有发：流水线 #(?P<p>\d+) 没过" % RUN, "ci_red",
     "验收问题没发：流水线 #{p} 没过，运行机已经收到过多次 CI 失败：请负责人看一下"),
    (r"^%s 的问题（提交 \w+ 的 park\.json）现在发不出：没有人被配置为可以回答「(?P<kind>[^」]*)」" % RUN, "nobody",
     "问题发不出：没人能回答「{kind}」类决定（在 brain-kit 设置里配上谁来回答，配好就自动发）"),
)]
LABEL_KIND = {"澄清": "clarify", "设计": "design", "计划": "plan", "验收": "acceptance", "危险动作": "action", "其他": "other",
              "需求批准": "requirements"}
OPT_RE = re.compile(r"^([A-H])\. (.*)$")


def runner_note(first: str, at: Any = None) -> dict[str, Any] | None:
    """One of the run's own notes (RUNNER_NOTES) as {kind, text, raw, at}; None for any other line."""
    for rx, kind, text in RUNNER_NOTES:
        m = rx.match(first)
        if m:
            g = {k: (v or "")[:120] for k, v in m.groupdict().items()}
            return {"kind": kind, "text": text.format(**g), "raw": first[:500], "at": at}
    return None


def parse_notes(notes: list[dict[str, Any]], bridge_user: str | None = None) -> dict[str, Any]:
    """{questions: [...], rejected_reason, rejected_todo, rejected_raw, rejected_at, runner} from an MR's notes, oldest
    first. *bridge_user*: kit.json's bridge_user (only its notes count); unknown: every note is read. rejected_reason:
    the bridge's reasons in short Chinese (problems.reason), rejected_todo: what to do about them (each rule's 做什么),
    rejected_raw: as the bridge wrote them, rejected_at: when. runner: the newest of the run's own notes since the last
    hand-over was taken (runner_note), None when there is none."""
    dec = bk.m("bridge.decisions")
    head_re = dec.Q_HEAD_RE
    desc_title = str(getattr(dec, "DESC_TITLE", "") or "**变更说明**")
    delivered_re = re.compile(DELIVERED_FMT % getattr(dec, "USER", r"[a-z0-9][a-z0-9._-]*"))
    qs: dict[str, dict[str, Any]] = {}
    rejected, rejected_raw, rejected_at, rejected_todo = None, None, None, None
    runner: dict[str, Any] | None = None
    for n in notes:
        if n.get("system"):
            continue
        body = str(n.get("body") or "")
        first = body.split("\n", 1)[0].rstrip("\r")
        author = ((n.get("author") or {}).get("username") or "").lower()
        if bridge_user and author != bridge_user.lower():
            continue
        if first.startswith(desc_title):          # the bridge's 变更说明 comment: not a question, answer or status
            continue
        m = head_re.match(first)
        if m:
            text = ""
            block = re.search(r"```text\n(.*?)\n```", body, re.S)
            if block:
                text = block.group(1)
            lines = text.split("\n")
            opts, rec, lean, refs, qlines = [], None, None, [], []
            for line in lines:
                om = OPT_RE.match(line)
                if om:
                    opts.append({"id": om.group(1), "text": om.group(2)[:500]})
                elif line.startswith("推荐："):
                    rec = line[3:].strip()[:10]
                elif line.startswith("审批："):
                    lean = line[3:].strip()[:80]
                elif line.startswith("依据："):
                    refs = [x.strip() for x in line[3:].split(",") if x.strip()][:10]
                elif not opts:
                    qlines.append(line)
            label = m.group(2).strip()
            qs[m.group(1)] = {"id": m.group(1), "kind": LABEL_KIND.get(label, "other"), "kind_label": label,
                              "run_id": m.group(3), "question": "\n".join(qlines).strip()[:2000], "options": opts,
                              "recommend": rec, "lean_request": lean, "refs": refs, "state": "open", "answer": None,
                              "answerer": None, "voucher_id": None, "note_id": n.get("id"),
                              "at": n.get("created_at"),
                              # the commit and park.json the bridge asked at (12 hex each, Q_HEAD_RE)
                              "sha": m.group(4) if m.re.groups >= 5 else None,
                              "park": m.group(5) if m.re.groups >= 5 else None}
            continue
        m = delivered_re.match(first)
        if m and m.group(1) in qs:
            qs[m.group(1)].update(state="delivered", answer=m.group(3), answerer=m.group(2), voucher_id=m.group(4))
            continue
        m = NOT_SIGNED_RE.match(first)
        if m and m.group(1) in qs and qs[m.group(1)]["state"] in ("open", "held"):
            qs[m.group(1)]["state"] = "answered"
            continue
        m = HELD_RE.match(first)
        if m and m.group(1) in qs and qs[m.group(1)]["state"] == "open":
            qs[m.group(1)]["state"] = "held"     # a reply waits for GitLab GraphQL: nobody answers again
            continue
        m = DELIVERY_UNKNOWN_RE.match(first)
        if m and m.group(1) in qs and qs[m.group(1)]["state"] in ("open", "held", "answered"):
            qs[m.group(1)].update(state="delivery_unknown", voucher_id=m.group(2))
            continue
        m = VOID_RE.match(first)
        if m and m.group(1) in qs:
            qs[m.group(1)]["state"] = "stale" if m.group(2) == "：" else "void"
            continue
        m = REFUSED_RE.match(first)
        if m and m.group(1) in qs:
            qs[m.group(1)]["state"] = "refused"
            continue
        m = INVALID_RE.match(first)
        if m:
            qs.setdefault(m.group(1), {"id": m.group(1), "kind": "other", "kind_label": "其他", "run_id": None,
                                       "question": "", "options": [], "recommend": None, "lean_request": None,
                                       "refs": [], "answer": None, "answerer": None, "voucher_id": None,
                                       "note_id": n.get("id"), "at": n.get("created_at")})["state"] = "invalid"
            continue
        if first.startswith(REJECT_HEAD):
            reasons = [x[2:].strip() for x in body.split("\n")[1:] if x.startswith("- ")]
            rejected, rejected_raw = problems.reasons_text(reasons, 500)
            rejected, rejected_at = rejected or None, n.get("created_at")
            rejected_todo = problems.reasons_todo(reasons) or None
            runner = None
        elif first.startswith("AI 已接手"):
            rejected, rejected_raw, rejected_at, rejected_todo, runner = None, None, None, None, None
        else:
            got = runner_note(first, n.get("created_at"))
            if got:
                runner = got
                if got["kind"] == "failed":       # brain-kit labels it rejected too: the reason is this note's
                    rejected, rejected_raw, rejected_at = got["text"], first[:2000], n.get("created_at")
                    rejected_todo = None
    return {"questions": list(qs.values()), "rejected_reason": rejected, "rejected_todo": rejected_todo,
            "rejected_raw": rejected_raw, "rejected_at": rejected_at, "runner": runner}


class MrCache:
    """Per (project, branch): {at, mr: {iid, url, state, labels, questions, rejected_reason, rejected_raw}} or an error."""

    def __init__(self) -> None:
        self._rows: dict[tuple, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def get(self, project: str, branch: str) -> dict[str, Any] | None:
        row = self._rows.get((project, branch))
        return row.get("mr") if row else None

    def due(self, project: str, branch: str) -> bool:
        row = self._rows.get((project, branch))
        return row is None or time.monotonic() - row["at"] > TTL_S

    def refresh(self, base: str, project: str, branch: str, *, transport: Any = None,
                bridge_user: str | None = None) -> dict[str, Any] | None:
        """Read the branch's MR (blocking: call it in a thread). None when GitLab is not set up here."""
        rest = bk.m("rest")
        tok = rest.read_token()
        if not base or not project or not tok:
            return None
        gl = rest.GitLab(base, tok, transport)
        try:
            rows = gl.call("GET", "/projects/%s/merge_requests" % quote(str(project), safe=""),
                           {"source_branch": branch, "state": "all", "per_page": 5}) or []
            rows = sorted([r for r in rows if isinstance(r, dict)], key=lambda r: int(r.get("iid") or 0))
            mr = rows[-1] if rows else None
            info: dict[str, Any] | None = None
            if mr:
                parsed = parse_notes(gl.mr_notes(project, mr["iid"]), bridge_user)
                info = {"iid": int(mr["iid"]), "url": mr.get("web_url"), "state": mr.get("state"),
                        "labels": list(mr.get("labels") or []), "sha": mr.get("sha"), **parsed}
            with self._lock:
                self._rows[(project, branch)] = {"at": time.monotonic(), "mr": info}
            return info
        except Exception as exc:  # noqa: BLE001 - GitLab down or SSO expired: keep the last copy
            with self._lock:
                old = self._rows.get((project, branch)) or {}
                self._rows[(project, branch)] = {"at": time.monotonic(), "mr": old.get("mr"),
                                                 "error": str(exc).split("\n", 1)[0][:200]}
            return old.get("mr")

    def post_answer(self, base: str, project: str, iid: int, did: str, choice: str, note: str, *,
                    transport: Any = None) -> dict[str, Any]:
        """The person's own answer, as their own MR comment (their token): the bridge checks it like any other."""
        rest = bk.m("rest")
        tok = rest.read_token()
        if not base or not project or not tok:
            raise RuntimeError("这台机器上没有 GitLab 的令牌：去 MR 上回答")
        gl = rest.GitLab(base, tok, transport)
        line = "answer %s %s" % (did, choice) + ((" " + note) if note else "")
        return gl.comment(project, int(iid), line) or {}


def mr_url(base: str, project: str, iid: int | None) -> str | None:
    if not base or not project or not iid:
        return None
    return "%s/%s/-/merge_requests/%d" % (base.rstrip("/"), project, int(iid))
