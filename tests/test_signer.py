"""The separate signer (signer/brain_signer.py) behind brain-kit's own SpoolSigner, with brain-kit's own Bridge asking
(no app here): it signs exactly the vouchers brain-kit builds, decides with brain-kit's Bridge.verify and
decisions.check_answer, and refuses the attacks an agent with the app's OS user (and so the bridge account's token)
can try: a replayed answer, an edited or made-up question, a question older than its push, a push after the owner's
label, a D-n bound again after its question was deleted, a second answer to one question, look-alikes, the bridge
account answering, requests that are not brain-kit's, and odd files in the spool.
"""

import hashlib
import json
import os
import subprocess
import time

import pytest

from appkit import sh
from brainfix import needs_brainkit
from teamfix import BRANCH, P, PARK, answer_voucher, commit_push, make_world, push_park, signer_ask, spool_request
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
    rejected_items): each voucher brain-kit builds is the one the signer rebuilds, signed and taken back."""
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
    assert flow.vouchers("app-vouchers") == signed                       # the bridge's copies are the same vouchers
    for x in signed:
        assert flow.sign.verify(x["voucher"], x["sig"], str(flow.w["allowed"]))
    assert os.listdir(flow.w["sspool"] / "requests") == []               # brain-kit's SpoolSigner took them back
    assert flow.decision("D-2")["state"] == "delivered"


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
    s2, _ = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    assert flow.bridge.collect() == 1
    raw = flow.park_raw(s2)
    s3 = commit_push(flow.w["wt"], {"other.txt": "more\n"}, "more")
    assert flow.park_raw(s3) == raw
    d, r = signer_ask(flow.w, answer_voucher(s3, raw, "D-1", "B", "alice"))
    assert d == "refused" and "作废" in reasons(r) and "never bound twice" in reasons(r), r


def test_an_edited_question_is_refused(flow):
    """Whoever holds the bridge account's token edits D-1 after it was asked: no reply to it counts."""
    flow.hand_over()
    sha, q = flow.ask()
    q["body"] = q["body"].replace("A. 要", "A. 要（人工审核全部免掉）")
    flow.gl.note("alice", "answer D-1 A")
    assert flow.bridge.collect() == 0
    assert flow.decision()["state"] == "void" and any(b.startswith("D-1 作废（") for b in flow.gl.bodies())
    d, r = signer_ask(flow.w, answer_voucher(sha, flow.park_raw(sha), "D-1", "A", "alice"))
    assert d == "refused" and "edited" in reasons(r), r
    assert flow.kc.sent == []


def test_a_made_up_question_is_refused(flow):
    """The bridge account posts a D-n of its own (old layout, or one park.json never asked): not a question."""
    flow.hand_over()
    sha = push_park(flow.w["wt"])
    raw = flow.park_raw(sha)
    flow.gl.note("brain-bridge", "**D-90 · 澄清 · RUN-PAY-1-1** 需要 @alice、@carol 回答\n\n```text\n今天午饭吃什么？\nA. 面\n"
                                 "B. 饭\n```")
    flow.gl.note("alice", "answer D-90 A")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-90", "A", "alice"))
    assert d == "refused" and "no question D-90" in reasons(r), r
    from brainkit.bridge import decisions
    other = dict(PARK, question="今天午饭吃什么？")
    flow.gl.note("brain-bridge", decisions.question_text("D-91", "RUN-PAY-1-1", other, ["alice", "carol"], "clarify", sha,
                                                         hashlib.sha256(raw).hexdigest()))
    flow.gl.note("alice", "answer D-91 A")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-91", "A", "alice"))
    assert d == "refused" and "edited" in reasons(r), r


def test_a_question_older_than_its_push_is_refused(flow):
    """The branch went away from S2 and came back: GitLab records S2 as pushed after D-1 was asked."""
    flow.hand_over()
    s2, _ = flow.ask()
    wt = flow.w["wt"]
    sh("git", "-C", wt, "push", "-q", "-f", "origin", "%s~1:refs/heads/%s" % (s2, BRANCH))
    flow.gl.sync()
    sh("git", "-C", wt, "push", "-q", "-f", "origin", "%s:refs/heads/%s" % (s2, BRANCH))
    flow.gl.sync()
    flow.gl.note("alice", "answer D-1 B")
    d, r = signer_ask(flow.w, answer_voucher(s2, flow.park_raw(s2), "D-1", "B", "alice"))
    assert d == "refused" and "asked before" in reasons(r), r
    assert flow.bridge.collect() == 0 and flow.decision()["state"] == "void"


def test_a_decision_id_is_never_bound_twice_even_after_its_question_is_deleted(flow):
    """What check_answer cannot see: the bridge account deletes D-1 (bound to S2, answered B), pushes S3 and asks a
    new D-1 there. On the MR alone that is a clean question; the signer remembers D-1 is S2's."""
    flow.hand_over()
    s2, q = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    assert flow.bridge.collect() == 1
    raw = flow.park_raw(s2)
    flow.gl.notes.remove(q)
    s3 = commit_push(flow.w["wt"], {"other.txt": "more\n"}, "more")
    from brainkit.bridge import decisions
    flow.gl.note("brain-bridge", decisions.question_text("D-1", "RUN-PAY-1-1", PARK, ["alice", "carol"], "clarify", s3,
                                                         hashlib.sha256(raw).hexdigest()))
    flow.gl.note("alice", "answer D-1 A")
    d, r = signer_ask(flow.w, answer_voucher(s3, raw, "D-1", "A", "alice"))
    assert d == "refused" and "已经是另一个问题" in reasons(r), r


def test_one_question_gets_one_answer(flow):
    """After D-1=B was signed, a forged conflict note (bridge account) opens a new round and carol answers A: on the MR
    alone that is a valid answer; the signer has signed this question already."""
    flow.hand_over()
    sha, _ = flow.ask()
    flow.gl.note("alice", "answer D-1 B")
    assert flow.bridge.collect() == 1
    raw = flow.park_raw(sha)
    # the same answer asked for again (the bridge did not get the first one) is signed again
    time.sleep(1.1)
    assert signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "B", "alice"))[0] == "signed"
    from brainkit.bridge import decisions
    flow.gl.note("brain-bridge", decisions.conflict_text("D-1", {"alice": ("B", "", 0, ()), "bob": ("A", "", 0, ())}))
    flow.gl.note("carol", "answer D-1 A")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "carol"))
    assert d == "refused" and "已经签过另一个回答" in reasons(r), r


def test_conflicts_lookalikes_and_the_bridge_account(flow):
    flow.hand_over()
    sha, _ = flow.ask()
    raw = flow.park_raw(sha)
    from brainkit.bridge import decisions
    # a person's look-alike of D-1 bound elsewhere changes nothing (only kit.json bridge_user's notes are questions)
    flow.gl.note("bob", decisions.question_text("D-1", "RUN-PAY-1-1", PARK, ["bob"], "clarify", "b" * 40, "c" * 64))
    # the bridge account answering, and a person not allowed, do not count
    flow.gl.note("brain-bridge", "answer D-1 A")
    flow.gl.note("bob", "answer D-1 A")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "brain-bridge"))
    assert d == "refused" and "有效回答" in reasons(r), r
    # two allowed people, two answers: nothing is signed
    flow.gl.note("alice", "answer D-1 A")
    flow.gl.note("carol", "answer D-1 B")
    d, r = signer_ask(flow.w, answer_voucher(sha, raw, "D-1", "A", "alice"))
    assert d == "refused" and "不同的回答" in reasons(r), r
    assert flow.bridge.collect() == 0 and any(b.startswith("D-1 收到不同的回答") for b in flow.gl.bodies())
    # after the bridge's conflict note a new round starts: carol settles it, the bridge and the signer agree
    flow.gl.note("carol", "answer D-1 A")
    assert flow.bridge.collect() == 1
    ans = [x["voucher"] for x in flow.vouchers() if x["voucher"]["kind"] == "answer"]
    assert [(a["choice"], a["answerer"]) for a in ans] == [("A", flow.bridge.pseudonym("carol"))]


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
    d, r = signer_ask(flow.w, answer_voucher(sha, flow.park_raw(sha), "D-1", "B", "alice"))
    assert d == "refused" and "没签过 RUN-PAY-1-1 的接手合同" in reasons(r)


# ---------------------------------------------------------------- hand-overs: brain-kit's Bridge.verify

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
    # alice looks at the MR and labels again: now she hands over that commit (a request a second later: the same
    # voucher would be the same request, and its refusal stands)
    flow.gl.label("alice")
    time.sleep(1.1)
    v, probs = handoff_request(flow)
    assert probs == []
    d, r = signer_ask(flow.w, v)
    assert d == "signed", r


def test_a_contract_asked_for_again_is_signed_again(flow):
    """The bridge did not get the first answer (it gave up waiting): the same run id for the same MR and commit is
    signed again; another commit under that run id is not."""
    v, _ = handoff_request(flow)
    assert signer_ask(flow.w, v)[0] == "signed"
    time.sleep(1.1)                                            # another issued_at: another voucher, another request
    v2, _ = handoff_request(flow)
    assert v2 != v and signer_ask(flow.w, v2)[0] == "signed"
    run = flow.signer.ledger.run("RUN-PAY-1-1")
    assert run["state"] == "spooled" and run["voucher_id"] == "V-" + flow.sign.digest(v2)[:10]
    commit_push(flow.w["wt"], {"x.txt": "x\n"}, "x", bot=False)
    flow.gl.label("alice")
    v3, _ = handoff_request(flow)
    d, r = signer_ask(flow.w, v3)
    assert d == "refused" and "已经签给别的交接了" in reasons(r)


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
