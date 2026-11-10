"""交付总览 and 需求详情 on real brain-kit projects: claimed, local (with a pending Lean approval), handed over,
merged; overlaps; the approval line is shown, never sent."""

import json

from brainfix import (install_brain_dev, lean, make_project, make_service, needs_brainkit, request_requirements, run,
                      sh, start_in_worktree, brain)

pytestmark = needs_brainkit


def rows_by_key(view):
    return {r["key"]: r for r in view["rows"]}


def test_every_requirement_shows_where_it_is_and_what_it_waits_on(tmp_path, home):
    repo = make_project(tmp_path)
    wt_root = home / "workplace" / "brain-app" / "pay"
    wt1 = start_in_worktree(repo, wt_root / "refund", "refund", "退款", "--paths", "src/pay")
    line = request_requirements(wt1, "261108-pay-1-refund") if (wt1 / "aidlc-docs" / "261108-pay-1-refund").exists() else None
    intent1 = json.loads((wt1 / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    if line is None:
        line = request_requirements(wt1, intent1)
    wt2 = start_in_worktree(repo, wt_root / "report", "report", "对账报表", "--paths", "src/pay/report,src/ui")
    brain(repo, "claim", "--title", "只认领")
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            return await svc.overview("all")
        finally:
            await svc.stop()

    view = run(go())
    rows = rows_by_key(view)
    assert set(rows) == {"PAY-1", "PAY-2", "PAY-3"}
    one = rows["PAY-1"]
    assert one["state"] == "local" and one["where"] == "worktree" and one["worktree"] == str(wt1)
    assert one["waits"]["who"] == "you" and one["waits"]["line"] == line and line.startswith("approve REQUIREMENTS ")
    assert one["lean"]["stage"] == "requirements" and one["lean"]["stage_label"] == "需求分析" and one["lean"]["total"] == 11
    assert one["lean"]["stage_n"] == 2 and one["lean"]["stage_state"] == "started"
    assert one["stage"] == "做完 0 · 跳过 1 · 下一步：需求分析" and one["lean"]["next"]["label"] == "需求分析"
    assert (one["waits"]["do"], one["waits"]["where"]) == ("approve", "session") and one["waits"]["since"]
    assert rows["PAY-2"]["state"] == "local" and rows["PAY-2"]["waits"]["line"] is None
    assert rows["PAY-3"]["state"] == "claimed" and rows["PAY-3"]["title"] == "只认领"
    # a claim not started waits for its owner to start it, here in the app, since the claim (not since now)
    w3 = rows["PAY-3"]["waits"]
    assert (w3["who"], w3["do"], w3["where"], w3["text"]) == ("you", "start", "app", "已认领，还没开工") and w3["since"]
    assert all(r["local_only"] for r in rows.values())      # no remote: done only on this machine
    # overlap: src/pay contains src/pay/report
    assert view["overlaps"] == [{"keys": ["PAY-1", "PAY-2"], "paths": ["src/pay", "src/pay/report"]}] or \
        view["overlaps"][0]["keys"] == ["PAY-1", "PAY-2"]
    assert rows["PAY-1"]["overlap"] == ["PAY-2"] and rows["PAY-2"]["overlap"] == ["PAY-1"]
    assert view["counts"]["local"] == 2 and view["counts"]["claimed"] == 1
    assert view["funnel"]["rows"] and view["eval"]["metrics"] is not None
    assert "token" not in json.dumps(view).lower()


def test_a_handed_over_run_and_a_merged_one(tmp_path, home):
    repo = make_project(tmp_path)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    state = wt / "aidlc-docs" / intent / "aidlc-state.md"
    state.write_text(state.read_text().replace("Status: Inception: starting", "Status: Construction step 2 of 4"))
    sh("git", "-C", wt, "commit", "-qam", "notes")
    brain(wt, "handoff", "--no-push")
    wt2 = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "done", "done", "做完了")
    sh("git", "-C", repo, "merge", "-q", "--no-ff", "-m", "merge PAY-2", "ai/alice/PAY-2-done")
    sh("git", "-C", repo, "worktree", "remove", "--force", wt2)
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            return await svc.overview("r1"), await svc.requirement("r1", "PAY-1"), await svc.requirement("r1", "PAY-2")
        finally:
            await svc.stop()

    view, d1, d2 = run(go())
    rows = rows_by_key(view)
    assert rows["PAY-1"]["state"] == "handed_over" and rows["PAY-1"]["waits"]["who"] == "bridge"
    assert rows["PAY-2"]["state"] == "merged" and rows["PAY-2"]["where"] == "main"
    assert d1["run"]["handoff"]["by"] == "alice" and d1["lean"]["status"] == "Construction step 2 of 4"
    assert d1["timeline"]["items"] and d1["timeline"]["source"] in ("trace", "app")
    assert any(i["kind"] == "handover" for i in d1["timeline"]["items"]) or d1["timeline"]["source"] == "app"
    assert d2["row"]["state"] == "merged" and d2["where_label"].startswith("默认分支")


def test_detail_lists_stages_approvals_decisions_with_brain_citations(tmp_path, home):
    repo = make_project(tmp_path)
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    line = request_requirements(wt, intent)
    dec = wt / "aidlc-docs" / intent / "decisions.md"
    # Who in brain-kit's vocabulary (9935b11): agent; owner (the run's owner answered in the local chat); a person's
    # pseudonym and voucher (an answer through the bridge); brain <entry>; anything else is unclassified
    dec.write_text(dec.read_text() + "| D-2 | 2026-11-08 | requirements | 退款单号按 RF+9 位 | 见 T-PAY-1-2 | agent |\n"
                   "| D-3 | 2026-11-08 | requirements | 退款上限是原单金额 | 产品确认 | owner |\n"
                   "| D-4 | 2026-11-08 | requirements | 退款要人工审核 | MR 上回答 | P-1A2B V-0123456789 |\n"
                   "| D-5 | 2026-11-08 | requirements | 对账按自然日 | Brain | brain T-PAY-1-2 |\n"
                   "| D-6 | 2026-11-08 | requirements | 先不做导出 | 产品说的 | product |\n")
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            return await svc.requirement("r1", "PAY-1")
        finally:
            await svc.stop()

    d = run(go())
    st = {s["id"]: s["state"] for s in d["lean"]["stages"]}
    assert st["reverse-engineering"] == "skipped" and st["requirements"] == "started" and st["release"] == "todo"
    ap = d["lean"]["approvals"]
    assert ap == [dict(ap[0], kind="REQUIREMENTS", state="pending", line=line)]
    by = {x["id"]: x for x in d["decisions"]}
    assert by["D-2"]["cites"] == ["T-PAY-1-2"] and by["D-2"]["by"] == "agent"
    assert (by["D-3"]["by"], by["D-3"]["who"]) == ("person", "owner")
    assert (by["D-4"]["by"], by["D-4"]["who"]) == ("person", "P-1A2B")
    assert (by["D-5"]["by"], by["D-5"]["who"]) == ("brain", "T-PAY-1-2")
    assert (by["D-6"]["by"], by["D-6"]["who"]) == ("unclassified", None)     # not a person: not in the vocabulary
    assert d["credits"]["note"].startswith("KiroCrew 只报 credits")
    # editing the requirements after the request voids the line
    (wt / "aidlc-docs" / intent / "inception" / "requirements" / "requirements.md").write_text("# changed\n")
    svc2 = make_service(tmp_path / "again", [repo])

    async def again():
        await svc2.start()
        try:
            return await svc2.requirement("r1", "PAY-1")
        finally:
            await svc2.stop()

    d2 = run(again())
    assert d2["lean"]["approvals"][0]["state"] == "stale" and d2["lean"]["approvals"][0]["line"] is None
    assert d2["row"]["waits"]["line"] is None


def test_lean_approval_by_inception_answers_the_requirements_request(tmp_path, home):
    mod_lv = __import__("appkit").mod("lean_view")
    files = {"aidlc-docs/i/inception/requirements/requirements.md": b"R", "aidlc-docs/i/inception/application-design/application-design.md": b"D"}
    import hashlib
    h = {p: hashlib.sha256(b).hexdigest() for p, b in files.items()}
    req = "aidlc-docs/i/inception/requirements/requirements.md"
    evs = [{"event": "APPROVAL_REQUESTED", "ts": "2026-11-08T01:00:00Z", "data": {"kind": "REQUIREMENTS", "path": req, "sha256": h[req]}},
           {"event": "APPROVED", "ts": "2026-11-08T02:00:00Z", "data": {"kind": "INCEPTION", "paths": list(files), "files": h, "sha256": "ab" * 32}}]
    out = mod_lv.approvals(evs, files.get)
    assert {a["kind"]: a["state"] for a in out} == {"REQUIREMENTS": "approved", "INCEPTION": "approved"}
    plan = "aidlc-docs/i/construction/plans/app-code-generation-plan.md"
    body = b"- [ ] 1. a\n- [ ] 2. b\n"
    evs = [{"event": "APPROVAL_REQUESTED", "ts": "2026-11-08T01:00:00Z",
            "data": {"kind": "PLAN", "unit": "app", "path": plan, "sha256": hashlib.sha256(body).hexdigest()}}]
    ticked = {plan: b"- [x] 1. a\n- [ ] 2. b\n"}
    assert mod_lv.approvals(evs, ticked.get)[0]["state"] == "pending"  # ticking a step keeps the request
    assert mod_lv.approvals(evs, {plan: b"- [ ] 1. other\n"}.get)[0]["state"] == "stale"


def test_unused_imports_are_fine():
    assert lean and install_brain_dev


def test_team_mode_lists_each_requirement_once_the_runners_facts_winning(tmp_path, home):
    """Team mode: a requirement handed over is listed once, as the runner's; one the runner has only is the runner's;
    a merge by both counts stays its repo's (the merge, the 14 days and the write-back are read there); 待办 too."""
    from types import SimpleNamespace
    repo = make_project(tmp_path, kit={"gitlab": {"base": "https://gitlab.example.com", "project": "shop/pay"}})
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "refund", "refund", "退款")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    state = wt / "aidlc-docs" / intent / "aidlc-state.md"
    state.write_text(state.read_text().replace("Status: Inception: starting", "Status: Construction step 2 of 4"))
    sh("git", "-C", wt, "commit", "-qam", "notes")
    brain(wt, "handoff", "--no-push")
    wt2 = start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "done", "done", "做完了")
    sh("git", "-C", repo, "merge", "-q", "--no-ff", "-m", "merge PAY-2", "ai/alice/PAY-2-done")
    sh("git", "-C", repo, "worktree", "remove", "--force", wt2)
    start_in_worktree(repo, home / "workplace" / "brain-app" / "pay" / "local", "local", "本地")
    svc = make_service(tmp_path, [repo])
    deliveries = __import__("appkit").mod("deliveries")

    def runner_row(key, state, text):
        row = deliveries.base_row("runner", {"key": key, "where": "runner"})
        row.update(where="runner", state=state, state_label=deliveries.STATE_LABEL[state],
                   waits=deliveries.waits("product" if state == "parked" else "nobody", "none", text))
        return row, {"key": key, "project": "shop/pay", "decisions_text": None}, []

    async def go():
        await svc.start()
        try:
            svc.team = SimpleNamespace(host=object())
            svc._team_rows = lambda snap: [runner_row("PAY-1", "parked", "等产品在 MR 上回答 D-1"),
                                           runner_row("PAY-2", "merged", "MR 已合并，运行结束"),
                                           runner_row("PAY-3", "running", "运行机在跑"),
                                           runner_row("PAY-9", "running", "运行机在跑")]
            return await svc.overview("all"), await svc.overview("r1"), await svc.overview("runner"), await svc.todo()
        finally:
            svc.team = None
            await svc.stop()

    every, r1, runner, todo = run(go())
    ids = sorted((r["repo"], r["key"]) for r in every["rows"])
    # PAY-1 handed over: the runner's; PAY-2 merged by both: r1's; PAY-3 never handed over here: r1's; PAY-9 the runner's
    assert ids == [("r1", "PAY-2"), ("r1", "PAY-3"), ("runner", "PAY-1"), ("runner", "PAY-9")], ids
    assert sorted(r["key"] for r in r1["rows"]) == ["PAY-2", "PAY-3"]
    assert sorted(r["key"] for r in runner["rows"]) == ["PAY-1", "PAY-9"]
    assert sum(every["counts"].values()) == len(every["rows"]) == len(r1["rows"]) + len(runner["rows"])
    assert next(r for r in every["rows"] if r["key"] == "PAY-1")["state"] == "parked"
    assert not any(i["key"] == "PAY-1" and i["repo"] == "r1" for i in todo["items"]), todo["items"]


def test_the_numbers_say_they_are_being_worked_out_until_evaluate_is_done(tmp_path, home):
    """Overview 待确认-2: while brainkit.evaluate computes a repo's numbers the page is told so (正在算), then not."""
    import asyncio
    repo = make_project(tmp_path)
    svc = make_service(tmp_path, [repo])

    async def go():
        await svc.start()
        try:
            first = await svc.overview("r1")
            for _ in range(300):
                later = await svc.overview("r1")
                if not later["eval"].get("computing"):
                    return first, later
                await asyncio.sleep(0.1)
            return first, later
        finally:
            await svc.stop()

    first, later = run(go())
    assert first["eval"]["computing"] is True and first["eval"]["available"] is False
    assert later["eval"]["computing"] is False
