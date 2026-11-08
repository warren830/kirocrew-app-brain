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

    cases = [({"state": "spooled"}, [], None, "handed_over"), ({"state": "dispatched"}, [], None, "running"),
             ({"state": "dispatched"}, [{"id": "D-2", "state": "open", "kind": "clarify"}], None, "parked"),
             ({"state": "dispatched"}, [{"id": "D-3", "state": "open", "kind": "acceptance"}], None, "acceptance"),
             ({"state": "dispatched"}, [{"id": "D-4", "state": "posting", "kind": "clarify"}], None, "parked"),
             ({"state": "dispatched"}, [{"id": "D-5", "state": "refused", "kind": "clarify"}], None, "running"),
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
