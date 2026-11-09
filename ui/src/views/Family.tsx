/**
 * 大需求拆成小需求 (brain-kit's split, docs/安装和使用.md §4.7): the family panel of 需求详情 and 需求看板.
 *
 * - a big requirement split into small ones (role parent): 「拆成的小需求」 with the roll-up (已合并 n/m, 待认领, 认领了,
 *   在做, 已关闭), the family's state and whether it is released, and each small one as a lane in the board's lane look:
 *   its key, unit, state, owner, what it depends on and what blocks it; a lane opens that small one's 需求看板. On the
 *   board also the family's numbers from its trace (ReqBoard.rollup), what nobody knows said so.
 * - a small one (role child): 「PAY-1 的小需求 · 单元 api」 with its big one (its 需求看板), its paths and contracts, its
 *   dependencies and how far each is, what blocks it.
 * - a big one not split yet (role big): what comes next, in one line.
 *
 * The actions come from family.acts (null: not offered; ok false: off, its why beside it): 认领, 放弃认领 (after a
 * confirm), 开工 and 「在 <DEP> 的分支上先做」 (only when brain-kit allows it), 同步, and 拆成小需求 — first a preview that
 * writes nothing, then 「确定拆」. Each answer shows its words, its problem as a check row, brain-kit's output folded,
 * and after a start the session. The answers live in useFamily (the page's): a lane or a card that moves, or a role
 * that changes after a split, keeps them. In a replay nothing is offered.
 */
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction } from '../api'
import { fmtCredits } from '../format'
import { useLatest } from '../hooks'
import type {
  CheckRow, ChildStartBody, ChildStartResult, ChildState, ClaimBody, ClaimResult, FamilyAct, FamilyChild, FamilyDep, FamilyNumbers,
  FamilyProgress, FamilyRollup, FamilyState, ReqFamily, SplitAction, SplitResult, SyncResult,
} from '../types'
import { CheckRows, RoleIcon } from '../ui'
import type { ViewProps } from './props'

/** what 开需求 says of 「大需求：先拆成小需求」, and a big one not split yet of what comes next */
export const BIG_HINT = 'Lean 照常做需求和设计，设计里拆单元（unit-of-work.md）；你批 DESIGN，就是批了这个拆法；批完在需求看板上点「拆成小需求」。'

/** A small one's state: its tone (the board's), its drawing, the glyph in its pill, its cell in the roll-up. */
export const CHILD_META: Record<ChildState, { tone: string; icon: string; glyph: string; seg: string }> = {
  unclaimed: { tone: 'idle', icon: 'person', glyph: '◌', seg: '' },
  claimed: { tone: 'queue', icon: 'person', glyph: '○', seg: 'is-claimed' },
  in_progress: { tone: 'run', icon: 'laptop', glyph: '●', seg: 'is-run' },
  merged: { tone: 'ok', icon: 'merge', glyph: '✔', seg: 'is-pass' },
  closed: { tone: 'idle', icon: 'blocked', glyph: '■', seg: '' },
}
const FAMILY_TONE: Record<FamilyState, string> = { in_progress: 'run', ready_to_release: 'approve', done: 'ok', closed: 'idle' }
/** brain split's kinds: new and same are fine, the ones that need a word with whoever has it are warn */
const KIND_TONE: Record<string, string> = {
  new: 'ok', same: 'idle', update: 'info', changed: 'warn', close: 'bad', removed: 'bad', close_duplicate: 'warn', duplicate: 'warn', raced: 'warn',
}
const SYNC_WORD: Record<SyncResult['result'], string> = { merged: '合进来了', up_to_date: '已经是最新的', conflicts: '有冲突', refused: '没同步' }

// ---------------------------------------------------------------- the actions (the page holds them)

type Did = 'claim' | 'release' | 'start' | 'sync'

export interface FamilyCtl {
  claim: { busy: boolean; error: string; result: ClaimResult | null }
  start: { busy: boolean; error: string; result: ChildStartResult | null }
  sync: { busy: boolean; error: string; result: SyncResult | null }
  preview: { busy: boolean; error: string; result: SplitResult | null }
  apply: { busy: boolean; error: string; result: SplitResult | null }
  /** the last child action: its answer is the one shown */
  last: Did | null
  busy: boolean
  /** 放弃认领 waits for its confirm */
  asking: boolean
  setAsking: (on: boolean) => void
  /** the split box is open (its preview, its confirm, its answer) */
  splitOpen: boolean
  trust: boolean
  setTrust: (on: boolean) => void
  doClaim: () => Promise<void>
  doRelease: () => Promise<void>
  doStart: (on?: string) => Promise<void>
  doSync: () => Promise<void>
  openSplit: () => Promise<void>
  applySplit: () => Promise<void>
  closeSplit: () => void
}

/**
 * The family actions of one requirement and their answers: POST claim / start / sync / split under
 * /requirements/{repo}/{key}. *onChanged* runs after every answer (the page reads itself again). A start opens the
 * small one's brain-dev session.
 */
export function useFamily(repo: string, key: string, onChanged: () => void): FamilyCtl {
  const api = useAppApi()
  const changed = useLatest(onChanged)
  const claim = useAction((b: ClaimBody) => api.post<ClaimResult>(paths.claim(repo, key), b))
  const start = useAction((b: ChildStartBody) => api.post<ChildStartResult>(paths.childStart(repo, key), b))
  const sync = useAction(() => api.post<SyncResult>(paths.sync(repo, key), {}))
  const preview = useAction(() => api.post<SplitResult>(paths.split(repo, key), { apply: false }))
  const apply = useAction(() => api.post<SplitResult>(paths.split(repo, key), { apply: true }))
  const [last, setLast] = useState<Did | null>(null)
  const [asking, setAsking] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [trust, setTrust] = useState(true)
  const resets = useLatest([claim.reset, start.reset, sync.reset, preview.reset, apply.reset])
  // another requirement in the same page: nothing of this one's stays
  useEffect(() => {
    for (const r of resets.current) r()
    setLast(null)
    setAsking(false)
    setSplitOpen(false)
  }, [repo, key, resets])
  const after = useCallback((got: unknown) => { if (got) changed.current() }, [changed])
  return {
    claim, start, sync, preview, apply, last, asking, setAsking, splitOpen, trust, setTrust,
    busy: claim.busy || start.busy || sync.busy || preview.busy || apply.busy,
    doClaim: async () => { setLast('claim'); after(await claim.run({})) },
    doRelease: async () => { setLast('release'); setAsking(false); after(await claim.run({ release: true })) },
    doStart: async (on?: string) => { setLast('start'); after(await start.run({ ...(on ? { on } : {}), open_session: true, trust })) },
    doSync: async () => { setLast('sync'); after(await sync.run()) },
    openSplit: async () => {
      apply.reset()
      setSplitOpen(true)
      await preview.run()
    },
    applySplit: async () => {
      const r = await apply.run()
      if (r?.ok) changed.current()
    },
    closeSplit: () => {
      setSplitOpen(false)
      preview.reset()
      apply.reset()
    },
  }
}

// ---------------------------------------------------------------- the panel

export interface FamilyPanelProps {
  f: ReqFamily
  repo: string
  reqKey: string
  ctl: FamilyCtl
  /** board: the board's card (kt-card); detail: 需求详情's (cto-card) */
  look: 'board' | 'detail'
  go: ViewProps['go']
  /** the family's numbers from its trace (the board's) */
  rollup?: FamilyRollup | null
  /** a replay: nothing can be done */
  quiet?: boolean
}

export function FamilyPanel({ f, repo, reqKey, ctl, look, go, rollup = null, quiet = false }: FamilyPanelProps) {
  const toBoard = (key: string) => go({ kind: 'board', repo, key, ...(look === 'detail' ? { from: 'item' as const } : {}) })
  const label = f.role === 'parent' ? '拆成的小需求' : f.role === 'child' ? `${f.parent} 的小需求` : '大需求'
  return (
    <section className={`${look === 'board' ? 'kt-card' : 'cto-card'} br-fam is-${f.role}`} aria-label={label} data-testid="fam-panel" data-role={f.role}>
      <style>{FAMILY_CSS}</style>
      {f.role === 'parent' && <ParentPart f={f} look={look} rollup={look === 'board' ? rollup : null} onOpen={toBoard} split={quiet ? null : f.acts.split} ctl={ctl} />}
      {f.role === 'child' && <ChildPart f={f} look={look} onParent={() => toBoard(f.parent)} />}
      {f.role === 'big' && <BigPart f={f} look={look} split={quiet ? null : f.acts.split} ctl={ctl} />}
      {!quiet && f.role === 'child' && <ChildActs f={f} ctl={ctl} reqKey={reqKey} onBoard={look === 'detail' ? toBoard : undefined} />}
      {!quiet && ctl.splitOpen && <SplitBox ctl={ctl} />}
      {f.source === 'local' && <p className="kt-dim br-small br-fam-local">brain-kit 还没回话：按本机上次拉到的认领显示。</p>}
    </section>
  )
}

function Head({ look, title, children }: { look: 'board' | 'detail'; title: ReactNode; children?: ReactNode }) {
  return look === 'board'
    ? <header className="kt-card-head br-fam-head"><h2>{title}</h2>{children}</header>
    : <div className="cto-chart-head br-fam-head"><h3>{title}</h3>{children}</div>
}

/** 已合并 n/m and the counts: brain-kit's roll-up, else counted from the small ones (before brain-kit answered). */
function progressOf(f: ReqFamily): FamilyProgress {
  if (f.progress) return f.progress
  const n = (s: ChildState) => f.children.filter((c) => c.state === s).length
  const closed = n('closed')
  return { merged: n('merged'), total: f.children.length - closed, unclaimed: n('unclaimed'), claimed: n('claimed'), in_progress: n('in_progress'), closed, text: '' }
}

function ParentPart({ f, look, rollup, onOpen, split, ctl }: {
  f: ReqFamily
  look: 'board' | 'detail'
  rollup: FamilyRollup | null
  onOpen: (key: string) => void
  split: FamilyAct | null
  ctl: FamilyCtl
}) {
  const p = progressOf(f)
  const counts: { n: number; label: string; tone: string }[] = [
    { n: p.unclaimed, label: '待认领', tone: 'idle' },
    { n: p.claimed, label: '认领了', tone: 'queue' },
    { n: p.in_progress, label: '在做', tone: 'run' },
    { n: p.closed, label: '已关闭', tone: 'idle' },
  ]
  const open = f.children.filter((c) => c.state !== 'closed')
  return (
    <>
      <Head look={look} title="拆成的小需求">
        {f.family_label && <span className={`kt-pill tone-${f.family_state ? FAMILY_TONE[f.family_state] : 'info'}`} data-testid="fam-label">{f.family_label}</span>}
        <span className={`kt-pill tone-${f.released ? 'ok' : 'idle'}`}>{f.released ? 'RELEASE 批了' : '还没发布'}</span>
        {f.branch && <span className="kt-dim br-small">合回 <code>{f.branch}</code></span>}
        {split && !ctl.splitOpen && (
          <span className="br-fam-head-acts">
            <SplitButton act={split} ctl={ctl} primary={false} hint="拆法变了、DESIGN 又批了：再拆一次" />
          </span>
        )}
      </Head>
      <div className="br-fam-sum" role="group" aria-label="小需求的进度">
        <div className="br-fam-merged" data-testid="fam-merged" aria-label={`已合并 ${p.merged}/${p.total}`} title={p.text || undefined}>
          <div className="kt-kpi-label">已合并</div>
          <div className="kt-kpi-value"><span className={`kt-kpi-big${p.total > 0 && p.merged === p.total ? ' tone-ok' : ''}`}>{p.merged}</span><span className="kt-kpi-of">/{p.total}</span></div>
          <div className="kt-segs" aria-hidden="true">
            {open.map((c) => <i key={c.key} className={CHILD_META[c.state].seg} title={`${c.key}：${c.state_label}`} />)}
          </div>
        </div>
        <ul className="br-fam-counts">
          {counts.map((c) => (
            <li key={c.label} className={`tone-${c.tone}${c.n ? '' : ' is-zero'}`}><b>{c.n}</b><small>{c.label}</small></li>
          ))}
        </ul>
      </div>
      {f.children.length === 0 ? <p className="kt-dim br-small">还没有登记小需求。</p> : (
        <div className="br-fam-lanes" role="list" aria-label="小需求">
          {f.children.map((c) => (
            <ChildLane key={c.key} c={c} numbers={rollup ? rollup.children.find((x) => x.key === c.key)?.numbers ?? null : undefined} onOpen={() => onOpen(c.key)} />
          ))}
        </div>
      )}
      {rollup && <Rollup r={rollup} />}
    </>
  )
}

/** One small one as a lane (the board's lane look): who it is and its state; its title, what it depends on and what
 * blocks it; who has it, and (on the board) its numbers from the trace. The lane opens its 需求看板. */
function ChildLane({ c, numbers, onOpen }: { c: FamilyChild; numbers?: FamilyNumbers | null; onOpen: () => void }) {
  const m = CHILD_META[c.state] ?? CHILD_META.unclaimed
  const live = c.state !== 'merged' && c.state !== 'closed'
  return (
    <article role="listitem" className={`kt-lane br-fam-lane is-${c.state} tone-${m.tone}`} data-testid="fam-child" data-key={c.key} data-state={c.state}
      aria-label={`${c.key}：${c.state_label}`} onClick={onOpen}>
      <div className="kt-lane-id">
        <span className="kt-avatar" aria-hidden="true"><RoleIcon role={m.icon} size={22} /></span>
        <div className="kt-lane-who">
          <div className="kt-lane-name">
            <button type="button" className="br-fam-key" title="看它的需求看板" onClick={(e) => { e.stopPropagation(); onOpen() }}>{c.key}</button>
          </div>
          <div className="kt-lane-doing">{c.unit ? `单元 ${c.unit}` : '没有单元名'}</div>
          <div className="kt-lane-tag"><span className={`kt-pill tone-${m.tone}`}><i aria-hidden="true">{m.glyph}</i>{c.state_label}</span></div>
        </div>
      </div>
      <div className="kt-lane-live">
        <div className="br-fam-title">{c.title || '—'}</div>
        {c.depends_on.length > 0 ? (
          <div className="br-fam-deps" aria-label="依赖">
            <span className="kt-dim">依赖</span>
            {c.depends_on.map((k) => {
              const wait = c.blocked_by.includes(k)
              return <span key={k} className={`kt-pill tone-${wait ? 'warn' : 'ok'}`} title={wait ? '还没合进大需求的分支' : '合进大需求的分支了'}><i aria-hidden="true">{wait ? '⏸' : '✔'}</i>{k}</span>
            })}
          </div>
        ) : <div className="kt-dim br-small">不依赖别的小需求</div>}
        {live && c.blocked_by.length > 0 && (
          <div className="kt-situation tone-warn" data-testid="fam-blocked"><strong>等依赖：</strong><span className="kt-summary">{c.blocked_by.join('、')} 还没合进大需求的分支</span></div>
        )}
      </div>
      <div className="kt-lane-work">
        <p className="br-fam-owner"><RoleIcon role="person" size={14} />{c.owner ? <b>{c.owner}</b> : <span className="kt-dim">没人认领</span>}</p>
        {numbers !== undefined && <LaneNumbers n={numbers} />}
      </div>
    </article>
  )
}

const sum = (...xs: (number | null)[]) => (xs.every((x) => x === null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0))
const num = (x: number | null) => (x === null ? '—' : String(x))

function LaneNumbers({ n }: { n: FamilyNumbers | null }) {
  if (!n) return <p className="kt-dim kt-nothing">trace 里还没有它的数</p>
  return (
    <ul className="kt-tools br-fam-lanenums" aria-label="它的数">
      <li>提交 <b>{num(sum(n.commits_bot, n.commits_person))}</b></li>
      <li>verify <b>{num(n.verify_rounds)}</b> 轮</li>
      <li>人介入 <b>{num(sum(n.human_at_judgment, n.human_outside_judgment))}</b></li>
      <li><b>{fmtCredits(n.credits)}</b> credits</li>
    </ul>
  )
}

/** The family's numbers from its trace: itself and every small one added up, its own beside them; what nobody knows. */
function Rollup({ r }: { r: FamilyRollup }) {
  const t = r.total
  const o = r.own
  const cells: { label: string; value: string; sub: string; own: string; warn?: boolean }[] = [
    {
      label: '提交', value: num(t ? sum(t.commits_bot, t.commits_person) : null), sub: `AI ${num(t?.commits_bot ?? null)} · 人 ${num(t?.commits_person ?? null)}`,
      own: num(o ? sum(o.commits_bot, o.commits_person) : null),
    },
    { label: 'verify', value: num(t?.verify_rounds ?? null), sub: `轮 · 没过 ${num(t?.verify_failed ?? null)}`, own: num(o?.verify_rounds ?? null) },
    {
      label: '人介入', value: num(t ? sum(t.human_at_judgment, t.human_outside_judgment) : null),
      sub: `判断点上 ${num(t?.human_at_judgment ?? null)} · 判断点之外 ${num(t?.human_outside_judgment ?? null)}`,
      own: num(o ? sum(o.human_at_judgment, o.human_outside_judgment) : null), warn: (t?.human_outside_judgment ?? 0) > 0,
    },
    { label: 'credits', value: fmtCredits(t?.credits ?? null), sub: 'KiroCrew 只报 credits', own: fmtCredits(o?.credits ?? null) },
  ]
  return (
    <div className="br-fam-roll" role="group" aria-label="整个大需求加起来" data-testid="fam-rollup">
      <div className="br-fam-roll-head"><b>整个大需求加起来</b><span className="kt-dim br-small">来自 brain-kit trace：大需求自己，加上每个小需求</span></div>
      <ul className="br-fam-nums">
        {cells.map((c) => (
          <li key={c.label} className={`br-fam-num${c.warn ? ' is-warn' : ''}`} aria-label={`${c.label} ${c.value}`}>
            <small>{c.label}</small>
            <b>{c.value}</b>
            <span>{c.sub}</span>
            <span className="kt-dim">大需求自己 {c.own}</span>
          </li>
        ))}
      </ul>
      {r.unknown.length > 0 && <p className="br-small br-fam-unknown" data-testid="fam-unknown">不知道的（没有记录，不按 0 算）：{r.unknown.join('、')}</p>}
    </div>
  )
}

function ChildPart({ f, look, onParent }: { f: ReqFamily; look: 'board' | 'detail'; onParent: () => void }) {
  const m = f.state ? CHILD_META[f.state] : CHILD_META.unclaimed
  const live = f.state !== 'merged' && f.state !== 'closed'
  const title = (
    <>
      <button type="button" className="br-link br-fam-up" title={`大需求 ${f.parent} 的需求看板`} onClick={onParent}>{f.parent}</button>
      {' 的小需求'}{f.unit ? ` · 单元 ${f.unit}` : ''}
    </>
  )
  return (
    <>
      <Head look={look} title={title}>
        <span className={`kt-pill tone-${m.tone}`} data-testid="fam-state"><i aria-hidden="true">{m.glyph}</i>{f.state_label}</span>
        <span className="br-fam-owner"><RoleIcon role="person" size={14} />{f.owner ? <b>{f.owner}</b> : <span className="kt-dim">没人认领</span>}</span>
        {f.parent_title && <span className="kt-dim br-small">大需求：{f.parent_title}</span>}
      </Head>
      {live && f.blocked_by.length > 0 && (
        <div className="kt-situation tone-warn br-fam-blockline" data-testid="fam-blocked">
          <strong>挡着它：</strong>
          <span className="kt-summary">{f.blocked_by.join('、')} 还没合进大需求的分支{f.branch ? <> <code>{f.branch}</code></> : ''}。等它合并，或者在它的分支上先做。</span>
        </div>
      )}
      <dl className="br-fam-facts">
        <div><dt>依赖</dt><dd>{f.depends_on.length ? <DepList deps={f.depends_on} /> : <span className="kt-dim">不依赖别的小需求</span>}</dd></div>
        <div><dt>路径</dt><dd className="br-fam-chips">{f.paths.length ? f.paths.map((p) => <code key={p}>{p}</code>) : <span className="kt-dim">—</span>}</dd></div>
        <div><dt>契约</dt><dd className="br-fam-chips">{f.contracts.length ? f.contracts.map((p) => <code key={p}>{p}</code>) : <span className="kt-dim">没有</span>}</dd></div>
        {f.branch && <div><dt>大需求的分支</dt><dd><code>{f.branch}</code><span className="kt-dim br-small">从这里开工，MR 合回这里</span></dd></div>}
      </dl>
    </>
  )
}

/** A small one's dependencies, each with how far it is (brain-kit's line). */
export function DepList({ deps }: { deps: FamilyDep[] }) {
  return (
    <ul className="br-fam-deplist" aria-label="依赖">
      {deps.map((d) => (
        <li key={d.key} data-testid="fam-dep" data-merged={d.merged ? 'true' : 'false'}>
          <span className={`kt-pill tone-${d.merged ? 'ok' : 'warn'}`}><i aria-hidden="true">{d.merged ? '✔' : '⏸'}</i>{d.merged ? '合进来了' : '还没合'}</span>
          <span>{d.text || d.key}</span>
        </li>
      ))}
    </ul>
  )
}

function BigPart({ f, look, split, ctl }: { f: ReqFamily; look: 'board' | 'detail'; split: FamilyAct | null; ctl: FamilyCtl }) {
  return (
    <>
      <Head look={look} title="大需求：还没拆成小需求">
        {f.family_label && <span className="kt-pill tone-info">{f.family_label}</span>}
      </Head>
      <p className="br-fam-next" data-testid="fam-next"><RoleIcon role="scope" size={16} /><span><b>下一步：</b>{BIG_HINT}</span></p>
      {split && !ctl.splitOpen && <div className="br-fam-acts"><div className="br-fam-actrow"><SplitButton act={split} ctl={ctl} /></div></div>}
    </>
  )
}

function SplitButton({ act, ctl, hint, primary = true }: { act: FamilyAct; ctl: FamilyCtl; hint?: string; primary?: boolean }) {
  return (
    <Act act={act} label="拆成小需求" icon="scope" primary={primary} busy={ctl.busy} pending={ctl.preview.busy ? '正在看…' : undefined}
      onClick={() => void ctl.openSplit()} hint={hint ?? '先看会拆成什么，什么都不写'} />
  )
}

// ---------------------------------------------------------------- the buttons and their answers

/** One action: off with its why beside it (and as its description), or on with a short hint. */
function Act({ act, label, icon, primary = false, danger = false, busy = false, pending, onClick, hint }: {
  act: FamilyAct | null
  label: string
  icon?: string
  primary?: boolean
  danger?: boolean
  busy?: boolean
  /** this one is on its way: its label says so */
  pending?: string
  onClick?: () => void
  hint?: string
}) {
  const id = useId()
  if (!act) return null
  const why = !act.ok && act.why
  return (
    <span className="br-fam-act">
      <button type="button" className={`kt-btn${primary && act.ok ? ' is-primary' : ''}${danger ? ' is-danger' : ''}`} disabled={!act.ok || busy}
        aria-describedby={why ? id : undefined} onClick={onClick}>
        {icon && <RoleIcon role={icon} size={15} />}{pending ?? label}
      </button>
      {why ? <span className="br-fam-why" id={id}><i aria-hidden="true">✋</i>{act.why}</span> : hint ? <span className="kt-dim br-small">{hint}</span> : null}
    </span>
  )
}

const ON: FamilyAct = { ok: true, why: '' }

function ChildActs({ f, ctl, reqKey, onBoard }: { f: ReqFamily; ctl: FamilyCtl; reqKey: string; onBoard?: (key: string) => void }) {
  const a = f.acts
  const navigate = useNavigate()
  if (!a.claim && !a.release && !a.start && !a.start_on && !a.sync && !ctl.last) return null
  const busy = ctl.busy
  const doing = (what: Did, word: string) => (ctl.last === what && busy ? word : undefined)
  const starts = !!(a.start || a.start_on)
  return (
    <div className="br-fam-acts" role="group" aria-label="小需求的操作">
      <div className="br-fam-actrow">
        <Act act={a.claim} label="认领" icon="person" primary busy={busy} pending={doing('claim', '正在认领…')} onClick={() => void ctl.doClaim()} hint="先推上去的算" />
        <Act act={a.start} label="开工" icon="deploy" primary={!a.claim} busy={busy} pending={doing('start', '正在开工…')} onClick={() => void ctl.doStart()}
          hint="从大需求的分支开，放在它自己的工作目录" />
        {a.start_on && (
          <Act act={ON} label={`在 ${a.start_on} 的分支上先做`} icon="merge" busy={busy} onClick={() => void ctl.doStart(a.start_on as string)}
            hint={`${a.start_on} 合并之前，你的 MR 里也带着它的提交`} />
        )}
        <Act act={a.sync} label="同步" icon="merge" busy={busy} pending={doing('sync', '正在同步…')} onClick={() => void ctl.doSync()} hint="把大需求的分支合进来" />
        {a.release && !ctl.asking && (
          <Act act={a.release} label="放弃认领" danger busy={busy} pending={doing('release', '正在放回…')} onClick={() => ctl.setAsking(true)} />
        )}
      </div>
      {a.release && ctl.asking && (
        <div className="br-confirm is-danger" role="group" aria-label="确认放弃认领">
          <p>放回去以后，{reqKey} 又是待认领，谁都能认领。</p>
          <div className="br-row">
            <button type="button" className="kt-btn is-danger is-solid" disabled={busy} onClick={() => void ctl.doRelease()}>确定放弃</button>
            <button type="button" className="kt-btn" onClick={() => ctl.setAsking(false)}>取消</button>
          </div>
        </div>
      )}
      {starts && (
        <label className="br-check br-small">
          <input type="checkbox" checked={ctl.trust} onChange={(e) => ctl.setTrust(e.target.checked)} />
          <span>开工后的 brain-dev 会话：工具调用不用逐个批准</span>
        </label>
      )}
      {(ctl.last === 'claim' || ctl.last === 'release') && ctl.claim.result && <ClaimOut r={ctl.claim.result} />}
      {ctl.last === 'start' && ctl.start.result && (
        <ChildStartOut r={ctl.start.result} onOpen={navigate} onBoard={onBoard} onOn={a.start_on ? undefined : (dep) => void ctl.doStart(dep)} busy={busy} />
      )}
      {ctl.last === 'sync' && ctl.sync.result && <SyncOut r={ctl.sync.result} />}
      {ctl.last && <Err text={ctl.last === 'start' ? ctl.start.error : ctl.last === 'sync' ? ctl.sync.error : ctl.claim.error} />}
    </div>
  )
}

function Err({ text }: { text: string }) {
  return text ? <p className="br-error" role="alert">{text}</p> : null
}

/** brain-kit's output, folded (open when nothing else says why it did not work). */
function Output({ text, what, open = false }: { text: string; what: string; open?: boolean }) {
  if (!text) return null
  return (
    <details className="br-raw br-fam-raw" open={open}>
      <summary>{what} 的输出</summary>
      <pre>{text}</pre>
    </details>
  )
}

/** The answer's sentence is its problem row's own (brain-kit's refusal said once): the row alone says it. */
const sameAs = (r: { text: string; problem: CheckRow | null }) => !!r.problem && r.problem.text === r.text

function Verdict({ ok, text, glyph }: { ok: boolean; text: string; glyph?: string }) {
  return <p className="br-fam-verdict" role="status"><i aria-hidden="true">{glyph ?? (ok ? '✓' : '✕')}</i><b>{text}</b></p>
}

export function ClaimOut({ r }: { r: ClaimResult }) {
  return (
    <div className={`br-fam-out ${r.ok ? 'is-ok' : 'is-bad'}`} data-testid="fam-claim-result">
      {!sameAs(r) && <Verdict ok={r.ok} text={r.text || (r.ok ? '好了' : '没成')} />}
      {!r.ok && r.owner && !r.text.includes(r.owner) && <p className="br-small">现在在 <b>{r.owner}</b> 手里。</p>}
      {r.problem && <CheckRows rows={[r.problem]} />}
      <Output text={r.output} what="brain claim" open={!r.ok && !r.problem && !r.text} />
    </div>
  )
}

/**
 * A small one's start (the panel's, 待办's): its words; refused for its dependencies: each with who has it (and, when
 * brain-kit allows it, 「在 <DEP> 的分支上先做」 right there); started: its branch and worktree, 打开会话, 看需求看板.
 */
export function ChildStartOut({ r, onOpen, onBoard, onOn, busy = false }: {
  r: ChildStartResult
  onOpen: (url: string) => void
  onBoard?: (key: string) => void
  /** offered when the refusal says it may be started on a dependency's branch */
  onOn?: (dep: string) => void
  busy?: boolean
}) {
  return (
    <div className={`br-fam-out ${r.ok ? 'is-ok' : 'is-bad'}`} data-testid="fam-start-result">
      {!sameAs(r) && <Verdict ok={r.ok} text={r.text || (r.ok ? `开工了：${r.key}` : '没开成')} />}
      {r.ok && (
        <dl className="br-fam-facts">
          <div><dt>分支</dt><dd><code>{r.branch ?? '—'}</code></dd></div>
          <div><dt>工作目录</dt><dd><code>{r.worktree ?? '—'}</code></dd></div>
          {r.on && <div><dt>先做在</dt><dd><code>{r.on}</code><span className="kt-dim br-small">的分支上：它合并之前，你的 MR 里也带着它的提交</span></dd></div>}
        </dl>
      )}
      {r.blocked.length > 0 && (
        <div className="br-stack" style={{ gap: 4 }}>
          <b className="br-small">还没合进大需求的分支：</b>
          <DepList deps={r.blocked} />
        </div>
      )}
      {!r.ok && r.can_on && onOn && (
        <span className="br-fam-act">
          <button type="button" className="kt-btn" disabled={busy} onClick={() => onOn(r.can_on as string)}><RoleIcon role="merge" size={15} />在 {r.can_on} 的分支上先做</button>
          <span className="kt-dim br-small">或者等它合并</span>
        </span>
      )}
      {r.problem && <CheckRows rows={[r.problem]} />}
      {(r.url || (r.ok && onBoard)) && (
        <div className="br-row">
          {r.url && (
            <button type="button" className="kt-btn is-primary" onClick={() => onOpen(r.url as string)}><RoleIcon role="laptop" size={16} />打开会话</button>
          )}
          {r.ok && onBoard && <button type="button" className="kt-btn" onClick={() => onBoard(r.key)}><RoleIcon role="runner" size={16} />看需求看板</button>}
        </div>
      )}
      {r.ok && !r.url && r.session_error && <p className="br-error br-pre" role="alert">会话没开成：{r.session_error}</p>}
      <Output text={r.output} what="brain start" open={!r.ok && !r.problem && r.blocked.length === 0} />
    </div>
  )
}

function SyncOut({ r }: { r: SyncResult }) {
  const fine = r.result === 'merged' || r.result === 'up_to_date'
  return (
    <div className={`br-fam-out ${fine ? 'is-ok' : r.result === 'conflicts' ? 'is-warn' : 'is-bad'}`} data-testid="fam-sync-result" data-result={r.result}>
      {!sameAs(r) && <Verdict ok={fine} text={r.text || SYNC_WORD[r.result]} glyph={r.result === 'conflicts' ? '!' : undefined} />}
      {r.conflicts.length > 0 && (
        <div className="br-fam-conflicts" data-testid="fam-conflicts">
          <b className="br-small">这些文件有冲突，留给你：</b>
          <ul className="br-fam-chips">{r.conflicts.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
          <p className="br-prob-todo br-small"><b>做什么</b>在这个小需求的工作目录里改好这些文件，git add、git commit，再点一次「同步」。</p>
        </div>
      )}
      {r.problem && <CheckRows rows={[r.problem]} />}
      <Output text={r.output} what="brain sync" open={r.result === 'refused' && !r.problem && !r.text} />
    </div>
  )
}

// ---------------------------------------------------------------- 拆成小需求: the preview, then 确定拆

function SplitBox({ ctl }: { ctl: FamilyCtl }) {
  const p = ctl.preview.result
  const d = ctl.apply.result
  const shown = d ?? p
  return (
    <div className="br-fam-split" data-testid="split-box">
      {ctl.preview.busy && !p && <p className="br-loading">正在看会拆成什么（brain split --dry-run，什么都不写）…</p>}
      {shown && <SplitView r={shown} />}
      {d?.ok ? (
        <div className="br-row"><button type="button" className="kt-btn" onClick={ctl.closeSplit}>收起</button></div>
      ) : p && (
        <div className="br-fam-confirm">
          {p.ok && !d ? (
            <>
              <button type="button" className="kt-btn is-primary" disabled={ctl.busy} onClick={() => void ctl.applySplit()}>
                <RoleIcon role="scope" size={15} />{ctl.apply.busy ? '正在拆…' : '确定拆'}
              </button>
              <span className="kt-dim br-small">确定以后：推送大需求的分支，每个单元登记一个小需求（待认领）。</span>
            </>
          ) : (
            <button type="button" className="kt-btn" disabled={ctl.busy} onClick={() => void ctl.openSplit()}>{ctl.preview.busy ? '正在看…' : '再看一次'}</button>
          )}
          <button type="button" className="kt-btn" disabled={ctl.busy} onClick={ctl.closeSplit}>取消</button>
        </div>
      )}
      {!p && !ctl.preview.busy && ctl.preview.error && (
        <div className="br-row"><button type="button" className="kt-btn" onClick={ctl.closeSplit}>取消</button></div>
      )}
      <Err text={ctl.apply.error || ctl.preview.error} />
    </div>
  )
}

function SplitView({ r }: { r: SplitResult }) {
  const head = !r.ok ? '拆不了' : r.dry_run ? '先看一眼：会这样拆（还什么都没写）' : '拆好了'
  return (
    <div className={`br-fam-out ${r.ok ? (r.dry_run ? 'is-plan' : 'is-ok') : 'is-bad'}`} data-testid={r.dry_run ? 'split-preview' : 'split-result'}>
      <Verdict ok={r.ok} text={head} glyph={r.ok && r.dry_run ? '?' : undefined} />
      {r.text && <p className="br-pre">{r.text}</p>}
      {(r.units_sha || r.design_sha || r.branch) && (
        <p className="kt-dim br-small br-fam-shas">
          {r.units_sha && <>unit-of-work.md <code>{r.units_sha}</code></>}
          {r.design_sha && <> · DESIGN <code>{r.design_sha}</code> 批过</>}
          {r.branch && <> · 大需求的分支 <code>{r.branch}</code></>}
        </p>
      )}
      {r.actions.length > 0 && <SplitTable r={r} />}
      {r.warnings.length > 0 && (
        <div className="br-stack" style={{ gap: 4 }} aria-label="提醒">
          <b className="br-small">提醒</b>
          <CheckRows rows={r.warnings} />
        </div>
      )}
      {r.problems.length > 0 && (
        <div className="br-stack" style={{ gap: 4 }} aria-label="为什么拆不了">
          <b className="br-small">为什么拆不了</b>
          <CheckRows rows={r.problems} />
        </div>
      )}
      <Output text={r.output} what={r.dry_run ? 'brain split --dry-run' : 'brain split'} />
    </div>
  )
}

function SplitTable({ r }: { r: SplitResult }) {
  return (
    <div className="br-scroll">
      <table className="cto-table br-fam-table" aria-label={r.dry_run ? '会拆成这些小需求' : '拆成了这些小需求'}>
        <thead>
          <tr><th>单元</th><th>需求号</th><th>怎么办</th><th>路径</th><th>依赖</th><th>契约</th></tr>
        </thead>
        <tbody>
          {r.actions.map((a, i) => <SplitRow key={`${a.unit}-${i}`} a={a} />)}
        </tbody>
      </table>
    </div>
  )
}

function SplitRow({ a }: { a: SplitAction }) {
  const chips = (xs: string[], none = '—') => (xs.length ? <span className="br-fam-chips">{xs.map((x) => <code key={x}>{x}</code>)}</span> : <span className="kt-dim">{none}</span>)
  return (
    <tr className={a.attention ? 'is-attention' : undefined} data-testid="split-row" data-kind={a.kind} data-attention={a.attention ? 'true' : undefined}>
      <td><b className="br-mono">{a.unit}</b>{a.title && <div className="kt-dim br-small">{a.title}</div>}</td>
      <td>{a.key ? <code className="br-key">{a.key}</code> : <span className="kt-pill tone-ok">新号</span>}</td>
      <td>
        <span className={`kt-pill tone-${KIND_TONE[a.kind] ?? 'idle'}`}>{a.attention && <i aria-hidden="true">!</i>}{a.kind_label || a.kind}</span>
        {a.attention && <div className="br-fam-attn">要和认领的人说一声</div>}
        {a.why.map((w, i) => <div key={i} className="br-small">{w}</div>)}
      </td>
      <td>{chips(a.paths)}</td>
      <td>{chips(a.depends_on, '不依赖')}</td>
      <td>{chips(a.contracts)}</td>
    </tr>
  )
}

/** The panel's own look, on the board's tones and the kit's frames (kit.ts). */
export const FAMILY_CSS = `
.br-fam { display: grid; gap: 12px; min-width: 0; align-content: start; }
.br-fam .br-fam-head { margin-bottom: 0; align-items: center; gap: 6px 10px; }
.br-fam-head-acts { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.br-fam-up { font: inherit; font-family: var(--mono, ui-monospace, monospace); font-weight: 800; }
.br-fam-owner { display: inline-flex; align-items: center; gap: 5px; margin: 0; font-size: .9em; color: var(--text); }
.br-fam-owner .kt-role-icon { color: var(--muted); }
.br-fam-owner b { color: var(--text-strong); font-weight: 750; }
.br-fam-local { margin: 0; }

/* the roll-up: 已合并 n/m with one cell per small one, then the counts */
.br-fam-sum { display: grid; grid-template-columns: minmax(170px, 230px) minmax(0, 1fr); gap: 10px 22px; align-items: center; }
@media (max-width: 760px) { .br-fam-sum { grid-template-columns: minmax(0, 1fr); } }
.br-fam-merged { display: grid; gap: 2px; }
.br-fam-merged .kt-kpi-big.tone-ok { color: var(--kt-ok); }
.br-fam .kt-segs i.is-claimed { background: var(--kt-queue); }
.br-fam .kt-segs i.is-run { background: var(--kt-run); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-run) 55%, transparent); }
.br-fam-counts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 760px) { .br-fam-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.br-fam-counts li { display: flex; align-items: baseline; gap: 7px; padding: 9px 12px; border-radius: var(--kit-r-cell, 10px);
  border: 1px solid color-mix(in srgb, var(--kt-tone) 38%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 7%, transparent); }
.br-fam-counts b { font-size: 1.65em; font-weight: 800; line-height: 1.1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.br-fam-counts small { color: var(--muted); font-weight: 700; font-size: .9em; }
.br-fam-counts li.is-zero { border-style: dashed; background: transparent; border-color: var(--border); }
.br-fam-counts li.is-zero b { color: var(--muted); }

/* the small ones as lanes (the board's lane look, without a time track) */
.br-fam-lanes { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.br-fam-lane { grid-template-columns: 220px minmax(0, 1.3fr) minmax(0, 1fr); grid-template-areas: "id live work"; cursor: pointer; padding: 10px 14px 10px 18px; }
.br-fam-lane:hover { border-color: color-mix(in srgb, var(--accent) 70%, var(--border)); }
.br-fam-lane .kt-avatar { width: 46px; height: 46px; border-radius: 14px; cursor: pointer; color: var(--text-strong); }
.br-fam-lane .kt-lane-id { grid-template-columns: 46px minmax(0, 1fr); }
.br-fam-lane.is-unclaimed { border-style: dashed; background: color-mix(in srgb, var(--card) 70%, transparent); }
.br-fam-lane.is-unclaimed .kt-avatar { border-style: dashed; color: var(--muted); }
.br-fam-lane.is-in_progress { border-color: color-mix(in srgb, var(--kt-run) 45%, var(--border));
  background: linear-gradient(100deg, color-mix(in srgb, var(--kt-run) 7%, var(--card)), var(--card) 45%); }
.br-fam-lane.is-merged .kt-avatar { color: #fff; }
.br-fam-lane.is-closed { opacity: .55; }
.br-fam-key { appearance: none; border: 0; background: none; padding: 0; font: inherit; font-family: var(--mono, ui-monospace, monospace); color: var(--text-strong); cursor: pointer; }
.br-fam-key:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
.br-fam-title { color: var(--text-strong); font-weight: 650; overflow-wrap: anywhere; }
.br-fam-deps { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: .92em; }
.br-fam-lane .kt-lane-work { justify-content: center; }
.br-fam-lanenums b { color: var(--text-strong); font-weight: 750; margin: 0 1px; }
@media (max-width: 900px) { .br-fam-lane { grid-template-columns: minmax(0, 1fr); grid-template-areas: "id" "live" "work"; } }

/* the trace roll-up */
.br-fam-roll { display: grid; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }
.br-fam-roll-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.br-fam-roll-head b { color: var(--text-strong); }
.br-fam-nums { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 900px) { .br-fam-nums { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.br-fam-num { display: grid; gap: 1px; align-content: start; padding: 10px 12px; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border); background: var(--kt-glass); }
.br-fam-num small { color: var(--muted); font-weight: 700; font-size: .86em; }
.br-fam-num b { font-size: 1.7em; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.br-fam-num span { font-size: .84em; color: var(--text); }
.br-fam-num.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }
.br-fam-unknown { margin: 0; color: var(--kt-warn); font-weight: 650; }

/* a small one: its facts */
.br-fam-facts { display: grid; gap: 6px; margin: 0; }
.br-fam-facts > div { display: grid; grid-template-columns: 7em minmax(0, 1fr); gap: 4px 12px; align-items: baseline; min-width: 0; }
.br-fam-facts dt { color: var(--muted); font-size: .9em; }
.br-fam-facts dd { margin: 0; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; overflow-wrap: anywhere; }
.br-fam-chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.br-fam-chips code { padding: 1px 7px; border-radius: 6px; font-size: .86em; border: 1px solid var(--border); background: var(--kt-glass); overflow-wrap: anywhere; }
.br-fam-deplist { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.br-fam-deplist li { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.br-fam-blockline { margin: 0; }
.br-fam-next { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 10px; color: var(--text);
  border: 1px dashed color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 6%, transparent); }
.br-fam-next .kt-role-icon { flex: none; margin-top: 2px; color: var(--kt-info); }
.br-fam-next b { color: var(--text-strong); }

/* the actions and their answers */
.br-fam-acts { display: grid; gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
.br-fam-actrow { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; }
.br-fam-act { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.br-fam .kt-btn { display: inline-flex; align-items: center; gap: 6px; }
.br-fam .kt-btn:disabled { cursor: not-allowed; opacity: .55; }
.br-fam-why { display: inline-flex; align-items: center; gap: 6px; padding: 3px 11px; border-radius: 999px; font-size: .88em; font-weight: 650; white-space: normal;
  color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 10%, transparent); border: 1px solid color-mix(in srgb, var(--kt-approve) 40%, transparent); }
.br-fam-why i { font-style: normal; }
.br-fam-out { display: grid; gap: 8px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); min-width: 0; }
.br-fam-out.is-ok { border-color: var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 7%, var(--card)); }
.br-fam-out.is-bad { border-color: var(--kit-bad); background: color-mix(in srgb, var(--kt-bad) 7%, var(--card)); }
.br-fam-out.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 7%, var(--card)); }
.br-fam-out.is-plan { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: color-mix(in srgb, var(--accent) 6%, var(--card)); }
.br-fam-out p { margin: 0; }
.br-fam-verdict { display: flex; align-items: center; gap: 8px; color: var(--text-strong); }
.br-fam-verdict b { font-weight: 800; }
.br-fam-verdict i { font-style: normal; flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; font-size: .8em; font-weight: 900;
  color: #fff; background: var(--kt-ok-solid); }
.br-fam-out.is-bad .br-fam-verdict i { background: var(--kt-bad-solid); }
.br-fam-out.is-warn .br-fam-verdict i { background: var(--kt-warn); color: var(--kt-on); }
.br-fam-out.is-plan .br-fam-verdict i { background: var(--accent); color: var(--accent-fg, #fff); }
.br-fam-conflicts { display: grid; gap: 6px; }
.br-fam-shas code { color: var(--text); }
.br-fam-split { display: grid; gap: 10px; }
.br-fam-confirm { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
.br-fam-table td { vertical-align: top; }
.br-fam-table tr.is-attention td { background: color-mix(in srgb, var(--kt-warn) 8%, transparent); }
.br-fam-table tr.is-attention td:first-child { box-shadow: inset 3px 0 0 var(--kt-warn); }
.br-fam-attn { margin-top: 4px; color: var(--kt-warn); font-weight: 750; font-size: .86em; }
.br-fam-raw pre { max-height: 16em; overflow: auto; }
`
