#!/usr/bin/env python3
"""The preview's world (ui/preview/world.json) and the board fixtures, made with the app's own code.

Every requirement here is written as what brain-kit and Lean record — Lean's audit events, the run branch's commits,
the hand-over, the bridge's acceptance and vouchers, park.json's questions, the MR's D-n, the merge — and turned into
the 需求看板 snapshot by backend/core/board.py (the same fold the backend runs), the 需求详情's stages and timeline by
lean_view and detail, and 交付总览's numbers by deliveries.cto_numbers. So the preview and the UI tests see exactly the
shapes the backend answers with, and timelines that look like real work: hours and days, waits for people, a rejection,
a failed verify, questions on the MR.

The world (times relative to 2026-11-08 14:00 UTC, the fixtures' `at`; the preview moves them to now):
  shop-pay (r1, GitLab shop/shop-pay): PAY-3 本机 · waits for its PLAN approval; PAY-4 on the runner · parked on D-2;
      PAY-5 waits for its acceptance (D-3); PAY-7 hand-over refused; PAY-6 claimed only; PAY-2 merged, with a whole
      trace for 回放 (a rejection, a question, a red verify, the acceptance, the write-back into the Brain).
  shop-web (r2): brain-kit not installed yet.
  shop-order (r3, GitLab shop/shop-order): ORD-1 … ORD-9 merged over ten weeks (most unattended), ORD-10 running now.
  shop-tools (r4, no GitLab: local only): TOOL-1, the AI at work on this machine; its hook adapter is the old one
      (a ! reminder: it matters only once a requirement is handed to the runner).

Run it after changing board.py, detail.py or the fixtures it reads: `python3 scripts/preview_world.py`.
"""

from __future__ import annotations

import copy
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import backend.routes  # noqa: E402,F401  (the private namespace the app's modules live in)
import importlib  # noqa: E402

board = importlib.import_module("_brainapp_backend.core.board")
detail = importlib.import_module("_brainapp_backend.core.detail")
lean_view = importlib.import_module("_brainapp_backend.core.lean_view")
deliveries = importlib.import_module("_brainapp_backend.core.deliveries")
identity = importlib.import_module("_brainapp_backend.core.identity")
service = importlib.import_module("_brainapp_backend.core.service")

FIX = ROOT / "ui" / "src" / "test" / "fixtures"
T0 = 1794146400          # 2026-11-08 14:00 UTC: the fixtures' `at`
M, H, D = 60, 3600, 86400
GL = "https://gitlab.example.com"


def iso(t: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def sha(*parts: object) -> str:
    return hashlib.sha1("/".join(map(str, parts)).encode()).hexdigest()


class Req:
    """One requirement's record, written in the order it happened."""

    def __init__(self, repo: str, key: str, title: str, owner: str, slug: str, intent: str, *, project: str = "") -> None:
        self.repo, self.key, self.title, self.owner, self.slug, self.intent, self.project = repo, key, title, owner, slug, intent, project
        self.branch = "ai/%s/%s-%s" % (owner, key, slug)
        self.events: list[dict] = []
        self.commits: list[dict] = []
        self.hands: list[dict] = []
        self.park: list[dict] = []
        self.decs: list[dict] = []
        self.humans: list[dict] = []
        self.claim_at: float | None = None
        self.start_at: float | None = None
        self.hand_at: float | None = None
        self.merged_at: float | None = None
        self.merge_how = "merge commit"
        self.after14: dict | None = None
        self.app: list[dict] = []

    # Lean's ledger
    def _lean(self, at: float, event: str, **data) -> None:
        self.events.append({"event": event, "ts": iso(at), "_at": at, "data": data, "intent": self.intent,
                            "seq": len(self.events) + 1, "_file": "aidlc-docs/audit/x.jsonl"})

    def stage(self, at: float, sid: str, state: str, unit: str | None = None, note: str | None = None) -> None:
        ev = {"started": "STAGE_STARTED", "done": "STAGE_COMPLETED", "skipped": "STAGE_SKIPPED"}[state]
        data = {"stage": sid}
        if unit:
            data["unit"] = unit
        if note:
            data["note" if state == "done" else "reason"] = note
        self._lean(at, ev, **data)

    def request(self, at: float, kind: str) -> str:
        h = sha(self.key, kind, at)
        self._lean(at, "APPROVAL_REQUESTED", kind=kind, sha256=h, path="aidlc-docs/%s/%s.md" % (self.intent, kind.lower()))
        return h

    def approve(self, at: float, kind: str, h: str, who: str = "P-1A2B") -> None:
        self._lean(at, "APPROVED", kind=kind, sha256=h, path="aidlc-docs/%s/%s.md" % (self.intent, kind.lower()))
        self.humans.append({"at": iso(at), "kind": "approval", "what": kind, "who": who, "judgment_point": True})

    def reject(self, at: float, kind: str, h: str) -> None:
        self._lean(at, "REJECTED", kind=kind, sha256=h, path="aidlc-docs/%s/%s.md" % (self.intent, kind.lower()))
        self.humans.append({"at": iso(at), "kind": "rejection", "what": kind, "who": "P-1A2B", "judgment_point": True})

    def blocked(self, at: float, gate: str, path: str) -> None:
        self._lean(at, "BLOCKED", gate=gate, path=path, tool="fs_write")

    def verify(self, at: float, results: list[tuple[str, int]]) -> None:
        self._lean(at, "VERIFY", ok=all(e == 0 for _, e in results), results=[{"cmd": c, "exit": e} for c, e in results])

    # git and the hand-over
    def commit(self, at: float, by: str, subject: str, files: int = 3, after: bool | None = None, records: bool = False) -> str:
        s = sha(self.key, "commit", at, subject)
        self.commits.append({"sha": s, "at": iso(at), "committed_at": iso(at), "by": by, "who": None if by == "bot" else "G-3F2A1C",
                             "files": files, "records_only": records, "merge": False,
                             "after_handover": (self.hand_at is not None and at > self.hand_at) if after is None else after,
                             "subject": subject})
        return s

    def handoff(self, at: float) -> None:
        self.hand_at = at
        s = self.commit(at, "person", "%s：交接（brain handoff）" % self.key, files=2, after=False, records=True)
        self.hands.append({"at": iso(at), "kind": "requested", "by": self.owner, "commit": s})

    def accepted(self, at: float, iid: int, run_id: str) -> None:
        self.hands.append({"at": iso(at), "kind": "bridge accepted", "run_id": run_id, "mr_iid": iid, "sha": "", "voucher_id": None})
        self.hands.append({"at": iso(at + 20), "kind": "voucher", "run_id": run_id, "sha": "", "voucher_id": "V-%s" % sha(run_id)[:10]})

    def rejected(self, at: float, reason: str) -> None:
        self.hands.append({"at": iso(at), "kind": "bridge rejected", "run_id": None, "mr_iid": None, "reason": reason})

    def question_park(self, at: float, status: str, kind: str) -> None:
        self.park.append({"at": iso(at), "status": status, "kind": kind})

    def ask(self, did: str, kind: str, asked: float, answered: float | None = None, choice: str | None = None,
            state: str = "open", who: str = "P-7C1D") -> None:
        self.decs.append({"id": did, "source": "bridge", "kind": kind, "asked_at": iso(asked), "at": iso(answered) if answered else None,
                          "choice": choice, "state": state, "who": who if choice else None, "voucher_id": None})
        if choice:
            self.humans.append({"at": iso(answered), "kind": "approval" if kind == "acceptance" else "answer",
                                "what": "acceptance" if kind == "acceptance" else kind, "who": who, "judgment_point": True})

    def merge(self, at: float, how: str = "merge commit") -> None:
        self.merged_at, self.merge_how = at, how
        closed = T0 >= at + 14 * D
        self.after14 = {"value": False if closed else None, "window_closed": closed, "window_end": iso(at + 14 * D), "evidence": []}

    # what the backend reads it from
    def facts(self, park: dict | None = None) -> dict:
        approvals = []
        last: dict[str, dict] = {}
        for e in self.events:
            if e["event"] in ("APPROVAL_REQUESTED", "APPROVED", "REJECTED"):
                last[e["data"]["kind"]] = e
        for kind, e in last.items():
            st = {"APPROVAL_REQUESTED": "pending", "APPROVED": "approved", "REJECTED": "rejected"}[e["event"]]
            h = e["data"]["sha256"]
            approvals.append({"kind": kind, "unit": None, "state": st, "sha8": h[:8], "at": e["_at"],
                              "line": "approve %s %s" % (kind, h[:8]) if st == "pending" else None, "path": e["data"].get("path"), "via": None})
        run = None
        if self.start_at is not None:
            run = {"key": self.key, "owner": self.owner, "branch": self.branch, "intent": self.intent, "created_at": iso(self.start_at),
                   "brain_commit": sha("brain", self.key)[:12], "origin": "product", "materials": [{"package": "PKG-%s" % self.key}],
                   "expected_paths": []}
            if self.hand_at is not None:
                run["handoff"] = {"requested_at": iso(self.hand_at), "by": self.owner, "local_head": sha(self.key, "lh")}
        return {"key": self.key, "claim": {"owner": self.owner, "title": self.title, "created_at": iso(self.claim_at or self.start_at or T0),
                                           "source": "product"},
                "where": "main" if self.merged_at else "worktree" if self.hand_at is None else "branch", "branch": self.branch if run else None,
                "owner": self.owner, "worktree": None, "run": run, "park": park, "merged": bool(self.merged_at),
                "tip_at": self.merged_at, "events": self.events, "approvals": approvals, "stages": lean_view.stages(self.events)}

    def trace(self, brain: dict) -> dict:
        stages = []
        seen: dict[str, dict] = {}
        for e in self.events:
            if e["event"] in lean_view.STAGE_STATE:
                d = e["data"]
                sid = d["stage"] + ("/" + d["unit"] if d.get("unit") else "")
                row = seen.setdefault(sid, {"id": sid, "first_at": e["ts"], "times": {}})
                row.update(state=lean_view.STAGE_STATE[e["event"]], at=e["ts"], note=d.get("note") or d.get("reason"), src="aidlc-docs/audit/L-3F2A1C.jsonl")
        stages = sorted(seen.values(), key=lambda r: r["first_at"])
        verify = [{"at": e["ts"], "ok": e["data"]["ok"], "src": "aidlc-docs/audit/L-3F2A1C.jsonl"} for e in self.events if e["event"] == "VERIFY"]
        return {"stages": stages, "humans": self.humans, "brain": brain,
                "actions": {"commits": self.commits, "handovers": self.hands, "questions": self.park, "blocked": [
                    {"at": e["ts"], "gate": e["data"]["gate"], "path": e["data"]["path"], "tool": "fs_write", "src": "aidlc-docs/audit/L-3F2A1C.jsonl"}
                    for e in self.events if e["event"] == "BLOCKED"]},
                "decisions": self.decs, "checks": {"verify": verify},
                "outcome": {"handed_over": {"value": self.hand_at is not None},
                            "merged_at": {"value": iso(self.merged_at) if self.merged_at else None, "how": self.merge_how,
                                          "commit": sha(self.key, "merge") if self.merged_at else None, "src": "git", "note": None},
                            "reverted_or_hotfixed_within_14d": self.after14 or {"value": None, "window_closed": None, "window_end": None, "evidence": []}}}


def standard(r: Req, t: float, *, design_back: bool = False, plan: bool = False) -> float:
    """The local half up to the design approval, from *t*: reverse engineering skipped, requirements, user stories
    skipped, the application design (sent back once when *design_back*), units skipped. Returns where it ended."""
    r.start_at = t
    r.stage(t + 2 * M, "reverse-engineering", "skipped", note="新功能，代码已经读过")
    r.stage(t + 3 * M, "requirements", "started")
    r.commit(t + 28 * M, "person", "%s：需求初稿" % r.key, files=2, records=True)
    h = r.request(t + 31 * M, "REQUIREMENTS")
    r.approve(t + 52 * M, "REQUIREMENTS", h)
    r.stage(t + 53 * M, "requirements", "done", note="需求写好了，%d 条验收标准" % (4 + len(r.key) % 3))
    r.stage(t + 54 * M, "user-stories", "skipped", note="小需求")
    r.stage(t + 55 * M, "application-design", "started")
    r.blocked(t + 70 * M, "inception", "src/%s/service.py" % r.slug.split("-")[0])
    h = r.request(t + 96 * M, "DESIGN")
    if design_back:
        r.reject(t + 118 * M, "DESIGN", h)
        r.commit(t + 141 * M, "person", "%s：按意见改设计（接口加分页）" % r.key, files=1, records=True)
        h = r.request(t + 143 * M, "DESIGN")
        r.approve(t + 166 * M, "DESIGN", h)
        end = t + 167 * M
    else:
        r.approve(t + 121 * M, "DESIGN", h)
        end = t + 122 * M
    r.stage(end, "application-design", "done", note="设计过了")
    r.stage(end + 1 * M, "units", "skipped", note="只有一个单元")
    return end + 2 * M


def runner_half(r: Req, t: float, *, iid: int, question: tuple[str, str, float, str] | None = None, verify_fail: bool = False,
                outside: bool = False, accept_after: float = 70 * M) -> float:
    """Hand-over at *t* and the runner's half: code generation, build and test, the release and its acceptance."""
    run_id = "RUN-%s-1" % r.key
    r.commit(t - 4 * M, "person", "%s：交接说明" % r.key, files=1, records=True)
    r.handoff(t)
    r.accepted(t + 2 * M, iid, run_id)
    u = r.slug.split("-")[0] + "-api"
    r.stage(t + 4 * M, "code-generation", "started", unit=u)
    c = t + 4 * M
    for i, subj in enumerate(("接口和数据结构", "主流程", "错误处理和重试", "测试")):
        c += (24 + 7 * i) * M
        r.commit(c, "bot", "%s：%s（%s）" % (r.key, subj, u), files=3 + i)
    if question:
        did, kind, wait, choice = question
        r.question_park(c + 2 * M, "waiting", kind)
        r.ask(did, kind, c + 3 * M, c + 3 * M + wait, choice, state="delivered")
        r.question_park(c + 4 * M + wait, "answered", kind)
        c = c + 6 * M + wait
        r.commit(c + 18 * M, "bot", "%s：按 %s 的回答改" % (r.key, did), files=2)
        c += 18 * M
    if outside:
        r.commit(c + 9 * M, "person", "修了一个打字错误", files=1)
        c += 10 * M
    r.stage(c + 2 * M, "code-generation", "done", unit=u, note="代码写完")
    r.stage(c + 3 * M, "build-and-test", "started")
    checks = [("pytest -q", 0), ("ruff check .", 0), ("python -m mypy src", 0)]
    if verify_fail:
        r.verify(c + 15 * M, [("pytest -q", 1), ("ruff check .", 0), ("python -m mypy src", 0)])
        r.commit(c + 31 * M, "bot", "%s：修好 pytest 里没过的两个用例" % r.key, files=2)
        c += 32 * M
    r.verify(c + 15 * M, checks)
    r.stage(c + 16 * M, "build-and-test", "done", note="verify PASS：3 项")
    r.stage(c + 17 * M, "release", "started")
    h = r.request(c + 25 * M, "RELEASE")
    r.question_park(c + 26 * M, "waiting", "acceptance")
    return c + 26 * M + accept_after, h


def merged(r: Req, t: float, h: str, did: str, how: str = "merge commit") -> None:
    r.ask(did, "acceptance", t - 50 * M, t, "approve", state="delivered", who="P-9E3B")
    r.approve(t + 1 * M, "RELEASE", h, who="P-9E3B")
    r.stage(t + 2 * M, "release", "done", note="发布批准了")
    r.merge(t + 35 * M, how)


def snapshot(r: Req, row: dict, *, park: dict | None = None, sessions: list | None = None, decisions: list | None = None,
             brain: dict | None = None, local_only: bool = False, kit_rows: list | None = None, reflect: list | None = None,
             mr: dict | None = None, me: str = "alice", mr_desc: dict | None = None, questions: list | None = None,
             credits: float | None = None) -> dict:
    """The board snapshot the backend answers (service._board_sync), built the same way."""
    f = r.facts(park)
    brain = brain or {"loaded": 9, "cited": [], "stale": [], "unknown": [], "proposals": 0}
    t = r.trace(brain) if r.start_at is not None else None
    subjects = {c["sha"]: c["subject"] for c in r.commits}
    sessions = sessions or []
    g = board.build(f, row, t, mr=mr, sessions=sessions, app_events=r.app, team_decisions=[], subjects=subjects,
                    reflect_refs=reflect or [], default_branch="main", local_only=local_only,
                    kit_rows=board.kit_cells(kit_rows or [], "/Users/alice/workplace/%s" % {"r1": "shop-pay", "r3": "shop-order", "r4": "shop-tools"}.get(r.repo, "")),
                    decisions=decisions or [], brain=brain, me=me, now=T0)
    return {"at": T0, "row": row, "branch": row.get("branch"), "base": "main", "started_at": g["started_at"], "ended_at": g["ended_at"],
            "live": g["live"], "person": g["person"], "actors": g["actors"],
            "edges": [list(e) for e in service.board_edges([a["key"] for a in g["actors"]], g["direct"])], "direct": g["direct"],
            "events": g["events"], "belt": g["belt"], "checks": g["checks"], "accept": g["accept"], "brain": brain,
            "decisions": decisions or [], "questions": questions or [],
            "mr_desc": mr_desc or {"available": True, "text": "", "first": None, "source": None, "path": None, "ref": None,
                                   "error": "还没有 run（只有认领）：开工以后才有变更说明"},
            "sessions": sessions, "credits": {"total": credits, "note": detail.NO_TOKENS},
            "source": "trace" if t else "app", "missing": ["CI pipelines (GitLab, not readable here)"] if t else [], "error": ""}


def main() -> None:
    ov = json.loads((FIX / "overview.json").read_text(encoding="utf-8"))
    det = json.loads((FIX / "detail.json").read_text(encoding="utf-8"))
    status = json.loads((FIX / "status.json").read_text(encoding="utf-8"))
    rows = {r["key"]: r for r in ov["rows"]}
    tmpl = copy.deepcopy(rows["PAY-2"])
    boards: dict[str, dict] = {}
    details: dict[str, dict] = {}
    runs: list[dict] = []

    def mrdesc(key: str, first: str) -> dict:
        m = copy.deepcopy(det["mr_desc"])
        m["text"] = m["text"].replace("PAY-3", key)
        m["text"] = m["text"].replace(det["mr_desc"]["first"] or "", first)
        m.update(first=first, source="file", path="runs/%s/MR.md" % key, ref=sha(key, "ref")[:12])
        return m

    # ---------------------------------------------------------------- shop-pay
    # PAY-2: merged, the whole way (a design sent back, a question on the MR, a red verify, the acceptance, the write-back)
    p2 = Req("r1", "PAY-2", "退款单号校验", "alice", "refund-id", "261102-refund-id", project="shop/shop-pay")
    p2.claim_at = T0 - 6 * D - 2 * H
    t = standard(p2, T0 - 6 * D, design_back=True)
    end, h = runner_half(p2, t + 20 * M, iid=37, question=("D-1", "clarify", 41 * M, "A"), verify_fail=True)
    merged(p2, end, h, "D-2")
    p2.app.append({"at": iso(p2.merged_at + 15 * H), "label": "brain reflect --apply：成功", "detail": "brain/PAY-2-reflect-1"})
    row = rows["PAY-2"]
    row.update(updated_at=p2.merged_at + 35 * M, credits=22.7)
    boards["r1/PAY-2"] = snapshot(p2, row, decisions=det["decisions"][:3], brain={"loaded": 12, "cited": ["P-PAY-2-1", "T-12"], "stale": [], "unknown": [], "proposals": 1},
                                  reflect=[("brain/PAY-2-reflect-1", p2.merged_at + 15 * H)],
                                  sessions=[dict(det["sessions"][0], slot="brain-PAY-2-1c4e", url="/chat?sid=brain-PAY-2-1c4e", title="PAY-2 退款单号校验",
                                                 credits=8.3, turns=19, busy=False, awaiting=False, last_activity=p2.hand_at),
                                            dict(det["sessions"][0], slot="brain-run-RUN-PAY-2-1", url="/chat?sid=brain-run-RUN-PAY-2-1", title="RUN-PAY-2-1",
                                                 agent="brain-run", kind="runner", credits=14.4, turns=41, busy=False, awaiting=False, last_activity=p2.merged_at)],
                                  mr_desc=mrdesc("PAY-2", row.get("summary") or "退款单号加上校验位，重复和非法单号在入口就拒掉"), credits=22.7)
    runs.append({"key": "PAY-2", "repo": "r1", "how": "people", "beyond": ["回答问题"], "at_points": 5, "outside": 0, "credits": 22.7, "merged_at": p2.merged_at})

    # PAY-3: on this machine, waits for its code-generation plan (PLAN) approval; a clarify question waits too
    p3 = Req("r1", "PAY-3", "退款单导出 CSV", "alice", "refund-export", "261107-refund-export", project="shop/shop-pay")
    p3.claim_at = T0 - 1 * D - 6 * H
    t = standard(p3, T0 - 1 * D - 4 * H)
    p3.stage(t, "functional-design", "skipped", unit="refund-api", note="没有要细化的")
    p3.stage(t + 1 * M, "code-generation", "started", unit="refund-api")
    p3.commit(t + 40 * M, "person", "PAY-3：导出接口的骨架", files=4)
    p3.commit(T0 - 3 * H, "person", "PAY-3：CSV 字段和金额格式", files=3)
    p3.question_park(T0 - 20 * M, "waiting", "clarify")
    p3.request(T0 - 6 * M, "PLAN")
    p3.events[-1]["data"]["sha256"] = "5d1e7a90" + p3.events[-1]["data"]["sha256"][8:]
    row = rows["PAY-3"]
    boards["r1/PAY-3"] = snapshot(p3, row, park={"status": "waiting", "kind": "clarify", "question": "导出文件里的时间用商户所在地的时区，还是 UTC？"},
                                  sessions=det["sessions"], decisions=det["decisions"], brain=det["brain"], questions=det["questions"],
                                  mr_desc=det["mr_desc"], credits=row.get("credits"))
    details["r1/PAY-3"] = det

    # PAY-4: on the runner, parked on D-2 (a design question for the product)
    p4 = Req("r1", "PAY-4", "对账单按商户拆分", "carol", "merchant-split", "261105-merchant-split", project="shop/shop-pay")
    p4.claim_at = T0 - 2 * D
    t = standard(p4, T0 - 1 * D - 22 * H)
    p4.commit(t + 10 * M, "person", "PAY-4：设计定稿", files=2, records=True)
    p4.handoff(t + 30 * M)
    p4.accepted(t + 32 * M, 41, "RUN-PAY-4-1")
    p4.stage(t + 35 * M, "functional-design", "started", unit="split-job")
    p4.commit(t + 2 * H, "bot", "PAY-4：拆分任务的骨架（split-job）", files=5)
    p4.question_park(T0 - 3 * H - 2 * M, "waiting", "design")
    p4.ask("D-2", "design", T0 - 3 * H)
    row = rows["PAY-4"]
    boards["r1/PAY-4"] = snapshot(p4, row, park={"status": "waiting", "kind": "design"}, decisions=det["decisions"][1:3],
                                  questions=[{"source": "mr", "id": "D-2", "kind": "design", "kind_label": "设计", "question": "按商户拆分时，一个商户一天超过 10 万行要不要再按小时切？",
                                              "options": [{"id": "A", "text": "按小时切成多份"}, {"id": "B", "text": "一份，压缩成 zip"}], "recommend": "A",
                                              "lean_request": None, "refs": ["D01#S002"], "state": "open", "answer": None, "answerer": None, "voucher_id": None,
                                              "mr_url": "%s/shop/shop-pay/-/merge_requests/41" % GL, "at": T0 - 3 * H, "answerable_here": False, "answer_via": None}],
                                  sessions=[dict(det["sessions"][0], slot="brain-run-RUN-PAY-4-1", url="/chat?sid=brain-run-RUN-PAY-4-1", title="RUN-PAY-4-1", agent="brain-run",
                                                 kind="runner", credits=6.1, turns=17, busy=False, awaiting=False, last_activity=T0 - 3 * H)],
                                  mr_desc=mrdesc("PAY-4", "对账单按商户拆成一户一份，大商户按小时切"), credits=None)
    runs.append({"key": "PAY-4", "repo": "r1", "how": "pending", "beyond": [], "at_points": 2, "outside": 0, "credits": None, "merged_at": None})

    # PAY-5: waits for its acceptance on the MR (D-3)
    p5 = Req("r1", "PAY-5", "退款回调失败重试", "alice", "callback-retry", "261104-callback-retry", project="shop/shop-pay")
    p5.claim_at = T0 - 3 * D
    t = standard(p5, T0 - 2 * D - 20 * H)
    end, h = runner_half(p5, t + 25 * M, iid=44)
    p5.ask("D-3", "acceptance", T0 - 1 * D - 1 * H)
    row = rows["PAY-5"]
    boards["r1/PAY-5"] = snapshot(p5, row, park={"status": "waiting", "kind": "acceptance", "lean_request": "RELEASE 0c9a7e21"},
                                  questions=[{"source": "mr", "id": "D-3", "kind": "acceptance", "kind_label": "验收", "question": "验收：回调失败后最多重试 5 次、间隔翻倍，第 6 次转人工。",
                                              "options": [], "recommend": None, "lean_request": "RELEASE 0c9a7e21", "refs": [], "state": "open", "answer": None, "answerer": None,
                                              "voucher_id": None, "mr_url": "%s/shop/shop-pay/-/merge_requests/44" % GL, "at": T0 - 1 * D - 1 * H, "answerable_here": False, "answer_via": None}],
                                  decisions=det["decisions"][:2], mr_desc=mrdesc("PAY-5", row.get("summary") or "退款回调失败自动重试，第 6 次转人工处理"), credits=31.0,
                                  sessions=[dict(det["sessions"][0], slot="brain-run-RUN-PAY-5-1", url="/chat?sid=brain-run-RUN-PAY-5-1", title="RUN-PAY-5-1", agent="brain-run",
                                                 kind="runner", credits=24.2, turns=52, busy=False, awaiting=False, last_activity=T0 - 1 * D - 1 * H)])
    runs.append({"key": "PAY-5", "repo": "r1", "how": "pending", "beyond": [], "at_points": 2, "outside": 0, "credits": 31.0, "merged_at": None})

    # PAY-7: the hand-over was refused (bob added the label, and run.json has no hand-over)
    p7 = Req("r1", "PAY-7", "退款原因下拉框", "alice", "refund-reason", "261108-refund-reason", project="shop/shop-pay")
    p7.claim_at = T0 - 9 * H
    t = standard(p7, T0 - 8 * H - 30 * M)
    p7.stage(t, "code-generation", "started", unit="refund-ui")
    p7.commit(t + 50 * M, "person", "PAY-7：下拉框和原因列表", files=3)
    p7.stage(t + 70 * M, "code-generation", "done", unit="refund-ui", note="代码写完")
    p7.verify(t + 80 * M, [("pytest -q", 0), ("npm test", 0)])
    p7.stage(t + 81 * M, "build-and-test", "done", note="verify PASS：2 项")
    p7.rejected(T0 - 5 * H - 30 * M, rows["PAY-7"]["waits"]["text"].replace("接手被拒：", ""))
    row = rows["PAY-7"]
    boards["r1/PAY-7"] = snapshot(p7, row, decisions=det["decisions"][1:2], mr_desc=mrdesc("PAY-7", "退款时选原因，原因列表在后台维护"), credits=18.2,
                                  sessions=[dict(det["sessions"][0], slot="brain-PAY-7-2b9f", url="/chat?sid=brain-PAY-7-2b9f", title="PAY-7 退款原因下拉框",
                                                 credits=18.2, turns=27, busy=False, awaiting=False, last_activity=T0 - 5 * H)])

    # PAY-6: claimed, not started
    p6 = Req("r1", "PAY-6", "商户结算周报", "carol", "weekly-report", "", project="shop/shop-pay")
    p6.claim_at = T0 - 2 * D
    boards["r1/PAY-6"] = snapshot(p6, rows["PAY-6"])

    # ---------------------------------------------------------------- shop-order: ten weeks of deliveries, and one running now
    order_rows = []
    hist = [("ORD-1", "下单页地址校验", 68, "unattended", 14.2), ("ORD-2", "优惠券叠加规则", 61, "unattended", 21.9),
            ("ORD-3", "订单导出加筛选", 52, "people", 26.4), ("ORD-4", "取消订单的退款入口", 45, "unattended", 17.8),
            ("ORD-5", "发票抬头保存", 37, "local", 9.6), ("ORD-6", "订单备注长度", 30, "unattended", 11.3),
            ("ORD-7", "物流单号回填", 22, "unattended", 19.5), ("ORD-8", "拆单时运费分摊", 12, "people", 33.7),
            ("ORD-9", "订单列表分页", 3, "pending", 15.1)]
    for i, (key, title, ago_d, how, cr) in enumerate(hist):
        r = Req("r3", key, title, "dave" if i % 2 else "erin", "order-%d" % (i + 1), "26%04d-order-%d" % (1000 + i, i + 1), project="shop/shop-order")
        base = T0 - ago_d * D - (3 + i % 4) * H
        r.claim_at = base - 3 * H
        t = standard(r, base, design_back=(i % 3 == 2))
        if how == "local":
            r.stage(t, "code-generation", "started", unit="invoice-ui")
            r.commit(t + 70 * M, "person", "%s：发票抬头表单" % key, files=4)
            r.stage(t + 80 * M, "code-generation", "done", unit="invoice-ui")
            r.verify(t + 95 * M, [("pytest -q", 0), ("npm test", 0)])
            r.stage(t + 96 * M, "build-and-test", "done")
            h = r.request(t + 100 * M, "RELEASE")
            r.approve(t + 115 * M, "RELEASE", h)
            r.merge(t + 140 * M, "fast-forward")
        else:
            end, h = runner_half(r, t + 30 * M, iid=10 + i, question=("D-1", "clarify", 35 * M, "B") if how == "people" and i % 2 else None,
                                 verify_fail=(i % 4 == 1), outside=(how == "people" and not i % 2))
            merged(r, end, h, "D-2" if how == "people" and i % 2 else "D-1")
        row = copy.deepcopy(tmpl)
        row.update(repo="r3", key=key, title=title, owner=r.owner, branch=r.branch, intent=r.intent, state="merged", state_label="已合并",
                   credits=cr, updated_at=r.merged_at + 35 * M, summary="%s：做完了，合并进 main" % title,
                   mr={"iid": 10 + i, "url": "%s/shop/shop-order/-/merge_requests/%d" % (GL, 10 + i), "state": "merged"},
                   run_ids=["RUN-%s-1" % key] if how != "local" else [], open_questions=[], overlap=[], expected_paths=[], worktree=None, where="main")
        order_rows.append(row)
        boards["r3/%s" % key] = snapshot(r, row, credits=cr, mr_desc=mrdesc(key, "%s：做完了，合并进 main" % title),
                                         brain={"loaded": 8 + i, "cited": ["T-ORD-%d-1" % max(1, i)], "stale": [], "unknown": [], "proposals": i % 2},
                                         reflect=[("brain/%s-reflect-1" % key, r.merged_at + 20 * H)] if i % 2 and ago_d > 5 else [])
        n_hum = sum(1 for h in r.humans if h["judgment_point"])
        runs.append({"key": key, "repo": "r3", "how": how, "beyond": ["交接后推代码"] if how == "people" and not i % 2 else (["回答问题"] if how == "people" else []),
                     "at_points": n_hum, "outside": 1 if how == "people" and not i % 2 else 0, "credits": cr, "merged_at": r.merged_at})
    # ORD-10: running on the runner right now
    r = Req("r3", "ORD-10", "订单状态推送到企业微信", "erin", "wecom-push", "261106-wecom-push", project="shop/shop-order")
    r.claim_at = T0 - 9 * H
    t = standard(r, T0 - 8 * H)
    r.commit(t + 5 * M, "person", "ORD-10：交接说明", files=1, records=True)
    r.handoff(t + 9 * M)
    r.accepted(t + 11 * M, 19, "RUN-ORD-10-1")
    r.stage(t + 13 * M, "code-generation", "started", unit="push-svc")
    r.commit(t + 40 * M, "bot", "ORD-10：推送服务的骨架", files=4)
    r.commit(T0 - 25 * M, "bot", "ORD-10：模板消息和重试", files=3)
    r.commit(T0 - 4 * M, "bot", "ORD-10：订单状态变化的订阅", files=2)
    row = copy.deepcopy(tmpl)
    row.update(repo="r3", key="ORD-10", title="订单状态推送到企业微信", owner="erin", branch=r.branch, intent=r.intent, state="running", state_label="运行机在跑",
               credits=7.4, updated_at=T0 - 4 * M, summary=None, waits={"who": "runner", "text": "运行机在跑", "line": None, "raw": ""},
               mr={"iid": 19, "url": "%s/shop/shop-order/-/merge_requests/19" % GL, "state": "opened"}, run_ids=["RUN-ORD-10-1"], where="branch",
               lean={"stage": "code-generation", "stage_label": "代码生成", "stage_n": 9, "stage_state": "started", "done": 7, "total": 11},
               stage="9/11 代码生成", open_questions=[], overlap=[], expected_paths=[], worktree=None)
    order_rows.append(row)
    boards["r3/ORD-10"] = snapshot(r, row, credits=7.4, sessions=[dict(det["sessions"][0], slot="brain-run-RUN-ORD-10-1", url="/chat?sid=brain-run-RUN-ORD-10-1",
                                                                       title="RUN-ORD-10-1", agent="brain-run", kind="runner", credits=7.4, turns=21, busy=True,
                                                                       awaiting=False, last_activity=T0 - 1 * M)],
                                   mr_desc=mrdesc("ORD-10", "订单状态变化时推送到企业微信，失败自动重试"))
    runs.append({"key": "ORD-10", "repo": "r3", "how": "pending", "beyond": [], "at_points": 2, "outside": 0, "credits": 7.4, "merged_at": None})

    # ---------------------------------------------------------------- shop-tools: local only, the AI at work now
    r = Req("r4", "TOOL-1", "价格表批量导入", "alice", "price-import", "261108-price-import")
    r.claim_at = T0 - 3 * H
    r.start_at = T0 - 2 * H - 40 * M
    r.stage(r.start_at + 2 * M, "reverse-engineering", "skipped", note="新工具")
    r.stage(r.start_at + 3 * M, "requirements", "started")
    h = r.request(r.start_at + 30 * M, "REQUIREMENTS")
    r.approve(r.start_at + 41 * M, "REQUIREMENTS", h)
    r.stage(r.start_at + 42 * M, "requirements", "done")
    r.stage(r.start_at + 43 * M, "application-design", "started")
    r.commit(T0 - 50 * M, "person", "TOOL-1：导入格式和校验规则", files=2, records=True)
    row = copy.deepcopy(tmpl)
    row.update(repo="r4", key="TOOL-1", title="价格表批量导入", owner="alice", branch=r.branch, intent=r.intent, state="local", state_label="本地开发中",
               credits=4.9, updated_at=T0 - 1 * M, summary=None, waits={"who": "agent", "text": "agent 在做", "line": None, "raw": ""}, mr=None, run_ids=[],
               where="worktree", lean={"stage": "application-design", "stage_label": "应用设计", "stage_n": 4, "stage_state": "started", "done": 3, "total": 11},
               stage="4/11 应用设计", open_questions=[], overlap=[], expected_paths=["tools/price"], worktree="/Users/alice/workplace/brain-app/shop-tools/price-import")
    tool_rows = [row]
    tool_kit = [r_ for r_ in status["crew"]["rows"] if r_.get("fix") == "kit"]
    for k in tool_kit:
        k["repo"] = "/Users/alice/workplace/shop-tools"
        k["text"] = k["text"]
    boards["r4/TOOL-1"] = snapshot(r, row, local_only=True, kit_rows=tool_kit, credits=4.9,
                                   sessions=[dict(det["sessions"][0], slot="brain-TOOL-1-5a2c", url="/chat?sid=brain-TOOL-1-5a2c", title="TOOL-1 价格表批量导入",
                                                  credits=4.9, turns=11, busy=True, awaiting=False, last_activity=T0 - 1 * M)],
                                   mr_desc={"available": True, "text": "", "first": None, "source": None, "path": None, "ref": None, "error": "还没有提交：做完第一步以后才有变更说明"})

    # ---------------------------------------------------------------- the overview of the world, and its numbers
    all_rows = list(rows.values()) + order_rows + tool_rows
    parts = [("r1", {"runs": [x for x in runs if x["repo"] == "r1"], "unattended": None, "judgment": None, "kinds": [], "ref": "origin/main"}),
             ("r3", {"runs": [x for x in runs if x["repo"] == "r3"], "unattended": None, "judgment": None, "kinds": [], "ref": "origin/main"})]
    judged = [x for x in runs if x["how"] in ("unattended", "people")]
    at_points = sum(x["at_points"] for x in runs if x["merged_at"])
    outside = sum(x["outside"] for x in runs)
    parts[0][1].update(unattended=[0, 1], judgment=[5, 5], kinds=[{"label": "批准", "n": 4, "point": True}, {"label": "回答问题", "n": 1, "point": True}])
    parts[1][1].update(unattended=[sum(1 for x in judged if x["repo"] == "r3" and x["how"] == "unattended"), sum(1 for x in judged if x["repo"] == "r3")],
                       judgment=[at_points - 5, at_points - 5 + outside],
                       kinds=[{"label": "批准", "n": at_points - 7, "point": True}, {"label": "回答问题", "n": 2, "point": True},
                              {"label": "交接后推代码", "n": outside, "point": False}])
    cto = deliveries.cto_numbers(parts, all_rows, available=True, now=T0)
    world_ov = copy.deepcopy(ov)
    world_ov["rows"] = all_rows
    world_ov["cto"] = cto
    world_ov["counts"] = deliveries.counts(all_rows)
    for m in world_ov["eval"]["metrics"]:
        if m["id"] == "autonomy":
            m["value"] = cto["unattended"]
        if m["id"] == "judgment":
            m["value"] = [cto["stepped_in"]["at_points"], cto["stepped_in"]["at_points"] + cto["stepped_in"]["outside"]]
    world_ov["eval"]["ref"] = "origin/main"
    world_status = copy.deepcopy(status)
    world_status["repos"] = status["repos"] + [
        {"id": "r3", "path": "/Users/alice/workplace/shop-order", "name": "shop-order", "ok": True, "error": "", "pending": None,
         "kit": {"tracker": "none", "req_prefix": "ORD", "default_branch": "main", "gitlab_base": GL, "gitlab_project": "shop/shop-order"},
         # 你是谁: GitLab, no token, no brain.user there: the page asks for the GitLab username
         "me": {"name": None, "source": "none", "gitlab": GL, "text": "", "ask": True, "label": identity.LABEL_GITLAB,
                "why": identity.WHY_GITLAB, "suggest": "alice", "error": ""}},
        {"id": "r4", "path": "/Users/alice/workplace/shop-tools", "name": "shop-tools", "ok": True, "error": "", "pending": None,
         "kit": {"tracker": "none", "req_prefix": "TOOL", "default_branch": "main", "gitlab_base": "", "gitlab_project": ""},
         # no GitLab: the login name (brain-kit 91e2fee)
         "me": {"name": "alice", "source": "login", "gitlab": "", "text": "alice（这台机器的登录名：这个仓库不用 GitLab）",
                "ask": False, "label": "", "why": "", "suggest": "", "error": ""}}]
    # KiroCrew is fine in the world (the 「KiroCrew 有 FAIL」 switch shows a failing row); shop-tools keeps its ! reminder
    ok_hook = {"level": "OK", "text": "brain-dev.json 的 Lean hook 都在", "todo": "", "fix": None, "repo": None, "raw": ""}
    world_status["crew"]["rows"] = [ok_hook if r_["level"] == "FAIL" else r_ for r_ in status["crew"]["rows"] if r_.get("fix") != "kit"] + tool_kit
    world = {"note": "made by scripts/preview_world.py: do not edit by hand", "at": T0, "status": world_status, "overview": world_ov,
             "boards": boards, "details": details}
    (ROOT / "ui" / "preview" / "world.json").write_text(json.dumps(world, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    # the contract fixtures the UI tests read: the overview's numbers for its own rows, one live board and one merged
    ov["cto"] = deliveries.cto_numbers([("r1", parts[0][1])], list(rows.values()), available=True, now=T0)
    (FIX / "overview.json").write_text(json.dumps(ov, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (FIX / "board.json").write_text(json.dumps(boards["r1/PAY-3"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (FIX / "board-merged.json").write_text(json.dumps(boards["r1/PAY-2"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("world: %d rows, %d boards; fixtures: overview.json (cto), board.json, board-merged.json" % (len(all_rows), len(boards)))


if __name__ == "__main__":
    main()
