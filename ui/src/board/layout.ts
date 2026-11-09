/**
 * Where the requirement's board graph puts everything (the sample team board's layout.ts, for a requirement's way
 * instead of a team). Pure: the same snapshot always gives the same picture, and events never move anything.
 *
 * The actors stand in columns, left → right, the way a requirement goes: 你 (the owner, at the far left where the
 * sample has its orchestrator, with what the Brain brought in under it) → 本机会话 (brain-dev) → Lean's approvals
 * (① 需求, ② 设计, one above the other) → 交接 over 桥 over 签名 (one column: the hand-over and what checks it) →
 * 运行机会话 (brain-run) → CI 检查 over 发布验收 → 回写 Brain. Columns group into phase bands (本机 · Lean, 运行机,
 * 检查 · 验收, 回写), as the sample's AI-DLC phases do.
 * Edges leave a node's right side and enter the next one's left side; an edge between two nodes of one column runs
 * straight down; an edge that skips columns runs across them above or below their nodes.
 *
 * The run branch is a rail along the bottom: each actor that commits drops into it in its own lane just right of its
 * column, the hand-over commit is a dot of its own, the merge into the default branch the rail's green end; the check
 * ring (the check wall's passed / total) sits at the rail's right end, like the sample's test station.
 */

export const GW = 1640
export const NODE_W = 184
export const NODE_H = 80
export const STATION_R = 28
/** Top of the first row (phase titles, their subtitles and the badges sit above it). */
const TOP = 98
const PAD_X = 24
/** Nodes of one column: their centres this far apart (room between them for a live ticker or a 「去打那一行」 chip). A
 * column holds one node (in the middle), two (a half step above and below it) or three (top, middle, bottom). */
const ROW_GAP = 124
/** Room kept free around a node when an edge passes its column; below it, room for its live ticker. */
const ROUTE_PAD = 12
const TICKER_PAD = 26
/** The orchestrator's slot at the far left (the person). */
const ORCH_W = 176
export const ORCH_BOX = { w: 132, h: 76 }
/** The list under the person (what the Brain brought in): the same sizes TeamGraph draws, so the graph is tall enough. */
export const ROSTER = { top: 26, title: 16, group: 17, row: 16, gap: 3 }

export interface Pt {
  x: number
  y: number
}
export type Seg = readonly [Pt, Pt, Pt, Pt]
export type Path = Seg[]

export interface NodeBox extends Pt {
  key: string
  stage: number
  row: number
}

export interface StageInfo {
  index: number
  x: number
  keys: string[]
  phase: string
}

export interface PhaseBand {
  key: string
  n: string
  title: string
  en: string
  sub: string
  x1: number
  x2: number
  used: boolean
}

export interface EdgeGeom {
  from: string
  to: string
  path: Path
  d: string
}

export interface GraphLayout {
  width: number
  height: number
  nodes: Map<string, NodeBox>
  stages: StageInfo[]
  edges: EdgeGeom[]
  rail: { x1: number; x2: number; y: number }
  station: Pt & { r: number }
  /** Where each actor's lane meets the rail (its commits drop in there). */
  mergeX: Map<string, number>
  phases: PhaseBand[]
  orch: Pt
}

/** The phases of a requirement's way, left to right (the bands' titles). */
export const PHASES: ReadonlyArray<{ key: string; n: string; title: string; en: string; sub: string }> = [
  { key: 'local', n: '1', title: '本机 · Lean', en: 'Local', sub: 'brain-dev 会话 · 需求和设计审批' },
  { key: 'runner', n: '2', title: '交给运行机', en: 'Team runner', sub: 'brain handoff · 桥核对 · 签名 · brain-run' },
  { key: 'check', n: '3', title: '检查 · 验收', en: 'Checks', sub: 'verify · 发布审批 · 验收' },
  { key: 'land', n: '4', title: '回写', en: 'Brain', sub: '合并以后 · brain reflect' },
]

/** Each actor's column (0 = the first right of the person), its height in half row steps from the top row (0 top, 2
 * middle, 4 bottom; 1 and 3 for a pair), its place in its column (0 the upper) and its phase. */
export const SLOTS: Record<string, { col: number; half: number; row: number; phase: string }> = {
  local: { col: 0, half: 2, row: 0, phase: 'local' },
  req: { col: 1, half: 1, row: 0, phase: 'local' },
  design: { col: 1, half: 3, row: 1, phase: 'local' },
  handover: { col: 2, half: 0, row: 0, phase: 'runner' },
  bridge: { col: 2, half: 2, row: 1, phase: 'runner' },
  signer: { col: 2, half: 4, row: 2, phase: 'runner' },
  runner: { col: 3, half: 2, row: 0, phase: 'runner' },
  ci: { col: 4, half: 1, row: 0, phase: 'check' },
  release: { col: 4, half: 3, row: 1, phase: 'check' },
  reflect: { col: 5, half: 2, row: 0, phase: 'land' },
}
const COLS = 6

const round = (v: number) => Math.round(v * 10) / 10

export function bez(s: Seg, t: number): Pt {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return { x: a * s[0].x + b * s[1].x + c * s[2].x + d * s[3].x, y: a * s[0].y + b * s[1].y + c * s[2].y + d * s[3].y }
}

const lerp = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })

/** A straight piece as a cubic (so a path is one kind of segment). */
export const line = (p: Pt, q: Pt): Seg => [p, lerp(p, q, 1 / 3), lerp(p, q, 2 / 3), q]

/** An S bend with horizontal tangents at both ends. */
export function sCurve(p: Pt, q: Pt): Seg {
  const dx = (q.x - p.x) / 2
  return [p, { x: p.x + dx, y: p.y }, { x: q.x - dx, y: q.y }, q]
}

/** Heading right at *p*, turning to head down (or up) into *q*. */
const turnDown = (p: Pt, q: Pt): Seg => [p, { x: q.x, y: p.y }, { x: q.x, y: p.y }, q]

/** Heading down at *p*, turning to head right into *q*. */
const turnRight = (p: Pt, q: Pt): Seg => [p, { x: p.x, y: q.y }, { x: p.x, y: q.y }, q]

export function reversePath(p: Path): Path {
  return p
    .slice()
    .reverse()
    .map((s) => [s[3], s[2], s[1], s[0]] as const)
}

export function pathD(path: Path): string {
  if (!path.length) return ''
  const f = (p: Pt) => `${round(p.x)},${round(p.y)}`
  return `M${f(path[0][0])}${path.map((s) => ` C${f(s[1])} ${f(s[2])} ${f(s[3])}`).join('')}`
}

export interface PathInfo {
  segs: Path
  lens: number[]
  total: number
}

export function measure(path: Path): PathInfo {
  const lens = path.map((s) => {
    let len = 0
    let prev = s[0]
    for (let i = 1; i <= 12; i++) {
      const p = bez(s, i / 12)
      len += Math.hypot(p.x - prev.x, p.y - prev.y)
      prev = p
    }
    return len
  })
  return { segs: path, lens, total: lens.reduce((a, b) => a + b, 0) }
}

/** The point *t* (0…1) of the way along the path, by length. */
export function pointAt(info: PathInfo, t: number): Pt {
  const n = info.segs.length
  if (!n) return { x: 0, y: 0 }
  let d = Math.min(1, Math.max(0, t)) * info.total
  for (let i = 0; i < n; i++) {
    const len = info.lens[i]
    if (d <= len || i === n - 1) return bez(info.segs[i], len > 0 ? Math.min(1, d / len) : 1)
    d -= len
  }
  return info.segs[n - 1][3]
}

/** An edge from *a* to *b*: down within a column, else out of a's right side into b's left side, across the columns in
 * between above or below their nodes (later edges through the same spot beside the first). */
function routeEdge(a: NodeBox, b: NodeBox, stages: StageInfo[], nodes: Map<string, NodeBox>, usage: Map<string, number>): Path {
  if (a.stage === b.stage) {
    const down = b.y > a.y
    const p0 = { x: a.x, y: a.y + (down ? NODE_H / 2 : -NODE_H / 2) }
    const p1 = { x: b.x, y: b.y + (down ? -NODE_H / 2 : NODE_H / 2) }
    return [line(p0, p1)]
  }
  const start = { x: a.x + NODE_W / 2, y: a.y }
  const end = { x: b.x - NODE_W / 2, y: b.y }
  const pts: Pt[] = [start]
  for (let s = a.stage + 1; s < b.stage; s++) {
    const st = stages[s]
    const t = (st.x - start.x) / (end.x - start.x || 1)
    let y = start.y + (end.y - start.y) * t
    const bands = st.keys
      .map((k) => nodes.get(k)!)
      .sort((p, q) => p.y - q.y)
      .map((n) => [n.y - NODE_H / 2 - ROUTE_PAD, n.y + NODE_H / 2 + ROUTE_PAD + TICKER_PAD] as [number, number])
      .reduce<Array<[number, number]>>((acc, band) => {
        const last = acc[acc.length - 1]
        if (last && band[0] <= last[1]) last[1] = Math.max(last[1], band[1])
        else acc.push([...band])
        return acc
      }, [])
    let side = 0
    for (const [lo, hi] of bands) {
      if (y > lo && y < hi) {
        side = y - lo < hi - y ? -1 : 1
        y = side < 0 ? lo : hi
        break
      }
    }
    const slot = `${s}:${Math.round(y)}`
    const used = usage.get(slot) ?? 0
    usage.set(slot, used + 1)
    if (used) y += (side || (used % 2 ? 1 : -1)) * 7 * (side ? used : Math.ceil(used / 2))
    pts.push({ x: st.x - NODE_W / 2 - 10, y }, { x: st.x + NODE_W / 2 + 10, y })
  }
  pts.push(end)
  const path: Path = []
  for (let i = 0; i < pts.length - 1; i++) path.push(i % 2 === 1 ? line(pts[i], pts[i + 1]) : sCurve(pts[i], pts[i + 1]))
  return path
}

/** The edges of a requirement's way. *direct*: it never went to the runner (a local-only requirement past its design):
 * the way runs from the design approval straight to the checks. */
export function edgesOf(keys: ReadonlySet<string>, direct: boolean): [string, string][] {
  const all: [string, string][] = [
    ['local', 'req'], ['local', 'design'], ['req', 'handover'], ['design', 'handover'], ['handover', 'bridge'],
    ['bridge', 'signer'], ['signer', 'runner'], ['runner', 'ci'], ['ci', 'release'], ['release', 'reflect'],
  ]
  if (direct) all.push(['design', 'ci'])
  return all.filter(([a, b]) => keys.has(a) && keys.has(b))
}

export function layoutGraph(keys: string[], edgeList: ReadonlyArray<readonly [string, string]>, rosterRows = 0): GraphLayout {
  const W = GW
  const left = PAD_X + NODE_W / 2 + ORCH_W
  const right = W - (70 + NODE_W / 2)
  const step = (right - left) / (COLS - 1)
  const stages: StageInfo[] = Array.from({ length: COLS }, (_, i) => ({ index: i, x: round(left + i * step), keys: [], phase: '' }))
  const yTop = TOP + NODE_H / 2
  const yBot = yTop + 2 * ROW_GAP
  const nodes = new Map<string, NodeBox>()
  const mergeX = new Map<string, number>()
  for (const key of keys) {
    const s = SLOTS[key]
    if (!s) continue
    const st = stages[s.col]
    st.keys.push(key)
    st.phase = s.phase
    nodes.set(key, { key, stage: s.col, row: s.row, x: st.x, y: round(yTop + (s.half * ROW_GAP) / 2) })
    // its commits' lane, in the gap right of its column (only the upper two of a column commit: 交接 in its column)
    mergeX.set(key, round(st.x + NODE_W / 2 + 18 + 20 * Math.min(1, s.row)))
  }
  const rosterBottom = TOP + ORCH_BOX.h - 6 + ROSTER.top + ROSTER.title + rosterRows * ROSTER.row + ROSTER.group + ROSTER.gap
  const railY = Math.max(yBot + NODE_H / 2 + 62, rosterBottom + 40)
  const usage = new Map<string, number>()
  const edges: EdgeGeom[] = []
  for (const [from, to] of edgeList) {
    const a = nodes.get(from)
    const b = nodes.get(to)
    if (!a || !b || from === to) continue
    const path = routeEdge(a, b, stages, nodes, usage)
    edges.push({ from, to, path, d: pathD(path) })
  }
  const station = { x: W - 42, y: railY, r: STATION_R }
  const phases: PhaseBand[] = []
  for (const p of PHASES) {
    const cols = stages.filter((s) => SLOTS_BY_PHASE[p.key]?.includes(s.index))
    if (!cols.length) continue
    phases.push({ ...p, x1: round(cols[0].x - NODE_W / 2 - 14), x2: round(cols[cols.length - 1].x + NODE_W / 2 + 14), used: cols.some((c) => c.keys.length > 0) })
  }
  for (let i = 1; i < phases.length; i++) {
    const m = (phases[i - 1].x2 - 14 + phases[i].x1 + 14) / 2
    phases[i - 1].x2 = round(Math.min(phases[i - 1].x2, m - 4))
    phases[i].x1 = round(Math.max(phases[i].x1, m + 4))
  }
  // 0 认领: the person, at the far left, as the sample's orchestrator
  phases.unshift({ key: 'init', n: '0', title: '你', en: 'Owner', sub: '认领 · 文档过五关 · 开工', x1: 8, x2: round((phases[0]?.x1 ?? 200) - 8), used: true })
  const orch = { x: round(PAD_X + ORCH_W / 2 - 10), y: TOP + ORCH_BOX.h / 2 - 6 }
  return { width: W, height: railY + 44, nodes, stages, edges, rail: { x1: PAD_X, x2: station.x - STATION_R, y: railY }, station, mergeX, phases, orch }
}

/** The columns of each phase band. */
const SLOTS_BY_PHASE: Record<string, number[]> = { local: [0, 1], runner: [2, 3], check: [4], land: [5] }

// ---------------------------------------------------------------------------------------------
// anchors and the routes particles take
// ---------------------------------------------------------------------------------------------

/** 'run' (the run branch), 'tests' (the check ring), 'orch' (the person) or an actor key. */
export type Anchor = string
export const RUN = 'run'
export const TESTS = 'tests'
export const ORCH = 'orch'

export function anchorPoint(lay: GraphLayout, a: Anchor, headX: number): Pt | null {
  if (a === TESTS) return { x: lay.station.x, y: lay.station.y }
  if (a === RUN) return { x: headX, y: lay.rail.y }
  if (a === ORCH) return lay.orch
  const n = lay.nodes.get(a)
  return n ? { x: n.x, y: n.y } : null
}

/** The box an anchor takes up (a blip pulses around it). */
export function anchorBox(lay: GraphLayout, a: Anchor, headX: number): (Pt & { w: number; h: number; rx: number }) | null {
  if (a === TESTS) return { x: lay.station.x, y: lay.station.y, w: lay.station.r * 2, h: lay.station.r * 2, rx: lay.station.r }
  if (a === RUN) return { x: headX, y: lay.rail.y, w: 22, h: 22, rx: 11 }
  if (a === ORCH) return { ...lay.orch, w: ORCH_BOX.w, h: ORCH_BOX.h, rx: 18 }
  const n = lay.nodes.get(a)
  return n ? { x: n.x, y: n.y, w: NODE_W, h: NODE_H, rx: 16 } : null
}

/** The y of the person's command bus: just under the phase titles. */
const BUS_Y = 68

/** The person's line to an actor waiting on them (or working for them): along the bus under the phase titles, down
 * the gap left of its column, into its left side. */
export function commandPath(lay: GraphLayout, key: string): Path | null {
  const o = lay.orch
  const n = lay.nodes.get(key)
  if (!n) return null
  const p0 = { x: o.x + ORCH_BOX.w / 2, y: o.y }
  const gap = n.x - NODE_W / 2 - 18
  const bus = { x: Math.min(p0.x + 28, gap - 18), y: BUS_Y }
  const down = { x: gap, y: Math.max(BUS_Y + 18, n.y - 18) }
  const end = { x: n.x - NODE_W / 2, y: n.y }
  return [sCurve(p0, bus), line(bus, { x: gap - 18, y: BUS_Y }), turnDown({ x: gap - 18, y: BUS_Y }, down), turnRight(down, end)]
}

/** An actor's commit route: out of its right side, down its lane to the rail. */
export function mergePath(lay: GraphLayout, key: string): Path | null {
  const n = lay.nodes.get(key)
  const mx = lay.mergeX.get(key)
  if (!n || mx === undefined) return null
  const p0 = { x: n.x + NODE_W / 2, y: n.y }
  const turn = { x: mx, y: n.y + 24 }
  return [turnDown(p0, turn), line(turn, { x: mx, y: lay.rail.y })]
}

/** The route a particle takes from *from* to *to*; null when it does not travel (a blip on *to*). */
export function particlePath(lay: GraphLayout, from: Anchor, to: Anchor, headX: number): Path | null {
  if (from === to) return null
  const st = lay.station
  if (from === ORCH && lay.nodes.has(to)) return commandPath(lay, to)
  if (to === ORCH && lay.nodes.has(from)) {
    const p = commandPath(lay, from)
    return p ? reversePath(p) : null
  }
  if (to === RUN && lay.nodes.has(from)) return mergePath(lay, from)
  if (from === RUN && to === TESTS) return [line({ x: Math.min(headX, st.x - st.r - 20), y: lay.rail.y }, { x: st.x - st.r, y: lay.rail.y })]
  if (from === TESTS && lay.nodes.has(to)) {
    const m = mergePath(lay, to)
    const mx = lay.mergeX.get(to)
    if (!m || mx === undefined) return null
    return [line({ x: st.x - st.r, y: lay.rail.y }, { x: mx, y: lay.rail.y }), ...reversePath(m)]
  }
  if (lay.nodes.has(from) && lay.nodes.has(to)) {
    const e = lay.edges.find((g) => g.from === from && g.to === to)
    if (e) return e.path
    const back = lay.edges.find((g) => g.from === to && g.to === from)
    if (back) return reversePath(back.path)
    const a = lay.nodes.get(from)!
    const b = lay.nodes.get(to)!
    if (a.stage === b.stage) return [line({ x: a.x, y: a.y + (b.y > a.y ? NODE_H / 2 : -NODE_H / 2) }, { x: b.x, y: b.y + (b.y > a.y ? -NODE_H / 2 : NODE_H / 2) })]
    return b.x >= a.x ? [sCurve({ x: a.x + NODE_W / 2, y: a.y }, { x: b.x - NODE_W / 2, y: b.y })] : [sCurve({ x: a.x - NODE_W / 2, y: a.y }, { x: b.x + NODE_W / 2, y: b.y })]
  }
  const a = anchorPoint(lay, from, headX)
  const b = anchorPoint(lay, to, headX)
  return a && b ? [sCurve(a, b)] : null
}

/** The run branch's head on the rail: the lane of the actor that committed last (the hand-over, the runner, the
 * local session), else a little way in from its start. */
export function headX(lay: GraphLayout, belt: ReadonlyArray<{ actor: string }>): number {
  for (let i = belt.length - 1; i >= 0; i--) {
    const x = lay.mergeX.get(belt[i].actor)
    if (x !== undefined) return x
  }
  return lay.rail.x1 + 120
}
