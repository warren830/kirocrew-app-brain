# What the Brain app needs from brain-kit

The app imports brain-kit and never edits or patches it. This list says where it still leans on internals, copies a
flow, or works around a constraint, and what would let it stop. Checked against brain-kit `9935b11` (2026-11-09).

## Items 1–9 of the first list, against 9935b11

| # | Ask | Status | What the app does now |
| --- | --- | --- | --- |
| 1 | Pluggable signing; voucher builders | Signing **done**. Builders **still needed**: 21 | Runs brain-kit's `Bridge` with brain-kit's `SpoolSigner`. |
| 2 | One answer verifier | **Done** (`decisions.check_answer -> Verdict`; 9935b11: bound to the recorded question note, edited replies never count, approve/reject for a question without options, a batch review's item list whole) | The signer decides every answer with it, bound to the voucher's `question_note`. |
| 3 | bridge.json without a key | **Done** | Team mode loads bridge.json with `load_bridge_config` and refuses one that names a `signing_key`. |
| 4 | Ledger shared by threads | **Done** | The page reads the bridge's own `Ledger` from any thread; stop closes it. |
| 5 | The bridge's GitLab account | **Done** (kit.json `bridge_user`) | The MR reader on a person's machine and the signer go by it. |
| 6 | Hand-over bound to the labelled commit | **Done**; 9935b11 adds the hand-over commit rule (`Bridge.handoff_commit_problems`: the head has one parent and changes run.json) and `brain handoff` labels only its own pushed commit | Nothing to copy: the signer gets the rule through `Bridge.verify`. The test fixtures make real `brain handoff` commits and serve `parent_ids`. |
| 7 | Answer bound to its question and push | **Done**; 9935b11 binds it to the question note id the ledger recorded (`question_note` in the answer voucher; a deleted question voids the decision). "Questions posted by the signer's own account" **still needed**: 23 | The signer requires `question_note`, passes it to `check_answer`, rebuilds it, and keeps its own record (23). |
| 8 | CI's DESIGN approval | **Done** | Nothing in the app. |
| 9 | `mr_notes` stops at the page cap | **Done** (9935b11: an exact page cap, `GitLab.pages`) | A flood of notes gets no answer from the signer, the same as brain-kit's `collect`. |

9935b11 interfaces the app now relies on (`bk.NEEDS`; an older checkout is refused): `ledger.RESERVED` and
`Ledger.is_reservation_for` (the signer's reservation while it signs a contract again), `Ledger.pending_voucher`
and the `pending_vouchers` table (the team page lists vouchers waiting for a late signature),
`DecisionLoop.sign_voucher`, `decisions.VOUCHER_TIME_FIELDS`, `Bridge.handoff_commit_problems`, `GitLab.commit`.
Also used when present: `trace.classify_who` and `trace.audit_labels` (the app's own decisions.md reader and Lean
timeline follow them when trace is missing), `decisions.USER` (the MR reader's usernames), and from
`evaluate.collect`: `skipped`, `delivery.wrong_open`, `cost.note`, `funnel.unclassified`.

## Still needed

### Must-have: the signer is the boundary and still copies these

21. **Voucher builders** (left from 1). Wanted: `handoff_voucher(project, mr, facts, run_id, issued_at, expires_at)` and
    `answer_voucher(decision, verdict, answerer, issued_at)`, used by `Bridge._process` / `DecisionLoop.deliver`.
    - The release-order trap happened in 9935b11: `deliver` added `question_note`, and the signer refused every answer
      until it learned the field. `brain_signer.answer_voucher` now copies it (from the note `check_answer` bound to).
22. **The service half of the spool protocol.** `SpoolSigner` is only the client. The signer re-implements the other
    half (a safe read of at most `MAX_SPOOL_FILE` bytes without following a symlink or blocking on a FIFO; `schema` 1,
    `req_id` = file name = `SpoolSigner.req_id(voucher)`; the `signed/` and `refused/` layouts; "already answered",
    which is now also what makes a late signature reusable), and the app has its own copy of the safe read for the
    page. Wanted: e.g. `sign.SpoolService(spool)` with `requests()`, `sign(req_id, voucher, sig)`,
    `refuse(req_id, reasons)` and `status()`.
23. **What a signer signed, kept by brain-kit** (left from 7). `check_answer` is pure and sees the MR as it is now, and
    the bridge account's token is readable by the agents' OS user, so whoever has it can delete, edit and post the
    bridge's notes. The signer's own ledger keeps one answer per (run, sha, park.json) and binds a D-n to one question
    and, now, one question note. It also refuses a question note that an allowed person's reply to its D-n comes
    before (a copy posted later, with or without the first one deleted, would drop that reply, as `check_answer`
    counts the replies after the note it is bound to). What it cannot see: a conflict note posted with the bridge's
    token, which ends a round for `check_answer` (the bridge's own `collect` too) and drops an answer given before it.
    - Wanted, best first: questions and conflict notes posted by the signer's own account (the bridge asks, the
      signer posts); or the ledger's round start (`note_id`) in the answer voucher with `check_answer` ignoring
      conflict notes after the bound question that the round does not name; or a brain-kit `SignedAnswers` record
      next to `check_answer` that any signer uses.
24. **`Bridge.verify` for a contract signed again.** **Done** in 9935b11: the signer moves the run it signs again to
    brain-kit's reservation state (`ledger.RESERVED`, "signing"), which `verify` does not count as another open run
    for the same hand-over (`Ledger.is_reservation_for`). The signer's private `reissue` state is gone (old rows are
    migrated to `spooled`).
25. **Reserve a given run id.** The signer reserves the run id the request names, before it checks it, as one step with
    "no other open run" (the bridge does the same with `Ledger.reserve_run`). `reserve_run` picks the next id itself,
    and the signer's numbering may differ from the bridge's (a signer ledger set up again), so the signer copies its
    SQL (`BEGIN IMMEDIATE`, drop stale reservations, insert in `RESERVED`). Wanted: `reserve_run(..., run_id=None)`.

### Should-have: the app copies a small flow

10. **Lean read API.** Still the same: the app reads pending approvals and stages from the audit ledger itself
    (`backend/core/lean_view.py`). The overview's current stage is now never empty once Lean recorded one (all done:
    the last stage, done). Wanted: `brainkit.lean.approvals(...)` and `stages(...)`, pure functions over the records.
11. **Reflect preview as one function.** Still the same (the app repeats the planning half of cmd_reflect). Wanted:
    `reflect.preview(repo, cfg, key, ref=None, vouchers_dir=None) -> {ops, gaps, notes, warnings, problems,
    substantive}`.
12. **Structured crew checks.** Partly done. 9935b11 adds `crew_agent_update` and the PreToolUse matcher rule (a
    Lean guard must see every tool); the app gets the matcher rule through `missing_lean_hooks` / `add_lean_hooks`.
    The app keeps its own policy (only Lean's hooks are added, the rest of the spec stays) and does not show the new
    "differs in brain-kit's fields" warning. Still wanted: `crew_checks(repo, kirocrew_bin=None)` with ids, and
    `runner_kit_problems` with ids rather than text.
13. **`brain start` for a worktree, with JSON out.** Still the same. Wanted: `brain start --worktree DIR` and `--json`.
26. **`brain reflect --apply --json`** (new): the reply's worktree was null although brain-kit printed it. The app now
    takes it from `git worktree list` (the worktree that has the new branch checked out), else from the printed line.
    Wanted: `--json` with `{branch, worktree, mr_url, gaps}`.
14. **Intake dry run before a key exists.** Still the same: the app passes the next free key it computes. Wanted:
    `key=None` for a dry run.
15. **Public names for what the app calls.** Still private: `cli._store`, `decisions._neutral_note` and
    `trace.build(_usage=)`. (`trace.classify_who`, `trace.audit_labels` and `decisions.ANSWER_RE` are public.)

### Nice-to-have

16. **Machine-readable bridge notes.** Partly done (`decisions.Q_HEAD_RE`). The other notes are still parsed from their
    text (`mrinfo.py`): delivered, `作废：` (stale), `作废（…）` (void), refused, `无法发出`, `AI 接手被拒`, `AI 已接手`,
    and 9935b11's `D-n 收到了回答，但桥这一轮没能签名` (shown as answered: nobody answers again). Wanted: a marker
    such as `<!-- brain-decision {"id", "run", "state"} -->`, or regexes next to the texts.
17. **`evaluate.collect` contract.** The app maps `autonomy`, `delivery` (and `wrong_open`), `judgment`,
    `repeat_rate`, `useful`, `staleness.total`, `cost.per_success` and `cost.note`, `skipped`, `funnel.counts` and
    `funnel.unclassified`, and `review_queue`. Still wanted: a documented, stable shape (ideally `metrics: [{id,
    label, value, rule}]`).
18. **`golden.run(jobs, runner)`.** Wanted: the runner callback documented, so the app can dispatch golden jobs as Kiro
    Crew sessions (not done yet).
19. **Decision and run states.** Mostly done: decision states are listed in a comment in `decisions.py`; run states are
    `OPEN_RUN_STATES` plus `RESERVED`. The app labels them all (run: signing, spooled, ready, dispatched,
    send_unknown, failed, merged, closed). Wanted: public tuples `DECISION_STATES` and `RUN_STATES`.
20. **Kit and identities caching.** Still the same: a change on main or in brain-authz needs a restart of the app's
    bridge and of the signer. A TTL would be enough.

## Note for the next brain-kit

The app's tests pass against a clean checkout of 9935b11. brain-kit's working tree moved on while this was written
(a5c1e8b, and uncommitted changes: the hand-over commit must not be a bot's, `Bridge.process` may return `waiting` or
`unlabelled`, stale reservations in `open_run_for`). The fake GitLab now also serves commit authors and committers, as
GitLab does, which that code reads. Run the app's tests again against the next commit.
