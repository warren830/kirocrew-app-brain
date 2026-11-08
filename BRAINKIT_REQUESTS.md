# What the Brain app needs from brain-kit

The app imports brain-kit and never edits or patches it. This list says where it still leans on internals, copies a
flow, or works around a constraint, and what would let it stop. Checked against brain-kit `c9e59d1` (2026-11-09).

## Items 1–9 of the first list, against c9e59d1

| # | Ask | Status | What the app does now |
| --- | --- | --- | --- |
| 1 | Pluggable signing; voucher builders | Signing **done** (`Bridge(..., signer=)`, `sign.KeySigner` / `SpoolSigner`, `SignerRefused` / `SignerUnavailable` handled in `_process` and `deliver`). Builders **still needed**: 21 | Runs brain-kit's `Bridge` with brain-kit's `SpoolSigner`. Its own spool client, its `Bridge` subclass and the patched `sign.sign` are gone. |
| 2 | One answer verifier | **Done** (`decisions.check_answer -> Verdict`) | The signer decides every answer with it; its own copy of the rules is gone. |
| 3 | bridge.json without a key | **Done** (`load_bridge_config` with a `"signer": {"type": "spool"}` block) | Team mode loads bridge.json with it, and refuses one that names a `signing_key`. |
| 4 | Ledger shared by threads | **Done** (one connection under `Ledger.lock`, `Ledger.close()`) | The page reads the bridge's own `Ledger` from any thread. Stop closes it. The signer holds `ledger.lock` around its read-then-write steps. |
| 5 | The bridge's GitLab account | **Done** (kit.json `bridge_user`, checked against the token in `watch`) | The MR reader on a person's machine and the signer go by it. The signer's `bridge_users` is now only an optional pin. |
| 6 | Hand-over bound to the labelled commit | **Done** (`Bridge.verify` → `label_after_push`, GitLab MR versions) | The signer's own check is gone. |
| 7 | Answer bound to its question and push | **Done** (the first line names the sha and park hash; `check_answer` checks binding, edits, push time and re-binding). "Questions posted by the signer's own account" **still needed**: 23 | The signer keeps only its own record (23). |
| 8 | CI's DESIGN approval | **Done** (`ci.design_approval_covers`) | Nothing in the app: CI is brain-kit's. |
| 9 | `mr_notes` stops at the page cap | **Done** (raises; `mr_versions` does too) | The signer's own pager is gone. A flood of notes now gets no answer from the signer, the same as brain-kit's `collect`; before, the signer refused. |

c9e59d1 also added `cli.agent_hook_commands`, `missing_lean_hooks` and `add_lean_hooks` (both agent-spec formats). The
app's KiroCrew check and fix use them, together with `cli.runner_kit_problems`. The app also uses
`decisions.Q_HEAD_RE` (the MR reader), `rest.head_pushed_at` and `GitLab.mr_versions` (the signer), and
`SpoolSigner.req_id` (the signer checks a request's name).

## Still needed

### Must-have: the signer is the boundary and still copies these

21. **Voucher builders** (left from 1). Wanted: `handoff_voucher(project, mr, facts, run_id, issued_at, expires_at)` and
    `answer_voucher(decision, verdict, answerer, issued_at)`, used by `Bridge._process` / `DecisionLoop.deliver`.
    - The signer rebuilds every voucher from what `verify` / `check_answer` found and compares canonical bytes.
    - Today `brain_signer.handoff_voucher` / `answer_voucher` copy the layout of those two methods, so a voucher field
      brain-kit adds is refused until the signer is updated (safe, but a release-order trap).
22. **The service half of the spool protocol.** `SpoolSigner` is only the client. The signer re-implements the other
    half:
    - reading a request without following a symlink or blocking on a FIFO, at most `MAX_SPOOL_FILE` bytes;
    - `schema` 1, `req_id` = file name = `SpoolSigner.req_id(voucher)`, `kind` = the voucher's;
    - the `signed/` and `refused/` layouts, and "already answered";
    - and the app has its own copy of that safe read to list pending and refused requests on the page.

    Wanted: e.g. `sign.SpoolService(spool)` with `requests()` → (req_id, voucher), `sign(req_id, voucher, sig)`,
    `refuse(req_id, reasons)` and `status()`.
23. **What a signer signed, kept by brain-kit** (left from 7). `check_answer` is pure and sees the MR as it is now. But
    the bridge account's token is in bridge.json, which the agents' OS user can read, so whoever has it can delete
    or edit the bridge's notes. Example (test_signer.py): delete D-1, push again, ask a new D-1; on the MR alone that
    is a clean question.
    - So the signer keeps its own ledger: one answer per (run, sha, park.json), and a D-n never bound to a second
      question.
    - Wanted, best first: questions posted by the signer's own account (the bridge asks, the signer posts); or a
      brain-kit `SignedAnswers` record next to `check_answer` that any signer uses.
24. **`Bridge.verify` for a contract signed again.** When the app asks again for a contract it did not get an answer
    for (same run id, MR and commit), the signer must sign it again. Its own ledger has that run open, so `verify`
    would say "already has an open run". The signer moves the run to a state outside `OPEN_RUN_STATES` while it
    verifies.
    - This depends on brain-kit's state names. The earlier version filtered the English problem text, which was
      worse.
    - Wanted: `verify(..., ignore_run=run_id)`, or problems with ids.

### Should-have: the app copies a small flow

10. **Lean read API.** Still the same. The app reads pending approvals from the audit ledger itself
    (`backend/core/lean_view.py`: APPROVAL_REQUESTED not answered by a later APPROVED/REJECTED covering one of its
    files, the file hash still equal, PLAN checkboxes normalised). It does this because `lean status` rewrites
    aidlc-state.md and the project's Lean copy is agent-writable. Wanted: `brainkit.lean.approvals(read, intent) ->
    [{kind, unit, state, sha8, line}]` and `stages(...)`, pure functions over the ledger records.
11. **Reflect preview as one function.** Still the same. The app repeats the planning half of cmd_reflect
    (main_cfg, source_text, parse, parse_gaps, open_branches, plan, plan_gaps, rejected_without_correction). Wanted:
    `reflect.preview(repo, cfg, key, ref=None, vouchers_dir=None) -> {ops, gaps, notes, warnings, problems,
    substantive}`.
12. **Structured crew checks.** Partly done: the hook functions are public now, and the app's check and fix are built
    on them and on `runner_kit_problems`. Still wanted:
    - `crew_checks(repo, kirocrew_bin=None)` with ids (`agent_missing`, `agent_no_hooks`, `agent_unreadable`,
      `adapter_not_committed`, `engine_not_kas`). Today it returns `[]` when `kirocrew` is not on PATH (the
      gateway's PATH has no `~/.local/bin`), and its text is English;
    - `runner_kit_problems` with ids rather than text;
    - in `cmd_crew_agent --force`, a backup of the file it changes, and the keys kept in their order. `write_json`
      sorts them; the app writes the spec in place with the order kept.
13. **`brain start` for a worktree, with JSON out.** Still the same. The app runs `git worktree add --detach`, then
    `brain start` in it, then reads the branch and run.json back. (`--worktree` and `--json` exist now, but only on
    `reflect` and `usage`.) Wanted: `brain start --worktree DIR` and `--json` (key, branch, intent, package).
14. **Intake dry run before a key exists.** Still the same: `intake.build(..., dry_run=True)` needs a key, so the app
    passes the next free key it computes from the claim refs. Wanted: `key=None` for a dry run.
15. **Public names for what the app calls.** Still private: `cli._store` (the intake store),
    `decisions._neutral_note` (the app neutralises a local answer's note the same way) and `trace.build(_usage=)`.

### Nice-to-have

16. **Machine-readable bridge notes.** Partly done: a question's first line is now read with `decisions.Q_HEAD_RE`.
    The other notes are still parsed from their text (`mrinfo.py`): `D-n 已收到 @x 的回答：A …（凭证 V-…）`,
    `D-n 作废：` (stale), `D-n 作废（…）` (void), `D-n 的回答没有送回 run：签名服务不签`, `D-n 无法发出`, `AI 接手被拒`,
    `AI 已接手`. Wanted: a marker such as `<!-- brain-decision {"id", "run", "state"} -->`, or regexes next to the
    texts.
17. **`evaluate.collect` contract and cost.** The app maps `autonomy`, `delivery`, `judgment` (`value` pairs),
    `repeat_rate`, `useful`, `staleness.total`, `cost.per_success`, `funnel.counts` and `review_queue`, and passes
    only the keyword arguments the signature has.
    - `collect(traces=)` does take prebuilt traces; the app does not pass them yet.
    - Still wanted: a documented, stable shape (ideally `metrics: [{id, label, value, rule}]`).
18. **`golden.run(jobs, runner)`.** Wanted: the runner callback documented (sync or async, what it returns, how an
    oracle answer is marked), so the app can dispatch golden jobs as Kiro Crew sessions (not done yet).
19. **Decision states.** Mostly done. brain-kit's ledger has the states the app used to add (`refused`) plus `posting`
    and `void`, all listed in a comment in `decisions.py`. The app shows them all. Wanted: a public tuple
    (`DECISION_STATES`), so the app can check it labels every one.
20. **Kit and identities caching.** Still the same. `Bridge.kit()` and the identities are read once per process, so a
    change on main (`bridge_user`, `decision_roles`) or in brain-authz needs a restart of the app's bridge and of the
    signer. A TTL would be enough.
