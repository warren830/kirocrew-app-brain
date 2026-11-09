/**
 * 设置: where brain-kit is, where worktrees go, team mode (POST /settings, which keeps the repo list as it is); and what
 * the app sees with them (GET /status): brain-kit's version and modules, each repo with 「移出列表」 (the app's list
 * only: no file changes) and 「导入仓库」 (how a repo gets in), who this machine says you are (a token is only said to be
 * there, never shown), KiroCrew's checks with their fix buttons, the team runner's status.
 */
import { useEffect, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { ago } from '../format'
import type { RemoveResult, RepoInfo, Settings, Status } from '../types'
import { CheckRows, Icon, LoadState, PendingRepo } from '../ui'
import type { ViewProps } from './props'
import { SIGNER_SAME_USER } from './Team'

export const SAME_USER_WARNING = '签名器和 app 用同一个系统用户，签名私钥这个用户就能读到，签名挡不住 app 自己：只适合本机试用，不能用在正式的运行机上。'
const BRIDGE_HINT = 'bridge.json：带 "signer": {"type": "spool", "spool_dir", "allowed_signers"}，不写 signing_key'

/** The form: everything but the repos (导入仓库 adds them, 移出列表 removes them; the backend keeps a key left out). */
type Form = Omit<Settings, 'repos'>
const formOf = (s: Settings): Form => ({ brainkit: s.brainkit, work_root: s.work_root, team: { ...s.team } })
const settingsOf = (f: Form): Form => ({ brainkit: f.brainkit.trim(), work_root: f.work_root.trim(), team: { ...f.team } })

const TEAM_FIELDS: [Exclude<keyof Settings['team'], 'enabled' | 'dev_same_user'>, string, string][] = [
  ['bridge_config', 'bridge 的配置', 'bridge.json'],
  ['runnerd_config', 'runnerd 的配置', 'runnerd.json'],
]

export function SettingsView({ status, setStatus, reloadStatus, go }: ViewProps) {
  const api = useAppApi()
  const got = usePoll<Settings>(paths.settings(), 0)
  const [form, setForm] = useState<Form | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (got.data && !form) setForm(formOf(got.data))
  }, [got.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction((s: Form) => api.post<{ ok: boolean; settings: Settings; status: Status }>(paths.settings(), s))
  const edit = (f: Partial<Form>) => {
    setSaved(false)
    setForm((x) => (x ? { ...x, ...f } : x))
  }
  const editTeam = (t: Partial<Settings['team']>) => edit({ team: { ...(form as Form).team, ...t } })
  const submit = async () => {
    if (!form) return
    const r = await save.run(settingsOf(form))
    if (!r) return
    setForm(formOf(r.settings))
    setStatus(r.status)
    setSaved(r.ok)
  }

  return (
    <main className="br-view" data-testid="settings">
      <section className="br-card" aria-label="设置">
        <header><h2>设置</h2></header>
        <LoadState loading={got.loading} error={got.error} has={!!form} />
        {form && (
          <form className="br-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
            <div className="br-field">
              <label htmlFor="set-brainkit">brain-kit 在哪</label>
              <input id="set-brainkit" type="text" className="br-mono" value={form.brainkit} onChange={(e) => edit({ brainkit: e.target.value })} />
              <p className="br-hint">app 只读它，不改它。</p>
            </div>
            <div className="br-field">
              <label htmlFor="set-work">每个需求的工作目录放在哪</label>
              <input id="set-work" type="text" className="br-mono" value={form.work_root} onChange={(e) => edit({ work_root: e.target.value })} />
              <p className="br-hint">要在 ~/workplace 或 ~/workspace 下面：KiroCrew 只让 agent 在那里干活。</p>
            </div>
            <fieldset className="br-fieldset">
              <legend>团队模式</legend>
              <label className="br-check">
                <input type="checkbox" checked={form.team.enabled} onChange={(e) => editTeam({ enabled: e.target.checked })} />
                <span>这台机器是团队运行机</span>
              </label>
              {TEAM_FIELDS.map(([k, label, hint]) => (
                <div key={k} className="br-field">
                  <label htmlFor={`set-${k}`}>{label}</label>
                  <input id={`set-${k}`} type="text" className="br-mono" value={form.team[k]} placeholder={hint} onChange={(e) => editTeam({ [k]: e.target.value })} />
                  {k === 'bridge_config' && <p className="br-hint">{BRIDGE_HINT}。签名服务的目录和公钥都写在这里面。</p>}
                </div>
              ))}
              <label className="br-check">
                <input type="checkbox" checked={form.team.dev_same_user} onChange={(e) => editTeam({ dev_same_user: e.target.checked })} />
                <span>本机试用：签名器和 app 用同一个系统用户</span>
              </label>
              {form.team.dev_same_user && <p className="br-warn-text br-small" role="note" data-testid="same-user-warning">{SAME_USER_WARNING}</p>}
            </fieldset>
            <div className="br-row">
              <button type="submit" className="br-btn is-primary" disabled={save.busy}>{save.busy ? '正在保存…' : '保存'}</button>
              {saved && <span className="br-ok-text" role="status">已保存</span>}
              {save.result && !save.result.ok && <span className="br-bad-text" role="status">没保存成：看下面的状态</span>}
              {save.error && <span className="br-error" role="alert">{save.error}</span>}
            </div>
          </form>
        )}
      </section>
      {status && <StatusCards status={status} onFixed={reloadStatus} onImport={(path) => go({ kind: 'import', ...(path ? { path } : {}) })} onRemoved={setStatus} />}
    </main>
  )
}

const yes = (b: boolean) => (b ? '有' : '没有')

function StatusCards({ status: s, onFixed, onImport, onRemoved }: {
  status: Status
  onFixed: () => void
  onImport: (path?: string) => void
  onRemoved: (s: Status) => void
}) {
  return (
    <div className="br-cards">
      <section className="br-card" aria-label="brain-kit">
        <header><h2>brain-kit</h2><span className={`br-chip tone-${s.brainkit.ok ? 'ok' : 'bad'}`}>{s.brainkit.ok ? '找到了' : '找不到'}</span></header>
        <dl className="br-facts">
          <dt>位置</dt><dd className="br-mono">{s.brainkit.path || '—'}</dd>
          <dt>版本</dt><dd>{s.brainkit.version ?? '—'}</dd>
          <dt>模块</dt>
          <dd className="br-row">
            {(Object.entries(s.brainkit.modules) as [string, boolean][]).map(([m, ok]) => (
              <span key={m} className={`br-chip tone-${ok ? 'ok' : 'idle'}`}>{m} {yes(ok)}</span>
            ))}
          </dd>
        </dl>
        {s.brainkit.error && <p className="br-error">{s.brainkit.error}</p>}
      </section>

      <section className="br-card" aria-label="我是谁">
        <header><h2>我是谁</h2></header>
        <dl className="br-facts">
          <dt>用户名</dt><dd>{s.me.user ?? <span className="br-warn-text">没设置：git config --global brain.user 你的用户名</span>}</dd>
          <dt>GitLab token</dt><dd>{yes(s.me.token)}</dd>
          <dt>怎么认出来的</dt><dd>{s.me.how || '—'}</dd>
        </dl>
      </section>

      <section className="br-card" aria-label="仓库">
        <header>
          <h2>仓库</h2><span className="br-dim br-small">{s.repos.length} 个</span>
          <span className="br-grow" />
          <button type="button" className="br-btn is-small" onClick={() => onImport()}><Icon name="FolderPlus" size={13} />导入仓库</button>
        </header>
        {s.repos.length === 0 ? <p className="br-note">还没有仓库：点「导入仓库」。</p> : (
          <ul className="br-plain">
            {s.repos.map((r) => <RepoRow key={r.path} r={r} onImport={onImport} onRemoved={onRemoved} />)}
          </ul>
        )}
      </section>

      <section className="br-card" aria-label="KiroCrew">
        <header><h2>KiroCrew</h2>{s.crew.checked_at && <span className="br-dim br-small">{ago(s.crew.checked_at)}查的</span>}</header>
        <CheckRows rows={s.crew.rows} fix={s.crew.fix} onFixed={onFixed} />
      </section>

      <section className="br-card" aria-label="团队运行机">
        <header>
          <h2>团队运行机</h2>
          <span className={`br-chip tone-${!s.team.enabled ? 'idle' : s.team.ok ? 'ok' : 'bad'}`}>{!s.team.enabled ? '没开' : s.team.ok ? '正常' : '有问题'}</span>
        </header>
        {s.team.same_user && <p className="br-warn-text" role="alert"><Icon name="TriangleAlert" size={13} /> {SIGNER_SAME_USER}</p>}
        {s.team.error && <p className="br-error">{s.team.error}</p>}
        {s.team.enabled && (
          <dl className="br-facts">
            <dt>上一轮</dt><dd>{s.team.last_loop_at ? ago(s.team.last_loop_at) : '还没跑过'}</dd>
            {s.team.loop_error && (<><dt>上一轮出错</dt><dd className="br-bad-text br-pre">{s.team.loop_error}</dd></>)}
            <dt>签名</dt><dd>等签名 {s.team.signer.pending} · 拒签 {s.team.signer.refused}</dd>
          </dl>
        )}
      </section>
    </div>
  )
}

/** One repo of the list: whether the app can use it, why not, what waits (the install branch), and 「移出列表」 after a
 * confirm that says what it does (the app's list only: no file, branch or worktree changes). */
function RepoRow({ r, onImport, onRemoved }: { r: RepoInfo; onImport: (path?: string) => void; onRemoved: (s: Status) => void }) {
  const api = useAppApi()
  const [asking, setAsking] = useState(false)
  const rm = useAction(() => api.post<RemoveResult>(paths.repoRemove(), { path: r.path }))
  const remove = async () => {
    const x = await rm.run()
    if (x) onRemoved(x.status)
  }
  return (
    <li className="br-stack" style={{ gap: 2 }} data-repo={r.id}>
      <span className="br-row">
        <b className="br-strong">{r.name}</b>
        <span className={`br-chip tone-${r.ok ? 'ok' : r.pending ? 'wait' : 'bad'}`}>{r.ok ? '能用' : r.pending ? '等合并' : '读不到'}</span>
        <span className="br-mono br-dim br-small">{r.path}</span>
        <span className="br-grow" />
        {!asking && <button type="button" className="br-btn is-small" onClick={() => setAsking(true)}>移出列表</button>}
      </span>
      {asking && (
        <div className="br-confirm" role="group" aria-label={`移出 ${r.name}`}>
          <span>只从 app 的列表里去掉 {r.name}：不删文件，不动分支和工作目录。以后可以再导入。</span>
          <div className="br-row">
            <button type="button" className="br-btn is-small is-danger" disabled={rm.busy} onClick={() => void remove()}>{rm.busy ? '正在移出…' : '移出'}</button>
            <button type="button" className="br-btn is-small" disabled={rm.busy} onClick={() => setAsking(false)}>取消</button>
          </div>
        </div>
      )}
      {r.error && (
        <span className="br-row">
          <span className="br-bad-text br-small">{r.error}</span>
          <button type="button" className="br-btn is-small" onClick={() => onImport(r.path)}>去检查</button>
        </span>
      )}
      {r.pending && <PendingRepo repo={r} onOpen={() => onImport(r.path)} />}
      {r.kit && (
        <span className="br-small br-dim">
          需求号 {r.kit.req_prefix}-n · 跟踪 {r.kit.tracker} · 默认分支 {r.kit.default_branch} · GitLab {r.kit.gitlab_project}（{r.kit.gitlab_base}）
        </span>
      )}
      {rm.error && <p className="br-error" role="alert">{rm.error}</p>}
    </li>
  )
}
