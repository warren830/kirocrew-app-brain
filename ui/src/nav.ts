/**
 * The app's views and the ways into them, as the page URL carries them. A link can open any of them; a move to
 * another view is a history entry (the host's router), a change inside a view (a filter) replaces the current one.
 *
 *   /apps/brain                                   交付总览 (the default)
 *     ?view=overview&repo=<id>&state=<ReqState>   …filtered to one repo / one state
 *   ?view=item&repo=<id>&key=<KEY>                需求详情
 *     &from=overview|todo|brain|board|team        …opened from that view: the crumb says the way back
 *     &decision=D-<n>                             …scrolled to that decision, picked out
 *   ?view=board&repo=<id>&key=<KEY>               需求看板 (the requirement's team-board view, polled every 2 s)
 *     &replay=1                                   …its 回放 starts (a finished requirement)
 *     &focus=accept|checks|lanes|feed             …scrolled to 验收, the check wall, the lanes or the events
 *     &from=overview|item|todo                    …opened from that view: the crumb says the way back
 *     &at=<epoch s>                               …its 回放 stands at that moment (a decision, a part of 价值流)
 *   ?view=new&repo=<id>                           开需求
 *     &key=<KEY>&title=<title>                    …开工 of a requirement claimed already: its key fixed, its title filled
 *   ?view=brain&repo=<id>&file=<FILE>&id=<entry>&reflect=<KEY>   Brain: that file, that entry picked out, that
 *                                                 requirement picked in the reflect card
 *   ?view=todo                                    待办
 *   ?view=team                                    运行机 (team mode only)
 *   ?view=settings                                设置
 *   ?view=import&path=<absolute path>             导入仓库 (the path only fills the box: nothing runs until 检查)
 *
 * Anything that does not match its pattern is left out (never put into a request or the page as it came).
 */
import { STATE_LABEL, type ReqState } from './types'

export type ViewKind = 'overview' | 'item' | 'board' | 'new' | 'brain' | 'todo' | 'team' | 'settings' | 'import'
export type ItemFrom = 'overview' | 'todo' | 'brain' | 'board' | 'team'
export type BoardFrom = 'overview' | 'item' | 'todo'
export type BoardFocus = 'accept' | 'checks' | 'lanes' | 'feed'
export type BrainFile = 'PRODUCT' | 'TECH' | 'IMPROVEMENT' | 'PROJECT'
export const BRAIN_FILES: readonly BrainFile[] = ['PRODUCT', 'TECH', 'IMPROVEMENT', 'PROJECT']

export type OverviewEntry = { repo?: string; state?: ReqState }
export type ItemEntry = { repo: string; key: string; from?: ItemFrom
  /** one of its decisions (decisions.md's D-<n>): 需求详情 scrolls to its row and picks it out (?decision=) */
  decision?: string }
export type BoardEntry = { repo: string; key: string; replay?: boolean; focus?: BoardFocus; from?: BoardFrom
  /** a moment of it (epoch s): 需求详情's 价值流 and 决定 open the board there (?at=) */
  at?: number }
/** 开需求; with key (and title): 开工 of a requirement claimed already, its key fixed (?view=new&repo=&key=&title=) */
export type NewEntry = { repo?: string; key?: string; title?: string }
export type BrainEntryRef = { repo?: string; file?: BrainFile; id?: string; reflect?: string }
export type ImportEntry = { path?: string }

export type View =
  | ({ kind: 'overview' } & OverviewEntry)
  | ({ kind: 'item' } & ItemEntry)
  | ({ kind: 'board' } & BoardEntry)
  | ({ kind: 'new' } & NewEntry)
  | ({ kind: 'brain' } & BrainEntryRef)
  | { kind: 'todo' }
  | { kind: 'team' }
  | { kind: 'settings' }
  | ({ kind: 'import' } & ImportEntry)

export const REPO_RE = /^(r[1-9][0-9]{0,2}|runner)$/
export const KEY_RE = /^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}$/
/** <side letter>-<KEY>-<n>, or a legacy <letter>-<n> */
export const ENTRY_RE = /^[A-Z]-(?:[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,3}|[0-9]{1,5})$/
/** an absolute path (or ~/…) without control characters: what 导入仓库 may be opened with */
export const PATH_RE = /^(?:\/|~\/)[^\u0000-\u001f\u007f]{0,1023}$/
/** a decision of decisions.md: D-<n> */
export const DECISION_RE = /^D-[0-9]{1,4}$/
const STATES = Object.keys(STATE_LABEL) as ReqState[]
const FROM: readonly string[] = ['overview', 'todo', 'brain', 'board', 'team']
const BOARD_FROM: readonly string[] = ['overview', 'item', 'todo']
const FOCUS: readonly string[] = ['accept', 'checks', 'lanes', 'feed']

/** a requirement's title as a link may carry it: one line, no control characters, at most 200 characters */
const titleOf = (t: string | null | undefined): string => (t ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim().slice(0, 200)

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
    const decision = q.get('decision') ?? ''
    return { kind: 'item', repo, key, ...(FROM.includes(from) ? { from: from as ItemFrom } : {}), ...(DECISION_RE.test(decision) ? { decision } : {}) }
  }
  if (view === 'board') {
    const repo = q.get('repo') ?? ''
    const key = q.get('key') ?? ''
    if (!REPO_RE.test(repo) || !KEY_RE.test(key)) return { kind: 'overview' }
    const v: View = { kind: 'board', repo, key }
    if (q.get('replay') === '1') v.replay = true
    const focus = q.get('focus') ?? ''
    if (FOCUS.includes(focus)) v.focus = focus as BoardFocus
    const from = q.get('from') ?? ''
    if (BOARD_FROM.includes(from)) v.from = from as BoardFrom
    const at = Number(q.get('at') ?? '')
    if (Number.isInteger(at) && at > 1e9 && at < 1e10) v.at = at
    return v
  }
  if (view === 'new') {
    const v: View = { kind: 'new', ...repoOf(q) }
    const key = q.get('key') ?? ''
    if (v.repo && KEY_RE.test(key)) {
      v.key = key
      const title = titleOf(q.get('title'))
      if (title) v.title = title
    }
    return v
  }
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
  if (view === 'import') {
    const path = q.get('path') ?? ''
    return { kind: 'import', ...(PATH_RE.test(path) ? { path } : {}) }
  }
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
      put('decision', v.decision && DECISION_RE.test(v.decision) ? v.decision : undefined)
      break
    case 'board':
      q.set('view', 'board')
      put('repo', v.repo)
      put('key', v.key)
      if (v.replay) q.set('replay', '1')
      put('focus', v.focus)
      put('from', v.from)
      if (v.at) q.set('at', String(v.at))
      break
    case 'new':
      q.set('view', 'new')
      put('repo', v.repo)
      if (v.repo && v.key && KEY_RE.test(v.key)) {
        q.set('key', v.key)
        put('title', titleOf(v.title))
      }
      break
    case 'brain':
      q.set('view', 'brain')
      put('repo', v.repo)
      put('file', v.file)
      put('id', v.id)
      put('reflect', v.reflect)
      break
    case 'import':
      q.set('view', 'import')
      put('path', v.path && PATH_RE.test(v.path) ? v.path : undefined)
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

/** Each view's name, the one a crumb and ← 返回 say for the view a page was opened from (UI问题清单 REST-16, 17). */
export const VIEW_NAME: Record<ViewKind, string> = {
  overview: '交付总览', item: '需求详情', board: '需求看板', new: '开需求', brain: 'Brain', todo: '待办', team: '运行机',
  settings: '设置', import: '导入仓库',
}
