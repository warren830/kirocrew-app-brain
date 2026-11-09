"""待办: what waits on a person, in one list.

- Lean approvals pending in a local run: the exact line the person types themselves in that session (the app never
  sends an approval line anywhere);
- questions on the team runner (D-<n>): a link to the MR; they are answered on GitLab, where the person is
  identified (the team dashboard takes no answers); a run left waiting for good (the signer refused its answer, the
  question is void or could not be asked) is listed for a person to look at;
- the person's own runs: a clarify question may be answered here (into the local session, or as their own MR
  comment); acceptance waits for the product on the MR; a refused hand-over says why; a hand-over that was pushed
  but carries no label on its MR (nothing was handed over: `brain handoff` exits 1 then) says so;
- 大需求拆成小需求 (brain-kit 0d52e97): a small requirement the person claimed whose dependencies have all merged
  into the big one's branch (开工 now), and a big requirement of theirs whose small ones have all merged (review and
  release it).
"""

from __future__ import annotations

import os
from typing import Any

from .detail import mr_questions, park_question


def build(entries: list[dict[str, Any]], *, team: bool, crew_rows: list[dict[str, str]]) -> dict[str, Any]:
    """*entries*: [{row, facts, session, mr, own, has_session, can_post}] for each requirement (person mode) or
    [{row, decisions, mr_url}] (team mode)."""
    items: list[dict[str, Any]] = []
    for e in entries:
        row = e["row"]
        base = {"repo": row["repo"], "key": row["key"], "title": row["title"], "line": None, "approval": None,
                "mr_url": (row.get("mr") or {}).get("url"), "question": None, "session": e.get("session"),
                "since": row.get("updated_at")}
        if team:
            if row["state"] == "parked" and (row.get("waits") or {}).get("who") == "people" and \
                    not any(d.get("state") == "open" for d in e.get("decisions") or []):
                items.append({**base, "kind": "question", "mr_url": e.get("mr_url"), "text": row["waits"]["text"]})
            for d in e.get("decisions") or []:
                if d.get("state") != "open":      # on the MR, waiting for a person (brain-kit's states)
                    continue
                q = {"source": "bridge", "id": d["id"], "kind": d.get("kind") or "other", "kind_label": d.get("kind_label") or "",
                     "question": "", "options": [], "recommend": None, "lean_request": d.get("lean_request"), "refs": [],
                     "state": d.get("state"), "answer": None, "answerer": None, "voucher_id": None,
                     "mr_url": e.get("mr_url"), "at": None, "answerable_here": False, "answer_via": None}
                kind = "acceptance" if d.get("kind") == "acceptance" else "question"
                items.append({**base, "kind": kind, "mr_url": e.get("mr_url"), "question": q,
                              "text": "%s 等人在 MR 上回答" % d["id"] if kind == "question" else "%s 等产品在 MR 上验收" % d["id"]})
            if row["state"] == "rejected":
                items.append({**base, "kind": "handoff_rejected", "text": row["waits"]["text"]})
            continue
        f = e.get("facts") or {}
        fam = row.get("family") or {}
        acts = fam.get("acts") or {}
        if fam.get("role") == "child" and row["state"] == "claimed" and e.get("own") and (acts.get("start") or {}).get("ok"):
            items.append({**base, "kind": "child_start",
                          "text": "%s 的小需求（%s）你认领了，依赖都合进来了：可以开工" % (fam.get("parent"), fam.get("unit") or "?")})
        if fam.get("role") == "parent" and fam.get("family_state") == "ready_to_release" and e.get("own"):
            pr = fam.get("progress") or {}
            items.append({**base, "kind": "parent_release",
                          "text": "小需求都合进来了（%s/%s）：在大需求的分支上评审、lean release，再批 RELEASE；或者 brain handoff 交给运行机"
                                  % (pr.get("merged", 0), pr.get("total", 0))})
        if row["state"] == "local":
            for a in f.get("approvals") or []:
                if a["state"] == "pending" and a.get("line"):
                    items.append({**base, "kind": "lean_approval", "approval": a["kind"], "line": a["line"],
                                  "text": "读完再批：在会话里自己打这一行。app 不会替你发。"})
            q = park_question(f.get("park"), answerable=bool(e.get("own") and e.get("has_session")), via="session")
            if q and q["state"] == "waiting":
                items.append({**base, "kind": "clarify" if q["answerable_here"] else "question", "question": q,
                              "text": "agent 停下等你回答" if q["answerable_here"] else "agent 停下等人回答"})
        elif row["state"] in ("parked", "acceptance", "running", "handed_over"):
            for q in mr_questions(e.get("mr"), own=bool(e.get("own")), can_post=bool(e.get("can_post"))):
                if q["state"] != "open":
                    continue
                kind = "acceptance" if q["kind"] == "acceptance" else ("clarify" if q["answerable_here"] else "question")
                text = {"acceptance": "%s 等产品在 MR 上验收" % q["id"],
                        "clarify": "%s 问你：可以在这里回答（以你的 GitLab 身份发在 MR 上）" % q["id"],
                        "question": "%s 等人在 MR 上回答" % q["id"]}[kind]
                items.append({**base, "kind": kind, "question": q, "text": text})
            if row["state"] == "acceptance" and not any(i["key"] == row["key"] and i["kind"] == "acceptance"
                                                        for i in items):
                items.append({**base, "kind": "acceptance", "text": "等产品在 MR 上验收"})
            if row["state"] == "handed_over" and (row.get("waits") or {}).get("who") == "you":
                items.append({**base, "kind": "handoff_unlabelled", "text": row["waits"]["text"]})
        elif row["state"] == "rejected":
            items.append({**base, "kind": "handoff_rejected", "text": row["waits"]["text"]})
    for r in crew_rows:   # a FAIL only: a WARN (e.g. a runner-only check of a local-only repo) is a reminder, no 待办
        if r.get("level") == "FAIL":
            todo = str(r.get("todo") or "")
            repo = r.get("repo")
            items.append({"kind": "crew", "repo": "", "key": "",
                          "title": "KiroCrew 检查" + (" · %s" % os.path.basename(os.path.normpath(repo)) if repo else ""),
                          "text": "%s。%s" % (r["text"], todo) if todo else r["text"], "line": None,
                          "approval": None, "mr_url": None, "question": None, "session": None, "since": None})
    return {"items": items, "team": team}
