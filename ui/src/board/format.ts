/**
 * Words, tones and number formats every part of the 需求看板 shares (the sample team board's format.ts, in a
 * requirement's words). Pure: no React, no DOM.
 *
 * A tone is a meaning, not a colour: styles.ts maps each to a colour per host mode (kiro-dark / kiro-light), so the
 * same word always has the same colour and every colour has a word next to it.
 */
import type { Actor, ActorStatus, BoardEvent, BoardEventKind, CheckWall, LeanSummary, ReqBoard, WaitWho } from '../types'
import { STAGE_NAME, waitsOn } from '../vocab'

export const POLL_MS = 2000

export type Tone = 'run' | 'fix' | 'ok' | 'done' | 'queue' | 'warn' | 'approve' | 'bad' | 'idle' | 'handoff' | 'info'

export interface StatusMeta {
  label: string
  tone: Tone
  icon: string
  /** One line for a person who does not know the word. */
  hint: string
}

/** An actor's state in words (the sample's lane states, said for a requirement's way). */
export const ACTOR_META: Record<ActorStatus, StatusMeta> = {
  waiting: { label: '还没轮到', tone: 'idle', icon: '⏳', hint: '前面的步骤还没做完' },
  queued: { label: '排队', tone: 'queue', icon: '⏸', hint: '交给它了，它还没接' },
  running: { label: '在做', tone: 'run', icon: '●', hint: '它正在做' },
  stalled: { label: '卡住', tone: 'warn', icon: '⚠', hint: '停住了：要人看一下' },
  awaiting_approval: { label: '等人', tone: 'approve', icon: '✋', hint: '等一个人：批准、回答或验收' },
  done: { label: '做完这步', tone: 'done', icon: '✓', hint: '它这一步做完了，后面还有' },
  merged: { label: '完成', tone: 'ok', icon: '✔', hint: '这一步完成了' },
  fixing: { label: '返工', tone: 'fix', icon: '↻', hint: '被退回或没过，在改' },
  failed: { label: '没过', tone: 'bad', icon: '✕', hint: '被拒或失败了' },
  skipped: { label: '这次不需要', tone: 'idle', icon: '–', hint: '这个需求的路上没有这一步' },
}

export function actorMeta(status: string): StatusMeta {
  return ACTOR_META[status as ActorStatus] ?? { label: String(status), tone: 'idle', icon: '•', hint: '' }
}

/** Nothing more will happen to this actor for this requirement. */
export const isFinal = (s: ActorStatus) => s === 'merged' || s === 'skipped'
/** At work right now (these glow; stalled and awaiting get their own loud look). */
export const WORKING: ReadonlySet<ActorStatus> = new Set<ActorStatus>(['running', 'fixing'])
export const LIVE: ReadonlySet<ActorStatus> = new Set<ActorStatus>(['running', 'fixing', 'stalled', 'awaiting_approval'])

export const EVENT_META: Record<BoardEventKind, { icon: string; label: string; tone: Tone }> = {
  claim: { icon: '🏷️', label: '认领', tone: 'info' },
  start: { icon: '🏁', label: '开工', tone: 'run' },
  stage: { icon: '🧭', label: 'Lean 阶段', tone: 'idle' },
  request: { icon: '✋', label: '请求批准', tone: 'approve' },
  approve: { icon: '👍', label: '批准', tone: 'ok' },
  reject: { icon: '↩️', label: '退回', tone: 'bad' },
  refused: { icon: '🚫', label: '批准的那一行没被接受', tone: 'warn' },
  blocked: { icon: '🛑', label: 'Lean 拦下', tone: 'warn' },
  commit: { icon: '📝', label: '提交', tone: 'info' },
  handover: { icon: '📨', label: '交接', tone: 'handoff' },
  accepted: { icon: '🤝', label: '桥接手', tone: 'ok' },
  rejected: { icon: '⛔', label: '接手被拒', tone: 'bad' },
  signed: { icon: '🔏', label: '签名', tone: 'handoff' },
  question: { icon: '❓', label: '问人', tone: 'approve' },
  answer: { icon: '💬', label: '回答', tone: 'ok' },
  verify: { icon: '🧪', label: '自动检查', tone: 'info' },
  merge: { icon: '⤵️', label: '合并', tone: 'ok' },
  reflect: { icon: '📚', label: '回写 Brain', tone: 'ok' },
  session: { icon: '💻', label: '会话', tone: 'run' },
  app: { icon: '•', label: 'app', tone: 'idle' },
}

/** The words of the places an event travels between (actor keys are named by their actors, 'person' by personPlace). */
export const PLACE: Record<string, string> = { branch: '运行分支', checks: '检查' }

/** what a person does that, after the hand-over, happens on the MR: the runner's questions, their answers, approvals */
const ON_MR: ReadonlySet<string> = new Set(['approve', 'reject', 'request', 'question', 'answer'])

/** Who an event's 'person' end is: on the MR (a question the bridge put there or the runner asked, its answer, an
 * approval after the hand-over) whoever answers there, 产品 for the release and its acceptance, else the MR; on this
 * machine's way the owner, 「你」 only for the person looking (UI问题清单 BOARD-11). */
export function personPlace(e: Pick<BoardEvent, 'kind' | 'from' | 'to' | 'at' | 'text'>, b: Pick<ReqBoard, 'person' | 'events'>): string {
  const hand = b.events.find((x) => x.kind === 'handover')?.at
  const mr = e.from === 'bridge' || e.to === 'bridge' || (ON_MR.has(e.kind) && hand !== undefined && e.at > hand)
  if (mr) return e.to === 'release' || e.from === 'release' || /验收/.test(e.text) ? '产品' : 'MR'
  return b.person.me ? '你' : b.person.owner ?? '负责人'
}

/** 0:05, 25:00, 1:02:03 */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(r).padStart(2, '0')}`
}

/** 45 秒, 23 分钟, 1 小时 5 分, 2 天 3 小时 */
export function fmtSpan(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s} 秒`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h} 小时 ${m % 60} 分` : `${h} 小时`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} 天 ${h % 24} 小时` : `${d} 天`
}

export function fmtAgo(delta: number): string {
  const s = Math.max(0, Math.round(delta))
  if (s < 5) return '刚刚'
  if (s < 60) return `${s} 秒前`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

export function fmtCredits(c: number | null | undefined): string {
  if (c === null || c === undefined || !Number.isFinite(c)) return '—'
  return c >= 100 ? String(Math.round(c)) : (Math.round(c * 10) / 10).toFixed(1)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 11-08 14:05 (the local day and time of an epoch-seconds time) */
export function fmtWhen(t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return '—'
  const d = new Date(t * 1000)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Approximate rendered width in em: CJK ≈ 1, emoji ≈ 1.2, latin ≈ 0.58, space ≈ 0.3. */
export function textWidth(s: string): number {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w
}

function charWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0
  if (c === 0x20) return 0.3
  if (c > 0x1f000) return 1.2
  if ((c >= 0x2e80 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef) || (c >= 0x3000 && c <= 0x303f)) return 1
  return 0.58
}

/** Cut *s* to about *maxEm* em with an ellipsis (SVG text does not ellipsize by itself). */
export function clip(s: string, maxEm: number): string {
  if (textWidth(s) <= maxEm) return s
  let out = ''
  let w = 0
  for (const ch of s) {
    const cw = charWidth(ch)
    if (w + cw > maxEm - 0.8) break
    out += ch
    w += cw
  }
  return `${out.trimEnd()}…`
}

/** The actor an event is about, for filtering: either end. */
export function eventTouches(e: { from: string | null; to: string | null }, key: string): boolean {
  return e.from === key || e.to === key
}

/** The cell groups of the check wall, in wall order. */
export const CELL_GROUPS: { key: string; label: string }[] = [
  { key: 'gate', label: 'Lean 审批' },
  { key: 'verify', label: '自动检查' },
  { key: 'handover', label: '交接' },
  { key: 'brain', label: 'Brain 和仓库' },
  { key: 'after', label: '合并以后' },
]

export const CELL_META: Record<string, { label: string; glyph: string }> = {
  pass: { label: '通过', glyph: '✓' },
  fail: { label: '没过', glyph: '✕' },
  wait: { label: '等人', glyph: '✋' },
  skip: { label: '还没到', glyph: '–' },
  watch: { label: '观察中', glyph: '⏳' },
  not_needed: { label: '这次不需要', glyph: '–' },
}

/** Who a requirement waits on, in one word, the one rule every view reads: 「等你」 only for the person looking
 * (`you`); 「等 carol」 for the owner when that is someone else (`people`, the owner's name known and *me* false: the
 * person looking is not the owner); else vocab's word (等产品, 等别人 …). */
export function whoWord(who: WaitWho, owner: string | null, me = false): string {
  if (who === 'people' && owner && !me) return `等 ${owner}`
  return waitsOn(who) || '等人'
}

/** whoWord with the board's owner and whether the person looking is the owner; *who*: the requirement's wait now. */
export const boardWho = (b: Pick<ReqBoard, 'row' | 'person'>, who: WaitWho = b.row.waits.who): string => whoWord(who, b.person.owner, b.person.me)

/** An actor's state in words: one that waits says whom it waits for. */
export function actorLabel(status: ActorStatus, b: Pick<ReqBoard, 'row' | 'person'>, who: WaitWho = b.row.waits.who): string {
  return status === 'awaiting_approval' ? boardWho(b, who) : actorMeta(status).label
}

/** Whom an actor's wait that began at *t* was on, by its own history (an older backend did not say: null). */
export function waitedOn(a: Pick<Actor, 'history'>, t: number): WaitWho | null {
  const h = [...a.history].reverse().find((x) => x.at <= t + 1 && x.status === 'awaiting_approval')
  return h?.who ?? null
}

/** Whom a wait span of *a* was on: the requirement's wait now for one that goes on, its own history for one that is
 * over (an older backend did not say: the wait now) — every wait in a lane said by the one rule (boardWho). */
export function spanWho(a: Pick<Actor, 'status' | 'history'>, board: Pick<ReqBoard, 'row'>, s: { a: number; b: number | null }): WaitWho {
  if (s.b === null && a.status === 'awaiting_approval') return board.row.waits.who
  return waitedOn(a, s.a) ?? board.row.waits.who
}

/** The waits on someone other than the person looking that this board shows (a lane's wait span, a node or lane pill
 * that waits), in the words they are said there: 「等产品」, 「等 carol」. */
export function otherWaits(b: Pick<ReqBoard, 'row' | 'person' | 'actors'>): string[] {
  const words = new Set<string>()
  for (const a of b.actors) {
    if (a.status === 'awaiting_approval' && !waitsOnMe(b)) words.add(boardWho(b))
    for (const s of a.spans) {
      const who = s.kind === 'wait' ? spanWho(a, b, s) : 'you'
      if (who !== 'you') words.add(boardWho(b, who))
    }
  }
  return [...words]
}

/** The ones a requirement may wait on that are people. */
export const PERSON: ReadonlySet<WaitWho> = new Set<WaitWho>(['you', 'product', 'people', 'builder'])

/** The board calls the requirement's owner 你 (the backend's person.you; an older backend: the owner looking, or no owner
 * known). */
export const ownerIsYou = (b: Pick<ReqBoard, 'person'>): boolean => b.person.you ?? (b.person.me || !b.person.owner)

/** The board waits on the person looking at it. */
export const waitsOnMe = (b: Pick<ReqBoard, 'row'>) => b.row.waits.who === 'you'

/** Its repo has no remote: done only on this machine (an older backend: every actor of the runner's part skipped). */
export function localOnly(b: Pick<ReqBoard, 'row' | 'actors' | 'direct'>): boolean {
  if (typeof b.row.local_only === 'boolean') return b.row.local_only
  const runner = b.actors.filter((a) => RUNNER_PART.has(a.key))
  return b.direct || (runner.length > 0 && runner.every((a) => a.status === 'skipped'))
}
export const RUNNER_PART: ReadonlySet<string> = new Set(['handover', 'bridge', 'signer', 'runner'])

/** The team runner's page of a requirement it has no working directory for yet (the bridge took it; the signer signs, or
 * the runner prepares): nothing of its records is readable here, nor its branch (backend board.runner_blind). */
export const runnerBlind = (b: Pick<ReqBoard, 'row'>): boolean =>
  b.row.where === 'runner' && !b.row.worktree && !['claimed', 'merged', 'closed'].includes(b.row.state)

/** The requirement's title when it has one of its own (one whose claim is not read yet is called by its key only). */
export const titleOf = (r: Pick<ReqBoard['row'], 'key' | 'title'>): string => (r.title && r.title !== r.key ? r.title : '')

/** *started*: the next stage is the one being worked on (「在做」), not one still to do; *stage_state* says the same in
 * LeanSummary's word, for vocab.leanProgress */
export type LeanNow = { done_n: number; skipped_n: number; next: { id: string; label: string; n: number } | null; total: number; started: boolean; stage_state: 'started' | null }

const withState = (n: Omit<LeanNow, 'stage_state'>): LeanNow => ({ ...n, stage_state: n.started ? 'started' : null })

/** Lean's progress the one way (vocab.leanProgress's parts); an older backend's counts read as done, none skipped. */
export function leanOf(l: LeanSummary): LeanNow {
  if (typeof l.done_n === 'number') {
    const next = l.next ?? null
    return withState({ done_n: l.done_n, skipped_n: l.skipped_n ?? 0, next, total: l.total, started: l.stage_state === 'started' && !!next && (!l.stage || l.stage === next.id) })
  }
  const next = (l.stage_state === 'started' || l.stage_state === 'todo') && l.stage_label && l.stage_n !== null
    ? { id: l.stage ?? '', label: l.stage_label, n: l.stage_n } : null
  return withState({ done_n: l.done, skipped_n: 0, next, total: l.total, started: l.stage_state === 'started' })
}

const STAGES = Object.entries(STAGE_NAME)

/** Lean's progress as its stage events tell it up to *t* (回放), read the way the backend reads Lean's ledger
 * (backend/core/lean_view.py stages, summary), so the replay ends on the live board's numbers: each stage's state from
 * the latest word on each of its units (any started: started; all skipped: skipped; else done); a stage Lean went past
 * without a word (a later one is recorded) is skipped; the next is the furthest started, else the first left to do. */
export function leanFromEvents(events: ReadonlyArray<{ kind: string; at: number; text: string }>, t: number, total = 11): LeanNow {
  const last = new Map<string, Map<string, string>>()
  for (const e of events) {
    if (e.kind !== 'stage' || e.at > t) continue
    const m = /^(开始|做完|跳过)「([^」（]+)(?:（([^）]*)）)?」/.exec(e.text)
    if (!m) continue
    const units = last.get(m[2]) ?? new Map<string, string>()
    units.set(m[3] ?? '', m[1])
    last.set(m[2], units)
  }
  const said = STAGES.map(([, label]) => {
    const s = [...(last.get(label)?.values() ?? [])]
    return !s.length ? 'todo' : s.includes('开始') ? 'started' : s.every((x) => x === '跳过') ? 'skipped' : 'done'
  })
  const end = said.reduce((n, s, i) => (s !== 'todo' ? i : n), -1)
  const state = said.map((s, i) => (s === 'todo' && i < end ? 'skipped' : s))
  const at = state.lastIndexOf('started')
  const i = at >= 0 ? at : state.indexOf('todo')
  const next = i < 0 ? null : { id: STAGES[i][0], label: STAGES[i][1], n: i + 1 }
  return withState({ done_n: state.filter((s) => s === 'done').length, skipped_n: state.filter((s) => s === 'skipped').length, next, total, started: at >= 0 })
}

export interface ChecksSay {
  text: string
  tone: 'ok' | 'bad' | 'approve' | 'info' | 'idle'
  /** every check passed and none is left to come */
  green: boolean
}

/** The checks not reached yet, by name: the backend's todo (without the 14 days it watches: those are 在观察, nobody's
 * turn, not something left to do), else an older backend's approvals and verify not run yet. */
export function todoLeft(w: CheckWall): string[] {
  const watched = w.cells.filter((c) => c.status === 'watch').map((c) => c.name)
  if (w.todo) return w.todo.filter((t) => !watched.some((n) => n.startsWith(t)))
  return w.cells.filter((c) => c.status === 'skip' && (c.group === 'gate' || c.group === 'verify')).map((c) => (c.group === 'gate' ? c.name.replace(/（[^）]*）$/, '') : c.label))
}

/** What the checks say, the one way (the KPI, the wall, 验收): 「目前 3 项都过 · 还剩 发布审批」. A check that waits for
 * a person names whom; the 14 days after the merge are 「在观察」, nobody's turn. */
export function checksSay(w: CheckWall, b: Pick<ReqBoard, 'row' | 'person'>): ChecksSay {
  const who = b.row.waits.who
  const n = (s: string) => w.cells.filter((c) => c.status === s).length
  const wait = n('wait')
  const watch = n('watch')
  const todo = todoLeft(w)
  const left = todo.length ? ` · 还剩 ${todo.join('、')}` : ''
  const watching = watch ? ` · ${watch} 项在观察` : ''
  if (!w.total && !watch) return { text: '还没有检查结果', tone: 'idle', green: false }
  if (w.failed) return { text: `${w.failed} 项没过${left}`, tone: 'bad', green: false }
  if (wait) return { text: `${wait} 项${PERSON.has(who) ? boardWho(b) : '等人'}${left}`, tone: 'approve', green: false }
  const all = w.passed === 1 ? '1 项过了' : `${w.passed} 项都过`
  if (todo.length) return { text: `目前 ${all}${left}${watching}`, tone: 'info', green: false }
  return { text: `${w.passed === 1 ? '1 项过了' : `${w.passed} 项全过`}${watching}`, tone: 'ok', green: !watch }
}

/** 「等 carol 在 MR 上回答」, 「等产品在 MR 上回答」: a wait word and what follows, a space after a Latin name. */
export const whoThen = (who: string, rest: string): string => `${who}${/[A-Za-z0-9]$/.test(who) && /^[^\s，。：；、）]/.test(rest) ? ' ' : ''}${rest}`
