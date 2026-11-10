"""brain-kit 0d52e97 (QA rounds 3 and 4, and the split's words), pure: the bridge's new MR notes read back on a
person's machine (a held reply, a delivery not known, the run's own notes: runnerd silent, sends that keep failing, the
acceptance question held until the pipeline is green …), what the rows say with them (and not after a newer push),
the ledger's notices and outbox in team mode, the 运行机 config and the runner's hook rows, the hook adapter version 3 and
its refusals in plain Chinese, eval's batch states and families. The strings are brain-kit 0d52e97's own (handoff.py,
decisions.py, delivery.py, cli.py, kit/.kiro/brain/lean-hook.py, evaluate.py)."""

import pytest

from appkit import BRAINKIT, mod
from brainfix import needs_brainkit

mrinfo, deliveries, bk, problems = mod("mrinfo"), mod("deliveries"), mod("bk"), mod("problems")
SHA = "a1b2c3d4e5f6" + "0" * 28
RUN = "RUN-PAY-3-1"


def note(i, body, who="brain-bridge", at=None):
    return {"id": i, "body": body, "author": {"username": who}, "created_at": at or "2026-11-09T10:%02d:00Z" % i}


@pytest.fixture
def decisions():
    if not bk.load(str(BRAINKIT))["ok"]:
        pytest.skip("brain-kit checkout not found")
    return bk.m("bridge.decisions")


def ask(decisions, did, park, who, kind="clarify"):
    return decisions.question_text(did, RUN, park, who, kind, SHA, "f" * 64)


CLARIFY = {"question": "要不要人工审核？", "options": [{"id": "A", "text": "要"}, {"id": "B", "text": "不要"}]}


def chinese_row(r):
    assert set(r) == {"level", "text", "todo", "fix", "repo", "raw"}, r
    assert problems.chinese(r["text"]) or len(problems.WORD_RE.findall(r["text"])) <= 3, r["text"]
    return r


# ---- the bridge's notes on a person's machine --------------------------------------------------------------------- #

@needs_brainkit
def test_the_new_notes_are_read_by_their_first_words(decisions):
    notes = [
        note(1, "AI 已接手：%s，凭证 V-0123456789，从 abc 继续。" % RUN),
        note(2, "%s 在排队：shop/shop-pay 已经有 2 个 run 在跑（上限 2），有空位后桥自动开始，不用做什么。" % RUN),
        note(3, ask(decisions, "D-1", CLARIFY, ["alice"])),
        note(4, "answer D-1 B", "alice"),
        note(5, "D-1：GitLab 现在查不到回复有没有被别人改过，回答先等着（不算，也不会丢）。GitLab 恢复后桥会自动核对，没被改过的回答照常送出，不用重新回复。"),
        note(6, ask(decisions, "D-2", CLARIFY, ["alice"])),
        note(7, "D-2 收到了回答，但桥这一轮没能把签好的回答存进 brain-intake，回答还没有送回 run。桥修好后会自动送出，不用重新回答。"),
        note(8, ask(decisions, "D-3", CLARIFY, ["alice"])),
        note(9, "D-3 的回答（凭证 V-abcdef0123）不知道送到 run 没有：KiroCrew 出错（502）。不用重新回答：桥每轮看一下 KiroCrew 会话 "
                "run-pay-3-1，确认没送到就用同一个凭证再送一次，送到了就在这里说「已收到」；看不了会话的话，请负责人在 KiroCrew 里看一下它。"),
        note(10, ask(decisions, "D-4", CLARIFY, ["alice"])),
        note(11, "D-4 作废：回答（凭证 V-1111111111）还没送到 run，分支就有了新推送，这个回答不再送了。run 还要问的话会在新提交上重新提问，到时请回答新的问题。"),
        note(12, "%s：桥把消息 V-2222222222（接手消息）送了 3 次，KiroCrew 会话 run-pay-3-1 里都没有（KiroCrew 出错）。桥会接着重送"
                 "（先每轮一次，送过 10 次以后每 5 分钟一次），KiroCrew 好了就送到；KiroCrew 一直不收的话，60 分钟以后这个 run 就算没能开始，"
                 "到时这里会说怎么重新交接。一直不行的话请负责人看一下 KiroCrew。" % RUN),
    ]
    got = mrinfo.parse_notes(notes, bridge_user="brain-bridge")
    qs = {q["id"]: q for q in got["questions"]}
    assert qs["D-1"]["state"] == "held" and qs["D-2"]["state"] == "answered", qs
    assert (qs["D-3"]["state"], qs["D-3"]["voucher_id"]) == ("delivery_unknown", "V-abcdef0123")
    assert qs["D-4"]["state"] == "stale"
    assert (qs["D-1"]["sha"], qs["D-1"]["park"]) == (SHA[:12], "f" * 12)
    r = got["runner"]
    assert r["kind"] == "gaveup" and r["text"].startswith("桥送了 3 次消息，运行机的会话一直没收到") and r["raw"].startswith(RUN)
    # each of the run's own notes, alone
    for body, kind, words in (
            ("%s 还没开始：运行机（brain-runnerd）90 分钟里没有准备好工作区，也没有报错，可能没在运行。桥接着等，运行机准备好以后自动开始，不用重新交接；"
             "请负责人看一下 brain-runnerd（比如 `systemctl status brain-runnerd` 和它的 runnerd.json）。" % RUN, "runnerd_silent",
             "运行机 90 分钟没准备好工作区"),
            ("%s 的工作区还没建成：运行机这几次都没做成（git fetch 超时）。桥已经请运行机过一会儿再试，不用做什么；还不行的话这里会再说。" % RUN,
             "runnerd_retry", "运行机建工作区没成"),
            ("%s 的验收问题（提交 a1b2c3d4e5f6）在等 MR 的流水线 #77 跑完（现在是 running，等了 60 分钟以上）。通过以后桥自动发出验收问题；"
             "流水线一直不动的话请看一下。" % RUN, "ci_wait", "验收问题等流水线 #77 跑完才发"),
            ("%s 的验收问题（提交 a1b2c3d4e5f6）等 MR 的流水线通过才发：流水线 #78 现在是 manual，要有人处理（重新运行，或者跑完手动的 job）。"
             "通过以后桥自动发出验收问题，不用别的操作。" % RUN, "ci_person", "流水线 #78 是 manual"),
            ("%s 的验收问题（提交 a1b2c3d4e5f6）没有发：流水线 #79 没过，run 已经收到过 6 次 CI 失败，桥不再转给它。请负责人看一下。" % RUN,
             "ci_red", "验收问题没发：流水线 #79 没过"),
            ("%s 的问题（提交 a1b2c3d4e5f6 的 park.json）现在发不出：没有人被配置为可以回答「设计」类决策（kit.json decision_roles / "
             "brain-authz roles）。配好以后桥会自动发出这个问题。" % RUN, "nobody", "没人能回答「设计」类决定"),
            ("%s 的接手消息不知道送到没有：KiroCrew 出错（timeout）。桥每轮看一下 KiroCrew 会话 run-pay-3-1：确认没送到就用同一个 sendId 再送一次"
             "，送到了就照常继续；看不了会话的话，请负责人在 KiroCrew 里看一下它。" % RUN, "send_unknown", "接手消息送没送到不清楚"),
            ("%s 还没开始：KiroCrew 开会话失败（409 agent_choice_unavailable）。桥每轮重试；一直不行的话请负责人看一下 KiroCrew 和 agent brain-run。"
             % RUN, "setup", "运行机开会话失败")):
        r = mrinfo.parse_notes([note(1, body)])["runner"]
        assert r and r["kind"] == kind and words in r["text"], (kind, r)
    # the run could not start: brain-kit labels it rejected, and the reason is this note's
    failed = mrinfo.parse_notes([note(1, "%s 没能开始：运行机建工作区失败（disk full）。处理好以后在分支上重新运行 `brain handoff`（它提交交接、"
                                         "推送并打标签），桥会重新接手。" % RUN)])
    assert failed["runner"]["kind"] == "failed" and failed["rejected_reason"] == \
        "运行机没能开始：运行机建工作区失败（disk full）。处理好以后在分支上重新 brain handoff"
    # a new hand-over taken starts over: no runner note from before it
    assert mrinfo.parse_notes(notes[1:2] + notes[:1])["runner"] is None


CFG = {"handoff_label": "ai-handoff", "running_label": "ai-running", "rejected_label": "ai-rejected"}


def facts(park=None, tip_at=1794146400, **run):
    r = dict({"key": "PAY-3", "owner": "alice", "branch": "ai/alice/PAY-3-x", "intent": "261107-x",
              "handoff": {"requested_at": "2026-11-08T10:00:00Z", "by": "alice"}}, **run)
    return {"key": "PAY-3", "run": r, "park": park, "park_sha": ("f" * 64) if park else None, "claim": {}, "approvals": [],
            "tip_at": tip_at, "worktree": None, "merged": False, "branch": r["branch"]}


def classified(f, mr):
    row = deliveries.base_row("r1", f)
    deliveries.classify(row, f, mr=mr, slot=None, cfg=CFG)
    return row


@needs_brainkit
def test_the_rows_say_what_the_new_notes_say_and_not_after_a_newer_push(decisions):
    waiting = {"status": "waiting", "kind": "clarify"}
    q = {"id": "D-1", "state": "delivered", "park": "f" * 12, "kind": "clarify", "options": []}
    row = classified(facts(waiting), {"state": "opened", "labels": ["ai-running"], "questions": [q]})
    assert (row["state"], row["waits"]["who"]) == ("parked", "runner") and \
        row["waits"]["text"] == "D-1 的回答送到了，run 还没接着做：去 KiroCrew 看它的会话", row
    held = dict(q, state="held")
    row = classified(facts(waiting), {"state": "opened", "labels": [], "questions": [held]})
    assert row["waits"]["who"] == "bridge" and "不用重新回复" in row["waits"]["text"]
    ci = {"kind": "ci_wait", "text": "验收问题等流水线 #77 跑完才发（通过以后桥自动发）", "raw": RUN + " …", "at": "2026-11-08T15:00:00Z"}
    row = classified(facts(), {"state": "opened", "labels": ["ai-running"], "questions": [], "runner": ci})
    assert (row["state"], row["waits"]["text"]) == ("running", ci["text"]) and row["waits"]["raw"] == ci["raw"]
    newer = classified(facts(tip_at=1794146400 + 7200), {"state": "opened", "labels": ["ai-running"], "questions": [],
                                                         "runner": ci})
    assert newer["waits"]["text"] == "运行机在跑"           # pushed after the note: the run went on
    silent = {"kind": "runnerd_silent", "text": "运行机 90 分钟没准备好工作区，也没报错：请运行机负责人看一下 brain-runnerd（桥接着等，不用重新交接）",
              "raw": "", "at": "2026-11-08T15:00:00Z"}
    row = classified(facts(), {"state": "opened", "labels": ["ai-handoff"], "questions": [], "runner": silent})
    assert (row["state"], row["waits"]["who"]) == ("handed_over", "people") and row["waits"]["text"] == silent["text"]
    failed = {"kind": "failed", "text": "运行机没能开始：disk full。处理好以后在分支上重新 brain handoff", "raw": "x",
              "at": "2026-11-08T15:00:00Z"}
    row = classified(facts(), {"state": "opened", "labels": ["ai-rejected"], "questions": [], "runner": failed,
                               "rejected_reason": failed["text"]})
    assert row["state"] == "rejected" and row["waits"]["text"] == failed["text"]


def test_team_mode_reads_the_ledgers_notices_and_outbox():
    service = mod("service")
    notices = [{"key": "ciheld:%s:%s" % (RUN, SHA), "run_id": RUN, "state": "counting", "updated": "2026-11-09T10:00:00Z"},
               {"key": "runnerd-silent:RUN-PAY-4-1", "run_id": "RUN-PAY-4-1", "state": "told", "updated": "2026-11-09T09:00:00Z"},
               {"key": "gaveup:V-9999999999", "run_id": "RUN-PAY-5-1", "state": "told"},
               {"key": "reply:1234", "run_id": RUN, "state": "told"},
               {"key": "ciheld-wait:RUN-PAY-6-1:a1b2c3d4e5f6", "run_id": "RUN-PAY-6-1", "state": "told"}]
    outbox = [{"send_id": "V-9999999999", "run_id": "RUN-PAY-5-1", "what": "handover:RUN-PAY-5-1", "state": "sent", "tries": 4},
              {"send_id": "N-1", "run_id": RUN, "what": "answer:D-2", "state": "unknown", "tries": 2},
              {"send_id": "N-2", "run_id": "RUN-PAY-4-1", "what": "handover:RUN-PAY-4-1", "state": "dropped", "tries": 3}]
    by = service.notices_by_run(notices, outbox)
    assert [n["kind"] for n in by[RUN]] == ["ci_wait", "outbox_unknown"], by
    assert by[RUN][1]["text"].startswith("D-2 的回答不知道送到会话没有（送过 2 次）")
    assert "RUN-PAY-5-1" not in by                         # gave up, then it landed: nothing to say
    assert "RUN-PAY-6-1" not in by                         # a wait told about a pipeline that is no longer held
    assert [n["kind"] for n in by["RUN-PAY-4-1"]] == ["runnerd_silent", "outbox_dropped"]
    row = deliveries.base_row("runner", {"key": "PAY-3"})
    deliveries.team_classify(row, {"run_id": RUN, "state": "dispatched"}, [], None, notes=by[RUN])
    assert (row["state"], row["waits"]["text"]) == ("running", "验收问题等 MR 的流水线通过才发（通过以后桥自动发）")
    row = deliveries.base_row("runner", {"key": "PAY-4"})
    deliveries.team_classify(row, {"run_id": "RUN-PAY-4-1", "state": "spooled"}, [], None, notes=by["RUN-PAY-4-1"])
    assert (row["state"], row["waits"]["who"]) == ("handed_over", "people") and "brain-runnerd" in row["waits"]["text"]
    row = deliveries.base_row("runner", {"key": "PAY-7"})
    deliveries.team_classify(row, {"run_id": "RUN-PAY-7-1", "state": "failed"}, [], None)
    assert row["state"] == "rejected" and row["waits"]["text"].startswith("没能开始")
    row = deliveries.base_row("runner", {"key": "PAY-8"})
    d = {"id": "D-1", "run_id": "RUN-PAY-8-1", "state": "delivered", "kind": "clarify", "sha": None}
    deliveries.team_classify(row, {"run_id": "RUN-PAY-8-1", "state": "dispatched"}, [d], {"status": "waiting"})
    assert (row["state"], row["waits"]["who"]) == ("parked", "runner") and "run 还没接着做" in row["waits"]["text"]


@needs_brainkit
def test_the_runner_page_shows_the_settings_and_the_runners_hooks(tmp_path):
    assert bk.load(str(BRAINKIT))["ok"]
    rt = mod("team.bridgehost").TeamRuntime({"bridge_config": "", "runnerd_config": ""}, None, None, None)
    rt.cfg = {"interval": 30, "send_give_up_minutes": "45", "runnerd_wait_minutes": True, "edit_check_rounds": 0}
    rt.runnerd_cfg = {"kit_dir": str(BRAINKIT), "agent_spec": "", "git_timeout": 120}
    rows = {(r["file"], r["key"]): r for r in rt.config_view()}
    assert rows[("bridge.json", "interval")]["value"] == "30 秒" and not rows[("bridge.json", "interval")]["default"]
    assert rows[("bridge.json", "send_give_up_minutes")]["value"] == "45 分钟"
    assert rows[("bridge.json", "runnerd_wait_minutes")] == dict(rows[("bridge.json", "runnerd_wait_minutes")],
                                                                 value="90 分钟", default=True)   # a bool is no number
    assert (rows[("bridge.json", "edit_check_rounds")]["value"], rows[("bridge.json", "edit_check_rounds")]["default"]) == ("3", True)
    assert rows[("bridge.json", "acceptance_ci_wait_minutes")]["value"] == "60 分钟"
    assert rows[("runnerd.json", "kit_dir")]["value"] == str(BRAINKIT) and rows[("runnerd.json", "agent_spec")]["default"]
    assert rows[("runnerd.json", "hook_path")]["value"] == "/usr/bin:/bin" and rows[("runnerd.json", "git_timeout")]["value"] == "120 秒"
    assert all(r["text"] for r in rows.values())
    cli = bk.m("cli")
    if not hasattr(cli, "runner_hook_problems"):
        assert rt.hook_rows() == []
        return
    ok = rt.hook_rows()
    assert [r["level"] for r in ok] == ["OK"] and ("第 %d 版" % cli.CREW_HOOK_VERSION) in ok[0]["text"]
    rt.runnerd_cfg = {"kit_dir": str(tmp_path), "agent_spec": str(tmp_path / "brain-run.json")}
    bad = [chinese_row(r) for r in rt.hook_rows()]
    assert bad[0]["level"] == "FAIL" and bad[0]["text"] == "运行机装的 brain-kit 里没有 hook 适配器" and bad[0]["todo"]


# ---- the hook adapter, version 3 ----------------------------------------------------------------------------------- #

ADAPTER = ".kiro/brain/lean-hook.py"
OLDER_V3 = ("%s is an older adapter (version 2, needs 3): it does not refuse tool calls after the kit's own files (.kiro/, "
            ".brain/kit.json, gates/) were changed; run `brain install` and commit it on main through an MR" % ADAPTER)
OLDER_V0 = ("%s is an older adapter (version 0, needs 3): it does not refuse tool calls after the kit's own files (.kiro/, "
            ".brain/kit.json, gates/) were changed, and the team runner could not write runs/<KEY>/park.json, its only way "
            "to ask a person, before the Lean approvals; run `brain install` and commit it on main through an MR" % ADAPTER)


def test_the_version_3_adapter_rows_say_what_is_missing_and_install_it():
    team = chinese_row(problems.row("FAIL", OLDER_V3, repo="/w/pay", team=True))
    assert team["text"] == ".kiro/brain/lean-hook.py 是旧版（第 2 版，要第 3 版）" and team["fix"] == "kit"
    assert "不拦工具调用" in team["todo"] and "park.json" not in team["todo"] and "修复" in team["todo"]
    local = chinese_row(problems.row("FAIL", OLDER_V0, repo="/w/pay", team=False))
    assert local["level"] == "WARN" and local["todo"].startswith("只有把需求交给运行机时才要紧") and "第 3 版" in local["todo"]
    v0 = chinese_row(problems.row("FAIL", OLDER_V0, repo="/w/pay", team=True))
    assert "不拦工具调用" in v0["todo"] and "park.json" in v0["todo"]
    ok = chinese_row(problems.row("OK", "%s lets a run write its own runs/<KEY>/park.json whatever Lean's approvals, and "
                                        "refuses tool calls while the kit's own files differ from the commit (version 3)" % ADAPTER))
    assert ok["text"] == ".kiro/brain/lean-hook.py 是新版（第 3 版）"


@pytest.mark.parametrize("raw, text, todo", [
    ("the installed brain-kit (/opt/brain-kit) has no hook adapter /opt/brain-kit/kit/.kiro/brain/lean-hook.py: a runner "
     "session's hooks could not run Lean", "运行机装的 brain-kit 里没有 hook 适配器", "kit_dir"),
    ("the installed brain-kit's hook adapter /opt/brain-kit/kit/.kiro/brain/lean-hook.py is version 2, needs 3: update "
     "brain-kit on the runner", "运行机的 brain-kit 带的 hook 适配器是旧版（第 2 版，要第 3 版）", "更新 brain-kit"),
    ("the runner's agent spec /home/brainbot/.kiro/agents/brain-run.json cannot be read: [Errno 2] No such file",
     "读不了运行机的 agent 文件 /home/brainbot/.kiro/agents/brain-run.json", "agent_spec"),
    ("/home/brainbot/.kiro/agents/brain-run.json has no preToolUse hook running Lean's PreToolUse",
     "/home/brainbot/.kiro/agents/brain-run.json 没有跑 Lean 的「调用工具前」hook", "brain-run.json"),
    ("/home/brainbot/.kiro/agents/brain-run.json: the preToolUse hook `python3 -I /opt/brain-kit/kit/.kiro/brain/lean-hook.py "
     "--runner /etc/brain-kit/runnerd.json PreToolUse` does not name its Python by an absolute path",
     "/home/brainbot/.kiro/agents/brain-run.json 的「调用工具前」hook 不对：Python 没写绝对路径", "brain-run.json"),
    ("/home/brainbot/.kiro/agents/brain-run.json: the preToolUse hook `/usr/bin/python3 -I /opt/brain-kit/kit/.kiro/brain/"
     "lean-hook.py --runner /etc/brain-kit/runnerd.json PreToolUse` has matcher 'fs_write': tool calls it does not match "
     "pass Lean by", "/home/brainbot/.kiro/agents/brain-run.json 的「调用工具前」hook 不对：匹配不是 *：有的工具调用绕过了 Lean", "brain-run.json"),
    ("[brain-kit] blocked (kit file): .kiro/agents/brain-dev.md is one of the kit's own files (.kiro/brain/, .kiro/agents/, "
     ".kiro/hooks/, .kiro/aidlc-lean/, .brain/kit.json, gates/): a session may not change it. People change these through a "
     "merge request to the default branch.", "hook 拦下了一次改 kit 文件的调用（.kiro/agents/brain-dev.md）", "MR"),
    ("[brain-kit] blocked (kit file): the target of this tool call could not be checked (bad path).",
     "hook 拦下了一次工具调用：看不清它要改哪个文件", "只拦这一次"),
    ("[brain-kit] blocked (kit files changed): the kit's own files are not those of HEAD (14d33740d912): .kiro/agents/evil.md "
     "(added); gates/risk-paths (added). They decide what this session may do (AI-DLC Lean, its hooks, the agent specs, this "
     "adapter, .brain/kit.json, gates/), so the session may not change them. A person has to restore them (git checkout HEAD -- "
     "<path>, delete what was added; or, if a person changed them on purpose, commit them). Until then every tool call is "
     "refused and nothing said in this chat reaches AI-DLC Lean (approvals in it are not recorded). Stop and say so.",
     "会话被锁住了：kit 自己的文件和 HEAD (14d33740d912) 不一样（.kiro/agents/evil.md (added); gates/risk-paths (added)）", "git checkout HEAD"),
    ("[brain-kit] blocked (kit files not checked): the kit's own files could not be checked: no AI-DLC Lean "
     "(.kiro/aidlc-lean/aidlc_lean.py) in /w or above it in this repository. Until they can, every tool call is refused and "
     "nothing said in this chat reaches AI-DLC Lean. A person has to look at it; stop and say so.",
     "会话被锁住了：查不了 kit 自己的文件", "要人看一下"),
])
def test_the_runner_hook_checks_and_the_adapters_refusals_in_plain_chinese(raw, text, todo):
    r = chinese_row(problems.row("FAIL", raw))
    assert r["text"] == text and todo in r["todo"] and r["raw"] == " ".join(raw.split()), r


# ---- eval: the batch's states and the families ---------------------------------------------------------------------- #

def test_eval_batch_states_and_families_reach_the_numbers():
    trace = lambda key, handed, **kw: dict({"key": key, "outcome": {"handed_over": {"value": handed}, "merged_at": {"value": None}},
                                            "humans": [], "cost": {}}, **kw)
    data = {"traces": [trace("PAY-8", True), trace("PAY-9", True), trace("PAY-2", False, family={"role": "child", "parent": "PAY-1"}),
                       trace("PAY-6", True), trace("PAY-3", False)],
            "autonomy": {"value": [0, 0], "runs": []},
            "batch": [{"key": "PAY-8", "state": "failed", "stuck": False, "handed_over": True, "autonomous": False,
                       "beyond": ["runner_failed"], "delivery": "open"},
                      {"key": "PAY-9", "state": "closed", "handed_over": True, "autonomous": False,
                       "beyond": ["push_after_handover code", "closed_unmerged"], "delivery": "closed"},
                      {"key": "PAY-2", "parent": "PAY-1", "state": "merged_into_parent", "stuck": False, "handed_over": False,
                       "autonomous": None, "beyond": [], "delivery": "open"},
                      {"key": "PAY-6", "state": "answered", "stuck": True, "handed_over": True, "autonomous": None, "beyond": [],
                       "delivery": "open"}],
            "families": [{"key": "PAY-1", "children": ["PAY-2", "PAY-3"], "merged": 1, "total": 2, "state": "in_progress",
                          "judgment": [2, 1], "questions": 0, "credits": 4.5}]}
    runs = {r["key"]: r for r in deliveries.cto_part(data)["runs"]}
    assert (runs["PAY-8"]["how"], runs["PAY-8"]["beyond"], runs["PAY-8"]["state_label"]) == ("ended", ["运行机没能开始"], "运行机失败")
    assert runs["PAY-9"]["how"] == "ended" and runs["PAY-9"]["beyond"] == ["MR 关了没合并", "交接后推代码"]
    assert runs["PAY-9"]["delivery_label"] == "没合并"
    assert (runs["PAY-2"]["how"], runs["PAY-2"]["parent"], runs["PAY-2"]["state_label"]) == ("local", "PAY-1", "已合进大需求")
    assert (runs["PAY-6"]["state_label"], runs["PAY-6"]["stuck"]) == ("有了回答、run 没接着做", True)
    assert runs["PAY-3"]["how"] == "pending"      # being built on this machine, not merged: not judged, not 本机做完
    fam = deliveries.family_rows(data)
    assert fam == [{"key": "PAY-1", "repo": "", "children": ["PAY-2", "PAY-3"], "merged": 1, "total": 2,
                    "not_started": [], "closed": [],
                    "state": "in_progress", "state_label": "小需求在做", "at_points": 2, "outside": 1, "questions": 0,
                    "credits": 4.5}]
    weekly = deliveries.cto_numbers([("r1", deliveries.cto_part(data))], [], available=True, now=1794146400)["weekly"]
    assert all(set(w) == {"week", "unattended", "people", "local", "pending"} for w in weekly)   # 'ended' is never merged


def test_the_timeline_says_a_bridge_decisions_state_and_commit_and_the_runs_on_another_branch():
    """brain-kit 0d52e97 trace: decisions[].sha (the MR head the bridge asked at) and other_runs (rule H0: this key's
    runs on another branch, not read into this trace), in words on 需求详情."""
    detail = mod("detail")
    t = {"decisions": [{"id": "D-2", "source": "bridge", "state": "delivered", "choice": "B", "who": "carol",
                        "at": "2026-11-09T10:00:00Z", "sha": SHA, "src": ["bridge ledger decisions"]},
                       {"id": "D-3", "source": "bridge", "state": "a_new_state", "choice": None, "who": None,
                        "asked_at": "2026-11-09T11:00:00Z", "sha": None, "src": []}],
         "other_runs": [{"run_id": "RUN-PAY-3-1", "branch": "ai/alice/PAY-3-old", "state": "closed", "src": "ledger"},
                        {"run_id": "RUN-PAY-3-2", "branch": None, "state": None, "src": "vouchers"}, "junk"]}
    items = {i["label"]: i for i in detail.trace_timeline(t) if i["kind"] == "decision"}
    assert items["D-2 已送回"]["detail"] == "B · 问在提交 a1b2c3d4e5f6" and items["D-2 已送回"]["who"] == "carol"
    assert items["D-3 a_new_state"]["detail"] is None             # a state brain-kit adds later: as it is
    assert detail.other_runs(t) == ["RUN-PAY-3-1（ai/alice/PAY-3-old，已关闭）", "RUN-PAY-3-2（分支认不出，桥上没有它的状态）"]
    assert detail.other_runs({}) == []


def test_families_count_as_intent_list_does_and_a_claim_closed_small_one_says_so():
    """brain-kit 1238919 (R1-89): a family's total is the small ones not closed (not started included), not_started and
    closed name them; a small one whose claim was closed is state closed with closed_by "claim": 需求关了, not MR 关了."""
    data = {"traces": [{"key": "PAY-4", "outcome": {"handed_over": {"value": False}, "merged_at": {"value": None}},
                        "humans": [], "cost": {}, "family": {"role": "child", "parent": "PAY-1"}}],
            "autonomy": {"runs": []},
            "batch": [{"key": "PAY-4", "state": "closed", "closed_by": "claim", "parent": "PAY-1", "delivery": "closed"}],
            "families": [{"key": "PAY-1", "children": ["PAY-2", "PAY-3", "PAY-4"], "merged": 1, "total": 2,
                          "not_started": ["PAY-3"], "closed": ["PAY-4"], "state": "in_progress", "judgment": [0, 0]}]}
    fam = deliveries.family_rows(data)[0]
    assert (fam["merged"], fam["total"], fam["not_started"], fam["closed"]) == (1, 2, ["PAY-3"], ["PAY-4"])
    run = {r["key"]: r for r in deliveries.cto_part(data)["runs"]}["PAY-4"]
    assert run["state_label"] == "需求关了（没合并）"
