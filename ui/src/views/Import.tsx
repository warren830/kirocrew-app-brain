/**
 * 导入仓库: how a project repo gets into the app. One page, in steps:
 *
 *   1 从哪来   本机目录 (a path), or 克隆 (a git URL, the folder it goes under, its name): the clone runs in the background
 *              (POST /import/clone, then GET /import/jobs/{id} until it ends) and the new folder is checked next.
 *   2 检查     POST /import/inspect, read only: each check ✓ / ! / ✗ with why and what to do; KiroCrew's checks with their
 *              fixes.
 *   3 安装     not installed: the kit.json values `brain install` asks you to check, then 「安装到新分支」 (POST
 *              /import/install, a job): a new branch in its own worktree, brain doctor, the changed files, a commit with
 *              the person's own git identity. A hook that says no is shown as it said it; 「再提交一次」 (POST
 *              /import/commit). 「推送并开 MR」 is optional and asks first, saying which branch goes where (POST
 *              /import/publish): the MR, or the commands and the link to open it.
 *   4 加入列表  POST /import/add. A repo whose brain-kit is only on the install branch is listed as 「安装在 … 分支上，
 *              合并后生效」.
 *
 * A path from the URL (?path=) only fills the box: nothing runs before 检查.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { errorText, paths, useAction, usePoll } from '../api'
import { fmtSpan } from '../format'
import { useLatest } from '../hooks'
import type { ImportEntry } from '../nav'
import type {
  AddResult, CloneBody, CloneResult, CommitResult, FileChange, ImportCheck, ImportDefaults, ImportInspect, ImportJob,
  InstallBody, InstallResult, JobStart, JobStepState, KitForm, Level, PendingInstall, PublishBody, PublishResult,
} from '../types'
import type { Tone } from '../styles'
import { CheckRows, ExtLink, Icon, LEVEL_LABEL, LEVEL_TONE } from '../ui'
import type { ViewProps } from './props'

export const JOB_POLL_MS = 1000
export const SAFE_INSTALL = '只在新分支上装：从默认分支建一个分支，放在单独的工作目录里（work_root 下面）。你现在的检出、分支和改动都不会动。提交用你自己的 git 身份，你的 git hook 照常跑。'
const GLYPH: Record<Level, string> = { OK: '✓', WARN: '!', FAIL: '✗' }
const STEP: Record<JobStepState, { glyph: string; tone: Tone; label: string }> = {
  todo: { glyph: '○', tone: 'idle', label: '还没开始' },
  running: { glyph: '●', tone: 'run', label: '在做' },
  ok: { glyph: '✓', tone: 'ok', label: '好了' },
  warn: { glyph: '!', tone: 'warn', label: '有要注意的' },
  fail: { glyph: '✗', tone: 'bad', label: '没成' },
}
const CHANGE: Record<FileChange['change'], string> = { added: '新增', modified: '改动', deleted: '删除', other: '其他' }
const EMPTY_FORM: KitForm = { req_prefix: '', tracker: 'none', jira_base: '', gitlab_base: '', gitlab_project: '', default_branch: 'main', team: '' }

/** The folder name a clone of *url* gets when the name is left empty (as the backend makes it). */
export function nameFromUrl(url: string): string {
  const last = url.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? ''
  return last.endsWith('.git') ? last.slice(0, -4) : last
}

export function kitLine(k: KitForm): string {
  const parts = [`需求号 ${k.req_prefix}-n`, `跟踪 ${k.tracker}`, `默认分支 ${k.default_branch}`]
  if (k.gitlab_project) parts.push(`GitLab ${k.gitlab_project}（${k.gitlab_base}）`)
  if (k.team) parts.push(`团队 ${k.team}`)
  return parts.join(' · ')
}

/**
 * A background job followed until it ends: start(job) with what the POST answered, then GET /import/jobs/{id} every
 * *ms*. onEnd gets it once, when it is no longer running. A read that fails is said and tried again.
 */
function useJob<R>(ms: number, onEnd?: (j: ImportJob<R>) => void) {
  const api = useAppApi()
  const apiRef = useLatest(api)
  const endRef = useLatest(onEnd)
  const [job, setJob] = useState<ImportJob<R> | null>(null)
  const [readError, setReadError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!job || job.state !== 'running') return
    let alive = true
    const t = setTimeout(async () => {
      try {
        const got = await apiRef.current.get<ImportJob<R>>(paths.importJob(job.id))
        if (!alive) return
        setReadError('')
        setJob(got)
        if (got.state !== 'running') endRef.current?.(got)
      } catch (e) {
        if (!alive) return
        setReadError(`读不到进度：${errorText(e)}（还会再读）`)
        setTick((n) => n + 1)
      }
    }, ms)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [job, tick, ms, apiRef, endRef])
  const start = useCallback((j: ImportJob<R> | null) => {
    setJob(j)
    setReadError('')
    if (j && j.state !== 'running') endRef.current?.(j)
  }, [endRef])
  return { job, start, readError }
}

export function ImportView({ entry, go, setStatus, reloadStatus, pollMs }: { entry: ImportEntry } & ViewProps) {
  const api = useAppApi()
  const jobMs = Math.min(pollMs ?? JOB_POLL_MS, JOB_POLL_MS)
  const defaults = usePoll<ImportDefaults>(paths.importDefaults(), 0)
  const [source, setSource] = useState<'local' | 'clone'>('local')
  const [path, setPath] = useState(entry.path ?? '')
  const [checked, setChecked] = useState<{ path: string; result: ImportInspect } | null>(null)
  const inspect = useAction((p: string) => api.post<ImportInspect>(paths.importInspect(), { path: p }))
  const runInspect = useCallback(async (p: string) => {
    const r = await inspect.run(p)
    if (r) setChecked({ path: p, result: r })
  }, [inspect])
  const install = useJob<InstallResult>(jobMs, (j) => {
    reloadStatus()
    if (j.state === 'done' && j.result?.commit.ok && checked) void runInspect(checked.path)
  })

  const c = checked?.result ?? null
  const stale = !!checked && source === 'local' && path.trim() !== checked.path
  const installFor = install.job && c?.path && install.job.target === c.path ? install.job : null
  const recheck = () => checked && void runInspect(checked.path)

  return (
    <main className="br-view" data-testid="br-import">
      <h2>导入仓库</h2>
      <p className="br-note">把一个项目仓库导进来：先检查它；没装 brain-kit 的，装到一个新分支上（不动你现在的检出）；最后加入列表。</p>

      <section className="br-card" aria-label="从哪来">
        <header><h3>1 · 从哪来</h3></header>
        <div className="br-choice" role="radiogroup" aria-label="从哪来">
          <label className="br-check">
            <input type="radio" name="imp-source" checked={source === 'local'} onChange={() => setSource('local')} />
            <span>本机目录</span>
          </label>
          <label className="br-check">
            <input type="radio" name="imp-source" checked={source === 'clone'} onChange={() => setSource('clone')} />
            <span>克隆（git 地址）</span>
          </label>
        </div>
        {source === 'local' ? (
          <form className="br-form" aria-label="本机目录" onSubmit={(e) => { e.preventDefault(); void runInspect(path.trim()) }}>
            <div className="br-field">
              <label htmlFor="imp-path">仓库目录</label>
              <input id="imp-path" type="text" className="br-mono" value={path} placeholder="~/workplace/shop-pay" onChange={(e) => setPath(e.target.value)} />
              <p className="br-hint">这台机器上的目录，写绝对路径。仓库里的子目录、工作区也行：会找到仓库本身。</p>
            </div>
            <div className="br-row">
              <button type="submit" className="br-btn is-primary" disabled={!path.trim() || inspect.busy}>
                <Icon name="SearchCheck" size={14} />{inspect.busy ? '正在检查…' : '检查'}
              </button>
              {stale && <span className="br-hint">目录改过了：再检查一遍。</span>}
            </div>
          </form>
        ) : (
          <CloneForm defaults={defaults.data} ms={jobMs} onCloned={(p) => {
            setPath(p)
            void runInspect(p)
          }} />
        )}
        {inspect.error && <p className="br-error" role="alert">{inspect.error}</p>}
      </section>

      {c && !stale && (
        <InspectCard c={c} busy={inspect.busy} onRecheck={recheck} onFixed={() => { reloadStatus(); recheck() }} />
      )}
      {c && !stale && c.next === 'fix' && <p className="br-bad-text" data-testid="next-fix">先处理上面打 ✗ 的几行，再检查一遍。</p>}
      {c && !stale && c.next === 'listed' && (
        <div className="br-banner is-ok" role="status" data-testid="next-listed">
          <div className="br-row">
            <span>已经在列表里（{c.listed}）。</span>
            <button type="button" className="br-btn is-small" onClick={() => go({ kind: 'overview' })}>去交付总览</button>
          </div>
        </div>
      )}
      {c && !stale && (c.next === 'install' || installFor) && (
        <InstallCard key={`install:${c.path}`} c={c} job={installFor} readError={install.readError} onStart={install.start} onCommitted={recheck} />
      )}
      {c && !stale && (c.next === 'pending' || c.next === 'listed') && c.pending && c.path && (
        <PendingCard key={`pending:${c.path}`} path={c.path} p={c.pending} title={installFor ? '推送并开 MR（可选）' : undefined}
          onChanged={() => { reloadStatus(); recheck() }} />
      )}
      {c && !stale && (c.next === 'add' || c.next === 'pending') && c.path && (
        <AddCard key={`add:${c.path}`} path={c.path} pending={c.next === 'pending' ? c.pending : null} step={c.next === 'pending' || installFor ? 4 : 3}
          onAdded={(r) => setStatus(r.status)} go={go} />
      )}
    </main>
  )
}

function CloneForm({ defaults, ms, onCloned }: { defaults: ImportDefaults | null; ms: number; onCloned: (path: string) => void }) {
  const api = useAppApi()
  const [url, setUrl] = useState('')
  const [parent, setParent] = useState<string | null>(null)
  const [name, setName] = useState('')
  const start = useAction((b: CloneBody) => api.post<JobStart>(paths.importClone(), b))
  const clone = useJob<CloneResult>(ms, (j) => {
    if (j.state === 'done' && j.result?.path) onCloned(j.result.path)
  })
  const parentValue = parent ?? defaults?.clone_parent ?? ''
  const running = clone.job?.state === 'running'
  const run = async () => {
    const r = await start.run({ url: url.trim(), parent: parentValue.trim(), name: name.trim() })
    if (r) clone.start(r.job as ImportJob<CloneResult>)
  }
  return (
    <form className="br-form" aria-label="克隆" onSubmit={(e) => { e.preventDefault(); void run() }}>
      <div className="br-field">
        <label htmlFor="imp-url">仓库地址</label>
        <input id="imp-url" type="text" className="br-mono" value={url} placeholder="git@gitlab.example.com:组/仓库.git" onChange={(e) => setUrl(e.target.value)} />
        <p className="br-hint">SSH 或 https 地址。不要把密码或 token 写进地址；这里不会弹窗问密码。</p>
      </div>
      <div className="br-field">
        <label htmlFor="imp-parent">放在哪个目录下</label>
        <input id="imp-parent" type="text" className="br-mono" value={parentValue} onChange={(e) => setParent(e.target.value)} />
        <p className="br-hint">默认是 ~/workplace。别放进「每个需求的工作目录」{defaults?.work_root ? `（${defaults.work_root}）` : ''}里面。</p>
      </div>
      <div className="br-field">
        <label htmlFor="imp-name">目录名（可不填）</label>
        <input id="imp-name" type="text" className="br-mono" value={name} placeholder={nameFromUrl(url) || 'shop-pay'} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="br-row">
        <button type="submit" className="br-btn is-primary" disabled={!url.trim() || start.busy || running}>
          <Icon name="Download" size={14} />{running ? '正在克隆…' : '克隆'}
        </button>
      </div>
      {start.error && <p className="br-error" role="alert">{start.error}</p>}
      {clone.job && <JobView job={clone.job} readError={clone.readError} />}
      {clone.job?.state === 'done' && clone.job.result?.path && <p className="br-ok-text" role="status">克隆好了：{clone.job.result.path}。下面是它的检查。</p>}
    </form>
  )
}

function JobView({ job, readError }: { job: ImportJob<unknown>; readError?: string }) {
  const what = job.kind === 'clone' ? '克隆' : '安装'
  return (
    <div className="br-stack" style={{ gap: 6 }} data-testid={`job-${job.kind}`} data-state={job.state}>
      <ol className="br-steps" aria-label={`${what}的进度`}>
        {job.steps.map((s) => (
          <li key={s.id} className={`is-${s.state}`} data-step={s.id} data-state={s.state}>
            <span className={`br-glyph tone-${STEP[s.state].tone}`} aria-hidden="true">{STEP[s.state].glyph}</span>
            <span>{s.label}<span className="br-sr">：{STEP[s.state].label}</span></span>
            {s.detail && <span className="br-hint br-pre">{s.detail}</span>}
          </li>
        ))}
      </ol>
      {job.state === 'running' && <p className="br-note" role="status">正在{what}…已经 {fmtSpan(Date.now() / 1000 - job.started_at)}</p>}
      {job.state === 'failed' && job.error && <p className="br-error br-pre" role="alert">{job.error}</p>}
      {readError && <p className="br-note" role="status">{readError}</p>}
    </div>
  )
}

function CheckList({ rows }: { rows: ImportCheck[] }) {
  return (
    <ul className="br-checks" data-testid="import-checks">
      {rows.map((x) => (
        <li key={x.id} data-check={x.id} data-level={x.level}>
          <span className={`br-glyph tone-${LEVEL_TONE[x.level]}`} role="img" aria-label={LEVEL_LABEL[x.level]}>{GLYPH[x.level]}</span>
          <b className="br-strong">{x.label}</b>
          <span className="br-pre">{x.why}</span>
          {x.todo && <span className="br-todo">{x.todo}</span>}
        </li>
      ))}
    </ul>
  )
}

function InspectCard({ c, busy, onRecheck, onFixed }: { c: ImportInspect; busy: boolean; onRecheck: () => void; onFixed: () => void }) {
  return (
    <section className="br-card" aria-label="检查" data-testid="inspect">
      <header>
        <h3>2 · 检查</h3>
        {c.path && <span className="br-mono br-dim br-small">{c.path}</span>}
      </header>
      {c.error && <p className="br-error" role="alert">{c.error}</p>}
      <CheckList rows={c.checks} />
      {c.crew.rows.length > 0 && (
        <div className="br-stack" style={{ gap: 4 }}>
          <b className="br-strong">KiroCrew</b>
          <CheckRows rows={c.crew.rows} fix={c.crew.fix} onFixed={onFixed} />
        </div>
      )}
      <div className="br-row">
        <button type="button" className="br-btn is-small" disabled={busy} onClick={onRecheck}>
          <Icon name="RefreshCw" size={13} />{busy ? '正在检查…' : '再检查一遍'}
        </button>
      </div>
    </section>
  )
}

function InstallCard({ c, job, readError, onStart, onCommitted }: {
  c: ImportInspect
  job: ImportJob<InstallResult> | null
  readError: string
  onStart: (j: ImportJob<InstallResult> | null) => void
  onCommitted: () => void
}) {
  const api = useAppApi()
  const [form, setForm] = useState<KitForm>(() => c.form ?? EMPTY_FORM)
  const [branch, setBranch] = useState(c.branch)
  const start = useAction((b: InstallBody) => api.post<JobStart>(paths.importInstall(), b))
  const edit = (f: Partial<KitForm>) => setForm((x) => ({ ...x, ...f }))
  const running = job?.state === 'running'
  const done = job?.state === 'done' && !!job.result?.commit.ok
  const run = async () => {
    if (!c.path) return
    const r = await start.run({ path: c.path, branch: branch.trim(), kit: { ...form, req_prefix: form.req_prefix.trim().toUpperCase() } })
    if (r) onStart(r.job as ImportJob<InstallResult>)
  }
  const fromOrigin = !!c.origin?.project && form.gitlab_project === c.origin.project
  return (
    <section className="br-card" aria-label="装 brain-kit" data-testid="install">
      <header><h3>3 · 装 brain-kit</h3></header>
      {!job && (
        <form className="br-form" aria-label="kit.json" onSubmit={(e) => { e.preventDefault(); void run() }}>
          <p className="br-note">brain install 让你检查的几项（写进 .brain/kit.json）：</p>
          <div className="br-field">
            <label htmlFor="imp-prefix">需求号前缀</label>
            <input id="imp-prefix" type="text" className="br-mono" value={form.req_prefix} onChange={(e) => edit({ req_prefix: e.target.value.toUpperCase() })} />
            <p className="br-hint">{form.req_prefix ? `需求号会是 ${form.req_prefix}-1、${form.req_prefix}-2 …` : '大写字母开头，最多 10 个，比如 PAY'}</p>
          </div>
          <fieldset className="br-fieldset">
            <legend>跟踪方式</legend>
            <div className="br-choice">
              <label className="br-check">
                <input type="radio" name="imp-tracker" checked={form.tracker !== 'jira'} onChange={() => edit({ tracker: 'none' })} />
                <span>不用 Jira（需求号按顺序给）</span>
              </label>
              <label className="br-check">
                <input type="radio" name="imp-tracker" checked={form.tracker === 'jira'} onChange={() => edit({ tracker: 'jira' })} />
                <span>Jira（需求号用 Jira 的）</span>
              </label>
            </div>
            {form.tracker === 'jira' && (
              <div className="br-field">
                <label htmlFor="imp-jira">Jira 地址</label>
                <input id="imp-jira" type="text" className="br-mono" value={form.jira_base} placeholder="https://jira.example.com" onChange={(e) => edit({ jira_base: e.target.value })} />
              </div>
            )}
          </fieldset>
          <div className="br-field">
            <label htmlFor="imp-gl-base">GitLab 地址</label>
            <input id="imp-gl-base" type="text" className="br-mono" value={form.gitlab_base} placeholder="https://gitlab.example.com" onChange={(e) => edit({ gitlab_base: e.target.value })} />
          </div>
          <div className="br-field">
            <label htmlFor="imp-gl-project">GitLab 项目</label>
            <input id="imp-gl-project" type="text" className="br-mono" value={form.gitlab_project} placeholder="组/仓库" onChange={(e) => edit({ gitlab_project: e.target.value })} />
            <p className="br-hint">{fromOrigin ? '从 origin 的地址猜的：检查一下。' : '交接和开 MR 用。不用 GitLab 就两个都空着。'}</p>
          </div>
          <div className="br-field">
            <label htmlFor="imp-default">默认分支</label>
            <input id="imp-default" type="text" className="br-mono" value={form.default_branch} onChange={(e) => edit({ default_branch: e.target.value })} />
          </div>
          <div className="br-field">
            <label htmlFor="imp-team">团队（可不填）</label>
            <input id="imp-team" type="text" value={form.team} onChange={(e) => edit({ team: e.target.value })} />
          </div>
          <div className="br-field">
            <label htmlFor="imp-branch">新分支名</label>
            <input id="imp-branch" type="text" className="br-mono" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </div>
          <p className="br-hint" data-testid="install-safe">{SAFE_INSTALL}</p>
          <div className="br-row">
            <button type="submit" className="br-btn is-primary" disabled={start.busy || !form.req_prefix.trim() || !form.default_branch.trim() || !branch.trim()}>
              <Icon name="GitBranchPlus" size={14} />{start.busy ? '正在开始…' : '安装到新分支'}
            </button>
          </div>
          {start.error && <p className="br-error" role="alert">{start.error}</p>}
        </form>
      )}
      {job && <JobView job={job} readError={readError} />}
      {job && !running && job.result && <InstallOut r={job.result} onCommitted={onCommitted} />}
      {job && job.state === 'failed' && (
        <div className="br-row">
          <button type="button" className="br-btn is-small" onClick={() => onStart(null)}>改一下再装</button>
        </div>
      )}
      {done && <p className="br-hint">装好了，在新分支上。下一步：推送并开 MR（可选），再加入列表。</p>}
    </section>
  )
}

function InstallOut({ r, onCommitted }: { r: InstallResult; onCommitted: () => void }) {
  const api = useAppApi()
  const again = useAction(() => api.post<CommitResult>(paths.importCommit(), { path: r.path }))
  const commit = again.result ?? r.commit
  const retry = async () => {
    const x = await again.run()
    if (x?.ok) onCommitted()
  }
  return (
    <div className="br-stack" data-testid="install-result">
      <dl className="br-facts">
        <dt>新分支</dt><dd className="br-mono">{r.branch}{r.base ? `（从 ${r.base} 建）` : ''}</dd>
        {r.worktree && (<><dt>工作目录</dt><dd className="br-mono">{r.worktree}</dd></>)}
        <dt>kit.json</dt><dd>{kitLine(r.kit)}</dd>
      </dl>
      {r.doctor.ran && (
        <div className="br-stack" style={{ gap: 4 }} data-testid="doctor">
          <b className="br-strong">brain doctor</b>
          {r.doctor.rows.length > 0 ? <CheckRows rows={r.doctor.rows} /> : <pre className="br-findings">{r.doctor.output || '（没有输出）'}</pre>}
        </div>
      )}
      {r.files.length > 0 && (
        <details>
          <summary>改了 {r.files.length} 个文件</summary>
          <ul className="br-plain br-changes br-mono br-small" data-testid="changed-files">
            {r.files.map((f) => <li key={f.path}>{CHANGE[f.change] ?? f.change} {f.path}</li>)}
          </ul>
        </details>
      )}
      {commit.ok ? (
        <p className="br-ok-text" role="status" data-testid="commit-ok">{commit.text}</p>
      ) : commit.text ? (
        <div className="br-banner is-error" role="alert" data-testid="commit-blocked">
          <p className="br-pre">{commit.text}</p>
          <div className="br-row">
            <button type="button" className="br-btn is-small" disabled={again.busy} onClick={() => void retry()}>{again.busy ? '正在提交…' : '再提交一次'}</button>
          </div>
        </div>
      ) : null}
      {again.error && <p className="br-error" role="alert">{again.error}</p>}
      {r.output && (
        <details>
          <summary>brain install 的输出</summary>
          <pre className="br-findings">{r.output}</pre>
        </details>
      )}
    </div>
  )
}

function PendingCard({ path, p, title, onChanged }: { path: string; p: PendingInstall; title?: string; onChanged: () => void }) {
  const api = useAppApi()
  const again = useAction(() => api.post<CommitResult>(paths.importCommit(), { path }))
  return (
    <section className="br-card is-wait" aria-label="装在新分支上" data-testid="pending">
      <header><h3>{title ?? `3 · ${p.state === 'merged' ? '已经合并' : '装在新分支上'}`}</h3></header>
      <p className="br-strong">{p.text}{p.commit ? `（提交 ${p.commit.slice(0, 8)}）` : ''}</p>
      {p.worktree && <p className="br-note">工作目录：<span className="br-mono">{p.worktree}</span></p>}
      {p.next && <p>{p.next}</p>}
      {p.mr_url && <p><ExtLink href={p.mr_url}>在 GitLab 上看 MR</ExtLink></p>}
      {p.state === 'uncommitted' && (
        <div className="br-row">
          <button type="button" className="br-btn" disabled={again.busy} onClick={async () => { const x = await again.run(); if (x?.ok) onChanged() }}>
            {again.busy ? '正在提交…' : '再提交一次'}
          </button>
          {again.result && !again.result.ok && <p className="br-bad-text br-pre" role="alert">{again.result.text}</p>}
          {again.error && <p className="br-error" role="alert">{again.error}</p>}
        </div>
      )}
      {p.state === 'branch' && p.remote_url && <PublishBox path={path} p={p} onDone={onChanged} />}
      {p.state === 'branch' && !p.remote_url && <p className="br-note">这个仓库没有 origin：推送和开 MR 用不了，可以在本机合并。</p>}
    </section>
  )
}

function PublishBox({ path, p, onDone }: { path: string; p: PendingInstall; onDone: () => void }) {
  const api = useAppApi()
  const [asking, setAsking] = useState(false)
  const pub = useAction((b: PublishBody) => api.post<PublishResult>(paths.importPublish(), b))
  const r = pub.result
  const send = async () => {
    const x = await pub.run({ path, branch: p.branch, target: p.target, remote_url: p.remote_url, confirm: true })
    if (x) {
      setAsking(false)
      if (x.ok) onDone()
    }
  }
  return (
    <div className="br-stack" style={{ gap: 8 }}>
      {!asking && (!r || !r.ok) && (
        <div className="br-row">
          <button type="button" className="br-btn" onClick={() => setAsking(true)}>
            <Icon name="GitPullRequest" size={14} />{r ? '再试一次' : p.pushed ? '再推送一次并开 MR' : '推送并开 MR'}
          </button>
          <span className="br-hint">可选：把这个分支推到远端，在 GitLab 上开 MR。</span>
        </div>
      )}
      {asking && (
        <div className="br-confirm" role="group" aria-label="确认推送" data-testid="publish-confirm">
          <p>
            会把分支 <code>{p.branch}</code> 推到 origin（<code>{p.remote_url}</code>）
            {p.gitlab_project ? <>，再在 GitLab 的 <code>{p.gitlab_project}</code> 上开 MR：<code>{p.branch}</code> → <code>{p.target}</code>。</> : '。kit.json 没写 GitLab 项目：MR 要你自己开。'}
          </p>
          {p.gitlab_project && !p.can_open_mr && <p className="br-hint">这台机器上没有 GitLab token：只推送，MR 用给出的命令或链接自己开。</p>}
          <div className="br-row">
            <button type="button" className="br-btn is-primary" disabled={pub.busy} onClick={() => void send()}>{pub.busy ? '正在推送…' : '确定推送'}</button>
            <button type="button" className="br-btn" disabled={pub.busy} onClick={() => setAsking(false)}>取消</button>
          </div>
        </div>
      )}
      {pub.error && <p className="br-error" role="alert">{pub.error}</p>}
      {r && <PublishOut r={r} />}
    </div>
  )
}

function PublishOut({ r }: { r: PublishResult }) {
  const [copied, setCopied] = useState('')
  const cmds = r.pushed ? r.commands.slice(1) : r.commands
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmds.join('\n'))
      setCopied('已复制')
    } catch {
      setCopied('没复制成：请手动选中')
    }
  }
  return (
    <div className="br-stack" style={{ gap: 6 }} data-testid="publish-result">
      <p className={r.ok ? 'br-ok-text br-pre' : 'br-bad-text br-pre'} role="status">{r.text}</p>
      {r.mr && <p><ExtLink href={r.mr.url}>MR !{r.mr.iid}</ExtLink></p>}
      {!r.mr && (
        <>
          {r.new_mr_url && <p><ExtLink href={r.new_mr_url}>在 GitLab 上开 MR</ExtLink></p>}
          {cmds.length > 0 && (
            <div className="br-stack" style={{ gap: 4 }}>
              <span className="br-hint">{r.pushed ? '或者在终端里开 MR：' : '在终端里自己做：'}</span>
              <pre className="br-findings" data-testid="commands">{cmds.join('\n')}</pre>
              <div className="br-row">
                <button type="button" className="br-btn is-small" onClick={() => void copy()}><Icon name="Copy" size={13} />复制</button>
                {copied && <span className="br-small br-dim" role="status">{copied}</span>}
              </div>
            </div>
          )}
        </>
      )}
      {r.output && (
        <details>
          <summary>git push 的输出</summary>
          <pre className="br-findings">{r.output}</pre>
        </details>
      )}
    </div>
  )
}

function AddCard({ path, pending, step, onAdded, go }: {
  path: string
  pending: PendingInstall | null
  step: number
  onAdded: (r: AddResult) => void
  go: ViewProps['go']
}) {
  const api = useAppApi()
  const add = useAction(() => api.post<AddResult>(paths.importAdd(), { path }))
  const run = async () => {
    const r = await add.run()
    if (r) onAdded(r)
  }
  const r = add.result
  return (
    <section className="br-card" aria-label="加入列表" data-testid="add">
      <header><h3>{step} · 加入列表</h3></header>
      {pending && <p className="br-note">加入以后，列表里这个仓库会显示「{pending.text}」，合并以后就能用。</p>}
      {!r && (
        <div className="br-row">
          <button type="button" className="br-btn is-primary" disabled={add.busy} onClick={() => void run()}>
            <Icon name="ListPlus" size={14} />{add.busy ? '正在加入…' : '加入列表'}
          </button>
        </div>
      )}
      {r && (
        <div className="br-banner is-ok" role="status" data-testid="added">
          <span>{r.text}</span>
          <div className="br-row">
            <button type="button" className="br-btn is-small" onClick={() => go({ kind: 'overview' })}>去交付总览</button>
            {r.status.repos.find((x) => x.id === r.id)?.ok && (
              <button type="button" className="br-btn is-small" onClick={() => go({ kind: 'new', repo: r.id })}>开需求</button>
            )}
          </div>
        </div>
      )}
      {add.error && <p className="br-error" role="alert">{add.error}</p>}
    </section>
  )
}
