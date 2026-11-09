/**
 * 运行机 (team mode only): the bridge loop's status, the ledger's counts, the runs (brain-kit's run states) with their
 * MRs, and the signer's pending and refused requests and the vouchers it has not answered yet (asked for again next
 * round). 「现在跑一轮」 runs one bridge loop now (POST /team/loop).
 */
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { ago, fmtIso } from '../format'
import type { RunState, TeamLoopResult, TeamStatus, TeamView } from '../types'
import { ExtLink, Icon, LoadState, questionMeta } from '../ui'
import type { Tone } from '../styles'
import type { ViewProps } from './props'

export const TEAM_POLL_MS = 10_000
export const SIGNER_SAME_USER = '签名服务和 app 是同一个系统用户：它签不签都由 app 说了算，只适合本机试用'

const LEDGER_NAME: Record<keyof TeamView['ledger'], string> = { runs: '运行', decisions: '问题', handoffs: '交接' }

/** brain-kit's run states (the bridge ledger's), in words. */
export const RUN_STATE: Record<RunState, { label: string; tone: Tone }> = {
  signing: { label: '签名中', tone: 'hand' },
  spooled: { label: '排队等工作区', tone: 'idle' },
  ready: { label: '工作区好了', tone: 'info' },
  dispatched: { label: '已派给会话', tone: 'run' },
  send_unknown: { label: '送没送到不清楚', tone: 'warn' },
  failed: { label: '工作区没建成', tone: 'bad' },
  merged: { label: '已合并', tone: 'ok' },
  closed: { label: '已关闭', tone: 'idle' },
}
export const runStateMeta = (state: string) => RUN_STATE[state as RunState] ?? { label: state, tone: 'idle' as Tone }

const HANDOFF_STATE: Record<string, string> = { checking: '在检查', accepted: '已接手', rejected: '拒绝接手' }

/** A ledger count's state in words: runs by run state, decisions by question state, hand-overs by their own. */
const ledgerLabel = (k: keyof TeamView['ledger'], state: string) =>
  k === 'runs' ? runStateMeta(state).label : k === 'decisions' ? questionMeta(state).label : HANDOFF_STATE[state] ?? state

export function TeamPage({ status, go, reloadStatus, pollMs }: ViewProps) {
  const api = useAppApi()
  const navigate = useNavigate()
  const team = !!status?.app.team
  const tv = usePoll<TeamView>(team ? paths.team() : null, pollMs ?? TEAM_POLL_MS)
  const loop = useAction(() => api.post<TeamLoopResult>(paths.teamLoop(), {}))
  const runLoop = async () => {
    const r = await loop.run()
    if (r) {
      tv.reload()
      reloadStatus()
    }
  }
  if (status && !team) {
    return (
      <main className="br-view" data-testid="team">
        <p className="br-note">这台机器没开团队模式。要当团队运行机，在设置里打开。</p>
      </main>
    )
  }
  const data = tv.data
  const st: TeamStatus | undefined = data?.status ?? status?.team
  return (
    <main className="br-view" data-testid="team">
      {st?.same_user && <div className="br-banner" role="alert" data-testid="signer-same-user">{SIGNER_SAME_USER}</div>}
      <LoadState loading={tv.loading} error={tv.error} has={!!data} />
      {st && (
        <section className="br-card" aria-label="运行机状态">
          <header>
            <h2>运行机</h2>
            <span className={`br-chip tone-${!st.enabled ? 'idle' : st.ok ? 'ok' : 'bad'}`}>{!st.enabled ? '没开' : st.ok ? '正常' : '有问题'}</span>
            <span className="br-grow" />
            <button type="button" className="br-btn" disabled={loop.busy || !st.enabled} onClick={() => void runLoop()}>
              <Icon name="Play" size={13} />{loop.busy ? '正在跑…' : '现在跑一轮'}
            </button>
          </header>
          {st.error && <p className="br-error">{st.error}</p>}
          <dl className="br-facts">
            <dt>上一轮</dt><dd>{st.last_loop_at ? ago(st.last_loop_at) : '还没跑过'}</dd>
            {st.loop_error && (<><dt>上一轮出错</dt><dd className="br-bad-text br-pre">{st.loop_error}</dd></>)}
            <dt>签名</dt><dd>等签名 {st.signer.pending} · 拒签 {st.signer.refused}</dd>
          </dl>
          {loop.result && (
            <div className="br-row" role="status" data-testid="loop-result">
              <span className={loop.result.ok ? 'br-ok-text' : 'br-bad-text'}>{loop.result.ok ? '这一轮跑完了' : '这一轮没跑成'}</span>
              {Object.entries(loop.result.summary).map(([k, n]) => <span key={k} className="br-tag">{k} {n}</span>)}
              {loop.result.error && <span className="br-bad-text br-pre">{loop.result.error}</span>}
            </div>
          )}
          {loop.error && <p className="br-error" role="alert">{loop.error}</p>}
        </section>
      )}
      {data && (
        <>
          <section className="br-card" aria-label="账本">
            <header><h2>账本</h2></header>
            {(Object.keys(LEDGER_NAME) as (keyof TeamView['ledger'])[]).map((k) => (
              <div key={k} className="br-row" data-ledger={k}>
                <span className="br-strong" style={{ minWidth: '3em' }}>{LEDGER_NAME[k]}</span>
                {Object.entries(data.ledger[k]).length === 0 ? <span className="br-dim">—</span>
                  : Object.entries(data.ledger[k]).map(([s, n]) => <span key={s} className="br-tag" title={s}>{ledgerLabel(k, s)} {n}</span>)}
              </div>
            ))}
          </section>
          <section className="br-card" aria-label="运行">
            <header><h2>运行</h2><span className="br-dim br-small">{data.runs.length} 个</span></header>
            {data.runs.length === 0 ? <p className="br-note">还没有运行。</p> : (
              <div className="br-scroll">
                <table className="br-table">
                  <thead><tr><th>运行</th><th>需求</th><th>项目</th><th>状态</th><th>MR</th><th>更新</th><th /></tr></thead>
                  <tbody>
                    {data.runs.map((r) => (
                      <tr key={r.run_id}>
                        <td className="br-mono">{r.run_id}</td>
                        <td>
                          <button type="button" className="br-link br-key" onClick={() => go({ kind: 'item', repo: 'runner', key: r.req })}>{r.req}</button>
                        </td>
                        <td>{r.project}</td>
                        <td><RunChip state={r.state} /></td>
                        <td><ExtLink href={r.mr_url}>!{r.iid}</ExtLink></td>
                        <td className="br-dim">{fmtIso(r.updated)}</td>
                        <td>
                          {r.slot && (
                            <button type="button" className="br-btn is-small" onClick={() => navigate(`/chat?sid=${encodeURIComponent(r.slot as string)}`)}>
                              <Icon name="MessageSquare" size={13} />打开会话
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="br-card" aria-label="签名">
            <header><h2>签名</h2></header>
            <h3>等签名</h3>
            {data.signer.pending.length === 0 ? <p className="br-note">没有。</p> : (
              <ul className="br-plain">
                {data.signer.pending.map((p) => (
                  <li key={p.req_id} className="br-row">
                    <span className="br-mono">{p.req_id}</span><span className="br-tag">{p.kind}</span><span className="br-mono br-dim">{p.run_id}</span>
                    <span className="br-dim">{fmtIso(p.since)}</span>
                  </li>
                ))}
              </ul>
            )}
            <h3>拒签</h3>
            {data.signer.refused.length === 0 ? <p className="br-note">没有。</p> : (
              <ul className="br-plain">
                {data.signer.refused.map((p) => (
                  <li key={p.req_id} className="br-stack" style={{ gap: 2 }}>
                    <span className="br-row"><span className="br-mono">{p.req_id}</span><span className="br-tag">{p.kind}</span></span>
                    <ul className="br-list br-bad-text">{p.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </li>
                ))}
              </ul>
            )}
            {data.signer.waiting.length > 0 && (
              <>
                <h3>上一轮没等到签名（下一轮再要同一张凭证）</h3>
                <ul className="br-plain" data-testid="signer-waiting">
                  {data.signer.waiting.map((w) => (
                    <li key={w.ref} className="br-row">
                      <span className="br-mono">{w.ref}</span><span className="br-tag">{w.kind}</span><span className="br-mono br-dim">{w.run_id}</span>
                      <span className="br-dim">{fmtIso(w.since)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </main>
  )
}

function RunChip({ state }: { state: string }) {
  const m = runStateMeta(state)
  return <span className={`br-chip tone-${m.tone}`} data-state={state}>{m.label}</span>
}
