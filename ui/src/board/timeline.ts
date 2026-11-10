/**
 * 回放: a requirement played again (the sample team board's timeline.ts). The board at any moment *t*, rebuilt from the
 * snapshot itself: each actor's status history, its spans and marks up to *t*, the events, the conveyor, the check
 * cells decided by then, Lean's stages from its stage events, whom it waited for then. What has no time of its own (the
 * decisions, what the Brain was cited for, credits) is not shown until the end. Pure: the same snapshot and *t* always
 * give the same board, so the replay can be scrubbed.
 *
 * A requirement takes hours or days with long quiet gaps (a night, a wait for a person): the replay's clock is
 * compressed — every quiet gap plays as at most GAP_S — so what happened is what plays, and the bar still says the
 * real time.
 */
import type { ActorStatus, CheckCell, ReqBoard, ReqState, WaitWho } from '../types'
import { leanFromEvents } from './format'

export interface ReplaySpan {
  start: number
  end: number
}

/** A quiet gap between two events plays as at most this many seconds of the requirement's time. */
export const GAP_S = 900

/** When the requirement happened: its first event to its end (or its last event). */
export function replaySpan(b: ReqBoard): ReplaySpan {
  const ats = b.events.map((e) => e.at)
  const start = Math.min(b.started_at ?? Infinity, ...ats)
  const s = Number.isFinite(start) ? start : b.at
  const last = ats.length ? Math.max(...ats) : s
  return { start: s, end: Math.max(b.ended_at ?? last, last, s + 1) }
}

/** The compressed clock: real time ↔ play time (seconds from the start, quiet gaps cut to GAP_S). */
export interface Clock {
  /** total play time */
  total: number
  /** real time → play time */
  toPlay: (t: number) => number
  /** play time → real time */
  toReal: (p: number) => number
}

export function replayClock(b: ReqBoard, gap = GAP_S): Clock {
  const span = replaySpan(b)
  const pts = [...new Set([span.start, ...b.events.map((e) => e.at).filter((t) => t >= span.start && t <= span.end), span.end])].sort((x, y) => x - y)
  // knots: (real, play)
  const knots: [number, number][] = [[pts[0], 0]]
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i] - pts[i - 1]
    knots.push([pts[i], knots[i - 1][1] + Math.min(d, gap)])
  }
  const total = knots[knots.length - 1][1]
  const toPlay = (t: number) => {
    if (t <= knots[0][0]) return 0
    for (let i = 1; i < knots.length; i++) {
      const [r1, p1] = knots[i]
      const [r0, p0] = knots[i - 1]
      if (t <= r1) return r1 > r0 ? p0 + ((t - r0) / (r1 - r0)) * (p1 - p0) : p1
    }
    return total
  }
  const toReal = (p: number) => {
    if (p <= 0) return knots[0][0]
    for (let i = 1; i < knots.length; i++) {
      const [r1, p1] = knots[i]
      const [r0, p0] = knots[i - 1]
      if (p <= p1) return p1 > p0 ? r0 + ((p - p0) / (p1 - p0)) * (r1 - r0) : r1
    }
    return knots[knots.length - 1][0]
  }
  return { total, toPlay, toReal }
}

/** Before an actor's first change it waits: with the line it had while waiting, if it still waits, else the plain words. */
const waiting = (a: ReqBoard['actors'][number]) => ({ status: 'waiting' as ActorStatus, doing: a.status === 'waiting' ? a.doing : '还没轮到', since: null as number | null })

/** The board of *b* as it stood at *t* (epoch seconds, between its start and end). Nothing can be done in a replay:
 * no line to type, no step to take. */
export function replayAt(b: ReqBoard, t: number): ReqBoard {
  const span = replaySpan(b)
  if (t >= span.end) return b
  // whom each actor's wait was on then (an older backend did not say: the owner looking, else someone)
  const waitOn = new Map<string, WaitWho>()
  // a session is there from when it was opened: the local one at the board's 开了本机会话 (else its own time), never before
  // 开工 (a claim has no session); the runner's at its own time, else at the runner's first step. What it cost is known
  // at the end.
  const startAt = b.events.find((e) => e.kind === 'start')?.at ?? -Infinity
  const localAt = b.events.find((e) => e.kind === 'session')?.at
  const first = (k: string) => {
    const a = b.actors.find((x) => x.key === k)
    return a ? Math.min(Infinity, ...a.history.map((x) => x.at), ...a.spans.map((x) => x.a)) : Infinity
  }
  const openedAt = (x: { kind: string; opened_at: number | null }) =>
    x.kind === 'runner' ? x.opened_at ?? first('runner') : Math.max(localAt ?? x.opened_at ?? first('local'), startAt)
  const sessionAt = (a: ReqBoard['actors'][number]) => {
    const x = b.sessions.find((s) => s.slot === a.session?.slot)
    return openedAt({ kind: a.key === 'runner' ? 'runner' : 'local', opened_at: x?.opened_at ?? null })
  }
  const actors = b.actors.map((a) => {
    const h = [...a.history].reverse().find((x) => x.at <= t)
    if (h?.status === 'awaiting_approval') waitOn.set(a.key, h.who ?? (b.person.me ? 'you' : 'people'))
    // not on this requirement's way, and never was: it stays so through the replay
    const off = a.status === 'skipped' && !a.history.length
    const now = h ? { status: h.status, doing: h.doing, since: h.at } : off ? { status: a.status, doing: a.doing, since: null } : waiting(a)
    return {
      ...a, ...now, line: null,
      session: a.session && sessionAt(a) <= t ? a.session : null,
      spans: a.spans.filter((s) => s.a <= t).map((s) => ({ ...s, b: s.b !== null && s.b <= t ? s.b : null })),
      marks: a.marks.filter((m) => m.at <= t),
      facts: [],
      credits: null,
    }
  })
  const statusOf = new Map(actors.map((a) => [a.key as string, a.status]))
  const cells: CheckCell[] = b.checks.cells.map((c) => {
    if (c.at !== null && c.at <= t) return c
    if (c.at === null && c.status === 'wait' && c.actor && statusOf.get(c.actor) === 'awaiting_approval') return c
    return { ...c, status: 'skip', at: null, detail: '还没到这一步' }
  })
  const passed = cells.filter((c) => c.status === 'pass').length
  const failed = cells.filter((c) => c.status === 'fail').length
  const asking = actors.filter((a) => a.status === 'awaiting_approval')
  const awaiting = asking.find((a) => waitOn.get(a.key) === 'you') ?? asking[0]
  const working = actors.some((a) => a.status === 'running' || a.status === 'fixing')
  const rel = statusOf.get('release')
  const merged = b.ended_at !== null && b.ended_at <= t
  const state = stateAt(b, t, statusOf, merged)
  const ln = leanFromEvents(b.events, t, b.row.lean.total)
  const through = ln.done_n + ln.skipped_n
  const who: WaitWho = awaiting ? waitOn.get(awaiting.key) ?? 'people' : working ? (statusOf.get('runner') === 'running' ? 'runner' : 'agent') : 'nobody'
  return {
    ...b,
    row: {
      ...b.row, state, state_label: STATE_LABEL[state], credits: null,
      // the MR is opened at the hand-over
      mr: b.events.some((e) => e.kind === 'handover' && e.at <= t) ? b.row.mr : null,
      lean: { ...b.row.lean, done_n: ln.done_n, skipped_n: ln.skipped_n, next: ln.next, done: through, stage: ln.next?.id ?? null, stage_label: ln.next?.label ?? null, stage_n: ln.next?.n ?? null,
        stage_state: ln.next ? (ln.started ? 'started' : 'todo') : through ? 'done' : null },
      waits: { ...b.row.waits, who, text: awaiting ? awaiting.doing : working ? 'AI 在做' : '', line: null, raw: '', do: 'none', since: awaiting?.since ?? null },
    },
    ended_at: merged ? b.ended_at : null,
    live: working,
    // the owner's node asks only when the wait is on them; one on the product or someone else is said (as the live board)
    person: { ...b.person, status: who === 'you' ? 'awaiting_approval' : working && !awaiting ? 'running' : 'waiting', doing: awaiting ? awaiting.doing : working ? 'AI 在做' : '没有等你的事' },
    actors,
    events: b.events.filter((e) => e.at <= t),
    belt: b.belt.filter((x) => x.at <= t),
    sessions: b.sessions.filter((x) => openedAt(x) <= t),
    credits: { ...b.credits, total: null },
    decisions: [],
    brain: { ...b.brain, cited: [], stale: [], unknown: [] },
    checks: { ...b.checks, cells, passed, failed, total: cells.filter((c) => c.status === 'pass' || c.status === 'fail' || c.status === 'wait').length, todo: undefined,
      at: Math.max(0, ...cells.filter((c) => c.at !== null).map((c) => c.at as number)) || null,
      history: b.checks.history.filter((x) => x.at <= t) },
    accept: { ...b.accept, state: rel === 'awaiting_approval' ? 'waiting' : rel === 'merged' ? 'accepted' : rel === 'fixing' ? 'rejected' : 'not_yet',
      step: { text: '', who: '', line: null, mr_url: null, session_url: null }, done: null },
  }
}

const STATE_LABEL: Record<ReqState, string> = {
  claimed: '已认领', local: '本地开发中', handed_over: '已交接', rejected: '接手被拒', running: '运行机在跑', parked: '停下等回答',
  acceptance: '等验收', merged: '已合并', closed: '已关闭',
}

/** The requirement's state at *t* in a replay (the header's chip): from what had happened by then. */
function stateAt(b: ReqBoard, t: number, statusOf: Map<string, ActorStatus>, merged: boolean): ReqState {
  if (merged) return b.row.state === 'closed' ? 'closed' : 'merged'
  const seen = (kind: string) => b.events.some((e) => e.kind === kind && e.at <= t)
  if (statusOf.get('release') === 'awaiting_approval') return 'acceptance'
  if (!seen('handover')) return seen('start') || b.events.some((e) => e.kind !== 'claim' && e.at <= t) ? 'local' : 'claimed'
  if (statusOf.get('handover') === 'failed') return 'rejected'
  if (['bridge', 'runner'].some((k) => statusOf.get(k) === 'awaiting_approval')) return 'parked'
  return statusOf.get('runner') === 'running' || statusOf.get('runner') === 'fixing' ? 'running' : 'handed_over'
}
