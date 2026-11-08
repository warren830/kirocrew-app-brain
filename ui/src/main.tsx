/**
 * The Brain app: one bar (AppBar.tsx) over the views, as the URL says (nav.ts). A move to another view is a history
 * entry made through the host's router (useNavigate), so Kiro Crew's ← → like the browser's back and forward step
 * between views, and every entry can be linked to; a change inside a view (a filter) rewrites the current entry.
 *
 * The app reads GET /status for what every view shares: the repos, KiroCrew's checks, team mode, the 待办 count (the
 * tab's count and the sidebar badge). Above every view: a banner when brain-kit is not found, and KiroCrew's failing
 * checks with their fix buttons.
 *
 * Views: 交付总览 (views/Overview.tsx, the default), 需求详情 (Detail), 开需求 (NewReq), Brain (Brain), 待办 (Todo),
 * 运行机 (Team, team mode only), 设置 (Settings).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavBadge, useNavigate } from '@kirocrew/app-sdk'
import { paths, usePoll } from './api'
import { AppBar } from './AppBar'
import { parseView, searchOf, type ItemEntry, type View, type ViewKind } from './nav'
import { APP_CSS } from './styles'
import type { Status } from './types'
import { CheckRows } from './ui'
import { BrainPage } from './views/Brain'
import { DetailView } from './views/Detail'
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
  const [held, setHeld] = useState<Held>(() => heldOf(parseView(window.location.search), null))
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
    setHeld((h) => heldOf(v, h))
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
  // ← 返回: the entry before when this app made it, else the view it came from
  const back = useCallback((fallback: View) => (depth() > 0 ? window.history.back() : go(fallback)), [go])

  const onTab = useCallback((k: ViewKind) => {
    if (k === 'overview') return go(overviewFilters.current)
    if (k === 'item') return held ? go({ kind: 'item', ...held }) : undefined
    const repo = repoOfView(current.current)
    if (k === 'new') return go({ kind: 'new', ...(repo ? { repo } : {}) })
    if (k === 'brain') return go({ kind: 'brain', ...(repo ? { repo } : {}) })
    go({ kind: k })
  }, [go, held])

  // 需求详情 says which view it was opened from (its crumb and ← 返回)
  const goView = useCallback((v: View) => {
    const from = current.current.kind
    if (v.kind === 'item' && !v.from && (from === 'overview' || from === 'todo' || from === 'brain')) return go({ ...v, from })
    go(v)
  }, [go])

  const props: ViewProps = { status: status.data, go: goView, replace, reloadStatus: status.reload, setStatus: status.set, pollMs }
  const { n, ...v } = view
  let body
  if (v.kind === 'item') {
    const { kind: _k, ...entry } = v
    const fallback: View = entry.from === 'todo' ? { kind: 'todo' } : entry.from === 'brain' ? { kind: 'brain', repo: entry.repo } : overviewFilters.current
    body = <DetailView key={n} entry={entry} onBack={() => back(fallback)} {...props} />
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
  } else {
    const { kind: _k, ...entry } = v
    body = <OverviewView key={n} entry={entry} {...props} />
  }
  const s = status.data
  const failing = s ? s.crew.rows.filter((r) => r.level === 'FAIL') : []
  return (
    <div ref={rootRef} className="br-app" data-testid="br-app">
      <style>{APP_CSS}</style>
      <AppBar view={v.kind} onView={onTab} item={held?.key} todo={todoCount} team={!!s?.app.team} />
      <div className="br-banners" data-testid="br-banners">
        {status.error && (
          <div className={`br-banner${s ? '' : ' is-error'}`} role="alert">
            {s ? `状态刷新没成：${status.error}` : `读不到 app 的状态：${status.error}`}
          </div>
        )}
        {s && !s.brainkit.ok && (
          <div className="br-banner is-error" role="alert" data-testid="br-no-brainkit">
            <div className="br-row">
              <span>找不到 brain-kit{s.brainkit.error ? `（${s.brainkit.error}）` : ''}：</span>
              {v.kind !== 'settings' && <button type="button" className="br-btn is-small" onClick={() => go({ kind: 'settings' })}>去设置</button>}
            </div>
          </div>
        )}
        {failing.length > 0 && (
          <div className="br-banner is-error" data-testid="br-crew-fail">
            <b>KiroCrew 这边有问题</b>
            <CheckRows rows={failing} fix={s?.crew.fix} onFixed={() => status.reload()} />
          </div>
        )}
      </div>
      {body}
    </div>
  )
}

/** The requirement in hand after a move to *v*: the 需求详情 it is; else the one before. */
function heldOf(v: View, before: Held): Held {
  if (v.kind !== 'item') return before
  const e: ItemEntry = v
  return before && before.repo === e.repo && before.key === e.key ? before : { repo: e.repo, key: e.key }
}

function repoOfView(v: View): string | undefined {
  return 'repo' in v && v.repo && v.repo !== 'runner' ? v.repo : undefined
}
