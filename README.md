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
| `backend/core/gateway.py` (Kiro Crew HTTP API with the app secret, loopback only), `sessions.py` (chat slots in sidebar folders, project dir, `trust` per slot, idle detection, resend on start errors, credits), `httpkit.py` (owner-only routes), `store.py` (append-only log, now the app's own events), the bootstrap in `backend/routes.py` / `hooks.py`, `scripts/dev-install.sh`, `scripts/kcapi.sh`, the test fakes (`tests/http_fakes.py`, the fake gateway), and the UI shell: AppBar, URL navigation, SDK stubs, polling rules, preview build. The UI's look: the team board's styles, particle engine and overlay, role icons and hooks (`ui/src/board/styles.ts`, `engine.ts`, `overlay.ts`, `hooks.ts`, `RoleIcon.tsx`: copied), its graph, lanes, conveyor, test wall, event feed, sign-off card and replay (redrawn for one requirement's way), the CTO view's styles and charts (`ui/src/cto/`), the card frame (`ui/src/kit.ts`) | The agent-team engine: team files, roles, packs, starters, the taoyuan demo, the CTO history (its numbers are brain-kit's eval here), checks/deploy/site |

Added to the session runner: `strict_agent` (a session boots exactly the template `brain-dev` / `brain-run`, or is
not opened: Crew's default agent would run without Lean's hooks), exact slot names (the bridge names runner slots
after the run id), deliver-once sends (no resend, no nudge), per-slot credits over the whole transcript, and the
bridge's KiroCrew surface (`adapter_create / set_project / send / slot / stop`).

## Views (UI text is Chinese)

| View | What it shows | Where it comes from |
| --- | --- | --- |
| **交付总览** | The sample's CTO view: one sentence and three numbers from brain-kit's eval (how many handed-over requirements ran unattended end to end, how often a person stepped in at the judgment points against outside them, credits per requirement), each with its small chart, and who settled the decisions (the funnel); 每周合并 (12 weeks, by how they were delivered, 图 / 表格); 需求流动, the kanban of what is in progress (columns 需求 → 设计 → 构建 → 交给运行机 → 发布 · 验收 → 已合并, lanes 等人批准 / 等人回答问题 / AI 在做（本机） / 运行机在做; a card opens the requirement's 需求看板); 交付清单, the ledger with the eval batch's summary rows. Every requirement: claimed, local, handed over, running on the runner, parked with D-n, waiting acceptance, merged; owner, the current Lean stage n/11 (`lean` and the row's `stage` text, e.g. `2/11 需求分析`, `11/11 发布（下一步）`, `11/11 发布（做完）`: the same stages the detail lists, null only before Lean recorded one), what it waits on (with the exact approval line; a hand-over that was pushed but whose MR carries no hand-over label says that nothing was handed over), the first line of its 变更说明 (`summary`, made in the background), credits, overlap warnings; Eval numbers, the runs Eval skipped and its notes (also the runs known wrong that wait for their merge: autonomy's `wrong_open`), and the low-score queue (复看队列); the decision funnel, with the decisions.md rows whose Who is not in the vocabulary (没归类) | git refs (`claim/*`, run branches, the default branch), worktree files, run.json, park.json, the Lean ledger; `brainkit.evaluate` when present; `brainkit.mrdesc`; the bridge ledger in team mode; the MR via GitLab (person's token) |
| **需求看板** | One requirement as the sample's team board: the hero graph of who acts on it (you, the local `brain-dev` session, Lean's approvals REQUIREMENTS / DESIGN / RELEASE, the hand-over, the bridge, the signer, the runner session, the CI checks, the write-back into the Brain) with each one's state in colour, shape and words, the person's line to whoever waits on them, the run branch as a rail with its commits and the check ring; KPIs; 验收 (the 变更说明, the decisions and who made them, the checks, the one step a person takes: the line to type, the MR to answer on); 提交传送带 (commits, the hand-over, the merge); a lane per actor on one time axis; 检查墙 (Lean approvals, verify, the hand-over, the Brain and the repo's kit, after the merge); open questions; the event feed. Polled every 2 s. 回放 plays a finished requirement's trace (1× / 2× / 4×, scrubber; the URL says `replay=1`) | `GET /board/{repo}/{key}`: `backend/core/board.py` folds `brainkit.trace.build`, the Lean audit events, the run branch's commits, park.json, the MR and the app's sessions into one snapshot |
| **需求详情** | The sample's 交付详情 layout: 周期, 时间花在哪, 成本, 检查; 价值流 (AI on this machine, the runner, waits for people, rework, with the key moments); Lean's 11 stages and approvals, Session notes, decisions with their Brain citations and who settled each (brain-kit's Who vocabulary: `agent` or a bot user, `brain <entry id>`, `check`, `<P-xxxx> <V-xxxxxxxxxx>`, `owner`; anything else is 没归类 and not shown, it may be a real name), parked questions and answers (MR link), the MR's 变更说明 (its first line, the whole Markdown folded, 复制 for the MR description), the run trace timeline (a commit's author date, and its commit date when it differs; how it was merged, in words), the sessions this app opened with their credits, Brain usage | `brainkit.trace.build` (else the Lean ledger, its audit files shown as `L-<6 hex>.jsonl` like brain-kit's), decisions.md, `sessions.slot_stats`; the 变更说明: `runs/<KEY>/MR.md` at the commit when the branch has it, else `brainkit.mrdesc.build` / `render` at that commit |
| **开需求** | The way in five steps, then the form: repo, title, slug, key, expected paths (separated by commas, spaces or new lines); the five gates (consent, classification incl. 不确定, business keep/mask, exclude globs); 先检查 shows brain-kit's dry-run findings verbatim, and what may be a name or a password but may as well be a word (brain-kit's review findings, not masked, stopping nothing) once more per file under 请你确认; 认领人, the name brain-kit will claim it with (开工 waits for 「你的 GitLab 用户名」 when brain-kit would not know); 开工 runs `brain start` and opens a `brain-dev` session in the run's own worktree | `brainkit.intake.package.build(dry_run=True)`, `bin/brain start` |
| **Brain** | Entries by file and section with type, sources, usage counts and withdraw candidates; lint; reflect preview, apply on a new branch (the reply names the branch and the worktree brain-kit wrote it in, `~/.brain/worktrees/<repo>/…`), apply and open the MR | `brainkit.entries`, `usage`, `brainlint`, `reflect`; `bin/brain reflect --apply [--push]` |
| **待办** | Lean approvals pending (the line the person types in that session), D-n questions on the runner (link to the MR), runner questions stuck for good (the signer refused the answer, the question is void or could not be asked), the person's own clarify questions (answer here), acceptance, refused hand-overs, hand-overs pushed without their label (没交出去的交接), Kiro Crew problems | as above |
| **运行机** (team mode) | The bridge ledger (questions in brain-kit's states, `asking`: a bridge posting it right now), what the bridge said about each labelled MR last round (接手了, 拒绝接手, 看过了, 标签刚被拿掉 = `unlabelled`, 正在别处签名 = `waiting`, 这一轮没查成), runs in brain-kit's states (`signing`: the run id reserved while the signer signs the contract), signature requests waiting for the signer, the ones it refused, and vouchers it has not answered yet (asked for again, the same voucher, next round) | the hosted bridge, the signer spool |
| **导入仓库** | How a repo gets into the app (the bar's button, and every place that has no repo: 交付总览's empty state, 开需求, 设置's 仓库 card). 本机目录 or 克隆; 检查 (✓ / ! / ✗ with why and what to do, 你是谁 among them); not installed: the kit.json form and 安装, by default in place on the checkout's branch (usable at once), or on a new branch for an MR when that is the better way (each way one line, the recommended one marked); 推送 / 推送并开 MR only after a confirm; a branch install's 合并到 main and 拉取; 加入列表 | `/import/*` (backend/core/importer.py, installer.py, inplace.py, landing.py), `imports.json` / `upgrades.json` in the app's data dir |
| **设置** | brain-kit checkout, work root, team mode; the repos with 移出列表 (the app's list only), 导入仓库 and, per repo, 你是谁 (the name brain-kit goes by there, or 「你的 GitLab 用户名」 / 「你的名字」 when it would not know); Kiro Crew checks with their fixes (and, per repo, Lean's lean.json leaving `runs/**` out of its code fingerprint; an old hook adapter, which matters only for a repo that hands over to the team runner: ! there, not 有问题, with 重装 kit 文件) | `settings.json` in the app's data dir |

Every view uses the sample's components: cards, state chips, role icons, the progress as segments and charts, and
empty states that say what to do. Above every view (but 开需求 and 设置, which list them themselves) KiroCrew's failing
checks, each with its fix button. The preview (`npm run preview:build`) shows a world made by
`scripts/preview_world.py` with the backend's own `board.py` and `cto_numbers`: four repos, seventeen requirements in
every state (one waiting for an approval, one parked on a question, one waiting for its acceptance, a refused
hand-over, one running on the runner, merged ones with whole traces for 回放, a local-only repo with an old adapter).

The app never sends a Lean approval line: it shows it, copies it, and opens the session; the person types it. On the
team runner's dashboard no question is answered (answers are made on GitLab, where the person is identified). On a
person's machine, a clarify question of their own run may be answered in the app: into the local session (a local
run), or as their own MR comment `answer D-n X` with their own token (a handed-over run; the bridge checks it as any
other). X is one of the question's options, or `approve` / `reject` for a question without options (brain-kit counts
nothing else). A question that carries a Lean request is never answerable in the app.

The routes' JSON is `ui/src/types.ts`. `GET /overview` adds `cto` (the sentence, the three numbers, the runs and the
weeks: `deliveries.cto_numbers`); `GET /board/{repo}/{key}` answers one requirement's `ReqBoard`. `POST /intake/start` takes `paths` as a list (one path per item) or as one
string with the paths separated by commas, spaces or new lines (`"calc.py,tests"`); each must be a relative path in
the repo. `POST /brain/reflect/apply` answers `{ok, output, branch, worktree}`. `POST /settings` takes any part of the
settings: a key left out keeps its value (the 设置 form sends no `repos`; the list is changed by `POST /import/add`
and `POST /repos/remove` only). The import routes: `GET /import/defaults`, `POST /import/inspect {path}` (read only),
`POST /import/choices {path, purpose?}` (where an install or a kit update goes: `inplace` or `branch`, each with one
line, the recommended one, and why a way cannot be taken), `POST /import/clone {url, parent, name}`, `POST
/import/install {path, mode?, branch?, kit}` and `POST /import/upgrade {path, mode?, branch?}` (the 'kit' fix below;
all three answer `{job}`; `GET /import/jobs/{id}` until it is not running; no `mode`: the recommended one), `POST
/import/commit {path, purpose?}`, `POST /import/publish {path, branch, target, remote_url, confirm: true, purpose?}`,
`POST /import/push {path, branch, remote_url, confirm: true}` (the checkout's branch after an install in place or a
local merge), `POST /import/merge {path, confirm?, purpose?}` (「合并到 main」: a fast-forward; `confirm: true` for a
repo with a remote), `POST /import/pull {path}` (「拉取」: `git pull --ff-only`), `POST /import/add {path}`, `POST
/repos/remove {path}` (`purpose`: `install`, the default, or `upgrade`); and `POST /me/name {path, name}` (`git
config brain.user <name>` in that repo, brain-kit's USER_RE). Every
check row (`CheckRow`) is said in plain short Chinese with a 做什么 line, its fix and brain-kit's own words (`raw`,
shown folded): `backend/core/problems.py`.

## How to import a repo (导入仓库)

1. Click **导入仓库** (top right; with no repo yet, 交付总览 and 开需求 show it big).
2. **从哪来**: 本机目录, the path of a checkout (a subfolder or one of its worktrees is fine: the app uses the repo's
   top level, or the main checkout of a worktree). Or 克隆: the git URL (SSH or https, never with a password or token
   in it), the folder it goes under (default `~/workplace`, never inside the work root), its name. The clone runs in
   the background with no prompt (an SSH key or certificate that has expired fails at once: refresh your SSH
   credentials, e.g. `mwinit`, and retry); the new folder is checked next.
3. **检查** (read only): repo top level, git, current and default branch (origin/HEAD, else main / master), origin and
   the GitLab project it suggests, uncommitted changes (they do not matter: nothing touches your checkout),
   brain-kit (`.brain/kit.json`, committed, on the default branch), AI-DLC Lean, the Brain files, AGENTS.md, the Kiro
   Crew checks (with their fix buttons), already in the list. Each row says why and what to do.
4. **Already installed**: **加入列表**. That is all.
5. **Not installed**: check the kit.json values `brain install` asks you to check (key prefix, tracker, GitLab base and
   project, prefilled from origin, default branch, team), then **安装**. Where it goes:
   - **直接装在 <当前分支>** (the default, the way brain-kit's own CLI is used): `brain install` in your checkout, the
     values into `.brain/kit.json`, `brain doctor --offline`, and one commit on the branch you are on, with your own
     git identity and hooks, of exactly the files the install wrote: your own uncommitted changes are neither
     committed nor touched (`git commit --only` of those paths). Usable at once: nothing waits. It is refused, with
     one line why, when the checkout is on no branch, in the middle of a merge, rebase or cherry-pick, or has
     uncommitted changes in a file `brain install` writes (`.gitignore`, `AGENTS.md`, `.kiro/…`, `.brain/…`,
     `aidlc-docs/…`, the Brain): then only the new branch is offered. It never pushes by itself: a repo with a remote
     gets a **推送** button that first says which branch goes where.
   - **装到新分支，开 MR 给团队看** (recommended for a repo with a remote, offered when the checkout has uncommitted
     changes): branch `brain/install` (you can rename it) from `origin/<default branch>` in its own worktree,
     `<work root>/<repo>/_brain-install`; your checkout is not touched. The same install, doctor and commit there.
   Your git hooks run on the commit (nothing is bypassed): if one says no, the page shows what it said; fix it and
   click **再提交一次**.
6. **推送并开 MR** (a new branch, optional): the page first says exactly which branch goes where (`brain/install` →
   origin's URL, the MR `brain/install` → `main` on the GitLab project); after **确定推送** the branch is pushed (no
   force) and the MR opened with your GitLab token (`$GITLAB_TOKEN` or `~/.brain/gitlab-token`, as the app reads MRs),
   its description a list of what the install adds. Without a token or a GitLab project: the exact `git push` / `glab
   mr create` commands and GitLab's new-MR link.
7. **A branch install's way forward** (in 导入仓库, and on the repo's row in 设置 and 交付总览): **合并到 main**, a
   fast-forward (`git merge --ff-only`) when your checkout is clean, on the default branch, and the default branch is
   still where the install branch started (else one line why: e.g. it moved on, so install in place instead); then the
   install worktree (`git worktree remove`, never forced) and the merged branch go. A repo without a remote is never
   shown as waiting for a merge: its row says 「还没合进 main」 with that button. With an open MR its link comes first
   (merging there is the team's way); a local merge in a repo with a remote asks first that the remote does not have it
   until you push, and is offered in 导入仓库 only (its 推送 stays on the page). After the MR was merged on GitLab:
   **拉取** (`git pull --no-rebase --ff-only`, no prompt, a time limit) when the checkout is clean and on the default
   branch. **加入列表** works before all that: the repo shows what it waits for, not an error. The background check
   (every 30 s) clears an install record nothing waits for any more (kit.json on the default branch in the checkout,
   the install branch or worktree gone); it deletes nothing on disk.
8. **移出列表** (设置 → 仓库) takes a repo off the app's list only: no file, branch or worktree changes.

## How it works

- **brain-kit is a library**, imported from the configured checkout under a private package name
  (`_brainapp_brainkit`, nothing on `sys.path`); it is never edited or patched. It must be commit `72b278e` or newer
  (the spool signer, `check_answer` bound to the recorded question note, the question's commit and park hash, the
  hand-over commit rule, run reservations and pending vouchers, the agent-spec hook functions; 72b278e: the edit
  signal, `GitLab.note_edits`, `decisions.edit_state`, `DecisionLoop.reply_states`): an older checkout is refused with
  a message saying what it lacks. Tested on `48b6b97` (`runs/<KEY>/MR.md` in the hand-over commit, the bridge's
  变更说明 comment). Optional modules (`trace`, `evaluate`, `golden`, `intents`, `mrdesc`) are guarded: a missing one
  turns its feature off and the page says so. Wishes for brain-kit: `BRAINKIT_REQUESTS.md`.
- **The 变更说明** (brain-kit's `brain mr-desc`) is always read at a commit: the row's (a worktree's or a branch's
  tip, the default branch once merged, the runner workspace's HEAD). `runs/<KEY>/MR.md` when that commit has it (a
  regular file, at most 4 MB; a symlink is not read), made inert with `mrdesc.inert` and cut to 60000 characters as
  the bridge does; else `mrdesc.build(ref=<commit>, credits=…)` / `render`. Never the working tree: `build` there
  would run the project's own Lean (agent-writable) for its code fingerprint. Results are kept by (folder, commit,
  default branch commit, credits); the overview's first lines are made in one background thread. 复制 copies the
  inert text, for the MR description; nothing is posted by the app.
- **Each requirement gets its own worktree** under `~/workplace/brain-app/<repo>/<slug>` (`git worktree add
  --detach`, then `brain start` in it), so several requirements can be open on one machine and each `brain-dev`
  session has its own project directory. Kiro Crew lets agents work under `~/workplace` / `~/workspace` only.
- **Lean is read, never run**: stages and pending approvals come from `aidlc-docs/audit/*.jsonl` and the files
  (`lean status` would rewrite aidlc-state.md, and the project's `.kiro/aidlc-lean/` is agent-writable).
- **Startup checks** (and fixes on click), with brain-kit's own functions: `~/.kiro/agents/brain-dev.json` carries
  Lean's three hooks (SessionStart, UserPromptSubmit, PreToolUse via `.kiro/brain/lean-hook.py`) under the right
  triggers (`cli.missing_lean_hooks`, which reads both the original `{"hooks": {"agentSpawn": [...]}}` and the list Kiro
  rewrote every spec into on 2026-11-08, `[{"name", "trigger", "action": {"type": "command", "command"}, ...}]` with a
  top-level `kiroUpgrade`); the engine `agent.acp_backend` is `kas`; every repo has Lean and the hook adapter committed
  (`cli.runner_kit_problems`: worktrees are made from main). The agent fix never rewrites a spec: no file, brain-kit's
  `crew/brain-dev.json` is installed; a file that lacks some of Lean's hooks gets only those (`cli.add_lean_hooks`, in
  the file's own format), and everything else stays (other tools' hooks such as Orca's, `kiroUpgrade`, every other
  key), with the old file kept as `brain-dev.json.bak-<time>`; a file that is not valid JSON is left for the person to
  fix or remove. A spec that differs from brain-kit's in other ways is fine (72b278e: an OK row names the fields you set
  yourself; `brain crew-agent --reset` takes brain-kit's, `--force` only adds what is missing). The engine fix runs
  `kirocrew config set agent.acp_backend kas`. Per repo, the check also FAILs when Lean counts `runs/**` as code
  (`mrdesc.write_problem`: lean.json `fingerprint_exclude`) and (d46765f) when the committed adapter is too old for the
  team runner (`crew_hook_problem`). Those two matter to the runner only: FAIL for a repo handed to it (kit.json
  `bridge_user`, or a requirement with a hand-over), a reminder (WARN, no 待办 item) for a local-only one; not
  committed is FAIL everywhere. Their fix ('kit', 重装 kit 文件) is `POST /import/upgrade`, where 安装 goes: in place
  by default (`brain install` in the checkout, kit.json kept, the kit files refreshed, runs/** added to lean.json,
  `brain doctor`, the person's commit of only those paths on their branch; 推送 when asked), or a new branch
  (`brain/upgrade-kit`, -2 … when taken) from the default branch in its own worktree, the same there, then 推送并开 MR
  with `purpose: upgrade` (or 合并到 main without a remote); nothing to change takes back what it wrote. Its records
  are `upgrades.json`, apart from the install's.
- **Team mode** hosts brain-kit's own `bridge.handoff.Bridge` (poll → dispatch → watch → collect → reconcile) and
  `bridge.runnerd.once` as a background task (`on_startup` / `on_shutdown`): bridge.json is read by brain-kit's
  `load_bridge_config`, and the bridge runs with `signer=` brain-kit's `sign.SpoolSigner` (bridge.json's `signer`
  block) and no key. Rounds run one at a time on the runtime's own worker thread; the page reads the same brain-kit
  `Ledger` from other threads (one shared connection, `Ledger.lock` around a multi-table read), and stopping closes it
  with `Ledger.close()`. Sessions go through `team/crewadapter.py` (brain-kit's KiroCrew surface: `create_slot`,
  `set_project`, `send`, `slot`, `stop`) into the app's session runner, not brain-kit's HTTP client.
- **The bridge's notes on a person's machine** are read back with brain-kit's `decisions.Q_HEAD_RE` (the question's
  first line names its commit and park.json hash); when the repo's kit.json names `bridge_user`, only that account's
  notes count, so a look-alike posted by a person is not a question. The bridge's 「变更说明」 comment (first line
  `decisions.DESC_TITLE`, 48b6b97) is skipped whole, whatever the MR.md in it says. States shown: open, answered (the
  bridge has the answer but could not sign it this round: it sends it later, nobody answers again), delivered, stale
  (a new push), void (not bound to its push and park.json, or its question note was deleted), refused (the signer
  would not sign), invalid.
- **Team mode states**, brain-kit's: a run reserved while its contract is signed (`signing`) shows as handed over and
  waiting for the signer; a question being posted (`posting`, or 72b278e's `asking`: one bridge process posting it
  now) shows as parked, waiting for the bridge; a run whose latest question the signer refused, that is void or could
  not be asked (for the head the bridge last saw) shows as parked, waiting for a person, and is in 待办. The app runs
  `Bridge.poll`'s loop itself (each project, each MR with the hand-over label, `Bridge.process`) to keep each MR's
  result for the page; brain-kit's own `poll` returns nothing.
- **导入仓库** (`importer.py`, `installer.py`): every path from the page must be absolute, without `..` or control
  characters, a real directory, and with no symlink on the way that a user other than root owns (an agent with this OS
  user could have planted it; root's aliases such as macOS's `/tmp` are fine); from then on its realpath is used. A
  repo whose tree has a committed symlink where `brain install` writes (`.kiro`, `.brain`, `aidlc-docs`, `brain`,
  `AGENTS.md`, `.gitignore`) is not installed. Git runs without a shell and with a time limit on every call; over the
  network with `GIT_TERMINAL_PROMPT=0`, an askpass that answers nothing, `SSH_ASKPASS_REQUIRE=never`, ssh in batch mode
  (unless you set your own `core.sshCommand`) and in a session of its own, so nothing can wait for a password; ssh-agent
  and git's credential helpers still work. A clone URL with a user name or password in it is refused. brain-kit's
  `brain install` / `brain doctor` run as commands from the configured checkout. A failed install takes back its
  worktree and branch (in place: the files it wrote that were clean before, nothing else); the commit uses your identity
  and hooks. Clones and installs are background jobs (never on the event loop): the page polls their steps.
  `imports.json` keeps what was installed on a branch (branch, worktree, commit, pushed, MR), so a listed repo without
  kit.json in its checkout is pending when its install branch has one (or the default branch has it and the checkout
  was not pulled yet); an install in place is recorded only while a hook keeps it from being committed. The background
  loop looks at pending repos every 30 s and clears the records nothing waits for (`landing.sweep`).
- **你是谁** (`identity.py`): the name brain-kit goes by in a repo, by brain-kit's own rule (`cli._me`), without asking
  GitLab: a GitLab token with kit.json's `gitlab.base` (GitLab's username); `$BRAIN_USER`, else `git config
  brain.user`; else, in a repo without GitLab, the login name when the loaded brain-kit falls back to it (91e2fee and
  later; 48b6b97 does not, and the page asks for 「你的名字」 there); with GitLab and none of these, brain-kit refuses
  ("who are you?") and the page asks for 「你的 GitLab 用户名」, prefilled with the login name. Saving runs `git config
  brain.user <name>` in that repo (lowercased, brain-kit's USER_RE, no shell). The same name decides which
  requirements are yours in 需求详情 and 待办. brain-kit's "who are you?" from `brain start` is said in Chinese, with the
  input as its fix.
- **A hand-over without its label** (person mode): run.json has the hand-over, the branch tip is the hand-over commit
  (one commit on top of `handoff.local_head`), and the MR at that tip carries none of the hand-over, running or
  rejected labels. Nothing was handed over (`brain handoff` exits 1 then, 72b278e): the row says so and 待办 lists it.

## Security

The app runs as the same OS user as the agent sessions, and agents have a shell. So:

- **Signing is not the app's.** The bridge's private key stays with `signer/brain_signer.py`, a small separate
  process (another OS user in production, `brainbridge`), the other end of brain-kit's `sign.SpoolSigner`: the bridge
  writes `<spool>/requests/<req>.json`, the signer answers in `signed/` or `refused/`, and the SpoolSigner accepts a
  signature only if the signed voucher is exactly the one it asked for and verifies against `allowed_signers`. The
  signer decides with brain-kit's own rules (72b278e), run with its own identities, ledger, GitLab token and the kit
  config from the default branch: a hand-over must pass `Bridge.verify` (the owner's label newer than GitLab's MR
  version of the head, and the head the hand-over commit itself: one parent, run.json changed, as `brain handoff`
  commits it, and neither authored nor committed by a bot (kit `bot_emails` / `bot_users`); a commit pushed on top of
  it is not handed over, whatever the label times); an answer must pass `decisions.check_answer` bound to the question
  note the voucher names (`question_note`, the note id brain-kit's ledger recorded; a voucher without one is refused; a
  deleted question voids the decision): the question the bridge posts for park.json at that commit (ticking its review
  checklist is fine), by kit.json `bridge_user`, posted after the push, the D-n bound to nothing else; the first valid
  reply by an allowed person, never a bot or the bridge account, saying what its author wrote; approve / reject for a
  question without options; a batch review's item list whole; no conflict; the head unchanged). "What its author
  wrote" is check_answer's `edits`, made as brain-kit's own `collect` makes them: `DecisionLoop.reply_states` on the
  signer's ledger (each reply recorded at the signer's first sight with its text's hash) and GitLab GraphQL with the
  signer's own token (`GitLab.note_edits`: lastEditedBy, which an award emoji leaves empty and a text edit sets, as
  measured on gitlab.aws.dev on 2026-11-09). A reply someone else edited never counts and, from an allowed person,
  holds the round (a conflict: nothing signed); one its author fixed before the signer read it counts as it reads;
  one whose text changed after that never counts. When GraphQL does not answer, the signer answers nothing (the
  bridge asks again) and records nothing for that reply; brain-kit's own bridge records such a reply as "cannot tell"
  for good and tells the person once. What the signer adds: it rebuilds each voucher from those checks and compares
  canonical bytes (brain-kit has no voucher builder, so a field brain-kit adds is refused until the signer learns
  it); it serves only its projects, checks
  `issued_at` and the contract's TTL, reserves a contract's run id in brain-kit's `signing` state before checking it
  (one open run per requirement; the same hand-over asked again is signed again), signs an answer only for a run whose
  contract it signed; and its own ledger keeps one answer per question and never binds a D-n to a second question or
  question note, and it refuses a question note that an allowed person's reply to its D-n comes before (a copy posted
  later, with or without the first one deleted, would drop that reply), because the bridge account's token is
  readable by the agents' OS user, so the bridge's notes on the MR can be deleted, edited or posted again. A request must be written as
  brain-kit's SpoolSigner writes it, as a small regular file (no symlink or FIFO). Nothing in the app's private
  brain-kit copy is patched. A signer that does not answer in time leaves the hand-over to the next round (its run id
  given back) and the answer open; the next round asks for that very voucher, so a late signature is used and nothing
  is signed twice. A refusal rejects the hand-over on the MR (or marks the answer `refused`) with the reasons, as
  brain-kit does. Team mode does not start when bridge.json names a `signing_key`, when its signer is not a spool signer, or
  (unless `dev_same_user`, a local trial shown as a warning) when this OS user can write the signer's `signed/` or
  `refused/`.
- **No listening sockets**: routes only under `/api/apps/brain` on the loopback gateway; every route but `/health`
  is the dashboard owner's only (an app token, this app's included, is refused). Outbound only: the loopback gateway,
  GitLab (`brainkit.rest`), git. 推送并开 MR pushes and opens the MR only after the person confirmed the branch, the
  remote and the target on the page (the backend refuses a request whose three do not match what it sees now).
- **No secrets out**: the GitLab token is read like `brainkit.rest.read_token` (`$GITLAB_TOKEN`, else
  `~/.brain/gitlab-token`, refused when others can read it) and never logged, stored or returned; agent-written text
  on its way to the page goes through Kiro Crew's scrubber; materials stay in the intake store (never in a repo). The
  变更说明 is read from commits only (an MR.md committed as a symlink is not followed): a planted link cannot bring a
  file of this machine into the text the person copies to GitLab. `GET /board/{repo}/{key}` only reads (the repo and
  key are checked as every route's are) and its agent-written text (commit subjects, event lines, an actor's facts)
  goes through the same scrubber; 回放 runs in the page on the snapshot it has and sends nothing.
- The brain-kit checkout and the app directory run inside the gateway: in production they must not be writable by
  the agents' OS user. Team mode refuses to start unless bridge.json, runnerd.json, allowed_signers and the
  identities file are owned by another user and read-only to the app (`dev_same_user` skips this for a local trial).
- **What is a boundary and what is a guardrail.** On the runner the agents can do whatever the app's OS user can:
  rewrite the app's ledger, point a session at another slot, write signature requests. The app's own checks are
  guardrails. The boundaries are the signer (it trusts nothing it is sent), runnerd and CI verifying signatures with
  keys and configs the agents cannot change, the pre-receive hook (72b278e: bots may not change
  `runs/<KEY>/run.json` either; its config's `runs_dir` must be kit.json's) and GitLab's approvals. Give the app's GitLab
  account Reporter rights only (comment, label; no push, no merge).
- On a person's machine the `brain-dev` agent runs as that person and can read their GitLab token file anyway: the
  app's answer route adds no power it lacks, and it only answers clarify questions (never a Lean approval). The real
  gates stay where brain-kit puts them: the bridge's checks, the signer, CI and GitLab approvals.

## Install (a person's machine)

1. **brain-kit** checkout (`72b278e` or newer). In each project brain-kit is installed by the app's 导入仓库 (in place
   on the checkout's branch by default, or on a new branch: see above), or by hand: `brain install <repo> --prefix
   PAY`, then commit `.kiro/`, `.brain/`, `aidlc-docs/`, `brain/`, `AGENTS.md` (since 48b6b97 it also adds `runs/**`
   to `aidlc-docs/lean.json` `fingerprint_exclude`: review and commit that too, or `brain handoff` refuses and the
   Kiro Crew check lists the repo). On this machine: the GitLab token in `~/.brain/gitlab-token` (`chmod 600`), `git
   config brain.intake <brain-intake clone>` (see brain-kit's `docs/安装和使用.md`). Your name per repo (`git config
   brain.user`, only where brain-kit cannot tell) is asked for in the app.
2. **Trust the app yourself**: Kiro Crew settings → trusted apps → add `brain` (`agent.apps_trusted`). Kiro Crew
   refuses to enable an untrusted third-party app; the install script does not trust it for you.
3. **Install**: `scripts/dev-install.sh --consent-session-approval` (builds the UI with node 22+, installs or updates
   the app, enables it; the flag gives your consent to `permissions.sessionApproval`, which lets the app set the
   sessions it opens to trust; without it, click Enable in the dashboard and grant it there). Re-run after changes:
   it disables, updates and enables (backend hooks are re-imported on enable only).
4. **In the app → 设置**: the brain-kit checkout (`$BRAINKIT_HOME` or a usual place is found by itself) and the work
   root; the project repos through **导入仓库**. Then fix what the Kiro Crew check lists (brain-dev with Lean's hooks:
   the fix adds the missing ones to your spec and keeps the rest; engine `kas`; a new session is needed for a changed
   brain-dev spec, and a Kiro Crew restart may be needed for the engine).

## Install (the team runner)

1. OS users as in brain-kit: `brainbot` (Kiro Crew with this app, runnerd), `brainbridge` (the signer), group
   `brainspool`. `~/.kiro/agents/brain-run.json` for `brainbot` (brain-kit `remote/agents/brain-run.json`).
2. **The app's bridge.json** (brain-kit's format, `examples/bridge.json`): `projects`, `gitlab` (base, token for an
   account with Reporter rights: it comments and labels, it must not be able to merge or push), `identities`
   (readable by the app, writable only by `brainbridge`), `ledger`, `spool_dir` (runnerd's spool), `vouchers_dir`
   (an app-local copy; brain-intake is written by the signer only), `runner_runs_root`, `kirocrew.agent: brain-run`,
   `pseudonym_salt`, and the signer instead of a key:
   `"signer": {"type": "spool", "spool_dir": "/srv/brain-signer", "allowed_signers": "/etc/brain-kit/allowed_signers"}`
   (optional `timeout`, default 30 s, and `poll`; the signer's spool must not be runnerd's `spool_dir`). No
   `signing_key`: with one, team mode does not start. `publish_vouchers` is forced off (so brain-kit's
   `publish_timeout` does not matter here; the signer has its own). The token is also used on GitLab GraphQL (the edit
   signal, 72b278e): it needs the `read_api` or `api` scope.
3. **kit.json `bridge_user`** on the default branch of each project: the GitLab account of that token (not one of
   `bot_users`). brain-kit's bridge checks that its token is that account before it asks; the signer signs no answer
   without it (it is how a question by the bridge is told from a look-alike by a person).
4. **runnerd.json** (brain-kit's format) with the same `spool_dir`; `allowed_signers` = the bridge's public key.
5. **The signer**: `signer/signer.example.json` → `/etc/brain-kit/signer.json` (same `pseudonym_salt`; its own
   identities copy, GitLab token (it reads GitLab GraphQL too: `read_api` or `api` scope), ledger, the signing key,
   `publish_timeout` for its pushes to brain-intake; `bridge_users` is optional, a pin: kit.json's `bridge_user`
   must be one of them), `signer/brain-signer.service` as `brainbridge`, started before team mode is turned on.
   Spool permissions: `requests/` writable by `brainbot`, `signed/` and `refused/` by `brainbridge` only (team mode
   checks the last two). A run that will never finish is closed on the signer with `brain_signer.py --config … close
   RUN-…`. The signer's brain-intake clone (`intake_dir`, it runs `git pull` there), `/opt/brain-kit` and the signer's
   own folder must not be writable by `brainbot`: give runnerd its own intake clone. After a change of kit.json on main
   or of the identities, restart the signer and the app's bridge (brain-kit reads them once per process).
6. **In the app → 设置 → 运行机模式**: bridge.json and runnerd.json (the signer's spool and public key are in
   bridge.json); turn it on. Settings of an older version of the app (a separate signer spool and allowed_signers) are
   dropped: move them into bridge.json's `signer` block.

## Code map

| Path | What it is |
| --- | --- |
| `app.json` | The manifest: `brain`, page `/apps/brain`, `permissions.api` `/api/apps/brain` and `/api/chat` only, `sessionApproval` |
| `backend/core/service.py`, `handlers.py` | The service object (settings, repos, sessions, team mode, every view) and the routes |
| `backend/core/bk.py` | brain-kit, loaded from the configured checkout under a private name; guarded optional modules |
| `backend/core/repo.py`, `lean_view.py` | Requirements found in a repo (claims, run branches, worktrees, main); Lean's stages, approvals, Session notes |
| `backend/core/deliveries.py`, `detail.py`, `todo.py`, `mrinfo.py` | 交付总览 (and its eval numbers, `cto_numbers`), 需求详情, 待办, the MR on a person's machine |
| `backend/core/board.py` | 需求看板: the actors, events, commits, check wall and acceptance of one requirement, folded from the trace and the repo |
| `backend/core/problems.py` | Every check row in plain Chinese: brain-kit's crewcheck, doctor, lint and refusals mapped to a sentence, 做什么 and a fix |
| `backend/core/mrdesc_view.py` | The 变更说明 at a commit (MR.md, else brain-kit's mrdesc), its first line, the cache and its background maker |
| `backend/core/intake.py`, `crewcheck.py`, `brainview.py` | 开需求, the Kiro Crew checks and fixes, Brain and reflect |
| `backend/core/importer.py`, `installer.py` | 导入仓库: path checks, 检查, 克隆, where an install goes (`choices`), the install records and background jobs; 安装到新分支 (worktree, `brain install`, kit.json, `brain doctor`, commit), 推送并开 MR |
| `backend/core/inplace.py`, `landing.py` | 直接装 (in the checkout, on its branch, only the install's paths committed; 推送 when asked); a branch install's 合并到 main, 拉取 and the background sweep of stale records |
| `backend/core/identity.py` | 你是谁: the name brain-kit goes by in a repo, and `git config brain.user` from 「你的 GitLab 用户名」 |
| `backend/core/team/` | Team mode: the hosted bridge (`bridgehost.py`: brain-kit's Bridge and SpoolSigner, its poll loop with each MR's result, the spool view for the page), the KiroCrew adapter |
| `backend/core/gateway.py`, `sessions.py`, `httpkit.py`, `store.py` | Kept from the sample (see above) |
| `signer/` | The separate signer (brain-kit's rules, its own ledger; the service half of brain-kit's spool protocol), its example config and systemd unit |
| `ui/src/` | The page: `main.tsx`, `AppBar.tsx`, `nav.ts`, `views/*`, `board/*` (需求看板), `cto/*` (交付总览's charts and kanban), the contract `types.ts`; `ui/preview/` on `world.json` |
| `scripts/preview_world.py` | Writes `ui/preview/world.json` and the board and overview fixtures with the backend's own code |
| `tests/` | Backend tests: real brain-kit projects in temp dirs, the fake Kiro Crew gateway, a fake GitLab with GraphQL's edit marks (`teamfix.py`), the real signer behind brain-kit's own Bridge and SpoolSigner (`test_signer.py`: the attacks it refuses, the edit signal) |

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
python3 scripts/preview_world.py         # after changing board.py, detail.py or deliveries.py: the preview's world
```

`BRAIN_TEST_BRAINKIT` points the backend tests at a brain-kit checkout (default `~/warren_ws/brain-kit`; a clean clone
of a commit needs its `vendor/aidlc-lean` too: `git submodule update --init`, or with the URL set to a local copy of
it). Every repo the tests make is a throwaway one in a temp dir, and git hooks are off in them (`core.hooksPath` at an
empty folder, per repo and for every git the tests start, the app's clones too: a machine-wide secret scanner costs
about 0.5 s a commit); `BRAIN_TEST_KEEP_HOOKS=1` keeps the hooks. The import tests use a bare repo as the remote, a
fake ssh for the failures and a fake GitLab for the MR: no network. The fake GitLab (`tests/teamfix.py`) serves commits
with their `parent_ids`, authors and committers from a bare repo, and GraphQL's edit marks as measured on
gitlab.aws.dev (lastEditedBy for a text edit only); every hand-over in the tests is a real `brain handoff` commit, and
the runner's commits are the bot account's. The 你是谁 tests run against the checkout as it is (48b6b97: no name
without GitLab) and against a copy of it with brain-kit 91e2fee's login-name rule applied (`tests/test_identity.py`).

## Not verified on a live Kiro Crew yet

Opening a `brain-dev` slot with `agent_kind: template` and a worktree under `~/workplace` as its project; that the
template's hooks run in such a slot (also after the hook fix added them to a Kiro-upgraded spec); `trust` for it;
credits in `turn_stats`; the bridge's runner sessions; the `kirocrew config set` fix while the gateway runs; the page in
the dashboard; the signer against a real GitLab (MR versions, note ids, GraphQL's lastEditedBy through its own
token) and as another OS user behind the spool; the 变更说明 of a real run (brain-kit 48b6b97's MR.md in the hand-over
commit) on the page; 导入仓库 against a real GitLab (a clone over SSH and its failure texts, the push, the MR opened
with a real token, a protected default branch refusing 推送 after an install in place, 拉取 from it) and its long jobs
behind the gateway.
