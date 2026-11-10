/**
 * The conveyor (the sample team board's 合并传送带): every commit of the run branch in order — the person's local ones,
 * the hand-over commit, the runner's — and the merge into the default branch at the head. A commit that is new since
 * the previous poll slides in. A person's commit after the hand-over is marked: it is a step outside the judgment points.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReqBoard } from '../types'
import { beltKey } from './diff'
import { fmtAgo } from './format'
import { useServerNow } from './hooks'
import { RoleIcon } from './RoleIcon'
import { ExtLink } from '../ui'
import { ACT } from '../vocab'

/** An empty belt, said by why it is empty: no commit yet; a hand-over the runner has not started on (what it waits
 * for, as the board says it); a run whose working copy is on the runner, not here (its commits are on the MR); a
 * requirement brain-kit could not read the record of (the page's note says what to do). */
function beltEmpty(b: Pick<ReqBoard, 'source' | 'row' | 'actors'>): string {
  if (b.source === 'trace') return '运行分支上还没有提交'
  if (b.row.where === 'runner' && !b.row.worktree) {
    const runner = b.actors.find((a) => a.key === 'runner')?.status
    return runner === 'waiting' || runner === 'queued' ? `运行机还没开始做，还没有它的提交：${b.row.waits.text}` : '运行机的工作目录不在这台机器上，这里读不到它的提交'
  }
  return '这里读不到运行分支的提交：brain-kit 没读出这个需求的记录'
}

export function Conveyor({ board, fresh, focus, onActor }: { board: ReqBoard; fresh: ReadonlySet<string>; focus: string | null; onActor: (k: string) => void }) {
  const now = useServerNow()
  const belt = useRef<HTMLOListElement | null>(null)
  const [older, setOlder] = useState(false)
  useEffect(() => {
    const el = belt.current
    if (!el) return
    el.scrollLeft = el.scrollWidth
    setOlder(el.scrollLeft > 4)
  }, [board.belt.length])
  const byKey = new Map(board.actors.map((a) => [a.key as string, a]))
  const commits = board.belt.filter((x) => x.kind === 'commit')
  const bots = commits.filter((x) => x.by === 'bot').length
  const merged = board.belt.some((x) => x.kind === 'merge')
  const after = board.events.filter((e) => e.kind === 'commit' && e.from === 'person').length
  return (
    <section className="kt-card kt-conveyor" data-testid="kt-conveyor" aria-label="提交传送带">
      <header className="kt-card-head">
        <h2>提交传送带</h2>
        <span className="kt-dim">
          {commits.length} 次提交{bots ? ` · 运行机 ${bots} 次` : ''}{board.belt.some((x) => x.kind === 'handover') ? ' · 交接 1 次' : ''}{merged ? ' · 已合并' : ''}
          {after ? <> · <span className="tone-warn">交接后有人推了 {after} 次</span></> : null}
        </span>
      </header>
      {board.belt.length === 0 ? (
        <p className="kt-dim kt-wall-empty">
          {beltEmpty(board)}
          {board.source !== 'trace' && board.row.mr && <> <ExtLink href={board.row.mr.url}>{ACT.viewMr}</ExtLink></>}
        </p>
      ) : (
        <ol className={`kt-belt${older ? ' has-older' : ''}`} ref={belt} onScroll={(e) => setOlder(e.currentTarget.scrollLeft > 4)}>
          <li className="kt-belt-end is-base" title="运行分支从这里出发">从 <code>{board.base}</code></li>
          {board.belt.map((x) => {
            const k = beltKey(x)
            const a = byKey.get(x.actor)
            const cls = x.kind === 'handover' ? ' is-handover' : x.kind === 'merge' ? ' is-merge' : x.by === 'bot' ? ' is-bot' : ''
            return (
              <li key={k} className={`kt-belt-chip${cls}${fresh.has(k) ? ' is-new' : ''}${focus && focus !== x.actor ? ' is-dim' : ''}`}>
                <button type="button" className="kt-belt-role" onClick={() => onActor(x.actor)} title={x.text}>
                  <RoleIcon role={x.kind === 'merge' ? 'merge' : x.kind === 'handover' ? 'handover' : a?.icon ?? 'commit'} size={14} />{' '}
                  {x.kind === 'merge' ? `合并进 ${board.base}` : x.kind === 'handover' ? '交接' : x.by === 'bot' ? '运行机' : '本机'}
                </button>
                <span className="kt-belt-meta">
                  {x.sha && <><code>{x.sha.slice(0, 8)}</code> · </>}{x.files ? `${x.files} 个文件 · ` : ''}{fmtAgo(now - x.at)}
                </span>
                {x.kind === 'commit' && <span className="kt-belt-text">{x.text}{x.records_only ? '（只改记录）' : ''}</span>}
              </li>
            )
          })}
          <li className={`kt-belt-end is-head${merged ? ' is-merged' : ''}`} title={merged ? '已合并进默认分支' : '运行分支的最新提交'}>
            <code>{merged ? board.base : board.branch ?? '运行分支'}</code>
          </li>
        </ol>
      )}
    </section>
  )
}
