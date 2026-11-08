/**
 * 需求详情: one requirement. Header (state, owner, branch, intent, worktree, MR, credits, what it waits on), Lean progress
 * (stages, per-unit chips, approvals; a pending approval's line is shown to be typed in the session by the person),
 * Session notes, decisions (their Brain cites open the Brain view), questions and answers (the answer form only where
 * the person may answer here), the timeline, the sessions this app opened, and what the run used of the Brain.
 * Polls GET /requirements/{repo}/{key} every 5 s.
 */
import { useState } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { POLL_MS, paths, usePoll, useAction } from '../api'
import { ago, fmtCredits, fmtIso, fmtTime, isoDay } from '../format'
import { ENTRY_RE, fileOfEntry, type ItemEntry, type ItemFrom } from '../nav'
import type {
  Decision, OpenSessionBody, OpenSessionResult, Question, RequirementDetail, SessionRow, Stage, TimelineItem, TimelineKind,
} from '../types'
import {
  APPROVAL_META, AnswerForm, ExtLink, Icon, LoadState, MrLink, STAGE_META, StateChip, TypeLine, isOpenQuestion, questionMeta,
} from '../ui'
import type { ViewProps } from './props'

const FROM_LABEL: Record<ItemFrom, string> = { overview: '交付总览', todo: '待办', brain: 'Brain' }

const SOURCE_LABEL: Record<Question['source'], string> = { park: '本地会话', bridge: '运行机', mr: 'MR' }

const BY_LABEL: Record<NonNullable<Decision['by']>, string> = { person: '人', agent: 'agent', check: '检查', bridge: 'bridge' }

const KIND_META: Record<TimelineKind, { icon: string; label: string }> = {
  stage: { icon: 'Layers', label: '阶段' },
  approval: { icon: 'BadgeCheck', label: '审批' },
  human: { icon: 'User', label: '人' },
  commit: { icon: 'GitCommit', label: '提交' },
  handover: { icon: 'Send', label: '交接' },
  question: { icon: 'HelpCircle', label: '问题' },
  decision: { icon: 'Scale', label: '决定' },
  blocked: { icon: 'Ban', label: '拦下' },
  verify: { icon: 'ShieldCheck', label: '验证' },
  merge: { icon: 'GitMerge', label: '合并' },
  session: { icon: 'MessageSquare', label: '会话' },
  app: { icon: 'Box', label: 'app' },
}

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
  const meta = questionMeta(q.state)
  const open = isOpenQuestion(q)
  const formHere = q.answerable_here && !q.lean_request
  const link = mrUrl === undefined ? q.mr_url : mrUrl
  return (
    <article className={`br-q${open ? ' is-open' : ''}`} aria-label={`问题 ${q.id ?? q.kind_label}`} data-testid="question">
      <div className="br-row">
        {q.id && <b className="br-key">{q.id}</b>}
        <span className="br-tag">{SOURCE_LABEL[q.source] ?? q.source}</span>
        <span className="br-chip tone-info">{q.kind_label || q.kind}</span>
        <span className={`br-chip tone-${meta.tone}`}>{meta.label}</span>
        {q.at !== null && <span className="br-dim br-small">{fmtTime(q.at)}</span>}
      </div>
      <p className="br-pre br-strong">{q.question}</p>
      {q.options.length > 0 && !formHere && (
        <ol className="br-opts" aria-label="选项">
          {q.options.map((o) => (
            <li key={o.id}>
              <b className="br-mono">{o.id}</b> {o.text}
              {q.recommend === o.id && <span className="br-chip tone-info" style={{ marginLeft: 6 }}>推荐</span>}
            </li>
          ))}
        </ol>
      )}
      {q.recommend && !q.options.some((o) => o.id === q.recommend) && <p className="br-note">推荐：{q.recommend}</p>}
      {q.lean_request && (
        <p className="br-note">
          这是 Lean 的审批请求（<code>{q.lean_request}</code>）：在会话里自己打批准那一行，这里不能回答。
        </p>
      )}
      {q.answer && (
        <p className="br-pre" style={{ margin: 0 }}>
          回答：<b className="br-strong">{q.answer}</b>
          {q.answerer ? ` · ${q.answerer}` : ''}
          {q.voucher_id && <> · 凭证 <code>{q.voucher_id}</code></>}
        </p>
      )}
      {(link || q.refs.length > 0) && (
        <div className="br-row br-small">
          {link && <ExtLink href={link}>{open && !formHere ? '去 MR 上回答' : '在 MR 上看'}</ExtLink>}
          {q.refs.map((r) => <span key={r} className="br-tag br-mono">{r}</span>)}
        </div>
      )}
      <AnswerForm question={q} repo={repo} reqKey={reqKey} onDone={() => onAnswered?.()} />
    </article>
  )
}

/** The local time of an ISO time (14:05), or "—". */
function clock(iso: string | null): string {
  if (!iso) return '—'
  const t = fmtIso(iso)
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t) ? t.slice(11) : '—'
}

export function DetailView({ entry, onBack, ...props }: { entry: ItemEntry; onBack?: () => void } & ViewProps) {
  const d = usePoll<RequirementDetail>(paths.requirement(entry.repo, entry.key), props.pollMs ?? POLL_MS)
  const [opened, setOpened] = useState<OpenSessionResult | null>(null)
  const from = FROM_LABEL[entry.from ?? 'overview']
  const after = () => {
    d.reload()
    props.reloadStatus()
  }
  const x = d.data
  const live = x ? x.sessions.find((s) => s.kind === 'local' && !s.error) ?? null : null
  const canOpen = !!x && x.row.state === 'local' && !live
  return (
    <div className="br-view" data-testid="br-detail">
      <nav className="br-crumb" aria-label="位置">
        {onBack ? <button type="button" className="br-link" onClick={onBack}>{from}</button> : <span>{from}</span>}
        <span aria-hidden="true">›</span>
        <b>{entry.key}</b>
        <span className="br-grow" />
        {onBack && <button type="button" className="br-btn is-small" onClick={onBack}>← 返回{from}</button>}
      </nav>
      <LoadState loading={d.loading} error={d.error} has={!!x} />
      {x && (
        <>
          <Header x={x} />
          {(canOpen || opened) && <OpenSession repo={entry.repo} reqKey={entry.key} opened={opened} onOpened={(r) => { setOpened(r); after() }} />}
          <div className="br-cards">
            <LeanCard x={x} sessionUrl={live?.url ?? null} />
            <NotesCard x={x} />
          </div>
          <DecisionsCard decisions={x.decisions} repo={entry.repo} go={props.go} />
          <section className="br-card" aria-label="问题和回答">
            <header><h3>问题和回答</h3><span className="br-dim br-small">{x.questions.length} 个</span></header>
            {x.questions.length === 0 ? <p className="br-empty">没有问过人。</p> : (
              <div className="br-stack">
                {x.questions.map((q, i) => <QuestionCard key={`${q.id ?? 'q'}-${i}`} q={q} repo={entry.repo} reqKey={entry.key} onAnswered={after} />)}
              </div>
            )}
          </section>
          <div className="br-cards">
            <TimelineCard t={x.timeline} />
            <div className="br-stack" style={{ gap: 12 }}>
              <SessionsCard sessions={x.sessions} />
              <BrainUseCard b={x.brain} repo={entry.repo} go={props.go} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Header({ x }: { x: RequirementDetail }) {
  const r = x.row
  const run = x.run
  return (
    <section className="br-card br-head" aria-label="需求">
      <div className="br-row">
        <span className="br-key">{r.key}</span>
        <span className="br-title">{r.title}</span>
        <StateChip state={r.state} label={r.state_label} />
      </div>
      <div className="br-stack" style={{ gap: 4 }} data-testid="detail-waits">
        <span>在等：{r.waits.text || '—'}</span>
        {r.waits.line && <code className="br-mono br-strong">{r.waits.line}</code>}
      </div>
      <dl className="br-facts">
        <dt>负责人</dt><dd>{r.owner ?? '—'}</dd>
        <dt>在哪</dt><dd>{x.where_label}</dd>
        <dt>分支</dt><dd>{r.branch ? <code>{r.branch}</code> : '—'}</dd>
        <dt>Lean intent</dt><dd>{r.intent ? <code>{r.intent}</code> : '—'}</dd>
        <dt>工作目录</dt><dd>{r.worktree ? <code>{r.worktree}</code> : '—'}</dd>
        <dt>MR</dt><dd><MrLink mr={r.mr} /></dd>
        <dt>credits</dt><dd>{fmtCredits(x.credits.total)}{x.credits.note && <span className="br-dim br-small">（{x.credits.note}）</span>}</dd>
        {x.claim && <><dt>认领</dt><dd>{x.claim.owner ?? '—'} · {fmtIso(x.claim.created_at)} · 来源 {x.claim.source}{x.claim.closed ? ` · 已关闭：${x.claim.closed}` : ''}</dd></>}
        {run && <><dt>运行</dt><dd>开始于 {fmtIso(run.created_at)}{run.origin ? ` · 来源 ${run.origin}` : ''}{run.brain_commit ? <> · Brain <code>{run.brain_commit}</code></> : ''}</dd></>}
        {run?.handoff && <><dt>交接</dt><dd>{fmtIso(run.handoff.requested_at)}{run.handoff.by ? ` · ${run.handoff.by}` : ''}</dd></>}
        {run && run.materials.length > 0 && <><dt>材料</dt><dd className="br-row">{run.materials.map((m) => <code key={m}>{m}</code>)}</dd></>}
        {r.run_ids.length > 0 && <><dt>运行机</dt><dd className="br-row">{r.run_ids.map((id) => <code key={id}>{id}</code>)}</dd></>}
        {r.expected_paths.length > 0 && <><dt>要改的地方</dt><dd className="br-row">{r.expected_paths.map((p) => <code key={p}>{p}</code>)}</dd></>}
        {r.overlap.length > 0 && <><dt>重叠</dt><dd><span className="br-chip tone-warn">和 {r.overlap.join('、')} 改同一块</span></dd></>}
      </dl>
    </section>
  )
}

function OpenSession({ repo, reqKey, opened, onOpened }: { repo: string; reqKey: string; opened: OpenSessionResult | null; onOpened: (r: OpenSessionResult) => void }) {
  const api = useAppApi()
  const navigate = useNavigate()
  const [trust, setTrust] = useState(true)
  const [kickoff, setKickoff] = useState(true)
  const act = useAction((body: OpenSessionBody) => api.post<OpenSessionResult>(paths.session(repo, reqKey), body))
  const open = async () => {
    const r = await act.run({ trust, kickoff })
    if (r) onOpened(r)
  }
  return (
    <section className="br-card is-wait" aria-label="开会话">
      {opened ? (
        <div className="br-row">
          <span className="br-ok-text">会话开好了。</span>
          <button type="button" className="br-btn is-small" onClick={() => navigate(opened.url)}>
            <Icon name="MessageSquare" size={13} />打开会话
          </button>
        </div>
      ) : (
        <>
          <header><h3>还没有会话</h3><span className="br-note">在这个需求的工作目录里开一个 brain-dev 会话。</span></header>
          <label className="br-check">
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
            <span>这个会话的工具调用不用逐个批准</span>
          </label>
          <label className="br-check">
            <input type="checkbox" checked={kickoff} onChange={(e) => setKickoff(e.target.checked)} />
            <span>开好后先发一句开场，让它接着做</span>
          </label>
          <div className="br-row">
            <button type="button" className="br-btn is-primary" disabled={act.busy} onClick={() => void open()}>{act.busy ? '正在开…' : '开会话'}</button>
          </div>
        </>
      )}
      {act.error && <p className="br-error" role="alert">{act.error}</p>}
    </section>
  )
}

function LeanCard({ x, sessionUrl }: { x: RequirementDetail; sessionUrl: string | null }) {
  const { stages, approvals } = x.lean
  return (
    <section className="br-card" aria-label="Lean 进度">
      <header>
        <h3>Lean 进度</h3>
        <span className="br-dim br-small">做完或跳过 {x.row.lean.done}/{x.row.lean.total}</span>
      </header>
      <ol className="br-stages">
        {stages.map((s) => <StageRow key={s.id} s={s} />)}
      </ol>
      <h3>审批</h3>
      {approvals.length === 0 ? <p className="br-empty">还没有审批。</p> : (
        <ul className="br-plain" aria-label="审批">
          {approvals.map((a, i) => {
            const m = APPROVAL_META[a.state] ?? { label: a.state, tone: 'idle' }
            return (
              <li key={`${a.kind}-${a.sha8 ?? i}`} className="br-stack" style={{ gap: 4 }} data-testid="approval" data-state={a.state}>
                <div className="br-row">
                  <b className="br-mono">{a.kind}</b>
                  <span className={`br-chip tone-${m.tone}`}>{m.label}</span>
                  {a.sha8 && <code className="br-dim">{a.sha8}</code>}
                  {a.at !== null && <span className="br-dim br-small">{fmtTime(a.at)}</span>}
                </div>
                {a.path && <code className="br-dim br-small">{a.path}</code>}
                {a.state === 'pending' && a.line && <TypeLine line={a.line} sessionUrl={sessionUrl} />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function StageRow({ s }: { s: Stage }) {
  const m = STAGE_META[s.state] ?? STAGE_META.todo
  return (
    <li className={`is-${s.state}`} data-testid="stage" data-state={s.state}>
      <span className="br-mono br-dim">{s.n}</span>
      <span className={`br-glyph tone-${m.tone}`} title={m.label} aria-hidden="true">{m.glyph}</span>
      <span>
        {s.label} <span className="br-sr">（{m.label}）</span>
        {s.units.length > 0 && (
          <span className="br-units">
            {s.units.map((u) => {
              const um = STAGE_META[u.state] ?? STAGE_META.todo
              return <span key={u.unit} className={`br-chip tone-${um.tone}`} title={um.label}>{u.unit} · {um.label}</span>
            })}
          </span>
        )}
        {s.note && <span className="br-dim br-small"> · {s.note}</span>}
      </span>
    </li>
  )
}

function NotesCard({ x }: { x: RequirementDetail }) {
  const { status, next, open_questions } = x.lean
  return (
    <section className="br-card" aria-label="会话记录">
      <header><h3>会话记录</h3><span className="br-dim br-small">aidlc-state.md 的 Session notes</span></header>
      {status ? <p className="br-pre">{status}</p> : <p className="br-empty">还没有写。</p>}
      {next.length > 0 && (
        <div>
          <b className="br-strong">下一步</b>
          <ul className="br-list">{next.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      {open_questions.length > 0 && (
        <div>
          <b className="br-strong">没解决的问题</b>
          <ul className="br-list">{open_questions.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </section>
  )
}

function DecisionsCard({ decisions, repo, go }: { decisions: Decision[]; repo: string; go: ViewProps['go'] }) {
  return (
    <section className="br-card" aria-label="决定">
      <header><h3>决定</h3><span className="br-dim br-small">decisions.md · {decisions.length} 条</span></header>
      {decisions.length === 0 ? <p className="br-empty">还没有记下决定。</p> : (
        <div className="br-scroll">
          <table className="br-table">
            <thead>
              <tr><th>ID</th><th>日期</th><th>阶段</th><th>决定</th><th>为什么</th><th>谁定的</th><th>引用 Brain</th><th>凭证</th></tr>
            </thead>
            <tbody>
              {decisions.map((dd) => (
                <tr key={dd.id}>
                  <td className="br-key" title={dd.src}>{dd.id}</td>
                  <td className="br-dim">{dd.date ?? '—'}</td>
                  <td className="br-dim">{dd.stage ?? '—'}</td>
                  <td className="br-pre">{dd.text}</td>
                  <td className="br-pre br-dim">{dd.why ?? '—'}</td>
                  <td>{[dd.who, dd.by ? BY_LABEL[dd.by] : null].filter(Boolean).join(' · ') || '—'}</td>
                  <td><span className="br-row" style={{ gap: 4 }}>{dd.cites.length ? dd.cites.map((c) => <EntryChip key={c} id={c} repo={repo} go={go} />) : <span className="br-dim">—</span>}</span></td>
                  <td>{dd.vouchers.length ? dd.vouchers.map((v) => <code key={v}>{v} </code>) : <span className="br-dim">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TimelineCard({ t }: { t: RequirementDetail['timeline'] }) {
  const days = new Map<string, TimelineItem[]>()
  for (const it of t.items) {
    const day = isoDay(it.at) ?? '没有时间'
    days.set(day, [...(days.get(day) ?? []), it])
  }
  return (
    <section className="br-card" aria-label="时间线">
      <header>
        <h3>时间线</h3>
        <span className="br-dim br-small">{t.source === 'trace' ? '来自 brain-kit trace' : 'app 自己拼的（brain-kit 没有 trace）'}</span>
      </header>
      {t.error && <p className="br-error" role="alert">{t.error}</p>}
      {t.items.length === 0 ? <p className="br-empty">还没有记录。</p> : [...days.entries()].map(([day, items]) => (
        <div key={day}>
          <p className="br-day">{day}</p>
          <ol className="br-tl">
            {items.map((it, i) => {
              const k = KIND_META[it.kind] ?? { icon: 'Dot', label: it.kind }
              return (
                <li key={i} data-testid="tl-item" data-kind={it.kind}>
                  <time>{clock(it.at)}</time>
                  <span title={k.label}><Icon name={k.icon} size={15} /><span className="br-sr">{k.label}</span></span>
                  <span>
                    <span className="br-strong">{it.label}</span>
                    {it.detail && <span className="br-dim"> · {it.detail}</span>}
                    {it.who && <span className="br-dim br-small"> · {it.who}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
      {t.missing.length > 0 && <p className="br-note br-small">这些来源没读到：{t.missing.join('、')}</p>}
    </section>
  )
}

function sessionState(s: SessionRow): { label: string; tone: string } {
  if (s.error) return { label: '出错', tone: 'bad' }
  if (s.awaiting) return { label: '等批准', tone: 'wait' }
  if (s.busy) return { label: '在忙', tone: 'run' }
  return { label: '空闲', tone: 'idle' }
}

function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const navigate = useNavigate()
  const now = Date.now() / 1000
  return (
    <section className="br-card" aria-label="会话">
      <header><h3>会话</h3><span className="br-dim br-small">这个 app 开的</span></header>
      {sessions.length === 0 ? <p className="br-empty">还没有会话。</p> : (
        <ul className="br-plain">
          {sessions.map((s) => {
            const st = sessionState(s)
            return (
              <li key={s.slot} className="br-item" data-testid="session">
                <div className="br-row">
                  <b className="br-strong">{s.title}</b>
                  <span className={`br-chip tone-${st.tone}`}>{st.label}</span>
                  <span className="br-tag">{s.kind === 'local' ? '本机' : '运行机'}</span>
                  <span className="br-grow" />
                  <button type="button" className="br-btn is-small" onClick={() => navigate(s.url)}>
                    <Icon name="MessageSquare" size={13} />打开会话
                  </button>
                </div>
                <div className="br-row br-small br-dim">
                  <code>{s.agent}</code>
                  <span>credits {fmtCredits(s.credits)}</span>
                  <span>{s.turns} 轮</span>
                  <span>最近 {ago(s.last_activity, now)}</span>
                </div>
                {s.error && <p className="br-error br-small">{s.error}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function BrainUseCard({ b, repo, go }: { b: RequirementDetail['brain']; repo: string; go: ViewProps['go'] }) {
  return (
    <section className="br-card" aria-label="用到的 Brain">
      <header><h3>用到的 Brain</h3></header>
      <p style={{ margin: 0 }}>
        加载了 <b className="br-strong">{b.loaded ?? '—'}</b> 条
        {b.proposals !== null && <> · 提了 <b className="br-strong">{b.proposals}</b> 条新知识</>}
      </p>
      <div className="br-row" aria-label="引用">
        <span className="br-dim br-small">引用</span>
        {b.cited.length ? b.cited.map((c) => <EntryChip key={c} id={c} repo={repo} go={go} />) : <span className="br-dim">—</span>}
      </div>
      {b.stale.length > 0 && (
        <div className="br-row" aria-label="过时">
          <span className="br-warn-text br-small">标成过时</span>
          {b.stale.map((c) => <EntryChip key={c} id={c} repo={repo} go={go} />)}
        </div>
      )}
      {b.unknown.length > 0 && (
        <div className="br-row" aria-label="不认识">
          <span className="br-bad-text br-small">Brain 里没有</span>
          {b.unknown.map((c) => <span key={c} className="br-tag br-mono">{c}</span>)}
        </div>
      )}
    </section>
  )
}
