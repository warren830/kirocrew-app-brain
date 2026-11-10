import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import BrainApp from '../main'
import { colOf, laneOf } from '../cto/Flow'
import { searchOf } from '../nav'
import { clone, fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError, navigations } from '../test/stubs/app-sdk'
import type { CtoRun, FamilyChild, FamilyDep, LeanSummary, Overview, ReqFamily, ReqState, Requirement, Status } from '../types'
import { OV_CSS, OverviewView, plainSummary } from './Overview'
import type { ViewProps } from './props'
import { STATE_LABEL } from '../types'

function props(over: Partial<ViewProps> = {}): ViewProps {
  return { status: fx.status(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn(), pollMs: 60_000, ...over }
}

const rowOf = (table: HTMLElement, key: string) => table.querySelector(`tr[data-key="${key}"]`) as HTMLElement
const reqRows = (table: HTMLElement) => table.querySelectorAll('tr[data-key]')
const keysOf = (table: HTMLElement) => Array.from(reqRows(table)).map((r) => r.getAttribute('data-key'))
const cardOf = (flow: HTMLElement, key: string) => flow.querySelector(`[data-testid="flow-card"][data-key="${key}"]`) as HTMLElement

/** the review's real case: a repo with no remote, two sessions idle waiting on the person for Lean's review in a new
 * session, three claims not started */
function localWorld(): { ov: Overview; status: Status } {
  const ov = fx.overview()
  const status = fx.status()
  status.repos = status.repos.map((r) => ({ ...r, remote: false }))
  const base = ov.rows[0]
  const lean = { stage: 'release', stage_label: '发布', stage_n: 11, stage_state: 'todo' as const, done: 10, total: 11, done_n: 4, skipped_n: 6, next: { id: 'release', label: '发布', n: 11 } }
  const reply = (key: string, title: string): Requirement => ({ ...base, key, title, owner: 'dana', state: 'local', state_label: '本地开发中', lean, stage: '做完 4 · 跳过 6 · 下一步：发布', overlap: [], open_questions: [], mr: null, local_only: true,
    waits: { who: 'you', text: '构建测试做完了，下一步是发布：先开一个新会话做审查（这个会话写了代码，不能自己审）', line: null, raw: '', do: 'reply', since: ov.at - 11 * 3600 - 120, where: 'session', review: true },
    session_url: `/chat?sid=brain-${key}-dev`, worktree: `/Users/dana/workplace/demo/${key}` })
  const claim = (key: string, title: string): Requirement => ({ ...base, key, title, owner: 'dana', state: 'claimed', state_label: '已认领', summary: null, credits: null, updated_at: null, overlap: [], open_questions: [], mr: null, local_only: true,
    lean: { stage: null, stage_label: null, stage_n: null, stage_state: null, done: 0, total: 11, done_n: 0, skipped_n: 0, next: null }, stage: null,
    waits: { who: 'you', text: '已认领，还没开工', line: null, raw: '', do: 'start', since: ov.at - 3 * 3600, where: 'app' } })
  ov.rows = [reply('DEMO-1', '计算器减法'), claim('DEMO-2', 'AGENTS.md 缺仓库简介'), reply('DEMO-3', '计算器乘法'), claim('DEMO-4', 'add 的测试'), claim('DEMO-5', '仓库说明')]
  ov.overlaps = [{ keys: ['DEMO-1', 'DEMO-3'], paths: ['calc.py'] }]
  ov.cto = { ...ov.cto, sentence: '这个仓库只在本机做，不交给运行机。人介入了 2 次（本机做的也算），2 次落在判断点上。有 credits 的 2 个需求，平均每个 43.4 credits。', unattended: [0, 0], runs: [{ key: 'DEMO-1', repo: 'r1', how: 'pending', beyond: [], at_points: 1, outside: 0, credits: 49.8, merged_at: null, state: null, state_label: '', stuck: null, delivery: null, delivery_label: '', parent: null }, { key: 'DEMO-3', repo: 'r1', how: 'pending', beyond: [], at_points: 1, outside: 0, credits: 37, merged_at: null, state: null, state_label: '', stuck: null, delivery: null, delivery_label: '', parent: null }],
    weekly: ov.cto.weekly.map((w) => ({ ...w, unattended: 0, people: 0, local: 0, pending: 0 })) }
  ov.counts = { claimed: 3, local: 2 }
  return { ov, status }
}

describe('交付总览', () => {
  test('the hero: the sentence, where the numbers come from, and the four cards; 口径 is folded', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const c = fx.overview().cto
    const hero = await screen.findByTestId('ov-hero')
    expect(within(hero).getByRole('heading', { level: 2 })).toHaveTextContent(c.sentence)
    expect(hero).toHaveTextContent('数字来自 brain-kit 的评估（读的是远端的 main 分支）和这个 app 开的会话')
    expect(hero).not.toHaveTextContent('只算交接过') // 人介入 counts the local requirements too: the page does not say otherwise
    expect(hero).not.toHaveTextContent(/origin\/|refs\/|分支 分支/)
    const cards = within(screen.getByTestId('ov-cards')).getAllByRole('article').map((a) => a.getAttribute('aria-label'))
    expect(cards).toEqual(['无人值守', '人介入', '每个需求的 credits', '决定 · 谁定的'])
    expect(screen.getByTestId('ov-unattended')).toHaveTextContent(/^0\/1$/)
    expect(screen.getByTestId('ov-people')).toHaveTextContent(/^5次$/)
    expect(screen.getByRole('article', { name: '人介入' })).toHaveTextContent('5 次落在判断点上（批准、退回、回答），0 次在判断点之外 · 本机做的也算')
    expect(screen.getByTestId('ov-credits')).toHaveTextContent(/^11\.4$/)
    expect(screen.getByRole('article', { name: '每个需求的 credits' })).toHaveTextContent('有 credits 的 4 个需求，合计 45.7')
    expect(screen.getByRole('article', { name: '每个需求的 credits' })).not.toHaveTextContent('token')
    const n = (h: CtoRun['how']) => c.runs.filter((r) => r.how === h).length
    expect(screen.getByRole('img', { name: `评估过的需求，按交付方式：无人值守 ${n('unattended')}，有人插手 ${n('people')}，只在本机 ${n('local')}，还没评 ${n('pending')}${n('ended') ? `，没交付就结束 ${n('ended')}` : ''}` })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '人介入：判断点上 5 次，判断点之外 0 次' })).toBeInTheDocument()
    const notes = screen.getByText('口径').closest('details') as HTMLDetailsElement
    expect(notes.open).toBe(false)
    // how 「谁定的」 is written: what to type for each, typed as brain-kit reads it
    const syntax = within(notes).getByTestId('who-syntax')
    expect(syntax).toHaveTextContent('「人」写 <化名> <凭证号> 或 owner')
    expect(syntax).toHaveTextContent('「AI 自己定的」写 agent')
    expect(within(syntax).getByText('brain <条目号>').tagName).toBe('CODE')
    expect(notes).not.toHaveTextContent('token')
    expect(screen.queryByText('实测 · brain-kit')).toBeNull()
  })

  test('the branch read is joined with a space before a Latin repo name (real data: 读的是 demo 的 main 分支)', async () => {
    const ov = fx.overview()
    const ref = 'demo 的 main 分支、oms-brain 的 master 分支'
    ov.cto = { ...ov.cto, ref }
    ov.eval = { ...ov.eval, ref }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByTestId('ov-hero')).toHaveTextContent(`数字来自 brain-kit 的评估（读的是 ${ref}）`)
    expect(screen.getByTestId('eval-batch')).toHaveTextContent(`这一批：${ref}上已经有记录的需求`)
  })

  test('a number with nothing to count yet says 还没有 and when it will have one, and draws no chart', async () => {
    const ov = fx.overview()
    ov.cto = { ...ov.cto, available: false, unattended: null, stepped_in: null, credits: { per_req: null, total: null, reqs: 0 } }
    ov.funnel = { ...ov.funnel, total: 0, rows: ov.funnel.rows.map((r) => ({ ...r, count: 0 })), unclassified: [] }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const s = fx.status()
    s.brainkit.modules.evaluate = false
    const p = props({ status: s })
    const user = userEvent.setup()
    render(<OverviewView entry={{}} {...p} />)
    const hero = await screen.findByTestId('ov-hero')
    expect(hero).toHaveTextContent('brain-kit 的评估还没给出数字：下面先看 credits 和合并')
    await user.click(within(hero).getByRole('button', { name: '去设置 ↗' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'settings' })
    expect(screen.getByTestId('ov-unattended')).toHaveTextContent(/^还没有$/)
    expect(screen.getByRole('article', { name: '无人值守' })).toHaveTextContent('brain-kit 的评估给出数字以后才有')
    expect(screen.getByTestId('ov-people')).toHaveTextContent(/^还没有$/)
    expect(screen.getByTestId('ov-credits')).toHaveTextContent(/^还没有$/)
    expect(screen.getByRole('article', { name: '每个需求的 credits' })).toHaveTextContent('这个 app 开的会话报了 credits 以后才有')
    expect(screen.getByTestId('funnel-total')).toHaveTextContent(/^还没有$/)
    for (const name of ['无人值守', '人介入', '每个需求的 credits', '决定 · 谁定的']) expect(within(screen.getByRole('article', { name })).queryByRole('img')).toBeNull()
    expect(screen.getByRole('article', { name: '无人值守' })).not.toHaveTextContent('0/0')
  })

  test('brain-kit’s notes and a skipped run in words with 做什么, its own words under 细节 (the backend’s note_rows, skipped raw)', async () => {
    const ov = fx.overview()
    const raw = '--credits 只有一条记录，却有 6 个需求：不知道是谁的，没有算给任何一个（请按 run 号或需求号给）'
    ov.eval = { ...ov.eval, notes: ['花费只有一个总数'], skipped: [{ key: 'PAY-1', why: '它的开工记录读不了', ...{ raw: 'runs/PAY-1/run.json: Expecting value: line 3' } }],
      ...{ note_rows: [{ text: '花费只有一个总数，却有 6 个需求：分不出是谁的，没有算给任何一个', todo: '在这个 app 里开会话做需求，花费就按需求分开记，下一次评估会算进来', raw }] } }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const note = await screen.findByTestId('eval-notes')
    expect(note).toHaveTextContent('brain-kit 说：花费只有一个总数，却有 6 个需求：分不出是谁的，没有算给任何一个')
    expect(note).toHaveTextContent('做什么：在这个 app 里开会话做需求，花费就按需求分开记')
    expect((within(note).getByText('细节').closest('details') as HTMLDetailsElement).open).toBe(false)
    expect(within(note).getByText(raw)).toBeInTheDocument()
    const skipped = screen.getByTestId('eval-skipped')
    expect(skipped).toHaveTextContent('读不了，不算进数字：它的开工记录读不了')
    expect(within(skipped).getByText('细节').closest('details')).toHaveTextContent('Expecting value')
  })

  test('/status not read (the login expired): the top says how many requirements, not 「0 个仓库」', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props({ status: null })} />)
    await screen.findByTestId('ov-hero')
    expect(document.querySelector('.cto-org')).toHaveTextContent(/^6 个需求$/)
  })

  test('/status not read, /overview read: the repo banner names the repo by its name and has 去导入仓库 for its path', async () => {
    const user = userEvent.setup()
    const ov = fx.overview()
    ov.errors = [{ repo: 'r2', name: 'shop-web', path: '/Users/alice/workplace/shop-web', error: '还没装 brain-kit：在「导入仓库」里检查它，装上就能用', raw: '/Users/alice/workplace/shop-web' }]
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const p = props({ status: null })
    render(<OverviewView entry={{}} {...p} />)
    const banner = await screen.findByTestId('repo-error')
    expect(banner).toHaveTextContent(/^shop-web：还没装 brain-kit/)
    expect(banner).not.toHaveTextContent('r2')
    await user.click(within(banner).getByRole('button', { name: '去导入仓库' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'import', path: '/Users/alice/workplace/shop-web' })
  })

  test('while brain-kit works the eval out (the backend’s computing flag), the page says 正在算, not 还没有', async () => {
    const ov = fx.overview()
    ov.cto = { ...ov.cto, available: false, unattended: null, stepped_in: null }
    ov.eval = { ...ov.eval, available: false, error: '正在算交付评估…', raw: '', metrics: [], queue: [], skipped: [], notes: [], computing: true }
    ov.funnel = { ...ov.funnel, source: 'app' }   // no evaluation yet: the backend counts the decisions itself
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const hero = await screen.findByTestId('ov-hero')
    expect(hero).toHaveTextContent('brain-kit 正在算评估的数字，算好就出来：下面先看 credits 和合并')
    expect(screen.getByTestId('ov-unattended')).toHaveTextContent(/^正在算$/)
    expect(screen.getByTestId('ov-people')).toHaveTextContent(/^正在算$/)
    expect(screen.getByRole('article', { name: '人介入' })).toHaveTextContent('brain-kit 正在算评估，算好就出来')
    expect(screen.getByTestId('eval-computing')).toHaveTextContent('正在算')
    expect(screen.getByTestId('eval-batch')).not.toHaveTextContent('还没有评估模块')
    // the app's own count of the decisions stands in meanwhile, and brain-kit's comes out different: no number that jumps
    expect(screen.getByTestId('funnel-total')).toHaveTextContent(/^正在算$/)
    expect(screen.getByTestId('funnel-card')).toHaveTextContent('brain-kit 正在算评估，算好就出来')
  })

  test('the funnel says 正在算 only while its number is the app’s stand-in: brain-kit’s own (being redone) stays, no evaluate module keeps the app’s', async () => {
    const ov = fx.overview()
    ov.funnel = { ...ov.funnel, source: 'app' }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const { unmount } = render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByTestId('funnel-total')).toHaveTextContent(/^15个决定$/)   // nothing computing
    unmount()
    const again = fx.overview()
    again.eval = { ...again.eval, computing: true }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => again })
    render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByTestId('funnel-total')).toHaveTextContent(/^15个决定$/)   // brain-kit's, from the last time
  })

  test('a repo with no remote: said once at the top, 无人值守 and the runner fold to 这次不需要, no 从远端取最新', async () => {
    const { ov, status } = localWorld()
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props({ status })} />)
    const hero = await screen.findByTestId('ov-hero')
    expect(hero.textContent!.split('只在本机做')).toHaveLength(2) // the backend's sentence says it; the page does not say it again
    expect(screen.getByTestId('ov-local-tag')).toHaveTextContent('只在本机')
    expect(screen.getByTestId('ov-unattended')).toHaveTextContent('这次不需要')
    // not 「还没评 2」 under it: in a repo done only here nothing is judged for 无人值守, now or later
    expect(screen.getByRole('article', { name: '无人值守' })).not.toHaveTextContent('还没评')
    expect(screen.queryByRole('button', { name: /从远端取最新/ })).toBeNull()
    const flow = screen.getByTestId('flow')
    expect(flow.querySelector('[data-lane="runner"]')).toBeNull()
    expect(within(flow).getByTestId('flow-runner-off')).toHaveTextContent('这次不需要：这个仓库只在本机做，不交给运行机')
    expect(within(flow).getByTestId('flow-stats')).not.toHaveTextContent('运行机')
    expect(flow).not.toHaveTextContent('交给运行机以后就不在本机做了')
    // 每周合并 with nothing merged: one line, no chart
    expect(screen.getByTestId('weekly-empty')).toHaveTextContent('近 12 周还没有合并的需求')
    expect(within(screen.getByRole('region', { name: '每周合并' })).queryByRole('group', { name: '图或表格' })).toBeNull()
    // both overlapping requirements are the same person's: nobody to talk it over with
    expect(screen.getByTestId('overlaps')).toHaveTextContent('都是 dana 的：先合一个，再做另一个，免得冲突')
  })

  test('全部 over two repos done only here: the runner band says both, not 这个仓库', async () => {
    const { ov, status } = localWorld()
    status.repos = [status.repos[0], { ...status.repos[0], id: 'r2', name: 'oms-brain', path: '/w/oms-brain' }]
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props({ status })} />)
    const flow = await screen.findByTestId('flow')
    expect(within(flow).getByTestId('flow-runner-off')).toHaveTextContent('这次不需要：这 2 个仓库都只在本机做，不交给运行机')
    expect(flow).not.toHaveTextContent('这个仓库')
  })

  test('轮到你: an idle session is the person’s turn, not 「AI 在本机做」; Lean’s review is 等审查, a claim 等开工; each has its step and how long it has waited', async () => {
    const user = userEvent.setup()
    const { ov, status } = localWorld()
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov,
      [`POST ${API}/requirements/*`]: () => ({ ok: true, slot: 'brain-DEMO-1-review', url: '/chat?sid=brain-DEMO-1-review' }) })
    const p = props({ status })
    render(<OverviewView entry={{}} {...p} />)
    const flow = await screen.findByTestId('flow')
    expect(within(flow).getByTestId('flow-stats')).toHaveTextContent('进行中 5 个·轮到你 5（等审查 2 · 等开工 3）·等别人 0·AI 在本机做 0')
    for (const k of ['DEMO-1', 'DEMO-3', 'DEMO-2', 'DEMO-4', 'DEMO-5']) expect((cardOf(flow, k).closest('[data-lane]') as HTMLElement).dataset.lane).toBe('you')
    expect(cardOf(flow, 'DEMO-3')).toHaveTextContent('已等 11 小时')
    expect(cardOf(flow, 'DEMO-5')).toBeInTheDocument() // three in a cell, none hidden behind 「+1 个」
    // the first screen: what waits on the person, the longest wait first, each with its one step
    const yours = screen.getByTestId('your-turn')
    expect(yours).toHaveTextContent('5 个需求 · 等审查 2 · 等开工 3')
    expect(yours).not.toHaveTextContent(/去回话|打开会话|等回话/)
    expect(Array.from(yours.querySelectorAll('li')).map((li) => li.dataset.key)).toEqual(['DEMO-1', 'DEMO-3', 'DEMO-2', 'DEMO-4', 'DEMO-5'])
    const demo2 = yours.querySelector('li[data-key="DEMO-2"]') as HTMLElement
    expect(demo2).toHaveTextContent('已认领，还没开工已等 3 小时')
    await user.click(within(demo2).getByRole('button', { name: '去开工 ↗' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'new', repo: 'r1', key: 'DEMO-2', title: 'AGENTS.md 缺仓库简介' })
    // the review is a new session's (the one that wrote the code may not review it): 开审查会话 opens it right here
    expect(within(cardOf(flow, 'DEMO-1')).queryByRole('button', { name: /去回话|打开会话/ })).toBeNull()
    await user.click(within(cardOf(flow, 'DEMO-1')).getByRole('button', { name: '开审查会话' }))
    await waitFor(() => expect(navigations).toEqual(['/chat?sid=brain-DEMO-1-review']))
    expect(apiCalls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: `${API}/requirements/r1/DEMO-1/session`, body: { trust: true, kickoff: true, review: true } })
    expect(p.go).toHaveBeenCalledTimes(1) // the step does not open the card's board as well
    // the ledger says the same: Lean the one way, and the step
    const table = screen.getByTestId('req-table')
    expect(within(rowOf(table, 'DEMO-3')).getByTestId('lean-cell')).toHaveTextContent('做完 4 · 跳过 6 · 下一步：发布')
    expect(within(rowOf(table, 'DEMO-3')).getByTestId('lean-cell')).not.toHaveTextContent('11/11')
    expect(within(rowOf(table, 'DEMO-2')).getByTestId('lean-cell')).toHaveTextContent(/^还没开工$/)
    expect(rowOf(table, 'DEMO-3')).toHaveTextContent('只在本机（还没合并）人介入 1 次')
    expect(rowOf(table, 'DEMO-3')).not.toHaveTextContent('还没评')
    expect(rowOf(table, 'DEMO-3')).not.toHaveTextContent('本机做完')
    expect(within(rowOf(table, 'DEMO-3')).getByRole('button', { name: '开审查会话' })).toBeInTheDocument()
    expect(within(yours.querySelector('li[data-key="DEMO-3"]') as HTMLElement).getByRole('button', { name: '开审查会话' })).toBeInTheDocument()
  })

  test('an idle session that is not a review: 去回话 opens that session, as 待办 does', async () => {
    const { ov, status } = localWorld()
    ov.rows = ov.rows.map((r) => (r.key === 'DEMO-1' ? { ...r, waits: { ...r.waits, review: false, text: '代码生成做完了，下一步是构建测试：在会话里让它接着做' } } : r))
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const p = props({ status })
    render(<OverviewView entry={{}} {...p} />)
    const yours = await screen.findByTestId('your-turn')
    expect(yours).toHaveTextContent('5 个需求 · 等回话 1 · 等审查 1 · 等开工 3')
    await userEvent.setup().click(within(yours.querySelector('li[data-key="DEMO-1"]') as HTMLElement).getByRole('button', { name: '去回话 ↗' }))
    expect(navigations).toEqual(['/chat?sid=brain-DEMO-1-dev'])
    expect(p.go).not.toHaveBeenCalled()
  })

  test('需求流动: every open card sits in the column colOf and the lane laneOf (waits.who) say; merged ones in 已合并', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const flow = await screen.findByTestId('flow')
    const rows = fx.overview().rows
    const want: Record<string, [string, string]> = {
      'PAY-3': ['构建', 'you'], // the PLAN approval the person types
      'PAY-4': ['交给运行机', 'people'], // parked on D-2, the product answers on the MR
      'PAY-5': ['发布验收', 'people'], // the product accepts it on the MR
      'PAY-7': ['交给运行机', 'you'], // a refused hand-over to redo
      'PAY-6': ['需求', 'people'], // claimed by carol, not started
    }
    for (const r of rows.filter((x) => x.state !== 'merged')) {
      expect([colOf(r), laneOf(r)]).toEqual(want[r.key])
      const cell = cardOf(flow, r.key).closest('[data-col]') as HTMLElement
      expect([cell.dataset.col, cell.dataset.lane]).toEqual(want[r.key])
      expect(cardOf(flow, r.key)).toHaveTextContent(r.title)
    }
    expect(within(flow).getAllByTestId('flow-card')).toHaveLength(5)
    expect(flow.querySelector('[data-col="已合并"] [data-key="PAY-2"]')).toHaveTextContent('退款单号校验')
    expect(within(flow).getByTestId('flow-stats')).toHaveTextContent('进行中 5 个·轮到你 2（等批准 1 · 要重做交接 1）·等别人 3·AI 在本机做 0·运行机在跑 0')
    expect(cardOf(flow, 'PAY-4')).toHaveTextContent('等产品在 MR 上回答 D-2（设计）')
    expect(cardOf(flow, 'PAY-4')).toHaveTextContent('carol · 等产品')
    expect(cardOf(flow, 'PAY-6')).toHaveTextContent('等 carol')
    expect(within(cardOf(flow, 'PAY-4')).queryByRole('button')).toBeNull() // not the person's turn: no step
    expect(cardOf(flow, 'PAY-5')).toHaveTextContent('alice · 等产品')
    expect(within(cardOf(flow, 'PAY-5')).queryByRole('button')).toBeNull()
    expect(within(cardOf(flow, 'PAY-7')).getByRole('button', { name: '改好后重新交接 ↗' })).toBeInTheDocument()
  })

  test('a merge whose new knowledge waits on you is your turn everywhere: 轮到你, the repo pill, and its card in 已合并 with 回写 Brain', async () => {
    const user = userEvent.setup()
    const ov = fx.overview()
    const merged = ov.rows.find((r) => r.key === 'PAY-2')!
    merged.updated_at = ov.at - 30 * 86400   // older than 已合并's 14 days: it stays while it waits on you
    merged.waits = { who: 'you', text: '已合并，有 1 条新知识等你回写 Brain', line: null, raw: '', do: 'write_back', since: ov.at - 2 * 86400, where: 'app' }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const yours = await screen.findByTestId('your-turn')
    expect(yours).toHaveTextContent('3 个需求')
    expect(within(yours).getByRole('button', { name: '回写 Brain ↗' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: '仓库' })).getByRole('button', { name: /^shop-pay/ })).toHaveTextContent('进行中 5 · 轮到你 3')
    const flow = screen.getByTestId('flow')
    expect(within(flow).getByTestId('flow-stats')).toHaveTextContent('轮到你 2（等批准 1 · 要重做交接 1）·等别人 3·AI 在本机做 0·运行机在跑 0·已合并、等你回写 Brain 1')
    const card = flow.querySelector('[data-col="已合并"] [data-key="PAY-2"]') as HTMLElement
    expect(card).toHaveTextContent('已等 2 天')
    expect(rowOf(screen.getByTestId('req-table'), 'PAY-2')).toHaveTextContent('已合并，有 1 条新知识等你回写 Brain已等 2 天')
    await user.click(within(card).getByRole('button', { name: '回写 Brain ↗' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', reflect: 'PAY-2' })
    expect(p.go).toHaveBeenCalledTimes(1)
  })

  test('a column, a lane and 「+N 个」 filter the ledger, with a ✕ to drop it', async () => {
    const user = userEvent.setup()
    const ov = fx.overview()
    const base = ov.rows.find((r) => r.key === 'PAY-3')!
    ov.rows.push(...[8, 9, 10].map((n) => ({ ...base, key: `PAY-${n}`, overlap: [], updated_at: (base.updated_at as number) - n })))
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const flow = await screen.findByTestId('flow')
    const more = within(flow).getByRole('button', { name: '+1 个（见下方交付清单）' })
    await user.click(more)
    const table = screen.getByTestId('req-table')
    expect(screen.getByTestId('ledger-pick')).toHaveTextContent('需求流动 · 「构建」这一列里「轮到你」')
    expect(keysOf(table)).toEqual(['PAY-3', 'PAY-8', 'PAY-9', 'PAY-10'])
    await user.click(within(flow).getByRole('button', { name: /^轮到你$/ }))
    expect(keysOf(table)).toEqual(['PAY-3', 'PAY-8', 'PAY-9', 'PAY-10', 'PAY-7'])
    await user.click(within(flow).getByRole('button', { name: /^交给运行机/ }))
    expect(keysOf(table)).toEqual(['PAY-4', 'PAY-7'])
    await user.click(screen.getByRole('button', { name: /^不按「需求流动/ }))
    expect(screen.queryByTestId('ledger-pick')).toBeNull()
    expect(reqRows(table)).toHaveLength(ov.rows.length)
  })

  test('每周合并: whole-number ticks; chart or table; a week with merges filters the ledger to them, an empty week is no button', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const weekly = await screen.findByRole('region', { name: '每周合并' })
    expect(weekly).toHaveTextContent('近 12 周合并了 1 个需求，最近 4 周 1 个')
    const ticks = Array.from(weekly.querySelectorAll('svg > g > text[text-anchor="end"]')).map((t) => t.textContent)
    expect(ticks).toEqual(['0', '1'])
    const seg = within(weekly).getByRole('group', { name: '图或表格' })
    await user.click(within(seg).getByRole('button', { name: '表格' }))
    const body = within(within(weekly).getByRole('table')).getAllByRole('row').slice(1)
    expect(body).toHaveLength(fx.overview().cto.weekly.length)
    expect(within(body.at(-1) as HTMLElement).getAllByRole('cell').map((c) => c.textContent)).toEqual(['11/2 起', '0', '1', '0', '0', '1'])
    await user.click(within(seg).getByRole('button', { name: '图' }))
    expect(within(weekly).queryByRole('button', { name: '10/26 起的一周：0 个' })).toBeNull()
    await user.click(within(weekly).getByRole('button', { name: '11/2 起的一周：1 个' }))
    expect(screen.getByTestId('ledger-pick')).toHaveTextContent('11/2 起的一周合并的')
    expect(keysOf(screen.getByTestId('req-table'))).toEqual(['PAY-2'])
  })

  test('a big number and a legend entry filter the ledger by how it was delivered', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    await user.click(await screen.findByTestId('ov-unattended'))
    const table = screen.getByTestId('req-table')
    expect(screen.getByTestId('ledger-pick')).toHaveTextContent('交付方式：评估过的交接')
    expect(keysOf(table)).toEqual(['PAY-2'])
    await user.click(within(screen.getByRole('article', { name: '无人值守' })).getByRole('button', { name: /^还没评/ }))
    expect(keysOf(table)).toEqual(['PAY-4', 'PAY-5'])
    await user.click(screen.getByTestId('ov-credits'))
    expect(keysOf(table)).toEqual(['PAY-3', 'PAY-7', 'PAY-5', 'PAY-2'])
    await user.click(screen.getByRole('button', { name: /^不按/ }))
    expect(reqRows(table)).toHaveLength(6)
  })

  test('a Flow card opens that requirement’s 需求看板: view=board for its key in the URL', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    const flow = await screen.findByTestId('flow')
    await user.click(cardOf(flow, 'PAY-4'))
    expect(window.location.search).toBe('?view=board&repo=r1&key=PAY-4&from=overview')
    expect(navigations).toEqual(['/apps/brain?view=board&repo=r1&key=PAY-4&from=overview'])
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/board/r1/PAY-4`)).toBe(true))
  })

  test('every requirement is a ledger row: key, title, state, Lean, what it waits on with the line to type, credits, MR, badges', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const table = await screen.findByTestId('req-table')
    expect(reqRows(table)).toHaveLength(fx.overview().rows.length)
    const pay3 = rowOf(table, 'PAY-3')
    expect(pay3).toHaveTextContent('退款单导出 CSV')
    expect(pay3).toHaveTextContent('本地开发中')
    expect(within(pay3).getByText(fx.overview().rows[0].waits.text)).toHaveClass('br-strong') // it waits on you
    expect(within(within(pay3).getByTestId('line-copy')).getByText('approve PLAN 5d1e7a90')).toBeInTheDocument()
    expect(within(pay3).getByRole('button', { name: '复制那一行' })).toBeInTheDocument()
    await userEvent.setup().click(within(pay3).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-3-7f3a'])
    expect(within(screen.getByTestId('your-turn')).getByRole('button', { name: '打开会话' })).toBeInTheDocument()
    expect(within(pay3).getByRole('button', { name: '去批准 ↗' })).toBeInTheDocument()
    expect(pay3).toHaveTextContent('12.4')
    expect(pay3).toHaveTextContent('和 PAY-4 重叠')
    expect(within(pay3).getByTestId('row-summary')).toHaveTextContent(/^退款单可以导出成 CSV，给财务对账用（规模中）。$/)
    expect(within(rowOf(table, 'PAY-6')).queryByTestId('row-summary')).toBeNull()
    const pay4 = rowOf(table, 'PAY-4')
    expect(pay4).toHaveTextContent('D-2 待答')
    expect(pay4).toHaveTextContent('要复看') // the eval queue's
    expect(pay4).toHaveTextContent('还没评人介入 2 次')
    const mr = within(pay4).getByRole('link', { name: /!41/ })
    expect(mr).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/41')
    expect(mr).toHaveAttribute('target', '_blank')
    expect(rowOf(table, 'PAY-2')).toHaveTextContent('有人插手')
    expect(apiCalls[0]).toMatchObject({ method: 'GET', path: `${API}/overview?repo=all` })
    expect(keysOf(table)).toEqual(['PAY-3', 'PAY-4', 'PAY-7', 'PAY-5', 'PAY-6', 'PAY-2'])
    // a repo the backend could not read says why, with the way to fix it
    expect(screen.getByTestId('repo-error')).toHaveTextContent('shop-web：还没装 brain-kit')
  })

  test('a repo whose scan threw: its English error folded under 细节, the banner in words with 做什么', async () => {
    const ov = fx.overview()
    ov.errors = [{ repo: 'r1', error: "KeyError: 'runs' while reading runs/PAY-3/run.json" }]
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const banner = await screen.findByTestId('repo-error')
    expect(banner).toHaveTextContent('shop-pay：这次没读出来')
    expect(banner).toHaveTextContent('做什么：看看这个仓库的目录还在不在、能不能读，再去导入仓库检查它')
    const raw = within(banner).getByText('细节').closest('details') as HTMLDetailsElement
    expect(raw.open).toBe(false)
    expect(raw).toHaveTextContent("KeyError: 'runs'")
  })

  test('a repo the backend says in words: its words, and its own (the exception, the path) under 细节', async () => {
    const ov = fx.overview()
    ov.errors = [{ repo: 'r1', error: '读不了这个仓库里的需求：在「导入仓库」里检查它，那里会说哪里不对', raw: "KeyError: 'runs' while reading runs/PAY-3/run.json" }]
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const banner = await screen.findByTestId('repo-error')
    expect(banner).toHaveTextContent('shop-pay：读不了这个仓库里的需求：在「导入仓库」里检查它，那里会说哪里不对')
    const raw = within(banner).getByText('细节').closest('details') as HTMLDetailsElement
    expect(raw.open).toBe(false)
    expect(raw).toHaveTextContent("KeyError: 'runs'")
    expect(within(banner).getByRole('button', { name: '去导入仓库' })).toBeInTheDocument()
  })

  test('a summary shows no Markdown and no internal ids: `code` as code, the ids on hover, 规模 in Chinese, no 「现在：」', () => {
    const s = plainSummary('给 `calc.py` 加乘法 `multiply(a, b)`，返回 `a * b`（D01#S002 · 097f2e9e）（规模 small）。现在：Lean 在「构建测试」做完，在本地开发（还没交接）。')
    expect(s.parts).toEqual([
      { code: false, text: '给 ' }, { code: true, text: 'calc.py' }, { code: false, text: ' 加乘法 ' }, { code: true, text: 'multiply(a, b)' },
      { code: false, text: '，返回 ' }, { code: true, text: 'a * b' }, { code: false, text: '（规模小）。' },
    ])
    expect(s.ids).toBe('D01#S002 · 097f2e9e')
  })

  test('the Lean cell says progress the one way: 做完 n · 下一步：…; 全部做完 when finished; 还没开工 for a claim', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const table = await screen.findByTestId('req-table')
    const cell = (key: string) => within(rowOf(table, key)).getByTestId('lean-cell')
    expect(cell('PAY-3')).toHaveTextContent(/^做完 4 · 跳过 4 · 下一步：代码生成$/)
    expect(within(cell('PAY-3')).getByRole('img')).toHaveAccessibleName('做完 4 · 跳过 4 · 下一步：代码生成')
    expect(within(cell('PAY-3')).getByText('下一步：代码生成')).toHaveClass('br-nw') // never broken inside a stage name
    expect(cell('PAY-7')).toHaveTextContent(/^做完 4 · 跳过 6 · 下一步：发布$/)
    expect(cell('PAY-2')).toHaveTextContent(/^全部做完（跳过 6）$/)
    expect(cell('PAY-6')).toHaveTextContent(/^还没开工$/)
  })

  test('a row opens its 需求看板; 需求详情 opens its 需求详情; the overlap card names both, their owners and what they share', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const table = await screen.findByTestId('req-table')
    await user.click(within(rowOf(table, 'PAY-4')).getByText('对账单按商户拆分'))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-4', from: 'overview' })
    await user.click(within(rowOf(table, 'PAY-4')).getByRole('button', { name: '需求详情' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-4', from: 'overview' })
    expect(p.go).toHaveBeenCalledTimes(2) // the button does not open the board as well
    const overlaps = screen.getByTestId('overlaps')
    expect(overlaps).toHaveTextContent('这些需求要改同一处')
    expect(overlaps).toHaveTextContent('PAY-3alice和PAY-4carol都要改src/refund/先商量好谁先合，免得冲突')
    await user.click(within(overlaps).getByRole('button', { name: 'PAY-3' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'overview' })
  })

  test('a narrow ledger (1050) stacks a row’s 需求详情 and ▶ 回放, so the table fits its card without a sideways scroll', () => {
    const narrow = OV_CSS.slice(OV_CSS.indexOf('@container brov (max-width: 1180px)'))
    expect(narrow.slice(0, narrow.indexOf('\n}'))).toMatch(/\.br-ledger \.br-acts \{ flex-direction: column;/)
  })

  test('▶ 回放 is on a merged row only, and opens its 需求看板 replaying (replay=1)', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const table = await screen.findByTestId('req-table')
    expect(within(table).getAllByRole('button', { name: '▶ 回放' })).toHaveLength(1)
    expect(within(rowOf(table, 'PAY-3')).queryByRole('button', { name: '▶ 回放' })).toBeNull()
    await user.click(within(rowOf(table, 'PAY-2')).getByRole('button', { name: '▶ 回放' }))
    expect(p.go).toHaveBeenCalledTimes(1)
    const to = (p.go as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(to).toEqual({ kind: 'board', repo: 'r1', key: 'PAY-2', replay: true, from: 'overview' })
    expect(searchOf(to)).toBe('?view=board&repo=r1&key=PAY-2&replay=1&from=overview')
  })

  test('the state chips filter the rows and say it in the URL entry; a repo pill says what is open there and asks the backend for that repo', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    await screen.findByTestId('req-table')
    const chips = screen.getByTestId('state-filter')
    expect(within(chips).getByRole('button', { name: '全部 6' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(chips).getByRole('button', { name: '停下等回答 1' }))
    expect(p.replace).toHaveBeenLastCalledWith({ kind: 'overview', state: 'parked' })
    expect(within(chips).getByRole('button', { name: '停下等回答 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(keysOf(screen.getByTestId('req-table'))).toEqual(['PAY-4'])
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('共 1 个')
    const pills = screen.getByRole('navigation', { name: '仓库' })
    expect(within(pills).getByRole('button', { name: /^全部/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(pills).getByRole('button', { name: /^shop-pay/ })).toHaveTextContent('shop-pay进行中 5 · 轮到你 2')
    // a repo that cannot be read cannot be picked, and says why in the banner's words
    expect(within(pills).getByRole('button', { name: /^shop-web/ })).toBeDisabled()
    expect(within(pills).getByRole('button', { name: /^shop-web/ })).toHaveTextContent('还没装')
    await user.click(within(pills).getByRole('button', { name: /^shop-pay/ }))
    expect(p.replace).toHaveBeenLastCalledWith({ kind: 'overview', repo: 'r1', state: 'parked' })
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/overview?repo=r1`)).toBe(true))
  })

  test('opened at one repo (a reload on repo=r1), every pill still has its counts: the others from 全部, read once', async () => {
    const status = fx.status()
    status.repos = [status.repos[0], { ...status.repos[0], id: 'r3', name: 'shop-order', path: '/w/shop-order' }]
    const all = fx.overview()
    all.rows = [...all.rows, { ...all.rows[0], repo: 'r3', key: 'ORD-10', waits: { ...all.rows[0].waits, who: 'runner', do: 'none' } }]
    const r1 = fx.overview()
    installFixtureRoutes({ [`GET ${API}/overview*`]: (_b, path) => (path.includes('repo=all') ? all : r1) })
    render(<OverviewView entry={{ repo: 'r1' }} {...props({ status })} />)
    const pills = await screen.findByRole('navigation', { name: '仓库' })
    await waitFor(() => expect(within(pills).getByRole('button', { name: /^shop-order/ })).toHaveTextContent('shop-order进行中 1'))
    expect(within(pills).getByRole('button', { name: /^全部/ })).toHaveTextContent('全部进行中 6 · 轮到你 2')
    expect(within(pills).getByRole('button', { name: /^shop-pay/ })).toHaveTextContent('shop-pay进行中 5 · 轮到你 2')
    expect(apiCalls.filter((c) => c.path === `${API}/overview?repo=all`)).toHaveLength(1)
  })

  test('team mode: a row on the runner counts in its repo’s pill and card; one of a project not listed here has its own pill, and the pills add up to 全部', async () => {
    const user = userEvent.setup()
    const status = fx.status()
    status.app.team = true
    status.repos = [status.repos[0], { ...status.repos[0], id: 'r3', name: 'shop-order', path: '/w/shop-order' }]
    const all = fx.overview()
    const base = all.rows[0]
    const onRunner = (key: string, home: string | null): Requirement => ({ ...base, repo: 'runner', home, key, title: `${key} 在运行机上`, state: 'running', state_label: '运行机在跑',
      waits: { who: 'runner', text: '运行机在跑', line: null, raw: '', do: 'none', since: null, where: null }, mr: null, run_ids: [`RUN-${key}-1`], overlap: [], open_questions: [] })
    all.rows = [...all.rows, onRunner('ORD-10', 'r3'), onRunner('PAY-9', 'r1'), onRunner('WEB-1', null)]
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => all })
    render(<OverviewView entry={{}} {...props({ status })} />)
    const pills = await screen.findByRole('navigation', { name: '仓库' })
    await waitFor(() => expect(within(pills).getByRole('button', { name: /^全部/ })).toHaveTextContent('全部进行中 8 · 轮到你 2'))
    expect(within(pills).getByRole('button', { name: /^shop-pay/ })).toHaveTextContent('shop-pay进行中 6 · 轮到你 2')
    expect(within(pills).getByRole('button', { name: /^shop-order/ })).toHaveTextContent('shop-order进行中 1')
    const elsewhere = within(pills).getByTestId('pill-elsewhere')
    expect(elsewhere).toHaveTextContent('没导入的项目进行中 1')
    // the card on the runner says its repo, as the repo's own cards do
    expect(cardOf(screen.getByTestId('flow'), 'ORD-10')).toHaveTextContent('shop-order')
    await user.click(elsewhere)
    expect(keysOf(screen.getByTestId('req-table'))).toEqual(['WEB-1'])
    expect(screen.getByTestId('ledger-pick')).toHaveTextContent('没导入的项目')
  })

  test('opened with a state in the URL, only those rows show; a filter with no rows says so', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<OverviewView entry={{ state: 'acceptance' }} {...props()} />)
    const table = await screen.findByTestId('req-table')
    expect(keysOf(table)).toEqual(['PAY-5'])
    await user.click(within(screen.getByTestId('flow')).getByRole('button', { name: /^AI 在本机做$/ }))
    expect(table).toHaveTextContent('这个筛选下没有需求。')
    await user.click(within(table).getByRole('button', { name: '看全部' }))
    expect(reqRows(table)).toHaveLength(6)
  })

  test('a long ledger shows 14 rows and 显示更多 for the rest', async () => {
    const user = userEvent.setup()
    const ov = fx.overview()
    const base = ov.rows[0]
    ov.rows = Array.from({ length: 20 }, (_, i) => ({ ...base, key: `PAY-${100 + i}`, overlap: [], updated_at: (base.updated_at as number) - i }))
    ov.overlaps = []
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const table = await screen.findByTestId('req-table')
    expect(reqRows(table)).toHaveLength(14)
    await user.click(screen.getByRole('button', { name: '显示更多（还有 6 个）' }))
    expect(reqRows(table)).toHaveLength(20)
    expect(screen.queryByRole('button', { name: /显示更多/ })).toBeNull()
  })

  test('从远端取最新 posts each repo with a remote to /refresh, says what it did and reads the overview again', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/refresh`]: () => ({ ok: true, text: '已经从远端取到最新。', raw: '' }) })
    render(<OverviewView entry={{}} {...props()} />)
    await screen.findByTestId('req-table')
    const before = apiCalls.filter((c) => c.path.startsWith(`${API}/overview`)).length
    expect(screen.getByRole('button', { name: '从远端取最新' }).title).not.toMatch(/git|fetch/)
    await user.click(screen.getByRole('button', { name: '从远端取最新' }))
    expect(await screen.findByTestId('refresh-result')).toHaveTextContent(/^已经从远端取到最新。$/)
    expect(apiCalls.filter((c) => c.method === 'POST')).toEqual([{ method: 'POST', path: `${API}/refresh`, body: { repo: 'r1' } }])
    await waitFor(() => expect(apiCalls.filter((c) => c.path.startsWith(`${API}/overview`)).length).toBeGreaterThan(before))
  })

  test('a fetch git could not do says why and what to do; git’s own words are folded under 细节', async () => {
    const user = userEvent.setup()
    const raw = "fatal: unable to access 'https://gitlab.example.com/shop/shop-pay.git/': Could not resolve host: gitlab.example.com"
    installFixtureRoutes({ [`POST ${API}/refresh`]: () => ({ ok: false, text: '从远端取最新没成功：连不上远端：检查网络或 VPN，再点一次。', raw }) })
    render(<OverviewView entry={{}} {...props()} />)
    await screen.findByTestId('req-table')
    await user.click(screen.getByRole('button', { name: '从远端取最新' }))
    const said = await screen.findByTestId('refresh-result')
    expect(said).toHaveTextContent('从远端取最新没成功：连不上远端：检查网络或 VPN，再点一次。')
    const folded = within(said).getByText('细节').closest('details') as HTMLDetailsElement
    expect(folded.open).toBe(false)
    expect(folded).toHaveTextContent(raw)
  })

  test('a refresh the app could not ask for shows the error and what to do', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/refresh`]: () => { throw apiError(502, 'git_failed', 'git fetch 失败：连不上 gitlab.example.com') } })
    render(<OverviewView entry={{}} {...props()} />)
    await screen.findByTestId('req-table')
    await user.click(screen.getByRole('button', { name: '从远端取最新' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('git fetch 失败：连不上 gitlab.example.com（502）')
    expect(alert).toHaveTextContent('做什么：看看网络、远端地址和你的权限，再点一次')
  })

  test('brain-kit 的评估: each number with what it means, 还没有 for none; its review queue and skipped runs open the requirement', async () => {
    const user = userEvent.setup()
    const ov = fx.overview()
    ov.eval.metrics = ov.eval.metrics.map((m) => (m.id === 'repeat_rate' ? { ...m, value: [0, 0] as [number, number] } : m))
    ov.eval.queue = ov.eval.queue.map((q) => ({ ...q, todo: '打开需求看板看产品为什么退回；学到的在合并以后回写 Brain，下次就不会再犯' }))
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const batch = await screen.findByTestId('eval-batch')
    expect(batch).toHaveTextContent('这一批：远端的 main 分支上已经有记录的需求 · 不跟着交付清单的筛选变')
    expect(batch.querySelector('[data-metric="autonomy"]')).toHaveTextContent(/^自主度2\/3交接以后没人插手、交付也正确的$/)
    // each whole rule on hover, in the app's words: no Lean approval kinds, no brain-kit field names
    expect(batch.querySelector('[data-metric="autonomy"]')).toHaveAttribute('title', '交接以后，除了必经的审批（需求、设计、计划、发布审批和验收），没有人做过任何事，而且交付正确')
    for (const m of batch.querySelectorAll('[data-metric]')) expect(m.getAttribute('title')).not.toMatch(/[A-Z]{3,}|park|correction|run\b/)
    expect(batch.querySelector('[data-metric="staleness"]')).toHaveTextContent(/^过时与冲突2/)
    expect(batch.querySelector('[data-metric="repeat_rate"]')).toHaveTextContent(/^重复纠正率还没有/)
    expect(batch.querySelector('[data-metric="credits_per_success"]')).toHaveTextContent(/^每个正确交付的 credits还没有/)
    expect(batch.querySelector('[data-metric="useful"]')).toHaveTextContent('只看默认分支')
    const queue = within(batch).getByTestId('eval-queue')
    expect(queue).toHaveTextContent('要复看PAY-4 ↗验收被退回 1 次')
    // OVERVIEW-20: its own 做什么, in the one-line form of the other notes
    expect(queue).toHaveTextContent('做什么：打开需求看板看产品为什么退回')
    await user.click(within(queue).getByRole('button', { name: 'PAY-4 ↗' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-4', from: 'overview' })
    const skipped = within(batch).getByTestId('eval-skipped')
    expect(skipped).toHaveTextContent('读不了，不算进数字：它的开工记录读不了')
    expect(skipped).toHaveTextContent('做什么：在它的分支上把这个文件改对')
    await user.click(within(skipped).getByRole('button', { name: 'PAY-1 ↗' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-1', from: 'overview' })
    // each of brain-kit's notes on its own line, with what to do (the backend's note_rows)
    const notes = within(batch).getAllByTestId('eval-notes')
    expect(notes.map((n) => n.textContent)).toEqual((fx.overview().eval.note_rows ?? []).map((n) =>
      expect.stringContaining(`brain-kit 说：${n.text}做什么：${n.todo}`)))
  })

  test('without the evaluate module the eval card says so plainly and what to do, brain-kit’s words folded; another error is said as it is', async () => {
    const ov = fx.overview()
    ov.eval = { available: false, error: '这个 brain-kit 还没有交付评估：在设置里换新一点的 brain-kit', raw: "No module named 'brainkit.evaluate'", ref: null, metrics: [], queue: [], skipped: [], notes: [], families: [] }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const s = fx.status()
    s.brainkit.modules.evaluate = false
    const { unmount } = render(<OverviewView entry={{}} {...props({ status: s })} />)
    const batch = await screen.findByTestId('eval-batch')
    expect(batch).toHaveTextContent('brain-kit 还没有评估模块。做什么：换一个新一点的 brain-kit，评估的数字就会出来。')
    expect(within(batch).getByRole('button', { name: '去设置 ↗' })).toBeInTheDocument()
    const folded = within(batch).getByText('细节').closest('details') as HTMLDetailsElement
    expect(folded.open).toBe(false)
    expect(folded).toHaveTextContent("No module named 'brainkit.evaluate'")
    expect(batch.textContent!.match(/新一点的 brain-kit/g)).toHaveLength(1) // what to do, once
    expect(screen.queryByTestId('eval-queue')).toBeNull()
    unmount()
    const ov2 = fx.overview()
    ov2.eval = { available: false, error: '交付评估没算成：brain-kit 的原话在细节里', raw: "KeyError: 'runs'", ref: null, metrics: [], queue: [], skipped: [], notes: [], families: [] }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov2 })
    render(<OverviewView entry={{}} {...props()} />)
    const other = await screen.findByTestId('eval-batch')
    expect(other).toHaveTextContent('交付评估没算成：brain-kit 的原话在细节里')
    expect(other).not.toHaveTextContent('换一个新一点的 brain-kit') // not the missing module's fix
    // the 细节 it points to is there, folded, with brain-kit's own words
    const said = within(other).getByText('细节').closest('details') as HTMLDetailsElement
    expect(said.open).toBe(false)
    expect(said).toHaveTextContent("KeyError: 'runs'")
  })

  test('the decision funnel: the total, a row per category that has any; the questions only in team mode', async () => {
    const ov = fx.overview()
    ov.funnel.rows.find((r) => r.id === 'agent')!.count = 0
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const { unmount } = render(<OverviewView entry={{}} {...props()} />)
    const card = await screen.findByTestId('funnel-card')
    expect(card).toHaveTextContent('15个决定')
    expect(card).toHaveTextContent('人定了 4 个 · 数字来自 brain-kit 的评估 · 没合并的需求也算')
    // beside 人介入 5 次, 人定了 4 个 says it counts something else
    expect(within(card).getByTestId('funnel-vs-people')).toHaveTextContent('人定的 4 个是决定表里的条数；「人介入 5 次」数的是人做的动作（批准、退回、回答），所以两个数不一样')
    expect(Array.from(card.querySelectorAll('[data-row]')).map((r) => r.getAttribute('data-row'))).toEqual(['person', 'check', 'brain', 'unclassified', 'unknown'])
    expect(card.querySelector('[data-row="person"]')).toHaveTextContent(/^人4$/)
    expect(within(card).getByRole('img', { name: /^决定：人 4，检查定的 5，照 Brain 3，AI 自己定的 0，/ })).toBeInTheDocument()
    expect(card).not.toHaveTextContent(/agent|Who/) // the app's words for who decided, as 需求详情 says them
    expect(within(card).queryByTestId('funnel-questions')).toBeNull() // a person's machine: always 0, not shown
    unmount()
    const s = fx.status()
    s.app.team = true
    render(<OverviewView entry={{}} {...props({ status: s })} />)
    expect(await screen.findByTestId('funnel-questions')).toHaveTextContent('问人 4 次 · 答了 3 · 送回运行机 2')
  })

  test('the funnel names the unclassified decisions (each opens its 需求详情); how Who is written is in 口径 only', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    const { unmount } = render(<OverviewView entry={{}} {...p} />)
    const list = await screen.findByTestId('funnel-unclassified')
    expect(list).toHaveTextContent('没归类 1 个，去改「谁定的」那一格：PAY-4 D-3 ↗')
    expect(within(list).getByRole('button', { name: 'PAY-4 D-3 ↗' })).toHaveAttribute('title', `在 ${fx.overview().funnel.unclassified[0].src}`)
    expect(within(screen.getByTestId('ov-cards')).queryByTestId('who-syntax')).toBeNull()
    await user.click(within(list).getByRole('button', { name: 'PAY-4 D-3 ↗' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-4', from: 'overview', decision: 'D-3' })
    unmount()
    const ov = fx.overview()
    ov.funnel.unclassified = []
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    await screen.findByTestId('funnel-card')
    expect(screen.queryByTestId('funnel-unclassified')).toBeNull()
  })

  test('a repo with no requirements yet shows only its way in, 开需求: no cards, no charts, no flow, no ledger', async () => {
    const user = userEvent.setup()
    const ov = fx.overview()
    ov.rows = []
    ov.overlaps = []
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const hero = await screen.findByRole('region', { name: '还没有需求' })
    expect(hero).toHaveTextContent('人只在判断点上出手：批准、回答、验收。')
    for (const id of ['ov-hero', 'ov-cards', 'flow', 'req-table', 'eval-batch']) expect(screen.queryByTestId(id)).toBeNull()
    expect(screen.queryByRole('region', { name: '每周合并' })).toBeNull()
    await user.click(within(hero).getByRole('button', { name: '开需求' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'new' })
  })

  test('with no repo at all: 导入仓库 is the way in, and nothing is asked of the backend', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const s = fx.status()
    s.repos = []
    const p = props({ status: s })
    render(<OverviewView entry={{}} {...p} />)
    const cta = screen.getByTestId('import-cta')
    expect(cta).toHaveTextContent('还没有仓库')
    await user.click(within(cta).getByRole('button', { name: '导入仓库' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'import' })
    expect(apiCalls.filter((c) => c.path.startsWith(`${API}/overview`))).toEqual([])
    expect(screen.queryByTestId('ov-hero')).toBeNull()
  })

  test('a repo the backend cannot read: the banner says why and has 去导入仓库 for that path', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    await user.click(within(await screen.findByTestId('repo-error')).getByRole('button', { name: '去导入仓库' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'import', path: '/Users/alice/workplace/shop-web' })
  })

  test('opened at a repo it cannot read (an old link): why and 去导入仓库, not 「只在本机」 and 开需求; one not listed any more says so', async () => {
    const user = userEvent.setup()
    const status = fx.status()
    status.repos = status.repos.map((r) => (r.id === 'r2' ? { ...r, remote: false } : r))
    const empty = (repo: string): Overview => ({ ...fx.overview(), rows: [], overlaps: [],
      errors: repo === 'r2' ? [{ repo: 'r2', error: '还没装 brain-kit：在「导入仓库」里检查它，装上就能用', raw: '/Users/alice/workplace/shop-web' }] : [] })
    installFixtureRoutes({ [`GET ${API}/overview*`]: (_b, path) => empty(new URL(path, 'http://x').searchParams.get('repo') ?? 'all') })
    const p = props({ status })
    const { unmount } = render(<OverviewView entry={{ repo: 'r2' }} {...p} />)
    const hero = await screen.findByTestId('ov-unreadable')
    expect(hero).toHaveTextContent('shop-web 还读不了还没装 brain-kit：在「导入仓库」里检查它，装上就能用')
    expect(screen.queryByTestId('ov-local-tag')).toBeNull()
    expect(screen.queryByRole('region', { name: '还没有需求' })).toBeNull()
    expect(screen.queryByRole('button', { name: '开需求' })).toBeNull()
    expect(screen.queryByTestId('repo-error')).toBeNull()    // said once, in the hero
    expect(document.querySelector('.cto-org')).toHaveTextContent('shop-web 还读不了')
    await user.click(within(hero).getByRole('button', { name: '去导入仓库' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'import', path: '/Users/alice/workplace/shop-web' })
    unmount()
    const q = props({ status })
    render(<OverviewView entry={{ repo: 'r9' }} {...q} />)
    const gone = await screen.findByTestId('ov-unreadable')
    expect(gone).toHaveTextContent('这个仓库不在列表里')
    await user.click(within(gone).getByRole('button', { name: '看全部' }))
    expect(q.replace).toHaveBeenLastCalledWith({ kind: 'overview' })
  })

  test('an overview that cannot be read shows errorText', async () => {
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => { throw apiError(500, 'scan_failed', '读仓库失败：r1 不是 git 仓库') } })
    render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('读仓库失败：r1 不是 git 仓库（500）')
  })
})

// ---------------------------------------------------------------- 大需求拆成小需求 (brain split), and runs that ended

const ACTS: ReqFamily['acts'] = { split: null, claim: null, release: null, start: null, start_on: null, sync: null }
const famOf = (over: Partial<ReqFamily>): ReqFamily => ({
  role: 'child', parent: 'PAY-20', parent_title: '退款大需求', branch: 'ai/alice/PAY-20-big', unit: null, state: null, state_label: '', owner: null,
  depends_on: [], blocked_by: [], paths: [], contracts: [], children: [], progress: null, family_state: null, family_label: '', released: false,
  acts: { ...ACTS }, source: 'brainkit', at: null, ...over,
})
const DEP_API: FamilyDep = { key: 'PAY-21', unit: 'api', state: 'in_progress', owner: 'alice', merged: false, text: 'PAY-21（api，alice 在做）' }
const DEP_JOBS: FamilyDep = { key: 'PAY-23', unit: 'jobs', state: 'merged', owner: 'carol', merged: true, text: 'PAY-23（jobs，已合并）' }
const KIDS: FamilyChild[] = [
  { key: 'PAY-21', unit: 'api', title: '通过接口提交退款', state: 'in_progress', state_label: 'alice 在做', owner: 'alice', depends_on: [], blocked_by: [] },
  { key: 'PAY-22', unit: 'web', title: '在订单页看到退款状态', state: 'unclaimed', state_label: '待认领', owner: null, depends_on: ['PAY-21'], blocked_by: ['PAY-21'] },
  { key: 'PAY-23', unit: 'jobs', title: '每晚自动对账', state: 'merged', state_label: '已合并', owner: 'carol', depends_on: [], blocked_by: [] },
  { key: 'PAY-24', unit: 'admin', title: '后台查退款', state: 'claimed', state_label: 'bob 认领了', owner: 'bob', depends_on: ['PAY-23', 'PAY-21'], blocked_by: ['PAY-21'] },
]
const lean = (n: number | null, label: string | null, done: number): LeanSummary =>
  ({ stage: label && 'x', stage_label: label, stage_n: n, stage_state: n === null ? null : 'started', done, total: 11 })
const waits = (who: Requirement['waits']['who'], text: string): Requirement['waits'] => ({ who, text, line: null, raw: '' })

/** A ledger row made from fx.overview()'s PAY-3 (a copy), as *over* says. */
function req(over: Partial<Requirement> & { key: string; state: ReqState }): Requirement {
  const base = clone(fx.overview().rows.find((r) => r.key === 'PAY-3') as Requirement)
  return { ...base, title: over.key, state_label: STATE_LABEL[over.state], overlap: [], open_questions: [], summary: null, mr: null, run_ids: [], credits: null, ...over }
}

const countsOf = (rows: Requirement[]) => Object.fromEntries((Object.keys(STATE_LABEL) as ReqState[]).map((s) => [s, rows.filter((r) => r.state === s).length]))

/** fx.overview() as a brain-kit before 0d52e97 gives it: the requirements without a family (PAY-2 … PAY-7), their runs
 * without a state, a delivery or a parent, no families. */
function classic(): Overview {
  const ov = fx.overview()
  ov.rows = ov.rows.filter((r) => r.family === null && r.state !== 'unclaimed' && r.state !== 'merged_into_parent')
  const keys = new Set(ov.rows.map((r) => r.key))
  ov.cto.runs = ov.cto.runs.filter((r) => keys.has(r.key) && r.how !== 'ended')
    .map((r) => ({ ...r, state: null, state_label: '', stuck: null, delivery: null, delivery_label: '', parent: null }))
  ov.eval.families = []
  ov.counts = countsOf(ov.rows)
  return ov
}

/** classic() with PAY-20 (alice's 退款大需求) split into four small ones: api (alice 在做), web (待认领, blocked by api),
 * jobs (merged into PAY-20), admin (bob's, blocked by api). The big one is older than PAY-6, so its group sits between
 * the open rows and the merged PAY-2. */
function splitOverview(): Overview {
  const ov = classic()
  const t = (ov.rows.find((r) => r.key === 'PAY-6')?.updated_at as number) - 600
  ov.rows.push(
    req({ key: 'PAY-20', title: '退款大需求', state: 'local', owner: 'alice', updated_at: t, lean: lean(7, '拆单元', 7), stage: '7/11 拆单元',
      waits: waits('people', '等小需求合进来：已合并 1/4（1 个待认领，1 个认领了，1 个在做）'),
      family: famOf({ role: 'parent', owner: 'alice', children: KIDS, family_state: 'in_progress', family_label: '小需求在做',
        progress: { merged: 1, total: 4, unclaimed: 1, claimed: 1, in_progress: 1, closed: 0, text: '1/4 merged' } }) }),
    req({ key: 'PAY-21', title: '通过接口提交退款', state: 'local', owner: 'alice', updated_at: t - 100, lean: lean(9, '代码生成', 8), stage: '9/11 代码生成',
      waits: waits('agent', 'AI 在做代码生成'), family: famOf({ unit: 'api', state: 'in_progress', state_label: 'alice 在做', owner: 'alice' }) }),
    req({ key: 'PAY-22', title: '在订单页看到退款状态', state: 'unclaimed', owner: null, updated_at: t - 200, lean: lean(null, null, 0), stage: null,
      waits: waits('people', '待认领：谁做都可以认领（开工要等 PAY-21（api，alice 在做）合进大需求）'),
      family: famOf({ unit: 'web', state: 'unclaimed', state_label: '待认领', depends_on: [DEP_API], blocked_by: ['PAY-21'] }) }),
    req({ key: 'PAY-23', title: '每晚自动对账', state: 'merged_into_parent', owner: 'carol', updated_at: t - 300, lean: lean(10, '构建和测试', 10), stage: '10/11 构建和测试',
      waits: waits('nobody', '已合进大需求 PAY-20 的分支：等它评审、发布'), family: famOf({ unit: 'jobs', state: 'merged', state_label: '已合并', owner: 'carol' }) }),
    req({ key: 'PAY-24', title: '后台查退款', state: 'claimed', owner: 'bob', updated_at: t - 400, lean: lean(null, null, 0), stage: null,
      waits: waits('people', 'bob 认领了，还没开工'),
      family: famOf({ unit: 'admin', state: 'claimed', state_label: 'bob 认领了', owner: 'bob', depends_on: [DEP_JOBS, DEP_API], blocked_by: ['PAY-21'] }) }),
  )
  ov.counts = countsOf(ov.rows)
  return ov
}
const ALL_KEYS = ['PAY-3', 'PAY-4', 'PAY-7', 'PAY-5', 'PAY-6', 'PAY-20', 'PAY-21', 'PAY-22', 'PAY-23', 'PAY-24', 'PAY-2']
const flowCard = (flow: HTMLElement, key: string) => flow.querySelector(`[data-testid="flow-card"][data-key="${key}"]`) as HTMLElement

describe('交付总览: 大需求和小需求', () => {
  test('colOf / laneOf for each family state: 待认领 in 构建; merged into the big one: no card; a split big one in 构建, ready: 发布验收', () => {
    const ov = splitOverview()
    const at = (key: string) => ov.rows.find((r) => r.key === key) as Requirement
    const place = (r: Requirement) => [colOf(r), colOf(r) === null ? null : laneOf(r)]
    expect(place(at('PAY-22'))).toEqual(['构建', 'unclaimed']) // nobody has it
    expect(place(at('PAY-23'))).toEqual([null, null]) // merged into PAY-20: its card is PAY-20's
    expect(place(at('PAY-24'))).toEqual(['构建', 'people']) // bob's claim, not started: his turn
    expect(place(at('PAY-21'))).toEqual(['构建', 'agent']) // its owner's AI builds it
    expect(place(at('PAY-20'))).toEqual(['构建', 'people']) // its small ones are being built by others
    // a small one whose MR into the big one's branch is open waits for the big one's owner
    expect(place({ ...at('PAY-21'), waits: waits('people', '交了 MR：等大需求的负责人合进 ai/alice/PAY-20-big'), mr: { iid: 12, url: null, state: 'opened' } })).toEqual(['构建', 'people'])
    // a small one is built in 构建 whatever its Lean stage says; closed: no card
    expect(place({ ...at('PAY-21'), lean: lean(4, '应用设计', 3) })).toEqual(['构建', 'agent'])
    expect(place({ ...at('PAY-24'), state: 'closed' })).toEqual([null, null])
    // every small one merged: review and release, its owner's turn (the backend: you / reply)
    const ready = { ...at('PAY-20'), waits: { ...waits('you', '小需求都合进来了：评审，再批发布'), do: 'reply' as const },
      family: { ...(at('PAY-20').family as ReqFamily), family_state: 'ready_to_release' as const } }
    expect(place(ready)).toEqual(['发布验收', 'you'])
    expect(colOf({ ...at('PAY-20'), state: 'merged' })).toBe('已合并')
    // opened as a big one, not split yet: its Lean stage, as any requirement
    expect(place(req({ key: 'PAY-30', state: 'local', lean: lean(5, '应用设计', 4), waits: waits('agent', 'AI 在做'), family: famOf({ role: 'big', parent: 'PAY-30' }) }))).toEqual(['设计', 'agent'])
  })

  test('需求流动: the 待认领 lane holds the unclaimed small ones; the stats count them apart; 已合并 spans every lane', async () => {
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => splitOverview() })
    render(<OverviewView entry={{}} {...props()} />)
    const flow = await screen.findByTestId('flow')
    expect(Array.from(flow.querySelectorAll('.cto-lane')).map((l) => l.textContent)).toEqual(['轮到你', '等别人', 'AI 在本机做', '运行机在跑', '待认领'])
    expect(flow.querySelector('.cto-lane.br-lane-free')).toHaveTextContent('待认领')
    expect(flow.querySelectorAll('.br-merged-cell')).toHaveLength(1)
    expect((flow.querySelector('.br-merged-cell') as HTMLElement).style.gridRow).toBe('span 5')
    const cell = (key: string) => flowCard(flow, key).closest('[data-col]') as HTMLElement
    expect([cell('PAY-22').dataset.col, cell('PAY-22').dataset.lane]).toEqual(['构建', 'unclaimed'])
    expect([cell('PAY-20').dataset.col, cell('PAY-20').dataset.lane]).toEqual(['构建', 'people'])
    expect([cell('PAY-24').dataset.col, cell('PAY-24').dataset.lane]).toEqual(['构建', 'people'])
    expect(flowCard(flow, 'PAY-23')).toBeNull() // merged into its big one: no card of its own
    expect(flow.querySelector('[data-col="已合并"] [data-key="PAY-23"]')).toBeNull()
    expect(flowCard(flow, 'PAY-22')).toHaveClass('br-kfree')
    expect(flowCard(flow, 'PAY-22')).toHaveTextContent('还没人认领')
    // the small one nobody has is not counted as in progress; 待认领 has its own count
    const live = splitOverview().rows.filter((r) => colOf(r) && colOf(r) !== '已合并')
    const stats = within(flow).getByTestId('flow-stats')
    expect(stats).toHaveTextContent(`进行中 ${live.length - 1} 个`)
    expect(stats).toHaveTextContent('·待认领 1')
    expect(flow.querySelector('.cto-kb-h:nth-of-type(4)')).toHaveTextContent(`构建${live.filter((r) => colOf(r) === '构建').length}`)
  })

  test('a big requirement’s card: n/m merged as segments, its small ones in short (key · unit · state), no nested buttons', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => splitOverview() })
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const card = flowCard(await screen.findByTestId('flow'), 'PAY-20')
    expect(card).toHaveAttribute('data-role', 'parent')
    const fam = within(card).getByTestId('flow-family')
    expect(within(fam).getByRole('img', { name: '小需求合并了 1/4' })).toBeInTheDocument()
    expect(Array.from(fam.querySelectorAll('.kt-segs i')).map((i) => i.className)).toEqual(['is-run', '', 'is-pass', 'is-claimed'])
    expect(fam.querySelector('.br-fam-bar b')).toHaveTextContent(/^1\/4$/)
    const kids = within(card).getByTestId('flow-kids')
    expect(Array.from(kids.querySelectorAll('[data-kid]')).map((k) => [k.getAttribute('data-kid'), k.getAttribute('data-state'), k.textContent])).toEqual([
      ['PAY-21', 'in_progress', '●PAY-21api'], ['PAY-22', 'unclaimed', '◌PAY-22web'], ['PAY-23', 'merged', '✔PAY-23jobs'], ['PAY-24', 'claimed', '○PAY-24admin'],
    ])
    expect(kids.querySelector('[data-kid="PAY-23"]')).toHaveClass('tone-ok')
    expect(kids.querySelector('[data-kid="PAY-21"]')).toHaveAttribute('title', 'PAY-21 通过接口提交退款：alice 在做')
    expect(card.querySelectorAll('button, [role="button"]')).toHaveLength(0) // the card itself is the button
    expect(card).toHaveTextContent('等小需求合进来：已合并 1/4')
    await user.click(kids.querySelector('[data-kid="PAY-21"]') as HTMLElement)
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-20', from: 'overview' })
  })

  test('a small requirement’s card: its big one and unit, its dependencies, and what blocks it in FamilyDep’s words', async () => {
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => splitOverview() })
    render(<OverviewView entry={{}} {...props()} />)
    const flow = await screen.findByTestId('flow')
    const web = flowCard(flow, 'PAY-22')
    expect(within(web).getByTestId('flow-parent')).toHaveTextContent(/^PAY-20 的小需求 · web$/)
    expect(within(web).getByTestId('flow-deps')).toHaveTextContent(/^依赖PAY-21$/)
    expect(within(web).getAllByTestId('flow-blocked').map((b) => b.textContent)).toEqual(['等 PAY-21（api，alice 在做）合进大需求'])
    // its 在等 already names the blocker: the card says its state instead of saying it twice
    expect(web.querySelector('.cto-kfocus')).toHaveTextContent(/^待认领$/)
    const admin = flowCard(flow, 'PAY-24')
    expect(within(admin).getByTestId('flow-parent')).toHaveTextContent('PAY-20 的小需求 · admin')
    expect(admin.querySelector('.cto-kfocus')).toHaveTextContent('bob 认领了，还没开工')
    const deps = within(admin).getByTestId('flow-deps')
    expect(deps).toHaveTextContent('依赖✔PAY-23PAY-21')
    expect(within(deps).getByText('✔PAY-23')).toHaveClass('is-merged')
    expect(within(deps).getByText('PAY-21')).not.toHaveClass('is-merged')
    expect(within(admin).getByTestId('flow-blocked')).toHaveTextContent('等 PAY-21（api，alice 在做）合进大需求')
    // nothing blocks the one in progress
    expect(within(flowCard(flow, 'PAY-21')).queryByTestId('flow-blocked')).toBeNull()
    expect(within(flowCard(flow, 'PAY-21')).queryByTestId('flow-deps')).toBeNull()
  })

  test('交付清单: small requirements right after their big one, nested; 小需求 1/4 ▾ folds them and unfolds them', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => splitOverview() })
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const table = await screen.findByTestId('req-table')
    expect(keysOf(table)).toEqual(ALL_KEYS)
    expect(Array.from(table.querySelectorAll('tr.br-kid')).map((r) => [r.getAttribute('data-key'), r.querySelector('.br-tree')?.textContent])).toEqual([
      ['PAY-21', '├'], ['PAY-22', '├'], ['PAY-23', '├'], ['PAY-24', '└'],
    ])
    expect(rowOf(table, 'PAY-20')).not.toHaveClass('br-kid')
    // nested: its unit, not its big one's key again
    expect(within(rowOf(table, 'PAY-21')).getByText('api')).toHaveClass('br-tag')
    expect(rowOf(table, 'PAY-21')).not.toHaveTextContent('PAY-20 的小需求')
    expect(rowOf(table, 'PAY-20')).toHaveTextContent('shop-pay') // the repo once, on the big one's row
    expect(rowOf(table, 'PAY-21')).not.toHaveTextContent('shop-pay')
    expect(within(rowOf(table, 'PAY-23')).getByText('已合进大需求', { selector: '.br-chip' })).toBeInTheDocument()
    expect(rowOf(table, 'PAY-23')).toHaveClass('is-merged')
    // what blocks it, unless 在等 says it already
    expect(rowOf(table, 'PAY-24')).toHaveTextContent('等 PAY-21 合进大需求')
    expect(within(rowOf(table, 'PAY-22')).queryByText('等 PAY-21 合进大需求')).toBeNull()
    const toggle = within(rowOf(table, 'PAY-20')).getByRole('button', { name: '小需求 1/4 ▾' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(keysOf(table)).toEqual(['PAY-3', 'PAY-4', 'PAY-7', 'PAY-5', 'PAY-6', 'PAY-20', 'PAY-2'])
    expect(p.go).not.toHaveBeenCalled() // the toggle does not open the board
    const folded = within(rowOf(table, 'PAY-20')).getByRole('button', { name: '小需求 1/4 ▸' })
    expect(folded).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('共 11 个')
    await user.click(folded)
    expect(keysOf(table)).toEqual(ALL_KEYS)
  })

  test('交付清单 with a state picked: a small one whose big one is not in the list stands alone; with it, nested under it', async () => {
    const user = userEvent.setup()
    const ov = splitOverview()
    // a small one of a big one that is not on this page at all
    ov.rows.push(req({ key: 'PAY-41', title: '导出', state: 'unclaimed', updated_at: 1793900000, waits: waits('people', '待认领：谁做都可以认领'),
      family: famOf({ parent: 'PAY-40', unit: 'export', state: 'unclaimed', state_label: '待认领' }) }))
    ov.counts = countsOf(ov.rows)
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const table = await screen.findByTestId('req-table')
    expect(keysOf(table).slice(-2)).toEqual(['PAY-41', 'PAY-2']) // where its own order puts it
    expect(rowOf(table, 'PAY-41')).not.toHaveClass('br-kid')
    expect(rowOf(table, 'PAY-41')).toHaveTextContent('PAY-40 的小需求')
    const chips = screen.getByTestId('state-filter')
    await user.click(within(chips).getByRole('button', { name: '待认领 2' }))
    expect(keysOf(table)).toEqual(['PAY-22', 'PAY-41'])
    expect(table.querySelectorAll('tr.br-kid')).toHaveLength(0)
    expect(rowOf(table, 'PAY-22')).toHaveTextContent('PAY-20 的小需求')
    expect(rowOf(table, 'PAY-22').querySelector('.br-tree')).toBeNull()
    await user.click(within(chips).getByRole('button', { name: '本地开发中 3' }))
    expect(keysOf(table)).toEqual(['PAY-3', 'PAY-20', 'PAY-21'])
    expect(rowOf(table, 'PAY-21').querySelector('.br-tree')).toHaveTextContent('└')
    expect(within(rowOf(table, 'PAY-20')).getByRole('button', { name: '小需求 1/4 ▾' })).toBeInTheDocument()
    // its small ones all filtered out: n/m stays, there is nothing to fold
    await user.click(within(chips).getByRole('button', { name: '本地开发中 3' }))
    await user.click(within(chips).getByRole('button', { name: '已认领 2' }))
    expect(keysOf(table)).toEqual(['PAY-6', 'PAY-24'])
    expect(rowOf(table, 'PAY-24')).toHaveTextContent('PAY-20 的小需求')
  })

  test('显示更多 never cuts a big requirement from its small ones', async () => {
    const user = userEvent.setup()
    const ov = splitOverview()
    const t0 = ov.rows[0].updated_at as number
    ov.rows = [
      ...Array.from({ length: 13 }, (_, i) => req({ key: `PAY-${100 + i}`, state: 'local', updated_at: t0 - i, waits: waits('agent', 'AI 在做') })),
      ...ov.rows.filter((r) => ['PAY-20', 'PAY-21', 'PAY-22', 'PAY-24'].includes(r.key)),
      ...Array.from({ length: 2 }, (_, i) => req({ key: `PAY-${200 + i}`, state: 'local', updated_at: 1000 - i, waits: waits('agent', 'AI 在做') })),
    ]
    ov.overlaps = []
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const table = await screen.findByTestId('req-table')
    expect(keysOf(table).slice(12)).toEqual(['PAY-112', 'PAY-20', 'PAY-21', 'PAY-22', 'PAY-24'])
    await user.click(screen.getByRole('button', { name: '显示更多（还有 2 个）' }))
    expect(keysOf(table).slice(-2)).toEqual(['PAY-200', 'PAY-201'])
  })

  test('the eval families: one summary row per big requirement (n/m merged, state, acts, questions, credits); its key opens its 需求看板', async () => {
    const user = userEvent.setup()
    const ov = splitOverview()
    ov.eval.families = [
      { key: 'PAY-20', repo: 'r1', children: ['PAY-21', 'PAY-22', 'PAY-23', 'PAY-24'], merged: 1, total: 4, state: 'in_progress', state_label: '小需求在做',
        at_points: 3, outside: 1, questions: 2, credits: 40.2 },
      { key: 'PAY-40', repo: '', children: ['PAY-41'], merged: 1, total: 1, state: 'ready_to_release', state_label: '小需求都合进了，等发布',
        at_points: 1, outside: 0, questions: 0, credits: null },
      // brain-kit 1238919: the small ones not started and the closed ones are named
      { key: 'PAY-50', repo: '', children: ['PAY-51', 'PAY-52', 'PAY-53'], merged: 1, total: 2, not_started: ['PAY-52'], closed: ['PAY-53'],
        state: 'in_progress', state_label: '小需求在做', at_points: 0, outside: 0, questions: 0, credits: null },
    ]
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const table = await screen.findByTestId('req-table')
    const rows = screen.getAllByTestId('eval-family')
    expect(rows.map((r) => r.getAttribute('data-family'))).toEqual(['PAY-20', 'PAY-40', 'PAY-50'])
    const chips = (r: HTMLElement) => Array.from(r.querySelectorAll('[data-n]')).map((c) => c.textContent)
    expect(rows[0]).toHaveTextContent('大需求PAY-20 ↗')
    expect(within(rows[0]).getByText('小需求在做')).toHaveClass('br-chip', 'tone-info')
    expect(chips(rows[0])).toEqual(['已合并1/4', '判断点上 3', '判断点外 1', '问题 2', '40.2 credits'])
    expect(rows[0].querySelector('[data-n="merged"]')).toHaveAttribute('title', '小需求：PAY-21、PAY-22、PAY-23、PAY-24')
    expect(within(rows[1]).getByText('小需求都合进了，等发布')).toHaveClass('tone-wait')
    expect(chips(rows[1])).toEqual(['已合并1/1', '判断点上 1', '判断点外 0', '问题 0', '— credits'])
    expect(chips(rows[2])).toEqual(['已合并1/2', '没开工1', '关了1', '判断点上 0', '判断点外 0', '问题 0', '— credits'])
    expect(rows[2].querySelector('[data-n="closed"]')).toHaveAttribute('title', '关了，不算在内：PAY-53')
    // in brain-kit's eval card, before its 要复看 and 跳过; not requirement rows of the ledger
    const batch = screen.getByTestId('eval-batch')
    const order = Array.from(batch.querySelectorAll('[data-testid^="eval-"]')).map((r) => r.getAttribute('data-testid'))
    expect(order.slice(0, 3)).toEqual(['eval-family', 'eval-family', 'eval-family'])
    expect(order.slice(3).every((t) => t !== 'eval-family')).toBe(true)
    expect(table.querySelector('[data-testid="eval-family"]')).toBeNull()
    expect(keysOf(table)).toEqual(ALL_KEYS)
    await user.click(within(rows[0]).getByRole('button', { name: 'PAY-20 ↗' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-20', from: 'overview' })
    await user.click(within(rows[1]).getByRole('button', { name: 'PAY-40 ↗' })) // no repo: the queue rows' way
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-40', from: 'overview' })
  })

  test('交付方式 and the 无人值守 legend: ended (why, in brain-kit’s words), the run’s state when it says more, 停住了, the delivery in the title', async () => {
    const user = userEvent.setup()
    const ov = splitOverview()
    const run = (over: Partial<CtoRun> & { key: string }): CtoRun => ({ repo: 'r1', how: 'pending', beyond: [], at_points: 0, outside: 0, credits: null, merged_at: null,
      state: null, state_label: '', stuck: null, delivery: null, delivery_label: '', parent: null, ...over })
    const runs = ov.cto.runs
    Object.assign(runs.find((r) => r.key === 'PAY-4') as CtoRun, { state: 'answered', state_label: '有了回答、运行机没接着做', stuck: true, delivery: 'open', delivery_label: '还没合并' })
    Object.assign(runs.find((r) => r.key === 'PAY-2') as CtoRun, { state: 'merged', state_label: '已合并', stuck: false, delivery: 'correct', delivery_label: '对' })
    runs.push(
      run({ key: 'PAY-7', how: 'ended', beyond: ['运行机没能开始'], state: 'failed', state_label: '运行机失败', stuck: false, delivery: 'open', delivery_label: '还没合并' }),
      run({ key: 'PAY-23', state: 'merged_into_parent', state_label: '已合进大需求', parent: 'PAY-20', delivery: 'open', delivery_label: '还没合并' }),
    )
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const table = await screen.findByTestId('req-table')
    const how = (key: string) => rowOf(table, key).querySelector('.br-how-cell') as HTMLElement
    expect(how('PAY-7')).toHaveAttribute('data-how', 'ended')
    expect(how('PAY-7')).toHaveTextContent('没交付就结束')
    expect(within(how('PAY-7')).getByTestId('how-why')).toHaveTextContent(/^运行机没能开始$/)
    expect(within(how('PAY-7')).queryByTestId('how-state')).toBeNull() // its why says it
    expect(how('PAY-7')).toHaveAttribute('title', '没交付就结束：运行机没能开始，或 MR 关了没合并 · 交付：还没合并')
    expect(how('PAY-4')).toHaveTextContent('还没评停住了人介入 2 次')
    expect(within(how('PAY-4')).getByText('停住了')).toHaveClass('br-chip', 'tone-warn')
    expect(within(how('PAY-4')).getByTestId('how-state')).toHaveTextContent('有了回答、运行机没接着做')
    expect(within(how('PAY-23')).getByTestId('how-state')).toHaveTextContent('已合进大需求')
    expect(within(how('PAY-2')).queryByTestId('how-state')).toBeNull() // 已合并 says nothing the how does not
    expect(how('PAY-2')).toHaveAttribute('title', '交付：对 · 判断点之外：回答问题')
    expect(how('PAY-5')).not.toHaveAttribute('title') // nothing known beyond the how
    const card = screen.getByRole('article', { name: '无人值守' })
    const legend = card.querySelector('.cto-legend') as HTMLElement
    const n = (h: CtoRun['how']) => runs.filter((r) => r.how === h).length
    // the legend names the ways there are, in its order, the ended ones last
    const shown = (['unattended', 'people', 'local', 'pending', 'ended'] as CtoRun['how'][]).filter((h) => n(h) > 0)
    expect(Array.from(legend.querySelectorAll('[data-how]')).map((s) => s.getAttribute('data-how'))).toEqual(shown)
    expect(legend.querySelector('[data-how="ended"]')).toHaveTextContent('没交付就结束1')
    expect(legend.querySelector('[data-how="ended"]')).toHaveAttribute('title', '没交付就结束：运行机没能开始，或 MR 关了没合并')
    expect(within(card).getByRole('img', { name: `评估过的需求，按交付方式：无人值守 ${n('unattended')}，有人插手 ${n('people')}，只在本机 ${n('local')}，还没评 ${n('pending')}，没交付就结束 1` })).toBeInTheDocument()
    const foot = within(card).getByTestId('ov-ended')
    expect(foot).toHaveTextContent('没交付就结束：PAY-7（运行机没能开始）')
    await user.click(within(foot).getByRole('button', { name: 'PAY-7' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-7', from: 'overview' })
  })

  test('an older brain-kit (family null everywhere, no families, no ended): no 待认领 lane, no groups, no family rows, the legend as before', async () => {
    const ov = classic()
    expect(ov.rows.map((r) => r.key)).toEqual(['PAY-3', 'PAY-4', 'PAY-5', 'PAY-7', 'PAY-6', 'PAY-2'])
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const flow = await screen.findByTestId('flow')
    expect(Array.from(flow.querySelectorAll('.cto-lane')).map((l) => l.textContent)).toEqual(['轮到你', '等别人', 'AI 在本机做', '运行机在跑'])
    expect((flow.querySelector('.br-merged-cell') as HTMLElement).style.gridRow).toBe('span 4')
    expect(within(flow).getByTestId('flow-stats')).not.toHaveTextContent('待认领')
    expect(flow.querySelector('[data-testid="flow-family"], [data-testid="flow-parent"], .br-kfree')).toBeNull()
    const table = screen.getByTestId('req-table')
    expect(table.querySelectorAll('tr.br-kid, .br-fam-toggle')).toHaveLength(0)
    expect(screen.queryAllByTestId('eval-family')).toHaveLength(0)
    const card = screen.getByRole('article', { name: '无人值守' })
    expect(Array.from(card.querySelectorAll('.cto-legend [data-how]')).map((s) => s.getAttribute('data-how'))).not.toContain('ended')
    expect(within(card).queryByTestId('ov-ended')).toBeNull()
    // runs before 0d52e97 (no state, no delivery): the how alone, as before
    expect(rowOf(table, 'PAY-4').querySelector('.br-how-cell [data-testid]')).toBeNull()
  })
})
