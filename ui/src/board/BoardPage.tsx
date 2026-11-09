/**
 * 需求看板: one requirement as the sample's 团队看板 shows a run (its main.tsx TeamPage, for a requirement's way).
 *
 * Polls GET /board/{repo}/{key} every 2 s (useBoard.ts) and renders only that contract (types.ts ReqBoard): the
 * header with the live counters, the graph of the way (the hero, with the particle layer), the commit conveyor, one lane
 * per actor on a shared time axis, the check wall, the events, and 验收 with the one step a person takes. Each poll's
 * snapshot is diffed against the previous one (diff.ts): new events become particles and node flashes, changed check
 * cells flip, changed lanes and new commits get a one-time highlight. The first snapshot is history and never animates.
 *
 * Click an actor anywhere to look at that actor only; 跟随 scrolls to the one that moved last; Esc lets go. 回放
 * (Replay.tsx) plays the requirement again from the same snapshot (timeline.ts); while it plays nothing can be done.
 * Reduced motion: nothing flies or pulses, states still change.
 *
 * A big requirement split into small ones (row.family, views/Family.tsx): a small one names its big one in the crumb
 * and the top bar; a big one's small ones are lanes with the roll-up and the trace's family numbers. Either family card
 * (a small one's: its dependencies, paths, 认领 / 开工 / 同步) sits under the conveyor, before the requirement's own
 * lanes, so the graph stays the hero; a big one not split yet says what comes next under the counters. Before a small one is started the board
 * introduces its way. The family's answers live here (useFamily), so a card that moves keeps them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import type { BoardEntry } from '../nav'
import type { ReqBoard } from '../types'
import { LoadState } from '../ui'
import { FamilyPanel, useFamily } from '../views/Family'
import { QuestionCard } from '../views/Question'
import type { ViewProps } from '../views/props'
import { Accept } from './Accept'
import { ActorGraph, rosterRows, type FlashMap } from './ActorGraph'
import { CheckWall } from './CheckWall'
import { Conveyor } from './Conveyor'
import type { BoardDiff } from './diff'
import type { Item } from './engine'
import { EventFeed } from './EventFeed'
import { BOARD_EXTRA_CSS } from './extra'
import { WORKING } from './format'
import { Intro, Kpis, TopBar } from './Header'
import { ClockContext, useReducedMotion, type SnapshotClock } from './hooks'
import { Lanes } from './Lanes'
import { edgesOf, layoutGraph } from './layout'
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

const structureKey = (b: ReqBoard) => `${b.actors.map((a) => a.key).join(',')}|${b.direct ? 1 : 0}|${rosterRows(b)}`

export function BoardPage({ entry, onBack, go, replace, pollMs, reloadStatus }: { entry: BoardEntry; onBack?: () => void } & ViewProps) {
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
  const family = useFamily(entry.repo, entry.key, () => {
    live.reload()
    reloadStatus()
  })
  const rp = useReplay(live.board, animate)
  replaying.current = rp.on
  const board = rp.board ?? live.board
  useEffect(() => setFx(NO_EFFECTS), [rp.on])
  // the address says whether it replays (a reload, a copied link open the same): rewritten, not a new entry
  const said = useRef(!!entry.replay)
  useEffect(() => {
    if (rp.on === said.current) return
    said.current = rp.on
    const { replay: _r, ...rest } = entry
    replace({ kind: 'board', ...rest, ...(rp.on ? { replay: true } : {}) })
  }, [rp.on]) // eslint-disable-line react-hooks/exhaustive-deps

  // the way in: ?replay=1 starts the replay once the board is here; ?focus= scrolls to that part
  const entered = useRef(false)
  useEffect(() => {
    if (entered.current || !live.board) return
    entered.current = true
    if (entry.replay) rp.start()
    const where = entry.focus === 'accept' ? '#br-accept' : entry.focus === 'checks' ? '[data-testid="kt-wall"]' : entry.focus === 'lanes' ? '[data-testid="kt-lanes"]'
      : entry.focus === 'feed' ? '[data-testid="kt-feed"]' : entry.replay ? '[data-testid="kt-graph"]' : ''
    if (where) setTimeout(() => rootRef.current?.querySelector(where)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 80)
  }, [live.board]) // eslint-disable-line react-hooks/exhaustive-deps

  const structure = board ? structureKey(board) : ''
  const lay = useMemo(() => {
    if (!board) return null
    const keys = board.actors.map((a) => a.key)
    return layoutGraph(keys, edgesOf(new Set(keys), board.direct), rosterRows(board))
  }, [structure]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const toStart = () => go({ kind: 'new', ...(entry.repo !== 'runner' ? { repo: entry.repo } : {}) })
  const toBoard = (key: string) => go({ kind: 'board', repo: entry.repo, key })
  // a node that waits for the person: its line is in its lane; a tool call to approve in its session; a question or
  // 验收 in the 验收 card
  const onAct = useCallback((key: string) => {
    const a = board?.actors.find((x) => x.key === key)
    if (a && !a.line && a.doing.includes('工具调用') && a.session?.url) return navigate(a.session.url)
    const sel = a?.line ? `[data-testid="kt-lane"][data-role="${key}"]` : '#br-accept'
    rootRef.current?.querySelector(sel)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    setFocus(key)
  }, [board, navigate])
  const quiet = rp.on
  const open = board ? board.questions.filter((q) => q.state === 'waiting' || q.state === 'open') : []
  const acceptTop = !!board && (board.accept.step.text !== '' || board.accept.state !== 'not_yet')
  const fam = board?.row.family ?? null
  // a small one is started from its family card (brain start --key), not from 开需求
  const onStart = entry.repo !== 'runner' && fam?.role !== 'child' ? toStart : undefined
  const notStarted = !!board && (board.row.state === 'claimed' || board.row.state === 'unclaimed') && !rp.on
  const famCard = board && fam && (
    <FamilyPanel f={fam} repo={entry.repo} reqKey={entry.key} ctl={family} look="board" go={go} rollup={board.rollup} quiet={quiet} />
  )
  const toFamily = () => rootRef.current?.querySelector('[data-testid="fam-panel"]')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })

  return (
    <main ref={rootRef} className={`kt-root br-view br-board${board?.live && !quiet ? ' is-live' : ''}`} data-testid="br-board" data-motion={reducedMotion ? 'reduce' : undefined}>
      <style>{BOARD_EXTRA_CSS}</style>
      <ClockContext.Provider value={clock}>
        <nav className="kit-crumb kt-where" aria-label="位置" data-testid="kt-where">
          <button type="button" onClick={() => go({ kind: 'overview' })}>交付总览</button>
          <span aria-hidden="true">›</span>
          {fam?.role === 'child' && (
            <>
              <button type="button" onClick={() => toBoard(fam.parent)} title={`大需求 ${fam.parent} 的需求看板`}>{fam.parent}</button>
              <span aria-hidden="true">›</span>
            </>
          )}
          <button type="button" onClick={toDetail} title="需求详情">{entry.key}</button>
          <span aria-hidden="true">›</span>
          <b>需求看板{focus && board ? ` · ${board.actors.find((a) => a.key === focus)?.title ?? ''}` : ''}{rp.on ? ' · 回放' : ''}</b>
          <span className="kt-grow" />
          {onBack && <button type="button" className="kt-btn" onClick={onBack}>← 返回{entry.from === 'item' ? '需求详情' : entry.from === 'todo' ? '待办' : '交付总览'}</button>}
        </nav>
        <LoadState loading={live.loading} error={live.missing ? `没有这个需求（${entry.repo} · ${entry.key}）：它可能已经不在这个仓库里` : live.error} has={!!board} />
        {board && lay && (
          <>
            <TopBar board={board} replaying={rp.on} follow={follow} onReplay={rp.start} onFollow={() => setFollow((v) => !v)} onDetail={toDetail}
              onSession={(url) => navigate(url)} onStart={onStart} onParent={toBoard} onFamily={toFamily} />
            <ReplayBar rp={rp} />
            {board.error && <div className="kt-banner" role="status">{board.error}</div>}
            {notStarted ? (
              <>
                {famCard}
                <Intro board={board} onStart={onStart} />
              </>
            ) : (
              <>
                <Kpis key={`${rp.on ? 'replay' : 'live'}`} board={board} reducedMotion={reducedMotion} onActor={onActor} />
                {acceptTop && <Accept board={board} onDetail={toDetail} onBrain={() => go({ kind: 'brain', repo: entry.repo, reflect: entry.key })} quiet={quiet} />}
                {fam?.role === 'big' && famCard}
                <div className="kt-body">
                  <div className="kt-col">
                    <ActorGraph key={`${entry.repo}/${entry.key}${rp.on ? ':replay' : ''}`} board={board} lay={lay} focus={focus} onActor={onActor} flashes={fx.flashes}
                      reducedMotion={reducedMotion} feed={feed} quiet={quiet} onSession={(url) => navigate(url)} onAct={quiet ? undefined : onAct} />
                    {focus && <FocusBar board={board} focus={focus} onClear={() => setFocus(null)} />}
                    <Conveyor board={board} fresh={fx.belt} focus={focus} onActor={onActor} />
                    {(fam?.role === 'parent' || fam?.role === 'child') && famCard}
                    <Lanes board={board} focus={focus} bumps={fx.bumps} onActor={onActor} quiet={quiet} />
                    {!acceptTop && <Accept board={board} onDetail={toDetail} onBrain={() => go({ kind: 'brain', repo: entry.repo, reflect: entry.key })} quiet={quiet} />}
                  </div>
                  <aside className="kt-side" aria-label="检查、问题和事件">
                    <CheckWall board={board} focus={focus} onActor={onActor} flips={fx.flips} />
                    {!quiet && open.length > 0 && (
                      <section className="kt-card br-board-qs" aria-label="等回答的问题" data-testid="br-board-questions">
                        <header className="kt-card-head"><h2>等回答的问题</h2><span className="kt-badge tone-approve">{open.length}</span></header>
                        {open.map((q, i) => <QuestionCard key={`${q.id ?? 'q'}-${i}`} q={q} repo={entry.repo} reqKey={entry.key} onAnswered={live.reload} />)}
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
