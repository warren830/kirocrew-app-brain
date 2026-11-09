"""The separate signer (signer/brain_signer.py) behind brain-kit's own SpoolSigner, with brain-kit's own Bridge asking
(no app here): it signs exactly the vouchers brain-kit builds (9935b11: an answer names its question note), decides
with brain-kit's Bridge.verify and decisions.check_answer, and refuses the attacks an agent with the app's OS user (and
so the bridge account's token) can try: a replayed answer, an edited or made-up question, a question older than its
push, a push after the owner's label, a head that is not the hand-over commit, a bot's commit as the head, a D-n bound
again after its question was deleted, a question deleted and posted again, a reply edited by someone else (also before
the first poll, and holding the round against another answer), a reply changed after the signer read it, a second
answer to one question, look-alikes, the bridge account answering, requests that are not brain-kit's, and odd files in
the spool. The edit signal (brain-kit 72b278e): check_answer's `edits` from brain-kit's DecisionLoop.reply_states on the
signer's own ledger and GitLab GraphQL with the signer's own token; an award emoji does not make a reply edited; when
GraphQL does not answer, nothing is signed or recorded. A late signature is used, not signed again; a hand-over's run
id is a reservation (brain-kit's `signing`) while it is checked.
"""

import hashlib
import json
import os
import subprocess
import time

import pytest

from appkit import sh
from brainfix import needs_brainkit
from teamfix import (BRANCH, P, PARK, answer_voucher, commit_push, hand_off, make_world, push_park, signer_ask,
                     spool_request)
from teamfix import world  # noqa: F401  (the fixture)

pytestmark = [needs_brainkit, pytest.mark.skipif(subprocess.run(["which", "ssh-keygen"], capture_output=True).returncode,
                                                 reason="ssh-keygen not found")]
ACCEPTANCE = {"schema": 1, "status": "waiting", "kind": "acceptance", "ask": "product", "question": "可以验收了吗？",
              "options": [], "lean_request": "RELEASE 1234abcd",
              "review_items": [{"id": "D-7", "text": "退款按自然日算"}, {"id": "A-3", "text": "单笔上限一万"}]}


class FakeKC:
    """brain-kit's KiroCrew surface, recording what reaches the run."""

    def __init__(self):
        self.sent = []

    def send(self, slot, message, send_id):
        self.sent.append({"slot": slot, "message": message, "send_id": send_id})
        return {"ok": True}

    def create_slot(self, *a, **k):
        return {}

    def set_project(self, *a, **k):
        return {}

    def slot(self, *a, **k):
        return {}

    def stop(self, *a, **k):
        return {}


class Flow:
    """brain-kit's Bridge as the app hosts it: bridge.json with the spool signer, no key, the bridge's token."""

    def __init__(self, world):
        from brainkit import sign
        from brainkit.bridge.handoff import Bridge, load_bridge_config
        from brainkit.rest import GitLab
        self.w, self.gl, self.signer, self.sign = world, world["gl"], world["signer"], sign
        cfg = load_bridge_config(str(world["bridge_cfg"]))
        assert not cfg.get("signing_key")
        self.client = sign.signer_from_config(cfg)
        assert isinstance(self.client, sign.SpoolSigner)
        self.client.poll, self.client.sleep = 0.01, (lambda _: self.signer.once())   # the signer answers meanwhile
        self.kc = FakeKC()
        self.bridge = Bridge(cfg, GitLab("https://gl.example", "bridge-tok", self.gl), None, self.kc,
                             out=lambda *_: None, signer=self.client)

    def hand_over(self):
        assert self.bridge.process(P, self.bridge.kit(P), self.gl.mr()) == "accepted", self.gl.bodies()
        assert self.bridge.ledger.set_run("RUN-PAY-1-1", "spooled", "dispatched", slot="run-pay-1-1")

    def ask(self, park=PARK, did="D-1"):
        sha = push_park(self.w["wt"], park)
        assert self.bridge.watch() == 1, self.gl.bodies()
        q = [n for n in self.gl.notes if n["body"].startswith("**%s · " % did)][-1]
        return sha, q

    def park_raw(self, sha):
        return subprocess.run(["git", "-C", self.gl.bare, "show", "%s:runs/PAY-1/park.json" % sha],
                              capture_output=True).stdout

    def decision(self, did="D-1"):
        return self.bridge.ledger.db.execute("SELECT * FROM decisions WHERE id=?", (did,)).fetchone()

    def vouchers(self, where="signer-vouchers"):
        d = self.w["tmp"] / where / "RUN-PAY-1-1"
        return [json.loads((d / n).read_text()) for n in sorted(os.listdir(d))] if d.is_dir() else []


@pytest.fixture
def flow(world):
    return Flow(world)


def reasons(answer):
    return " ".join(answer["reasons"]) if answer else ""


# ---------------------------------------------------------------- what brain-kit asks for is signed

def test_brainkits_bridge_and_the_signer_agree(flow):
    """The contract, a clarify answer, and a Lean acceptance with review items (lean_request, review_items,
    rejected_items, question_note): each voucher brain-kit builds is the one the signer rebuilds, signed and taken
    back."""
    flow.hand_over()
    sha, q = flow.ask()
    assert q["author"]["username"] == "brain-bridge"
    flow.gl.note("alice", "answer D-1 B 小额不审")
    assert flow.bridge.collect() == 1
    assert "：B。" in flow.kc.sent[-1]["message"]
    sha2, q2 = flow.ask(ACCEPTANCE, did="D-2")
    assert "需要 @carol 回答" in q2["body"].split("\n")[0]
    flow.gl.note("carol", "answer D-2 reject A-3 上限太低")
    assert flow.bridge.collect() == 1
    signed = flow.vouchers()
    kinds = [x["voucher"]["kind"] for x in signed]
    assert sorted(kinds) == ["answer", "answer", "handoff"]
    acc = next(x["voucher"] for x in signed if x["voucher"].get("decision") == "D-2")
    assert acc["lean_request"] == "RELEASE 1234abcd" and acc["review_items"] == ["D-7", "A-3"]
    assert acc["rejected_items"] == ["A-3"] and acc["decision_kind"] == "acceptance"
    # each answer names the question note brain-kit's ledger recorded: the one the bridge posted
    assert acc["question_note"] == q2["id"] == flow.decision("D-2")["qnote_id"]
    assert next(x["voucher"] for x in signed if x["voucher"].get("decision") == "D-1")["question_note"] == q["id"]
    assert flow.vouchers("app-vouchers") == signed                       # the bridge's copies are the same vouchers
    for x in signed:
        assert flow.sign.verify(x["voucher"], x["sig"], str(flow.w["allowed"]))
    assert os.listdir(flow.w["sspool"] / "requests") == []               # brain-kit's SpoolSigner took them back
    assert flow.decision("D-2")["state"] == "delivered"
    # the contract's run: reserved in brain-kit's `signing` state while it was checked, then the open run
    assert flow.signer.ledger.run("RUN-PAY-1-1")["state"] == "spooled"
    assert flow.signer.ledger.runs_in("signing") == [] and flow.bridge.ledger.runs_in("signing") == []


def test_the_signer_speaks_brainkits_spool_protocol(flow):
    flow.hand_over()
    sp = flow.w["sspool"]
    (name,) = os.listdir(sp / "signed")
    got = json.loads((sp / "signed" / name).read_text())
    assert set(got) == {"req_id", "voucher", "sig"} and got["req_id"] + ".json" == name
    assert name[:-5] == flow.sign.SpoolSigner.req_id(got["voucher"])
    # a refusal reaches brain-kit's SpoolSigner as SignerRefused with the signer's reasons
    from brainkit.common import iso, later, utcnow
    v = dict(got["voucher"], project="other/repo", issued_at=iso(utcnow()), expires_at=later(1))
    v.pop("voucher_id")
    v["voucher_id"] = "V-" + flow.sign.digest(v)[:10]
    with pytest.raises(flow.sign.SignerRefused) as e:
        flow.client.sign(v)
    assert e.value.reasons == ["项目 other/repo 不归这个签名服务"]
    refused = [json.loads((sp / "refused" / n).read_text()) for n in os.listdir(sp / "refused")]
    assert [set(r) for r in refused] == [{"req_id", "reasons"}]
    assert os.listdir(sp / "requests") == []
    # requests not written the way brain-kit's SpoolSigner writes them
    from brainkit.common import write_json
    rid = flow.sign.SpoolSigner.req_id(v)
    for bad, why in (({"voucher": v}, "格式"), ({"schema": 1, "req_id": "x", "kind": "handoff", "voucher": v}, "格式"),
                     ({"schema": 1, "req_id": rid, "kind": "answer", "voucher": v}, "对不上")):
        for d in ("refused", "requests"):
            for n in os.listdir(sp / d):
                os.unlink(sp / d / n)
        write_json(str(sp / "requests" / (rid + ".json")), bad)
        flow.signer.once()
        assert why in reasons(json.loads((sp / "refused" / (rid + ".json")).read_text())), bad


# ---------------------------------------------------------------- answers: brain-kit's check_answer

def test_a_replay_onto_a_later_push_is_refused(flow):
    """D-1 was answered at S2. The run pushes S3 with the same park.json bytes: the answer is not D-1's at S3."""
    flow.hand_over()
    s2, q = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    assert flow.bridge.collect() == 1
    raw = flow.park_raw(s2)
    s3 = commit_push(flow.w["wt"], {"other.txt": "more\n"}, "more")
    assert flow.park_raw(s3) == raw
    d, r = signer_ask(flow.w, answer_voucher(s3, raw, "D-1", "B", "alice", q["id"]))
    assert d == "refused" and "作废" in reasons(r) and "never bound twice" in reasons(r), r


def test_an_edited_question_is_refused(flow):
    """Whoever holds the bridge account's token edits D-1 after it was asked: no reply to it counts."""
    flow.hand_over()
    sha, q = flow.ask()
    flow.gl.edit(q, q["body"].replace("A. 要", "A. 要（人工审核全部免掉）"), by="brain-bridge")
    flow.gl.note("alice", "answer D-1 A")
    assert flow.bridge.collect() == 0
    assert flow.decision()["state"] == "void" and any(b.startswith("D-1 作废（") for b in flow.gl.bodies())
    d, r = signer_ask(flow.w, answer_voucher(sha, flow.park_raw(sha), "D-1", "A", "alice", q["id"]))
    assert d == "refused" and "edited" in reasons(r), r
    # nothing of the answer reaches the run; brain-kit 0d52e97 tells it (once) that D-1 is void, to ask again
    assert len(flow.kc.sent) <= 1 and all(m["message"].startswith("问题作废：D-1 ") for m in flow.kc.sent), flow.kc.sent


# ---------------------------------------------------------------- answers: brain-kit 72b278e's edit signal

def replies(flow):
    """The signer's own record of each reply (brain-kit's replies table in the signer's ledger): note id -> state."""
    return {r["note_id"]: r["state"] for r in flow.signer.ledger.db.execute("SELECT note_id, state FROM replies")}


def signer_graphql(flow):
    return flow.gl.graphql_calls.count("signer-tok")


def test_a_reply_edited_by_someone_else_never_counts(flow):
    """The attack: someone with edit rights (a Maintainer, not the bridge's Reporter account) rewrites alice's reply.
    GitLab GraphQL names the editor: the bridge tells the MR once and delivers nothing; the signer, asking GraphQL with
    its own token, signs neither the new text nor the old; alice's new reply counts."""
    flow.hand_over()
    sha, q = flow.ask()
    reply = flow.gl.note("alice", "answer D-1 A")
    flow.gl.edit(reply, "answer D-1 B 改主意了", by="mo")
    assert flow.bridge.collect() == 0 and flow.bridge.collect() == 0
    told = [b for b in flow.gl.bodies() if b.startswith("D-1：") and "编辑过" in b]
    assert flow.decision()["state"] == "open" and len(told) == 1, flow.gl.bodies()
    raw = flow.park_raw(sha)
    for choice in ("A", "B"):
        d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", choice, "alice", q["id"]))
        assert d == "refused" and "有效回答" in reasons(r), r
    assert replies(flow) == {reply["id"]: "edited"} and signer_graphql(flow) >= 1
    time.sleep(1.1)   # the bridge's voucher for B gets another issued_at: another request than the refused one
    flow.gl.note("alice", "answer D-1 B")
    assert flow.bridge.collect() == 1
    ans = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [(a["choice"], a["question_note"]) for a in ans] == [("B", q["id"])]


def test_an_award_emoji_on_a_reply_still_counts(flow):
    """bob puts a :thumbsup: on alice's reply: GitLab moves its updated_at, GraphQL names no editor. The bridge and the
    signer (each asking GraphQL) take it as alice wrote it."""
    flow.hand_over()
    sha, q = flow.ask()
    reply = flow.gl.note("alice", "answer D-1 B 小额不审")
    flow.gl.award(reply)
    assert reply["updated_at"] != reply["created_at"]
    assert flow.bridge.collect() == 1 and flow.decision()["state"] == "delivered"
    assert "：B。" in flow.kc.sent[-1]["message"]
    ans = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [(a["choice"], a["question_note"]) for a in ans] == [("B", q["id"])]
    assert replies(flow) == {reply["id"]: "original"} and signer_graphql(flow) == 1
    assert flow.gl.graphql_calls.count("bridge-tok") == 1


def test_a_reply_edited_by_someone_else_holds_the_round(flow):
    """alice answers A; carol's reply (B) is rewritten to A by a Maintainer before anyone read it. What carol wrote
    is not known, so it counts as a different answer: nothing is signed for alice's A, the bridge ends the round with
    a conflict note. In the new round alice's A counts, and the signer agrees (its round starts at that note)."""
    flow.hand_over()
    sha, q = flow.ask()
    flow.gl.note("alice", "answer D-1 A")
    carol = flow.gl.note("carol", "answer D-1 B")
    flow.gl.edit(carol, "answer D-1 A", by="mo")
    raw = flow.park_raw(sha)
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "alice", q["id"]))
    assert d == "refused" and "被改过" in reasons(r) and "不同的回答" in reasons(r), r
    assert replies(flow)[carol["id"]] == "edited"
    assert flow.bridge.collect() == 0 and flow.decision()["state"] == "open"
    conflict = [b for b in flow.gl.bodies() if b.startswith("D-1 收到不同的回答")]
    assert conflict and "@carol=A（这条回复被改过，不算）" in conflict[0] and "@alice=A" in conflict[0], conflict
    assert not [x for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    time.sleep(1.1)   # the bridge's voucher gets another issued_at than the one refused above: another request
    flow.gl.note("alice", "answer D-1 A")                                  # the new round
    assert flow.bridge.collect() == 1
    ans = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [(a["choice"], a["answerer"]) for a in ans] == [("A", flow.bridge.pseudonym("alice"))]


def test_edited_by_its_author_before_first_sight_counts(flow):
    """Before anyone read it, alice fixed her own reply: it counts as it reads now (GraphQL: alice edited it), for the
    bridge and the signer alike."""
    flow.hand_over()
    sha, q = flow.ask()
    reply = flow.gl.note("alice", "answer D-1 A")
    flow.gl.edit(reply, "answer D-1 B 小额不审", by="alice")
    assert flow.bridge.collect() == 1 and flow.decision()["answer"] == "B"
    ans = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [(a["choice"], a["answerer"]) for a in ans] == [("B", flow.bridge.pseudonym("alice"))]
    assert replies(flow) == {reply["id"]: "original"}


def test_made_an_answer_by_someone_else_before_first_sight(flow):
    """carol's harmless note is made into an answer by a Maintainer before the bridge's first poll: the bridge tells the
    MR once and delivers nothing, the signer will not sign it; carol's own new reply counts (hers stands for her)."""
    flow.hand_over()
    sha, q = flow.ask()
    note = flow.gl.note("carol", "我明天看一下")
    flow.gl.edit(note, "answer D-1 A", by="mo")
    assert flow.bridge.collect() == 0 and flow.bridge.collect() == 0
    told = [b for b in flow.gl.bodies() if b.startswith("D-1：") and "新的回复" in b]
    assert len(told) == 1, flow.gl.bodies()
    d, r = signer_ask(flow.w, answer_voucher(sha, flow.park_raw(sha), "D-1", "A", "carol", q["id"]))
    assert d == "refused" and "有效回答" in reasons(r), r
    assert replies(flow) == {note["id"]: "edited"}
    time.sleep(1.1)
    flow.gl.note("carol", "answer D-1 A")
    assert flow.bridge.collect() == 1
    ans = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [(a["choice"], a["answerer"]) for a in ans] == [("A", flow.bridge.pseudonym("carol"))]


def test_a_reply_changed_after_the_signer_read_it(flow):
    """The signer keeps each reply's text hash from its first sight (brain-kit's replies table): alice's reply, read
    when it said B, says A later. Edited by alice herself (GraphQL shows nothing wrong), it still does not count."""
    flow.hand_over()
    sha, q = flow.ask()
    reply = flow.gl.note("alice", "answer D-1 B")
    raw = flow.park_raw(sha)
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "alice", q["id"]))   # not what alice said
    assert d == "refused" and "凭证和签名服务按 GitLab 重建的不一样" in reasons(r) and replies(flow) == {reply["id"]: "original"}
    flow.gl.edit(reply, "answer D-1 A", by="alice")
    time.sleep(1.1)
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "alice", q["id"]))
    assert d == "refused" and "有效回答" in reasons(r), r
    assert not [x for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]


def test_graphql_down_signs_nothing_and_records_nothing(flow):
    """GitLab GraphQL does not answer the signer (its own token) while alice's reply has an award emoji: the signer
    signs nothing and records nothing for that reply (no answer: the bridge asks again), instead of brain-kit's
    "cannot tell" for good. Once GraphQL answers, the same voucher is signed."""
    flow.hand_over()
    sha, q = flow.ask()
    reply = flow.gl.note("alice", "answer D-1 B")
    flow.gl.award(reply)
    flow.gl.graphql_down.add("signer-tok")
    flow.client.timeout = 0.5
    assert flow.bridge.collect() == 0 and flow.decision()["state"] == "open"   # SignerUnavailable: open again
    late = flow.bridge.ledger.pending_voucher("answer D-1")
    assert late is not None and late["choice"] == "B"
    assert replies(flow) == {} and signer_graphql(flow) >= 1
    assert not [x for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert signer_ask(flow.w, late) == (None, None)                          # straight into the spool: no answer either
    flow.gl.graphql_down.clear()
    flow.signer._failed.clear()           # (the signer looks at a request it could not check again after RETRY_S)
    flow.client.timeout = 5
    assert flow.bridge.collect() == 1 and flow.decision()["voucher_id"] == late["voucher_id"]
    assert replies(flow) == {reply["id"]: "original"}


def holds_pending():
    """brain-kit QA round 3 (0d52e97): a reply whose edits cannot be read is "pending" (recorded nothing, read again
    next round, the whole decision held); 48b6b97 recorded it as "cannot tell" for good."""
    from brainkit.bridge import decisions
    return hasattr(decisions.Verdict("none"), "pending")


def test_graphql_down_for_everyone_fails_closed(flow):
    """GraphQL answers nobody: fail closed, but not for good. brain-kit's bridge does not count alice's touched reply;
    since 0d52e97 it holds D-1 (the reply is read again each round) and tells the MR once after edit_check_rounds
    rounds (3 by default); the signer signs nothing and records nothing for it either. Once GraphQL answers, her
    reply counts as she wrote it: nobody replies again. (48b6b97 recorded it as "cannot tell" for good and told the
    MR at once: there she replied again.)"""
    flow.hand_over()
    sha, q = flow.ask()
    first = flow.gl.note("alice", "answer D-1 B")
    flow.gl.award(first)
    flow.gl.graphql_down.add("*")
    assert [flow.bridge.collect() for _ in range(3)] == [0, 0, 0]
    told = [b for b in flow.gl.bodies() if b.startswith("D-1：") and "查不到" in b]
    assert len(told) == 1 and flow.decision()["state"] == "open", flow.gl.bodies()
    assert flow.bridge.collect() == 0 and len([b for b in flow.gl.bodies() if b.startswith("D-1：")]) == 1  # told once
    d, r = signer_ask(flow.w, answer_voucher(sha, flow.park_raw(sha), "D-1", "B", "alice", q["id"]))
    assert (d, r) == (None, None) and first["id"] not in replies(flow)
    if holds_pending():
        assert "不用重新回复" in told[0], told
    else:
        flow.gl.note("alice", "answer D-1 B")
    flow.gl.graphql_down.clear()
    flow.signer._failed.clear()           # (the bridge's voucher may be the very request the signer could not check)
    assert flow.bridge.collect() == 1 and flow.decision()["state"] == "delivered"
    assert replies(flow)[first["id"]] == "original"
    # what is signed is her B for that question (the request written straight into the spool above, held while GraphQL
    # was down, is answered too once the signer can check it)
    ans = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert {(a["choice"], a["question_note"]) for a in ans} == {("B", q["id"])}
    assert flow.decision()["voucher_id"] in {a["voucher_id"] for a in ans}


def test_a_pending_verdict_is_no_refusal(flow):
    """The signer never turns brain-kit's hold into a refusal: a check_answer verdict that names pending replies (their
    edits cannot be read now) gets no answer (the bridge asks again), and the voucher is signed once it can tell."""
    if not holds_pending():
        pytest.skip("brain-kit before QA round 3 has no pending replies")
    from brainkit.bridge import decisions
    flow.hand_over()
    sha, q = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    raw = flow.park_raw(sha)
    real = decisions.check_answer

    def held(*a, **kw):
        got = real(*a, **kw)
        return decisions.Verdict("none", "edits of replies 1 cannot be checked yet", pending=[1], last_id=got.last_id)

    decisions.check_answer = held
    try:
        assert signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "alice", q["id"])) == (None, None)
    finally:
        decisions.check_answer = real
    assert not os.listdir(flow.w["sspool"] / "refused")
    flow.signer._failed.clear()
    assert signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "alice", q["id"]))[0] == "signed"


def test_a_made_up_question_is_refused(flow):
    """The bridge account posts a D-n of its own (old layout, or one park.json never asked): not a question."""
    flow.hand_over()
    sha = push_park(flow.w["wt"])
    raw = flow.park_raw(sha)
    old = flow.gl.note("brain-bridge", "**D-90 · 澄清 · RUN-PAY-1-1** 需要 @alice、@carol 回答\n\n```text\n今天午饭吃什么？\n"
                                       "A. 面\nB. 饭\n```")
    flow.gl.note("alice", "answer D-90 A")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-90", "A", "alice", old["id"]))
    assert d == "refused" and "no question D-90" in reasons(r), r
    from brainkit.bridge import decisions
    other = dict(PARK, question="今天午饭吃什么？")
    made = flow.gl.note("brain-bridge", decisions.question_text("D-91", "RUN-PAY-1-1", other, ["alice", "carol"],
                                                                "clarify", sha, hashlib.sha256(raw).hexdigest()))
    flow.gl.note("alice", "answer D-91 A")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-91", "A", "alice", made["id"]))
    assert d == "refused" and "edited" in reasons(r), r


def test_a_question_older_than_its_push_is_refused(flow):
    """The branch went away from S2 and came back: GitLab records S2 as pushed after D-1 was asked."""
    flow.hand_over()
    s2, q = flow.ask()
    wt = flow.w["wt"]
    sh("git", "-C", wt, "push", "-q", "-f", "origin", "%s~1:refs/heads/%s" % (s2, BRANCH))
    flow.gl.sync()
    sh("git", "-C", wt, "push", "-q", "-f", "origin", "%s:refs/heads/%s" % (s2, BRANCH))
    flow.gl.sync()
    flow.gl.note("alice", "answer D-1 B")
    d, r = signer_ask(flow.w, answer_voucher(s2, flow.park_raw(s2), "D-1", "B", "alice", q["id"]))
    assert d == "refused" and "asked before" in reasons(r), r
    assert flow.bridge.collect() == 0 and flow.decision()["state"] == "void"


def test_an_answer_names_the_question_note_it_answers(flow):
    """brain-kit 9935b11: an answer voucher carries question_note, the note id its ledger recorded. One without it,
    of the wrong type, or naming another note (a person's reply) is refused."""
    flow.hand_over()
    sha, q = flow.ask()
    reply = flow.gl.note("alice", "answer D-1 B")
    raw = flow.park_raw(sha)
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "alice", None))
    assert d == "refused" and "question_note" in reasons(r), r
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "alice", str(q["id"])))
    assert d == "refused" and "question_note" in reasons(r), r
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "alice", reply["id"]))
    assert d == "refused" and "not by the bridge account" in reasons(r), r
    assert not [x for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "alice", q["id"]))[0] == "signed"


def test_a_question_deleted_and_posted_again_binds_nothing(flow):
    """alice answered D-1. Whoever holds the bridge account's token deletes the question and posts the same text again,
    and carol answers differently after the copy. brain-kit's bridge is bound to the note it recorded: D-1 is void,
    nothing is delivered. The signer refuses the answer bound to the deleted note (void), and one bound to the copy:
    alice's reply comes before it, so the copy would drop her answer."""
    flow.hand_over()
    sha, q1 = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    flow.gl.delete(q1)
    q2 = flow.gl.note("brain-bridge", q1["body"])
    flow.gl.note("carol", "answer D-1 A")
    assert flow.bridge.collect() == 0
    assert flow.decision()["state"] == "void" and flow.kc.sent == []
    assert any(b.startswith("D-1 作废（") and "deleted" in b for b in flow.gl.bodies())
    raw = flow.park_raw(sha)
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "alice", q1["id"]))
    assert d == "refused" and "作废" in reasons(r) and "deleted" in reasons(r), r
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "carol", q2["id"]))
    assert d == "refused" and "之前已经有人回答过" in reasons(r), r
    assert not [x for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]


def test_a_later_copy_of_a_question_does_not_drop_an_answer(flow):
    """The same without the delete: alice answered D-1, then a copy of the question is posted with the bridge's token
    and carol answers differently after it. Bound to the copy, check_answer would count only carol's reply; the signer
    refuses that binding (alice's reply comes before it). Bound to the question brain-kit recorded, both replies
    count: brain-kit's bridge sees two different answers and delivers neither."""
    flow.hand_over()
    sha, q1 = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    copy = flow.gl.note("brain-bridge", q1["body"])
    flow.gl.note("carol", "answer D-1 A")
    raw = flow.park_raw(sha)
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "carol", copy["id"]))
    assert d == "refused" and "之前已经有人回答过" in reasons(r), r
    assert flow.bridge.collect() == 0 and any(b.startswith("D-1 收到不同的回答") for b in flow.gl.bodies())
    assert not [x for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert not any(m["message"].startswith("决策 D-1") for m in flow.kc.sent)


def test_a_decision_id_is_never_bound_twice_even_after_its_question_is_deleted(flow):
    """What check_answer cannot see: the bridge account deletes D-1 (bound to S2, answered B), pushes S3 and asks a
    new D-1 there. On the MR alone that is a clean question; the signer remembers D-1 is S2's."""
    flow.hand_over()
    s2, q = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    assert flow.bridge.collect() == 1
    raw = flow.park_raw(s2)
    flow.gl.delete(q)
    s3 = commit_push(flow.w["wt"], {"other.txt": "more\n"}, "more")
    from brainkit.bridge import decisions
    q3 = flow.gl.note("brain-bridge", decisions.question_text("D-1", "RUN-PAY-1-1", PARK, ["alice", "carol"],
                                                              "clarify", s3, hashlib.sha256(raw).hexdigest()))
    flow.gl.note("alice", "answer D-1 A")
    d, r = signer_ask(flow.w, answer_voucher(s3, raw, "D-1", "A", "alice", q3["id"]))
    assert d == "refused" and "已经是另一个问题" in reasons(r), r


def test_one_question_gets_one_answer(flow):
    """After D-1=B was signed, a forged conflict note (bridge account) opens a new round and carol answers A: on the MR
    alone that is a valid answer; the signer has signed this question already. A copy of the question posted again
    binds nothing either."""
    flow.hand_over()
    sha, q = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    assert flow.bridge.collect() == 1
    raw = flow.park_raw(sha)
    # the same answer in a newer voucher (brain-kit asks for a new one once its waiting voucher is an hour old) is
    # signed again
    time.sleep(1.1)
    assert signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "alice", q["id"]))[0] == "signed"
    from brainkit.bridge import decisions
    flow.gl.note("brain-bridge", decisions.conflict_text("D-1", {"alice": ("B", "", 0, ()), "bob": ("A", "", 0, ())}))
    flow.gl.note("carol", "answer D-1 A")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "carol", q["id"]))
    assert d == "refused" and "已经签过另一个回答" in reasons(r), r
    copy = flow.gl.note("brain-bridge", q["body"])
    flow.gl.note("carol", "answer D-1 B")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "carol", copy["id"]))
    assert d == "refused" and "绑在问题评论 %d 上" % q["id"] in reasons(r), r


def test_conflicts_lookalikes_and_the_bridge_account(flow):
    flow.hand_over()
    sha, q = flow.ask()
    raw = flow.park_raw(sha)
    from brainkit.bridge import decisions
    # a person's look-alike of D-1 bound elsewhere changes nothing (only kit.json bridge_user's notes are questions)
    flow.gl.note("bob", decisions.question_text("D-1", "RUN-PAY-1-1", PARK, ["bob"], "clarify", "b" * 40, "c" * 64))
    # the bridge account answering, and a person not allowed, do not count
    flow.gl.note("brain-bridge", "answer D-1 A")
    flow.gl.note("bob", "answer D-1 A")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "brain-bridge", q["id"]))
    assert d == "refused" and "有效回答" in reasons(r), r
    # two allowed people, two answers: nothing is signed
    flow.gl.note("alice", "answer D-1 A")
    flow.gl.note("carol", "answer D-1 B")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "alice", q["id"]))
    assert d == "refused" and "不同的回答" in reasons(r), r
    assert flow.bridge.collect() == 0 and any(b.startswith("D-1 收到不同的回答") for b in flow.gl.bodies())
    # after the bridge's conflict note a new round starts: carol settles it, the bridge and the signer agree
    flow.gl.note("carol", "answer D-1 A")
    assert flow.bridge.collect() == 1
    ans = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [(a["choice"], a["answerer"]) for a in ans] == [("A", flow.bridge.pseudonym("carol"))]


def test_a_question_without_options_is_answered_approve_or_reject(flow):
    """brain-kit 9935b11: a question with no options (and no Lean request) takes approve / reject; a letter does not
    count. The bridge and the signer agree."""
    flow.hand_over()
    sha, q = flow.ask(dict(PARK, options=[], recommend=None, question="可以按这个口径上线吗？"))
    assert "`answer D-1 approve` 或 `answer D-1 reject`" in q["body"]
    flow.gl.note("alice", "answer D-1 A")
    assert flow.bridge.collect() == 0
    d, r = signer_ask(flow.w, answer_voucher(sha, flow.park_raw(sha), "D-1", "A", "alice", q["id"]))
    assert d == "refused" and "有效回答" in reasons(r), r
    flow.gl.note("alice", "answer D-1 approve 可以")
    assert flow.bridge.collect() == 1 and flow.decision()["answer"] == "approve"
    ans = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [(a["choice"], a["question_note"]) for a in ans] == [("approve", q["id"])]


def test_a_batch_review_with_item_ids_in_its_note_is_not_signed(flow):
    """brain-kit 9935b11: `reject A-3 … D-7 …` (an item id in the note after the list) does not count: the list did not
    end where the reply meant it to. Nothing is delivered or signed for it; a well-formed reply is."""
    flow.hand_over()
    sha, q = flow.ask(ACCEPTANCE)
    flow.gl.note("carol", "answer D-1 reject A-3 上限太低，D-7 也不对")
    assert flow.bridge.collect() == 0 and any("说明里不要再写项号" in b for b in flow.gl.bodies())
    d, r = signer_ask(flow.w, answer_voucher(sha, flow.park_raw(sha), "D-1", "reject", "carol", q["id"],
                                             kind="acceptance", lean_request="RELEASE 1234abcd",
                                             review_items=["D-7", "A-3"], rejected_items=["A-3"]))
    assert d == "refused" and "有效回答" in reasons(r), r
    flow.gl.note("carol", "answer D-1 reject A-3,D-7 上限太低")
    assert flow.bridge.collect() == 1
    acc = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [a["rejected_items"] for a in acc] == [["D-7", "A-3"]]


def test_answers_need_kit_bridge_user(tmp_path, home, monkeypatch):
    """Without kit.json bridge_user nobody can tell the bridge's notes from people's: no answer is signed."""
    w = make_world(tmp_path, home, monkeypatch, bridge_user=None)
    f = Flow(w)
    f.hand_over()                                                        # a hand-over does not need it
    f.ask()
    f.gl.note("alice", "answer D-1 B")
    assert f.bridge.collect() == 0 and f.decision()["state"] == "refused"
    assert any("没写 bridge_user" in b for b in f.gl.bodies())


def test_a_pinned_bridge_account(tmp_path, home, monkeypatch):
    w = make_world(tmp_path, home, monkeypatch, signer_cfg={"bridge_users": ["brain-bridge-2"]})
    f = Flow(w)
    f.hand_over()
    f.ask()
    f.gl.note("alice", "answer D-1 B")
    assert f.bridge.collect() == 0 and f.decision()["state"] == "refused"
    assert any("不在这个签名服务的 bridge_users 里" in b for b in f.gl.bodies())


def test_an_answer_needs_the_signers_own_contract(flow):
    sha = push_park(flow.w["wt"])
    d, r = signer_ask(flow.w, answer_voucher(sha, flow.park_raw(sha), "D-1", "B", "alice", 1000))
    assert d == "refused" and "没签过 RUN-PAY-1-1 的接手合同" in reasons(r)


# ---------------------------------------------------------------- hand-overs: brain-kit's Bridge.verify

def relabel(flow):
    """alice takes the hand-over label off and puts it on again (GitLab records no event for a label the MR has)."""
    flow.gl.label("alice", action="remove")
    flow.gl.label("alice")


def handoff_request(flow, run_id="RUN-PAY-1-1", **over):
    """A hand-over voucher in brain-kit's layout for the MR as it is (facts from Bridge.verify)."""
    from brainkit.common import iso, later, utcnow
    mr = flow.gl.mr()
    probs, f = flow.bridge.verify(P, flow.bridge.kit(P), mr)
    v = flow.w["bs"].handoff_voucher({"run_id": run_id, "project": P, "issued_at": iso(utcnow()),
                                      "expires_at": later(72)}, mr, f, "brain-bridge")
    v.update(over)
    return v, probs


def test_a_push_after_the_owners_label_is_refused(flow):
    late = commit_push(flow.w["wt"], {"late.txt": "pushed after the label\n"}, "late", bot=False)
    v, probs = handoff_request(flow)
    assert v["sha"] == late and any("after the label" in p for p in probs)
    d, r = signer_ask(flow.w, v)
    assert d == "refused" and "was pushed" in reasons(r) and "after the label 'ai-handoff' was added" in reasons(r)
    assert "is not the hand-over commit" in reasons(r)                   # and it is not what `brain handoff` made
    # labelling it again does not hand that commit over (brain-kit 9935b11): only a hand-over commit is handed over
    relabel(flow)
    time.sleep(1.1)
    v, probs = handoff_request(flow)
    assert [p for p in probs if "hand-over commit" in p] and not [p for p in probs if "after the label" in p]
    d, r = signer_ask(flow.w, v)
    assert d == "refused" and "is not the hand-over commit" in reasons(r), r
    # alice looks at it and runs `brain handoff` again: its commit, labelled after its push, is handed over
    head = hand_off(flow.w)
    relabel(flow)
    v, probs = handoff_request(flow)
    assert v["sha"] == head and probs == []
    d, r = signer_ask(flow.w, v)
    assert d == "signed", r


def test_only_the_hand_over_commit_is_handed_over(flow):
    """brain-kit 9935b11 (S1): someone pushes on top of `brain handoff`'s commit before the owner's label lands. The
    label is newer than that push, so the label rule passes; the head is not the hand-over commit (run.json is as its
    parent has it), so brain-kit's bridge rejects it and the signer refuses it. A merge at the head is no hand-over
    commit either."""
    commit_push(flow.w["wt"], {"src/extra.py": "x = 1\n"}, "someone's commit on top", bot=False)
    relabel(flow)
    v, probs = handoff_request(flow)
    assert probs and all("hand-over commit" in p for p in probs), probs
    d, r = signer_ask(flow.w, v)
    assert d == "refused" and "does not change runs/PAY-1/run.json" in reasons(r), r
    assert flow.bridge.process(P, flow.bridge.kit(P), flow.gl.mr()) == "rejected"
    assert any(b.startswith("AI 接手被拒") and "is not the hand-over commit" in b for b in flow.gl.bodies())
    assert flow.signer.ledger.run("RUN-PAY-1-1") is None and flow.bridge.ledger.runs_in("signing") == []
    wt = flow.w["wt"]
    sh("git", "-C", wt, "checkout", "-q", "-b", "side")
    sh("git", "-C", wt, "commit", "-q", "--allow-empty", "-m", "side")
    sh("git", "-C", wt, "checkout", "-q", BRANCH)
    sh("git", "-C", wt, "merge", "-q", "--no-ff", "-m", "merge side", "side")
    sh("git", "-C", wt, "push", "-q", "origin", "HEAD:" + BRANCH)
    relabel(flow)
    v, probs = handoff_request(flow)
    assert probs and all("is a merge" in p for p in probs), probs
    d, r = signer_ask(flow.w, v)
    assert d == "refused" and "is a merge" in reasons(r), r


def test_a_bots_commit_is_never_handed_over(flow):
    """brain-kit 72b278e: a head a bot authored or committed (kit bot_emails / bot_users) is never the hand-over, even
    one that changes run.json the way `brain handoff` does (the runner writes park.json and its work; pre-receive keeps
    it off run.json). brain-kit's bridge rejects it and the signer refuses it, whatever the label times."""
    rec = json.loads((flow.w["wt"] / "runs" / "PAY-1" / "run.json").read_text())
    rec["handoff"] = dict(rec["handoff"], requested_at="2026-11-09T03:00:00Z")
    commit_push(flow.w["wt"], {"runs/PAY-1/run.json": rec}, "bot: hand over again", bot=True)
    relabel(flow)
    v, probs = handoff_request(flow)
    assert probs and any("made by a bot account" in p for p in probs), probs
    d, r = signer_ask(flow.w, v)
    assert d == "refused" and "made by a bot account" in reasons(r), r
    assert flow.bridge.process(P, flow.bridge.kit(P), flow.gl.mr()) == "rejected"
    assert flow.signer.ledger.run("RUN-PAY-1-1") is None and flow.signer.ledger.runs_in("signing") == []


def test_a_contract_asked_for_again_is_signed_again(flow):
    """The bridge did not get the first answer, or its waiting voucher grew old: the same run id for the same MR and
    commit is signed again (the run is brain-kit's `signing` reservation while it is checked, so Bridge.verify does
    not count it as another open run). That run id for another hand-over commit is not, and neither is a second run
    of the requirement while this one is open."""
    v, _ = handoff_request(flow)
    seen = []
    verify = flow.signer.br.verify

    def watch(*a, **k):
        seen.append(flow.signer.ledger.run("RUN-PAY-1-1")["state"])
        return verify(*a, **k)

    flow.signer.br.verify = watch
    assert signer_ask(flow.w, v)[0] == "signed"
    time.sleep(1.1)                                            # another issued_at: another voucher, another request
    v2, _ = handoff_request(flow)
    assert v2 != v and signer_ask(flow.w, v2)[0] == "signed"
    assert seen == ["signing", "signing"]
    run = flow.signer.ledger.run("RUN-PAY-1-1")
    assert run["state"] == "spooled" and run["voucher_id"] == "V-" + flow.sign.digest(v2)[:10]
    head = hand_off(flow.w)                                    # a new hand-over commit, labelled after its push
    relabel(flow)
    v3, probs = handoff_request(flow)
    assert v3["sha"] == head and [p for p in probs if "already has an open run" in p] == []
    d, r = signer_ask(flow.w, v3)
    assert d == "refused" and "已经签给别的交接了" in reasons(r)
    d, r = signer_ask(flow.w, handoff_request(flow, run_id="RUN-PAY-1-2")[0])
    assert d == "refused" and "already has an open run" in reasons(r), r
    assert flow.signer.ledger.run("RUN-PAY-1-2") is None and flow.signer.ledger.runs_in("signing") == []
    assert flow.signer.ledger.run("RUN-PAY-1-1")["state"] == "spooled"


def test_a_late_signature_is_used_not_signed_again(flow):
    """brain-kit 9935b11: the bridge's SpoolSigner gives up before the signer answers. The run id it had reserved is
    given back and the voucher stays pending; the signer answers late; the next round asks for that very voucher (the
    same request) and takes the late signature. One contract, one answer voucher, each signed once."""
    client, signer = flow.client, flow.signer
    seen = []

    def give_up(_):
        seen.append([dict(r) for r in flow.bridge.ledger.runs_in("signing")])
        client.clock = lambda: float("inf")                   # the wait is over before the signer looks

    client.sleep, client.clock = give_up, time.monotonic
    with pytest.raises(flow.sign.SignerUnavailable):
        flow.bridge.process(P, flow.bridge.kit(P), flow.gl.mr())
    assert [r["run_id"] for r in seen[0]] == ["RUN-PAY-1-1"]          # reserved while it waited
    assert flow.bridge.ledger.run("RUN-PAY-1-1") is None              # given back: nothing was signed in time
    (pending,) = [json.loads(r[0]) for r in flow.bridge.ledger.db.execute("SELECT voucher FROM pending_vouchers")]
    spool_request(flow.w["sspool"], pending)                          # what the signer read before the bridge gave up
    signer.once()
    assert signer.ledger.run("RUN-PAY-1-1")["voucher_id"] == pending["voucher_id"]
    client.clock, client.sleep = time.monotonic, (lambda _: signer.once())
    flow.hand_over()
    contracts = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "handoff"]
    assert [c["voucher_id"] for c in contracts] == [pending["voucher_id"]]
    assert flow.vouchers("app-vouchers") == flow.vouchers()
    # an answer the same way
    sha, q = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    client.sleep, client.clock = give_up, time.monotonic
    assert flow.bridge.collect() == 0 and flow.decision()["state"] == "open"
    late = flow.bridge.ledger.pending_voucher("answer D-1")
    assert late["question_note"] == q["id"]
    spool_request(flow.w["sspool"], late)
    signer.once()
    client.clock, client.sleep = time.monotonic, (lambda _: signer.once())
    assert flow.bridge.collect() == 1 and flow.decision()["voucher_id"] == late["voucher_id"]
    answers = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [a["voucher_id"] for a in answers] == [late["voucher_id"]]
    assert flow.bridge.ledger.pending_voucher("answer D-1") is None


def test_the_signer_checks_every_field_on_its_own(flow, world):
    """Requests written straight into the spool: wrong types, another project, a forged voucher id, a field brain-kit
    does not write, times not in brain-kit's format, an expiry beyond the TTL, a closed MR are refused; a GitLab
    outage leaves the request unanswered (the bridge asks again) instead of rejecting the hand-over."""
    from datetime import timedelta
    from brainkit.common import iso, utcnow
    base, _ = handoff_request(flow)
    cases = [({"schema": True}, "schema"), ({"mr_iid": "5"}, "mr_iid"), ({"project": "other/repo"}, "不归这个签名服务"),
             ({"extra": "1"}, "extra"), ({"materials": [{"package": "PKG-PAY-1-1", "manifest_sha256": "0" * 64}]},
                                         "materials"),
             ({"issued_at": iso(utcnow()).replace("Z", "+00:00")}, "issued_at"),
             ({"expires_at": iso(utcnow() + timedelta(hours=100))}, "有效期"), ({"route": "skip"}, "route"),
             ({"run_id": "RUN-PAY-2-1"}, "对不上")]
    for over, why in cases:
        d, r = signer_ask(world, dict(base, **over))
        assert d == "refused" and why in reasons(r), (over, r)
    d, r = signer_ask(world, dict(base, voucher_id="V-0000000000"), fix_id=False)
    assert d == "refused" and "摘要" in reasons(r)
    world["gl"].state = "closed"
    def at(back):  # each its own request (one voucher, one request id), within the TTL
        t = utcnow() - timedelta(seconds=back)
        return {"issued_at": iso(t), "expires_at": iso(t + timedelta(hours=1))}

    d, r = signer_ask(world, dict(base, **at(2)))
    assert d == "refused" and "不是打开的" in reasons(r)
    world["gl"].state = "opened"
    working = world["signer"].gl.transport

    def down(*_a):
        raise OSError("GitLab is down")

    world["signer"].gl.transport = down
    try:
        assert signer_ask(world, dict(base, **at(4))) == (None, None)
    finally:
        world["signer"].gl.transport = working
    assert not list((world["tmp"] / "signer-vouchers").glob("*/*.json"))
    # every refusal gave the reserved run id back
    assert world["signer"].ledger.runs_in("signing") == [] and world["signer"].ledger.run("RUN-PAY-1-1") is None


def test_odd_files_in_the_request_folder_do_not_stall_the_signer(world):
    world["signer"].once()
    req = world["sspool"] / "requests"
    req.mkdir(parents=True, exist_ok=True)
    os.mkfifo(req / "answer-RUN-PAY-1-1-0123456789ab.json")
    os.symlink("/dev/zero", req / "answer-RUN-PAY-1-1-0123456789ac.json")
    (req / "answer-RUN-PAY-1-1-0123456789ad.json").write_text("x" * 100000)
    t = time.monotonic()
    assert world["signer"].once() == 0 and time.monotonic() - t < 5
    assert not os.listdir(world["sspool"] / "refused") and not os.listdir(world["sspool"] / "signed")
    _ = spool_request
