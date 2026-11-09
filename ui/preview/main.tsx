/**
 * Standalone preview of the Brain app for screenshots and a click-through without KiroCrew: the real app (src/main.tsx)
 * against the stubbed SDK (src/test/stubs, the same ones vitest uses), every route answered from the fixtures in
 * src/test/fixtures (writes answer something plausible and change nothing). Built by `npm run preview:build` into
 * preview-dist/index.html (one file, opens from file:// too).
 *
 * The bar above the app switches the world: 团队模式, 找不到 brain-kit, KiroCrew 有 FAIL, 没有 evaluate, 没有仓库, light/dark.
 * 导入仓库 is played through: a path ending in /ready is installed already; any other is not, and its install (or a clone)
 * runs as a job whose steps advance over a few seconds; 加入列表 and 移出列表 change the preview's list.
 * The switches live in sessionStorage (the app rewrites the URL as you move); `?pv=team,light,…` sets them from a link.
 * Every fixture time is moved so that the fixtures' `at` is now. Opening a session is shown, not done.
 */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/main'
import { FIXTURE_AT, clone, fx } from '../src/test/data'
import world from './world.json'
import { API, fixtureRoutes } from '../src/test/routes'
import { StubApiError, setApiRoutes, setNavigateHook } from '../src/test/stubs/app-sdk'
import type {
  CrewFixBody, ImportInspect, ImportJob, IntakeBody, Overview, ReflectApplyBody, ReflectApplyResult, ReqBoard, RepoInfo, RequirementDetail, Settings, StartBody, Status,
  Todo,
} from '../src/types'

const FLAGS = ['team', 'nokit', 'crewfail', 'noeval', 'norepos', 'light'] as const
type Flag = (typeof FLAGS)[number]
const FLAG_NAME: Record<Flag, string> = { team: '团队模式', nokit: '找不到 brain-kit', crewfail: 'KiroCrew 有 FAIL', noeval: '没有 evaluate', norepos: '没有仓库', light: '亮色' }
const KEY = 'brain-preview-flags'

function readFlags(): Set<Flag> {
  const fromUrl = new URLSearchParams(location.search).get('pv')
  if (fromUrl !== null) sessionStorage.setItem(KEY, fromUrl)
  const raw = fromUrl ?? sessionStorage.getItem(KEY) ?? ''
  return new Set(raw.split(',').filter((f): f is Flag => (FLAGS as readonly string[]).includes(f)))
}
const flags = readFlags()
const mode = flags.has('light') ? 'light' : 'dark'
document.documentElement.dataset.mode = mode
document.documentElement.dataset.theme = `kiro-${mode}`

/** Every epoch-seconds number and ISO time of a fixture, moved so that its `at` is now. */
const DELTA = Math.round(Date.now() / 1000 - FIXTURE_AT)
function shift<T>(x: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'number') return v > 1.7e9 && v < 1.9e9 ? v + DELTA : v
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      const ms = Date.parse(v)
      return Number.isFinite(ms) ? new Date(ms + DELTA * 1000).toISOString() : v
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, walk(y)]))
    return v
  }
  return walk(clone(x)) as T
}

let settings: Settings = fx.settings()
let crewFixed = false
/** The world the preview shows (scripts/preview_world.py made it with the backend's own code: the rows' states and
 * waits by deliveries.classify, the boards by board.py, 待办 by todo.build, 交付总览 for 全部 and each repo, with and
 * without brainkit.evaluate): four repos, nineteen requirements in every state, each with its board. */
const W = world as unknown as {
  status: Status; overview: Overview; boards: Record<string, ReqBoard>; details: Record<string, RequirementDetail>
  overviews: Record<'eval' | 'noeval', Record<string, Overview>>; todo: Record<'ok' | 'crewfail', Todo>
  stages: Record<string, RequirementDetail['lean']['stages']>
}
let repos: RepoInfo[] = flags.has('norepos') ? [] : clone(W.status.repos)

function status(): Status {
  const s = clone(W.status)
  s.repos = clone(repos)
  if (flags.has('team')) {
    s.app.team = true
    s.team = fx.team().status
  }
  if (flags.has('nokit')) {
    s.brainkit = { ...s.brainkit, ok: false, version: null, error: `${settings.brainkit} 里没有 brainkit/` }
  }
  if (flags.has('crewfail') && !crewFixed) s.crew.rows = [{ level: 'FAIL', text: '没有 ~/.kiro/agents/brain-dev.json', todo: '点「装上 brain-dev」：app 装上 brain-kit 带的那一份', fix: 'agent', repo: null, raw: '' }, ...s.crew.rows]
  if (crewFixed) s.crew.rows = s.crew.rows.map((r) => (r.fix === 'agent' || r.fix === 'engine' ? { ...r, level: 'OK' as const, todo: '', fix: null } : r))
  s.counts.todo = todo().items.length
  s.team.enabled = s.team.enabled || settings.team.enabled
  return shift(s)
}

const WHERE: Record<string, string> = { worktree: '这台机器的工作区', branch: '运行分支（没在这台机器上检出）', main: '默认分支（已合并）', runner: '运行机工作区', claim: '只有认领' }
const reqOf = (path: string) => {
  const [repo, key] = path.split('?')[0].split('/').slice(-2).map(decodeURIComponent)
  return { repo, key, id: `${repo}/${key}` }
}

/** A requirement's 需求详情: PAY-3's is the fixture; any other is made from its board (the same records). */
function detailFor(path: string): RequirementDetail {
  const { key, id } = reqOf(path)
  if (W.details[id]) return clone(W.details[id])
  const b = W.boards[id]
  if (!b) throw new StubApiError(404, { error: `没有这个需求：${key}`, code: 'not_found' })
  const d = fx.detail()
  const row = b.row
  const n = row.lean.stage_n ?? 0
  const finished = row.state === 'merged'
  d.row = row
  d.where_label = WHERE[row.where] ?? row.where
  d.claim = d.claim && { ...d.claim, owner: row.owner, title: row.title, created_at: new Date((b.started_at ?? b.at) * 1000).toISOString() }
  d.run = row.intent && d.run ? { ...d.run, owner: row.owner, branch: row.branch, intent: row.intent, created_at: new Date((b.started_at ?? b.at) * 1000).toISOString(),
    handoff: b.belt.some((x) => x.kind === 'handover') ? { requested_at: new Date(b.belt.find((x) => x.kind === 'handover')!.at * 1000).toISOString(), by: row.owner } : null } : null
  // the construction stages run per unit: this requirement's one unit (its slug), on the stages it has reached
  const unit = (row.branch ?? '').split('/').pop()?.replace(/^[A-Z]+-\d+-/, '') || row.key.toLowerCase()
  d.lean.stages = W.stages[id] ?? d.lean.stages.map((s) => ({ ...s, state: finished || s.n <= row.lean.done ? 'done' : s.n === n ? (row.lean.stage_state === 'todo' ? 'todo' : 'started') : 'todo',
    units: s.units.length && (finished || s.n <= n) ? [{ unit, state: (finished || s.n < n ? 'done' : 'started') as 'done' | 'started' }] : [] }))
  d.lean.approvals = b.actors.filter((a) => ['req', 'design', 'release'].includes(a.key) && a.status !== 'waiting' && a.status !== 'skipped').map((a) => ({
    kind: a.key === 'req' ? 'REQUIREMENTS' : a.key === 'design' ? 'DESIGN' : 'RELEASE', state: a.status === 'merged' ? 'approved' as const : a.status === 'fixing' ? 'rejected' as const : 'pending' as const,
    sha8: (a.history[a.history.length - 1]?.at ?? 0).toString(16).slice(-8), at: a.since, line: a.line, path: `aidlc-docs/${row.intent}/${a.key}.md` }))
  d.lean.status = n ? `${row.stage ?? ''} · ${row.waits.text}` : null
  d.lean.next = []
  d.lean.open_questions = []
  d.questions = b.questions
  d.decisions = b.decisions
  d.sessions = b.sessions
  d.timeline = { source: 'trace', items: b.events.map((e) => ({ at: new Date(e.at * 1000).toISOString(), kind: (({ request: 'approval', approve: 'approval', reject: 'approval', refused: 'approval', commit: 'commit', handover: 'handover', accepted: 'handover', rejected: 'handover', signed: 'handover', question: 'question', answer: 'decision', verify: 'verify', merge: 'merge', blocked: 'blocked', stage: 'stage', session: 'session' } as Record<string, string>)[e.kind] ?? 'app') as RequirementDetail['timeline']['items'][number]['kind'], label: e.text, detail: null, who: null, src: e.src })), missing: b.missing, error: '' }
  d.credits = b.credits
  d.brain = b.brain
  d.mr_desc = b.mr_desc
  return d
}

function boardFor(path: string): ReqBoard {
  const { key, id } = reqOf(path)
  const b = W.boards[id]
  if (!b) throw new StubApiError(404, { error: `没有这个需求：${key}`, code: 'not_found' })
  return clone(b)
}

/** cto.weekly once the times are moved to now: the backend's buckets again (deliveries.cto_numbers: the last 12 weeks,
 * from Monday, UTC), made from the moved merges, so a week holds exactly the merges its rows show. */
function rebucket(o: Overview): Overview {
  const monday = (t: number) => new Date((t - ((new Date(t * 1000).getUTCDay() + 6) % 7) * 86400) * 1000).toISOString().slice(0, 10)
  const now = Date.now() / 1000
  const weeks = Array.from({ length: 12 }, (_, i) => monday(now - 7 * 86400 * (11 - i)))
  const by = new Map(weeks.map((w) => [w, { week: w, unattended: 0, people: 0, local: 0, pending: 0 }]))
  const judged = new Set<string>()
  for (const r of o.cto.runs) {
    if (!r.merged_at) continue
    judged.add(`${r.repo}/${r.key}`)
    const w = by.get(monday(r.merged_at))
    if (w) w[r.how] += 1
  }
  for (const r of o.rows) {
    const at = r.waits.since ?? r.updated_at
    const w = at ? by.get(monday(at)) : undefined
    if (r.state === 'merged' && !judged.has(`${r.repo}/${r.key}`) && w) w.pending += 1
  }
  o.cto.weekly = weeks.map((w) => by.get(w)!)
  return o
}

/** 交付总览 as the backend made it for that repo (or 全部), with or without brainkit.evaluate. */
function overview(path: string): Overview {
  const repo = new URL(path, location.origin).searchParams.get('repo') ?? 'all'
  const byRepo = W.overviews[flags.has('noeval') ? 'noeval' : 'eval']
  const o = clone(byRepo[repo] ?? byRepo.all)
  o.errors = repos.filter((r) => !r.ok && !r.pending && (repo === 'all' || r.id === repo)).map((r) => ({ repo: r.id, error: r.error }))
  return o
}

/** 待办 as the backend made it from the world's rows (with the KiroCrew FAIL when that switch is on). */
const todo = (): Todo => clone(W.todo[flags.has('crewfail') && !crewFixed ? 'crewfail' : 'ok'])

const routes = fixtureRoutes()
setApiRoutes({
  ...Object.fromEntries(Object.entries(routes).map(([k, h]) => [k, (...a: Parameters<typeof h>) => shift(h(...a))])),
  [`GET ${API}/status`]: () => status(),
  [`GET ${API}/requirements/*`]: (_b, path) => shift(detailFor(path)),
  [`GET ${API}/board/*`]: (_b, path) => shift(boardFor(path)),
  [`GET ${API}/settings`]: () => clone(settings),
  [`GET ${API}/crew`]: () => ({ ...status().crew }),
  [`GET ${API}/todo`]: () => shift({ ...todo(), team: flags.has('team') }),
  [`GET ${API}/overview*`]: (_b, path) => rebucket(shift(overview(path))),
  [`POST ${API}/settings`]: (body) => {
    settings = { ...settings, ...clone(body as Partial<Settings>) }
    return { ok: true, settings: clone(settings), status: status() }
  },
  ...importRoutes(),
  [`POST ${API}/refresh`]: (body) => ({ ok: true, text: `预览：没有真的跑 git fetch（${(body as { repo: string }).repo}）` }),
  [`POST ${API}/requirements/*`]: (body, path) => {
    if (path.endsWith('/session')) return { ok: true, slot: 'brain-PAY-3-7f3a', url: '/chat?sid=brain-PAY-3-7f3a' }
    const choice = (body as { choice: string }).choice
    return { ok: true, via: 'session', text: `预览：回答 ${choice} 没有真的送出去` }
  },
  [`POST ${API}/intake/check`]: (body) => {
    const b = body as IntakeBody
    const c = fx.intakeCheck()
    // the partner guide (D03) is marked Confidential: a lower classification blocks, as brain-kit does
    if (b.classification === 'public' || b.classification === 'internal') {
      c.ok = false
      c.blocking = [`门 2：D03 合作方接口说明.pdf 标着 Confidential，高于你选的 ${b.classification}（选机密或不确定，或把它排除掉）`]
    }
    if (!b.consent) return { ...c, ok: false, findings: [], blocking: [], refused: [], error: '门 1：确认你是作者，或已取得作者同意' }
    return c
  },
  [`POST ${API}/intake/start`]: (body) => {
    const b = body as StartBody
    const r = fx.start()
    if (!b.open_session) return { ...r, slot: null, url: null }
    return r
  },
  [`POST ${API}/crew/fix`]: (body) => {
    crewFixed = true
    return { ok: true, text: `预览：${(body as CrewFixBody).what === 'agent' ? '装好了 ~/.kiro/agents/brain-dev.json' : '引擎换成了 kas'}（没有真的改）`, rows: status().crew.rows }
  },
  [`POST ${API}/brain/reflect/preview`]: (body) => ({ ...fx.reflect(), key: (body as { key: string }).key }),
  [`POST ${API}/brain/reflect/apply`]: (body): ReflectApplyResult => {
    const b = body as ReflectApplyBody
    return {
      ok: true,
      branch: `brain/${b.key}-reflect-1`,
      worktree: `/Users/alice/.brain/worktrees/shop-pay/brain-${b.key}-reflect-1`,
      output: `预览：没有真的写。\n会在 main 上开分支 brain/${b.key}-reflect-1，写入 1 条新条目，1 条加来源${b.push ? '，推送并开 MR' : '（只在本机，没推送）'}`,
    }
  },
  [`POST ${API}/team/loop`]: () => ({ ok: true, summary: { handoffs: 0, answers: 1, signed: 1 }, error: '' }),
})

/** 导入仓库 in the preview: the fixtures moved to the path asked for; jobs whose steps advance with the clock. */
function importRoutes() {
  const FIXTURE_PATH = fx.importInspect().path as string
  const pendingPaths = new Set<string>()
  const readyPaths = new Set<string>()      // installed in place, or merged / pulled: brain-kit is in the checkout
  const jobs = new Map<string, { job: ImportJob<unknown>; at: number; path: string }>()
  const at = (p: string) => <T,>(x: T): T => JSON.parse(JSON.stringify(x).split(FIXTURE_PATH).join(p)) as T
  const inspect = (path: string): ImportInspect => {
    const listed = repos.find((r) => r.path === path)
    if (pendingPaths.has(path)) return { ...at(path)(fx.importInspectPending()), ...(listed ? { next: 'listed' as const, listed: listed.id } : {}) }
    const c = at(path)(fx.importInspect())
    if (path.endsWith('/ready') || listed || readyPaths.has(path)) {
      c.next = listed ? 'listed' : 'add'
      c.listed = listed?.id ?? null
      c.kit = { state: 'checkout', values: { tracker: 'none', req_prefix: 'READY', default_branch: 'main', gitlab_base: 'https://gitlab.example.com', gitlab_project: 'shop/ready' } }
      c.checks = c.checks.map((x) => (['kit', 'lean', 'brain', 'agents'].includes(x.id) ? { ...x, level: 'OK' as const, why: '装了', todo: '' } : x))
    }
    return c
  }
  const start = (job: ImportJob<unknown>, path: string) => {
    const id = Math.random().toString(16).slice(2, 14).padEnd(12, '0')
    jobs.set(id, { job: { ...job, id, target: path, started_at: Date.now() / 1000 }, at: Date.now(), path })
    return { job: progress(id) }
  }
  const progress = (id: string) => {
    const got = jobs.get(id)
    if (!got) throw new StubApiError(404, { error: '没有这个任务', code: 'no_job' })
    const done = Math.floor((Date.now() - got.at) / 700)
    const j = clone(got.job)
    if (done < j.steps.length) {
      j.state = 'running'
      j.result = null
      j.ended_at = null
      j.steps = j.steps.map((s, i) => (i < done ? s : { ...s, state: i === done ? 'running' : 'todo', detail: '' }))
    } else if (j.kind === 'install') {
      ((j.result as { mode?: string } | null)?.mode === 'inplace' ? readyPaths : pendingPaths).add(got.path)
    }
    return j
  }
  return {
    [`POST ${API}/import/inspect`]: (body: unknown) => inspect(String((body as { path: string }).path).replace(/\/+$/, '')),
    [`POST ${API}/import/clone`]: (body: unknown) => {
      const b = body as { url: string; parent: string; name: string }
      const name = b.name || b.url.replace(/\/+$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '') || 'repo'
      const path = `${b.parent.replace(/\/+$/, '')}/${name}`
      return start(at(path)(fx.importCloneJob()), path)
    },
    [`POST ${API}/import/install`]: (body: unknown) => {
      const b = body as { path: string; mode?: string }
      return start(at(b.path)(b.mode === 'inplace' ? fx.importInplaceJob() : fx.importJob()), b.path)
    },
    [`POST ${API}/import/choices`]: (body: unknown) => at((body as { path: string }).path)(fx.importChoices()),
    [`POST ${API}/import/upgrade`]: (body: unknown) => {
      const b = body as { path: string; mode?: string }
      const j = fx.importUpgradeJob()
      if (b.mode === 'inplace') {
        j.steps = [{ id: 'check', label: '看能不能直接装', state: 'ok', detail: '在 main 上，检出是干净的' }, ...j.steps.slice(1)]
        j.result = { ...j.result!, mode: 'inplace', branch: 'main', base: 'main', worktree: null,
          text: '预览：没有真的提交。提交在 main 上了，现在就生效。远端还没有它：要推送就点「推送」' }
      }
      return start(j, b.path)
    },
    [`POST ${API}/import/merge`]: (body: unknown) => {
      const path = (body as { path: string }).path
      pendingPaths.delete(path)
      readyPaths.add(path)
      const r = fx.importMerge()
      return { ...r, text: `预览：没有真的合并。${r.text}` }
    },
    [`POST ${API}/import/pull`]: (body: unknown) => {
      const path = (body as { path: string }).path
      pendingPaths.delete(path)
      readyPaths.add(path)
      const r = fx.importPull()
      return { ...r, text: `预览：没有真的拉取。${r.text}` }
    },
    [`POST ${API}/import/push`]: () => {
      const r = fx.importPush()
      return { ...r, text: `预览：没有真的推送。${r.text}` }
    },
    [`GET ${API}/import/jobs/*`]: (_b: unknown, path: string) => progress(path.split('/').pop() ?? ''),
    [`POST ${API}/import/commit`]: () => ({ ok: true, sha: 'e'.repeat(40), blocked: false, text: '提交了 eeeeeeee（作者 alice）', output: '' }),
    [`POST ${API}/import/publish`]: (body: unknown) => {
      const r = at((body as { path: string }).path)(fx.importPublish())
      r.text = `预览：没有真的推送。${r.text}`
      return r
    },
    [`POST ${API}/import/add`]: (body: unknown) => {
      const path = (body as { path: string }).path
      const id = `r${repos.length + 1}`
      const pending = pendingPaths.has(path) ? at(path)(fx.importInspectPending()).pending : null
      repos = [...repos, { id, path, name: path.split('/').pop() ?? path, ok: !pending, error: '', pending,
        kit: pending ? null : { tracker: 'none', req_prefix: 'READY', default_branch: 'main', gitlab_base: 'https://gitlab.example.com', gitlab_project: 'shop/ready' },
        me: pending ? null : at(path)(fx.importInspect()).me }]
      return { ok: true, id, text: `预览：加入了（${id}）${pending ? `：${pending.text}` : ''}`, status: status() }
    },
    [`POST ${API}/me/name`]: (body: unknown) => {
      const b = body as { path: string; name: string }
      const name = String(b.name || '').trim().toLowerCase()
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name)) throw new StubApiError(400, { error: '名字只能用小写字母、数字和 . _ -（字母或数字开头，最多 64 个）', code: 'invalid_name' })
      const me = { name, source: 'git' as const, gitlab: '', text: `${name}（git config brain.user）`, ask: false, label: '', why: '', suggest: '', error: '' }
      repos = repos.map((r) => (r.path === b.path && r.me ? { ...r, me: { ...me, gitlab: r.me.gitlab } } : r))
      return { ok: true, text: `预览：没有真的写。这个仓库的 git config brain.user 设成了 ${name}`, me, status: status() }
    },
    [`POST ${API}/repos/remove`]: (body: unknown) => {
      const path = (body as { path: string }).path
      const name = path.split('/').pop()
      repos = repos.filter((r) => r.path !== path).map((r, i) => ({ ...r, id: `r${i + 1}` }))
      return { ok: true, text: `预览：从列表里移出了 ${name}（文件、分支都没动）`, status: status() }
    },
  }
}

let notice: (s: string) => void = () => {}
// a session is KiroCrew's: the preview says where it would go and stays
setNavigateHook((path) => {
  if (path.startsWith(location.pathname)) return false
  notice(`这里会打开 KiroCrew 的 ${path}（预览里没有会话）`)
  return true
})

function Bar() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    notice = setMsg
  }, [])
  const toggle = (f: Flag) => {
    const next = new Set(flags)
    if (next.has(f)) next.delete(f)
    else next.add(f)
    sessionStorage.setItem(KEY, [...next].join(','))
    location.reload()
  }
  return (
    <div className="pv-bar">
      <b>Brain 预览</b>
      {FLAGS.map((f) => (
        <button key={f} type="button" aria-pressed={flags.has(f)} onClick={() => toggle(f)}>{FLAG_NAME[f]}</button>
      ))}
      <span>数据是 fixture，接口是 src/test/stubs 里的假实现：写操作什么也不改</span>
      {msg && <b role="status">{msg}</b>}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <>
    <Bar />
    <App />
  </>,
)
