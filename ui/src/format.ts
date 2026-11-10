/** Number, time and rate formats the views share. Pure: no React, no DOM. */

/** 45 秒, 23 分钟, 1 小时 5 分 */
export function fmtSpan(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s} 秒`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${h} 小时 ${mm} 分` : `${h} 小时`
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

/** How long ago *t* was (epoch seconds), against *now* (epoch seconds: the server's `at` when there is one). */
export function ago(t: number | null | undefined, now: number = Date.now() / 1000): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return '—'
  return fmtAgo(now - t)
}

export function fmtCredits(c: number | null | undefined): string {
  if (c === null || c === undefined || !Number.isFinite(c)) return '—'
  return c >= 100 ? String(Math.round(c)) : (Math.round(c * 10) / 10).toFixed(1)
}

/** 3/4 · 75%; 0/0 · —. */
export function fmtRate([a, b]: [number, number]): { frac: string; pct: string } {
  return { frac: `${a}/${b}`, pct: b > 0 ? `${Math.round((a / b) * 100)}%` : '—' }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The local day of an epoch-seconds time: 2026-11-08. */
export function fmtDay(t: number): string {
  const d = new Date(t * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The local day and time of an epoch-seconds time: 2026-11-08 14:05. */
export function fmtTime(t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return '—'
  const d = new Date(t * 1000)
  return `${fmtDay(t)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** An ISO time as local day and time (2026-11-08 14:05), or the text as it is when it does not parse. */
export function fmtIso(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? fmtTime(ms / 1000) : iso
}

/** The local day of an ISO time, or null when there is none or it does not parse. */
export function isoDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? fmtDay(ms / 1000) : null
}

/** The lines of a textarea: trimmed, empty ones dropped. */
export function lines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

/** Paths typed into one box, separated by new lines, commas (also ，、), semicolons or whitespace, as the backend splits
 * one string of paths; empty ones dropped. */
export function splitPaths(text: string): string[] {
  return text.split(/[\s,，、;；]+/).filter(Boolean)
}

/** How long something has waited, in one unit: 不到 1 分钟, 25 分钟, 11 小时, 3 天 (「已等 11 小时」). */
export function fmtWaited(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return '不到 1 分钟'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} 小时`
  return `${Math.floor(h / 24)} 天`
}

const HAN = /[㐀-鿿]/
const LATIN = /[A-Za-z0-9]/
/** Pieces of one sentence joined the way the app spaces Chinese (backend/core/deliveries.py spaced): a space where a
 * Han character meets a Latin letter or digit (「读的是 demo 的 main 分支」), none next to punctuation or a space. */
export function spaced(...parts: string[]): string {
  return parts.reduce((out, p) => {
    const a = out.slice(-1), b = p.slice(0, 1)
    return out + ((HAN.test(a) && LATIN.test(b)) || (LATIN.test(a) && HAN.test(b)) ? ' ' : '') + p
  }, '')
}
