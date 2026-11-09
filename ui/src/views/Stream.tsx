/**
 * 价值流: a requirement's time, from the board's actors (AI on this machine, the runner, waiting for a person, done again),
 * from its start to the merge or now, as the sample's StreamChart shows it: one band on a time axis, each part named
 * (the gate it waited at, the session, the AI) with how it ended, who was at it above, the moments under it; 图 or 表格.
 */
import { useState } from 'react'
import { RoleGlyph } from '../board/RoleIcon'
import { Hit, Tip, useWidth, type TipState } from '../cto/charts'
import { fmtDay, fmtSpan, isoDay } from '../format'
import type { Actor, BoardEvent, ReqBoard } from '../types'

const RUNNERS = new Set(['runner', 'bridge', 'signer'])

/** Where the time went, from the board's actors: AI on this machine, the runner, waiting for a person, done again. */
export type Part = 'agent' | 'runner' | 'person' | 'rework'
export const PART_LABEL: Record<Part, string> = { agent: 'AI 在本机做', runner: '运行机在做', person: '等人', rework: '返工' }
export const PART_VAR: Record<Part, string> = { agent: 'var(--vs-agent)', runner: 'var(--s1)', person: 'var(--vs-person)', rework: 'var(--vs-rework)' }
export const PARTS: Part[] = ['agent', 'runner', 'person', 'rework']
const RANK: Record<Part, number> = { person: 4, rework: 3, runner: 2, agent: 1 }
const DECISION_WORD: Partial<Record<BoardEvent['kind'], string>> = { approve: '批准', reject: '退回', answer: '回答了', accepted: '接手', rejected: '拒收' }

/** One stretch of the 价值流: what was most telling then (a wait for a person over work going on meanwhile), whose. */
export interface StreamSeg {
  from: number
  to: number
  part: Part
  /** the actor it is on (board actor key) */
  actor: string
  /** 需求审批, 会话等人, AI 在本机做, 运行机 … */
  label: string
  /** its RoleIcon above the band */
  icon: string
  /** how a wait ended: 批准, 退回, 回答了 … */
  decision: string | null
}

function partOf(a: Actor, kind: 'work' | 'wait' | 'fix'): Part {
  return kind === 'wait' ? 'person' : kind === 'fix' ? 'rework' : RUNNERS.has(a.key) ? 'runner' : 'agent'
}

function labelOf(a: Actor, part: Part): string {
  if (part === 'rework') return PART_LABEL.rework
  if (part === 'person') return a.key === 'local' ? '会话等人' : a.title
  return a.key === 'local' ? PART_LABEL.agent : a.title
}

/** The requirement's time from its start to the merge (or now) as segments in order; quiet stretches with nothing
 * recorded are left out, and nothing after the merge counts (the write-back that follows is said on its own). */
export function valueStream(b: ReqBoard, now: number): StreamSeg[] {
  const stop = b.ended_at ?? now
  const ivs: { a: number; b: number; part: Part; actor: Actor }[] = []
  for (const a of b.actors) {
    for (const s of a.spans) {
      const end = Math.min(s.b ?? stop, stop)
      if (end > s.a) ivs.push({ a: s.a, b: end, part: partOf(a, s.kind), actor: a })
    }
  }
  const pts = [...new Set(ivs.flatMap((x) => [x.a, x.b]))].sort((x, y) => x - y)
  const out: StreamSeg[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = pts[i], t1 = pts[i + 1]
    const on = ivs.filter((x) => x.a <= t0 && x.b >= t1)
    if (!on.length) continue
    const top = on.sort((x, y) => RANK[y.part] - RANK[x.part])[0]
    const last = out[out.length - 1]
    if (last && last.part === top.part && last.actor === top.actor.key && Math.abs(last.to - t0) < 1) last.to = t1
    else out.push({ from: t0, to: t1, part: top.part, actor: top.actor.key, label: labelOf(top.actor, top.part), icon: top.part === 'person' ? 'wait' : top.actor.icon, decision: null })
  }
  for (const s of out) {
    if (s.part !== 'person') continue
    const e = b.events.find((ev) => DECISION_WORD[ev.kind] && (ev.to === s.actor || ev.from === s.actor) && Math.abs(ev.at - s.to) <= 5)
    s.decision = e ? DECISION_WORD[e.kind] ?? null : null
  }
  return out
}

export function splitOf(segs: StreamSeg[]) {
  return PARTS.map((p) => ({ p, s: segs.filter((g) => g.part === p).reduce((a, g) => a + g.to - g.from, 0) }))
}

const pad = (n: number) => String(n).padStart(2, '0')
/** 14:05 (local) */
const hm = (t: number) => {
  const d = new Date(t * 1000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** 11-09 14:05 when the day matters, else 14:05 */
const when = (t: number, withDay: boolean) => (withDay ? `${fmtDay(t).slice(5)} ${hm(t)}` : hm(t))

const STEPS = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800]

/** Ticks on local clock marks (every 10 minutes, every hour, every day …), at most about 7 of them. */
function ticksOf(t0: number, t1: number): number[] {
  const step = STEPS.find((s) => (t1 - t0) / s <= 7) ?? STEPS[STEPS.length - 1]
  const off = new Date(t0 * 1000).getTimezoneOffset() * 60
  const out: number[] = []
  for (let t = Math.ceil((t0 - off) / step) * step + off; t < t1; t += step) out.push(t)
  return out
}

const MOMENT_ICON: Partial<Record<BoardEvent['kind'], string>> = {
  start: 'new', approve: 'approved', reject: 'bounce', handover: 'handover', accepted: 'bridge', rejected: 'bounce', question: 'question', answer: 'person', merge: 'merge', reflect: 'brain',
}
const momentTone = (k: BoardEvent['kind']) => (k === 'reject' || k === 'rejected' ? 'is-back' : k === 'question' ? 'is-wait' : 'is-ok')

/** 价值流: the requirement's time on one band over a time axis — AI on this machine, the runner, waiting for a person,
 * done again — who was at it above, its moments under it; 图 or 表格; every part and moment opens the board there. */
export function StreamCard({ board, at, onAt }: { board: ReqBoard | null; at: number; onAt: (t: number | null) => void }) {
  const [asTable, setAsTable] = useState(false)
  const segs = board ? valueStream(board, at) : []
  if (!board || !segs.length) return null
  const t0 = segs[0].from, t1 = segs[segs.length - 1].to
  const parts = PARTS.filter((p) => segs.some((s) => s.part === p))
  const who = (s: StreamSeg) => (s.part === 'person' ? '人' : s.part === 'runner' ? s.label : s.part === 'rework' ? 'AI' : 'AI（本机会话）')
  const days = isoDay(new Date(t0 * 1000).toISOString()) !== isoDay(new Date(t1 * 1000).toISOString())
  return (
    <section className="cto-card" aria-label="价值流" data-testid="item-stream">
      <div className="cto-chart-head">
        <h3>价值流</h3>
        <span className="cto-dim">从开工到{board.ended_at ? '合并' : '此刻'}，共 {fmtSpan(t1 - t0)} · 点任一段或任一时刻，到需求看板的那一刻</span>
        <span className="cto-grow" />
        <div className="cto-seg" role="group" aria-label="图或表格">
          <button type="button" aria-pressed={!asTable} onClick={() => setAsTable(false)}>图</button>
          <button type="button" aria-pressed={asTable} onClick={() => setAsTable(true)}>表格</button>
        </div>
      </div>
      <div className="cto-legend">
        {parts.map((p) => <span key={p}><i className="cto-sw" style={{ background: PART_VAR[p] }} />{PART_LABEL[p]}</span>)}
        <span className="cto-dim">· 色块上方是谁在做，下方是关键时刻 · 安静的时段没画</span>
      </div>
      {asTable ? (
        <div className="br-scroll">
          <table className="cto-table" aria-label="价值流的每一段">
            <thead><tr><th>时间</th><th>环节</th><th>谁</th><th className="is-num">用时</th><th>结论</th><th /></tr></thead>
            <tbody>
              {segs.map((s) => (
                <tr key={`${s.from}-${s.actor}`}>
                  <td className="kt-mono">{when(s.from, days)}–{when(s.to, days)}</td>
                  <td><span className="cto-kind"><i className="cto-sw" style={{ background: PART_VAR[s.part] }} />{s.label}</span></td>
                  <td>{who(s)}</td>
                  <td className="is-num">{fmtSpan(s.to - s.from)}</td>
                  <td>{s.decision ?? ''}</td>
                  <td><button type="button" className="cto-link" onClick={() => onAt(s.from)}>看板 ↗</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <StreamChart board={board} segs={segs} days={days} onAt={onAt} />
      )}
    </section>
  )
}

/** The chart itself: mounted with its box, so it is measured at the width it has. */
function StreamChart({ board, segs, days, onAt }: { board: ReqBoard; segs: StreamSeg[]; days: boolean; onAt: (t: number | null) => void }) {
  const [ref, W] = useWidth(1100)
  const [tip, setTip] = useState<TipState>(null)
  const t0 = segs[0].from, t1 = segs[segs.length - 1].to
  const total = Math.max(60, t1 - t0)
  const L = 6, R = 6, pw = Math.max(10, W - L - R)
  const x = (t: number) => L + ((Math.min(Math.max(t, t0), t0 + total) - t0) / total) * pw
  const BAND = 36, BH = 24, AXIS = 112, MOM = 148
  const edge = days ? 112 : 60   // the start and end labels: 11-04 08:34 is about 75 px, a tick's label half of 36
  const ticks = ticksOf(t0, t1).filter((t) => x(t) - x(t0) > edge && x(t1) - x(t) > edge)
  // the moments, those at the same spot as one icon with a count, in rows: one that would sit on top of the one before
  // it goes a row down
  const groups: { mx: number; evs: BoardEvent[] }[] = []
  for (const e of board.events.filter((ev) => MOMENT_ICON[ev.kind] && ev.at >= t0 - 1 && ev.at <= t1 + 1).sort((a, b) => a.at - b.at)) {
    const mx = Math.min(Math.max(x(e.at), L + 12), W - R - 12)
    const g = groups[groups.length - 1]
    if (g && mx - g.mx < 6) g.evs.push(e)
    else groups.push({ mx, evs: [e] })
  }
  const rows: number[] = []
  const placed = groups.map((g) => {
    let r = rows.findIndex((last) => g.mx - last >= 26)
    if (r < 0) r = rows.length < 3 ? rows.length : 2
    rows[r] = g.mx
    return { ...g, my: MOM + r * 26 }
  })
  const H = MOM + Math.max(1, rows.length) * 26 + 4
  return (
    <div className="br-vs" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="group" aria-label={'价值流：' + segs.map((s) => `${s.label} ${fmtSpan(s.to - s.from)}`).join('，')}>
        {[t0, ...ticks, t1].map((t, i, all) => (
          <g key={`${t}-${i}`}>
            <line x1={x(t)} x2={x(t)} y1={BAND - 6} y2={AXIS} stroke="var(--border)" strokeWidth={1} />
            <text x={x(t)} y={AXIS + 16} textAnchor={i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle'}>{when(t, days && (i === 0 || i === all.length - 1 || hm(t) === '00:00'))}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={AXIS} y2={AXIS} stroke="var(--border-strong)" strokeWidth={1} />
        {segs.map((s, i) => {
          const a = x(s.from), bb = x(s.to), w = Math.max(2, bb - a - (i < segs.length - 1 ? 2 : 0))
          const label = s.label.length * 13 > w ? `${s.label.slice(0, Math.max(1, Math.floor(w / 13) - 1))}…` : s.label
          return (
            <g key={`${s.from}-${s.actor}`} className="cto-vs-seg">
              <rect x={a} y={BAND} width={w} height={BH} rx={i === 0 || i === segs.length - 1 ? 4 : 1} fill={PART_VAR[s.part]} />
              {w >= 22 && (
                <g className={`cto-vs-chip ${s.part === 'person' ? 'is-wait' : 'is-ok'}`} transform={`translate(${a},${BAND - 28})`}>
                  <rect width={20} height={20} rx={6} />
                  <RoleGlyph role={s.icon} cx={10} cy={10} size={14} />
                </g>
              )}
              {w >= 58 && (
                <>
                  <text x={a} y={BAND + BH + 18} className="is-strong">{label}</text>
                  <text x={a} y={BAND + BH + 34}>{fmtSpan(s.to - s.from)}{s.decision ? ` · ${s.decision}` : ''}</text>
                </>
              )}
              <Hit x={a} y={BAND - 30} w={Math.max(8, w)} h={BH + 72} onTip={setTip} tipY={BAND + BH + 40} onPick={() => onAt(s.from)}
                label={`${s.label} ${fmtSpan(s.to - s.from)}`} when={`${when(s.from, days)} – ${when(s.to, days)} · ${PART_LABEL[s.part]}`}
                rows={[[fmtSpan(s.to - s.from), s.label, PART_VAR[s.part]], ...(s.decision ? [[s.decision, '结论'] as [string, string]] : []), ['点击', '到需求看板的这一刻']]} />
            </g>
          )
        })}
        {placed.map(({ mx, my, evs }) => {
          const e = evs[0]
          return (
            <g key={`${e.seq}`} className={`cto-vs-moment ${momentTone(e.kind)}`} data-testid="vs-moment">
              <line x1={mx} x2={mx} y1={BAND + BH} y2={my - 11} className="cto-vs-tick" />
              <circle cx={mx} cy={my} r={11} />
              <RoleGlyph role={MOMENT_ICON[e.kind]} cx={mx} cy={my} size={14} />
              {evs.length > 1 && (
                <g className="br-vs-n"><circle cx={mx + 10} cy={my - 9} r={7} /><text x={mx + 10} y={my - 5.5} textAnchor="middle">{evs.length}</text></g>
              )}
              <title>{evs.map((v) => `${hm(v.at)} ${v.text}`).join('\n')}</title>
              <Hit x={mx - 13} y={my - 13} w={26} h={26} onTip={setTip} tipY={my + 16} when={hm(e.at)} onPick={() => onAt(e.at)}
                label={`${hm(e.at)} ${evs.map((v) => v.text).join('；')}：看板回放到这一刻`}
                rows={[...evs.slice(0, 5).map((v) => [hm(v.at), v.text] as [string, string]), ['点击', '看板回放到这一刻']]} />
            </g>
          )
        })}
      </svg>
      <Tip tip={tip} width={W} />
    </div>
  )
}

