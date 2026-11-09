/**
 * One lane per actor, in the order of the way (the sample team board's Lanes.tsx): who it is, what state it is in and
 * since when, what it is doing or waits for (the line a person types, the question, why it was refused), a few facts and
 * its latest marks, and its time track.
 *
 * Every lane ends in a time track on one shared axis (the requirement's start → its end, or now): its work spans, the
 * spans it waited for a person (magenta), the ones it did again (orange), with commits, approvals, verify rounds and
 * questions marked where they happened. Read down the lanes and the way lines up like a Gantt chart.
 */
import { useNavigate } from '@kirocrew/app-sdk'
import type { Actor, ReqBoard } from '../types'
import { TypeLine } from '../ui'
import { actorMeta, fmtAgo, fmtCredits, fmtSpan, fmtWhen } from './format'
import { useServerNow } from './hooks'
import { RoleIcon } from './RoleIcon'

export interface LanesProps {
  board: ReqBoard
  focus: string | null
  bumps: Record<string, number>
  onActor: (key: string) => void
  /** in a replay: nothing to type, nothing to open */
  quiet?: boolean
}

export function Lanes({ board, focus, bumps, onActor, quiet = false }: LanesProps) {
  const off = board.actors.filter((a) => a.status === 'skipped')
  return (
    <section className="kt-lanes" aria-label="各环节的泳道" data-testid="kt-lanes">
      <LanesAxis board={board} />
      {board.actors.filter((a) => a.status !== 'skipped').map((a) => (
        <LaneRow key={a.key} a={a} board={board} focused={focus === a.key} dim={!!focus && focus !== a.key} bump={bumps[a.key] ?? 0} onActor={onActor} quiet={quiet} />
      ))}
      {off.length > 0 && (
        <p className="kt-dim kt-lanes-out" data-testid="kt-lanes-out">
          这次不需要：{offLine(off)}
        </p>
      )}
    </section>
  )
}

/** The actors this requirement skips, the ones skipped for one reason together: 「交接、桥、签名（只在本机做）」. */
export function offLine(off: Actor[]): string {
  const by = new Map<string, string[]>()
  for (const a of off) by.set(a.doing, [...(by.get(a.doing) ?? []), a.title])
  return [...by].map(([why, names]) => `${names.join('、')}${why ? `（${why}）` : ''}`).join('；')
}

/** The axis length in seconds and its ticks (from the start), at most 6 round steps. */
export function axisTicks(dur: number): number[] {
  const steps = [60, 300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400, 2 * 86400, 7 * 86400]
  const step = steps.find((x) => dur / x <= 6) ?? Math.ceil(dur / 6 / 86400) * 86400
  const out: number[] = []
  for (let t = 0; t <= dur + 1e-6; t += step) out.push(t)
  return out
}

/** 0, 15 分, 3 小时, 1 天, 1 天 6 时 */
export function tickLabel(s: number): string {
  if (s <= 0) return '0'
  if (s < 3600) return `${Math.round(s / 60)} 分`
  if (s < 86400) return `${Math.round(s / 3600)} 小时`
  const d = Math.floor(s / 86400)
  const h = Math.round((s % 86400) / 3600)
  return h ? `${d} 天 ${h} 时` : `${d} 天`
}

function useAxis(board: ReqBoard): { t0: number; t1: number; pct: (t: number) => number } {
  const now = useServerNow()
  const t0 = board.started_at ?? board.at
  const t1 = Math.max(t0 + 60, board.ended_at ?? now)
  return { t0, t1, pct: (t: number) => Math.min(100, Math.max(0, ((t - t0) / (t1 - t0)) * 100)) }
}

function LanesAxis({ board }: { board: ReqBoard }) {
  const { t0, t1 } = useAxis(board)
  const dur = t1 - t0
  return (
    <div className="kt-lane kt-lane-axis" aria-hidden="true">
      <div className="kt-axis-title">时间线（从 {fmtWhen(t0)} 开工起）</div>
      <div className="kt-axis">
        {axisTicks(dur).map((t) => (
          <span key={t} className="kt-axis-tick" style={{ left: `${(t / dur) * 100}%` }}>{tickLabel(t)}</span>
        ))}
      </div>
    </div>
  )
}

const MARK_TITLE: Record<string, string> = {
  commit: '提交', approved: '批准', rejected: '退回', request: '请求批准', refused: '口令没被接受', blocked: 'Lean 拦下',
  handover: '交接', accepted: '桥接手', signed: '签名', question: '问人', answer: '回答', 'verify-ok': 'verify 通过',
  'verify-fail': 'verify 没过', reflect: '回写', session: '会话',
}

function LaneTrack({ a, board }: { a: Actor; board: ReqBoard }) {
  const now = useServerNow()
  const { pct, t0 } = useAxis(board)
  return (
    <div className="kt-track" role="img" aria-label={`${a.title}的时间线：${a.spans.length ? a.spans.map((s) => `${s.kind === 'wait' ? '等人' : s.kind === 'fix' ? '返工' : '在做'} ${fmtSpan((s.b ?? now) - s.a)}`).join('，') : '还没开始'}`}>
      <div className="kt-track-line" />
      {a.spans.map((s, i) => (
        <span key={i} className={`kt-track-span is-${s.kind}${s.b === null ? ' is-live' : ''}`}
          style={{ left: `${pct(s.a)}%`, width: `${Math.max(0.6, pct(s.b ?? now) - pct(s.a))}%` }}
          title={`${s.kind === 'wait' ? '等人' : s.kind === 'fix' ? '返工' : '在做'}：${fmtWhen(s.a)} 起，${s.b === null ? '到现在' : `用了 ${fmtSpan(s.b - s.a)}`}（开工后 ${fmtSpan(s.a - t0)}）`} />
      ))}
      {a.marks.map((m, i) => (
        <span key={`m${i}`} className={`kt-track-mark is-${m.kind}`} style={{ left: `${pct(m.at)}%` }} title={`${fmtWhen(m.at)} · ${m.title}`} />
      ))}
    </div>
  )
}

function LaneRow({ a, board, focused, dim, bump, onActor, quiet }: { a: Actor; board: ReqBoard; focused: boolean; dim: boolean; bump: number; onActor: (k: string) => void; quiet: boolean }) {
  const meta = actorMeta(a.status)
  const waiting = a.status === 'waiting'
  return (
    <article className={`kt-lane is-${a.status} tone-${meta.tone}${focused ? ' is-focus' : ''}${dim ? ' is-dim' : ''}${waiting ? ' is-compact' : ''}`}
      data-testid="kt-lane" data-role={a.key} data-status={a.status} aria-label={`${a.title}：${meta.label}`}>
      {bump > 0 && <span key={bump} className="kt-lane-bump" aria-hidden="true" />}
      <LaneId a={a} focused={focused} onActor={onActor} quiet={quiet} />
      <div className="kt-lane-live">
        <Situation a={a} quiet={quiet} />
      </div>
      <div className="kt-lane-work">{!waiting && <Work a={a} />}</div>
      <LaneTrack a={a} board={board} />
    </article>
  )
}

function LaneId({ a, focused, onActor, quiet }: { a: Actor; focused: boolean; onActor: (k: string) => void; quiet: boolean }) {
  const meta = actorMeta(a.status)
  const navigate = useNavigate()
  return (
    <div className="kt-lane-id">
      <button type="button" className="kt-avatar" onClick={() => onActor(a.key)} aria-pressed={focused} aria-label={focused ? `不再只看${a.title}` : `只看${a.title}`} title={focused ? '再点一次看全部' : '只看这一环'}>
        <RoleIcon role={a.icon} size={22} />
      </button>
      <div className="kt-lane-who">
        <div className="kt-lane-name"><span>{a.title}</span></div>
        <div className="kt-lane-doing">{a.sub}</div>
        <div className="kt-lane-tag">
          <span className={`kt-pill tone-${meta.tone}${a.status === 'running' || a.status === 'awaiting_approval' ? ' is-live' : ''}`} title={meta.hint}>
            <i aria-hidden="true">{meta.icon}</i>
            {meta.label}
          </span>
        </div>
      </div>
      {a.status !== 'waiting' && (
        <p className="kt-lane-stats">
          {a.since !== null && <span title={fmtWhen(a.since)}>⏱ <b><Ago at={a.since} /></b></span>}
          {a.credits !== null && <span><b>{fmtCredits(a.credits)}</b> credits</span>}
        </p>
      )}
      {!quiet && a.session && (
        <button type="button" className="kt-out-btn" onClick={() => navigate(a.session!.url)} title="在 Kiro Crew 里打开它的会话">打开会话 ›</button>
      )}
    </div>
  )
}

function Ago({ at }: { at: number }) {
  const now = useServerNow()
  return <>{fmtAgo(now - at)}</>
}

/** What the actor does or waits for: one loud line, and what the person can do about it right here. */
function Situation({ a, quiet }: { a: Actor; quiet: boolean }) {
  const meta = actorMeta(a.status)
  const strong: Record<string, string> = {
    awaiting_approval: '✋ 等你：', failed: '✕ 没过：', stalled: '⚠ 卡住：', fixing: '↻ 返工：', queued: '⏸ 排队：', merged: '✔ 完成', done: '✓ 做完这步',
    running: '● 在做：', waiting: '还没轮到：',
  }
  const lead = strong[a.status] ?? meta.label
  const bare = lead.replace(/[：:]$/, '')
  const same = !a.doing || a.doing === meta.label || a.doing === bare
  return (
    <>
      <div className={`kt-situation tone-${meta.tone}`}>
        <strong>{same ? bare : lead}</strong>
        {!same && <span className="kt-summary">{a.doing}</span>}
      </div>
      {!quiet && a.line && <TypeLine line={a.line} sessionUrl={a.session?.url ?? null} />}
    </>
  )
}

function Work({ a }: { a: Actor }) {
  const marks = a.marks.slice().reverse().slice(0, 4)
  if (!a.facts.length && !marks.length) return <p className="kt-dim kt-nothing">还没有记录</p>
  return (
    <>
      {a.facts.length > 0 && (
        <ul className="kt-tools br-facts-chips" aria-label="事实">
          {a.facts.map((f) => <li key={f}><span className="kt-mono br-fact">{f}</span></li>)}
        </ul>
      )}
      {marks.length > 0 && (
        <ul className="kt-commits" aria-label="最近的记录">
          {marks.map((m, i) => (
            <li key={i}>
              <code className={`br-mark is-${m.kind}`}>{MARK_TITLE[m.kind] ?? m.kind}</code>
              <span title={m.title}>{fmtWhen(m.at)} · {m.title}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
