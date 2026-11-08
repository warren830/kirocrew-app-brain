# What the Brain app needs from brain-kit

The app imports brain-kit and never edits it. These are the places where it had to lean on internals, copy a flow,
or work around a constraint. Each item says what the app does today and what would let it stop.

## Must-have (the app depends on internals today)

1. **Pluggable signing in the bridge.** `Bridge._process` and `DecisionLoop.deliver` call `sign.sign(v,
   cfg["signing_key"])` inline. The app replaces `sign.sign` in its private copy with a spool client and overrides
   `_process` / `deliver` to handle a refusal. Wanted: `Bridge(..., signer=callable)` (or a `sign_voucher(v)` method)
   and the voucher builders as functions: `handoff_voucher(project, kit, mr, facts, run_id)` and
   `answer_voucher(d, author, choice, items, review)`. The signer could then rebuild the voucher with brain-kit's own
   code and compare, instead of checking fields it knows (it refuses unknown fields today, so every new voucher field,
   like `review_items` / `rejected_items` added this week, needs a signer update).
2. **An answer verifier.** The rules for an answer (right person from `decision_roles` + `roles`, right D-id, MR
   head unchanged, first valid reply wins, different answers = conflict, review items) live inline in `collect()`.
   `signer/brain_signer.py` re-implements them to check independently. Wanted: `check_answer(kit, owner, park,
   decision, question_note_id, notes) -> (author, choice, items) | problems`, used by `collect()` and by any signer.
3. **`load_bridge_config` without a signing key.** It requires `signing_key`; the app's bridge config must not have
   one. Wanted: `require_key=False`.
4. **The ledger and threads.** `Ledger` opens sqlite with `check_same_thread=True`; the app runs the whole bridge on
   one dedicated worker thread for that reason. Wanted: say so in the docstring, or open per call / allow a lock.
5. **Bridge comment author.** The signer must know which GitLab account posts the bridge's questions
   (`bridge_users` in its config). Wanted: `bridge_users` in `.brain/kit.json`, read from the default branch by both.

## Should-have (the app copies a small flow)

6. **Lean read API.** The app reads pending approvals from the audit ledger itself (`backend/core/lean_view.py`:
   APPROVAL_REQUESTED not answered by a later APPROVED/REJECTED covering one of its files, file hash still equal,
   PLAN checkboxes normalised) because `lean status` rewrites aidlc-state.md and the project's Lean copy is
   agent-writable. Wanted: `brainkit.lean.approvals(read, intent) -> [{kind, unit, state, sha8, line}]` and
   `stages(...)`, pure functions over the ledger records.
7. **Reflect preview as one function.** The app repeats cmd_reflect's planning half (main_cfg, source_text, parse,
   parse_gaps, open_branches, plan, plan_gaps, rejected_without_correction). Wanted: `reflect.preview(repo, cfg, key,
   ref=None, vouchers_dir=None) -> {ops, gaps, notes, warnings, problems, substantive}`.
8. **Structured crew checks.** `cli.crew_checks` returns `[]` when `kirocrew` is not on PATH (the gateway's PATH has
   no `~/.local/bin`) and English text. Wanted: `crew_checks(repo, kirocrew_bin=None)` with ids
   (`agent_missing`, `agent_no_hooks`, `agent_drift`, `adapter_missing`, `engine_not_kas`) so hosts can localise;
   `cmd_crew_agent --force` keeping a backup of a different file (the app does this itself).
9. **`brain start` for a worktree, with JSON out.** The app runs `git worktree add --detach` and then `brain start`
   in it, then reads the branch and run.json back. Wanted: `brain start --worktree DIR` (or documented support) and
   `--json` (key, branch, intent, package) instead of parsing stdout.
10. **Intake dry run before a key exists.** `intake.build(..., dry_run=True)` needs a key; the app passes the next
    free key it computes from the claim refs it has. Wanted: `key=None` for a dry run.
11. **Public names for what the app calls**: `cli._store` (the intake store), `decisions._neutral_note` (the app
    neutralises a local answer's note the same way), `trace.build(_usage=)` (pass usage once for many keys).

## Nice-to-have

12. **A machine-readable marker in the bridge's MR comments** (e.g. `<!-- brain-decision {"id": "D-5", "run":
    "RUN-PAY-3-1", "kind": "clarify", "state": "open"} -->`). On a person's machine the app parses the visible text
    (`**D-5 · 澄清 · RUN-…**`, `D-5 已收到 @x 的回答：A …`, `D-5 作废`, `AI 接手被拒`) to show D-n questions.
13. **`evaluate.collect` contract and cost.** The app maps `autonomy`, `delivery`, `judgment` (`value` pairs),
    `repeat_rate`, `useful`, `staleness.total`, `cost.per_success`, `funnel.counts`, `review_queue` and calls it only
    with the keyword arguments its signature has. Wanted: a documented, stable shape (ideally `metrics: [{id, label,
    value, rule}]`) and a way to reuse traces between calls (it builds one trace per run, many git calls).
14. **`golden.run(jobs, runner)`**: document the runner callback (sync or async, what it returns, how an oracle
    answer is marked) so the app can dispatch golden jobs as Kiro Crew sessions (not done yet).
15. **Decision states.** The app's ledger has `refused` (the signer would not sign the answer) next to brain-kit's
    `open / answered / delivered / delivery_unknown / stale / invalid / closed`; reconcile now writes `merged` and
    `closed` for runs. `report()`, `trace` and `evaluate` could name them.
16. **Kit and identities caching.** `Bridge.kit()` and the identities are read once per process; a change on main
    needs a restart of the app's bridge and the signer. A TTL would be enough.
