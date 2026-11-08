/**
 * Small pieces every view shares: icons (lucide's default export only), state chips, the Lean progress cell, outside
 * links, the line a person types themselves, KiroCrew's check rows with their fix buttons, and the answer form.
 *
 * All repo, agent and document text is rendered as plain text. The Lean approval line is shown, copied and its session
 * opened; it is never sent anywhere (no request carries it, no chat is prefilled with it).
 */
import { useState, type ReactNode } from 'react'
import icons from 'lucide-react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction } from './api'
import { fmtRate } from './format'
import type { Tone } from './styles'
import type {
  AnswerBody, AnswerResult, ApprovalState, CheckRow, CrewFixBody, CrewFixResult, LeanSummary, Level, MrRef, Question, ReqState, StageState,
} from './types'
import { STATE_LABEL } from './types'

export function Icon({ name, size = 15, className, title }: { name: string; size?: number; className?: string; title?: string }) {
  const C = icons[name]
  if (!C) return null
  return <C size={size} className={className} aria-hidden={title ? undefined : true} aria-label={title} />
}

export const STATE_TONE: Record<ReqState, Tone> = {
  claimed: 'idle', local: 'run', handed_over: 'hand', rejected: 'bad', running: 'run', parked: 'wait', acceptance: 'wait', merged: 'ok', closed: 'idle',
}

export function StateChip({ state, label }: { state: ReqState; label?: string }) {
  return <span className={`br-chip tone-${STATE_TONE[state] ?? 'idle'}`} data-state={state}>{label || STATE_LABEL[state] || state}</span>
}

export const LEVEL_TONE: Record<Level, Tone> = { OK: 'ok', WARN: 'warn', FAIL: 'bad' }
export const LEVEL_LABEL: Record<Level, string> = { OK: '正常', WARN: '注意', FAIL: '有问题' }

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
  answered: { label: '已回答', tone: 'info' },
  delivered: { label: '已送回', tone: 'ok' },
  stale: { label: '过期', tone: 'warn' },
  invalid: { label: '无效', tone: 'bad' },
  closed: { label: '已关闭', tone: 'idle' },
  signing: { label: '签名中', tone: 'hand' },
  refused: { label: '被拒', tone: 'bad' },
}

export const questionMeta = (state: string) => QUESTION_STATE[state] ?? { label: state, tone: 'idle' as Tone }
export const isOpenQuestion = (q: Pick<Question, 'state'>) => q.state === 'waiting' || q.state === 'open'

/** 3/11 需求分析, with a small bar of the stages done or skipped. */
export function LeanCell({ lean }: { lean: LeanSummary }) {
  const pct = lean.total > 0 ? Math.round((lean.done / lean.total) * 100) : 0
  return (
    <span className="br-row" style={{ gap: 6 }} data-testid="lean-cell">
      <span className="br-mono">{lean.stage_n !== null ? `${lean.stage_n}/${lean.total}` : `0/${lean.total}`}</span>
      <span>{lean.stage_label ?? '还没开始'}</span>
      <span className="br-prog" role="img" aria-label={`做完 ${lean.done}/${lean.total}`} title={`做完或跳过 ${lean.done}/${lean.total}`}>
        <i style={{ width: `${pct}%` }} />
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
  return <ExtLink href={mr.url}>!{mr.iid}{mr.state ? ` · ${mr.state}` : ''}</ExtLink>
}

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

const FIX_LABEL: Record<CrewFixBody['what'], string> = { agent: '装上或补全 brain-dev 的 Lean hook', engine: '把引擎换成 kas' }

/**
 * KiroCrew's check rows (level + text) and, when the backend can fix them, the fix buttons (POST /crew/fix).
 * *only*: which levels to list (default all). onFixed gets the rows the fix answered.
 */
export function CheckRows({ rows, fix, only, onFixed }: {
  rows: CheckRow[]
  fix?: { agent: boolean; engine: boolean }
  only?: Level[]
  onFixed?: (rows: CheckRow[]) => void
}) {
  const api = useAppApi()
  const act = useAction((body: CrewFixBody) => api.post<CrewFixResult>(paths.crewFix(), body))
  const shown = only ? rows.filter((r) => only.includes(r.level)) : rows
  const fixes = (['agent', 'engine'] as const).filter((w) => fix?.[w])
  const doFix = async (what: CrewFixBody['what']) => {
    const r = await act.run({ what })
    if (r) onFixed?.(r.rows)
  }
  return (
    <div className="br-stack" style={{ gap: 6 }} data-testid="check-rows">
      <ul className="br-plain">
        {shown.map((r, i) => (
          <li key={i} className="br-row" style={{ alignItems: 'baseline' }}>
            <span className={`br-chip tone-${LEVEL_TONE[r.level] ?? 'idle'}`}>{LEVEL_LABEL[r.level] ?? r.level}</span>
            <span className="br-pre">{r.text}</span>
          </li>
        ))}
      </ul>
      {fixes.length > 0 && (
        <div className="br-row">
          {fixes.map((w) => (
            <button key={w} type="button" className="br-btn is-small" disabled={act.busy} onClick={() => void doFix(w)}>
              <Icon name="Wrench" size={13} />{FIX_LABEL[w]}
            </button>
          ))}
        </div>
      )}
      {act.result && <p className={`br-pre br-small ${act.result.ok ? 'br-ok-text' : 'br-bad-text'}`} role="status">{act.result.text}</p>}
      {act.error && <p className="br-error" role="alert">{act.error}</p>}
    </div>
  )
}

export const VIA_TEXT: Record<'session' | 'mr', string> = {
  session: '回答会送进你的本地会话',
  mr: '回答会以你的 GitLab 身份发在 MR 上',
}

/**
 * The answer form of a question, only when it may be answered here (`answerable_here`) and is not a Lean approval
 * request (those the person types themselves in the session; the app never offers approve / reject for them).
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
                {question.recommend === o.id && <span className="br-chip tone-info" style={{ marginLeft: 6 }}>推荐</span>}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="br-field">
          <label htmlFor={`${name}-choice`}>你的回答</label>
          <input id={`${name}-choice`} type="text" value={choice} onChange={(e) => setChoice(e.target.value)} />
        </div>
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

/** Small loading / error lines of a polled view. */
export function LoadState({ loading, error, has }: { loading: boolean; error: string; has: boolean }) {
  if (error) return <div className={`br-banner${has ? '' : ' is-error'}`} role="alert">{has ? `刷新没成：${error}，显示的是上一次拿到的数据` : error}</div>
  if (loading && !has) return <p className="br-loading">正在读取…</p>
  return null
}
