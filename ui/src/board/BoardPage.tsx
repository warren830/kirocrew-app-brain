/**
 * 需求看板: one requirement as the sample's 团队看板 shows a run (its main.tsx TeamPage, for a requirement's way).
 *
 * Polls GET /board/{repo}/{key} every 2 s (useBoard.ts) and renders only that contract (types.ts ReqBoard): the
 * header, 你要做的一步 (a narrow strip: what the person does now, and where), the live counters, the graph of the way
 * (the hero, with the particle layer), the commit conveyor, one lane per actor on a shared time axis, the check wall,
 * the events, and 验收 (on top once it is time to accept, else under the lanes). Each poll's
 * snapshot is diffed against the previous one (diff.ts): new events become particles and node flashes, changed check
 * cells flip, changed lanes and new commits get a one-time highlight. The first snapshot is history and never animates.
 *
 * Click an actor anywhere to look at that actor only; 跟随 scrolls to the one that moved last; Esc lets go. 回放
 * (Replay.tsx) plays the requirement again from the same snapshot (timeline.ts); while it plays nothing can be done.
 * Reduced motion: nothing flies or pulses, states still change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { VIEW_NAME, type BoardEntry } from '../nav'
import type { ReqBoard, WaitDo } from '../types'
import { LoadState } from '../ui'
import { QuestionCard } from '../views/Question'
import type { ViewProps } from '../views/props'
import { NotFound, OnRunner, ReqSwitch, useOnRunner } from '../views/ReqSwitch'
import { Accept } from './Accept'
import { ActorGraph, rosterRows, type FlashMap } from './ActorGraph'
import { CheckWall } from './CheckWall'
import { Conveyor } from './Conveyor'
import type { BoardDiff } from './diff'
import type { Item } from './engine'
import { EventFeed } from './EventFeed'
import { BOARD_EXTRA_CSS } from './extra'
import { PERSON, WORKING, boardWho } from './format'
import { NextStep } from './NextStep'
import { openHere, reviewNext } from './next'
import { Intro, Kpis, TopBar } from './Header'
import { ClockContext, useReducedMotion, type SnapshotClock } from './hooks'
import { Lanes } from './Lanes'
import { SLOTS, edgesOf, foldedPhases, graphShape, layoutGraph } from './layout'
import { ReplayBar, useReplay } from './Replay'
import { RoleIcon } from './RoleIcon'
import { useBoard } from './useBoard'

interface Effects {
  req: string | null
  flips: Record<string, number>
  flashes: FlashMap
  bumps: Record<string, number>
  belt: ReadonlySet<string>
  fresh: ReadonlySet<number>
  announce: string
}
const NO_EFFECTS: Effects = { req: null, flips: {}, flashes: {}, bumps: {}, belt: new Set(), fresh: new Set(), announce: '' }

/** Fold one poll's diff into the one-shot effects (each counter is a key that replays an animation). */
export function applyDiff(f: Effects, d: BoardDiff): Effects {
  if (d.first || f.req !== d.req) return { ...NO_EFFECTS, req: d.req }
  const flips = { ...f.flips }
  for (const x of d.flips) flips[x.id] = (flips[x.id] ?? 0) + 1
  const flashes = { ...f.flashes }
  for (const x of d.flashes) flashes[x.target] = { n: (flashes[x.target]?.n ?? 0) + 1, tone: x.tone }
  const bumps = { ...f.bumps }
  for (const x of d.actors) bumps[x.key] = (bumps[x.key] ?? 0) + 1
  return { req: d.req, flips, flashes, bumps, belt: new Set(d.belt), fresh: new Set(d.fresh.map((e) => e.seq)), announce: d.announce ?? f.announce }
}

/** The actor 跟随 looks at: the one at work that changed last, else the one waiting for the person. */
export function mostActive(b: ReqBoard): string | null {
  const live = b.actors.filter((a) => WORKING.has(a.status) || a.status === 'awaiting_approval')
  live.sort((x, y) => (y.since ?? 0) - (x.since ?? 0))
  return live[0]?.key ?? null
}

const structureKey = (b: ReqBoard) => `${b.actors.map((a) => a.key).join(',')}|${b.direct ? 1 : 0}|${rosterRows(b)}|${foldedPhases(b.actors).join(',')}`

/** An error the board came with, said so a person can act on it (brain-kit's own words folded under 细节). A claimed
 * requirement has no run yet: nothing to read is no error. */
export function boardProblem(b: ReqBoard): { text: string; todo: string; raw: string } | null {
  if (!b.error || b.row.state === 'claimed') return null
  if (!/[A-Za-z]{4,}/.test(b.error.replace(/brain-kit|Lean|KiroCrew/g, ''))) return { text: b.error, todo: '', raw: '' }
  return { text: '这个需求的运行记录没读全：图上只画了 Lean 的记录和仓库里看得到的', todo: '到需求详情看细节；一直这样的话，到设置里看 brain-kit 能不能用', raw: b.error }
}

export function BoardPage({ entry, onBack, onSwitch, onMissing, go, replace, status, pollMs }: {
  entry: BoardEntry
  onBack?: () => void
  /** 切换需求: open another requirement's board here (default: a move to it) */
  onSwitch?: (repo: string, key: string) => void
  /** told whether the repo has this requirement (the app bar's other tab cannot open one it does not have) */
  onMissing?: (missing: boolean) => void
} & ViewProps) {
  const api = useAppApi()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const [focus, setFocus] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [fx, setFx] = useState<Effects>(NO_EFFECTS)
  const feed = useRef<((items: Item[]) => void) | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const replaying = useRef(false)
  const animate = useCallback((d: BoardDiff) => {
    if (d.items.length) feed.current?.(d.items)
    setFx((f) => applyDiff(f, d))
  }, [])
  const onDiff = useCallback((d: BoardDiff) => void (replaying.current || animate(d)), [animate])
  const live = useBoard(api, { repo: entry.repo, reqKey: entry.key, pollMs, onDiff })
  const gone = live.missing && !live.board
  const onRunner = useOnRunner(entry.repo, entry.key, status, pollMs)
  const pick = onSwitch ?? ((repo: string, key: string) => go({ kind: 'board', repo, key }))
  useEffect(() => {
    if (gone || live.board) onMissing?.(gone)
  }, [gone, !!live.board]) // eslint-disable-line react-hooks/exhaustive-deps
  const rp = useReplay(live.board, animate)
  replaying.current = rp.on
  const board = rp.board ?? live.board
  useEffect(() => setFx(NO_EFFECTS), [rp.on])
  // the address says whether it replays (a reload, a copied link open the same): rewritten, not a new entry; the
  // moment it was opened at goes with the replay
  const said = useRef(!!entry.replay || !!entry.at)
  const entered = useRef(false)
  useEffect(() => {
    if (!entered.current || rp.on === said.current) return
    said.current = rp.on
    const { replay: _r, at: _a, ...rest } = entry
    replace({ kind: 'board', ...rest, ...(rp.on ? { replay: true } : {}) })
  }, [rp.on]) // eslint-disable-line react-hooks/exhaustive-deps

  // the way in: ?replay=1 starts the replay once the board is here, ?at= stops it at that moment; ?focus= scrolls to
  // that part
  useEffect(() => {
    if (entered.current || !live.board) return
    entered.current = true
    if (entry.at) rp.start(entry.at)
    else if (entry.replay) rp.start()
    const where = entry.focus === 'accept' ? '#br-accept' : entry.focus === 'checks' ? '[data-testid="kt-wall"]' : entry.focus === 'lanes' ? '[data-testid="kt-lanes"]'
      : entry.focus === 'feed' ? '[data-testid="kt-feed"]' : entry.replay || entry.at ? '[data-testid="kt-graph"]' : ''
    if (where) setTimeout(() => rootRef.current?.querySelector(where)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 80)
  }, [live.board]) // eslint-disable-line react-hooks/exhaustive-deps

  // the live board's shape: a replay moves through the same picture; the graph's width is the app's (its text keeps
  // its size: layout.ts graphShape, one column per phase when six do not fit)
  const shape = live.board
  const structure = shape ? structureKey(shape) : ''
  const [graphW, setGraphW] = useState<number | null>(null)
  const watch = useRef<ResizeObserver | null>(null)
  const graphBox = useCallback((el: HTMLDivElement | null) => {
    watch.current?.disconnect()
    if (!el || typeof ResizeObserver === 'undefined') return
    const read = () => {
      // the graph card's own inner width (its border and a scrollbar left out)
      const w = (el.firstElementChild as HTMLElement | null)?.clientWidth || el.clientWidth
      if (w > 0) setGraphW((old) => (old !== null && Math.abs(old - w) < 8 ? old : w))
    }
    read()
    watch.current = new ResizeObserver(read)
    watch.current.observe(el)
  }, [])
  useEffect(() => () => watch.current?.disconnect(), [])
  const lay = useMemo(() => {
    if (!shape) return null
    const fold = foldedPhases(shape.actors)
    const keys = shape.actors.map((a) => a.key).filter((k) => !fold.includes(SLOTS[k]?.phase ?? ''))
    const g = graphShape(graphW, fold)
    return layoutGraph(keys, edgesOf(new Set(keys), shape.direct, g.compact), rosterRows(shape), fold, g.width, g.compact)
  }, [structure, graphW]) // eslint-disable-line react-hooks/exhaustive-deps
  const liveClock: SnapshotClock = useMemo(() => ({ at: live.board?.at ?? Date.now() / 1000, receivedAt: live.receivedAt || Date.now() }), [live.board?.at, live.receivedAt])
  const clock = rp.clock ?? liveClock

  const onActor = useCallback((key: string) => setFocus((f) => (f === key ? null : key)), [])
  const followKey = follow && board ? mostActive(board) : null
  useEffect(() => {
    if (!followKey) return
    rootRef.current?.querySelector(`[data-testid="kt-lane"][data-role="${followKey}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [followKey, reducedMotion])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const toDetail = () => go({ kind: 'item', repo: entry.repo, key: entry.key, from: 'board' })
  // the crumb's first step and ← 返回 name the view it was opened from (the way back)
  const fromName = VIEW_NAME[entry.from ?? 'overview']
  const toBrain = () => go({ kind: 'brain', repo: entry.repo, reflect: entry.key })
  // 开工 the requirement claimed already: 开需求 with its key (fixed there) and title; only its owner starts it: the one
  // the board calls 你 (an older backend did not say: the owner, or anyone while it is not known who is looking)
  const me = status?.repos.find((r) => r.id === entry.repo)?.me?.name ?? null
  const startable = !!board && entry.repo !== 'runner' && (board.person.you ?? (board.person.me || !board.person.owner || !me))
  const toStart = () => go({ kind: 'new', repo: entry.repo, key: entry.key, ...(board?.row.title ? { title: board.row.title } : {}) })
  // a node that waits for the person: the session for what is said or approved there, the step strip for the rest (a
  // review is not said in the session that wrote the code: the strip has 开审查会话)
  const onAct = useCallback((key: string, d: WaitDo) => {
    const a = board?.actors.find((x) => x.key === key)
    const url = a?.session?.url ?? board?.actors.find((x) => x.key === 'local')?.session?.url
    const review = !!board && reviewNext(board.row.waits)
    if (((d === 'reply' && !review) || d === 'tool') && url) return navigate(url)
    if (d === 'write_back') return toBrain()
    rootRef.current?.querySelector(d === 'accept' && !rootRef.current?.querySelector('#br-next') ? '#br-accept' : '#br-next')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    setFocus(key)
  }, [board, navigate]) // eslint-disable-line react-hooks/exhaustive-deps
  const quiet = rp.on
  const side = board ? board.questions.filter((q) => (q.state === 'waiting' || q.state === 'open') && !(board.row.waits.who === 'you' && openHere(q))) : []
  // whom those wait on when it is not the person looking (the one rule, as the strip says it)
  const waiter = !board || board.row.waits.who === 'you' ? null : PERSON.has(board.row.waits.who) ? boardWho(board) : '等人' 
  const acceptTop = !!board && board.accept.state !== 'not_yet'
  const problem = board ? boardProblem(board) : null

  return (
    <main ref={rootRef} className={`kt-root br-view br-board${board?.live && !quiet ? ' is-live' : ''}`} data-testid="br-board" data-motion={reducedMotion ? 'reduce' : undefined}>
      <style>{BOARD_EXTRA_CSS}</style>
      <ClockContext.Provider value={clock}>
        <div className="cto-top br-where-row">
          <nav className="kit-crumb kt-where" aria-label="位置" data-testid="kt-where">
            <button type="button" onClick={onBack ?? (() => go({ kind: 'overview' }))}>{fromName}</button>
            <span aria-hidden="true">›</span>
            {/* a key the repo does not have has no 需求详情 to go to: said, not linked */}
            {gone ? <span data-testid="kt-where-key">{entry.key}</span> : <button type="button" onClick={toDetail} title="需求详情">{entry.key}</button>}
            <span aria-hidden="true">›</span>
            <b>需求看板{focus && board ? ` · ${board.actors.find((a) => a.key === focus)?.title ?? ''}` : ''}{rp.on ? ' · 回放' : ''}</b>
          </nav>
          <span className="cto-grow" />
          {!rp.on && <ReqSwitch repo={entry.repo} reqKey={entry.key} status={status} pollMs={pollMs} onPick={pick} />}
          {onBack && <button type="button" className="kt-btn" onClick={onBack}>← 返回{fromName}</button>}
        </div>
        {onRunner && !rp.on && <OnRunner reqKey={entry.key} what="需求看板" onOpen={() => pick('runner', entry.key)} />}
        {live.missing && !board
          ? !onRunner && <NotFound repoName={status?.repos.find((r) => r.id === entry.repo)?.name ?? (entry.repo === 'runner' ? '运行机' : null)} reqKey={entry.key}
              backName={onBack ? fromName : VIEW_NAME.overview} onBack={onBack ?? (() => go({ kind: 'overview', ...(entry.repo !== 'runner' ? { repo: entry.repo } : {}) }))}
              testId="br-board-missing" />
          : <LoadState loading={live.loading} error={live.error} has={!!board} />}
        {board && lay && (
          <>
            <TopBar board={board} replaying={rp.on} follow={follow} onReplay={() => rp.start()} onFollow={() => setFollow((v) => !v)} onDetail={toDetail}
              onSession={(url) => navigate(url)} onStart={startable ? toStart : undefined} />
            <ReplayBar rp={rp} />
            {problem && (
              <div className="kt-banner br-problem" role="status" data-testid="br-board-problem">
                <b>{problem.text}</b>
                {problem.todo && <span>做什么：{problem.todo}</span>}
                {problem.raw && <details className="br-raw"><summary>细节</summary><pre>{problem.raw}</pre></details>}
              </div>
            )}
            {board.row.state === 'claimed' && !rp.on ? (
              <Intro board={board} onStart={startable ? toStart : undefined} />
            ) : (
              <>
                {!quiet && <NextStep board={board} repo={entry.repo} reqKey={entry.key} onAnswered={live.reload} onBrain={toBrain} onDetail={toDetail} />}
                <Kpis key={`${rp.on ? 'replay' : 'live'}`} board={board} reducedMotion={reducedMotion} onActor={onActor} replaying={rp.on} />
                {acceptTop && <Accept board={board} onDetail={toDetail} quiet={quiet} />}
                <div className="kt-body">
                  <div className="kt-col">
                    <div ref={graphBox}>
                      <ActorGraph key={`${entry.repo}/${entry.key}${rp.on ? ':replay' : ''}`} board={board} lay={lay} focus={focus} onActor={onActor} flashes={fx.flashes}
                        reducedMotion={reducedMotion} feed={feed} quiet={quiet} onSession={(url) => navigate(url)} onAct={quiet ? undefined : onAct} />
                    </div>
                    {focus && <FocusBar board={board} focus={focus} onClear={() => setFocus(null)} />}
                    <Conveyor board={board} fresh={fx.belt} focus={focus} onActor={onActor} />
                    <Lanes board={board} focus={focus} bumps={fx.bumps} onActor={onActor} quiet={quiet} />
                    {!acceptTop && <Accept board={board} onDetail={toDetail} quiet={quiet} />}
                  </div>
                  <aside className="kt-side" aria-label="检查、问题和事件">
                    <CheckWall board={board} focus={focus} onActor={onActor} flips={fx.flips} onSettings={() => go({ kind: 'settings' })} />
                    {!quiet && side.length > 0 && (
                      <section className="kt-card br-board-qs" aria-label="等回答的问题" data-testid="br-board-questions">
                        <header className="kt-card-head"><h2>等回答的问题</h2><span className={`kt-badge tone-${board.row.waits.who === 'you' ? 'approve' : 'info'}`}>{side.length}</span></header>
                        {side.map((q, i) => <QuestionCard key={`${q.id ?? 'q'}-${i}`} q={q} repo={entry.repo} reqKey={entry.key} onAnswered={live.reload} waiter={waiter} />)}
                      </section>
                    )}
                    <EventFeed board={board} focus={focus} onActor={onActor} fresh={fx.fresh} />
                  </aside>
                </div>
              </>
            )}
          </>
        )}
        <div className="kt-sr" aria-live="polite" data-testid="kt-announce">{fx.announce}</div>
      </ClockContext.Provider>
    </main>
  )
}

function FocusBar({ board, focus, onClear }: { board: ReqBoard; focus: string; onClear: () => void }) {
  const a = board.actors.find((x) => x.key === focus)
  if (!a) return null
  return (
    <div className="kt-focuschip" role="status" data-testid="kt-focusbar">
      <RoleIcon role={a.icon} size={14} /> {a.title}
      <button type="button" onClick={onClear} aria-label="看全部" title="看全部（Esc）">✕</button>
    </div>
  )
}
