/**
 * 交付总览: every requirement — where it is, what it waits on, its Lean stage, its credits and MR, the first line of its
 * 变更说明 — with the repo and state filters (in the URL), the overlap warnings, the eval card and the decision funnel.
 * Polls /overview. Without any repo it is one big way in: 导入仓库. A repo whose brain-kit is on its way (the install
 * branch) is said above the table.
 */
import { useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { POLL_MS, paths, useAction, usePoll } from '../api'
import { ago, fmtCredits } from '../format'
import type { EvalView, Funnel, Overview, RefreshResult, ReqState, Requirement } from '../types'
import { STATE_LABEL } from '../types'
import type { OverviewEntry } from '../nav'
import { Icon, ImportCta, LeanCell, LoadState, MrLink, PendingRepo, Rate, STATE_TONE, StateChip } from '../ui'
import type { ViewProps } from './props'

const STATES = Object.keys(STATE_LABEL) as ReqState[]

export function OverviewView({ entry, status, go, replace, pollMs }: { entry: OverviewEntry } & ViewProps) {
  const [repo, setRepo] = useState(entry.repo ?? 'all')
  const [state, setState] = useState<ReqState | undefined>(entry.state)
  const repos = status?.repos ?? []
  const noRepos = !!status && repos.length === 0
  const ov = usePoll<Overview>(noRepos ? null : paths.overview(repo), pollMs ?? POLL_MS)
  const data = ov.data
  const pick = (r: string, s: ReqState | undefined) => {
    setRepo(r)
    setState(s)
    replace({ kind: 'overview', ...(r !== 'all' ? { repo: r } : {}), ...(s ? { state: s } : {}) })
  }
  const rows = useMemo(() => (data ? data.rows.filter((r) => !state || r.state === state) : []), [data, state])
  const openItem = (r: { repo: string; key: string }) => go({ kind: 'item', repo: r.repo, key: r.key, from: 'overview' })
  /** the repo of a key the page only has by name (overlaps, the eval queue) */
  const repoOfKey = (key: string) => data?.rows.find((r) => r.key === key)?.repo ?? (repo !== 'all' ? repo : repos.find((x) => x.ok)?.id)
  const openKey = (key: string) => {
    const r = repoOfKey(key)
    if (r) openItem({ repo: r, key })
  }
  const scope = repo === 'all' ? repos.filter((r) => r.ok) : repos.filter((r) => r.id === repo)

  if (noRepos) {
    return (
      <main className="br-view" data-testid="overview">
        <ImportCta onImport={() => go({ kind: 'import' })} />
      </main>
    )
  }
  return (
    <main className="br-view" data-testid="overview">
      <div className="br-row">
        <label className="br-row" style={{ gap: 6 }}>
          <span className="br-dim">仓库</span>
          <select value={repo} onChange={(e) => pick(e.target.value, state)} aria-label="仓库">
            <option value="all">全部仓库</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id} disabled={!r.ok}>{r.name}{r.ok ? '' : r.pending ? '（等合并）' : '（读不到）'}</option>
            ))}
          </select>
        </label>
        <span className="br-grow" />
        {scope.map((r) => <RefreshButton key={r.id} repo={r.id} name={scope.length > 1 ? r.name : ''} onDone={ov.reload} />)}
      </div>

      {repos.filter((r) => r.pending && (repo === 'all' || r.id === repo)).map((r) => (
        <PendingRepo key={r.id} repo={r} banner onOpen={() => go({ kind: 'import', path: r.path })} />
      ))}
      {data && <StateFilter counts={data.counts} total={data.rows.length} value={state} onPick={(s) => pick(repo, s)} />}
      <LoadState loading={ov.loading} error={ov.error} has={!!data} />
      {data?.errors.map((e) => (
        <div key={e.repo} className="br-banner" role="status">
          {repos.find((r) => r.id === e.repo)?.name ?? e.repo}：{e.error}
        </div>
      ))}

      {data && data.overlaps.length > 0 && (
        <section className="br-card is-bad" aria-label="改同一处的需求" data-testid="overlaps">
          <header><h2>这些需求要改同一处</h2><span className="br-dim br-small">先商量好谁先合，免得冲突</span></header>
          <ul className="br-plain">
            {data.overlaps.map((o, i) => (
              <li key={i} className="br-row">
                {o.keys.map((k, j) => (
                  <span key={k} className="br-row" style={{ gap: 4 }}>
                    {j > 0 && <span className="br-dim">和</span>}
                    <button type="button" className="br-link br-key" onClick={() => openKey(k)}>{k}</button>
                  </span>
                ))}
                <span className="br-dim">都要改</span>
                {o.paths.map((p) => <code key={p} className="br-tag">{p}</code>)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && (
        <section className="br-card" aria-label="需求">
          {rows.length === 0 ? (
            <div className="br-empty">
              {data.rows.length === 0 ? (
                <span className="br-row">还没有需求。<button type="button" className="br-btn is-small" onClick={() => go({ kind: 'new', ...(repo !== 'all' ? { repo } : {}) })}>开需求</button></span>
              ) : '这个状态下没有需求。'}
            </div>
          ) : (
            <div className="br-scroll">
              <table className="br-table" data-testid="req-table">
                <thead>
                  <tr>
                    <th>需求</th><th>负责人</th><th>状态</th><th>Lean</th><th>在等</th><th className="is-num">credits</th><th>更新</th><th>MR</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => <Row key={`${r.repo}/${r.key}`} r={r} at={data.at} showRepo={repo === 'all' && repos.length > 1} repoName={repos.find((x) => x.id === r.repo)?.name} onOpen={() => openItem(r)} />)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {data && (
        <div className="br-cards">
          <EvalCard ev={data.eval} onKey={openKey} />
          <FunnelCard f={data.funnel} />
        </div>
      )}
    </main>
  )
}

function Row({ r, at, showRepo, repoName, onOpen }: { r: Requirement; at: number; showRepo: boolean; repoName?: string; onOpen: () => void }) {
  return (
    <tr data-key={r.key}>
      <td>
        <div className="br-row" style={{ gap: 6 }}>
          <button type="button" className="br-link br-key" onClick={onOpen}>{r.key}</button>
          {showRepo && <span className="br-dim br-small">{repoName ?? r.repo}</span>}
          {r.open_questions.map((q) => <span key={q} className="br-chip tone-wait" title="还没回答的问题">{q} 待答</span>)}
          {r.overlap.length > 0 && <span className="br-chip tone-warn" title="和这些需求要改同一处">和 {r.overlap.join('、')} 重叠</span>}
        </div>
        <div>{r.title}</div>
        {r.summary && <div className="br-hint" data-testid="row-summary" title="变更说明的第一行（brain mr-desc）">{r.summary}</div>}
      </td>
      <td>{r.owner ?? <span className="br-dim">—</span>}</td>
      <td><StateChip state={r.state} label={r.state_label} /></td>
      <td><LeanCell lean={r.lean} /></td>
      <td>
        <div>{r.waits.text}</div>
        {r.waits.line && <code className="br-mono br-strong">{r.waits.line}</code>}
      </td>
      <td className="is-num">{fmtCredits(r.credits)}</td>
      <td className="br-dim" style={{ whiteSpace: 'nowrap' }}>{ago(r.updated_at, at)}</td>
      <td><MrLink mr={r.mr} /></td>
    </tr>
  )
}

function StateFilter({ counts, total, value, onPick }: { counts: Overview['counts']; total: number; value?: ReqState; onPick: (s: ReqState | undefined) => void }) {
  const shown = STATES.filter((s) => (counts[s] ?? 0) > 0 || s === value)
  return (
    <div className="br-row" role="group" aria-label="按状态看" data-testid="state-filter">
      <button type="button" className="br-btn is-small" aria-pressed={!value} onClick={() => onPick(undefined)}>全部 {total}</button>
      {shown.map((s) => (
        <button key={s} type="button" className={`br-btn is-small tone-${STATE_TONE[s]}`} aria-pressed={value === s} onClick={() => onPick(value === s ? undefined : s)}>
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
      <button type="button" className="br-btn is-small" disabled={act.busy} onClick={() => void run()} title="git fetch：读远端最新的分支和 main">
        <Icon name="RefreshCw" size={13} />{act.busy ? '正在取…' : `从远端取最新${name ? ` · ${name}` : ''}`}
      </button>
    </span>
  )
}

function EvalCard({ ev, onKey }: { ev: EvalView; onKey: (key: string) => void }) {
  return (
    <section className="br-card" aria-label="评估" data-testid="eval-card">
      <header><h2>评估</h2>{ev.ref && <span className="br-dim br-small br-mono">{ev.ref}</span>}</header>
      {!ev.available ? (
        <p className="br-note">{ev.error || 'brain-kit 还没有 evaluate 模块'}</p>
      ) : (
        <>
          {ev.error && <p className="br-error">{ev.error}</p>}
          <ul className="br-plain">
            {ev.metrics.map((m) => (
              <li key={m.id} data-metric={m.id}>
                <div className="br-row"><span className="br-strong">{m.label}</span><span className="br-grow" /><Rate value={m.value} /></div>
                <div className="br-hint">{m.rule}</div>
              </li>
            ))}
          </ul>
          {ev.skipped.length > 0 && (
            <ul className="br-plain" data-testid="eval-skipped">
              {ev.skipped.map((x) => <li key={x.key} className="br-warn-text br-pre">跳过 {x.key}（读不了，不算）：{x.why}</li>)}
            </ul>
          )}
          {ev.notes.length > 0 && (
            <div className="br-stack" style={{ gap: 2 }} data-testid="eval-notes">
              {ev.notes.map((n, i) => <p key={i} className="br-hint br-pre">{n}</p>)}
            </div>
          )}
          <div className="br-stack" style={{ gap: 6 }}>
            <h3>复看队列</h3>
            {ev.queue.length === 0 ? <p className="br-note">没有要复看的运行。</p> : (
              <ul className="br-plain" data-testid="eval-queue">
                {ev.queue.map((q) => (
                  <li key={q.key} className="br-row" style={{ alignItems: 'baseline' }}>
                    <button type="button" className="br-link br-key" onClick={() => onKey(q.key)}>{q.key}</button>
                    {q.intent && <span className="br-dim br-small br-mono">{q.intent}</span>}
                    <span>{q.reasons.join('；')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export const WHO_VOCAB = 'Who 要写 agent、brain <条目号>、check、<化名> <凭证号> 或 owner'

function FunnelCard({ f }: { f: Funnel }) {
  const max = Math.max(1, ...f.rows.map((r) => r.count))
  return (
    <section className="br-card" aria-label="决策漏斗" data-testid="funnel-card">
      <header>
        <h2>决策漏斗：谁定的</h2>
        <span className="br-dim br-small">共 {f.total} 个决定 · {f.source === 'evaluate' ? '数字来自 brain-kit evaluate' : '数字是 app 自己数的'}</span>
      </header>
      <div className="br-bars">
        {f.rows.map((r) => (
          <div key={r.id} className="br-barrow" data-row={r.id}>
            <span>{r.label}</span>
            <span className="br-bartrack" role="img" aria-label={`${r.label} ${r.count}`}><i style={{ width: `${(r.count / max) * 100}%` }} /></span>
            <span className="br-mono" style={{ textAlign: 'right' }}>{r.count}</span>
          </div>
        ))}
      </div>
      {f.unclassified.length > 0 && (
        <div className="br-stack" style={{ gap: 2 }} data-testid="funnel-unclassified">
          <ul className="br-plain">
            {f.unclassified.map((u) => (
              <li key={`${u.key}-${u.id}-${u.src}`} className="br-warn-text">没归类：{u.key} {u.id}（<span className="br-mono">{u.src}</span>）</li>
            ))}
          </ul>
          <p className="br-hint">{WHO_VOCAB}</p>
        </div>
      )}
      <p className="br-note" data-testid="funnel-questions">
        问人 {f.questions.asked} 次 · 答了 {f.questions.answered} · 送回运行 {f.questions.delivered}
      </p>
    </section>
  )
}

