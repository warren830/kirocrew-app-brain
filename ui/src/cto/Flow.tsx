/**
 * 需求流动: the kanban of what is in progress now (the sample's cto/Flow.tsx), one card a requirement. Columns are the
 * requirement's journey (需求 → 设计 → 构建 → 交给运行机 → 发布 · 验收 → 已合并); lanes are who it waits on: 等人批准
 * (a Lean approval, the start, a refused hand-over to redo: magenta, the board's word for it), 等人回答问题 (a parked
 * question), AI 在做（本机）, 运行机在做, and 待认领 (a small requirement nobody has: shown while a big requirement is
 * split here). At most two cards a cell. Every card opens the requirement's board.
 *
 * A big requirement split into small ones (brain split) is one card with its small ones in short (n/m merged as
 * segments, then each key · unit · state); a small one is a unit of its construction (构建), with its big one, its
 * dependencies and what blocks it; one merged into the big one's branch has no card of its own (its big one's says it).
 */
import { RoleIcon } from '../board/RoleIcon'
import type { ChildState, FamilyDep, ReqFamily, Requirement } from '../types'
import { ago, fmtCredits } from '../format'

export type Col = '需求' | '设计' | '构建' | '交给运行机' | '发布验收' | '已合并'
export type Lane = 'approve' | 'answer' | 'local' | 'runner' | 'unclaimed'
export const COLS: [Col, string, string][] = [
  ['需求', '需求', '逆向 · 需求 · 用户故事'], ['设计', '设计', '应用设计 · 拆单元 · 细化'], ['构建', '构建', '代码生成 · 构建测试'],
  ['交给运行机', '交给运行机', '交接 · 桥 · 签名 · brain-run'], ['发布验收', '发布 · 验收', 'RELEASE · 产品验收'], ['已合并', '已合并', '近 14 天'],
]
export const LANES: [Lane, string, string][] = [
  ['approve', '等人批准', 'req'], ['answer', '等人回答问题', 'question'], ['local', 'AI 在做（本机）', 'laptop'], ['runner', '运行机在做', 'runner'],
  ['unclaimed', '待认领', 'list'],
]

/** The column of a requirement on its journey: its state, else its Lean stage (1–3 需求, 4–8 设计, 9–10 构建, 11 发布).
 * A small requirement is in 构建 (it is a unit of its big one's construction) until it is handed over; a split big one
 * is in 构建 while its small ones are built, in 发布验收 once they have all merged; one merged into its big one's branch
 * has no card (null), as a closed one. */
export function colOf(r: Requirement): Col | null {
  if (r.state === 'closed' || r.state === 'merged_into_parent') return null
  if (r.state === 'merged') return '已合并'
  if (r.state === 'acceptance') return '发布验收'
  if (r.state === 'unclaimed') return '构建'
  const n = r.lean.stage_n ?? 0
  const runner = r.state === 'handed_over' || r.state === 'running' || r.state === 'rejected' || ((r.state === 'parked') && (r.mr !== null || r.run_ids.length > 0))
  const role = r.family?.role
  if (role === 'child' && !runner) return '构建'
  if (n >= 11) return '发布验收'
  if (runner) return '交给运行机'
  if (role === 'parent') return r.family?.family_state === 'ready_to_release' ? '发布验收' : '构建'
  if (r.state === 'claimed' || n <= 3) return '需求'
  if (n <= 8) return '设计'
  return '构建'
}

/** Its lane: who it waits on right now. A small requirement nobody has: 待认领; one whose MR waits for its big one's
 * owner to merge it, and a big one whose small ones have all merged (review, release): 等人批准. */
export function laneOf(r: Requirement): Lane {
  if (r.state === 'unclaimed') return 'unclaimed'
  if (r.waits.line || r.state === 'claimed' || r.state === 'rejected' || r.state === 'acceptance') return 'approve'
  if (r.state === 'handed_over' && r.waits.who === 'you') return 'approve'
  if (r.state === 'local' && isReview(r)) return 'approve'
  if (r.state === 'parked') return 'answer'
  if (r.state === 'running' || r.state === 'handed_over') return 'runner'
  return 'local'
}

/** A big requirement ready to be released, or a small one whose MR into the big one's branch is open. */
function isReview(r: Requirement): boolean {
  const f = r.family
  if (f?.role === 'parent') return f.family_state === 'ready_to_release'
  return f?.role === 'child' && !!r.mr && r.mr.state !== 'closed' && r.mr.state !== 'merged'
}

/** The small requirements of a split shown here: the lane 待认领 is on while there are any. */
const hasSplit = (rows: Requirement[]) => rows.some((r) => r.family?.role === 'parent' || r.family?.role === 'child' || r.state === 'unclaimed')

/** A small requirement's state in short: a glyph (as the state chips' dots) and a tone. */
const CHILD_META: Record<ChildState, { glyph: string; tone: string; seg: string }> = {
  unclaimed: { glyph: '◌', tone: 'idle', seg: '' },
  claimed: { glyph: '○', tone: 'info', seg: 'is-claimed' },
  in_progress: { glyph: '●', tone: 'run', seg: 'is-run' },
  merged: { glyph: '✔', tone: 'ok', seg: 'is-pass' },
  closed: { glyph: '■', tone: 'idle', seg: '' },
}

/** A family's n/m merged: brain-kit's roll-up, else counted from its small ones (closed ones not counted). */
export function familyProgress(f: ReqFamily): { merged: number; total: number } {
  if (f.progress) return { merged: f.progress.merged, total: f.progress.total }
  const kids = f.children.filter((c) => c.state !== 'closed')
  return { merged: kids.filter((c) => c.state === 'merged').length, total: kids.length }
}

/** What blocks a small requirement: its dependencies not merged into the big one's branch yet, each with how far it is. */
export function blockersOf(f: ReqFamily): FamilyDep[] {
  return f.blocked_by.map((k) => f.depends_on.find((d) => d.key === k) ?? { key: k, unit: null, state: null, owner: null, merged: false, text: k })
}
/** 「等 PAY-2（api，alice 在做）合进大需求」 (no space after a closing bracket) */
export function blockText(d: FamilyDep): string {
  const t = d.text || d.key
  return `等 ${t}${/[）)]$/.test(t) ? '' : ' '}合进大需求`
}

/** n/m merged as segments (the board's 测试通过 cells): one per small requirement in filing order, its state's colour. */
function FamilySegs({ f }: { f: ReqFamily }) {
  const { merged, total } = familyProgress(f)
  const kids = f.children.filter((c) => c.state !== 'closed')
  const cells = kids.length ? kids.map((c) => ({ key: c.key, cls: CHILD_META[c.state]?.seg ?? '', title: `${c.key}${c.unit ? ` ${c.unit}` : ''}：${c.state_label}` }))
    : Array.from({ length: total }, (_, i) => ({ key: String(i), cls: i < merged ? 'is-pass' : '', title: '' }))
  return (
    <div className="br-fam-bar">
      <div className="kt-segs br-segs" role="img" aria-label={`小需求合并了 ${merged}/${total}`}>
        {cells.map((c) => <i key={c.key} className={c.cls} title={c.title || undefined} />)}
      </div>
      <b>{merged}/{total}</b>
    </div>
  )
}

/** A big requirement's small ones in short: key · unit · its state's glyph (not buttons: the card is the button). */
function Kids({ f }: { f: ReqFamily }) {
  const kids = f.children.filter((c) => c.state !== 'closed')
  return (
    <div className="br-fkids" data-testid="flow-kids">
      {kids.map((c) => {
        const m = CHILD_META[c.state] ?? CHILD_META.claimed
        return (
          <span key={c.key} className={`br-fkid tone-${m.tone}`} data-kid={c.key} data-state={c.state} title={`${c.key}${c.title ? ` ${c.title}` : ''}：${c.state_label}`}>
            <i aria-hidden="true">{m.glyph}</i><span className="kt-mono">{c.key}</span>{c.unit && <span className="br-fkid-unit">{c.unit}</span>}
          </span>
        )
      })}
    </div>
  )
}

function Card({ r, at, hl, onOpen, repoName }: { r: Requirement; at: number; hl: string | null; onOpen: (r: Requirement) => void; repoName?: string }) {
  const lane = laneOf(r)
  const f = r.family
  const live = lane === 'local' ? r.waits.who === 'agent' : lane === 'runner'
  const waits = lane === 'approve' || lane === 'answer'
  const free = lane === 'unclaimed'
  const child = f?.role === 'child' ? f : null
  const parent = f?.role === 'parent' ? f : null
  const blocks = child ? blockersOf(child) : []
  // what it waits on; a small one's line already naming what blocks it says its state instead (the blockers follow)
  let focus = r.waits.text || f?.state_label || r.state_label
  if (blocks.some((d) => focus.includes(d.key))) focus = child?.state_label || r.state_label
  const icon = lane === 'answer' ? 'question' : r.state === 'acceptance' || parent ? 'release' : child && r.mr ? 'merge' : 'req'
  return (
    <div className={`cto-kcard cto-pick${waits ? ' is-live is-wait' : live ? ' is-live is-agent' : ''}${free ? ' br-kfree' : ''}${hl === r.key ? ' is-hl' : ''}`} data-key={r.key} data-testid="flow-card"
      data-role={f?.role ?? undefined} role="button" tabIndex={0} title="打开它的需求看板" onClick={() => onOpen(r)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(r))}>
      <div className="cto-ktop">
        <span className={waits ? 'cto-gate' : ''}>{waits && <RoleIcon role={icon} size={13} />}<b className="kt-mono">{r.key}</b></span>
        <span>{ago(r.updated_at, at)}</span>
      </div>
      <div className="cto-ktitle" title={r.title}>{r.title}</div>
      {child && <div className="br-kfam" data-testid="flow-parent">{child.parent} 的小需求{child.unit ? ` · ${child.unit}` : ''}</div>}
      <div className="cto-kfocus br-kwait" title={r.waits.text}>{focus}</div>
      {child && child.depends_on.length > 0 && (
        <div className="br-kdeps" data-testid="flow-deps">
          依赖{child.depends_on.map((d) => <span key={d.key} className={d.merged ? 'is-merged' : undefined} title={d.text}>{d.merged ? '✔' : ''}{d.key}</span>)}
        </div>
      )}
      {blocks.map((d) => <div key={d.key} className="br-kblock" data-testid="flow-blocked">{blockText(d)}</div>)}
      {parent && (
        <div className="br-fam" data-testid="flow-family" title={parent.family_label || undefined}>
          <FamilySegs f={parent} />
          <Kids f={parent} />
        </div>
      )}
      <div className="cto-kmeta">{repoName ? `${repoName} · ` : ''}{r.owner ?? (free ? '还没人认领' : '—')}{r.stage && !free ? ` · ${r.stage}` : ''}{r.credits !== null ? ` · ${fmtCredits(r.credits)} credits` : ''}</div>
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
  const inLane = (l: Lane) => live.filter((r) => laneOf(r) === l).length
  const split = hasSplit(rows)
  const lanes = LANES.filter(([l]) => l !== 'unclaimed' || split)
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
        进行中 {live.length - inLane('unclaimed')} 个<span>·</span>等人批准 {inLane('approve')}<span>·</span>等人回答 {inLane('answer')}<span>·</span>AI 在本机做 {inLane('local')}<span>·</span>运行机在做 {inLane('runner')}
        {split && <><span>·</span>待认领 {inLane('unclaimed')}</>}
      </div>
      <div className="cto-kanban br-kanban" role="table" aria-label="需求流动看板" style={{ '--br-lanes': lanes.length } as React.CSSProperties}>
        <div />
        {COLS.map(([key, name, sub]) => (
          <div className="cto-kb-h" key={key}>
            <div><b>{name}</b><span className="cto-n">{count(key)}</span></div>
            <div className="cto-st">{sub}</div>
          </div>
        ))}
        {lanes.map(([lane, name, icon], i) => (
          <Row key={lane} lane={lane} name={name} icon={icon} cell={cell} at={at} hl={hl} onOpen={onOpen} repoName={many ? repoName : () => undefined}
            merged={i === 0 ? merged : null} />
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
      <div className={`cto-lane${wait ? ' is-wait' : ''}${lane === 'unclaimed' ? ' br-lane-free' : ''}`} data-lane={lane}><span className="br-lane-name"><RoleIcon role={icon} size={15} />{name}</span></div>
      {COLS.filter(([c]) => c !== '已合并').map(([c]) => {
        const list = cell(c, lane)
        return (
          <div key={c} className={`cto-cell${wait ? ' is-wait' : ''}`} data-col={c} data-lane={lane}>
            {list.length === 0 && c === '交给运行机' && lane === 'local' && <div className="cto-kempty">交给运行机以后就不在本机做了</div>}
            {list.length === 0 && c === '构建' && lane === 'unclaimed' && <div className="cto-kempty">小需求都有人认领了</div>}
            {list.slice(0, 2).map((r) => <Card key={`${r.repo}/${r.key}`} r={r} at={at} hl={hl} onOpen={onOpen} repoName={repoName(r.repo)} />)}
            {list.length > 2 && <div className="cto-kmore">+{list.length - 2} 个</div>}
          </div>
        )
      })}
      {merged && (
        <div className="cto-cell is-span br-merged-cell" data-col="已合并">
          {merged.length === 0 && <div className="cto-kempty">近 14 天还没有合并的</div>}
          {merged.slice(0, 5).map((r) => {
            const p = r.family?.role === 'parent' ? familyProgress(r.family) : null
            return (
              <button type="button" key={`${r.repo}/${r.key}`} data-key={r.key} className={`cto-kcard is-real${hl === r.key ? ' is-hl' : ''}`} title="打开它的需求看板（可以回放）" onClick={() => onOpen(r)}>
                <span className="cto-ktop"><b className="kt-mono">{r.key}</b><span>{ago(r.updated_at, at)}</span></span>
                <span className="cto-ktitle">{r.title}</span>
                <span className="cto-kmeta">{r.owner ?? '—'}{p ? ` · 小需求 ${p.merged}/${p.total}` : ''}{r.credits !== null ? ` · ${fmtCredits(r.credits)} credits` : ''}</span>
              </button>
            )
          })}
          {merged.length > 5 && <div className="cto-kmore">+{merged.length - 5} 个（见下方交付清单）</div>}
        </div>
      )}
    </>
  )
}
