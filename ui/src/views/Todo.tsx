/**
 * 待办: what waits on the person, grouped by kind. A Lean approval shows its line to type in the session (the app
 * never sends it); a question on the team runner is answered on its MR; a local clarify question may be answered here.
 * Polls GET /todo every 10 s. The sidebar badge and the tab's count come from /status (the app shell).
 */
import { useNavigate } from '@kirocrew/app-sdk'
import { paths, usePoll } from '../api'
import { ago } from '../format'
import type { Todo, TodoItem, TodoKind } from '../types'
import { CheckRows, ExtLink, Icon, LoadState, TypeLine } from '../ui'
import { QuestionCard } from './Detail'
import type { ViewProps } from './props'

export const TODO_POLL_MS = 10_000

const GROUPS: [TodoKind, string][] = [
  ['lean_approval', 'Lean 审批'],
  ['question', '运行机上的问题'],
  ['clarify', '本地澄清'],
  ['acceptance', '等验收'],
  ['handoff_rejected', '接手被拒'],
  ['crew', 'KiroCrew 的问题'],
]

export const TEAM_SENTENCE = '运行机的面板不收回答：回答在 GitLab 上，那里认得出是谁。'

export function TodoView(props: ViewProps) {
  const t = usePoll<Todo>(paths.todo(), props.pollMs ?? TODO_POLL_MS)
  const x = t.data
  const after = () => {
    t.reload()
    props.reloadStatus()
  }
  const now = Date.now() / 1000
  return (
    <div className="br-view" data-testid="br-todo">
      <header className="br-row">
        <h2>待办</h2>
        {x && <span className="br-dim">{x.items.length} 件</span>}
      </header>
      {x?.team && <p className="br-banner" data-testid="todo-team">{TEAM_SENTENCE}</p>}
      <LoadState loading={t.loading} error={t.error} has={!!x} />
      {x && x.items.length === 0 && <p className="br-empty">现在没有等你做的事。</p>}
      {x && GROUPS.map(([kind, heading]) => {
        const items = x.items.filter((i) => i.kind === kind)
        if (!items.length) return null
        return (
          <section key={kind} className="br-group" aria-label={heading} data-testid={`todo-${kind}`}>
            <h3>{heading} <span className="br-dim br-small">{items.length}</span></h3>
            {items.map((it, i) => <Item key={`${it.key}-${i}`} it={it} now={now} {...props} onAnswered={after} />)}
            {kind === 'crew' && props.status && (
              <CheckRows rows={props.status.crew.rows} only={['FAIL', 'WARN']} fix={props.status.crew.fix} onFixed={after} />
            )}
          </section>
        )
      })}
    </div>
  )
}

function Item({ it, now, go, onAnswered }: { it: TodoItem; now: number; onAnswered: () => void } & ViewProps) {
  const navigate = useNavigate()
  return (
    <article className="br-item" data-testid="todo-item" data-kind={it.kind}>
      <div className="br-row">
        {it.key ? (
          <button type="button" className="br-link br-key" onClick={() => go({ kind: 'item', repo: it.repo, key: it.key, from: 'todo' })}>{it.key}</button>
        ) : null}
        <b className="br-strong">{it.title}</b>
        {it.since !== null && <span className="br-dim br-small">{ago(it.since, now)}</span>}
        <span className="br-grow" />
        {it.session && it.kind !== 'lean_approval' && (
          <button type="button" className="br-btn is-small" onClick={() => navigate(it.session!.url)}>
            <Icon name="MessageSquare" size={13} />打开会话
          </button>
        )}
      </div>
      <p className="br-pre" style={{ margin: 0 }}>{it.text}</p>
      {it.kind === 'lean_approval' && it.line && <TypeLine line={it.line} sessionUrl={it.session?.url ?? null} />}
      {it.question && (it.kind === 'question' || it.kind === 'clarify' || it.kind === 'acceptance') && (
        <QuestionCard q={it.question} repo={it.repo} reqKey={it.key} mrUrl={it.mr_url ?? it.question.mr_url} onAnswered={onAnswered} />
      )}
      {!it.question && it.mr_url && (
        <div className="br-row br-small">
          <ExtLink href={it.mr_url}>{it.kind === 'acceptance' ? '去 MR 上验收' : it.kind === 'question' ? '去 MR 上回答' : '看 MR'}</ExtLink>
        </div>
      )}
    </article>
  )
}
