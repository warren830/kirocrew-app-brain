/**
 * The check wall (the sample team board's 测试墙): one cell per check, grouped — Lean's approvals, the last verify
 * round's checks, the hand-over (the bridge and the signer), the Brain and the repo's kit, the 14 days after the merge —
 * green passed, red failed, magenta waiting for a person, dashed not yet. A cell whose status changed since the previous
 * poll flips; hovering or focusing a cell says what it is and why in the inspector line under the wall. The sparkline is
 * verify over time: checks passed per round.
 */
import { useState } from 'react'
import type { CheckCell, CheckWall as Wall, ReqBoard } from '../types'
import { CELL_GROUPS, CELL_META, fmtAgo } from './format'
import { useServerNow } from './hooks'
import { RoleIcon } from './RoleIcon'

export function CheckWall({ board, focus, onActor, flips }: { board: ReqBoard; focus: string | null; onActor: (k: string) => void; flips: Record<string, number> }) {
  const [inspect, setInspect] = useState<string | null>(null)
  const w = board.checks
  const current = w.cells.find((c) => c.id === inspect) ?? null
  const failing = w.cells.filter((c) => c.status === 'fail')
  const waiting = w.cells.filter((c) => c.status === 'wait')
  const green = w.total > 0 && w.failed === 0 && waiting.length === 0
  const icon = (c: CheckCell) => board.actors.find((a) => a.key === c.actor)?.icon
  return (
    <section className={`kt-card kt-wall${green ? ' is-green' : ''}`} data-testid="kt-wall" aria-label="检查墙">
      <header className="kt-card-head">
        <h2>检查墙</h2>
        <span className={`kt-wall-score${green ? ' tone-ok' : failing.length ? ' tone-bad' : ''}`}>{w.passed}/{w.total}</span>
        <span className="kt-wall-src">Lean 审批 · verify · 交接 · Brain</span>
        <TestedAt at={w.at} />
      </header>
      {w.history.length > 0 && (
        <div className="kt-spark-row">
          <span title="每次 lean verify 记一个点">verify 通过数</span>
          <Sparkline history={w.history} />
        </div>
      )}
      {w.cells.length === 0 ? (
        <p className="kt-dim kt-wall-empty">还没有检查：开工以后，Lean 的审批和 verify 都会记在这里</p>
      ) : (
        <div className="kt-wall-grid">
          {CELL_GROUPS.map((g) => {
            const cells = w.cells.filter((c) => c.group === g.key)
            if (!cells.length) return null
            return (
              <div key={g.key} className="kt-ac is-multi br-wall-group" role="group" aria-label={g.label}>
                <div className="kt-group-label">{g.label}</div>
                <div className="kt-ac-cells">
                  {cells.map((c) => {
                    const flip = flips[c.id] ?? 0
                    const meta = CELL_META[c.status] ?? { label: c.status, glyph: '?' }
                    return (
                      <button key={c.id} type="button" className={`kt-cell is-${c.status}${focus ? (c.actor === focus ? ' is-hot' : ' is-dim') : ''}`}
                        data-testid="kt-cell" data-case={c.id} data-status={c.status} aria-label={`${c.name}：${meta.label}，${c.detail}`}
                        onMouseEnter={() => setInspect(c.id)} onMouseLeave={() => setInspect((x) => (x === c.id ? null : x))}
                        onFocus={() => setInspect(c.id)} onBlur={() => setInspect((x) => (x === c.id ? null : x))}
                        onClick={() => c.actor && onActor(c.actor)}>
                        <span key={flip} className={`kt-cell-face${flip ? ' is-flip' : ''}`}>
                          <span className="kt-cell-ac">{c.label}</span>
                          <span className="kt-cell-glyph" aria-hidden="true">{meta.glyph}</span>
                          {icon(c) && <span className="kt-cell-owner" aria-hidden="true"><RoleIcon role={icon(c)} size={12} /></span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {w.cells.length > 0 && (
        <div className={`kt-wall-inspect${current ? ` is-${current.status}` : failing.length ? ' is-fail' : ''}`} data-testid="kt-inspect">
          {current ? (
            <>
              <strong>{CELL_META[current.status]?.glyph} {current.name}</strong>
              <span>{current.detail}</span>
            </>
          ) : failing.length ? (
            <span><strong className="tone-bad">{failing.length} 个没过</strong> {failing.map((c) => c.label).join('、')}<span className="kt-dim"> · 悬停或聚焦格子看原因</span></span>
          ) : waiting.length ? (
            <span><strong className="tone-approve">{waiting.length} 个等人</strong> {waiting.map((c) => c.label).join('、')}<span className="kt-dim"> · 悬停看要做什么</span></span>
          ) : green ? (
            <strong className="tone-ok">全部通过 ✓</strong>
          ) : (
            <span className="kt-dim">别的还没到：悬停看每一格</span>
          )}
        </div>
      )}
    </section>
  )
}

function TestedAt({ at }: { at: number | null }) {
  const now = useServerNow()
  return <span className="kt-dim kt-wall-at">{at ? `${fmtAgo(now - at)}更新` : '还没有结果'}</span>
}

export function Sparkline({ history }: { history: Wall['history'] }) {
  if (!history.length) return null
  const W = 300
  const H = 40
  const t0 = history[0].at
  const t1 = history[history.length - 1].at
  const max = Math.max(1, ...history.map((h) => h.passed + h.failed))
  const x = (at: number) => (t1 > t0 ? 5 + ((at - t0) / (t1 - t0)) * (W - 10) : W / 2)
  const y = (v: number) => H - 5 - (v / max) * (H - 10)
  let d = `M${x(history[0].at).toFixed(1)},${y(history[0].passed).toFixed(1)}`
  for (let i = 1; i < history.length; i++) d += ` H${x(history[i].at).toFixed(1)} V${y(history[i].passed).toFixed(1)}`
  const last = history[history.length - 1]
  const area = `${d} V${H - 5} H${x(history[0].at).toFixed(1)} Z`
  return (
    <svg className="kt-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`verify 通过数：${history.map((h) => `${h.passed}/${h.passed + h.failed}`).join(' → ')}`}>
      <line className="kt-spark-total" x1={0} x2={W} y1={y(max)} y2={y(max)} />
      <path className="kt-spark-area" d={area} />
      <path className="kt-spark-line" d={d} />
      {history.map((h, i) => (
        <circle key={i} className={h.failed ? 'kt-spark-pt is-fail' : 'kt-spark-pt is-pass'} cx={x(h.at)} cy={y(h.passed)} r={i === history.length - 1 ? 3.4 : 2.2}>
          <title>{`${h.passed}/${h.passed + h.failed}`}</title>
        </circle>
      ))}
      <text className="kt-spark-label" x={Math.min(W - 2, x(last.at))} y={Math.max(9, y(last.passed) - 6)} textAnchor="end">{last.passed}</text>
    </svg>
  )
}
