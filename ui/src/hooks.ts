/** Small hooks the views share: the latest value in a ref, and reduced motion. */
import { useEffect, useRef, useState } from 'react'

export function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

const REDUCE = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !!window.matchMedia(REDUCE)?.matches
  } catch {
    return false
  }
}

export function useReducedMotion(): boolean {
  const [rm, setRm] = useState(prefersReducedMotion)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const m = window.matchMedia(REDUCE)
    if (!m) return
    const on = () => setRm(!!m.matches)
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [])
  return rm
}
