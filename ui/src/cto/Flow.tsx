/**
 * 需求流动: the kanban of what is in progress now (the sample's cto/Flow.tsx), one card a requirement. Columns are the
 * requirement's journey (需求 → 设计 → 构建 → 交给运行机 → 发布 · 验收 → 已合并); lanes are whose turn it is, read from
 * the backend's one judgment, `waits.who` (UI问题清单 #1): 轮到你, 等别人 (magenta: it waits for a person), AI 在本机做,
 * 运行机在跑. A card waiting on you says how long it has waited (`waits.since`) and has the one step to take
 * (`waits.do`, stepOf). Column names, lane names and 「+N 个」 filter the ledger (onCell). In a repo done only on this
 * machine the runner's column and lane fold to a narrow 「这次不需要」.
 * While a big requirement is split here a fifth lane, 待认领, holds the small ones nobody has.
 *
 * A big requirement split into small ones (brain split) is one card with its small ones in short (n/m merged as
 * segments, then each key · unit · state); a small one is a unit of its construction (构建), with its big one, its
 * dependencies and what blocks it; one merged into the big one's branch has no card of its own (its big one's says it).
 */
import { useNavigate } from '@kirocrew/app-sdk'
import { RoleIcon } from '../board/RoleIcon'
import type { View } from '../nav'
import type { ChildState, FamilyDep, ReqFamily, Requirement, WaitWho } from '../types'
import { ago, fmtCredits, fmtWaited } from '../format'
import { ACT, DO_NAME, PHRASE_BREAK, waitName, waitsOn } from '../vocab'
import { ReviewButton } from '../views/Question'

export type Col = '需求' | '设计' | '构建' | '交给运行机' | '发布验收' | '已合并'
export type Lane = 'you' | 'people' | 'agent' | 'runner' | 'unclaimed'
export const COLS: [Col, string, string][] = [
  ['需求', '需求', '逆向工程 · 需求分析 · 用户故事'], ['设计', '设计', '应用设计 · 拆分单元 · 功能设计'], ['构建', '构建', '代码生成 · 构建测试'],
  ['交给运行机', '交给运行机', '交接 · 运行机接手'], ['发布验收', '发布 · 验收', '发布审批 · 产品验收'], ['已合并', '已合并', '近 14 天'],
]
/** id, name (the counters say the same word), icon, waits for a person */
export const LANES: [Lane, string, string, boolean][] = [
  ['you', '轮到你', 'person', true], ['people', '等别人', 'wait', true], ['agent', 'AI 在本机做', 'laptop', false], ['runner', '运行机在跑', 'runner', false],
  ['unclaimed', '待认领', 'list', false],
]
export const LANE_NAME = Object.fromEntries(LANES.map(([id, name]) => [id, name])) as Record<Lane, string>
export const COL_NAME = Object.fromEntries(COLS.map(([id, name]) => [id, name])) as Record<Col, string>

const LANE_OF_WHO: Record<WaitWho, Lane | null> = {
  you: 'you', product: 'people', people: 'people', builder: 'people', agent: 'agent', runner: 'runner', bridge: 'runner', nobody: null,
}
const RUNNER_STATES = new Set(['handed_over', 'running', 'rejected', 'parked'])

/** The column of a requirement on its journey: its state (a hand-over, refused or not, is 交给运行机 whatever Lean's
 * stage), else its Lean stage (1–3 需求, 4–8 设计, 9–10 构建, 11 发布).
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
  if (runner && !r.local_only) return '交给运行机'
  if (n >= 11) return '发布验收'
  if (role === 'parent') return r.family?.family_state === 'ready_to_release' ? '发布验收' : '构建'
  if (r.state === 'claimed' || n <= 3) return '需求'
  if (n <= 8) return '设计'
  return '构建'
}

/** The listed repo a row belongs to: its own, or for a row on the runner the repo of its GitLab project (Requirement.home;
 * 'runner' when this machine does not list that project). */
export const homeOf = (r: Requirement): string => r.home ?? r.repo

/** Its lane: whose turn it is now (waits.who); nobody's turn goes where the work is. A small requirement nobody has is
 * 待认领, whoever could take it. */
export function laneOf(r: Requirement): Lane {
  if (r.state === 'unclaimed') return 'unclaimed'
  return LANE_OF_WHO[r.waits.who] ?? (RUNNER_STATES.has(r.state) ? 'runner' : 'agent')
}

/** The one step a person takes on a requirement that waits on them: the button's words and where it goes (a view of
 * this app, the MR, its idle session, or 开审查会话 right here). null: it does not wait on you, or the backend did not say the step. */
export type Step = { label: string; view?: View; href?: string; session?: string; review?: { repo: string; key: string; slot: string | null; worktree: string | null } }
export function stepOf(r: Requirement): Step | null {
  const d = r.waits.do
  if (r.waits.who !== 'you' || !d || d === 'none' || d === 'watch') return null
  if (r.waits.review) return { label: ACT.review, review: { repo: r.repo, key: r.key, slot: slotOf(r.session_url), worktree: r.worktree } }
  if ((d === 'reply' || d === 'tool') && r.session_url) return { label: DO_NAME[d], session: r.session_url }
  // a small one of a big requirement starts on its board's family card (from the big one's branch), not in 开需求
  if (d === 'start' && r.family?.role === 'child') return { label: DO_NAME.start, view: { kind: 'board', repo: r.repo, key: r.key, from: 'overview' } }
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

/** The session a KiroCrew chat URL opens (/chat?sid=<slot>). */
const slotOf = (url: string | null | undefined): string | null => (url ? new URLSearchParams(url.split('?')[1] ?? '').get('sid') : null)

export function StepButton({ step, onGo, primary = true }: { step: Step; onGo: (v: View) => void; primary?: boolean }) {
  const navigate = useNavigate()
  const cls = `kt-btn is-small${primary ? ' is-primary' : ''} br-step`
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  if (step.review) {
    const x = step.review
    return <span className="br-step br-review" onClick={stop} onKeyDown={stop}><ReviewButton repo={x.repo} reqKey={x.key} liveSlot={x.slot} worktree={x.worktree} /></span>
  }
  if (step.href) {
    return <a className={cls} href={step.href} target="_blank" rel="noopener noreferrer" onClick={stop} aria-label={`${step.label} ↗`}><StepWords text={step.label} /></a>
  }
  return <button type="button" className={cls} aria-label={`${step.label} ↗`} onClick={(e) => { stop(e); if (step.session) navigate(step.session); else if (step.view) onGo(step.view) }}><StepWords text={step.label} /></button>
}

/** A step's words and its ↗, broken on a narrow card only between their phrases (改好后 | 重新交接 ↗, where
 * PHRASE_BREAK says), never inside one. */
function StepWords({ text }: { text: string }) {
  const at = PHRASE_BREAK[text] ?? 0
  return <>{at > 0 && <span className="br-nw">{text.slice(0, at)}</span>}<span className="br-nw">{text.slice(at)} ↗</span></>
}

type Handlers = {
  onOpen: (r: Requirement) => void
  onGo: (v: View) => void
  /** filter the ledger to a column, a lane or one cell, and go there */
  onCell: (col?: Col, lane?: Lane) => void
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

function Card({ r, at, hl, repoName, h }: { r: Requirement; at: number; hl: string | null; repoName?: string; h: Handlers }) {
  const lane = laneOf(r)
  const f = r.family
  const wait = lane === 'you' || lane === 'people'
  const live = lane === 'agent' || lane === 'runner'
  const free = lane === 'unclaimed'
  const child = f?.role === 'child' ? f : null
  const parent = f?.role === 'parent' ? f : null
  const blocks = child ? blockersOf(child) : []
  const step = stepOf(r)
  const since = wait ? waitedText(r, at) : ''
  const when = since || (r.updated_at !== null ? ago(r.updated_at, at) : '')
  const owner = free ? '还没人认领'
    : lane === 'people' && r.waits.who === 'people' ? (r.owner ? `等 ${r.owner}` : waitsOn('people')) : [r.owner, lane === 'people' ? waitsOn(r.waits.who) : ''].filter(Boolean).join(' · ')
  // what it waits on; a small one's line already naming what blocks it says its state instead (the blockers follow)
  let focus = r.waits.text || f?.state_label || r.state_label
  if (blocks.some((d) => focus.includes(d.key))) focus = child?.state_label || r.state_label
  return (
    <div className={`cto-kcard cto-pick${wait ? ' is-live is-wait' : live ? ' is-live is-agent' : ''}${free ? ' br-kfree' : ''}${hl === r.key ? ' is-hl' : ''}`} data-key={r.key} data-testid="flow-card"
      data-role={f?.role ?? undefined} role="button" tabIndex={0} title="打开它的需求看板" onClick={() => h.onOpen(r)} onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), h.onOpen(r))}>
      <div className="cto-ktop">
        <span className={wait ? 'cto-gate' : ''}>{wait && <RoleIcon role={lane === 'you' ? 'person' : 'wait'} size={13} />}<b className="kt-mono">{r.key}</b></span>
        {when && <span>{when}</span>}
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
      <div className="cto-kmeta">{[repoName, owner, r.credits !== null ? `${fmtCredits(r.credits)} credits` : ''].filter(Boolean).join(' · ')}</div>
      {step && <StepButton step={step} onGo={h.onGo} />}
    </div>
  )
}

const PER_CELL = 3

export function Flow({ rows, at, hl, onNew, repoName, localOnly = false, repos = 1, ...h }: {
  rows: Requirement[]
  at: number
  hl: string | null
  onNew?: () => void
  repoName: (id: string) => string | undefined
  /** every repo here is done only on this machine: the runner's column and lane are 「这次不需要」 */
  localOnly?: boolean
  /** how many repos the board shows (the band says 这个仓库 or 这 N 个仓库) */
  repos?: number
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
    const w = waitName(r.waits)
    return w ? { ...m, [w]: (m[w] ?? 0) + 1 } : m
  }, {}))
  const longest = yours.map((r) => r.waits.since).filter((s): s is number => typeof s === 'number').sort((a, b) => a - b)[0]
  const split = hasSplit(rows)
  const many = new Set(rows.map(homeOf)).size > 1
  const lanes = LANES.filter(([l]) => !(localOnly && l === 'runner') && (l !== 'unclaimed' || split))
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
        <b>进行中 {live.length - inLane('unclaimed').length} 个</b><span>·</span><b>轮到你 {yours.length}</b>{byDo.length > 0 && <small>（{byDo.map(([w, n]) => `${w} ${n}`).join(' · ')}）</small>}
        <span>·</span><b>等别人 {inLane('people').length}</b><span>·</span><b>AI 在本机做 {inLane('agent').length}</b>
        {!localOnly && <><span>·</span><b>运行机在跑 {inLane('runner').length}</b></>}
        {split && <><span>·</span><b>待认领 {inLane('unclaimed').length}</b></>}
        {mergedYours.length > 0 && <><span>·</span><b>已合并、等你{DO_NAME.write_back} {mergedYours.length}</b></>}
      </div>
      {longest !== undefined && <div className="cto-dim" data-testid="flow-longest">轮到你的事，最久的已等 {fmtWaited(at - longest)}。</div>}
      <div className="cto-kanban br-kanban" role="table" aria-label="需求流动看板" style={{ gridTemplateColumns: template }}>
        <div />
        {COLS.map(([key, name, sub]) => (
          <div className={`cto-kb-h${localOnly && key === '交给运行机' ? ' is-off' : ''}`} key={key}>
            <button type="button" onClick={() => h.onCell(key)} title={`在下方交付清单里看「${name}」这一列`}>
              <div><b>{name}</b>{!(localOnly && key === '交给运行机') && <span className="cto-n">{count(key)}</span>}</div>
              <div className="cto-st">{localOnly && key === '交给运行机' ? '这次不需要' : sub.split(' · ').map((x, i) => <span key={x}>{i > 0 && ' · '}<span className="br-nw">{x}</span></span>)}</div>
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
            <span>这次不需要：{repos > 1 ? `这 ${repos} 个仓库都只在本机做` : '这个仓库只在本机做'}，不交给运行机</span>
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
      <div className={`cto-lane${wait ? ' is-wait' : ''}${lane === 'you' ? ' is-you' : ''}${lane === 'unclaimed' ? ' br-lane-free' : ''}`}>
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
            {list.length === 0 && c === '构建' && lane === 'unclaimed' && <div className="cto-kempty">小需求都有人认领了</div>}
            {list.slice(0, PER_CELL).map((r) => <Card key={`${r.repo}/${r.key}`} r={r} at={at} hl={hl} repoName={repoName(homeOf(r))} h={h} />)}
            {list.length > PER_CELL && <button type="button" className="cto-kmore cto-link" onClick={() => h.onCell(c, lane)}>+{list.length - PER_CELL} 个（见下方交付清单）</button>}
          </div>
        )
      })}
      {merged && (
        <div className="cto-cell is-span br-merged-cell" data-col="已合并" style={{ gridRow: `span ${span}` }}>
          {merged.length === 0 && <div className="cto-kempty">近 14 天还没有合并的</div>}
          {merged.slice(0, 5).map((r) => {
            const p = r.family?.role === 'parent' ? familyProgress(r.family) : null
            return laneOf(r) === 'you' ? <Card key={`${r.repo}/${r.key}`} r={r} at={at} hl={hl} repoName={repoName(homeOf(r))} h={h} /> : (
              <button type="button" key={`${r.repo}/${r.key}`} data-key={r.key} className={`cto-kcard is-real${hl === r.key ? ' is-hl' : ''}`} title="打开它的需求看板（可以回放）" onClick={() => h.onOpen(r)}>
                <span className="cto-ktop"><b className="kt-mono">{r.key}</b><span>{ago(r.updated_at, at)}</span></span>
                <span className="cto-ktitle">{r.title}</span>
                <span className="cto-kmeta">{[r.owner, p ? `小需求 ${p.merged}/${p.total}` : '', r.credits !== null ? `${fmtCredits(r.credits)} credits` : ''].filter(Boolean).join(' · ')}</span>
              </button>
            )
          })}
          {merged.length > 5 && <button type="button" className="cto-kmore cto-link" onClick={() => h.onCell('已合并')}>+{merged.length - 5} 个（见下方交付清单）</button>}
        </div>
      )}
    </>
  )
}
