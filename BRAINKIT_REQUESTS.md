# What the Brain app needs from brain-kit

The app imports brain-kit and never edits or patches it. This list says where it still leans on internals, copies a
flow, or works around a constraint, and what would let it stop. Checked against brain-kit `0d52e97` (2026-11-09: QA
rounds 3 and 4, the split of a big requirement, phase 1; the app needs `72b278e` or newer and keeps working with
`48b6b97`, the split features off).

## Items 1–9 of the first list, against 48b6b97

| # | Ask | Status | What the app does now |
| --- | --- | --- | --- |
| 1 | Pluggable signing; voucher builders | Signing **done**. Builders **still needed**: 21 | Runs brain-kit's `Bridge` with brain-kit's `SpoolSigner`. |
| 2 | One answer verifier | **Done** (`decisions.check_answer -> Verdict`; 9935b11: bound to the recorded question note, approve/reject for a question without options, a batch review's item list whole; 72b278e: `edits`, the edit signal from GitLab GraphQL's lastEditedBy and a per-reply text hash, a reply that does not count holding the round) | The signer decides every answer with it, bound to the voucher's `question_note`, with `edits` from brain-kit's own `DecisionLoop.reply_states` on its ledger and its own GitLab token (28, 29). |
| 3 | bridge.json without a key | **Done** | Team mode loads bridge.json with `load_bridge_config` and refuses one that names a `signing_key`. |
| 4 | Ledger shared by threads | **Done** | The page reads the bridge's own `Ledger` from any thread; stop closes it. |
| 5 | The bridge's GitLab account | **Done** (kit.json `bridge_user`) | The MR reader on a person's machine and the signer go by it. |
| 6 | Hand-over bound to the labelled commit | **Done**; 9935b11 adds the hand-over commit rule (`Bridge.handoff_commit_problems`: the head has one parent and changes run.json) and `brain handoff` labels only its own pushed commit | Nothing to copy: the signer gets the rule through `Bridge.verify`. The test fixtures make real `brain handoff` commits and serve `parent_ids`. |
| 7 | Answer bound to its question and push | **Done**; 9935b11 binds it to the question note id the ledger recorded (`question_note` in the answer voucher; a deleted question voids the decision). "Questions posted by the signer's own account" **still needed**: 23 | The signer requires `question_note`, passes it to `check_answer`, rebuilds it, and keeps its own record (23). |
| 8 | CI's DESIGN approval | **Done** | Nothing in the app. |
| 9 | `mr_notes` stops at the page cap | **Done** (9935b11: an exact page cap, `GitLab.pages`) | A flood of notes gets no answer from the signer, the same as brain-kit's `collect`. |

9935b11 interfaces the app relies on (`bk.NEEDS`; an older checkout is refused): `ledger.RESERVED` and
`Ledger.is_reservation_for` (the signer's reservation while it signs a contract again), `Ledger.pending_voucher`
and the `pending_vouchers` table (the team page lists vouchers waiting for a late signature),
`DecisionLoop.sign_voucher`, `decisions.VOUCHER_TIME_FIELDS`, `Bridge.handoff_commit_problems`, `GitLab.commit`.
72b278e (`bk.NEEDS` and the signer's): `GitLab.note_edits`, `decisions.edit_state`, `DecisionLoop.reply_states`,
`decisions.SCHEMA` (the signer creates brain-kit's `replies` table in its own ledger with it) and check_answer's
`edits`. Also used when present: `trace.classify_who` and `trace.audit_labels` (the app's own decisions.md reader and
Lean timeline follow them when trace is missing), `decisions.USER` (the MR reader's usernames),
`decisions.DESC_TITLE` (48b6b97: the bridge's 变更说明 comment, skipped by the MR reader), `mrdesc.build` / `render`
/ `inert` / `MR_FILE` / `write_problem` / `exclude_fix`, `cli.crew_agent_custom`, trace's `committed_at` and
`merged_at.how`, and from `evaluate.collect`: `skipped`, `delivery.wrong_open`, `autonomy.runs[].correct`,
`cost.note`, `funnel.unclassified`.

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
28. **`reply_states` that stops instead of "cannot tell" for good** (72b278e). **Done in 0d52e97** (QA round 3): a touched
    reply whose edits GraphQL cannot read is `pending`, not recorded, read again next round, and holds the whole
    decision (`Verdict.pending`); the MR is told once after `edit_check_rounds`. The signer treats a verdict with
    pending replies as a check it cannot make (no answer, the bridge asks again), and keeps `EditsOrNothing` for an
    older brain-kit, where the same failure is still "cannot tell" for good. Still wanted: the replies table made by
    `Ledger` (or `DecisionLoop.ensure_schema()`). What it was: When GitLab GraphQL fails,
    `DecisionLoop._note_edits` catches the BrainError and `reply_states` records the touched reply as `unknown` for
    good: right for the bridge (it tells the person once, they reply again), wrong for a signer, where a passing
    GraphQL outage would refuse an answer for good (the bridge then marks the decision `refused`: the run must push
    again). The signer gives its Bridge a GitLab client whose `note_edits` raises a non-BrainError instead
    (`brain_signer.EditsOrNothing`): reply_states stops before recording that reply, the request gets no answer, the
    bridge asks again. It also creates brain-kit's `replies` table itself (`executescript(decisions.SCHEMA)`: the table
    is made in the private `_ddb`). Wanted: `reply_states(d, notes, strict=True)` raising a public `EditsUnknown`, and
    the schema made by `Ledger` (or a public `DecisionLoop.ensure_schema()`).
29. **A held reply alone ends no round** (new, 72b278e). An allowed person's reply that does not count (edited by
    someone else, or unknown) holds the round only against a valid reply in the same `collect`: alone, the verdict is
    `none` and the bridge's round start moves past it, invisibly. The signer knows no rounds but the bridge's conflict
    notes, so it still sees that reply and refuses the next valid answer by another person (a conflict); the bridge
    then marks the decision `refused` for good. The signer is the stricter side (safe, but a decision is lost). Wanted:
    `check_answer` returning `conflict` (or `held`) for held replies even without a valid one, so the bridge posts a
    conflict note that ends the round on the MR, for the signer too.

### Should-have: the app copies a small flow

10. **Lean read API.** Still the same: the app reads pending approvals and stages from the audit ledger itself
    (`backend/core/lean_view.py`). The overview's current stage is now never empty once Lean recorded one (all done:
    the last stage, done). Wanted: `brainkit.lean.approvals(...)` and `stages(...)`, pure functions over the records.
11. **Reflect preview as one function.** Still the same (the app repeats the planning half of cmd_reflect). Wanted:
    `reflect.preview(repo, cfg, key, ref=None, vouchers_dir=None) -> {ops, gaps, notes, warnings, problems,
    substantive}`.
12. **Structured crew checks.** Partly done. 9935b11 adds `crew_agent_update` and the PreToolUse matcher rule (a
    Lean guard must see every tool); the app gets the matcher rule through `missing_lean_hooks` / `add_lean_hooks`.
    The app keeps its own policy (only Lean's hooks are added, the rest of the spec stays). 72b278e's
    `crew_agent_custom` is shown as an OK row (the person's own fields, `--reset` takes brain-kit's), and
    `mrdesc.write_problem` / `exclude_fix` as a FAIL row per repo (48b6b97's doctor row: lean.json must leave `runs/**`
    out). Still wanted: `crew_checks(repo, kirocrew_bin=None)` with ids, and `runner_kit_problems` with ids rather
    than text.
13. **`brain start` for a worktree, with JSON out.** Still the same. Wanted: `brain start --worktree DIR` and `--json`.
26. **`brain reflect --apply --json`** (new): the reply's worktree was null although brain-kit printed it. The app now
    takes it from `git worktree list` (the worktree that has the new branch checked out), else from the printed line.
    Wanted: `--json` with `{branch, worktree, mr_url, gaps}`.
14. **Intake dry run before a key exists.** Still the same: the app passes the next free key it computes. Wanted:
    `key=None` for a dry run.
15. **Public names for what the app calls.** Still private: `cli._store`, `decisions._neutral_note` and
    `trace.build(_usage=)`. (`trace.classify_who`, `trace.audit_labels` and `decisions.ANSWER_RE` are public.)
27. **`Bridge.poll` with each MR's result** (new, 72b278e). `process()` now says `unlabelled` and `waiting`, but
    `poll()` returns nothing, so the app runs poll's loop itself (each project, `mrs_with_label`, `process`, a
    BrainError logged and the next MR looked at) to show each labelled MR's result on the team page. Wanted: `poll()
    -> [{"project", "iid", "sha", "result", "error"}]`.
30. **The 变更说明 at a commit** (new, 72b278e / 48b6b97). The app shows runs/<KEY>/MR.md at the row's commit, else
    `mrdesc.build(ref=<commit>)` + `render`: never the working tree, where `build` runs the project's own Lean (it is
    agent-writable) for the code fingerprint. It reads MR.md itself (`git ls-tree -l` for a regular file and its
    size, then `cat-file`), cuts it like the bridge's `description_note` (60000 characters) and makes it inert, and it
    takes the first line from render()'s `**一句话**：` line. Wanted: `mrdesc.committed(repo, cfg, key, ref) -> text or
    None` (the safe read, inert and cut), and `one_line` in build()'s data (render's first line as data).
32. **`brain install` on a new branch, with JSON out** (new, the app's 导入仓库). The app copies the flow: a worktree
    of a new branch (`brain/install`) from `origin/<default branch>`, `brain install <worktree> --prefix … --team …`,
    then it writes the rest of the values `brain install` asks you to check into kit.json itself (tracker, jira.base,
    default_branch, gitlab.base / project: `kit_data`, checked with `config.validate`), runs `brain doctor --offline`,
    reads `git status` for the changed files and commits. Wanted: `brain install --branch NAME [--worktree DIR]
    [--tracker none|jira] [--jira BASE] [--gitlab BASE PROJECT] [--default-branch B] [--commit] --json` →
    `{branch, worktree, kit, files, doctor: [{level, text}], commit}`; and kit.json values as flags at least. Installs
    now go in place by default (in the checkout, on its branch): the app commits only the paths the install wrote,
    found by `git status` before and after within what `brain install` writes (brain-kit's `kit/` and Lean's, `.brain`,
    `aidlc-docs/lean.json`, `aidlc-docs/audit`, the Brain, `AGENTS.md`, `.gitignore`). Wanted with `--json`: the list
    of paths it wrote (`files`), so nothing has to be guessed.
34. **Who the person is, as data** (new, 91e2fee). The app shows the name brain-kit goes by in each repo and asks for
    「你的 GitLab 用户名」 where brain-kit would refuse. It copies `cli._me`'s rule (a token with gitlab.base; BRAIN_USER;
    git config brain.user; the login name without GitLab) and tells 91e2fee from 48b6b97 by `cli._login_name`
    being there. Wanted: a public `identity(repo, cfg, ask_gitlab=False) -> {name, source, needs}` (no GitLab call
    unless asked), and the "who are you?" errors as a BrainError subclass (`NoIdentity`, with `gitlab_base`).


### Wanted for 大需求拆成小需求 (the split, phase 1) and QA round 4

35. **`brain intent list` without fetching.** The listing (`intents.listing` + `split.enrich`) always fetches: the claims,
    `git ls-remote origin` for the run branches, the default branch, each parent's branch. So the app runs `brain intent
    list --all --json` in the background, at most every minute per repo that has split requirements (and after each
    拆 / 认领 / 放弃认领 / 开工 / 同步 / 从远端取最新), with its own time limit, and shows this machine's claims until it
    answered. The JSON also leaves out the "cannot fetch claims" warning, so the page cannot tell a stale copy. Wanted:
    `--offline` (or `listing(repo, cfg, fetch=False)`) that reads the refs as last fetched, so the polled page can use
    it on every poll; and the warning in the JSON (e.g. `{"docs": […], "warning": …}`).
36. **What a page needs about a family, as data.** In `intent list --json`: whether a child may be started on a
    dependency's branch now (`--on`): the app offers 「在 <DEP> 的分支上先做」 when `blocked_by == [DEP]` and DEP is
    `in_progress`, which is not quite `start_child`'s rule (blocked_by counts a merge into main, start only one into the
    parent's branch; start recomputes the dependencies from the split on the parent's branch); `blocked_by` with each
    dependency's state and owner (keys only now: the app joins them itself); on the parent its run branch (only on the
    children's `split.branch`); on a child its run branch, `built_on` and whether it asked for its merge (`mr`).
37. **`--json` for `brain claim`, `brain start --key`, `brain sync` (and `brain handoff`).** The app reads English text:
    the holder (`is claimed by X` / `was just claimed by X`), the branch (`Started … on …`), the worktree (`Worktree:
    …`), the files left with conflicts (`Merged … with conflicts left for you:`), the dependencies a start waits for
    (`depends on PAY-2 (unit api, claimed by alice), …`), and maps each refusal to Chinese by its words
    (`backend/core/family.py` RULES). Wanted: `{ok, code, holder, branch, worktree, built_on, conflicts, blocked: [{key,
    unit, state, owner}]}` and a code per refusal.
38. **`brain claim <KEY>` files a claim for any key, and `--release` of a claim nobody has prints success.** The app only
    claims a child `brain split` filed and checks the owner before a release. Wanted: claiming a key nobody filed only
    with a flag (`--new`); releasing a claim that is not yours exits 2.
39. **The split's network calls have no time limit and no prompt guard** (`common.git` in split, claims, intents,
    start_child, sync). The app runs these commands with `GIT_TERMINAL_PROMPT=0`, an askpass that answers nothing, ssh in
    batch mode and its own time limit (SIGINT first, so `start_child` gives the claim back, then SIGKILL). Wanted:
    `git_net`'s bounded calls there.
40. **A split preview of a ref.** `split.plan` needs the parent's branch checked out; `approved_split(mrdesc._Tree(…))`
    works on a ref but `_Tree` is private. The app runs `brain split --dry-run --json` in the parent's worktree on the
    person's click, and decides when to offer 拆成小需求 from Lean's DESIGN approval and unit-of-work.md being there.
    Wanted: `split.preview(repo, cfg, key, ref) -> {units, actions, warnings, problems}` (no fetch).
41. **The hook adapter's refusals are only in the session.** `[brain-kit] blocked (kit file…)`, `(kit files changed)`,
    `(kit files not checked)` (version 3) are mapped to Chinese with what to do (problems.py), but the app sees them
    nowhere: the adapter does not call Lean when it refuses, so nothing reaches the audit ledger. A session locked by
    changed kit files is invisible on the page. Wanted: an audit record (BLOCKED, gate `kit`) or a state file
    (`.aidlc-lean/kit-lock.json`) the app can read.
42. **The re-install lock.** After `brain install` (the 'kit' fix) the version-3 adapter refuses every tool call in that
    checkout until the new kit files are committed (it compares them with HEAD). The app commits right after its
    install; a person who runs `brain install` by hand meets the lock without a word. Wanted: `brain install` saying
    so, or the adapter accepting kit files equal to the copy brain-kit ships.
43. **The bridge's notices and outbox as data.** In team mode the app reads brain-kit's ledger tables `outbox` and
    `notices` to say why a run waits (`ciheld:<run>:<sha>` while the acceptance question waits for the pipeline,
    `runnerd-silent:<run>`, `gaveup:<send id>`, `queued:<run>` …); the key formats are internal. Wanted:
    `Ledger.run_notes(run_id) -> [{kind, at, text}]`, or the key prefixes as public constants.
44. **A send that did not land, in the app's KiroCrew adapter.** brain-kit's delivery sends a message again only when
    the slot read shows it idle (`running` false, `queue` empty) without that sendId. The app's adapter answers the
    slot's messages only (up to 1000 rows; whether KiroCrew 0.11.2's slot read without a limit is whole, and has
    `running` / `queue`, is not verified), so the bridge it hosts never resends by itself: a send not known to have
    landed stays `unknown` (the page says 要人看一下). Wanted: the slot read brain-kit relies on stated for the KiroCrew
    version (no limit, `running`, `queue`), then the adapter passes those fields.
45. **The new bridge.json keys in BRIDGE_DEFAULTS, examples/bridge.json and the docs.** `send_give_up_minutes` (60),
    `runnerd_wait_minutes` (90), `acceptance_ci_wait_minutes` (60), `edit_check_rounds` (3), `edit_check_wait_minutes`
    (30), `kit_ttl` are read where they are used, with their defaults in code; the 运行机 page lists them with these
    defaults copied. runnerd.json's `kit_dir`, `agent_spec`, `hook_path`, `git_timeout`, `clone_timeout`, `tries` have
    no loader at all. Wanted: the defaults in one place the app can read (`BRIDGE_DEFAULTS`, a `RUNNERD_DEFAULTS`), and
    both examples naming them.
46. **One n/m for a family.** `split.families` counts every child that is not closed (`progress.total`); eval's
    `families` counts the children that have a run (`total`), so `ready_to_release` can show while a unit was never
    started. The app shows both (the row's 已合并 n/m, the eval row's), each said where it comes from. Wanted: one
    meaning, or a field that says which.

### Nice-to-have

16. **Machine-readable bridge notes.** Partly done (`decisions.Q_HEAD_RE`, 48b6b97's `DESC_TITLE` for the 变更说明
    comment, which the app skips). The other notes are still parsed from their text (`mrinfo.py`): delivered, `作废：`
    (stale), `作废（…）` (void), refused, `无法发出`, `AI 接手被拒`, `AI 已接手`, and 9935b11's `D-n 收到了回答，但桥这一轮
    没能签名` (shown as answered: nobody answers again). 72b278e's conflict notes with held replies and its
    edited / cannot-tell feedback are not read (the question stays open). 0d52e97 (QA rounds 3 and 4) adds more, read
    the same way (`mrinfo.py`): 「D-n：GitLab 现在查不到回复有没有被别人改过…」 (held: nobody replies again), 「D-n 的
    回答（凭证 V-…）不知道送到 run 没有」, 「收到了回答，但桥这一轮没能把签好的回答存进 brain-intake」, and the run's own
    notes, which start with its run id: runnerd silent, runnerd retrying, 没能开始 (with the rejected label), KiroCrew
    not opening the session, 在排队, the hand-over send not known, sends that keep failing, the acceptance question held
    until the head pipeline is green (running, red, canceled / manual), a question nobody may answer. Wanted: a marker
    such as `<!-- brain-decision {"id", "run", "state"} -->` (and one for the run's notes), or regexes next to the texts.
17. **`evaluate.collect` contract.** The app maps `autonomy` (and, 72b278e, `runs[].correct == "wrong_open"` for an
    unmerged run whose acceptance was rejected), `delivery` (and `wrong_open`), `judgment`, `repeat_rate`, `useful`,
    `staleness.total`, `cost.per_success` and `cost.note`, `skipped`, `funnel.counts` and `funnel.unclassified`, and
    `review_queue`; 0d52e97: `batch` (each run's state, stuck, autonomous, beyond with `runner_failed` /
    `closed_unmerged`, delivery, a child's `parent`), `families`, and brain-kit's own words for them
    (`evaluate.STATE_LABEL`, `FAMILY_LABEL`, `DELIVERY_LABEL`: used when present, the app keeps a copy for an older
    brain-kit). Still wanted: a documented, stable shape (ideally `metrics: [{id, label, value, rule}]`).
31. **Intake review findings as data** (new, 72b278e). The dry run's report has the 请你确认 hits only inside each
    file's finding line; the app takes them out with a pattern of brain-kit's text (`请你确认 N 处（…）：「…」`) to list
    them per file. Wanted: `report["review"] = [{"file", "count", "quotes"}]`.
18. **`golden.run(jobs, runner)`.** Wanted: the runner callback documented, so the app can dispatch golden jobs as Kiro
    Crew sessions (not done yet).
19. **Decision and run states.** Mostly done: decision states are listed in a comment in `decisions.py` (72b278e adds
    `asking`, shown like `posting`); run states are `OPEN_RUN_STATES` plus `RESERVED`; `process()` results are listed
    in its docstring; 0d52e97 adds `ledger.OUTBOX_STATES` (sending, interrupted, sent, unknown, dropped). The app labels
    them all (run: signing, spooled, ready, dispatched, send_unknown, failed (0d52e97: also a hand-over KiroCrew never
    took), merged, closed). Wanted: public tuples `DECISION_STATES`, `RUN_STATES` and `HANDOFF_RESULTS`.
20. **Kit and identities caching.** Partly done in 0d52e97: the bridge reads kit.json from main again after `kit_ttl`
    (0: every round) and the identities when their file changed. The signer's Bridge does too; what the signer reads
    itself (its projects, the kit's bridge_user pin) still needs a restart.
33. **`brain doctor --offline` says "no origin remote"** (new). With `--offline` (no fetch) and an origin that is there,
    doctor still prints `WARN no origin remote: Brain freshness not checked`; the app shows doctor's rows verbatim
    after an install, so the person reads that the repo has no origin. Wanted: `WARN offline: Brain freshness not
    checked` (and the origin check apart from the fetch).

## Note for the next brain-kit

The app's tests pass against a clean checkout of 0d52e97 (its vendor/aidlc-lean from the checkout's submodule) and of
48b6b97 (the split tests skipped there); the identity tests take the clean clone as the brain-kit with 91e2fee's
login-name rule when it has it, else a copy of 48b6b97 with the rule applied. The
fake GitLab serves GraphQL's edit marks the way they were measured on a self-managed GitLab (lastEditedBy only for a text
edit) and the edit of a note by its own author (48b6b97's 变更说明 comment); the runner's test commits are now really
the bot account's (they were the test person's), which 72b278e's hand-over rule reads. Run the app's tests again
against the next commit.
