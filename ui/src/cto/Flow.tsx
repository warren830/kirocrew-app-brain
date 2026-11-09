/**
 * 需求流动: the kanban of what is in progress now (the sample's cto/Flow.tsx), one card a requirement. Columns are the
 * requirement's journey (需求 → 设计 → 构建 → 交给运行机 → 发布 · 验收 → 已合并); lanes are who it waits on: 等人批准
 * (a Lean approval, the start, a refused hand-over to redo: magenta, the board's word for it), 等人回答问题 (a parked
 * question), AI 在做（本机） and 运行机在做. At most two cards a cell. Every card opens the requirement's board.
 */
import { RoleIcon } from '../board/RoleIcon'
import type { Requirement } from '../types'
import { ago, fmtCredits } from '../format'

export type Col = '需求' | '设计' | '构建' | '交给运行机' | '发布验收' | '已合并'
export type Lane = 'approve' | 'answer' | 'local' | 'runner'
export const COLS: [Col, string, string][] = [
  ['需求', '需求', '逆向 · 需求 · 用户故事'], ['设计', '设计', '应用设计 · 拆单元 · 细化'], ['构建', '构建', '代码生成 · 构建测试'],
  ['交给运行机', '交给运行机', '交接 · 桥 · 签名 · brain-run'], ['发布验收', '发布 · 验收', 'RELEASE · 产品验收'], ['已合并', '已合并', '近 14 天'],
]
export const LANES: [Lane, string, string][] = [
  ['approve', '等人批准', 'req'], ['answer', '等人回答问题', 'question'], ['local', 'AI 在做（本机）', 'laptop'], ['runner', '运行机在做', 'runner'],
]

/** The column of a requirement on its journey: its state, else its Lean stage (1–3 需求, 4–8 设计, 9–10 构建, 11 发布). */
export function colOf(r: Requirement): Col | null {
  if (r.state === 'closed') return null
  if (r.state === 'merged') return '已合并'
  if (r.state === 'acceptance') return '发布验收'
  const n = r.lean.stage_n ?? 0
  const runner = r.state === 'handed_over' || r.state === 'running' || r.state === 'rejected' || ((r.state === 'parked') && (r.mr !== null || r.run_ids.length > 0))
  if (n >= 11) return '发布验收'
  if (runner) return '交给运行机'
  if (r.state === 'claimed' || n <= 3) return '需求'
  if (n <= 8) return '设计'
  return '构建'
}

/** Its lane: who it waits on right now. */
export function laneOf(r: Requirement): Lane {
  if (r.waits.line || r.state === 'claimed' || r.state === 'rejected' || r.state === 'acceptance') return 'approve'
  if (r.state === 'handed_over' && r.waits.who === 'you') return 'approve'
  if (r.state === 'parked') return 'answer'
  if (r.state === 'running' || r.state === 'handed_over') return 'runner'
  return 'local'
}

function Card({ r, at, hl, onOpen, repoName }: { r: Requirement; at: number; hl: string | null; onOpen: (r: Requirement) => void; repoName?: string }) {
  const lane = laneOf(r)
  const live = lane === 'local' ? r.waits.who === 'agent' : lane === 'runner'
  const waits = lane === 'approve' || lane === 'answer'
  return (
    <div className={`cto-kcard cto-pick${waits ? ' is-live is-wait' : live ? ' is-live is-agent' : ''}${hl === r.key ? ' is-hl' : ''}`} data-key={r.key} data-testid="flow-card"
      role="button" tabIndex={0} title="打开它的需求看板" onClick={() => onOpen(r)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(r))}>
      <div className="cto-ktop">
        <span className={waits ? 'cto-gate' : ''}>{waits && <RoleIcon role={lane === 'answer' ? 'question' : r.state === 'acceptance' ? 'release' : 'req'} size={13} />}<b className="kt-mono">{r.key}</b></span>
        <span>{ago(r.updated_at, at)}</span>
      </div>
      <div className="cto-ktitle" title={r.title}>{r.title}</div>
      <div className="cto-kfocus br-kwait" title={r.waits.text}>{r.waits.text || r.state_label}</div>
      <div className="cto-kmeta">{repoName ? `${repoName} · ` : ''}{r.owner ?? '—'}{r.stage ? ` · ${r.stage}` : ''}{r.credits !== null ? ` · ${fmtCredits(r.credits)} credits` : ''}</div>
    </div>
  )
}

export function Flow({ rows, at, hl, onOpen, onNew, repoName }: {
  rows: Requirement[]
  at: number
  hl: string | null
  onOpen: (r: Requirement) => void
  onNew?: () => void
  repoName: (id: string) => string | undefined
}) {
  const live = rows.filter((r) => colOf(r) && colOf(r) !== '已合并')
  const merged = rows.filter((r) => colOf(r) === '已合并' && (r.updated_at ?? 0) >= at - 14 * 86400)
  const cell = (c: Col, l: Lane) => live.filter((r) => colOf(r) === c && laneOf(r) === l).sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
  const count = (c: Col) => (c === '已合并' ? merged.length : live.filter((r) => colOf(r) === c).length)
  const waits = live.filter((r) => laneOf(r) === 'approve').length
  const asks = live.filter((r) => laneOf(r) === 'answer').length
  const ai = live.filter((r) => laneOf(r) === 'local').length
  const run = live.filter((r) => laneOf(r) === 'runner').length
  const many = new Set(rows.map((r) => r.repo)).size > 1
  return (
    <section className="cto-card cto-flow" aria-label="需求流动" data-anchor="flow" data-testid="flow">
      <div className="cto-flow-head">
        <span className="cto-live" aria-hidden="true" />
        <h3>需求流动</h3>
        <span className="cto-dim">此刻 · 每 5 秒刷新 · 点卡片打开它的需求看板</span>
        <span className="cto-grow" />
        {onNew && <button type="button" className="kt-btn is-small cto-noprint" onClick={onNew}>开需求 ↗</button>}
      </div>
      <div className="cto-stats" data-testid="flow-stats">
        进行中 {live.length} 个<span>·</span>等人批准 {waits}<span>·</span>等人回答 {asks}<span>·</span>AI 在本机做 {ai}<span>·</span>运行机在做 {run}
      </div>
      <div className="cto-kanban br-kanban" role="table" aria-label="需求流动看板">
        <div />
        {COLS.map(([key, name, sub]) => (
          <div className="cto-kb-h" key={key}>
            <div><b>{name}</b><span className="cto-n">{count(key)}</span></div>
            <div className="cto-st">{sub}</div>
          </div>
        ))}
        {LANES.map(([lane, name, icon]) => (
          <Row key={lane} lane={lane} name={name} icon={icon} cell={cell} at={at} hl={hl} onOpen={onOpen} repoName={many ? repoName : () => undefined}
            merged={lane === 'approve' ? merged : null} />
        ))}
      </div>
    </section>
  )
}

function Row({ lane, name, icon, cell, at, hl, onOpen, repoName, merged }: {
  lane: Lane; name: string; icon: string; cell: (c: Col, l: Lane) => Requirement[]; at: number; hl: string | null; onOpen: (r: Requirement) => void
  repoName: (id: string) => string | undefined; merged: Requirement[] | null
}) {
  const wait = lane === 'approve' || lane === 'answer'
  return (
    <>
      <div className={`cto-lane${wait ? ' is-wait' : ''}`}><span className="br-lane-name"><RoleIcon role={icon} size={15} />{name}</span></div>
      {COLS.filter(([c]) => c !== '已合并').map(([c]) => {
        const list = cell(c, lane)
        return (
          <div key={c} className={`cto-cell${wait ? ' is-wait' : ''}`} data-col={c} data-lane={lane}>
            {list.length === 0 && c === '交给运行机' && lane === 'local' && <div className="cto-kempty">交给运行机以后就不在本机做了</div>}
            {list.slice(0, 2).map((r) => <Card key={`${r.repo}/${r.key}`} r={r} at={at} hl={hl} onOpen={onOpen} repoName={repoName(r.repo)} />)}
            {list.length > 2 && <div className="cto-kmore">+{list.length - 2} 个</div>}
          </div>
        )
      })}
      {merged && (
        <div className="cto-cell is-span br-merged-cell" data-col="已合并">
          {merged.length === 0 && <div className="cto-kempty">近 14 天还没有合并的</div>}
          {merged.slice(0, 5).map((r) => (
            <button type="button" key={`${r.repo}/${r.key}`} data-key={r.key} className={`cto-kcard is-real${hl === r.key ? ' is-hl' : ''}`} title="打开它的需求看板（可以回放）" onClick={() => onOpen(r)}>
              <span className="cto-ktop"><b className="kt-mono">{r.key}</b><span>{ago(r.updated_at, at)}</span></span>
              <span className="cto-ktitle">{r.title}</span>
              <span className="cto-kmeta">{r.owner ?? '—'}{r.credits !== null ? ` · ${fmtCredits(r.credits)} credits` : ''}</span>
            </button>
          ))}
          {merged.length > 5 && <div className="cto-kmore">+{merged.length - 5} 个（见下方交付清单）</div>}
        </div>
      )}
    </>
  )
}
