import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError } from '../test/stubs/app-sdk'
import { OverviewView, WHO_VOCAB } from './Overview'
import type { ViewProps } from './props'

function props(over: Partial<ViewProps> = {}): ViewProps {
  return { status: fx.status(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn(), pollMs: 60_000, ...over }
}

describe('交付总览', () => {
  test('every requirement is a row: key, title, owner, state, Lean stage, what it waits on, credits, MR, badges', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const table = await screen.findByTestId('req-table')
    expect(within(table).getAllByRole('row')).toHaveLength(1 + fx.overview().rows.length)
    const pay3 = table.querySelector('tr[data-key="PAY-3"]') as HTMLElement
    expect(pay3).toHaveTextContent('退款单导出 CSV')
    expect(pay3).toHaveTextContent('alice')
    expect(pay3).toHaveTextContent('本地开发中')
    expect(pay3).toHaveTextContent('9/11代码生成')
    expect(within(pay3).getByText('approve PLAN 5d1e7a90')).toHaveClass('br-mono')
    expect(pay3).toHaveTextContent('12.4')
    expect(pay3).toHaveTextContent('和 PAY-4 重叠')
    const pay4 = table.querySelector('tr[data-key="PAY-4"]') as HTMLElement
    expect(pay4).toHaveTextContent('D-2 待答')
    const mr = within(pay4).getByRole('link', { name: /!41/ })
    expect(mr).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/41')
    expect(mr).toHaveAttribute('target', '_blank')
    expect(apiCalls[0]).toMatchObject({ method: 'GET', path: `${API}/overview?repo=all` })
    // a repo the backend could not read says why
    expect(screen.getByText(/shop-web：不是 brain-kit 仓库/)).toBeInTheDocument()
  })

  test('the Lean cell: n/total and the stage; 下一步 for the next stage to do, 做完 when Lean is finished, 0/11 还没开始', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const table = await screen.findByTestId('req-table')
    const cell = (key: string) => within(table.querySelector(`tr[data-key="${key}"]`) as HTMLElement).getByTestId('lean-cell')
    expect(cell('PAY-3')).toHaveTextContent(/^9\/11代码生成$/) // started: no hint
    expect(within(cell('PAY-3')).queryByTestId('lean-hint')).toBeNull()
    expect(cell('PAY-7')).toHaveTextContent(/^10\/11构建和测试下一步$/)
    expect(within(cell('PAY-7')).getByTestId('lean-hint')).toHaveClass('br-hint')
    expect(cell('PAY-2')).toHaveTextContent(/^11\/11发布做完$/)
    expect(cell('PAY-6')).toHaveTextContent(/^0\/11还没开始$/)
    expect(within(cell('PAY-6')).queryByTestId('lean-hint')).toBeNull()
  })

  test('a key opens its 需求详情; the overlap block names both and what they share', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const table = await screen.findByTestId('req-table')
    await user.click(within(table).getByRole('button', { name: 'PAY-4' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-4', from: 'overview' })
    const overlaps = screen.getByTestId('overlaps')
    expect(overlaps).toHaveTextContent('PAY-3和PAY-4都要改src/refund/')
  })

  test('the state chips filter the rows and say it in the URL entry; the repo select asks the backend for that repo', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    await screen.findByTestId('req-table')
    const chips = screen.getByTestId('state-filter')
    expect(within(chips).getByRole('button', { name: '全部 6' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(chips).getByRole('button', { name: '停下等回答 1' }))
    expect(p.replace).toHaveBeenLastCalledWith({ kind: 'overview', state: 'parked' })
    const table = screen.getByTestId('req-table')
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(table.querySelector('tr[data-key="PAY-4"]')).not.toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: '仓库' }), 'r1')
    expect(p.replace).toHaveBeenLastCalledWith({ kind: 'overview', repo: 'r1', state: 'parked' })
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/overview?repo=r1`)).toBe(true))
    // a repo that cannot be read cannot be picked
    expect(screen.getByRole('option', { name: 'shop-web（读不到）' })).toBeDisabled()
  })

  test('opened with a state in the URL, only those rows show', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{ state: 'acceptance' }} {...props()} />)
    const table = await screen.findByTestId('req-table')
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(table.querySelector('tr[data-key="PAY-5"]')).not.toBeNull()
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

  test('the eval card: rates as a/b and %, a number, 「还没有数」; its queue opens the requirement', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<OverviewView entry={{}} {...p} />)
    const card = await screen.findByTestId('eval-card')
    expect(card.querySelector('[data-metric="autonomy"]')).toHaveTextContent('2/3 · 67%')
    expect(card.querySelector('[data-metric="staleness"]')).toHaveTextContent('2')
    expect(card.querySelector('[data-metric="credits_per_success"]')).toHaveTextContent('还没有数')
    const queue = within(card).getByTestId('eval-queue')
    expect(queue).toHaveTextContent('验收被驳回 1 次；判断点之外有人介入 2 次')
    await user.click(within(queue).getByRole('button', { name: 'PAY-4' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-4', from: 'overview' })
  })

  test('the eval card lists the runs brain-kit could not read (not counted) and its notes; none, no lines', async () => {
    installFixtureRoutes()
    const { unmount } = render(<OverviewView entry={{}} {...props()} />)
    const card = await screen.findByTestId('eval-card')
    expect(within(card).getByTestId('eval-skipped')).toHaveTextContent('跳过 PAY-1（读不了，不算）：runs/PAY-1/run.json 不是合法的 JSON：第 3 行')
    const notes = Array.from(within(card).getByTestId('eval-notes').querySelectorAll('p'))
    expect(notes.map((n) => n.textContent)).toEqual(fx.overview().eval.notes)
    expect(notes[0]).toHaveClass('br-hint')
    unmount()
    const ov = fx.overview()
    ov.eval.skipped = []
    ov.eval.notes = []
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    const plain = await screen.findByTestId('eval-card')
    expect(within(plain).queryByTestId('eval-skipped')).toBeNull()
    expect(within(plain).queryByTestId('eval-notes')).toBeNull()
  })

  test('without the evaluate module the card says so (or says its error)', async () => {
    const ov = fx.overview()
    ov.eval = { available: false, error: '', ref: null, metrics: [], queue: [], skipped: [], notes: [] }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    const { unmount } = render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByTestId('eval-card')).toHaveTextContent('brain-kit 还没有 evaluate 模块')
    unmount()
    const ov2 = fx.overview()
    ov2.eval = { available: false, error: 'evaluate 读 main 失败：没有 runs/', ref: null, metrics: [], queue: [], skipped: [], notes: [] }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov2 })
    render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByTestId('eval-card')).toHaveTextContent('evaluate 读 main 失败：没有 runs/')
  })

  test('the decision funnel: one bar per row, and the questions asked / answered / delivered', async () => {
    installFixtureRoutes()
    render(<OverviewView entry={{}} {...props()} />)
    const card = await screen.findByTestId('funnel-card')
    expect(card.querySelectorAll('.br-barrow')).toHaveLength(6)
    expect(card.querySelector('[data-row="person"]')).toHaveTextContent('人4')
    expect(card.querySelector('[data-row="unclassified"]')).toHaveTextContent('没归类（Who 不是规定的写法）1')
    expect(card.querySelector('[data-row="unknown"]')).toHaveTextContent('看不出（Who 空着）1')
    expect(card).toHaveTextContent('共 15 个决定')
    expect(within(card).getByTestId('funnel-questions')).toHaveTextContent('问人 4 次 · 答了 3 · 送回运行 2')
  })

  test('the funnel lists the unclassified decisions where they are, with one line on how Who is written; none, no list', async () => {
    installFixtureRoutes()
    const { unmount } = render(<OverviewView entry={{}} {...props()} />)
    const list = await screen.findByTestId('funnel-unclassified')
    expect(within(list).getByRole('listitem')).toHaveTextContent('没归类：PAY-4 D-3（aidlc-docs/261105-merchant-split/decisions.md#L11）')
    expect(within(list).getByText(WHO_VOCAB)).toHaveClass('br-hint')
    expect(WHO_VOCAB).toBe('Who 要写 agent、brain <条目号>、check、<化名> <凭证号> 或 owner')
    unmount()
    const ov = fx.overview()
    ov.funnel.unclassified = []
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => ov })
    render(<OverviewView entry={{}} {...props()} />)
    await screen.findByTestId('funnel-card')
    expect(screen.queryByTestId('funnel-unclassified')).toBeNull()
    expect(screen.queryByText(WHO_VOCAB)).toBeNull()
  })

  test('an overview that cannot be read shows errorText', async () => {
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => { throw apiError(500, 'scan_failed', '读仓库失败：r1 不是 git 仓库') } })
    render(<OverviewView entry={{}} {...props()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('读仓库失败：r1 不是 git 仓库（500）')
  })
})
