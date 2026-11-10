/**
 * Pieces 需求详情, 需求看板 and 待办 share: a question with its answer form, a Brain entry chip, the MR's 变更说明
 * with 复制, and 开审查会话. Text is never rendered as HTML: Markdown is built into elements (Markdown.tsx).
 */
import { useState } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction } from '../api'
import { whoThen } from '../board/format'
import { fmtTime } from '../format'
import { ENTRY_RE, fileOfEntry } from '../nav'
import type { MrDesc, OpenSessionBody, OpenSessionResult, Question } from '../types'
import { AnswerForm, ExtLink, Icon, isOpenQuestion, questionMeta } from '../ui'
import { ACT, approvalName } from '../vocab'
import { Inline, Markdown, takeRefs } from './Markdown'
import type { ViewProps } from './props'

const SOURCE_LABEL: Record<Question['source'], string> = { park: '本地会话', bridge: '运行机', mr: 'MR' }

/** A Brain entry as a chip that opens the Brain view at it (an id that is not an entry id stays plain). */
export function EntryChip({ id, repo, go }: { id: string; repo: string; go: ViewProps['go'] }) {
  if (!ENTRY_RE.test(id)) return <span className="br-tag br-mono">{id}</span>
  const file = fileOfEntry(id)
  return (
    <button type="button" className="br-tag" title="在 Brain 里看这一条"
      onClick={() => go({ kind: 'brain', ...(repo && repo !== 'runner' ? { repo } : {}), id, ...(file ? { file } : {}) })}>
      {id}
    </button>
  )
}

/**
 * One question: who asked it, its kind and state, the options, the answer so far, and the answer form when the person
 * may answer here (AnswerForm decides; never for a Lean approval request). *mrUrl* overrides the question's own link.
 * *waiter*: whom an open question on the MR waits on when it is not the person looking (「等产品」, the requirement's
 * waits by the one rule): then it says so and only looks (看 MR); absent, the person looking answers it.
 */
export function QuestionCard({ q, repo, reqKey, mrUrl, onAnswered, waiter = null }: {
  q: Question
  repo: string
  reqKey: string
  mrUrl?: string | null
  onAnswered?: () => void
  waiter?: string | null
}) {
  const meta = questionMeta(q.state, q.source)
  const open = isOpenQuestion(q)
  const formHere = q.answerable_here && !q.lean_request
  const link = mrUrl === undefined ? q.mr_url : mrUrl
  // a question the bridge put on the MR is answered there (handed over); only a local run's park.json is the session's
  const onMr = q.source !== 'park'
  const what = q.lean_request ? `${approvalName(q.lean_request.split(' ')[0]) || '审批'}请求` : ''
  const asked = takeRefs(q.question)
  const raw = [...q.refs, ...asked.refs, ...(q.lean_request ? [q.lean_request] : []), ...(q.voucher_id ? [`凭证 ${q.voucher_id}`] : [])]
  const theirs = onMr && open && !!waiter
  // an acceptance is 验收 on the MR, any other question an answer (REST-18)
  const accept = q.kind === 'acceptance'
  const verb = accept ? '验收' : '回答'
  return (
    <article className={`br-q${open ? ' is-open' : ''}`} aria-label={`问题 ${q.id ?? q.kind_label}`} data-testid="question">
      <div className="br-row">
        {q.id && <b className="br-key">{q.id}</b>}
        <span className="br-tag">{SOURCE_LABEL[q.source] ?? q.source}</span>
        <span className="br-chip tone-info">{q.kind_label || q.kind}</span>
        <span className={`br-chip tone-${meta.tone}`}>{meta.label}</span>
        {q.at !== null && <span className="br-dim br-small">{fmtTime(q.at)}</span>}
      </div>
      {asked.text ? <p className="br-pre br-strong"><Inline text={asked.text} /></p>
        : onMr && !q.lean_request && <p className="br-dim br-small" data-testid="question-no-text">这个{q.kind_label || ''}问题的原话在 MR 上，运行机的记录里没有。</p>}
      {q.options.length > 0 && !formHere && (
        <ol className="br-opts" aria-label="选项">
          {q.options.map((o) => (
            <li key={o.id}>
              <b className="br-mono">{o.id}</b> <Inline text={o.text} />
              {q.recommend === o.id && <span className="br-chip tone-ok" style={{ marginLeft: 6 }}>推荐</span>}
            </li>
          ))}
        </ol>
      )}
      {q.recommend && !q.options.some((o) => o.id === q.recommend) && <p className="br-note">推荐：{q.recommend}</p>}
      {q.lean_request && (
        <p className="br-note" data-testid="lean-request">
          {onMr
            ? <>这是 Lean 的{what}：{whoThen(theirs ? waiter ?? '' : '', `在 MR 上${verb}${q.id ? ` ${q.id}` : ''}`)}（approve / reject），桥会把回答带回运行机。</>
            : <>这是 Lean 的{what}：在会话里自己打批准那一行，这里不能回答。</>}
        </p>
      )}
      {q.answer && (
        <p className="br-pre" style={{ margin: 0 }}>
          回答：<b className="br-strong">{q.answer}</b>
          {q.answerer ? ` · ${q.answerer}` : ''}
        </p>
      )}
      {link && (
        <div className="br-row br-small">
          {theirs && !q.lean_request && <span className="br-dim">{whoThen(waiter ?? '', `在 MR 上${verb}`)}</span>}
          <ExtLink href={link}>{open && !formHere && !theirs ? (accept ? ACT.acceptOnMr : ACT.answerOnMr) : ACT.viewMr}</ExtLink>
        </div>
      )}
      {raw.length > 0 && (
        <details className="br-raw" data-testid="question-raw">
          <summary>细节</summary>
          <div className="br-row" style={{ gap: 4, marginTop: 4 }}>{raw.map((r) => <code key={r}>{r}</code>)}</div>
        </details>
      )}
      <AnswerForm question={q} repo={repo} reqKey={reqKey} onDone={() => onAnswered?.()} />
    </article>
  )
}

export const MR_DESC_COPY_HINT = '复制的是 brain-kit 处理过的文字：贴进 GitLab 的 MR 描述里，@ 提到人、HTML、图片、快捷命令、像批准或回答的行都不会生效。'

/** Where a 变更说明 comes from, in words. */
export function mrDescSource(m: MrDesc): string {
  if (m.source === 'file') return `${m.path ?? 'MR.md'} · 提交 ${m.ref ?? '?'}`
  if (m.source === 'records') return `由记录生成 · 提交 ${m.ref ?? '?'}（分支上还没有 ${m.path ?? 'MR.md'}）`
  return ''
}

/** 复制 a 变更说明's text, and what it said. */
export function useCopy(text: string) {
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }
  return { copied, copy }
}

/**
 * The MR's 变更说明 (brain mr-desc): its first line, the whole text folded (formatted: tables as tables), and 复制 (the
 * Markdown as it is, for the MR description). *bare*: no card of its own (inside another card).
 */
export function MrDescCard({ m, bare = false }: { m: MrDesc; bare?: boolean }) {
  const { copied, copy } = useCopy(m.text)
  const from = mrDescSource(m)
  const first = takeRefs(m.first ?? '')
  const body = (
    <>
      <header className="br-row">
        <h3>变更说明</h3>
        {from && <span className="br-dim br-small">{from}</span>}
        <span className="br-grow" />
        {m.text && (
          <button type="button" className="br-btn is-small" onClick={() => void copy()}>
            <Icon name="Copy" size={13} />复制
          </button>
        )}
      </header>
      {m.error && <p className="br-note">{m.error}</p>}
      {first.text && <p className="br-strong br-mrfirst" style={{ margin: 0 }} data-testid="mr-desc-first" title={first.refs.length ? `出处 ${first.refs.join('、')}` : undefined}><Inline text={first.text} /></p>}
      {m.text && (
        <details className="br-raw br-mdfold">
          <summary>看全文</summary>
          <Markdown text={m.text} testid="mr-desc-text" />
        </details>
      )}
      {copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制</span>}
      {copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请展开全文手动选中</span>}
      {m.text && <p className="br-hint">{MR_DESC_COPY_HINT}</p>}
    </>
  )
  if (bare) return <div className="br-stack" style={{ gap: 8 }} aria-label="变更说明" data-testid="mr-desc">{body}</div>
  return <section className="br-card" aria-label="变更说明" data-testid="mr-desc">{body}</section>
}

/** The line 开审查会话 says to the new session (Lean's own words, English), folded: to copy for a session opened by hand. */
export function ReviewSay({ say }: { say: string }) {
  const c = useCopy(say)
  return (
    <details className="br-raw" data-testid="review-say">
      <summary>细节：{ACT.review}对新会话说的那一句</summary>
      <div className="br-now-say">
        <code>{say}</code>
        <button type="button" className="kt-btn is-small" onClick={() => void c.copy()}><Icon name="Copy" size={13} />复制那一句</button>
        {c.copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制</span>}
        {c.copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请手动选中</span>}
      </div>
    </details>
  )
}

/** 开审查会话: a new brain-dev session in the worktree that reviews the code (POST …/session {review}). */
export function ReviewButton({ repo, reqKey, liveSlot, worktree }: { repo: string; reqKey: string; liveSlot: string | null; worktree: string | null }) {
  const api = useAppApi()
  const navigate = useNavigate()
  const [same, setSame] = useState(false)
  const act = useAction((body: OpenSessionBody) => api.post<OpenSessionResult>(paths.session(repo, reqKey), body))
  const open = async () => {
    const r = await act.run({ trust: true, kickoff: true, review: true })
    if (!r) return
    if (liveSlot && r.slot === liveSlot) setSame(true)
    else navigate(r.url)
  }
  return (
    <>
      <button type="button" className="kt-btn is-primary" disabled={act.busy} onClick={() => void open()}>
        <Icon name="MessageSquare" size={13} />{act.busy ? '正在开…' : ACT.review}
      </button>
      {same && (
        <p className="br-note" role="status">
          没开成新的审查会话：app 只找到了原来那个会话。在 KiroCrew 里新开一个 brain-dev 会话{worktree ? `（工作目录 ${worktree}）` : ''}，让它审查这个需求的代码。
        </p>
      )}
      {act.error && <p className="br-error" role="alert">{act.error}</p>}
    </>
  )
}
