/**
 * 交付总览's charts, drawn as SVG (the sample's cto/charts.tsx): the cards' small charts (无人值守: one stacked bar of the
 * judged runs; 人介入: at the judgment points against outside them; credits: a bar per requirement with the average;
 * 决定: one stacked bar by who decided) and the weekly merges (stacked columns by how they went), with a table view.
 * Marks follow the dataviz specs the sample uses: bars at most 24 px thick with a 4 px rounded end, a 2 px gap between
 * stacked segments, hairline grid, a tooltip on every mark (values first, then the name).
 *
 * One colour, one meaning (UI问题清单 #14): the four ways a requirement was delivered (HOW_VAR) are used for that only;
 * a person is --ov-person (green), 注意 is yellow (--vs-rework), magenta is left to 等人; the credits bars and the
 * decisions nobody in particular settled are neutral ink. The --ov-* variables are in Overview.tsx's OV_CSS.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { CtoNumbers, CtoRun } from '../types'

export type TipRow = [value: string, label: string, color?: string]
/** side: the tooltip beside x (its left edge at x: 'right', its right edge: 'left') instead of centred under it */
export type TipState = { x: number; y: number; rows: TipRow[]; when?: string; side?: 'left' | 'right' } | null

export const fmt = (n: number) => Math.round(n).toLocaleString('zh-CN')
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
export const md = (iso: string) => iso.slice(5)
export const slash = (iso: string) => md(iso).replace(/^0/, '').replace('-0', '-').replace('-', '/')

/** How a requirement was delivered: the colours and words the cards, the weekly chart and the ledger share. */
export const HOW: CtoRun['how'][] = ['unattended', 'people', 'local', 'pending']
export const HOW_LABEL: Record<CtoRun['how'], string> = { unattended: '无人值守', people: '有人插手', local: '只在本机', pending: '还没评' }
export const HOW_VAR: Record<CtoRun['how'], string> = { unattended: 'var(--s4)', people: 'var(--s2)', local: 'var(--s1)', pending: 'var(--s3)' }

export function useWidth(fallback = 600): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => el.clientWidth > 0 && setW(el.clientWidth)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export function Tip({ tip, width }: { tip: TipState; width: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!tip || !ref.current) return
    const w = ref.current.offsetWidth || 200
    const want = tip.side === 'right' ? tip.x : tip.side === 'left' ? tip.x - w : tip.x - w / 2
    setLeft(Math.min(Math.max(want, 0), Math.max(0, width - w)))
  }, [tip, width])
  if (!tip) return null
  return (
    <div ref={ref} className="cto-tip" role="tooltip" style={{ left, top: tip.y }}>
      {tip.when && <div className="cto-when">{tip.when}</div>}
      {tip.rows.map(([v, label, color], i) => (
        <div className="cto-row" key={i}>
          <b>{v}</b>
          {color && <i className="cto-key" style={{ background: color }} />}
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

/** A hover and focus target bigger than its mark: shows the tooltip under it. */
export function Hit({ x, y, w, h, rows, onTip, when, tipY, tipX, side, onPick, label }: {
  x: number; y: number; w: number; h: number; rows: TipRow[]; when?: string; tipY?: number; tipX?: number; side?: 'left' | 'right'
  onTip: (t: TipState) => void; onPick?: () => void; label?: string
}) {
  const show = () => onTip({ x: tipX ?? x + w / 2, y: tipY ?? y + h + 6, rows, when, side })
  const key = onPick ? (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick()) : undefined
  return (
    <rect className={`cto-hit${onPick ? ' is-pick' : ''}`} x={x} y={y} width={w} height={h} rx={6} tabIndex={0} role={onPick ? 'button' : undefined} aria-label={label}
      onPointerEnter={show} onFocus={show} onPointerLeave={() => onTip(null)} onBlur={() => onTip(null)} onClick={onPick} onKeyDown={key} />
  )
}

/** A bar growing right from the baseline: square at the baseline, a 4 px rounded data end. */
export function BarEnd({ x, y, w, h, fill }: { x: number; y: number; w: number; h: number; fill: string }) {
  const r = Math.min(4, w, h / 2)
  return <path d={`M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`} fill={fill} />
}

export function Mini({ label, height, children }: { label: string; height: number; children: (w: number, onTip: (t: TipState) => void) => ReactNode }) {
  const [ref, w] = useWidth(360)
  const [tip, setTip] = useState<TipState>(null)
  return (
    <div className="cto-mini" ref={ref}>
      <svg viewBox={`0 0 ${w} ${height}`} height={height} role="img" aria-label={label}>
        {children(w, setTip)}
      </svg>
      <Tip tip={tip} width={w} />
    </div>
  )
}

/** One stacked bar: segments with a 2 px gap, the last one's data end rounded, the total at the end. */
function StackRow({ y0, bh, L, pw, max, segs, total, label, strong, onTip, tipLabel }: {
  y0: number; bh: number; L: number; pw: number; max: number; segs: { key: string; n: number; fill: string; name: string }[]; total: string; label: string; strong?: boolean
  onTip: (t: TipState) => void; tipLabel: string
}) {
  let cum = 0
  const shown = segs.filter((s) => s.n > 0)
  const marks = shown.map((s, j) => {
    const x0 = L + (cum / max) * pw + (cum > 0 ? 2 : 0), x1 = L + ((cum + s.n) / max) * pw
    cum += s.n
    if (x1 - x0 <= 0.5) return null
    return j === shown.length - 1 ? <BarEnd key={s.key} x={x0} y={y0} w={x1 - x0} h={bh} fill={s.fill} /> : <rect key={s.key} x={x0} y={y0} width={x1 - x0} height={bh} fill={s.fill} />
  })
  const end = L + (cum / max) * pw
  return (
    <g>
      <text x={0} y={y0 + bh / 2 + 4} className={strong ? 'is-strong' : undefined}>{label}</text>
      {marks}
      {cum === 0 && <rect x={L} y={y0} width={pw} height={bh} rx={4} fill="var(--cto-glass)" />}
      <text x={end + 8} y={y0 + bh / 2 + 4} className={strong ? 'is-strong' : undefined}>{total}</text>
      <Hit x={L - 4} y={y0 - 3} w={Math.max(end - L, pw * 0.3) + 8} h={bh + 6} onTip={onTip} rows={[[total, tipLabel], ...segs.map((s) => [fmt(s.n), s.name, s.fill] as TipRow)]} />
    </g>
  )
}

/** 无人值守: every requirement brain-kit looked at, one stacked bar by how it was delivered (unattended, a person stepped
 * in, not judged yet, only on this machine); the legend under it names and counts them. */
export function MiniUnattended({ c }: { c: CtoNumbers }) {
  const count = (h: CtoRun['how']) => c.runs.filter((r) => r.how === h).length
  const bh = 22, H = bh + 6, R = 50
  const segs = HOW.map((h) => ({ key: h, n: count(h), fill: HOW_VAR[h], name: HOW_LABEL[h] }))
  const total = segs.reduce((a, x) => a + x.n, 0)
  return (
    <Mini label={`评估过的需求，按交付方式：${segs.map((x) => `${x.name} ${x.n}`).join('，')}`} height={H}>
      {(W, onTip) => (
        <StackRow y0={2} bh={bh} L={0} pw={Math.max(10, W - R)} max={Math.max(1, total)} segs={segs} total={`${total} 个`} label="" onTip={onTip} tipLabel="评估过的需求" />
      )}
    </Mini>
  )
}

/** 人介入: a person's acts at the judgment points and outside them, two bars on one scale; the kinds on hover. */
export function MiniPeople({ c }: { c: CtoNumbers }) {
  const s = c.stepped_in
  const at = s?.at_points ?? 0, out = s?.outside ?? 0
  const bh = 22, gap = 14, H = 2 * bh + gap + 4, L = 64, R = 48
  const kinds = s?.kinds ?? []
  const rows: [string, number, string, boolean][] = [['判断点上', at, 'var(--ov-person)', true], ['判断点外', out, 'var(--vs-rework)', false]]
  const max = Math.max(1, at, out)
  return (
    <Mini label={`人介入：判断点上 ${at} 次，判断点之外 ${out} 次`} height={H}>
      {(W, onTip) => {
        const pw = Math.max(10, W - L - R)
        return rows.map(([lab, v, fill, point], r) => {
          const y0 = 2 + r * (bh + gap), w = (v / max) * pw
          const ks = kinds.filter((k) => k.point === point)
          return (
            <g key={lab}>
              <text x={0} y={y0 + bh / 2 + 4} className={r === 0 ? 'is-strong' : undefined}>{lab}</text>
              {v > 0 ? <BarEnd x={L} y={y0} w={Math.max(w, 1)} h={bh} fill={fill} /> : <rect x={L} y={y0} width={pw} height={bh} rx={4} fill="var(--cto-glass)" />}
              <text x={L + (v > 0 ? w : 0) + 8} y={y0 + bh / 2 + 4} className={r === 0 ? 'is-strong' : undefined}>{fmt(v)} 次</text>
              <Hit x={L - 4} y={y0 - 3} w={Math.max(w, pw * 0.3) + 8} h={bh + 6} onTip={onTip}
                rows={[[fmt(v), point ? '判断点上（批准、退回、回答）' : '判断点之外'], ...ks.map((k) => [fmt(k.n), k.label] as TipRow)]} />
            </g>
          )
        })
      }}
    </Mini>
  )
}

/** credits per requirement: one thin bar per requirement (the six that cost most), the average as a labelled line; a
 * bar's number keeps clear of that line; the ones not drawn are counted under the bars. */
export function MiniCredits({ rows, avg, onKey }: { rows: { key: string; credits: number }[]; avg: number | null; onKey?: (key: string) => void }) {
  const top = rows.slice().sort((a, b) => b.credits - a.credits).slice(0, 6)
  const rest = rows.length - top.length
  const bh = 9, gap = 5, L = 64, R = 46, T = avg !== null ? 16 : 3
  const H = T + Math.max(1, top.length) * (bh + gap) + (rest > 0 ? 16 : 3)
  const max = Math.max(1, ...top.map((r) => r.credits), avg ?? 0)
  return (
    <Mini label={`credits：${top.map((r) => `${r.key} ${r.credits}`).join('，')}${avg !== null ? `；平均 ${avg}` : ''}${rest > 0 ? `；还有 ${rest} 个` : ''}`} height={H}>
      {(W, onTip) => {
        const pw = Math.max(10, W - L - R)
        const ax = avg !== null ? L + (avg / max) * pw : null
        return (
          <>
            {ax !== null && (
              <>
                <line x1={ax} x2={ax} y1={T - 4} y2={T + top.length * (bh + gap)} stroke="var(--text-strong)" strokeWidth={1} strokeDasharray="3 3" />
                <text x={ax} y={T - 6} textAnchor={ax > W - 60 ? 'end' : ax < L + 40 ? 'start' : 'middle'} style={{ fontSize: 11 }}>平均 {avg}</text>
              </>
            )}
            {top.map((r, i) => {
              const y0 = T + i * (bh + gap), w = (r.credits / max) * pw
              const label = r.credits.toFixed(1)
              let lx = L + w + 6
              if (ax !== null && lx < ax + 4 && lx + label.length * 6.5 > ax - 3) lx = ax + 5
              return (
                <g key={r.key}>
                  <text x={0} y={y0 + bh - 0.5} style={{ fontSize: 11 }} className={i === 0 ? 'is-strong' : undefined}>{r.key}</text>
                  <BarEnd x={L} y={y0} w={Math.max(w, 1)} h={bh} fill="var(--ov-ink)" />
                  <text x={lx} y={y0 + bh - 0.5} style={{ fontSize: 11 }}>{label}</text>
                  <Hit x={L - 4} y={y0 - 2} w={Math.max(w, 30) + 8} h={bh + 4} onTip={onTip} rows={[[label, `${r.key} 的 credits`], ...(onKey ? [['点击', '看它的看板'] as TipRow] : [])]}
                    onPick={onKey ? () => onKey(r.key) : undefined} label={`${r.key}：${r.credits} credits`} />
                </g>
              )
            })}
            {rest > 0 && <text x={L} y={H - 3} style={{ fontSize: 11 }}>还有 {rest} 个没画出来（credits 少一些）</text>}
          </>
        )
      }}
    </Mini>
  )
}

/** 决定 · 谁定的: one stacked bar by who settled the decisions (the funnel's categories). */
export function MiniWho({ rows }: { rows: { id: string; label: string; count: number }[] }) {
  const bh = 22, H = bh + 6, L = 0, R = 50
  const total = rows.reduce((a, r) => a + r.count, 0)
  return (
    <Mini label={`决定：${rows.map((r) => `${r.label} ${r.count}`).join('，')}`} height={H}>
      {(W, onTip) => (
        <StackRow y0={2} bh={bh} L={L} pw={Math.max(10, W - L - R)} max={Math.max(1, total)} total={`${total} 个`} label=""
          segs={rows.map((r) => ({ key: r.id, n: r.count, fill: WHO_VAR[r.id] ?? 'var(--ov-ink-3)', name: r.label }))} onTip={onTip} tipLabel="决定" />
      )}
    </Mini>
  )
}
/** who settled a decision: a person in the person's colour, 没归类 in 注意's yellow, the rest neutral ink (lighter, less said) */
export const WHO_VAR: Record<string, string> = { person: 'var(--ov-person)', check: 'var(--ov-ink)', brain: 'var(--ov-ink-2)', agent: 'var(--ov-ink-3)', unknown: 'var(--ov-ink-4)', unclassified: 'var(--vs-rework)' }

/** Whole-number ticks for counts (a requirement has no fractions): a step of 1, 2, 5, 10, 20 … giving at most 5 ticks. */
export function countTicks(max: number): number[] {
  const top = Math.max(1, Math.ceil(max))
  let step = 1
  for (let p = 1; ; p *= 10) {
    const s = [1, 2, 5].map((f) => f * p).find((f) => Math.ceil(top / f) <= 4)
    if (s) { step = s; break }
  }
  return Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step)
}

/** 每周合并: the last 12 weeks' merges stacked by how they went; or the same as a table. Nothing merged in 12 weeks: one
 * line says so and when there will be a chart. A week with merges filters the ledger to them (onWeek). */
const weekTotal = (w: CtoNumbers['weekly'][number]) => w.unattended + w.people + w.local + w.pending

export function WeeklyChart({ weeks, onWeek }: { weeks: CtoNumbers['weekly']; onWeek?: (start: string) => void }) {
  if (weeks.every((w) => weekTotal(w) === 0)) {
    return (
      <section className="cto-card" aria-label="每周合并" data-anchor="weekly" data-testid="weekly-empty">
        <div className="cto-chart-head">
          <h3>每周合并</h3>
          <span className="cto-dim">近 12 周还没有合并的需求：合并进默认分支以后，这里按周画出来。</span>
        </div>
      </section>
    )
  }
  return <WeeklyPlot weeks={weeks} onWeek={onWeek} />
}

function WeeklyPlot({ weeks, onWeek }: { weeks: CtoNumbers['weekly']; onWeek?: (start: string) => void }) {
  const [asTable, setAsTable] = useState(false)
  const [ref, Wd] = useWidth(1100)
  const [tip, setTip] = useState<TipState>(null)
  const tot = weekTotal
  const all = weeks.reduce((a, w) => a + tot(w), 0)
  const H = 230, L = 40, R = 12, T = 20, B = 30
  const pw = Math.max(10, Wd - L - R), ph = H - T - B, slot = pw / Math.max(1, weeks.length), bw = Math.min(24, slot * 0.56)
  const ticks = countTicks(Math.max(...weeks.map(tot)))
  const ymax = ticks[ticks.length - 1]
  const y = (v: number) => T + ph - (v / ymax) * ph
  const last4 = weeks.slice(-4).reduce((a, w) => a + tot(w), 0)
  return (
    <section className="cto-card" aria-label="每周合并" data-anchor="weekly">
      <div className="cto-chart-head">
        <h3>每周合并</h3>
        <span className="cto-dim">近 12 周合并了 {fmt(all)} 个需求，最近 4 周 {fmt(last4)} 个 · 按交付方式 · 点一周看那一周合并的</span>
        <span className="cto-grow" />
        <div className="cto-seg cto-noprint" role="group" aria-label="图或表格">
          <button type="button" aria-pressed={!asTable} onClick={() => setAsTable(false)}>图</button>
          <button type="button" aria-pressed={asTable} onClick={() => setAsTable(true)}>表格</button>
        </div>
      </div>
      {!asTable && (
        <div className="cto-legend">
          {HOW.map((k) => <span key={k}><i className="cto-sw" style={{ background: HOW_VAR[k] }} />{HOW_LABEL[k]}</span>)}
        </div>
      )}
      <div className="cto-plot br-weekly" ref={ref} hidden={asTable} style={{ height: H }}>
        <svg viewBox={`0 0 ${Wd} ${H}`} role="img" aria-label="每周合并的需求，按交付方式堆叠">
          {ticks.map((v) => {
            const yy = Math.round(y(v)) + 0.5
            return (
              <g key={v}>
                <line x1={L} x2={Wd - R} y1={yy} y2={yy} stroke={v === 0 ? 'var(--border-strong)' : 'var(--border)'} strokeWidth={1} />
                <text x={L - 8} y={yy + 4} textAnchor="end">{fmt(v)}</text>
              </g>
            )
          })}
          {weeks.map((w, i) => {
            const cx = L + slot * i + slot / 2, x0 = cx - bw / 2
            let cum = 0
            const segs = HOW.filter((k) => w[k] > 0)
            const marks = segs.map((k, j) => {
              const yb = y(cum) - (cum > 0 ? 2 : 0), yt = y(cum + w[k])
              cum += w[k]
              const h = yb - yt
              if (h <= 0.5) return null
              if (j === segs.length - 1) {
                const r = Math.min(4, h, bw / 2)
                return <path key={k} d={`M${x0},${yb} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + bw - r} Q${x0 + bw},${yt} ${x0 + bw},${yt + r} V${yb} Z`} fill={HOW_VAR[k]} />
              }
              return <rect key={k} x={x0} y={yt} width={bw} height={h} fill={HOW_VAR[k]} />
            })
            const n = tot(w)
            const right = cx < Wd / 2
            return (
              <g key={w.week}>
                {marks}
                {n > 0 && <text x={cx} y={y(n) - 6} textAnchor="middle" className="is-strong">{n}</text>}
                {i % 2 === (weeks.length - 1) % 2 && <text x={cx} y={T + ph + 18} textAnchor="middle">{slash(w.week)}</text>}
                <Hit x={L + slot * i} y={T} w={slot} h={ph} onTip={setTip} tipY={T} tipX={right ? x0 + bw + 10 : x0 - 10} side={right ? 'right' : 'left'}
                  when={`${slash(w.week)} 起的一周`}
                  rows={[[fmt(n), '合并'], ...HOW.map((k) => [fmt(w[k]), HOW_LABEL[k], HOW_VAR[k]] as TipRow), ...(onWeek && n > 0 ? [['点击', '看这一周合并的需求'] as TipRow] : [])]}
                  onPick={onWeek && n > 0 ? () => onWeek(w.week) : undefined} label={`${slash(w.week)} 起的一周：${n} 个`} />
              </g>
            )
          })}
        </svg>
        <Tip tip={tip} width={Wd} />
      </div>
      {asTable && (
        <div className="cto-weeks">
          <table className="cto-table">
            <thead><tr><th>一周起始</th>{HOW.map((k) => <th key={k} className="is-num">{HOW_LABEL[k]}</th>)}<th className="is-num">合计</th></tr></thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week}><td>{slash(w.week)} 起</td>{HOW.map((k) => <td key={k} className="is-num">{fmt(w[k])}</td>)}<td className="is-num">{fmt(tot(w))}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
