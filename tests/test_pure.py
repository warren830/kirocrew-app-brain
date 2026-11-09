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
    assert only["rejected_reason"] == "标签是 bob 打的，不是负责人 alice"          # the bridge's reason in short Chinese ...
    assert only["rejected_raw"] == "label 'ai-handoff' was added by bob, not by the branch owner alice"   # ... and as it wrote it
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
    """The overview row's current stage (the same stages the detail view lists) and its progress said the one way the
    app says it (vocab.leanProgress): stages done, stages skipped, the next one to do. A stage not started is never
    「11/11」 (UI问题清单 #8: 4 done and 6 skipped read as 10/11 done)."""
    lv = mod("lean_view")

    def ev(event, stage, unit=None, ts="2026-11-09T00:00:00Z"):
        return {"event": event, "data": {"stage": stage, "unit": unit}, "ts": ts, "_at": None}

    def at(evs):
        lean = lv.summary(lv.stages(evs))
        nxt = (lean["next"] or {}).get("id")
        return lean["stage"], lean["stage_state"], lean["done_n"], lean["skipped_n"], nxt, lv.stage_text(lean)

    assert at([]) == (None, None, 0, 0, "reverse-engineering", None)
    assert at([ev("STAGE_STARTED", "requirements")]) == ("requirements", "started", 0, 0, "requirements",
                                                         "做完 0 · 下一步：需求分析")
    done = [ev("STAGE_COMPLETED", s) for s in ("reverse-engineering", "requirements")] + \
        [ev("STAGE_SKIPPED", s) for s in ("user-stories", "application-design", "units")] + \
        [ev("STAGE_SKIPPED", s, "app") for s in ("functional-design", "nfr-design", "infrastructure-design")] + \
        [ev("STAGE_COMPLETED", "code-generation", "app"), ev("STAGE_COMPLETED", "build-and-test")]
    assert at(done) == ("release", "todo", 4, 6, "release", "做完 4 · 跳过 6 · 下一步：发布")
    assert at(done + [ev("STAGE_STARTED", "release")]) == ("release", "started", 4, 6, "release",
                                                           "做完 4 · 跳过 6 · 下一步：发布")
    assert at(done + [ev("STAGE_COMPLETED", "release")]) == ("release", "done", 5, 6, None, "做完 5 · 跳过 6 · 全部做完")
    assert at([ev("STAGE_SKIPPED", "reverse-engineering")]) == ("requirements", "todo", 0, 1, "requirements",
                                                                "做完 0 · 跳过 1 · 下一步：需求分析")


def test_an_idle_session_says_what_to_tell_it_from_lean():
    """「轮到你回话」 says what to say (UI问题清单 #4): the stage it stopped in, the next one, or, before the release,
    the review in a new session (the session that wrote the code cannot review it), as Lean's release skill asks."""
    lv = mod("lean_view")

    def ev(event, stage, unit=None, at=100.0):
        return {"event": event, "data": {"stage": stage, "unit": unit}, "ts": "2026-11-09T00:00:00Z", "_at": at}

    built = [ev("STAGE_COMPLETED", s) for s in ("reverse-engineering", "requirements")] + \
        [ev("STAGE_SKIPPED", s) for s in ("user-stories", "application-design", "units", "functional-design",
                                          "nfr-design", "infrastructure-design")] + \
        [ev("STAGE_COMPLETED", "code-generation"), ev("STAGE_COMPLETED", "build-and-test"),
         {"event": "VERIFY", "data": {"ok": True}, "_at": 200.0}]

    def step(evs, review_ok=False):
        return lv.idle_step(lv.stages(evs), review_ok=review_ok, default_branch="main")

    assert step(built) == "构建测试做完了，下一步是发布：先开一个新会话做审查（这个会话写了代码，不能自己审）"
    assert lv.review_current(150.0, True, built) is False and lv.review_current(250.0, True, built) is True
    assert lv.review_current(None, True, built) is True and lv.review_current(None, False, built) is False
    assert step(built, review_ok=True) == "审查写好了，下一步是发布：回会话让它接着发布（它会请你批准发布）"
    assert step(built[:1] + [ev("STAGE_STARTED", "requirements")]) == "「需求分析」做到一半，会话停下了：看它最后问了什么，回它"
    assert step(built[:2]) == "需求分析做完了，下一步是用户故事：在会话里让它接着做"
    assert step(built + [ev("STAGE_COMPLETED", "release")]) == "Lean 的阶段都做完了：可以把分支合并进 main 了"
    assert step([]) == "会话停下了，Lean 还没记下阶段：看它最后说了什么，回它"


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


@needs_brainkit
def test_the_bridges_change_description_note_is_none_of_its_status_notes(decisions):
    """brain-kit 48b6b97: the bridge posts runs/<KEY>/MR.md as a 「变更说明」 comment before an acceptance question. It is
    no question, answer or status note, whatever the run wrote in MR.md (here: a question's first line, a delivery)."""
    clarify = {"question": "要不要人工审核？", "options": [{"id": "A", "text": "要"}]}
    head = ask(decisions, "D-1", clarify, ["alice"], "clarify")
    md = "## PAY-3 · 退款\n%s\nD-1 已收到 @alice 的回答：A，已送回 RUN-PAY-3-1（凭证 V-0123456789）。\n" % head.split("\n")[0]
    desc = decisions.description_note("PAY-3", "runs", SHA, md.encode()) if hasattr(decisions, "description_note") \
        else "**变更说明**（`runs/PAY-3/MR.md`）\n\n" + md
    notes = [note(1, head), note(2, desc), note(3, "**变更说明**：run 没有写 `runs/PAY-3/MR.md`（提交 a1b2c3d4e5f6）。")]
    got = mrinfo.parse_notes(notes, bridge_user="brain-bridge")
    assert [(q["id"], q["state"], q["answer"]) for q in got["questions"]] == [("D-1", "open", None)]
    assert got["rejected_reason"] is None


def test_asking_is_a_question_not_on_the_mr_yet():
    """brain-kit 72b278e: 'asking' (one bridge process posting the question right now) is like 'posting'."""
    r = {"state": "", "state_label": "", "waits": {}, "open_questions": []}
    deliveries.team_classify(r, {"state": "dispatched"}, [{"id": "D-4", "state": "asking", "kind": "clarify"}], None)
    assert (r["state"], r["waits"]["who"], r["open_questions"]) == ("parked", "bridge", [])
    assert "asking" in deliveries.NOT_POSTED and "posting" in deliveries.NOT_POSTED


def test_a_hand_over_without_its_label_is_said_to_be_nothing_handed_over():
    """Person mode: run.json has the hand-over, the branch tip is the hand-over commit, the MR (at that tip) carries no
    hand-over, running or rejected label: nothing was handed over (`brain handoff` exits 1 then, 72b278e)."""
    cfg = {"handoff_label": "ai-handoff", "running_label": "ai-running", "rejected_label": "ai-handoff-rejected"}
    f = {"run": {"handoff": {"local_head": "a" * 40}}, "tip": "b" * 40, "park": None, "approvals": [], "claim": None}

    def state(labels, sha="b" * 40, at_handover=True, mr_state="opened"):
        row = {"state": "", "state_label": "", "waits": {}}
        mr = {"state": mr_state, "labels": labels, "sha": sha, "questions": []}
        deliveries.classify(row, f, mr=mr, slot=None, cfg=cfg, at_handover=at_handover)
        return row["state"], row["waits"]["who"], row["waits"]["text"]

    st, who, text = state([])
    assert (st, who) == ("handed_over", "you") and "没有交接标签 ai-handoff" in text and "什么也没交出去" in text
    assert state(["ai-handoff"])[:2] == ("handed_over", "bridge")            # labelled: the bridge looks at it
    assert state(["ai-running"])[:2] == ("running", "runner")
    assert state([], at_handover=False)[:2] == ("handed_over", "bridge")     # the runner's work on top: not said
    assert state([], sha="c" * 40)[:2] == ("handed_over", "bridge")          # an MR read before the push: not said
    assert state([], mr_state="merged")[0] == "merged"


def test_commit_dates_and_how_a_run_was_merged_in_the_timeline():
    """brain-kit 72b278e: a commit's "at" is its author date, committed_at the committer date (shown when they differ);
    merged_at.how in words (an unknown one as it is)."""
    detail = mod("detail")
    t = {"actions": {"commits": [
        {"sha": "1" * 40, "at": "2026-11-09T01:00:00Z", "committed_at": "2026-11-09T01:00:00Z", "by": "person"},
        {"sha": "2" * 40, "at": "2026-11-09T01:05:00Z", "committed_at": "2026-11-09T02:30:10Z", "by": "bot"}]},
        "outcome": {"merged_at": {"value": "2026-11-09T03:00:00Z", "commit": "3" * 40,
                                  "how": "squash merge (the branch is still here)"}}}
    items = {i["detail"].split(" ")[0]: i for i in detail.trace_timeline(t) if i["kind"] in ("commit", "merge")}
    assert items["1" * 12]["detail"] == "1" * 12
    assert items["2" * 12]["detail"] == "%s · 提交于 2026-11-09 02:30Z" % ("2" * 12) and items["2" * 12]["label"] == "运行机提交"
    assert items["3" * 12]["detail"] == "%s （squash 合并（分支还在））" % ("3" * 12)
    t["outcome"]["merged_at"]["how"] = "a new way"
    assert any(i["detail"] == "%s （a new way）" % ("3" * 12) for i in detail.trace_timeline(t))


def test_evaluate_notes_say_which_runs_wait_for_their_merge():
    """brain-kit 72b278e: an unmerged run whose acceptance was rejected is autonomy's "wrong_open" (it waits for its
    merge and 14 days); one already in delivery's wrong_open is not listed twice."""
    data = {"autonomy": {"value": [1, 2], "rule": "", "runs": [
        {"key": "PAY-3", "correct": "wrong_open", "status": "pending"},
        {"key": "PAY-4", "correct": "wrong_open", "status": "pending"},
        {"key": "PAY-5", "correct": "correct", "status": "counted"}]},
        "delivery": {"value": [1, 1], "rule": "", "wrong_open": ["PAY-4"]}}
    mods = bk._state["mods"]
    saved = mods.get("evaluate")
    mods["evaluate"] = type("FakeEvaluate", (), {"collect": staticmethod(lambda *a, **k: data)})
    try:
        view, _ = deliveries.evaluate("/nowhere", {}, None, None)
    finally:
        if saved is None:
            mods.pop("evaluate", None)
        else:
            mods["evaluate"] = saved
    assert view["available"] is True
    assert "已知有问题、14 天还没满（满了再算进交付正确率）：PAY-4" in view["notes"]
    assert "已知有问题、还没合并（验收被驳回过；合并满 14 天才算进自主度）：PAY-3" in view["notes"]


def test_review_findings_are_listed_per_file():
    intake = mod("intake")
    part = "请你确认 2 处（可能是人名或密码，也可能只是普通的词，没打码；是人名或密码就改原文再交）：「对接人：张三李四」、「密码是 …」"
    findings = ["- **D01 需求.md**：个人信息（已打码） phone×1；%s；隐藏内容 1 处（移到 extras/hidden.md）" % part,
                "- **D02 b.md**：无", "- **D03 c.md**：%s" % part.replace("2 处", "1 处").split("、")[0]]
    assert intake.review_items(findings) == ["D01 需求.md：" + part,
                                             "D03 c.md：" + part.replace("2 处", "1 处").split("、")[0]]


def test_every_row_says_whose_turn_the_step_where_and_since_when():
    """One judgment of whose turn it is (UI问题清单 #1), read by 待办, the badges, the overview's lanes and the board:
    each state carries who, the step, where it is taken and since when (the claim, the moment the session went idle,
    the question on the MR), never "now"."""
    lv = mod("lean_view")
    cfg = {"default_branch": "main", "rejected_label": "ai-handoff-rejected", "running_label": "ai-running",
           "handoff_label": "ai-handoff"}
    claim = {"owner": "alice", "title": "退款", "created_at": "2026-11-09T00:51:25Z"}

    def row_of(f, me="alice", **kw):
        f = dict({"key": "PAY-1", "owner": "alice", "claim": claim, "approvals": [], "park": None,
                  "stages": lv.stages(f.get("events") or [])}, **f)
        row = deliveries.base_row("r1", f)
        deliveries.classify(row, f, cfg=cfg, me=me, now=1794186500.0, **dict({"mr": None, "slot": None}, **kw))
        return row["state"], row["waits"]

    st, w = row_of({})
    assert (st, w["who"], w["do"], w["where"], w["text"]) == ("claimed", "you", "start", "app", "认领了，还没开工")
    assert w["since"] == lv.epoch("2026-11-09T00:51:25Z")
    _, w = row_of({}, me="bob")
    assert (w["who"], w["do"], w["text"]) == ("people", "start", "等 alice 开工")

    run = {"intent": "261109-pay-1-refund", "branch": "ai/alice/PAY-1-refund"}
    ev = [{"event": "STAGE_COMPLETED", "data": {"stage": "requirements"}, "ts": "2026-11-09T01:00:00Z", "_at": 1.0}]
    idle = {"busy": False, "awaiting": False, "last_activity": 1794186428.5}
    st, w = row_of({"run": run, "events": ev, "worktree": "/w"}, slot=idle)
    assert (st, w["who"], w["do"], w["where"], w["since"]) == ("local", "you", "reply", "session", 1794186428.5)
    assert w["text"] == "需求分析做完了，下一步是用户故事：在会话里让它接着做"
    _, w = row_of({"run": run, "events": ev, "worktree": "/w"}, slot=dict(idle, busy=True))
    assert (w["who"], w["do"], w["where"]) == ("agent", "none", None) and w["text"] == "AI 在做「用户故事」"
    approval = {"kind": "REQUIREMENTS", "state": "pending", "line": "approve REQUIREMENTS 1a2b3c4d", "at": 1794186000.0}
    _, w = row_of({"run": run, "approvals": [approval]}, slot=idle)
    assert (w["do"], w["where"], w["line"], w["since"]) == ("approve", "session", approval["line"], 1794186000.0)

    handed = dict(run, handoff={"local_head": "a" * 40})
    acc = {"state": "opened", "labels": ["ai-running"], "questions": [
        {"id": "D-3", "kind": "acceptance", "state": "open", "lean_request": "RELEASE 0c9a7e21", "at": "2026-11-09T02:00:00Z"}]}
    st, w = row_of({"run": handed}, mr=acc)
    assert (st, w["who"], w["do"], w["where"]) == ("acceptance", "product", "accept", "mr")
    assert w["text"] == "等产品在 MR 上验收 D-3（approve / reject）" and w["since"] == lv.epoch("2026-11-09T02:00:00Z")
    plan = {"state": "opened", "labels": [], "questions": [
        {"id": "D-4", "kind": "plan", "state": "open", "lean_request": "PLAN 5d1e7a90"}]}
    _, w = row_of({"run": handed, "park": {"status": "waiting", "kind": "plan", "ask": "owner"}}, mr=plan)
    assert (w["who"], w["do"], w["where"], w["text"]) == ("you", "answer", "mr", "等你在 MR 上回答 D-4（approve / reject）")

    merged = {"run": run, "merged": True, "merged_at": 1794186000.0,
              "decisions_text": "```brain-proposal\nfile: TECH\n---\n对账按自然日。\n```\n"}
    st, w = row_of(merged)
    assert (st, w["who"], w["do"], w["where"]) == ("merged", "you", "write_back", "app")
    assert w["text"] == "已合并，有 1 条新知识等你回写 Brain"
    _, w = row_of(merged, reflected=True)
    assert (w["who"], w["do"], w["since"]) == ("nobody", "watch", 1794186000.0) and "观察合并后的 14 天" in w["text"]


def test_todo_lists_what_waits_for_you_the_way_the_rows_say_it():
    """待办 is every row waiting for you (REST-1): an idle session (open it), a claim not started (开工); a question
    for the product is not yours. The badge counts the same items."""
    todo = mod("todo")

    def entry(key, who, do, state="local", text="t", session=None, since=None):
        row = {"repo": "r1", "key": key, "title": key, "state": state, "mr": None, "updated_at": 5.0,
               "waits": deliveries.waits(who, do, text, since=since)}
        return {"row": row, "facts": {}, "own": True, "has_session": bool(session), "can_post": False, "mr": None,
                "session": session}

    sess = {"slot": "s1", "title": "PAY-1", "url": "/chat?sid=s1"}
    got = todo.build([entry("PAY-1", "you", "reply", text="下一步是发布", session=sess, since=9.0),
                      entry("PAY-2", "you", "start", state="claimed", text="认领了，还没开工"),
                      entry("PAY-3", "product", "accept", state="acceptance"),
                      entry("PAY-4", "agent", "none"), entry("PAY-5", "people", "start", state="claimed")],
                     team=False, crew_rows=[])
    assert [(i["kind"], i["key"], i["text"]) for i in got["items"]] == [("reply", "PAY-1", "下一步是发布"),
                                                                      ("start", "PAY-2", "认领了，还没开工")]
    assert got["items"][0]["session"] == sess and got["items"][0]["since"] == 9.0 and got["items"][1]["since"] == 5.0
