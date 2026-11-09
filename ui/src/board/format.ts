/**
 * Words, tones and number formats every part of the 需求看板 shares (the sample team board's format.ts, in a
 * requirement's words). Pure: no React, no DOM.
 *
 * A tone is a meaning, not a colour: styles.ts maps each to a colour per host mode (kiro-dark / kiro-light), so the
 * same word always has the same colour and every colour has a word next to it.
 */
import type { ActorStatus, BoardEventKind } from '../types'

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
}
