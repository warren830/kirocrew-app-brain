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
export interface CheckRow { level: Level; text: string }

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

export interface Waits {
  who: WaitWho
  /** one short Chinese sentence, e.g. 「等你批准需求（在会话里自己打一行）」 */
  text: string
  /** the exact Lean approval line the person must type themselves in the session, when that is what it waits on */
  line: string | null
}

export interface LeanSummary {
  /** the stage being worked on (Lean stage id) or null when nothing started */
  stage: string | null
  /** its Chinese label, e.g. 需求分析 */
  stage_label: string | null
  /** 1..11, the stage's place in Lean's order */
  stage_n: number | null
  /** stages done or skipped / 11 */
  done: number
  total: number
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
  waits: Waits
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
}

// ---------------------------------------------------------------- GET /status

export interface RepoInfo {
  id: string
  path: string
  name: string
  ok: boolean
  error: string
  kit: { tracker: string; req_prefix: string; default_branch: string; gitlab_base: string; gitlab_project: string } | null
}

export interface Status {
  app: { name: string; version: string; team: boolean }
  brainkit: {
    path: string
    ok: boolean
    version: string | null
    error: string
    /** optional brain-kit modules: true when importable */
    modules: { trace: boolean; evaluate: boolean; golden: boolean; intents: boolean }
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

// ---------------------------------------------------------------- GET/POST /settings

export interface Settings {
  /** brain-kit checkout this app imports (read-only to the app) */
  brainkit: string
  /** project repos (brain-kit installed) shown on this machine */
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
}

/** 决策漏斗: who settled each decision. */
export interface Funnel {
  source: 'evaluate' | 'app'
  total: number
  /** label → count, in order: 人, 确定性检查, Brain 条目（引用）, agent 自己定（权限内）, 看不出 */
  rows: { id: string; label: string; count: number }[]
  /** questions asked of people / answered / delivered back to the run */
  questions: { asked: number; answered: number; delivered: number }
}

export interface Overview {
  at: number
  rows: Requirement[]
  overlaps: Overlap[]
  funnel: Funnel
  eval: EvalView
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

export interface Decision {
  id: string
  date: string | null
  stage: string | null
  text: string
  why: string | null
  /** what the Who cell says, shown only when it is a role, username or pseudonym */
  who: string | null
  by: 'person' | 'agent' | 'check' | 'bridge' | null
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
  /** park.json: waiting | answered; on the MR / in brain-kit's ledger: posting | open | answered | delivered |
   * delivery_unknown | refused (the signer would not sign it) | stale (a new push) | void (not bound to its push and
   * park.json) | invalid | closed */
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
}

// ---------------------------------------------------------------- POST /requirements/{repo}/{key}/session, /answer

export interface OpenSessionBody { trust?: boolean; kickoff?: boolean }
export interface OpenSessionResult { ok: boolean; slot: string; url: string }
/** id: the question's D-<n> when it has one (an MR question); without it the open clarify question is meant. */
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

export interface IntakeNext { repo: string; key: string | null; tracker: string; prefix: string; error: string }

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
  /** gates that would stop the start, verbatim */
  blocking: string[]
  refused: { id: string; name: string; reason: string }[]
  /** a hard stop before any finding (no consent, nothing to take in …), verbatim */
  error: string
}

export interface StartBody extends IntakeBody {
  /** modules expected to change (run.json expected_paths; overlap warnings) */
  paths: string[]
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
  lint: { errors: string[]; warnings: string[] }
  usage: {
    useful: [number, number]
    repeat_rate: [number, number]
    archived: number
    purged: number
    runs: { intent: string; key: string; loaded: number | null; cited: string[]; stale: string[]; unknown: string[] }[]
    never_cited: string[]
    repeats_any: [string, number][]
  }
  /** requirements whose run can be reflected (they have a decisions.md) */
  reflect: { key: string; title: string; state: ReqState }[]
  error: string
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
}
export interface ReflectApplyBody { repo: string; key: string; push: boolean }
export interface ReflectApplyResult { ok: boolean; output: string; branch: string | null }

// ---------------------------------------------------------------- GET /todo

export type TodoKind = 'lean_approval' | 'question' | 'clarify' | 'acceptance' | 'handoff_rejected' | 'crew'
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

export interface TeamRun {
  run_id: string
  req: string
  project: string
  iid: number
  state: string
  slot: string | null
  mr_url: string | null
  updated: string | null
}
export interface TeamView {
  status: TeamStatus
  ledger: { runs: Record<string, number>; decisions: Record<string, number>; handoffs: Record<string, number> }
  runs: TeamRun[]
  /** signature requests waiting for the signer, and ones it refused (with its reasons) */
  signer: { pending: { req_id: string; kind: string; run_id: string; since: string | null }[]; refused: { req_id: string; kind: string; reasons: string[] }[] }
}
export interface TeamLoopResult { ok: boolean; summary: Record<string, number>; error: string }

// ---------------------------------------------------------------- POST /refresh {repo}

export interface RefreshResult { ok: boolean; text: string }
