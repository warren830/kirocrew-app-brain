/**
 * The Brain app: one bar (AppBar.tsx) over the views, as the URL says (nav.ts), in the sample team board's visual
 * language (board/styles.ts, cto/styles.ts, kit.ts: one set of styles for every view). A move to another view is a
 * history entry made through the host's router (useNavigate), so Kiro Crew's ← → like the browser's back and forward
 * step between views, and every entry can be linked to; a change inside a view (a filter) rewrites the current entry.
 *
 * The app reads GET /status for what every view shares: the repos, KiroCrew's checks, team mode, the 待办 count (the
 * tab's count and the sidebar badge). Above every view: a banner when brain-kit is not found, and KiroCrew's failing
 * checks (FAIL only: a ! reminder stays in 设置 and on the page it is about) with their fix buttons, except on 开需求 and
 * 设置, which list those rows themselves.
 *
 * Views: 交付总览 (views/Overview.tsx, the default: the sample's CTO 视图), 需求详情 (Detail: its 交付详情), 需求看板
 * (board/BoardPage.tsx: its 团队看板, for one requirement), 开需求 (NewReq), Brain (Brain), 待办 (Todo), 运行机 (Team,
 * team mode only), 设置 (Settings), 导入仓库 (Import: the bar's button, and every place that has no repo).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavBadge, useNavigate } from '@kirocrew/app-sdk'
import { paths, usePoll } from './api'
import { useAppApi } from '@kirocrew/app-sdk'
import { AppBar } from './AppBar'
import { BoardPage } from './board/BoardPage'
import { BOARD_CSS } from './board/styles'
import { CTO_CSS } from './cto/styles'
import { KIT_CSS } from './kit'
import { parseView, searchOf, type View, type ViewKind } from './nav'
import { APP_CSS } from './styles'
import type { Overview, Requirement, Status } from './types'
import { CheckRows } from './ui'
import { BrainPage } from './views/Brain'
import { DetailView } from './views/Detail'
import { ImportView } from './views/Import'
import { NewView } from './views/NewReq'
import { OverviewView } from './views/Overview'
import type { ViewProps } from './views/props'
import { SettingsView } from './views/Settings'
import { TeamPage } from './views/Team'
import { TodoView } from './views/Todo'

/** /status is read again this often (and after every write that changes it). */
export const STATUS_POLL_MS = 30_000

type Held = { repo: string; key: string } | null

export default function BrainApp({ pollMs }: { pollMs?: number } = {}) {
  const [view, setView] = useState<View & { n: number }>(() => ({ ...parseView(window.location.search), n: 0 }))
  const [held, setHeld] = useState<Held>(() => heldOf(parseView(window.location.search), loadHeld()))
  const api = useAppApi()
  const [picking, setPicking] = useState(false)
  const navigate = useNavigate()
  const badge = useNavBadge()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const current = useRef<View>(parseView(window.location.search))
  const overviewFilters = useRef<View>(current.current.kind === 'overview' ? current.current : { kind: 'overview' })
  const status = usePoll<Status>(paths.status(), pollMs ?? STATUS_POLL_MS)

  const todoCount = status.data?.counts.todo ?? 0
  useEffect(() => {
    if (status.data) badge(todoCount)
  }, [todoCount, !!status.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const remember = useCallback((v: View) => {
    current.current = v
    if (v.kind === 'overview') overviewFilters.current = v
    setHeld((h) => {
      const next = heldOf(v, h)
      if (next !== h) saveHeld(next)
      return next
    })
  }, [])
  const href = (v: View) => `${window.location.pathname}${searchOf(v)}`
  const depth = () => Number((window.history.state as { brDepth?: number } | null)?.brDepth ?? 0)
  // a change inside the view: the same history entry, rewritten; the view is not opened again
  const replace = useCallback((v: View) => {
    remember(v)
    try {
      window.history.replaceState({ ...(window.history.state ?? {}), brDepth: depth() }, '', href(v))
    } catch {
      /* too many rewrites in a short time (Safari): the last one stands */
    }
  }, [remember])
  // a move to another view: a new history entry made by the host's router; the entry then says how many moves deep
  // into the app it is (the router may make it a moment later), so ← 返回 can go back to it
  const go = useCallback((v: View) => {
    const d = depth() + 1, to = href(v)
    remember(v)
    setView((cur) => ({ ...v, n: cur.n + 1 }))
    navigate(to)
    const mark = () => {
      const st = window.history.state as { brDepth?: number } | null
      if (`${window.location.pathname}${window.location.search}` === to && st?.brDepth === undefined) {
        window.history.replaceState({ ...(st ?? {}), brDepth: d }, '', to)
      }
    }
    mark()
    setTimeout(mark, 0)
    setTimeout(mark, 60)
  }, [remember, navigate])
  // back and forward: the view the entry says
  useEffect(() => {
    const onPop = () => {
      const v = parseView(window.location.search)
      remember(v)
      setView((cur) => ({ ...v, n: cur.n + 1 }))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [remember])
  useEffect(() => {  // the view that just opened starts at its top (the host page scrolls, not this app)
    if (view.n) rootRef.current?.scrollIntoView?.({ block: 'start' })
  }, [view.n])
  // 切换需求 on 需求详情 / 需求看板: the same view of another requirement in the place of this one (no new history entry,
  // so ← 返回 still goes where the view was opened from)
  const swap = useCallback((v: View) => {
    replace(v)
    setView((cur) => ({ ...v, n: cur.n + 1 }))
  }, [replace])
  // ← 返回: the entry before when this app made it, else the view it came from
  const back = useCallback((fallback: View) => (depth() > 0 ? window.history.back() : go(fallback)), [go])

  const onTab = useCallback((k: ViewKind) => {
    if (k === 'overview') return go(overviewFilters.current)
    if (k === 'item' || k === 'board') {
      if (held) return go({ kind: k, ...held })
      // nothing opened yet: the requirement that waits on you, else the one with the newest activity
      setPicking(true)
      void api.get<Overview>(paths.overview('all')).then((o) => {
        const pick = pickRequirement(o.rows)
        go(pick ? { kind: k, repo: pick.repo, key: pick.key } : overviewFilters.current)
      }, () => go(overviewFilters.current)).finally(() => setPicking(false))
      return
    }
    const repo = repoOfView(current.current)
    if (k === 'new') return go({ kind: 'new', ...(repo ? { repo } : {}) })
    if (k === 'brain') return go({ kind: 'brain', ...(repo ? { repo } : {}) })
    go({ kind: k })
  }, [go, held, api])

  // 需求详情 and 需求看板 say which view they were opened from (their crumb and ← 返回)
  const goView = useCallback((v: View) => {
    const from = current.current.kind
    if (v.kind === 'item' && !v.from && (from === 'overview' || from === 'todo' || from === 'brain' || from === 'board')) return go({ ...v, from })
    if (v.kind === 'board' && !v.from && (from === 'overview' || from === 'item' || from === 'todo')) return go({ ...v, from })
    go(v)
  }, [go])

  const props: ViewProps = { status: status.data, go: goView, replace, reloadStatus: status.reload, setStatus: status.set, pollMs }
  const { n, ...v } = view
  let body
  if (v.kind === 'item') {
    const { kind: _k, ...entry } = v
    const fallback: View = entry.from === 'todo' ? { kind: 'todo' } : entry.from === 'brain' ? { kind: 'brain', repo: entry.repo }
      : entry.from === 'board' ? { kind: 'board', repo: entry.repo, key: entry.key } : overviewFilters.current
    body = <DetailView key={n} entry={entry} onBack={() => back(fallback)} onSwitch={(repo, key) => swap({ kind: 'item', ...entry, repo, key })} {...props} />
  } else if (v.kind === 'board') {
    const { kind: _k, ...entry } = v
    const fallback: View = entry.from === 'todo' ? { kind: 'todo' } : entry.from === 'item' ? { kind: 'item', repo: entry.repo, key: entry.key } : overviewFilters.current
    body = <BoardPage key={n} entry={entry} onBack={entry.from ? () => back(fallback) : undefined} {...props}
      onSwitch={(repo, key) => swap({ kind: 'board', repo, key, ...(entry.from ? { from: entry.from } : {}) })} />
  } else if (v.kind === 'new') {
    const { kind: _k, ...entry } = v
    body = <NewView key={n} entry={entry} {...props} />
  } else if (v.kind === 'brain') {
    const { kind: _k, ...entry } = v
    body = <BrainPage key={n} entry={entry} {...props} />
  } else if (v.kind === 'todo') {
    body = <TodoView key={n} {...props} />
  } else if (v.kind === 'team') {
    body = <TeamPage key={n} {...props} />
  } else if (v.kind === 'settings') {
    body = <SettingsView key={n} {...props} />
  } else if (v.kind === 'import') {
    const { kind: _k, ...entry } = v
    body = <ImportView key={n} entry={entry} {...props} />
  } else {
    const { kind: _k, ...entry } = v
    body = <OverviewView key={n} entry={entry} {...props} />
  }
  const s = status.data
  // 开需求 and 设置 show KiroCrew's rows themselves, with the same fix buttons: no banner over them there.
  const failing = s && v.kind !== 'new' && v.kind !== 'settings' ? s.crew.rows.filter((r) => r.level === 'FAIL') : []
  return (
    <div ref={rootRef} className="br-app" data-testid="br-app">
      <style>{BOARD_CSS}</style>
      <style>{CTO_CSS}</style>
      <style>{APP_CSS}</style>
      <style>{KIT_CSS}</style>
      <AppBar view={v.kind} onView={onTab} item={held?.key} picking={picking} todo={todoCount} team={!!s?.app.team} />
      <div className="br-banners" data-testid="br-banners">
        {status.error && (
          <div className={`br-banner${s ? '' : ' is-error'}`} role="alert">
            {s ? `状态刷新没成：${status.error}` : `读不到 app 的状态：${status.error}`}
          </div>
        )}
        {s && !s.brainkit.ok && (
          <div className="br-banner is-error" role="alert" data-testid="br-no-brainkit">
            <div className="br-row">
              <b className="br-strong">找不到 brain-kit</b>
              <span>{s.brainkit.error ? `（${s.brainkit.error}）` : ''}在设置里写对它的位置。</span>
              {v.kind !== 'settings' && <button type="button" className="br-btn is-small" onClick={() => go({ kind: 'settings' })}>去设置</button>}
            </div>
          </div>
        )}
        {failing.length > 0 && (
          <div className="br-banner is-error" data-testid="br-crew-fail">
            <b className="br-strong">KiroCrew 这边有 {failing.length} 件要先处理</b>
            <CheckRows rows={failing} fix={s?.crew.fix} onFixed={() => status.reload()} />
          </div>
        )}
      </div>
      {body}
    </div>
  )
}

const HELD_KEY = 'brain.app.held'

/** The requirement in hand survives a reload of the page (this browser only). */
function loadHeld(): Held {
  try {
    const h = JSON.parse(window.localStorage.getItem(HELD_KEY) || 'null')
    return h && typeof h.repo === 'string' && typeof h.key === 'string' ? { repo: h.repo, key: h.key } : null
  } catch {
    return null
  }
}

function saveHeld(h: Held): void {
  try {
    if (h) window.localStorage.setItem(HELD_KEY, JSON.stringify(h))
  } catch {
    /* storage off: the requirement in hand lasts until the page reloads */
  }
}

/** What 需求详情 / 需求看板 open when no requirement was opened yet: the one that waits on you, else any;
 * the newest activity first; null when there is none. */
export function pickRequirement(rows: Requirement[]): Requirement | null {
  if (!rows.length) return null
  const t = (r: Requirement) => r.updated_at ?? 0
  const mine = rows.filter((r) => r.waits.who === 'you')
  if (mine.length) return [...mine].sort((a, b) => t(b) - t(a))[0]
  return [...rows].sort((a, b) => t(b) - t(a))[0]
}

/** The requirement in hand after a move to *v*: the 需求详情 or 需求看板 it is; else the one before. */
function heldOf(v: View, before: Held): Held {
  if (v.kind !== 'item' && v.kind !== 'board') return before
  return before && before.repo === v.repo && before.key === v.key ? before : { repo: v.repo, key: v.key }
}

function repoOfView(v: View): string | undefined {
  return 'repo' in v && v.repo && v.repo !== 'runner' ? v.repo : undefined
}
