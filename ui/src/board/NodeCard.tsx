/**
 * The card an actor's node shows when the pointer rests on it (the sample team board's NodeCard.tsx): what it is,
 * what it is doing or waits for, a few plain facts, and the way to look closer: 打开会话 (its Kiro Crew session).
 */
import type { Actor } from '../types'
import { ACT } from '../vocab'
import { actorMeta, fmtCredits, fmtWhen } from './format'
import { RoleIcon } from './RoleIcon'

export function NodeCard({ a, label, onSession }: { a: Actor; label?: string; onSession?: (url: string) => void }) {
  const meta = actorMeta(a.status)
  return (
    <div className="kt-ncard-body">
      <p className="kt-ncard-head">
        <RoleIcon role={a.icon} size={16} /> <b>{a.title}</b>
        <span className={`kt-pill tone-${meta.tone}`}>{label ?? meta.label}</span>
      </p>
      <p className="kt-ncard-task"><span className="kt-dim">是什么</span> {a.sub}</p>
      <p className={a.status === 'awaiting_approval' || a.status === 'failed' ? 'kt-ncard-back' : 'kt-ncard-did'}>{a.doing}</p>
      <ul className="kt-ncard-facts">
        {a.since !== null && <li>从 {fmtWhen(a.since)} 起</li>}
        {a.facts.map((f) => <li key={f}>{f}</li>)}
        {a.credits !== null && <li>{fmtCredits(a.credits)} credits</li>}
        {a.line && <li>要你自己在会话里打：<code>{a.line}</code></li>}
      </ul>
      {a.session && onSession && (
        <div className="kt-ncard-actions">
          <button type="button" className="kt-btn" onClick={() => onSession(a.session!.url)}>{ACT.openSession}</button>
        </div>
      )}
    </div>
  )
}
