"""Pure readers: the bridge's MR comments parsed back (a person's machine), states from the bridge ledger (team
mode), overlaps, the decision funnel's fallback."""

import pytest

from appkit import BRAINKIT, mod
from brainfix import needs_brainkit

mrinfo, deliveries, bk = mod("mrinfo"), mod("deliveries"), mod("bk")
SHA = "a1b2c3d4e5f6" + "0" * 28


def note(i, body, who="brain-bridge", **kw):
    return dict({"id": i, "body": body, "author": {"username": who}, "created_at": "2026-11-08T10:%02d:00Z" % i}, **kw)


@pytest.fixture
def decisions():
    if not bk.load(str(BRAINKIT))["ok"]:
        pytest.skip("brain-kit checkout not found")
    return bk.m("bridge.decisions")


def ask(decisions, did, park, who, kind):
    """The question exactly as brain-kit's bridge posts it (decisions.question_text)."""
    return decisions.question_text(did, "RUN-PAY-3-1", park, who, kind, SHA, "f" * 64)


@needs_brainkit
def test_the_bridges_mr_comments_are_read_back(decisions):
    clarify = {"question": "要不要人工审核？", "options": [{"id": "A", "text": "要"}, {"id": "B", "text": "不要"}],
               "recommend": "A", "refs": ["D01#S003"]}
    notes = [
        note(1, "AI 接手被拒（abc）：\n- label 'ai-handoff' was added by bob, not by the branch owner alice\n\n改好后重新推送"),
        note(2, "AI 已接手：RUN-PAY-3-1，凭证 V-0123456789，从 abc 继续。"),
        note(3, ask(decisions, "D-1", clarify, ["alice", "carol"], "clarify")),
        note(4, "answer D-1 B", "alice"),
        note(5, "D-1 已收到 @alice 的回答：B，已送回 RUN-PAY-3-1（凭证 V-abcdef0123）。"),
        note(6, ask(decisions, "D-2", {"question": "验收 AC-1..3", "lean_request": "RELEASE 1a2b3c4d"}, ["carol"],
                    "acceptance")),
        note(7, ask(decisions, "D-3", {"question": "要拆服务吗？", "options": [{"id": "A", "text": "拆"}]}, ["dave"],
                    "design")),
        note(8, "D-3 作废：问题发出后分支又有了新推送。run 需要时会重新提问。"),
        note(9, ask(decisions, "D-4", clarify, ["alice"], "clarify")),
        note(10, "D-4 作废（note 9 is not the question the bridge posts for park.json at a1b2c3d4e5f6 (edited?)），"
                 "对它的回答都不算。run 重新推送后会重新提问。"),
        note(11, ask(decisions, "D-5", clarify, ["alice"], "clarify")),
        note(12, "D-5 的回答没有送回 run：签名服务不签（MR 上没有可以回答 D-5 的人的有效回答）。请负责人看一下签名服务的记录。"),
        note(13, "**D-6 · 澄清 · RUN-PAY-3-1** 需要 @alice 回答\n\n```text\n老格式的问题\n```"),   # an older bridge's
        note(14, ask(decisions, "D-7", clarify, ["alice"], "clarify"), system=True),
        # brain-kit 9935b11: the question note deleted (void), an answer the bridge could not sign yet, GitLab
        # usernames with _ and capitals (the bridge writes them lower case)
        note(15, ask(decisions, "D-8", clarify, ["alice"], "clarify")),
        note(16, "D-8 作废（the question note 15 is not on the MR (deleted?)），对它的回答都不算。run 重新推送后会重新提问。"),
        note(17, ask(decisions, "D-9", clarify, ["alice_w", "carol"], "clarify")),
        note(18, "answer D-9 A", "alice_w"),
        note(19, "D-9 收到了回答，但桥这一轮没能签名，回答还没有送回 run。桥修好后会自动送出，不用重新回答。"),
        note(20, ask(decisions, "D-10", clarify, ["alice_w"], "clarify")),
        note(21, "D-10 已收到 @alice_w 的回答：A，已送回 RUN-PAY-3-1（凭证 V-0123456789）。"),
    ]
    got = mrinfo.parse_notes(notes, bridge_user="brain-bridge")
    qs = {q["id"]: q for q in got["questions"]}
    assert got["rejected_reason"] is None  # taken over after the refusal
    assert qs["D-1"]["state"] == "delivered" and qs["D-1"]["answer"] == "B" and qs["D-1"]["voucher_id"] == "V-abcdef0123"
    assert qs["D-1"]["options"] == [{"id": "A", "text": "要"}, {"id": "B", "text": "不要"}] and qs["D-1"]["refs"] == ["D01#S003"]
    assert qs["D-1"]["question"] == "要不要人工审核？" and qs["D-1"]["kind"] == "clarify" and qs["D-1"]["recommend"] == "A"
    assert qs["D-2"]["kind"] == "acceptance" and qs["D-2"]["lean_request"] == "RELEASE 1a2b3c4d" and qs["D-2"]["state"] == "open"
    assert qs["D-3"]["state"] == "stale" and qs["D-4"]["state"] == "void" and qs["D-5"]["state"] == "refused"
    assert "D-6" not in qs and "D-7" not in qs  # an unbound question of an older bridge, and a system note, count for nothing
    assert qs["D-8"]["state"] == "void" and qs["D-9"]["state"] == "answered"     # answered: nobody answers it again
    assert (qs["D-10"]["state"], qs["D-10"]["answerer"], qs["D-10"]["voucher_id"]) == ("delivered", "alice_w", "V-0123456789")
    only = mrinfo.parse_notes(notes[:1])
    assert "added by bob" in only["rejected_reason"]
    fake = mrinfo.parse_notes([note(1, ask(decisions, "D-9", clarify, ["mallory"], "clarify"), "mallory")],
                              bridge_user="brain-bridge")
    assert fake["questions"] == []  # with the bridge's account known, nobody else's comment reads as a question
    anyone = mrinfo.parse_notes([note(1, ask(decisions, "D-9", clarify, ["m"], "clarify"), "mallory")])
    assert [q["id"] for q in anyone["questions"]] == ["D-9"]  # kit.json names no bridge_user: every note is read


def test_team_states_from_the_ledger():
    def row():
        return {"state": "", "state_label": "", "waits": {}, "open_questions": []}

    waiting = {"status": "waiting", "kind": "clarify"}
    cases = [({"state": "spooled"}, [], None, "handed_over", "runner"), ({"state": "dispatched"}, [], None, "running", "runner"),
             # brain-kit 9935b11: the run id reserved while the signer signs the contract
             ({"state": "signing", "run_id": "RUN-PAY-1-1"}, [], None, "handed_over", "bridge"),
             ({"state": "dispatched"}, [{"id": "D-2", "state": "open", "kind": "clarify"}], None, "parked", "people"),
             ({"state": "dispatched"}, [{"id": "D-3", "state": "open", "kind": "acceptance"}], None, "acceptance", "product"),
             ({"state": "dispatched"}, [{"id": "D-4", "state": "posting", "kind": "clarify"}], None, "parked", "bridge"),
             # an answer the signer refused, a void question, one that could not be asked: the run waits for a person
             ({"state": "dispatched"}, [{"id": "D-5", "state": "refused", "kind": "clarify"}], None, "parked", "people"),
             ({"state": "dispatched"}, [{"id": "D-5", "state": "void", "kind": "clarify"}], waiting, "parked", "people"),
             ({"state": "dispatched"}, [{"id": "D-5", "state": "invalid", "kind": "clarify"}], None, "parked", "people"),
             # ... unless the run went on: no question waiting, or a newer head than that question's
             ({"state": "dispatched"}, [{"id": "D-5", "state": "refused", "kind": "clarify"}], {"status": "answered"},
              "running", "runner"),
             ({"state": "dispatched", "last_sha": "b" * 40}, [{"id": "D-5", "state": "void", "sha": "a" * 40}], waiting,
              "parked", "bridge"),
             ({"state": "dispatched"}, [{"id": "D-5", "state": "delivered", "kind": "clarify"}], None, "running", "runner"),
             ({"state": "dispatched"}, [], waiting, "parked", "bridge"),
             ({"state": "send_unknown", "slot": "run-pay-1-1"}, [], None, "running", "people"),
             ({"state": "failed"}, [], None, "rejected", "people"), ({"state": "closed"}, [], None, "merged", "nobody")]
    for run_row, decs, park, want, who in cases:
        r = row()
        deliveries.team_classify(r, run_row, decs, park)
        assert (r["state"], r["waits"]["who"]) == (want, who), (run_row, decs, park, r)
    r = row()
    deliveries.team_classify(r, {"state": "dispatched"}, [{"id": "D-2", "state": "open", "kind": "design"}], None)
    assert r["open_questions"] == ["D-2"] and "MR" in r["waits"]["text"] and r["waits"]["line"] is None
    r = row()
    deliveries.team_classify(r, {"state": "dispatched"}, [{"id": "D-5", "state": "refused"}], None)
    assert "签名服务不签" in r["waits"]["text"] and "D-5" in r["waits"]["text"]
    r = row()
    deliveries.team_classify(r, {"state": "signing", "run_id": "RUN-PAY-1-1"}, [], None)
    assert "签接手合同" in r["waits"]["text"] and "RUN-PAY-1-1" in r["waits"]["text"]


def test_overlaps_and_the_funnel_fallback():
    def r(key, paths, state="local", repo="r1"):
        return {"repo": repo, "key": key, "state": state, "expected_paths": paths, "overlap": []}

    rows = [r("PAY-1", ["src/pay/"]), r("PAY-2", ["src/pay/refund", "docs"]), r("PAY-3", ["src/pay"], state="merged"),
            r("PAY-4", ["src/payments"]), r("OMS-1", ["src/pay"], repo="r2")]
    assert deliveries.overlaps(rows) == [{"keys": ["PAY-1", "PAY-2"], "paths": ["src/pay"]}]  # the first one's paths, as the bridge reports
    assert rows[3]["overlap"] == [] and rows[4]["overlap"] == []  # a prefix is not a folder; other repos never clash
    f = deliveries.funnel_app([{"by": "person", "cites": []}, {"by": "agent", "cites": ["T-PAY-1-1"]},
                               {"by": "agent", "cites": []}, {"by": None, "cites": []}, {"by": "check", "cites": []},
                               {"by": "brain", "cites": []},
                               {"by": "unclassified", "cites": [], "key": "PAY-2", "id": "D-4", "src": "decisions.md:9"}],
                              {"asked": 2, "answered": 1, "delivered": 1})
    assert {x["id"]: x["count"] for x in f["rows"]} == {"person": 1, "check": 1, "brain": 2, "agent": 1, "unknown": 1,
                                                        "unclassified": 1}
    assert f["total"] == 7 and f["source"] == "app" and f["questions"]["delivered"] == 1
    assert f["unclassified"] == [{"key": "PAY-2", "id": "D-4", "src": "decisions.md:9"}]
    assert {x["id"]: x["label"] for x in f["rows"]}["unclassified"] == "没归类（Who 不是规定的写法）"


def test_the_lean_stage_of_a_row():
    """The overview row's current stage n/11 (the same stages the detail view lists): started, the next one to do,
    every stage done; null only before Lean recorded a stage."""
    lv = mod("lean_view")

    def ev(event, stage, unit=None, ts="2026-11-09T00:00:00Z"):
        return {"event": event, "data": {"stage": stage, "unit": unit}, "ts": ts, "_at": None}

    def at(evs):
        lean = lv.summary(lv.stages(evs))
        return lean["stage"], lean["stage_n"], lean["stage_state"], lean["done"], lv.stage_text(lean)

    assert at([]) == (None, None, None, 0, None)
    assert at([ev("STAGE_STARTED", "requirements")]) == ("requirements", 2, "started", 0, "2/11 需求分析")
    done = [ev("STAGE_COMPLETED", s) for s in ("reverse-engineering", "requirements")] + \
        [ev("STAGE_SKIPPED", s) for s in ("user-stories", "application-design", "units")] + \
        [ev("STAGE_SKIPPED", s, "app") for s in ("functional-design", "nfr-design", "infrastructure-design")] + \
        [ev("STAGE_COMPLETED", "code-generation", "app"), ev("STAGE_COMPLETED", "build-and-test")]
    assert at(done) == ("release", 11, "todo", 10, "11/11 发布（下一步）")
    assert at(done + [ev("STAGE_STARTED", "release")]) == ("release", 11, "started", 10, "11/11 发布")
    # every stage done: before, the row said null (0/11 还没开始) while the detail view listed them all done
    assert at(done + [ev("STAGE_COMPLETED", "release")]) == ("release", 11, "done", 11, "11/11 发布（做完）")
    assert at([ev("STAGE_SKIPPED", "reverse-engineering")]) == ("requirements", 2, "todo", 1, "2/11 需求分析（下一步）")


def test_the_lean_audit_files_are_shown_by_label_not_by_host():
    """brain-kit 9935b11 pseudonymises Lean's audit file names (<host>-<6 hex>.jsonl -> L-<6 hex>.jsonl); the app's
    own timeline (no brainkit.trace) does the same."""
    lv = mod("lean_view")
    path = "aidlc-docs/audit/alices-macbook-1a2b3c.jsonl"
    items = lv.stage_events([{"event": "STAGE_STARTED", "data": {"stage": "requirements"}, "ts": "2026-11-09T00:00:00Z",
                              "_file": path, "seq": 3}])
    assert items[0]["src"].startswith("aidlc-docs/audit/L-") and items[0]["src"].endswith(".jsonl#3")
    assert "macbook" not in items[0]["src"]
    import hashlib
    assert lv.audit_labels([path])[path] == "aidlc-docs/audit/L-%s.jsonl" % hashlib.sha256(path.encode()).hexdigest().upper()[:6]


@needs_brainkit
def test_the_who_vocabulary(decisions):
    """decisions.md Who in brain-kit's fixed vocabulary; anything else is unclassified and not shown."""
    detail = mod("detail")
    text = ("| ID | Date | Stage | Decision | Why | Who |\n| --- | --- | --- | --- | --- | --- |\n"
            "| D-1 | 2026-11-08 | requirements | 退款按自然日 | 规则 | agent (A-2) |\n"
            "| D-2 | 2026-11-08 | requirements | 用 T-PAY-1-2 | Brain | brain T-PAY-1-2, P-PAY-1-1 |\n"
            "| D-3 | 2026-11-08 | requirements | 上限一万 | 产品回答 | P-1A2B V-0123456789 |\n"
            "| D-4 | 2026-11-08 | requirements | 加索引 | 本地会话里问的 | owner |\n"
            "| D-5 | 2026-11-08 | build | 测试全过 | verify | check |\n"
            "| D-6 | 2026-11-08 | requirements | 先不做导出 | 产品说的 | product |\n"
            "| D-7 | 2026-11-08 | requirements | 用 Redis | 张三定的 | 张三 |\n"
            "| D-8 | 2026-11-08 | requirements | 跑批 | runner | brain-bot |\n")
    for with_trace in (True, False):
        mods = bk._state["mods"]
        saved = mods.pop("trace", None) if not with_trace else None
        try:
            rows = {d["id"]: (d["by"], d["who"]) for d in detail.decisions(text, "decisions.md", ["brain-bot"])}
        finally:
            if saved is not None:
                mods["trace"] = saved
        assert rows == {"D-1": ("agent", "agent"), "D-2": ("brain", "T-PAY-1-2, P-PAY-1-1"), "D-3": ("person", "P-1A2B"),
                        "D-4": ("person", "owner"), "D-5": ("check", "check"), "D-6": ("unclassified", None),
                        "D-7": ("unclassified", None), "D-8": ("agent", "brain-bot")}, (with_trace, rows)
