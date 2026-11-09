#!/usr/bin/env python3
"""The preview's world (ui/preview/world.json) and the board fixtures, made with the app's own code.

Every requirement here is written as what brain-kit and Lean record — Lean's audit events, the run branch's commits,
the hand-over, the bridge's acceptance and vouchers, park.json's questions, the MR's D-n, the merge — and turned into
the 需求看板 snapshot by backend/core/board.py (the same fold the backend runs), the 需求详情's stages and timeline by
lean_view and detail, and 交付总览's numbers by deliveries.cto_numbers. So the preview and the UI tests see exactly the
shapes the backend answers with, and timelines that look like real work: hours and days, waits for people, a rejection,
a failed verify, questions on the MR.

Each row's state, Lean progress and what it waits on (who, the step, where, since when) are worked out by
deliveries.classify from the same records, as the backend does; 待办 is todo.build over those rows; 交付总览 is made
for 全部 and for each repo, with and without brainkit.evaluate, the way the backend makes it.

The world (times relative to 2026-11-08 14:00 UTC, the fixtures' `at`; the preview moves them to now):
  shop-pay (r1, GitLab shop/shop-pay): PAY-3 本机 · waits for its PLAN approval; PAY-1 本机 · its session idle, the
      release next (a review in a new session first); PAY-4 on the runner · parked on D-2 for the product; PAY-5 waits
      for its acceptance (D-3); PAY-7 hand-over refused; PAY-6 carol's claim, PAY-8 alice's, neither started; PAY-2
      merged, with a whole trace for 回放 (a rejection, a question, a red verify, the acceptance, the write-back).
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
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import backend.routes  # noqa: E402,F401  (the private namespace the app's modules live in)
import importlib  # noqa: E402

board = importlib.import_module("_brainapp_backend.core.board")
problems = importlib.import_module("_brainapp_backend.core.problems")
todo = importlib.import_module("_brainapp_backend.core.todo")
mrdesc_view = importlib.import_module("_brainapp_backend.core.mrdesc_view")
detail = importlib.import_module("_brainapp_backend.core.detail")
lean_view = importlib.import_module("_brainapp_backend.core.lean_view")
deliveries = importlib.import_module("_brainapp_backend.core.deliveries")
identity = importlib.import_module("_brainapp_backend.core.identity")
service = importlib.import_module("_brainapp_backend.core.service")
bk = importlib.import_module("_brainapp_backend.core.bk")
brainview = importlib.import_module("_brainapp_backend.core.brainview")
repo_mod = importlib.import_module("_brainapp_backend.core.repo")
store = importlib.import_module("_brainapp_backend.core.store")
BRAINKIT = Path(os.environ.get("BRAIN_TEST_BRAINKIT") or Path.home() / "warren_ws" / "brain-kit")

FIX = ROOT / "ui" / "src" / "test" / "fixtures"
T0 = 1794146400          # 2026-11-08 14:00 UTC: the fixtures' `at`
M, H, D = 60, 3600, 86400
GL = "https://gitlab.example.com"
ME = "alice"
NO_KIT = "还没装 brain-kit：在「导入仓库」里检查它，装上就能用"     # service.reload_sync's words for a repo without it
CFG = {"default_branch": "main", "handoff_label": "ai-handoff", "running_label": "ai-running",
       "rejected_label": "ai-handoff-rejected"}
# what brainkit.trace says it could not read on a person's machine (its own words)
TRACE_MISSING = ["bridge ledger (--ledger not given)", "vouchers (--vouchers not given and no intake store)",
                 "pushes (git keeps no push log; person commits after hand-over stand in for them)",
                 "CI pipelines (GitLab, not readable here)"]


def _epoch(ts: str) -> float:
    return float(lean_view.epoch(ts))


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
        self.proposals = 0

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

    def _doc(self, kind: str, unit: str | None) -> dict:
        """What Lean's approval of *kind* covers: its document (a PLAN is one unit's code-generation plan)."""
        path = {"REQUIREMENTS": "inception/requirements/requirements.md",
                "DESIGN": "inception/application-design/application-design.md",
                "PLAN": "construction/plans/%s-code-generation-plan.md" % unit,
                "RELEASE": "operations/release.md"}.get(kind, "%s.md" % kind.lower())
        return dict({"path": "aidlc-docs/%s/%s" % (self.intent, path)}, **({"unit": unit} if unit else {}))

    def request(self, at: float, kind: str, unit: str | None = None, sha8: str | None = None) -> str:
        h = sha(self.key, kind, at)
        h = sha8 + h[len(sha8):] if sha8 else h
        self._lean(at, "APPROVAL_REQUESTED", kind=kind, sha256=h, **self._doc(kind, unit))
        return h

    def approve(self, at: float, kind: str, h: str, who: str = "P-1A2B", unit: str | None = None) -> None:
        self._lean(at, "APPROVED", kind=kind, sha256=h, **self._doc(kind, unit))
        self.humans.append({"at": iso(at), "kind": "approval", "what": kind, "who": who, "judgment_point": True})

    def reject(self, at: float, kind: str, h: str) -> None:
        self._lean(at, "REJECTED", kind=kind, sha256=h, **self._doc(kind, None))
        self.humans.append({"at": iso(at), "kind": "rejection", "what": kind, "who": "P-1A2B", "judgment_point": True})

    def turn(self, at: float, session: str = "s-1") -> None:
        """The person typed in the session (Lean's UserPromptSubmit hook): the session's first prompt is its task."""
        self._lean(at, "HUMAN_TURN", session=session, turn=sum(1 for e in self.events if e["event"] == "HUMAN_TURN") + 1,
                   chars=40)

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
        s = self.commit(at, "person", "%s: hand off to team runner" % self.key, files=2, after=False, records=True)
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
        self.events.sort(key=lambda e: e["_at"])          # Lean's ledger in time order, as lean_view.events reads it
        approvals = []
        last: dict[str, dict] = {}
        for e in self.events:
            if e["event"] in ("APPROVAL_REQUESTED", "APPROVED", "REJECTED"):
                last[(e["data"]["kind"], e["data"].get("unit"))] = e        # a PLAN is asked per unit, as Lean does
        for (kind, _), e in last.items():
            st = {"APPROVAL_REQUESTED": "pending", "APPROVED": "approved", "REJECTED": "rejected"}[e["event"]]
            h = e["data"]["sha256"]
            approvals.append({"kind": kind, "unit": e["data"].get("unit"), "state": st, "sha8": h[:8], "at": e["_at"],
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
                "merged_at": self.merged_at, "tip_at": self.merged_at or (_epoch(self.commits[-1]["at"]) if self.commits else None),
                "park_at": _epoch(self.park[-1]["at"]) if self.park else None, "review": None,
                "decisions_text": "```brain-proposal\n```\n" * self.proposals, "events": self.events, "approvals": approvals,
                "stages": lean_view.stages(self.events)}

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
        return {"stages": stages, "humans": self.humans, "brain": brain, "missing": TRACE_MISSING,
                "actions": {"commits": self.commits, "handovers": self.hands, "questions": self.park, "blocked": [
                    {"at": e["ts"], "gate": e["data"]["gate"], "path": e["data"]["path"], "tool": "fs_write", "src": "aidlc-docs/audit/L-3F2A1C.jsonl"}
                    for e in self.events if e["event"] == "BLOCKED"]},
                "decisions": self.decs, "checks": {"verify": verify},
                "outcome": {"handed_over": {"value": self.hand_at is not None},
                            "merged_at": {"value": iso(self.merged_at) if self.merged_at else None, "how": self.merge_how,
                                          "commit": sha(self.key, "merge") if self.merged_at else None, "src": "git", "note": None},
                            "reverted_or_hotfixed_within_14d": self.after14 or {"value": None, "window_closed": None, "window_end": None, "evidence": []}}}


def app_event(at: float, label: str, detail: str | None = None) -> dict:
    """What this app recorded itself doing (backend/core/store.py's line, read back as Store.events gives it)."""
    return {"at": iso(at), "kind": "app", "label": label, "detail": detail, "who": None, "src": "app"}


def changes(r: Req) -> dict[str, list[dict]]:
    """Each commit's files as board.changes_from_log reads them from git: the hand-over's run.json and MR.md, a
    records-only commit's Lean records, else the requirement's code and its tests; a path's first commit adds it."""
    area = r.slug.split("-")[0]
    seen: set[str] = set()
    out = {}
    for c in r.commits:
        h = int(c["sha"][:8], 16)
        if c["subject"].endswith("hand off to team runner"):
            pool = ["runs/%s/run.json" % r.key, "runs/%s/MR.md" % r.key]
        elif c["records_only"]:
            pool = ["aidlc-docs/%s/%s" % (r.intent, x) for x in (
                "aidlc-state.md", "decisions.md", "inception/requirements/requirements.md",
                "inception/application-design/application-design.md", "audit.md")]
        else:
            pool = ["src/%s/%s.py" % (area, x) for x in ("service", "models", "api", "export", "jobs")] + [
                "tests/test_%s.py" % area, "tests/test_%s_api.py" % area]
        paths = list(dict.fromkeys(pool[(h + i) % len(pool)] for i in range(max(1, int(c["files"])))))
        out[c["sha"]] = [{"path": p, "added": 4 + (h >> (2 * i)) % 70, "removed": 0 if p not in seen else (h >> i) % 15,
                          "status": "M" if p in seen else "A"} for i, p in enumerate(paths)]
        seen.update(paths)
    return out


# each repo's Brain (file, section, id, header attributes, text): its older entries (sequential ids) and what its
# merged runs wrote back; T-13 cites a chat (not a reference: brain lint fails it), T-PAY-2-1 came back twice
BRAIN = {
    "r1": [("PRODUCT", "退款", "P-7", "type:principle side:product rel:new src:PAY-1", "对商户的金额一律到分，不四舍五入到元。"),
           ("TECH", "退款", "T-12", "type:guideline side:builder rel:new src:PAY-1", "导出大文件分批写，一批不超过 5000 行。"),
           ("TECH", "回调", "T-13", "type:decision side:builder rel:new src:见群聊", "退款回调失败后按 1、5、30 分钟重试三次，之后进人工队列。"),
           ("PROJECT", "约定", "J-3", "type:process side:shared rel:new src:PAY-1", "需求文档一律走开需求的五关，原件不进任何仓库。")],
    "r3": [("TECH", "订单", "T-3", "type:guideline side:builder rel:new src:ORD-1", "订单金额的计算只在 order-core 里做，页面只展示。"),
           ("PRODUCT", "订单", "P-2", "type:principle side:product rel:new src:ORD-1", "取消订单不收手续费。"),
           # every merged run loads it, none cites it: Brain's 撤回候选
           ("PROJECT", "约定", "J-1", "type:process side:shared rel:new src:ORD-1", "每个需求都先在群里报一声再开工。")],
    "r4": [],
}
# what a merged run wrote back into the Brain (brain reflect, merged), by key
WRITTEN_BACK = {
    "PAY-2": [("PRODUCT", "退款", "P-PAY-2-1", "type:decision side:product rel:new src:D-1,RUN-PAY-2-1",
               "退款单只给有退款权限的运营看：里面有收款人姓名。"),
              ("TECH", "退款", "T-PAY-2-1", "type:pitfall side:builder rel:new repeats:2 src:D01#S030,V-1a2b3c4d5e",
               "退款单号是 RF + 9 位；样例文件里的 7 位是旧格式。\n校验时两种都认，生成只用新格式。"),
              ("IMPROVEMENT", "流程", "I-PAY-2-1", "type:process side:builder rel:new repeats:1 src:RUN-PAY-2-1",
               "交接前先 rebase 到最新的 main：桥只收 brain_commit 在 main 上的运行。")],
}
for _i, _k in enumerate(("ORD-2", "ORD-4", "ORD-6", "ORD-8")):
    WRITTEN_BACK[_k] = [("TECH", "订单", "T-%s-1" % _k, "type:pitfall side:builder rel:new src:RUN-%s-1" % _k,
                         ("地址校验要先去掉全角空格。", "优惠券叠加先算满减再算折扣。", "取消订单的退款走原路返回。",
                          "运费分摊按商品金额比例，尾差记在最后一件。")[_i])]
# what each run's Lean records cite besides its decisions (its requirements document), by key: the Brain it used
CITES = {"PAY-2": ["T-12", "P-7"], "PAY-3": ["T-12", "T-PAY-2-1", "T-PAY-9-1"], "PAY-1": ["P-PAY-2-1"],
         "PAY-4": ["T-PAY-2-1", "T-12"], "PAY-5": ["T-PAY-2-1"], "ORD-3": ["T-3", "T-ORD-2-1"], "ORD-5": ["P-2"],
         "ORD-7": ["T-ORD-4-1", "T-ORD-6-1"], "ORD-8": ["T-ORD-6-1"], "ORD-9": ["T-ORD-8-1", "T-3"], "ORD-10": ["T-ORD-8-1"]}
FREE_TEXT = {"r1": {"PRODUCT": "退款要在 7 天内处理"}}     # a line outside the entries: brain lint warns


def trace_row(u: dict, intent: str, key: str) -> dict | None:
    """The run's own row of brainkit.usage, picked as brainkit.trace picks it: its intent and key, else its intent."""
    runs = u.get("runs") or []
    return next((x for x in runs if x.get("intent") == intent and x.get("key") == key), None) or \
        next((x for x in runs if x.get("intent") == intent), None)


def no_trace_brain(r: Req) -> dict:
    """需求详情's Brain block of a requirement brainkit.trace does not read (no run yet, or no brain-kit here)."""
    return detail.brain_block(None, None, r.facts()["decisions_text"] if r.start_at is not None else None)


def brain_views(reqs: dict[str, list[Req]], rows: list[dict], said: dict[str, list[dict]]) -> tuple[dict[str, dict], dict[str, dict]]:
    """Each repo's Brain page (GET /brain) as brainview.view makes it with brain-kit, on a scratch git repo that holds
    what the world says: the Brain on main, each merged run (its run.json at the Brain it loaded, its decisions.md
    citing what it used) and the write-back that followed it, each run not merged yet on its branch (a local one in
    its worktree). Its decisions.md holds the decisions 需求详情 shows for it (*said*, by "<repo>/<key>"), so its 决定
    and its 用到的 Brain cite the same entries. And each run's Brain block, by "<repo>/<key>", as 需求详情 and 需求看板 get it: detail.brain_block of
    brainkit.trace's, the usage row of the run read where the service reads its trace (its worktree, else its ref), the
    very read and row the Brain page's numbers come from. ({}, {}) without brain-kit (BRAIN_TEST_BRAINKIT)."""
    if not (BRAINKIT / "brainkit" / "__init__.py").is_file():
        print("no brain-kit at %s: the Brain pages are left out" % BRAINKIT)
        return {}, {}
    bk.load(str(BRAINKIT))
    E = bk.m("entries")
    paths = {"r1": "/Users/alice/workplace/shop-pay", "r3": "/Users/alice/workplace/shop-order",
             "r4": "/Users/alice/workplace/shop-tools"}
    prefix = {"r1": "PAY", "r3": "ORD", "r4": "TOOL"}
    out, uses = {}, {}
    with tempfile.TemporaryDirectory() as tmp:
        for rid, path in paths.items():
            top = Path(tmp) / rid
            top.mkdir()

            def git(*a: str) -> str:
                return subprocess.run(["git", "-C", str(top), "-c", "user.name=alice", "-c", "user.email=alice@example.com",
                                       *a], check=True, capture_output=True, text=True).stdout.strip()

            git("init", "-q", "-b", "main")
            (top / ".brain").mkdir()
            (top / ".brain" / "kit.json").write_text(json.dumps({"req_prefix": prefix[rid], "default_branch": "main",
                                                                  "tracker": "none"}), encoding="utf-8")
            entries = list(BRAIN[rid])

            def write_brain() -> None:
                (top / "brain").mkdir(exist_ok=True)
                for key in E.FILES:
                    text = (BRAINKIT / "templates" / "brain" / ("%s.md" % key)).read_text(encoding="utf-8").rstrip("\n")
                    if FREE_TEXT.get(rid, {}).get(key):
                        text += "\n\n" + FREE_TEXT[rid][key]
                    for section in dict.fromkeys(x[1] for x in entries if x[0] == key):
                        text += "\n\n## %s" % section
                        for file, sec, eid, attrs, body in entries:
                            if file == key and sec == section:
                                text += "\n\n<!-- id:%s %s -->\n%s" % (eid, attrs, body)
                    (top / "brain" / ("%s.md" % key)).write_text(text + "\n", encoding="utf-8")

            def run_files(r: Req, brain_commit: str) -> None:
                (top / "runs" / r.key).mkdir(parents=True, exist_ok=True)
                (top / "runs" / r.key / "run.json").write_text(json.dumps(
                    {"key": r.key, "owner": r.owner, "branch": r.branch, "intent": r.intent, "brain_commit": brain_commit,
                     "created_at": iso(r.start_at or T0)}), encoding="utf-8")
                d = top / "aidlc-docs" / r.intent
                (d / "inception" / "requirements").mkdir(parents=True, exist_ok=True)
                table = "".join("| %s | %s | %s | %s | %s | %s |\n" % (x["id"], x["date"], x["stage"], x["text"], x["why"],
                                                                      " ".join([x["who"] or x["by"]] + x["cites"]))
                                for x in said.get("%s/%s" % (rid, r.key)) or [])
                (d / "decisions.md").write_text("# Decisions\n\n| ID | Date | Stage | Decision | Why | Who |\n|---|---|---|---|---|---|\n"
                                                + table + "```brain-proposal\n```\n" * r.proposals, encoding="utf-8")
                (d / "inception" / "requirements" / "requirements.md").write_text(
                    "# %s\n\n" % r.title + "".join("- 照 Brain 的 %s\n" % c for c in CITES.get(r.key, [])), encoding="utf-8")

            write_brain()
            git("add", "-A")
            git("commit", "-qm", "brain-kit and the Brain")
            mine = sorted((r for r in reqs.get(rid, []) if r.start_at is not None), key=lambda r: r.merged_at or 1e12)
            for r in [r for r in mine if r.merged_at]:
                run_files(r, git("rev-parse", "HEAD"))
                git("add", "-A")
                git("commit", "-qm", "merge %s" % r.key)
                if r.key in WRITTEN_BACK:
                    entries += WRITTEN_BACK[r.key]
                    write_brain()
                    git("add", "-A")
                    git("commit", "-qm", "brain: %s written back" % r.key)
            main = git("rev-parse", "HEAD")
            for r in [r for r in mine if not r.merged_at]:
                git("checkout", "-q", "-b", r.branch, main)
                run_files(r, main)
                git("add", "-A")
                git("commit", "-qm", "%s: start" % r.key)
                git("checkout", "-q", "main")
                if r.hand_at is None:      # on this machine: in its worktree
                    git("worktree", "add", "-q", str(Path(tmp) / ("wt-%s" % r.key)), r.branch)
            repo = repo_mod.Repo(rid, str(top), bk.m("config").load(str(top)))
            reflect = [{"key": x["key"], "title": x["title"], "state": x["state"]} for x in rows
                       if x["repo"] == rid and next((q.proposals for q in reqs[rid] if q.key == x["key"]), 0)]
            view = brainview.view(repo, reflect)
            out[rid] = json.loads(json.dumps(view, ensure_ascii=False).replace(repo.path, path))
            by_key = {r.key: r for r in mine}
            for f in repo.scan():
                r = by_key.get(f["key"])
                if r is None or not f.get("run"):
                    continue
                src, ref = (f["worktree"], None) if f.get("worktree") else (repo.path, f.get("ref"))   # service._timeline
                got = trace_row(bk.m("usage").collect(src, repo.cfg, ref=ref), r.intent, r.key) or {}
                uses["%s/%s" % (rid, r.key)] = detail.brain_block(
                    {"loaded": got.get("loaded"), "cited": got.get("cited"), "stale": got.get("stale"),
                     "unknown": got.get("unknown"), "proposals": {"total": r.proposals}}, None, None)
    return out, uses


def standard(r: Req, t: float, *, design_back: bool = False, units: tuple[str, ...] = ()) -> float:
    """The local half up to the design approval, from *t*: reverse engineering skipped, requirements, user stories
    skipped, the application design (sent back once when *design_back*), units skipped (or split into *units*).
    Returns where it ended."""
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
    if units:
        r.stage(end + 1 * M, "units", "started")
        r.stage(end + 10 * M, "units", "done", note="拆成 %d 个单元：%s" % (len(units), "、".join(units)))
        return end + 12 * M
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


# the 待办 fixture's items, in this order (ui/src/views/todo.test.tsx reads them by place)
TODO_KINDS = ("lean_approval", "clarify", "question", "acceptance", "handoff_rejected", "handoff_unlabelled", "crew", "start",
              "reply")
STAGES: dict[str, list] = {}   # each requirement's Lean stages as lean_view reads them (the 需求详情 the preview makes)


def classified(r: Req, row: dict, *, park: dict | None = None, mr: dict | None = None, slot: dict | None = None,
               local_only: bool = False, reflected: bool = False, at_handover: bool = False) -> dict:
    """*row* with what the backend works out of *r*'s records (service._row: deliveries.base_row and classify): its
    state, Lean progress and what it waits on. The rest of *row* (title, summary, credits, the MR link) stays."""
    f = r.facts(park)
    got = deliveries.base_row(r.repo, f, local_only=local_only)
    deliveries.classify(got, f, mr=mr, slot=slot, cfg=CFG, me=ME, reflected=reflected, now=T0, at_handover=at_handover)
    row.update({k: got[k] for k in ("state", "state_label", "lean", "stage", "waits", "local_only")})
    row["session_url"] = slot["url"] if slot else None
    row["summary"] = mrdesc_view.plain_line(row.get("summary"))     # what service._row shows of the 变更说明
    return row


LATER: dict[str, tuple] = {}   # each board's makings by "<repo>/<key>", made once every run's Brain block is known


def board_later(r: Req, row: dict, **kw) -> None:
    """*r*'s board (snapshot), made at the end: its Brain block comes from brain_views, which needs every record."""
    LATER["%s/%s" % (r.repo, r.key)] = (r, row, kw)


def snapshot(r: Req, row: dict, *, brain: dict, park: dict | None = None, sessions: list | None = None,
             decisions: list | None = None, local_only: bool = False, kit_rows: list | None = None, reflect: list | None = None,
             mr: dict | None = None, me: str | None = "alice", mr_desc: dict | None = None, questions: list | None = None,
             credits: float | None = None, facts: dict | None = None, team_decisions: list | None = None,
             bid: str | None = None) -> dict:
    """The board snapshot the backend answers (service._board_sync), built the same way. *facts*: what the board is
    folded from when they are not *r*'s own records as this machine reads them (the team runner's workspace)."""
    f = facts or r.facts(park)
    STAGES[bid or "%s/%s" % (r.repo, r.key)] = f["stages"]
    t = r.trace(brain) if f.get("run") else None
    subjects = {c["sha"]: c["subject"] for c in r.commits}
    sessions = sessions or []
    g = board.build(f, row, t, mr=mr, sessions=sessions, app_events=r.app, team_decisions=team_decisions or [], subjects=subjects,
                    changes=changes(r),
                    reflect_refs=reflect or [], default_branch="main", local_only=local_only,
                    kit_rows=board.kit_cells(kit_rows or [], "/Users/alice/workplace/%s" % {"r1": "shop-pay", "r3": "shop-order", "r4": "shop-tools"}.get(r.repo, "")),
                    decisions=decisions or [], brain=brain, me=me, now=T0)
    return {"at": T0, "row": row, "branch": row.get("branch"), "base": "main", "started_at": g["started_at"], "ended_at": g["ended_at"],
            "live": g["live"], "person": g["person"], "actors": g["actors"],
            "edges": [list(e) for e in service.board_edges([a["key"] for a in g["actors"]], g["direct"])], "direct": g["direct"],
            "events": g["events"], "belt": g["belt"], "checks": g["checks"], "accept": g["accept"], "brain": brain,
            "decisions": decisions or [], "questions": questions or [],
            "mr_desc": mr_desc or {"available": True, "text": "", "first": None, "source": None, "path": None, "ref": None,
                                   "error": "还没开工：开工以后才有变更说明"},
            "sessions": sessions, "credits": {"total": credits, "note": detail.NO_TOKENS},
            "source": "trace" if t else "app", "error": "", "missing": g["missing"]}


def main() -> None:
    ov = json.loads((FIX / "overview.json").read_text(encoding="utf-8"))
    ov["eval"]["raw"] = ""                                             # deliveries.evaluate: brain-kit's own words
    for r_ in ov["funnel"]["rows"]:                                    # who settled them, in vocab.ts's words
        r_["label"] = deliveries.CAT_LABEL.get(r_["id"], r_["label"])
    det = json.loads((FIX / "detail.json").read_text(encoding="utf-8"))
    status = json.loads((FIX / "status.json").read_text(encoding="utf-8"))
    rows = {r["key"]: r for r in ov["rows"]}
    for q in ov["eval"]["queue"]:
        q["reasons"] = [deliveries.acts_in_words(x) for x in q["reasons"]]
    for e in ov["errors"] + [r_ for r_ in status["repos"] if r_.get("error")]:
        if "还没装 brain-kit" in e["error"]:
            e["error"] = NO_KIT
    # each row's 变更说明 first line (service._row: mrdesc_view.plain_line of it): the requirement's own
    first = {"PAY-2": "退款单号加上校验位，重复和非法单号在入口就拒掉。", "PAY-4": "对账单按商户拆成一户一份，大商户按小时切。",
             "PAY-5": "退款回调失败自动重试，第 6 次转人工处理。", "PAY-7": "退款时选原因，原因列表在后台维护。"}
    for k, line in first.items():
        rows[k]["summary"] = line
    tmpl = copy.deepcopy(rows["PAY-2"])
    boards: dict[str, dict] = {}
    details: dict[str, dict] = {}
    runs: list[dict] = []
    reqs: dict[str, list[Req]] = {"r1": [], "r3": [], "r4": []}      # every requirement's records, by repo

    def mrdesc(r: Req, first: str) -> dict:
        """The requirement's own 变更说明 in brain mr-desc's layout, from its records: what it did (its commits), its
        checks (Lean's verify), what is not there yet."""
        verify = [e for e in r.events if e["event"] == "VERIFY"]
        done = [c["subject"].split("：", 1)[-1] for c in r.commits if c["by"] in ("person", "bot") and not c["records_only"]
                and not c["subject"].endswith("hand off to team runner")]
        checks = ("verify %s：%s。" % ("通过" if verify[-1]["data"]["ok"] else "没过", "、".join(
            x["cmd"] for x in verify[-1]["data"]["results"]))) if verify else "还没跑 verify。"
        text = "\n".join([
            "## %s · %s" % (r.key, r.title), "", "**一句话**：%s" % first,
            "（分支 `%s`；负责人 %s；intent `%s`）" % (r.branch, r.owner, r.intent), "", "### 做了什么 / 没做什么"]
            + ["- %s" % x for x in done[-4:] or ["还没有代码提交"]] + ["", "### 验收标准和证据", checks, "", "### 还没有"]
            + (["- 还没合并"] if not r.merged_at else ["- 合并后 14 天还在观察"] if not (r.after14 or {}).get("window_closed") else [])
            + ["", "---", "由 `brain mr-desc` 从记录生成（run.json、Lean 记录、git），别手改。重新生成：`brain mr-desc %s --write`。" % r.key, ""])
        m = copy.deepcopy(det["mr_desc"])
        m.update(text=text, first=first, source="file", path="runs/%s/MR.md" % r.key, ref=sha(r.key, "ref")[:12])
        return m

    def decisions(r: Req, rows: list[tuple]) -> list[dict]:
        """The requirement's own decisions.md rows (detail.decisions' shape): (stage, decision, why, who, by, cites)."""
        day = iso(r.start_at or T0)[:10]
        return [{"id": "D-%d" % i, "date": day, "stage": st, "text": text, "why": why, "who": who, "by": by,
                 "cites": list(cites), "vouchers": ["V-%s" % sha(r.key, i)[:10]] if by == "person" else [],
                 "src": "aidlc-docs/%s/decisions.md#L%d" % (r.intent, 7 + i)}
                for i, (st, text, why, who, by, cites) in enumerate(rows, 1)]

    # ---------------------------------------------------------------- shop-pay
    # PAY-2: merged, the whole way (a design sent back, a question on the MR, a red verify, the acceptance, the write-back)
    p2 = Req("r1", "PAY-2", "退款单号校验", "alice", "refund-id", "261102-refund-id", project="shop/shop-pay")
    p2.claim_at = T0 - 6 * D - 2 * H
    t = standard(p2, T0 - 6 * D, design_back=True)
    end, h = runner_half(p2, t + 20 * M, iid=37, question=("D-1", "clarify", 41 * M, "A"), verify_fail=True)
    merged(p2, end, h, "D-2")
    p2.app.append(app_event(p2.merged_at + 15 * H, "回写 Brain：成功", "brain/PAY-2-reflect-1"))
    p2.proposals = 1
    reqs["r1"].append(p2)
    p2_sess = dict(det["sessions"][0], slot="brain-PAY-2-1c4e", url="/chat?sid=brain-PAY-2-1c4e", title="PAY-2 退款单号校验",
                   credits=8.3, turns=19, busy=False, awaiting=False, last_activity=p2.hand_at)
    row = classified(p2, rows["PAY-2"], reflected=True, slot=p2_sess)
    row.update(updated_at=p2.merged_at + 35 * M, credits=22.7)
    p2_decisions = decisions(p2, [("requirements", "退款单号按 RF + 9 位校验，旧的 7 位也认", "回答了澄清问题 D-1", "P-1A2B", "person", []),
                                  ("application-design", "重复和非法单号在入口直接拒", "下游对账按单号去重", None, "agent", ["T-12"]),
                                  ("code-generation", "校验写成纯函数，接口和批量导入共用", "照 Brain 的约定", "P-7", "brain", ["P-7"])])
    board_later(p2, row, decisions=p2_decisions,
                                  reflect=[("brain/PAY-2-reflect-1", p2.merged_at + 15 * H)],
                                  sessions=[p2_sess,
                                            dict(det["sessions"][0], slot="brain-run-RUN-PAY-2-1", url="/chat?sid=brain-run-RUN-PAY-2-1", title="RUN-PAY-2-1",
                                                 agent="brain-run", kind="runner", credits=14.4, turns=41, busy=False, awaiting=False, last_activity=p2.merged_at)],
                                  mr_desc=mrdesc(p2, first["PAY-2"]), credits=22.7)
    runs.append({"key": "PAY-2", "repo": "r1", "how": "people", "beyond": ["回答问题"], "at_points": 5, "outside": 0, "credits": 22.7, "merged_at": p2.merged_at})

    # PAY-3: on this machine, two units: refund-export's code written yesterday; the session sat quiet overnight until
    # alice spoke to it this morning; refund-api's code-generation plan (PLAN) waits for her approval, a clarify
    # question waits too
    p3 = Req("r1", "PAY-3", "退款单导出 CSV", "alice", "refund-export", "261107-refund-export", project="shop/shop-pay")
    p3.claim_at = T0 - 1 * D - 6 * H
    units = ("refund-export", "refund-api")
    t = standard(p3, T0 - 1 * D - 4 * H, units=units)
    p3.app += [app_event(p3.start_at, "在 app 里开工", "工作区 /Users/alice/workplace/brain-app/shop-pay/refund-export，分支 %s" % p3.branch),
               app_event(p3.start_at + 20, "开了本机会话", store.TRUSTED)]    # service.intake_start, open_session
    p3.turn(p3.start_at + 30)                                   # the app's kickoff: the session's task
    for u in units:
        p3.stage(t, "functional-design", "started", unit=u)
        p3.stage(t + 18 * M, "functional-design", "done", unit=u, note="导出字段和分批规则定了")
        p3.stage(t + 20 * M, "nfr-design", "skipped", unit=u, note="没有新的指标")
        p3.stage(t + 21 * M, "infrastructure-design", "skipped", unit=u, note="不动基础设施")
    p3.stage(t + 23 * M, "code-generation", "started", unit="refund-export")
    h = p3.request(t + 35 * M, "PLAN", unit="refund-export")
    p3.approve(t + 52 * M, "PLAN", h, unit="refund-export")
    p3.commit(t + 70 * M, "person", "PAY-3：导出接口的骨架", files=4)
    p3.commit(t + 95 * M, "person", "PAY-3：refund-export：分批写 CSV", files=3)
    p3.stage(t + 110 * M, "code-generation", "done", unit="refund-export", note="refund-export 的代码写完了，单测全过")
    p3.turn(T0 - 5 * H)                                         # the next morning: alice tells it to go on
    p3.stage(T0 - 5 * H + 2 * M, "code-generation", "started", unit="refund-api")
    p3.commit(T0 - 40 * M, "person", "PAY-3：refund-api 的代码计划", files=1, records=True)
    p3.question_park(T0 - 20 * M, "waiting", "clarify")
    p3.request(T0 - 6 * M, "PLAN", unit="refund-api", sha8="5d1e7a90")
    reqs["r1"].append(p3)
    q3 = det["questions"][0]
    p3_park = {"status": "waiting", "kind": "clarify", "ask": "owner", "question": q3["question"], "options": q3["options"],
               "recommend": q3["recommend"], "refs": q3["refs"]}
    row = classified(p3, rows["PAY-3"], park=p3_park, slot=det["sessions"][0])
    det["row"] = row
    f3 = p3.facts(p3_park)      # 需求详情's Lean card, as service._detail_sync sends it: the same records as the row
    det["lean"]["stages"] = f3["stages"]
    det["lean"]["approvals"] = [{k: a[k] for k in ("kind", "state", "sha8", "at", "line", "path")} for a in f3["approvals"]]
    det["timeline"]["missing"] = board.missing_sources(TRACE_MISSING, local_only=False, handed=False)
    board_later(p3, row, park=p3_park,
                                  sessions=det["sessions"], decisions=det["decisions"], questions=det["questions"],
                                  mr_desc=det["mr_desc"], credits=row.get("credits"))
    details["r1/PAY-3"] = det

    # PAY-4: on the runner, parked on D-2 (a design question for the product)
    p4 = Req("r1", "PAY-4", "对账单按商户拆分", "carol", "merchant-split", "261105-merchant-split", project="shop/shop-pay")
    p4.claim_at = T0 - 2 * D
    t = standard(p4, T0 - 9 * H)
    p4.commit(t + 10 * M, "person", "PAY-4：设计定稿", files=2, records=True)
    p4.handoff(t + 30 * M)
    p4.accepted(t + 32 * M, 41, "RUN-PAY-4-1")
    p4.stage(t + 35 * M, "functional-design", "started", unit="split-job")
    p4.commit(t + 2 * H, "bot", "PAY-4：拆分任务的骨架（split-job）", files=5)
    p4.question_park(T0 - 3 * H - 2 * M, "waiting", "design")
    p4.ask("D-2", "design", T0 - 3 * H)
    p4_park = {"status": "waiting", "kind": "design", "ask": "product"}
    reqs["r1"].append(p4)
    row = classified(p4, rows["PAY-4"], park=p4_park, mr={"state": "opened", "labels": ["ai-running"], "questions": [
        {"id": "D-2", "kind": "design", "state": "open", "lean_request": None, "at": iso(T0 - 3 * H)}]})
    board_later(p4, row, park=p4_park, decisions=decisions(p4, [
                                      ("application-design", "按商户拆成一户一份", "财务按商户对账", None, "agent", ["T-12"])]),
                                  questions=[{"source": "mr", "id": "D-2", "kind": "design", "kind_label": "设计", "question": "按商户拆分时，一个商户一天超过 10 万行要不要再按小时切？",
                                              "options": [{"id": "A", "text": "按小时切成多份"}, {"id": "B", "text": "一份，压缩成 zip"}], "recommend": "A",
                                              "lean_request": None, "refs": ["D01#S002"], "state": "open", "answer": None, "answerer": None, "voucher_id": None,
                                              "mr_url": "%s/shop/shop-pay/-/merge_requests/41" % GL, "at": T0 - 3 * H, "answerable_here": False, "answer_via": None}],
                                  sessions=[dict(det["sessions"][0], slot="brain-run-RUN-PAY-4-1", url="/chat?sid=brain-run-RUN-PAY-4-1", title="RUN-PAY-4-1", agent="brain-run",
                                                 kind="runner", credits=6.1, turns=17, busy=False, awaiting=False, last_activity=T0 - 3 * H)],
                                  mr_desc=mrdesc(p4, first["PAY-4"]), credits=None)
    runs.append({"key": "PAY-4", "repo": "r1", "how": "pending", "beyond": [], "at_points": 2, "outside": 0, "credits": None, "merged_at": None})

    # PAY-5: waits for its acceptance on the MR (D-3)
    p5 = Req("r1", "PAY-5", "退款回调失败重试", "alice", "callback-retry", "261104-callback-retry", project="shop/shop-pay")
    p5.claim_at = T0 - 3 * D
    t = standard(p5, T0 - 2 * D - 20 * H)
    end, h = runner_half(p5, t + 25 * M, iid=44)
    p5.ask("D-3", "acceptance", T0 - 1 * D - 1 * H)
    p5_park = {"status": "waiting", "kind": "acceptance", "lean_request": "RELEASE 0c9a7e21"}
    p5.proposals = 1        # new knowledge to write back once it is merged (Brain's 回写 lists it)
    reqs["r1"].append(p5)
    row = classified(p5, rows["PAY-5"], park=p5_park, mr={"state": "opened", "labels": ["ai-running"], "questions": [
        {"id": "D-3", "kind": "acceptance", "state": "open", "lean_request": "RELEASE 0c9a7e21", "at": iso(T0 - 1 * D - 1 * H)}]})
    board_later(p5, row, park=p5_park,
                                  questions=[{"source": "mr", "id": "D-3", "kind": "acceptance", "kind_label": "验收", "question": "验收：回调失败后最多重试 5 次、间隔翻倍，第 6 次转人工。",
                                              "options": [], "recommend": None, "lean_request": "RELEASE 0c9a7e21", "refs": [], "state": "open", "answer": None, "answerer": None,
                                              "voucher_id": None, "mr_url": "%s/shop/shop-pay/-/merge_requests/44" % GL, "at": T0 - 1 * D - 1 * H, "answerable_here": False, "answer_via": None}],
                                  decisions=decisions(p5, [("requirements", "失败后最多重试 5 次，间隔翻倍", "回调方限流", "P-1A2B", "person", []),
                                                          ("code-generation", "第 6 次失败转人工队列", "照 TECH 的约定", "T-PAY-2-1", "brain", ["T-PAY-2-1"])]),
                                  mr_desc=mrdesc(p5, first["PAY-5"]), credits=31.0,
                                  sessions=[dict(det["sessions"][0], slot="brain-run-RUN-PAY-5-1", url="/chat?sid=brain-run-RUN-PAY-5-1", title="RUN-PAY-5-1", agent="brain-run",
                                                 kind="runner", credits=24.2, turns=52, busy=False, awaiting=False, last_activity=T0 - 1 * D - 1 * H)])
    runs.append({"key": "PAY-5", "repo": "r1", "how": "pending", "beyond": [], "at_points": 2, "outside": 0, "credits": 31.0, "merged_at": None})

    # PAY-7: the hand-over was refused (bob added the label, not the owner alice)
    p7 = Req("r1", "PAY-7", "退款原因下拉框", "alice", "refund-reason", "261108-refund-reason", project="shop/shop-pay")
    p7.claim_at = T0 - 9 * H
    t = standard(p7, T0 - 8 * H - 30 * M)
    p7.stage(t, "code-generation", "started", unit="refund-ui")
    p7.commit(t + 50 * M, "person", "PAY-7：下拉框和原因列表", files=3)
    p7.stage(t + 70 * M, "code-generation", "done", unit="refund-ui", note="代码写完")
    p7.verify(t + 80 * M, [("pytest -q", 0), ("npm test", 0)])
    p7.stage(t + 81 * M, "build-and-test", "done", note="verify PASS：2 项")
    p7.handoff(t + 85 * M)
    reqs["r1"].append(p7)
    why, raw = problems.reasons_text(["label 'ai-handoff' was added by bob, not by the branch owner alice"])
    p7_refused = p7.hand_at + 25 * M        # the bridge's next round after the hand-over
    p7.rejected(p7_refused, why)
    p7_sess = dict(det["sessions"][0], slot="brain-PAY-7-2b9f", url="/chat?sid=brain-PAY-7-2b9f", title="PAY-7 退款原因下拉框",
                   credits=18.2, turns=27, busy=False, awaiting=False, last_activity=T0 - 5 * H)
    row = classified(p7, rows["PAY-7"], slot=p7_sess, mr={"state": "opened", "labels": ["ai-handoff-rejected"], "questions": [],
                                                          "rejected_reason": why, "rejected_raw": raw,
                                                          "rejected_at": iso(p7_refused)})
    board_later(p7, row, decisions=decisions(p7, [("requirements", "原因列表在后台维护，页面只读", "运营要自己加原因", None, "agent", [])]),
                                  mr_desc=mrdesc(p7, first["PAY-7"]), credits=18.2,
                                  sessions=[p7_sess])

    # PAY-6: claimed, not started
    p6 = Req("r1", "PAY-6", "商户结算周报", "carol", "weekly-report", "", project="shop/shop-pay")
    p6.claim_at = T0 - 2 * D
    board_later(p6, classified(p6, rows["PAY-6"]))
    extra_rows = []

    # PAY-8: alice's own claim, not started (开工)
    p8 = Req("r1", "PAY-8", "退款失败的提醒", "alice", "refund-alert", "", project="shop/shop-pay")
    p8.claim_at = T0 - 5 * H
    row = copy.deepcopy(rows["PAY-6"])
    row.update(key="PAY-8", title=p8.title, owner="alice", summary=None, credits=None, updated_at=None)
    extra_rows.append(classified(p8, row))
    board_later(p8, row)

    # PAY-10: alice's hand-over was pushed, but labelling its MR (!52) failed: nothing was handed over
    p10 = Req("r1", "PAY-10", "退款审批加二次确认", "alice", "refund-confirm", "261108-refund-confirm", project="shop/shop-pay")
    p10.claim_at = T0 - 12 * H
    t = standard(p10, T0 - 11 * H)
    p10.stage(t, "code-generation", "started", unit="confirm")
    p10.commit(t + 40 * M, "person", "PAY-10：二次确认弹窗和接口", files=3)
    p10.stage(t + 55 * M, "code-generation", "done", unit="confirm", note="代码写完")
    p10.verify(t + 62 * M, [("pytest -q", 0)])
    p10.stage(t + 63 * M, "build-and-test", "done", note="构建测试做完了")
    p10.handoff(t + 70 * M)
    reqs["r1"].append(p10)
    row = copy.deepcopy(rows["PAY-7"])
    row.update(key="PAY-10", title=p10.title, owner="alice", branch=p10.branch, intent=p10.intent, credits=12.6,
               updated_at=p10.hand_at, summary="退款审批前弹一次二次确认，金额超过一万再要一次。", run_ids=[], worktree=None,
               mr={"iid": 52, "url": "%s/shop/shop-pay/-/merge_requests/52" % GL, "state": "opened"}, open_questions=[])
    extra_rows.append(classified(p10, row, mr={"state": "opened", "labels": [], "questions": []}, at_handover=True))
    board_later(p10, row, mr_desc=mrdesc(p10, row["summary"]), credits=12.6,
                decisions=decisions(p10, [("requirements", "超过一万的退款要二次确认", "产品定的", "P-1A2B", "person", [])]))

    # PAY-1: on this machine, built and verified; its session is idle since; Lean's next is the release, after a
    # review in a new session (the one that wrote the code cannot review it)
    p1 = Req("r1", "PAY-1", "退款原因统计", "alice", "refund-stats", "261107-refund-stats", project="shop/shop-pay")
    p1.claim_at = T0 - 7 * H
    t = standard(p1, T0 - 6 * H - 30 * M)
    p1.stage(t, "functional-design", "skipped", unit="stats", note="规则在需求里写清了")
    p1.stage(t + 1 * M, "nfr-design", "skipped", unit="stats", note="没有新的指标")
    p1.stage(t + 2 * M, "infrastructure-design", "skipped", unit="stats", note="不动基础设施")
    p1.stage(t + 3 * M, "code-generation", "started", unit="stats")
    p1.commit(t + 40 * M, "person", "PAY-1：按原因汇总的查询和接口", files=3)
    p1.stage(t + 42 * M, "code-generation", "done", unit="stats", note="代码写完，计划 3 步全打勾")
    p1.verify(t + 50 * M, [("pytest -q", 0)])
    p1.stage(t + 51 * M, "build-and-test", "done", note="verify PASS：1 项")
    p1_idle = t + 53 * M
    reqs["r1"].append(p1)
    p1_sess = dict(det["sessions"][0], slot="brain-PAY-1-3d8e", url="/chat?sid=brain-PAY-1-3d8e", title="PAY-1 退款原因统计",
                   credits=9.8, turns=14, busy=False, awaiting=False, last_activity=p1_idle, opened_at=p1.start_at)
    row = copy.deepcopy(rows["PAY-3"])
    row.update(key="PAY-1", title=p1.title, owner="alice", branch=p1.branch, intent=p1.intent, credits=9.8, updated_at=p1_idle,
               summary="按退款原因汇总金额和笔数，给运营看哪类退款最多（规模小）。", sessions=1, expected_paths=["src/refund/stats/"], overlap=[],
               worktree="/Users/alice/workplace/brain-app/shop-pay/refund-stats")
    extra_rows.append(classified(p1, row, slot=p1_sess))
    board_later(p1, row, sessions=[p1_sess], credits=9.8, mr_desc=mrdesc(p1, row["summary"]))

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
            r.stage(t + 116 * M, "release", "done", note="发布批准了")
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
        r.proposals = 1 if key == "ORD-9" else i % 2      # ORD-9: merged 3 days ago, its knowledge not written back yet
        reqs["r3"].append(r)
        order_rows.append(classified(r, row, reflected=bool(i % 2 and ago_d > 5)))
        board_later(r, row, credits=cr, mr_desc=mrdesc(r, "%s：做完了，合并进 main" % title),
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
    reqs["r3"].append(r)
    row = copy.deepcopy(tmpl)
    row.update(repo="r3", key="ORD-10", title="订单状态推送到企业微信", owner="erin", branch=r.branch, intent=r.intent, state="running", state_label="运行机在跑",
               credits=7.4, updated_at=T0 - 4 * M, summary=None, waits={"who": "runner", "text": "运行机在跑", "line": None, "raw": ""},
               mr={"iid": 19, "url": "%s/shop/shop-order/-/merge_requests/19" % GL, "state": "opened"}, run_ids=["RUN-ORD-10-1"], where="branch",
               open_questions=[], overlap=[], expected_paths=[], worktree=None)
    order_rows.append(classified(r, row, mr={"state": "opened", "labels": ["ai-running"], "questions": []}))
    board_later(r, row, credits=7.4, sessions=[dict(det["sessions"][0], slot="brain-run-RUN-ORD-10-1", url="/chat?sid=brain-run-RUN-ORD-10-1",
                                                                       title="RUN-ORD-10-1", agent="brain-run", kind="runner", credits=7.4, turns=21, busy=True,
                                                                       awaiting=False, last_activity=T0 - 1 * M)],
                                   mr_desc=mrdesc(r, "订单状态变化时推送到企业微信，失败自动重试"))
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
    reqs["r4"].append(r)
    row = copy.deepcopy(tmpl)
    row.update(repo="r4", key="TOOL-1", title="价格表批量导入", owner="alice", branch=r.branch, intent=r.intent, state="local", state_label="本地开发中",
               credits=4.9, updated_at=T0 - 1 * M, summary=None, waits={"who": "agent", "text": "agent 在做", "line": None, "raw": ""}, mr=None, run_ids=[],
               where="worktree", open_questions=[], overlap=[], expected_paths=["tools/price"],
               worktree="/Users/alice/workplace/brain-app/shop-tools/price-import")
    tool_sess = dict(det["sessions"][0], slot="brain-TOOL-1-5a2c", url="/chat?sid=brain-TOOL-1-5a2c", title="TOOL-1 价格表批量导入",
                     credits=4.9, turns=11, busy=True, awaiting=False, last_activity=T0 - 1 * M)
    tool_rows = [classified(r, row, slot=tool_sess, local_only=True)]
    tool_kit = [r_ for r_ in status["crew"]["rows"] if r_.get("fix") == "kit"]
    for k in tool_kit:
        k["repo"] = "/Users/alice/workplace/shop-tools"
        k["text"] = k["text"]
    board_later(r, row, local_only=True, kit_rows=tool_kit, credits=4.9, sessions=[tool_sess],
                                   mr_desc={"available": True, "text": "", "first": None, "source": None, "path": None, "ref": None, "error": "还没有提交：做完第一步以后才有变更说明"})

    # ---------------------------------------------------------------- the overview of the world, and its numbers
    all_rows = list(rows.values()) + extra_rows + order_rows + tool_rows
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
    names = {"r1": "shop-pay", "r2": "shop-web", "r3": "shop-order", "r4": "shop-tools"}
    local = {"r4"}      # no GitLab: done only on this machine (shop-web, r2, is not loaded)

    runner_rows: list[dict] = []     # the team runner's rows (service._team_rows), made below with team mode's 待办

    def overview_of(repo: str, evaluated: bool) -> dict:
        """交付总览 for 全部 or one repo, as service._overview_sync makes it: its rows, its repos' numbers; without
        brainkit.evaluate the funnel is the app's own count and every merge is still 还没评."""
        ids = [x for x in ("r1", "r3", "r4") if repo in ("all", x)]
        o = copy.deepcopy(ov)
        o["rows"] = [r_ for r_ in all_rows if r_["repo"] in ids] + (copy.deepcopy(runner_rows) if repo == "runner" else [])
        o["overlaps"] = [x for x in ov["overlaps"] if any(r_["key"] == x["keys"][0] for r_ in o["rows"])]
        o["counts"] = deliveries.counts(o["rows"])
        o["errors"] = [e for e in ov["errors"] if repo in ("all", e["repo"])]
        mine = [p_ for p_ in parts if p_[0] in ids] if evaluated else []
        o["cto"] = deliveries.cto_numbers(mine, o["rows"], available=evaluated, now=T0, names=names, repos=len(ids),
                                          local_repos=sum(1 for x in ids if x in local))
        keys = {r_["key"] for r_ in o["rows"]}
        if "r1" not in ids:     # brainkit.evaluate's numbers and the decisions here are shop-pay's: not this repo's
            o["eval"]["metrics"] = [dict(m, value=None) for m in o["eval"]["metrics"]]
            o["eval"]["notes"] = []
            o["funnel"] = dict(deliveries.funnel_app([], {"asked": 0, "answered": 0, "delivered": 0}), source="evaluate")
        o["eval"]["queue"] = [q for q in o["eval"]["queue"] if q["key"] in keys]
        o["eval"]["skipped"] = [x for x in o["eval"]["skipped"] if x["key"] in keys]
        if not evaluated:
            o["eval"] = {"available": False, "error": deliveries.NO_EVALUATE, "raw": "", "ref": None, "metrics": [],
                         "queue": [], "skipped": [], "notes": []}
            o["funnel"] = deliveries.funnel_app([dict(d_, key="PAY-3") for d_ in det["decisions"]] if "r1" in ids else [],
                                                {"asked": 0, "answered": 0, "delivered": 0})
            return o
        o["eval"]["ref"] = o["cto"]["ref"]
        for m in o["eval"]["metrics"]:
            if m["id"] == "autonomy":
                m["value"] = o["cto"]["unattended"]
            if m["id"] == "judgment":
                st = o["cto"]["stepped_in"]
                m["value"] = [st["at_points"], st["at_points"] + st["outside"]] if st else None
        return o

    world_ov = overview_of("all", True)
    overviews = {e: {x: overview_of(x, e == "eval") for x in ("all", "r1", "r2", "r3", "r4")} for e in ("eval", "noeval")}
    # 待办 on alice's machine (todo.build over the same rows): what waits for her, with the session to open
    sessions = {"PAY-3": det["sessions"][0], "PAY-1": p1_sess, "PAY-7": p7_sess, "TOOL-1": tool_sess}
    facts = {"PAY-3": p3.facts(p3_park), "PAY-1": p1.facts(), "PAY-7": p7.facts()}
    entries = [{"row": r_, "facts": facts.get(r_["key"], {}), "own": r_["owner"] == ME, "has_session": r_["key"] in sessions,
                "can_post": False, "mr": None,
                "session": {k: sessions[r_["key"]][k] for k in ("slot", "title", "url")} if r_["key"] in sessions else None}
               for r_ in all_rows if r_["state"] != "closed" and (r_["state"] != "merged" or r_["waits"]["who"] == "you")]
    crew_fail = problems.agent_missing()
    world_todo = {"ok": todo.build(entries, team=False, crew_rows=[]), "crewfail": todo.build(entries, team=False, crew_rows=[crew_fail])}
    brains, uses = brain_views(reqs, all_rows, {bid: kw.get("decisions") or [] for bid, (_, _, kw) in LATER.items()})
    for bid, (r_, row_, kw) in LATER.items():
        boards[bid] = snapshot(r_, row_, brain=uses.get(bid) or no_trace_brain(r_), **kw)
    det["brain"] = boards["r1/PAY-3"]["brain"]
    # 需求详情's timeline as service._timeline makes it: brainkit.trace's record (detail.trace_timeline) and the app's own
    det["timeline"]["items"] = sorted(detail.trace_timeline(p3.trace(det["brain"])) + p3.app,
                                      key=lambda x: (x["at"] or "", x["kind"]))
    # team mode: the runner's runs (team.json's, and ORD-10's, whose answer the signer refused), each read from runnerd's
    # workspace as service._team_rows reads it (the run branch's records, the claim its clone has), with the bridge's
    # decisions; 需求详情 and 需求看板 as _team_detail and _board_sync make them; 待办 is the person's own, then todo.build
    # over these rows
    team_fx = json.loads((FIX / "team.json").read_text(encoding="utf-8"))
    o10 = reqs["r3"][-1]
    on_runner = {
        "PAY-4": (p4, p4_park, [{"id": "D-2", "kind": "design", "state": "open", "created": iso(T0 - 3 * H)}]),
        "PAY-5": (p5, p5_park, [{"id": "D-3", "kind": "acceptance", "state": "open", "lean_request": "RELEASE 0c9a7e21",
                                 "created": iso(T0 - 1 * D - 1 * H)}]),
        "PAY-2": (p2, None, [{"id": d["id"], "kind": d["kind"], "state": d["state"], "created": d["asked_at"], "updated": d["at"],
                              "answer": d["choice"]} for d in p2.decs]),
        "ORD-10": (o10, None, [{"id": "D-1", "kind": "clarify", "state": "refused", "created": iso(T0 - 2 * H)}])}
    runs_t = team_fx["runs"] + [{"run_id": "RUN-ORD-10-1", "req": "ORD-10", "project": o10.project, "iid": 19, "state": "dispatched",
                                 "slot": None, "mr_url": "%s/%s/-/merge_requests/19" % (GL, o10.project), "updated": iso(T0 - 4 * M)}]
    team_entries = []
    for rr in runs_t:
        q, park, decs = on_runner.get(rr["req"], (None, None, []))
        run_id, key = rr["run_id"], rr["req"]
        decs = [dict(d, run_id=run_id) for d in decs]
        path = "/home/runner/brain/runs/%s" % run_id if q is not None else None     # runnerd's workspace, once made
        q = q or Req("r1", key, "", "", "", "")
        f = {"key": key, "claim": None, "where": "runner", "branch": None, "owner": None, "worktree": None, "stages": [],
             "events": [], "approvals": [], "run": None, "park": None, "decisions_text": None, "state_text": None}
        if path:
            f.update(q.facts(park), where="runner", worktree=path, merged=False)
        row_t = deliveries.base_row("runner", f)
        row_t["where"] = "runner"
        deliveries.team_classify(row_t, rr, decs, f.get("park"))
        bid = "%s/%s" % (q.repo, key)
        kw = LATER[bid][2] if bid in LATER else {}
        sess = [x for x in kw.get("sessions") or [] if x.get("kind") == "runner"]
        url = rr["mr_url"]
        row_t.update(run_ids=[run_id], credits=round(sum(x.get("credits") or 0 for x in sess), 3) or None, sessions=len(sess),
                     mr={"iid": int(rr["iid"]), "url": url, "state": None}, updated_at=lean_view.epoch(rr.get("updated")),
                     summary=mrdesc_view.plain_line((kw.get("mr_desc") or {}).get("first")) if f.get("run") else None)
        team_entries.append({"row": row_t, "decisions": decs, "mr_url": url})
        runner_rows.append(row_t)
        brain_t = boards[bid]["brain"] if path and bid in boards else no_trace_brain(Req("r1", key, "", "", "", ""))
        b = snapshot(q, row_t, brain=brain_t, park=park, facts=f, team_decisions=decs, sessions=sess, me=None,
                     decisions=kw.get("decisions") or [], reflect=kw.get("reflect") or [],
                     mr_desc=kw.get("mr_desc") if path else mrdesc_view.empty("还没开工：开工以后才有变更说明"),
                     questions=detail.ledger_questions(decs, url), credits=row_t["credits"], bid="runner/%s" % key)
        boards["runner/%s" % key] = b
        run = f.get("run") or {}
        items = detail.trace_timeline(q.trace(brain_t)) if path else []
        details["runner/%s" % key] = {
            "row": row_t, "where_label": "运行机工作区 %s" % (path or "（还没建）"),
            "run": {"owner": run.get("owner"), "branch": run.get("branch"), "intent": run.get("intent"),
                    "brain_commit": run.get("brain_commit"), "origin": run.get("origin"), "created_at": run.get("created_at"),
                    "materials": [str(m.get("package")) for m in run.get("materials") or []],
                    "handoff": {"requested_at": run["handoff"].get("requested_at"), "by": run["handoff"].get("by")}
                    if isinstance(run.get("handoff"), dict) else None} if run else None,
            "claim": None,
            "lean": {"stages": f.get("stages") or lean_view.stages([]),
                     "approvals": [dict({k: a[k] for k in ("kind", "state", "sha8", "at", "path")}, line=None)
                                   for a in f.get("approvals") or []],
                     **lean_view.notes(f.get("state_text"))},
            "decisions": b["decisions"], "questions": b["questions"],
            "timeline": {"source": "trace" if path else "app", "items": sorted(items, key=lambda x: (x["at"] or "", x["kind"])),
                         "error": "", "missing": board.missing_sources(TRACE_MISSING if path else [], local_only=False, handed=True)},
            "sessions": [{k: x.get(k) for k in ("slot", "title", "agent", "kind", "credits", "turns", "busy", "awaiting",
                                                 "last_activity", "opened_at", "project", "url", "error")} for x in sess],
            "credits": {"total": row_t["credits"], "note": detail.NO_TOKENS}, "brain": brain_t, "mr_desc": b["mr_desc"]}
    world_todo["team"] = {"items": world_todo["ok"]["items"] + todo.build(team_entries, team=True, crew_rows=[])["items"],
                          "team": True}
    for e in ("eval", "noeval"):   # 交付总览 of 运行机 (team mode's 全部 is the repos' and these together)
        overviews[e]["runner"] = overview_of("runner", e == "eval")
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
    world_status["counts"]["todo"] = len(world_todo["ok"]["items"])
    for r_ in world_status["repos"]:
        r_["remote"] = r_["id"] not in local and r_["id"] != "r2"
    world = {"note": "made by scripts/preview_world.py: do not edit by hand", "at": T0, "status": world_status, "overview": world_ov,
             "overviews": overviews, "todo": world_todo, "boards": boards, "details": details, "stages": STAGES,
             "brains": brains}
    (ROOT / "ui" / "preview" / "world.json").write_text(json.dumps(world, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    # the contract fixtures the UI tests read: the overview's numbers for its own rows, one live board and one merged
    ov["cto"] = deliveries.cto_numbers([("r1", parts[0][1])], list(rows.values()), available=True, now=T0, names=names, repos=1)
    ov["eval"]["ref"] = ov["cto"]["ref"]
    (FIX / "overview.json").write_text(json.dumps(ov, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (FIX / "detail.json").write_text(json.dumps(det, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # 待办's fixture: one item of every kind, each as todo.build made it in the world (team mode's runner questions, and
    # the KiroCrew item of the fixture's own /status rows, included), in the order the UI tests read them
    mine = world_todo["ok"]["items"]
    pool = mine + world_todo["team"]["items"][len(mine):] + todo.build([], team=False, crew_rows=status["crew"]["rows"])["items"]
    tj = {"items": [next(i for i in pool if i["kind"] == k) for k in TODO_KINDS], "team": False}
    (FIX / "todo.json").write_text(json.dumps(tj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    st = json.loads((FIX / "status.json").read_text(encoding="utf-8"))   # as read: the world changed its crew rows
    for r_ in st["repos"]:
        r_["error"] = NO_KIT if "还没装 brain-kit" in r_["error"] else r_["error"]
    st["counts"]["todo"] = len(tj["items"])                             # /status counts the very list /todo answers
    (FIX / "status.json").write_text(json.dumps(st, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (FIX / "board.json").write_text(json.dumps(boards["r1/PAY-3"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (FIX / "board-merged.json").write_text(json.dumps(boards["r1/PAY-2"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if brains:
        (FIX / "brain.json").write_text(json.dumps(brains["r1"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("world: %d rows, %d boards; fixtures: overview.json, detail.json, todo.json, board.json, board-merged.json" % (
        len(all_rows), len(boards)))


if __name__ == "__main__":
    main()
