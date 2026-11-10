/**
 * 运行机 (team mode only), in the sample board's look: the bridge loop's status as a card with 「现在跑一轮」 (POST
 * /team/loop); the ledger's counts as counter cards (runs by brain-kit's run states, questions by their states,
 * hand-overs, the messages into the runs' sessions by outbox state, the signer's pending and refused) with a segment bar
 * each; what the bridge said about each labelled MR in the last round as a conveyor (accepted, rejected, seen,
 * unlabelled, waiting, error) between its two ends, which stay in sight however many MRs there are; the runs as a ledger
 * table with their MRs, sessions and what the bridge holds about each (its notes, a line under the run); the runner's
 * Lean hooks as brain-runnerd checks them; the signer's pending and refused requests and the vouchers it has not
 * answered yet (asked for again next round) as cards; the bridge.json and runnerd.json settings brain-kit reads, by
 * file. Every state, step and kind is said in words (a round's steps, the vouchers' kinds); brain-kit's own words are
 * folded under 细节.
 */
import { Fragment } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { ago, fmtIso } from '../format'
import type { CheckRow, HandoverResult, RunState, TeamConfigRow, TeamHandover, TeamLoopResult, TeamNote, TeamStatus, TeamView } from '../types'
import { CheckRows, EmptyHero, ExtLink, Icon, LEVEL_LABEL, LoadState, RoleIcon, questionMeta, type FlowStep } from '../ui'
import type { Tone } from '../styles'
import { ACT } from '../vocab'
import type { ViewProps } from './props'

export const TEAM_POLL_MS = 10_000
export const SIGNER_SAME_USER = '签名服务和 app 是同一个系统用户：它签不签都由 app 说了算，只适合本机试用'
export const SIGNER_SAME_USER_DO = '正式给团队用之前，让签名服务换成另一个系统用户来跑（app 和 AI 的会话都改不了它的文件）。'

/** A round's steps (bridgehost.loop_once's summary keys and loop_error's prefixes), in words. */
export const LOOP_STEP: Record<string, { name: string; did: string }> = {
  poll: { name: '看 MR', did: '看了 MR' },
  runnerd: { name: '准备工作区', did: '准备好工作区' },
  prepared: { name: '准备工作区', did: '准备好工作区' },
  dispatch: { name: '派给会话', did: '派给会话' },
  watch: { name: '看会话', did: '看了会话' },
  collect: { name: '收结果', did: '收回结果' },
  reconcile: { name: '对账', did: '对了账' },
}
/** what a signature is for (the signer spool's request kinds) */
export const SIGN_KIND: Record<string, string> = { answer: '回答的凭证', handoff: '交接的合同' }
const signKind = (k: string) => SIGN_KIND[k] ?? '其他'
/** brain-kit's name for a voucher it waits on (「answer D-2」, 「handoff shop/shop-pay!41 <sha>#<event>」) in words */
export const waitingRef = (ref: string): string => {
  const [kind, what] = ref.split(/\s+/, 2)
  return SIGN_KIND[kind] ? `${kind === 'answer' ? '回答' : '交接'} ${what ?? ''}`.trim() : ref
}
/** brain-kit's run id (RUN-<requirement>-<n>) in words, 「PAY-9 的第 1 次运行」 (*req*: say the requirement); the id
 * itself goes on hover. */
export const runWords = (id: string, req = true): string => {
  const m = /^RUN-(.+)-(\d+)$/.exec(id)
  return m ? `${req ? `${m[1]} 的` : ''}第 ${m[2]} 次运行` : '一次运行'
}
/** brain-kit's own words are said as they are when they are Chinese; English ones are folded under 细节. */
const said = (s: string) => /[\u3400-\u9fff]/.test(s)
/** The steps a round could not do (loop_error: 「poll: …；collect: …」), in words. */
const failedSteps = (loopError: string) => Array.from(new Set(loopError.split('；').map((x) => x.split(':', 1)[0].trim()).filter(Boolean)))
  .map((k) => LOOP_STEP[k]?.name ?? '其他一步')

/** brain-kit's run states (the bridge ledger's), in words; hint: what a state can mean, under its chip. */
export const RUN_STATE: Record<RunState, { label: string; tone: Tone; hint?: string }> = {
  signing: { label: '签名中', tone: 'hand' },
  spooled: { label: '排队等工作区', tone: 'idle' },
  ready: { label: '工作区好了', tone: 'info' },
  dispatched: { label: '已派给会话', tone: 'run' },
  send_unknown: { label: '送没送到不清楚', tone: 'warn', hint: '桥每轮看会话，看到了就接着做；一直这样要人看一下' },
  failed: { label: '没能开始', tone: 'bad', hint: '工作区没建成，或接手消息一直送不进会话' },
  merged: { label: '已合并', tone: 'ok' },
  closed: { label: '已关闭', tone: 'idle' },
}
export const runStateMeta = (state: string): { label: string; tone: Tone; hint?: string } =>
  RUN_STATE[state as RunState] ?? { label: state, tone: 'idle' }

const HANDOFF_STATE: Record<string, { label: string; tone: Tone }> = {
  checking: { label: '在检查', tone: 'run' }, accepted: { label: '已接手', tone: 'ok' }, rejected: { label: '拒绝接手', tone: 'bad' },
}

/** The messages into the runs' sessions (brain-kit's outbox: hand-overs, answers, notices) by state, in words. */
export const OUTBOX_STATE: Record<string, { label: string; tone: Tone }> = {
  sending: { label: '正在送', tone: 'run' },
  interrupted: { label: '送的时候桥停了', tone: 'warn' },
  sent: { label: '送到了', tone: 'ok' },
  unknown: { label: '不知道送到没有', tone: 'warn' },
  dropped: { label: '不送了', tone: 'bad' },
}
export const outboxMeta = (state: string) => OUTBOX_STATE[state] ?? { label: state, tone: 'idle' as Tone }

/**
 * A run's note (what the bridge holds about it) by kind: the pipeline holding the acceptance question (ci_*), runnerd
 * silent or retrying (runnerd_*), sends that keep failing (gaveup), messages not known to have landed (outbox_*),
 * queued. Another ci_ / runnerd_ kind is a warning; any other kind is quiet.
 */
export const NOTE_TONE: Record<string, Tone> = {
  ci_wait: 'warn', ci_person: 'warn', ci_red: 'bad',
  runnerd_retry: 'warn', runnerd_silent: 'bad',
  gaveup: 'bad', setup: 'warn', send_unknown: 'warn', held: 'warn', failed: 'bad', nobody: 'bad',
  outbox_unknown: 'warn', outbox_interrupted: 'warn', outbox_dropped: 'bad',
  queued: 'idle',
}
export const noteTone = (kind: string): Tone => NOTE_TONE[kind] ?? (/^(ci|runnerd)_/.test(kind) ? 'warn' : 'idle')
const NOTE_GLYPH: Partial<Record<Tone, string>> = { bad: '✕', warn: '!' }

/** The config files brain-kit reads on a team runner, in this order, and what each is for. */
const CONFIG_FILES: { file: string; what: string }[] = [
  { file: 'bridge.json', what: '桥' },
  { file: 'runnerd.json', what: '运行机（brain-runnerd）' },
]

/** What brain-kit's bridge said about a labelled MR in the last round (Bridge.process), in words. */
export const HANDOVER_RESULT: Record<HandoverResult, { label: string; tone: Tone; hint: string }> = {
  accepted: { label: '接手了', tone: 'ok', hint: '' },
  rejected: { label: '拒绝接手', tone: 'bad', hint: '原因在 MR 上（AI 接手被拒）' },
  seen: { label: '看过了', tone: 'idle', hint: '这个提交和这次打标签以前检查过，结果在账本里' },
  unlabelled: { label: '标签刚被拿掉', tone: 'warn', hint: '交接标签刚被拿掉（重新交接、再打一次标签时会这样）：下一轮再看' },
  waiting: { label: '正在别处签名', tone: 'hand', hint: '这份交接的合同正在别处签（另一个桥进程，或停下的桥留下的占位）：下一轮再看' },
  error: { label: '这一轮没查成', tone: 'warn', hint: '下一轮再试' },
}
export const handoverMeta = (result: string) => HANDOVER_RESULT[result as HandoverResult] ?? { label: result, tone: 'idle' as Tone, hint: '' }
/** a belt chip's look: green taken, red refused, dashed looked at again next round, quiet seen before */
const CHIP_CLASS: Record<string, string> = { rejected: 'is-conflict', waiting: 'is-pending', unlabelled: 'is-pending', error: 'is-pending', seen: 'is-seen' }

type LedgerKey = keyof TeamView['ledger']
/** A ledger count's state in words: runs by run state, decisions by question state, hand-overs and messages by their own. */
const ledgerMeta = (k: LedgerKey, state: string): { label: string; tone: Tone } =>
  k === 'runs' ? runStateMeta(state) : k === 'decisions' ? questionMeta(state) : k === 'outbox' ? outboxMeta(state)
    : HANDOFF_STATE[state] ?? { label: state, tone: 'idle' }

/** How a team runner works, for a machine that is not one. The words break only where a phrase ends (TM_CSS keeps the
 * rest whole): after punctuation, at a zero-width space (\u200b), never at a no-break space (\u00a0). */
const RUNNER_FLOW: FlowStep[] = [
  { icon: 'handover', title: '交接', text: 'MR 打上交接标签' },
  { icon: 'bridge', title: '桥', text: '每一轮看 MR，检查交接' },
  { icon: 'signer', title: '签名', text: '单独的签名服务\u200b签合同' },
  { icon: 'runner', title: '运行机会话', text: '运行机上的会话\u200b接着做' },
  { icon: 'release', title: '回答、验收', text: '在 MR 上，以\u00a0GitLab\u00a0身份' },
]

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
      <main className="kt-root br-view tm-root" data-testid="team">
        <style>{TM_CSS}</style>
        <EmptyHero
          testid="team-off"
          title="这台机器不是团队运行机"
          text={['这台机器没开团队模式。要当团队运行机：在设置里打开团队模式，填上桥和运行机工作区的配置文件。']}
          punch="运行机接手交接过来的需求，问题和验收都在 MR 上，以 GitLab 身份回答。"
          flow={RUNNER_FLOW}
        >
          <button type="button" className="br-btn is-primary" onClick={() => go({ kind: 'settings' })}>
            <RoleIcon role="settings" size={16} />去设置
          </button>
        </EmptyHero>
      </main>
    )
  }
  const data = tv.data
  const st: TeamStatus | undefined = data?.status ?? status?.team
  const state = !st ? null : !st.enabled ? { label: '没开', tone: 'idle' } : st.ok ? { label: '正常', tone: 'ok' } : { label: '有问题', tone: 'bad' }
  return (
    <main className="kt-root br-view tm-root" data-testid="team">
      <style>{TM_CSS}</style>
      {st?.same_user && (
        <div className="br-banner tm-same" role="alert" data-testid="signer-same-user">
          <span className="br-row"><RoleIcon role="signer" size={18} /><b className="br-strong">{SIGNER_SAME_USER}</b></span>
          <span className="tm-do"><b>做什么</b>{SIGNER_SAME_USER_DO}</span>
        </div>
      )}
      <header className="tm-top">
        <RoleIcon role="runner" size={26} className="tm-top-icon" />
        <div className="br-view-head">
          <h2>运行机</h2>
          <p>团队运行机：交接、运行、签名</p>
        </div>
      </header>
      <LoadState loading={tv.loading} error={tv.error} has={!!data} />
      {st && state && (
        <section className={`br-card tm-status is-${state.tone === 'ok' ? 'ok' : state.tone === 'bad' ? 'bad' : 'idle'}`} aria-label="运行机状态">
          <div className="tm-status-row">
            <span className="tm-status-icon"><RoleIcon role="bridge" size={30} /></span>
            <div className="tm-status-main">
              <div className="br-row">
                <h3>桥</h3>
                <span className={`br-chip kt-pill tone-${state.tone}${st.enabled && st.ok ? ' is-live' : ''}`}><i aria-hidden="true">●</i>{state.label}</span>
              </div>
              <div className="tm-facts">
                <span>上一轮 <b>{st.last_loop_at ? ago(st.last_loop_at) : '还没跑过'}</b></span>
                <span>签名 <b>等签名 {st.signer.pending} · 拒签 {st.signer.refused}</b></span>
              </div>
            </div>
            <span className="br-grow" />
            <button type="button" className="br-btn is-primary is-big" disabled={loop.busy || !st.enabled} onClick={() => void runLoop()}>
              <Icon name="Play" size={15} />{loop.busy ? '正在跑…' : '现在跑一轮'}
            </button>
          </div>
          {st.error && <StartError st={st} />}
          {st.loop_error && (
            <div className="tm-loop-error" data-testid="loop-error">
              <p className="br-bad-text"><b>上一轮有一步没成：</b>{failedSteps(st.loop_error).join('、')}</p>
              <span className="tm-do"><b>做什么</b>下一轮会自动再试；一直这样的话，把「细节」里的原话发给管运行机的人。</span>
              <details className="br-raw"><summary>细节</summary><pre>{st.loop_error}</pre></details>
            </div>
          )}
          {loop.result && <LoopResult r={loop.result} />}
          {loop.error && <p className="br-error" role="alert">{loop.error}</p>}
        </section>
      )}
      {data && (
        <>
          <section className="br-kpis tm-kpis" aria-label="账本">
            <LedgerKpi k="runs" label="运行" unit="个" counts={data.ledger.runs} />
            <LedgerKpi k="decisions" label="问题" unit="个" counts={data.ledger.decisions} />
            <LedgerKpi k="handoffs" label="交接" unit="次" counts={data.ledger.handoffs} big="accepted" />
            <OutboxKpi counts={data.ledger.outbox ?? {}} />
            <SignerKpi signer={data.signer} />
          </section>
          <Handovers rows={data.handovers} at={st?.last_loop_at ?? null} />
          <section className="br-card" aria-label="运行">
            <header>
              <RoleIcon role="runner" size={18} />
              <h3>运行</h3>
              <span className="br-dim br-small">{data.runs.length} 个</span>
            </header>
            {data.runs.length === 0 ? <p className="br-empty">还没有运行：MR 打上交接标签、桥接手以后，就会出现在这里。</p> : (
              <div className="br-scroll">
                <table className="cto-table tm-runs">
                  <thead><tr><th>运行</th><th>需求</th><th>项目</th><th>状态</th><th>MR</th><th>更新</th><th>会话</th></tr></thead>
                  <tbody>
                    {data.runs.map((r) => {
                      const notes = r.notes ?? []
                      const hint = runStateMeta(r.state).hint
                      return (
                        <Fragment key={r.run_id}>
                          <tr data-state={r.state} className={notes.length ? 'has-notes' : undefined}>
                            <td title={r.run_id}>{runWords(r.run_id, false)}</td>
                            <td>
                              <button type="button" className="br-link br-key" onClick={() => go({ kind: 'item', repo: 'runner', key: r.req, from: 'team' })}>{r.req}</button>
                            </td>
                            <td className="br-dim">{r.project}</td>
                            <td>
                              <span className="tm-state">
                                <RunChip state={r.state} />
                                {hint && <span className="tm-state-hint">{hint}</span>}
                              </span>
                            </td>
                            <td><ExtLink href={r.mr_url}>!{r.iid}</ExtLink></td>
                            <td className="br-dim">{fmtIso(r.updated)}</td>
                            <td>
                              {r.slot ? (
                                <button type="button" className="br-btn is-small" onClick={() => navigate(`/chat?sid=${encodeURIComponent(r.slot as string)}`)}>
                                  <Icon name="MessageSquare" size={13} />{ACT.openSession}
                                </button>
                              ) : <span className="br-dim">—</span>}
                            </td>
                          </tr>
                          {notes.length > 0 && (
                            <tr className="tm-notes-row" data-notes={r.run_id}>
                              <td colSpan={7}><RunNotes runId={r.run_id} notes={notes} /></td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <Hooks rows={data.hooks ?? []} />
          <Signer signer={data.signer} />
          <Config rows={data.config ?? []} />
        </>
      )}
    </main>
  )
}

/** Why the bridge did not start: what is wrong and what to do in the backend's words (problems.team_start), the error
 * as it was (file names, keys) under 细节. Without a 做什么 (a backend older than TeamStatus.error_todo) the error is
 * the one as it was. */
function StartError({ st }: { st: TeamStatus }) {
  const worded = !!st.error_todo
  const raw = worded ? st.error_raw ?? '' : st.error
  const text = worded ? st.error : '桥没准备好'
  return (
    <div className="tm-loop-error" data-testid="team-error">
      <p className="br-bad-text"><b>{text}</b></p>
      <span className="tm-do"><b>做什么</b>{worded ? st.error_todo : START_TODO}</span>
      {raw && raw !== text && <details className="br-raw"><summary>细节</summary><pre>{raw}</pre></details>}
    </div>
  )
}
const START_TODO = '看设置里团队模式填的两个配置文件（桥的、运行机的）对不对，改好再跑一轮'

/** What one round did, step by step in words; anything else it reported and its error under 细节. */
function LoopResult({ r }: { r: TeamLoopResult }) {
  const known = Object.entries(r.summary).filter(([k]) => LOOP_STEP[k])
  const other = Object.entries(r.summary).filter(([k]) => !LOOP_STEP[k])
  const raw = [...other.map(([k, n]) => `${k} ${n}`), r.error].filter(Boolean).join('\n')
  return (
    <div className={`tm-loop ${r.ok ? 'is-ok' : 'is-bad'}`} role="status" data-testid="loop-result">
      <b>{r.ok ? '这一轮跑完了' : '这一轮没跑成'}</b>
      {known.map(([k, n]) => <span key={k} className="br-tag">{LOOP_STEP[k].did} {n} 个</span>)}
      {!r.ok && <span className="tm-do"><b>做什么</b>等一会儿再跑一轮；还不成就把「细节」里的原话发给管运行机的人。</span>}
      {raw && <details className="br-raw"><summary>细节</summary><pre>{raw}</pre></details>}
    </div>
  )
}

/**
 * A ledger count as a counter card: the total (or one state's count), a segment bar by state, the states in words.
 * order: the states in this order (others after, as they come); mark: a border for a state that needs a look.
 */
function LedgerKpi({ k, label, unit, counts, big, order, mark, note }: {
  k: LedgerKey
  label: string
  unit: string
  counts: Record<string, number>
  big?: string
  order?: string[]
  mark?: 'bad' | 'warn'
  note?: string
}) {
  const at = (s: string) => (order && order.includes(s) ? order.indexOf(s) : order?.length ?? 0)
  const rows = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => at(a[0]) - at(b[0]))
  const total = rows.reduce((a, [, n]) => a + n, 0)
  const value = big ? counts[big] ?? 0 : total
  return (
    <div className={`br-kpi tm-kpi${mark ? ` has-${mark}` : ''}`} data-ledger={k}>
      <div className="br-kpi-label">{label}</div>
      <div><span className="br-kpi-big">{value}</span><span className="br-kpi-of">{big ? `/${total}` : unit}</span></div>
      {total > 0 ? (
        <div className="tm-stack" role="img" aria-label={rows.map(([s, n]) => `${ledgerMeta(k, s).label} ${n}`).join('，')}>
          {rows.map(([s, n]) => <i key={s} className={`tone-${ledgerMeta(k, s).tone}`} style={{ flexGrow: n }} />)}
        </div>
      ) : <div className="tm-stack is-empty" aria-hidden="true"><i /></div>}
      <div className="tm-legs">
        {rows.length === 0 ? <span className="br-dim">—</span> : rows.map(([s, n]) => (
          <span key={s} className="tm-leg"><i className={`tone-${ledgerMeta(k, s).tone}`} aria-hidden="true" />{ledgerMeta(k, s).label} <b>{n}</b></span>
        ))}
      </div>
      {note && <div className="br-kpi-note">{note}</div>}
    </div>
  )
}

/** The messages into the runs' sessions: sent of all; a red border when one is not sent any more, amber while one is not
 * known to have landed (the bridge looks at the session each round and sends it again). */
function OutboxKpi({ counts }: { counts: Record<string, number> }) {
  const n = (s: string) => counts[s] ?? 0
  const unsure = n('unknown') + n('interrupted')
  return (
    <LedgerKpi
      k="outbox" label="送进会话的消息" unit="条" counts={counts} big="sent" order={Object.keys(OUTBOX_STATE)}
      mark={n('dropped') ? 'bad' : unsure ? 'warn' : undefined}
      note={unsure ? '桥每轮看会话：看到了就算送到，一直这样要人看一下' : undefined}
    />
  )
}

function SignerKpi({ signer }: { signer: TeamView['signer'] }) {
  const p = signer.pending.length, r = signer.refused.length, w = signer.waiting.length
  return (
    <div className={`br-kpi tm-kpi${p ? ' is-wait' : r ? ' is-bad' : ''}`} data-ledger="signer">
      <div className="br-kpi-label">签名</div>
      <div><span className="br-kpi-big">{p}</span><span className="br-kpi-of">等签名</span></div>
      <div className="tm-cells" aria-hidden="true">
        {signer.pending.map((x) => <i key={x.req_id} className="is-wait" title={`等签名：${signKind(x.kind)}`} />)}
        {signer.refused.map((x) => <i key={x.req_id} className="is-bad" title={`拒签：${signKind(x.kind)}`} />)}
        {signer.waiting.map((x) => <i key={x.ref} className="is-warn" title={`上一轮没等到：${waitingRef(x.ref)}`} />)}
      </div>
      <div className="br-kpi-note">拒签 <b className={r ? 'br-bad-text' : ''}>{r}</b> · 上一轮没等到 <b>{w}</b></div>
    </div>
  )
}

/** The labelled MRs of the last round, on the board's conveyor: what the bridge said about each. */
function Handovers({ rows, at }: { rows: TeamHandover[]; at: number | null }) {
  const taken = rows.filter((h) => h.result === 'accepted').length
  const refused = rows.filter((h) => h.result === 'rejected').length
  const again = rows.filter((h) => h.result === 'waiting' || h.result === 'unlabelled' || h.result === 'error').length
  return (
    <section className="kt-card tm-ho" aria-label="交接" data-testid="handovers">
      <header className="kt-card-head">
        <RoleIcon role="handover" size={18} />
        <h2>交接</h2>
        <span className="kt-dim">上一轮看到的打着交接标签的 MR</span>
        <span className="kt-grow" />
        {rows.length > 0 && (
          <span className="br-row br-small">
            {taken > 0 && <span className="tone-ok">接手 {taken}</span>}
            {refused > 0 && <span className="tone-bad">拒绝 {refused}</span>}
            {again > 0 && <span className="tone-warn">下一轮再看 {again}</span>}
          </span>
        )}
      </header>
      {rows.length === 0 ? <p className="br-empty">上一轮没有打着交接标签的 MR。</p> : (
        <div className="tm-belt-row">
          <span className="kt-belt-end" title="桥上一轮看 MR 的时候">
            <RoleIcon role="bridge" size={14} />上一轮{at ? ` · ${ago(at)}` : ''}
          </span>
          <ol className="kt-belt tm-belt">
            {rows.map((h) => {
              const m = handoverMeta(h.result)
              const hint = h.error ? (said(h.error) ? h.error : '没查成：原话在细节里') : m.hint
              return (
                <li key={`${h.project}!${h.iid}`} className={`kt-belt-chip ${CHIP_CLASS[h.result] ?? ''}`} data-result={h.result}
                  title={h.sha ? `交接的提交 ${h.sha.slice(0, 12)}` : undefined}>
                  <span className="tm-chip-top">
                    <ExtLink href={h.mr_url} className="kt-belt-role tm-mr">{h.project}!{h.iid}</ExtLink>
                    <span className={`kt-pill tone-${m.tone}`}>{m.label}</span>
                  </span>
                  {hint && <span className="tm-hint">{hint}</span>}
                  {h.error && !said(h.error) && <details className="br-raw tm-hint"><summary>细节</summary><pre>{h.error}</pre></details>}
                </li>
              )
            })}
          </ol>
          <span className="kt-belt-end is-head" title="接手的交接在运行机上接着做">
            <RoleIcon role="runner" size={14} />运行机
          </span>
        </div>
      )}
    </section>
  )
}

function Signer({ signer }: { signer: TeamView['signer'] }) {
  return (
    <section className="br-card" aria-label="签名">
      <header>
        <RoleIcon role="signer" size={18} />
        <h3>签名</h3>
        <span className="br-dim br-small">单独的签名服务：交接的合同、回答的凭证</span>
      </header>
      <div className="tm-signer">
        <div className="tm-sig-col">
          <h4>等签名 <span className="kt-badge tone-wait">{signer.pending.length}</span></h4>
          {signer.pending.length === 0 ? <p className="br-empty">没有。</p> : (
            <ul className="tm-sigs">
              {signer.pending.map((p) => (
                <li key={p.req_id} className="tm-sig is-wait">
                  <span className="br-row"><b>{signKind(p.kind)}</b><span className="br-grow" /><span className="br-dim br-small">{fmtIso(p.since)}</span></span>
                  <span className="br-dim br-small" title={`${p.run_id} · ${p.req_id}`}>{runWords(p.run_id)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="tm-sig-col">
          <h4>拒签 <span className="kt-badge tone-bad">{signer.refused.length}</span></h4>
          {signer.refused.length === 0 ? <p className="br-empty">没有。</p> : (
            <ul className="tm-sigs">
              {signer.refused.map((p) => (
                <li key={p.req_id} className="tm-sig is-bad">
                  <span className="br-row" title={p.req_id}><b>{signKind(p.kind)}</b></span>
                  <ul className="br-list br-bad-text">{p.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  {p.raw.some(Boolean) && <details className="br-raw"><summary>细节</summary><pre>{p.raw.join('\n')}</pre></details>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {signer.waiting.length > 0 && (
          <div className="tm-sig-col">
            <h4>上一轮没等到签名（下一轮再要同一张凭证）</h4>
            <ul className="tm-sigs" data-testid="signer-waiting">
              {signer.waiting.map((w) => (
                <li key={w.ref} className="tm-sig is-warn">
                  <span className="br-row"><b>{waitingRef(w.ref)}</b><span className="br-tag">{signKind(w.kind)}</span><span className="br-grow" /><span className="br-dim br-small">{fmtIso(w.since)}</span></span>
                  <span className="br-dim br-small" title={w.run_id}>{runWords(w.run_id)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function RunChip({ state }: { state: string }) {
  const m = runStateMeta(state)
  const live = state === 'dispatched' || state === 'signing'
  return <span className={`br-chip kt-pill tone-${m.tone}${live ? ' is-live' : ''}`} data-state={state} title={m.hint}>{m.label}</span>
}

/** What the bridge holds about a run, a line each, toned by kind, with when it was last said. */
function RunNotes({ runId, notes }: { runId: string; notes: TeamNote[] }) {
  return (
    <ul className="tm-notes" aria-label={`${runWords(runId)}：桥记着的事`}>
      {notes.map((n, i) => {
        const tone = noteTone(n.kind)
        return (
          <li key={`${n.kind}-${i}`} className={`tm-note tone-${tone}`} data-kind={n.kind}>
            <span className="tm-note-glyph" aria-hidden="true">{NOTE_GLYPH[tone] ?? '·'}</span>
            <span className="tm-note-text">{n.text}</span>
            {n.at !== null && <span className="tm-note-at">{ago(n.at)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** The runner's Lean hooks as brain-runnerd checks them before each workspace; nothing with an older brain-kit. */
function Hooks({ rows }: { rows: CheckRow[] }) {
  if (rows.length === 0) return null
  const level = rows.some((r) => r.level === 'FAIL') ? 'FAIL' : rows.some((r) => r.level === 'WARN') ? 'WARN' : 'OK'
  const tone = level === 'FAIL' ? 'bad' : level === 'WARN' ? 'warn' : 'ok'
  return (
    <section className={`br-card tm-hooks is-${tone}`} aria-label="运行机的 Lean hook" data-testid="runner-hooks">
      <header>
        <RoleIcon role="lint" size={18} />
        <h3>运行机的 Lean hook</h3>
        <span className={`br-chip kt-pill tone-${tone}`}>{LEVEL_LABEL[level]}</span>
        <span className="br-dim br-small">brain-runnerd 每建一个工作区前查一次：hook 适配器第 3 版，brain-run 的三个 hook</span>
      </header>
      <CheckRows rows={rows} />
    </section>
  )
}

/** The bridge.json and runnerd.json settings brain-kit reads, by file: the key, its value (a quiet 默认 when it is the
 * default), one line. A file the page has no rows of is said so; nothing read yet, one line. */
function Config({ rows }: { rows: TeamConfigRow[] }) {
  const files = [...CONFIG_FILES, ...[...new Set(rows.map((r) => r.file as string))]
    .filter((f) => !CONFIG_FILES.some((c) => c.file === f)).map((file) => ({ file, what: '' }))]
  const changed = rows.filter((r) => !r.default).length
  return (
    <section className="br-card tm-cfg-card" aria-label="配置">
      <header>
        <RoleIcon role="settings" size={18} />
        <h3>配置</h3>
        <span className="br-dim br-small">
          {rows.length ? `brain-kit 读的设置：改过 ${changed} 项，其余用默认` : 'brain-kit 读的 bridge.json 和 runnerd.json'}
        </span>
      </header>
      {rows.length === 0 ? <p className="br-empty">还没读到设置：桥开起来以后，这里列出 bridge.json 和 runnerd.json 里 brain-kit 读的每一项。</p> : (
        <div className="br-scroll">
          <table className="cto-table tm-cfg">
            <thead><tr><th>设置</th><th>值</th><th>说明</th></tr></thead>
            {files.map(({ file, what }) => {
              const mine = rows.filter((r) => r.file === file)
              return (
                <tbody key={file} aria-label={file} data-file={file}>
                  <tr className="tm-cfg-file">
                    <th colSpan={3} scope="rowgroup">
                      <span className="br-row"><RoleIcon role="file" size={14} /><code>{file}</code>{what && <span className="br-dim">{what}</span>}</span>
                    </th>
                  </tr>
                  {mine.length === 0 ? (
                    <tr><td colSpan={3} className="br-dim">没配 {file}</td></tr>
                  ) : mine.map((r) => (
                    <tr key={r.key} data-key={r.key} className={r.default ? 'is-default' : undefined}>
                      <td className="tm-cfg-key"><code>{r.key}</code></td>
                      <td className="tm-cfg-val"><span>{r.value}</span>{r.default && <span className="tm-def">默认</span>}</td>
                      <td className="tm-cfg-text">{r.text}</td>
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        </div>
      )}
    </section>
  )
}

const TM_CSS = `
/* a step's words break only between phrases (回答、| 验收; 每一轮看 MR，| 检查交接), never inside a word */
.tm-root .br-flow > li { word-break: keep-all; overflow-wrap: anywhere; }
.tm-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }
.tm-top-icon { color: var(--accent); }
.tm-same .kt-role-icon { color: var(--kt-warn); }
.tm-status { gap: .7em; }
.tm-status.is-ok { border-color: var(--kit-ok); }
.tm-status.is-bad { border-color: var(--kit-bad); }
.tm-status-row { display: flex; align-items: center; gap: .8em 1.2em; flex-wrap: wrap; }
.tm-status-icon { display: grid; place-items: center; width: 3.2em; height: 3.2em; border-radius: .9em; color: var(--text-strong);
  border: 1px solid var(--border); background: var(--kt-glass); }
.tm-status.is-ok .tm-status-icon { color: var(--kt-ok); border-color: var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 10%, transparent); }
.tm-status.is-bad .tm-status-icon { color: var(--kt-bad); border-color: var(--kit-bad); }
.tm-status-main { display: grid; gap: .3em; }
.tm-status-main h3 { font-size: 1.25em; }
.tm-facts { display: flex; gap: .3em 1.4em; flex-wrap: wrap; color: var(--muted); font-size: .93em; }
.tm-facts b { color: var(--text-strong); font-weight: 650; }
.tm-loop { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; padding: .5em .8em; border-radius: var(--kit-r-cell, 10px); }
.tm-loop.is-ok { background: color-mix(in srgb, var(--kt-ok) 9%, transparent); border: 1px solid var(--kit-ok); }
.tm-loop.is-ok > b { color: var(--kt-ok); }
.tm-loop.is-bad { background: color-mix(in srgb, var(--kt-bad) 9%, transparent); border: 1px solid var(--kit-bad); }
.tm-loop.is-bad > b { color: var(--kt-bad); }
.tm-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@container br-app (max-width: 1280px) { .tm-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container br-app (max-width: 760px) { .tm-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tm-kpi.has-bad { border-color: var(--kit-bad); }
.tm-kpi.has-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }
.tm-do { font-size: .93em; color: var(--text); }
.tm-do b { color: var(--muted); font-weight: 650; margin-right: .5em; }
.tm-same { display: grid; gap: .3em; }
.tm-loop-error { display: grid; gap: .3em; }
.tm-loop-error p { margin: 0; }
.tm-belt-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.tm-stack { display: flex; gap: 2px; height: .75em; margin-top: .2em; border-radius: .3em; overflow: hidden; }
.tm-stack i { flex: 1 1 0; min-width: .4em; background: var(--kt-tone); }
.tm-stack.is-empty i { background: color-mix(in srgb, var(--muted) 22%, transparent); }
.tm-legs { display: flex; flex-wrap: wrap; gap: .25em .9em; font-size: .84em; color: var(--text); }
.tm-leg { display: inline-flex; align-items: center; gap: .4em; white-space: nowrap; }
.tm-leg i { width: .7em; height: .7em; border-radius: 2px; background: var(--kt-tone); flex: none; }
.tm-leg b { color: var(--text-strong); font-variant-numeric: tabular-nums; }
.tm-cells { display: flex; flex-wrap: wrap; gap: 4px; min-height: 1.4em; margin-top: .2em; }
.tm-cells i { width: 1.4em; height: 1.4em; border-radius: .4em; border: 2px solid var(--kt-c); background: color-mix(in srgb, var(--kt-c) 22%, transparent); }
.tm-cells i.is-wait { --kt-c: var(--kt-approve); } .tm-cells i.is-bad { --kt-c: var(--kt-bad); } .tm-cells i.is-warn { --kt-c: var(--kt-warn); border-style: dashed; }
/* the hand-overs wrap onto more rows instead of scrolling (a hidden scrollbar hid the third one) */
.tm-belt { align-items: stretch; padding-top: .5em; padding-bottom: .5em; flex-wrap: wrap; overflow: visible; }
.tm-belt::before { display: none; }
.tm-belt > li { flex: 1 1 15em; min-width: 0; }
@container br-app (max-width: 760px) { .tm-belt-row { grid-template-columns: minmax(0, 1fr); } .tm-belt-row > .kt-belt-end { justify-self: start; } }
.tm-belt .kt-belt-chip { gap: .25em; max-width: 26em; padding: .55em .8em .6em; }
.tm-belt .kt-belt-chip.is-pending { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, var(--card)); }
.tm-belt .kt-belt-chip.is-seen { border: 1px solid var(--border); background: var(--card); }
.tm-chip-top { display: flex; align-items: center; gap: .3em .6em; flex-wrap: wrap; }
.tm-mr { display: inline-flex; align-items: center; gap: .25em; text-decoration: none; }
.tm-mr:hover { text-decoration: underline; }
.tm-hint { font-size: .8em; color: var(--text); white-space: normal; line-height: 1.4; }
.tm-runs td { vertical-align: middle; }
.tm-state { display: inline-grid; gap: .25em; justify-items: start; }
.tm-state-hint { font-size: .8em; color: var(--muted); max-width: 22em; white-space: normal; line-height: 1.4; }
.tm-runs tr.has-notes > td { border-bottom: 0; padding-bottom: .35em; }
.tm-runs tr.tm-notes-row > td { padding-top: 0; padding-bottom: .8em; }
.tm-notes { list-style: none; margin: 0; padding: 0; display: grid; gap: .3em; }
.tm-note { display: flex; align-items: baseline; gap: .55em; padding: .32em .75em; border-radius: var(--kit-r-cell, 10px); font-size: .88em; color: var(--text);
  border: 1px solid color-mix(in srgb, var(--kt-tone) 40%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 7%, transparent); }
.tm-note.tone-idle { border-color: var(--border); background: var(--kt-glass); }
.tm-note-glyph { flex: none; display: inline-grid; place-items: center; width: 1.35em; height: 1.35em; border-radius: .4em; align-self: center;
  font-weight: 900; font-size: .86em; color: var(--kt-tone); border: 1.5px solid var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 14%, transparent); }
.tm-note.tone-idle .tm-note-glyph { border-color: color-mix(in srgb, var(--muted) 50%, transparent); color: var(--muted); background: transparent; }
.tm-note-text { flex: 1; min-width: 0; color: var(--text-strong); white-space: normal; overflow-wrap: anywhere; }
.tm-note.tone-idle .tm-note-text { color: var(--text); }
.tm-note-at { flex: none; color: var(--muted); font-size: .92em; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tm-cfg th, .tm-cfg td { vertical-align: baseline; }
.tm-cfg tr.tm-cfg-file > th { padding-top: 1.1em; padding-bottom: .45em; border-bottom: 1px solid var(--border); font-weight: 700; color: var(--text-strong); }
.tm-cfg tbody:first-of-type tr.tm-cfg-file > th { padding-top: .7em; }
.tm-cfg tr.tm-cfg-file code { font-size: .95em; color: var(--text-strong); }
.tm-cfg tr.tm-cfg-file .kt-role-icon { color: var(--muted); }
.tm-cfg tbody tr:last-child td { border-bottom: 0; }
.tm-cfg-key code { white-space: nowrap; font-weight: 650; color: var(--text-strong); }
.tm-cfg-val { min-width: 8em; max-width: 22em; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.tm-cfg-val > span:first-child { font-weight: 650; }
.tm-cfg tr.is-default .tm-cfg-val > span:first-child { font-weight: 500; color: var(--text); }
.tm-def { display: inline-flex; margin-left: .55em; padding: 0 .55em; border-radius: 999px; font-size: .78em; font-weight: 650; vertical-align: 1px; white-space: nowrap;
  color: var(--muted); background: color-mix(in srgb, var(--text) 7%, transparent); }
.tm-cfg-text { color: var(--text); font-size: .93em; min-width: 18em; }
.tm-signer { display: grid; grid-template-columns: repeat(auto-fit, minmax(20em, 1fr)); gap: var(--kit-gap-row, 12px); align-items: start; }
.tm-sig-col { display: grid; gap: .5em; }
.tm-sig-col h4 { margin: 0; display: flex; align-items: center; gap: .5em; font-size: .93em; color: var(--text-strong); }
.tm-sigs { list-style: none; margin: 0; padding: 0; display: grid; gap: .5em; }
.tm-sig { display: grid; gap: .3em; padding: .6em .8em; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }
.tm-sig.is-wait { border-color: var(--kit-wait); }
.tm-sig.is-bad { border-color: var(--kit-bad); background: color-mix(in srgb, var(--kt-bad) 6%, var(--card)); }
.tm-sig.is-warn { border-style: dashed; border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }
`
