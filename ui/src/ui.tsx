/**
 * Small pieces every view shares, in the sample team board's look: icons (the board's line drawings, lucide's for
 * small buttons), state chips, the Lean progress cell, outside links, the line a person types themselves, the problem
 * rows (plain Chinese, 做什么, the one-click fix, brain-kit's own words folded), the answer form, the empty state that
 * says what to do, the steps of a flow, and a counter card.
 *
 * All repo, agent and document text is rendered as plain text. The Lean approval line is shown, copied and its session
 * opened; it is never sent anywhere (no request carries it, no chat is prefilled with it).
 */
import { useState, type ReactNode } from 'react'
import icons from 'lucide-react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction } from './api'
import { fmtRate } from './format'
import { JOB_POLL_MS, useJob } from './jobs'
import { RoleIcon } from './board/RoleIcon'
import type { Tone } from './styles'
import type {
  AnswerBody, AnswerResult, ApprovalState, CheckRow, CommitResult, CrewFixBody, CrewFixResult, FileChange, ImportJob, JobStart,
  JobStepState, LeanSummary, Level, MrRef, PublishResult, Question, ReqState, RepoInfo, StageState,
} from './types'
import { STATE_LABEL } from './types'

export { RoleIcon }

export function Icon({ name, size = 15, className, title }: { name: string; size?: number; className?: string; title?: string }) {
  const C = icons[name]
  if (!C) return null
  return <C size={size} className={className} aria-hidden={title ? undefined : true} aria-label={title} />
}

export const STATE_TONE: Record<ReqState, Tone> = {
  claimed: 'idle', local: 'run', handed_over: 'hand', rejected: 'bad', running: 'run', parked: 'wait', acceptance: 'wait', merged: 'ok', closed: 'idle',
}
/** the dot inside a state chip: live states blink, as the board's run status does */
const STATE_DOT: Record<ReqState, string> = {
  claimed: '○', local: '●', handed_over: '➜', rejected: '✕', running: '●', parked: '✋', acceptance: '✋', merged: '✔', closed: '■',
}
const LIVE_STATES: ReadonlySet<ReqState> = new Set<ReqState>(['local', 'running', 'parked', 'acceptance'])

export function StateChip({ state, label }: { state: ReqState; label?: string }) {
  return (
    <span className={`br-chip tone-${STATE_TONE[state] ?? 'idle'} kt-pill${LIVE_STATES.has(state) ? ' is-live' : ''}`} data-state={state}>
      <i aria-hidden="true">{STATE_DOT[state] ?? '•'}</i>
      {label || STATE_LABEL[state] || state}
    </span>
  )
}

export const LEVEL_TONE: Record<Level, Tone> = { OK: 'ok', WARN: 'warn', FAIL: 'bad' }
export const LEVEL_LABEL: Record<Level, string> = { OK: '正常', WARN: '注意', FAIL: '有问题' }
export const LEVEL_GLYPH: Record<Level, string> = { OK: '✓', WARN: '!', FAIL: '✕' }

export const APPROVAL_META: Record<ApprovalState, { label: string; tone: Tone }> = {
  approved: { label: '已批准', tone: 'ok' },
  pending: { label: '等你批', tone: 'wait' },
  rejected: { label: '退回', tone: 'bad' },
  stale: { label: '已过期', tone: 'warn' },
  refused: { label: '被拒', tone: 'bad' },
}

export const STAGE_META: Record<StageState, { label: string; glyph: string; tone: Tone }> = {
  done: { label: '做完', glyph: '✓', tone: 'ok' },
  skipped: { label: '跳过', glyph: '–', tone: 'idle' },
  started: { label: '在做', glyph: '●', tone: 'run' },
  todo: { label: '没开始', glyph: '○', tone: 'idle' },
}

export const QUESTION_STATE: Record<string, { label: string; tone: Tone }> = {
  waiting: { label: '等回答', tone: 'wait' },
  open: { label: '已发出，等回答', tone: 'wait' },
  // on the MR / in the ledger: the bridge has the answer but has not signed it back yet (nobody should answer again)
  answered: { label: '已收到回答，等桥签名送回', tone: 'info' },
  delivered: { label: '已送回', tone: 'ok' },
  stale: { label: '过期', tone: 'warn' },
  invalid: { label: '无效', tone: 'bad' },
  closed: { label: '已关闭', tone: 'idle' },
  posting: { label: '正在发到 MR', tone: 'wait' },
  // brain-kit 72b278e: one bridge process is posting it right now (another one waits)
  asking: { label: '正在发到 MR', tone: 'wait' },
  delivery_unknown: { label: '送没送到不清楚', tone: 'warn' },
  void: { label: '作废', tone: 'bad' },
  refused: { label: '签名服务拒签', tone: 'bad' },
}

/** A question state's label and tone. A park.json question (*source* park) has no bridge: its 'answered' is just 已回答. */
export const questionMeta = (state: string, source?: Question['source']) =>
  source === 'park' && state === 'answered' ? { label: '已回答', tone: 'info' as Tone } : QUESTION_STATE[state] ?? { label: state, tone: 'idle' as Tone }
export const isOpenQuestion = (q: Pick<Question, 'state'>) => q.state === 'waiting' || q.state === 'open'

/** What the stage of a LeanSummary is, when it is not the one being worked on. */
const LEAN_HINT: Partial<Record<StageState, string>> = { todo: '下一步', done: '做完', skipped: '做完' }

/**
 * 3/11 需求分析, with one cell per Lean stage (green: done or skipped, blue: the one in progress); 下一步 when nothing is
 * open and that stage is the next one to do, 做完 when it is the last stage and done (the requirement's Lean work is
 * finished).
 */
export function LeanCell({ lean, compact = false }: { lean: LeanSummary; compact?: boolean }) {
  const hint = lean.stage_state ? LEAN_HINT[lean.stage_state] : undefined
  const now = lean.stage_state === 'started' && lean.stage_n !== null ? lean.stage_n : null
  return (
    <span className="br-row" style={{ gap: 6 }} data-testid="lean-cell">
      <span className="br-mono">{lean.stage_n !== null ? `${lean.stage_n}/${lean.total}` : `0/${lean.total}`}</span>
      {!compact && <span>{lean.stage_label ?? '还没开始'}</span>}
      {hint && <span className="br-hint" data-testid="lean-hint">{hint}</span>}
      <span className="br-prog" role="img" aria-label={`做完 ${lean.done}/${lean.total}`} title={`做完或跳过 ${lean.done}/${lean.total}`}>
        {Array.from({ length: lean.total }, (_, i) => (
          <i key={i} className={i < lean.done ? 'is-done' : now !== null && i === now - 1 ? 'is-started' : ''} />
        ))}
      </span>
    </span>
  )
}

/** A link that opens outside the app (a new tab). Only http(s) URLs become links. */
export function ExtLink({ href, children, className = 'br-link' }: { href: string | null | undefined; children: ReactNode; className?: string }) {
  if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <Icon name="ExternalLink" size={12} />
    </a>
  )
}

export function MrLink({ mr }: { mr: MrRef | null }) {
  if (!mr) return <span className="br-dim">—</span>
  return <ExtLink href={mr.url}>!{mr.iid}{mr.state ? ` · ${MR_STATE[mr.state] ?? mr.state}` : ''}</ExtLink>
}
const MR_STATE: Record<string, string> = { opened: '开着', merged: '已合并', closed: '已关闭', locked: '锁着' }

/** a/b · % for a rate; a number; 「还没有数」 for null. */
export function Rate({ value }: { value: [number, number] | number | null }) {
  if (value === null) return <span className="br-dim">还没有数</span>
  if (typeof value === 'number') return <b className="br-strong">{value}</b>
  const r = fmtRate(value)
  return (
    <span>
      <b className="br-strong">{r.frac}</b> <span className="br-dim">· {r.pct}</span>
    </span>
  )
}

export const TYPE_IT_YOURSELF = '在会话里自己打这一行。app 不会替你发。'

/**
 * The Lean approval line the person types themselves in the session: shown, 复制 (the clipboard), 打开会话 (opens
 * the session; nothing is typed or sent there). *sessionUrl* null: no session to open.
 */
export function TypeLine({ line, sessionUrl }: { line: string; sessionUrl?: string | null }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }
  return (
    <div className="br-line" data-testid="type-line">
      <code className="br-mono">{line}</code>
      <div className="br-row">
        <button type="button" className="br-btn is-small" onClick={() => void copy()}>
          <Icon name="Copy" size={13} />复制
        </button>
        {sessionUrl && (
          <button type="button" className="br-btn is-small" onClick={() => navigate(sessionUrl)}>
            <Icon name="MessageSquare" size={13} />打开会话
          </button>
        )}
        {copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制</span>}
        {copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请手动选中这一行</span>}
      </div>
      <p>{TYPE_IT_YOURSELF}</p>
    </div>
  )
}

const FIX_LABEL: Record<CrewFixBody['what'], string> = { agent: '补上 brain-dev 的 Lean hook', engine: '把引擎换成 kas' }
export const KIT_FIX_LABEL = '重装到新分支'

/** The fix a row offers: its own (`fix`), else the old per-check flags (an older backend's rows have no `fix`). */
function fixOf(r: CheckRow, flags?: { agent: boolean; engine: boolean }): CheckRow['fix'] {
  if (r.fix !== undefined) return r.fix
  if (r.level === 'OK') return null
  if (flags?.agent && /brain-dev/.test(r.text)) return 'agent'
  if (flags?.engine && /引擎/.test(r.text)) return 'engine'
  return null
}

/**
 * The problem rows of KiroCrew's checks, `brain doctor`, brain lint …: per row the level as a glyph (✓ / ! / ✕), what
 * it is in plain Chinese, 做什么, the one-click fix when the app can do it (brain-dev's hooks and the engine: POST
 * /crew/fix; the repo's kit files: 重装到新分支, POST /import/upgrade), and brain-kit's own words folded (for
 * debugging). *only*: which levels to list (default all). onFixed gets the rows a crew fix answered.
 */
export function CheckRows({ rows, fix, only, onFixed, empty }: {
  rows: CheckRow[]
  fix?: { agent: boolean; engine: boolean }
  only?: Level[]
  onFixed?: (rows: CheckRow[]) => void
  empty?: string
}) {
  const api = useAppApi()
  const act = useAction((body: CrewFixBody) => api.post<CrewFixResult>(paths.crewFix(), body))
  const shown = only ? rows.filter((r) => only.includes(r.level)) : rows
  const doFix = async (what: CrewFixBody['what']) => {
    const r = await act.run({ what })
    if (r) onFixed?.(r.rows)
  }
  if (!shown.length) return empty ? <p className="br-empty">{empty}</p> : null
  return (
    <div className="br-stack" style={{ gap: 6 }} data-testid="check-rows">
      <ul className="br-probs">
        {shown.map((r, i) => {
          const f = fixOf(r, fix)
          return (
            <li key={i} className={`br-prob is-${r.level}`} data-level={r.level}>
              <span className={`br-prob-glyph tone-${LEVEL_TONE[r.level] ?? 'idle'}`} role="img" aria-label={LEVEL_LABEL[r.level] ?? r.level}>
                {LEVEL_GLYPH[r.level] ?? '•'}
              </span>
              <span className="br-prob-text br-pre">{r.repo && <span className="br-tag br-prob-repo" title={r.repo}>{r.repo.replace(/\/+$/, '').split('/').pop()}</span>}{r.text}</span>
              {r.todo && <span className="br-prob-todo"><b>做什么</b>{r.todo}</span>}
              {(f || r.raw) && (
                <span className="br-prob-acts">
                  {(f === 'agent' || f === 'engine') && (
                    <button type="button" className="br-btn is-small is-primary" disabled={act.busy} onClick={() => void doFix(f)}>
                      <Icon name="Wrench" size={13} />{FIX_LABEL[f]}
                    </button>
                  )}
                  {f === 'kit' && r.repo && <KitFix repo={r.repo} onDone={() => onFixed?.(rows)} />}
                  {r.raw && (
                    <details className="br-raw">
                      <summary>brain-kit 的原话</summary>
                      <pre>{r.raw}</pre>
                    </details>
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {act.result && <p className={`br-pre br-small ${act.result.ok ? 'br-ok-text' : 'br-bad-text'}`} role="status">{act.result.text}</p>}
      {act.error && <p className="br-error" role="alert">{act.error}</p>}
    </div>
  )
}

/** What an upgrade job answers (the kit fix): like an install, with what the page needs for the next step. */
interface UpgradeOut {
  path: string
  branch: string
  base: string | null
  worktree: string | null
  files: FileChange[]
  commit: CommitResult
  text?: string
  remote_url?: string
  target?: string
  gitlab_project?: string
  can_open_mr?: boolean
}

const STEP_GLYPH: Record<JobStepState, string> = { todo: '○', running: '●', ok: '✓', warn: '!', fail: '✕' }
const STEP_TONE: Record<JobStepState, Tone> = { todo: 'idle', running: 'run', ok: 'ok', warn: 'warn', fail: 'bad' }

/** A job's steps as a row of cells (the board's segments), and the step in progress said in words. */
export function JobSteps({ job }: { job: ImportJob<unknown> }) {
  const now = job.steps.find((s) => s.state === 'running')
  return (
    <div className="br-stack" style={{ gap: 4 }} data-testid={`job-${job.kind}`} data-state={job.state}>
      <ol className="br-jobsteps" aria-label="进度">
        {job.steps.map((s) => (
          <li key={s.id} className={`is-${s.state} tone-${STEP_TONE[s.state]}`} data-step={s.id} data-state={s.state} title={s.detail || s.label}>
            <i aria-hidden="true">{STEP_GLYPH[s.state]}</i>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
      {now && <span className="br-hint" role="status">正在{now.label}…</span>}
      {job.state === 'failed' && job.error && <p className="br-error br-pre" role="alert">{job.error}</p>}
    </div>
  )
}

/**
 * 重装到新分支 (a row's kit fix): `brain install` again on a new branch of the repo in its own worktree (the person's
 * checkout is not touched), committed with their identity; then, when the repo has a remote, 推送并开 MR after a confirm
 * that says which branch goes where. Without a remote it says the branch is on this machine only.
 */
export function KitFix({ repo, onDone }: { repo: string; onDone?: () => void }) {
  const api = useAppApi()
  const [asking, setAsking] = useState(false)
  const start = useAction(() => api.post<JobStart>(paths.importUpgrade(), { path: repo }))
  const job = useJob<UpgradeOut>(JOB_POLL_MS, (j) => j.state === 'done' && onDone?.())
  const again = useAction(() => api.post<CommitResult>(paths.importCommit(), { path: repo, purpose: 'upgrade' }))
  const pub = useAction((b: Record<string, unknown>) => api.post<PublishResult>(paths.importPublish(), b))
  const j = job.job
  const r = j?.result ?? null
  const commit = again.result ?? r?.commit
  const run = async () => {
    const got = await start.run()
    if (got) job.start(got.job as ImportJob<UpgradeOut>)
  }
  if (!j) {
    return (
      <span className="br-row" style={{ gap: 6 }}>
        <button type="button" className="br-btn is-small is-primary" disabled={start.busy} onClick={() => void run()}
          title="在新分支上重跑 brain install（单独的工作目录，不动你现在的检出），用你的 git 身份提交">
          <Icon name="GitBranchPlus" size={13} />{start.busy ? '正在开始…' : KIT_FIX_LABEL}
        </button>
        {start.error && <span className="br-error br-small" role="alert">{start.error}</span>}
      </span>
    )
  }
  return (
    <div className="br-fixjob" data-testid="kit-fix">
      <JobSteps job={j} />
      {job.readError && <p className="br-note" role="status">{job.readError}</p>}
      {r && (
        <>
          {r.text && <p className="br-pre" role="status">{r.text}</p>}
          {commit && !commit.ok && commit.text && (
            <div className="br-banner is-error" role="alert">
              <p className="br-pre">{commit.text}</p>
              <div className="br-row">
                <button type="button" className="br-btn is-small" disabled={again.busy} onClick={() => void again.run()}>{again.busy ? '正在提交…' : '再提交一次'}</button>
              </div>
            </div>
          )}
          {commit?.ok && r.remote_url && !pub.result?.ok && (
            asking ? (
              <div className="br-confirm" role="group" aria-label="确认推送">
                <p>会把分支 <code>{r.branch}</code> 推到 origin（<code>{r.remote_url}</code>）{r.gitlab_project ? <>，在 <code>{r.gitlab_project}</code> 上开 MR：<code>{r.branch}</code> → <code>{r.target}</code></> : ''}。</p>
                <div className="br-row">
                  <button type="button" className="br-btn is-small is-primary" disabled={pub.busy}
                    onClick={() => void pub.run({ path: repo, branch: r.branch, target: r.target, remote_url: r.remote_url, confirm: true, purpose: 'upgrade' }).then(() => setAsking(false))}>
                    {pub.busy ? '正在推送…' : '确定推送'}
                  </button>
                  <button type="button" className="br-btn is-small" disabled={pub.busy} onClick={() => setAsking(false)}>取消</button>
                </div>
              </div>
            ) : (
              <span className="br-row">
                <button type="button" className="br-btn is-small" onClick={() => setAsking(true)}><Icon name="GitPullRequest" size={13} />推送并开 MR</button>
                <span className="br-hint">合进 {r.target || '默认分支'} 以后，这一行就好了。</span>
              </span>
            )
          )}
          {pub.result && (
            <p className={`br-pre br-small ${pub.result.ok ? 'br-ok-text' : 'br-bad-text'}`} role="status">
              {pub.result.text}{pub.result.mr && <> <ExtLink href={pub.result.mr.url}>MR !{pub.result.mr.iid}</ExtLink></>}
              {!pub.result.mr && pub.result.new_mr_url && <> <ExtLink href={pub.result.new_mr_url}>在 GitLab 上开 MR</ExtLink></>}
            </p>
          )}
          {pub.error && <p className="br-error" role="alert">{pub.error}</p>}
          {again.error && <p className="br-error" role="alert">{again.error}</p>}
        </>
      )}
    </div>
  )
}

export const VIA_TEXT: Record<'session' | 'mr', string> = {
  session: '回答会送进你的本地会话',
  mr: '回答会以你的 GitLab 身份发在 MR 上',
}

/** The two answers of a question without options (brain-kit answers those approve / reject). */
const YES_NO: { value: 'approve' | 'reject'; label: string }[] = [
  { value: 'approve', label: '同意（approve）' },
  { value: 'reject', label: '不同意（reject）' },
]

/**
 * The answer form of a question, only when it may be answered here (`answerable_here`) and is not a Lean approval
 * request (those the person types themselves in the session; the app never offers approve / reject for them).
 * One radio per option; a question without options gets 同意 / 不同意 (choice approve / reject).
 * Posts AnswerBody to /requirements/{repo}/{key}/answer.
 */
export function AnswerForm({ question, repo, reqKey, onDone }: { question: Question; repo: string; reqKey: string; onDone?: (r: AnswerResult) => void }) {
  const api = useAppApi()
  const [choice, setChoice] = useState('')
  const [note, setNote] = useState('')
  const act = useAction((body: AnswerBody) => api.post<AnswerResult>(paths.answer(repo, reqKey), body))
  if (!question.answerable_here || question.lean_request) return null
  const name = `answer-${repo}-${reqKey}-${question.id ?? question.question.slice(0, 16)}`
  const submit = async () => {
    const body: AnswerBody = { choice: choice.trim() }
    if (note.trim()) body.note = note.trim()
    if (question.id) body.id = question.id
    const r = await act.run(body)
    if (r) {
      setChoice('')
      setNote('')
      onDone?.(r)
    }
  }
  return (
    <form className="br-stack" style={{ gap: 8 }} aria-label={`回答 ${question.id ?? reqKey}`} onSubmit={(e) => { e.preventDefault(); void submit() }}>
      {question.options.length > 0 ? (
        <fieldset className="br-fieldset">
          <legend>选一个</legend>
          {question.options.map((o) => (
            <label key={o.id} className="br-check">
              <input type="radio" name={name} value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} />
              <span>
                <b className="br-mono">{o.id}</b> {o.text}
                {question.recommend === o.id && <span className="br-chip tone-ok" style={{ marginLeft: 6 }}>推荐</span>}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <fieldset className="br-fieldset">
          <legend>同意吗</legend>
          {YES_NO.map((o) => (
            <label key={o.value} className="br-check">
              <input type="radio" name={name} value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="br-field">
        <label htmlFor={`${name}-note`}>补一句（可不填）</label>
        <textarea id={`${name}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="br-row">
        <button type="submit" className="br-btn is-primary" disabled={!choice.trim() || act.busy}>{act.busy ? '正在发…' : '回答'}</button>
        {question.answer_via && <span className="br-hint">{VIA_TEXT[question.answer_via]}</span>}
      </div>
      {act.result && <p className="br-pre br-ok-text" role="status">{act.result.text}</p>}
      {act.error && <p className="br-error" role="alert">{act.error}</p>}
    </form>
  )
}

export const IMPORT_WHY = '先导入一个项目仓库：本机的目录，或者从 GitLab 克隆。app 会先检查它；没装 brain-kit 的，可以装到一个新分支上，不动你现在的检出。'

/** The way a repo gets in, as the steps of 导入仓库 (the empty states show it). */
export const IMPORT_FLOW: FlowStep[] = [
  { icon: 'import', title: '从哪来', text: '本机目录，或从 GitLab 克隆' },
  { icon: 'lint', title: '检查', text: '只读：git、brain-kit、Lean、KiroCrew' },
  { icon: 'handover', title: '装到新分支', text: '没装 brain-kit 的，不动你的检出' },
  { icon: 'list', title: '加入列表', text: '交付总览、开需求就能用了' },
]

/** No repo yet: the way in, big (交付总览, 开需求), as the board's empty state introduces the team. */
export function ImportCta({ onImport, title = '还没有仓库' }: { onImport: () => void; title?: string }) {
  return (
    <EmptyHero
      testid="import-cta"
      label="导入仓库"
      title={title}
      text={[IMPORT_WHY]}
      punch="导入以后，每个需求都在这里：在哪一步、等谁、花了多少。"
      flow={IMPORT_FLOW}
    >
      <button type="button" className="br-btn is-primary is-big" onClick={onImport}>
        <RoleIcon role="import" size={17} />导入仓库
      </button>
    </EmptyHero>
  )
}

/** A listed repo whose brain-kit is on its way: what it waits for, and the MR or the way to 导入仓库. */
export function PendingRepo({ repo, onOpen, banner = false }: { repo: RepoInfo; onOpen: () => void; banner?: boolean }) {
  const p = repo.pending
  if (!p) return null
  return (
    <div className={banner ? 'br-banner is-info' : 'br-stack'} style={banner ? undefined : { gap: 2 }} role="status" data-testid="repo-pending" data-repo={repo.id}>
      <div className="br-row">
        <span>{banner && <b className="br-strong">{repo.name}：</b>}{p.text}。{p.next}</span>
        {p.mr_url ? <ExtLink href={p.mr_url}>看 MR</ExtLink> : (
          <button type="button" className="br-btn is-small" onClick={onOpen}>去导入仓库</button>
        )}
      </div>
    </div>
  )
}

/** Small loading / error lines of a polled view. */
export function LoadState({ loading, error, has }: { loading: boolean; error: string; has: boolean }) {
  if (error) return <div className={`br-banner${has ? '' : ' is-error'}`} role="alert">{has ? `刷新没成：${error}，显示的是上一次拿到的数据` : error}</div>
  if (loading && !has) return <p className="br-loading">正在读取…</p>
  return null
}

// ---------------------------------------------------------------- empty states, flows, counters

export interface FlowStep {
  icon: string
  title: string
  text?: string
  /** done | now | wait (waits for a person) | bad | off (not needed) */
  state?: 'done' | 'now' | 'wait' | 'bad' | 'off'
}

/** The steps of a flow, left to right, numbered, each with its line icon (the board's team introduction). */
export function Flow({ steps, label, numbered = true }: { steps: FlowStep[]; label?: string; numbered?: boolean }) {
  return (
    <ol className="br-flow" style={{ ['--n' as string]: steps.length }} aria-label={label}>
      {steps.map((s, i) => (
        <li key={`${s.title}-${i}`} className={s.state ? `is-${s.state}` : undefined} data-state={s.state}>
          <RoleIcon role={s.icon} size={26} />
          <b>{numbered && <span className="br-flow-n">{s.state === 'done' ? '✓' : i + 1}</span>}{s.title}</b>
          {s.text && <small>{s.text}</small>}
        </li>
      ))}
    </ol>
  )
}

/**
 * An empty state that explains what to do (the board's 「做出来越来越便宜…」 introduction): a big line, a paragraph
 * or two, the one sentence to remember, the flow it starts, and the way in.
 */
export function EmptyHero({ title, text, punch, flow, children, testid, label }: {
  title: string
  text?: ReactNode[]
  punch?: string
  flow?: FlowStep[]
  children?: ReactNode
  testid?: string
  label?: string
}) {
  return (
    <section className="br-hero" data-testid={testid} aria-label={label ?? title}>
      <div>
        <h2>{title}</h2>
        {text?.map((t, i) => <p key={i}>{t}</p>)}
        {punch && <p className="br-punch">{punch}</p>}
      </div>
      {flow && <Flow steps={flow} />}
      {children && <div className="br-hero-acts">{children}</div>}
    </section>
  )
}

/** A counter card (the board's 指标卡): a label, a big number with its "of", a visual, a note. */
export function Kpi({ label, value, of, note, tone, children, testid }: {
  label: string
  value: ReactNode
  of?: ReactNode
  note?: ReactNode
  tone?: 'ok' | 'bad' | 'wait'
  children?: ReactNode
  testid?: string
}) {
  return (
    <div className={`br-kpi${tone ? ` is-${tone}` : ''}`} data-testid={testid}>
      <div className="br-kpi-label">{label}</div>
      <div><span className="br-kpi-big">{value}</span>{of !== undefined && <span className="br-kpi-of">{of}</span>}</div>
      {children}
      {note && <div className="br-kpi-note">{note}</div>}
    </div>
  )
}

/** A row of small cells, one per item (the board's 测试通过 segments). */
export function Segs({ cells, label }: { cells: { tone: 'pass' | 'fail' | 'run' | 'idle'; title?: string }[]; label?: string }) {
  return (
    <div className="kt-segs br-segs" role="img" aria-label={label}>
      {cells.map((c, i) => <i key={i} className={c.tone === 'pass' ? 'is-pass' : c.tone === 'fail' ? 'is-fail' : c.tone === 'run' ? 'is-run' : ''} title={c.title} />)}
    </div>
  )
}
