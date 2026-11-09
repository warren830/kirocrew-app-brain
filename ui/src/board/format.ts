/**
 * Words, tones and number formats every part of the 需求看板 shares (the sample team board's format.ts, in a
 * requirement's words). Pure: no React, no DOM.
 *
 * A tone is a meaning, not a colour: styles.ts maps each to a colour per host mode (kiro-dark / kiro-light), so the
 * same word always has the same colour and every colour has a word next to it.
 */
import type { ActorStatus, BoardEventKind, CheckWall, LeanSummary, ReqBoard, WaitWho } from '../types'
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
  refused: { icon: '🚫', label: '口令没被接受', tone: 'warn' },
  blocked: { icon: '🛑', label: 'Lean 拦下', tone: 'warn' },
  commit: { icon: '📝', label: '提交', tone: 'info' },
  handover: { icon: '📨', label: '交接', tone: 'handoff' },
  accepted: { icon: '🤝', label: '桥接手', tone: 'ok' },
  rejected: { icon: '⛔', label: '接手被拒', tone: 'bad' },
  signed: { icon: '🔏', label: '签名', tone: 'handoff' },
  question: { icon: '❓', label: '问人', tone: 'approve' },
  answer: { icon: '💬', label: '回答', tone: 'ok' },
  verify: { icon: '🧪', label: 'verify', tone: 'info' },
  merge: { icon: '⤵️', label: '合并', tone: 'ok' },
  reflect: { icon: '📚', label: '回写 Brain', tone: 'ok' },
  session: { icon: '💻', label: '会话', tone: 'run' },
  app: { icon: '•', label: 'app', tone: 'idle' },
}

/** The words of the places an event travels between (actor keys are named by their actors). */
export const PLACE: Record<string, string> = { person: '你', branch: '运行分支', checks: '检查' }

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
  { key: 'verify', label: 'verify' },
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

/** Who a requirement waits on, in one word: 「等你」 only for the person looking; 「等 carol」 for another person whose
 * name is known; else vocab's word. */
export function whoWord(who: WaitWho, owner: string | null): string {
  if (who === 'people' && owner) return `等 ${owner}`
  return waitsOn(who) || '等人'
}

/** An actor's state in words: one that waits says whom it waits for. */
export function actorLabel(status: ActorStatus, who: WaitWho, owner: string | null): string {
  return status === 'awaiting_approval' ? whoWord(who, owner) : actorMeta(status).label
}

/** The ones a requirement may wait on that are people. */
export const PERSON: ReadonlySet<WaitWho> = new Set<WaitWho>(['you', 'product', 'people', 'builder'])

/** The board waits on the person looking at it. */
export const waitsOnMe = (b: Pick<ReqBoard, 'row'>) => b.row.waits.who === 'you'

/** Its repo has no remote: done only on this machine (an older backend: every actor of the runner's part skipped). */
export function localOnly(b: Pick<ReqBoard, 'row' | 'actors' | 'direct'>): boolean {
  if (typeof b.row.local_only === 'boolean') return b.row.local_only
  const runner = b.actors.filter((a) => RUNNER_PART.has(a.key))
  return b.direct || (runner.length > 0 && runner.every((a) => a.status === 'skipped'))
}
export const RUNNER_PART: ReadonlySet<string> = new Set(['handover', 'bridge', 'signer', 'runner'])

export type LeanNow = { done_n: number; skipped_n: number; next: { id: string; label: string; n: number } | null; total: number; started: boolean }

/** Lean's progress the one way (vocab.leanProgress's parts); an older backend's counts read as done, none skipped. */
export function leanOf(l: LeanSummary): LeanNow {
  const started = l.stage_state === 'started'
  if (typeof l.done_n === 'number') return { done_n: l.done_n, skipped_n: l.skipped_n ?? 0, next: l.next ?? null, total: l.total, started }
  const next = (l.stage_state === 'started' || l.stage_state === 'todo') && l.stage_label && l.stage_n !== null
    ? { id: l.stage ?? '', label: l.stage_label, n: l.stage_n } : null
  return { done_n: l.done, skipped_n: 0, next, total: l.total, started }
}

const STAGES = Object.entries(STAGE_NAME)

/** Lean's progress as its stage events tell it up to *t* (回放): a stage done or skipped (each unit's counts once). */
export function leanFromEvents(events: ReadonlyArray<{ kind: string; at: number; text: string }>, t: number, total = 11): LeanNow {
  const done = new Set<string>()
  const skipped = new Set<string>()
  let open: string | null = null
  for (const e of events) {
    if (e.kind !== 'stage' || e.at > t) continue
    const m = /^(开始|做完|跳过)「([^」（]+)/.exec(e.text)
    if (!m) continue
    const label = m[2]
    if (m[1] === '开始') open = label
    else (m[1] === '做完' ? done : skipped).add(label)
    if (m[1] !== '开始' && open === label) open = null
  }
  // the stage at work is the next one; else the first, in Lean's order, neither done nor skipped
  const at = open !== null ? STAGES.findIndex(([, label]) => label === open) : -1
  const i = at >= 0 ? at : STAGES.findIndex(([, label]) => !done.has(label) && !skipped.has(label))
  const next = i < 0 ? null : { id: STAGES[i][0], label: STAGES[i][1], n: i + 1 }
  return { done_n: done.size, skipped_n: skipped.size, next, total, started: at >= 0 }
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
  return w.cells.filter((c) => c.status === 'skip' && (c.group === 'gate' || c.group === 'verify')).map((c) => (c.group === 'gate' ? `${c.label}审批` : c.label))
}

/** What the checks say, the one way (the KPI, the wall, 验收): 「目前 3 项都过 · 还剩 发布审批」. A check that waits for
 * a person names whom; the 14 days after the merge are 「在观察」, nobody's turn. */
export function checksSay(w: CheckWall, who: WaitWho, owner: string | null): ChecksSay {
  const n = (s: string) => w.cells.filter((c) => c.status === s).length
  const wait = n('wait')
  const watch = n('watch')
  const todo = todoLeft(w)
  const left = todo.length ? ` · 还剩 ${todo.join('、')}` : ''
  const watching = watch ? ` · ${watch} 项在观察` : ''
  if (!w.total && !watch) return { text: '还没有检查结果', tone: 'idle', green: false }
  if (w.failed) return { text: `${w.failed} 项没过${left}`, tone: 'bad', green: false }
  if (wait) return { text: `${wait} 项${PERSON.has(who) ? whoWord(who, owner) : '等人'}${left}`, tone: 'approve', green: false }
  const all = w.passed === 1 ? '1 项过了' : `${w.passed} 项都过`
  if (todo.length) return { text: `目前 ${all}${left}${watching}`, tone: 'info', green: false }
  return { text: `${w.passed === 1 ? '1 项过了' : `${w.passed} 项全过`}${watching}`, tone: 'ok', green: !watch }
}
