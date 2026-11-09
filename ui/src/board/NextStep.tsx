/**
 * 你要做的一步: a narrow strip at the top of the board, above the graph (UI问题清单 #4). What the person does now and
 * where, one row each, with the means right beside it: the line to type (复制那一行, 打开会话), a question they can
 * answer right here (回答 opens its form in place), the MR, the command for a terminal. When it is not their turn, one
 * dim line says whom it waits for. The app takes no step for them: it never types a line, never answers on the MR.
 */
import { useState } from 'react'
import { useNavigate } from '@kirocrew/app-sdk'
import type { ReqBoard } from '../types'
import { ExtLink, Icon, TYPE_IT_YOURSELF } from '../ui'
import { ACT, DO_NAME } from '../vocab'
import { QuestionCard, ReviewButton, ReviewSay } from '../views/Question'
import { fmtSpan } from './format'
import { useServerNow } from './hooks'
import { nextOf, type Step } from './next'
import { RoleIcon } from './RoleIcon'

export function NextStep({ board, repo, reqKey, onAnswered, onBrain, onDetail }: {
  board: ReqBoard
  repo: string
  reqKey: string
  onAnswered?: () => void
  onBrain?: () => void
  onDetail?: () => void
}) {
  const n = nextOf(board)
  const now = useServerNow()
  const st = board.row.state
  if (!n.mine) {
    if (!n.text || st === 'claimed' || st === 'merged' || st === 'closed') return null
    return (
      <p className="br-next is-other" role="status" data-testid="br-next">
        <span className="br-next-who">此刻不用你做什么</span>
        <span>{n.text}</span>
        {n.mr && <ExtLink href={n.mr} className="br-link">在 MR 上看 ↗</ExtLink>}
      </p>
    )
  }
  if (!n.steps.length) return null
  return (
    <section id="br-next" className="br-next" aria-label="你要做的一步" data-testid="br-next">
      <header className="br-next-head">
        <span className="br-next-who"><RoleIcon role="person" size={16} />你要做的一步</span>
        {n.steps.length > 1 && <span className="kt-pill tone-approve">{n.steps.length} 件事等你</span>}
        {n.since !== null && <span className="kt-dim">已经等了 {fmtSpan(now - n.since)}</span>}
      </header>
      <ol className="br-next-list">
        {n.steps.map((s) => (
          <li key={s.id} className={`br-next-item is-${s.do}`} data-testid="br-next-step" data-do={s.do}>
            {s.question
              ? <AskRow s={s} open={n.steps.length === 1} repo={repo} reqKey={reqKey} onAnswered={onAnswered} />
              : <StepRow s={s} onBrain={onBrain} onDetail={onDetail} repo={repo} reqKey={reqKey} board={board} />}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** A question the person answers right here: one row; 回答 opens its form under it (open at once when it is the only
 * thing to do). */
function AskRow({ s, open, repo, reqKey, onAnswered }: { s: Step; open: boolean; repo: string; reqKey: string; onAnswered?: () => void }) {
  const [shown, setShown] = useState(open)
  const q = s.question!
  return (
    <>
      <div className="br-next-row">
        <div className="br-next-text">
          <p><span className="br-next-k">{q.kind_label || '问题'}</span><b className="br-strong">{q.question}</b></p>
          <p className="br-next-hint">在这里就能回答：{q.answer_via === 'mr' ? '回答会作为你在 MR 上的评论发出' : '回答会送进你的本机会话'}</p>
        </div>
        <div className="br-next-acts">
          <button type="button" className={`kt-btn${shown ? '' : ' is-primary'}`} aria-expanded={shown} onClick={() => setShown((v) => !v)}>{shown ? '收起' : '回答'}</button>
        </div>
      </div>
      {shown && <QuestionCard q={q} repo={repo} reqKey={reqKey} onAnswered={onAnswered} />}
    </>
  )
}

/** The line the person types themselves in the session: the line, 复制那一行, 打开会话 — one row. */
function LineRow({ line, session }: { line: string; session: string | null }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }
  return (
    <div className="br-next-cmd" data-testid="type-line" title={TYPE_IT_YOURSELF}>
      <span className="br-next-k">在会话里打</span>
      <code className="br-mono">{line}</code>
      <button type="button" className="br-btn is-small" onClick={() => void copy()}><Icon name="Copy" size={13} />{ACT.copyLine}</button>
      {session && <button type="button" className="br-btn is-small" onClick={() => navigate(session)}><Icon name="MessageSquare" size={13} />{ACT.openSession}</button>}
      {copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制</span>}
      {copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请手动选中这一行</span>}
      <span className="kt-dim br-small">app 不会替你发</span>
    </div>
  )
}

function StepRow({ s, onBrain, onDetail, repo, reqKey, board }: { s: Step; onBrain?: () => void; onDetail?: () => void; repo: string; reqKey: string; board: ReqBoard }) {
  const navigate = useNavigate()
  const session = s.session && !s.line ? s.session : null
  const slot = board.actors.find((a) => a.key === 'local')?.session?.slot ?? null
  return (
    <div className="br-next-row">
      <div className="br-next-text">
        {s.why ? (
          <>
            <p><span className="br-next-k">为什么被拒</span><b className="br-strong">{s.why}</b></p>
            <p className="br-pre-line"><span className="br-next-k">怎么办</span>{s.text}</p>
          </>
        ) : (
          <p className="br-strong br-pre-line">{s.text}</p>
        )}
        {s.hint && <p className="br-next-hint">{s.hint}</p>}
        {s.command && <Command cmd={s.command} />}
        {s.line && <LineRow line={s.line} session={s.session ?? null} />}
        {s.say && <ReviewSay say={s.say} />}
        {s.raw && (
          <details className="br-raw">
            <summary>细节</summary>
            <pre>{s.raw}</pre>
          </details>
        )}
      </div>
      <div className="br-next-acts">
        {s.review && <ReviewButton repo={repo} reqKey={reqKey} liveSlot={slot} worktree={board.row.worktree} />}
        {session && <button type="button" className={`kt-btn${s.review ? '' : ' is-primary'}`} onClick={() => navigate(session)}>{ACT.openSession}</button>}
        {!s.session && !s.line && (s.do === 'reply' || s.do === 'tool') && onDetail && (
          <button type="button" className="kt-btn" onClick={onDetail} title="需求详情里能开一个新会话">去需求详情开会话</button>
        )}
        {s.mr && <ExtLink href={s.mr} className={`kt-btn br-extbtn${s.do === 'accept' || s.do === 'answer' || s.do === 'label_handoff' ? ' is-primary' : ''}`}>{s.do === 'answer' ? `${ACT.answerOnMr} ↗` : s.do === 'redo_handoff' ? '在 MR 上看桥说的 ↗' : '去 MR ↗'}</ExtLink>}
        {s.do === 'write_back' && onBrain && <button type="button" className="kt-btn is-primary" onClick={onBrain}>{DO_NAME.write_back} ↗</button>}
      </div>
    </div>
  )
}

/** A command the person types in a terminal, in the requirement's working directory. */
function Command({ cmd }: { cmd: { text: string; cwd: string | null } }) {
  const [copied, setCopied] = useState(false)
  const full = cmd.cwd ? `cd ${JSON.stringify(cmd.cwd)} && ${cmd.text}` : cmd.text
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="br-next-cmd">
      <span className="br-next-k">在哪做</span>
      <span>{cmd.cwd ? '在这个需求的工作目录里开一个终端，敲：' : '在本机这个需求的分支上开一个终端，敲：'}</span>
      <code className="br-mono" title={full}>{cmd.text}</code>
      <button type="button" className="br-btn is-small" onClick={() => void copy()}><Icon name="Copy" size={13} />复制命令</button>
      {copied && <span className="br-small br-ok-text" role="status">已复制（含 cd 到工作目录）</span>}
      {cmd.cwd && <span className="kt-dim kt-mono br-next-cwd" title={cmd.cwd}>{cmd.cwd}</span>}
    </div>
  )
}
