/**
 * The top of the 需求看板 (the sample team board's Header.tsx): the requirement's key, title and state, its branch, the
 * actions (回放, 跟随, 需求详情, 打开会话), and the live counters: checks passed, Lean's stages, a person's acts (at the
 * judgment points and outside them), the steps of the way done, credits. Also the introduction a requirement shows
 * before its run started: the way it will go, and how to start it.
 */
import type { ReqBoard } from '../types'
import { StateChip } from '../ui'
import { WORKING, actorMeta, fmtCredits, fmtWhen } from './format'
import { useChangeCount, useTween } from './hooks'
import { RoleIcon } from './RoleIcon'

export function TopBar({ board, replaying, follow, onReplay, onFollow, onDetail, onSession, onStart }: {
  board: ReqBoard
  replaying: boolean
  follow: boolean
  onReplay?: () => void
  onFollow: () => void
  onDetail?: () => void
  onSession?: (url: string) => void
  onStart?: () => void
}) {
  const r = board.row
  const local = board.actors.find((a) => a.key === 'local')?.session ?? null
  const runner = board.actors.find((a) => a.key === 'runner')?.session ?? null
  const finished = board.ended_at !== null || r.state === 'merged' || r.state === 'closed'
  return (
    <header className="kt-top">
      <div className="kt-title">
        {onDetail ? (
          <button type="button" className="kt-run-title kt-run-link" onClick={onDetail} title="需求详情：周期、时间花在哪、成本、检查、决定和问题">{r.title}</button>
        ) : (
          <span className="kt-run-title">{r.title}</span>
        )}
        <span className="kt-pill tone-info kt-mono" data-testid="br-board-key">{r.key}</span>
        <StateChip state={r.state} label={r.state_label} />
        {board.live && !replaying && <span className="kt-pill tone-run is-live"><i aria-hidden="true">●</i>此刻有人在做</span>}
        <span className="kt-run-meta kt-mono" title={r.worktree ?? undefined}>
          {board.branch ? `${board.branch} ← ${board.base}` : `还没有运行分支（${board.base}）`}{r.owner ? ` · ${r.owner}` : ''}
        </span>
      </div>
      <div className="kt-actions">
        {onReplay && !replaying && board.events.length > 1 && (
          <button type="button" className="kt-btn" onClick={onReplay} title={finished ? '按记录从头重放：谁在什么时候做了什么，哪里等人、哪里被退回' : '把到现在为止的经过重放一遍'}>
            ▶ 回放
          </button>
        )}
        {!replaying && local && onSession && (
          <button type="button" className="kt-btn" onClick={() => onSession(local.url)} title="在 Kiro Crew 里打开本机的 brain-dev 会话">本机会话</button>
        )}
        {!replaying && runner && onSession && (
          <button type="button" className="kt-btn" onClick={() => onSession(runner.url)} title="打开运行机上的 brain-run 会话">运行机会话</button>
        )}
        {!replaying && onStart && r.state === 'claimed' && (
          <button type="button" className="kt-btn is-primary" onClick={onStart}>去开工</button>
        )}
        <button type="button" className="kt-btn" aria-pressed={follow} onClick={onFollow} title="自动滚到正在动的那一环">跟随</button>
        {onDetail && <button type="button" className="kt-btn" onClick={onDetail}>需求详情 ↗</button>}
      </div>
    </header>
  )
}

export function Kpis({ board, reducedMotion, onActor }: { board: ReqBoard; reducedMotion: boolean; onActor?: (key: string) => void }) {
  return (
    <div className="kt-kpis br-kpis" role="group" aria-label="指标">
      <ChecksKpi board={board} reducedMotion={reducedMotion} />
      <LeanKpi board={board} />
      <PeopleKpi board={board} />
      <StepsKpi board={board} onActor={onActor} />
      <CreditsKpi board={board} reducedMotion={reducedMotion} />
    </div>
  )
}

function ChecksKpi({ board, reducedMotion }: { board: ReqBoard; reducedMotion: boolean }) {
  const w = board.checks
  const shown = Math.round(useTween(w.passed, 900, reducedMotion))
  const pop = useChangeCount(w.passed)
  const waiting = w.cells.filter((c) => c.status === 'wait').length
  const green = w.total > 0 && w.failed === 0 && waiting === 0
  return (
    <div className={`kt-kpi kt-kpi-tests${green ? ' is-green' : ''}`}>
      <div className="kt-kpi-label">检查通过</div>
      <div className="kt-kpi-value" data-testid="br-checks-counter" aria-label={`检查通过 ${w.passed}/${w.total}`}>
        <span className={`kt-kpi-big${pop ? ' is-pop' : ''}`} key={pop}>{shown}</span>
        <span className="kt-kpi-of">/{w.total}</span>
      </div>
      <div className="kt-segs" aria-hidden="true">
        {w.cells.filter((c) => c.status !== 'skip').map((c) => <i key={c.id} className={c.status === 'pass' ? 'is-pass' : c.status === 'fail' ? 'is-fail' : 'is-wait'} title={c.name} />)}
      </div>
      <div className="kt-kpi-note">
        {w.total ? (green ? <b className="tone-ok">全过</b> : w.failed ? <b className="tone-bad">{w.failed} 个没过</b> : <b className="tone-approve">{waiting} 个等人</b>) : '还没有检查结果'}
      </div>
    </div>
  )
}

/** Lean's stages (n/11), each a segment; the approvals said beside it. */
function LeanKpi({ board }: { board: ReqBoard }) {
  const lean = board.row.lean
  const now = lean.stage_state === 'started' && lean.stage_n !== null ? lean.stage_n : null
  const approved = board.events.filter((e) => e.kind === 'approve').length
  const back = board.events.filter((e) => e.kind === 'reject').length
  const blocked = board.events.filter((e) => e.kind === 'blocked').length
  return (
    <div className="kt-kpi kt-kpi-gates br-kpi-lean">
      <div className="kt-kpi-label">AI-DLC Lean · {lean.stage_label ?? '还没开始'}</div>
      <div className="kt-kpi-value">
        <span className="kt-kpi-big">{lean.done}</span>
        <span className="kt-kpi-of">/{lean.total} 个阶段</span>
      </div>
      <div className="kt-segs" aria-hidden="true">
        {Array.from({ length: lean.total }, (_, i) => <i key={i} className={i < lean.done ? 'is-pass' : now !== null && i === now - 1 ? 'is-run' : ''} />)}
      </div>
      <div className="kt-gates-rows">
        <span className={approved ? '' : ''}>批准 <b>{approved}</b></span>
        <span className={back ? 'is-hit' : ''}>退回 <b>{back}</b></span>
        <span className={blocked ? 'is-hit' : ''}>拦下 <b>{blocked}</b></span>
      </div>
    </div>
  )
}

/** A person's acts: at the judgment points (approvals, answers, acceptance) and outside them (a push after the
 * hand-over). brain-kit's Eval counts the same. */
function PeopleKpi({ board }: { board: ReqBoard }) {
  const at = board.events.filter((e) => (e.kind === 'approve' || e.kind === 'reject' || e.kind === 'answer') && e.from === 'person').length
  const outside = board.events.filter((e) => e.kind === 'commit' && e.from === 'person').length
  const handed = board.actors.find((a) => a.key === 'handover')?.status
  return (
    <div className={`kt-kpi br-kpi-people${outside ? ' is-warn' : ''}`}>
      <div className="kt-kpi-label">人介入</div>
      <div className="kt-kpi-value">
        <span className="kt-kpi-big">{at + outside}</span>
        <span className="kt-kpi-of">次</span>
      </div>
      <div className="br-dots" aria-hidden="true">
        {Array.from({ length: at }, (_, i) => <i key={`a${i}`} className="is-point" />)}
        {Array.from({ length: outside }, (_, i) => <i key={`o${i}`} className="is-out" />)}
      </div>
      <div className="kt-kpi-note">
        <b className="tone-ok">判断点上 {at}</b>{outside ? <> · <b className="tone-warn">判断点之外 {outside}</b></> : ' · 判断点之外 0'}
        {handed === 'skipped' ? ' · 只在本机' : ''}
      </div>
    </div>
  )
}

function StepsKpi({ board, onActor }: { board: ReqBoard; onActor?: (k: string) => void }) {
  const on = board.actors.filter((a) => a.status !== 'skipped')
  const done = on.filter((a) => a.status === 'merged' || a.status === 'done').length
  const working = on.filter((a) => WORKING.has(a.status)).length
  const waiting = on.filter((a) => a.status === 'awaiting_approval').length
  return (
    <div className="kt-kpi kt-kpi-roles">
      <div className="kt-kpi-label">这条路走到哪了</div>
      <div className="kt-kpi-value" data-testid="br-steps-counter">
        <span className="kt-kpi-big">{done}</span>
        <span className="kt-kpi-of">/{on.length}</span>
      </div>
      <div className="kt-role-dots">
        {on.map((a) => {
          const m = actorMeta(a.status)
          return (
            <button key={a.key} type="button" className={`kt-role-dot tone-${m.tone}${WORKING.has(a.status) ? ' is-working' : ''}`}
              title={`${a.title}：${m.label}（点一下只看它）`} aria-label={`${a.title}：${m.label}`} onClick={() => onActor?.(a.key)}>
              <RoleIcon role={a.icon} size={15} />
            </button>
          )
        })}
      </div>
      <div className="kt-kpi-note">
        {working ? <b className="tone-run">在做 {working}</b> : '没有在做的'}
        {waiting ? <b className="tone-approve"> · {waiting} 个等你</b> : null}
      </div>
    </div>
  )
}

function CreditsKpi({ board, reducedMotion }: { board: ReqBoard; reducedMotion: boolean }) {
  const c = board.credits.total
  const shown = useTween(c ?? 0, 900, reducedMotion)
  return (
    <div className="kt-kpi kt-kpi-credits">
      <div className="kt-kpi-label">credits</div>
      <div className="kt-kpi-value"><span className="kt-kpi-big">{c === null ? '—' : fmtCredits(shown)}</span></div>
      <div className="kt-kpi-note">{c === null ? '这个 app 开的会话还没报' : `${board.sessions.length} 个会话合计`}</div>
    </div>
  )
}

/** The way a requirement goes, before its run started (the sample's empty-state introduction of the team). */
const WAY: { phase: string; title: string; steps: { icon: string; title: string; does: string }[][] }[] = [
  { phase: '0 认领', title: '一个需求号，文档过五关', steps: [[{ icon: 'person', title: '你', does: '认领、交文档、开工' }]] },
  { phase: '1 本机 · Lean', title: 'brain-dev 会话带着 Lean 推进', steps: [
    [{ icon: 'laptop', title: '本机会话', does: '读需求、读 Brain、写文档' }],
    [{ icon: 'req', title: '需求审批', does: '你在会话里打一行' }, { icon: 'design', title: '设计审批', does: '你在会话里打一行' }],
  ] },
  { phase: '2 交给运行机', title: '桥核对，签名服务签合同', steps: [
    [{ icon: 'handover', title: '交接', does: 'brain handoff' }],
    [{ icon: 'bridge', title: '桥', does: '核对、转问题' }, { icon: 'signer', title: '签名', does: '接手合同' }],
    [{ icon: 'runner', title: '运行机', does: '无人值守地做' }],
  ] },
  { phase: '3 检查 · 验收', title: '机器检查，产品验收', steps: [[{ icon: 'ci', title: 'CI 检查', does: 'lean verify' }, { icon: 'release', title: '发布验收', does: '在 MR 上验收' }]] },
  { phase: '4 回写', title: '学到的写回 Brain', steps: [[{ icon: 'brain', title: '回写 Brain', does: 'brain reflect' }]] },
]

export function Intro({ board, onStart }: { board: ReqBoard; onStart?: () => void }) {
  return (
    <section className="kt-empty" data-testid="br-board-intro" aria-label="这个需求还没开工">
      <div className="kt-empty-hero">
        <h2>{board.row.key} 认领了，还没开工</h2>
        <p>
          开工以后，这里一屏看完它怎么走：本机的 brain-dev 会话带着 AI-DLC Lean 推进，需求和设计由你在会话里自己批准；交给运行机以后，桥核对交接，签名服务签合同，运行机无人值守地做，有问题停下来在 MR 上问人；检查过了，产品在 MR 上验收；合并以后，学到的东西写回 Brain。
        </p>
        <p className="kt-empty-punch">人只在判断点上出手：批准、回答、验收。</p>
      </div>
      <ol className="kt-team-intro is-phased br-way" aria-label="一个需求的路，从左到右">
        {WAY.map((ph) => (
          <li key={ph.phase} className="kt-intro-phase">
            <div className="kt-intro-phase-head">
              <b>{ph.phase}</b>
              <span>{ph.title}</span>
            </div>
            <div className="kt-intro-phase-body">
              {ph.steps.map((col, i) => (
                <div key={i} className="kt-intro-stage">
                  {col.map((s) => (
                    <div key={s.title} className="kt-intro-role">
                      <RoleIcon role={s.icon} size={26} className="kt-intro-emoji" />
                      <span className="kt-intro-name"><b>{s.title}</b></span>
                      <span className="kt-intro-does">{s.does}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {onStart && (
        <div className="br-hero-acts">
          <button type="button" className="kt-btn is-primary br-btn-big" onClick={onStart}>去开需求，开工</button>
          <span className="kt-dim">认领于 {fmtWhen(board.started_at)}</span>
        </div>
      )}
    </section>
  )
}
