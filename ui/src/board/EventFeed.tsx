/**
 * The event feed (the sample team board's EventFeed.tsx): the requirement's trace, newest first, an icon per kind, the
 * actor chips (click one to look at that actor only, everywhere on the board), the time. Events that are new since the
 * previous poll slide in. Lean's stage steps and blocked tool calls are many and quiet: they can be hidden.
 */
import { useState } from 'react'
import type { Actor, BoardEvent, ReqBoard } from '../types'
import { EVENT_META, PLACE, eventTouches, fmtAgo, fmtWhen, personPlace } from './format'
import { useServerNow } from './hooks'
import { RoleIcon } from './RoleIcon'

export function EventFeed({ board, focus, onActor, fresh }: { board: ReqBoard; focus: string | null; onActor: (k: string) => void; fresh: ReadonlySet<number> }) {
  const now = useServerNow()
  const [detail, setDetail] = useState(true)
  const byKey = new Map(board.actors.map((a) => [a.key as string, a]))
  const shown = board.events.slice().reverse().filter((e) => (detail || !e.detail) && (!focus || eventTouches(e, focus)))
  const focused = focus ? byKey.get(focus) : undefined
  return (
    <section className="kt-card kt-feed" data-testid="kt-feed" aria-label="事件">
      <header className="kt-card-head">
        <h2>事件</h2>
        <span className="kt-dim">{board.source === 'trace' ? '来自 brain-kit 的记录' : '来自 Lean 的记录'}</span>
        {focused && (
          <button type="button" className="kt-filter" onClick={() => onActor(focused.key)} aria-label={`不再只看${focused.title}`}>
            只看 <RoleIcon role={focused.icon} size={14} /> {focused.title} ✕
          </button>
        )}
        <label className="kt-check">
          <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} />
          Lean 细节
        </label>
      </header>
      <ol className="kt-feed-list">
        {shown.length === 0 && <li className="kt-dim kt-feed-empty">{focus ? '这一环还没有事件' : '还没有事件'}</li>}
        {shown.map((e) => {
          const meta = EVENT_META[e.kind] ?? { icon: '•', label: e.kind, tone: 'idle' }
          return (
            <li key={e.seq} className={`kt-ev is-${e.kind} tone-${meta.tone}${fresh.has(e.seq) ? ' is-new' : ''}${e.detail ? ' is-tool' : ''}`} data-seq={e.seq} title={e.src ?? undefined}>
              <span className="kt-ev-icon" aria-hidden="true" title={meta.label}>{meta.icon}</span>
              <span className="kt-ev-text">{e.text}</span>
              <Chips e={e} board={board} byKey={byKey} onActor={onActor} />
              <time className="kt-ev-time" dateTime={new Date(e.at * 1000).toISOString()} title={fmtWhen(e.at)}>{fmtAgo(now - e.at)}</time>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Chips({ e, board, byKey, onActor }: { e: BoardEvent; board: ReqBoard; byKey: Map<string, Actor>; onActor: (k: string) => void }) {
  const chip = (k: string | null) => {
    if (!k) return null
    const a = byKey.get(k)
    const place = k === 'person' ? personPlace(e, board) : PLACE[k]
    if (!a) return place ? <span key={k} className="kt-ev-place" data-testid="kt-ev-place">{place}</span> : null
    return (
      <button key={a.key} type="button" className="kt-ev-role" onClick={() => onActor(a.key)} title={`只看${a.title}`} aria-label={`只看${a.title}`}>
        <RoleIcon role={a.icon} size={15} />
      </button>
    )
  }
  if (e.from && e.to && e.from !== e.to) {
    return (
      <span className="kt-ev-roles">
        {chip(e.from)}
        <span aria-hidden="true">→</span>
        {chip(e.to)}
      </span>
    )
  }
  return <span className="kt-ev-roles">{chip(e.from ?? e.to)}</span>
}
