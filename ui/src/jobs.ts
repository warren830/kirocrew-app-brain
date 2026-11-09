/**
 * A background job of the import routes (a clone, an install, an upgrade of the kit files), followed until it ends:
 * start(job) with what the POST answered, then GET /import/jobs/{id} every *ms*. onEnd gets it once, when it is no
 * longer running. A read that fails is said and tried again.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { errorText, paths } from './api'
import { useLatest } from './hooks'
import type { ImportJob } from './types'

export const JOB_POLL_MS = 1000

export function useJob<R>(ms: number = JOB_POLL_MS, onEnd?: (j: ImportJob<R>) => void) {
  const api = useAppApi()
  const apiRef = useLatest(api)
  const endRef = useLatest(onEnd)
  const [job, setJob] = useState<ImportJob<R> | null>(null)
  const [readError, setReadError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!job || job.state !== 'running') return
    let alive = true
    const t = setTimeout(async () => {
      try {
        const got = await apiRef.current.get<ImportJob<R>>(paths.importJob(job.id))
        if (!alive) return
        setReadError('')
        setJob(got)
        if (got.state !== 'running') endRef.current?.(got)
      } catch (e) {
        if (!alive) return
        setReadError(`读不到进度：${errorText(e)}（还会再读）`)
        setTick((n) => n + 1)
      }
    }, ms)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [job, tick, ms, apiRef, endRef])
  const start = useCallback((j: ImportJob<R> | null) => {
    setJob(j)
    setReadError('')
    if (j && j.state !== 'running') endRef.current?.(j)
  }, [endRef])
  return { job, start, readError }
}
