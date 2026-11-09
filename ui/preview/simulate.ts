/**
 * ?simulate=1 on the preview's 需求看板 (the sample preview's simulate): the requirement plays forward by itself, one
 * moment every 3.2 s (?stepMs=… for another pace; ?step=n holds it at the n-th moment), the way a live board changes
 * while the work goes on: nodes change colour, check cells flip, commits slide onto the conveyor, particles fly. Each
 * poll answers with the board as it stood just after the next event (timeline.ts replayAt), that moment as its `at`;
 * after the last one, the board as it is.
 */
import { replayAt } from '../src/board/timeline'
import type { ReqBoard } from '../src/types'

const q = new URLSearchParams(location.search)
const on = q.get('simulate') === '1'
const STEP_MS = Math.max(500, Number(q.get('stepMs') ?? 3200))
const held = q.get('step')
const t0 = performance.now()

export function simulated(b: ReqBoard): ReqBoard {
  if (!on) return b
  const moments = [...new Set(b.events.map((e) => e.at))].sort((x, y) => x - y)
  const i = held !== null ? Math.min(moments.length - 1, Math.max(0, Number(held) || 0)) : Math.floor((performance.now() - t0) / STEP_MS)
  if (!moments.length || i >= moments.length) return b
  const t = moments[i] + 1
  return { ...replayAt(b, t), at: t }
}
