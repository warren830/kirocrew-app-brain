/**
 * 设置, in the sample board's look: what the app sees (GET /status) as cards — brain-kit (found or not, its version and
 * modules), who this machine says you are (a token is only said to be there, never shown), the team runner's status;
 * each repo with its state, path and kit, 「移出列表」 (the app's list only: no file changes, after a confirm) and
 * 「导入仓库」 (how a repo gets in); KiroCrew's checks with their fix buttons — and the settings form in its own card:
 * where brain-kit is, where worktrees go, team mode (POST /settings, which keeps the repo list as it is).
 */
import { useEffect, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { ago } from '../format'
import type { RemoveResult, RepoInfo, Settings, Status } from '../types'
import { CheckRows, Flow, IMPORT_FLOW, LEVEL_TONE, LoadState, MeLine, PendingRepo, RoleIcon } from '../ui'
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
  const onImport = (path?: string) => go({ kind: 'import', ...(path ? { path } : {}) })

  const formCard = (
    <section className="br-card st-form" aria-label="设置">
      <header>
        <RoleIcon role="settings" size={18} />
        <h3>设置</h3>
        <span className="br-dim br-small">存在 app 自己的数据目录里</span>
      </header>
      <LoadState loading={got.loading} error={got.error} has={!!form} />
      {form && (
        <form className="br-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <div className="st-fields">
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
          </div>
          <fieldset className={`br-fieldset st-team${form.team.enabled ? ' is-on' : ''}`}>
            <legend>团队模式</legend>
            <div className="st-toggle">
              <label className="br-check">
                <input type="checkbox" aria-describedby="set-team-hint" checked={form.team.enabled} onChange={(e) => editTeam({ enabled: e.target.checked })} />
                <b>这台机器是团队运行机</b>
              </label>
              <p className="br-hint" id="set-team-hint">跑桥：看 MR 上的交接，派给运行机会话</p>
            </div>
            <div className="st-fields">
              {TEAM_FIELDS.map(([k, label, hint]) => (
                <div key={k} className="br-field">
                  <label htmlFor={`set-${k}`}>{label}</label>
                  <input id={`set-${k}`} type="text" className="br-mono" value={form.team[k]} placeholder={hint} onChange={(e) => editTeam({ [k]: e.target.value })} />
                  {k === 'bridge_config' && <p className="br-hint">{BRIDGE_HINT}。签名服务的目录和公钥都写在这里面。</p>}
                </div>
              ))}
            </div>
            <label className="br-check">
              <input type="checkbox" checked={form.team.dev_same_user} onChange={(e) => editTeam({ dev_same_user: e.target.checked })} />
              <span>本机试用：签名器和 app 用同一个系统用户</span>
            </label>
            {form.team.dev_same_user && <p className="br-banner br-small" role="note" data-testid="same-user-warning">{SAME_USER_WARNING}</p>}
          </fieldset>
          <div className="br-row">
            <button type="submit" className="br-btn is-primary" disabled={save.busy}>{save.busy ? '正在保存…' : '保存'}</button>
            {saved && <span className="br-ok-text" role="status">已保存</span>}
            {save.result && !save.result.ok && <span className="br-bad-text" role="status">没保存成：看上面的状态</span>}
            {save.error && <span className="br-error" role="alert">{save.error}</span>}
          </div>
        </form>
      )}
    </section>
  )

  return (
    <main className="kt-root br-view st-root" data-testid="settings">
      <style>{ST_CSS}</style>
      <header className="st-top">
        <RoleIcon role="settings" size={26} className="st-top-icon" />
        <div className="br-view-head">
          <h2>设置</h2>
          <p>这台机器上的 app：brain-kit、你是谁、仓库、KiroCrew、团队运行机</p>
        </div>
      </header>
      {status && <StatCards status={status} onTeam={() => go({ kind: 'team' })} />}
      <div className="st-main">
        <div className="st-col">
          {status && <ReposCard repos={status.repos} onImport={onImport} onRemoved={setStatus} onChanged={reloadStatus} />}
          {formCard}
        </div>
        <div className="st-col">
          {status && <CrewCard crew={status.crew} onFixed={reloadStatus} />}
        </div>
      </div>
    </main>
  )
}

const yes = (b: boolean) => (b ? '有' : '没有')

function StatCards({ status: s, onTeam }: { status: Status; onTeam: () => void }) {
  const team = !s.team.enabled ? { label: '没开', tone: 'idle' } : s.team.ok ? { label: '正常', tone: 'ok' } : { label: '有问题', tone: 'bad' }
  // the names brain-kit goes by in the repos (each repo has its own: brain.user, the login name, GitLab's)
  const names = [...new Set(s.repos.map((r) => r.me?.name).filter((n): n is string => !!n))]
  const user = names.join('、') || s.me.user || (s.repos.some((r) => r.me?.source === 'token') ? 'GitLab 账号' : '')
  const asks = s.repos.filter((r) => r.me?.ask).length
  return (
    <div className="br-kpis st-stats">
      <section className={`br-kpi st-stat ${s.brainkit.ok ? 'is-good' : 'is-broken'}`} aria-label="brain-kit">
        <div className="st-stat-head">
          <RoleIcon role="brain" size={18} />
          <span className="br-kpi-label">brain-kit</span>
          <span className="br-grow" />
          <span className={`br-chip tone-${s.brainkit.ok ? 'ok' : 'bad'}`}>{s.brainkit.ok ? '找到了' : '找不到'}</span>
        </div>
        <div><span className="br-kpi-big">{s.brainkit.version ?? '—'}</span><span className="br-kpi-of">版本</span></div>
        <code className="st-path" title={s.brainkit.path}>{s.brainkit.path || '—'}</code>
        <div className="st-mods" aria-label="模块">
          {(Object.entries(s.brainkit.modules) as [string, boolean][]).map(([m, ok]) => (
            <span key={m} className={`br-chip tone-${ok ? 'ok' : 'idle'}${ok ? '' : ' is-off'}`}><i aria-hidden="true">{ok ? '✓' : '–'}</i>{m} {yes(ok)}</span>
          ))}
        </div>
        {s.brainkit.error && <p className="br-error br-small">{s.brainkit.error}</p>}
      </section>

      <section className={`br-kpi st-stat ${user && !asks ? 'is-good' : 'is-warn'}`} aria-label="我是谁">
        <div className="st-stat-head">
          <RoleIcon role="person" size={18} />
          <span className="br-kpi-label">我是谁</span>
        </div>
        <div><span className="br-kpi-big st-user">{user || '没设置'}</span></div>
        {asks > 0 && <p className="br-warn-text br-small">{asks} 个仓库里 brain-kit 还不知道你是谁：在下面「仓库」里填上</p>}
        {!user && !s.repos.some((r) => r.me) && <p className="br-warn-text br-small">在终端里：<code>git config --global brain.user 你的用户名</code></p>}
        <div className="st-mods">
          <span className={`br-chip tone-${s.me.token ? 'ok' : 'warn'}`}><i aria-hidden="true">{s.me.token ? '✓' : '!'}</i>GitLab token {yes(s.me.token)}</span>
        </div>
        {s.me.how && <div className="br-kpi-note st-how">{s.me.how}</div>}
      </section>

      <section className={`br-kpi st-stat${s.team.enabled ? (s.team.ok ? ' is-good' : ' is-broken') : ''}`} aria-label="团队运行机">
        <div className="st-stat-head">
          <RoleIcon role="runner" size={18} />
          <span className="br-kpi-label">团队运行机</span>
          <span className="br-grow" />
          <span className={`br-chip tone-${team.tone}`}>{team.label}</span>
        </div>
        {s.team.enabled ? (
          <>
            <div><span className="br-kpi-big st-user">{s.team.last_loop_at ? ago(s.team.last_loop_at) : '还没跑过'}</span><span className="br-kpi-of">上一轮</span></div>
            <div className="st-mods">
              <span className={`br-chip tone-${s.team.signer.pending ? 'wait' : 'idle'}`}>等签名 {s.team.signer.pending}</span>
              <span className={`br-chip tone-${s.team.signer.refused ? 'bad' : 'idle'}`}>拒签 {s.team.signer.refused}</span>
              <button type="button" className="br-btn is-small" onClick={onTeam}>看运行机</button>
            </div>
            {s.team.loop_error && <p className="br-bad-text br-pre br-small"><b>上一轮出错：</b>{s.team.loop_error}</p>}
          </>
        ) : (
          <div className="br-kpi-note st-how">这台机器只在本机开发。要当团队运行机，在下面的设置里打开团队模式。</div>
        )}
        {s.team.same_user && <p className="br-warn-text br-small" role="alert">{SIGNER_SAME_USER}</p>}
        {s.team.error && <p className="br-error br-small">{s.team.error}</p>}
      </section>
    </div>
  )
}

function ReposCard({ repos, onImport, onRemoved, onChanged }: {
  repos: RepoInfo[]
  onImport: (path?: string) => void
  onRemoved: (s: Status) => void
  onChanged: () => void
}) {
  const ok = repos.filter((r) => r.ok).length
  return (
    <section className="br-card" aria-label="仓库">
      <header>
        <RoleIcon role="list" size={18} />
        <h3>仓库</h3>
        <span className="br-dim br-small">{repos.length} 个{repos.length ? ` · 能用 ${ok}` : ''}</span>
        <span className="br-grow" />
        <button type="button" className="br-btn is-small is-primary" onClick={() => onImport()}><RoleIcon role="import" size={14} />导入仓库</button>
      </header>
      {repos.length === 0 ? (
        <div className="st-norepo">
          <p className="br-note">还没有仓库：点「导入仓库」。</p>
          <Flow steps={IMPORT_FLOW} label="导入仓库的步骤" />
        </div>
      ) : (
        <ul className="st-repos">
          {repos.map((r) => <RepoRow key={r.path} r={r} onImport={onImport} onRemoved={onRemoved} onChanged={onChanged} />)}
        </ul>
      )}
    </section>
  )
}

/** One repo of the list: whether the app can use it, why not, what waits (the install branch), and 「移出列表」 after a
 * confirm that says what it does (the app's list only: no file, branch or worktree changes). */
function RepoRow({ r, onImport, onRemoved, onChanged }: {
  r: RepoInfo
  onImport: (path?: string) => void
  onRemoved: (s: Status) => void
  onChanged: () => void
}) {
  const api = useAppApi()
  const [asking, setAsking] = useState(false)
  const rm = useAction(() => api.post<RemoveResult>(paths.repoRemove(), { path: r.path }))
  const remove = async () => {
    const x = await rm.run()
    if (x) onRemoved(x.status)
  }
  const state = r.ok ? 'ok' : r.pending ? 'wait' : 'bad'
  return (
    <li className={`st-repo is-${state}`} data-repo={r.id}>
      <div className="st-repo-top">
        <span className="st-repo-icon"><RoleIcon role="file" size={18} /></span>
        <b className="st-repo-name">{r.name}</b>
        <span className={`br-chip tone-${state}`}>{r.ok ? '能用' : r.pending ? r.pending.word || '在分支上' : '读不到'}</span>
        <code className="st-path" title={r.path}>{r.path}</code>
        <span className="br-grow" />
        {!asking && <button type="button" className="br-btn is-small" onClick={() => setAsking(true)}>移出列表</button>}
      </div>
      {r.kit && (
        <div className="st-kit">
          <span className="br-tag">需求号 <b>{r.kit.req_prefix}-n</b></span>
          <span className="br-tag">跟踪 <b>{r.kit.tracker}</b></span>
          <span className="br-tag">默认分支 <b>{r.kit.default_branch}</b></span>
          <span className="br-tag" title={r.kit.gitlab_base}>GitLab <b>{r.kit.gitlab_project}</b></span>
        </div>
      )}
      {r.error && (
        <div className="st-repo-why">
          <span className="br-bad-text">{r.error}</span>
          <button type="button" className="br-btn is-small" onClick={() => onImport(r.path)}>去检查</button>
        </div>
      )}
      {r.pending && <PendingRepo repo={r} onOpen={() => onImport(r.path)} onDone={onChanged} />}
      {r.me && (
        <div className="st-me"><span className="br-dim br-small">你是谁</span><MeLine path={r.path} me={r.me} onSaved={(x) => onRemoved(x.status)} /></div>
      )}
      {asking && (
        <div className="br-confirm is-danger" role="group" aria-label={`移出 ${r.name}`}>
          <span>只从 app 的列表里去掉 {r.name}：不删文件，不动分支和工作目录。以后可以再导入。</span>
          <div className="br-row">
            <button type="button" className="br-btn is-small is-danger" disabled={rm.busy} onClick={() => void remove()}>{rm.busy ? '正在移出…' : '移出'}</button>
            <button type="button" className="br-btn is-small" disabled={rm.busy} onClick={() => setAsking(false)}>取消</button>
          </div>
        </div>
      )}
      {rm.error && <p className="br-error" role="alert">{rm.error}</p>}
    </li>
  )
}

function CrewCard({ crew, onFixed }: { crew: Status['crew']; onFixed: () => void }) {
  const bad = crew.rows.filter((r) => r.level === 'FAIL').length
  const warn = crew.rows.filter((r) => r.level === 'WARN').length
  const ok = crew.rows.length - bad - warn
  return (
    <section className={`br-card${bad ? ' is-bad' : warn ? '' : ' is-ok'}`} aria-label="KiroCrew">
      <header>
        <RoleIcon role="laptop" size={18} />
        <h3>KiroCrew</h3>
        {crew.checked_at && <span className="br-dim br-small">{ago(crew.checked_at)}查的</span>}
        <span className="br-grow" />
        {ok > 0 && <span className="br-chip tone-ok">{ok} 正常</span>}
        {warn > 0 && <span className="br-chip tone-warn">{warn} 注意</span>}
        {bad > 0 && <span className="br-chip tone-bad">{bad} 有问题</span>}
      </header>
      {crew.rows.length > 0 && (
        <div className="kt-segs st-cells" role="img" aria-label={`${ok} 正常，${warn} 注意，${bad} 有问题`}>
          {crew.rows.map((r, i) => <i key={i} className={`is-${LEVEL_TONE[r.level] ?? 'idle'}`} title={r.text} />)}
        </div>
      )}
      <CheckRows rows={crew.rows} fix={crew.fix} onFixed={onFixed} />
    </section>
  )
}

const ST_CSS = `
.st-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }
.st-top-icon { color: var(--accent); }
.st-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 1100px) { .st-stats { grid-template-columns: minmax(0, 1fr); } }
.st-stat { gap: .5em; }
.st-stat.is-good { border-color: var(--kit-ok); }
.st-stat.is-broken { border-color: var(--kit-bad); }
.st-stat.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }
.st-stat-head { display: flex; align-items: center; gap: .5em; }
.st-stat-head .kt-role-icon { color: var(--muted); }
.st-stat .br-kpi-big { font-size: 2.2em; }
.st-user { word-break: break-all; }
.st-path { display: block; font-size: .82em; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.st-mods { display: flex; flex-wrap: wrap; gap: .35em; align-items: center; }
.st-mods .br-chip { font-size: .8em; }
.st-mods .br-chip i { font-style: normal; }
.st-mods .br-chip.is-off { opacity: .75; border-style: dashed; }
.st-how { white-space: normal; }
.st-main { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: var(--kit-gap-block, 16px); align-items: start; }
@media (max-width: 1100px) { .st-main { grid-template-columns: minmax(0, 1fr); } }
.st-col { display: grid; gap: var(--kit-gap-block, 16px); min-width: 0; align-content: start; }
.st-repos { list-style: none; margin: 0; padding: 0; display: grid; gap: .6em; }
.st-repo { display: grid; gap: .5em; padding: .75em .9em; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border); background: var(--bg-elevated, var(--card));
  box-shadow: inset 3px 0 0 var(--st-c, transparent); }
.st-repo.is-ok { --st-c: var(--kt-ok); }
.st-repo.is-wait { --st-c: var(--kt-approve); border-color: var(--kit-wait); }
.st-repo.is-bad { --st-c: var(--kt-bad); border-color: var(--kit-bad); }
.st-repo-top { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; min-width: 0; }
.st-repo-icon { display: inline-grid; place-items: center; color: var(--st-c, var(--muted)); }
.st-repo-name { color: var(--text-strong); font-size: 1.05em; }
.st-repo-top .st-path { flex: 0 1 auto; max-width: 28em; }
.st-kit { display: flex; flex-wrap: wrap; gap: .35em; }
.st-kit .br-tag { color: var(--muted); }
.st-kit .br-tag b { color: var(--text-strong); font-weight: 650; margin-left: .3em; }
.st-repo-why { display: flex; align-items: center; gap: .5em .8em; flex-wrap: wrap; font-size: .93em; }
.st-me { display: flex; align-items: flex-start; gap: .4em .8em; flex-wrap: wrap; font-size: .93em; }
.st-me > .br-dim { padding-top: .2em; }
.st-norepo { display: grid; gap: .8em; }
.st-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(18em, 1fr)); gap: .8em 1.2em; align-items: start; }
.st-team { gap: .8em; }
.st-team.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
.st-toggle { display: grid; gap: .1em; }
.st-toggle b { color: var(--text-strong); }
.st-toggle .br-hint { padding-left: 1.6em; }
.st-cells i.is-ok { background: var(--kt-ok); } .st-cells i.is-warn { background: var(--kt-warn); } .st-cells i.is-bad { background: var(--kt-bad); }
`
