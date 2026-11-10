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
  /** 需求看板: the requirement's board snapshot (actors, lanes, belt, checks, events), polled every 2 s */
  board: (repo: string, key: string) => `${BASE}/board/${enc(repo)}/${enc(key)}`,
  session: (repo: string, key: string) => `${BASE}/requirements/${enc(repo)}/${enc(key)}/session`,
  answer: (repo: string, key: string) => `${BASE}/requirements/${enc(repo)}/${enc(key)}/answer`,
  /** 拆成小需求: `brain split` in the big requirement's worktree ({apply: false} the preview, nothing written) */
  split: (repo: string, key: string) => `${BASE}/requirements/${enc(repo)}/${enc(key)}/split`,
  /** 认领 / 放弃认领 a small requirement: `brain claim [--release]` */
  claim: (repo: string, key: string) => `${BASE}/requirements/${enc(repo)}/${enc(key)}/claim`,
  /** 开工 on a small requirement: `brain start --key [--on DEP]` in its own worktree, then its session */
  childStart: (repo: string, key: string) => `${BASE}/requirements/${enc(repo)}/${enc(key)}/start`,
  /** 同步: `brain sync` in a small requirement's worktree (the big one's branch merged in) */
  sync: (repo: string, key: string) => `${BASE}/requirements/${enc(repo)}/${enc(key)}/sync`,
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
  importDefaults: () => `${BASE}/import/defaults`,
  importInspect: () => `${BASE}/import/inspect`,
  importClone: () => `${BASE}/import/clone`,
  importInstall: () => `${BASE}/import/install`,
  importJob: (id: string) => `${BASE}/import/jobs/${enc(id)}`,
  importChoices: () => `${BASE}/import/choices`,
  importMerge: () => `${BASE}/import/merge`,
  importPull: () => `${BASE}/import/pull`,
  importPush: () => `${BASE}/import/push`,
  importCommit: () => `${BASE}/import/commit`,
  /** the kit fix: brain install again on a new branch (the old adapter, runs/** in lean.json) */
  importUpgrade: () => `${BASE}/import/upgrade`,
  importPublish: () => `${BASE}/import/publish`,
  importAdd: () => `${BASE}/import/add`,
  repoRemove: () => `${BASE}/repos/remove`,
  meName: () => `${BASE}/me/name`,
}

const CJK = /[\u3400-\u9fff]/
const NO_ANSWER = /failed to fetch|networkerror|load failed|network request failed/i

/**
 * What a failed request means for a person when the backend said nothing of its own in Chinese, by the HTTP status
 * (0: no answer at all). The one place for these words: errorText (every view) and the banner over every view say
 * them. KiroCrew's host answers `{"error": "Token required"}` (403) when the dashboard login is gone; the browser's own
 * words for no answer are `Failed to fetch`.
 */
export function httpProblem(status: number): { text: string; todo: string } {
  if (status === 401 || status === 403) return { text: '登录过期了', todo: '重新打开 KiroCrew 仪表盘，登录以后点「再试一次」' }
  if (status === 0) return { text: '连不上 app 的后端', todo: 'KiroCrew 或这个 app 可能停了，网络也可能断了：等一会儿点「再试一次」' }
  if (status === 404) return { text: 'app 的后端和页面版本对不上', todo: '在 KiroCrew 里重新装一次这个 app' }
  return { text: 'app 的后端出错了', todo: '点「再试一次」；还不行就在 KiroCrew 里重启这个 app' }
}

/** The error as it came (the SDK rejects with `API <status>: <body>`, the body `{"error", "code"}`), for 细节. */
export function errorRaw(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** The API error's text in Chinese: the backend's own words (with the status), else httpProblem's; never English. */
export function errorText(e: unknown): string {
  const raw = errorRaw(e)
  const m = /^API (\d{3}): ([\s\S]*)$/.exec(raw)
  if (!m) return CJK.test(raw) ? raw : httpProblem(NO_ANSWER.test(raw) ? 0 : 500).text
  const [, status, body] = m
  try {
    const data = JSON.parse(body) as { error?: unknown }
    if (data && typeof data.error === 'string' && CJK.test(data.error)) return `${data.error}（${status}）`
  } catch {
    if (CJK.test(body)) return `${body.trim().slice(0, 200)}（${status}）`
  }
  return `${httpProblem(Number(status)).text}（${status}）`
}

export function errorStatus(e: unknown): number {
  const m = /^API (\d{3}):/.exec(errorRaw(e))
  return m ? Number(m[1]) : 0
}

export interface Polled<T> {
  data: T | null
  /** the last request's error (errorText), '' when it worked; the data of the request before stays */
  error: string
  /** the HTTP status of that error (0: none, or not an HTTP error) */
  status: number
  /** that error as it came (errorRaw), for 细节; '' when it worked */
  raw: string
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
  const [state, setState] = useState<{ data: T | null; error: string; status: number; raw: string; loading: boolean; path: string | null }>(
    { data: null, error: '', status: 0, raw: '', loading: path !== null, path },
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
      setState({ data: got, error: '', status: 0, raw: '', loading: false, path: p })
    } catch (e) {
      if (pathRef.current !== p) return
      setState((s) => ({ ...s, error: errorText(e), status: errorStatus(e), raw: errorRaw(e), loading: false }))
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
      setState({ data: null, error: '', status: 0, raw: '', loading: false, path })
      kick.current = () => {}
      return
    }
    setState((s) => (s.path === path ? s : { data: null, error: '', status: 0, raw: '', loading: true, path }))
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
  const set = useCallback((data: T) => setState((s) => ({ ...s, data, error: '', status: 0, raw: '', loading: false })), [])
  const fresh = state.path === path
  return {
    data: fresh ? state.data : null, error: fresh ? state.error : '', status: fresh ? state.status : 0, raw: fresh ? state.raw : '',
    loading: fresh ? state.loading : path !== null, reload, set,
  }
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
