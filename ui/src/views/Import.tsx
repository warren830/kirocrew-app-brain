/**
 * 导入仓库: how a project repo gets into the app, in the sample's look: a hero with the four steps as a Flow whose
 * states follow the wizard, then one numbered card per step:
 *
 *   1 从哪来   two big option cards: 本机目录 (a path, or one of the checkouts found under ~/workplace and ~/workspace),
 *              or 克隆 (a git URL, the folder it goes under, its name): the clone runs in the background (POST
 *              /import/clone, then GET /import/jobs/{id} until it ends; its steps as pills, the time it took) and the
 *              new folder is checked next.
 *   2 检查     POST /import/inspect, read only: what needs a look as rows with their ✓ / ! / ✗ chip, why and what to
 *              do (the rows that are fine folded); 「还没装 brain-kit」 is the next step, not a fault; 你是谁 holds its
 *              name box; KiroCrew's checks with their fixes (CheckRows). A check the person asked for scrolls to its
 *              card, so its answer and the next step's button are on the screen.
 *   3 安装     not installed: where it goes (ImportInspect.install: 「直接装在 <branch>」, recommended whenever it can
 *              be done, so a requirement can be opened today, or 「装到新分支，开 MR 给团队看」; one plain line each
 *              that says what it costs), the values of the repo's brain-kit settings as chips (the fields behind
 *              「改设置」, open when nothing could be guessed), the install's button right under them, then the install
 *              (POST /import/install with the mode, a job). Done: one line at the top says where it is and what comes
 *              next, with that step's button (开需求; 推送 <default> for a repo with a remote; on a branch 推送并开 MR or
 *              合并到 <default>), and the repo is put in the list by itself (POST /import/add).
 *              The self-check (brain doctor), the files and brain-kit's own output below it, folded. A hook that says
 *              no is shown as it said it; 「再提交一次」 (POST /import/commit). An install branch that can no longer go
 *              in (the default branch moved on): 「改成直接装在 <branch>」.
 *   4 加入列表  POST /import/add, for a repo installed before (an install here adds it by itself).
 *
 * A path from the URL (?path=) only fills the box: nothing runs before 检查.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { fmtSpan } from '../format'
import { useReducedMotion } from '../hooks'
import { JOB_POLL_MS, useJob } from '../jobs'
import type { ImportEntry } from '../nav'
import type { Tone } from '../styles'
import type {
  AddResult, CloneBody, CloneResult, CommitResult, FileChange, FoundRepo, ImportCheck, ImportDefaults, ImportInspect, ImportJob,
  InstallBody, InstallChoice, InstallMode, InstallResult, JobStart, KitForm, Level, PendingInstall, PublishBody, PublishResult,
} from '../types'
import {
  CheckRows, ExtLink, Flow, IMPORT_FLOW, Icon, JobSteps, LEVEL_LABEL, LEVEL_TONE, MeLine, PendingActions, PushBox, RoleIcon, type FlowStep,
} from '../ui'
import { TRACKER_NAME } from '../vocab'
import type { ViewProps } from './props'

export const HERO_TEXT = '把一个项目仓库导进来：先只读地检查它；没装 brain-kit 的，默认直接装在当前分支并提交，当天就能开需求（团队仓库推送以后就能开；也可以装到新分支、开 MR，合并以后才能开）；装好就自动加入列表，交付总览和开需求就能用它了。'
export const SAFE_INPLACE = '只提交安装写的文件，你自己没提交的改动不碰；用你自己的 git 身份提交，你的 git hook 照常跑；不会自己推送。'
export const SAFE_BRANCH = '只装在新分支上：从默认分支建，放在单独的工作目录里（设置里「每个需求的工作目录」下面）。你现在的检出、分支和改动都不动。提交用你自己的 git 身份，你的 git hook 照常跑。'
const GLYPH: Record<Level, string> = { OK: '✓', WARN: '!', FAIL: '✗' }
const CHANGE: Record<FileChange['change'], string> = { added: '新增', modified: '改动', deleted: '删除', other: '其他' }
const CHANGE_TONE: Record<FileChange['change'], Tone> = { added: 'ok', modified: 'warn', deleted: 'bad', other: 'idle' }
const CHANGE_ORDER: FileChange['change'][] = ['added', 'modified', 'deleted', 'other']
const EMPTY_FORM: KitForm = { req_prefix: '', tracker: 'none', jira_base: '', gitlab_base: '', gitlab_project: '', default_branch: 'main', team: '' }
type StepState = FlowStep['state']

/** The folder name a clone of *url* gets when the name is left empty (as the backend makes it). */
export function nameFromUrl(url: string): string {
  const last = url.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? ''
  return last.endsWith('.git') ? last.slice(0, -4) : last
}

/** 「还没装 brain-kit」 before an install: the next step, said in a neutral colour, not counted as a problem. */
const isNext = (c: ImportInspect, x: ImportCheck) => x.id === 'kit' && c.next === 'install' && c.kit.state === 'none'

export function ImportView({ entry, go, setStatus, reloadStatus, pollMs }: { entry: ImportEntry } & ViewProps) {
  const api = useAppApi()
  const jobMs = Math.min(pollMs ?? JOB_POLL_MS, JOB_POLL_MS)
  const defaults = usePoll<ImportDefaults>(paths.importDefaults(), 0)
  const [source, setSource] = useState<'local' | 'clone'>('local')
  const [path, setPath] = useState(entry.path ?? '')
  const [checked, setChecked] = useState<{ path: string; result: ImportInspect } | null>(null)
  const [added, setAdded] = useState<AddResult | null>(null)
  // a check the person asked for (检查, a checkout found, a clone) moves the page to its answer
  const [asked, setAsked] = useState(0)
  const inspect = useAction((p: string) => api.post<ImportInspect>(paths.importInspect(), { path: p }))
  const add = useAction((p: string) => api.post<AddResult>(paths.importAdd(), { path: p }))
  const runInspect = useCallback(async (p: string, show = false) => {
    const r = await inspect.run(p)
    if (!r) return
    setChecked({ path: p, result: r })
    if (show) setAsked((n) => n + 1)
  }, [inspect])
  const runAdd = async (p: string) => {
    const r = await add.run(p)
    if (r) {
      setAdded(r)
      setStatus(r.status)
    }
    return r
  }
  // an install that went in puts the repo in the list by itself, then the repo is checked again
  const install = useJob<InstallResult>(jobMs, (j) => {
    reloadStatus()
    if (j.state !== 'done' || !j.result?.commit.ok || !checked) return
    const p = checked.path
    void (async () => {
      if (!checked.result.listed) await runAdd(checked.result.path ?? p)
      await runInspect(p)
    })()
  })

  const c = checked?.result ?? null
  const stale = !!checked && source === 'local' && path.trim() !== checked.path
  const shown = c && !stale ? c : null
  const installFor = install.job && c?.path && install.job.target === c.path ? install.job : null
  const addedHere = added && shown?.path && added.status.repos.some((r) => r.id === added.id && r.path === shown.path) ? added : null
  const recheck = () => checked && void runInspect(checked.path)
  const pick = (p: string) => {
    setSource('local')
    setPath(p)
    void runInspect(p, true)
  }

  // ---- the four steps, as the wizard stands
  const installState = (): StepState => {
    if (!shown || shown.next === 'fix') return undefined
    if (installFor && installFor.state === 'done' && installFor.result?.commit.ok) return 'done'
    if (shown.next === 'add' || (shown.next === 'listed' && !shown.pending)) return 'off'
    if (shown.next === 'pending' || shown.next === 'listed') return shown.pending?.state === 'uncommitted' ? 'wait' : shown.install ? 'now' : 'done'
    if (!installFor || installFor.state === 'running') return 'now'
    if (installFor.state === 'failed') return 'bad'
    return installFor.result?.commit.ok ? 'done' : 'wait'
  }
  const s3 = installState()
  const s4: StepState = !shown || shown.next === 'fix' || shown.next === 'install' ? (addedHere ? 'done' : undefined)
    : shown.next === 'listed' || addedHere ? 'done' : 'now'
  const states: StepState[] = [shown ? 'done' : 'now', shown ? (shown.next === 'fix' ? 'bad' : 'done') : inspect.busy ? 'now' : undefined, s3, s4]
  const flow: FlowStep[] = IMPORT_FLOW.map((s, i) => ({ ...s, state: states[i], ...(i === 2 && s3 === 'off' ? { text: '已经装了：不用装' } : {}) }))
  // an install branch that can no longer go in: its card first, then the way out (改成直接装) under it
  const again = !!shown && !installFor && !!shown.install && shown.next !== 'install' && !!shown.pending
  const showInstall = !!shown && (shown.next === 'install' || !!installFor || again)
  const found = (defaults.data?.found ?? []).filter((f) => f.path !== shown?.path)
  const installCard = shown && (
    <InstallCard key={`install:${shown.path}`} c={shown} job={installFor} state={s3} readError={install.readError} onStart={install.start}
      onCommitted={async () => {
        if (shown.path && !shown.listed) await runAdd(shown.path)
        recheck()
      }}
      added={addedHere} addBusy={add.busy} addError={add.error} onAdd={() => shown.path && void runAdd(shown.path)}
      onChanged={() => { reloadStatus(); recheck() }} go={go} />
  )

  return (
    <main className="kt-root br-view imp-root" data-testid="br-import">
      <style>{IMP_CSS}</style>
      <section className="br-hero imp-hero" aria-label="导入仓库">
        <div>
          <h2>导入仓库</h2>
          <p>{HERO_TEXT}</p>
        </div>
        <Flow steps={flow} label="导入的步骤" />
      </section>

      <section className="br-card imp-sec" aria-label="从哪来">
        <StepHead n={1} title="从哪来" state={states[0]} sub="这台机器上的目录，或者从 GitLab 克隆" />
        <div className="imp-options" role="radiogroup" aria-label="从哪来">
          <SourceOption value="local" on={source === 'local'} icon="laptop" title="本机目录" text="这台机器上的检出；子目录、工作区也行" onPick={() => setSource('local')} />
          <SourceOption value="clone" on={source === 'clone'} icon="clone" title="克隆（git 地址）" text="先克隆到本机，再检查" onPick={() => setSource('clone')} />
        </div>
        {source === 'local' ? (
          <form className="imp-local" aria-label="本机目录" onSubmit={(e) => { e.preventDefault(); void runInspect(path.trim(), true) }}>
            {found.length > 0 && <FoundList found={found} busy={inspect.busy} onPick={pick} />}
            <div className="br-field">
              <label htmlFor="imp-path">仓库目录</label>
              <div className="imp-inline">
                <input id="imp-path" type="text" className="br-mono" value={path} placeholder="~/workplace/shop-pay" onChange={(e) => setPath(e.target.value)} />
                <button type="submit" className="br-btn is-primary is-big" disabled={!path.trim() || inspect.busy}>
                  <RoleIcon role="lint" size={17} />{inspect.busy ? '正在检查…' : '检查'}
                </button>
              </div>
              <p className="br-hint">以 / 或 ~ 开头的完整路径。仓库里的子目录、工作区也行：会找到仓库本身。只读，什么都不改。</p>
            </div>
            {stale && <p className="imp-stale" role="status"><i aria-hidden="true">!</i>目录改过了：再检查一遍。</p>}
          </form>
        ) : (
          <CloneForm defaults={defaults.data} ms={jobMs} onCloned={(p) => {
            setPath(p)
            void runInspect(p, true)
          }} />
        )}
        {inspect.error && <p className="br-error" role="alert">{inspect.error}</p>}
      </section>

      {shown && <InspectCard c={shown} busy={inspect.busy} state={states[1]} asked={asked} onRecheck={recheck} onFixed={() => { reloadStatus(); recheck() }} />}
      {showInstall && !again && installCard}
      {shown && !installFor && (shown.next === 'pending' || shown.next === 'listed') && shown.pending && shown.path && (
        <PendingCard key={`pending:${shown.path}`} path={shown.path} p={shown.pending} onChanged={() => { reloadStatus(); recheck() }} />
      )}
      {again && installCard}
      {shown && !installFor && shown.next === 'listed' && (
        <section className="br-card imp-sec is-ok" aria-label="加入列表">
          <StepHead n={4} title="加入列表" state="done" />
          <div className="imp-done" role="status" data-testid="next-listed">
            <span className="imp-mark" aria-hidden="true">✓</span>
            <div>
              <b>已经在列表里。</b>
              <small>{shown.pending ? shown.pending.next : '交付总览、开需求都能用它。'}</small>
            </div>
            <div className="br-row">
              {!shown.pending && shown.listed && (
                <button type="button" className="br-btn is-primary" onClick={() => go({ kind: 'new', repo: shown.listed as string })}><RoleIcon role="new" size={16} />开需求</button>
              )}
              <button type="button" className="br-btn" onClick={() => go({ kind: 'overview' })}><RoleIcon role="list" size={16} />去交付总览</button>
            </div>
          </div>
        </section>
      )}
      {shown && !installFor && (shown.next === 'add' || shown.next === 'pending') && shown.path && (
        <AddCard key={`add:${shown.path}`} pending={shown.next === 'pending' ? shown.pending : null} state={s4}
          result={addedHere} busy={add.busy} error={add.error} onAdd={() => shown.path && void runAdd(shown.path)} go={go} />
      )}
    </main>
  )
}

/** A card's head: its step number (✓ when done), its title, one line, and what goes on the right. */
function StepHead({ n, title, state, sub, children }: { n: number; title: string; state?: StepState; sub?: string; children?: ReactNode }) {
  return (
    <header className="imp-head" data-step={n} data-state={state}>
      <span className={`imp-n${state ? ` is-${state}` : ''}`} aria-hidden="true">{state === 'done' ? '✓' : n}</span>
      <h3>{title}</h3>
      {sub && <small data-testid={`sub-${n}`}>{sub}</small>}
      {children}
    </header>
  )
}

/** One of the two ways in, as a big card (the sample's scenario buttons); a radio underneath. */
function SourceOption({ value, on, icon, title, text, onPick }: { value: string; on: boolean; icon: string; title: string; text: string; onPick: () => void }) {
  const id = `imp-src-${value}`
  return (
    <label className={`imp-option${on ? ' is-on' : ''}`} data-source={value}>
      <input type="radio" name="imp-source" value={value} checked={on} onChange={onPick} aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} />
      <RoleIcon role={icon} size={30} />
      <b id={`${id}-t`}>{title}</b>
      <small id={`${id}-d`}>{text}</small>
      <span className="imp-tick" aria-hidden="true">{on ? '✓' : ''}</span>
    </label>
  )
}

/** The checkouts found on this machine: one click fills the path and checks it. */
function FoundList({ found, busy, onPick }: { found: FoundRepo[]; busy: boolean; onPick: (path: string) => void }) {
  return (
    <div className="imp-found" role="group" aria-label="这台机器上的仓库" data-testid="found">
      <span className="br-label">这台机器上的仓库（点一下就检查）</span>
      <ul>
        {found.map((f) => (
          <li key={f.path}>
            <button type="button" className="imp-found-btn" disabled={busy} title={f.path} onClick={() => onPick(f.path)}>
              <RoleIcon role="file" size={15} />
              <b>{f.name}</b>
              <code>{f.path.replace(/^\/(?:Users|home)\/[^/]+/, '~')}</code>
              {f.listed ? <span className="br-chip tone-ok">已在列表里</span> : f.installed ? <span className="br-chip tone-info">已装 brain-kit</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
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
    <form className="imp-clone" aria-label="克隆" onSubmit={(e) => { e.preventDefault(); void run() }}>
      <div className="imp-grid">
        <div className="br-field is-full">
          <label htmlFor="imp-url">仓库地址</label>
          <input id="imp-url" type="text" className="br-mono" value={url} placeholder="git@gitlab.example.com:组/仓库.git" onChange={(e) => setUrl(e.target.value)} />
          <p className="br-hint">SSH 或 https 地址。别把密码或 token 写进地址：这里不会弹窗问密码。</p>
        </div>
        <div className="br-field">
          <label htmlFor="imp-parent">放在哪个目录下</label>
          <input id="imp-parent" type="text" className="br-mono" value={parentValue} onChange={(e) => setParent(e.target.value)} />
          <p className="br-hint">别放进每个需求的工作目录{defaults?.work_root ? `（${defaults.work_root}）` : ''}里面。</p>
        </div>
        <div className="br-field">
          <label htmlFor="imp-name">目录名（可不填）</label>
          <input id="imp-name" type="text" className="br-mono" value={name} placeholder={nameFromUrl(url) || 'shop-pay'} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <div className="br-row">
        <button type="submit" className="br-btn is-primary is-big" disabled={!url.trim() || start.busy || running}>
          <RoleIcon role="clone" size={17} />{running ? '正在克隆…' : '克隆'}
        </button>
      </div>
      {start.error && <p className="br-error" role="alert">{start.error}</p>}
      {clone.job && <JobBox job={clone.job} what="克隆" readError={clone.readError} />}
      {clone.job?.state === 'done' && clone.job.result?.path && <p className="br-ok-text" role="status">克隆好了：{clone.job.result.path}。下面是它的检查。</p>}
    </form>
  )
}

/** A background job: its state as a pill, the time it has taken, its steps as pills (JobSteps). */
function JobBox({ job, what, readError }: { job: ImportJob<unknown>; what: string; readError?: string }) {
  const running = job.state === 'running'
  const stepFailed = job.steps.some((s) => s.state === 'fail')
  const [tone, glyph, word] = running ? ['run', '●', `正在${what}`]
    : job.state === 'failed' ? ['bad', '✕', `${what}没成`]
      : stepFailed ? ['warn', '!', '有一步没成'] : ['ok', '✓', `${what}好了`]
  const secs = (job.ended_at ?? Date.now() / 1000) - job.started_at
  const took = secs < 1 ? '不到 1 秒' : fmtSpan(secs)
  return (
    <div className={`imp-job tone-${tone}`} role="group" aria-label={`${what}的进度`} data-job={job.kind}>
      <div className="imp-job-head">
        <span className={`br-chip kt-pill tone-${tone}${running ? ' is-live' : ''}`}><i aria-hidden="true">{glyph}</i>{word}</span>
        <span className="imp-elapsed" data-testid={`elapsed-${job.kind}`}>{running ? `已经 ${took}` : `用了 ${took}`}</span>
      </div>
      <JobSteps job={job} />
      {readError && <p className="br-note" role="status">{readError}</p>}
    </div>
  )
}

/** *todo*: what stands in a row's 做什么 instead of its words (你是谁's name box: the box is the thing to do). */
function CheckList({ rows, next, todo }: { rows: ImportCheck[]; next?: (x: ImportCheck) => boolean; todo?: (x: ImportCheck) => ReactNode }) {
  return (
    <ul className="imp-checks" data-testid="import-checks">
      {rows.map((x) => {
        const n = next?.(x) ?? false
        const instead = todo?.(x)
        return (
          <li key={x.id} className={`imp-check is-${n ? 'next' : x.level}`} data-check={x.id} data-level={n ? 'next' : x.level}>
            <span className={`imp-glyph tone-${n ? 'info' : LEVEL_TONE[x.level]}`} role="img" aria-label={n ? '下一步' : LEVEL_LABEL[x.level]}>{n ? '→' : GLYPH[x.level]}</span>
            <span className="imp-check-main"><b>{x.label}</b><span className="br-pre">{x.why}</span></span>
            {instead ? <span className="imp-todo is-box">{instead}</span> : x.todo && <span className="imp-todo"><b>做什么</b>{x.todo}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** ✓ 8 · ! 1 · ✗ 4: how many rows of each level. */
function Counts({ levels }: { levels: Level[] }) {
  const n = (l: Level) => levels.filter((x) => x === l).length
  return (
    <span className="imp-counts">
      {(['OK', 'WARN', 'FAIL'] as Level[]).filter((l) => n(l) > 0).map((l) => (
        <span key={l} className={`br-chip kt-pill tone-${LEVEL_TONE[l]}`} data-count={l}>
          <i aria-hidden="true">{GLYPH[l]}</i>{n(l)}<span className="br-sr"> 项{LEVEL_LABEL[l]}</span>
        </span>
      ))}
    </span>
  )
}

function InspectCard({ c, busy, state, asked, onRecheck, onFixed }: {
  c: ImportInspect; busy: boolean; state: StepState; asked: number; onRecheck: () => void; onFixed: () => void
}) {
  const ref = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    if (asked) ref.current?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }, [asked]) // eslint-disable-line react-hooks/exhaustive-deps
  const next = (x: ImportCheck) => isNext(c, x)
  const meBox = (x: ImportCheck) => (x.id === 'me' && c.me?.ask && c.path ? <MeLine key={c.path} path={c.path} me={c.me} onSaved={onFixed} /> : null)
  const meInRow = c.checks.some((x) => x.id === 'me' && x.level !== 'OK')
  const look = c.checks.filter((x) => x.level !== 'OK' || next(x))
  const fine = c.checks.filter((x) => x.level === 'OK' && !next(x))
  const crewLook = c.crew.rows.filter((r) => r.level !== 'OK')
  const crewFine = c.crew.rows.filter((r) => r.level === 'OK')
  return (
    <section ref={ref} className={`br-card imp-sec${c.next === 'fix' ? ' is-bad' : ''}`} aria-label="检查" data-testid="inspect">
      <StepHead n={2} title="检查" state={state}>
        {c.path && <code className="imp-path">{c.path}</code>}
        <Counts levels={c.checks.filter((x) => !next(x)).map((x) => x.level)} />
        <button type="button" className="br-btn is-small imp-end" disabled={busy} onClick={onRecheck}>
          <Icon name="RefreshCw" size={13} />{busy ? '正在检查…' : '再检查一遍'}
        </button>
      </StepHead>
      {c.note && <p className="br-hint">{c.note}</p>}
      {c.error && <p className="br-error" role="alert">{c.error}</p>}
      {look.length > 0 && <CheckList rows={look} next={next} todo={meBox} />}
      {fine.length > 0 && (
        <details className="imp-more" data-testid="checks-fine" open={look.length === 0 || undefined}>
          <summary>{look.length ? `另外 ${fine.length} 项正常` : `${fine.length} 项都正常`}</summary>
          <CheckList rows={fine} />
        </details>
      )}
      {c.me?.ask && c.path && !meInRow && <MeLine key={c.path} path={c.path} me={c.me} onSaved={onFixed} />}
      {c.crew.rows.length > 0 && crewLook.length === 0 && (
        <details className="imp-more imp-block" data-testid="crew-fine">
          <summary><span className="imp-block-head imp-sum"><RoleIcon role="settings" size={18} /><b>KiroCrew</b><Counts levels={crewFine.map((r) => r.level)} />都正常</span></summary>
          <CheckRows rows={crewFine} />
        </details>
      )}
      {crewLook.length > 0 && (
        <div className="imp-block">
          <div className="imp-block-head"><RoleIcon role="settings" size={18} /><b>KiroCrew</b><Counts levels={c.crew.rows.map((r) => r.level)} /></div>
          <CheckRows rows={crewLook} fix={c.crew.fix} onFixed={onFixed} />
          {crewFine.length > 0 && (
            <details className="imp-more">
              <summary>另外 {crewFine.length} 项正常</summary>
              <CheckRows rows={crewFine} />
            </details>
          )}
        </div>
      )}
      {c.next === 'fix' && (
        <div className="imp-verdict" data-testid="next-fix">
          <RoleIcon role="blocked" size={20} />
          <b>先处理上面打 ✗ 的几行，再检查一遍。</b>
        </div>
      )}
    </section>
  )
}

/** The repo's brain-kit settings (.brain/kit.json), as chips (the form's live preview, and the install's result). */
function KitChips({ k }: { k: KitForm }) {
  const prefix = k.req_prefix.trim().toUpperCase()
  const items: [string, string][] = [
    ['需求号', k.tracker === 'jira' ? 'Jira 上的号' : prefix ? `${prefix}-1` : ''],
    ['跟踪', TRACKER_NAME[k.tracker] ?? k.tracker],
    ['默认分支', k.default_branch.trim()],
    ['GitLab', k.gitlab_project.trim() || '不用 GitLab'],
    ['团队', k.team.trim()],
  ]
  return (
    <ul className="imp-kv" aria-label="这个仓库的 brain-kit 设置">
      {items.map(([label, value]) => (
        <li key={label} className={value ? undefined : 'is-empty'}><small>{label}</small><b>{value || '—'}</b></li>
      ))}
    </ul>
  )
}

function InstallCard({ c, job, state, readError, onStart, onCommitted, added, addBusy, addError, onAdd, onChanged, go }: {
  c: ImportInspect
  job: ImportJob<InstallResult> | null
  state: StepState
  readError: string
  onStart: (j: ImportJob<InstallResult> | null) => void
  onCommitted: () => void
  added: AddResult | null
  addBusy: boolean
  addError: string
  onAdd: () => void
  onChanged: () => void
  go: ViewProps['go']
}) {
  const api = useAppApi()
  const [form, setForm] = useState<KitForm>(() => c.form ?? EMPTY_FORM)
  // the guessed values as chips; their fields only when asked, or when nothing could be guessed
  const [editing, setEditing] = useState(() => !c.form?.req_prefix)
  const [branch, setBranch] = useState(c.branch)
  const choice = c.install
  // an install branch that can no longer go in: installing in place instead (the backend offers that option only)
  const again = c.next !== 'install' && !!c.pending
  // what the person picked, while it is still possible (a re-check can refuse it); else the recommended way
  const [want, setMode] = useState<InstallMode | null>(null)
  const can = choice?.options.filter((o) => o.ok) ?? []
  const mode: InstallMode = (can.some((o) => o.mode === want) ? want : null)
    ?? can.find((o) => o.mode === choice?.recommend)?.mode ?? can[0]?.mode ?? 'inplace'
  const start = useAction((b: InstallBody) => api.post<JobStart>(paths.importInstall(), b))
  const edit = (f: Partial<KitForm>) => setForm((x) => ({ ...x, ...f }))
  const running = job?.state === 'running'
  const done = job?.state === 'done' && !!job.result?.commit.ok
  const here = choice?.current || c.current_branch || '当前分支'
  const picked = choice?.options.find((o) => o.mode === mode)
  const run = async () => {
    if (!c.path) return
    const r = await start.run({ path: c.path, branch: mode === 'branch' ? branch.trim() : '', mode, kit: { ...form, req_prefix: form.req_prefix.trim().toUpperCase() } })
    if (r) onStart(r.job as ImportJob<InstallResult>)
  }
  const fromOrigin = !!c.origin?.project && form.gitlab_project === c.origin.project
  const jira = form.tracker === 'jira'
  const r = job && !running ? job.result : null
  const sub = done && r ? (r.mode === 'inplace' ? `装好了，提交在 ${r.branch}` : `装在 ${r.branch} 分支上，合进 ${r.target || '默认分支'} 以后生效`)
    : running ? '正在装…'
      : job?.state === 'failed' ? '没装成'
        : again ? `这个安装分支合不进去了：改成直接装在 ${here}`
          : '这个仓库还没装 brain-kit（会一起装上 AI-DLC Lean、Brain 文件、AGENTS.md）'
  return (
    <section className={`br-card imp-sec${done ? ' is-ok' : ''}`} aria-label="安装" data-testid="install">
      <StepHead n={3} title="安装" state={state} sub={sub} />
      {!job && (
        <>
          {again && (
            <p className="imp-where" data-testid="install-again">
              <RoleIcon role="commit" size={18} /><b>改成直接装在 {here}</b>
              <span>装好以后，删掉没推送的 {c.pending?.branch} 分支和它的工作目录（那次没合进去的安装）。{picked?.line ?? ''}</span>
            </p>
          )}
          {!again && (choice && choice.options.length > 1 ? (
            <div className="imp-options" role="radiogroup" aria-label="装在哪" data-testid="install-modes">
              {choice.options.map((o) => (
                <ModeOption key={o.mode} o={o} on={mode === o.mode} rec={o.mode === choice.recommend} onPick={() => setMode(o.mode)} />
              ))}
            </div>
          ) : (
            <p className="imp-where" data-testid="install-where"><RoleIcon role="commit" size={18} /><b>{picked?.title ?? `直接装在 ${here}`}</b><span>{picked?.line ?? ''}</span></p>
          ))}
          <form className={`imp-install${editing ? ' is-editing' : ''}`} aria-label="这个仓库的 brain-kit 设置" onSubmit={(e) => { e.preventDefault(); void run() }}>
            {editing && <div className="imp-grid">
              <div className="br-field">
                <label htmlFor="imp-prefix">需求号前缀</label>
                <input id="imp-prefix" type="text" className="br-mono" value={form.req_prefix} onChange={(e) => edit({ req_prefix: e.target.value.toUpperCase() })} />
                <p className="br-hint">{form.req_prefix ? `需求号会是 ${form.req_prefix}-1、${form.req_prefix}-2 …` : '大写字母开头，最多 10 个，比如 PAY'}</p>
              </div>
              <div className="br-field">
                <span className="br-label" id="imp-tracker-l">跟踪方式</span>
                <div className="imp-seg" role="radiogroup" aria-labelledby="imp-tracker-l">
                  <label className={`imp-opt${!jira ? ' is-on' : ''}`}>
                    <input type="radio" name="imp-tracker" checked={!jira} onChange={() => edit({ tracker: 'none' })} />
                    <span>不用 Jira：按顺序给号</span>
                  </label>
                  <label className={`imp-opt${jira ? ' is-on' : ''}`}>
                    <input type="radio" name="imp-tracker" checked={jira} onChange={() => edit({ tracker: 'jira' })} />
                    <span>用 Jira 的号</span>
                  </label>
                </div>
              </div>
              {jira && (
                <div className="br-field is-full">
                  <label htmlFor="imp-jira">Jira 地址</label>
                  <input id="imp-jira" type="text" className="br-mono" value={form.jira_base} placeholder="https://jira.example.com" onChange={(e) => edit({ jira_base: e.target.value })} />
                </div>
              )}
              <div className="br-field">
                <label htmlFor="imp-gl-base">GitLab 地址</label>
                <input id="imp-gl-base" type="text" className="br-mono" value={form.gitlab_base} placeholder="https://gitlab.example.com" onChange={(e) => edit({ gitlab_base: e.target.value })} />
              </div>
              <div className="br-field">
                <label htmlFor="imp-gl-project">GitLab 项目</label>
                <input id="imp-gl-project" type="text" className="br-mono" value={form.gitlab_project} placeholder="组/仓库" onChange={(e) => edit({ gitlab_project: e.target.value })} />
                <p className="br-hint">{fromOrigin ? '按远端的地址猜的：检查一下。' : '交接和开 MR 用。不用 GitLab 就两个都空着。'}</p>
              </div>
              <div className="br-field">
                <label htmlFor="imp-default">默认分支</label>
                <input id="imp-default" type="text" className="br-mono" value={form.default_branch} onChange={(e) => edit({ default_branch: e.target.value })} />
              </div>
              <div className="br-field">
                <label htmlFor="imp-team">团队（可不填）</label>
                <input id="imp-team" type="text" value={form.team} onChange={(e) => edit({ team: e.target.value })} />
              </div>
              {mode === 'branch' && (
                <div className="br-field">
                  <label htmlFor="imp-branch">新分支名</label>
                  <input id="imp-branch" type="text" className="br-mono" value={branch} onChange={(e) => setBranch(e.target.value)} />
                </div>
              )}
            </div>}
            <aside className="imp-preview" aria-label="会写进这个仓库的 brain-kit 设置">
              <span className="imp-preview-head">
                <b title="写在这个仓库的 .brain/kit.json">会写进这个仓库的 brain-kit 设置</b>
                {!editing && (
                  <>
                    <button type="button" className="br-btn is-small" onClick={() => setEditing(true)}><Icon name="Pencil" size={13} />改设置</button>
                    <small className="br-hint" data-testid="install-guess">按这个仓库{fromOrigin ? '的远端地址' : ''}猜的：对的话直接装；要改，点「改设置」。</small>
                  </>
                )}
              </span>
              <KitChips k={form} />
              {/* in place, where the commit goes is the picked way's own line above */}
              {mode === 'branch' && (
                <div className="imp-route" aria-label="新分支从哪来">
                  <code>{form.default_branch.trim() || 'main'}</code>
                  <span className="imp-arrow" aria-hidden="true">→</span>
                  <code className="is-new">{branch.trim() || '—'}</code>
                  <small>{c.origin ? '从远端的默认分支建新分支' : '新分支'}，单独的工作目录；合并以后才能开需求</small>
                </div>
              )}
              <div className="imp-go">
                <button type="submit" className="br-btn is-primary is-big"
                  disabled={start.busy || !picked?.ok && !!choice || !form.req_prefix.trim() || !form.default_branch.trim() || (mode === 'branch' && !branch.trim())}>
                  <RoleIcon role={mode === 'branch' ? 'handover' : 'commit'} size={17} />
                  {start.busy ? '正在开始…' : mode === 'branch' ? '安装到新分支' : again ? `改成直接装在 ${here}` : `直接装在 ${here}`}
                </button>
                <p className="imp-safe" data-testid="install-safe"><RoleIcon role="security" size={18} /><span>{mode === 'branch' ? SAFE_BRANCH : SAFE_INPLACE}</span></p>
              </div>
              {start.error && <p className="br-error" role="alert">{start.error}</p>}
            </aside>
          </form>
        </>
      )}
      {job && <JobBox job={job} what="安装" readError={readError} />}
      {r && r.commit.ok && (
        <NextBox r={r} c={c} added={added} addBusy={addBusy} addError={addError} onAdd={onAdd} onChanged={onChanged} go={go} />
      )}
      {r && <InstallOut r={r} onCommitted={onCommitted} />}
      {job && job.state === 'failed' && (
        <div className="br-row">
          <button type="button" className="br-btn is-small" onClick={() => onStart(null)}>改一下再装</button>
        </div>
      )}
    </section>
  )
}

/**
 * After an install that went in: where it is, that it is in the list, and the one next step with its button. In place
 * without a remote: 开需求. With a remote: 推送 <default> first (`brain start` branches from origin). On a branch: the
 * team's way (推送并开 MR) or 合并到 <default> without a remote, the recommended one first.
 */
function NextBox({ r, c, added, addBusy, addError, onAdd, onChanged, go }: {
  r: InstallResult
  c: ImportInspect
  added: AddResult | null
  addBusy: boolean
  addError: string
  onAdd: () => void
  onChanged: () => void
  go: ViewProps['go']
}) {
  const [pushed, setPushed] = useState(false)
  const inplace = r.mode === 'inplace'
  const listedId = added?.id ?? c.listed
  const target = r.target || '默认分支'
  const p = inplace ? null : c.pending
  const ready = inplace && (!r.remote_url || pushed)
  const head = inplace ? `装好了，提交在 ${r.branch} 上` : `装在 ${r.branch} 分支上`
  const line = ready ? '现在就能开需求了。'
    : inplace ? `推送 ${r.branch} 以后就能开需求。`
      : `合进 ${target} 以后才能开需求。${p?.next && !p.mr_url ? `下一步：${p.next}。` : ''}`
  return (
    <div className={`imp-done${ready ? '' : ' is-wait'}`} role="status" data-testid="install-next">
      <span className="imp-mark" aria-hidden="true">{ready ? '✓' : '✋'}</span>
      <div>
        <b>{head}{listedId ? '，已经加入列表' : ''}</b>
        <small>{line}</small>
        {!listedId && (
          <span className="br-row">
            <button type="button" className="br-btn is-small" disabled={addBusy} onClick={onAdd}><RoleIcon role="list" size={14} />{addBusy ? '正在加入…' : '加入列表'}</button>
            {addError && <span className="br-error" role="alert">{addError}</span>}
          </span>
        )}
        {inplace && r.remote_url && (
          <PushBox path={r.path} branch={r.branch} remoteUrl={r.remote_url} target={r.target} onDone={() => setPushed(true)} />
        )}
        {p && p.state === 'branch' && p.remote_url && !p.mr_url && <PublishBox path={r.path} p={p} primary onDone={onChanged} />}
        {p && (p.merge || p.pull || p.mr_url) && <PendingActions key={`${p.state}:${p.branch}`} path={r.path} p={p} onDone={onChanged} />}
      </div>
      <div className="br-row">
        {ready && listedId && (
          <button type="button" className="br-btn is-primary" onClick={() => go({ kind: 'new', repo: listedId })}><RoleIcon role="new" size={16} />开需求</button>
        )}
        <button type="button" className="br-btn" onClick={() => go({ kind: 'overview' })}><RoleIcon role="list" size={16} />去交付总览</button>
      </div>
    </div>
  )
}

/** One of the two places an install goes, as a big card (like 从哪来's): the title, its one line (or why it cannot be
 * done now), 推荐 on the recommended one. */
function ModeOption({ o, on, rec, onPick }: { o: InstallChoice; on: boolean; rec: boolean; onPick: () => void }) {
  const id = `imp-mode-${o.mode}`
  return (
    <label className={`imp-option${on ? ' is-on' : ''}${o.ok ? '' : ' is-off'}`} data-mode={o.mode}>
      <input type="radio" name="imp-mode" value={o.mode} checked={on} disabled={!o.ok} onChange={onPick} aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} />
      <RoleIcon role={o.mode === 'branch' ? 'handover' : 'commit'} size={30} />
      <b id={`${id}-t`}>{o.title}{rec && <span className="br-chip tone-ok imp-rec">推荐</span>}</b>
      <small id={`${id}-d`}>{o.ok ? o.line : o.why}</small>
      <span className="imp-tick" aria-hidden="true">{on ? '✓' : ''}</span>
    </label>
  )
}

/** What the install did: where the commit is, the self-check (what needs a look; the rest folded), the files, the raw
 * output folded. */
function InstallOut({ r, onCommitted }: { r: InstallResult; onCommitted: () => void }) {
  const api = useAppApi()
  const again = useAction(() => api.post<CommitResult>(paths.importCommit(), { path: r.path }))
  const commit = again.result ?? r.commit
  const retry = async () => {
    const x = await again.run()
    if (x?.ok) onCommitted()
  }
  const groups = CHANGE_ORDER.map((ch) => [ch, r.files.filter((f) => (CHANGE[f.change] ? f.change : 'other') === ch)] as const).filter(([, fs]) => fs.length > 0)
  const okRows = r.doctor.rows.filter((x) => x.level === 'OK')
  const inplace = r.mode === 'inplace'
  return (
    <div className="imp-result" data-testid="install-result">
      <dl className="imp-facts">
        {inplace ? (
          <div><dt>提交在</dt><dd><code>{r.branch}</code>（你现在的检出）</dd></div>
        ) : (
          <div><dt>新分支</dt><dd><code>{r.branch}</code>{r.base ? `（从${r.base.startsWith('origin/') ? `远端的 ${r.base.slice('origin/'.length)}` : ` ${r.base}`} 建）` : ''}</dd></div>
        )}
        {r.worktree && <div><dt>工作目录</dt><dd><code>{r.worktree}</code></dd></div>}
        <div><dt>brain-kit 设置</dt><dd><KitChips k={r.kit} /></dd></div>
      </dl>
      {commit.ok ? (
        <div className="imp-commit is-ok" data-testid="commit-ok">
          <span className="imp-mark" aria-hidden="true">✓</span>
          <div><b className="br-pre">{commit.text}</b></div>
        </div>
      ) : commit.text ? (
        <div className="imp-commit is-bad" role="alert" data-testid="commit-blocked">
          <span className="imp-mark" aria-hidden="true">✕</span>
          <div>
            <p className="br-pre">{commit.text}</p>
            <div className="br-row">
              <button type="button" className="br-btn is-primary" disabled={again.busy} onClick={() => void retry()}>
                <RoleIcon role="commit" size={16} />{again.busy ? '正在提交…' : '再提交一次'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {again.error && <p className="br-error" role="alert">{again.error}</p>}
      {r.doctor.ran && (
        <div className="imp-block" data-testid="doctor">
          <div className="imp-block-head"><RoleIcon role="ci" size={18} /><b>自检</b><Counts levels={r.doctor.rows.map((x) => x.level)} /></div>
          {r.doctor.rows.length > 0 ? (
            <>
              <CheckRows rows={r.doctor.rows} only={['FAIL', 'WARN']} />
              {okRows.length > 0 && (
                <details className="imp-more">
                  <summary>{okRows.length === r.doctor.rows.length ? `${okRows.length} 项都正常` : `另外 ${okRows.length} 项正常`}</summary>
                  <CheckRows rows={okRows} />
                </details>
              )}
            </>
          ) : <p className="br-note">自检没给出结果：原始输出在下面的「细节」里。</p>}
        </div>
      )}
      {r.files.length > 0 && (
        <details className="imp-more imp-block" data-testid="files">
          <summary><b>{inplace ? `提交了 ${r.files.length} 个文件` : `改了 ${r.files.length} 个文件`}</b></summary>
          <div className="imp-files" data-testid="changed-files">
            {groups.map(([ch, fs]) => (
              <div key={ch} className="imp-fgroup" data-change={ch}>
                <span className={`br-chip kt-pill tone-${CHANGE_TONE[ch]}`}>{CHANGE[ch]} <b>{fs.length}</b></span>
                <ul>{fs.map((f) => <li key={f.path} className="br-tag br-mono">{f.path}</li>)}</ul>
              </div>
            ))}
          </div>
        </details>
      )}
      {(r.output || r.doctor.output) && (
        <details className="imp-more">
          <summary>细节：安装和自检时 brain-kit 的原话</summary>
          <pre className="br-findings">{[r.output, r.doctor.output].filter(Boolean).join('\n\n')}</pre>
        </details>
      )}
    </div>
  )
}

/** the chip of an older backend's pending state, which has no word of its own */
const PENDING_WORD: Record<PendingInstall['state'], string> = { branch: '在分支上', uncommitted: '还没提交', merged: '要拉取' }

function PendingCard({ path, p, onChanged }: { path: string; p: PendingInstall; onChanged: () => void }) {
  const api = useAppApi()
  const again = useAction(() => api.post<CommitResult>(paths.importCommit(), { path }))
  return (
    <section className="br-card imp-sec is-wait" aria-label="装在新分支上" data-testid="pending">
      <StepHead n={3} title={p.state === 'merged' ? `已经合进 ${p.target || '默认分支'}` : '装在新分支上'}
        state={p.state === 'uncommitted' ? 'wait' : 'done'} />
      <div className="imp-pend">
        <span className="br-chip kt-pill tone-wait is-live"><i aria-hidden="true">✋</i>{p.word || PENDING_WORD[p.state]}</span>
        <b>{p.text}</b>
        {p.commit && <code className="br-tag" title="提交">{p.commit.slice(0, 8)}</code>}
      </div>
      {(p.worktree || p.next) && (
        <dl className="imp-facts">
          {p.worktree && <div><dt>工作目录</dt><dd><code>{p.worktree}</code></dd></div>}
          {p.next && <div><dt>下一步</dt><dd>{p.next}</dd></div>}
        </dl>
      )}
      {p.state === 'uncommitted' && (
        <div className="br-row">
          <button type="button" className="br-btn is-primary" disabled={again.busy} onClick={async () => { const x = await again.run(); if (x?.ok) onChanged() }}>
            <RoleIcon role="commit" size={16} />{again.busy ? '正在提交…' : '再提交一次'}
          </button>
          {again.result && !again.result.ok && <p className="br-bad-text br-pre" role="alert">{again.result.text}</p>}
          {again.error && <p className="br-error" role="alert">{again.error}</p>}
        </div>
      )}
      {(p.merge || p.pull || p.mr_url) && <PendingActions key={`${p.state}:${p.branch}`} path={path} p={p} onDone={onChanged} />}
      {p.state === 'branch' && p.remote_url && !p.mr_url && <PublishBox path={path} p={p} primary onDone={onChanged} />}
    </section>
  )
}

function PublishBox({ path, p, primary = false, onDone }: { path: string; p: PendingInstall; primary?: boolean; onDone: () => void }) {
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
    <div className="imp-block">
      {!asking && (!r || !r.ok) && (
        <div className="br-row">
          <button type="button" className={`br-btn${primary ? ' is-primary' : ''}`} onClick={() => setAsking(true)}>
            <RoleIcon role="pr" size={16} />{r ? '再试一次' : p.pushed ? '再推送一次并开 MR' : '推送并开 MR'}
          </button>
          <span className="br-hint">把这个分支推到远端，在 GitLab 上开 MR；MR 合并以后点「拉取」，就能开需求。</span>
        </div>
      )}
      {asking && (
        <div className="br-confirm imp-confirm" role="group" aria-label="确认推送" data-testid="publish-confirm">
          <span className="imp-confirm-head"><RoleIcon role="pr" size={18} /><b>推送之前确认一下</b></span>
          <p>
            会把分支 <code>{p.branch}</code> 推到远端（<code>{p.remote_url}</code>）
            {p.gitlab_project ? <>，再在 GitLab 的 <code>{p.gitlab_project}</code> 上开 MR：<code>{p.branch}</code> → <code>{p.target}</code>。</> : '。这个仓库的 brain-kit 设置没写 GitLab 项目：MR 要你自己开。'}
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
    <div className={`imp-commit ${r.ok ? 'is-ok' : 'is-bad'}`} data-testid="publish-result">
      <span className="imp-mark" aria-hidden="true">{r.ok ? '✓' : '✕'}</span>
      <div>
        <p className="br-pre br-strong" role="status">{r.text}</p>
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
          <details className="imp-more">
            <summary>细节：推送时 git 的原话</summary>
            <pre className="br-findings">{r.output}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

/** 加入列表 of a repo installed before (an install here adds the repo by itself). */
function AddCard({ pending, state, result: r, busy, error, onAdd, go }: {
  pending: PendingInstall | null
  state: StepState
  result: AddResult | null
  busy: boolean
  error: string
  onAdd: () => void
  go: ViewProps['go']
}) {
  const info = r?.status.repos.find((x) => x.id === r.id)
  return (
    <section className={`br-card imp-sec${r ? ' is-ok' : ''}`} aria-label="加入列表" data-testid="add">
      <StepHead n={4} title="加入列表" state={state} sub={pending ? '合并以后才能开需求' : '最后一步'} />
      {!r && (
        <div className="imp-final">
          <button type="button" className={`br-btn is-big${pending ? '' : ' is-primary'}`} disabled={busy} onClick={onAdd}>
            <RoleIcon role="list" size={18} />{busy ? '正在加入…' : pending ? '先加入列表' : '加入列表'}
          </button>
          <span className="br-hint">{pending ? `加入以后，列表里这个仓库会显示「${pending.text}」；合并以后才能开需求。` : '加入以后，交付总览和开需求就能用它。'}</span>
        </div>
      )}
      {r && (
        <div className="imp-done" role="status" data-testid="added">
          <span className="imp-mark" aria-hidden="true">✓</span>
          <div>
            <b>{r.text}</b>
            <small>{info?.ok ? '现在就能开需求了。' : info?.pending?.next ?? '装好以后就能用。'}</small>
          </div>
          <div className="br-row">
            {info?.ok && (
              <button type="button" className="br-btn is-primary" onClick={() => go({ kind: 'new', repo: r.id })}><RoleIcon role="new" size={16} />开需求</button>
            )}
            <button type="button" className="br-btn" onClick={() => go({ kind: 'overview' })}><RoleIcon role="list" size={16} />去交付总览</button>
          </div>
        </div>
      )}
      {error && <p className="br-error" role="alert">{error}</p>}
    </section>
  )
}

/** 导入仓库's own look: the option cards, the check rows, the install form and its preview, the job, the result. Its
 * breakpoints follow the view's own width (a container), not the window: the app sits next to KiroCrew's sidebar. */
const IMP_CSS = `
.imp-root { container: imp / inline-size; }
.imp-hero { gap: 16px; padding: 22px 26px; }
.imp-hero h2 { margin-bottom: 4px; }
.imp-sec { gap: 14px; }
.imp-head { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }
.imp-head h3 { font-size: 1.15em; font-weight: 800; color: var(--text-strong); margin: 0; }
.imp-head small { color: var(--muted); font-size: .88em; }
.imp-head .imp-end { margin-left: auto; }
.imp-n { display: inline-grid; place-items: center; width: 1.75em; height: 1.75em; border-radius: 50%; font-size: .88em; font-weight: 850;
  background: color-mix(in srgb, var(--muted) 24%, transparent); color: var(--text-strong); }
.imp-n.is-done { background: var(--kt-ok-solid); color: #fff; }
.imp-n.is-now { background: var(--accent); color: var(--accent-fg, #fff); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
.imp-n.is-bad { background: var(--kt-bad-solid); color: #fff; }
.imp-n.is-wait { background: var(--kt-approve); color: var(--kt-on); }
.imp-n.is-off { background: transparent; border: 1px dashed var(--border-strong, var(--border)); color: var(--muted); }
.imp-path { padding: 2px 9px; border-radius: 8px; border: 1px solid var(--border); background: var(--kt-glass); color: var(--text); font-size: .86em; word-break: break-all; }
.imp-counts { display: inline-flex; gap: 5px; flex-wrap: wrap; }

/* 从哪来: two big option cards */
.imp-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@container imp (max-width: 760px) { .imp-options { grid-template-columns: minmax(0, 1fr); } }
.imp-option { position: relative; display: grid; grid-template-columns: 46px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 12px; row-gap: 2px; align-items: center;
  padding: 14px 44px 14px 18px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.imp-option:hover { border-color: var(--accent); }
.imp-option input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
.imp-option:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.imp-option > .kt-role-icon { grid-row: span 2; justify-self: center; color: var(--text-strong); opacity: .8; }
.imp-option b { font-size: 1.1em; font-weight: 800; color: var(--text-strong); }
.imp-option small { color: var(--muted); font-size: .88em; }
.imp-option.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--card)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 32%, transparent); }
.imp-option.is-on > .kt-role-icon { color: var(--accent); opacity: 1; }
.imp-option.is-off { opacity: .62; cursor: not-allowed; }
.imp-option.is-off small { color: var(--kt-warn); }
.imp-rec { margin-left: 8px; vertical-align: 2px; font-size: .78em; }
.imp-where { margin: 0; display: flex; align-items: baseline; gap: 6px 10px; flex-wrap: wrap; }
.imp-where b { color: var(--text-strong); font-weight: 800; }
.imp-where span { color: var(--muted); font-size: .92em; }
.imp-where .kt-role-icon { align-self: center; color: var(--kt-ok); }
.imp-tick { position: absolute; top: 50%; right: 16px; transform: translateY(-50%); width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
  border: 2px solid var(--border-strong, var(--border)); font-size: 11px; font-weight: 900; }
.imp-option.is-on .imp-tick { background: var(--accent); border-color: var(--accent); color: var(--accent-fg, #fff); }
.imp-local, .imp-clone { display: grid; gap: 12px; }
.imp-inline { display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap; }
.imp-inline input { flex: 1 1 24em; min-width: 0; }
.imp-stale { margin: 0; display: inline-flex; align-items: center; gap: 8px; color: var(--kt-warn); font-weight: 700; }
.imp-stale i { font-style: normal; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--kt-warn); font-size: .8em; }
.imp-found { display: grid; gap: 6px; }
.imp-found ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 19em), 1fr)); gap: 6px; }
.imp-found-btn { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; cursor: pointer; text-align: left;
  border: 1px solid var(--border); background: var(--kt-glass); color: var(--text); font: inherit; min-width: 0; }
.imp-found-btn:hover:not(:disabled) { border-color: var(--accent); }
.imp-found-btn b { color: var(--text-strong); white-space: nowrap; }
.imp-found-btn code { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: .84em; }
.imp-found-btn .br-chip { flex: none; font-size: .78em; }
.imp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; align-content: start; align-items: start; }
.imp-grid > .br-field { align-content: start; }
.imp-grid > .is-full { grid-column: 1 / -1; }
@container imp (max-width: 760px) { .imp-grid { grid-template-columns: minmax(0, 1fr); } }
.imp-grid :is(input[type="text"], input:not([type]), select) { width: 100%; }

/* 检查: one row per check, two columns */
.imp-checks { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 10px; align-items: stretch; }
@container imp (max-width: 960px) { .imp-checks { grid-template-columns: minmax(0, 1fr); } }
.imp-check { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 3px 10px; align-items: start; align-content: start; padding: 9px 12px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--kt-glass); }
.imp-check.is-FAIL { border-color: color-mix(in srgb, var(--kt-bad) 50%, var(--border)); background: color-mix(in srgb, var(--kt-bad) 7%, transparent); }
.imp-check.is-WARN { border-color: color-mix(in srgb, var(--kt-warn) 50%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, transparent); }
.imp-check.is-next { border-color: color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 6%, transparent); }
.imp-glyph { grid-row: span 2; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 8px; font-weight: 900; font-size: 13px;
  color: var(--kt-tone); border: 2px solid var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 14%, transparent); }
.imp-check.is-OK .imp-glyph { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); color: #fff; }
.imp-check-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-width: 0; padding-top: 2px; }
.imp-check-main b { color: var(--text-strong); font-weight: 750; white-space: nowrap; }
.imp-check-main span { color: var(--text); word-break: break-word; }
.imp-check.is-OK .imp-check-main span { color: var(--muted); }
.imp-todo { grid-column: 2; font-size: .9em; color: var(--text); }
.imp-todo.is-box { padding-top: 4px; }
.imp-todo b { color: var(--muted); font-weight: 650; margin-right: 6px; }
.imp-block { display: grid; gap: 8px; }
.imp-block-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.imp-block-head > .kt-role-icon { color: var(--text-strong); opacity: .85; }
.imp-block-head b { color: var(--text-strong); font-weight: 750; }
.imp-verdict { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--kt-bad);
  background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); color: var(--kt-bad); }

/* 安装: the field grid and its live preview */
.imp-install { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; }
.imp-install.is-editing { grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); }
@container imp (max-width: 1060px) { .imp-install.is-editing { grid-template-columns: minmax(0, 1fr); } }
.imp-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.imp-opt { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px 6px 9px; border-radius: 999px; cursor: pointer; font-size: .92em; font-weight: 650;
  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); }
.imp-opt input { margin: 0; accent-color: var(--accent); }
.imp-opt:hover { border-color: var(--accent); }
.imp-opt.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 17%, var(--card)); color: var(--text-strong); }
.imp-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.imp-preview { display: grid; gap: 12px; padding: 14px 16px; border-radius: 14px; border: 1px dashed color-mix(in srgb, var(--kt-info) 55%, var(--border));
  background: color-mix(in srgb, var(--kt-info) 5%, var(--card)); }
.imp-preview-head { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }
.imp-preview-head > b { color: var(--text-strong); font-weight: 750; }
.imp-preview-head > .br-hint { margin: 0; }
.imp-kv { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.imp-kv li { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 10px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 9%, transparent); }
.imp-kv small { color: var(--muted); font-size: .82em; font-weight: 650; }
.imp-kv b { color: var(--text-strong); font-weight: 750; font-family: var(--mono, ui-monospace, monospace); font-size: .92em; }
.imp-kv li.is-empty { border-style: dashed; background: none; }
.imp-kv li.is-empty b { color: var(--muted); font-weight: 500; }
.imp-route { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.imp-route code { padding: 3px 9px; border-radius: 8px; border: 1px solid var(--border-strong, var(--border)); background: var(--bg); font-weight: 700; color: var(--text-strong); }
.imp-route code.is-new { border-color: var(--kit-ok); color: var(--kt-ok); background: color-mix(in srgb, var(--kt-ok) 9%, transparent); }
.imp-route small { color: var(--muted); font-size: .84em; }
.imp-arrow { color: var(--kt-handoff); font-weight: 900; }
.imp-go { display: flex; align-items: center; gap: 10px 18px; flex-wrap: wrap; }
.imp-go > .br-btn { flex: none; }
.imp-go > .imp-safe { flex: 1 1 22em; }
.imp-sum { display: inline-flex; vertical-align: middle; }
.imp-safe { margin: 0; display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px; font-size: .88em; color: var(--text); line-height: 1.55; }
.imp-safe .kt-role-icon { color: var(--kt-ok); margin-top: 1px; }

/* a job: its state, its time, its steps */
.imp-job { display: grid; gap: 8px; padding: 12px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--kt-tone) 45%, var(--border)); background: var(--kt-glass); }
.imp-job.tone-run { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 14%, transparent); }
.imp-job-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.imp-elapsed { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; font-size: .9em; }

/* the install's result */
.imp-result { display: grid; gap: 14px; }
.imp-facts { display: grid; grid-template-columns: repeat(3, minmax(0, auto)); justify-content: start; gap: 8px 28px; margin: 0; }
@container imp (max-width: 1060px) { .imp-facts { grid-template-columns: minmax(0, 1fr); } }
.imp-facts dt { font-size: .82em; color: var(--muted); font-weight: 700; }
.imp-facts dd { margin: 3px 0 0; color: var(--text); word-break: break-word; }
.imp-facts code { color: var(--text-strong); font-weight: 650; }
.imp-files { display: grid; gap: 8px; }
.imp-fgroup { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); gap: 8px; align-items: start; }
.imp-fgroup > .kt-pill { justify-self: start; }
.imp-fgroup ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; }
.imp-fgroup li { font-size: .8em; }
.imp-commit { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 12px; }
.imp-commit.is-ok { border: 1px solid var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 9%, var(--card)); }
.imp-commit.is-bad { border: 1px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); }
.imp-commit > div { display: grid; gap: 8px; min-width: 0; flex: 1; }
.imp-commit p { margin: 0; }
.imp-commit b { color: var(--text-strong); font-weight: 750; }
.imp-mark { flex: none; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-weight: 900; color: #fff; background: var(--kt-ok-solid); }
.imp-commit.is-bad .imp-mark { background: var(--kt-bad-solid); }
.imp-more > summary { cursor: pointer; color: var(--muted); font-size: .9em; }
.imp-more > summary b { color: var(--text-strong); font-weight: 750; }
.imp-more[open] > summary { margin-bottom: 8px; }

/* pending, publish, the last step */
.imp-pend { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
.imp-pend b { color: var(--text-strong); font-weight: 750; font-size: 1.05em; }
.imp-confirm { border-color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 8%, var(--card)); }
.imp-confirm p { margin: 0; }
.imp-confirm-head { display: inline-flex; align-items: center; gap: 8px; color: var(--kt-approve); }
.imp-confirm-head b { color: var(--text-strong); }
.imp-final { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; }
.imp-done { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 18px; border-radius: 14px; border: 1px solid var(--kit-ok);
  background: radial-gradient(70% 140% at 0% 0%, color-mix(in srgb, var(--kt-ok) 14%, transparent), transparent 60%), var(--card); }
.imp-done.is-wait { align-items: flex-start; border-color: var(--kit-wait);
  background: radial-gradient(70% 140% at 0% 0%, color-mix(in srgb, var(--kt-approve) 12%, transparent), transparent 60%), var(--card); }
.imp-done.is-wait .imp-mark { background: var(--kt-approve); box-shadow: none; }
.imp-done .imp-mark { width: 40px; height: 40px; border-radius: 12px; font-size: 1.3em; box-shadow: 0 0 24px -6px var(--kt-ok); }
.imp-done > div:not(.br-row) { display: grid; gap: 6px; flex: 1 1 14em; min-width: 0; }
.imp-done b { font-size: 1.2em; font-weight: 850; color: var(--text-strong); }
.imp-done small { color: var(--muted); }
.imp-done .br-confirm b, .imp-done .imp-block b { font-size: 1em; }
`
