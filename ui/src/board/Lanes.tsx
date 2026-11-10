/**
 * One lane per actor, in the order of the way (the sample team board's Lanes.tsx): who it is, what state it is in and
 * since when, what it is doing or waits for (the line a person types, the question, why it was refused), what it
 * changed (the sample's 改动 block: its commits and the files they touched), a few facts and its latest marks, and its
 * time track.
 *
 * Every lane ends in a time track on one shared axis, the requirement's start → its last activity (or its merge): its
 * work spans, the spans it waited for a person (magenta when it is you, blue for someone else), the ones it did again
 * (orange), with commits, approvals, verify rounds and questions marked where they happened. A long quiet time after the
 * last activity (a night, hours of waiting) is drawn short at the end, with how long it was, so the activity keeps the
 * width. Read down the lanes and the way lines up like a Gantt chart.
 */
import { useNavigate } from '@kirocrew/app-sdk'
import type { Actor, ActorSpan, BeltItem, ReqBoard } from '../types'
import { TypeLine } from '../ui'
import { ACT, leanProgress } from '../vocab'
import { WORKING, actorLabel, actorMeta, boardWho, fmtAgo, fmtCredits, fmtSpan, fmtWhen, leanOf, spanWho, waitsOnMe } from './format'
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
  const ax = axisOf(board, useServerNow())
  return (
    <section className="kt-lanes" aria-label="各环节的泳道" data-testid="kt-lanes">
      <LanesAxis board={board} ax={ax} />
      {board.actors.filter((a) => a.status !== 'skipped').map((a) => (
        <LaneRow key={a.key} a={a} board={board} ax={ax} focused={focus === a.key} dim={!!focus && focus !== a.key} bump={bumps[a.key] ?? 0} onActor={onActor} quiet={quiet} />
      ))}
      {off.length > 0 && (
        <p className="kt-dim kt-lanes-out" data-testid="kt-lanes-out">
          这次不需要：{offLine(off)}
        </p>
      )}
    </section>
  )
}

/** The actors this requirement skips, the ones skipped for one reason together: 「交接、桥、签名（这个仓库只在本机做）」.
 * The strip already says 这次不需要, so only the reason after an actor's own 「这次不需要：」 is repeated. */
export function offLine(off: Actor[]): string {
  const by = new Map<string, string[]>()
  for (const a of off) {
    const why = a.doing.replace(/^这次不需要[：:]?\s*/, '')
    by.set(why, [...(by.get(why) ?? []), a.title])
  }
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

/** 0, 15 分, 3 小时, 1 小时 30 分, 1 天, 1 天 6 时 */
export function tickLabel(s: number): string {
  if (s <= 0) return '0'
  if (s < 3600) return `${Math.round(s / 60)} 分`
  if (s < 86400) {
    const m = Math.round(s / 60)
    return m % 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m / 60} 小时`
  }
  const d = Math.floor(s / 86400)
  const h = Math.round((s % 86400) / 3600)
  return h ? `${d} 天 ${h} 时` : `${d} 天`
}

/** The share of the track a long quiet tail is drawn in. */
export const TAIL_PCT = 16

export interface Axis {
  t0: number
  /** what happened at t0, in the words 需求详情 uses for it: 开工 (the run's start), else 认領 (the claim); '' when
   * neither is recorded */
  from: '开工' | '认领' | ''
  /** the last activity (the end of the even part) */
  last: number
  /** the axis' end: the merge, else now */
  end: number
  /** the quiet time after the last activity, drawn short; null: none worth folding */
  tail: number | null
  pct: (t: number) => number
}

/** The last thing that happened on the board: an event, a commit, a mark, a span's start or end. */
export function lastActivity(b: ReqBoard): number | null {
  const ts: number[] = [...b.events.map((e) => e.at), ...b.belt.map((x) => x.at)]
  for (const a of b.actors) {
    for (const m of a.marks) ts.push(m.at)
    for (const s of a.spans) ts.push(s.b ?? s.a)
  }
  return ts.length ? Math.max(...ts) : null
}

/** The axis starts where 需求详情's cycle does, at 开工 (the run's start event); before it nothing works or waits on a
 * lane (the claim is the event before it). A board with no 开工 recorded starts at its first event, said as what that
 * was. */
export function axisStart(b: Pick<ReqBoard, 'events' | 'started_at' | 'at'>): { t0: number; from: Axis['from'] } {
  const start = b.events.find((e) => e.kind === 'start')
  if (start) return { t0: start.at, from: '开工' }
  const t0 = b.started_at ?? b.events[0]?.at ?? b.at
  return { t0, from: b.events.some((e) => e.kind === 'claim' && e.at === t0) ? '认领' : '' }
}

export function axisOf(b: ReqBoard, now: number): Axis {
  const { t0, from } = axisStart(b)
  const end = Math.max(t0 + 60, b.ended_at ?? now)
  const last = Math.min(end, Math.max(t0 + 60, lastActivity(b) ?? end))
  const quiet = end - last
  const tail = b.ended_at === null && quiet > Math.max(900, 0.3 * (last - t0)) ? quiet : null
  const even = tail === null ? 100 : 100 - TAIL_PCT
  const top = tail === null ? end : last
  const pct = (t: number) => {
    if (t <= top) return Math.max(0, ((t - t0) / (top - t0)) * even)
    return Math.min(100, even + ((t - last) / (end - last)) * TAIL_PCT)
  }
  return { t0, from, last, end, tail, pct }
}

function LanesAxis({ board, ax }: { board: ReqBoard; ax: Axis }) {
  const dur = (ax.tail === null ? ax.end : ax.last) - ax.t0
  const ticks = axisTicks(dur)
  const waiting = board.actors.some((a) => a.status === 'awaiting_approval')
  return (
    <div className="kt-lane kt-lane-axis" aria-hidden="true">
      <div className="kt-axis-title" data-testid="kt-axis-title">时间线（从 {fmtWhen(ax.t0)} {ax.from}起）</div>
      <div className="kt-axis">
        {ticks.map((t, i) => {
          const left = ax.pct(ax.t0 + t)
          const edge = i === 0 ? ' is-first' : left > (ax.tail === null ? 92 : 100 - TAIL_PCT - 6) ? ' is-last' : ''
          return <span key={t} className={`kt-axis-tick${edge}`} style={{ left: `${left}%` }}>{tickLabel(t)}</span>
        })}
        {ax.tail !== null && (
          <span className="kt-axis-tail" style={{ left: `${100 - TAIL_PCT}%`, width: `${TAIL_PCT}%` }} data-testid="kt-axis-tail"
            title={`最后一次动静以后又过了 ${fmtSpan(ax.tail)}${waiting ? '，一直在等' : board.live ? '' : '，没有动静'}：这一段画短了`}>
            之后 {fmtSpan(ax.tail)}
          </span>
        )}
      </div>
    </div>
  )
}

const MARK_TITLE: Record<string, string> = {
  commit: '提交', approved: '批准', rejected: '退回', request: '请求批准', refused: '批准的那一行没被接受', blocked: 'Lean 拦下',
  handover: '交接', accepted: '桥接手', signed: '签名', question: '问人', answer: '回答', 'verify-ok': '自动检查通过',
  'verify-fail': '自动检查没过', reflect: '回写', session: '会话',
}

function LaneTrack({ a, board, ax }: { a: Actor; board: ReqBoard; ax: Axis }) {
  const now = useServerNow()
  const word = (s: ActorSpan) => (s.kind === 'wait' ? boardWho(board, spanWho(a, board, s)) : s.kind === 'fix' ? '返工' : '在做')
  // an open span glows only while it really goes on: work while the actor works, a wait while it waits
  const going = (kind: string) => (kind === 'wait' ? a.status === 'awaiting_approval' : WORKING.has(a.status))
  return (
    <div className="kt-track" role="img" aria-label={`${a.title}的时间线：${a.spans.length ? a.spans.map((s) => `${word(s)} ${fmtSpan((s.b ?? now) - s.a)}`).join('，') : '还没开始'}`}>
      <div className="kt-track-line" />
      {ax.tail !== null && <div className="kt-track-tail" style={{ left: `${100 - TAIL_PCT}%`, width: `${TAIL_PCT}%` }} />}
      {a.spans.map((s, i) => (
        <span key={i} className={`kt-track-span is-${s.kind}${s.b === null && going(s.kind) ? ' is-live' : ''}${s.kind === 'wait' && spanWho(a, board, s) !== 'you' ? ' is-other' : ''}`}
          style={{ left: `${ax.pct(s.a)}%`, width: `${Math.max(0.6, ax.pct(s.b ?? now) - ax.pct(s.a))}%` }}
          title={`${word(s)}：${fmtWhen(s.a)} 起，${s.b === null ? `到现在（${fmtSpan(now - s.a)}）` : `用了 ${fmtSpan(s.b - s.a)}`}${ax.from ? `（${ax.from}后 ${fmtSpan(s.a - ax.t0)}）` : ''}`} />
      ))}
      {a.marks.map((m, i) => (
        <span key={`m${i}`} className={`kt-track-mark is-${m.kind}`} style={{ left: `${ax.pct(m.at)}%` }} title={`${fmtWhen(m.at)} · ${m.title}`} />
      ))}
    </div>
  )
}

function LaneRow({ a, board, ax, focused, dim, bump, onActor, quiet }: {
  a: Actor; board: ReqBoard; ax: Axis; focused: boolean; dim: boolean; bump: number; onActor: (k: string) => void; quiet: boolean
}) {
  const meta = actorMeta(a.status)
  const waiting = a.status === 'waiting'
  const other = a.status === 'awaiting_approval' && !waitsOnMe(board)
  return (
    <article className={`kt-lane is-${a.status} tone-${other ? 'info' : meta.tone}${focused ? ' is-focus' : ''}${dim ? ' is-dim' : ''}${waiting ? ' is-compact' : ''}`}
      data-testid="kt-lane" data-role={a.key} data-status={a.status} aria-label={`${a.title}：${actorLabel(a.status, board)}`}>
      {bump > 0 && <span key={bump} className="kt-lane-bump" aria-hidden="true" />}
      <LaneId a={a} board={board} focused={focused} onActor={onActor} quiet={quiet} />
      <div className="kt-lane-live">
        <Situation a={a} board={board} quiet={quiet} />
      </div>
      <div className="kt-lane-work">{!waiting && <Work a={a} board={board} />}</div>
      <LaneTrack a={a} board={board} ax={ax} />
    </article>
  )
}

function LaneId({ a, board, focused, onActor, quiet }: { a: Actor; board: ReqBoard; focused: boolean; onActor: (k: string) => void; quiet: boolean }) {
  const meta = actorMeta(a.status)
  const navigate = useNavigate()
  const awaiting = a.status === 'awaiting_approval'
  const mine = waitsOnMe(board)
  const label = actorLabel(a.status, board)
  return (
    <div className="kt-lane-id">
      <button type="button" className="kt-avatar" onClick={() => onActor(a.key)} aria-pressed={focused} aria-label={focused ? `不再只看${a.title}` : `只看${a.title}`} title={focused ? '再点一次看全部' : '只看这一环'}>
        <RoleIcon role={a.icon} size={22} />
      </button>
      <div className="kt-lane-who">
        <div className="kt-lane-name"><span>{a.title}</span></div>
        <div className="kt-lane-doing">{a.sub}</div>
        <div className="kt-lane-tag">
          <span className={`kt-pill tone-${awaiting && !mine ? 'info' : meta.tone}${a.status === 'running' || (awaiting && mine) ? ' is-live' : ''}`} title={meta.hint}>
            <i aria-hidden="true">{meta.icon}</i>
            {label}
          </span>
        </div>
      </div>
      {a.status !== 'waiting' && (
        <p className="kt-lane-stats">
          {a.since !== null && (awaiting
            ? <span title={`从 ${fmtWhen(a.since)} 起`}>⏱ 等了 <b><Wait since={a.since} /></b></span>
            : <span title={fmtWhen(a.since)}>⏱ <b><Ago at={a.since} /></b></span>)}
          {a.credits !== null && <span><b>{fmtCredits(a.credits)}</b> credits</span>}
        </p>
      )}
      {!quiet && a.session && (
        <button type="button" className="kt-out-btn" onClick={() => navigate(a.session!.url)} title="在 Kiro Crew 里打开它的会话">{ACT.openSession} ›</button>
      )}
    </div>
  )
}

function Ago({ at }: { at: number }) {
  const now = useServerNow()
  return <>{fmtAgo(now - at)}</>
}

function Wait({ since }: { since: number }) {
  const now = useServerNow()
  return <>{fmtSpan(now - since)}</>
}

/** What the actor does or waits for: one loud line, and what the person can do about it right here. */
function Situation({ a, board, quiet }: { a: Actor; board: ReqBoard; quiet: boolean }) {
  const meta = actorMeta(a.status)
  const mine = waitsOnMe(board)
  const other = a.status === 'awaiting_approval' && !mine
  // a wait says whom it is on once: the line itself when it starts so (「等产品在 MR 上回答 D-2」), else the lead
  const says = a.status === 'awaiting_approval' && a.doing.startsWith('等')
  const strong: Record<string, string> = {
    awaiting_approval: says ? (mine ? '✋' : '') : `${mine ? '✋ ' : ''}${actorLabel(a.status, board)}：`, failed: '✕ 没过：', stalled: '⚠ 卡住：',
    fixing: '↻ 返工：', queued: '⏸ 排队：', merged: '✔ 完成', done: '✓ 做完这步', running: '●', waiting: '还没轮到：',
  }
  const lead = strong[a.status] ?? meta.label
  const bare = lead.replace(/[：:]$/, '')
  const same = !a.doing || a.doing === meta.label || a.doing === bare
  return (
    <>
      <div className={`kt-situation tone-${other ? 'info' : meta.tone}`}>
        <strong>{same ? (a.status === 'running' ? '● 在做' : bare) : lead}</strong>
        {!same && <span className="kt-summary">{a.doing}</span>}
      </div>
      {!quiet && mine && a.line && <TypeLine line={a.line} sessionUrl={a.session?.url ?? null} />}
    </>
  )
}

/** Its facts as small tags; the local session's Lean progress is the one the whole app says (vocab.leanProgress). */
function factsOf(a: Actor, b: ReqBoard): string[] {
  if (a.key !== 'local') return a.facts
  const rest = a.facts.filter((f) => !f.startsWith('Lean 做完'))
  return b.row.lean.stage ? [`Lean ${leanProgress(leanOf(b.row.lean))}`, ...rest] : rest
}

function Work({ a, board }: { a: Actor; board: ReqBoard }) {
  const commits = board.belt.filter((x) => x.actor === a.key && x.kind !== 'merge')
  const verify = a.key === 'ci' ? board.checks.cells.filter((c) => c.group === 'verify' && (c.status === 'pass' || c.status === 'fail')) : []
  const marks = a.marks.filter((m) => !(commits.length && (m.kind === 'commit' || m.kind === 'handover'))).slice().reverse().slice(0, commits.length ? 2 : 4)
  const facts = factsOf(a, board)
  if (!facts.length && !marks.length && !commits.length && !verify.length) return <p className="kt-dim kt-nothing">还没有记录</p>
  return (
    <>
      {facts.length > 0 && (
        <ul className="kt-tools br-facts-chips" aria-label="事实">
          {facts.map((f) => <li key={f}><span className="kt-mono br-fact">{f}</span></li>)}
        </ul>
      )}
      {commits.length > 0 && <Changes commits={commits} />}
      {verify.length > 0 && (
        <div className="kt-owned" aria-label="自动检查的结果">
          <span className="kt-dim">自动检查</span>
          {verify.map((c) => <span key={c.id} className={`kt-owned-case is-${c.status}`} title={c.detail}>{c.label} {c.status === 'pass' ? '✓' : '✕'}</span>)}
        </div>
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

type FileChange = NonNullable<BeltItem['changes']>[number]

/** The files an actor's commits changed, one row each, biggest first (lines added / removed summed over its commits). */
export function filesOf(commits: BeltItem[]): FileChange[] {
  const by = new Map<string, FileChange>()
  for (const c of commits) {
    for (const f of c.changes ?? []) {
      const had = by.get(f.path)
      by.set(f.path, had ? { ...had, added: had.added + f.added, removed: had.removed + f.removed, status: had.status === 'A' ? 'A' : f.status } : { ...f })
    }
  }
  return [...by.values()].sort((x, y) => y.added + y.removed - (x.added + x.removed))
}

/** 改动 (the sample's change block): the files and their +/− bars when the backend reads them, and the commits. */
function Changes({ commits }: { commits: BeltItem[] }) {
  const files = filesOf(commits)
  const added = files.reduce((n, f) => n + f.added, 0)
  const removed = files.reduce((n, f) => n + f.removed, 0)
  const scale = Math.max(1, ...files.map((f) => f.added + f.removed))
  const most = Math.max(1, ...commits.map((c) => c.files))
  const show = files.slice(0, 5)
  return (
    <div className="br-changes" data-testid="kt-changes">
      <div className="kt-files-head">
        <span>改动</span>
        {files.length > 0 ? (
          <>
            <span className="kt-add">+{added}</span>
            <span className="kt-del">−{removed}</span>
            <span className="kt-dim">{files.length} 个文件 · 提交 {commits.length} 次</span>
          </>
        ) : (
          <span className="kt-dim">提交 {commits.length} 次</span>
        )}
      </div>
      {show.length > 0 && (
        <ul className="kt-files">
          {show.map((f) => (
            <li key={f.path} title={`${f.path}  +${f.added} −${f.removed}`}>
              <span className={`kt-file-st is-${f.status}`}>{f.status}</span>
              {/* a narrow lane cuts the directory, never the file's own name */}
              <span className="kt-file-path kt-mono is-split">
                <span className="kt-file-dir">{f.path.slice(0, f.path.lastIndexOf('/') + 1)}</span>
                <span className="kt-file-base">{f.path.slice(f.path.lastIndexOf('/') + 1)}</span>
              </span>
              <span className="kt-file-bar" aria-hidden="true">
                <i className="kt-bar-add" style={{ width: `${(f.added / scale) * 100}%` }} />
                <i className="kt-bar-del" style={{ width: `${(f.removed / scale) * 100}%` }} />
              </span>
              <span className="kt-file-num kt-mono">
                <span className="kt-add">+{f.added}</span>
                {f.removed > 0 && <span className="kt-del"> −{f.removed}</span>}
              </span>
            </li>
          ))}
          {files.length > show.length && <li className="kt-more kt-dim">还有 {files.length - show.length} 个文件</li>}
        </ul>
      )}
      <ul className="kt-commits br-commit-rows" aria-label="提交">
        {commits.slice().reverse().slice(0, 3).map((c) => (
          <li key={`${c.kind}-${c.sha}`} className={c.records_only ? 'is-records' : ''}>
            <code>{c.sha.slice(0, 8)}</code>
            <span className="br-commit-subj" title={c.text}>{c.kind === 'handover' ? `交接：${c.text}` : c.text}</span>
            {!files.length && (
              <span className="br-commit-files" title={`${c.files} 个文件`}>
                <span className="kt-file-bar" aria-hidden="true"><i className="kt-bar-add" style={{ width: `${(c.files / most) * 100}%` }} /></span>
                <span className="kt-mono">{c.files} 个文件{c.records_only ? ' · 只改记录' : ''}</span>
              </span>
            )}
          </li>
        ))}
        {commits.length > 3 && <li className="kt-more kt-dim">还有 {commits.length - 3} 次提交：看提交传送带</li>}
      </ul>
    </div>
  )
}
