/**
 * 需求详情: one requirement, between 交付总览 (every requirement) and its 需求看板 (how it went), as the sample's 交付详情
 * shows one delivery. It answers what one asks of a requirement — how long it took and where it is, where the time
 * went (AI on this machine, the runner, waiting for a person, done again), what it cost, what the checks say, and what
 * people decided and asked — and keeps everything this app showed before: Lean's 11 stages and its approvals (a pending
 * one's line, shown to be typed in the session by the person), Session notes, the MR's 变更说明 (its first line, the
 * whole text folded, 复制), decisions with their Brain citations (they open the Brain view), questions and answers (the
 * answer form only where the person may answer here), the timeline, the sessions this app opened with their credits,
 * and what the run used of the Brain.
 *
 * Polls GET /requirements/{repo}/{key} every 5 s, and the board's snapshot (GET /board/{repo}/{key}) for the value
 * stream (its actors' spans); without a board the cards that need it say so.
 */
import { useState } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { POLL_MS, paths, usePoll, useAction } from '../api'
import { RoleGlyph, RoleIcon } from '../board/RoleIcon'
import { Hit, Mini, Tip, useWidth, type TipState } from '../cto/charts'
import { ago, fmtCredits, fmtIso, fmtSpan, fmtTime, isoDay } from '../format'
import type { ItemEntry, ItemFrom } from '../nav'
import type { Decision, OpenSessionBody, OpenSessionResult, ReqBoard, RequirementDetail, SessionRow, Stage, TimelineItem, TimelineKind } from '../types'
import { APPROVAL_META, Icon, LoadState, MrLink, STAGE_META, StateChip, TypeLine } from '../ui'
import type { ViewProps } from './props'
import { EntryChip, MrDescCard, QuestionCard } from './Question'
import { ReqSwitch } from './ReqSwitch'

export { EntryChip, MR_DESC_COPY_HINT, MrDescCard, QuestionCard, mrDescSource } from './Question'

const FROM_LABEL: Record<ItemFrom, string> = { overview: '交付总览', todo: '待办', brain: 'Brain', board: '需求看板' }

const BY_LABEL: Record<NonNullable<Decision['by']>, string> = {
  person: '人', agent: 'agent', check: '检查', brain: 'Brain', bridge: 'bridge', unclassified: '没归类',
}

const KIND_META: Record<TimelineKind, { icon: string; label: string }> = {
  stage: { icon: 'design', label: '阶段' },
  approval: { icon: 'approved', label: '审批' },
  human: { icon: 'person', label: '人' },
  commit: { icon: 'commit', label: '提交' },
  handover: { icon: 'handover', label: '交接' },
  question: { icon: 'question', label: '问题' },
  decision: { icon: 'req', label: '决定' },
  blocked: { icon: 'blocked', label: '拦下' },
  verify: { icon: 'ci', label: '验证' },
  merge: { icon: 'merge', label: '合并' },
  session: { icon: 'laptop', label: '会话' },
  app: { icon: 'brain', label: 'app' },
}

export const DETAIL_CSS = `
.br-detail .cto-item-head .kt-run-title { margin: 0; }
.br-detail .cto-item-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1180px) { .br-detail .cto-item-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.br-detail .br-twocol { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .br-detail .br-twocol { grid-template-columns: minmax(0, 1fr); } }
.br-detail .br-col { display: grid; gap: 16px; min-width: 0; }
.br-detail .br-detail-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 5px 22px; margin: 10px 0 0; padding: 10px 14px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--kt-glass); }
.br-detail .br-detail-facts > div { display: grid; grid-template-columns: 6em minmax(0, 1fr); gap: 8px; align-items: baseline; min-width: 0; }
.br-detail .br-detail-facts dt { font-size: .86em; }
.br-detail .br-detail-facts dd { overflow-wrap: anywhere; }
.br-detail .br-stagecells { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); gap: 4px; }
@media (max-width: 1100px) { .br-detail .br-stagecells { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.br-detail .br-stagecell { position: relative; display: grid; gap: 2px; align-content: start; padding: 7px 8px 8px; border-radius: 10px; min-height: 64px;
  border: 2px solid color-mix(in srgb, var(--kt-tone) 70%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 12%, var(--card)); }
.br-detail .br-stagecell.is-done { background: var(--kt-ok-solid); border-color: color-mix(in srgb, var(--kt-ok) 75%, transparent); }
.br-detail .br-stagecell.is-done :is(.br-stage-n, .br-stage-label) { color: #fff; }
.br-detail .br-stagecell.is-skipped { border-style: dashed; background: transparent; opacity: .7; }
.br-detail .br-stagecell.is-todo { border-style: dashed; background: transparent; border-color: var(--border-strong); }
.br-detail .br-stagecell.is-started { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 25%, transparent), 0 0 18px -6px var(--kt-run); }
.br-detail .br-stage-n { font-size: .74em; font-weight: 800; color: var(--muted); }
.br-detail .br-stage-label { font-size: .86em; font-weight: 750; color: var(--text-strong); line-height: 1.25; }
.br-detail .br-stage-units { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
.br-detail .br-stage-units .br-chip { font-size: .7em; padding: 0 6px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.br-detail .br-stagecells { list-style: none; margin: 0; padding: 0; }
.br-detail .br-approvals { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.br-detail .br-approval { display: grid; gap: 6px; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); }
.br-detail .br-approval[data-state="pending"] { border-color: var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }
.br-detail .br-approval[data-state="approved"] { border-color: var(--kit-ok); }
.br-detail .cto-table td { vertical-align: top; }
.br-detail .br-vs { position: relative; }
.br-detail .br-vs svg { display: block; width: 100%; overflow: visible; }
.br-detail .br-vs text { font-size: 12px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.br-detail .br-vs text.is-strong { fill: var(--text-strong); font-weight: 650; font-size: 12.5px; }
.br-detail .br-sessions { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.br-detail .br-session { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }
.br-detail .br-session .kt-role-icon { color: var(--text-strong); }
.br-detail .br-tl li { grid-template-columns: 3.4em 22px 1fr; }
.br-detail .br-tl .kt-role-icon { color: var(--muted); }
.br-detail .br-tl li[data-kind="merge"] .kt-role-icon, .br-detail .br-tl li[data-kind="approval"] .kt-role-icon { color: var(--kt-ok); }
.br-detail .br-tl li[data-kind="blocked"] .kt-role-icon { color: var(--kt-warn); }
.br-detail .br-tl li[data-kind="handover"] .kt-role-icon { color: var(--kt-handoff); }
.br-detail .br-tlbox { max-height: 520px; overflow: auto; }
`

/** Where the time went, from the board's actors: AI on this machine, the runner, waiting for a person, done again. */
export type Part = 'agent' | 'runner' | 'person' | 'rework'
export const PART_LABEL: Record<Part, string> = { agent: 'AI 在本机做', runner: '运行机在做', person: '等人', rework: '返工' }
export const PART_VAR: Record<Part, string> = { agent: 'var(--vs-agent)', runner: 'var(--s1)', person: 'var(--vs-person)', rework: 'var(--vs-rework)' }
const RANK: Record<Part, number> = { person: 4, rework: 3, runner: 2, agent: 1 }

/** The requirement's time as segments in order, each the most telling part at that time (a wait for a person over work
 * going on meanwhile); quiet stretches with nothing recorded are left out. */
export function valueStream(b: ReqBoard, now: number): { from: number; to: number; part: Part }[] {
  const ivs: { a: number; b: number; part: Part }[] = []
  for (const a of b.actors) {
    for (const s of a.spans) {
      const part: Part = s.kind === 'wait' ? 'person' : s.kind === 'fix' ? 'rework' : a.key === 'runner' || a.key === 'bridge' || a.key === 'signer' ? 'runner' : 'agent'
      const end = s.b ?? (b.ended_at ?? now)
      if (end > s.a) ivs.push({ a: s.a, b: end, part })
    }
  }
  const pts = [...new Set(ivs.flatMap((x) => [x.a, x.b]))].sort((x, y) => x - y)
  const out: { from: number; to: number; part: Part }[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = pts[i], t1 = pts[i + 1]
    const on = ivs.filter((x) => x.a <= t0 && x.b >= t1)
    if (!on.length) continue
    const part = on.sort((x, y) => RANK[y.part] - RANK[x.part])[0].part
    const last = out[out.length - 1]
    if (last && last.part === part && Math.abs(last.to - t0) < 1) last.to = t1
    else out.push({ from: t0, to: t1, part })
  }
  return out
}

export function DetailView({ entry, onBack, onSwitch, ...props }: {
  entry: ItemEntry
  onBack?: () => void
  /** 切换需求: open another requirement here (default: a move to its 需求详情) */
  onSwitch?: (repo: string, key: string) => void
} & ViewProps) {
  const d = usePoll<RequirementDetail>(paths.requirement(entry.repo, entry.key), props.pollMs ?? POLL_MS)
  const b = usePoll<ReqBoard>(d.data ? paths.board(entry.repo, entry.key) : null, props.pollMs ?? POLL_MS)
  const [opened, setOpened] = useState<OpenSessionResult | null>(null)
  const from = FROM_LABEL[entry.from ?? 'overview']
  const after = () => {
    d.reload()
    props.reloadStatus()
  }
  const x = d.data
  const board = b.data
  const live = x ? x.sessions.find((s) => s.kind === 'local' && !s.error) ?? null : null
  const canOpen = !!x && x.row.state === 'local' && !live
  const toBoard = (replay = false) => props.go({ kind: 'board', repo: entry.repo, key: entry.key, from: 'item', ...(replay ? { replay: true } : {}) })
  return (
    <main className="kt-root br-view cto-root cto-item br-detail" data-testid="br-detail">
      <style>{DETAIL_CSS}</style>
      <div className="cto-top">
        <nav className="kit-crumb" aria-label="位置">
          {onBack ? <button type="button" onClick={onBack}>{from}</button> : <span>{from}</span>}
          <span aria-hidden="true">›</span>
          <b>{entry.key}</b>
        </nav>
        <span className="cto-grow" />
        <ReqSwitch repo={entry.repo} reqKey={entry.key} status={props.status} pollMs={props.pollMs}
          onPick={onSwitch ?? ((repo, key) => props.go({ kind: 'item', repo, key }))} />
        <div className="cto-item-act">
          <button type="button" className="kt-btn is-primary" onClick={() => toBoard()}>需求看板 ↗</button>
          {x && x.row.state === 'merged' && <button type="button" className="kt-btn" onClick={() => toBoard(true)}>▶ 回放 ↗</button>}
          {onBack && <button type="button" className="kt-btn" onClick={onBack}>← 返回{from}</button>}
        </div>
      </div>
      <LoadState loading={d.loading} error={d.error} has={!!x} />
      {x && (
        <>
          <Header x={x} />
          <Cards x={x} board={board} onBoard={() => toBoard()} />
          {(canOpen || opened) && <OpenSession repo={entry.repo} reqKey={entry.key} opened={opened} onOpened={(r) => { setOpened(r); after() }} />}
          <StreamCard board={board} onBoard={() => toBoard()} />
          <LeanCard x={x} sessionUrl={live?.url ?? null} />
          <div className="br-twocol">
            <div className="br-col">
              <DecisionsCard decisions={x.decisions} repo={entry.repo} go={props.go} />
              <section className="cto-card" aria-label="问题和回答">
                <div className="cto-chart-head"><h3>问题和回答</h3><span className="cto-dim">{x.questions.length} 个 · 能在这里回答的才有回答框</span></div>
                {x.questions.length === 0 ? <p className="br-empty">没有问过人。</p> : (
                  <div className="br-stack">
                    {x.questions.map((q, i) => <QuestionCard key={`${q.id ?? 'q'}-${i}`} q={q} repo={entry.repo} reqKey={entry.key} onAnswered={after} />)}
                  </div>
                )}
              </section>
              <MrDescCard m={x.mr_desc} />
            </div>
            <div className="br-col">
              <NotesCard x={x} />
              <SessionsCard sessions={x.sessions} total={x.credits.total} note={x.credits.note} />
              <BrainUseCard b={x.brain} repo={entry.repo} go={props.go} />
              <TimelineCard t={x.timeline} />
            </div>
          </div>
        </>
      )}
    </main>
  )
}

function Header({ x }: { x: RequirementDetail }) {
  const r = x.row
  const run = x.run
  return (
    <section className="br-head br-detail-head" aria-label="需求">
      <header className="cto-item-head">
        <h2 className="kt-run-title">{r.title}</h2>
        <span className="kt-pill tone-info kt-mono">{r.key}</span>
        <StateChip state={r.state} label={r.state_label} />
        <span className="cto-org">{r.owner ? `${r.owner} 的需求 · ` : ''}{x.where_label}</span>
      </header>
      <div className="cto-item-now br-row" data-testid="detail-waits">
        <span>此刻：{r.waits.text || '—'}</span>
        {r.waits.line && <code className="br-mono br-strong">{r.waits.line}</code>}
      </div>
      <dl className="br-facts br-detail-facts">
        <div><dt>分支</dt><dd>{r.branch ? <code>{r.branch}</code> : '—'}</dd></div>
        <div><dt>工作目录</dt><dd>{r.worktree ? <code>{r.worktree}</code> : '—'}</dd></div>
        <div><dt>Lean intent</dt><dd>{r.intent ? <code>{r.intent}</code> : '—'}</dd></div>
        <div><dt>MR</dt><dd><MrLink mr={r.mr} /></dd></div>
        {x.claim && <div><dt>认领</dt><dd>{x.claim.owner ?? '—'} · {fmtIso(x.claim.created_at)} · 来源 {x.claim.source}{x.claim.closed ? ` · 已关闭：${x.claim.closed}` : ''}</dd></div>}
        {run && <div><dt>运行</dt><dd>开始于 {fmtIso(run.created_at)}{run.origin ? ` · 来源 ${run.origin}` : ''}{run.brain_commit ? <> · Brain <code>{run.brain_commit}</code></> : ''}</dd></div>}
        {run?.handoff && <div><dt>交接</dt><dd>{fmtIso(run.handoff.requested_at)}{run.handoff.by ? ` · ${run.handoff.by}` : ''}</dd></div>}
        {run && run.materials.length > 0 && <div><dt>材料</dt><dd className="br-row">{run.materials.map((m) => <code key={m}>{m}</code>)}</dd></div>}
        {r.run_ids.length > 0 && <div><dt>运行机</dt><dd className="br-row">{r.run_ids.map((id) => <code key={id}>{id}</code>)}</dd></div>}
        {r.expected_paths.length > 0 && <div><dt>要改的地方</dt><dd className="br-row">{r.expected_paths.map((p) => <code key={p}>{p}</code>)}</dd></div>}
        {r.overlap.length > 0 && <div><dt>重叠</dt><dd><span className="br-chip tone-warn">和 {r.overlap.join('、')} 改同一块</span></dd></div>}
      </dl>
    </section>
  )
}

/** The four numbers of one requirement (the sample's 交付详情 cards): 周期, 时间花在哪, 成本, 检查. */
function Cards({ x, board, onBoard }: { x: RequirementDetail; board: ReqBoard | null; onBoard: () => void }) {
  const now = board?.at ?? Date.now() / 1000
  const start = board?.started_at ?? (x.claim?.created_at ? Date.parse(x.claim.created_at) / 1000 : null)
  const end = board?.ended_at ?? null
  const lean = x.row.lean
  const parts = board ? valueStream(board, now) : []
  const split = (['agent', 'runner', 'person', 'rework'] as Part[]).map((p) => ({ p, s: parts.filter((g) => g.part === p).reduce((a, g) => a + g.to - g.from, 0) }))
  const busy = split.filter((s) => s.p !== 'person').reduce((a, s) => a + s.s, 0)
  const sent = board ? board.events.filter((e) => e.kind === 'reject' || e.kind === 'rejected').length : 0
  const blocked = board ? board.events.filter((e) => e.kind === 'blocked').length : 0
  const w = board?.checks
  return (
    <section className="cto-cards cto-item-cards" aria-label="这个需求的四个数">
      <article className="cto-card" aria-label="周期">
        <div className="cto-eyebrow">周期</div>
        <div className="cto-value" data-testid="item-cycle">{start ? fmtSpan((end ?? now) - start) : '—'}</div>
        <div className="cto-desc">{start ? `${fmtTime(start)} 起` : '还没开工'}{end ? ` → ${fmtTime(end)} 合并` : ' → 进行中'}</div>
        <div className="kt-segs cto-segs" aria-label={`Lean ${lean.done}/${lean.total}`}>
          {Array.from({ length: lean.total }, (_, i) => <i key={i} className={i < lean.done ? 'is-pass' : lean.stage_state === 'started' && lean.stage_n === i + 1 ? 'is-run' : ''} />)}
        </div>
        <div className="cto-legend"><span>Lean 做完 {lean.done}/{lean.total} 个阶段 · 现在 {x.row.stage ?? '还没开始'}</span></div>
      </article>
      <article className="cto-card" aria-label="时间花在哪">
        <div className="cto-eyebrow">时间花在哪</div>
        <div className="cto-value">{board ? fmtSpan(busy) : '—'}</div>
        <div className="cto-desc">{board ? `AI 在做 · 等人 ${fmtSpan(split.find((s) => s.p === 'person')!.s)}` : '看板的数据还没来'}</div>
        {board && <SplitBar split={split} />}
        {board && (
          <div className="cto-legend">
            {split.filter((s) => s.s > 0).map(({ p, s }) => (
              <button type="button" key={p} onClick={onBoard} title="在需求看板上看"><i className="cto-sw" style={{ background: PART_VAR[p] }} />{PART_LABEL[p]}<b>{fmtSpan(s)}</b></button>
            ))}
          </div>
        )}
      </article>
      <article className="cto-card" aria-label="成本">
        <div className="cto-eyebrow">成本</div>
        <div className="cto-value">{fmtCredits(x.credits.total)}<span className="cto-of">credits</span></div>
        <div className="cto-desc">{x.sessions.length} 个会话 · KiroCrew 只报 credits</div>
        <div className="cto-chips" aria-label="会话">
          {x.sessions.map((s) => (
            <span key={s.slot} className={`cto-chip${s.error ? ' is-back' : s.awaiting ? ' is-wait' : ''}`} title={`${s.title}：${fmtCredits(s.credits)} credits`}>
              <RoleIcon role={s.kind === 'runner' ? 'runner' : 'laptop'} size={16} />
            </span>
          ))}
          {x.sessions.length === 0 && <span className="cto-chip is-idle"><RoleIcon role="laptop" size={16} /></span>}
        </div>
      </article>
      <article className={`cto-card${w && w.total ? (w.failed ? ' is-bad' : w.passed === w.total ? ' is-ok' : '') : ''}`} aria-label="检查">
        <div className="cto-eyebrow">检查</div>
        <div className="cto-value">{w ? <>{w.passed}<span className="cto-of">/{w.total}</span></> : '—'}</div>
        <div className="cto-desc">Lean 审批 · verify · 交接 · Brain</div>
        {w && (
          <button type="button" className="kt-segs cto-segs" aria-label="在需求看板的检查墙上看每一项" onClick={onBoard}>
            {w.cells.filter((c) => c.status !== 'skip').map((c) => <i key={c.id} className={c.status === 'pass' ? 'is-pass' : c.status === 'fail' ? 'is-fail' : 'is-wait'} title={c.name} />)}
          </button>
        )}
        <div className="cto-legend"><span><RoleIcon role="bounce" size={14} />退回 {sent} 次 · Lean 拦下 {blocked} 次</span></div>
      </article>
    </section>
  )
}

function SplitBar({ split }: { split: { p: Part; s: number }[] }) {
  const shown = split.filter((x) => x.s > 0)
  const sum = shown.reduce((a, x) => a + x.s, 0) || 1
  return (
    <Mini label={'时间花在哪：' + shown.map((x) => `${PART_LABEL[x.p]} ${fmtSpan(x.s)}`).join('，')} height={22}>
      {(W, onTip) => {
        const pw = Math.max(10, W - 8)
        let x0 = 0
        return shown.map((x, i) => {
          const w = Math.max(2, (x.s / sum) * pw - (i < shown.length - 1 ? 2 : 0))
          const at = x0
          x0 += (x.s / sum) * pw
          return (
            <g key={x.p}>
              <rect x={at} y={4} width={w} height={14} rx={i === shown.length - 1 ? 4 : 0} fill={PART_VAR[x.p]} />
              <Hit x={at} y={0} w={Math.max(8, w)} h={22} onTip={onTip} rows={[[fmtSpan(x.s), PART_LABEL[x.p], PART_VAR[x.p]], [`${Math.round((x.s / sum) * 100)}%`, '占记下的时间']]} />
            </g>
          )
        })
      }}
    </Mini>
  )
}

/** 价值流: the requirement's time on one band — AI on this machine, the runner, waiting for a person, done again — with
 * its moments (approvals, the hand-over, questions, the merge) under it; every part opens the board. */
function StreamCard({ board, onBoard }: { board: ReqBoard | null; onBoard: () => void }) {
  const segs = board ? valueStream(board, board.at) : []
  return board && segs.length ? <StreamChart board={board} segs={segs} onBoard={onBoard} /> : null
}

/** The chart itself: mounted with its box, so it is measured at the width it has. */
function StreamChart({ board, segs, onBoard }: { board: ReqBoard; segs: ReturnType<typeof valueStream>; onBoard: () => void }) {
  const [ref, W] = useWidth(1100)
  const [tip, setTip] = useState<TipState>(null)
  const t0 = segs[0].from, t1 = segs[segs.length - 1].to
  const total = Math.max(60, t1 - t0)
  const L = 6, R = 6, pw = Math.max(10, W - L - R)
  const x = (t: number) => L + ((Math.min(Math.max(t, t0), t1) - t0) / total) * pw
  const moments = board.events.filter((e) => ['approve', 'reject', 'handover', 'accepted', 'question', 'answer', 'merge', 'reflect'].includes(e.kind))
  const ICON: Record<string, string> = { approve: 'approved', reject: 'bounce', handover: 'handover', accepted: 'bridge', question: 'question', answer: 'person', merge: 'merge', reflect: 'brain' }
  const H = 112
  return (
    <section className="cto-card" aria-label="价值流" data-testid="item-stream">
      <div className="cto-chart-head">
        <h3>价值流</h3>
        <span className="cto-dim">从开工到{board.ended_at ? '合并' : '此刻'}，记下的 {fmtSpan(segs.reduce((a, s) => a + s.to - s.from, 0))} · 安静的时段没画 · 点任一段到需求看板</span>
      </div>
      <div className="cto-legend">
        {(['agent', 'runner', 'person', 'rework'] as Part[]).map((p) => <span key={p}><i className="cto-sw" style={{ background: PART_VAR[p] }} />{PART_LABEL[p]}</span>)}
        <span className="cto-dim">· 色块下方是关键时刻</span>
      </div>
      <div className="br-vs" ref={ref}>
        <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={'价值流：' + segs.map((s) => `${PART_LABEL[s.part]} ${fmtSpan(s.to - s.from)}`).join('，')}>
          {segs.map((s, i) => {
            const a = x(s.from), bb = x(s.to), w = Math.max(2, bb - a - 2)
            return (
              <g key={i} className="cto-vs-seg">
                <rect x={a} y={18} width={w} height={26} rx={i === 0 || i === segs.length - 1 ? 5 : 2} fill={PART_VAR[s.part]} />
                {w > 70 && <text x={a + 4} y={60} className="is-strong">{PART_LABEL[s.part]}</text>}
                {w > 70 && <text x={a + 4} y={74}>{fmtSpan(s.to - s.from)}</text>}
                <Hit x={a} y={14} w={Math.max(8, w)} h={34} onTip={setTip} onPick={onBoard} label={`${PART_LABEL[s.part]} ${fmtSpan(s.to - s.from)}`}
                  when={`${fmtTime(s.from)} – ${fmtTime(s.to)}`} rows={[[fmtSpan(s.to - s.from), PART_LABEL[s.part], PART_VAR[s.part]], ['点击', '到需求看板']]} />
              </g>
            )
          })}
          {moments.map((m) => (
            <g key={m.seq} className={`cto-vs-moment ${m.kind === 'reject' ? 'is-back' : m.kind === 'question' ? 'is-wait' : 'is-ok'}`} transform={`translate(${x(m.at)},${96})`}>
              <title>{`${fmtTime(m.at)} · ${m.text}`}</title>
              <circle r={9} />
              <RoleGlyph role={ICON[m.kind]} cx={0} cy={0} size={12} />
            </g>
          ))}
        </svg>
        <Tip tip={tip} width={W} />
      </div>
    </section>
  )
}

function OpenSession({ repo, reqKey, opened, onOpened }: { repo: string; reqKey: string; opened: OpenSessionResult | null; onOpened: (r: OpenSessionResult) => void }) {
  const api = useAppApi()
  const navigate = useNavigate()
  const [trust, setTrust] = useState(true)
  const [kickoff, setKickoff] = useState(true)
  const act = useAction((body: OpenSessionBody) => api.post<OpenSessionResult>(paths.session(repo, reqKey), body))
  const open = async () => {
    const r = await act.run({ trust, kickoff })
    if (r) onOpened(r)
  }
  return (
    <section className="cto-card is-wait br-opensession" aria-label="开会话">
      {opened ? (
        <div className="br-row">
          <span className="br-ok-text">会话开好了。</span>
          <button type="button" className="kt-btn is-primary" onClick={() => navigate(opened.url)}>
            <Icon name="MessageSquare" size={13} />打开会话
          </button>
        </div>
      ) : (
        <>
          <div className="cto-chart-head"><h3>还没有会话</h3><span className="cto-dim">在这个需求的工作目录里开一个 brain-dev 会话，接着做。</span></div>
          <div className="br-row">
            <label className="br-check">
              <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
              <span>这个会话的工具调用不用逐个批准</span>
            </label>
            <label className="br-check">
              <input type="checkbox" checked={kickoff} onChange={(e) => setKickoff(e.target.checked)} />
              <span>开好后先发一句开场，让它接着做</span>
            </label>
            <span className="br-grow" />
            <button type="button" className="kt-btn is-primary" disabled={act.busy} onClick={() => void open()}>{act.busy ? '正在开…' : '开会话'}</button>
          </div>
        </>
      )}
      {act.error && <p className="br-error" role="alert">{act.error}</p>}
    </section>
  )
}

function LeanCard({ x, sessionUrl }: { x: RequirementDetail; sessionUrl: string | null }) {
  const { stages, approvals } = x.lean
  return (
    <section className="cto-card" aria-label="Lean 进度">
      <div className="cto-chart-head">
        <h3>AI-DLC Lean</h3>
        <span className="cto-dim">做完或跳过 {x.row.lean.done}/{x.row.lean.total} 个阶段 · 审批的那一行由你在会话里自己打，app 不替你发</span>
      </div>
      <ol className="br-stagecells" aria-label="11 个阶段">
        {stages.map((s) => <StageCell key={s.id} s={s} />)}
      </ol>
      <h3 style={{ marginTop: 4 }}>审批</h3>
      {approvals.length === 0 ? <p className="br-empty">还没有审批。</p> : (
        <ul className="br-approvals" aria-label="审批">
          {approvals.map((a, i) => {
            const m = APPROVAL_META[a.state] ?? { label: a.state, tone: 'idle' }
            return (
              <li key={`${a.kind}-${a.sha8 ?? i}`} className="br-approval" data-testid="approval" data-state={a.state}>
                <div className="br-row">
                  <RoleIcon role={a.kind === 'RELEASE' ? 'release' : a.kind === 'REQUIREMENTS' ? 'req' : 'design'} size={16} />
                  <b className="br-mono">{a.kind}</b>
                  <span className={`br-chip tone-${m.tone}`}>{m.label}</span>
                  {a.sha8 && <code className="br-dim">{a.sha8}</code>}
                  {a.at !== null && <span className="br-dim br-small">{fmtTime(a.at)}</span>}
                  {a.path && <code className="br-dim br-small">{a.path}</code>}
                </div>
                {a.state === 'pending' && a.line && <TypeLine line={a.line} sessionUrl={sessionUrl} />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function StageCell({ s }: { s: Stage }) {
  const m = STAGE_META[s.state] ?? STAGE_META.todo
  return (
    <li className={`br-stagecell is-${s.state} tone-${m.tone === 'wait' ? 'approve' : m.tone}`} data-testid="stage" data-state={s.state} title={s.note ?? m.label}>
      <span className="br-stage-n">{s.n} · {m.label}</span>
      <span className="br-stage-label">{s.label}<span className="br-sr">（{m.label}）</span></span>
      {s.units.length > 0 && (
        <span className="br-stage-units">
          {s.units.map((u) => {
            const um = STAGE_META[u.state] ?? STAGE_META.todo
            return <span key={u.unit} className={`br-chip tone-${um.tone}`} title={um.label}>{u.unit} · {um.label}</span>
          })}
        </span>
      )}
    </li>
  )
}

function NotesCard({ x }: { x: RequirementDetail }) {
  const { status, next, open_questions } = x.lean
  return (
    <section className="cto-card" aria-label="会话记录">
      <div className="cto-chart-head"><h3>会话记录</h3><span className="cto-dim">aidlc-state.md 的 Session notes</span></div>
      {status ? <p className="br-pre br-strong" style={{ margin: 0 }}>{status}</p> : <p className="br-empty">还没有写。</p>}
      {next.length > 0 && (
        <div>
          <b className="br-strong">下一步</b>
          <ul className="br-list">{next.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      {open_questions.length > 0 && (
        <div>
          <b className="br-strong">没解决的问题</b>
          <ul className="br-list">{open_questions.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </section>
  )
}

function DecisionsCard({ decisions, repo, go }: { decisions: Decision[]; repo: string; go: ViewProps['go'] }) {
  const people = decisions.filter((d) => d.by === 'person').length
  return (
    <section className="cto-card" aria-label="决定">
      <div className="cto-chart-head">
        <h3>决定</h3>
        <span className="cto-dim">decisions.md · {decisions.length} 条 · 人定了 {people} 条 · 引用的 Brain 条目点开看</span>
      </div>
      {decisions.length === 0 ? <p className="br-empty">还没有记下决定。</p> : (
        <div className="br-scroll">
          <table className="cto-table">
            <thead>
              <tr><th>ID</th><th>日期</th><th>阶段</th><th>决定</th><th>为什么</th><th>谁定的</th><th>引用 Brain</th><th>凭证</th></tr>
            </thead>
            <tbody>
              {decisions.map((dd) => (
                <tr key={dd.id}>
                  <td className="br-key" title={dd.src}>{dd.id}</td>
                  <td className="br-dim" style={{ whiteSpace: 'nowrap' }}>{dd.date ?? '—'}</td>
                  <td className="br-dim">{dd.stage ?? '—'}</td>
                  <td className="br-pre">{dd.text}</td>
                  <td className="br-pre br-dim">{dd.why ?? '—'}</td>
                  <td title={dd.by === 'unclassified' ? 'Who 不是规定的写法：没归类，也不猜是谁' : undefined}>
                    {[dd.who, dd.by ? BY_LABEL[dd.by] : null].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td><span className="br-row" style={{ gap: 4 }}>{dd.cites.length ? dd.cites.map((c) => <EntryChip key={c} id={c} repo={repo} go={go} />) : <span className="br-dim">—</span>}</span></td>
                  <td>{dd.vouchers.length ? dd.vouchers.map((v) => <code key={v}>{v} </code>) : <span className="br-dim">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** The local time of an ISO time (14:05), or "—". */
function clock(iso: string | null): string {
  if (!iso) return '—'
  const t = fmtIso(iso)
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t) ? t.slice(11) : '—'
}

function TimelineCard({ t }: { t: RequirementDetail['timeline'] }) {
  const days = new Map<string, TimelineItem[]>()
  for (const it of t.items) {
    const day = isoDay(it.at) ?? '没有时间'
    days.set(day, [...(days.get(day) ?? []), it])
  }
  return (
    <section className="cto-card" aria-label="时间线">
      <div className="cto-chart-head">
        <h3>时间线</h3>
        <span className="cto-dim">{t.source === 'trace' ? '来自 brain-kit trace' : 'app 自己拼的（brain-kit 没有 trace）'}</span>
      </div>
      {t.error && <p className="br-error" role="alert">{t.error}</p>}
      <div className="br-tlbox">
        {t.items.length === 0 ? <p className="br-empty">还没有记录。</p> : [...days.entries()].map(([day, items]) => (
          <div key={day}>
            <p className="br-day">{day}</p>
            <ol className="br-tl">
              {items.map((it, i) => {
                const k = KIND_META[it.kind] ?? { icon: 'commit', label: it.kind }
                return (
                  <li key={i} data-testid="tl-item" data-kind={it.kind}>
                    <time>{clock(it.at)}</time>
                    <span title={k.label}><RoleIcon role={k.icon} size={16} /><span className="br-sr">{k.label}</span></span>
                    <span>
                      <span className="br-strong">{it.label}</span>
                      {it.detail && <span className="br-dim"> · {it.detail}</span>}
                      {it.who && <span className="br-dim br-small"> · {it.who}</span>}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>
      {t.missing.length > 0 && <p className="br-note br-small">这些来源没读到：{t.missing.join('、')}</p>}
    </section>
  )
}

function sessionState(s: SessionRow): { label: string; tone: string } {
  if (s.error) return { label: '出错', tone: 'bad' }
  if (s.awaiting) return { label: '等批准', tone: 'wait' }
  if (s.busy) return { label: '在忙', tone: 'run' }
  return { label: '空闲', tone: 'idle' }
}

function SessionsCard({ sessions, total, note }: { sessions: SessionRow[]; total: number | null; note: string }) {
  const navigate = useNavigate()
  const now = Date.now() / 1000
  return (
    <section className="cto-card" aria-label="会话">
      <div className="cto-chart-head"><h3>会话</h3><span className="cto-dim">这个 app 开的 · 合计 {fmtCredits(total)} credits</span></div>
      {sessions.length === 0 ? <p className="br-empty">还没有会话。</p> : (
        <ul className="br-sessions">
          {sessions.map((s) => {
            const st = sessionState(s)
            return (
              <li key={s.slot} className="br-session" data-testid="session">
                <RoleIcon role={s.kind === 'runner' ? 'runner' : 'laptop'} size={22} />
                <div className="br-stack" style={{ gap: 2 }}>
                  <div className="br-row">
                    <b className="br-strong">{s.title}</b>
                    <span className={`br-chip tone-${st.tone}`}>{st.label}</span>
                    <span className="br-tag">{s.kind === 'local' ? '本机' : '运行机'}</span>
                  </div>
                  <div className="br-row br-small br-dim">
                    <code>{s.agent}</code>
                    <span>credits {fmtCredits(s.credits)}</span>
                    <span>{s.turns} 轮</span>
                    <span>最近 {ago(s.last_activity, now)}</span>
                  </div>
                  {s.error && <p className="br-error br-small">{s.error}</p>}
                </div>
                <button type="button" className="kt-btn is-small" onClick={() => navigate(s.url)}>
                  <Icon name="MessageSquare" size={13} />打开会话
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {note && <p className="br-hint">{note}</p>}
    </section>
  )
}

function BrainUseCard({ b, repo, go }: { b: RequirementDetail['brain']; repo: string; go: ViewProps['go'] }) {
  return (
    <section className="cto-card" aria-label="用到的 Brain">
      <div className="cto-chart-head"><h3>用到的 Brain</h3><span className="cto-dim">开工时带进来的、决定里引用的</span></div>
      <div className="br-row">
        <span className="kt-pill tone-info">载入 {b.loaded ?? '—'} 条</span>
        <span className="kt-pill tone-ok">引用 {b.cited.length} 条</span>
        {b.proposals !== null && <span className="kt-pill tone-handoff">提议 {b.proposals} 条新知识</span>}
      </div>
      <div className="br-row" aria-label="引用">
        <span className="br-dim br-small">引用</span>
        {b.cited.length ? b.cited.map((c) => <EntryChip key={c} id={c} repo={repo} go={go} />) : <span className="br-dim">—</span>}
      </div>
      {b.stale.length > 0 && (
        <div className="br-row" aria-label="过时">
          <span className="br-warn-text br-small">标成过时</span>
          {b.stale.map((c) => <EntryChip key={c} id={c} repo={repo} go={go} />)}
        </div>
      )}
      {b.unknown.length > 0 && (
        <div className="br-row" aria-label="不认识">
          <span className="br-bad-text br-small">Brain 里没有</span>
          {b.unknown.map((c) => <span key={c} className="br-tag br-mono">{c}</span>)}
        </div>
      )}
    </section>
  )
}
