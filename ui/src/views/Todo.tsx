/**
 * 待办: what waits on the person, in the sample board's look: the count as a counter card (one cell per item, coloured
 * by what it is, each kind a jump to its group), then a section per kind with its line icon and count, each item a
 * card whose border says its state (magenta: it waits for you; red: refused; yellow: worth a look) with the action
 * right there. A Lean approval shows its line to type in the session (the app never sends it); a question on the team
 * runner is answered on its MR; a local clarify question may be answered here (`answerable_here`); a hand-over that was
 * pushed but carries no label on its MR (nothing handed over) says what to do. A small requirement you claimed whose
 * dependencies have all merged has 开工 right there (POST start: brain start --key, then its session); its answer stays
 * on the page after the list no longer has it, with 打开会话. A big requirement whose small ones all merged waits for
 * its review and release: 看板. A key opens 需求详情, 看板 opens 需求看板.
 * Polls GET /todo every 10 s. The sidebar badge and the tab's count come from /status (the app shell).
 */
import { useRef, useState } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { ago } from '../format'
import type { ChildStartBody, ChildStartResult, Todo, TodoItem, TodoKind } from '../types'
import { CheckRows, EmptyHero, ExtLink, Icon, LoadState, RoleIcon, TypeLine, type FlowStep } from '../ui'
import { ChildStartOut, FAMILY_CSS } from './Family'
import { QuestionCard } from './Question'
import type { ViewProps } from './props'

export const TODO_POLL_MS = 10_000

type GroupTone = 'wait' | 'bad' | 'warn'
interface Group { kind: TodoKind; heading: string; icon: string; tone: GroupTone; hint: string }

const GROUPS: Group[] = [
  { kind: 'lean_approval', heading: 'Lean 审批', icon: 'req', tone: 'wait', hint: '在会话里自己打一行批准' },
  { kind: 'question', heading: '运行机上的问题', icon: 'question', tone: 'wait', hint: '在 MR 上回答' },
  { kind: 'clarify', heading: '本地澄清', icon: 'question', tone: 'wait', hint: '在这里回答' },
  { kind: 'acceptance', heading: '等验收', icon: 'release', tone: 'wait', hint: '在 MR 上验收' },
  { kind: 'child_start', heading: '可以开工的小需求', icon: 'deploy', tone: 'wait', hint: '你认领了，依赖都合进来了' },
  { kind: 'parent_release', heading: '等评审、发布的大需求', icon: 'release', tone: 'wait', hint: '小需求都合并了' },
  { kind: 'handoff_rejected', heading: '接手被拒', icon: 'handover', tone: 'bad', hint: '改好再交接' },
  { kind: 'handoff_unlabelled', heading: '没交出去的交接', icon: 'handover', tone: 'warn', hint: 'MR 上没有交接标签' },
  { kind: 'closed_leftover', heading: '关了的需求还留着分支或 MR', icon: 'settings', tone: 'warn', hint: '用不着就删掉、关掉' },
  { kind: 'crew', heading: 'KiroCrew 的问题', icon: 'settings', tone: 'bad', hint: '修好了才能开工' },
]
const TONE_WORD: Record<GroupTone, string> = { wait: '等你', bad: '被拒或坏了', warn: '看一眼' }

/** The Lean approval's own drawing: the requirements, else the design. */
const approvalIcon = (approval: string | null) => (approval && /DESIGN|PLAN|INCEPTION/i.test(approval) ? 'design' : 'req')

/** Where a requirement waits for the person, in the order it gets there (the empty state shows it). */
const WAITS_FLOW: FlowStep[] = [
  { icon: 'req', title: 'Lean 审批', text: '在会话里自己打一行' },
  { icon: 'question', title: '澄清', text: '本地会话问你，在这里答' },
  { icon: 'handover', title: '交接', text: '被拒或没交出去' },
  { icon: 'question', title: '运行机的问题', text: '在 MR 上回答' },
  { icon: 'release', title: '验收', text: '在 MR 上验收' },
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
  const rootRef = useRef<HTMLElement | null>(null)
  const [holding, setHolding] = useState(false)   // a kit fix runs or waits for the person: its group stays
  // small ones started here: their answers (the session to open) stay after the list no longer has them
  const [started, setStarted] = useState<Record<string, { it: TodoItem; r: ChildStartResult }>>({})
  const idOf = (it: TodoItem) => `${it.repo}/${it.key}`
  const groups = x ? GROUPS.map((g) => {
    const items = x.items.filter((i) => i.kind === g.kind)
    const kept = g.kind === 'child_start' ? Object.values(started).filter((s) => !items.some((i) => idOf(i) === idOf(s.it))).map((s) => s.it) : []
    return { ...g, items, kept }
  }).filter((g) => g.items.length > 0 || g.kept.length > 0 || (g.kind === 'crew' && holding)) : []
  const onStarted = (it: TodoItem, r: ChildStartResult) => {
    setStarted((s) => ({ ...s, [idOf(it)]: { it, r } }))
    after()
  }
  const jump = (kind: TodoKind) => rootRef.current?.querySelector(`[data-testid="todo-${kind}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  return (
    <main className="kt-root br-view td-root" data-testid="br-todo" ref={rootRef}>
      <style>{TD_CSS}</style>
      <style>{FAMILY_CSS}</style>
      <header className="td-top">
        <RoleIcon role="todo" size={26} className="td-top-icon" />
        <div className="br-view-head">
          <h2>待办</h2>
          <p>等你做的事：做完一件，这里就少一件</p>
        </div>
      </header>
      {x?.team && <p className="br-banner" data-testid="todo-team">{TEAM_SENTENCE}</p>}
      <LoadState loading={t.loading} error={t.error} has={!!x} />
      {x && x.items.length === 0 && !holding && Object.keys(started).length === 0 && (
        <EmptyHero
          testid="todo-empty"
          title="现在没有等你做的事"
          text={['需求走到要你动手的地方，就会出现在这里，按种类分好：Lean 的审批、会话问你的澄清、交接被拒、运行机上的问题、验收，还有 KiroCrew 这边要修的；拆成小需求的，能开工的小需求、能发布的大需求也在这里。']}
          punch="这一页空着，就是没有谁在等你。"
          flow={WAITS_FLOW}
        >
          <button type="button" className="br-btn" onClick={() => props.go({ kind: 'overview' })}>
            <RoleIcon role="list" size={16} />看交付总览
          </button>
        </EmptyHero>
      )}
      {x && x.items.length > 0 && (
        <div className="br-kpi td-kpi" data-testid="todo-count">
          <div className="br-kpi-label">等你做的事</div>
          <div className="td-kpi-row">
            <div><span className="br-kpi-big">{x.items.length}</span><span className="br-kpi-of">件</span></div>
            <div className="td-cells" role="img" aria-label={groups.map((g) => `${g.heading} ${g.items.length}`).join('，')}>
              {groups.flatMap((g) => g.items.map((it, i) => <i key={`${g.kind}-${i}`} className={`is-${g.tone}`} title={`${g.heading}：${it.key || it.title}`} />))}
            </div>
          </div>
          <nav className="td-jumps" aria-label="待办的种类">
            {groups.map((g) => (
              <button key={g.kind} type="button" className={`td-jump is-${g.tone}`} onClick={() => jump(g.kind)} title={g.hint}>
                <RoleIcon role={g.icon} size={15} />{g.heading} <b>{g.items.length}</b>
              </button>
            ))}
          </nav>
        </div>
      )}
      {groups.length > 0 && <div className="td-groups">{groups.map((g) => (
        <section key={g.kind} className={`td-group is-${g.tone}`} aria-label={g.heading} data-testid={`todo-${g.kind}`}>
          <header className="td-group-head">
            <span className="td-group-icon"><RoleIcon role={g.icon} size={20} /></span>
            <h3>{g.heading}</h3>
            <span className={`kt-badge td-badge is-${g.tone}`}>{g.items.length}</span>
            <span className="br-dim br-small">{g.hint}</span>
          </header>
          {g.kind === 'crew' && props.status ? (
            <article className="td-item is-bad td-crew" data-kind="crew">
              <CheckRows rows={props.status.crew.rows} only={['FAIL', 'WARN']} fix={props.status.crew.fix} onFixed={after} onHold={setHolding} />
            </article>
          ) : (
            <div className="td-items">
              {[...g.items, ...g.kept].map((it, i) => (
                <Item key={`${idOf(it)}-${i}`} it={it} group={g} now={now} {...props} onAnswered={after}
                  started={started[idOf(it)]?.r ?? null} onStarted={(r) => onStarted(it, r)} />
              ))}
            </div>
          )}
        </section>
      ))}</div>}
    </main>
  )
}

function Item({ it, group, now, go, onAnswered, started, onStarted }: {
  it: TodoItem
  group: Group
  now: number
  onAnswered: () => void
  /** child_start: the start made here, and its report */
  started: ChildStartResult | null
  onStarted: (r: ChildStartResult) => void
} & ViewProps) {
  const navigate = useNavigate()
  const api = useAppApi()
  const start = useAction((b: ChildStartBody) => api.post<ChildStartResult>(paths.childStart(it.repo, it.key), b))
  const icon = it.kind === 'lean_approval' ? approvalIcon(it.approval) : group.icon
  const mrLabel = it.kind === 'acceptance' ? '去 MR 上验收' : it.kind === 'question' ? '去 MR 上回答' : '看 MR'
  const toBoard = () => go({ kind: 'board', repo: it.repo, key: it.key, from: 'todo' })
  const doStart = async () => {
    const r = await start.run({ open_session: true })
    if (r) onStarted(r)
  }
  const canStart = it.kind === 'child_start' && !started?.ok
  return (
    <article className={`td-item is-${group.tone}`} data-testid="todo-item" data-kind={it.kind} aria-label={`${group.heading} ${it.key || it.title}`}>
      <div className="td-item-top">
        <span className="td-item-icon" title={TONE_WORD[group.tone]}><RoleIcon role={icon} size={18} /></span>
        {it.key ? (
          <button type="button" className="br-link br-key" title="看需求详情" onClick={() => go({ kind: 'item', repo: it.repo, key: it.key, from: 'todo' })}>{it.key}</button>
        ) : null}
        <b className="td-title">{it.title}</b>
        <span className="br-grow" />
        {it.approval && <span className="br-chip tone-wait">{it.approval}</span>}
        {it.since !== null && <span className="br-dim br-small">{ago(it.since, now)}</span>}
      </div>
      <p className="td-text">{it.text}</p>
      {it.kind === 'lean_approval' && it.line && <TypeLine line={it.line} sessionUrl={it.session?.url ?? null} />}
      {it.question && (it.kind === 'question' || it.kind === 'clarify' || it.kind === 'acceptance') && (
        <QuestionCard q={it.question} repo={it.repo} reqKey={it.key} mrUrl={it.mr_url ?? it.question.mr_url} onAnswered={onAnswered} />
      )}
      {it.kind === 'child_start' && started && <ChildStartOut r={started} onOpen={navigate} />}
      {start.error && <p className="br-error" role="alert">{start.error}</p>}
      {(it.key || (it.session && it.kind !== 'lean_approval') || (!it.question && it.mr_url)) && (
        <div className="td-acts">
          {canStart && (
            <button type="button" className="br-btn is-small is-primary" disabled={start.busy} onClick={() => void doStart()}
              title="brain start --key：从大需求的分支开它的工作目录，开一个 brain-dev 会话">
              <RoleIcon role="deploy" size={14} />{start.busy ? '正在开工…' : '开工'}
            </button>
          )}
          {!it.question && it.mr_url && (
            <ExtLink href={it.mr_url} className={`br-btn is-small${group.tone === 'wait' ? ' is-primary' : ''}`}>{mrLabel}</ExtLink>
          )}
          {it.session && it.kind !== 'lean_approval' && (
            <button type="button" className="br-btn is-small" onClick={() => navigate(it.session!.url)}>
              <Icon name="MessageSquare" size={13} />打开会话
            </button>
          )}
          <span className="br-grow" />
          {it.key && (
            <button type="button" className={`br-btn is-small${it.kind === 'parent_release' ? ' is-primary' : ''}`}
              title={it.kind === 'parent_release' ? '在大需求的需求看板上评审、发布' : '在需求看板上看它走到哪了'} onClick={toBoard}>
              <RoleIcon role="runner" size={14} />看板
            </button>
          )}
        </div>
      )}
    </article>
  )
}

const TD_CSS = `
.td-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }
.td-top-icon { color: var(--accent); }
.td-root { --td-wait: var(--kt-approve); --td-bad: var(--kt-bad); --td-warn: var(--kt-warn); }
.td-root .is-wait { --td-c: var(--td-wait); --td-b: var(--kit-wait); }
.td-root .is-bad { --td-c: var(--td-bad); --td-b: var(--kit-bad); }
.td-root .is-warn { --td-c: var(--td-warn); --td-b: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }
.td-kpi { gap: .6em; border-color: var(--kit-wait); }
.td-kpi-row { display: flex; align-items: center; gap: .8em 1.6em; flex-wrap: wrap; }
.td-cells { display: flex; flex-wrap: wrap; gap: 4px; flex: 1 1 18em; }
.td-cells i { width: 1.9em; height: 1.9em; border-radius: .5em; border: 2px solid var(--td-c); background: color-mix(in srgb, var(--td-c) 22%, transparent); }
.td-cells i.is-wait { animation: kt-blink 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .td-cells i.is-wait { animation: none; } }
.td-jumps { display: flex; flex-wrap: wrap; gap: .4em; }
.td-jump { appearance: none; font: inherit; font-size: .88em; display: inline-flex; align-items: center; gap: .4em; padding: .25em .8em; border-radius: 999px; cursor: pointer;
  color: var(--text); background: color-mix(in srgb, var(--td-c) 10%, transparent); border: 1px solid color-mix(in srgb, var(--td-c) 45%, transparent); }
.td-jump .kt-role-icon { color: var(--td-c); }
.td-jump b { color: var(--text-strong); }
.td-jump:hover { border-color: var(--td-c); }
.td-groups { columns: 3 30em; column-gap: var(--kit-gap-block, 16px); }
.td-group { display: grid; gap: .7em; break-inside: avoid; margin-bottom: 1.4em; }
.td-group-head { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; }
.td-group-head h3 { font-size: 1.1em; }
.td-group-icon { display: grid; place-items: center; width: 2.1em; height: 2.1em; border-radius: .6em; color: var(--td-c);
  border: 1px solid color-mix(in srgb, var(--td-c) 50%, var(--border)); background: color-mix(in srgb, var(--td-c) 12%, transparent); }
.td-root span.td-badge { --kt-tone: var(--td-c); font-size: .8em; }
.td-items { display: grid; gap: var(--kit-gap-row, 12px); }
.td-item { display: grid; gap: .6em; align-content: start; padding: .9em 1.1em; border-radius: var(--kit-r, 16px); background: var(--card);
  border: 1px solid var(--td-b, var(--border)); box-shadow: inset 3px 0 0 var(--td-c, transparent); }
.td-item-top { display: flex; align-items: center; gap: .4em .6em; flex-wrap: wrap; }
.td-item-icon { display: inline-grid; place-items: center; color: var(--td-c); }
.td-title { color: var(--text-strong); font-weight: 700; }
.td-text { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text); }
.td-acts { display: flex; align-items: center; gap: .5em; flex-wrap: wrap; }
.td-acts a.br-btn { text-decoration: none; }
.td-acts a.br-btn.is-primary { color: var(--accent-fg, #fff); }
`
