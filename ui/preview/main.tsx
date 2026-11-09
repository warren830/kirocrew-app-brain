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
 *
 * The stubs answer as the real backend does, so the preview never looks better than the app: 待办 is the backend's own
 * list when the world has it (else the fixture), only of the repos listed, its KiroCrew items made from the FAIL rows as
 * backend/core/todo.py makes them, and /status counts that very list; KiroCrew's rows are those of the listed repos;
 * brain-kit not found says it as backend/core/bk.py does, with no modules; gate 2 refuses confidential material as
 * brain-kit does when the repo's kit does not allow it (it never does here); a repo filter answers with that repo's own
 * numbers when the world has them; the Brain of a repo is its own (shop-pay's is the fixture, the others are empty), a
 * reflect preview is the requirement's own, 运行机's counts come from its own runs table, a round says brain-kit's steps.
 */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/main'
import { FIXTURE_AT, clone, fx } from '../src/test/data'
import world from './world.json'
import { API, fixtureRoutes } from '../src/test/routes'
import { StubApiError, setApiRoutes, setNavigateHook } from '../src/test/stubs/app-sdk'
import type {
  BrainView, CheckRow, CrewFixBody, ImportInspect, ImportJob, IntakeBody, IntakeNext, KitForm, Overview, ReflectApplyBody, ReflectApplyResult, ReflectPreview, ReqBoard, RepoInfo,
  RequirementDetail, Settings, StartBody, Status, TeamView, Todo, TodoItem,
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
/** The world the preview shows (scripts/preview_world.py made it with the backend's own board.py and cto_numbers):
 * four repos, seventeen requirements in every state, each with its board. */
const W = world as unknown as {
  status: Status; overview: Overview; boards: Record<string, ReqBoard>; details: Record<string, RequirementDetail>
  /** made by scripts/preview_world.py with the backend's own todo.build, when it does (person mode and team mode) */
  todo?: Todo; todo_team?: Todo
  /** /overview?repo=<id>: each repo's own numbers (deliveries.cto_numbers over its rows), when the world has them */
  overviews?: Record<string, Overview>
}
let repos: RepoInfo[] = flags.has('norepos') ? [] : clone(W.status.repos)

/** KiroCrew's rows as the backend reads them: brain-dev.json's row says what is there, a repo's rows are the listed
 * repos'; 「KiroCrew 有 FAIL」 is brain-dev.json missing (backend/core/problems.py's words for it). */
function crewRows(): CheckRow[] {
  const listed = new Set(repos.map((r) => r.path))
  const rows = clone(W.status.crew.rows).filter((r) => !r.repo || listed.has(r.repo))
  if (!flags.has('crewfail') || crewFixed) return rows
  return rows.map((r) => (/^brain-dev\.json/.test(r.text) ? {
    level: 'FAIL' as const, text: '没有 ~/.kiro/agents/brain-dev.json', todo: '点「修复」装上 brain-kit 带的版本：没有它，Lean 的 hook 在 KiroCrew 里不会跑',
    fix: 'agent' as const, repo: null, raw: 'KiroCrew: ~/.kiro/agents/brain-dev.json missing',
  } : r))
}

/** The listed repos as the backend reads them: without brain-kit none of them can be read (backend/core/service.py). */
const listedRepos = (): RepoInfo[] => (flags.has('nokit') ? repos.map((r) => (r.ok ? { ...r, ok: false, error: 'brain-kit 没装载', me: null } : r)) : repos)

function status(): Status {
  const s = clone(W.status)
  s.repos = clone(listedRepos())
  if (flags.has('team')) {
    s.app.team = true
    s.team = fx.team().status
  }
  if (flags.has('nokit')) {
    const modules = Object.fromEntries(Object.keys(s.brainkit.modules).map((k) => [k, false])) as Status['brainkit']['modules']
    s.brainkit = { ...s.brainkit, ok: false, version: null, modules, error: `这里没有 brain-kit（找不到 ${settings.brainkit}/brainkit/__init__.py）` }
  }
  s.crew.rows = crewRows()
  s.counts.todo = todo().items.length
  s.team.enabled = s.team.enabled || settings.team.enabled
  return shift(s)
}

/** 待办 as GET /todo answers: the backend's list (the world's when it has one), of the repos listed only; in team mode the
 * kinds a runner has; KiroCrew's items from the FAIL rows, as backend/core/todo.py makes them. */
function todo(): Todo {
  const team = flags.has('team')
  const world = team ? W.todo_team : W.todo
  const base = world ?? fx.todo()
  const listed = new Set(listedRepos().filter((r) => r.ok).map((r) => r.id))
  const kinds = team ? ['question', 'acceptance', 'handoff_rejected'] : null
  const rows = new Map(W.overview.rows.map((r) => [`${r.repo}/${r.key}`, r]))
  // the fixture's items stand in for the backend's until the world has its list: only for requirements the world has,
  // a refused or unlabelled hand-over saying what its row says (todo.py takes row.waits.text for them)
  const items = clone(base.items).filter((i) => i.kind !== 'crew' && listed.has(i.repo) && (!kinds || kinds.includes(i.kind))
    && (!!world || rows.has(`${i.repo}/${i.key}`)))
    .map((i) => (world || !['handoff_rejected', 'handoff_unlabelled'].includes(i.kind) ? i : { ...i, text: rows.get(`${i.repo}/${i.key}`)?.waits.text ?? i.text }))
  const crew: TodoItem[] = crewRows().filter((r) => r.level === 'FAIL').map((r) => ({
    kind: 'crew', repo: '', key: '', title: `KiroCrew 检查${r.repo ? ` · ${r.repo.split('/').pop()}` : ''}`, text: r.todo ? `${r.text}。${r.todo}` : r.text,
    line: null, approval: null, mr_url: null, question: null, session: null, since: null,
  }))
  return { items: [...items, ...crew], team }
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
  d.lean.stages = d.lean.stages.map((s) => ({ ...s, state: finished || s.n <= row.lean.done ? 'done' : s.n === n ? (row.lean.stage_state === 'todo' ? 'todo' : 'started') : 'todo',
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

function overview(path: string): Overview {
  const repo = new URL(path, location.origin).searchParams.get('repo') ?? 'all'
  const own = W.overviews?.[repo]
  const o = clone(own ?? W.overview)
  const usable = new Set(listedRepos().filter((r) => r.ok).map((r) => r.id))
  if ((repo !== 'all' && !own) || usable.size < repos.filter((r) => r.ok).length) {
    o.rows = o.rows.filter((r) => (repo === 'all' || r.repo === repo) && usable.has(r.repo))
    o.cto.runs = o.cto.runs.filter((r) => (repo === 'all' || r.repo === repo) && usable.has(r.repo))
    o.overlaps = o.overlaps.filter((x) => o.rows.some((r) => r.key === x.keys[0]))
  }
  o.errors = listedRepos().filter((r) => !r.ok && !r.pending && (repo === 'all' || r.id === repo)).map((r) => ({ repo: r.id, error: r.error }))
  if (flags.has('noeval')) {
    o.eval = { available: false, error: 'brain-kit 还没有 evaluate 模块', ref: null, metrics: [], queue: [], skipped: [], notes: [] }
    o.cto = { ...o.cto, available: false, unattended: null, stepped_in: null, runs: [], sentence: o.cto.credits.per_req !== null ? `每个需求平均 ${o.cto.credits.per_req} credits。` : o.cto.sentence }
  }
  return o
}

/** GET /brain?repo=: shop-pay's is the fixture (its 知识有用率 as brain-kit counts it: entries cited at least once over
 * the entries there are); every other repo's Brain is still empty. */
function brain(path: string): BrainView {
  const repo = new URL(path, location.origin).searchParams.get('repo') ?? ''
  const b = fx.brain()
  if (repo !== 'r1') {
    return { ...b, repo, ref: 'main', files: b.files.map((f) => ({ ...f, count: 0, sections: [] })), lint: { errors: [], warnings: [] },
      usage: { useful: [0, 0], repeat_rate: [0, 0], archived: 0, purged: 0, runs: [], never_cited: [], repeats_any: [], unmerged: [] }, reflect: [] }
  }
  const all = b.files.flatMap((f) => f.sections.flatMap((x) => x.entries))
  b.usage.useful = [all.filter((e) => e.cites > 0).length, all.length]
  return b
}

/** POST /brain/reflect/preview: the requirement's own run. PAY-5 has new knowledge (the fixture, said as the backend says
 * brain-kit's lines); PAY-2 was written back already, so brain-kit skips its proposals. */
function reflectPreview(key: string): ReflectPreview {
  const intent = W.boards[`r1/${key}`]?.row.intent ?? key.toLowerCase()
  const f = fx.reflect()
  if (key === 'PAY-5') {
    return { ...f, key, gaps: f.gaps.map((g) => ({ ...g, kind: 'knowledge' })),
      notes: ['第 31 行的提议和 T-PAY-2-1 的文字一样：只给 T-PAY-2-1 补来源'],
      warnings: ['D-3 被否了（凭证 V-7c1e9a20），可是没有一条纠正或「又出现」的提议提到它'],
      raw: ['proposal at line 31: same text as T-PAY-2-1: recorded as same (sources added)', 'D-3 (V-7c1e9a20) was rejected, but no correction or repeats proposal cites it'] }
  }
  return { ...f, key, source: `aidlc-docs/${intent}/decisions.md`, ops: [], gaps: [], warnings: [], problems: [], substantive: false,
    notes: ['第 18 行的提议 Brain 里已经有了（P-PAY-2-1），跳过', '第 27 行的提议 Brain 里已经有了（T-PAY-2-1），跳过'],
    raw: ['proposal at line 18: already in the Brain as P-PAY-2-1, skipped', 'proposal at line 27: already in the Brain as T-PAY-2-1, skipped'] }
}

/** GET /team: the ledger's run counts from its own runs table (the backend reads both from one table); a refusal says
 * why as backend/core/problems.py says the bridge's words. */
function team(): TeamView {
  const t = fx.team()
  const runs: Record<string, number> = {}
  for (const r of t.runs) runs[r.state] = (runs[r.state] ?? 0) + 1
  t.ledger.runs = runs
  t.signer.refused = t.signer.refused.map((x) => ({ ...x, reasons: ['交接标签是 bob 打的，不是负责人 alice'],
    raw: ["label 'ai-handoff' was added by bob, not by the branch owner alice"] }))
  return t
}

/** GET /intake/next?repo=: the next free key of that repo (its prefix, after its highest one). */
function intakeNext(path: string): IntakeNext {
  const repo = new URL(path, location.origin).searchParams.get('repo') ?? ''
  const r = repos.find((x) => x.id === repo)
  const prefix = r?.kit?.req_prefix ?? ''
  if (!prefix) return { repo, key: null, tracker: 'none', prefix: '', error: '这个仓库还没装 brain-kit' }
  const n = Math.max(0, ...W.overview.rows.filter((x) => x.repo === repo).map((x) => Number(x.key.split('-').pop()) || 0))
  return { repo, key: `${prefix}-${n + 1}`, tracker: r?.kit?.tracker ?? 'none', prefix, error: '' }
}

/** brain-kit's gate 2 (brainkit/intake/package.py): the classification is the highest of the one chosen (unsure counts
 * as confidential) and the documents' own labels; confidential needs the kit's allow_confidential, which this world's
 * repos do not give; secret is never taken. D03 is labelled Confidential unless it is left out. */
function gate2(b: IntakeBody): string | null {
  const glob = (g: string) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
  const d03 = !(b.exclude ?? []).some((g) => glob(g).test('合作方接口说明.pdf') || glob(g).test('D03 合作方接口说明.pdf'))
  const given = b.classification === 'unsure' ? 'confidential' : b.classification
  if (given === 'secret') return '门 2：材料是绝密（secret），不收，只留哈希'
  if (given !== 'confidential' && !d03) return null
  return `门 2：材料按机密处理（${d03 ? 'D03 合作方接口说明.pdf=confidential' : `你选的是 ${b.classification}`}），而 intake.allow_confidential 是 false（决策 02 未放行）。请产品写一份脱敏摘要再交，或用 --exclude 去掉这份。`
}

const routes = fixtureRoutes()
setApiRoutes({
  ...Object.fromEntries(Object.entries(routes).map(([k, h]) => [k, (...a: Parameters<typeof h>) => shift(h(...a))])),
  [`GET ${API}/status`]: () => status(),
  [`GET ${API}/requirements/*`]: (_b, path) => shift(detailFor(path)),
  [`GET ${API}/board/*`]: (_b, path) => shift(boardFor(path)),
  [`GET ${API}/settings`]: () => clone(settings),
  [`GET ${API}/crew`]: () => ({ ...status().crew }),
  [`GET ${API}/todo`]: () => shift(todo()),
  [`GET ${API}/overview*`]: (_b, path) => shift(overview(path)),
  [`GET ${API}/brain*`]: (_b, path) => shift(brain(path)),
  [`GET ${API}/team`]: () => shift(team()),
  [`GET ${API}/intake/next*`]: (_b, path) => intakeNext(path),
  [`GET ${API}/import/defaults`]: () => ({ ...fx.importDefaults(), brainkit_ok: !flags.has('nokit') }),
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
    if (!b.consent) return { ...c, ok: false, findings: [], blocking: [], refused: [], error: '门 1：确认你是作者，或已取得作者同意' }
    const refused = gate2(b)
    if (refused) return { ...c, ok: false, package: null, blocking: [refused] }
    return { ...c, classification: b.classification || c.classification }
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
  [`POST ${API}/brain/reflect/preview`]: (body) => shift(reflectPreview((body as { key: string }).key)),
  [`POST ${API}/brain/reflect/apply`]: (body): ReflectApplyResult => {
    const b = body as ReflectApplyBody
    const br = `brain/${b.key}-reflect-1`
    const wt = `/Users/alice/.brain/worktrees/shop-pay/brain-${b.key}-reflect-1`
    const mr = 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/58'
    return {
      ok: true, branch: br, worktree: wt, mr_url: b.push ? mr : null, pushed: b.push,
      output: `预览：没有真的写。\n  new T-PAY-5-2\n${b.push ? `已推送并开 MR：${mr}` : `已提交到本地分支 ${br}（${wt}）。看过以后推送：git -C ${wt} push -u origin ${br}`}`,
    }
  },
  [`POST ${API}/team/loop`]: () => ({ ok: true, summary: { poll: 3, prepared: 0, dispatch: 1, watch: 2, collect: 1, reconcile: 0 }, error: '' }),
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
    if (flags.has('nokit') && !(path.endsWith('/ready') || listed || readyPaths.has(path))) {
      // importer.inspect without brain-kit loaded: it cannot install
      c.next = 'fix'
      c.install = null
      c.checks = c.checks.map((x) => (x.id === 'kit' ? { ...x, level: 'FAIL' as const, why: '没装（没有 .brain/kit.json），app 现在也没装载 brain-kit，装不了', todo: '先在设置里写对 brain-kit 的位置' } : x))
      return c
    }
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
      const b = body as { path: string; mode?: string; kit?: Partial<KitForm> }
      const job = at(b.path)(b.mode === 'inplace' ? fx.importInplaceJob() : fx.importJob())
      if (b.kit && job.result) {
        // what installer.kit_line says about the kit the form wrote
        const k: KitForm = { ...job.result.kit, ...b.kit }
        const line = [`需求号 ${k.req_prefix}-n`, `跟踪 ${k.tracker}`, `默认分支 ${k.default_branch}`,
          ...(k.gitlab_project ? [`GitLab ${k.gitlab_project}（${k.gitlab_base}）`] : []), ...(k.team ? [`团队 ${k.team}`] : [])].join(' · ')
        job.result = { ...job.result, kit: k }
        job.steps = job.steps.map((x) => (x.id === 'kit' ? { ...x, detail: line } : x))
      }
      return start(job, b.path)
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
