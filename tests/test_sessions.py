"""The session runner (kept from the aidlc-team sample): a session the app opens, sends to, watches and cleans up."""

import asyncio
import itertools
import logging

from appkit import FakeGateway, GatewayError, mod

sessions = mod("sessions")


def make(tmp_path, gw=None):
    gw = gw or FakeGateway()
    return gw, sessions.SessionManager(gw, app="brain", state_file=tmp_path / "sessions.json",
                                       log=logging.getLogger("t"))


async def settle(mgr, gw, key, polls=3):
    for _ in range(polls):
        await mgr.poll()
    gw.finish(key)
    for _ in range(polls):
        await mgr.poll()


def test_a_role_session_is_opened_in_the_run_folder_sent_its_task_and_read_back(tmp_path):
    async def go():
        gw, mgr = make(tmp_path)
        gw.script = [[{"role": "tool", "content": "🔧 pwd", "meta": {"tool_name": "shell", "input": '{"command": "pwd"}'}},
                      {"role": "assistant", "content": "改好了\nDONE: 商品列表页写完", "meta": {"turn_stats": {"credits": 1.25}}}]]
        info = mgr.spawn_session("[aidlc-team run=r1 role=catalog]\n写页面", parent_session_key="aidlc-team:r1",
                                 cwd=str(tmp_path / "runs" / "r1" / "wt" / "catalog"), model="claude-sonnet-5.5",
                                 title="前端·商品列表 agent", folder="网上小店 · r1")
        assert sessions.agent_fields(info)["queued"] is True
        await asyncio.sleep(0)
        await asyncio.gather(*mgr._tasks)
        key = info.slot
        assert gw.slot_rows[key]["trust"] and gw.slot_rows[key]["project"].endswith("/wt/catalog")
        assert [c[1] for c in gw.calls if c[0] == "folder"] == [sessions.ROOT_FOLDER, "网上小店 · r1"]
        await settle(mgr, gw, key)
        f = sessions.agent_fields(mgr.get(info.id))
        assert f["done"] and f["outcome"] == "completed" and "DONE: 商品列表页写完" in f["result"]
        assert (f["tool_count"], f["last_tool"]) == (1, "Running pwd")
        assert mgr.credits_of(info.id) == 1.25 and mgr.recent(info.id)[0]["tool"] == "Running"
        assert (tmp_path / "sessions.json").exists()

    asyncio.run(go())


def test_a_role_boots_its_crew_member_or_the_template_of_that_name_and_its_knowledge_lookups_are_kept(tmp_path):
    async def go():
        gw, mgr = make(tmp_path)
        gw.absent = ("taoyuan-motion-agent",)
        gw.templates = {"aidlc-product-agent", "taoyuan-motion-agent"}  # Kiro Crew 0.8/0.9: templates named as members
        gw.script = [[{"role": "tool", "content": "🔧 Running: @kirocrew-core/local_knowledge_search",
                       "meta": {"tool_name": "local_knowledge_search", "mcp_server": "kirocrew-core",
                                "input": '{"query": "年会抽奖规则 RULE-1"}'}},
                      {"role": "assistant", "content": "DONE: 写好了需求", "meta": {}}]] * 2
        product = mgr.spawn_session("t", parent_session_key="aidlc-team:r9", cwd=str(tmp_path / "a" / "b" / "c"),
                                    title="产品 agent", agent="aidlc-product-agent")
        motion = mgr.spawn_session("t", parent_session_key="aidlc-team:r9", cwd=str(tmp_path / "a" / "b" / "d"),
                                   title="动效 agent", agent="taoyuan-motion-agent")
        await asyncio.sleep(0)
        await asyncio.gather(*mgr._tasks)
        asked = [c[1:] for c in gw.calls if c[0] == "agent"]
        assert ("aidlc-product-agent", "member") in asked and ("taoyuan-motion-agent", "template") in asked
        assert (product.agent_kind, motion.agent_kind) == ("member", "template")
        assert mgr.agent_of(motion.id) == {"name": "taoyuan-motion-agent", "kind": "template"}
        await settle(mgr, gw, product.slot)
        hits = mgr.knowledge_hits(product.id)
        assert [(h["tool"], h["detail"]) for h in hits] == [("查知识库", "年会抽奖规则 RULE-1")]

    asyncio.run(go())


def test_on_kiro_crew_0_11_a_role_boots_its_member_template(tmp_path):
    async def go():
        gw, mgr = make(tmp_path)
        gw.templates = {"aidlc-product-agent-template"}  # scripts/install-example.sh: <member>-template
        gw.script = [[{"role": "assistant", "content": "DONE: ok", "meta": {}}]]
        info = mgr.spawn_session("t", parent_session_key="aidlc-team:r9", cwd=str(tmp_path / "a" / "b" / "c"),
                                 title="产品 agent", agent="aidlc-product-agent")
        await asyncio.sleep(0)
        await asyncio.gather(*mgr._tasks)
        assert [c[1:] for c in gw.calls if c[0] == "agent"] == [("aidlc-product-agent-template", "template")]
        assert mgr.agent_of(info.id) == {"name": "aidlc-product-agent", "kind": "template"}

    asyncio.run(go())


def test_a_turn_kiro_crew_refused_to_start_is_sent_again(tmp_path):
    async def go():
        gw, mgr = make(tmp_path)
        gw.script = [[{"role": "error", "content": "Execution memory is unavailable", "meta": {"code": "memory_unavailable"}}],
                     [{"role": "assistant", "content": "DONE: ok", "meta": {}}]]
        info = mgr.spawn_session("t", parent_session_key="aidlc-team:r2", cwd=str(tmp_path / "a" / "b" / "c"), title="x")
        await asyncio.sleep(0)
        await asyncio.gather(*mgr._tasks)
        gw.finish(info.slot)
        await mgr.poll()  # the error row, nothing else: sent again
        assert [c[0] for c in gw.calls].count("send") == 2 and info.resends == 1
        await settle(mgr, gw, info.slot)
        assert info.done and info.error is None and "DONE: ok" in info.result

    asyncio.run(go())


def test_a_fix_round_continues_the_same_session_and_a_deleted_session_fails_the_turn(tmp_path):
    async def go():
        gw, mgr = make(tmp_path)
        first = mgr.spawn_session("t", parent_session_key="aidlc-team:r3", cwd=str(tmp_path / "a" / "b" / "c"), title="后端 agent")
        await asyncio.sleep(0)
        await asyncio.gather(*mgr._tasks)
        await settle(mgr, gw, first.slot)
        fix = await mgr.continue_conversation_async(first.id, "修 SEC-1", parent_session_key="aidlc-team:r3", cwd="", model=None)
        assert fix.slot == first.slot and fix.id != first.id and not fix.done
        assert sessions.find_agent(mgr, fix.id) is fix and mgr.slot_of(fix.id) == first.slot
        gw.slot_rows.pop(first.slot)
        for _ in range(sessions.MISSING_POLLS):
            await mgr.poll()
        assert fix.done and "找不到这个会话" in fix.error
        gone = await mgr.continue_conversation_async("s-nope", "x", parent_session_key="aidlc-team:r3", cwd="", model=None)
        assert gone.done and gone.error.startswith("conversation_gone")

    asyncio.run(go())


def test_state_survives_a_reload_and_cleanup_keeps_a_running_run(tmp_path):
    async def go():
        gw, mgr = make(tmp_path)
        a = mgr.spawn_session("t", parent_session_key="aidlc-team:old", cwd=str(tmp_path / "a" / "b" / "c"), title="a")
        b = mgr.spawn_session("t", parent_session_key="aidlc-team:live", cwd=str(tmp_path / "a" / "b" / "d"), title="b")
        await asyncio.sleep(0)
        await asyncio.gather(*mgr._tasks)
        await mgr.poll()
        _, again = make(tmp_path, gw)
        again.load()
        assert again.get(a.id).slot == a.slot and again.get(b.id).slot == b.slot
        done = await again.cleanup({"aidlc-team:live"})
        assert done == {"sessions": 1, "folders": 1} and a.slot not in gw.slot_rows and b.slot in gw.slot_rows
        assert [f["name"] for f in gw.folder_rows if f.get("hidden")] == ["aidlc-team:old"]  # the old run folder, not the live one
        assert again.get(a.id).slot is None and again.get(b.id).slot == b.slot

    asyncio.run(go())


def test_a_turn_cut_short_by_a_transient_model_error_or_a_hang_is_continued_in_the_same_session(tmp_path):
    async def go():
        clock = [1000.0]
        gw = FakeGateway()
        mgr = sessions.SessionManager(gw, app="brain", state_file=tmp_path / "sessions.json",
                                      log=logging.getLogger("t"), now=lambda: clock[0])
        tool = {"role": "tool", "content": "🔧 cat a.js", "meta": {"tool_name": "shell", "input": '{"command": "cat a.js"}'}}
        gw.script = [[tool, {"role": "error", "content": "❌ The model backend hit a transient error (HTTP 5xx).", "meta": {}}],
                     [tool, {"role": "assistant", "content": "DONE: 测试写完", "meta": {}}]]
        info = mgr.spawn_session("写测试", parent_session_key="aidlc-team:r7", cwd=str(tmp_path / "a" / "b" / "c"), title="测试 agent")
        await asyncio.sleep(0)
        await asyncio.gather(*mgr._tasks)
        gw.finish(info.slot)
        await mgr.poll()  # worked a while, then the backend failed: told to carry on, not failed
        assert info.nudges == 1 and not info.done and "接着做" in info.last_tool
        assert "你上一轮被中断了" in gw.msgs[info.slot][-1]["content"]
        await settle(mgr, gw, info.slot)
        assert info.done and info.error is None and "DONE: 测试写完" in info.result

        # a hang: busy and nothing new for STUCK_S: stopped, then continued
        gw.script = [[tool], [{"role": "assistant", "content": "DONE: 好了", "meta": {}}]]
        hung = mgr.spawn_session("写页面", parent_session_key="aidlc-team:r7", cwd=str(tmp_path / "a" / "b" / "d"), title="前端 agent")
        await asyncio.sleep(0)
        await asyncio.gather(*mgr._tasks)
        await mgr.poll()
        clock[0] += sessions.STUCK_S + 5
        await mgr.poll()
        assert ("stop", hung.slot) in gw.calls and hung.nudges == 1 and not hung.done
        await settle(mgr, gw, hung.slot)
        assert hung.done and "DONE: 好了" in hung.result

    asyncio.run(go())


# ---- what the Brain app added ------------------------------------------------------------------------------ #

def test_a_strict_session_boots_exactly_its_template_or_fails(tmp_path):
    async def go():
        gw, mgr = make(tmp_path)
        gw.templates = set()
        info = await mgr.open_session("开工", parent_session_key="brain:r1-PAY-1", cwd=str(tmp_path), title="PAY-1 · 本地开发",
                                      folder="PAY-1 · refund", agent="brain-dev", strict_agent=True, root_folder="Brain 需求",
                                      project_dir=str(tmp_path), kind="local", key="r1-PAY-1")
        assert info.done and "brain-dev" in info.error and not gw.slot_rows
        assert not [c for c in gw.calls if c[0] == "agent" and c[2] != "template"]  # no fallback to Crew's default
        gw.templates = {"brain-dev"}
        ok = await mgr.open_session("开工", parent_session_key="brain:r1-PAY-2", cwd=str(tmp_path), title="t",
                                    folder="PAY-2 · x", agent="brain-dev", strict_agent=True, project_dir=str(tmp_path),
                                    trust_ok=False, kind="local", key="r1-PAY-2")
        assert ok.slot and ok.agent_kind == "template" and "trust" not in gw.slot_rows[ok.slot]
        folder = next(f for f in gw.folder_rows if f["name"] == "PAY-2 · x")
        assert folder["project_dir"] == str(tmp_path)

    asyncio.run(go())


def test_the_bridge_surface_keeps_its_slot_name_and_send_id_and_never_resends(tmp_path):
    async def go():
        gw, mgr = make(tmp_path)
        await mgr.adapter_create("run-pay-1-1", agent="brain-run", model="claude-opus-5.5", memory_mode="incognito",
                                 title="RUN-PAY-1-1 · 运行机", folder="RUN-PAY-1-1", parent="brain-run:RUN-PAY-1-1",
                                 key="RUN-PAY-1-1", root_folder="Brain 运行机")
        assert "run-pay-1-1" in gw.slot_rows and ("agent", "brain-run", "template") in gw.calls
        await mgr.adapter_set_project("run-pay-1-1", str(tmp_path))
        assert gw.slot_rows["run-pay-1-1"]["trust"] and gw.slot_rows["run-pay-1-1"]["project"] == str(tmp_path)
        gw.script = [[{"role": "error", "content": "Execution memory is unavailable", "meta": {"code": "memory_unavailable"}}]]
        await mgr.adapter_send("run-pay-1-1", "接手合同 V-0123456789", "V-0123456789")
        assert ("send", "run-pay-1-1", "V-0123456789") in gw.calls
        gw.finish("run-pay-1-1")
        for _ in range(4):
            await mgr.poll()
        assert [c[0] for c in gw.calls].count("send") == 1  # deliver once: no automatic resend
        try:
            await mgr.adapter_create("run-pay-1-1", agent="brain-run", model="", memory_mode="incognito", title="t",
                                     folder="f", parent="p", key="k", root_folder="Brain 运行机")
            raise AssertionError("a second create must fail")
        except GatewayError:
            pass
        await mgr.adapter_stop("run-pay-1-1")
        assert ("stop", "run-pay-1-1") in gw.calls

    asyncio.run(go())


def test_slot_stats_sum_credits_over_the_whole_transcript(tmp_path):
    async def go():
        gw, mgr = make(tmp_path)
        gw.templates = {"brain-dev"}
        info = await mgr.open_session("开工", parent_session_key="brain:r1-PAY-1", cwd=str(tmp_path), title="t",
                                      folder="PAY-1 · x", agent="brain-dev", strict_agent=True, nudge_ok=False,
                                      kind="local", key="r1-PAY-1")
        gw.finish(info.slot)
        gw.msgs[info.slot] += [{"role": "user", "content": "我自己打的", "meta": {}},
                               {"role": "assistant", "content": "a", "meta": {"turn_stats": {"credits": 2.5}}, "ts": "2026-11-08T10:05:00Z"},
                               {"role": "assistant", "content": "b", "meta": {"turn_stats": {"credits": 1.0}}}]
        for _ in range(sessions.STATS_EVERY + 1):
            await mgr.poll()
        st = mgr.slot_stats(info.slot)
        assert st["credits"] == 3.5 and st["turns"] == 3 and st["busy"] is False
        assert mgr.credits_by_key() == {"r1-PAY-1": 3.5}

    asyncio.run(go())
