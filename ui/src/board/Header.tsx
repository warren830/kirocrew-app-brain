/**
 * The top of the 需求看板 (the sample team board's Header.tsx): the requirement's key, title and state, its branch, the
 * actions (回放, 跟随, 需求详情, 打开会话), and the live counters: checks passed, Lean's stages, a person's acts (at the
 * judgment points and outside them), the steps of the way done, credits. Also the introduction a requirement shows
 * before its run started: the way it will go (the repo's own way: one done only here never goes to the runner), and
 * how to start it.
 */
import type { ReqBoard } from '../types'
import { StateChip } from '../ui'
import { ACT, leanProgress } from '../vocab'
import { WORKING, actorLabel, actorMeta, boardWho, checksSay, fmtCredits, fmtWhen, leanOf, localOnly, waitsOnMe } from './format'
import { useChangeCount, useTween } from './hooks'
import { waitCount } from './next'
import { RoleIcon } from './RoleIcon'

export function TopBar({ board, replaying, follow, onReplay, onFollow, onDetail, onSession, onStart }: {
  board: ReqBoard
  replaying: boolean
  follow: boolean
  onReplay?: () => void
  onFollow: () => void
  onDetail?: () => void
  onSession?: (url: string) => void
  /** 开工 this requirement (only its owner, or when it is not known who that is) */
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
        <StateChip state={r.state} label={r.state_label} who={r.waits.who} />
        {board.live && !replaying && <span className="kt-pill tone-run is-live"><i aria-hidden="true">●</i>此刻有人在做</span>}
        {localOnly(board) && (
          <span className="kt-pill tone-idle" data-testid="br-local-only" title="这个仓库没有远端：不交给运行机，没有 MR，在本机做完、在本机合并">这个仓库只在本机做</span>
        )}
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
          <button type="button" className="kt-btn" onClick={() => onSession(local.url)} title="在 Kiro Crew 里打开本机的 brain-dev 会话">{ACT.openSession}</button>
        )}
        {!replaying && runner && onSession && (
          <button type="button" className="kt-btn" onClick={() => onSession(runner.url)} title="打开运行机上的 brain-run 会话">{ACT.openSession}（运行机）</button>
        )}
        {!replaying && onStart && r.state === 'claimed' && (
          <button type="button" className="kt-btn is-primary" onClick={onStart}>{ACT.start} {r.key}</button>
        )}
        <button type="button" className="kt-btn" aria-pressed={follow} onClick={onFollow} title="自动滚到正在动的那一环">跟随</button>
        {onDetail && <button type="button" className="kt-btn" onClick={onDetail}>需求详情 ↗</button>}
      </div>
    </header>
  )
}

export function Kpis({ board, reducedMotion, onActor, replaying = false }: { board: ReqBoard; reducedMotion: boolean; onActor?: (key: string) => void; replaying?: boolean }) {
  return (
    <div className="kt-kpis br-kpis" role="group" aria-label="指标">
      <ChecksKpi board={board} reducedMotion={reducedMotion} />
      <LeanKpi board={board} />
      <PeopleKpi board={board} />
      <StepsKpi board={board} onActor={onActor} replaying={replaying} />
      <CreditsKpi board={board} reducedMotion={reducedMotion} replaying={replaying} />
    </div>
  )
}

const SEG: Record<string, string> = { pass: 'is-pass', fail: 'is-fail', wait: 'is-wait', watch: 'is-watch' }

function ChecksKpi({ board, reducedMotion }: { board: ReqBoard; reducedMotion: boolean }) {
  const w = board.checks
  const shown = Math.round(useTween(w.passed, 900, reducedMotion))
  const pop = useChangeCount(w.passed)
  const say = checksSay(w, board)
  return (
    <div className={`kt-kpi kt-kpi-tests${say.green ? ' is-green' : ''}`}>
      <div className="kt-kpi-label">检查通过</div>
      <div className="kt-kpi-value" data-testid="br-checks-counter" aria-label={`检查通过 ${w.passed}/${w.total}`}>
        <span className={`kt-kpi-big${pop ? ' is-pop' : ''}`} key={pop}>{shown}</span>
        <span className="kt-kpi-of">/{w.total}</span>
      </div>
      <div className="kt-segs" aria-hidden="true">
        {w.cells.filter((c) => SEG[c.status]).map((c) => <i key={c.id} className={SEG[c.status]} title={c.name} />)}
      </div>
      <div className="kt-kpi-note" data-testid="br-checks-say"><b className={`tone-${say.tone}`}>{say.text}</b></div>
    </div>
  )
}

/** Lean's stages, the one way (vocab.leanProgress): done green, skipped grey, the next one lit. */
function LeanKpi({ board }: { board: ReqBoard }) {
  const ln = leanOf(board.row.lean)
  const through = ln.done_n + ln.skipped_n
  const approved = board.events.filter((e) => e.kind === 'approve').length
  const back = board.events.filter((e) => e.kind === 'reject').length
  const blocked = board.events.filter((e) => e.kind === 'blocked').length
  const seg = (i: number) => (i < ln.done_n ? 'is-pass' : i < through ? 'is-skip' : ln.next && i === ln.next.n - 1 ? (ln.started ? 'is-run' : 'is-next') : '')
  return (
    <div className="kt-kpi kt-kpi-gates br-kpi-lean" aria-label={`AI-DLC Lean：${leanProgress(ln)}`}>
      <div className="kt-kpi-label">AI-DLC Lean</div>
      <div className="kt-kpi-value" data-testid="br-lean-counter">
        <span className="kt-kpi-big">{ln.done_n}</span>
        <span className="kt-kpi-of">做完{ln.skipped_n ? ` · 跳过 ${ln.skipped_n}` : ''}</span>
      </div>
      <div className="kt-segs" aria-hidden="true">
        {Array.from({ length: ln.total }, (_, i) => <i key={i} className={seg(i)} />)}
      </div>
      <div className="kt-kpi-note br-lean-next">{ln.next ? <>{ln.started ? '在做' : '下一步'}：<b>{ln.next.label}</b></> : through ? '全部做完' : '还没开始'}</div>
      <div className="kt-gates-rows">
        <span>批准 <b>{approved}</b></span>
        <span className={back ? 'is-hit' : ''}>退回 <b>{back}</b></span>
        <span className={blocked ? 'is-hit' : ''}>拦下 <b>{blocked}</b></span>
      </div>
    </div>
  )
}

/** A person's acts: at the judgment points (approvals, the questions they answered: in the session or on the MR,
 * acceptance) and outside them (a push after the hand-over). The answers are counted from what the person decided
 * (decisions.md) or from the answer events, whichever saw more: both record the same answers. */
export function peopleActs(board: ReqBoard): { gates: number; answers: number; outside: number } {
  const gates = board.events.filter((e) => (e.kind === 'approve' || e.kind === 'reject') && e.from === 'person').length
  const answered = board.events.filter((e) => e.kind === 'answer' && e.from === 'person').length
  const decided = board.decisions.filter((d) => d.by === 'person').length
  const outside = board.events.filter((e) => e.kind === 'commit' && e.from === 'person').length
  return { gates, answers: Math.max(answered, decided), outside }
}

function PeopleKpi({ board }: { board: ReqBoard }) {
  const { gates, answers, outside } = peopleActs(board)
  const at = gates + answers
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
        <b className="tone-ok">判断点上 {at}</b>{at ? `（审批 ${gates} · 回答 ${answers}）` : ''}
        {outside ? <> · <b className="tone-warn">判断点之外 {outside}</b></> : ' · 判断点之外 0'}
      </div>
    </div>
  )
}

function StepsKpi({ board, onActor, replaying }: { board: ReqBoard; onActor?: (k: string) => void; replaying: boolean }) {
  const on = board.actors.filter((a) => a.status !== 'skipped')
  const done = on.filter((a) => a.status === 'merged' || a.status === 'done').length
  const working = on.filter((a) => WORKING.has(a.status)).length
  const mine = waitsOnMe(board)
  const waiting = waitCount(board, replaying)
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
          const label = actorLabel(a.status, board)
          const tone = a.status === 'awaiting_approval' && !mine ? 'info' : m.tone
          return (
            <button key={a.key} type="button" className={`kt-role-dot tone-${tone}${WORKING.has(a.status) ? ' is-working' : ''}`}
              title={`${a.title}：${label}（点一下只看它）`} aria-label={`${a.title}：${label}`} onClick={() => onActor?.(a.key)}>
              <RoleIcon role={a.icon} size={15} />
            </button>
          )
        })}
      </div>
      <div className="kt-kpi-note">
        {working ? <b className="tone-run">在做 {working}</b> : '没有在做的'}
        {waiting ? <b className={mine ? 'tone-approve' : 'tone-info'}> · {waiting} 个{boardWho(board)}</b> : null}
      </div>
    </div>
  )
}

function CreditsKpi({ board, reducedMotion, replaying }: { board: ReqBoard; reducedMotion: boolean; replaying: boolean }) {
  const c = replaying ? null : board.credits.total
  const shown = useTween(c ?? 0, 900, reducedMotion)
  const n = board.sessions.length
  return (
    <div className="kt-kpi kt-kpi-credits">
      <div className="kt-kpi-label">credits</div>
      <div className="kt-kpi-value"><span className="kt-kpi-big">{c === null ? '—' : fmtCredits(shown)}</span></div>
      <div className="kt-kpi-note">{replaying ? '回放时不算' : c === null ? '这个 app 开的会话还没报' : n ? `${n} 个会话合计` : '运行记录里的合计'}</div>
    </div>
  )
}

type Way = { phase: string; title: string; steps: { icon: string; title: string; does: string }[][] }[]

/** 0 认领: the one who claimed it, 你 only to them (BOARD-11). */
const claimPhase = (who: string): Way[number] => ({ phase: '0 认领', title: '一个需求号，文档过五关', steps: [[{ icon: 'person', title: who, does: '认领、交文档、开工' }]] })

/** The way a requirement goes after its claim, before its run started (the sample's empty-state introduction of the
 * team). */
const WAY: Way = [
  { phase: '1 本机 · Lean', title: 'brain-dev 会话带着 Lean 推进', steps: [
    [{ icon: 'laptop', title: '本机会话', does: '读需求、读 Brain、写文档' }],
    [{ icon: 'req', title: '需求审批', does: '会话里打一行' }, { icon: 'design', title: '设计审批', does: '会话里打一行' }],
  ] },
  { phase: '2 交给运行机', title: '桥核对，签名服务签合同', steps: [
    [{ icon: 'handover', title: '交接', does: '把分支交出去' }],
    [{ icon: 'bridge', title: '桥', does: '核对、转问题' }, { icon: 'signer', title: '签名', does: '接手合同' }],
    [{ icon: 'runner', title: '运行机', does: '无人值守' }],
  ] },
  { phase: '3 检查 · 验收', title: '机器检查，产品验收', steps: [[{ icon: 'ci', title: 'CI 检查', does: '跑自动检查' }, { icon: 'release', title: '发布验收', does: '在 MR 上验收' }]] },
  { phase: '4 回写', title: '学到的写回 Brain', steps: [[{ icon: 'brain', title: '回写 Brain', does: '学到的写回去' }]] },
]

/** A repo done only on this machine: no runner, no MR; the release is approved in the session too. */
const LOCAL_WAY: Way = [
  WAY[0],
  { phase: '2 检查 · 发布', title: '机器检查，你批准发布', steps: [[{ icon: 'ci', title: 'CI 检查', does: '跑自动检查' }, { icon: 'release', title: '发布审批', does: '会话里打一行' }]] },
  { phase: '3 回写', title: '学到的写回 Brain', steps: [[{ icon: 'brain', title: '回写 Brain', does: '学到的写回去' }]] },
]

/** *onStart*: the one looking is the owner (only they start it): the way speaks to them as 你, else it names the owner. */
export function Intro({ board, onStart }: { board: ReqBoard; onStart?: () => void }) {
  const only = localOnly(board)
  const owner = board.person.owner
  const way = [claimPhase(onStart ? '你' : owner ?? '负责人'), ...(only ? LOCAL_WAY : WAY)]
  const who = onStart ? '你' : owner ? ` ${owner} ` : '负责人'
  return (
    <section className="kt-empty" data-testid="br-board-intro" aria-label="这个需求还没开工">
      <div className="kt-empty-hero">
        <h2>{board.row.key} 认领了，还没开工</h2>
        {only ? (
          <p>
            开工以后，这里一屏看完它怎么走：本机的 brain-dev 会话带着 AI-DLC Lean 推进，需求、设计和发布都由{who}在会话里自己批准；检查过了就在本机合并；合并以后，学到的东西写回 Brain。
          </p>
        ) : (
          <p>
            开工以后，这里一屏看完它怎么走：本机的 brain-dev 会话带着 AI-DLC Lean 推进，需求和设计由{who}在会话里自己批准；交给运行机以后，桥核对交接，签名服务签合同，运行机无人值守地做，有问题停下来在 MR 上问人；检查过了，产品在 MR 上验收；合并以后，学到的东西写回 Brain。
          </p>
        )}
        <p className="kt-empty-punch">人只在判断点上出手：批准、回答、验收。</p>
      </div>
      <ol className={`kt-team-intro is-phased br-way${only ? ' is-local' : ''}`} aria-label="一个需求的路，从左到右">
        {way.map((ph) => (
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
                      <span className="kt-intro-does">{s.does.split(/(?<=、)/).map((w) => <span key={w} className="br-phrase">{w}</span>)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="br-hero-acts" data-testid="br-intro-start">
        {onStart ? (
          <>
            <button type="button" className="kt-btn is-primary br-btn-big" onClick={onStart}>{ACT.start} {board.row.key}</button>
            <span className="kt-dim">在开需求里接着填：需求号 {board.row.key} 和标题已经带过去了 · 认领于 {fmtWhen(board.started_at)}</span>
          </>
        ) : owner ? (
          <span className="br-strong">{owner} 认领的，等 {owner} 开工<span className="kt-dim"> · 认领于 {fmtWhen(board.started_at)}</span></span>
        ) : (
          <span className="kt-dim">认领于 {fmtWhen(board.started_at)}</span>
        )}
      </div>
    </section>
  )
}
