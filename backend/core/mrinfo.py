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
NOT_SIGNED_RE = re.compile(r"^(D-[1-9][0-9]*) 收到了回答，但桥这一轮没能签名")   # DecisionLoop._tell_not_signed
INVALID_RE = re.compile(r"^(D-[1-9][0-9]*) 无法发出")
REJECT_HEAD = "AI 接手被拒"
LABEL_KIND = {"澄清": "clarify", "设计": "design", "计划": "plan", "验收": "acceptance", "危险动作": "action", "其他": "other",
              "需求批准": "requirements"}
OPT_RE = re.compile(r"^([A-H])\. (.*)$")


def parse_notes(notes: list[dict[str, Any]], bridge_user: str | None = None) -> dict[str, Any]:
    """{questions: [...], rejected_reason, rejected_todo, rejected_raw, rejected_at} from an MR's notes, oldest first.
    *bridge_user*: kit.json's bridge_user (only its notes count); unknown: every note is read. rejected_reason: the
    bridge's reasons in short Chinese (problems.reason), rejected_todo: what to do about them (each rule's 做什么),
    rejected_raw: as the bridge wrote them."""
    dec = bk.m("bridge.decisions")
    head_re = dec.Q_HEAD_RE
    desc_title = str(getattr(dec, "DESC_TITLE", "") or "**变更说明**")
    delivered_re = re.compile(DELIVERED_FMT % getattr(dec, "USER", r"[a-z0-9][a-z0-9._-]*"))
    qs: dict[str, dict[str, Any]] = {}
    rejected, rejected_raw, rejected_at, rejected_todo = None, None, None, None
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
                              "at": n.get("created_at")}
            continue
        m = delivered_re.match(first)
        if m and m.group(1) in qs:
            qs[m.group(1)].update(state="delivered", answer=m.group(3), answerer=m.group(2), voucher_id=m.group(4))
            continue
        m = NOT_SIGNED_RE.match(first)
        if m and m.group(1) in qs and qs[m.group(1)]["state"] == "open":
            qs[m.group(1)]["state"] = "answered"
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
        elif first.startswith("AI 已接手"):
            rejected, rejected_raw, rejected_at, rejected_todo = None, None, None, None
    return {"questions": list(qs.values()), "rejected_reason": rejected, "rejected_todo": rejected_todo,
            "rejected_raw": rejected_raw, "rejected_at": rejected_at}


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
