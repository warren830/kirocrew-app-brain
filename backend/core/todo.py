"""待办: what waits on a person, in one list. On a person's machine it is every requirement whose row waits for
them (the row's ``waits.who`` is "you": the one judgment the overview, the board and the badges read too), each with
the step it takes:

- Lean approvals pending in a local run: the exact line the person types themselves in that session (the app never
  sends an approval line anywhere);
- questions on the team runner (D-<n>): a link to the MR; they are answered on GitLab, where the person is
  identified (the team dashboard takes no answers); a run left waiting for good (the signer refused its answer, the
  question is void or could not be asked) is listed for a person to look at;
- the person's own runs: a clarify question may be answered here (into the local session, or as their own MR
  comment); acceptance waits for the product on the MR; a refused hand-over says why; a hand-over that was pushed
  but carries no label on its MR (nothing was handed over: `brain handoff` exits 1 then) says so;
- an idle local session (reply: open it, the text says what to tell it), a requirement claimed and not started
  (start: 开工), a merge whose Brain proposals are not written back yet (write_back).
"""

from __future__ import annotations

import os
from typing import Any

from .deliveries import approve_text
from .detail import ledger_questions, mr_questions, park_question

# the step a row waits on (Waits.do) -> the 待办 kind, when nothing more specific was listed for it
DO_KIND = {"reply": "reply", "tool": "reply", "start": "start", "write_back": "write_back", "approve": "lean_approval",
           "answer": "question", "accept": "acceptance", "redo_handoff": "handoff_rejected",
           "label_handoff": "handoff_unlabelled"}


def build(entries: list[dict[str, Any]], *, team: bool, crew_rows: list[dict[str, str]]) -> dict[str, Any]:
    """*entries*: [{row, facts, session, mr, own, has_session, can_post}] for each requirement (person mode) or
    [{row, decisions, mr_url}] (team mode)."""
    items: list[dict[str, Any]] = []
    for e in entries:
        row = e["row"]
        w = row.get("waits") or {}
        base = {"repo": row["repo"], "key": row["key"], "title": row["title"], "line": None, "approval": None,
                "mr_url": (row.get("mr") or {}).get("url"), "question": None, "session": e.get("session"),
                "since": w.get("since") if w.get("since") is not None else row.get("updated_at")}
        if team:
            if row["state"] == "parked" and (row.get("waits") or {}).get("who") == "people" and \
                    not any(d.get("state") == "open" for d in e.get("decisions") or []):
                items.append({**base, "kind": "question", "mr_url": e.get("mr_url"), "text": row["waits"]["text"]})
            for d in e.get("decisions") or []:
                if d.get("state") != "open":      # on the MR, waiting for a person (brain-kit's states)
                    continue
                q = ledger_questions([d], e.get("mr_url"))[0]     # as 需求详情 shows it: its kind in words
                kind = "acceptance" if d.get("kind") == "acceptance" else "question"
                said = (row.get("open_questions") or [])[-1:] == [d["id"]] and w.get("text")   # the row's words: who answers it
                items.append({**base, "kind": kind, "mr_url": e.get("mr_url"), "question": q,
                              "text": said or ("%s 等人在 MR 上回答" % d["id"] if kind == "question" else
                                               "%s 等产品在 MR 上验收" % d["id"])})
            if row["state"] == "rejected":
                items.append({**base, "kind": "handoff_rejected", "text": row["waits"]["text"]})
            continue
        if w.get("who") != "you":
            continue
        f = e.get("facts") or {}
        listed = len(items)
        if row["state"] == "local":
            for a in f.get("approvals") or []:
                if a["state"] == "pending" and a.get("line"):
                    items.append({**base, "kind": "lean_approval", "approval": a["kind"], "line": a["line"],
                                  "path": a.get("path"),
                                  "text": w.get("text") if a["line"] == w.get("line") and w.get("text")
                                  else approve_text(a)})
            q = park_question(f.get("park"), answerable=bool(e.get("own") and e.get("has_session")), via="session")
            if q and q["state"] == "waiting":
                items.append({**base, "kind": "clarify" if q["answerable_here"] else "question", "question": q,
                              "text": "AI 停下问你：可以在这里回答" if q["answerable_here"] else "AI 停下问你：在会话里回答"})
        elif row["state"] in ("parked", "acceptance", "running", "handed_over"):
            for q in mr_questions(e.get("mr"), own=bool(e.get("own")), can_post=bool(e.get("can_post"))):
                if q["state"] != "open":
                    continue
                kind = "acceptance" if q["kind"] == "acceptance" else ("clarify" if q["answerable_here"] else "question")
                text = {"acceptance": "%s 等产品在 MR 上验收" % q["id"],
                        "clarify": "%s 问你：可以在这里回答（以你的 GitLab 身份发在 MR 上）" % q["id"],
                        "question": "%s 问你：去 MR 上回答%s" % (q["id"], "（approve / reject）"
                                                             if q.get("lean_request") else "")}[kind]
                items.append({**base, "kind": kind, "question": q, "text": text})
            if row["state"] == "acceptance" and not any(i["key"] == row["key"] and i["kind"] == "acceptance"
                                                        for i in items):
                items.append({**base, "kind": "acceptance", "text": "等产品在 MR 上验收"})
            if row["state"] == "handed_over" and (row.get("waits") or {}).get("who") == "you":
                items.append({**base, "kind": "handoff_unlabelled", "text": row["waits"]["text"]})
        elif row["state"] == "rejected":
            items.append({**base, "kind": "handoff_rejected", "text": row["waits"]["text"]})
        if len(items) == listed and DO_KIND.get(str(w.get("do"))):   # nothing more specific: the step itself
            items.append({**base, "kind": DO_KIND[str(w["do"])], "text": w.get("text") or "", "line": w.get("line")})
    for r in crew_rows:   # a FAIL only: a WARN (e.g. a runner-only check of a local-only repo) is a reminder, no 待办
        if r.get("level") == "FAIL":
            todo = str(r.get("todo") or "")
            repo = r.get("repo")
            items.append({"kind": "crew", "repo": "", "key": "",
                          "title": "KiroCrew 检查" + (" · %s" % os.path.basename(os.path.normpath(repo)) if repo else ""),
                          "text": "%s。%s" % (r["text"], todo) if todo else r["text"], "line": None,
                          "approval": None, "mr_url": None, "question": None, "session": None, "since": None})
    return {"items": items, "team": team}
