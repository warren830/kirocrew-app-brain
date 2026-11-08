# Brain 交付: brain-kit on Kiro Crew

A Kiro Crew app for [brain-kit](../brain-kit): claim a requirement, take its documents through the five gates,
develop it with AI-DLC Lean in a `brain-dev` session, hand it over to the team runner, follow its questions (D-n on
the GitLab MR), and keep the team's in-repo Brain. On the team runner the same app hosts brain-kit's bridge loop and
runnerd, and dispatches the runs into `brain-run` sessions.

**Started from the aws-samples app.** This app was started from the sample app
`samples/agent-team-on-kiro-crew/app` of
[sample-ai-for-software-engineering-on-aws](https://github.com/aws-samples/sample-ai-for-software-engineering-on-aws)
(commit `8674f15`), MIT No Attribution, Copyright Amazon.com, Inc. or its affiliates (see `LICENSE`). The first
commit of this repo is that copy, unchanged.

| Kept from the sample | Dropped (it stays in the sample) |
| --- | --- |
| `backend/core/gateway.py` (Kiro Crew HTTP API with the app secret, loopback only), `sessions.py` (chat slots in sidebar folders, project dir, `trust` per slot, idle detection, resend on start errors, credits), `httpkit.py` (owner-only routes), `store.py` (append-only log, now the app's own events), the bootstrap in `backend/routes.py` / `hooks.py`, `scripts/dev-install.sh`, `scripts/kcapi.sh`, the test fakes (`tests/http_fakes.py`, the fake gateway), and the UI shell: AppBar, URL navigation, SDK stubs, polling rules, preview build | The agent-team engine: team files, roles, packs, starters, the taoyuan demo, the CTO history, the team board, checks/deploy/site |

Added to the session runner: `strict_agent` (a session boots exactly the template `brain-dev` / `brain-run`, or is
not opened: Crew's default agent would run without Lean's hooks), exact slot names (the bridge names runner slots
after the run id), deliver-once sends (no resend, no nudge), per-slot credits over the whole transcript, and the
bridge's KiroCrew surface (`adapter_create / set_project / send / slot / stop`).

## Views (UI text is Chinese)

| View | What it shows | Where it comes from |
| --- | --- | --- |
| **交付总览** | Every requirement: claimed, local, handed over, running on the runner, parked with D-n, waiting acceptance, merged; owner, Lean stage n/11, what it waits on (with the exact approval line), credits, overlap warnings; Eval numbers and the low-score queue (复看队列); the decision funnel | git refs (`claim/*`, run branches, the default branch), worktree files, run.json, park.json, the Lean ledger; `brainkit.evaluate` when present; the bridge ledger in team mode; the MR via GitLab (person's token) |
| **需求详情** | Lean's 11 stages and approvals, Session notes, decisions with their Brain citations, parked questions and answers (MR link), the run trace timeline, the sessions this app opened with their credits, Brain usage | `brainkit.trace.build` (else the Lean ledger), decisions.md, `sessions.slot_stats` |
| **开需求** | The form: repo, title, slug, key, expected paths; the five gates (consent, classification incl. 不确定, business keep/mask, exclude globs); 先检查 shows brain-kit's dry-run findings verbatim; 开工 runs `brain start` and opens a `brain-dev` session in the run's own worktree | `brainkit.intake.package.build(dry_run=True)`, `bin/brain start` |
| **Brain** | Entries by file and section with type, sources, usage counts and withdraw candidates; lint; reflect preview, apply on a new branch, apply and open the MR | `brainkit.entries`, `usage`, `brainlint`, `reflect`; `bin/brain reflect --apply [--push]` |
| **待办** | Lean approvals pending (the line the person types in that session), D-n questions on the runner (link to the MR), the person's own clarify questions (answer here), acceptance, refused hand-overs, Kiro Crew problems | as above |
| **运行机** (team mode) | The bridge ledger, runs, signature requests waiting for the signer and the ones it refused | the hosted bridge, the signer spool |
| **设置** | brain-kit checkout, repos, work root, team mode; Kiro Crew checks with their fixes | `settings.json` in the app's data dir |

The app never sends a Lean approval line: it shows it, copies it, and opens the session; the person types it. On the
team runner's dashboard no question is answered (answers are made on GitLab, where the person is identified). On a
person's machine, a clarify question of their own run may be answered in the app: into the local session (a local
run), or as their own MR comment `answer D-n X` with their own token (a handed-over run; the bridge checks it as any
other). A question that carries a Lean request is never answerable in the app.

## How it works

- **brain-kit is a library**, imported from the configured checkout under a private package name
  (`_brainapp_brainkit`, nothing on `sys.path`); it is never edited. Optional modules (`trace`, `evaluate`, `golden`,
  `intents`) are guarded: a missing one turns its feature off and the page says so. Wishes for brain-kit:
  `BRAINKIT_REQUESTS.md`.
- **Each requirement gets its own worktree** under `~/workplace/brain-app/<repo>/<slug>` (`git worktree add
  --detach`, then `brain start` in it), so several requirements can be open on one machine and each `brain-dev`
  session has its own project directory. Kiro Crew lets agents work under `~/workplace` / `~/workspace` only.
- **Lean is read, never run**: stages and pending approvals come from `aidlc-docs/audit/*.jsonl` and the files
  (`lean status` would rewrite aidlc-state.md, and the project's `.kiro/aidlc-lean/` is agent-writable).
- **Startup checks** (and fixes on click): `~/.kiro/agents/brain-dev.json` carries Lean's three hooks
  (SessionStart, UserPromptSubmit, PreToolUse via `.kiro/brain/lean-hook.py`), the engine `agent.acp_backend` is
  `kas`, every repo has `.kiro/brain/lean-hook.py`. The fixes install brain-kit's `crew/brain-dev.json` (an existing
  different file is kept as `.bak-<time>`) and run `kirocrew config set agent.acp_backend kas`.
- **Team mode** hosts `brainkit.bridge.handoff.Bridge` (poll → dispatch → watch → collect → reconcile) and
  `brainkit.bridge.runnerd.once` as a background task (`on_startup` / `on_shutdown`), on one worker thread (the
  bridge's sqlite ledger is per thread). Sessions go through `team/crewadapter.py` (brain-kit's KiroCrew surface:
  `create_slot`, `set_project`, `send`, `slot`, `stop`) into the app's session runner, not brain-kit's HTTP client.

## Security

The app runs as the same OS user as the agent sessions, and agents have a shell. So:

- **Signing is not the app's.** The bridge's private key stays with `signer/brain_signer.py`, a small separate
  process (another OS user in production, `brainbridge`). The app writes signature requests into
  `<spool>/requests/`; the signer checks each one again against GitLab with brain-kit's own code and its own
  identities, ledger and token (hand-over: `Bridge.verify` + every voucher field; answer: the question posted by the
  bridge account, the first valid `answer D-n …` by an allowed person, no conflict, park.json unchanged, one answer
  per question) and answers in `signed/` or `refused/`. The app accepts a signature only if the signed voucher is
  exactly the one it asked for and verifies against `allowed_signers`. In the app's private brain-kit copy,
  `sign.sign` is replaced by this spool client; nothing else is patched. A signer that does not answer leaves the
  hand-over to the next round; a refusal rejects the hand-over on the MR (or marks the answer `refused`) with the
  reasons. Team mode refuses to start when this OS user can read `signing_key` (setting `dev_same_user` allows it for
  a local trial, shown as a warning).
- **No listening sockets**: routes only under `/api/apps/brain` on the loopback gateway; every route but `/health`
  is the dashboard owner's only (an app token, this app's included, is refused). Outbound only: the loopback gateway,
  GitLab (`brainkit.rest`), git.
- **No secrets out**: the GitLab token is read like `brainkit.rest.read_token` (`$GITLAB_TOKEN`, else
  `~/.brain/gitlab-token`, refused when others can read it) and never logged, stored or returned; agent-written text
  on its way to the page goes through Kiro Crew's scrubber; materials stay in the intake store (never in a repo).
- The brain-kit checkout and the app directory run inside the gateway: in production they must not be writable by
  the agents' OS user.
- On a person's machine the `brain-dev` agent runs as that person and can read their GitLab token file anyway: the
  app's answer route adds no power it lacks, and it only answers clarify questions (never a Lean approval). The real
  gates stay where brain-kit puts them: the bridge's checks, the signer, CI and GitLab approvals.

## Install (a person's machine)

1. **brain-kit** checkout, and in each project `brain install <repo> --prefix PAY` (commit `.kiro/`, `.brain/`,
   `aidlc-docs/`, `brain/`, `AGENTS.md`). On this machine: `git config brain.user <gitlab user>`, the GitLab token in
   `~/.brain/gitlab-token` (`chmod 600`), `git config brain.intake <brain-intake clone>` (see brain-kit's
   `docs/安装和使用.md`).
2. **Trust the app yourself**: Kiro Crew settings → trusted apps → add `brain` (`agent.apps_trusted`). Kiro Crew
   refuses to enable an untrusted third-party app; the install script does not trust it for you.
3. **Install**: `scripts/dev-install.sh --consent-session-approval` (builds the UI with node 22+, installs or updates
   the app, enables it; the flag gives your consent to `permissions.sessionApproval`, which lets the app set the
   sessions it opens to trust; without it, click Enable in the dashboard and grant it there). Re-run after changes:
   it disables, updates and enables (backend hooks are re-imported on enable only).
4. **In the app → 设置**: the brain-kit checkout (`$BRAINKIT_HOME` or a usual place is found by itself), the project
   repos, the work root. Then fix what the Kiro Crew check lists (brain-dev with Lean's hooks; engine `kas`; a new
   session is needed for a new brain-dev spec, and a Kiro Crew restart may be needed for the engine).

## Install (the team runner)

1. OS users as in brain-kit: `brainbot` (Kiro Crew with this app, runnerd), `brainbridge` (the signer), group
   `brainspool`. `~/.kiro/agents/brain-run.json` for `brainbot` (brain-kit `remote/agents/brain-run.json`).
2. **The app's bridge.json** (brain-kit's format, `examples/bridge.json`): `projects`, `gitlab` (base, token for an
   account with Reporter rights: it comments and labels, it must not be able to merge or push), `identities`
   (readable by the app, writable only by `brainbridge`), `ledger`, `spool_dir` (runnerd's spool), `vouchers_dir`
   (an app-local copy; brain-intake is written by the signer only), `runner_runs_root`, `kirocrew.agent: brain-run`,
   `pseudonym_salt`. No `signing_key` (if present it is ignored; readable, team mode does not start).
   `publish_vouchers` is forced off.
3. **runnerd.json** (brain-kit's format) with the same `spool_dir`; `allowed_signers` = the bridge's public key.
4. **The signer**: `signer/signer.example.json` → `/etc/brain-kit/signer.json` (same `pseudonym_salt`;
   `bridge_users` = the GitLab account of the app's token; its own identities copy, GitLab token, ledger, the signing
   key), `signer/brain-signer.service` as `brainbridge`. Spool permissions: `requests/` writable by `brainbot`,
   `signed/` and `refused/` by `brainbridge` only. A run that will never finish is closed on the signer with
   `brain_signer.py --config … close RUN-…`.
5. **In the app → 设置 → 运行机模式**: bridge.json, runnerd.json, the signer spool, allowed_signers; turn it on.

## Code map

| Path | What it is |
| --- | --- |
| `app.json` | The manifest: `brain`, page `/apps/brain`, `permissions.api` `/api/apps/brain` and `/api/chat` only, `sessionApproval` |
| `backend/core/service.py`, `handlers.py` | The service object (settings, repos, sessions, team mode, every view) and the routes |
| `backend/core/bk.py` | brain-kit, loaded from the configured checkout under a private name; guarded optional modules |
| `backend/core/repo.py`, `lean_view.py` | Requirements found in a repo (claims, run branches, worktrees, main); Lean's stages, approvals, Session notes |
| `backend/core/deliveries.py`, `detail.py`, `todo.py`, `mrinfo.py` | 交付总览, 需求详情, 待办, the MR on a person's machine |
| `backend/core/intake.py`, `crewcheck.py`, `brainview.py` | 开需求, the Kiro Crew checks and fixes, Brain and reflect |
| `backend/core/team/` | Team mode: the hosted bridge (`bridgehost.py`), the KiroCrew adapter, the spool signer client |
| `backend/core/gateway.py`, `sessions.py`, `httpkit.py`, `store.py` | Kept from the sample (see above) |
| `signer/` | The separate signer, its example config and systemd unit |
| `ui/src/` | The page: `main.tsx`, `AppBar.tsx`, `nav.ts`, `views/*`, the contract `types.ts`; `ui/preview/` on the fixtures |
| `tests/` | Backend tests: real brain-kit projects in temp dirs, the fake Kiro Crew gateway, a fake GitLab, the real signer |

## Host APIs relied on (Kiro Crew 0.11.2)

`POST /api/apps/brain/token` (app secret → 5-minute token); `GET/POST /api/chat/folders`, `PATCH
/api/chat/folders/<id>`; `GET/POST /api/chat/slots` (`agent`, `agent_kind: template`, `model`, `memory_mode`,
`folder_id`), `GET /api/chat/slots/<key>?limit=`, `POST /api/chat/slots/<key>/project`, `POST
/api/chat/slots/<key>/stop`, `DELETE /api/chat/slots/<key>`; `POST /api/chat/mode` (`trust` for one slot,
`permissions.sessionApproval`); `POST /api/chat?ws=1` (`meta.sendId`); assistant rows' `meta.turn_stats.credits`;
the backend hooks (`routes`, `on_startup`, `on_shutdown`), `ctx.name / logger / data_dir / scrub`, KiroCrew's owner
predicate; the UI host modules `@kirocrew/app-sdk` (`useAppApi`, `useNavigate`, `useNavBadge`) and its import map.

## Test

```bash
python3 -m pytest -q                     # backend (Python 3.9+, pytest, git, ssh-keygen, the brain-kit checkout)
(cd ui && npm ci && npm run check)       # UI: type check, component tests, build
(cd ui && npm run preview:build)         # ui/preview-dist/index.html: the page on the fixtures, no Kiro Crew
```

`BRAIN_TEST_BRAINKIT` points the backend tests at a brain-kit checkout (default `~/warren_ws/brain-kit`).

## Not verified on a live Kiro Crew yet

Opening a `brain-dev` slot with `agent_kind: template` and a worktree under `~/workplace` as its project; that the
template's hooks run in such a slot; `trust` for it; credits in `turn_stats`; the bridge's runner sessions; the
`kirocrew config set` fix while the gateway runs; the page in the dashboard; the signer against a real GitLab.
