/**
 * Standalone preview of the Brain app for screenshots and a click-through without KiroCrew: the real app (src/main.tsx)
 * against the stubbed SDK (src/test/stubs, the same ones vitest uses), every route answered from the fixtures in
 * src/test/fixtures (writes answer something plausible and change nothing). Built by `npm run preview:build` into
 * preview-dist/index.html (one file, opens from file:// too).
 *
 * The bar above the app switches the world: 团队模式, 找不到 brain-kit, KiroCrew 有 FAIL, 没有 evaluate, 没有仓库, 认领晚一步 (a
 * claim of a small requirement loses the race to carol's), light/dark. 拆成小需求, 认领, 开工 and 同步 answer as brain-kit
 * would, and change nothing.
 * 导入仓库 is played through: a path ending in /ready is installed already; any other is not, and its install (or a clone)
 * runs as a job whose steps advance over a few seconds; 加入列表 and 移出列表 change the preview's list.
 * The switches live in sessionStorage (the app rewrites the URL as you move); `?pv=team,light,…` sets them from a link.
 * Every fixture time is moved so that the fixtures' `at` is now. Opening a session is shown, not done.
 *
 * The stubs answer as the real backend does, so the preview never looks better than the app: 待办 is the backend's own
 * list when the world has it (else the fixture), only of the repos listed (in team mode the person's own, then the
 * runner's), its KiroCrew items made from the FAIL rows as backend/core/todo.py makes them, and /status counts that very
 * list; KiroCrew's rows are those of the listed repos; brain-kit not found says it as backend/core/bk.py does, with no
 * modules; without evaluate the module is off and 交付评估 says so as the backend does; gate 2 refuses confidential
 * material as brain-kit does when the repo's kit does not allow it (it never does here); a repo filter answers with that
 * repo's own numbers when the world has them; the Brain of a repo is the one brainview.view made for it (a repo the app
 * cannot read answers 404, as the backend does), a reflect preview is the requirement's own, 运行机's counts come from
 * its own runs table, a round says brain-kit's steps; 开审查会话 opens a new session, never the live one.
 */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/main'
import { FIXTURE_AT, clone, fx } from '../src/test/data'
import world from './world.json'
import { API, fixtureRoutes } from '../src/test/routes'
import { StubApiError, setApiRoutes, setNavigateHook } from '../src/test/stubs/app-sdk'
import { simulated } from './simulate'
import type {
  BrainView, CheckRow, CrewFixBody, ImportInspect, ImportJob, InstallResult, IntakeBody, IntakeNext, KitForm, OpenSessionBody, Overview, ReflectApplyBody, ReflectApplyResult, ReflectPreview, RepoInfo, ReqBoard, RequirementDetail, Settings, SplitResult, StartBody, Status, TeamView, Todo,
} from '../src/types'

const FLAGS = ['team', 'nokit', 'crewfail', 'noeval', 'norepos', 'race', 'light'] as const
type Flag = (typeof FLAGS)[number]
const FLAG_NAME: Record<Flag, string> = { team: '团队模式', nokit: '找不到 brain-kit', crewfail: 'KiroCrew 有 FAIL', noeval: '没有 evaluate', norepos: '没有仓库', race: '认领晚一步', light: '亮色' }
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
  overviews: Record<'eval' | 'noeval', Record<string, Overview>>; todo: Record<'ok' | 'crewfail' | 'team', Todo>
  /** team mode's 交付总览 (the team runner's machine): each requirement once, a handed-over one as the runner's */
  overviews_team?: Record<'eval' | 'noeval', Record<string, Overview>>
  /** KiroCrew's row when brain-dev.json is not there at all (problems.agent_missing), and why a session is not opened
   * then (crewcheck.not_ready: the button that row has) */
  crew_missing?: CheckRow
  crew_not_ready?: string
  /** 你是谁 on a GitLab repo of this machine, which has a GitLab token (identity.of: GitLab's name, nothing asked) */
  me_token?: NonNullable<ImportInspect['me']>
  stages: Record<string, RequirementDetail['lean']['stages']>; brains: Record<string, BrainView>
  /** brainview.preview of a reflectable run, by repo/key, when the world recorded it */
  reflects?: Record<string, ReflectPreview>
  /** 先检查's stop lines: brain-kit's own (its dry run: the picks 机密 / 不确定 / 绝密, the partner guide marked 机密,
   * gate 3) and the page's words for each, by "<pick>|<line>" (intake.gate_text) */
  intake_gates?: { raw: Record<'confidential' | 'unsure' | 'secret' | 'partner' | 'business', string>; said: Record<string, string> }
}
let repos: RepoInfo[] = flags.has('norepos') ? [] : clone(W.status.repos)

/** KiroCrew's rows as the backend reads them: brain-dev.json's row says what is there, a repo's rows are the listed
 * repos'; 「KiroCrew 有 FAIL」 is brain-dev.json missing (backend/core/problems.py's words for it). */
function crewRows(): CheckRow[] {
  if (flags.has('nokit')) return [{ level: 'FAIL', text: 'brain-kit 没装载', todo: '在「设置」里写对 brain-kit 的位置', fix: null, repo: null, raw: '' }]
  const listed = new Set(repos.map((r) => r.path))
  const rows = clone(W.status.crew.rows).filter((r) => !r.repo || listed.has(r.repo))
  if (!flags.has('crewfail') || crewFixed) return rows
  return rows.map((r) => (!r.repo && /^brain-dev/.test(r.text) && W.crew_missing ? clone(W.crew_missing) : r))
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
  if (flags.has('noeval')) s.brainkit.modules = { ...s.brainkit.modules, evaluate: false }
  s.crew.rows = crewRows()
  if (flags.has('crewfail') && !crewFixed) s.crew.fix = { ...s.crew.fix, agent: true }
  s.counts.todo = todo().items.length
  s.team.enabled = s.team.enabled || settings.team.enabled
  return shift(s)
}

/** 待办 as GET /todo answers: the backend's list (backend/core/todo.py made each in the world), of the repos listed only;
 * in team mode the person's own, then the runner ledger's; KiroCrew's item while brain-dev.json is missing. */
function todo(): Todo {
  const team = flags.has('team')
  const failing = flags.has('crewfail') && !crewFixed
  const listed = new Set(listedRepos().filter((r) => r.ok).map((r) => r.id))
  if (team) listed.add('runner')
  const items = clone(W.todo[team ? 'team' : 'ok'].items).filter((i) => listed.has(i.repo))
  const crew = failing ? clone(W.todo.crewfail.items).filter((i) => i.kind === 'crew') : []
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
  d.timeline = { source: 'trace', items: b.events.map((e) => ({ at: new Date(e.at * 1000).toISOString(), kind: (({ request: 'approval', approve: 'approval', reject: 'approval', refused: 'approval', commit: 'commit', handover: 'handover', accepted: 'handover', rejected: 'handover', signed: 'handover', question: 'question', answer: 'decision', verify: 'verify', merge: 'merge', blocked: 'blocked', stage: 'stage', session: 'session' } as Record<string, string>)[e.kind] ?? 'app') as RequirementDetail['timeline']['items'][number]['kind'], label: e.text, detail: null, who: null, src: e.src })), missing: b.missing, error: '', other_runs: [] }
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
    if (w && r.how !== 'ended') w[r.how] += 1     // one that ended without a delivery is never merged
  }
  for (const r of o.rows) {
    const at = r.waits.since ?? r.updated_at
    const w = at ? by.get(monday(at)) : undefined
    if (r.state === 'merged' && !judged.has(`${r.repo}/${r.key}`) && w) w.pending += 1
  }
  o.cto.weekly = weeks.map((w) => by.get(w)!)
  return o
}

/** 交付总览 as the backend made it for that repo (or 全部), with or without brainkit.evaluate; only the repos that can be read. */
function overview(path: string): Overview {
  const repo = new URL(path, location.origin).searchParams.get('repo') ?? 'all'
  const usable = new Set(listedRepos().filter((r) => r.ok).map((r) => r.id))
  const byRepo = (flags.has('team') && W.overviews_team ? W.overviews_team : W.overviews)?.[flags.has('noeval') ? 'noeval' : 'eval']
  // nothing readable (no brain-kit): the backend's answer for a repo it has no rows of, shop-web's (not installed)
  const own = usable.size === 0 && repos.some((r) => r.ok) ? byRepo?.r2 : byRepo?.[repo]
  const o = clone(own ?? W.overview)
  if ((repo !== 'all' && !own) || usable.size < repos.filter((r) => r.ok).length) {
    o.rows = o.rows.filter((r) => (repo === 'all' || r.repo === repo) && usable.has(r.repo))
    o.cto.runs = o.cto.runs.filter((r) => (repo === 'all' || r.repo === repo) && usable.has(r.repo))
    o.overlaps = o.overlaps.filter((x) => o.rows.some((r) => r.key === x.keys[0]))
  }
  const raw = (id: string) => o.errors.find((e) => e.repo === id)?.raw ?? ''
  o.errors = listedRepos().filter((r) => !r.ok && !r.pending && (repo === 'all' || r.id === repo)).map((r) => ({ repo: r.id, error: r.error, raw: raw(r.id) }))
  if (flags.has('noeval') && !own) {
    o.eval = { available: false, error: '这个 brain-kit 还没有交付评估：在设置里换新一点的 brain-kit', ref: null, metrics: [], queue: [], skipped: [], notes: [], families: [] }
    o.cto = { ...o.cto, available: false, unattended: null, stepped_in: null, runs: [], sentence: o.cto.credits.per_req !== null ? `每个需求平均 ${o.cto.credits.per_req} credits。` : o.cto.sentence }
  }
  return o
}

/** GET /brain?repo=: the Brain brainview.view made for that repo in the world; a repo the app cannot read is not one it
 * has (backend/core/service.py _repo: 404); one added in the preview has an empty Brain, as a fresh install does. */
function brain(path: string): BrainView {
  const repo = new URL(path, location.origin).searchParams.get('repo') ?? ''
  if (!listedRepos().some((r) => r.id === repo && r.ok)) throw new StubApiError(404, { error: '没有这个仓库', code: 'no_repo' })
  if (W.brains[repo]) return clone(W.brains[repo])
  const b = clone(W.brains.r1)
  return { ...b, repo, files: b.files.map((f) => ({ ...f, count: 0, sections: [] })), lint: { errors: [], warnings: [] },
    usage: { useful: [0, 0], repeat_rate: [0, 0], archived: 0, purged: 0, runs: [], never_cited: [], repeats_any: [], unmerged: [] }, reflect: [] }
}

/** POST /brain/reflect/preview: the requirement's own run, planned against that repo's Brain in the world: the
 * backend's own answer when the world recorded it; else PAY-5 has new knowledge (the fixture, said as the backend says
 * brain-kit's lines), a run whose entries are in the Brain already (T-ORD-2-1 is ORD-2's) was written back, so
 * brain-kit skips those proposals, and any other proposes nothing the world knows of. A merged run is read on main,
 * one in its worktree there. */
function reflectPreview(repo: string, key: string): ReflectPreview {
  const brain = W.brains[repo]
  if (!brain || !listedRepos().some((r) => r.id === repo && r.ok)) throw new StubApiError(404, { error: '没有这个仓库', code: 'no_repo' })
  const recorded = W.reflects?.[`${repo}/${key}`]
  if (recorded) return clone(recorded)
  const row = W.boards[`${repo}/${key}`]?.row
  const source = `${row?.state === 'merged' ? 'main:' : ''}aidlc-docs/${row?.intent ?? key.toLowerCase()}/decisions.md`
  const f = fx.reflect()
  if (repo === 'r1' && key === 'PAY-5') {
    return { ...f, repo, key, gaps: f.gaps.map((g) => ({ ...g, kind: 'knowledge' })),
      notes: ['第 31 行的提议和 T-PAY-2-1 的文字一样：只给 T-PAY-2-1 补来源'],
      warnings: ['D-3 被否了（凭证 V-7c1e9a20），可是没有一条纠正或「又出现」的提议提到它'],
      raw: ['proposal at line 31: same text as T-PAY-2-1: recorded as same (sources added)', 'D-3 (V-7c1e9a20) was rejected, but no correction or repeats proposal cites it'] }
  }
  const own = new RegExp(`^[A-Z]-${key}-\\d+$`)
  const written = brain.files.flatMap((x) => x.sections.flatMap((sec) => sec.entries.map((e) => e.id))).filter((id) => own.test(id))
  const lines = written.map((id, i) => [18 + 9 * i, id] as const)
  return { ...f, repo, key, source, ops: [], gaps: [], warnings: [], problems: [], substantive: false,
    notes: lines.map(([n, id]) => `第 ${n} 行的提议 Brain 里已经有了（${id}），跳过`),
    raw: lines.map(([n, id]) => `proposal at line ${n}: already in the Brain as ${id}, skipped`) }
}

/** GET /team: the ledger's run counts from its own runs table (the backend reads both from one table); its refusal is
 * the fixture's, said as backend/core/problems.py says the bridge's words. */
function team(): TeamView {
  const t = fx.team()
  const runs: Record<string, number> = {}
  for (const r of t.runs) runs[r.state] = (runs[r.state] ?? 0) + 1
  t.ledger.runs = runs
  return t
}

/** GET /intake/next?repo=: the next free key of that repo (its prefix, after its highest one: the world's requirements
 * of that checkout, none for one imported here), whether gate 2 takes confidential material (no kit here allows it),
 * and the default branch an in-place install left unpushed. */
function intakeNext(path: string): IntakeNext {
  const repo = new URL(path, location.origin).searchParams.get('repo') ?? ''
  const r = repos.find((x) => x.id === repo)
  const prefix = r?.kit?.req_prefix ?? ''
  if (!r || !prefix) return { repo, key: null, tracker: 'none', prefix: '', error: '这个仓库还没装 brain-kit', allow_confidential: false, push: null, big: { ok: false, why: '' } }
  const world = W.status.repos.find((x) => x.path === r.path)?.id
  const n = Math.max(0, ...W.overview.rows.filter((x) => x.repo === world).map((x) => Number(x.key.split('-').pop()) || 0))
  // 「大需求：先拆成小需求」: as backend/core/intake.py says it (only a repo without Jira; a brain-kit with brain split)
  const tracker = r.kit?.tracker ?? 'none'
  const big = tracker !== 'none' ? { ok: false, why: '这个仓库用 Jira：大需求只在不用 Jira 的仓库里拆' }
    : flags.has('nokit') ? { ok: false, why: '这个 brain-kit 还不会拆小需求：在设置里换新一点的 brain-kit' } : { ok: true, why: '' }
  return { repo, key: `${prefix}-${n + 1}`, tracker, prefix, error: '', allow_confidential: false, push: unpushed.get(r.path) ?? null, big }
}

/** What 导入仓库 did to a path in the preview, read by the routes that answer about it afterwards. */
const installedKit = new Map<string, KitForm>()                                   // the kit an install wrote
const unpushed = new Map<string, { branch: string; remote_url: string }>()        // in place, the default branch not pushed
const published = new Map<string, string | null>()                               // the install branch pushed: its MR
const named = new Map<string, string>()                                           // 你是谁 saved (git config brain.user)


/** A check's or a start's answer for the key and 英文短名 the form sent (the key: the next free one when it sent none),
 * as the backend answers: the fixtures were made for PAY-8 merchant-weekly. */
function keyed<T>(x: T, b: IntakeBody): T {
  const key = b.key || intakeNext(`${API}/intake/next?repo=${encodeURIComponent(b.repo)}`).key || 'PAY-8'
  return JSON.parse(JSON.stringify(x).split('PAY-8').join(key).split('merchant-weekly').join(b.slug || 'merchant-weekly')) as T
}

const routes = fixtureRoutes()
setApiRoutes({
  ...Object.fromEntries(Object.entries(routes).map(([k, h]) => [k, (...a: Parameters<typeof h>) => shift(h(...a))])),
  [`GET ${API}/status`]: () => status(),
  [`GET ${API}/requirements/*`]: (_b, path) => shift(detailFor(path)),
  [`GET ${API}/board/*`]: (_b, path) => shift(simulated(boardFor(path))),
  [`GET ${API}/settings`]: () => clone(settings),
  [`GET ${API}/crew`]: () => ({ ...status().crew }),
  [`GET ${API}/todo`]: () => shift(todo()),
  [`GET ${API}/overview*`]: (_b, path) => rebucket(shift(overview(path))),
  [`GET ${API}/brain*`]: (_b, path) => shift(brain(path)),
  [`GET ${API}/team`]: () => shift(teamView()),
  [`GET ${API}/intake/next*`]: (_b, path) => intakeNext(path),
  [`GET ${API}/import/defaults`]: () => ({ ...fx.importDefaults(), brainkit_ok: !flags.has('nokit') }),
  [`POST ${API}/settings`]: (body) => {
    settings = { ...settings, ...clone(body as Partial<Settings>) }
    return { ok: true, settings: clone(settings), status: status() }
  },
  ...importRoutes(),
  [`POST ${API}/refresh`]: (body) => ({ ok: true, text: `预览：没有真的跑 git fetch（${(body as { repo: string }).repo}）` }),
  [`POST ${API}/requirements/*`]: (body, path) => {
    if (path.endsWith('/session')) {
      // as service._open_local: no brain-dev session while KiroCrew's brain-dev row fails
      if (flags.has('crewfail') && !crewFixed) throw new StubApiError(409, { error: W.crew_not_ready ?? '', code: 'agent_not_ready' })
      const { key } = reqOf(path.replace(/\/session$/, ''))
      const slot = (body as OpenSessionBody | undefined)?.review ? `brain-${key}-review-${Math.random().toString(16).slice(2, 6)}` : `brain-${key}-7f3a`
      return { ok: true, slot, url: `/chat?sid=${slot}` }
    }
    // 大需求拆成小需求: shown, not done (a small one's unit from its family, the world's)
    const fam = /\/(split|claim|start|sync)$/.exec(path)
    if (fam) {
      const { key, id } = reqOf(path.slice(0, fam.index))
      const unit = W.boards[id]?.row.family?.unit ?? 'jobs'
      if (fam[1] === 'split') return splitAnswer(id, key, !!(body as { apply?: boolean }).apply)
      if (fam[1] === 'claim') {
        const release = !!(body as { release?: boolean }).release
        if (!release && flags.has('race')) {    // carol's claim reached the server first (brain-kit: first push wins)
          const text = `晚了一步：carol 先认领了 ${key}`
          return { ok: false, text, owner: 'carol', output: `brain: ${key} was just claimed by carol: their claim reached the server first`,
            problem: { level: 'FAIL', text, todo: '换一个待认领的小需求', fix: null, repo: null, raw: `${key} was just claimed by carol: their claim reached the server first` } }
        }
        return { ok: true, text: release ? `预览：没有真的放回。放回去了：${key} 又是待认领` : `预览：没有真的认领。认领了 ${key}`, owner: release ? null : 'alice', problem: null, output: '' }
      }
      if (fam[1] === 'start') {
        const on = (body as { on?: string }).on ?? null
        return { ok: true, key, branch: `ai/alice/${key}-${unit}`, worktree: `/Users/alice/workplace/brain-app/shop-pay/${key.toLowerCase()}-${unit}`, on,
          text: `预览：没有真的开工。开工了：${key}（${unit}），分支 ai/alice/${key}-${unit}${on ? `，从 ${on} 的分支开始` : ''}`, blocked: [], can_on: null, problem: null,
          output: '', slot: `brain-${key}-1a2b`, url: `/chat?sid=brain-${key}-1a2b`, session_error: '' }
      }
      const parent = W.boards[id]?.row.family?.branch ?? 'ai/alice/PAY-8-big'
      return { ok: true, result: 'merged', text: `预览：没有真的同步。合进来了：${parent}，Lean 自己的文件已经自动解决`, conflicts: [], problem: null, output: '' }
    }
    const choice = (body as { choice: string }).choice
    return { ok: true, via: 'session', text: `预览：回答 ${choice} 没有真的送出去` }
  },
  [`POST ${API}/intake/check`]: (body) => {
    const b = body as IntakeBody
    const c = keyed(fx.intakeCheck(), b)
    if (!b.consent) return { ...c, ok: false, findings: [], files: [], blocking: [], blocking_raw: [], refused: [], error: '第 1 关：勾上「我是作者，或已取得作者同意」' }
    // as brain-kit's rules go with this repo's kit.json (intake.allow_confidential false, the default): the partner
    // guide (D03) is marked Confidential, so it stops the check unless it is left out; so does a confidential pick
    const partner = !b.exclude.some((g) => '合作方接口说明.pdf'.includes(g.replace(/\*/g, '')))
    const given = b.classification === 'unsure' ? 'confidential' : b.classification
    if (!partner) {
      c.findings = c.findings.filter((l) => !l.includes('D03'))
      c.files = (c.files ?? []).filter((f) => f.id !== 'D03')
      c.sources -= 1
    }
    // brain-kit's lines as its dry run says them (gate 2 names a marked file, else the pick), each in the page's words
    const gate = W.intake_gates!
    const raw: string[] = []
    if (given === 'secret') raw.push(gate.raw.secret)
    else if (partner) raw.push(gate.raw.partner)
    else if (b.classification === 'confidential' || b.classification === 'unsure') raw.push(gate.raw[b.classification])
    if (!b.business) raw.push(gate.raw.business)
    const plain = raw.map((l) => gate.said[`${b.classification}|${l}`] ?? l)
    if (b.business === 'mask') {
      // brain-kit masks them (its line: 商业敏感（已打码）), and backend/core/intake.py file_items says so
      c.findings = c.findings.map((l) => l.replace('商业敏感（原样保留）', '商业敏感（已打码）'))
      c.files = (c.files ?? []).map((f) => ({ ...f, items: f.items.map((t) => t.replace(/^((?:金额|公司名) \d+ 处)：原样保留$/, '$1：已换成占位符')) }))
    }
    c.classification = given === 'secret' ? 'secret' : partner ? 'confidential' : given || 'internal'
    return { ...c, ok: raw.length === 0, blocking: plain, blocking_raw: raw }
  },
  [`POST ${API}/intake/start`]: (body) => {
    const b = body as StartBody
    const r = keyed(fx.start(), b)
    if (!b.open_session) return { ...r, slot: null, url: null }
    if (flags.has('crewfail') && !crewFixed) return { ...r, slot: null, url: null, session_error: W.crew_not_ready ?? '' }
    return r
  },
  [`POST ${API}/crew/fix`]: (body) => {
    crewFixed = true
    return { ok: true, text: `预览：${(body as CrewFixBody).what === 'agent' ? '装好了 brain-dev（brain-kit 带的那一份）' : '引擎设成了 kas'}（没有真的改）`, rows: status().crew.rows }
  },
  [`POST ${API}/brain/reflect/preview`]: (body) => {
    const b = body as { repo: string; key: string }
    return shift(reflectPreview(b.repo, b.key))
  },
  [`POST ${API}/brain/reflect/apply`]: (body): ReflectApplyResult => {
    const b = body as ReflectApplyBody
    const r = repos.find((x) => x.id === b.repo)
    const br = `brain/${b.key}-reflect-1`
    const wt = `/Users/alice/.brain/worktrees/${r?.name ?? b.repo}/brain-${b.key}-reflect-1`
    const mr = `${r?.kit?.gitlab_base || 'https://gitlab.example.com'}/${r?.kit?.gitlab_project || `shop/${r?.name ?? b.repo}`}/-/merge_requests/58`
    return {
      ok: true, branch: br, worktree: wt, mr_url: b.push ? mr : null, pushed: b.push,
      output: `预览：没有真的写。\n  new T-${b.key}-1\n${b.push ? `已推送并开 MR：${mr}` : `已提交到本地分支 ${br}（${wt}）。看过以后推送：git -C ${wt} push -u origin ${br}`}`,
    }
  },
  [`POST ${API}/team/loop`]: () => ({ ok: true, summary: { poll: 3, prepared: 0, dispatch: 1, watch: 2, collect: 1, reconcile: 0 }, error: '' }),
})

/** 运行机 in the preview: the fixture with what brain-kit 0d52e97's bridge also keeps (the outbox, the notices on a run,
 * bridge.json and runnerd.json, the runner's hooks). */
function teamView(): TeamView {
  const t = team()
  t.ledger.outbox = { sent: 14, unknown: 1, dropped: 1 }
  t.runs = t.runs.map((r) => (r.run_id === 'RUN-PAY-5-1' ? { ...r, notes: [{ kind: 'ci_wait', text: '验收问题等 MR 的流水线通过才发（通过以后桥自动发）', at: FIXTURE_AT - 1800 }] }
    : r.run_id === 'RUN-PAY-4-1' ? { ...r, notes: [{ kind: 'outbox_unknown', text: 'D-2 的回答不知道送到会话没有（送过 1 次）：桥每轮看一下会话，看到了就算送到；一直这样就要人看一下会话', at: FIXTURE_AT - 600 }] } : r))
  t.config = [
    { file: 'bridge.json', key: 'interval', value: '60 秒', default: true, text: '桥每隔这么久跑一轮' },
    { file: 'bridge.json', key: 'send_give_up_minutes', value: '60 分钟', default: true, text: '接手消息送了 3 次都没进运行机的会话，过了这么久就算这个 run 没能开始（回答和通知一直送，不放弃）' },
    { file: 'bridge.json', key: 'runnerd_wait_minutes', value: '120 分钟', default: false, text: '运行机这么久没准备好工作区、也没报错，就在 MR 上说一声（桥接着等）' },
    { file: 'bridge.json', key: 'acceptance_ci_wait_minutes', value: '60 分钟', default: true, text: '验收问题等流水线通过才发：流水线这么久还没跑完，就在 MR 上说一声' },
    { file: 'bridge.json', key: 'edit_check_rounds', value: '3', default: true, text: '查不到回复有没有被别人改过：连着这么多轮，就在 MR 上说一声（回答先等着，不算也不丢）' },
    { file: 'bridge.json', key: 'edit_check_wait_minutes', value: '30 分钟', default: true, text: '……或者从第一次查不到起过了这么久' },
    { file: 'runnerd.json', key: 'kit_dir', value: '/opt/brain-kit', default: false, text: '运行机用哪份 brain-kit 的 kit/：每建一个工作区前查一次，它的 lean-hook.py 要是第 3 版' },
    { file: 'runnerd.json', key: 'agent_spec', value: '/home/brainbot/.kiro/agents/brain-run.json', default: false, text: 'brain-run 的 agent 文件：查它带着 lean-hook.py --runner 的三个 hook（工具调用前的匹配要是 *）' },
    { file: 'runnerd.json', key: 'hook_path', value: '/usr/bin:/bin', default: true, text: '运行机上的 hook 找 git 和 ssh-keygen 用的 PATH' },
  ]
  t.hooks = [{ level: 'OK', text: '运行机的 Lean hook 没问题：brain-kit 带的 lean-hook.py 是第 3 版，brain-run 的三个 hook 都对', todo: '', fix: null, repo: null, raw: '' }]
  return t
}

/** 拆成小需求 in the preview: what `brain split --dry-run --json` would say for a big one's three units (nothing filed). */
function splitAnswer(id: string, key: string, apply: boolean): SplitResult {
  const units: [string, string, string, string[]][] = [['api', '通过接口提交退款', 'services/api/**', []], ['web', '在订单页看到退款状态', 'web/**', ['api']],
    ['jobs', '每晚自动对账', 'jobs/**', ['web']]]
  const fam = W.boards[id]?.row.family
  if (fam?.role === 'parent') {        // split already: the same approved units again, nothing changes
    return { ok: true, dry_run: !apply, parent: key, branch: fam.branch, units_sha: '31369169', design_sha: '4a037c33', warnings: [], problems: [], output: '',
      actions: fam.children.map((c) => ({ unit: c.unit ?? '', kind: 'same', kind_label: '没变', key: c.key, title: c.title, paths: [], depends_on: c.depends_on, contracts: [], why: [], attention: false })),
      text: `${apply ? '预览：没有真的拆。拆好了' : '会拆成'} ${fam.children.length} 个小需求（没变 ${fam.children.length} 个）` }
  }
  const n = Number(key.split('-')[1] ?? 0)
  return {
    ok: true, dry_run: !apply, parent: key, branch: `ai/alice/${key}-big`, units_sha: '31369169', design_sha: '4a037c33',
    actions: units.map(([unit, title, paths, deps], i) => ({
      unit, kind: 'new', kind_label: '新登记（待认领）', key: apply ? `PAY-${n + 10 + i}` : null, title: `${unit} · ${title}`, paths: [paths],
      depends_on: deps.map((d) => (apply ? `PAY-${n + 10 + units.findIndex((u) => u[0] === d)}` : `${d}（新）`)), contracts: [], why: [], attention: false,
    })),
    warnings: [], problems: [], output: '',
    text: apply ? '预览：没有真的拆。拆好了：3 个小需求（新登记 3 个（待认领））' : '会拆成 3 个小需求（新登记 3 个（待认领））',
  }
}

/** 导入仓库 in the preview: the fixtures moved to the path asked for; jobs whose steps advance with the clock. */
function importRoutes() {
  const FIXTURE_PATH = fx.importInspect().path as string
  const pendingPaths = new Set<string>()
  const readyPaths = new Set<string>()      // installed in place, or merged / pulled: brain-kit is in the checkout
  const jobs = new Map<string, { job: ImportJob<unknown>; at: number; path: string }>()
  const cloned = new Set<string>()         // made by 克隆 here: nothing uncommitted in it
  const at = (p: string) => <T,>(x: T): T => JSON.parse(JSON.stringify(x).split(FIXTURE_PATH).join(p)) as T
  // a check of another folder than the fixtures' refund: importer.form_defaults' key prefix from the folder's name
  // (and its GitLab project, as if cloned from shop/<folder>)
  const FIXTURE_NAME = FIXTURE_PATH.split('/').pop() as string
  const inFolder = (p: string) => <T,>(x: T): T => {
    const name = p.split('/').pop() ?? ''
    const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    const prefix = /^[A-Z][A-Z0-9]{0,9}$/.test(letters) ? letters : 'REQ'
    return JSON.parse(JSON.stringify(at(p)(x)).split(`shop/${FIXTURE_NAME}`).join(`shop/${name}`).split(FIXTURE_NAME.toUpperCase()).join(prefix)) as T
  }
  const READY_KIT: KitForm = { tracker: 'none', req_prefix: 'READY', jira_base: '', default_branch: 'main', gitlab_base: 'https://gitlab.example.com', gitlab_project: 'shop/ready', team: '' }
  const kitAt = (path: string) => installedKit.get(path) ?? READY_KIT
  // the install branch as importer.pending reads it: pushed with its MR open once 推送并开 MR went through
  const pendingAt = (path: string) => {
    const p = at(path)(fx.importInspectPending()).pending!
    if (!published.has(path)) return p
    const mr = published.get(path) ?? null
    const tgt = p.target || '默认分支'
    return { ...p, pushed: true, mr_url: mr, word: mr ? 'MR 等合并' : '等开 MR',
      text: mr ? `装在 ${p.branch} 分支上，MR 开着：合进 ${tgt} 以后生效` : `装在 ${p.branch} 分支上，推上去了：合进 ${tgt} 以后生效`,
      next: mr ? '在 GitLab 上合并 MR（团队的做法），合并以后点「拉取」' : '在 GitLab 上开 MR、合并；只有你一个人用的话，也可以在本机合并' }
  }
  // importer.inspect's 你是谁: identity.of with this machine's GitLab token (a GitLab repo: GitLab's name, nothing
  // asked), else the name saved here, else the listed repo's own
  const whoHere = (path: string, c: ImportInspect): ImportInspect => {
    const listed = repos.find((r) => r.path === path)
    const base = (listed?.kit ?? c.form)?.gitlab_base ?? ''
    const name = named.get(path)
    const me = W.status.me.token && base && W.me_token ? { ...W.me_token, gitlab: base }
      : name && c.me ? { ...c.me, name, source: 'git' as const, text: `${name}（你在这个仓库的名字）`, ask: false, label: '', why: '', suggest: '' }
        : listed?.me ?? null
    if (!me || me.ask) return c
    return { ...c, me, checks: c.checks.map((x) => (x.id === 'me' ? { ...x, level: 'OK' as const, why: me.text, todo: '' } : x)) }
  }
  const inspect = (path: string): ImportInspect => {
    const listed = repos.find((r) => r.path === path)
    // crewcheck.checks of this machine, and of the repo once it has brain-kit
    const crew = { rows: crewRows().filter((r) => !r.repo || r.repo === path), fix: { agent: flags.has('crewfail') && !crewFixed, engine: false } }
    if (pendingPaths.has(path)) {
      const c = whoHere(path, inFolder(path)(fx.importInspectPending()))
      const pending = pendingAt(path)
      // importer.inspect's brain-kit row says the install branch's own state, and its next step
      const checks = c.checks.map((x) => (x.id === 'kit' ? { ...x, why: `${pending.text}（AI-DLC Lean、Brain 文件、AGENTS.md 都在分支上）`, todo: pending.next } : x))
      return { ...c, crew, checks, pending, ...(listed ? { next: 'listed' as const, listed: listed.id } : {}) }
    }
    const c = whoHere(path, { ...inFolder(path)(fx.importInspect()), crew })
    // a fresh clone has nothing uncommitted (importer.inspect's 工作区 row)
    if (cloned.has(path)) {
      const clean = fx.importInspectPending().checks.find((x) => x.id === 'clean')!
      c.checks = c.checks.map((x) => (x.id === 'clean' ? clean : x))
    }
    if (listed && !listed.kit) {
      // listed, brain-kit not installed: the install card (kit none → install), the list row says it is listed
      c.listed = listed.id
      c.checks = c.checks.map((x) => (x.id === 'listed' ? { ...x, why: '已经在列表里' } : x))
    }
    const installed = path.endsWith('/ready') || !!listed?.kit || readyPaths.has(path)
    if (flags.has('nokit') && !installed) {
      // importer.inspect without brain-kit loaded: it cannot install
      c.next = 'fix'
      c.install = null
      c.checks = c.checks.map((x) => (x.id === 'kit' ? { ...x, level: 'FAIL' as const, why: '还没装 brain-kit，app 现在也没装载 brain-kit，装不了', todo: '先在设置里写对 brain-kit 的位置' } : x))
      return c
    }
    if (installed) {
      c.next = listed ? 'listed' : 'add'
      c.listed = listed?.id ?? null
      const k = listed?.kit ?? kitAt(path)
      c.kit = { state: 'checkout', values: { tracker: k.tracker, req_prefix: k.req_prefix, default_branch: k.default_branch, gitlab_base: k.gitlab_base, gitlab_project: k.gitlab_project } }
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
      const r = j.result as InstallResult | null
      ;(r?.mode === 'inplace' ? readyPaths : pendingPaths).add(got.path)
      if (r?.mode === 'inplace' && r.remote_url && !unpushed.has(got.path)) unpushed.set(got.path, { branch: r.branch, remote_url: r.remote_url })
    }
    return j
  }
  return {
    [`POST ${API}/import/inspect`]: (body: unknown) => inspect(String((body as { path: string }).path).replace(/\/+$/, '')),
    [`POST ${API}/import/clone`]: (body: unknown) => {
      const b = body as { url: string; parent: string; name: string }
      const name = b.name || b.url.replace(/\/+$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '') || 'repo'
      const path = `${b.parent.replace(/\/+$/, '')}/${name}`
      cloned.add(path)
      return start(at(path)(fx.importCloneJob()), path)
    },
    [`POST ${API}/import/install`]: (body: unknown) => {
      const b = body as { path: string; mode?: string; kit?: Partial<KitForm> }
      const job = at(b.path)(b.mode === 'inplace' ? fx.importInplaceJob() : fx.importJob())
      if (b.kit && job.result) {
        // what installer.kit_line says about the kit the form wrote
        const k: KitForm = { ...job.result.kit, ...b.kit }
        const line = [`需求号 ${k.req_prefix}-n`, k.tracker === 'jira' ? '用 Jira' : '不用 Jira', `默认分支 ${k.default_branch}`,
          ...(k.gitlab_project ? [`GitLab ${k.gitlab_project}（${k.gitlab_base}）`] : []), ...(k.team ? [`团队 ${k.team}`] : [])].join(' · ')
        job.result = { ...job.result, kit: k }
        job.steps = job.steps.map((x) => (x.id === 'kit' ? { ...x, detail: line } : x))
        installedKit.set(b.path, k)
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
    [`POST ${API}/import/push`]: (body: unknown) => {
      unpushed.delete((body as { path: string }).path)
      const r = fx.importPush()
      return { ...r, text: `预览：没有真的推送。${r.text}` }
    },
    [`GET ${API}/import/jobs/*`]: (_b: unknown, path: string) => progress(path.split('/').pop() ?? ''),
    [`POST ${API}/import/commit`]: () => ({ ok: true, sha: 'e'.repeat(40), blocked: false, text: '提交了 eeeeeeee（作者 alice）', output: '' }),
    [`POST ${API}/import/publish`]: (body: unknown) => {
      const path = (body as { path: string }).path
      const r = at(path)(fx.importPublish())
      r.text = `预览：没有真的推送。${r.text}`
      published.set(path, r.mr?.url ?? null)
      repos = repos.map((x) => (x.path === path && x.pending ? { ...x, pending: pendingAt(path) } : x))
      return r
    },
    [`POST ${API}/import/add`]: (body: unknown) => {
      const path = (body as { path: string }).path
      const id = `r${repos.length + 1}`
      const pending = pendingPaths.has(path) ? pendingAt(path) : null
      const k = kitAt(path)
      repos = [...repos, { id, path, name: path.split('/').pop() ?? path, ok: !pending, error: '', pending,
        kit: pending ? null : { tracker: k.tracker, req_prefix: k.req_prefix, default_branch: k.default_branch, gitlab_base: k.gitlab_base, gitlab_project: k.gitlab_project },
        me: pending ? null : at(path)(fx.importInspect()).me }]
      return { ok: true, id, text: `预览：加入了（${id}）${pending ? `：${pending.text}` : ''}`, status: status() }
    },
    [`POST ${API}/me/name`]: (body: unknown) => {
      const b = body as { path: string; name: string }
      const name = String(b.name || '').trim().toLowerCase()
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name)) throw new StubApiError(400, { error: '名字只能用小写字母、数字和 . _ -（字母或数字开头，最多 64 个）', code: 'invalid_name' })
      const me = { name, source: 'git' as const, gitlab: '', text: `${name}（你在这个仓库的名字）`, ask: false, label: '', why: '', suggest: '', error: '' }
      named.set(b.path, name)
      repos = repos.map((r) => (r.path === b.path && r.me ? { ...r, me: { ...me, gitlab: r.me.gitlab } } : r))
      return { ok: true, text: `你在这个仓库的名字设成了 ${name}`, raw: `git config brain.user ${name}`, me, status: status() }
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
