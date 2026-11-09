/**
 * 回放 on the board (the sample team board's Replay.tsx): a requirement played again from its own record, with a
 * scrubber and three speeds. The board shows replayAt(board, t) (timeline.ts) instead of the latest snapshot, and every
 * tick goes through the same differ as a live poll, so particles, flips and red flashes come in the order they
 * happened. Nothing can be done while it plays (no line, no step): it costs nothing and changes nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReqBoard } from '../types'
import { diffBoards, type BoardDiff } from './diff'
import { fmtSpan, fmtWhen } from './format'
import type { SnapshotClock } from './hooks'
import { replayAt, replayClock, replaySpan, type ReplaySpan } from './timeline'

/** The whole replay plays in about this many seconds at 1×. */
export const PLAY_S = 60
export const SPEEDS = [1, 2, 4] as const
export const TICK_MS = 250

export interface ReplayHandle {
  on: boolean
  board: ReqBoard | null
  clock: SnapshotClock | null
  span: ReplaySpan | null
  /** play time, 0 … total */
  p: number
  total: number
  /** the real time the replay stands at */
  t: number
  /** the requirement had ended (merged or closed) when the replay started */
  finished: boolean
  speed: number
  playing: boolean
  start: () => void
  exit: () => void
  toggle: () => void
  pause: () => void
  seek: (p: number) => void
  setSpeed: (s: number) => void
}

export function useReplay(board: ReqBoard | null, onDiff: (d: BoardDiff) => void): ReplayHandle {
  const [st, setSt] = useState({ on: false, p: 0, speed: 1, playing: false })
  const frozen = useRef<ReqBoard | null>(null)
  const prev = useRef<ReqBoard | null>(null)
  const quiet = useRef(false)
  if (!st.on) frozen.current = board
  const src = st.on ? frozen.current : null
  const clk = useMemo(() => (src ? replayClock(src) : null), [src])
  const span = useMemo(() => (src ? replaySpan(src) : null), [src])
  const total = clk?.total ?? 0
  const t = clk ? clk.toReal(st.p) : 0

  const start = useCallback(() => {
    frozen.current = board
    prev.current = null
    setSt({ on: true, p: 0, speed: 1, playing: true })
  }, [board])
  const exit = useCallback(() => {
    prev.current = null
    setSt({ on: false, p: 0, speed: 1, playing: false })
  }, [])
  const toggle = useCallback(() => setSt((s) => {
    if (s.p >= total) {
      quiet.current = true
      prev.current = null
      return { ...s, p: 0, playing: true }
    }
    return { ...s, playing: !s.playing }
  }), [total])
  const pause = useCallback(() => setSt((s) => ({ ...s, playing: false })), [])
  const seek = useCallback((p: number) => {
    quiet.current = true
    setSt((s) => ({ ...s, p }))
  }, [])
  const setSpeed = useCallback((speed: number) => setSt((s) => ({ ...s, speed })), [])

  useEffect(() => {
    if (!st.on || !st.playing || !total) return
    const step = (total / PLAY_S) * (TICK_MS / 1000)
    const timer = setInterval(() => setSt((s) => {
      const p = Math.min(total, s.p + step * s.speed)
      return { ...s, p, playing: p < total }
    }), TICK_MS)
    return () => clearInterval(timer)
  }, [st.on, st.playing, total])

  const shown = useMemo(() => (src && span ? replayAt(src, t) : null), [src, span, t])
  useEffect(() => {
    if (!shown) return
    // events up to two ticks of the requirement's time old still fly
    const late = Math.max(30, (total / PLAY_S) * st.speed * (TICK_MS / 1000) * 2)
    const d = diffBoards(prev.current, shown, { at: t, resync: quiet.current, lateS: late })
    quiet.current = false
    prev.current = shown
    onDiff(d)
  }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps

  const clock = useMemo(() => (shown ? { at: t, receivedAt: Number.POSITIVE_INFINITY } : null), [shown, t])
  const finished = !!src && (src.ended_at !== null || src.row.state === 'merged' || src.row.state === 'closed')
  return { on: st.on, board: shown, clock, span, p: st.p, total, t, finished, speed: st.speed, playing: st.playing, start, exit, toggle, pause, seek, setSpeed }
}

/** The replay's controls, under the top bar: what is playing, how far, how fast. */
export function ReplayBar({ rp }: { rp: ReplayHandle }) {
  if (!rp.on || !rp.span) return null
  const ended = rp.p >= rp.total
  return (
    <div className="kt-replay" role="group" aria-label="回放" data-testid="br-replay">
      <span className="kt-pill tone-info">回放</span>
      <button type="button" className="kt-btn kt-btn-icon" onClick={rp.toggle} aria-label={rp.playing ? '暂停' : ended ? '从头再放' : '播放'} title={rp.playing ? '暂停' : ended ? '从头再放' : '播放'}>
        {rp.playing ? '⏸' : ended ? '↺' : '▶'}
      </button>
      <input type="range" className="kt-replay-scrub" aria-label="回放进度" min={0} max={Math.max(1, Math.round(rp.total))} step={1}
        value={Math.min(rp.total, Math.round(rp.p))} onChange={(e) => rp.seek(Number(e.target.value))} />
      <span className="kt-mono kt-replay-time" title="这一刻的真实时间">
        {fmtWhen(rp.t)} · 第 {fmtSpan(rp.t - rp.span.start)}
      </span>
      <span className="kt-replay-speeds" role="radiogroup" aria-label="倍速">
        {SPEEDS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={rp.speed === s} className={`kt-btn${rp.speed === s ? ' is-on' : ''}`} onClick={() => rp.setSpeed(s)}>
            {s}×
          </button>
        ))}
      </span>
      <span className="kt-dim kt-replay-note">{ended ? (rp.finished ? '放完了：下面是这个需求最后的样子' : '放到现在了：它还在进行') : '按记录重放：安静的时段缩短了，不调用 agent'}</span>
      <button type="button" className="kt-btn" onClick={rp.exit}>退出回放</button>
    </div>
  )
}
