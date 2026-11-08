"""Pure readers: the bridge's MR comments parsed back (a person's machine), states from the bridge ledger (team
mode), overlaps, the decision funnel's fallback."""

from appkit import mod

mrinfo, deliveries = mod("mrinfo"), mod("deliveries")


def note(i, body, who="brain-bridge"):
    return {"id": i, "body": body, "author": {"username": who}, "created_at": "2026-11-08T10:%02d:00Z" % i}


def test_the_bridges_mr_comments_are_read_back():
    notes = [
        note(1, "AI 接手被拒（abc）：\n- label 'ai-handoff' was added by bob, not by the branch owner alice\n\n改好后重新推送"),
        note(2, "AI 已接手：RUN-PAY-3-1，凭证 V-0123456789，从 abc 继续。"),
        note(3, "**D-1 · 澄清 · RUN-PAY-3-1** 需要 @alice、@carol 回答\n\n```text\n要不要人工审核？\nA. 要\nB. 不要\n推荐：A\n"
                "依据：D01#S003\n```\n\n回复一行 `answer D-1 A`"),
        note(4, "answer D-1 B", "alice"),
        note(5, "D-1 已收到 @alice 的回答：B，已送回 RUN-PAY-3-1（凭证 V-abcdef0123）。"),
        note(6, "**D-2 · 验收 · RUN-PAY-3-1** 需要 @carol 回答\n\n```text\n验收 AC-1..3\n审批：RELEASE 1a2b3c4d\n```"),
        note(7, "**D-3 · 设计 · RUN-PAY-3-1** 需要 @dave 回答\n\n```text\n要拆服务吗？\n```"),
        note(8, "D-3 作废：问题发出后分支又有了新推送。"),
    ]
    got = mrinfo.parse_notes(notes)
    qs = {q["id"]: q for q in got["questions"]}
    assert got["rejected_reason"] is None  # taken over after the refusal
    assert qs["D-1"]["state"] == "delivered" and qs["D-1"]["answer"] == "B" and qs["D-1"]["voucher_id"] == "V-abcdef0123"
    assert qs["D-1"]["options"] == [{"id": "A", "text": "要"}, {"id": "B", "text": "不要"}] and qs["D-1"]["refs"] == ["D01#S003"]
    assert qs["D-1"]["question"] == "要不要人工审核？" and qs["D-1"]["kind"] == "clarify"
    assert qs["D-2"]["kind"] == "acceptance" and qs["D-2"]["lean_request"] == "RELEASE 1a2b3c4d" and qs["D-2"]["state"] == "open"
    assert qs["D-3"]["state"] == "stale"
    only = mrinfo.parse_notes(notes[:1])
    assert "added by bob" in only["rejected_reason"]
    fake = mrinfo.parse_notes([note(1, "**D-9 · 澄清 · RUN-PAY-3-1** x", "mallory")], bridge_user="brain-bridge")
    assert fake["questions"] == []  # with the bridge's account known, nobody else's comment reads as a question


def test_team_states_from_the_ledger():
    def row():
        return {"state": "", "state_label": "", "waits": {}, "open_questions": []}

    cases = [({"state": "spooled"}, [], None, "handed_over"), ({"state": "dispatched"}, [], None, "running"),
             ({"state": "dispatched"}, [{"id": "D-2", "state": "open", "kind": "clarify"}], None, "parked"),
             ({"state": "dispatched"}, [{"id": "D-3", "state": "signing", "kind": "acceptance"}], None, "acceptance"),
             ({"state": "dispatched"}, [], {"status": "waiting", "kind": "clarify"}, "parked"),
             ({"state": "send_unknown", "slot": "run-pay-1-1"}, [], None, "running"),
             ({"state": "failed"}, [], None, "rejected"), ({"state": "closed"}, [], None, "merged")]
    for run_row, decs, park, want in cases:
        r = row()
        deliveries.team_classify(r, run_row, decs, park)
        assert r["state"] == want, (run_row, decs, park, r)
    r = row()
    deliveries.team_classify(r, {"state": "dispatched"}, [{"id": "D-2", "state": "open", "kind": "design"}], None)
    assert r["open_questions"] == ["D-2"] and "MR" in r["waits"]["text"] and r["waits"]["line"] is None


def test_overlaps_and_the_funnel_fallback():
    def r(key, paths, state="local", repo="r1"):
        return {"repo": repo, "key": key, "state": state, "expected_paths": paths, "overlap": []}

    rows = [r("PAY-1", ["src/pay/"]), r("PAY-2", ["src/pay/refund", "docs"]), r("PAY-3", ["src/pay"], state="merged"),
            r("PAY-4", ["src/payments"]), r("OMS-1", ["src/pay"], repo="r2")]
    assert deliveries.overlaps(rows) == [{"keys": ["PAY-1", "PAY-2"], "paths": ["src/pay"]}]  # the first one's paths, as the bridge reports
    assert rows[3]["overlap"] == [] and rows[4]["overlap"] == []  # a prefix is not a folder; other repos never clash
    f = deliveries.funnel_app([{"by": "person", "cites": []}, {"by": "agent", "cites": ["T-PAY-1-1"]},
                               {"by": "agent", "cites": []}, {"by": None, "cites": []}, {"by": "check", "cites": []}],
                              {"asked": 2, "answered": 1, "delivered": 1})
    assert {x["id"]: x["count"] for x in f["rows"]} == {"person": 1, "check": 1, "brain": 1, "agent": 1, "unknown": 1}
    assert f["total"] == 5 and f["source"] == "app" and f["questions"]["delivered"] == 1
