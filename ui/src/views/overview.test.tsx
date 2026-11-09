import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import BrainApp from '../main'
import { colOf, laneOf } from '../cto/Flow'
import { searchOf } from '../nav'
import { clone, fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError, navigations } from '../test/stubs/app-sdk'
import { OverviewView, WHO_VOCAB } from './Overview'
import type { ViewProps } from './props'
import type { CtoRun, FamilyChild, FamilyDep, LeanSummary, Overview, ReqFamily, ReqState, Requirement } from '../types'
import { STATE_LABEL } from '../types'

function props(over: Partial<ViewProps> = {}): ViewProps {
  return { status: fx.status(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn(), pollMs: 60_000, ...over }
}

const rowOf = (table: HTMLElement, key: string) => table.querySelector(`tr[data-key="${key}"]`) as HTMLElement
const reqRows = (table: HTMLElement) => table.querySelectorAll('tr[data-key]')

describe('交付总览', () => {
  test('the hero: the sentence and the three numbers from cto, with the decision funnel as the fourth card; 口径 is folded', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const c = fx.overview().cto
    const hero = await screen.findByTestId('ov-hero')
    expect(within(hero).getByRole('heading', { level: 2 })).toHaveTextContent(c.sentence)
    expect(hero).toHaveTextContent('数字来自 brain-kit evaluate（origin/main）：只算交接过、评估过的需求')
    const cards = within(screen.getByTestId('ov-cards')).getAllByRole('article').map((a) => a.getAttribute('aria-label'))
    expect(cards).toEqual(['无人值守', '人介入', '每个需求的 credits', '决定 · 谁定的'])
    expect(screen.getByTestId('ov-unattended')).toHaveTextContent(/^0\/1$/)
    expect(screen.getByTestId('ov-people')).toHaveTextContent(/^5次$/)
    expect(screen.getByRole('article', { name: '人介入' })).toHaveTextContent('5 次落在判断点上（批准、驳回、回答），0 次在判断点之外')
    expect(screen.getByTestId('ov-credits')).toHaveTextContent(/^21\.1$/)
    expect(screen.getByRole('article', { name: '每个需求的 credits' })).toHaveTextContent('4 个需求合计 84.3 credits')
    // the small charts say what they draw
    const n = (h: CtoRun['how']) => c.runs.filter((r) => r.how === h).length
    expect(screen.getByRole('img', { name: `评估过的交接：无人值守 ${n('unattended')}，有人插手 ${n('people')}；还没评 ${n('pending')}，本机做完 ${n('local')}${n('ended') ? `，没交付就结束 ${n('ended')}` : ''}` })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '人介入：判断点上 5 次，判断点之外 0 次' })).toBeInTheDocument()
    const notes = screen.getByText('口径').closest('details') as HTMLDetailsElement
    expect(notes.open).toBe(false)
    expect(notes).toHaveTextContent(WHO_VOCAB)
  })

  test('without evaluate the numbers that need it are —, and the hero says where the numbers stand', async () => {
    const ov = fx.overview()
    ov.cto = { ...ov.cto, available: false, unattended: null, stepped_in: null, credits: { per_req: null, total: null, reqs: 0 } }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByTestId('ov-hero')).toHaveTextContent('brain-kit 的 evaluate 还没给出数字：先看 credits 和合并')
    expect(screen.getByTestId('ov-unattended')).toHaveTextContent(/^—$/)
    expect(screen.getByTestId('ov-people')).toHaveTextContent(/^—$/)
    expect(screen.getByRole('article', { name: '人介入' })).toHaveTextContent('评估以后才有')
    expect(screen.getByTestId('ov-credits')).toHaveTextContent(/^—$/)
    expect(screen.getByRole('article', { name: '每个需求的 credits' })).toHaveTextContent('这个 app 开的会话还没报 credits')
  })

  test('每周合并: the 12 weeks as a chart or as a table; a week opens the merged requirements in the ledger', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const weekly = await screen.findByRole('region', { name: '每周合并' })
    expect(weekly).toHaveTextContent('近 12 周合并了 1 个需求，最近 4 周 1 个')
    const seg = within(weekly).getByRole('group', { name: '图或表格' })
    expect(within(seg).getByRole('button', { name: '图' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(weekly).queryByRole('table')).toBeNull()
    await user.click(within(seg).getByRole('button', { name: '表格' }))
    const table = within(weekly).getByRole('table')
    const body = within(table).getAllByRole('row').slice(1)
    expect(body).toHaveLength(fx.overview().cto.weekly.length)
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['一周起始', '无人值守', '有人插手', '本机做完', '还没评', '合计'])
    expect(within(body.at(-1) as HTMLElement).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2026-11-02', '0', '1', '0', '0', '1'])
    await user.click(within(seg).getByRole('button', { name: '图' }))
    await user.click(within(weekly).getByRole('button', { name: '11/2 起的一周：1 个' }))
    expect(p.replace).toHaveBeenLastCalledWith({ kind: 'overview', state: 'merged' })
    const ledger = screen.getByTestId('req-table')
    expect(Array.from(reqRows(ledger)).map((r) => r.getAttribute('data-key'))).toEqual(['PAY-2'])
  })

  test('需求流动: every open card sits in the column and lane colOf / laneOf say; merged ones in 已合并', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const flow = await screen.findByTestId('flow')
    const rows = fx.overview().rows
    const want: Record<string, [string, string]> = {
      'PAY-3': ['构建', 'approve'], // the PLAN approval the person types
      'PAY-4': ['交给运行机', 'answer'], // parked on D-2 after the hand-over
      'PAY-5': ['发布验收', 'approve'],
      'PAY-7': ['交给运行机', 'approve'], // a refused hand-over to redo
      'PAY-6': ['需求', 'approve'], // claimed, not started
    }
    for (const r of rows.filter((x) => x.state !== 'merged')) {
      expect([colOf(r), laneOf(r)]).toEqual(want[r.key])
      const card = flow.querySelector(`[data-testid="flow-card"][data-key="${r.key}"]`) as HTMLElement
      const cell = card.closest('[data-col]') as HTMLElement
      expect([cell.dataset.col, cell.dataset.lane]).toEqual(want[r.key])
      expect(card).toHaveTextContent(r.title)
    }
    expect(within(flow).getAllByTestId('flow-card')).toHaveLength(5)
    expect(colOf(rows.find((r) => r.key === 'PAY-2')!)).toBe('已合并')
    expect(flow.querySelector('[data-col="已合并"] [data-key="PAY-2"]')).toHaveTextContent('退款单号校验')
    expect(within(flow).getByTestId('flow-stats')).toHaveTextContent('进行中 5 个·等人批准 4·等人回答 1·AI 在本机做 0·运行机在做 0')
    // what the card waits on, and who owns it
    const pay4 = flow.querySelector('[data-testid="flow-card"][data-key="PAY-4"]') as HTMLElement
    expect(pay4).toHaveTextContent('停在 D-2：等产品在 MR 上回答')
    expect(pay4).toHaveTextContent('carol · 4/11 应用设计')
  })

  test('a Flow card opens that requirement’s 需求看板: view=board for its key in the URL', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    const flow = await screen.findByTestId('flow')
    await user.click(flow.querySelector('[data-testid="flow-card"][data-key="PAY-4"]') as HTMLElement)
    expect(window.location.search).toBe('?view=board&repo=r1&key=PAY-4&from=overview')
    expect(navigations).toEqual(['/apps/brain?view=board&repo=r1&key=PAY-4&from=overview'])
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/board/r1/PAY-4`)).toBe(true))
  })

  test('every requirement is a ledger row: key, title, state, Lean, what it waits on, credits, MR, badges', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const table = await screen.findByTestId('req-table')
    expect(reqRows(table)).toHaveLength(fx.overview().rows.length)
    const pay3 = rowOf(table, 'PAY-3')
    expect(pay3).toHaveTextContent('退款单导出 CSV')
    expect(pay3).toHaveTextContent('本地开发中')
    expect(within(pay3).getByText(fx.overview().rows[0].waits.text)).toHaveClass('br-strong') // it waits on you
    expect(pay3).toHaveTextContent('在会话里自己打那一行')
    expect(pay3).toHaveTextContent('12.4')
    expect(pay3).toHaveTextContent('和 PAY-4 重叠')
    // the first line of its 变更说明 (brain mr-desc); none for a claim without a run
    expect(within(pay3).getByTestId('row-summary')).toHaveTextContent(fx.overview().rows[0].summary as string)
    expect(within(rowOf(table, 'PAY-6')).queryByTestId('row-summary')).toBeNull()
    const pay4 = rowOf(table, 'PAY-4')
    expect(pay4).toHaveTextContent('D-2 待答')
    expect(pay4).toHaveTextContent('还没评人 2') // how it was delivered (cto.runs)
    const mr = within(pay4).getByRole('link', { name: /!41/ })
    expect(mr).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/41')
    expect(mr).toHaveAttribute('target', '_blank')
    expect(rowOf(table, 'PAY-2')).toHaveTextContent('有人插手')
    expect(apiCalls[0]).toMatchObject({ method: 'GET', path: `${API}/overview?repo=all` })
    // open ones first, the newest activity first; the merged one last
    expect(Array.from(reqRows(table)).map((r) => r.getAttribute('data-key'))).toEqual(['PAY-3', 'PAY-4', 'PAY-7', 'PAY-5', 'PAY-6', 'PAY-2'])
    // a repo the backend could not read says why
    expect(screen.getByText(/shop-web：还没装 brain-kit/)).toBeInTheDocument()
  })

  test('the Lean cell: n/total; 下一步 for the next stage to do, 做完 when Lean is finished, 0/11 before it started', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const table = await screen.findByTestId('req-table')
    const cell = (key: string) => within(rowOf(table, key)).getByTestId('lean-cell')
    expect(cell('PAY-3')).toHaveTextContent(/^9\/11$/) // started: no hint
    expect(within(cell('PAY-3')).queryByTestId('lean-hint')).toBeNull()
    expect(within(cell('PAY-3')).getByRole('img')).toHaveAccessibleName('做完 8/11')
    expect(cell('PAY-7')).toHaveTextContent(/^10\/11下一步$/)
    expect(within(cell('PAY-7')).getByTestId('lean-hint')).toHaveClass('br-hint')
    expect(cell('PAY-2')).toHaveTextContent(/^11\/11做完$/)
    expect(cell('PAY-6')).toHaveTextContent(/^0\/11$/)
    expect(within(cell('PAY-6')).queryByTestId('lean-hint')).toBeNull()
  })

  test('a row opens its 需求看板; 详情 opens its 需求详情; the overlap card names both and what they share', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const table = await screen.findByTestId('req-table')
    await user.click(within(rowOf(table, 'PAY-4')).getByText('对账单按商户拆分'))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-4', from: 'overview' })
    await user.click(within(rowOf(table, 'PAY-4')).getByRole('button', { name: '详情' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-4', from: 'overview' })
    expect(p.go).toHaveBeenCalledTimes(2) // the button does not open the board as well
    const overlaps = screen.getByTestId('overlaps')
    expect(overlaps).toHaveTextContent('这些需求要改同一处')
    expect(overlaps).toHaveTextContent('PAY-3和PAY-4都要改src/refund/')
    await user.click(within(overlaps).getByRole('button', { name: 'PAY-3' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'overview' })
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

  test('the state chips filter the rows and say it in the URL entry; a repo pill asks the backend for that repo', async () => {
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
    const table = screen.getByTestId('req-table')
    expect(Array.from(reqRows(table)).map((r) => r.getAttribute('data-key'))).toEqual(['PAY-4'])
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('共 1 个')
    const pills = screen.getByRole('navigation', { name: '仓库' })
    expect(within(pills).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true')
    // a repo that cannot be read cannot be picked
    expect(within(pills).getByRole('button', { name: /^shop-web/ })).toBeDisabled()
    expect(within(pills).getByRole('button', { name: /^shop-web/ })).toHaveTextContent('读不到')
    await user.click(within(pills).getByRole('button', { name: 'shop-pay' }))
    expect(p.replace).toHaveBeenLastCalledWith({ kind: 'overview', repo: 'r1', state: 'parked' })
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/overview?repo=r1`)).toBe(true))
  })

  test('opened with a state in the URL, only those rows show', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{ state: 'acceptance' }} {...props()} />)
    const table = await screen.findByTestId('req-table')
    expect(Array.from(reqRows(table)).map((r) => r.getAttribute('data-key'))).toEqual(['PAY-5'])
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

  test('从远端取最新 posts the repo to /refresh, says what it did and reads the overview again', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/refresh`]: () => ({ ok: true, text: 'shop-pay：取到 3 个新分支' }) })
    render(<OverviewView entry={{}} {...props()} />)
    await screen.findByTestId('req-table')
    const before = apiCalls.filter((c) => c.path.startsWith(`${API}/overview`)).length
    await user.click(screen.getByRole('button', { name: '从远端取最新' }))
    expect(await screen.findByText('shop-pay：取到 3 个新分支')).toBeInTheDocument()
    expect(apiCalls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: `${API}/refresh`, body: { repo: 'r1' } })
    await waitFor(() => expect(apiCalls.filter((c) => c.path.startsWith(`${API}/overview`)).length).toBeGreaterThan(before))
  })

  test('a refresh that fails shows the backend’s error', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/refresh`]: () => { throw apiError(502, 'git_failed', 'git fetch 失败：连不上 gitlab.example.com') } })
    render(<OverviewView entry={{}} {...props()} />)
    await screen.findByTestId('req-table')
    await user.click(screen.getByRole('button', { name: '从远端取最新' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('git fetch 失败：连不上 gitlab.example.com（502）')
  })

  test('the eval batch row: rates as a/b, a number, — for none; its queue says why and opens the requirement', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const batch = await screen.findByTestId('eval-batch')
    expect(batch).toHaveTextContent('这一批 Eval（main）')
    expect(batch.querySelector('[data-metric="autonomy"]')).toHaveTextContent(/^自主度2\/3$/)
    expect(batch.querySelector('[data-metric="autonomy"]')).toHaveAttribute('title', fx.overview().eval.metrics[0].rule)
    expect(batch.querySelector('[data-metric="staleness"]')).toHaveTextContent(/^过时与冲突2$/)
    expect(batch.querySelector('[data-metric="credits_per_success"]')).toHaveTextContent(/^每个正确交付的 credits—$/)
    const queue = screen.getByTestId('eval-queue')
    expect(queue).toHaveTextContent('要复看')
    expect(queue).toHaveTextContent('验收被驳回 1 次；判断点之外有人介入 2 次（push_after_handover）')
    await user.click(within(queue).getByRole('button', { name: 'PAY-4' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-4', from: 'overview' })
  })

  test('the eval batch lists the runs brain-kit could not read (not counted) and its notes; none, no lines', async () => {
    installFixtureRoutes()
    const { unmount } = render(<OverviewView entry={{}} {...props()} />)
    const skipped = await screen.findByTestId('eval-skipped')
    expect(skipped).toHaveTextContent('跳过 PAY-1')
    expect(skipped).toHaveTextContent('读不了，不算进数字：runs/PAY-1/run.json 不是合法的 JSON：第 3 行')
    expect(screen.getByTestId('eval-notes')).toHaveTextContent(fx.overview().eval.notes.join('；'))
    unmount()
    const ov = fx.overview()
    ov.eval.skipped = []
    ov.eval.notes = []
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    await screen.findByTestId('eval-batch')
    expect(screen.queryByTestId('eval-skipped')).toBeNull()
    expect(screen.queryByTestId('eval-notes')).toBeNull()
  })

  test('without the evaluate module the batch row says so (or says its error)', async () => {
    const ov = fx.overview()
    ov.eval = { available: false, error: '', ref: null, metrics: [], queue: [], skipped: [], notes: [], families: [] }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const { unmount } = render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByTestId('eval-batch')).toHaveTextContent('brain-kit 还没有 evaluate 模块')
    expect(screen.queryByTestId('eval-queue')).toBeNull()
    unmount()
    const ov2 = fx.overview()
    ov2.eval = { available: false, error: 'evaluate 读 main 失败：没有 runs/', ref: null, metrics: [], queue: [], skipped: [], notes: [], families: [] }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov2 })
    render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByTestId('eval-batch')).toHaveTextContent('evaluate 读 main 失败：没有 runs/')
  })

  test('the decision funnel: the total, a row per category that has any, and the questions asked / answered / delivered', async () => {
    const ov = fx.overview()
    const agent = ov.funnel.rows.find((r) => r.id === 'agent')!
    agent.count = 0
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const card = await screen.findByTestId('funnel-card')
    expect(card).toHaveTextContent('15个决定')
    expect(card).toHaveTextContent('人定了 4 个 · 数字来自 brain-kit evaluate')
    expect(Array.from(card.querySelectorAll('[data-row]')).map((r) => r.getAttribute('data-row'))).toEqual(['person', 'check', 'brain', 'unclassified', 'unknown'])
    expect(card.querySelector('[data-row="person"]')).toHaveTextContent(/^人4$/)
    expect(card.querySelector('[data-row="unclassified"]')).toHaveTextContent('没归类（Who 不是规定的写法）1')
    expect(card.querySelector('[data-row="unknown"]')).toHaveTextContent('看不出（Who 空着）1')
    expect(within(card).getByRole('img', { name: /^决定：人 4，确定性检查 5，/ })).toBeInTheDocument()
    expect(within(card).getByTestId('funnel-questions')).toHaveTextContent('问人 4 次 · 答了 3 · 送回运行机 2')
  })

  test('the funnel names the unclassified decisions (each opens its requirement), with one line on how Who is written; none, no list', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    const { unmount } = render(<OverviewView entry={{}} {...p} />)
    const list = await screen.findByTestId('funnel-unclassified')
    expect(list).toHaveTextContent('没归类：PAY-4 D-3')
    expect(within(list).getByText(WHO_VOCAB)).toHaveClass('cto-was')
    expect(WHO_VOCAB).toBe('Who 要写 agent、brain <条目号>、check、<化名> <凭证号> 或 owner')
    await user.click(within(list).getByRole('button', { name: 'PAY-4 D-3' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-4', from: 'overview' })
    unmount()
    const ov = fx.overview()
    ov.funnel.unclassified = []
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    await screen.findByTestId('funnel-card')
    expect(screen.queryByTestId('funnel-unclassified')).toBeNull()
    expect(within(screen.getByTestId('ov-cards')).queryByText(WHO_VOCAB)).toBeNull()
  })

  test('with no requirements yet: one way in, 开需求; no flow and no ledger', async () => {
    const user = userEvent.setup()
    const ov = fx.overview()
    ov.rows = []
    ov.overlaps = []
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const hero = await screen.findByRole('region', { name: '还没有需求' })
    expect(hero).toHaveTextContent('人只在判断点上出手：批准、回答、验收。')
    expect(screen.queryByTestId('flow')).toBeNull()
    expect(screen.queryByTestId('req-table')).toBeNull()
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
const keysOf = (table: HTMLElement) => Array.from(reqRows(table)).map((r) => r.getAttribute('data-key'))
const flowCard = (flow: HTMLElement, key: string) => flow.querySelector(`[data-testid="flow-card"][data-key="${key}"]`) as HTMLElement

describe('交付总览: 大需求和小需求', () => {
  test('colOf / laneOf for each family state: 待认领 in 构建; merged into the big one: no card; a split big one in 构建, ready: 发布验收', () => {
    const ov = splitOverview()
    const at = (key: string) => ov.rows.find((r) => r.key === key) as Requirement
    const place = (r: Requirement) => [colOf(r), colOf(r) === null ? null : laneOf(r)]
    expect(place(at('PAY-22'))).toEqual(['构建', 'unclaimed']) // nobody has it
    expect(place(at('PAY-23'))).toEqual([null, null]) // merged into PAY-20: its card is PAY-20's
    expect(place(at('PAY-24'))).toEqual(['构建', 'approve']) // claimed, not started: the start waits on a person
    expect(place(at('PAY-21'))).toEqual(['构建', 'local']) // its owner's AI builds it
    expect(place(at('PAY-20'))).toEqual(['构建', 'local']) // its small ones are being built
    // a small one whose MR into the big one's branch is open waits for the big one's owner
    expect(place({ ...at('PAY-21'), waits: waits('people', '交了 MR：等大需求的负责人合进 ai/alice/PAY-20-big'), mr: { iid: 12, url: null, state: 'opened' } })).toEqual(['构建', 'approve'])
    // a small one is built in 构建 whatever its Lean stage says; closed: no card
    expect(place({ ...at('PAY-21'), lean: lean(4, '应用设计', 3) })).toEqual(['构建', 'local'])
    expect(place({ ...at('PAY-24'), state: 'closed' })).toEqual([null, null])
    // every small one merged: review and release, a person's turn
    const ready = { ...at('PAY-20'), family: { ...(at('PAY-20').family as ReqFamily), family_state: 'ready_to_release' as const } }
    expect(place(ready)).toEqual(['发布验收', 'approve'])
    expect(place({ ...at('PAY-20'), state: 'merged' })).toEqual(['已合并', 'local'])
    // opened as a big one, not split yet: its Lean stage, as any requirement
    expect(place(req({ key: 'PAY-30', state: 'local', lean: lean(5, '应用设计', 4), waits: waits('agent', 'AI 在做'), family: famOf({ role: 'big', parent: 'PAY-30' }) }))).toEqual(['设计', 'local'])
  })

  test('需求流动: the 待认领 lane holds the unclaimed small ones; the stats count them apart; 已合并 spans every lane', async () => {
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => splitOverview() })
    render(<OverviewView entry={{}} {...props()} />)
    const flow = await screen.findByTestId('flow')
    const lanes = Array.from(flow.querySelectorAll('.cto-lane')).map((l) => [l.getAttribute('data-lane'), l.textContent])
    expect(lanes).toEqual([['approve', '等人批准'], ['answer', '等人回答问题'], ['local', 'AI 在做（本机）'], ['runner', '运行机在做'], ['unclaimed', '待认领']])
    const kanban = within(flow).getByRole('table', { name: '需求流动看板' })
    expect(kanban.style.getPropertyValue('--br-lanes')).toBe('5')
    expect(flow.querySelectorAll('.br-merged-cell')).toHaveLength(1)
    const cell = (key: string) => flowCard(flow, key).closest('[data-col]') as HTMLElement
    expect([cell('PAY-22').dataset.col, cell('PAY-22').dataset.lane]).toEqual(['构建', 'unclaimed'])
    expect([cell('PAY-20').dataset.col, cell('PAY-20').dataset.lane]).toEqual(['构建', 'local'])
    expect([cell('PAY-24').dataset.col, cell('PAY-24').dataset.lane]).toEqual(['构建', 'approve'])
    expect(flowCard(flow, 'PAY-23')).toBeNull() // merged into its big one: no card of its own
    expect(flow.querySelector('[data-col="已合并"] [data-key="PAY-23"]')).toBeNull()
    expect(flowCard(flow, 'PAY-22')).toHaveClass('br-kfree')
    expect(flowCard(flow, 'PAY-22')).toHaveTextContent('还没人认领')
    expect(within(flow).getByTestId('flow-stats')).toHaveTextContent('进行中 8 个·等人批准 5·等人回答 1·AI 在本机做 2·运行机在做 0·待认领 1')
    expect(flow.querySelector('.cto-kb-h:nth-of-type(4)')).toHaveTextContent('构建5')
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
    ]
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const table = await screen.findByTestId('req-table')
    const rows = screen.getAllByTestId('eval-family')
    expect(rows.map((r) => r.getAttribute('data-family'))).toEqual(['PAY-20', 'PAY-40'])
    const chips = (r: HTMLElement) => Array.from(r.querySelectorAll('.br-batch-chip')).map((c) => c.textContent)
    expect(rows[0]).toHaveTextContent('大需求 PAY-20')
    expect(within(rows[0]).getByText('小需求在做')).toHaveClass('br-chip', 'tone-info')
    expect(chips(rows[0])).toEqual(['已合并1/4', '判断点上3', '判断点外1', '问题2', 'credits40.2'])
    expect(rows[0].querySelector('[data-n="merged"]')).toHaveAttribute('title', '小需求：PAY-21、PAY-22、PAY-23、PAY-24')
    expect(within(rows[1]).getByText('小需求都合进了，等发布')).toHaveClass('tone-wait')
    expect(chips(rows[1])).toEqual(['已合并1/1', '判断点上1', '判断点外0', '问题0', 'credits—'])
    // next to the batch rows: after the metrics, before 要复看 and 跳过; not requirement rows
    const order = Array.from(table.querySelectorAll('tr.br-batch')).map((r) => r.getAttribute('data-testid'))
    expect(order).toEqual(['eval-batch', 'eval-family', 'eval-family', 'eval-queue', 'eval-skipped'])
    expect(keysOf(table)).toEqual(ALL_KEYS)
    await user.click(within(rows[0]).getByRole('button', { name: 'PAY-20' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-20', from: 'overview' })
    await user.click(within(rows[1]).getByRole('button', { name: 'PAY-40' })) // no repo: the queue rows' way
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-40', from: 'overview' })
  })

  test('交付方式 and the 无人值守 legend: ended (why, in brain-kit’s words), the run’s state when it says more, 停住了, the delivery in the title', async () => {
    const user = userEvent.setup()
    const ov = splitOverview()
    const run = (over: Partial<CtoRun> & { key: string }): CtoRun => ({ repo: 'r1', how: 'pending', beyond: [], at_points: 0, outside: 0, credits: null, merged_at: null,
      state: null, state_label: '', stuck: null, delivery: null, delivery_label: '', parent: null, ...over })
    const runs = ov.cto.runs
    Object.assign(runs.find((r) => r.key === 'PAY-4') as CtoRun, { state: 'answered', state_label: '有了回答、run 没接着做', stuck: true, delivery: 'open', delivery_label: '还没合并' })
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
    expect(how('PAY-4')).toHaveTextContent('还没评人 2停住了')
    expect(within(how('PAY-4')).getByText('停住了')).toHaveClass('br-chip', 'tone-warn')
    expect(within(how('PAY-4')).getByTestId('how-state')).toHaveTextContent('有了回答、run 没接着做')
    expect(within(how('PAY-23')).getByTestId('how-state')).toHaveTextContent('已合进大需求')
    expect(within(how('PAY-2')).queryByTestId('how-state')).toBeNull() // 已合并 says nothing the how does not
    expect(how('PAY-2')).toHaveAttribute('title', '交付：对 · 判断点之外：回答问题')
    expect(how('PAY-5')).not.toHaveAttribute('title') // nothing known beyond the how
    const card = screen.getByRole('article', { name: '无人值守' })
    const legend = card.querySelector('.cto-legend') as HTMLElement
    expect(Array.from(legend.querySelectorAll('[data-how]')).map((s) => s.textContent)).toEqual(['无人值守0', '有人插手1', '还没评3', '本机做完0', '没交付就结束1'])
    expect(legend.querySelector('[data-how="ended"]')).toHaveAttribute('title', '没交付就结束：运行机没能开始，或 MR 关了没合并')
    expect(within(card).getByRole('img', { name: '评估过的交接：无人值守 0，有人插手 1；还没评 3，本机做完 0，没交付就结束 1' })).toBeInTheDocument()
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
    expect(Array.from(flow.querySelectorAll('.cto-lane')).map((l) => l.getAttribute('data-lane'))).toEqual(['approve', 'answer', 'local', 'runner'])
    expect(within(flow).getByRole('table', { name: '需求流动看板' }).style.getPropertyValue('--br-lanes')).toBe('4')
    expect(within(flow).getByTestId('flow-stats')).not.toHaveTextContent('待认领')
    expect(flow.querySelector('[data-testid="flow-family"], [data-testid="flow-parent"], .br-kfree')).toBeNull()
    const table = screen.getByTestId('req-table')
    expect(table.querySelectorAll('tr.br-kid, .br-fam-toggle')).toHaveLength(0)
    expect(screen.queryAllByTestId('eval-family')).toHaveLength(0)
    const card = screen.getByRole('article', { name: '无人值守' })
    expect(Array.from(card.querySelectorAll('.cto-legend [data-how]')).map((s) => s.getAttribute('data-how'))).toEqual(['unattended', 'people', 'pending', 'local'])
    expect(within(card).queryByTestId('ov-ended')).toBeNull()
    // runs before 0d52e97 (no state, no delivery): the how alone, as before
    expect(rowOf(table, 'PAY-4').querySelector('.br-how-cell [data-testid]')).toBeNull()
  })
})
