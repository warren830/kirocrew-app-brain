/**
 * The requirement's graph (the hero; the sample team board's TeamGraph.tsx): its actors as nodes in phase bands
 * (layout.ts), the edges of its way, the run branch as a rail along the bottom with a dot per actor that committed and
 * the merge at its end, and the check ring at the rail's end. The owner sits at the far left where the sample has its
 * orchestrator, with what the Brain brought in under them; a dashed magenta line runs from them to every actor that
 * waits for them. React draws the static layer; the particle layer on top (overlay.ts, aria-hidden) is the only thing
 * that travels, one particle per real event the differ found.
 *
 * State is colour + shape + words, never colour alone: working actors glow and their avatar ring spins; queued is a
 * marching dashed outline; stalled is hatched; waiting for the person looking blinks magenta (waiting for someone else
 * is a calm blue outline that says whom); failed is solid red with ✕; done is a green outline; finished is solid green
 * with ✔; not on this requirement's way is dimmed and dotted, a whole phase of those a narrow grey band.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactNode } from 'react'
import type { Actor, ReqBoard, WaitDo } from '../types'
import { ACT, DO_NAME } from '../vocab'
import { Engine, type Item } from './engine'
import { LIVE, WORKING, actorLabel, actorMeta, boardWho, clip, fmtCredits, fmtWhen, isFinal, localOnly, runnerBlind, waitsOnMe } from './format'
import { useLatest } from './hooks'
import { NODE_H, NODE_W, ORCH_BOX, ROSTER, anchorBox, commandPath, headX, particlePath, pathD, SCALE, type GraphLayout, type NodeBox } from './layout'
import { Overlay } from './overlay'
import { RoleGlyph, RoleIcon } from './RoleIcon'
import { NodeCard } from './NodeCard'
import { actorDo, reviewNext, waitCount } from './next'

export type FlashMap = Record<string, { n: number; tone: string }>

export interface ActorGraphProps {
  board: ReqBoard
  lay: GraphLayout
  focus: string | null
  onActor: (key: string) => void
  flashes: FlashMap
  reducedMotion: boolean
  feed: MutableRefObject<((items: Item[]) => void) | null>
  /** projection or replay: no live tickers, no hover actions */
  quiet?: boolean
  /** 打开会话 from a node's hover card */
  onSession?: (url: string) => void
  /** an actor that waits for the person: the chip under it takes them to where they act (the session, the step) */
  onAct?: (key: string, d: WaitDo) => void
}

const PULSE_MS = 2400
const beat = () => `-${Math.round(performance.now() % PULSE_MS)}ms`

function useBeat(reducedMotion: boolean) {
  const [delay] = useState(beat)
  return reducedMotion ? undefined : { animationDelay: delay }
}

function Halo({ w, h, reducedMotion }: { w: number; h: number; reducedMotion: boolean }) {
  const style = useBeat(reducedMotion)
  return <rect className="kt-node-halo" x={-w / 2 - 8} y={-h / 2 - 8} width={w + 16} height={h + 16} rx={23} style={style} />
}

/** The roster under the person: what the Brain brought in (loaded, cited, stale) — as many rows as it draws. */
export const ROSTER_IDS = 4
export function rosterRows(b: ReqBoard): number {
  const cited = b.brain.cited.length
  return 2 + Math.min(ROSTER_IDS, cited) + (cited > ROSTER_IDS ? 1 : 0) + (b.brain.stale.length ? 1 : 0)
}

export function ActorGraph({ board, lay, focus, onActor, flashes, reducedMotion, feed, quiet = false, onSession, onAct }: ActorGraphProps) {
  const [card, setCard] = useState<string | null>(null)
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hover = useCallback((key: string | null, delay: number) => {
    if (cardTimer.current) clearTimeout(cardTimer.current)
    cardTimer.current = setTimeout(() => setCard(key), delay)
  }, [])
  useEffect(() => () => void (cardTimer.current && clearTimeout(cardTimer.current)), [])
  const engine = useMemo(() => new Engine({ now: () => performance.now(), reducedMotion }), [reducedMotion])
  const overlay = useRef<Overlay | null>(null)
  const head = headX(lay, board.belt)
  const layRef = useLatest(lay)
  const headRef = useLatest(head)
  const byKey = useMemo(() => new Map(board.actors.map((a) => [a.key as string, a])), [board.actors])

  const particlesRef = useCallback(
    (el: SVGGElement | null) => {
      overlay.current?.dispose()
      overlay.current = el && !reducedMotion
        ? new Overlay(el, engine, {
            path: (a, b) => particlePath(layRef.current, a, b, headRef.current),
            box: (a) => anchorBox(layRef.current, a, headRef.current),
            now: () => performance.now(),
          })
        : null
    },
    [engine, reducedMotion, layRef, headRef],
  )
  useEffect(() => {
    feed.current = (items) => {
      engine.ingest(items, performance.now())
      overlay.current?.wake()
    }
    return () => {
      feed.current = null
    }
  }, [engine, feed])
  useEffect(() => {
    const apply = () => {
      engine.setHidden(document.hidden, performance.now())
      if (!document.hidden) overlay.current?.wake()
    }
    document.addEventListener('visibilitychange', apply)
    return () => document.removeEventListener('visibilitychange', apply)
  }, [engine])
  useEffect(() => () => overlay.current?.dispose(), [])

  const working = board.actors.filter((a) => WORKING.has(a.status)).length
  // what waits, counted and named as 这条路走到哪了 says it (a hand-over to label waits on you with no actor asking);
  // nothing waiting is not said
  const waiting = waitCount(board, quiet)
  const done = board.actors.filter((a) => a.status === 'merged').length
  const mine = waitsOnMe(board)
  const who = boardWho(board)
  const label = `需求的路：${board.actors.length} 个环节，${working} 个在做${waiting ? `，${waiting} 个${mine ? '等你' : who}` : ''}，${done} 个完成；检查 ${board.checks.passed}/${board.checks.total}。点一个环节只看它。`

  return (
    <div className="kt-graph is-phased br-graph" data-testid="kt-graph">
      <Scroller minWidth={Math.floor(lay.width * SCALE)}>
        <svg className="kt-graph-svg" viewBox={`0 0 ${lay.width} ${lay.height}`} role="group" aria-label={label}>
          <GraphDefs />
          <rect className="kt-g-bg" x={0} y={0} width={lay.width} height={lay.height} fill="url(#kt-dots)" />
          <Phases board={board} lay={lay} byKey={byKey} reducedMotion={reducedMotion} />
          {mine && <Commands board={board} lay={lay} />}
          <Person board={board} lay={lay} flash={flashes.orch} reducedMotion={reducedMotion} mine={mine} onHover={(on) => hover(on ? PERSON_CARD : null, on ? 300 : 250)} />
          <Roster board={board} lay={lay} quiet={quiet} />
          <g className="kt-edges" aria-hidden="true">
            {lay.edges.map((e) => {
              const a = byKey.get(e.from)
              const b = byKey.get(e.to)
              const state = edgeState(a, b)
              const hot = !!focus && (e.from === focus || e.to === focus)
              return <path key={`${e.from}>${e.to}`} className={`kt-edge is-${state}${focus ? (hot ? ' is-hot' : ' is-dim') : ''}`} d={e.d} markerEnd={`url(#kt-arrow-${state})`} />
            })}
          </g>
          <Rail board={board} lay={lay} head={head} focus={focus} flash={flashes.run} />
          <Station board={board} lay={lay} flash={flashes.tests} />
          <g className="kt-nodes">
            {board.actors.map((a) => {
              const box = lay.nodes.get(a.key)
              if (!box) return null
              return <GraphNode key={a.key} a={a} box={box} focus={focus} flash={flashes[a.key]} onActor={onActor} reducedMotion={reducedMotion} quiet={quiet}
                mine={mine} who={who} onHover={(on) => hover(on ? a.key : null, on ? 300 : 250)} />
            })}
            {!quiet && mine && board.actors.filter((a) => a.status === 'awaiting_approval' && lay.nodes.get(a.key)).map((a) => (
              <WaitChip key={`wait-${a.key}`} a={a} d={actorDo(a, board)} review={a.key === 'local' && reviewNext(board.row.waits)} box={lay.nodes.get(a.key)!} onAct={onAct} />
            ))}
          </g>
          <g className="kt-particles" aria-hidden="true" ref={particlesRef} />
        </svg>
        {card === PERSON_CARD && (
          <div className="kt-ncard" style={{ top: `${((lay.orch.y - 40) / lay.height) * 100}%`, left: `${((lay.orch.x + 76) / lay.width) * 100}%` }} data-testid="kt-ncard"
            role="dialog" aria-label="负责人" onMouseEnter={() => hover(PERSON_CARD, 0)} onMouseLeave={() => hover(null, 200)}>
            <PersonCard board={board} mine={mine} who={who} />
          </div>
        )}
        {card && byKey.get(card) && lay.nodes.get(card) && (() => {
          const box = lay.nodes.get(card)!
          const right = box.x > lay.width * 0.62
          const low = box.y > lay.height * 0.55
          const style = {
            ...(low ? { bottom: `${Math.max(1, ((lay.height - (box.y + NODE_H / 2)) / lay.height) * 100)}%` } : { top: `${Math.max(1, ((box.y - NODE_H / 2) / lay.height) * 100)}%` }),
            ...(right ? { right: `${((lay.width - (box.x - NODE_W / 2 - 10)) / lay.width) * 100}%` } : { left: `${((box.x + NODE_W / 2 + 10) / lay.width) * 100}%` }),
          }
          return (
            <div key={card} className="kt-ncard" style={style} data-testid="kt-ncard" role="dialog" aria-label={`${byKey.get(card)!.title}做了什么`}
              onMouseEnter={() => hover(card, 0)} onMouseLeave={() => hover(null, 200)}>
              <NodeCard a={byKey.get(card)!} label={actorLabel(byKey.get(card)!.status, board)} onSession={quiet ? undefined : onSession} />
            </div>
          )
        })()}
      </Scroller>
      <Legend handover={board.actors.some((a) => (a.key === 'handover' || a.key === 'signer') && a.status !== 'skipped')} />
    </div>
  )
}

const PERSON_CARD = '__person'

/** The graph at its size (layout.ts SCALE): when the app is narrower, it scrolls sideways, and the edge that hides
 * more of it says so (a fade, and 「右边还有」 that scrolls there): a hidden scrollbar shows nothing. */
function Scroller({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const read = useCallback(() => {
    const el = ref.current
    if (!el) return
    const next = { left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }
    setMore((m) => (m.left === next.left && m.right === next.right ? m : next))
  }, [])
  useEffect(() => {
    read()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [read, minWidth])
  const by = (dir: number) => ref.current?.scrollBy?.({ left: dir * ref.current.clientWidth * 0.6, behavior: 'smooth' })
  return (
    <div className={`br-graph-view${more.left ? ' has-left' : ''}${more.right ? ' has-right' : ''}`}>
      <div className="br-graph-scroll" ref={ref} onScroll={read} data-testid="kt-graph-scroll">
        <div className="kt-graph-stage" style={{ minWidth }}>{children}</div>
      </div>
      {more.left && <button type="button" className="br-graph-more is-left" onClick={() => by(-1)}>← 左边还有</button>}
      {more.right && <button type="button" className="br-graph-more is-right" onClick={() => by(1)} data-testid="kt-graph-more">右边还有 →</button>}
    </div>
  )
}

/** The person's card: the whole sentence their node can only start (UI问题清单 BOARD-10). */
function PersonCard({ board, mine, who }: { board: ReqBoard; mine: boolean; who: string }) {
  const p = board.person
  const w = board.row.waits
  return (
    <div className="kt-ncard-body">
      <p className="kt-ncard-head">
        <RoleIcon role="person" size={16} /> <b>{p.me ? '你' : '负责人'}{p.owner ? `（${p.owner}）` : ''}</b>
        {p.status === 'awaiting_approval' && <span className={`kt-pill tone-${mine ? 'approve' : 'info'}`}>{mine ? '等你' : who}</span>}
      </p>
      <p className={mine && p.status === 'awaiting_approval' ? 'kt-ncard-back' : 'kt-ncard-did'}>{p.doing}</p>
      {w.since ? <ul className="kt-ncard-facts"><li>从 {fmtWhen(w.since)} 起</li></ul> : null}
    </div>
  )
}

/** An edge's state: used (both ends got going), ready (the first is through, the next has not started), pending. */
function edgeState(a: Actor | undefined, b: Actor | undefined): 'used' | 'ready' | 'pending' {
  if (!a || !b) return 'pending'
  const through = a.status === 'merged' || a.status === 'done'
  if (!through) return 'pending'
  return b.status !== 'waiting' && b.status !== 'skipped' ? 'used' : 'ready'
}

function GraphDefs() {
  return (
    <defs>
      <pattern id="kt-dots" width={22} height={22} patternUnits="userSpaceOnUse">
        <circle className="kt-g-dot" cx={2} cy={2} r={1} />
      </pattern>
      <pattern id="kt-hatch" width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect className="kt-hatch-line" x={0} y={0} width={3.5} height={9} />
      </pattern>
      {(['pending', 'ready', 'used'] as const).map((s) => (
        <marker key={s} id={`kt-arrow-${s}`} viewBox="0 0 10 10" refX={8.5} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path className={`kt-arrow is-${s}`} d="M0,0.8 L9,5 L0,9.2 Z" />
        </marker>
      ))}
    </defs>
  )
}

/** A phase's number and words for this requirement, the ones its introduction (Header.tsx WAY / LOCAL_WAY) uses: a repo
 * done only here has no runner phase to count (its band is unnumbered) and approves its release in the session (2 检查 ·
 * 发布, no 验收 on an MR, then 3 回写); a design Lean skipped is not approved. */
function phaseWords(p: GraphLayout['phases'][number], board: ReqBoard): { n: string; title: string; sub: string } {
  if (localOnly(board)) {
    if (p.key === 'runner') return { n: '', title: p.title, sub: p.sub }
    if (p.key === 'check') return { n: '2', title: '检查 · 发布', sub: '自动检查 · 发布审批' }
    if (p.key === 'land') return { n: '3', title: p.title, sub: p.sub }
  }
  if (p.key === 'local' && board.actors.find((a) => a.key === 'design')?.status === 'skipped') return { n: p.n, title: p.title, sub: 'brain-dev 会话 · 需求审批' }
  return { n: p.n, title: p.title, sub: p.sub }
}

function Phases({ board, lay, byKey, reducedMotion }: { board: ReqBoard; lay: GraphLayout; byKey: Map<string, Actor>; reducedMotion: boolean }) {
  const why = localOnly(board) ? '只在本机做' : ''
  return (
    <g className="kt-phases" aria-hidden="true">
      {lay.phases.map((p) => {
        if (!p.used && p.key !== 'init') return <FoldedBand key={p.key} p={p} n={phaseWords(p, board).n} lay={lay} why={p.key === 'runner' ? why : ''} />
        const keys = p.key === 'init' ? [] : lay.stages.filter((s) => s.phase === p.key).flatMap((s) => s.keys)
        const actors = keys.map((k) => byKey.get(k)).filter((a): a is Actor => !!a)
        const live = actors.some((a) => LIVE.has(a.status))
        const workingN = actors.filter((a) => WORKING.has(a.status)).length
        const off = actors.length > 0 && actors.every((a) => a.status === 'skipped')
        const done = actors.length > 0 && !off && actors.every((a) => isFinal(a.status))
        const cx = (p.x1 + p.x2) / 2
        const person = p.key === 'init'
        const words = phaseWords(p, board)
        return (
          <g key={p.key} className={`kt-phase${off ? ' is-unused' : ''}${live || (person && board.person.status === 'awaiting_approval') ? ' is-live' : ''}${done ? ' is-done' : ''}`} data-phase={p.key}>
            <rect className="kt-phase-band" x={p.x1} y={8} width={p.x2 - p.x1} height={lay.rail.y - 34} rx={18} />
            <text className="kt-phase-title" x={cx} y={30} textAnchor="middle">
              {words.n ? `${words.n} ` : ''}{words.title}
            </text>
            <text className="kt-phase-stages" x={cx} y={48} textAnchor="middle">{clip(words.sub, Math.max(6, (p.x2 - p.x1) / 13))}</text>
            {off && <text className="kt-phase-note" x={cx} y={lay.rail.y / 2 + 10} textAnchor="middle">这次不需要</text>}
            {workingN >= 2 && (
              <g className="kt-par" transform={`translate(${cx},${78})`}>
                <rect x={-52} y={-12} width={104} height={24} rx={12} />
                <ParDot reducedMotion={reducedMotion} />
                <text x={6} y={4.5} textAnchor="middle">同时在做 {workingN}</text>
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

/** A phase not on this requirement's way, folded (the sample's 「1 构思 · 这次不需要」): its words sit above the
 * nodes' rows, clear of the edges that cross it. */
function FoldedBand({ p, n, lay, why }: { p: GraphLayout['phases'][number]; n: string; lay: GraphLayout; why: string }) {
  const cx = (p.x1 + p.x2) / 2
  return (
    <g className="kt-phase is-unused is-folded" data-phase={p.key} data-testid="kt-phase-folded">
      <rect className="kt-phase-band" x={p.x1} y={8} width={p.x2 - p.x1} height={lay.rail.y - 34} rx={14} />
      <text className="kt-phase-title" x={cx} y={30} textAnchor="middle">{n ? `${n} ` : ''}{p.short}</text>
      <text className="kt-phase-note" x={cx} y={58} textAnchor="middle">这次不需要</text>
      {why && <text className="kt-phase-stages" x={cx} y={76} textAnchor="middle">{why}</text>}
    </g>
  )
}

function ParDot({ reducedMotion }: { reducedMotion: boolean }) {
  const style = useBeat(reducedMotion)
  return <circle className="kt-par-dot" cx={-38} cy={0} r={4} style={style} />
}

/** The owner, where the sample has its orchestrator: who it is and what waits for them. Only a wait for the person
 * looking blinks; a wait for someone else says whom, calmly. Its card has the whole sentence. */
function Person({ board, lay, flash, reducedMotion, mine, onHover }: {
  board: ReqBoard; lay: GraphLayout; flash?: { n: number; tone: string }; reducedMotion: boolean; mine: boolean; onHover?: (on: boolean) => void
}) {
  const { w, h } = ORCH_BOX
  const p = board.person
  const waiting = p.status === 'awaiting_approval' && mine
  const other = p.status === 'awaiting_approval' && !mine
  return (
    <g className={`kt-orch br-person is-${other ? 'waiting' : p.status}${waiting ? ' is-active' : ''}${other ? ' is-other' : ''}`} transform={`translate(${lay.orch.x},${lay.orch.y})`}
      data-testid="kt-orch" tabIndex={0} aria-label={`负责人 ${p.owner ?? ''}：${p.doing}`} onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)} onBlur={() => onHover?.(false)}>
      {waiting && <Halo w={w} h={h} reducedMotion={reducedMotion} />}
      <rect className="kt-orch-body" x={-w / 2} y={-h / 2} width={w} height={h} rx={18} />
      <RoleGlyph role="person" cx={-w / 2 + 22} cy={-12} size={20} className="kt-node-emoji" />
      <text className="kt-orch-title" x={-w / 2 + 38} y={-6}>{p.me ? '你' : '负责人'}</text>
      <text className="kt-orch-cn" x={-w / 2 + 38} y={13} style={{ fontSize: 12 }}>{clip(p.owner ?? '—', 7)}</text>
      <text className={`kt-orch-sub${waiting ? ' is-wait' : ''}${other ? ' is-other' : ''}`} y={30} textAnchor="middle">{clip(waiting ? `✋ ${p.doing}` : p.doing, 10.5)}</text>
      {flash && <rect key={flash.n} className={`kt-node-flash is-${flash.tone}`} x={-w / 2 - 5} y={-h / 2 - 5} width={w + 10} height={h + 10} rx={22} />}
    </g>
  )
}

/** The person's lines to every actor that waits for them (dashed magenta, the sample's command lines). */
function Commands({ board, lay }: { board: ReqBoard; lay: GraphLayout }) {
  return (
    <g className="kt-cmds" aria-hidden="true">
      {board.actors.filter((a) => a.status === 'awaiting_approval').map((a) => {
        const p = commandPath(lay, a.key)
        return p ? <path key={a.key} className="kt-cmd is-awaiting_approval" d={pathD(p)} /> : null
      })}
    </g>
  )
}

/** Under the person: what the Brain brought in for this requirement (the sample's roster of the team). */
function Roster({ board, lay, quiet }: { board: ReqBoard; lay: GraphLayout; quiet: boolean }) {
  const top = lay.orch.y + ORCH_BOX.h / 2 + ROSTER.top
  const w = ORCH_BOX.w + 12
  const b = board.brain
  const rows: { text: string; cls: string; tip: string }[] = [
    { text: b.loaded !== null ? `载入 ${b.loaded} 条` : '载入 —', cls: b.loaded ? 'is-team is-used' : 'is-team', tip: '开工时从 Brain 带进来的条目' },
    quiet ? { text: '引用 —', cls: 'is-team', tip: '回放时不算：引用记在决定里，决定没有自己的时间' }
      : { text: `引用 ${b.cited.length} 条`, cls: b.cited.length ? 'is-team is-used' : 'is-team', tip: '决定里引用的 Brain 条目' },
    ...b.cited.slice(0, ROSTER_IDS).map((id) => ({ text: id, cls: 'is-team is-used', tip: `引用了 ${id}` })),
    ...(b.cited.length > ROSTER_IDS ? [{ text: `+${b.cited.length - ROSTER_IDS} 条`, cls: 'is-team', tip: b.cited.slice(ROSTER_IDS).join('、') }] : []),
    ...(b.stale.length ? [{ text: `过时 ${b.stale.length} 条`, cls: 'is-team is-busy', tip: `引用了过时的 ${b.stale.join('、')}` }] : []),
  ]
  let y = ROSTER.title
  return (
    <g className="kt-roster" transform={`translate(${lay.orch.x},${top})`} data-testid="kt-roster">
      <text className="kt-roster-title" y={0} textAnchor="middle">Brain 带来的知识</text>
      {rows.map((r, i) => {
        const at = y
        y += ROSTER.row
        return (
          <g key={i} className={`kt-roster-item ${r.cls}`} transform={`translate(0,${at})`}>
            <title>{r.tip}</title>
            <rect x={-w / 2 + 8} y={-7.5} width={w - 8} height={15} rx={7.5} />
            <circle cx={-w / 2 + 18} cy={0.5} r={3.5} />
            <text x={-w / 2 + 28} y={4.5}>{clip(r.text, 10)}</text>
          </g>
        )
      })}
    </g>
  )
}

function Rail({ board, lay, head, focus, flash }: { board: ReqBoard; lay: GraphLayout; head: number; focus: string | null; flash?: { n: number; tone: string } }) {
  const { x1, x2, y } = lay.rail
  const per = new Map<string, { n: number; last: string; bot: boolean }>()
  for (const x of board.belt) {
    if (x.kind === 'merge') continue
    const had = per.get(x.actor)
    per.set(x.actor, { n: (had?.n ?? 0) + 1, last: x.sha.slice(0, 8), bot: x.by === 'bot' })
  }
  const merged = board.ended_at !== null || board.belt.some((x) => x.kind === 'merge')
  const any = board.belt.length > 0
  return (
    <g className="kt-rail" data-testid="kt-rail">
      <line className="kt-rail-base" x1={x1} y1={y} x2={x2} y2={y} />
      {any && <line className="kt-rail-fill" x1={x1} y1={y} x2={merged ? x2 : head} y2={y} />}
      <text className="kt-rail-label" x={x1} y={y - 18}>
        运行分支 <tspan className="kt-mono">{board.branch ?? (board.row.state === 'claimed' ? '（还没开工）' : runnerBlind(board) ? '（运行机还读不到）' : '（还不知道）')}</tspan>
      </text>
      <text className="kt-rail-sub" x={x1} y={y + 24}>
        从 <tspan className="kt-mono">{board.base}</tspan> 出发{merged ? <>，已合并回 <tspan className="kt-mono">{board.base}</tspan></> : ''}
      </text>
      {[...per.entries()].map(([actor, m]) => {
        const mx = lay.mergeX.get(actor)
        const a = board.actors.find((x) => x.key === actor)
        if (mx === undefined || !a) return null
        return (
          <g key={actor} className={`kt-rail-dot${actor === 'handover' ? ' is-handover' : ''}${focus && focus !== actor ? ' is-dim' : ''}`} transform={`translate(${mx},${y})`}>
            <title>{`${a.title}：${actor === 'handover' ? '交接提交' : `${m.n} 次提交`}，最后一次 ${m.last}`}</title>
            <circle r={10} />
            <RoleGlyph role={a.icon} cx={0} cy={0} size={13} />
            {m.n > 1 && <text className="kt-rail-n" x={12} y={-10}>×{m.n}</text>}
          </g>
        )
      })}
      {merged && (
        <g className="kt-rail-dot is-merge" transform={`translate(${x2 - 16},${y})`}>
          <title>{`合并进 ${board.base}`}</title>
          <circle r={11} />
          <RoleGlyph role="merge" cx={0} cy={0} size={14} />
        </g>
      )}
      {flash && <circle key={flash.n} className={`kt-rail-flash is-${flash.tone}`} cx={head} cy={y} r={14} />}
    </g>
  )
}

function Station({ board, lay, flash }: { board: ReqBoard; lay: GraphLayout; flash?: { n: number; tone: string } }) {
  const st = lay.station
  const { passed, failed, total } = board.checks
  const r = st.r - 5
  const c = 2 * Math.PI * r
  const pass = total ? (passed / total) * c : 0
  const fail = total ? (failed / total) * c : 0
  const tone = !total ? 'none' : failed ? 'fail' : passed === total ? 'pass' : 'part'
  return (
    <g className={`kt-station is-${tone}`} transform={`translate(${st.x},${st.y})`} data-testid="kt-station" role="img" aria-label={total ? `检查 ${passed}/${total}` : '还没有检查结果'}>
      <circle className="kt-station-bg" r={st.r} />
      <circle className="kt-station-track" r={r} />
      {pass > 0 && <circle className="kt-station-pass" r={r} strokeDasharray={`${pass} ${c}`} transform="rotate(-90)" />}
      {fail > 0 && <circle className="kt-station-fail" r={r} strokeDasharray={`${fail} ${c}`} strokeDashoffset={-pass} transform="rotate(-90)" />}
      <text className="kt-station-num" y={1} textAnchor="middle" dominantBaseline="central">{total ? `${passed}/${total}` : '—'}</text>
      <text className="kt-station-label" y={-st.r - 9} textAnchor="middle">检查</text>
      {flash && <circle key={flash.n} className={`kt-station-flash is-${flash.tone}`} r={st.r + 3} />}
    </g>
  )
}

function GraphNode({ a, box, focus, flash, onActor, reducedMotion, quiet, onHover, mine, who }: {
  a: Actor; box: NodeBox; focus: string | null; flash?: { n: number; tone: string }; onActor: (k: string) => void; reducedMotion: boolean; quiet: boolean
  onHover?: (on: boolean) => void; mine: boolean; who: string
}) {
  const meta = actorMeta(a.status)
  const w = NODE_W
  const h = NODE_H
  const working = WORKING.has(a.status)
  const awaiting = a.status === 'awaiting_approval'
  const other = awaiting && !mine
  const badges: { text: string; tone: string }[] = []
  if (awaiting) badges.push({ text: mine ? '等你' : who, tone: mine ? 'gate' : 'other' })
  if (a.status === 'stalled') badges.push({ text: '⚠ 卡住', tone: 'warn' })
  if (a.status === 'queued') badges.push({ text: '排队', tone: 'queue' })
  if (a.status === 'fixing') badges.push({ text: '返工', tone: 'fix' })
  if (a.line && mine) badges.push({ text: '打一行', tone: 'approve' })
  const isFocus = focus === a.key
  const name = `${a.title}（${a.sub}）：${awaiting ? (mine ? '等你' : who) : meta.label}，${a.doing}`
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onActor(a.key)
  }
  let bx = w / 2 - 8
  const ticker = !quiet && working && a.session?.busy ? 'AI 在做' : null
  return (
    <g className={`kt-node is-${statusClass(a.status)}${other ? ' is-other' : ''}${isFinal(a.status) && a.status === 'merged' ? ' is-final' : ''}${focus ? (isFocus ? ' is-focus' : ' is-dim') : ''}`}
      transform={`translate(${box.x},${box.y})`} data-role={a.key} data-status={a.status} role="button" tabIndex={0} aria-label={name} aria-pressed={isFocus}
      onClick={() => onActor(a.key)} onKeyDown={onKey} onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}>
      <title>{name}</title>
      {(working || (awaiting && mine)) && <Halo w={w} h={h} reducedMotion={reducedMotion} />}
      <rect className="kt-node-body" x={-w / 2} y={-h / 2} width={w} height={h} rx={16} />
      {a.status === 'stalled' && <rect className="kt-node-hatch" x={-w / 2} y={-h / 2} width={w} height={h} rx={16} fill="url(#kt-hatch)" />}
      {a.status === 'queued' && <rect className="kt-node-ants" x={-w / 2 - 4} y={-h / 2 - 4} width={w + 8} height={h + 8} rx={19} />}
      <circle className="kt-node-avatar" cx={-w / 2 + 33} cy={0} r={22.5} />
      {working && <circle className="kt-node-spin" cx={-w / 2 + 33} cy={0} r={27} />}
      <RoleGlyph role={a.icon} cx={-w / 2 + 33} cy={0} size={24} className="kt-node-emoji" />
      <text className={`kt-node-title${a.title.length >= 5 ? ' is-long' : ''}`} x={-w / 2 + 66} y={-15}>{clip(a.title, 6.4)}</text>
      <text className="kt-node-task" x={-w / 2 + 66} y={4}>{clip(a.sub, 9.6)}</text>
      <text className="kt-node-sub" x={-w / 2 + 66} y={23}>{subLine(a, mine)}</text>
      {a.status === 'merged' && (
        <g className="kt-node-check" transform={`translate(${w / 2 - 14},${h / 2 - 14})`}>
          <circle r={9} />
          <path d="M-4,0 L-1.2,3 L4.2,-3.2" />
        </g>
      )}
      {a.status === 'failed' && (
        <g className="kt-node-x" transform={`translate(${w / 2 - 14},${h / 2 - 14})`}>
          <circle r={9} />
          <path d="M-3.5,-3.5 L3.5,3.5 M3.5,-3.5 L-3.5,3.5" />
        </g>
      )}
      {badges.slice(0, 2).map((b) => {
        const bw = Math.max(34, Math.round(textWidthPx(b.text)) + 14)
        bx -= bw
        const x = bx
        bx -= 4
        return (
          <g key={b.text} className={`kt-node-badge is-${b.tone}`} transform={`translate(${x + bw / 2},${-h / 2})`}>
            <rect x={-bw / 2} y={-10} width={bw} height={20} rx={10} />
            <text y={4.5} textAnchor="middle">{b.text}</text>
          </g>
        )
      })}
      {ticker && <text className="kt-node-ticker" x={0} y={h / 2 + 18} textAnchor="middle">▸ {ticker}{a.credits !== null ? ` · ${fmtCredits(a.credits)} credits` : ''}</text>}
      {flash && <rect key={flash.n} className={`kt-node-flash is-${flash.tone}`} x={-w / 2 - 5} y={-h / 2 - 5} width={w + 10} height={h + 10} rx={20} />}
      <rect className="kt-node-focus" x={-w / 2 - 5} y={-h / 2 - 5} width={w + 10} height={h + 10} rx={20} />
    </g>
  )
}

/** The board's CSS states are the sample's lane states: an actor's status maps one to one (skipped: dotted, dimmed). */
const statusClass = (s: Actor['status']) => s

/** The node's third line; a ✔ or ✕ in the corner takes the end of it, so the words stop before it. */
function subLine(a: Actor, mine: boolean): string {
  const m = actorMeta(a.status)
  const room = a.status === 'merged' || a.status === 'failed' ? 7.4 : 8.6
  if (a.status === 'awaiting_approval') return clip(mine ? `✋ ${a.doing}` : a.doing, room)
  if (a.status === 'failed') return clip(`✕ ${a.doing}`, room)
  return clip(a.doing || m.label, room)
}

/** A badge's text width in px at its 12px bold (CJK 12, latin ≈ 7). */
function textWidthPx(t: string): number {
  let w = 0
  for (const ch of t) w += /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 12.5 : ch === ' ' ? 3.5 : 7.4
  return w
}

/** Under an actor that waits for the person: the step, named as everywhere (vocab DO_NAME; a reply that is Lean's review
 * in a new session is 开审查会话, as the step strip says); it takes them there. */
function WaitChip({ a, d, review, box, onAct }: { a: Actor; d: WaitDo; review: boolean; box: NodeBox; onAct?: (key: string, d: WaitDo) => void }) {
  const text = `✋ ${review && d === 'reply' ? ACT.review : DO_NAME[d] || DO_NAME.answer}`
  const go = () => onAct?.(a.key, d)
  return (
    <g className={`kt-gate-chip${onAct ? '' : ' is-static'}`} transform={`translate(${box.x},${box.y + NODE_H / 2 + 22})`} role={onAct ? 'button' : undefined}
      tabIndex={onAct ? 0 : undefined} aria-label={`${a.title}：${text.slice(2)}`} onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } }} data-testid="kt-wait-chip">
      <rect x={-Math.max(54, textWidthPx(text) / 2 + 12)} y={-13} width={Math.max(108, textWidthPx(text) + 24)} height={26} rx={13} />
      <text y={5} textAnchor="middle">{text}</text>
    </g>
  )
}

const LEGEND: { status: Actor['status'] | 'other'; text: string }[] = [
  { status: 'running', text: '在做' },
  { status: 'fixing', text: '返工' },
  { status: 'queued', text: '排队' },
  { status: 'stalled', text: '卡住' },
  { status: 'awaiting_approval', text: '等你' },
  { status: 'other', text: '等别人' },
  { status: 'done', text: '做完这步' },
  { status: 'merged', text: '完成' },
  { status: 'failed', text: '被拒 / 没过' },
  { status: 'waiting', text: '还没轮到' },
  { status: 'skipped', text: '这次不需要' },
]

/** *handover*: the way has a hand-over (a repo done only here has none, so its particle is not explained) */
function Legend({ handover }: { handover: boolean }) {
  return (
    <div className="kt-legend" role="note" aria-label="图例">
      {LEGEND.map((l) => (
        <span key={l.status} className={`kt-legend-item is-${l.status}`}>
          <i aria-hidden="true" />
          {l.text}
        </span>
      ))}
      <span className="kt-legend-sep" aria-hidden="true" />
      {handover && <span className="kt-legend-item is-p-handoff"><b aria-hidden="true" />交接 · 签名</span>}
      <span className="kt-legend-item is-p-merge"><b aria-hidden="true" />批准 · 回答</span>
      <span className="kt-legend-item is-p-pass"><b aria-hidden="true" />检查全过</span>
      <span className="kt-legend-item is-p-fail"><b aria-hidden="true" />退回 / 拦下 / 没过</span>
    </div>
  )
}
