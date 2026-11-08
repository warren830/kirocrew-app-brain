/**
 * 运行机 (team mode only): the bridge loop's status, the ledger's counts, the runs with their MRs, and the signer's
 * pending and refused requests. 「现在跑一轮」 runs one bridge loop now (POST /team/loop).
 */
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { ago, fmtIso } from '../format'
import type { ReqState, TeamLoopResult, TeamStatus, TeamView } from '../types'
import { STATE_LABEL } from '../types'
import { ExtLink, Icon, LoadState, STATE_TONE } from '../ui'
import type { ViewProps } from './props'

export const TEAM_POLL_MS = 10_000
export const SIGNER_SAME_USER = '签名服务和 app 是同一个系统用户：它签不签都由 app 说了算，只适合本机试用'

const LEDGER_NAME: Record<keyof TeamView['ledger'], string> = { runs: '运行', decisions: '问题', handoffs: '交接' }

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
                  : Object.entries(data.ledger[k]).map(([s, n]) => <span key={s} className="br-tag">{s} {n}</span>)}
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
                        <td><span className={`br-chip tone-${STATE_TONE[r.state as ReqState] ?? 'idle'}`}>{STATE_LABEL[r.state as ReqState] ?? r.state}</span></td>
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
          </section>
        </>
      )}
    </main>
  )
}
