import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import BrainApp from '../main'
import { colOf, laneOf } from '../cto/Flow'
import { searchOf } from '../nav'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError, navigations } from '../test/stubs/app-sdk'
import { OverviewView, WHO_VOCAB } from './Overview'
import type { ViewProps } from './props'

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
    expect(screen.getByRole('img', { name: '评估过的交接：无人值守 0，有人插手 1；还没评 2，本机做完 0' })).toBeInTheDocument()
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
    ov.eval = { available: false, error: '', ref: null, metrics: [], queue: [], skipped: [], notes: [] }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const { unmount } = render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByTestId('eval-batch')).toHaveTextContent('brain-kit 还没有 evaluate 模块')
    expect(screen.queryByTestId('eval-queue')).toBeNull()
    unmount()
    const ov2 = fx.overview()
    ov2.eval = { available: false, error: 'evaluate 读 main 失败：没有 runs/', ref: null, metrics: [], queue: [], skipped: [], notes: [] }
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
