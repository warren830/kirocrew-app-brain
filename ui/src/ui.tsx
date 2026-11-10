/**
 * Small pieces every view shares, in the sample team board's look: icons (the board's line drawings, lucide's for
 * small buttons), state chips, the Lean progress cell, outside links, the line a person types themselves, the problem
 * rows (plain Chinese, 做什么, the one-click fix, brain-kit's own words folded), the answer form, the empty state that
 * says what to do, the steps of a flow, and a counter card.
 *
 * All repo, agent and document text is rendered as plain text. The Lean approval line is shown, copied and its session
 * opened; it is never sent anywhere (no request carries it, no chat is prefilled with it).
 */
import { useEffect, useState, type ReactNode } from 'react'
import icons from 'lucide-react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction } from './api'
import { fmtRate } from './format'
import { useLatest } from './hooks'
import { JOB_POLL_MS, useJob } from './jobs'
import { RoleIcon } from './board/RoleIcon'
import type { Tone } from './styles'
import type {
  AnswerBody, AnswerResult, ApprovalState, CheckRow, CommitResult, CrewFixBody, CrewFixResult, FileChange, ImportJob, ImportPurpose,
  InstallChoices, InstallMode, JobStart, JobStepState, LeanSummary, Level, MeNameResult, MergeResult, MrRef, PendingInstall, PublishResult,
  PullResult, PushResult, Question, ReqState, RepoInfo, RepoMe, StageState, WaitWho,
} from './types'
import { STATE_LABEL } from './types'
import { ACT } from './vocab'

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

/** A requirement's state. With *who* (its waits.who), the one judgment of whose turn it is: 停下等回答 / 等验收 are
 * magenta (等人) only when they wait on you, calm when they wait on someone else (the product, a colleague); a state
 * whose AI is not at work right now (an idle session waiting for you) does not blink. */
export function StateChip({ state, label, who }: { state: ReqState; label?: string; who?: WaitWho }) {
  const tone = STATE_TONE[state] ?? 'idle'
  const calm = who !== undefined && (tone === 'wait' ? who !== 'you' : tone === 'run' ? who !== 'agent' && who !== 'runner' : false)
  return (
    <span className={`br-chip tone-${calm && tone === 'wait' ? 'info' : tone} kt-pill${LIVE_STATES.has(state) && !calm ? ' is-live' : ''}`} data-state={state}>
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
 * The Lean approval line the person types themselves in the session: shown, 复制那一行 (the clipboard), 打开会话 (opens
 * the session; nothing is typed or sent there). *sessionUrl* null: no session to open. *said*: the words beside it say
 * already that the person types it, so the box does not say it again.
 */
export function TypeLine({ line, sessionUrl, said }: { line: string; sessionUrl?: string | null; said?: boolean }) {
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
          <Icon name="Copy" size={13} />{ACT.copyLine}
        </button>
        {sessionUrl && (
          <button type="button" className="br-btn is-small" onClick={() => navigate(sessionUrl)}>
            <Icon name="MessageSquare" size={13} />{ACT.openSession}
          </button>
        )}
        {copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制</span>}
        {copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请手动选中这一行</span>}
      </div>
      {!said && <p>{TYPE_IT_YOURSELF}</p>}
    </div>
  )
}

/** The fix buttons' names (backend/core/problems.py FIX_BUTTON): a row's 做什么 names its button, 点「…」, and the button
 * shows that name (「装上 brain-dev」 when the file is not there at all); these when it names none. */
const FIX_LABEL: Record<CrewFixBody['what'], string> = { agent: '补上 Lean 的拦截', engine: '把引擎换成 kas' }
export const KIT_FIX_LABEL = '重装 kit 文件'
const FIX_NAMES: readonly string[] = [...Object.values(FIX_LABEL), KIT_FIX_LABEL, '装上 brain-dev']
const fixName = (r: CheckRow, fallback: string): string => {
  const named = /点「([^」]{2,20})」/.exec(r.todo ?? '')?.[1] ?? ''
  return FIX_NAMES.includes(named) ? named : fallback
}

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
 * /crew/fix; the repo's kit files: 重装 kit 文件, POST /import/upgrade), and brain-kit's own words folded (for
 * debugging). *only*: which levels to list (default all). onFixed gets the rows a crew fix answered.
 * A kit fix's row stays while the fix runs or waits for the person (再提交一次, 推送), also when a reload of *rows* no
 * longer has it (the fix worked); *onHold* says whether one does, for a page that would drop the whole list.
 */
export function CheckRows({ rows, fix, only, onFixed, onHold, empty }: {
  rows: CheckRow[]
  fix?: { agent: boolean; engine: boolean }
  only?: Level[]
  onFixed?: (rows: CheckRow[]) => void
  onHold?: (on: boolean) => void
  empty?: string
}) {
  const api = useAppApi()
  const act = useAction((body: CrewFixBody) => api.post<CrewFixResult>(paths.crewFix(), body))
  const [held, setHeld] = useState<Record<string, CheckRow>>({})
  const holdRef = useLatest(onHold)
  const holding = Object.keys(held).length > 0
  useEffect(() => { holdRef.current?.(holding) }, [holding, holdRef])
  useEffect(() => () => holdRef.current?.(false), [holdRef])
  const hold = (r: CheckRow, on: boolean) => setHeld((h) => {
    const n = { ...h }
    if (on) n[r.repo as string] = r
    else delete n[r.repo as string]
    return n
  })
  const shown = only ? rows.filter((r) => only.includes(r.level)) : rows
  const kitHere = new Set(shown.filter((r) => r.repo && fixOf(r, fix) === 'kit').map((r) => r.repo as string))
  const list = [...shown, ...Object.values(held).filter((r) => !kitHere.has(r.repo as string))]
  const seen = new Set<string>()
  const doFix = async (what: CrewFixBody['what']) => {
    const r = await act.run({ what })
    if (r) onFixed?.(r.rows)
  }
  if (!list.length) return empty ? <p className="br-empty">{empty}</p> : null
  return (
    <div className="br-stack" style={{ gap: 6 }} data-testid="check-rows">
      <ul className="br-probs">
        {list.map((r, i) => {
          const f = fixOf(r, fix)
          const kit = f === 'kit' && !!r.repo && !seen.has(r.repo)
          if (kit) seen.add(r.repo as string)
          return (
            <li key={kit ? `kit:${r.repo}` : `${i}:${r.level}:${r.text}`} className={`br-prob is-${r.level}`} data-level={r.level}>
              <span className={`br-prob-glyph tone-${LEVEL_TONE[r.level] ?? 'idle'}`} role="img" aria-label={LEVEL_LABEL[r.level] ?? r.level}>
                {LEVEL_GLYPH[r.level] ?? '•'}
              </span>
              <span className="br-prob-text br-pre">{r.repo && <span className="br-tag br-prob-repo" title={r.repo}>{r.repo.replace(/\/+$/, '').split('/').pop()}</span>}{r.text}</span>
              {r.todo && <span className="br-prob-todo"><b>做什么</b>{r.todo}</span>}
              {(f || r.raw) && (
                <span className="br-prob-acts">
                  {(f === 'agent' || f === 'engine') && (
                    <button type="button" className="br-btn is-small is-primary" disabled={act.busy} onClick={() => void doFix(f)}>
                      <Icon name="Wrench" size={13} />{fixName(r, FIX_LABEL[f])}
                    </button>
                  )}
                  {kit && <KitFix repo={r.repo as string} label={fixName(r, KIT_FIX_LABEL)} onHold={(on) => hold(r, on)} onDone={() => onFixed?.(rows)} />}
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
  mode?: InstallMode
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
 * 重装 kit 文件 (a row's kit fix): `brain install` again, committed with the person's identity. Where it goes comes from POST
 * /import/choices: in place on the checkout's branch (the default; no choice to make when the repo has no remote and
 * nothing uncommitted: one click), or a new branch for an MR (recommended for a team repo, offered when the checkout
 * has uncommitted changes); each option says in one line what it means, the recommended one is marked. Afterwards:
 * in place, 推送 when there is a remote (asked first, never by itself); on a branch, 推送并开 MR (a remote) or 「合并到
 * <default>」 (none).
 */
export function KitFix({ repo, label = KIT_FIX_LABEL, onDone, onHold }: { repo: string; label?: string; onDone?: () => void; onHold?: (on: boolean) => void }) {
  const api = useAppApi()
  const [asking, setAsking] = useState(false)
  const [plan, setPlan] = useState<InstallChoices | null>(null)
  const choices = useAction(() => api.post<InstallChoices>(paths.importChoices(), { path: repo, purpose: 'upgrade' }))
  const start = useAction((mode: InstallMode) => api.post<JobStart>(paths.importUpgrade(), { path: repo, mode }))
  const finish = () => {
    onHold?.(false)
    onDone?.()
  }
  // the page moves on (onDone) when nothing is left to do here: in place, 再提交一次 and 推送 (a team repo) first
  const job = useJob<UpgradeOut>(JOB_POLL_MS, (j) => {
    if (j.state !== 'done') return onHold?.(false)
    const x = j.result
    if (x?.mode === 'inplace' && (!x.commit.ok || x.remote_url)) return
    finish()
  })
  const again = useAction(() => api.post<CommitResult>(paths.importCommit(), { path: repo, purpose: 'upgrade' }))
  const pub = useAction((b: Record<string, unknown>) => api.post<PublishResult>(paths.importPublish(), b))
  const j = job.job
  const r = j?.result ?? null
  const commit = again.result ?? r?.commit
  const go = async (mode: InstallMode) => {
    const got = await start.run(mode)
    if (!got) return
    onHold?.(true)
    job.start(got.job as ImportJob<UpgradeOut>)
  }
  const commitAgain = async () => {
    const x = await again.run()
    if (x?.ok && !(r?.mode === 'inplace' && r.remote_url)) finish()
  }
  const ask = async () => {
    const c = await choices.run()
    if (!c) return
    if (c.options.length === 1 && c.options[0].ok) return void go(c.options[0].mode)   // nothing to choose
    setPlan(c)
  }
  const busy = choices.busy || start.busy
  if (!j) {
    return (
      <span className="br-stack" style={{ gap: 6 }} data-testid="kit-fix-start">
        {!plan ? (
          <span className="br-row" style={{ gap: 6 }}>
            <button type="button" className="br-btn is-small is-primary" disabled={busy} onClick={() => void ask()}
              title="重装这个仓库的 brain-kit 文件，用你的 git 身份提交：默认直接在当前分支上，团队仓库可以选新分支开 MR">
              <Icon name="Wrench" size={13} />{busy ? '正在开始…' : label}
            </button>
          </span>
        ) : (
          <ModePick choices={plan} busy={busy} onPick={(m) => void go(m)} onCancel={() => setPlan(null)} />
        )}
        {(choices.error || start.error) && <span className="br-error br-small" role="alert">{choices.error || start.error}</span>}
      </span>
    )
  }
  const inplace = r?.mode === 'inplace'
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
                <button type="button" className="br-btn is-small" disabled={again.busy} onClick={() => void commitAgain()}>{again.busy ? '正在提交…' : '再提交一次'}</button>
              </div>
            </div>
          )}
          {commit?.ok && inplace && r.remote_url && <PushBox path={repo} branch={r.branch} remoteUrl={r.remote_url} target={r.target} onDone={finish} onLater={finish} />}
          {commit?.ok && !inplace && !r.remote_url && r.target && (
            <PendingActions path={repo} purpose="upgrade" onDone={onDone}
              p={{ merge: { ok: true, why: '', confirm: false }, pull: null, mr_url: null, target: r.target, remote_url: '' }} />
          )}
          {commit?.ok && !inplace && r.remote_url && !pub.result?.ok && (
            asking ? (
              <div className="br-confirm" role="group" aria-label="确认推送">
                <p>会把分支 <code>{r.branch}</code> 推到远端（<code>{r.remote_url}</code>）{r.gitlab_project ? <>，在 <code>{r.gitlab_project}</code> 上开 MR：<code>{r.branch}</code> → <code>{r.target}</code></> : ''}。</p>
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

/** The two places an install (or a kit update) can go, one plain line each, the recommended one marked; one that cannot
 * be done now says why and is off. */
export function ModePick({ choices, busy, onPick, onCancel }: {
  choices: InstallChoices
  busy?: boolean
  onPick: (mode: InstallMode) => void
  onCancel?: () => void
}) {
  return (
    <div className="br-modes" role="group" aria-label="装在哪" data-testid="mode-pick">
      {choices.options.map((o) => (
        <div key={o.mode} className={`br-mode${o.mode === choices.recommend ? ' is-rec' : ''}${o.ok ? '' : ' is-off'}`} data-mode={o.mode}>
          <button type="button" className={`br-btn is-small${o.mode === choices.recommend ? ' is-primary' : ''}`} disabled={busy || !o.ok} onClick={() => onPick(o.mode)}>
            {o.title}
          </button>
          {o.mode === choices.recommend && <span className="br-chip tone-ok">推荐</span>}
          <span className="br-hint">{o.ok ? o.line : o.why}</span>
        </div>
      ))}
      {onCancel && <button type="button" className="br-link br-small" onClick={onCancel}>取消</button>}
    </div>
  )
}

/**
 * 推送 of a branch the app committed on in the person's checkout (in place, or a local merge): asked first, never by
 * itself, no force. With a remote it is what makes it count: `brain start` branches a requirement from origin's default
 * branch. Pushing the default branch (*target*) changes the team's branch without a review: the confirm says so, and
 * that a protected one refuses it. *onLater*: 「先不推送」, for a page that waits for the person's answer.
 */
export function PushBox({ path, branch, remoteUrl, target, onDone, onLater }: {
  path: string; branch: string; remoteUrl: string; target?: string; onDone?: () => void; onLater?: () => void
}) {
  const api = useAppApi()
  const [asking, setAsking] = useState(false)
  const push = useAction(() => api.post<PushResult>(paths.importPush(), { path, branch, remote_url: remoteUrl, confirm: true }))
  const r = push.result
  const team = !!target && branch === target
  const send = async () => {
    const x = await push.run()
    setAsking(false)
    if (x?.ok) onDone?.()
  }
  return (
    <div className="br-stack" style={{ gap: 6 }} data-testid="push-box">
      {!asking && !r?.ok && (
        <span className="br-row">
          <button type="button" className="br-btn is-small is-primary" onClick={() => setAsking(true)}><Icon name="Upload" size={13} />{r ? '再推一次' : `推送 ${branch}`}</button>
          {onLater && <button type="button" className="br-btn is-small" onClick={onLater}>先不推送</button>}
          <span className="br-hint">推送以后才算数：开工从远端的 {target || branch} 建分支，那里现在还没有它。</span>
        </span>
      )}
      {asking && (
        <div className="br-confirm" role="group" aria-label="确认推送" data-testid="push-confirm">
          <p>会把分支 <code>{branch}</code> 推到远端（<code>{remoteUrl}</code>），不强推。</p>
          {team && <p className="br-warn-text" data-testid="push-team">这会直接改团队的 {branch}，没有 MR 评审；{branch} 受保护时推不上去，就改用「装到新分支，开 MR 给团队看」。</p>}
          <div className="br-row">
            <button type="button" className="br-btn is-small is-primary" disabled={push.busy} onClick={() => void send()}>{push.busy ? '正在推送…' : '确定推送'}</button>
            <button type="button" className="br-btn is-small" disabled={push.busy} onClick={() => setAsking(false)}>取消</button>
          </div>
        </div>
      )}
      {r && <p className={`br-pre br-small ${r.ok ? 'br-ok-text' : 'br-bad-text'}`} role="status">{r.text}</p>}
      {push.error && <p className="br-error" role="alert">{push.error}</p>}
    </div>
  )
}

type PendingActionsOf = Pick<PendingInstall, 'merge' | 'pull' | 'mr_url' | 'target' | 'remote_url'>

/**
 * A branch install's way forward (on the repo's row and in 导入仓库): when an MR is open, its link first (merging there is
 * the team's way); 「合并到 <default>」 (a fast-forward here; for a repo with a remote only after a confirm that the remote
 * does not have it until pushed, and then 推送); 「拉取」 after the MR was merged. What cannot be done now says why in one
 * line.
 */
export function PendingActions({ path, p, purpose, onDone }: { path: string; p: PendingActionsOf; purpose?: ImportPurpose; onDone?: () => void }) {
  const api = useAppApi()
  const [asking, setAsking] = useState(false)
  const merge = useAction((confirm: boolean) => api.post<MergeResult>(paths.importMerge(), { path, confirm, ...(purpose ? { purpose } : {}) }))
  const pull = useAction(() => api.post<PullResult>(paths.importPull(), { path }))
  const m = merge.result
  const target = p.target || '默认分支'
  const doMerge = async (confirm: boolean) => {
    const x = await merge.run(confirm)
    setAsking(false)
    if (x?.ok && !x.remote_url) onDone?.()   // with a remote: after 推送 or 先不推送
  }
  const doPull = async () => {
    const x = await pull.run()
    if (x?.ok) onDone?.()
  }
  return (
    <div className="br-stack" style={{ gap: 6 }} data-testid="pending-actions">
      {p.mr_url && (
        <p className="br-small">MR 开着：<ExtLink href={p.mr_url}>在 GitLab 上看 MR</ExtLink>（在那里合并是团队的做法，合并以后点「拉取」）</p>
      )}
      {p.merge && !m?.ok && (
        !p.merge.ok ? <p className="br-small br-warn-text" data-testid="merge-why">{p.merge.why}</p>
          : asking ? (
            <div className="br-confirm" role="group" aria-label="确认合并" data-testid="merge-confirm">
              <p>在本机把它快进合并到 <code>{target}</code>。远端（<code>{p.remote_url}</code>）还没有它，要你自己推送。</p>
              <div className="br-row">
                <button type="button" className="br-btn is-small is-primary" disabled={merge.busy} onClick={() => void doMerge(true)}>{merge.busy ? '正在合并…' : '确定合并'}</button>
                <button type="button" className="br-btn is-small" disabled={merge.busy} onClick={() => setAsking(false)}>取消</button>
              </div>
            </div>
          ) : (
            <span className="br-row">
              <button type="button" className={`br-btn is-small${p.merge.confirm ? '' : ' is-primary'}`} disabled={merge.busy}
                onClick={() => (p.merge?.confirm ? setAsking(true) : void doMerge(false))}>
                <Icon name="GitMerge" size={13} />{merge.busy ? '正在合并…' : p.merge.confirm ? `在本机合并到 ${target}` : `合并到 ${target}`}
              </button>
              <span className="br-hint">快进合并，不多一个提交；装用的工作目录和分支随后删掉。</span>
            </span>
          )
      )}
      {m && <p className={`br-pre br-small ${m.ok ? 'br-ok-text' : 'br-bad-text'}`} role="status">{m.text}</p>}
      {m?.ok && m.remote_url && <PushBox path={path} branch={m.branch} remoteUrl={m.remote_url} target={p.target} onDone={onDone} onLater={onDone} />}
      {p.pull && !pull.result?.ok && (
        !p.pull.ok ? <p className="br-small br-warn-text" data-testid="pull-why">{p.pull.why}</p> : (
          <span className="br-row">
            <button type="button" className="br-btn is-small is-primary" disabled={pull.busy} onClick={() => void doPull()}>
              <Icon name="Download" size={13} />{pull.busy ? '正在拉取…' : '拉取'}
            </button>
            <span className="br-hint">只快进：不合并、不变基，你的改动不动。</span>
          </span>
        )
      )}
      {pull.result && <p className={`br-pre br-small ${pull.result.ok ? 'br-ok-text' : 'br-bad-text'}`} role="status">{pull.result.text}</p>}
      {(merge.error || pull.error) && <p className="br-error" role="alert">{merge.error || pull.error}</p>}
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

export const IMPORT_WHY = '先导入一个项目仓库：本机的目录，或者从 GitLab 克隆。app 会先检查它；没装 brain-kit 的，直接装在当前分支并提交，当天就能开需求（团队仓库推送以后就能开；也可以装到新分支、开 MR，合并以后才能开）。'

/** The way a repo gets in, as the steps of 导入仓库 (the empty states show it). */
export const IMPORT_FLOW: FlowStep[] = [
  { icon: 'import', title: '从哪来', text: '本机目录，或从 GitLab 克隆' },
  { icon: 'lint', title: '检查', text: '只读：git、brain-kit、Lean、KiroCrew' },
  { icon: 'handover', title: '安装', text: '没装 brain-kit 的：装上并提交' },
  { icon: 'list', title: '加入列表', text: '装好自动加入：交付总览、开需求就能用' },
]

/** No repo yet: the way in, big (交付总览, 开需求), as the board's empty state introduces the team. */
export function ImportCta({ onImport, title = '还没有仓库', punch = '导入以后，每个需求都在这里：在哪一步、等谁、花了多少。' }: {
  onImport: () => void; title?: string; punch?: string
}) {
  return (
    <EmptyHero
      testid="import-cta"
      label="导入仓库"
      title={title}
      text={[IMPORT_WHY]}
      punch={punch}
      flow={IMPORT_FLOW}
    >
      <button type="button" className="br-btn is-primary is-big" onClick={onImport}>
        <RoleIcon role="import" size={17} />导入仓库
      </button>
    </EmptyHero>
  )
}

/** A listed repo whose brain-kit is on its way: where it is, what to do, and the way forward right here (the MR,
 * 「合并到 <default>」, 「拉取」), else the way to 导入仓库. */
export function PendingRepo({ repo, onOpen, onDone, banner = false }: { repo: RepoInfo; onOpen: () => void; onDone?: () => void; banner?: boolean }) {
  const p0 = repo.pending
  if (!p0) return null
  // a local merge in a team repo goes on with 推送: that is 导入仓库's, where it stays on the page (a row is redrawn
  // every half minute)
  const p = p0.remote_url ? { ...p0, merge: null } : p0
  const acts = !!(p.merge || p.pull || p.mr_url)
  // what only the wizard does: 再提交一次, 推送并开 MR, a local merge in a team repo, 改成直接装 (the branch cannot go in)
  const wizard = !acts || p.state === 'uncommitted' || (p.state === 'branch' && !!p.remote_url) || (!!p.merge && !p.merge.ok)
  return (
    <div className={banner ? 'br-banner is-info' : 'br-stack'} style={banner ? undefined : { gap: 4 }} role="status" data-testid="repo-pending" data-repo={repo.id}>
      <div className="br-row">
        <span>{banner && <b className="br-strong">{repo.name}：</b>}{p.text}。{p.next}</span>
        {wizard && <button type="button" className="br-btn is-small" onClick={onOpen}>去导入仓库</button>}
      </div>
      {acts && <PendingActions key={`${p.state}:${p.branch}`} path={repo.path} p={p} onDone={onDone} />}
    </div>
  )
}

/** brain-kit's USER_RE (common.py): what git config brain.user may be, lowercased. The backend checks it again. */
export const USER_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
export const NAME_RULE = '只能用小写字母、数字和 . _ -（字母或数字开头）'

/**
 * 你是谁 in a repo: the name brain-kit goes by there (me.text); or, when brain-kit would not know, a small input
 * (「你的 GitLab 用户名」 with GitLab, 「你的名字」 without), prefilled with the login name, with one line why. 保存: git
 * config brain.user <name> in that repo (POST /me/name). No token is asked for. Not a <form>: it sits in 开需求's.
 */
export function MeLine({ path, me, onSaved }: { path: string; me: RepoMe; onSaved?: (r: MeNameResult) => void }) {
  const api = useAppApi()
  const [name, setName] = useState(me.suggest)
  const save = useAction((n: string) => api.post<MeNameResult>(paths.meName(), { path, name: n }))
  const v = name.trim().toLowerCase()
  const bad = !!v && !USER_RE.test(v)
  const got = save.result
  if (got || !me.ask) {
    const m = got?.me ?? me
    return (
      <p className={`br-me${m.error ? ' is-bad' : ''}`} data-testid="me-line">
        <RoleIcon role="person" size={15} /><span>{m.text || m.error}</span>
        {got && <span className="br-ok-text br-small" role="status">已保存</span>}
      </p>
    )
  }
  const id = `me-${path.replace(/[^A-Za-z0-9]+/g, '-')}`
  const send = async () => {
    const r = await save.run(v)
    if (r) onSaved?.(r)
  }
  const can = !save.busy && !!v && !bad
  return (
    <div className="br-me-ask" role="group" aria-label={me.label} data-testid="me-ask">
      <label htmlFor={id}>{me.label}</label>
      <span className="br-row">
        <input id={id} type="text" className="br-mono" value={name} spellCheck={false} autoComplete="off"
          aria-invalid={bad || undefined} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (can) void send() } }} />
        <button type="button" className="br-btn is-small is-primary" disabled={!can} onClick={() => void send()}>{save.busy ? '正在保存…' : '保存'}</button>
      </span>
      {me.error && <span className="br-warn-text br-small">{me.error}</span>}
      <span className="br-hint">{bad ? NAME_RULE : me.why}</span>
      {save.error && <span className="br-error" role="alert">{save.error}</span>}
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

/** Where brain-kit comes from, for a machine that has none (设置, the shell's banner). */
export const BRAINKIT_CLONE = 'git clone https://github.com/warren830/brain-kit.git ~/brain-kit'

/** A path as a shell word: as it is when it is plain, else in single quotes. */
const shellWord = (p: string) => (/^[\w@%+=:,./~-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`)

/**
 * Why the app has no brain-kit, from Status.brainkit.error (backend/core/bk.py says it in one of three ways), said as
 * what to do: not there (write its place in 设置, or clone it first), too old (pull it), there but not importable (a
 * checkout that is not whole: pull it, else clone it again). *cmd* is the line to type in a terminal, shown with 复制;
 * the version brain-kit wants and the Python error are only in *raw*, for 细节. 设置's 保存 reads brain-kit again, so
 * every way ends there. The banner over every view and 设置's card both say these words.
 */
export function brainkitProblem(error: string, path = ''): { kind: 'missing' | 'old' | 'broken'; text: string; todo: string; cmd: string; raw: string } {
  const pull = path ? `git -C ${shellWord(path)} pull --ff-only` : ''
  if (/太旧/.test(error)) {
    return { kind: 'old', text: 'brain-kit 太旧了（位置是对的）', todo: `在它的目录里拉取最新的代码${pull ? '（点「复制」拿命令）' : ''}，再到设置里点「保存」重新读它`, cmd: pull, raw: error }
  }
  if (/导入失败/.test(error)) {
    return {
      kind: 'broken', text: 'brain-kit 读不进来（位置是对的）',
      todo: `那个目录里的 brain-kit 不完整：拉取一遍${pull ? '（点「复制」拿命令）' : ''}，还不行就重新克隆一份；再到设置里点「保存」重新读它`, cmd: pull, raw: error,
    }
  }
  return {
    kind: 'missing', text: '找不到 brain-kit',
    todo: '在设置的「brain-kit 在哪」写上它的目录，点「保存」；这台机器上还没有的话，先在终端里克隆一份（点「复制」拿命令），再写它的位置', cmd: BRAINKIT_CLONE, raw: error,
  }
}

/** A command a person types in a terminal: the line itself and 复制 (the app never runs it). */
export function CommandLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }
  return (
    <span className="br-cmd" data-testid="cmd-line">
      <code className="br-mono">{cmd}</code>
      <button type="button" className="br-btn is-small" onClick={() => void copy()}><Icon name="Copy" size={13} />复制</button>
      {copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制</span>}
      {copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请手动选中这一行</span>}
    </span>
  )
}

/** A repo as a person knows it: by its name; by its name and folder when two listed repos share a name (never the
 * app's own id, r1). */
export function repoLabel(r: { name: string; path: string }, all: { name: string }[]): string {
  if (all.filter((x) => x.name === r.name).length < 2) return r.name
  const dir = r.path.replace(/\/+$/, '').split('/').slice(-2, -1)[0]
  return dir ? `${r.name}（${dir}/）` : r.name
}
