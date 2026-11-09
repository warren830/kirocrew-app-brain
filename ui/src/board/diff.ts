/**
 * What changed between two consecutive snapshots of one requirement's board (pure; the sample team board's diff.ts).
 * Every animation on the board comes from here, so every animation stands for a real change:
 *
 * - events newer than the previous snapshot's last `seq` become particles along the graph's own routes (开工: 你 →
 *   本机会话; a request: the asking session → its approval; 批准 / 退回: 你 → the approval, a tick or a cross; a commit:
 *   the actor → the run branch; 交接: 本机会话 → 交接 → 桥; 签名: 桥 → 签名; a question: the asker → 你, the answer back;
 *   verify: the run branch → the check ring, green or red; 回写: 你 → 回写 Brain) or blips on a node (Lean's stages, a
 *   blocked tool call, the merge), and the loud ones also flash their node red;
 * - check cells whose status changed flip; actors whose status changed get a one-time highlight on their lane; new
 *   commits slide onto the conveyor; the polite live region gets one sentence.
 *
 * The first snapshot is history: nothing in it animates. So is one taken after the page was hidden (a quiet catch-up),
 * one whose events went backwards, and any event more than LATE_S older than the snapshot (it still shows in the feed).
 */
import type { ActorStatus, BeltItem, BoardEvent, CheckCell, ReqBoard } from '../types'
import type { Item, Prio, PTone, Shape } from './engine'
import { ORCH, RUN, TESTS } from './layout'

export const LATE_S = 30
export const MAX_ITEMS = 24

export interface Flash { key: string; target: string; tone: 'bad' | 'ok'; kind: string }
export interface Flip { id: string; from: CheckCell['status']; to: CheckCell['status'] }
export interface ActorChange { key: string; from: ActorStatus; to: ActorStatus }

export interface BoardDiff {
  /** the requirement (repo/key) */
  req: string
  /** history (first snapshot, catch-up, restart): nothing animates */
  first: boolean
  fresh: BoardEvent[]
  items: Item[]
  flashes: Flash[]
  flips: Flip[]
  /** beltKey() of the conveyor items that are new */
  belt: string[]
  actors: ActorChange[]
  announce: string | null
}

export interface DiffOptions {
  at?: number
  resync?: boolean
  lateS?: number
  max?: number
}

export const reqId = (b: ReqBoard) => `${b.row.repo}/${b.row.key}`
export const maxSeq = (b: ReqBoard) => b.events.reduce((m, e) => Math.max(m, e.seq), 0)
export const beltKey = (x: BeltItem) => `${x.kind}@${x.sha}@${x.at}`
export const eventKey = (req: string, seq: number) => `${req}#${seq}`

/** A place of an event on the graph: 你 is the orchestrator's slot, the run branch the rail, the checks the ring. */
export function anchorOf(place: string | null, actors: ReadonlySet<string>): string | null {
  if (!place) return null
  if (place === 'person') return ORCH
  if (place === 'branch') return RUN
  if (place === 'checks') return TESTS
  return actors.has(place) ? place : null
}

/** What an event carries, drawn next to a travelling head. */
const LABEL: Partial<Record<BoardEvent['kind'], string>> = {
  start: '开工', request: '请批准', approve: '批准', reject: '退回', handover: '交接', accepted: '接手', rejected: '拒绝',
  signed: '合同', question: '问你', answer: '回答', reflect: '回写',
}

/** An event as an engine item; null when nothing on the graph stands for it. */
export function eventItem(e: BoardEvent, req: string, actors: ReadonlySet<string>, score?: { passed: number; total: number } | null): Item | null {
  const base = { key: eventKey(req, e.seq), t: e.at, kind: e.kind }
  const from = anchorOf(e.from, actors)
  const to = anchorOf(e.to, actors)
  const go = (a: string | null, b: string | null, tone: PTone, prio: Prio, label: string | null = LABEL[e.kind] ?? null): Item | null => {
    if (a && b && a !== b) return { ...base, from: a, to: b, tone, shape: 'comet', prio, label }
    const at = b ?? a
    return at ? { ...base, from: at, to: at, tone, shape: tone === 'bounce' || tone === 'danger' || tone === 'fail' ? 'cross' : tone === 'pass' || tone === 'ok' ? 'check' : 'ring', prio } : null
  }
  const blip = (at: string | null, tone: PTone, shape: Shape, prio: Prio): Item | null => (at ? { ...base, from: at, to: at, tone, shape, prio } : null)
  switch (e.kind) {
    case 'start':
    case 'session':
      return go(from, to, 'run', e.kind === 'start' ? 2 : 1)
    case 'stage':
      return blip(from, 'tool', 'spark', 0)
    case 'request':
      return go(from, to, 'info', 3)
    case 'approve':
      return go(from, to, 'pass', 3)
    case 'reject':
      return go(from, to, 'bounce', 3)
    case 'refused':
      return blip(to ?? from, 'danger', 'cross', 3)
    case 'blocked':
      return blip(from, 'danger', 'cross', 2)
    case 'commit':
      return go(from, to, from === ORCH ? 'danger' : 'run', from === ORCH ? 3 : 2, null)
    case 'handover':
      return go(from, to, 'handoff', 3)
    case 'accepted':
      return go(from, to, 'handoff', 3)
    case 'rejected':
      return go(from, to, 'bounce', 3)
    case 'signed':
      return go(from, to, 'handoff', 3)
    case 'question':
      return go(from, to, 'info', 3)
    case 'answer':
      return go(from, to, from === ORCH ? 'ok' : 'handoff', 3)
    case 'verify': {
      const green = !!score && score.total > 0 && score.passed === score.total
      return { ...base, from: RUN, to: TESTS, tone: /没过/.test(e.text) ? 'fail' : green || /通过/.test(e.text) ? 'pass' : 'fail', shape: 'comet', prio: 3,
        label: score ? `${score.passed}/${score.total}` : null }
    }
    case 'merge':
      return blip(RUN, 'merge', 'check', 3)
    case 'reflect':
      return go(from, to, 'ok', 2)
    default:
      return blip(from ?? to, 'info', 'ring', 1)
  }
}

/** The node flashes an event causes (besides its particle): the loud ones are red. */
export function eventFlashes(e: BoardEvent, req: string, actors: ReadonlySet<string>): Flash[] {
  const key = eventKey(req, e.seq)
  const at = anchorOf(e.to, actors) ?? anchorOf(e.from, actors)
  switch (e.kind) {
    case 'reject':
    case 'rejected':
    case 'refused':
      return at ? [{ key, target: at, tone: 'bad', kind: e.kind }] : []
    case 'blocked':
      return anchorOf(e.from, actors) ? [{ key, target: anchorOf(e.from, actors) as string, tone: 'bad', kind: e.kind }] : []
    case 'verify':
      return /没过/.test(e.text) ? [{ key, target: TESTS, tone: 'bad', kind: e.kind }] : []
    default:
      return []
  }
}

function quiet(req: string): BoardDiff {
  return { req, first: true, fresh: [], items: [], flashes: [], flips: [], belt: [], actors: [], announce: null }
}

export function diffBoards(prev: ReqBoard | null, next: ReqBoard, opts: DiffOptions = {}): BoardDiff {
  const lateS = opts.lateS ?? LATE_S
  const max = opts.max ?? MAX_ITEMS
  const req = reqId(next)
  if (!prev || reqId(prev) !== req || opts.resync) return quiet(req)
  const before = maxSeq(prev)
  if (maxSeq(next) < before) return quiet(req)
  const actors = new Set(next.actors.map((a) => a.key))
  const fresh = next.events.filter((e) => e.seq > before).sort((a, b) => a.seq - b.seq)
  let items: Item[] = []
  const flashes: Flash[] = []
  const score = next.checks.cells.filter((c) => c.group === 'verify')
  const vs = score.length ? { passed: score.filter((c) => c.status === 'pass').length, total: score.length } : null
  for (const e of fresh) {
    if (opts.at !== undefined && opts.at - e.at > lateS) continue
    const it = eventItem(e, req, actors, e.kind === 'verify' ? vs : null)
    if (it) items.push(it)
    flashes.push(...eventFlashes(e, req, actors))
  }
  if (prev.ended_at === null && next.ended_at !== null) {
    for (const a of next.actors) if (a.status === 'merged') flashes.push({ key: `${req}#merged`, target: a.key, tone: 'ok', kind: 'merge' })
    flashes.push({ key: `${req}#merged-run`, target: RUN, tone: 'ok', kind: 'merge' })
  }
  if (next.checks.total > 0 && next.checks.failed === 0 && (prev.checks.failed > 0 || prev.checks.passed !== next.checks.passed) && next.checks.passed === next.checks.total)
    flashes.push({ key: `${req}#green@${next.checks.at ?? ''}`, target: TESTS, tone: 'ok', kind: 'verify' })
  if (items.length > max) items = items.slice().sort((a, b) => b.prio - a.prio || a.t - b.t).slice(0, max).sort((a, b) => a.t - b.t)
  const was = new Map(prev.checks.cells.map((c) => [c.id, c.status]))
  const flips: Flip[] = next.checks.cells.filter((c) => was.has(c.id) && was.get(c.id) !== c.status).map((c) => ({ id: c.id, from: was.get(c.id)!, to: c.status }))
  const wasA = new Map(prev.actors.map((a) => [a.key, a.status]))
  const changed: ActorChange[] = next.actors.filter((a) => wasA.has(a.key) && wasA.get(a.key) !== a.status).map((a) => ({ key: a.key, from: wasA.get(a.key)!, to: a.status }))
  const had = new Set(prev.belt.map(beltKey))
  const belt = next.belt.map(beltKey).filter((k) => !had.has(k))
  return { req, first: false, fresh, items, flashes, flips, belt, actors: changed, announce: announce(prev, next, fresh) }
}

/** One sentence for the polite live region: the most important change of this poll (or null). */
function announce(prev: ReqBoard, next: ReqBoard, fresh: BoardEvent[]): string | null {
  const parts: string[] = []
  if (prev.row.state !== next.row.state) parts.push(`需求${next.row.state_label}`)
  if (prev.checks.passed !== next.checks.passed || prev.checks.total !== next.checks.total)
    parts.push(`检查 ${prev.checks.passed}/${prev.checks.total} → ${next.checks.passed}/${next.checks.total}`)
  const loud = [...fresh].reverse().find((e) => ['reject', 'rejected', 'refused', 'question', 'request'].includes(e.kind))
  if (loud) parts.push(loud.text)
  if (parts.length < 2) {
    const calm = [...fresh].reverse().find((e) => ['approve', 'handover', 'accepted', 'merge', 'answer'].includes(e.kind))
    if (calm) parts.push(calm.text)
  }
  return parts.length ? parts.slice(0, 2).join('；') : null
}
