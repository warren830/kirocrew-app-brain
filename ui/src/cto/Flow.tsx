/**
 * 需求流动: the kanban of what is in progress now (the sample's cto/Flow.tsx), one card a requirement. Columns are the
 * requirement's journey (需求 → 设计 → 构建 → 交给运行机 → 发布 · 验收 → 已合并); lanes are whose turn it is, read from
 * the backend's one judgment, `waits.who` (UI问题清单 #1): 轮到你, 等别人 (magenta: it waits for a person), AI 在本机做,
 * 运行机在跑. A card waiting on you says how long it has waited (`waits.since`) and has the one step to take
 * (`waits.do`, stepOf). Column names, lane names and 「+N 个」 filter the ledger (onCell). In a repo done only on this
 * machine the runner's column and lane fold to a narrow 「这次不需要」.
 */
import { RoleIcon } from '../board/RoleIcon'
import type { View } from '../nav'
import type { Requirement, WaitWho } from '../types'
import { ago, fmtCredits, fmtWaited } from '../format'
import { ACT, DO_NAME, WAIT_NAME, waitsOn } from '../vocab'

export type Col = '需求' | '设计' | '构建' | '交给运行机' | '发布验收' | '已合并'
export type Lane = 'you' | 'people' | 'agent' | 'runner'
export const COLS: [Col, string, string][] = [
  ['需求', '需求', '逆向工程 · 需求分析 · 用户故事'], ['设计', '设计', '应用设计 · 拆分单元 · 功能设计'], ['构建', '构建', '代码生成 · 构建测试'],
  ['交给运行机', '交给运行机', '交接 · 运行机接手'], ['发布验收', '发布 · 验收', '发布审批 · 产品验收'], ['已合并', '已合并', '近 14 天'],
]
/** id, name (the counters say the same word), icon, waits for a person */
export const LANES: [Lane, string, string, boolean][] = [
  ['you', '轮到你', 'person', true], ['people', '等别人', 'wait', true], ['agent', 'AI 在本机做', 'laptop', false], ['runner', '运行机在跑', 'runner', false],
]
export const LANE_NAME = Object.fromEntries(LANES.map(([id, name]) => [id, name])) as Record<Lane, string>
export const COL_NAME = Object.fromEntries(COLS.map(([id, name]) => [id, name])) as Record<Col, string>

const LANE_OF_WHO: Record<WaitWho, Lane | null> = {
  you: 'you', product: 'people', people: 'people', builder: 'people', agent: 'agent', runner: 'runner', bridge: 'runner', nobody: null,
}
const RUNNER_STATES = new Set(['handed_over', 'running', 'rejected', 'parked'])

/** The column of a requirement on its journey: its state (a hand-over, refused or not, is 交给运行机 whatever Lean's
 * stage), else its Lean stage (1–3 需求, 4–8 设计, 9–10 构建, 11 发布). */
export function colOf(r: Requirement): Col | null {
  if (r.state === 'closed') return null
  if (r.state === 'merged') return '已合并'
  if (r.state === 'acceptance') return '发布验收'
  const n = r.lean.stage_n ?? 0
  const runner = r.state === 'handed_over' || r.state === 'running' || r.state === 'rejected' || ((r.state === 'parked') && (r.mr !== null || r.run_ids.length > 0))
  if (runner && !r.local_only) return '交给运行机'
  if (n >= 11) return '发布验收'
  if (r.state === 'claimed' || n <= 3) return '需求'
  if (n <= 8) return '设计'
  return '构建'
}

/** Its lane: whose turn it is now (waits.who); nobody's turn goes where the work is. */
export function laneOf(r: Requirement): Lane {
  return LANE_OF_WHO[r.waits.who] ?? (RUNNER_STATES.has(r.state) ? 'runner' : 'agent')
}

/** The one step a person takes on a requirement that waits on them: the button's words and where it goes (a view of
 * this app, or the MR). null: it does not wait on you, or the backend did not say the step. */
export type Step = { label: string; view?: View; href?: string }
export function stepOf(r: Requirement): Step | null {
  const d = r.waits.do
  if (r.waits.who !== 'you' || !d || d === 'none' || d === 'watch') return null
  if (d === 'start') return { label: DO_NAME.start, view: { kind: 'new', repo: r.repo, key: r.key, title: r.title } }
  if (d === 'answer' && r.waits.where === 'mr' && r.mr?.url) return { label: ACT.answerOnMr, href: r.mr.url }
  if (d === 'write_back') return { label: DO_NAME.write_back, view: { kind: 'brain', repo: r.repo, reflect: r.key } }
  return { label: DO_NAME[d], view: { kind: 'board', repo: r.repo, key: r.key, from: 'overview', ...(d === 'accept' ? { focus: 'accept' as const } : {}) } }
}

/** 「已等 11 小时」 from waits.since, against the server's clock; '' when the backend does not know since when. */
export function waitedText(r: Requirement, at: number): string {
  const s = r.waits.since
  return typeof s === 'number' && Number.isFinite(s) ? `已等 ${fmtWaited(at - s)}` : ''
}

export function StepButton({ step, onGo, primary = true }: { step: Step; onGo: (v: View) => void; primary?: boolean }) {
  const cls = `kt-btn is-small${primary ? ' is-primary' : ''} br-step`
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  if (step.href) {
    return <a className={cls} href={step.href} target="_blank" rel="noopener noreferrer" onClick={stop}>{step.label} ↗</a>
  }
  return <button type="button" className={cls} onClick={(e) => { stop(e); if (step.view) onGo(step.view) }}>{step.label} ↗</button>
}

type Handlers = {
  onOpen: (r: Requirement) => void
  onGo: (v: View) => void
  /** filter the ledger to a column, a lane or one cell, and go there */
  onCell: (col?: Col, lane?: Lane) => void
}

function Card({ r, at, hl, repoName, h }: { r: Requirement; at: number; hl: string | null; repoName?: string; h: Handlers }) {
  const lane = laneOf(r)
  const wait = lane === 'you' || lane === 'people'
  const live = lane === 'agent' || lane === 'runner'
  const step = stepOf(r)
  const since = wait ? waitedText(r, at) : ''
  const when = since || (r.updated_at !== null ? ago(r.updated_at, at) : '')
  const owner = lane === 'people' && r.waits.who === 'people' ? (r.owner ? `等 ${r.owner}` : waitsOn('people')) : [r.owner, lane === 'people' ? waitsOn(r.waits.who) : ''].filter(Boolean).join(' · ')
  return (
    <div className={`cto-kcard cto-pick${wait ? ' is-live is-wait' : live ? ' is-live is-agent' : ''}${hl === r.key ? ' is-hl' : ''}`} data-key={r.key} data-testid="flow-card"
      role="button" tabIndex={0} title="打开它的需求看板" onClick={() => h.onOpen(r)} onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), h.onOpen(r))}>
      <div className="cto-ktop">
        <span className={wait ? 'cto-gate' : ''}>{wait && <RoleIcon role={lane === 'you' ? 'person' : 'wait'} size={13} />}<b className="kt-mono">{r.key}</b></span>
        {when && <span>{when}</span>}
      </div>
      <div className="cto-ktitle" title={r.title}>{r.title}</div>
      <div className="cto-kfocus br-kwait" title={r.waits.text}>{r.waits.text || r.state_label}</div>
      <div className="cto-kmeta">{[repoName, owner, r.credits !== null ? `${fmtCredits(r.credits)} credits` : ''].filter(Boolean).join(' · ')}</div>
      {step && <StepButton step={step} onGo={h.onGo} />}
    </div>
  )
}

const PER_CELL = 3

export function Flow({ rows, at, hl, onNew, repoName, localOnly = false, ...h }: {
  rows: Requirement[]
  at: number
  hl: string | null
  onNew?: () => void
  repoName: (id: string) => string | undefined
  /** every repo here is done only on this machine: the runner's column and lane are 「这次不需要」 */
  localOnly?: boolean
} & Handlers) {
  const live = rows.filter((r) => colOf(r) && colOf(r) !== '已合并')
  // a merge that still waits on you (回写 Brain) stays on the board however old it is
  const merged = rows.filter((r) => colOf(r) === '已合并' && ((r.updated_at ?? 0) >= at - 14 * 86400 || r.waits.who === 'you'))
    .sort((a, b) => Number(b.waits.who === 'you') - Number(a.waits.who === 'you'))
  const cell = (c: Col, l: Lane) => live.filter((r) => colOf(r) === c && laneOf(r) === l).sort((a, b) => (a.waits.since ?? Infinity) - (b.waits.since ?? Infinity) || (b.updated_at ?? 0) - (a.updated_at ?? 0))
  const count = (c: Col) => (c === '已合并' ? merged.length : live.filter((r) => colOf(r) === c).length)
  const inLane = (l: Lane) => live.filter((r) => laneOf(r) === l)
  const yours = inLane('you')
  const mergedYours = merged.filter((r) => laneOf(r) === 'you')
  const byDo = Object.entries(yours.reduce<Record<string, number>>((m, r) => {
    const w = r.waits.do ? WAIT_NAME[r.waits.do] : ''
    return w ? { ...m, [w]: (m[w] ?? 0) + 1 } : m
  }, {}))
  const longest = yours.map((r) => r.waits.since).filter((s): s is number => typeof s === 'number').sort((a, b) => a - b)[0]
  const many = new Set(rows.map((r) => r.repo)).size > 1
  const lanes = LANES.filter(([l]) => !(localOnly && l === 'runner'))
  const cols = COLS.filter(([c]) => c !== '已合并')
  const template = `136px ${cols.map(([c]) => (localOnly && c === '交给运行机' ? '96px' : 'minmax(0, 1fr)')).join(' ')} minmax(0, 1fr)`
  return (
    <section className="cto-card cto-flow" aria-label="需求流动" data-anchor="flow" data-testid="flow">
      <div className="cto-flow-head">
        <span className="cto-live" aria-hidden="true" />
        <h3>需求流动</h3>
        <span className="cto-dim">此刻 · 每 5 秒刷新 · 点卡片打开它的需求看板，点列名、行名看下方交付清单里的这些</span>
        <span className="cto-grow" />
        {onNew && <button type="button" className="kt-btn is-small cto-noprint" onClick={onNew}>开需求 ↗</button>}
      </div>
      <div className="cto-stats" data-testid="flow-stats">
        <b>进行中 {live.length} 个</b><span>·</span><b>轮到你 {yours.length}</b>{byDo.length > 0 && <small>（{byDo.map(([w, n]) => `${w} ${n}`).join(' · ')}）</small>}
        <span>·</span><b>等别人 {inLane('people').length}</b><span>·</span><b>AI 在本机做 {inLane('agent').length}</b>
        {!localOnly && <><span>·</span><b>运行机在跑 {inLane('runner').length}</b></>}
        {mergedYours.length > 0 && <><span>·</span><b>已合并、等你{DO_NAME.write_back} {mergedYours.length}</b></>}
      </div>
      {longest !== undefined && <div className="cto-dim" data-testid="flow-longest">轮到你的事，最久的已等 {fmtWaited(at - longest)}。</div>}
      <div className="cto-kanban br-kanban" role="table" aria-label="需求流动看板" style={{ gridTemplateColumns: template }}>
        <div />
        {COLS.map(([key, name, sub]) => (
          <div className={`cto-kb-h${localOnly && key === '交给运行机' ? ' is-off' : ''}`} key={key}>
            <button type="button" onClick={() => h.onCell(key)} title={`在下方交付清单里看「${name}」这一列`}>
              <div><b>{name}</b>{!(localOnly && key === '交给运行机') && <span className="cto-n">{count(key)}</span>}</div>
              <div className="cto-st">{localOnly && key === '交给运行机' ? '这次不需要' : sub}</div>
            </button>
          </div>
        ))}
        {lanes.map(([lane, name, icon, wait], i) => (
          <LaneRow key={lane} lane={lane} name={name} icon={icon} wait={wait} first={i === 0} span={lanes.length} cols={cols.map(([c]) => c)} cell={cell} at={at} hl={hl}
            repoName={many ? repoName : () => undefined} merged={i === 0 ? merged : null} localOnly={localOnly} h={h} />
        ))}
        {localOnly && (
          <div className="br-kband" data-testid="flow-runner-off">
            <span className="br-lane-name"><RoleIcon role="runner" size={15} />运行机在跑</span>
            <span>这次不需要：这个仓库只在本机做，不交给运行机</span>
          </div>
        )}
      </div>
    </section>
  )
}

function LaneRow({ lane, name, icon, wait, first, span, cols, cell, at, hl, repoName, merged, localOnly, h }: {
  lane: Lane; name: string; icon: string; wait: boolean; first: boolean; span: number; cols: Col[]; cell: (c: Col, l: Lane) => Requirement[]; at: number; hl: string | null
  repoName: (id: string) => string | undefined; merged: Requirement[] | null; localOnly: boolean; h: Handlers
}) {
  return (
    <>
      <div className={`cto-lane${wait ? ' is-wait' : ''}${lane === 'you' ? ' is-you' : ''}`}>
        <button type="button" className="br-lane-name" onClick={() => h.onCell(undefined, lane)} title={`在下方交付清单里看「${name}」的需求`}><RoleIcon role={icon} size={15} />{name}</button>
      </div>
      {cols.map((c) => {
        if (localOnly && c === '交给运行机') {
          return first ? <div key={c} className="cto-cell br-kcell-off" style={{ gridRow: `span ${span}` }} data-col={c}>这次不需要</div> : null
        }
        const list = cell(c, lane)
        return (
          <div key={c} className={`cto-cell${wait ? ' is-wait' : ''}`} data-col={c} data-lane={lane}>
            {list.length === 0 && lane === 'you' && <div className="cto-kempty">此刻没有</div>}
            {list.length === 0 && c === '交给运行机' && lane === 'agent' && <div className="cto-kempty">交给运行机以后就不在本机做了</div>}
            {list.slice(0, PER_CELL).map((r) => <Card key={`${r.repo}/${r.key}`} r={r} at={at} hl={hl} repoName={repoName(r.repo)} h={h} />)}
            {list.length > PER_CELL && <button type="button" className="cto-kmore cto-link" onClick={() => h.onCell(c, lane)}>+{list.length - PER_CELL} 个（见下方交付清单）</button>}
          </div>
        )
      })}
      {merged && (
        <div className="cto-cell is-span br-merged-cell" data-col="已合并" style={{ gridRow: `span ${span}` }}>
          {merged.length === 0 && <div className="cto-kempty">近 14 天还没有合并的</div>}
          {merged.slice(0, 5).map((r) => (laneOf(r) === 'you' ? <Card key={`${r.repo}/${r.key}`} r={r} at={at} hl={hl} repoName={repoName(r.repo)} h={h} /> : (
            <button type="button" key={`${r.repo}/${r.key}`} data-key={r.key} className={`cto-kcard is-real${hl === r.key ? ' is-hl' : ''}`} title="打开它的需求看板（可以回放）" onClick={() => h.onOpen(r)}>
              <span className="cto-ktop"><b className="kt-mono">{r.key}</b><span>{ago(r.updated_at, at)}</span></span>
              <span className="cto-ktitle">{r.title}</span>
              <span className="cto-kmeta">{[r.owner, r.credits !== null ? `${fmtCredits(r.credits)} credits` : ''].filter(Boolean).join(' · ')}</span>
            </button>
          )))}
          {merged.length > 5 && <button type="button" className="cto-kmore cto-link" onClick={() => h.onCell('已合并')}>+{merged.length - 5} 个（见下方交付清单）</button>}
        </div>
      )}
    </>
  )
}
