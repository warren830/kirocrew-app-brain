/**
 * Polls GET /board/{repo}/{key} every 2 s (the sample team board's useBoard.ts). Never two requests at once, nothing
 * while the page is in the background, at once when it comes back. The hook keeps the previous snapshot and hands
 * every new one to the differ (diff.ts) together with it; `onDiff` gets the result (the page turns it into particles,
 * flips and highlights). The first snapshot, and the first one after the page was hidden, are history.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppApi } from '@kirocrew/app-sdk'
import { errorStatus, errorText, paths } from '../api'
import type { ReqBoard } from '../types'
import { diffBoards, type BoardDiff } from './diff'
import { POLL_MS } from './format'
import { useLatest } from './hooks'

export interface BoardState {
  board: ReqBoard | null
  error: string
  /** the backend has no /board route (404 without an error body) or no such requirement */
  missing: boolean
  loading: boolean
  /** Date.now() when the current snapshot arrived */
  receivedAt: number
}

export function useBoard(api: AppApi, opts: { repo: string; reqKey: string; pollMs?: number; onDiff?: (d: BoardDiff, b: ReqBoard) => void }) {
  const pollMs = opts.pollMs ?? POLL_MS
  const [state, setState] = useState<BoardState>({ board: null, error: '', missing: false, loading: true, receivedAt: 0 })
  const apiRef = useLatest(api)
  const onDiffRef = useLatest(opts.onDiff)
  const path = paths.board(opts.repo, opts.reqKey)
  const pathRef = useLatest(path)
  const inFlight = useRef(false)
  const prev = useRef<ReqBoard | null>(null)
  const hiddenGap = useRef(false)
  const kick = useRef<() => void>(() => {})

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    const p = pathRef.current
    try {
      const got = await apiRef.current.get<ReqBoard>(p)
      if (p !== pathRef.current) return
      const visible = typeof document === 'undefined' || !document.hidden
      const diff = diffBoards(prev.current, got, { at: got.at, resync: hiddenGap.current })
      prev.current = got
      if (visible) hiddenGap.current = false
      setState({ board: got, error: '', missing: false, loading: false, receivedAt: Date.now() })
      onDiffRef.current?.(diff, got)
    } catch (e) {
      if (p !== pathRef.current) return
      setState((s) => ({ ...s, error: errorText(e), missing: errorStatus(e) === 404, loading: false }))
    } finally {
      inFlight.current = false
    }
  }, [apiRef, pathRef, onDiffRef])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let alive = true
    let chain = 0
    prev.current = null
    const schedule = (ms: number) => {
      clearTimeout(timer)
      const mine = ++chain
      timer = setTimeout(() => void run(mine), ms)
    }
    const run = async (mine: number) => {
      if (!alive || mine !== chain) return
      if (document.hidden) {
        hiddenGap.current = true
        return
      }
      await load()
      if (alive && mine === chain && pollMs > 0) schedule(pollMs)
    }
    const onVisibility = () => {
      if (document.hidden) {
        hiddenGap.current = true
        clearTimeout(timer)
        chain++
        return
      }
      schedule(0)
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
  }, [load, pollMs, path])

  const reload = useCallback(() => kick.current(), [])
  return { ...state, reload }
}
