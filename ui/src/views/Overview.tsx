/**
 * 交付总览: the sample's CTO 视图 for brain-kit — one sentence and three numbers (how many requirements handed to the
 * runner ran unattended end to end, how many times a person stepped in at the judgment points and outside them,
 * credits per requirement) and who settled the decisions, each with its small SVG chart (cto/charts.tsx); the weekly
 * merges; 需求流动 (cto/Flow.tsx: the kanban of what is in progress); the 交付清单 (every requirement, the eval batch's
 * summary rows first). Every card and row opens the requirement's board (需求看板). Polls GET /overview (Overview.cto
 * has the numbers, from brainkit.evaluate). The repo pills and the ledger's filters are in the URL.
 *
 * Without any repo it is one big way in: 导入仓库. A repo whose brain-kit is on its way (the install branch) is said
 * above the cards.
 */
import { useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { POLL_MS, paths, useAction, usePoll } from '../api'
import { RoleIcon } from '../board/RoleIcon'
import { HOW_LABEL, HOW_VAR, MiniCredits, MiniPeople, MiniUnattended, MiniWho, WHO_VAR, WeeklyChart, fmt } from '../cto/charts'
import { Flow } from '../cto/Flow'
import { ago, fmtCredits } from '../format'
import type { OverviewEntry } from '../nav'
import type { CtoRun, EvalView, Funnel, Overview, RefreshResult, ReqState, Requirement } from '../types'
import { STATE_LABEL } from '../types'
import { EmptyHero, Icon, ImportCta, LeanCell, LoadState, MrLink, PendingRepo, STATE_TONE, StateChip } from '../ui'
import type { ViewProps } from './props'

const STATES = Object.keys(STATE_LABEL) as ReqState[]
export const WHO_VOCAB = 'Who 要写 agent、brain <条目号>、check、<化名> <凭证号> 或 owner'

export const OV_CSS = `
.br-ov .cto-hero h2 { font-size: 30px; }
.br-ov .cto-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1180px) { .br-ov .cto-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.br-ov .cto-value .cto-of { font-size: .5em; margin-left: 6px; }
.br-ov .cto-foot .br-link { font-size: 13px; }
.br-ov .br-kanban { grid-template-columns: 116px repeat(6, minmax(0, 1fr)); }
.br-ov .br-merged-cell { grid-row: span 4; }
.br-ov .cto-lane { justify-content: flex-start; padding: 8px 10px; white-space: normal; text-align: left; }
.br-ov .br-lane-name { display: inline-flex; align-items: center; gap: 6px; }
.br-ov .cto-lane.is-wait .kt-role-icon { color: var(--kt-approve); }
.br-ov .br-kwait { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; }
.br-ov .cto-kcard.is-live.is-wait .br-kwait { color: var(--kt-approve); font-weight: 650; }
.br-ov .cto-kcard .cto-gate { display: inline-flex; align-items: center; gap: 4px; }
.br-ov .br-ledger td .br-hint { margin-top: 2px; }
.br-ov .br-batch td { background: color-mix(in srgb, var(--accent) 7%, transparent); border-bottom: 1px solid var(--border); }
.br-ov .br-batch .br-batch-chips { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
.br-ov .br-batch-chip { display: inline-flex; align-items: baseline; gap: 5px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); font-size: 13px; }
.br-ov .br-batch-chip b { color: var(--text-strong); font-variant-numeric: tabular-nums; }
.br-ov .br-batch-row td:first-child { white-space: nowrap; }
.br-ov .br-how { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }
.br-ov .br-how i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.br-ov .br-acts { display: flex; gap: 6px; align-items: center; white-space: nowrap; }
.br-ov .br-overlap { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.br-ov .br-funnel-rows { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 13px; }
.br-ov .br-funnel-rows span { display: inline-flex; align-items: center; gap: 6px; }
.br-ov .br-funnel-rows b { color: var(--text-strong); font-variant-numeric: tabular-nums; }
.br-ov .cto-notes li { line-height: 1.6; }
.br-ov .cto-table tr.cto-row-pick.is-merged td { color: var(--text); }
`

export function OverviewView({ entry, status, go, replace, reloadStatus, pollMs }: { entry: OverviewEntry } & ViewProps) {
  const [repo, setRepo] = useState(entry.repo ?? 'all')
  const [state, setState] = useState<ReqState | undefined>(entry.state)
  const [limit, setLimit] = useState(14)
  const repos = status?.repos ?? []
  const noRepos = !!status && repos.length === 0
  const ov = usePoll<Overview>(noRepos ? null : paths.overview(repo), pollMs ?? POLL_MS)
  const data = ov.data
  const pick = (r: string, s: ReqState | undefined) => {
    setRepo(r)
    setState(s)
    setLimit(14)
    replace({ kind: 'overview', ...(r !== 'all' ? { repo: r } : {}), ...(s ? { state: s } : {}) })
  }
  const rows = useMemo(() => (data ? sortRows(data.rows.filter((r) => !state || r.state === state)) : []), [data, state])
  const toBoard = (r: { repo: string; key: string }, replay = false) => go({ kind: 'board', repo: r.repo, key: r.key, ...(replay ? { replay: true } : {}), from: 'overview' })
  const toItem = (r: { repo: string; key: string }) => go({ kind: 'item', repo: r.repo, key: r.key, from: 'overview' })
  const repoOfKey = (key: string) => data?.rows.find((r) => r.key === key)?.repo ?? (repo !== 'all' ? repo : repos.find((x) => x.ok)?.id)
  const openKey = (key: string) => {
    const r = repoOfKey(key)
    if (r) toBoard({ repo: r, key })
  }
  const repoName = (id: string) => repos.find((x) => x.id === id)?.name
  const scope = repo === 'all' ? repos.filter((r) => r.ok) : repos.filter((r) => r.id === repo)

  if (noRepos) {
    return (
      <main className="kt-root br-view cto-root br-ov" data-testid="overview">
        <ImportCta onImport={() => go({ kind: 'import' })} />
      </main>
    )
  }
  const c = data?.cto
  const runsBy = new Map((c?.runs ?? []).map((r) => [`${r.repo}/${r.key}`, r]))
  const credits = (data?.rows ?? []).filter((r) => r.credits !== null && r.credits > 0).map((r) => ({ key: r.key, credits: r.credits as number }))
  return (
    <main className="kt-root br-view cto-root br-ov" data-testid="overview">
      <style>{OV_CSS}</style>
      <header className="cto-top">
        <span className="cto-tag is-real" title="数字来自 brain-kit 的 evaluate 和这个 app 开的会话">实测 · brain-kit</span>
        <span className="cto-org">{scope.length} 个仓库 · {data ? `${data.rows.length} 个需求` : '…'}{c?.ref ? ` · 读的是 ${c.ref}` : ''}</span>
        <span className="cto-grow" />
        {scope.map((r) => <RefreshButton key={r.id} repo={r.id} name={scope.length > 1 ? r.name : ''} onDone={ov.reload} />)}
      </header>
      {repos.filter((r) => r.pending && (repo === 'all' || r.id === repo)).map((r) => (
        <PendingRepo key={r.id} repo={r} banner onOpen={() => go({ kind: 'import', path: r.path })} onDone={reloadStatus} />
      ))}
      <LoadState loading={ov.loading} error={ov.error} has={!!data} />
      {data?.errors.map((e) => (
        <div key={e.repo} className="br-banner" role="status">{repoName(e.repo) ?? e.repo}：{e.error}</div>
      ))}

      {data && c && (
        <>
          <section className="cto-hero" data-testid="ov-hero">
            <h2>{c.sentence}</h2>
            <p>
              {c.available ? `数字来自 brain-kit evaluate${c.ref ? `（${c.ref}）` : ''}：只算交接过、评估过的需求` : 'brain-kit 的 evaluate 还没给出数字：先看 credits 和合并'}
              {' · '}credits 来自这个 app 开的会话 · 口径见末尾
            </p>
          </section>

          {repos.length > 1 && (
            <nav className="cto-lines" aria-label="仓库">
              {[{ id: 'all', name: '全部' }, ...repos].map((r) => (
                <button type="button" key={r.id} aria-pressed={repo === r.id} disabled={'ok' in r && !r.ok} onClick={() => pick(r.id, state)}>
                  <b>{r.name}</b>
                  {'ok' in r && !r.ok ? <span>{r.pending ? r.pending.word || '在分支上' : '读不到'}</span> : null}
                </button>
              ))}
            </nav>
          )}

          <section className="cto-cards" data-testid="ov-cards">
            <article className={`cto-card${c.unattended && c.unattended[1] && c.unattended[0] === c.unattended[1] ? ' is-ok' : ''}`} aria-label="无人值守" data-anchor="unattended">
              <div className="cto-eyebrow">无人值守</div>
              <div className="cto-value" data-testid="ov-unattended">
                {c.unattended ? <>{c.unattended[0]}<span className="cto-of">/{c.unattended[1]}</span></> : '—'}
              </div>
              <div className="cto-desc">交给运行机的需求里，交接以后没人插手就做完的</div>
              <MiniUnattended c={c} />
              <div className="cto-legend">
                {(['unattended', 'people', 'pending', 'local'] as CtoRun['how'][]).map((h) => (
                  <span key={h}><i className="cto-sw" style={{ background: HOW_VAR[h] }} />{HOW_LABEL[h]}<b className="br-strong">{c.runs.filter((r) => r.how === h).length}</b></span>
                ))}
              </div>
            </article>
            <article className={`cto-card${c.stepped_in && c.stepped_in.outside ? ' is-wait' : ''}`} aria-label="人介入" data-anchor="people">
              <div className="cto-eyebrow">人介入</div>
              <div className="cto-value" data-testid="ov-people">
                {c.stepped_in ? <>{c.stepped_in.at_points + c.stepped_in.outside}<span className="cto-of">次</span></> : '—'}
              </div>
              <div className="cto-desc">{c.stepped_in ? `${c.stepped_in.at_points} 次落在判断点上（批准、驳回、回答），${c.stepped_in.outside} 次在判断点之外` : '评估以后才有'}</div>
              <MiniPeople c={c} />
              {c.stepped_in && c.stepped_in.outside > 0 && (
                <div className="cto-foot"><span>判断点之外：{c.stepped_in.kinds.filter((k) => !k.point).map((k) => `${k.label} ${k.n}`).join('、')}</span></div>
              )}
            </article>
            <article className="cto-card" aria-label="每个需求的 credits" data-anchor="credits">
              <div className="cto-eyebrow">每个需求的 credits</div>
              <div className="cto-value" data-testid="ov-credits">{c.credits.per_req !== null ? fmtCredits(c.credits.per_req) : '—'}</div>
              <div className="cto-desc">{c.credits.reqs ? `${c.credits.reqs} 个需求合计 ${fmtCredits(c.credits.total)} credits` : '这个 app 开的会话还没报 credits'}</div>
              {credits.length > 0 && <MiniCredits rows={credits} avg={c.credits.per_req} onKey={openKey} />}
              <div className="cto-foot"><span>KiroCrew 只报 credits，不报 token</span></div>
            </article>
            <FunnelCard f={data.funnel} onKey={openKey} />
          </section>

          <WeeklyChart weeks={c.weekly} onWeek={() => { pick(repo, 'merged') }} />
        </>
      )}

      {data && data.overlaps.length > 0 && (
        <section className="cto-card is-wait br-overlaps" aria-label="改同一处的需求" data-testid="overlaps">
          <div className="cto-chart-head"><h3>这些需求要改同一处</h3><span className="cto-dim">先商量好谁先合，免得冲突</span></div>
          {data.overlaps.map((o, i) => (
            <div key={i} className="br-overlap">
              {o.keys.map((k, j) => (
                <span key={k} className="br-row" style={{ gap: 4 }}>
                  {j > 0 && <span className="br-dim">和</span>}
                  <button type="button" className="br-link br-key" onClick={() => openKey(k)}>{k}</button>
                </span>
              ))}
              <span className="br-dim">都要改</span>
              {o.paths.map((p) => <code key={p} className="br-tag">{p}</code>)}
            </div>
          ))}
        </section>
      )}

      {data && data.rows.length === 0 && (
        <EmptyHero title="还没有需求" text={['认领一个需求，交它的文档过五关，开工：它会在这里一路走到合并——在哪一步、等谁、花了多少。']}
          punch="人只在判断点上出手：批准、回答、验收。"
          flow={[{ icon: 'new', title: '开需求', text: '认领，文档过五关' }, { icon: 'laptop', title: '本机开发', text: 'brain-dev 带着 Lean' }, { icon: 'handover', title: '交给运行机', text: '无人值守地做' }, { icon: 'release', title: '验收', text: '产品在 MR 上验收' }, { icon: 'brain', title: '回写 Brain', text: '学到的留下来' }]}>
          <button type="button" className="br-btn is-primary is-big" onClick={() => go({ kind: 'new', ...(repo !== 'all' ? { repo } : {}) })}><RoleIcon role="new" size={17} />开需求</button>
        </EmptyHero>
      )}

      {data && data.rows.length > 0 && (
        <Flow rows={data.rows} at={data.at} hl={null} onOpen={(r) => toBoard(r)} onNew={() => go({ kind: 'new', ...(repo !== 'all' ? { repo } : {}) })} repoName={repoName} />
      )}

      {data && data.rows.length > 0 && (
        <section className="cto-card" aria-label="交付清单" data-anchor="ledger" data-testid="ledger">
          <div className="cto-ledger-head">
            <h3>交付清单</h3>
            <StateFilter counts={data.counts} total={data.rows.length} value={state} onPick={(s) => pick(repo, s)} />
            <span className="cto-dim" data-testid="ledger-count">共 {rows.length} 个 · 点一行打开它的需求看板</span>
          </div>
          <div className="br-scroll">
            <table className="cto-table br-ledger" data-testid="req-table">
              <thead>
                <tr><th>需求</th><th>状态</th><th>Lean</th><th>在等</th><th>交付方式</th><th className="is-num">credits</th><th>更新</th><th>MR</th><th /></tr>
              </thead>
              <tbody>
                <BatchRows ev={data.eval} onKey={openKey} />
                {rows.slice(0, limit).map((r) => (
                  <Row key={`${r.repo}/${r.key}`} r={r} at={data.at} run={runsBy.get(`${r.repo}/${r.key}`)} repoName={repos.length > 1 ? repoName(r.repo) : undefined}
                    onOpen={() => toBoard(r)} onItem={() => toItem(r)} onReplay={() => toBoard(r, true)} />
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && <button type="button" className="kt-btn is-small" style={{ marginTop: 10 }} onClick={() => setLimit((n) => n + 30)}>显示更多（还有 {rows.length - limit} 个）</button>}
        </section>
      )}

      {data && (
        <details className="cto-notes">
          <summary>口径</summary>
          <ul>
            <li>无人值守：brain-kit evaluate 的「自主度」。交给运行机以后，除了必经的审批（需求、设计、计划、发布、验收），没有人做过任何事，而且交付正确（一次通过验收，合并后 14 天没有回滚、热修或缺陷）；14 天没满的、还没合并的算「还没评」，不算进分母。本机做完的需求是人自己带着 AI 做的，不算介入。</li>
            <li>人介入：「介入落在判断点」。判断点 = Lean 的审批口令（批准、驳回、没被接受的口令）和桥上的 park 问题；交接后推代码、允许改验收测试、平台上的手动操作都算判断点之外。</li>
            <li>每个需求的 credits：这个 app 给需求开的 Kiro Crew 会话报的 credits 合计 ÷ 有 credits 的需求数。KiroCrew 只报 credits，input / output / cache token 都是 0。</li>
            <li>决定 · 谁定的：decisions.md 每一行的 Who（{WHO_VOCAB}）；每个决定只算一次，写了别的就算「没归类」，列出在哪一行，不猜是谁。</li>
            <li>每周合并：合并进默认分支的那一周；交付方式同上，没评估过的合并算「还没评」。</li>
          </ul>
        </details>
      )}
    </main>
  )
}

/** Open requirements first (the newest activity first), then the merged ones, then the closed. */
function sortRows(rows: Requirement[]): Requirement[] {
  const rank = (r: Requirement) => (r.state === 'merged' ? 1 : r.state === 'closed' ? 2 : 0)
  return rows.slice().sort((a, b) => rank(a) - rank(b) || (b.updated_at ?? 0) - (a.updated_at ?? 0))
}

function Row({ r, at, run, repoName, onOpen, onItem, onReplay }: { r: Requirement; at: number; run?: CtoRun; repoName?: string; onOpen: () => void; onItem: () => void; onReplay: () => void }) {
  return (
    <tr data-key={r.key} className={`cto-row-pick${r.state === 'merged' ? ' is-merged' : ''}`} onClick={onOpen} title="需求看板" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onOpen())}>
      <td>
        <div className="br-row" style={{ gap: 6 }}>
          <b className="br-key">{r.key}</b>
          <span>{r.title}</span>
          {repoName && <span className="cto-was">{repoName}</span>}
          {r.open_questions.map((q) => <span key={q} className="br-chip tone-wait" title="还没回答的问题">{q} 待答</span>)}
          {r.overlap.length > 0 && <span className="br-chip tone-warn" title="和这些需求要改同一处">和 {r.overlap.join('、')} 重叠</span>}
        </div>
        {r.summary && <div className="br-hint" data-testid="row-summary" title="变更说明的第一行（brain mr-desc）">{r.summary}</div>}
      </td>
      <td><StateChip state={r.state} label={r.state_label} /></td>
      <td><LeanCell lean={r.lean} compact /></td>
      <td>
        <div className={r.waits.who === 'you' ? 'br-strong' : undefined}>{r.waits.text}</div>
        {r.waits.line && <div className="cto-was">在会话里自己打那一行</div>}
      </td>
      <td>
        {run ? (
          <span className="br-how" title={run.beyond.length ? `判断点之外：${run.beyond.join('、')}` : undefined}>
            <i style={{ background: HOW_VAR[run.how] }} />{HOW_LABEL[run.how]}
            {(run.at_points || run.outside) ? <span className="cto-was">人 {run.at_points}{run.outside ? `+${run.outside}` : ''}</span> : null}
          </span>
        ) : <span className="cto-was">—</span>}
      </td>
      <td className="is-num">{fmtCredits(r.credits)}</td>
      <td className="cto-was" style={{ whiteSpace: 'nowrap' }}>{ago(r.updated_at, at)}</td>
      <td onClick={(e) => e.stopPropagation()}><MrLink mr={r.mr} /></td>
      <td onClick={(e) => e.stopPropagation()}>
        <span className="br-acts">
          <button type="button" className="kt-btn is-small" onClick={onItem} title="需求详情">详情</button>
          {r.state === 'merged' && <button type="button" className="kt-btn is-small" onClick={onReplay} title="在需求看板上从头回放">▶ 回放</button>}
        </span>
      </td>
    </tr>
  )
}

/** The eval batch's summary rows, first in the ledger: the metrics of this batch, the runs it skipped, the review queue. */
function BatchRows({ ev, onKey }: { ev: EvalView; onKey: (key: string) => void }) {
  if (!ev.available) {
    return (
      <tr className="br-batch" data-testid="eval-batch"><td colSpan={9}><span className="br-batch-chips"><b className="br-strong">Eval</b><span className="cto-dim">{ev.error || 'brain-kit 还没有 evaluate 模块'}</span></span></td></tr>
    )
  }
  return (
    <>
      <tr className="br-batch" data-testid="eval-batch">
        <td colSpan={9}>
          <span className="br-batch-chips">
            <b className="br-strong">这一批 Eval{ev.ref ? `（${ev.ref}）` : ''}</b>
            {ev.metrics.map((m) => (
              <span key={m.id} className="br-batch-chip" data-metric={m.id} title={m.rule}>{m.label}<b>{m.value === null ? '—' : Array.isArray(m.value) ? `${m.value[0]}/${m.value[1]}` : m.value}</b></span>
            ))}
          </span>
          {ev.notes.length > 0 && <div className="cto-was" data-testid="eval-notes">{ev.notes.join('；')}</div>}
        </td>
      </tr>
      {ev.queue.map((q) => (
        <tr key={`q-${q.key}`} className="br-batch br-batch-row" data-testid="eval-queue">
          <td><span className="kt-pill tone-warn">要复看</span> <button type="button" className="br-link br-key" onClick={() => onKey(q.key)}>{q.key}</button></td>
          <td colSpan={8}>{q.reasons.join('；')}</td>
        </tr>
      ))}
      {ev.skipped.map((x) => (
        <tr key={`s-${x.key}`} className="br-batch br-batch-row" data-testid="eval-skipped">
          <td><span className="kt-pill tone-idle">跳过</span> <b className="br-key">{x.key}</b></td>
          <td colSpan={8}><span className="br-warn-text">读不了，不算进数字：</span><span className="br-pre">{x.why}</span></td>
        </tr>
      ))}
    </>
  )
}

function FunnelCard({ f, onKey }: { f: Funnel; onKey: (key: string) => void }) {
  const people = f.rows.find((r) => r.id === 'person')?.count ?? 0
  return (
    <article className={`cto-card${f.unclassified.length ? ' is-wait' : ''}`} aria-label="决定 · 谁定的" data-testid="funnel-card">
      <div className="cto-eyebrow">决定 · 谁定的</div>
      <div className="cto-value">{f.total}<span className="cto-of">个决定</span></div>
      <div className="cto-desc">人定了 {people} 个 · {f.source === 'evaluate' ? '数字来自 brain-kit evaluate' : 'app 自己数的'}</div>
      <MiniWho rows={f.rows} />
      <div className="br-funnel-rows">
        {f.rows.filter((r) => r.count > 0).map((r) => <span key={r.id} data-row={r.id}><i className="cto-sw" style={{ background: WHO_VAR[r.id] ?? 'var(--s3)' }} />{r.label}<b>{r.count}</b></span>)}
      </div>
      {f.unclassified.length > 0 && (
        <div className="cto-foot" data-testid="funnel-unclassified">
          <span className="br-warn-text">没归类：{f.unclassified.slice(0, 3).map((u) => (
            <span key={`${u.key}-${u.id}`}><button type="button" className="br-link" title={`在 ${u.src}`} onClick={() => onKey(u.key)}>{u.key} {u.id}</button>{u.src && <code className="br-dim br-small"> {u.src}</code>} </span>
          ))}</span>
          <span className="cto-was">{WHO_VOCAB}</span>
        </div>
      )}
      <div className="cto-foot" data-testid="funnel-questions"><span>问人 {fmt(f.questions.asked)} 次 · 答了 {fmt(f.questions.answered)} · 送回运行机 {fmt(f.questions.delivered)}</span></div>
    </article>
  )
}

function StateFilter({ counts, total, value, onPick }: { counts: Overview['counts']; total: number; value?: ReqState; onPick: (s: ReqState | undefined) => void }) {
  const shown = STATES.filter((s) => (counts[s] ?? 0) > 0 || s === value)
  return (
    <div className="cto-seg" role="group" aria-label="按状态看" data-testid="state-filter">
      <button type="button" aria-pressed={!value} onClick={() => onPick(undefined)}>全部 {total}</button>
      {shown.map((s) => (
        <button key={s} type="button" className={`tone-${STATE_TONE[s]}`} aria-pressed={value === s} onClick={() => onPick(value === s ? undefined : s)}>
          {STATE_LABEL[s]} {counts[s] ?? 0}
        </button>
      ))}
    </div>
  )
}

function RefreshButton({ repo, name, onDone }: { repo: string; name: string; onDone: () => void }) {
  const api = useAppApi()
  const act = useAction(() => api.post<RefreshResult>(paths.refresh(), { repo }))
  const run = async () => {
    const r = await act.run()
    if (r) onDone()
  }
  return (
    <span className="br-row" style={{ gap: 6 }}>
      {act.result && <span className={`br-small ${act.result.ok ? 'br-dim' : 'br-bad-text'}`} role="status">{act.result.text}</span>}
      {act.error && <span className="br-small br-bad-text" role="alert">{act.error}</span>}
      <button type="button" className="kt-btn is-small" disabled={act.busy} onClick={() => void run()} title="git fetch：读远端最新的分支和 main">
        <Icon name="RefreshCw" size={13} />{act.busy ? '正在取…' : `从远端取最新${name ? ` · ${name}` : ''}`}
      </button>
    </span>
  )
}
