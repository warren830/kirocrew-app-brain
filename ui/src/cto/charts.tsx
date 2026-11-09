/**
 * 交付总览's charts, drawn as SVG (the sample's cto/charts.tsx): the cards' small charts (无人值守: one stacked bar of the
 * judged runs; 人介入: at the judgment points against outside them; credits: a bar per requirement with the average;
 * 决定: one stacked bar by who decided) and the weekly merges (stacked columns by how they went), with a table view.
 * Marks follow the dataviz specs the sample uses: bars at most 24 px thick with a 4 px rounded end, a 2 px gap between
 * stacked segments, hairline grid, a tooltip on every mark (values first, then the name).
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { CtoNumbers, CtoRun } from '../types'

export type TipRow = [value: string, label: string, color?: string]
export type TipState = { x: number; y: number; rows: TipRow[]; when?: string } | null

export const fmt = (n: number) => Math.round(n).toLocaleString('zh-CN')
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
export const md = (iso: string) => iso.slice(5)
export const slash = (iso: string) => md(iso).replace(/^0/, '').replace('-0', '-').replace('-', '/')

/** How a requirement was delivered: the colours and words the cards, the weekly chart and the ledger share. */
export const HOW: CtoRun['how'][] = ['unattended', 'people', 'local', 'pending']
export const HOW_LABEL: Record<CtoRun['how'], string> = { unattended: '无人值守', people: '有人插手', local: '本机做完', pending: '还没评' }
export const HOW_VAR: Record<CtoRun['how'], string> = { unattended: 'var(--s4)', people: 'var(--vs-person)', local: 'var(--s1)', pending: 'var(--s3)' }

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
    setLeft(Math.min(Math.max(tip.x - w / 2, 0), Math.max(0, width - w)))
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
export function Hit({ x, y, w, h, rows, onTip, when, tipY, onPick, label }: { x: number; y: number; w: number; h: number; rows: TipRow[]; when?: string; tipY?: number; onTip: (t: TipState) => void; onPick?: () => void; label?: string }) {
  const show = () => onTip({ x: x + w / 2, y: tipY ?? y + h + 6, rows, when })
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

/** 无人值守: the judged hand-over runs (unattended, a person stepped in), and below them the ones not judged yet and the
 * ones done on the person's machine, on one scale. */
export function MiniUnattended({ c }: { c: CtoNumbers }) {
  const count = (h: CtoRun['how']) => c.runs.filter((r) => r.how === h).length
  const bh = 22, gap = 14, H = 2 * bh + gap + 4, L = 64, R = 56
  const judged = [{ key: 'unattended', n: count('unattended'), fill: HOW_VAR.unattended, name: HOW_LABEL.unattended }, { key: 'people', n: count('people'), fill: HOW_VAR.people, name: HOW_LABEL.people }]
  const other = [{ key: 'pending', n: count('pending'), fill: HOW_VAR.pending, name: HOW_LABEL.pending }, { key: 'local', n: count('local'), fill: HOW_VAR.local, name: HOW_LABEL.local }]
  const max = Math.max(1, judged.reduce((a, s) => a + s.n, 0), other.reduce((a, s) => a + s.n, 0))
  return (
    <Mini label={`评估过的交接：无人值守 ${judged[0].n}，有人插手 ${judged[1].n}；还没评 ${other[0].n}，本机做完 ${other[1].n}`} height={H}>
      {(W, onTip) => {
        const pw = Math.max(10, W - L - R)
        return (
          <>
            <StackRow y0={2} bh={bh} L={L} pw={pw} max={max} segs={judged} total={`${judged[0].n + judged[1].n} 个`} label="评估过的" strong onTip={onTip} tipLabel="交接过、评估过的需求" />
            <StackRow y0={2 + bh + gap} bh={bh} L={L} pw={pw} max={max} segs={other} total={`${other[0].n + other[1].n} 个`} label="别的" onTip={onTip} tipLabel="还没评、或只在本机做的" />
          </>
        )
      }}
    </Mini>
  )
}

/** 人介入: a person's acts at the judgment points and outside them, two bars on one scale; the kinds on hover. */
export function MiniPeople({ c }: { c: CtoNumbers }) {
  const s = c.stepped_in
  const at = s?.at_points ?? 0, out = s?.outside ?? 0
  const bh = 22, gap = 14, H = 2 * bh + gap + 4, L = 64, R = 48
  const kinds = s?.kinds ?? []
  const rows: [string, number, string, boolean][] = [['判断点上', at, 'var(--s4)', true], ['判断点外', out, 'var(--vs-rework)', false]]
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
                rows={[[fmt(v), point ? '判断点上（批准、驳回、回答）' : '判断点之外'], ...ks.map((k) => [fmt(k.n), k.label] as TipRow)]} />
            </g>
          )
        })
      }}
    </Mini>
  )
}

/** credits per requirement: one thin bar per requirement (the six that cost most), the average as a line. */
export function MiniCredits({ rows, avg, onKey }: { rows: { key: string; credits: number }[]; avg: number | null; onKey?: (key: string) => void }) {
  const top = rows.slice().sort((a, b) => b.credits - a.credits).slice(0, 6)
  const bh = 9, gap = 5, L = 64, R = 46, H = Math.max(1, top.length) * (bh + gap) + 6
  const max = Math.max(1, ...top.map((r) => r.credits), avg ?? 0)
  return (
    <Mini label={`credits：${top.map((r) => `${r.key} ${r.credits}`).join('，')}${avg !== null ? `；平均 ${avg}` : ''}`} height={H}>
      {(W, onTip) => {
        const pw = Math.max(10, W - L - R)
        const ax = avg !== null ? L + (avg / max) * pw : null
        return (
          <>
            {top.map((r, i) => {
              const y0 = 3 + i * (bh + gap), w = (r.credits / max) * pw
              return (
                <g key={r.key}>
                  <text x={0} y={y0 + bh - 0.5} style={{ fontSize: 11 }} className={i === 0 ? 'is-strong' : undefined}>{r.key}</text>
                  <BarEnd x={L} y={y0} w={Math.max(w, 1)} h={bh} fill="var(--s4)" />
                  <text x={L + w + 6} y={y0 + bh - 0.5} style={{ fontSize: 11 }}>{r.credits.toFixed(1)}</text>
                  <Hit x={L - 4} y={y0 - 2} w={Math.max(w, 30) + 8} h={bh + 4} onTip={onTip} rows={[[r.credits.toFixed(1), `${r.key} 的 credits`], ...(onKey ? [['点击', '看它的看板'] as TipRow] : [])]}
                    onPick={onKey ? () => onKey(r.key) : undefined} label={`${r.key}：${r.credits} credits`} />
                </g>
              )
            })}
            {ax !== null && <line x1={ax} x2={ax} y1={0} y2={H} stroke="var(--text-strong)" strokeWidth={1} strokeDasharray="3 3" />}
          </>
        )
      }}
    </Mini>
  )
}

/** 决定 · 谁定的: one stacked bar by who settled the decisions (the funnel's categories). */
export function MiniWho({ rows }: { rows: { id: string; label: string; count: number }[] }) {
  const color: Record<string, string> = { person: 'var(--vs-person)', check: 'var(--s1)', brain: 'var(--s4)', agent: 'var(--s2)', unknown: 'var(--s3)', unclassified: 'var(--vs-rework)' }
  const bh = 22, H = bh + 6, L = 0, R = 50
  const total = rows.reduce((a, r) => a + r.count, 0)
  return (
    <Mini label={`决定：${rows.map((r) => `${r.label} ${r.count}`).join('，')}`} height={H}>
      {(W, onTip) => (
        <StackRow y0={2} bh={bh} L={L} pw={Math.max(10, W - L - R)} max={Math.max(1, total)} total={`${total} 个`} label=""
          segs={rows.map((r) => ({ key: r.id, n: r.count, fill: color[r.id] ?? 'var(--s3)', name: r.label }))} onTip={onTip} tipLabel="决定" />
      )}
    </Mini>
  )
}
export const WHO_VAR: Record<string, string> = { person: 'var(--vs-person)', check: 'var(--s1)', brain: 'var(--s4)', agent: 'var(--s2)', unknown: 'var(--s3)', unclassified: 'var(--vs-rework)' }

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))))
  for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * p >= v) return f * p
  return 10 * p
}

/** 每周合并: the last 12 weeks' merges stacked by how they went; or the same as a table. */
export function WeeklyChart({ weeks, onWeek }: { weeks: CtoNumbers['weekly']; onWeek?: (start: string) => void }) {
  const [asTable, setAsTable] = useState(false)
  const [ref, Wd] = useWidth(1100)
  const [tip, setTip] = useState<TipState>(null)
  const tot = (w: CtoNumbers['weekly'][number]) => w.unattended + w.people + w.local + w.pending
  const all = weeks.reduce((a, w) => a + tot(w), 0)
  const H = 230, L = 40, R = 12, T = 20, B = 30
  const pw = Math.max(10, Wd - L - R), ph = H - T - B, slot = pw / Math.max(1, weeks.length), bw = Math.min(24, slot * 0.56)
  const ymax = niceMax(Math.max(1, ...weeks.map(tot)))
  const y = (v: number) => T + ph - (v / ymax) * ph
  const last4 = weeks.slice(-4).reduce((a, w) => a + tot(w), 0)
  return (
    <section className="cto-card" aria-label="每周合并" data-anchor="weekly">
      <div className="cto-chart-head">
        <h3>每周合并</h3>
        <span className="cto-dim">近 12 周合并了 {fmt(all)} 个需求，最近 4 周 {fmt(last4)} 个 · 按交付方式</span>
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
          {[0, 1, 2, 3, 4].map((t) => {
            const v = (ymax / 4) * t, yy = Math.round(y(v)) + 0.5
            return (
              <g key={t}>
                <line x1={L} x2={Wd - R} y1={yy} y2={yy} stroke={t === 0 ? 'var(--border-strong)' : 'var(--border)'} strokeWidth={1} />
                <text x={L - 8} y={yy + 4} textAnchor="end">{Number.isInteger(v) ? fmt(v) : v.toFixed(1)}</text>
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
            return (
              <g key={w.week}>
                {marks}
                {tot(w) > 0 && <text x={cx} y={y(tot(w)) - 6} textAnchor="middle" className="is-strong">{tot(w)}</text>}
                {i % 2 === (weeks.length - 1) % 2 && <text x={cx} y={T + ph + 18} textAnchor="middle">{slash(w.week)}</text>}
                <Hit x={L + slot * i} y={T} w={slot} h={ph} onTip={setTip} tipY={Math.max(0, y(tot(w)) - 110)}
                  when={`${slash(w.week)} 起的一周`}
                  rows={[[fmt(tot(w)), '合并'], ...HOW.map((k) => [fmt(w[k]), HOW_LABEL[k], HOW_VAR[k]] as TipRow), ...(onWeek ? [['点击', '看这一周合并的需求'] as TipRow] : [])]}
                  onPick={onWeek ? () => onWeek(w.week) : undefined} label={`${slash(w.week)} 起的一周：${tot(w)} 个`} />
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
                <tr key={w.week}><td>{w.week}</td>{HOW.map((k) => <td key={k} className="is-num">{fmt(w[k])}</td>)}<td className="is-num">{fmt(tot(w))}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
