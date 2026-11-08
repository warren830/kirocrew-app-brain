import type { View } from '../nav'
import type { Status } from '../types'

/** What the app hands every view. */
export interface ViewProps {
  /** GET /status (null until it came) */
  status: Status | null
  /** a move to another view: a history entry (the host's router) */
  go: (v: View) => void
  /** a change inside this view (a filter, a pick): the current history entry rewritten, the view not opened again */
  replace: (v: View) => void
  /** read /status again (after a write that changes it: a fix, a start, an answer) */
  reloadStatus: () => void
  /** put a /status answer in place (POST /settings answers one) */
  setStatus: (s: Status) => void
  /** polling interval override (tests); each view has its own default */
  pollMs?: number
}
