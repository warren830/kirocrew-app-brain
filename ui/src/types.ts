/**
 * The backend contract of the Brain app: every route under /api/apps/brain and the JSON it answers.
 * The backend (backend/core/*.py) produces exactly these shapes; tests/test_contract.py checks the
 * fixtures in src/test/fixtures/*.json against the backend's own output keys.
 *
 * Words: a requirement (需求) has a key like PAY-3. It is claimed (claim/<KEY> branch), developed
 * locally with AI-DLC Lean in a brain-dev session (run branch ai/<owner>/<KEY>-<slug>), handed over
 * to the team runner (bridge + runnerd + a brain-run session), may park on a question (D-<n> on the
 * GitLab MR), waits for acceptance, and is merged. The Brain is brain/PRODUCT.md, TECH.md,
 * IMPROVEMENT.md, PROJECT.md on the default branch.
 *
 * Times are epoch seconds (number) unless the field says ISO. Missing facts are null, never guessed.
 * No route ever returns a token, a secret or a signing key path's content.
 */

export const BASE = '/api/apps/brain'

// ---------------------------------------------------------------- shared

export type Level = 'OK' | 'WARN' | 'FAIL'
/**
 * One check, said for a person (backend/core/problems.py): OK ✓, WARN ! (a reminder, stops nothing), FAIL ✗. The
 * backend always sends every field; the optional ones are optional here only so older literals still compile.
 */
export interface CheckRow {
  level: Level
  /** what is wrong (or right): plain short Chinese (code names such as `lean.json` or runs/** may be in it) */
  text: string
  /** 做什么: one plain Chinese line ('' for an OK row, or when there is nothing to do) */
  todo?: string
  /** the one-click fix: agent (add Lean's hooks to ~/.kiro/agents/brain-dev.json) and engine (kirocrew engine kas),
   * both POST /crew/fix {what}; kit (reinstall brain-kit in `repo`: POST /import/upgrade {path: repo}); me (the name
   * brain-kit goes by in `repo`: the page's input, POST /me/name); null: none */
  fix?: 'agent' | 'engine' | 'kit' | 'me' | null
  /** the repo (its path) the row is about; null for a machine-wide row */
  repo?: string | null
  /** what brain-kit (or the app's older code) said, verbatim, for debugging (shown folded); '' when there is nothing
   * more than text and todo */
  raw?: string
}

/** Where a requirement is now. */
export type ReqState =
  | 'claimed' // 已认领：only claim/<KEY>, no run yet
  | 'local' // 本地开发中：run branch on this machine, not handed over
  | 'handed_over' // 已交接：run.json has a hand-over, the bridge has not taken it yet
  | 'rejected' // 接手被拒：the bridge refused the hand-over (reason in waits.text)
  | 'running' // 运行机在跑
  | 'parked' // 停下等回答：park.json waiting / an open D-<n>
  | 'acceptance' // 等验收：parked on an acceptance question (Lean RELEASE)
  | 'merged' // 已合并：run.json is on the default branch
  | 'closed' // 已关闭：the claim was closed (duplicate, dropped)

export const STATE_LABEL: Record<ReqState, string> = {
  claimed: '已认领',
  local: '本地开发中',
  handed_over: '已交接',
  rejected: '接手被拒',
  running: '运行机在跑',
  parked: '停下等回答',
  acceptance: '等验收',
  merged: '已合并',
  closed: '已关闭',
}

/** Who the requirement waits on right now. */
export type WaitWho = 'you' | 'agent' | 'runner' | 'bridge' | 'product' | 'builder' | 'people' | 'nobody'

/**
 * The step whoever `who` is takes now (UI问题清单 #1: one judgment, every view reads it: 待办, the badges, 交付总览's
 * lanes, the board): approve (a Lean approval line, in the session), reply (the local session is idle: your turn to
 * talk), tool (a tool call in the session waits for approval), start (claimed, no run yet: 开工), answer (a question:
 * in the session for a local run, on the MR for a handed-over one), accept (acceptance), redo_handoff (the hand-over
 * was refused), label_handoff (pushed without its label), write_back (merged with new knowledge to write back into
 * the Brain), watch (merged, in its 14 days: nobody's turn), none (nothing to do: AI or the runner at work, or done).
 */
export type WaitDo = 'approve' | 'reply' | 'tool' | 'start' | 'answer' | 'accept' | 'redo_handoff' | 'label_handoff'
  | 'write_back' | 'watch' | 'none'

export interface Waits {
  who: WaitWho
  /** one short Chinese sentence, e.g. 「等你批准需求（在会话里自己打一行）」 */
  text: string
  /** the exact Lean approval line the person must type themselves in the session, when that is what it waits on */
  line: string | null
  /** what text was made from, verbatim, for debugging (shown folded): a refused hand-over's reasons as the bridge wrote
   * them on the MR (text has them in short Chinese, backend/core/problems.py); '' otherwise. The backend always sends it */
  raw?: string
  /** the step (see WaitDo). The backend always sends it; optional only so older literals compile */
  do?: WaitDo
  /** since when it waits like this (epoch s): the moment the session went idle, the approval was asked, the claim was
   * made, the question was asked; null when unknown. The backend always sends it */
  since?: number | null
  /** where the step is taken: the local session, the MR, this app (开需求 / 待办), nowhere. The backend always sends it */
  where?: 'session' | 'mr' | 'app' | null
  /** the reply is Lean's review in a NEW session (开审查会话: the session that wrote the code may not review it), not a
   * turn in the open one. The backend always sends it */
  review?: boolean
}

export interface LeanSummary {
  /** the current Lean stage id (see stage_state); null only when Lean recorded no stage yet */
  stage: string | null
  /** its Chinese label, e.g. 需求分析 */
  stage_label: string | null
  /** 1..11, the stage's place in Lean's order */
  stage_n: number | null
  /** the state of `stage`: started (being worked on); todo (nothing open: the next stage to do after the last one done);
   * done or skipped (every stage up to the last is done: the requirement's Lean work is finished); null when Lean
   * recorded no stage yet */
  stage_state: StageState | null
  /** stages done or skipped / 11 */
  done: number
  total: number
  /** UI问题清单 #8, the one way to say the progress (vocab.leanProgress): stages done, stages skipped, and the next one
   * to do (null: every stage done or skipped). The backend always sends them */
  done_n?: number
  skipped_n?: number
  next?: { id: string; label: string; n: number } | null
}

export interface MrRef { iid: number; url: string | null; state: string | null }

/** One row of 交付总览; also the header of 需求详情. */
export interface Requirement {
  /** repo id from /status (r1, r2 …); team-mode rows use 'runner' */
  repo: string
  key: string
  title: string
  owner: string | null
  /** where the requirement came from (brainkit.intents): product, debt, alert, schedule, eval-gap, gap */
  source: string
  state: ReqState
  state_label: string
  /** where the facts were read: this machine's worktree, a branch ref, the default branch, the runner workspace */
  where: 'worktree' | 'branch' | 'main' | 'runner' | 'claim'
  branch: string | null
  intent: string | null
  lean: LeanSummary
  /** the current Lean stage as text, as the backend writes it: 「9/11 代码生成」 (started), 「3/11 用户故事（下一步）」
   * (todo), 「11/11 发布（做完）」 (done or skipped); null when Lean recorded no stage */
  stage: string | null
  waits: Waits
  /** the first line of its 变更说明 (brain mr-desc's 一句话, from runs/<KEY>/MR.md or the run's records at the commit
   * the row is read at); null before it has a run, while it is being made, or when brain-kit cannot make one */
  summary: string | null
  /** credits of the Kiro Crew sessions this app opened for it (null: none known). KiroCrew reports credits only. */
  credits: number | null
  /** latest activity we know of (commit, Lean event, session) */
  updated_at: number | null
  mr: MrRef | null
  /** this machine's working directory for it (the run's worktree), if any */
  worktree: string | null
  /** the team runner's run ids (RUN-PAY-3-1 …) */
  run_ids: string[]
  sessions: number
  /** other open requirements whose expected paths overlap this one's */
  overlap: string[]
  /** open D-<n> questions */
  open_questions: string[]
  /** expected paths from run.json (overlap warnings come from these) */
  expected_paths: string[]
  /** its repo has no remote: it is done only on this machine, never handed over (no runner, no MR). The backend
   * always sends it */
  local_only?: boolean
  /** its brain-dev session on this machine (KiroCrew's chat URL: 打开会话), null when there is none. The backend always
   * sends it */
  session_url?: string | null
}

// ---------------------------------------------------------------- GET /status

export interface KitView { tracker: string; req_prefix: string; default_branch: string; gitlab_base: string; gitlab_project: string }

export interface RepoInfo {
  id: string
  path: string
  name: string
  /** its kit.json loaded: the views use it */
  ok: boolean
  /** why it cannot be used ('' when ok, and when it is pending) */
  error: string
  kit: KitView | null
  /** not usable yet, but brain-kit is on its way (导入仓库): the install branch, or merged and not pulled */
  pending: PendingInstall | null
  /** who brain-kit says the person is there (a loaded repo; null otherwise) */
  me: RepoMe | null
  /** it has an origin: requirements may be handed over, 从远端取最新 works. The backend always sends it */
  remote?: boolean
}

/**
 * Who brain-kit says the person is in a repo, by its own rule: a GitLab token (GitLab's username), $BRAIN_USER or git
 * config brain.user, else the login name in a repo without GitLab (a brain-kit that falls back to it). Never a token.
 */
export interface RepoMe {
  /** the name brain-kit goes by there; null: GitLab's (with a token), or brain-kit would not know */
  name: string | null
  source: 'token' | 'env' | 'git' | 'login' | 'none'
  /** kit.json gitlab.base ('' without GitLab) */
  gitlab: string
  /** one line for the page, e.g. 「alice（这台机器的登录名：这个仓库不用 GitLab）」 */
  text: string
  /** brain-kit would not know: the page shows a small input (label 「你的 GitLab 用户名」 or 「你的名字」, prefilled with
   * suggest, the login name; why: one line) */
  ask: boolean
  label: string
  why: string
  suggest: string
  /** what is wrong with the name that is set ('' when nothing) */
  error: string
}

/** POST /me/name: git config brain.user <name> in that repo (brain-kit's USER_RE, lowercased; no token, ever). */
export interface MeNameBody { path: string; name: string }
export interface MeNameResult {
  ok: true; text: string; me: RepoMe; status: Status
  /** the command it ran (git config brain.user <name>), for 细节 */
  raw?: string
}

export interface Status {
  app: { name: string; version: string; team: boolean }
  brainkit: {
    path: string
    ok: boolean
    version: string | null
    error: string
    /** optional brain-kit modules: true when importable */
    modules: { trace: boolean; evaluate: boolean; golden: boolean; intents: boolean; mrdesc: boolean }
  }
  repos: RepoInfo[]
  crew: { rows: CheckRow[]; fix: { agent: boolean; engine: boolean }; checked_at: number | null }
  /** who this machine says the person is: git config brain.user, or that a GitLab token is present (never the token) */
  me: { user: string | null; token: boolean; how: string }
  team: TeamStatus
  counts: { todo: number }
}

export interface TeamStatus {
  enabled: boolean
  ok: boolean
  error: string
  last_loop_at: number | null
  loop_error: string
  /** the signer runs as this app's OS user (the local trial, or its signed/ and refused/ are writable here): it would
   * sign whatever the app asks, so it is no boundary (never on a real team runner) */
  same_user: boolean
  signer: { pending: number; refused: number }
}

// ---------------------------------------------------------------- 导入仓库: /import/*, POST /repos/remove

/**
 * A listed (or inspected) repo whose checkout has no .brain/kit.json yet, but brain-kit is on its way: on the install
 * branch the app made (branch), installed in that branch's worktree and not committed yet (uncommitted: a hook said
 * no), or already on the default branch and not pulled into this checkout (merged).
 */
export interface PendingInstall {
  /** branch: on the install branch (「合并到 <default>」 when it fast-forwards); uncommitted: a hook said no; merged:
   * the default branch has it (「拉取」, or switch to it) */
  state: 'branch' | 'uncommitted' | 'merged'
  /** the install branch (brain/install); for merged, where it is (origin/main) */
  branch: string
  /** the install branch's worktree under work_root (null when it is gone) */
  worktree: string | null
  /** the install branch's commit (12 hex) */
  commit: string | null
  pushed: boolean
  mr_url: string | null
  /** e.g. 「安装在 brain/install 分支上，合并后生效」 */
  text: string
  /** what to do next, one sentence */
  next: string
  /** the short state the list shows (「还没合进 main」, 「还没推送」, 「MR 等合并」, 「要拉取」 …); a repo without a remote
   * never says it waits for a merge */
  word: string
  /** 推送并开 MR: the MR's target (the default branch), origin's URL (never a password), the GitLab project */
  target: string
  remote_url: string
  gitlab_base: string
  gitlab_project: string
  /** a GitLab token is on this machine and the project is known: the app opens the MR itself */
  can_open_mr: boolean
  /** state branch: 「合并到 <target>」 (POST /import/merge): can it fast-forward now, why not, and whether it asks first
   * (a repo with a remote: the remote does not have it until pushed) */
  merge: { ok: boolean; why: string; confirm: boolean } | null
  /** state merged, on origin only: 「拉取」 (POST /import/pull) can run now, why not */
  pull: { ok: boolean; why: string } | null
}

/** Where an install (or a kit update) goes: inplace (the default: in the checkout, on its branch, committed there, as
 * brain-kit's CLI does) or branch (a new branch in its own worktree, for an MR). */
export type InstallMode = 'inplace' | 'branch'
export interface InstallChoice {
  mode: InstallMode
  /** 「直接装在 main」, 「装到新分支，开 MR 给团队看」 */
  title: string
  /** one plain line: what it means */
  line: string
  ok: boolean
  /** why it cannot be done now ('' when ok) */
  why: string
}
/** POST /import/choices {path, purpose} (and ImportInspect.install): the options in order (in place first; one only when
 * there is nothing to choose: no remote, nothing uncommitted), the recommended one, and why. */
export interface InstallChoices {
  options: InstallChoice[]
  recommend: InstallMode
  /** the checkout's branch (null: detached) */
  current: string | null
  /** the default branch */
  target: string
  /** origin's URL ('' without a remote) */
  remote_url: string
  /** the person's uncommitted changes (up to 10), and the ones that touch what brain install writes */
  dirty: string[]
  overlap: string[]
}
export interface ChoicesBody { path: string; purpose?: ImportPurpose }

/** GET /import/defaults */
export interface ImportDefaults {
  /** where a clone goes by default (the folder that holds work_root, else ~/workplace) */
  clone_parent: string
  work_root: string
  /** the install branch's default name */
  branch: string
  /** a GitLab token is on this machine (never the token) */
  token: boolean
  brainkit_ok: boolean
  /** the checkouts found on this machine to pick from (importer.found_repos) */
  found: FoundRepo[]
}
/** A git checkout under ~/workplace or ~/workspace that 导入仓库 offers to pick (importer.found_repos), sent as
 * ImportDefaults' `found` once the backend's GET /import/defaults has it */
export interface FoundRepo { path: string; name: string; installed: boolean; listed: boolean }

/** One row of 检查: ✓ OK, ! WARN (worth knowing, stops nothing), ✗ FAIL; why, and what to do. */
export interface ImportCheck { id: string; level: Level; label: string; why: string; todo: string }

/** The kit.json values the install form asks for (what `brain install` asks you to check). */
export interface KitForm {
  req_prefix: string
  tracker: string
  /** tracker jira only */
  jira_base: string
  gitlab_base: string
  gitlab_project: string
  default_branch: string
  team: string
}

/** What the wizard offers after 检查: fix (something is wrong), listed (already in the list), add (installed),
 * pending (on the install branch, or merged), install (not installed: the install form). */
export type ImportNext = 'fix' | 'listed' | 'add' | 'pending' | 'install'
export type KitState = 'none' | 'checkout' | 'invalid' | 'blocked' | 'branch' | 'uncommitted' | 'merged'

/** POST /import/inspect {path}: read only. */
export interface ImportInspect {
  /** what was asked */
  input: string
  /** the repo's top level the app uses (a subfolder → its top level, a linked worktree → its main checkout) */
  path: string | null
  /** why path differs from what was asked ('' when it does not) */
  note: string
  checks: ImportCheck[]
  /** KiroCrew's checks for it (brain-dev's Lean hooks, the engine, this repo's committed kit), with their fixes */
  crew: { rows: CheckRow[]; fix: { agent: boolean; engine: boolean } }
  next: ImportNext
  /** its id when it is already in the list */
  listed: string | null
  kit: { state: KitState; values: KitView | null }
  /** the install form, prefilled (key prefix from the folder name, GitLab from origin, the default branch) */
  form: KitForm | null
  /** the install branch's default name */
  branch: string
  pending: PendingInstall | null
  /** next 'install': where it can go */
  install: InstallChoices | null
  /** who brain-kit will say the person is here (kit.json's GitLab, or the form's before an install) */
  me: RepoMe | null
  origin: { url: string; base: string; project: string } | null
  default_branch: string | null
  current_branch: string | null
  /** the path itself was refused ('' otherwise; the rows say the rest) */
  error: string
}

export type JobStepState = 'todo' | 'running' | 'ok' | 'warn' | 'fail'
export interface JobStep { id: string; label: string; state: JobStepState; detail: string }

/** A clone, an install or an upgrade, run in the background (POST /import/clone, /import/install, /import/upgrade
 * answer {job}); GET /import/jobs/{id} until it is not running. */
export interface ImportJob<R = CloneResult | InstallResult | UpgradeResult> {
  id: string
  kind: 'clone' | 'install' | 'upgrade'
  /** the clone's target folder, the install's (or upgrade's) repo */
  target: string
  state: 'running' | 'done' | 'failed'
  steps: JobStep[]
  started_at: number
  ended_at: number | null
  /** failed: why, in plain Chinese */
  error: string
  /** done: the result; failed: what was done before (or null) */
  result: R | null
}
export interface JobStart { job: ImportJob }

export interface CloneBody { url: string; parent: string; name: string }
export interface CloneResult { path: string | null; output: string; kind: string }

/** POST /import/install; mode left out: the recommended one. branch: the new branch's name (mode branch only). */
export interface InstallBody { path: string; branch: string; kit: KitForm; mode?: InstallMode }
export interface FileChange { change: 'added' | 'modified' | 'deleted' | 'other'; path: string }
/** The install's (or upgrade's) commit (git add -A, git commit with the person's identity; their hooks run). blocked:
 * a hook said no (text has what it said); POST /import/commit {path, purpose} tries again. */
export interface CommitResult { ok: boolean; sha: string | null; blocked: boolean; text: string; output: string }
/** Which records /import/commit and /import/publish act on: the install's (imports.json, the default) or the kit
 * upgrade's (upgrades.json: kept apart, so a listed repo is never taken for a pending install). */
export type ImportPurpose = 'install' | 'upgrade'
/** POST /import/commit: 再提交一次 after a hook said no */
export interface CommitBody { path: string; purpose?: ImportPurpose }
export interface InstallResult {
  mode: InstallMode
  path: string
  /** the new branch (branch), or the checkout's branch the commit is on (inplace) */
  branch: string
  /** what the branch was made from (origin/main) and its commit */
  base: string | null
  base_sha: string | null
  worktree: string | null
  /** `brain install`'s output */
  output: string
  kit: KitForm
  doctor: { ran: boolean; rows: CheckRow[]; output: string }
  files: FileChange[]
  commit: CommitResult
  /** origin's URL ('' without a remote): in place, 推送 is offered (POST /import/push), never done by itself */
  remote_url: string
  /** the default branch */
  target: string
}

/**
 * POST /import/upgrade {path, branch?}: the 'kit' fix of a CheckRow (an older hook adapter, Lean or the adapter not
 * committed, Lean counting runs/** as code). Like the install, for a repo that has brain-kit: a new branch (default
 * brain/upgrade-kit; -2, -3 … when that name is taken here or on origin) from the default branch (origin's, else the
 * local one) in its own worktree under work_root, `brain install` there (kit.json kept; the kit files refreshed, runs/**
 * added to lean.json), `brain doctor --offline`, a commit with the person's identity and hooks. The person's checkout is
 * never touched. Answers {job} (kind 'upgrade'); then /import/commit and /import/publish with purpose 'upgrade'.
 */
export interface UpgradeBody { path: string; branch?: string; mode?: InstallMode }
export interface UpgradeResult extends InstallResult {
  /** false: brain install changed nothing (text 「已经是最新的：没有要提交的改动」; what it wrote was taken back) */
  changed: boolean
  gitlab_project: string
  /** a GitLab token is on this machine and the project and origin are known: 推送并开 MR opens the MR itself */
  can_open_mr: boolean
  /** one plain sentence: where the commit is and what to do next, e.g. 「提交在 main 上了，现在就生效」 (in place) or
   * 「提交在本机分支 brain/upgrade-kit 上（这个仓库没有远端）：点「合并到 main」就生效」 */
  text: string
}

/** POST /import/publish: only with confirm true and what the person saw (the branch, the remote, the target). */
export interface PublishBody { path: string; branch: string; target: string; remote_url: string; confirm: true; purpose?: ImportPurpose }
export interface PublishResult {
  /** pushed (and the MR opened, or the way to open it) */
  ok: boolean
  pushed: boolean
  branch: string
  target: string
  remote_url: string
  mr: { iid: number; url: string; existing: boolean } | null
  text: string
  /** git push's output */
  output: string
  /** the exact commands, when the app could not do it all (push, glab mr create) */
  commands: string[]
  /** GitLab's new-MR page for the branch */
  new_mr_url: string | null
}

/** POST /import/merge: 「合并到 <default>」, a fast-forward in the checkout; confirm true for a repo with a remote. */
export interface MergeBody { path: string; confirm?: boolean; purpose?: ImportPurpose }
export interface MergeResult {
  ok: boolean
  text: string
  /** the default branch it went into */
  branch: string
  sha: string | null
  /** the install worktree and branch, taken away or kept (and why) */
  removed: string[]
  kept: string[]
  /** origin's URL: the remote does not have it yet ('' without a remote) */
  remote_url: string
  output: string
}
/** POST /import/pull: 「拉取」 (git pull --ff-only of the default branch) after the MR was merged. */
export interface PullResult { ok: boolean; text: string; output: string; removed: string[]; kept: string[] }
/** POST /import/push: the checkout's branch to origin, only with confirm true and what the person saw. */
export interface PushBody { path: string; branch: string; remote_url: string; confirm: true }
export interface PushResult { ok: boolean; pushed: boolean; branch: string; remote_url: string; text: string; output: string }

export interface AddResult { ok: boolean; id: string; text: string; status: Status }
export interface RemoveResult { ok: boolean; text: string; status: Status }

// ---------------------------------------------------------------- GET/POST /settings

/** POST /settings takes any part of it: a key left out keeps its value (the 设置 form sends no repos: 导入仓库 adds
 * them, 移出列表 removes them). */
export interface Settings {
  /** brain-kit checkout this app imports (read-only to the app) */
  brainkit: string
  /** project repos (brain-kit installed, or on its way) shown on this machine */
  repos: string[]
  /** where the app puts each requirement's worktree (under ~/workplace or ~/workspace) */
  work_root: string
  team: {
    enabled: boolean
    /** brain-kit's bridge.json, with "signer": {"type": "spool", "spool_dir", "allowed_signers"} and no signing_key */
    bridge_config: string
    runnerd_config: string
    /** local trial only: the signer runs as the same OS user (shown as a warning) */
    dev_same_user: boolean
  }
}

// ---------------------------------------------------------------- GET /overview?repo=<id>|all

export interface Overlap { keys: string[]; paths: string[] }

export interface EvalMetric {
  id: string
  label: string
  /** [numerator, denominator] for a rate, a number, or null when not measured yet */
  value: [number, number] | number | null
  /** e.g. 「交接之后除了必经审批没人介入，而且交付正确」 */
  rule: string
}

export interface EvalView {
  /** brainkit.evaluate is importable and ran */
  available: boolean
  error: string
  ref: string | null
  metrics: EvalMetric[]
  /** 复看队列 (low-score queue): runs that need a human look */
  queue: { key: string; intent: string | null; reasons: string[] }[]
  /** runs brain-kit could not read: listed with brain-kit's reason, not counted in any metric */
  skipped: { key: string; why: string }[]
  /** brain-kit's notes on the numbers, verbatim (credits it could not attribute to a run, deliveries already known
   * wrong whose 14 days are not over …) */
  notes: string[]
  /** brain-kit's own words behind error (for 细节); '' when none. The backend always sends it */
  raw?: string
}

/**
 * 决策漏斗: who settled each decision, from the Who cell of decisions.md (brain-kit's vocabulary: agent, brain <entry
 * id>, check, <pseudonym> <voucher id>, owner). Each decision counts once.
 */
export interface Funnel {
  source: 'evaluate' | 'app'
  total: number
  /** id, the backend's label, count, in the backend's order: person 人, check 确定性检查, brain Brain 条目（引用）,
   * agent agent 自己定（权限内）, unknown 看不出（Who 空着）, unclassified 没归类（Who 不是规定的写法） */
  rows: { id: string; label: string; count: number }[]
  /** the decisions counted as unclassified: their Who cell is outside the vocabulary. Listed where they are, never
   * guessed (the cell may hold a real name, so it is not repeated here) */
  unclassified: { key: string; id: string; src: string }[]
  /** questions asked of people / answered / delivered back to the run */
  questions: { asked: number; answered: number; delivered: number }
}

export interface Overview {
  at: number
  rows: Requirement[]
  overlaps: Overlap[]
  funnel: Funnel
  eval: EvalView
  /** the 交付总览's three numbers, their charts and the weekly deliveries (CtoNumbers, below) */
  cto: CtoNumbers
  /** state → count */
  counts: Partial<Record<ReqState, number>>
  errors: { repo: string; error: string }[]
}

// ---------------------------------------------------------------- GET /requirements/{repo}/{key}

export type StageState = 'done' | 'skipped' | 'started' | 'todo'
export interface Stage {
  id: string
  label: string
  n: number
  state: StageState
  /** per-unit stages: each unit's state */
  units: { unit: string; state: StageState }[]
  note: string | null
  at: number | null
}

export type ApprovalState = 'approved' | 'pending' | 'rejected' | 'stale' | 'refused'
export interface Approval {
  kind: string // REQUIREMENTS | DESIGN | INCEPTION | PLAN | RELEASE
  state: ApprovalState
  sha8: string | null
  at: number | null
  /** pending only: the exact line the person types themselves in the session's chat */
  line: string | null
  path: string | null
}

/**
 * One row of decisions.md. Its Who cell, in brain-kit's vocabulary, gives *by* and *who*: agent or a kit bot user →
 * agent; `brain <entry id> …` → brain (who: the entry ids); check → check; `<P-xxxx> <V-xxxxxxxxxx>` (a pseudonym and
 * its voucher id) → person (who: the pseudonym); owner → person (who: 'owner'); bridge → the bridge's own record;
 * anything else → unclassified (who null: the cell may hold a real name); an empty cell → null.
 */
export interface Decision {
  id: string
  date: string | null
  stage: string | null
  text: string
  why: string | null
  /** the pseudonym, 'owner', or the Brain entry ids; null when the Who cell says nothing that may be shown */
  who: string | null
  by: 'person' | 'agent' | 'check' | 'brain' | 'bridge' | 'unclassified' | null
  /** Brain entry ids it cites (open them in the Brain view) */
  cites: string[]
  vouchers: string[]
  src: string
}

export interface QuestionOption { id: string; text: string }
export interface Question {
  source: 'park' | 'bridge' | 'mr'
  /** D-<n> once the bridge posted it */
  id: string | null
  kind: string
  kind_label: string
  question: string
  options: QuestionOption[]
  recommend: string | null
  lean_request: string | null
  refs: string[]
  /** park.json: waiting | answered; on the MR / in brain-kit's ledger: posting | asking (a bridge is posting it right
   * now) | open | answered | delivered | delivery_unknown | refused (the signer would not sign it) | stale (a new push)
   * | void (not bound to its push and park.json) | invalid | closed */
  state: string
  answer: string | null
  answerer: string | null
  voucher_id: string | null
  mr_url: string | null
  at: number | null
  /** the person may answer it right here (their own local run, a clarify question, not a Lean approval) */
  answerable_here: boolean
  /** how an answer here travels: into the local session, or as the person's own comment on the MR */
  answer_via: 'session' | 'mr' | null
}

export type TimelineKind =
  | 'stage' | 'approval' | 'human' | 'commit' | 'handover' | 'question' | 'decision' | 'blocked' | 'verify'
  | 'merge' | 'session' | 'app'
export interface TimelineItem {
  /** ISO time or null when the source has none */
  at: string | null
  kind: TimelineKind
  label: string
  detail: string | null
  who: string | null
  src: string | null
}

export interface SessionRow {
  slot: string
  title: string
  agent: string
  kind: 'local' | 'runner'
  credits: number | null
  turns: number
  busy: boolean
  awaiting: boolean
  last_activity: number | null
  opened_at: number | null
  project: string | null
  /** open it in Kiro Crew: navigate to this path */
  url: string
  error: string | null
}

/**
 * The MR's 变更说明 (brain-kit's `brain mr-desc`): runs/<KEY>/MR.md as committed when the branch has it, else made from
 * the run's records at that commit. Always from a commit (`ref`), never from uncommitted files. The text is made inert
 * by brain-kit (no @mention, HTML, image, quick action, approval or answer line acts when it is pasted into GitLab).
 */
export interface MrDesc {
  /** brain-kit's mrdesc module is there */
  available: boolean
  /** Markdown; '' when there is none (error says why) */
  text: string
  /** its first line (the 一句话) */
  first: string | null
  /** file: runs/<KEY>/MR.md as committed; records: made from the run's records */
  source: 'file' | 'records' | null
  /** runs/<KEY>/MR.md */
  path: string | null
  /** the commit it was read at (12 hex) */
  ref: string | null
  error: string
}

export interface RequirementDetail {
  row: Requirement
  where_label: string
  run: {
    owner: string | null
    branch: string | null
    intent: string | null
    brain_commit: string | null
    origin: string | null
    created_at: string | null
    materials: string[]
    handoff: { requested_at: string | null; by: string | null } | null
  } | null
  claim: { owner: string | null; title: string; created_at: string | null; source: string; closed: string | null } | null
  lean: {
    stages: Stage[]
    approvals: Approval[]
    /** aidlc-state.md Session notes */
    status: string | null
    next: string[]
    open_questions: string[]
  }
  decisions: Decision[]
  questions: Question[]
  timeline: { source: 'trace' | 'app'; items: TimelineItem[]; missing: string[]; error: string }
  sessions: SessionRow[]
  credits: { total: number | null; note: string }
  brain: { loaded: number | null; cited: string[]; stale: string[]; unknown: string[]; proposals: number | null }
  mr_desc: MrDesc
}

// ---------------------------------------------------------------- POST /requirements/{repo}/{key}/session, /answer

export interface OpenSessionBody { trust?: boolean; kickoff?: boolean
  /** 开审查会话: a NEW brain-dev session in the worktree to review the code (the session that wrote it may not review it,
   * Lean's next step says so), never the live one; its first message the review line Lean wrote */
  review?: boolean }
export interface OpenSessionResult { ok: boolean; slot: string; url: string }
/**
 * choice: an option id (A–H), or 'approve' / 'reject' for a question without options. id: the question's D-<n> when it
 * has one (an MR question); without it the open clarify question is meant.
 */
export interface AnswerBody { choice: string; note?: string; id?: string }
export interface AnswerResult { ok: boolean; via: 'session' | 'mr'; text: string }

// ---------------------------------------------------------------- 开需求: /intake/next, /intake/check, /intake/start

export type Classification = 'public' | 'internal' | 'confidential' | 'secret' | 'unsure'
export const CLASS_LABEL: Record<Classification, string> = {
  public: '公开',
  internal: '内部',
  confidential: '机密',
  secret: '绝密',
  unsure: '不确定（按机密处理）',
}

export interface IntakeNext {
  repo: string; key: string | null; tracker: string; prefix: string; error: string
  /** kit.json intake.allow_confidential: gate 2 takes confidential material here (brain-kit's default: no) */
  allow_confidential?: boolean
  /** brain-kit is on the default branch in this checkout only, not on origin, where `brain start` branches from (an
   * in-place install not pushed yet): 推送 first. null: nothing waits */
  push?: { branch: string; remote_url: string } | null
}

export interface IntakeBody {
  repo: string
  /** tracker none: empty = the next free key; tracker jira: required */
  key?: string
  slug: string
  title: string
  /** paths on this machine: files or folders (a Feishu / Lark export folder works) */
  docs: string[]
  /** gate 1: I am the author or have the author's consent */
  consent: boolean
  /** gate 2 */
  classification: Classification | ''
  /** gate 3: amounts / company names / contract numbers: keep as they are or mask */
  business: 'keep' | 'mask' | ''
  /** leave out files matching these globs */
  exclude: string[]
}

export interface IntakeCheck {
  ok: boolean
  key: string | null
  package: string | null
  /** effective classification after the file markers */
  classification: string | null
  segments: number
  sources: number
  /** brain-kit's findings, verbatim, one line each */
  findings: string[]
  /** brain-kit's 请你确认 parts of the findings, one per file (「file：请你确认 N 处（…）：「quote」…」): what may be a name or
   * a password but may as well be a word. Not masked and not stopping anything: if it is one, change the document
   * and check again */
  review: string[]
  /** gates that would stop the start, said as what to do on this page (「第 2 关：这个仓库不收机密材料…」) */
  blocking: string[]
  /** the same, as brain-kit said them (shown folded) */
  blocking_raw?: string[]
  /** the findings per file, said plainly: what was found and what happened to it, 请你确认, why a file was not taken */
  files?: { id: string; name: string; items: string[]; review: string; refused: string }[]
  refused: { id: string; name: string; reason: string }[]
  /** a hard stop before any finding (no consent, nothing to take in …), verbatim */
  error: string
}

export interface StartBody extends IntakeBody {
  /** modules expected to change (run.json expected_paths; overlap warnings): a list, one path per item, or one string
   * with the paths separated by commas, spaces or new lines (the API accepts both; this page sends a list) */
  paths: string[] | string
  open_session: boolean
  trust: boolean
}

export interface StartResult {
  ok: boolean
  key: string | null
  branch: string | null
  intent: string | null
  worktree: string | null
  /** `brain start`'s output, verbatim */
  output: string
  slot: string | null
  url: string | null
  session_error: string
  /** brain-kit did not know who the person is (fix 'me'), and who it says they are there now (the input) */
  problem: CheckRow | null
  me: RepoMe | null
}

// ---------------------------------------------------------------- GET /crew, POST /crew/fix

export interface CrewChecks { rows: CheckRow[]; fix: { agent: boolean; engine: boolean }; checked_at: number | null }
export interface CrewFixBody { what: 'agent' | 'engine' }
export interface CrewFixResult { ok: boolean; text: string; rows: CheckRow[] }

// ---------------------------------------------------------------- GET /brain?repo=<id>

export interface BrainEntry {
  id: string
  type: string
  side: string
  rel: string
  repeats: number
  src: string[]
  text: string
  /** how often runs cite it (brainkit.usage) */
  cites: number
  runs: number
  loaded_by: number
  /** loaded by enough runs and never cited: a withdraw candidate */
  candidate: boolean
}

export interface BrainSection { title: string; entries: BrainEntry[] }
export interface BrainFileView { key: string; letter: string; side: string; types: string[]; count: number; sections: BrainSection[] }

export interface BrainView {
  repo: string
  ref: string
  files: BrainFileView[]
  /** brain lint (static rules) on the default branch: errors as FAIL rows, warnings as WARN rows (text 「brain/TECH.md 第
   * 12 行：条目号 T-PAY-1-1 重复了」, todo, raw: brain lint's own line) */
  lint: { errors: CheckRow[]; warnings: CheckRow[] }
  usage: {
    useful: [number, number]
    repeat_rate: [number, number]
    archived: number
    purged: number
    runs: { intent: string; key: string; loaded: number | null; cited: string[]; stale: string[]; unknown: string[] }[]
    never_cited: string[]
    repeats_any: [string, number][]
    /** the numbers above count the runs merged into the default branch only; these runs are not merged yet, read where
     * 需求详情 reads them (their worktree, else their branch), with its numbers. The backend always sends it */
    unmerged?: { key: string; loaded: number | null; cited: string[]; where: 'worktree' | 'branch' }[]
  }
  /** requirements whose run can be reflected (they have a decisions.md) */
  reflect: { key: string; title: string; state: ReqState }[]
  error: string
  /** brain-kit's own words when it could not read the Brain or its use (`error` says it in Chinese): for 细节 */
  raw?: string
}

export interface ReflectOp { kind: string; target: string | null; file: string | null; type: string | null; section: string | null; src: string[]; text: string }
export interface ReflectPreview {
  repo: string
  key: string
  source: string
  ops: ReflectOp[]
  gaps: { title: string; kind: string; what: string }[]
  notes: string[]
  warnings: string[]
  problems: string[]
  /** at least one op that is more than sources added: --apply would open a branch */
  substantive: boolean
  error: string
  /** what brain-kit said, verbatim (notes, warnings, problems and error are its words in Chinese): for 细节. The backend
   * always sends it */
  raw?: string[]
}
export interface ReflectApplyBody { repo: string; key: string; push: boolean }
export interface ReflectApplyResult {
  ok: boolean
  output: string
  branch: string | null
  /** the worktree brain-kit wrote the new brain/<KEY>-reflect-<n> branch in (the person's own checkout is not touched) */
  worktree: string | null
  /** with push: the MR brain-kit opened (null: none, e.g. no GitLab token); pushed: the branch is on the remote. The
   * backend always sends them */
  mr_url?: string | null
  pushed?: boolean
}

// ---------------------------------------------------------------- GET /todo

/** handoff_unlabelled: pushed, but its MR carries no hand-over label (nothing was handed over) */
/** reply: a local session idle, your turn to talk (opens it); start: claimed by you, no run yet (开工) */
export type TodoKind = 'lean_approval' | 'question' | 'clarify' | 'acceptance' | 'handoff_rejected' | 'handoff_unlabelled' | 'crew'
  | 'reply' | 'start'
  /** write_back: merged, its Brain proposals not written back yet (回写 Brain) */
  | 'write_back'
export interface TodoItem {
  kind: TodoKind
  repo: string
  key: string
  title: string
  /** what to do, one sentence */
  text: string
  /** lean_approval: the exact line the person types themselves in that session (the app never sends it) */
  line: string | null
  approval: string | null
  /** question / acceptance on the team runner: answered on GitLab (link) */
  mr_url: string | null
  question: Question | null
  /** the brain-dev session to open, for lean_approval / clarify */
  session: { slot: string; title: string; url: string } | null
  since: number | null
}
export interface Todo { items: TodoItem[]; team: boolean }

// ---------------------------------------------------------------- team mode: GET /team, POST /team/loop

/** A run's state in brain-kit's bridge ledger (not a ReqState). */
export type RunState =
  | 'signing' // run id reserved while the separate signer signs the contract
  | 'spooled' // waiting for its workspace
  | 'ready' // workspace made, not sent to a session yet
  | 'dispatched' // sent to its brain-run session
  | 'send_unknown' // sending it to the session failed in a way that does not say whether it arrived
  | 'failed' // the workspace could not be made
  | 'merged'
  | 'closed'

export interface TeamRun {
  run_id: string
  req: string
  project: string
  iid: number
  /** brain-kit's run state; a state this page does not know is shown as it is */
  state: RunState
  slot: string | null
  mr_url: string | null
  updated: string | null
}
/**
 * What brain-kit's bridge said about one MR with the hand-over label in the last round (Bridge.process): accepted,
 * rejected, seen (that head and label event were checked before), unlabelled (the newest label event takes the label
 * off, as `brain handoff` does while it labels again), waiting (this very hand-over is being signed elsewhere), error
 * (it could not be checked this round: error says why). Another value is shown as it is.
 */
export type HandoverResult = 'accepted' | 'rejected' | 'seen' | 'unlabelled' | 'waiting' | 'error'
export interface TeamHandover {
  project: string
  iid: number
  sha: string
  result: HandoverResult
  /** why it could not be checked this round, in short Chinese ('' unless result is error) */
  error: string
  /** error as brain-kit said it, for debugging ('' when there is nothing more) */
  raw: string
  /** epoch seconds */
  at: number
  mr_url: string | null
}

export interface TeamView {
  status: TeamStatus
  /** state → count: runs by RunState, decisions by question state (open, answered, delivered, refused, void …),
   * hand-overs by checking / accepted / rejected */
  ledger: { runs: Record<string, number>; decisions: Record<string, number>; handoffs: Record<string, number> }
  runs: TeamRun[]
  /** the labelled MRs of the last round (none before the first round) */
  handovers: TeamHandover[]
  signer: {
    /** signature requests waiting for the signer */
    pending: { req_id: string; kind: string; run_id: string; since: string | null }[]
    /** requests it refused, with its reasons in short Chinese (problems.reason); raw: the same reasons as the signer
     * wrote them (brain-kit's words for a hand-over check), one per reason, for debugging */
    refused: { req_id: string; kind: string; reasons: string[]; raw: string[] }[]
    /** vouchers asked for in an earlier round that the signer has not answered yet (brain-kit's pending_vouchers): the
     * next round asks for the very same voucher, so a late signature is still used. ref: what it is for, as brain-kit
     * names it: 「answer D-2」, or 「handoff shop/shop-pay!41 <head sha>#<label event id>」 (only those within brain-kit's
     * one-hour reuse window) */
    waiting: { ref: string; kind: string; run_id: string; since: string | null }[]
  }
}
export interface TeamLoopResult { ok: boolean; summary: Record<string, number>; error: string }

// ---------------------------------------------------------------- POST /refresh {repo}

export interface RefreshResult {
  ok: boolean
  /** what happened and what to do, plain Chinese */
  text: string
  /** git's own words when the fetch failed (shown folded under 细节); '' otherwise */
  raw?: string
}

// ---------------------------------------------------------------- GET /board/{repo}/{key}: 需求看板

/**
 * An actor's state on a requirement's board, in the sample team board's words and looks (the same CSS): waiting (not
 * reached yet), queued (handed to it, not picked up yet), running (at work now), stalled (stuck: needs a look),
 * awaiting_approval (waits for a person), done (did its part), merged (finished: green), fixing (at it again after a
 * no), failed (refused or failed), skipped (not on this requirement's way).
 */
export type ActorStatus =
  | 'waiting' | 'queued' | 'running' | 'stalled' | 'awaiting_approval' | 'done' | 'merged' | 'fixing' | 'failed' | 'skipped'

/** local (the brain-dev session) · req / design / release (Lean's approvals) · handover · bridge · signer · runner (the
 * brain-run session) · ci (verify) · reflect (the write-back into the Brain) */
export type ActorKey = 'local' | 'req' | 'design' | 'handover' | 'bridge' | 'signer' | 'runner' | 'ci' | 'release' | 'reflect'

export interface ActorSpan {
  /** epoch seconds; b null: still going */
  a: number
  b: number | null
  /** work (the actor at it), wait (it waits for a person), fix (at it again after a no) */
  kind: 'work' | 'wait' | 'fix'
}
export interface ActorMark { at: number; kind: string; title: string }

export interface Actor {
  key: ActorKey
  /** 本机会话 */
  title: string
  /** what it is: brain-dev · AI-DLC Lean */
  sub: string
  /** the RoleIcon it is drawn with */
  icon: string
  status: ActorStatus
  /** one short line: what it does, did, or waits for (plain Chinese) */
  doing: string
  /** when its status began */
  since: number | null
  /** its status over time, oldest first: what 回放 shows at a moment */
  /** who: whom a wait for a person was on (Waits.who), so the replay says 等你 only for you; null otherwise */
  history: { at: number; status: ActorStatus; doing: string; who?: WaitWho | null }[]
  /** its lane's time track */
  spans: ActorSpan[]
  marks: ActorMark[]
  /** a few plain facts for its hover card and lane: 「提交 5 次」, 「verify 12 项通过」 … */
  facts: string[]
  credits: number | null
  /** its Kiro Crew session, to open */
  session: { slot: string; url: string; busy: boolean } | null
  /** a pending Lean approval: the exact line the person types themselves in the session (never sent by the app) */
  line: string | null
}

export type BoardEventKind =
  | 'claim' | 'start' | 'stage' | 'request' | 'approve' | 'reject' | 'refused' | 'blocked' | 'commit' | 'handover'
  | 'accepted' | 'rejected' | 'signed' | 'question' | 'answer' | 'verify' | 'merge' | 'reflect' | 'session' | 'app'

/** One thing that happened, from the trace (brainkit.trace), the Lean ledger, the MR, the bridge, or this app. */
export interface BoardEvent {
  /** its place in the requirement's history, from 1 (the order the board was built in: by time) */
  seq: number
  at: number
  kind: BoardEventKind
  /** where it travels on the graph: actor keys, 'person' (the owner), 'branch' (the run branch rail), 'checks' (the
   * check ring); from === to: a blip on that one */
  from: string | null
  to: string | null
  /** plain Chinese, one line */
  text: string
  /** a step a reader may hide (Lean's stage events and blocked tool calls: 「Lean 细节」) */
  detail: boolean
  src: string | null
}

/** One commit of the run branch, the hand-over commit, or the merge into the default branch (the conveyor). */
export interface BeltItem {
  kind: 'commit' | 'handover' | 'merge'
  at: number
  /** 12 hex */
  sha: string
  by: 'person' | 'bot'
  /** its subject, or what it is */
  text: string
  files: number
  /** it changed only Lean's and the run's records */
  records_only: boolean
  /** the actor whose lane it drops into the rail from: local, runner, handover */
  actor: ActorKey
  /** the files it changed, with lines added and removed (git show --numstat; A added, M modified, D deleted, R renamed):
   * the lanes' 改动 block (UI问题清单 BOARD-21). Absent from a backend that does not read them: the lane shows the
   * commits and their file counts */
  changes?: { path: string; added: number; removed: number; status: 'A' | 'M' | 'D' | 'R' }[]
}

/** One cell of the check wall: a Lean approval, a verify check, the bridge's and the signer's checks, Brain lint, the
 * 14 days after the merge. */
export interface CheckCell {
  id: string
  group: 'gate' | 'verify' | 'handover' | 'brain' | 'after'
  /** in the cell: 需求, pytest, 桥 … */
  label: string
  /** in the inspector line: 需求审批（REQUIREMENTS） */
  name: string
  /** pass, fail, wait (waits for a person), skip (not run, not needed yet), watch (the 14 days after the merge, still
   * running: nobody's turn), not_needed (not on this requirement's way: a stage Lean skipped, the runner of a repo done
   * only here) */
  status: 'pass' | 'fail' | 'wait' | 'skip' | 'watch' | 'not_needed'
  /** when it was decided (null: not yet) */
  at: number | null
  /** one plain line */
  detail: string
  actor: ActorKey | null
}
export interface CheckWall {
  cells: CheckCell[]
  passed: number
  failed: number
  total: number
  /** the checks not reached yet, by name (「发布审批」): 「目前 3 项都过 · 还剩 发布」. The backend always sends it */
  todo?: string[]
  at: number | null
  /** verify rounds: passed / failed checks over time (the sparkline) */
  history: { at: number; passed: number; failed: number }[]
}

/** 验收 (the sample's 签字单): what a person needs to accept the requirement, and the one step they take now. */
export interface Acceptance {
  /** not_yet (not at the release stage), waiting (RELEASE / acceptance waits for a person), accepted, rejected
   * (sent back), merged */
  state: 'not_yet' | 'waiting' | 'accepted' | 'rejected' | 'merged'
  /** the one step a person takes now; text '' when there is none */
  step: { text: string; who: string; line: string | null; mr_url: string | null; session_url: string | null }
  /** who settled the decisions (decisions.md's Who): person, check, brain, agent, unknown, unclassified */
  by: { id: string; label: string; count: number }[]
  /** what the checks say, one line */
  checks: string
  /** when it was accepted or merged, and by whom (a username or pseudonym, never an email) */
  done: { at: number; who: string | null; how: string } | null
}

export interface ReqBoard {
  at: number
  row: Requirement
  /** the run branch and the default branch it leaves from and lands on */
  branch: string | null
  base: string
  /** the first thing that happened, and the end (merged or closed) */
  started_at: number | null
  ended_at: number | null
  /** something is at work right now (a session busy, the runner running): the board glows */
  live: boolean
  /** the owner (the sample's orchestrator slot) */
  person: { status: ActorStatus; doing: string; owner: string | null; me: boolean }
  actors: Actor[]
  /** the way's edges (from, to) */
  edges: [string, string][]
  /** a local-only requirement past its design: the way goes from the design approval straight to the checks */
  direct: boolean
  events: BoardEvent[]
  belt: BeltItem[]
  checks: CheckWall
  accept: Acceptance
  /** what the run took from the Brain (the list under the person) */
  brain: RequirementDetail['brain']
  decisions: Decision[]
  questions: Question[]
  mr_desc: MrDesc
  sessions: SessionRow[]
  credits: { total: number | null; note: string }
  /** trace: built from brainkit.trace; app: from the Lean ledger and the repo only */
  source: 'trace' | 'app'
  missing: string[]
  error: string
}

// ---------------------------------------------------------------- GET /overview: the 交付总览 numbers (the CTO 视图's)

/** One requirement in the eval batch (brainkit.evaluate's runs), for the cards' charts and the ledger's Eval column. */
export interface CtoRun {
  key: string
  repo: string
  /** unattended: handed over, nobody acted after the hand-over beyond the required approvals, delivered correctly;
   * people: handed over, a person stepped in beyond them (or it was not delivered correctly); pending: not judged yet
   * (its 14 days after the merge are not over, or it is not merged); local: never handed over (the person did it with
   * the AI on their machine) */
  how: 'unattended' | 'people' | 'pending' | 'local'
  /** what the person did beyond the required approvals (brain-kit's words for the kinds, in Chinese) */
  beyond: string[]
  /** a person's acts at the judgment points, and outside them */
  at_points: number
  outside: number
  credits: number | null
  /** merged into the default branch (epoch s) */
  merged_at: number | null
}

export interface CtoNumbers {
  /** brainkit.evaluate ran (else the cards say why, and the numbers that need it are null) */
  available: boolean
  /** the one sentence over the three numbers */
  sentence: string
  /** what the numbers are read at (main @ sha) */
  ref: string | null
  /** 无人值守: [unattended, judged hand-over runs] */
  unattended: [number, number] | null
  /** 人介入: a person's acts at the judgment points and outside them; by kind */
  stepped_in: { at_points: number; outside: number; kinds: { label: string; n: number; point: boolean }[] } | null
  /** credits per requirement (the requirements with credits) and in all */
  credits: { per_req: number | null; total: number | null; reqs: number }
  runs: CtoRun[]
  /** merged per week (Monday, YYYY-MM-DD), by how: the last 12 weeks */
  weekly: { week: string; unattended: number; people: number; local: number; pending: number }[]
}
