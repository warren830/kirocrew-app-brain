/**
 * The backend's paths (types.ts is the contract), the SDK's error text in Chinese, and one polling hook every view
 * uses: never two requests at once, nothing while the page is hidden, at once when it is visible again.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppApi, type AppApi } from '@kirocrew/app-sdk'
import { BASE } from './types'
import { useLatest } from './hooks'

export const POLL_MS = 5000
const enc = encodeURIComponent

export const paths = {
  status: () => `${BASE}/status`,
  settings: () => `${BASE}/settings`,
  refresh: () => `${BASE}/refresh`,
  overview: (repo: string) => `${BASE}/overview?repo=${enc(repo || 'all')}`,
  requirement: (repo: string, key: string) => `${BASE}/requirements/${enc(repo)}/${enc(key)}`,
  session: (repo: string, key: string) => `${BASE}/requirements/${enc(repo)}/${enc(key)}/session`,
  answer: (repo: string, key: string) => `${BASE}/requirements/${enc(repo)}/${enc(key)}/answer`,
  intakeNext: (repo: string) => `${BASE}/intake/next?repo=${enc(repo)}`,
  intakeCheck: () => `${BASE}/intake/check`,
  intakeStart: () => `${BASE}/intake/start`,
  crew: () => `${BASE}/crew`,
  crewFix: () => `${BASE}/crew/fix`,
  brain: (repo: string) => `${BASE}/brain?repo=${enc(repo)}`,
  reflectPreview: () => `${BASE}/brain/reflect/preview`,
  reflectApply: () => `${BASE}/brain/reflect/apply`,
  todo: () => `${BASE}/todo`,
  team: () => `${BASE}/team`,
  teamLoop: () => `${BASE}/team/loop`,
}

/** The API error's text in Chinese (the SDK rejects with `API <status>: <body>`, the body `{"error", "code"}`). */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const m = /^API (\d{3}): ([\s\S]*)$/.exec(raw)
  if (!m) return raw
  const [, status, body] = m
  try {
    const data = JSON.parse(body) as { error?: unknown }
    if (data && typeof data.error === 'string' && data.error) return `${data.error}（${status}）`
  } catch {
    /* not JSON */
  }
  if (status === '401') return '需要登录 KiroCrew dashboard（401）'
  if (status === '403') return '没有权限：只接受 dashboard 主人本人的请求（403）'
  if (status === '404') return '后端还没有这个接口（404）'
  return `请求失败（${status}）${body.trim() ? `：${body.trim().slice(0, 200)}` : ''}`
}

export function errorStatus(e: unknown): number {
  const m = /^API (\d{3}):/.exec(e instanceof Error ? e.message : String(e))
  return m ? Number(m[1]) : 0
}

export interface Polled<T> {
  data: T | null
  /** the last request's error (errorText), '' when it worked; the data of the request before stays */
  error: string
  /** the HTTP status of that error (0: none, or not an HTTP error) */
  status: number
  loading: boolean
  /** poll now (after a write) */
  reload: () => void
  /** put an answer in place without a request (a POST that answers the new state) */
  set: (data: T) => void
}

/**
 * GET *path* now and then every *pollMs* (0: once; it still loads again on reload() or when *path* changes). A null
 * path loads nothing. An answer that arrives after the path changed is dropped.
 */
export function usePoll<T>(path: string | null, pollMs: number = POLL_MS): Polled<T> {
  const api = useAppApi()
  const apiRef = useLatest<AppApi>(api)
  const [state, setState] = useState<{ data: T | null; error: string; status: number; loading: boolean; path: string | null }>(
    { data: null, error: '', status: 0, loading: path !== null, path },
  )
  const inFlight = useRef(false)
  const again = useRef(false)
  const pathRef = useLatest(path)
  const kick = useRef<() => void>(() => {})

  const load = useCallback(async () => {
    const p = pathRef.current
    if (p === null) return
    if (inFlight.current) {
      again.current = true // the path changed or a reload came while one is on its way: one more after it
      return
    }
    inFlight.current = true
    try {
      const got = await apiRef.current.get<T>(p)
      if (pathRef.current !== p) return
      setState({ data: got, error: '', status: 0, loading: false, path: p })
    } catch (e) {
      if (pathRef.current !== p) return
      setState((s) => ({ ...s, error: errorText(e), status: errorStatus(e), loading: false }))
    } finally {
      inFlight.current = false
      if (again.current) {
        again.current = false
        kick.current()
      }
    }
  }, [apiRef, pathRef])

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: '', status: 0, loading: false, path })
      kick.current = () => {}
      return
    }
    setState((s) => (s.path === path ? s : { data: null, error: '', status: 0, loading: true, path }))
    let timer: ReturnType<typeof setTimeout> | undefined
    let alive = true
    let chain = 0
    const schedule = (ms: number) => {
      clearTimeout(timer)
      const mine = ++chain
      timer = setTimeout(() => void run(mine), ms)
    }
    const run = async (mine: number) => {
      if (!alive || mine !== chain) return
      if (document.hidden && pollMs > 0) return // the visibility listener starts a new chain
      await load()
      if (alive && mine === chain && pollMs > 0) schedule(pollMs)
    }
    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer)
        chain++
        return
      }
      if (pollMs > 0) schedule(0)
    }
    kick.current = () => schedule(0)
    schedule(0)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      alive = false
      clearTimeout(timer)
      kick.current = () => {}
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [path, pollMs, load])

  const reload = useCallback(() => kick.current(), [])
  const set = useCallback((data: T) => setState((s) => ({ ...s, data, error: '', status: 0, loading: false })), [])
  const fresh = state.path === path
  return { data: fresh ? state.data : null, error: fresh ? state.error : '', status: fresh ? state.status : 0, loading: fresh ? state.loading : path !== null, reload, set }
}

/** A write: its pending flag, its answer and its error (errorText), for one button. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<R | null>(null)
  const fnRef = useLatest(fn)
  const run = useCallback(async (...args: A): Promise<R | null> => {
    setBusy(true)
    setError('')
    try {
      const r = await fnRef.current(...args)
      setResult(r)
      return r
    } catch (e) {
      setError(errorText(e))
      return null
    } finally {
      setBusy(false)
    }
  }, [fnRef])
  const reset = useCallback(() => {
    setError('')
    setResult(null)
  }, [])
  return { run, busy, error, result, reset }
}
