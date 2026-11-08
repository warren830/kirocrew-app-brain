/**
 * The app's views and the ways into them, as the page URL carries them. A link can open any of them; a move to
 * another view is a history entry (the host's router), a change inside a view (a filter) replaces the current one.
 *
 *   /apps/brain                                   交付总览 (the default)
 *     ?view=overview&repo=<id>&state=<ReqState>   …filtered to one repo / one state
 *   ?view=item&repo=<id>&key=<KEY>                需求详情
 *     &from=overview|todo|brain                   …opened from that view: the crumb says the way back
 *   ?view=new&repo=<id>                           开需求
 *   ?view=brain&repo=<id>&file=<FILE>&id=<entry>&reflect=<KEY>   Brain: that file, that entry picked out, that
 *                                                 requirement picked in the reflect card
 *   ?view=todo                                    待办
 *   ?view=team                                    运行机 (team mode only)
 *   ?view=settings                                设置
 *
 * Anything that does not match its pattern is left out (never put into a request or the page as it came).
 */
import { STATE_LABEL, type ReqState } from './types'

export type ViewKind = 'overview' | 'item' | 'new' | 'brain' | 'todo' | 'team' | 'settings'
export type ItemFrom = 'overview' | 'todo' | 'brain'
export type BrainFile = 'PRODUCT' | 'TECH' | 'IMPROVEMENT' | 'PROJECT'
export const BRAIN_FILES: readonly BrainFile[] = ['PRODUCT', 'TECH', 'IMPROVEMENT', 'PROJECT']

export type OverviewEntry = { repo?: string; state?: ReqState }
export type ItemEntry = { repo: string; key: string; from?: ItemFrom }
export type NewEntry = { repo?: string }
export type BrainEntryRef = { repo?: string; file?: BrainFile; id?: string; reflect?: string }

export type View =
  | ({ kind: 'overview' } & OverviewEntry)
  | ({ kind: 'item' } & ItemEntry)
  | ({ kind: 'new' } & NewEntry)
  | ({ kind: 'brain' } & BrainEntryRef)
  | { kind: 'todo' }
  | { kind: 'team' }
  | { kind: 'settings' }

export const REPO_RE = /^(r[1-9][0-9]{0,2}|runner)$/
export const KEY_RE = /^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}$/
/** <side letter>-<KEY>-<n>, or a legacy <letter>-<n> */
export const ENTRY_RE = /^[A-Z]-(?:[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,3}|[0-9]{1,5})$/
const STATES = Object.keys(STATE_LABEL) as ReqState[]
const FROM: readonly string[] = ['overview', 'todo', 'brain']

const repoOf = (q: URLSearchParams) => {
  const r = q.get('repo') ?? ''
  return REPO_RE.test(r) ? { repo: r } : {}
}

export function parseView(search: string): View {
  const q = new URLSearchParams(search)
  const view = q.get('view')
  if (view === 'item') {
    const repo = q.get('repo') ?? ''
    const key = q.get('key') ?? ''
    if (!REPO_RE.test(repo) || !KEY_RE.test(key)) return { kind: 'overview' }
    const from = q.get('from') ?? ''
    return { kind: 'item', repo, key, ...(FROM.includes(from) ? { from: from as ItemFrom } : {}) }
  }
  if (view === 'new') return { kind: 'new', ...repoOf(q) }
  if (view === 'brain') {
    const v: View = { kind: 'brain', ...repoOf(q) }
    const file = q.get('file') ?? ''
    if ((BRAIN_FILES as readonly string[]).includes(file)) v.file = file as BrainFile
    const id = q.get('id') ?? ''
    if (ENTRY_RE.test(id)) v.id = id
    const reflect = q.get('reflect') ?? ''
    if (KEY_RE.test(reflect)) v.reflect = reflect
    return v
  }
  if (view === 'todo' || view === 'team' || view === 'settings') return { kind: view }
  const v: View = { kind: 'overview', ...repoOf(q) }
  const state = q.get('state') ?? ''
  if ((STATES as string[]).includes(state)) v.state = state as ReqState
  return v
}

export function searchOf(v: View): string {
  const q = new URLSearchParams()
  const put = (k: string, x: string | undefined) => void (x ? q.set(k, x) : undefined)
  switch (v.kind) {
    case 'overview':
      if (v.repo || v.state) q.set('view', 'overview')
      put('repo', v.repo)
      put('state', v.state)
      break
    case 'item':
      q.set('view', 'item')
      put('repo', v.repo)
      put('key', v.key)
      put('from', v.from)
      break
    case 'new':
      q.set('view', 'new')
      put('repo', v.repo)
      break
    case 'brain':
      q.set('view', 'brain')
      put('repo', v.repo)
      put('file', v.file)
      put('id', v.id)
      put('reflect', v.reflect)
      break
    default:
      q.set('view', v.kind)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** The Brain file an entry id belongs to, by its side letter (P product, T tech, I improvement, J project). */
export function fileOfEntry(id: string): BrainFile | undefined {
  return ({ P: 'PRODUCT', T: 'TECH', I: 'IMPROVEMENT', J: 'PROJECT' } as Record<string, BrainFile>)[id.charAt(0)]
}
