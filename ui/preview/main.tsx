/**
 * Standalone preview of the Brain app for screenshots and a click-through without KiroCrew: the real app (src/main.tsx)
 * against the stubbed SDK (src/test/stubs, the same ones vitest uses), every route answered from the fixtures in
 * src/test/fixtures (writes answer something plausible and change nothing). Built by `npm run preview:build` into
 * preview-dist/index.html (one file, opens from file:// too).
 *
 * The bar above the app switches the world: 团队模式, 找不到 brain-kit, KiroCrew 有 FAIL, 没有 evaluate, light/dark.
 * The switches live in sessionStorage (the app rewrites the URL as you move); `?pv=team,light,…` sets them from a link.
 * Every fixture time is moved so that the fixtures' `at` is now. Opening a session is shown, not done.
 */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/main'
import { FIXTURE_AT, clone, fx } from '../src/test/data'
import { API, fixtureRoutes } from '../src/test/routes'
import { StubApiError, setApiRoutes, setNavigateHook } from '../src/test/stubs/app-sdk'
import type { CrewFixBody, IntakeBody, ReflectApplyBody, ReflectApplyResult, RequirementDetail, Settings, StartBody, Status } from '../src/types'

const FLAGS = ['team', 'nokit', 'crewfail', 'noeval', 'light'] as const
type Flag = (typeof FLAGS)[number]
const FLAG_NAME: Record<Flag, string> = { team: '团队模式', nokit: '找不到 brain-kit', crewfail: 'KiroCrew 有 FAIL', noeval: '没有 evaluate', light: '亮色' }
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

function status(): Status {
  const s = fx.status()
  if (flags.has('team')) {
    s.app.team = true
    s.team = fx.team().status
  }
  if (flags.has('nokit')) {
    s.brainkit = { ...s.brainkit, ok: false, version: null, error: `${settings.brainkit} 里没有 brainkit/` }
  }
  if (flags.has('crewfail') && !crewFixed) s.crew.rows = [{ level: 'FAIL', text: '找不到 brain-dev agent：~/.kiro/agents/brain-dev.json 不存在' }, ...s.crew.rows]
  if (crewFixed) s.crew.rows = s.crew.rows.map((r) => ({ ...r, level: 'OK' as const }))
  s.team.enabled = s.team.enabled || settings.team.enabled
  return shift(s)
}

const WHERE: Record<string, string> = { worktree: '本机的工作目录', branch: '远端的运行分支', main: '默认分支', runner: '运行机的工作目录', claim: '只有认领分支' }

/** The detail fixture is PAY-3's; any other key of the overview gets a detail made from its row. */
function detailFor(path: string): RequirementDetail {
  const key = decodeURIComponent(path.split('/').pop() ?? '')
  const d = fx.detail()
  if (key === d.row.key) return d
  const row = fx.overview().rows.find((r) => r.key === key)
  if (!row) throw new StubApiError(404, { error: `没有这个需求：${key}`, code: 'not_found' })
  const n = row.lean.stage_n ?? 0
  const finished = row.state === 'merged' || row.lean.stage_state === 'done' || row.lean.stage_state === 'skipped'
  const current = row.lean.stage_state === 'todo' ? 'todo' : 'started'
  d.row = row
  d.where_label = WHERE[row.where] ?? row.where
  d.claim = d.claim && { ...d.claim, owner: row.owner, title: row.title }
  d.run = row.intent && d.run ? { ...d.run, owner: row.owner, branch: row.branch, intent: row.intent, handoff: row.run_ids.length ? { requested_at: d.run.created_at, by: row.owner } : null } : null
  d.lean.stages = d.lean.stages.map((s) => ({ ...s, state: s.n < n || finished ? 'done' : s.n === n ? current : 'todo', units: s.n < n ? s.units.map((u) => ({ ...u, state: 'done' as const })) : [] }))
  d.lean.approvals = n > 2 ? d.lean.approvals.filter((a) => a.state !== 'pending') : []
  d.lean.status = n ? d.lean.status : null
  d.lean.next = n ? d.lean.next : []
  d.lean.open_questions = []
  d.questions = fx.todo().items.filter((i) => i.key === key && i.question).map((i) => i.question!)
  d.decisions = n ? d.decisions.slice(0, 2) : []
  d.sessions = row.sessions ? d.sessions.map((s) => ({ ...s, slot: `brain-${key}-1`, url: `/chat?sid=brain-${key}-1`, title: `${key} ${row.title}`, awaiting: false, credits: row.credits })) : []
  d.timeline.items = d.timeline.items.slice(0, n ? 3 : 1)
  d.credits.total = row.credits
  d.brain = n ? d.brain : { loaded: null, cited: [], stale: [], unknown: [], proposals: null }
  d.mr_desc = row.summary
    ? {
        ...d.mr_desc, first: row.summary, source: row.run_ids.length ? 'file' : 'records', path: `runs/${key}/MR.md`,
        text: d.mr_desc.text.split('PAY-3').join(key).split('退款单导出 CSV').join(row.title).replace(/\*\*一句话\*\*：.*\n/, `**一句话**：${row.summary}\n`),
      }
    : { available: true, text: '', first: null, source: null, path: null, ref: null, error: '还没有 run（只有认领）：开工以后才有变更说明' }
  return d
}

const routes = fixtureRoutes()
setApiRoutes({
  ...Object.fromEntries(Object.entries(routes).map(([k, h]) => [k, (...a: Parameters<typeof h>) => shift(h(...a))])),
  [`GET ${API}/status`]: () => status(),
  [`GET ${API}/requirements/*`]: (_b, path) => shift(detailFor(path)),
  [`GET ${API}/settings`]: () => clone(settings),
  [`GET ${API}/crew`]: () => ({ ...status().crew }),
  [`GET ${API}/todo`]: () => shift({ ...fx.todo(), team: flags.has('team') }),
  [`GET ${API}/overview*`]: () => {
    const o = shift(fx.overview())
    if (flags.has('noeval')) o.eval = { available: false, error: '', ref: null, metrics: [], queue: [], skipped: [], notes: [] }
    return o
  },
  [`POST ${API}/settings`]: (body) => {
    settings = clone(body as Settings)
    return { ok: true, settings: clone(settings), status: status() }
  },
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
