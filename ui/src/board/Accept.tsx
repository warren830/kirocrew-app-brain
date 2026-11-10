/**
 * 验收 (the sample team board's 签字单): everything a person needs to accept the requirement on one card — the
 * requirement, its 变更说明 (the first line, the whole text folded, 复制 for the MR), the decisions and who made them,
 * what the checks say, what it cost, and how it ended. The step a person takes now is the strip at the top of the board
 * (NextStep.tsx); the app takes none of these steps for them.
 */
import type { ReactNode } from 'react'
import type { ReqBoard } from '../types'
import { Icon } from '../ui'
import { useCopy } from '../views/Question'
import { checksSay, fmtCredits, fmtWhen, titleOf } from './format'
import { RoleIcon } from './RoleIcon'

const STATE: Record<ReqBoard['accept']['state'], { label: string; tone: string }> = {
  not_yet: { label: '还没到验收', tone: 'idle' },
  waiting: { label: '等验收', tone: 'approve' },
  accepted: { label: '验收过了', tone: 'ok' },
  rejected: { label: '验收被退回', tone: 'bad' },
  merged: { label: '已合并', tone: 'ok' },
}

/** who settled the decisions, in words (decisions.md's Who column is never named to a person) */
const BY_WORD: Record<string, string> = { unclassified: '没归类（「谁定的」没按规定写）' }

/** A person named in a decision or on the merge, as 需求详情 says it: the run's owner 「负责人 alice」 (「你（负责人）」 to
 * them), 「一位组员」 for a pseudonym. */
export function personName(who: string | null, owner: string | null, me = false): string {
  if (!who) return ''
  if (who === 'owner') return me ? '你（负责人）' : owner ? `负责人 ${owner}` : '负责人'
  if (/^P-[0-9A-F]{4,}$/i.test(who)) return '一位组员'
  return who
}

/** brain mr-desc's first line: `code` drawn as code; the record refs it ends with (（D01#S002 · 097f2e9e）) folded. */
export function DescLine({ text }: { text: string }) {
  const ref = /（([A-Z]\d+#S\d+[^）]*)）/.exec(text)
  const body = ref ? text.replace(ref[0], '') : text
  const parts: ReactNode[] = body.split(/`([^`]+)`/).map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p))
  return (
    <>
      <span data-testid="accept-first">{parts}</span>
      {ref && <span className="kt-dim br-small br-desc-ref" title={`出自记录 ${ref[1]}`}> · 出处</span>}
    </>
  )
}

export function Accept({ board, onDetail, quiet = false }: { board: ReqBoard; onDetail?: () => void; quiet?: boolean }) {
  const ac = board.accept
  const m = board.mr_desc
  const { copied, copy } = useCopy(m.text)
  const st = STATE[ac.state]
  const owner = board.person.owner
  const people = board.decisions.filter((d) => d.by === 'person')
  const total = ac.by.reduce((n, x) => n + x.count, 0)
  const signed = ac.state === 'merged' || ac.state === 'accepted'
  const say = checksSay(board.checks, board)
  const sessions = board.sessions.length
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
          <dd><b className="br-strong">{board.row.key}</b> {titleOf(board.row)}</dd>
        </div>
        <div className="br-accept-desc">
          <dt>变更说明 {m.text && <button type="button" className="br-link br-small br-copy" onClick={() => void copy()}><Icon name="Copy" size={12} />复制</button>}
            {copied === 'ok' && <span className="br-ok-text br-small" role="status"> 已复制</span>}</dt>
          <dd>
            {m.first ? <DescLine text={m.first} /> : <span className="br-dim">{m.error || '还没有'}</span>}
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
          <dd><b className={`tone-${say.tone}`} data-testid="accept-checks">{say.text}</b></dd>
        </div>
        <div>
          <dt>决定 · 谁定的</dt>
          <dd>
            {total ? (
              <ul className="kt-sign-groups">
                {ac.by.map((x) => <li key={x.id} className={x.id === 'person' ? 'is-ok' : x.id === 'unclassified' ? 'is-bad' : ''}>{BY_WORD[x.id] ?? x.label} {x.count}</li>)}
              </ul>
            ) : '还没有记下决定'}
          </dd>
        </div>
        <div>
          <dt>人做的决定</dt>
          <dd>
            {quiet ? '回放时不列：决定没有自己的时间' : people.length ? (
              <ul>{people.slice(0, 4).map((d) => <li key={d.id}><b>{d.id}</b> <DescText text={d.text} />{d.who ? <span className="kt-dim"> · {personName(d.who, owner, board.person.me)}</span> : null}</li>)}</ul>
            ) : '（这次没有人拍板的决定）'}
            {people.length > 4 && <span className="kt-dim br-small">还有 {people.length - 4} 条：在需求详情里看</span>}
          </dd>
        </div>
        <div>
          <dt>花了多少</dt>
          <dd>
            {quiet ? '回放时不算' : <>
              {board.credits.total !== null ? `${fmtCredits(board.credits.total)} credits` : 'credits 还没报'}
              {' · '}{sessions ? `${sessions} 个会话` : board.credits.total !== null ? '运行记录里的合计' : '还没有会话'}
            </>}
          </dd>
        </div>
      </dl>
      {ac.done ? (
        <p className="kt-sign-done" role="status">
          <RoleIcon role="merge" size={16} /> {ac.done.who ? <b>{personName(ac.done.who, owner, board.person.me)}</b> : null} {fmtWhen(ac.done.at)} {ac.done.how}
          {onDetail && <button type="button" className="kt-btn kt-sign-cto" onClick={onDetail}>需求详情 ↗</button>}
        </p>
      ) : null}
    </section>
  )
}

/** Inline `code` in a decision's text drawn as code, not as backticks. */
function DescText({ text }: { text: string }) {
  return <>{text.split(/`([^`]+)`/).map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p))}</>
}
