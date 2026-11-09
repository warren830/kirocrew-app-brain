/**
 * Pieces 需求详情, 需求看板 and 待办 share: a question with its answer form, a Brain entry chip, and the MR's 变更说明
 * with 复制. Text is never rendered as HTML: Markdown is built into elements (Markdown.tsx).
 */
import { useState } from 'react'
import { fmtTime } from '../format'
import { ENTRY_RE, fileOfEntry } from '../nav'
import type { MrDesc, Question } from '../types'
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
 */
export function QuestionCard({ q, repo, reqKey, mrUrl, onAnswered }: {
  q: Question
  repo: string
  reqKey: string
  mrUrl?: string | null
  onAnswered?: () => void
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
  return (
    <article className={`br-q${open ? ' is-open' : ''}`} aria-label={`问题 ${q.id ?? q.kind_label}`} data-testid="question">
      <div className="br-row">
        {q.id && <b className="br-key">{q.id}</b>}
        <span className="br-tag">{SOURCE_LABEL[q.source] ?? q.source}</span>
        <span className="br-chip tone-info">{q.kind_label || q.kind}</span>
        <span className={`br-chip tone-${meta.tone}`}>{meta.label}</span>
        {q.at !== null && <span className="br-dim br-small">{fmtTime(q.at)}</span>}
      </div>
      {asked.text && <p className="br-pre br-strong"><Inline text={asked.text} /></p>}
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
            ? <>这是 Lean 的{what}：在 MR 上回答{q.id ? ` ${q.id}` : ''}（approve / reject），桥会把回答带回运行机。</>
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
          <ExtLink href={link}>{open && !formHere ? ACT.answerOnMr : '在 MR 上看'}</ExtLink>
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
