/**
 * 需求详情: one requirement, between 交付总览 (every requirement) and its 需求看板 (how it went), as the sample's 交付详情
 * shows one delivery. First what to do now (此刻: who it waits on, since when, and the step right there: 打开会话,
 * 复制那一行, 开审查会话, 开工, 去 MR 上回答, 回写 Brain), then how long it took, where the time went (AI on this machine,
 * the runner, waiting for a person, done again), what it cost and what the checks say; the 价值流 on a time axis (图 /
 * 表格, every part and moment opens the board there); Lean's 11 stages and approvals; the decisions (each opens the
 * board at its stage); questions and answers (the answer form only where the person may answer here), the MR's 变更说明
 * (formatted, 复制 copies the Markdown), Lean's notes, the sessions, what the run used of the Brain and the timeline.
 * A requirement only claimed is one sentence and 开工; one that is not there says so and where to go.
 *
 * Polls GET /requirements/{repo}/{key} every 5 s, and the board's snapshot (GET /board/{repo}/{key}) for the value
 * stream (its actors' spans), the checks and the step; without a board the cards that need it say so.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { POLL_MS, paths, usePoll, useAction } from '../api'
import { PERSON, todoLeft, whoWord } from '../board/format'
import { isReview } from '../board/next'
import { RoleIcon } from '../board/RoleIcon'
import { Hit, Mini } from '../cto/charts'
import { ago, fmtCredits, fmtIso, fmtSpan, fmtTime, isoDay } from '../format'
import { VIEW_NAME, type BoardEntry, type ItemEntry } from '../nav'
import type {
  CheckCell, Decision, LeanSummary, OpenSessionBody, OpenSessionResult, ReqBoard, RequirementDetail, SessionRow, Stage,
  TimelineItem, TimelineKind, WaitDo, WaitWho, Waits,
} from '../types'
import { APPROVAL_META, Icon, LoadState, MrLink, STAGE_META, StateChip, TYPE_IT_YOURSELF, isOpenQuestion } from '../ui'
import {
  ACT, CHECK_GROUP_NAME, DECIDED_BY, DO_NAME, WHERE_NAME, approvalName, leanProgress, missingSourceName, sourceName, stageName, waitsOn,
} from '../vocab'
import { Inline } from './Markdown'
import type { ViewProps } from './props'
import { EntryChip, MrDescCard, QuestionCard, ReviewButton, useCopy } from './Question'
import { PART_LABEL, PART_VAR, StreamCard, splitOf, valueStream, type Part } from './Stream'
import { NotFound, ReqSwitch } from './ReqSwitch'

export { EntryChip, MR_DESC_COPY_HINT, MrDescCard, QuestionCard, mrDescSource } from './Question'
export { PART_LABEL, PART_VAR, valueStream, type Part, type StreamSeg } from './Stream'

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
.br-detail { container: br-detail / inline-size; }
.br-detail .br-detail-head { display: grid; gap: 12px; }
.br-detail .cto-item-head .kt-run-title { margin: 0; }
.br-detail .br-now { display: grid; gap: 8px; padding: 12px 16px; border-radius: 14px; border: 1px solid var(--border); background: var(--kt-glass); }
.br-detail .br-now.is-you { border-color: var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 7%, var(--card)); }
.br-detail .br-now-head { display: flex; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; }
.br-detail .br-now-head .cto-eyebrow { align-self: center; }
.br-detail .br-now-text { color: var(--text-strong); font-size: 1.08em; font-weight: 700; }
.br-detail .br-now p { margin: 0; color: var(--text); }
.br-detail .br-now-say { display: flex; align-items: center; gap: 8px 10px; flex-wrap: wrap; padding: 8px 10px; border-radius: 10px; border: 1px dashed color-mix(in srgb, var(--kt-approve) 55%, var(--border)); background: var(--card); }
.br-detail .br-now-say code { font-weight: 700; color: var(--text-strong); user-select: all; overflow-wrap: anywhere; flex: 1 1 260px; }
.br-detail .br-now-act { gap: 8px; }
.br-detail .br-now-act a.kt-btn { text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.br-detail .br-claimed-text { font-size: 1.7em; font-weight: 800; color: var(--text-strong); line-height: 1.25; margin: 4px 0 0; }
.br-detail .cto-item-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.br-detail .cto-item-cards > .cto-card { container-type: inline-size; }
.br-detail .cto-item-cards .cto-value { white-space: nowrap; font-size: min(2.85em, 14cqi); }
@container br-detail (max-width: 1180px) { .br-detail .cto-item-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container br-detail (max-width: 600px) { .br-detail .cto-item-cards { grid-template-columns: minmax(0, 1fr); } }
.br-detail .cto-segs i.is-skip { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted) 45%, transparent) 0 2px, transparent 2px 5px); box-shadow: none; }
.br-detail .cto-segs i.is-next, .br-detail .cto-segs i.is-todo { background: transparent; box-shadow: inset 0 0 0 1.5px var(--border-strong); }
.br-detail .cto-segs i.is-next { box-shadow: inset 0 0 0 2px var(--accent); }
.br-detail .cto-segs i.is-run { background: var(--kt-run); }
.br-detail .cto-segs i.is-wait { background: var(--kt-approve); }
.br-detail .cto-segs i.is-watch { background: color-mix(in srgb, var(--kt-ok) 45%, transparent); }
.br-detail .cto-chips button.cto-chip { cursor: pointer; padding: 0; font: inherit; }
.br-detail .br-twocol { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@container br-detail (max-width: 1100px) { .br-detail .br-twocol { grid-template-columns: minmax(0, 1fr); } }
.br-detail .br-col { display: grid; gap: 16px; min-width: 0; }
.br-detail :where(.br-col) > section.cto-card { border-radius: var(--kit-r); border: 1px solid var(--border); background-color: var(--card); padding: var(--kit-pad-block); margin: 0; }
.br-detail .br-detail-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 5px 22px; margin: 0; padding: 10px 14px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--kt-glass); }
.br-detail .br-detail-facts > div { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); gap: 8px; align-items: baseline; min-width: 0; }
.br-detail .br-detail-facts > details { grid-column: 1 / -1; }
.br-detail .br-detail-facts dt { font-size: .86em; }
.br-detail .br-detail-facts dd { overflow-wrap: anywhere; }
.br-detail :is(.br-path > span, .br-nowrap) { white-space: nowrap; }
.br-detail .br-rawlist { margin: 6px 0 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 12px; }
.br-detail .br-rawlist dd { margin: 0; overflow-wrap: anywhere; }
.br-detail .br-stagecells { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); gap: 4px; list-style: none; margin: 0; padding: 0; }
@container br-detail (max-width: 1100px) { .br-detail .br-stagecells { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
@container br-detail (max-width: 600px) { .br-detail .br-stagecells { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.br-detail .br-stagecell { position: relative; display: grid; gap: 2px; align-content: start; padding: 7px 8px 8px; border-radius: 10px; min-height: 64px;
  border: 2px solid color-mix(in srgb, var(--kt-tone) 70%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 12%, var(--card)); }
.br-detail .br-stagecell.is-done { background: var(--kt-ok-solid); border-color: color-mix(in srgb, var(--kt-ok) 75%, transparent); }
.br-detail .br-stagecell.is-done :is(.br-stage-n, .br-stage-label) { color: #fff; }
.br-detail .br-stagecell.is-done .br-stage-units .br-chip { color: #fff; background: rgba(255, 255, 255, .18); border-color: rgba(255, 255, 255, .4); }
.br-detail .br-stagecell.is-skipped { border-style: dashed; background: transparent; opacity: .7; }
.br-detail .br-stagecell.is-todo { border-style: dashed; background: transparent; border-color: var(--border-strong); }
.br-detail .br-stagecell.is-next { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent); }
.br-detail .br-stagecell.is-next .br-stage-n { color: var(--accent); }
.br-detail .br-stagecell.is-started { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 25%, transparent), 0 0 18px -6px var(--kt-run); }
.br-detail .br-stage-n { font-size: .74em; font-weight: 800; color: var(--muted); }
.br-detail .br-stage-label { font-size: .86em; font-weight: 750; color: var(--text-strong); line-height: 1.25; }
/* a unit's chip stays inside its tile (its state as a glyph, the words in its title): 11 tiles fit 1280 */
.br-detail .br-stagecell { grid-template-columns: minmax(0, 1fr); min-width: 0; }
.br-detail .br-stage-units { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; min-width: 0; }
.br-detail .br-stage-units .br-chip { display: block; font-size: .7em; padding: 0 6px; max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.br-detail .br-lean-sub { margin: 14px 0 6px; }
.br-detail .br-approvals { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.br-detail .br-approval { display: grid; gap: 6px; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); }
.br-detail .br-approval[data-state="pending"] { border-color: var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }
.br-detail .br-approval[data-state="approved"] { border-color: var(--kit-ok); }
.br-detail .br-approval .br-raw { margin-left: auto; }
.br-detail .cto-table td { vertical-align: top; }
.br-detail .br-dec td:last-child { white-space: nowrap; text-align: right; }
@container br-detail (max-width: 1100px) {
  .br-detail .br-dec thead { display: none; }
  .br-detail .br-dec, .br-detail .br-dec tbody { display: block; }
  .br-detail .br-dec tr { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; gap: 2px 12px; align-items: baseline; padding: 9px 12px; margin-bottom: 8px;
    border: 1px solid var(--border); border-radius: 12px; background: var(--kt-glass); }
  .br-detail .br-dec td { display: block; border: 0; padding: 0; min-width: 0; }
  .br-detail .br-dec td.br-key { grid-area: 1 / 1; }
  .br-detail .br-dec td[data-label="阶段"] { grid-area: 1 / 2; }
  .br-detail .br-dec td[data-label="谁定的"] { grid-area: 1 / 3; white-space: normal; }
  .br-detail .br-dec td[data-label="决定"] { grid-area: 2 / 1 / 3 / -1; color: var(--text-strong); }
  .br-detail .br-dec td[data-label="为什么"] { grid-area: 3 / 1 / 4 / -1; }
  .br-detail .br-dec td[data-label="引用 Brain"] { grid-area: 4 / 1 / 5 / 4; }
  .br-detail .br-dec td:last-child { grid-area: 4 / 4; text-align: right; }
  .br-detail .br-dec td[data-label="引用 Brain"] .br-dim { visibility: hidden; }
  .br-detail .br-dec td:is([data-label="为什么"], [data-label="谁定的"])::before { content: attr(data-label) '：'; color: var(--muted); font-size: .9em; }
}
.br-detail .br-vs { position: relative; margin-top: 10px; }
.br-detail .br-vs svg { display: block; width: 100%; overflow: visible; }
.br-detail .br-vs text { font-size: 12px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.br-detail .br-vs text.is-strong { fill: var(--text-strong); font-weight: 650; font-size: 12.5px; }
.br-detail .br-vs .br-vs-n circle { fill: var(--text-strong); stroke: var(--card); stroke-width: 1.5; }
.br-detail .br-vs .br-vs-n text { fill: var(--card); font-size: 10px; font-weight: 800; }
.br-detail .br-sessions { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.br-detail .br-session { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }
.br-detail .br-session .kt-role-icon { color: var(--text-strong); }
.br-detail .br-tl li { grid-template-columns: 3.4em 22px 1fr; }
.br-detail .br-tl .kt-role-icon { color: var(--muted); }
.br-detail .br-tl li[data-kind="merge"] .kt-role-icon, .br-detail .br-tl li[data-kind="approval"] .kt-role-icon, .br-detail .br-tl li[data-kind="human"] .kt-role-icon { color: var(--kt-ok); }
.br-detail .br-tl li[data-kind="blocked"] .kt-role-icon { color: var(--kt-warn); }
.br-detail .br-tl li[data-kind="handover"] .kt-role-icon { color: var(--kt-handoff); }
.br-detail .br-tlbox { max-height: 520px; overflow: auto; }
.br-detail .br-tl details summary { cursor: pointer; color: var(--muted); }
.br-detail .br-tlmissing { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.br-detail .br-dec td:is(.br-key, [data-label="阶段"], [data-label="谁定的"]) { white-space: nowrap; }
.br-detail .br-dec tr.is-picked { background: color-mix(in srgb, var(--kt-info) 12%, var(--card)); outline: 2px solid var(--kt-info); outline-offset: -2px; scroll-margin: 80px; }
`

// ------------------------------------------------------------------ what the page reads off the records

/** The requirement went to the team runner: its questions and approvals are answered on the MR from then on. */
function handedOver(x: RequirementDetail): boolean {
  return !!x.run?.handoff || ['handed_over', 'running', 'parked', 'acceptance'].includes(x.row.state)
}

/** Lean's progress the one way (vocab.leanProgress): the backend's counts, else counted from the stages. */
function leanOf(x: RequirementDetail): Required<Pick<LeanSummary, 'done_n' | 'skipped_n' | 'next'>> {
  const l = x.row.lean
  if (l.done_n !== undefined && l.skipped_n !== undefined && l.next !== undefined) return { done_n: l.done_n, skipped_n: l.skipped_n, next: l.next }
  const st = x.lean.stages
  const next = st.find((s) => s.state === 'started' || s.state === 'todo')
  return { done_n: st.filter((s) => s.state === 'done').length, skipped_n: st.filter((s) => s.state === 'skipped').length, next: next ? { id: next.id, label: next.label, n: next.n } : null }
}

const isoSec = (iso: string | null | undefined) => (iso && Number.isFinite(Date.parse(iso)) ? Date.parse(iso) / 1000 : null)

/** When the work began: brain start (the board's start event, else the run's own time), never the claim. */
function startOf(x: RequirementDetail, board: ReqBoard | null): number | null {
  return board?.events.find((e) => e.kind === 'start')?.at ?? isoSec(x.run?.created_at)
}

/** The step of an older backend without `waits.do`, from what it did send. */
function oldDo(x: RequirementDetail): WaitDo {
  const w = x.row.waits
  if (w.line) return 'approve'
  switch (x.row.state) {
    case 'claimed': return 'start'
    case 'acceptance': return 'accept'
    case 'parked': return 'answer'
    case 'rejected': return 'redo_handoff'
    case 'local':
      if (x.sessions.some((s) => s.kind === 'local' && s.awaiting)) return 'tool'
      return w.who === 'you' ? 'reply' : 'none'
    default: return 'none'
  }
}

interface Now {
  who: WaitWho
  do: WaitDo
  where: Waits['where']
  text: string
  line: string | null
  since: number | null
  sessionUrl: string | null
  mrUrl: string | null
  /** the open MR question (D-n) it waits on, and how it is answered: its options (A / B …), else approve / reject */
  question: string | null
  choices: string
  /** a refused hand-over: how to hand it over again, as the board's step says it (its reason line is the text already) */
  how: string | null
}

/** 此刻: one judgment (the backend's waits) with where to take the step. */
function nowOf(x: RequirementDetail, board: ReqBoard | null, live: SessionRow | null): Now {
  const w = x.row.waits
  const step = w.do ?? oldDo(x)
  const onMr = handedOver(x)
  const where = w.where !== undefined ? w.where
    : step === 'start' || step === 'write_back' ? 'app' : step === 'none' || step === 'watch' ? null : onMr ? 'mr' : 'session'
  const open = x.questions.find((q) => isOpenQuestion(q) && q.source !== 'park')
  return {
    who: w.who, do: step, where, text: w.text, line: w.line,
    since: w.since ?? (step === 'start' ? isoSec(x.claim?.created_at) : step === 'reply' ? live?.last_activity ?? null : null),
    sessionUrl: live?.url ?? null,
    mrUrl: board?.accept.step.mr_url ?? open?.mr_url ?? x.row.mr?.url ?? null,
    question: open?.id ?? null,
    choices: open?.options.length ? `选 ${open.options.map((o) => o.id).join(' / ')}` : 'approve / reject',
    how: step === 'redo_handoff' && board?.row.waits.do === 'redo_handoff' ? board.accept.step.text.split('\n').filter((l) => l && !l.startsWith('接手被拒')).join(' ') || null : null,
  }
}

/** Lean's next step when it is a review in a new session (the session that wrote the code may not review it), and
 * the line Lean wrote to say to that session. */
function reviewOf(next: string[]): { say: string | null } | null {
  const n = next[0] ?? ''
  if (!isReview(n)) return null
  const m = /说[:：]\s*「([^」]+)」/.exec(n)
  return { say: m ? m[1] : null }
}

/** The write-back branch brain reflect made for it (brain/<KEY>-reflect-<n>), if it did. */
function reflectBranch(x: RequirementDetail, board: ReqBoard | null): string | null {
  const texts = [...(board?.events ?? []).filter((e) => e.kind === 'reflect').map((e) => e.text), ...x.timeline.items.map((i) => `${i.label} ${i.detail ?? ''}`)]
  for (const t of texts) {
    const m = /brain\/[A-Za-z0-9._-]+-reflect-\d+/.exec(t)
    if (m) return m[0]
  }
  return null
}

// ------------------------------------------------------------------ the page

export function DetailView({ entry, onBack, onSwitch, ...props }: {
  entry: ItemEntry
  onBack?: () => void
  /** 切换需求: open another requirement here (default: a move to its 需求详情) */
  onSwitch?: (repo: string, key: string) => void
} & ViewProps) {
  const d = usePoll<RequirementDetail>(paths.requirement(entry.repo, entry.key), props.pollMs ?? POLL_MS)
  const b = usePoll<ReqBoard>(d.data ? paths.board(entry.repo, entry.key) : null, props.pollMs ?? POLL_MS)
  const [opened, setOpened] = useState<OpenSessionResult | null>(null)
  const from = VIEW_NAME[entry.from ?? 'overview']
  const after = () => {
    d.reload()
    props.reloadStatus()
  }
  const x = d.data
  const board = b.data
  const missing = !x && d.status === 404
  const repoInfo = props.status?.repos.find((r) => r.id === entry.repo) ?? null
  const live = x ? x.sessions.find((s) => s.kind === 'local' && !s.error) ?? null : null
  const toBoard = (more: Partial<BoardEntry> = {}) => props.go({ kind: 'board', repo: entry.repo, key: entry.key, from: 'item', ...more })
  // 回交付总览: back when that is where it was opened from (its filters kept), else a move there
  const toOverview = entry.from === 'overview' && onBack ? onBack : () => props.go({ kind: 'overview', ...(entry.repo !== 'runner' ? { repo: entry.repo } : {}) })
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
          {x && <button type="button" className="kt-btn is-primary" onClick={() => toBoard()}>需求看板 ↗</button>}
          {x && x.row.state === 'merged' && <button type="button" className="kt-btn" onClick={() => toBoard({ replay: true })}>▶ 回放 ↗</button>}
          {onBack && <button type="button" className="kt-btn" onClick={onBack}>← 返回{from}</button>}
        </div>
      </div>
      {missing ? <NotFound repoName={repoInfo?.name ?? null} reqKey={entry.key} onOverview={toOverview} testId="detail-missing" /> : <LoadState loading={d.loading} error={d.error} has={!!x} />}
      {x && (
        <Page x={x} board={board} live={live} entry={entry} props={props} opened={opened} localOnly={x.row.local_only ?? repoInfo?.remote === false}
          onOpened={(r) => { setOpened(r); after() }} after={after} toBoard={toBoard} />
      )}
    </main>
  )
}

function Page({ x, board, live, entry, props, opened, localOnly, onOpened, after, toBoard }: {
  x: RequirementDetail
  board: ReqBoard | null
  live: SessionRow | null
  entry: ItemEntry
  props: ViewProps
  opened: OpenSessionResult | null
  localOnly: boolean
  onOpened: (r: OpenSessionResult) => void
  after: () => void
  toBoard: (more?: Partial<BoardEntry>) => void
}) {
  const at = board?.at ?? Date.now() / 1000
  const now = nowOf(x, board, live)
  const started = x.row.state !== 'claimed' && !(x.row.state === 'closed' && !x.run)
  const onStart = () => props.go({ kind: 'new', repo: entry.repo, key: entry.key, title: x.row.title })
  if (!started) {
    return (
      <section className="br-detail-head" aria-label="需求">
        <Header x={x} localOnly={localOnly} />
        <Claimed x={x} now={now} at={at} onStart={onStart} />
        <Facts x={x} start={null} localOnly={localOnly} />
      </section>
    )
  }
  const canOpen = x.row.state === 'local' && !live
  const toAt = (t: number | null) => toBoard(t ? { at: Math.round(t) } : {})
  const scrollTo = (label: string) => document.querySelector(`[data-testid="br-detail"] [aria-label="${label}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  return (
    <>
      <section className="br-detail-head" aria-label="需求">
        <Header x={x} localOnly={localOnly} />
        <NowBar x={x} now={now} at={at} live={live} canOpen={canOpen} repo={entry.repo} reqKey={entry.key}
          onStart={onStart} onAnswer={() => scrollTo('问题和回答')} onBrain={() => props.go({ kind: 'brain', repo: entry.repo, reflect: entry.key })} />
        {(canOpen || opened) && <OpenSession repo={entry.repo} reqKey={entry.key} opened={opened} onOpened={onOpened} />}
        <Facts x={x} start={startOf(x, board)} localOnly={localOnly} />
      </section>
      <Cards x={x} board={board} at={at} localOnly={localOnly} replying={now.do === 'reply'} onBoard={toBoard} onSessions={() => scrollTo('会话')} />
      <StreamCard board={board} at={at} onAt={toAt} />
      <LeanCard x={x} sessionUrl={now.sessionUrl} mrUrl={now.mrUrl} />
      <DecisionsCard decisions={x.decisions} stages={x.lean.stages} repo={entry.repo} owner={x.row.owner} me={board?.person.me ?? false} go={props.go} onAt={toAt}
        picked={entry.decision ?? null} />
      <div className="br-twocol">
        <div className="br-col">
          <QuestionsCard x={x} repo={entry.repo} reqKey={entry.key} onAnswered={after} />
          <MrDescCard m={x.mr_desc} />
        </div>
        <div className="br-col">
          <NotesCard x={x} />
          <SessionsCard sessions={x.sessions} total={x.credits.total} note={x.credits.note} replying={now.do === 'reply'} at={at} />
          <BrainUseCard x={x} board={board} repo={entry.repo} reqKey={entry.key} go={props.go} />
          <TimelineCard x={x} showMissing={handedOver(x) && !localOnly} />
        </div>
      </div>
    </>
  )
}

function Header({ x, localOnly }: { x: RequirementDetail; localOnly: boolean }) {
  const r = x.row
  return (
    <header className="cto-item-head">
      <h2 className="kt-run-title">{r.title}</h2>
      <span className="kt-pill tone-info kt-mono">{r.key}</span>
      <StateChip state={r.state} label={r.state_label} who={r.waits.who} />
      {localOnly && (
        <span className="kt-pill tone-idle" data-testid="detail-local-only" title="这个仓库没有远端：不交给运行机，没有 MR，在本机做完、在本机合并">这个仓库只在本机做</span>
      )}
      <span className="cto-org">{r.owner ? `${r.owner} 的需求 · ` : ''}{WHERE_NAME[r.where] ?? x.where_label}</span>
    </header>
  )
}

/** A path that breaks only after a 「/」, never inside a name. */
function PathText({ path }: { path: string }) {
  const parts = path.split('/')
  return (
    <code className="br-path" title={path}>
      {parts.map((p, i) => <span key={i}><span>{i ? `/${p}` : p}</span><wbr /></span>)}
    </code>
  )
}

function Facts({ x, start, localOnly }: { x: RequirementDetail; start: number | null; localOnly: boolean }) {
  const r = x.row
  const run = x.run
  const raw = ([
    ['Lean intent', r.intent],
    ['Brain 提交', run?.brain_commit],
    ['材料包', run?.materials.join('、')],
    ['运行机的运行', r.run_ids.join('、')],
    ['认领分支', r.where === 'claim' ? `claim/${r.key}` : null],
    ['来源', x.claim?.source],
  ] as [string, string | null | undefined][]).filter((kv): kv is [string, string] => !!kv[1])
  return (
    <dl className="br-detail-facts" aria-label="基本信息">
      {r.branch && <div><dt>分支</dt><dd><code>{r.branch}</code></dd></div>}
      {r.worktree && <div><dt>工作目录</dt><dd><PathText path={r.worktree} /></dd></div>}
      {r.intent && <div><dt>Lean 记录</dt><dd><PathText path={`aidlc-docs/${r.intent}/`} /></dd></div>}
      {r.where !== 'claim' && (
        <div><dt>MR</dt><dd>{r.mr ? <MrLink mr={r.mr} /> : localOnly ? '这个仓库只在本机做，没有 MR' : '还没有：交接时开'}</dd></div>
      )}
      {x.claim && (
        <div>
          <dt>认领</dt>
          <dd>
            {x.claim.owner ?? '—'} · {fmtIso(x.claim.created_at)}{x.claim.source && <> · <span className="br-nowrap">来自{sourceName(x.claim.source)}</span></>}
            {x.claim.closed ? ` · 已关闭：${x.claim.closed}` : ''}
          </dd>
        </div>
      )}
      {run && (
        <div>
          <dt>开工</dt>
          <dd>
            {start ? fmtTime(start) : fmtIso(run.created_at)}
            {run.origin && <> · <span className="br-nowrap">{run.origin === 'local' ? '在本机开工' : `来自${sourceName(run.origin)}`}</span></>}
            {run.brain_commit && <> · <span className="br-nowrap">Brain 版本 <code title={run.brain_commit}>{run.brain_commit.slice(0, 8)}</code></span></>}
          </dd>
        </div>
      )}
      {run?.handoff && <div><dt>交接</dt><dd>{fmtIso(run.handoff.requested_at)}{run.handoff.by ? ` · ${run.handoff.by}` : ''}</dd></div>}
      {run && run.materials.length > 0 && <div><dt>带进来的文档</dt><dd>{run.materials.length} 份</dd></div>}
      {r.run_ids.length > 0 && <div><dt>运行机</dt><dd>跑了 {r.run_ids.length} 次</dd></div>}
      {r.expected_paths.length > 0 && <div><dt>要改的地方</dt><dd className="br-row">{r.expected_paths.map((p) => <code key={p}>{p}</code>)}</dd></div>}
      {r.overlap.length > 0 && <div><dt>重叠</dt><dd><span className="br-chip tone-warn">和 {r.overlap.join('、')} 改同一块</span></dd></div>}
      {raw.length > 0 && (
        <details className="br-raw">
          <summary>细节</summary>
          <dl className="br-rawlist">{raw.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd><code>{v}</code></dd></div>)}</dl>
        </details>
      )}
    </dl>
  )
}

// ------------------------------------------------------------------ 此刻

/** A requirement only claimed: one sentence, and 开工 for the person whose claim it is. */
function Claimed({ x, now, at, onStart }: { x: RequirementDetail; now: Now; at: number; onStart: () => void }) {
  const mine = now.who === 'you'
  const owner = x.row.owner ?? x.claim?.owner ?? '认领的人'
  const span = now.since ? fmtSpan(at - now.since) : null
  if (x.row.state === 'closed') {
    return (
      <section className="cto-card br-now" aria-label="此刻" data-testid="detail-waits">
        <div className="cto-eyebrow">此刻</div>
        <p className="br-claimed-text">认领已经关了，没有开工</p>
        {x.claim?.closed && <p className="cto-desc">{x.claim.closed}</p>}
      </section>
    )
  }
  return (
    <section className={`cto-card br-now${mine ? ' is-you' : ''}`} aria-label="此刻" data-testid="detail-waits">
      <div className="cto-eyebrow">此刻</div>
      <p className="br-claimed-text">{mine ? `认领了${span ? ` ${span}` : ''}，还没开工` : `等 ${owner} 开工`}</p>
      <p className="cto-desc">
        {mine
          ? '开工会在这台机器上建它的工作目录和分支，再开一个 brain-dev 会话。还没开工，所以没有周期、时间、成本、检查和记录。'
          : `${owner} 认领了${span ? ` ${span}` : ''}，还没开工。开工以后，这里有周期、时间、成本、检查和 Lean 的 11 个阶段。`}
      </p>
      {mine && (
        <div className="br-row br-now-act">
          <button type="button" className="kt-btn is-primary" onClick={onStart}>{ACT.start}</button>
          <span className="br-hint">在「开需求」里开工，需求号和标题已经带过去了</span>
        </div>
      )}
    </section>
  )
}

/**
 * 此刻: who it waits on, since when, what to do and where — with the step's button right there. A local run's
 * approval is a line the person types themselves (复制那一行, 打开会话); once handed over, it is an answer on the MR.
 */
function NowBar({ x, now, at, live, canOpen, repo, reqKey, onStart, onAnswer, onBrain }: {
  x: RequirementDetail
  now: Now
  at: number
  live: SessionRow | null
  canOpen: boolean
  repo: string
  reqKey: string
  onStart: () => void
  onAnswer: () => void
  onBrain: () => void
}) {
  const navigate = useNavigate()
  const line = useCopy(now.line ?? '')
  // Lean's next note says the line to say; without it, the waits' words still tell a review is next
  const review = now.do === 'reply' ? reviewOf(x.lean.next) ?? (isReview(now.text) ? { say: null } : null) : null
  const say = useCopy(review?.say ?? '')
  const mine = now.who === 'you'
  const person = !['agent', 'runner', 'bridge', 'nobody'].includes(now.who)
  const waited = person && now.since ? fmtSpan(at - now.since) : null
  const onMr = now.where === 'mr'
  const openSession = now.sessionUrl && !canOpen
    ? <button type="button" className={`kt-btn${review || onMr ? '' : ' is-primary'}`} onClick={() => navigate(now.sessionUrl as string)}><Icon name="MessageSquare" size={13} />{ACT.openSession}</button>
    : null
  const mrLink = now.mrUrl && /^https?:\/\//i.test(now.mrUrl)
    ? (
      <a className={`kt-btn${mine ? ' is-primary' : ''}`} href={now.mrUrl} target="_blank" rel="noopener noreferrer">
        {mine ? ACT.answerOnMr : '在 MR 上看'}{now.question ? ` ${now.question}` : ''} <Icon name="ExternalLink" size={12} />
      </a>
    )
    : null
  let body: ReactNode = null
  let acts: ReactNode = null
  switch (now.do) {
    case 'approve':
    case 'accept':
    case 'answer':
      if (onMr) {
        body = mine
          ? <p>{now.do === 'answer' ? '问题已经发到 MR 上了' : '交接以后，批准在 MR 上回答'}{now.question ? `：回答 ${now.question}` : ''}（{now.choices}）。</p>
          : <p>{waitsOn(now.who)}在 MR 上回答{now.question ? ` ${now.question}` : ''}，你不用做什么；回答以后运行机接着做。</p>
        acts = mrLink
      } else if (now.line) {
        body = (
          <div className="br-now-say" data-testid="now-line">
            <code>{now.line}</code>
            <button type="button" className="kt-btn is-small is-primary" onClick={() => void line.copy()}><Icon name="Copy" size={13} />{ACT.copyLine}</button>
            {line.copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制</span>}
            {line.copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请手动选中这一行</span>}
          </div>
        )
        acts = <>{openSession}<span className="br-hint">{TYPE_IT_YOURSELF}</span></>
      } else {
        acts = <><button type="button" className="kt-btn is-primary" onClick={onAnswer}>{DO_NAME.answer} ↓</button>{openSession}</>
      }
      break
    case 'reply':
      if (review) {
        body = (
          <>
            <p>Lean 的下一步是审查：写代码的会话不能自己审，要开一个新会话来审{review.say ? '，对它说：' : '。'}</p>
            {review.say && (
              <div className="br-now-say" data-testid="now-say">
                <code>{review.say}</code>
                <button type="button" className="kt-btn is-small" onClick={() => void say.copy()}><Icon name="Copy" size={13} />复制那一句</button>
                {say.copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制</span>}
                {say.copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请手动选中</span>}
              </div>
            )}
          </>
        )
        acts = <><ReviewButton repo={repo} reqKey={reqKey} liveSlot={live?.slot ?? null} worktree={x.row.worktree} />{openSession}</>
      } else {
        body = x.lean.next[0] ? <p>Lean 记下的下一步：<Inline text={x.lean.next[0]} /></p> : null
        acts = openSession
      }
      break
    case 'tool':
    case 'redo_handoff':
      body = (
        <div>
          <p>做什么：{now.do === 'tool' ? '在会话里批准这个工具调用。' : now.how ?? `${DO_NAME.redo_handoff}（在会话里改，再交接一次）。`}</p>
          {x.row.waits.raw && <details className="br-raw"><summary>细节</summary><pre>{x.row.waits.raw}</pre></details>}
        </div>
      )
      acts = openSession
      break
    case 'label_handoff':
      body = <p>做什么：{DO_NAME.label_handoff}（在 MR 上加交接标签）。</p>
      acts = now.mrUrl ? <a className="kt-btn is-primary" href={now.mrUrl} target="_blank" rel="noopener noreferrer">去 MR 上看 <Icon name="ExternalLink" size={12} /></a> : null
      break
    case 'start':
      acts = mine ? <button type="button" className="kt-btn is-primary" onClick={onStart}>{ACT.start}</button> : null
      break
    case 'write_back':
      acts = <button type="button" className="kt-btn is-primary" onClick={onBrain}>{ACT.writeBack} ↗</button>
      break
    default:
  }
  return (
    <section className={`br-now${mine ? ' is-you' : ''}`} aria-label="此刻" data-testid="detail-waits" data-do={now.do}>
      <div className="br-now-head">
        <span className="cto-eyebrow">此刻</span>
        {person && <span className={`br-chip tone-${mine ? 'wait' : 'idle'}`}>{waitsOn(now.who)}</span>}
        <span className="br-now-text">{now.text || '—'}</span>
        {waited && <span className="br-dim">已等 {waited}</span>}
      </div>
      {body}
      {acts && <div className="br-row br-now-act">{acts}</div>}
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
            <Icon name="MessageSquare" size={13} />{ACT.openSession}
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

// ------------------------------------------------------------------ the four numbers

/** The checks not reached yet, by name: the backend's list, else the approvals still ahead. */
function todoOf(w: ReqBoard['checks']): string[] {
  return w.todo ? todoLeft(w) : w.cells.filter((c) => c.status === 'skip' && c.group === 'gate').map((c) => c.name.replace(/（[^）]*）$/, ''))
}

const cellName = (c: CheckCell) => c.name.replace(/（[^）]*）$/, '')

/** The four numbers of one requirement (the sample's 交付详情 cards): 周期, 时间花在哪, 成本, 检查. */
function Cards({ x, board, at, localOnly, replying, onBoard, onSessions }: {
  x: RequirementDetail
  board: ReqBoard | null
  at: number
  localOnly: boolean
  replying: boolean
  onBoard: (more?: Partial<BoardEntry>) => void
  onSessions: () => void
}) {
  const start = startOf(x, board)
  const end = board?.ended_at ?? null
  const lean = leanOf(x)
  const segs = board ? valueStream(board, at) : []
  const split = splitOf(segs)
  const busy = split.filter((s) => s.p !== 'person').reduce((a, s) => a + s.s, 0)
  const waits = segs.filter((s) => s.part === 'person')
  const sent = board ? board.events.filter((e) => e.kind === 'reject' || e.kind === 'rejected').length : 0
  const blocked = board ? board.events.filter((e) => e.kind === 'blocked').length : 0
  const toPart = (p: Part) => (p === 'person' && waits[0] ? onBoard({ at: Math.round(waits[0].from) }) : onBoard({ focus: 'lanes' }))
  return (
    <section className="cto-cards cto-item-cards" aria-label="这个需求的四个数">
      <article className="cto-card" aria-label="周期">
        <div className="cto-eyebrow">周期</div>
        <div className="cto-value" data-testid="item-cycle">{start ? fmtSpan((end ?? at) - start) : '—'}</div>
        <div className="cto-desc">{start ? `${fmtTime(start)} 开工` : '开工时间没记下'}{end ? ` → ${fmtTime(end)} 合并` : ' → 进行中'}</div>
        <div className="kt-segs cto-segs" role="img" aria-label={`Lean：${leanProgress(lean)}`}>
          {x.lean.stages.map((s) => (
            <i key={s.id} title={`${s.n} ${s.label} · ${lean.next?.n === s.n && s.state === 'todo' ? '下一步' : STAGE_META[s.state]?.label ?? s.state}`}
              className={s.state === 'done' ? 'is-pass' : s.state === 'skipped' ? 'is-skip' : s.state === 'started' ? 'is-run' : lean.next?.n === s.n ? 'is-next' : 'is-todo'} />
          ))}
        </div>
        <div className="cto-legend"><span data-testid="lean-progress">Lean {leanProgress(lean)}</span></div>
      </article>
      <article className="cto-card" aria-label="时间花在哪">
        <div className="cto-eyebrow">时间花在哪</div>
        <div className="cto-value">{board ? fmtSpan(busy) : '—'}</div>
        <div className="cto-desc">{board ? `AI 在做 · 等人 ${fmtSpan(split.find((s) => s.p === 'person')!.s)}${waits.length ? `（${waits.length} 段）` : ''}` : '看板的数据还没来'}</div>
        {board && <SplitBar split={split} />}
        {board && (
          <div className="cto-legend">
            {split.filter((s) => s.s > 0).map(({ p, s }) => (
              <button type="button" key={p} onClick={() => toPart(p)} title={p === 'person' ? '到看板上第一次等人的那一刻' : '在需求看板的泳道上看'}>
                <i className="cto-sw" style={{ background: PART_VAR[p] }} />{PART_LABEL[p]}<b>{fmtSpan(s)}</b>
              </button>
            ))}
          </div>
        )}
      </article>
      <CostCard x={x} replying={replying} onSessions={onSessions} />
      <ChecksCard board={board} localOnly={localOnly} sent={sent} blocked={blocked} onBoard={onBoard} />
    </section>
  )
}

/** a session chip of the cost card by its state's tone: its look, its legend word and swatch */
const CHIP: Record<string, { cls: string; label: string; sw: string }> = {
  bad: { cls: ' is-back', label: '出错', sw: 'var(--vs-rework)' },
  wait: { cls: ' is-wait', label: '等人', sw: 'var(--vs-person)' },
  run: { cls: '', label: '在做', sw: 'var(--kt-ok-solid)' },
  idle: { cls: ' is-idle', label: '空着', sw: 'var(--border-strong)' },
}

function CostCard({ x, replying, onSessions }: { x: RequirementDetail; replying: boolean; onSessions: () => void }) {
  const ss = x.sessions
  const tones = [...new Set(ss.map((s) => sessionState(s, replying).tone))]
  return (
    <article className="cto-card" aria-label="成本">
      <div className="cto-eyebrow">成本</div>
      <div className="cto-value">{x.credits.total !== null ? <>{fmtCredits(x.credits.total)}<span className="cto-of">credits</span></> : <span className="cto-of" style={{ marginLeft: 0 }}>还没有</span>}</div>
      <div className="cto-desc">{ss.length ? `${ss.length} 个会话` : '还没开过会话'}</div>
      {ss.length > 0 && (
        <>
          <div className="cto-chips" aria-label="会话">
            {ss.map((s) => {
              const st = sessionState(s, replying)
              return (
                <button type="button" key={s.slot} className={`cto-chip${CHIP[st.tone].cls}`} title={`${s.title} · ${st.label} · ${fmtCredits(s.credits)} credits`} onClick={onSessions}>
                  <RoleIcon role={s.kind === 'runner' ? 'runner' : 'laptop'} size={16} />
                </button>
              )
            })}
          </div>
          <div className="cto-legend">
            {tones.map((t) => <span key={t}><i className="cto-dot" style={{ background: CHIP[t].sw }} />{CHIP[t].label}</span>)}
          </div>
          <div className="cto-foot"><button type="button" className="cto-link" onClick={onSessions}>看每个会话的用量 ↓</button></div>
        </>
      )}
    </article>
  )
}

function ChecksCard({ board, localOnly, sent, blocked, onBoard }: {
  board: ReqBoard | null
  localOnly: boolean
  sent: number
  blocked: number
  onBoard: (more?: Partial<BoardEntry>) => void
}) {
  const raw = board?.checks
  // the 14 days after the merge are watched, nobody's turn (an older backend says wait)
  const w = raw && { ...raw, cells: raw.cells.map((c) => (c.group === 'after' && c.status === 'wait' ? { ...c, status: 'watch' as const } : c)) }
  const todo = w ? todoOf(w) : []
  const failed = w ? w.cells.filter((c) => c.status === 'fail').map(cellName) : []
  const waiting = w ? w.cells.filter((c) => c.status === 'wait').map(cellName) : []
  const watching = w ? w.cells.filter((c) => c.status === 'watch').map(cellName) : []
  const shown = w ? w.cells.filter((c) => c.status !== 'not_needed' && c.status !== 'skip' && !(localOnly && c.group === 'handover')) : []
  const ahead = w ? w.cells.filter((c) => c.status === 'skip' && todo.includes(cellName(c))) : []
  const groups = [...new Set([...shown, ...ahead].map((c) => CHECK_GROUP_NAME[c.group] ?? c.group))]
  const ok = !!w && w.total > 0 && w.passed === w.total && !todo.length && !waiting.length
  const say = !w ? '看板的数据还没来'
    : w.total === 0 && !todo.length ? '还没有检查结果'
      : [failed.length ? `没过：${failed.join('、')}` : `目前 ${w.passed} 项都过`, waiting.length ? `${board && PERSON.has(board.row.waits.who) ? whoWord(board.row.waits.who, board.person.owner) : '等人'}：${waiting.join('、')}` : '',
        watching.length ? `观察中：${watching.join('、')}` : '', todo.length ? `还剩 ${todo.join('、')}` : '']
        .filter(Boolean).join(' · ')
  return (
    <article className={`cto-card${w && w.total ? (w.failed ? ' is-bad' : ok ? ' is-ok' : '') : ''}`} aria-label="检查">
      <div className="cto-eyebrow">检查</div>
      <div className="cto-value">{w && w.total ? <>{w.passed}<span className="cto-of">/{w.total}</span></> : w ? <span className="cto-of" style={{ marginLeft: 0 }}>还没有</span> : '—'}</div>
      <div className="cto-desc" data-testid="checks-say">{say}</div>
      {w && shown.length + ahead.length > 0 && (
        <button type="button" className="kt-segs cto-segs" aria-label="在需求看板的检查墙上看每一项" onClick={() => onBoard({ focus: 'checks' })}>
          {[...shown, ...ahead].map((c) => (
            <i key={c.id} title={`${cellName(c)}：${c.detail}`}
              className={c.status === 'pass' ? 'is-pass' : c.status === 'fail' ? 'is-fail' : c.status === 'wait' ? 'is-wait' : c.status === 'watch' ? 'is-watch' : 'is-todo'} />
          ))}
        </button>
      )}
      {groups.length > 0 && <div className="cto-legend"><span className="cto-dim">查的是：{groups.join(' · ')}</span></div>}
      <div className="cto-legend"><span><RoleIcon role="bounce" size={14} />退回 {sent} 次 · Lean 拦下 {blocked} 次</span></div>
    </article>
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

// ------------------------------------------------------------------ Lean

function LeanCard({ x, sessionUrl, mrUrl }: { x: RequirementDetail; sessionUrl: string | null; mrUrl: string | null }) {
  const { stages, approvals } = x.lean
  const lean = leanOf(x)
  const onMr = handedOver(x)
  const navigate = useNavigate()
  return (
    <section className="cto-card" aria-label="Lean 进度">
      <div className="cto-chart-head">
        <h3>AI-DLC Lean</h3>
        <span className="cto-dim">{leanProgress(lean)} · {onMr ? '交接以后，审批在 MR 上回答' : '审批的那一行由你在会话里自己打，app 不替你发'}</span>
      </div>
      <ol className="br-stagecells" aria-label="11 个阶段">
        {stages.map((s) => <StageCell key={s.id} s={s} next={lean.next?.n === s.n && s.state === 'todo'} />)}
      </ol>
      <h3 className="br-lean-sub">审批</h3>
      {approvals.length === 0 ? <p className="br-empty">还没有审批。</p> : (
        <ul className="br-approvals" aria-label="审批">
          {approvals.map((a, i) => {
            const m = APPROVAL_META[a.state] ?? { label: a.state, tone: 'idle' }
            const q = x.questions.find((qq) => qq.lean_request?.startsWith(a.kind) && qq.source !== 'park')
            const url = q?.mr_url ?? mrUrl
            const unit = /\/([^/]+)-code-generation-plan\.md$/.exec(a.path ?? '')?.[1]
            return (
              <li key={`${a.kind}-${a.sha8 ?? i}`} className="br-approval" data-testid="approval" data-state={a.state}>
                <div className="br-row">
                  <RoleIcon role={a.kind === 'RELEASE' ? 'release' : a.kind === 'REQUIREMENTS' ? 'req' : 'design'} size={16} />
                  <b>{approvalName(a.kind)}{unit ? ` · ${unit}` : ''}</b>
                  <span className={`br-chip tone-${m.tone}`}>{a.state === 'pending' && onMr ? '在 MR 上等回答' : m.label}</span>
                  {a.at !== null && <span className="br-dim br-small">{fmtTime(a.at)}</span>}
                  <details className="br-raw">
                    <summary>细节</summary>
                    <code>{[a.kind, a.sha8, a.path].filter(Boolean).join(' · ')}</code>
                  </details>
                </div>
                {a.state === 'pending' && (onMr
                  ? (
                    <p className="br-note">
                      在 MR 上回答{q?.id ? ` ${q.id}` : ''}（approve / reject），这里不能回答。
                      {url && /^https?:\/\//i.test(url) && <> <a className="br-link" href={url} target="_blank" rel="noopener noreferrer">{ACT.answerOnMr} <Icon name="ExternalLink" size={12} /></a></>}
                    </p>
                  )
                  : a.line && <ApprovalLine line={a.line} sessionUrl={sessionUrl} onOpen={(u) => navigate(u)} />)}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** A pending approval's line, typed by the person themselves in the session: 复制那一行, 打开会话. */
function ApprovalLine({ line, sessionUrl, onOpen }: { line: string; sessionUrl: string | null; onOpen: (url: string) => void }) {
  const { copied, copy } = useCopy(line)
  return (
    <div className="br-line" data-testid="type-line">
      <code className="br-mono">{line}</code>
      <div className="br-row">
        <button type="button" className="br-btn is-small" onClick={() => void copy()}><Icon name="Copy" size={13} />{ACT.copyLine}</button>
        {sessionUrl && <button type="button" className="br-btn is-small" onClick={() => onOpen(sessionUrl)}><Icon name="MessageSquare" size={13} />{ACT.openSession}</button>}
        {copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制</span>}
        {copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请手动选中这一行</span>}
      </div>
      <p>{TYPE_IT_YOURSELF}</p>
    </div>
  )
}

function StageCell({ s, next }: { s: Stage; next: boolean }) {
  const m = STAGE_META[s.state] ?? STAGE_META.todo
  const label = next ? '下一步' : m.label
  return (
    <li className={`br-stagecell is-${s.state}${next ? ' is-next' : ''} tone-${m.tone === 'wait' ? 'approve' : m.tone}`} data-testid="stage" data-state={s.state} title={s.note ?? label}>
      <span className="br-stage-n">{s.n} · {label}</span>
      <span className="br-stage-label">{s.label}<span className="br-sr">（{label}）</span></span>
      {s.units.length > 0 && (
        <span className="br-stage-units">
          {s.units.map((u) => {
            const um = STAGE_META[u.state] ?? STAGE_META.todo
            return <span key={u.unit} className={`br-chip tone-${um.tone}`} title={`${u.unit} · ${um.label}`}><span aria-hidden="true">{um.glyph}</span> {u.unit}<span className="br-sr"> · {um.label}</span></span>
          })}
        </span>
      )}
    </li>
  )
}

// ------------------------------------------------------------------ decisions, questions, notes

/** Who settled a decision, in words: the owner (you, when it is you), a person by their pseudonym, the Brain entries,
 * the AI itself, a check, the bridge; a Who cell outside brain-kit's vocabulary stays 没归类 (never a guessed name). */
function decidedBy(d: Decision, owner: string | null, me: boolean): string {
  // a person other than the owner is a pseudonym (brain-kit never writes a real name): 一位组员, as 需求看板 says it
  if (d.by === 'person') return d.who === 'owner' ? (me ? '你（负责人）' : `负责人${owner ? ` ${owner}` : ''}`) : d.who ? '一位组员' : '人'
  if (d.by === 'brain') return `${DECIDED_BY.brain}${d.who ? ` ${d.who}` : ''}`
  if (d.by) return DECIDED_BY[d.by] ?? d.by
  return d.who ?? '—'
}

function DecisionsCard({ decisions, stages, repo, owner, me, go, onAt, picked }: {
  decisions: Decision[]
  stages: Stage[]
  repo: string
  owner: string | null
  me: boolean
  go: ViewProps['go']
  onAt: (t: number | null) => void
  /** the decision the page was opened at (?decision=): scrolled to and picked out */
  picked: string | null
}) {
  const people = decisions.filter((d) => d.by === 'person').length
  const atOf = (d: Decision) => stages.find((s) => s.id === d.stage)?.at ?? null
  const pickedRow = useRef<HTMLTableRowElement | null>(null)
  const found = !!picked && decisions.some((d) => d.id === picked)
  useEffect(() => {
    if (found) pickedRow.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [found])
  return (
    <section className="cto-card" aria-label="决定">
      <div className="cto-chart-head">
        <h3>决定</h3>
        <span className="cto-dim">{decisions.length} 条 · 人定了 {people} 条 · 每一条都能在需求看板上看它那个阶段 · 引用的 Brain 条目点开看</span>
      </div>
      {picked && !found && decisions.length > 0 && <p className="br-note br-small" role="status">这个需求的决定里没有 {picked}：决定记录可能改过了，下面是现在的样子。</p>}
      {decisions.length === 0 ? <p className="br-empty">还没有记下决定。</p> : (
        <table className="cto-table br-dec">
          <thead>
            <tr><th>编号</th><th>阶段</th><th>决定</th><th>为什么</th><th>谁定的</th><th>引用 Brain</th><th /></tr>
          </thead>
          <tbody>
            {decisions.map((dd) => {
              const t = atOf(dd)
              const tip = [
                dd.by === 'unclassified' ? '「谁定的」那一格不是规定的写法：没归类，也不猜是谁' : '',
                dd.by === 'person' && dd.who && dd.who !== 'owner' ? `化名 ${dd.who}：brain-kit 不写真名` : '',
                dd.vouchers.length ? `凭证 ${dd.vouchers.join('、')}` : '',
              ].filter(Boolean).join('；')
              return (
                <tr key={dd.id} data-testid="decision" data-decision={dd.id} ref={dd.id === picked ? pickedRow : undefined}
                  className={dd.id === picked ? 'is-picked' : undefined} aria-current={dd.id === picked ? 'true' : undefined}>
                  <td className="br-key" data-label="编号" title={[dd.date, dd.src].filter(Boolean).join(' · ')}>{dd.id}</td>
                  <td className="br-dim" data-label="阶段">{stageName(dd.stage) || '—'}</td>
                  <td data-label="决定"><Inline text={dd.text} /></td>
                  <td className="br-dim" data-label="为什么">{dd.why ? <Inline text={dd.why} /> : '—'}</td>
                  <td data-label="谁定的" title={tip || undefined}>{decidedBy(dd, owner, me)}</td>
                  <td data-label="引用 Brain"><span className="br-row" style={{ gap: 4 }}>{dd.cites.length ? dd.cites.map((c) => <EntryChip key={c} id={c} repo={repo} go={go} />) : <span className="br-dim">—</span>}</span></td>
                  <td><button type="button" className="cto-link" onClick={() => onAt(t)} title={t ? `看板回放到 ${fmtTime(t)}` : '打开需求看板'}>{ACT.onBoard}</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

function QuestionsCard({ x, repo, reqKey, onAnswered }: { x: RequirementDetail; repo: string; reqKey: string; onAnswered: () => void }) {
  // questions asked straight in the session (「Q1 选 A」 in decisions.md) are not park.json's or the MR's
  const asked = x.decisions.flatMap((d) => [...d.text.matchAll(/\bQ(\d+)\b/g)].map((m) => ({ q: `Q${m[1]}`, d: d.id })))
  const qs = [...new Set(asked.map((a) => a.q))]
  const ds = [...new Set(asked.map((a) => a.d))]
  return (
    <section className="cto-card" aria-label="问题和回答">
      <div className="cto-chart-head"><h3>问题和回答</h3><span className="cto-dim">{x.questions.length} 个 · 能在这里回答的才有回答框</span></div>
      {x.questions.length === 0 ? (
        <p className="br-empty">
          {qs.length
            ? `问题都是在会话里直接问的（${qs.join('、')}），回答记在决定 ${ds.join('、')} 里。这里只列停下来等回答的和 MR 上的问题。`
            : '没有停下来问过人。'}
        </p>
      ) : (
        <div className="br-stack">
          {x.questions.map((q, i) => <QuestionCard key={`${q.id ?? 'q'}-${i}`} q={q} repo={repo} reqKey={reqKey} onAnswered={onAnswered} />)}
        </div>
      )}
    </section>
  )
}

function NotesCard({ x }: { x: RequirementDetail }) {
  const { status, next, open_questions } = x.lean
  return (
    <section className="cto-card" aria-label="会话记录">
      <div className="cto-chart-head"><h3>会话记录</h3><span className="cto-dim">Lean 记下的现状和下一步</span></div>
      {status ? <p className="br-pre br-strong" style={{ margin: 0 }}><Inline text={status} /></p> : <p className="br-empty">还没有写。</p>}
      {next.length > 0 && (
        <div>
          <b className="br-strong">下一步</b>
          <ul className="br-list">{next.map((n, i) => <li key={i}><Inline text={n} /></li>)}</ul>
        </div>
      )}
      {open_questions.length > 0 && (
        <div>
          <b className="br-strong">没解决的问题</b>
          <ul className="br-list">{open_questions.map((n, i) => <li key={i}><Inline text={n} /></li>)}</ul>
        </div>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ sessions, the Brain, the timeline

function sessionState(s: SessionRow, replying: boolean): { label: string; tone: string } {
  if (s.error) return { label: '出错', tone: 'bad' }
  if (s.awaiting) return { label: '等批准', tone: 'wait' }
  if (s.busy) return { label: '在做', tone: 'run' }
  if (replying && s.kind === 'local') return { label: '等你回话', tone: 'wait' }
  return { label: '空着', tone: 'idle' }
}

function SessionsCard({ sessions, total, note, replying, at }: { sessions: SessionRow[]; total: number | null; note: string; replying: boolean; at: number }) {
  const navigate = useNavigate()
  return (
    <section className="cto-card" aria-label="会话">
      <div className="cto-chart-head"><h3>会话</h3><span className="cto-dim" title={note || undefined}>这个 app 开的 · 合计 {fmtCredits(total)} credits</span></div>
      {sessions.length === 0 ? <p className="br-empty">还没开过会话。</p> : (
        <ul className="br-sessions">
          {sessions.map((s) => {
            const st = sessionState(s, replying)
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
                    <span>最近活动：{ago(s.last_activity, at)}</span>
                  </div>
                  {s.error && <p className="br-error br-small">{s.error}</p>}
                </div>
                <button type="button" className="kt-btn is-small" onClick={() => navigate(s.url)}>
                  <Icon name="MessageSquare" size={13} />{ACT.openSession}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function BrainUseCard({ x, board, repo, reqKey, go }: { x: RequirementDetail; board: ReqBoard | null; repo: string; reqKey: string; go: ViewProps['go'] }) {
  const b = x.brain
  const branch = b.proposals ? reflectBranch(x, board) : null
  const toReflect = () => go({ kind: 'brain', ...(repo !== 'runner' ? { repo } : {}), reflect: reqKey })
  return (
    <section className="cto-card" aria-label="用到的 Brain">
      <div className="cto-chart-head"><h3>用到的 Brain</h3><span className="cto-dim">开工时带进来的、决定里引用的</span></div>
      <div className="br-row">
        <span className="kt-pill tone-info">载入 {b.loaded ?? '—'} 条</span>
        <span className="kt-pill tone-ok">引用 {b.cited.length} 条</span>
      </div>
      {b.proposals !== null && b.proposals > 0 && (
        <div className="br-row" data-testid="brain-proposals">
          <span>
            提议 {b.proposals} 条新知识：{branch ? <>已写到回写分支 <code>{branch}</code>，等合并</> : '还没回写到 Brain'}
          </span>
          <button type="button" className="cto-link" onClick={toReflect}>在 Brain 里看 ↗</button>
        </div>
      )}
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

/** The local time of an ISO time (14:05), or "—". */
function clock(iso: string | null): string {
  if (!iso) return '—'
  const t = fmtIso(iso)
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t) ? t.slice(11) : '—'
}

const PSEUDONYM = /^[A-Z]-[0-9A-F]{4,}$/

/** An item of the timeline in words: the app's own records said plainly (no slot ids, commands or flags). */
function itemText(it: TimelineItem): { label: string; detail: string | null; title: string | null } {
  const reflect = /^brain reflect --apply( --push)?：(.+)$/.exec(it.label)
  if (reflect) return { label: `回写 Brain${reflect[1] ? '并推送' : ''}：${reflect[2]}`, detail: it.detail ? `分支 ${it.detail}` : null, title: it.label }
  if (it.label === '开了 brain-dev 会话') return { label: it.label, detail: it.detail?.includes('信任') ? '工具调用不用逐个批准' : null, title: it.detail }
  if (it.kind === 'commit' && it.detail && /^[0-9a-f]{7,40}$/.test(it.detail)) return { label: it.label, detail: it.detail.slice(0, 8), title: it.detail }
  if (it.detail && /^claim\/\S+ 推到 origin$/.test(it.detail)) return { label: it.label, detail: '认领推到了远端', title: it.detail }
  return { label: it.label, detail: it.detail ? it.detail.replace(/^工作区 /, '工作目录 ') : null, title: null }
}

function TimelineCard({ x, showMissing }: { x: RequirementDetail; showMissing: boolean }) {
  const t = x.timeline
  const items = [...t.items].sort((a, b) => (isoSec(b.at) ?? 0) - (isoSec(a.at) ?? 0))
  const days = new Map<string, TimelineItem[]>()
  for (const it of items) {
    const day = isoDay(it.at) ?? '没有时间'
    days.set(day, [...(days.get(day) ?? []), it])
  }
  // the backend says each source in Chinese, with why; an older one sent brain-kit's English (named here, kept under 细节)
  const english = t.missing.filter((m) => !/[\u4e00-\u9fff]/.test(m))
  const missing = [...new Set(t.missing.map((m) => (english.includes(m) ? missingSourceName(m) : m)))]
  return (
    <section className="cto-card" aria-label="时间线">
      <div className="cto-chart-head">
        <h3>时间线</h3>
        <span className="cto-dim">最新的在上面 · {t.source === 'trace' ? 'brain-kit 记下的' : 'app 从 Lean 记录和提交拼的'}</span>
      </div>
      {t.error && (
        <div className="br-note" role="status">
          <p style={{ margin: 0 }}>这个需求的记录有一部分读不出来，下面只列读到的。</p>
          <p className="br-hint">做什么：等一会儿它会自己再读；一直这样的话，把细节里的原话发给维护 app 的人。</p>
          <details className="br-raw"><summary>细节</summary><pre>{t.error}</pre></details>
        </div>
      )}
      <div className="br-tlbox">
        {items.length === 0 ? <p className="br-empty">还没有记录。</p> : [...days.entries()].map(([day, list]) => (
          <div key={day}>
            <p className="br-day">{day}</p>
            <ol className="br-tl">
              {list.map((it, i) => {
                const k = KIND_META[it.kind] ?? { icon: 'commit', label: it.kind }
                const s = itemText(it)
                const long = !!s.detail && s.detail.length > 60
                const who = it.who && !PSEUDONYM.test(it.who) ? it.who : null
                return (
                  <li key={i} data-testid="tl-item" data-kind={it.kind} title={[s.title, it.who && !who ? `化名 ${it.who}` : null].filter(Boolean).join(' · ') || undefined}>
                    <time>{clock(it.at)}</time>
                    <span title={k.label}><RoleIcon role={k.icon} size={16} /><span className="br-sr">{k.label}</span></span>
                    <span>
                      <span className="br-strong">{s.label}</span>
                      {s.detail && !long && <span className="br-dim"> · {s.detail}</span>}
                      {who && <span className="br-dim br-small"> · {who}</span>}
                      {long && <details><summary className="br-small">看说明</summary><span className="br-dim br-small"><Inline text={s.detail} /></span></details>}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>
      {showMissing && missing.length > 0 && (
        <div className="br-note br-small br-tlmissing">
          时间线里缺这些记录：{missing.join('；')}
          {english.length > 0 && <details className="br-raw"><summary>细节</summary><pre>{english.join('\n')}</pre></details>}
        </div>
      )}
    </section>
  )
}
