/**
 * 验收 (the sample team board's 签字单): everything a person needs to accept the requirement on one card — the
 * requirement, its 变更说明 (the first line, the whole text folded, 复制 for the MR), the decisions and who made them,
 * what the checks say, and the one step a person takes now (the line they type themselves in the session, the MR to
 * answer or accept on, the write-back into the Brain). The app takes none of these steps for them.
 */
import { useNavigate } from '@kirocrew/app-sdk'
import type { ReqBoard } from '../types'
import { ExtLink, Icon, TypeLine } from '../ui'
import { useCopy } from '../views/Question'
import { fmtWhen } from './format'
import { RoleIcon } from './RoleIcon'

const STATE: Record<ReqBoard['accept']['state'], { label: string; tone: string }> = {
  not_yet: { label: '还没到验收', tone: 'idle' },
  waiting: { label: '等验收', tone: 'approve' },
  accepted: { label: '验收过了', tone: 'ok' },
  rejected: { label: '验收被退回', tone: 'bad' },
  merged: { label: '已合并', tone: 'ok' },
}

export function Accept({ board, onDetail, onBrain, quiet = false }: { board: ReqBoard; onDetail?: () => void; onBrain?: () => void; quiet?: boolean }) {
  const navigate = useNavigate()
  const ac = board.accept
  const m = board.mr_desc
  const { copied, copy } = useCopy(m.text)
  const st = STATE[ac.state]
  const people = board.decisions.filter((d) => d.by === 'person')
  const total = ac.by.reduce((n, x) => n + x.count, 0)
  const signed = ac.state === 'merged' || ac.state === 'accepted'
  return (
    <section id="br-accept" className={`kt-sign${signed ? ' is-signed' : ''}${ac.state === 'not_yet' ? ' is-idle' : ''}`} aria-label="验收" data-testid="br-accept">
      <header className="kt-sign-head">
        <h2>验收</h2>
        <span className={`kt-pill tone-${st.tone}`}>{st.label}</span>
        <p className="kt-dim">合并前由人确认：变更、决定、检查</p>
      </header>
      <dl className="kt-sign-grid">
        <div>
          <dt>需求</dt>
          <dd><b className="br-strong">{board.row.key}</b> {board.row.title}</dd>
        </div>
        <div className="br-accept-desc">
          <dt>变更说明 {m.text && !quiet && <button type="button" className="br-link br-small" onClick={() => void copy()}><Icon name="Copy" size={12} />复制</button>}
            {copied === 'ok' && <span className="br-ok-text br-small" role="status"> 已复制</span>}</dt>
          <dd>
            {m.first ? <span data-testid="accept-first">{m.first}</span> : <span className="br-dim">{m.error || '还没有'}</span>}
            {m.text && (
              <details className="br-raw">
                <summary>看全文</summary>
                <pre>{m.text}</pre>
              </details>
            )}
          </dd>
        </div>
        <div>
          <dt>检查</dt>
          <dd><b className={board.checks.failed ? 'kt-bad' : board.checks.total && board.checks.passed === board.checks.total ? 'kt-ok' : ''}>{ac.checks}</b></dd>
        </div>
        <div>
          <dt>决定 · 谁定的</dt>
          <dd>
            {total ? (
              <ul className="kt-sign-groups">
                {ac.by.map((x) => <li key={x.id} className={x.id === 'person' ? 'is-ok' : x.id === 'unclassified' ? 'is-bad' : ''}>{x.label} {x.count}</li>)}
              </ul>
            ) : '还没有记下决定'}
          </dd>
        </div>
        <div>
          <dt>人做的决定</dt>
          <dd>
            {people.length ? (
              <ul>{people.slice(0, 4).map((d) => <li key={d.id}><b>{d.id}</b> {d.text}{d.who ? `（${d.who}）` : ''}</li>)}</ul>
            ) : '（这次没有人拍板的决定）'}
          </dd>
        </div>
        <div>
          <dt>花了多少</dt>
          <dd>{board.credits.total !== null ? `${board.credits.total} credits` : 'credits 还没报'} · {board.sessions.length} 个会话{board.row.run_ids.length ? ` · ${board.row.run_ids.join('、')}` : ''}</dd>
        </div>
      </dl>
      {ac.done ? (
        <p className="kt-sign-done" role="status">
          <RoleIcon role="merge" size={16} /> {ac.done.who ? <b>{ac.done.who}</b> : null} {fmtWhen(ac.done.at)} {ac.done.how}
          {onDetail && <button type="button" className="kt-btn kt-sign-cto" onClick={onDetail}>需求详情 ↗</button>}
        </p>
      ) : null}
      {!quiet && ac.step.text ? (
        <div className="br-step" data-testid="accept-step">
          <span className="br-step-who"><RoleIcon role="person" size={16} />{ac.step.who || '你'}要做的一步</span>
          <p className="br-strong br-pre">{ac.step.text}</p>
          {ac.step.line && <TypeLine line={ac.step.line} sessionUrl={ac.step.session_url} />}
          <div className="br-row">
            {ac.step.mr_url && <ExtLink href={ac.step.mr_url} className="kt-btn is-primary br-extbtn">去 MR ↗</ExtLink>}
            {!ac.step.line && ac.step.session_url && <button type="button" className="kt-btn" onClick={() => navigate(ac.step.session_url!)}>打开会话</button>}
            {/Brain/.test(ac.step.text) && onBrain && <button type="button" className="kt-btn is-primary" onClick={onBrain}>去 Brain 回写 ↗</button>}
          </div>
        </div>
      ) : !quiet && !ac.done ? (
        <p className="kt-sign-blocked" role="status">此刻不用你做什么：{board.person.doing}</p>
      ) : null}
    </section>
  )
}
