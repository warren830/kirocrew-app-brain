/**
 * 待办: what waits on the person, in the sample board's look: the count as a counter card (one cell per item, coloured
 * by what it is, each kind a jump to its group), then a section per kind with its line icon and count, each item a
 * card whose border says its state (magenta: it waits for you; red: refused or stuck; yellow: worth a look) with the
 * step to take right there, under the one name the app gives it (vocab.ts). The list is the backend's one judgment of
 * who a requirement waits on (`waits.who`), so it holds what the rows, the tab's count and the sidebar badge say:
 *
 *   reply               the local session is idle: your turn to talk               打开会话
 *   review              (a reply) Lean's review, in a new session                  开审查会话
 *   lean_approval       Lean asks for an approval: the line to type in the session  复制那一行 · 打开会话
 *   clarify             the local session asks you: answered here
 *   question            a question on the MR (the team runner's)                    去 MR 上回答
 *   acceptance          the product accepts on the MR                               去 MR 上验收
 *   start               claimed by you, not started                                 去开工 (开需求 with its key)
 *   write_back          merged, its new knowledge not written back yet               回写 Brain (Brain's 回写, on it)
 *   handoff_rejected    the hand-over was refused: why, and what to say to the AI   打开会话 · 看 MR
 *   handoff_unlabelled  pushed, but the MR has no hand-over label                   补上交接标签 · 看 MR
 *   stuck               a run on the runner that no answer can move any more        看 MR
 *   crew                KiroCrew's failing checks, with their fix buttons
 *
 * A key opens 需求详情, 需求看板 opens the board. Polls GET /todo every 10 s; the tab's count and the sidebar badge come
 * from /status (the app shell), read again when they disagree with this list.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@kirocrew/app-sdk'
import { paths, usePoll } from '../api'
import { fmtWaited } from '../format'
import type { Todo, TodoItem } from '../types'
import { CheckRows, EmptyHero, ExtLink, Icon, LoadState, RoleIcon, TypeLine, type FlowStep } from '../ui'
import { ACT, DO_NAME, REVIEW_WAIT, approvalName } from '../vocab'
import { QuestionCard, ReviewButton } from './Question'
import type { ViewProps } from './props'

export const TODO_POLL_MS = 10_000

type GroupTone = 'wait' | 'bad' | 'warn'
/** what an item is on this page: its kind, except a runner question no answer can move any more */
type GroupKey = TodoItem['kind'] | 'stuck' | 'write_back' | 'review'
interface Group { key: GroupKey; heading: string; icon: string; tone: GroupTone; hint: string }

const GROUPS: Group[] = [
  { key: 'reply', heading: '会话在等你回话', icon: 'laptop', tone: 'wait', hint: '本机会话空着：轮到你说' },
  { key: 'review', heading: REVIEW_WAIT, icon: 'reviewer', tone: 'wait', hint: '写代码的会话不能自己审：开一个新会话审查' },
  { key: 'lean_approval', heading: 'Lean 审批', icon: 'req', tone: 'wait', hint: '读完在会话里自己打一行批准' },
  { key: 'clarify', heading: '本地澄清', icon: 'question', tone: 'wait', hint: '在这里回答' },
  { key: 'question', heading: '运行机上的问题', icon: 'question', tone: 'wait', hint: '在 MR 上回答' },
  { key: 'acceptance', heading: '等验收', icon: 'release', tone: 'wait', hint: '在 MR 上验收' },
  { key: 'start', heading: '认领了还没开工', icon: 'new', tone: 'wait', hint: '去开需求开工' },
  { key: 'write_back', heading: '等回写 Brain', icon: 'brain', tone: 'wait', hint: '合并了：把学到的写回 Brain' },
  { key: 'handoff_rejected', heading: '接手被拒', icon: 'handover', tone: 'bad', hint: '改好再交接' },
  { key: 'handoff_unlabelled', heading: '没交出去的交接', icon: 'handover', tone: 'warn', hint: 'MR 上没有交接标签' },
  { key: 'stuck', heading: '卡住了的运行', icon: 'blocked', tone: 'bad', hint: '这一步答不了了：找负责人' },
  { key: 'crew', heading: 'KiroCrew 的问题', icon: 'settings', tone: 'bad', hint: '修好了才能开工' },
]
const TONE_WORD: Record<GroupTone, string> = { wait: '等你', bad: '被拒或卡住', warn: '看一眼' }

/** A runner question without its question (team mode): the run is left waiting for good (refused, void, not asked);
 * a reply that is Lean's review: a new session's. */
const groupOf = (it: TodoItem): GroupKey => (it.kind === 'question' && !it.question ? 'stuck' : it.kind === 'reply' && it.review ? 'review' : it.kind)

/** The Lean approval's own drawing: the requirements, else the design. */
const approvalIcon = (approval: string | null) => (approval && /DESIGN|PLAN|INCEPTION/i.test(approval) ? 'design' : 'req')

/** Where a requirement waits for the person, in the order it gets there (the empty state shows it). */
const WAITS_FLOW: FlowStep[] = [
  { icon: 'laptop', title: '会话等你', text: '本机会话空着，轮到你说' },
  { icon: 'req', title: 'Lean 审批', text: '在会话里自己打一行' },
  { icon: 'question', title: '澄清', text: '本地会话问你，在这里答' },
  { icon: 'new', title: '开工', text: '认领了还没开工' },
  { icon: 'handover', title: '交接', text: '被拒或没交出去' },
  { icon: 'release', title: 'MR 上', text: '运行机的问题、验收' },
]

export const TEAM_SENTENCE = '运行机的面板不收这些回答：在 GitLab 的 MR 上回答，那里认得出是谁。'

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
  const groups = x ? GROUPS.map((g) => ({ ...g, items: x.items.filter((i) => groupOf(i) === g.key) }))
    .filter((g) => g.items.length > 0 || (g.key === 'crew' && holding)) : []
  const jump = (key: GroupKey) => rootRef.current?.querySelector(`[data-testid="todo-${key}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  // the tab's count and the sidebar badge are /status's count of this very list: read it again when they differ
  const listed = x?.items.length
  const counted = props.status?.counts.todo
  useEffect(() => {
    if (listed !== undefined && counted !== undefined && listed !== counted) props.reloadStatus()
  }, [listed, counted]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="kt-root br-view td-root" data-testid="br-todo" ref={rootRef}>
      <style>{TD_CSS}</style>
      <header className="td-top">
        <RoleIcon role="todo" size={26} className="td-top-icon" />
        <div className="br-view-head">
          <h2>待办</h2>
          <p>等你做的事：做完一件，这里就少一件</p>
        </div>
      </header>
      <LoadState loading={t.loading} error={t.error} has={!!x} />
      {x && x.items.length === 0 && !holding && (
        <EmptyHero
          testid="todo-empty"
          title="现在没有等你做的事"
          text={['需求走到要你动手的地方，就会出现在这里，按种类分好：会话等你回话、等你开会话审查、Lean 的审批、会话问你的澄清、认领了还没开工、交接被拒、MR 上的问题和验收，还有 KiroCrew 这边要修的。']}
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
              {groups.flatMap((g) => g.items.map((it, i) => <i key={`${g.key}-${i}`} className={`is-${g.tone}`} title={`${g.heading}：${it.key || it.title}`} />))}
            </div>
          </div>
          <nav className="td-jumps" aria-label="待办的种类">
            {groups.map((g) => (
              <button key={g.key} type="button" className={`td-jump is-${g.tone}`} onClick={() => jump(g.key)} title={g.hint}>
                <RoleIcon role={g.icon} size={15} />{g.heading} <b>{g.items.length}</b>
              </button>
            ))}
          </nav>
        </div>
      )}
      {groups.length > 0 && <div className="td-groups">{groups.map((g) => (
        <section key={g.key} className={`td-group is-${g.tone}`} aria-label={g.heading} data-testid={`todo-${g.key}`}>
          <header className="td-group-head">
            <span className="td-group-icon"><RoleIcon role={g.icon} size={20} /></span>
            <h3>{g.heading}</h3>
            <span className={`kt-badge td-badge is-${g.tone}`}>{g.items.length}</span>
            <span className="br-dim br-small">{g.hint}</span>
          </header>
          {x?.team && g.key === 'question' && <p className="br-note" data-testid="todo-team">{TEAM_SENTENCE}</p>}
          {g.key === 'crew' && props.status ? (
            <article className="td-item is-bad td-crew" data-kind="crew">
              <CheckRows rows={props.status.crew.rows} only={['FAIL']} fix={props.status.crew.fix} onFixed={after} onHold={setHolding} />
            </article>
          ) : (
            <div className="td-items">
              {g.items.map((it, i) => <Item key={`${it.key}-${i}`} it={it} group={g} now={now} {...props} onAnswered={after} />)}
            </div>
          )}
        </section>
      ))}</div>}
    </main>
  )
}

/** What a refused hand-over asks the person to say to the AI in their session (they type it themselves). */
const redoLine = (why: string) => `交接被拒了：${why.replace(/^(接手被拒|交接被拒)[：:]\s*/, '')}。请按这个原因改好，再交接一次。`

function Item({ it, group, now, go, onAnswered }: { it: TodoItem; group: Group; now: number; onAnswered: () => void } & ViewProps) {
  const navigate = useNavigate()
  const icon = it.kind === 'lean_approval' ? approvalIcon(it.approval) : group.icon
  const session = it.session?.url ?? null
  const line = it.kind === 'handoff_rejected' && session ? redoLine(it.text) : it.line
  const asked = it.question && (it.kind === 'question' || it.kind === 'clarify' || it.kind === 'acceptance')
  const mr = it.mr_url ?? it.question?.mr_url ?? null
  const mrAct = group.key === 'question' ? ACT.answerOnMr : group.key === 'acceptance' ? ACT.acceptOnMr
    : group.key === 'handoff_unlabelled' ? DO_NAME.label_handoff : ACT.viewMr
  const mrFirst = group.key === 'question' || group.key === 'acceptance' || group.key === 'handoff_unlabelled' || group.key === 'stuck'
  return (
    <article className={`td-item is-${group.tone}`} data-testid="todo-item" data-kind={it.kind} aria-label={`${group.heading} ${it.key || it.title}`}>
      <div className="td-item-top">
        <span className="td-item-icon" title={TONE_WORD[group.tone]}><RoleIcon role={icon} size={18} /></span>
        {it.key ? (
          <button type="button" className="br-link br-key" title={`打开${ACT.openDetail}`} onClick={() => go({ kind: 'item', repo: it.repo, key: it.key, from: 'todo' })}>{it.key}</button>
        ) : null}
        <b className="td-title">{it.title}</b>
        <span className="br-grow" />
        {it.approval && <span className="br-chip tone-wait">{approvalName(it.approval)}</span>}
        {it.since !== null && <span className="br-dim br-small" title="从它这样等着你的那一刻算起">已等 {fmtWaited(now - it.since)}</span>}
      </div>
      {it.text && <p className="td-text">{it.text}</p>}
      {group.key === 'stuck' && <p className="td-do"><b>做什么</b>找这个需求的负责人，在 MR 上决定重开还是关掉它。</p>}
      {/* a Lean approval's text is its waits.text, which says the person types the line (deliveries.lean_wait_text) */}
      {line && (it.kind === 'lean_approval' || it.kind === 'reply' || it.kind === 'handoff_rejected') && <TypeLine line={line} sessionUrl={session} said={it.kind === 'lean_approval'} />}
      {asked && <QuestionCard q={it.question!} repo={it.repo} reqKey={it.key} mrUrl={null} onAnswered={onAnswered} />}
      <div className="td-acts">
        {it.kind === 'start' && it.key && (
          <button type="button" className="br-btn is-small is-primary" onClick={() => go({ kind: 'new', repo: it.repo, key: it.key, title: it.title })}>
            <RoleIcon role="new" size={14} />{DO_NAME.start}
          </button>
        )}
        {group.key === 'write_back' && it.key && (
          <button type="button" className="br-btn is-small is-primary" onClick={() => go({ kind: 'brain', repo: it.repo, reflect: it.key })}>
            <RoleIcon role="brain" size={14} />{DO_NAME.write_back}
          </button>
        )}
        {mr && mrFirst && <ExtLink href={mr} className={`br-btn is-small${group.tone !== 'bad' || group.key === 'stuck' ? ' is-primary' : ''}`}>{mrAct}</ExtLink>}
        {group.key === 'review' && it.key && <ReviewButton repo={it.repo} reqKey={it.key} liveSlot={it.session?.slot ?? null} worktree={null} />}
        {session && !line && it.kind !== 'start' && group.key !== 'review' && (
          <button type="button" className={`br-btn is-small${it.kind === 'reply' ? ' is-primary' : ''}`} onClick={() => navigate(session)}>
            <Icon name="MessageSquare" size={13} />{ACT.openSession}
          </button>
        )}
        {mr && !mrFirst && <ExtLink href={mr} className="br-btn is-small">{ACT.viewMr}</ExtLink>}
        <span className="br-grow" />
        {it.key && (
          <button type="button" className="br-btn is-small" title="在需求看板上看它走到哪了" onClick={() => go({ kind: 'board', repo: it.repo, key: it.key, from: 'todo' })}>
            <Icon name="LayoutDashboard" size={13} />{ACT.openBoard}
          </button>
        )}
      </div>
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
@container br-app (max-width: 1100px) { .td-groups { columns: 2 22em; } }
@container br-app (max-width: 720px) { .td-groups { columns: 1; } }
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
.td-do { margin: 0; font-size: .93em; color: var(--text); }
.td-do b { color: var(--muted); font-weight: 650; margin-right: .5em; }
.td-acts { display: flex; align-items: center; gap: .5em; flex-wrap: wrap; }
.td-acts a.br-btn { text-decoration: none; }
.td-acts .kt-btn { padding: 4px 10px; font-size: .84em; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; }
.td-acts .br-note, .td-acts .br-error { flex-basis: 100%; margin: 0; }
.td-acts a.br-btn.is-primary { color: var(--accent-fg, #fff); }
`
