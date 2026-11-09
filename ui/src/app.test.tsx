import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import BrainApp, { pickRequirement } from './main'
import { AppBar } from './AppBar'
import { parseView, type View } from './nav'
import { fx } from './test/data'
import { API, installFixtureRoutes } from './test/routes'
import { apiCalls, apiError, badges, navigations } from './test/stubs/app-sdk'

const bar = () => within(screen.getByTestId('br-appbar'))
const FIX = '补上 brain-dev 的 Lean hook'
/** the ledger's row of *key* on 交付总览 */
const ledgerRow = async (key: string) => {
  const table = await screen.findByTestId('req-table')
  const row = table.querySelector<HTMLElement>(`tr[data-key="${key}"]`)
  expect(row).not.toBeNull()
  return row as HTMLElement
}

describe('the app: one bar over the views', () => {
  test('it opens on 交付总览; the bar has the name once, the tabs, the 待办 count, and 设置', async () => {
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    expect(await screen.findByTestId('req-table')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Brain')
    expect(bar().getByRole('tab', { name: '交付总览' })).toHaveAttribute('aria-selected', 'true')
    expect(bar().getAllByRole('tab').map((t) => t.textContent)).toEqual(['交付总览', '需求详情', '需求看板', '开需求', 'Brain', '待办6'])
    expect(bar().getByRole('tab', { name: '需求详情' })).toBeEnabled() // nothing in hand yet: they still open one
    expect(bar().getByRole('tab', { name: '需求看板' })).toBeEnabled()
    expect(await bar().findByRole('tab', { name: '待办 6' })).toBeInTheDocument()
    expect(badges).toContain(6) // the sidebar badge
    expect(bar().getByRole('button', { name: '设置' })).toBeInTheDocument()
  })

  test('需求看板 with nothing opened yet opens the requirement that waits on you; it is still in hand after a reload', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const want = pickRequirement(fx.overview().rows)
    expect(want?.waits.who).toBe('you')
    const { unmount } = render(<BrainApp pollMs={60_000} />)
    await screen.findByTestId('req-table')
    await user.click(bar().getByRole('tab', { name: '需求看板' }))
    await waitFor(() => expect(parseView(window.location.search)).toMatchObject({ kind: 'board', repo: want!.repo, key: want!.key }))
    unmount()
    window.history.replaceState(null, '', '/apps/brain?view=overview')
    render(<BrainApp pollMs={60_000} />)
    await screen.findByTestId('req-table')
    await user.click(bar().getByRole('tab', { name: '需求详情' }))
    expect(parseView(window.location.search)).toMatchObject({ kind: 'item', repo: want!.repo, key: want!.key })
  })

  test('pickRequirement: waits on you first, else the newest; none when there are no rows', () => {
    const rows = fx.overview().rows
    const r = (key: string, who: string, at: number) => ({ ...rows[0], key, waits: { ...rows[0].waits, who }, updated_at: at }) as typeof rows[0]
    expect(pickRequirement([])).toBeNull()
    expect(pickRequirement([r('A-1', 'agent', 9), r('A-2', 'you', 1), r('A-3', 'you', 5)])?.key).toBe('A-3')
    expect(pickRequirement([r('A-1', 'agent', 9), r('A-2', 'runner', 10)])?.key).toBe('A-2')
  })

  test('运行机 is a tab only in team mode', async () => {
    const s = fx.status()
    s.app.team = true
    installFixtureRoutes({ [`GET ${API}/status`]: () => s })
    render(<BrainApp pollMs={60_000} />)
    expect(await bar().findByRole('tab', { name: '运行机' })).toBeInTheDocument()
  })

  test('the AppBar alone: the selected tab, the count, and no 运行机 outside team mode', () => {
    const views: string[] = []
    render(<AppBar view="todo" onView={(v) => views.push(v)} item="PAY-3" todo={3} team={false} />)
    expect(screen.getByRole('tab', { name: '待办 3' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: '运行机' })).toBeNull()
    expect(screen.getByRole('tab', { name: '需求详情' })).toBeEnabled()
    expect(screen.getByRole('tab', { name: '需求看板' })).toBeEnabled()
    screen.getByRole('tab', { name: 'Brain' }).click()
    screen.getByRole('tab', { name: '待办 3' }).click() // the view it is on: nothing
    expect(views).toEqual(['brain'])
  })

  test('a move to another view is a navigation (history entry); a filter inside a view rewrites the entry', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    await screen.findByTestId('req-table')
    await user.click(within(screen.getByTestId('state-filter')).getByRole('button', { name: '等验收 1' }))
    expect(window.location.search).toBe('?view=overview&state=acceptance')
    expect(navigations).toEqual([])
    await user.click(bar().getByRole('tab', { name: '待办 6' }))
    expect(navigations).toEqual(['/apps/brain?view=todo'])
    expect(parseView(window.location.search)).toEqual({ kind: 'todo' })
    await user.click(bar().getByRole('button', { name: '设置' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'settings' })
    expect(await screen.findByTestId('settings')).toBeInTheDocument()
    // back to 交付总览: its filter comes back with it
    await user.click(bar().getByRole('tab', { name: '交付总览' }))
    expect(window.location.search).toBe('?view=overview&state=acceptance')
  })

  test('详情 on a ledger row opens 需求详情 (from=overview); its tab then holds it; ← 返回 goes back to the overview', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    await user.click(within(await ledgerRow('PAY-3')).getByRole('button', { name: '详情' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'item', repo: 'r1', key: 'PAY-3', from: 'overview' })
    // the requirement, then its board (the value stream)
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/board/r1/PAY-3`)).toBe(true))
    const paths = apiCalls.map((c) => c.path)
    expect(paths.indexOf(`${API}/requirements/r1/PAY-3`)).toBeGreaterThanOrEqual(0)
    expect(paths.indexOf(`${API}/requirements/r1/PAY-3`)).toBeLessThan(paths.indexOf(`${API}/board/r1/PAY-3`))
    const tab = bar().getByRole('tab', { name: /^需求详情/ })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(tab).toHaveTextContent('PAY-3') // the requirement in hand
    await user.click(screen.getByRole('button', { name: '← 返回交付总览' }))
    expect(await screen.findByTestId('req-table')).toBeInTheDocument()
    expect(parseView(window.location.search)).toEqual({ kind: 'overview' })
    expect(bar().getByRole('tab', { name: '交付总览' })).toHaveAttribute('aria-selected', 'true')
    // 需求详情 and 需求看板 hold it from now on
    await user.click(bar().getByRole('tab', { name: '需求详情' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'item', repo: 'r1', key: 'PAY-3' })
    await user.click(bar().getByRole('tab', { name: '开需求' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'new', repo: 'r1' })
    await user.click(bar().getByRole('tab', { name: '需求看板' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'board', repo: 'r1', key: 'PAY-3' })
    expect(await screen.findByTestId('br-board')).toBeInTheDocument()
  })

  test('a ledger row opens 需求看板 (from=overview); 需求详情 then holds the same requirement', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    await user.click(within(await ledgerRow('PAY-5')).getByText('退款回调失败重试'))
    expect(parseView(window.location.search)).toEqual({ kind: 'board', repo: 'r1', key: 'PAY-5', from: 'overview' })
    expect(await screen.findByTestId('br-board')).toBeInTheDocument()
    expect(bar().getByRole('tab', { name: /^需求看板/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(bar().getByRole('tab', { name: '需求详情' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'item', repo: 'r1', key: 'PAY-5' })
  })

  test('back and forward show the view the entry says', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    await screen.findByTestId('req-table')
    await user.click(bar().getByRole('tab', { name: '待办 6' }))
    expect(await screen.findByTestId('br-todo')).toBeInTheDocument()
    window.history.back()
    expect(await screen.findByTestId('req-table')).toBeInTheDocument()
    expect(bar().getByRole('tab', { name: '交付总览' })).toHaveAttribute('aria-selected', 'true')
  })

  test('banner on every view: brain-kit not found → 去设置; KiroCrew FAIL rows with their fix button, but not on 开需求 and 设置, which list them', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.app.team = true
    s.brainkit.ok = false
    s.brainkit.error = '/Users/alice/src/brain-kit 里没有 brainkit/'
    s.crew.rows = [{ level: 'FAIL', text: '找不到 brain-dev agent：~/.kiro/agents/brain-dev.json 不存在' }, { level: 'OK', text: 'KiroCrew 在跑' }]
    installFixtureRoutes({
      [`GET ${API}/status`]: () => s,
      [`GET ${API}/crew`]: () => ({ ...fx.crew(), rows: s.crew.rows }),
      [`POST ${API}/crew/fix`]: () => ({ ok: true, text: '装好了', rows: [] }),
    })
    render(<BrainApp pollMs={60_000} />)
    const nokit = await screen.findByTestId('br-no-brainkit')
    expect(nokit).toHaveTextContent('找不到 brain-kit（/Users/alice/src/brain-kit 里没有 brainkit/）在设置里写对它的位置。')
    const crew = screen.getByTestId('br-crew-fail')
    expect(crew).toHaveTextContent('KiroCrew 这边有 1 件要先处理')
    expect(crew).toHaveTextContent('找不到 brain-dev agent')
    expect(crew).not.toHaveTextContent('KiroCrew 在跑') // only the failing rows
    await user.click(within(crew).getByRole('button', { name: FIX }))
    expect(await within(crew).findByText('装好了')).toBeInTheDocument()
    expect(apiCalls.some((c) => c.method === 'POST' && c.path === `${API}/crew/fix`)).toBe(true)
    await user.click(within(nokit).getByRole('button', { name: '去设置' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'settings' })
    expect(await screen.findByTestId('br-no-brainkit')).toBeInTheDocument() // still there on 设置 …
    expect(within(screen.getByTestId('br-no-brainkit')).queryByRole('button', { name: '去设置' })).toBeNull() // … without the way to it
    // 设置 and 开需求 list KiroCrew's rows themselves, with the fix: no banner over them
    expect(screen.queryByTestId('br-crew-fail')).toBeNull()
    const card = screen.getByRole('region', { name: 'KiroCrew' })
    expect(card).toHaveTextContent('找不到 brain-dev agent')
    expect(within(card).getByRole('button', { name: FIX })).toBeInTheDocument()
    await user.click(bar().getByRole('tab', { name: '开需求' }))
    const checks = await screen.findByRole('region', { name: 'KiroCrew 的检查' })
    expect(checks).toHaveTextContent('找不到 brain-dev agent')
    expect(within(checks).getByRole('button', { name: FIX })).toBeInTheDocument()
    expect(screen.queryByTestId('br-crew-fail')).toBeNull()
    expect(within(screen.getByTestId('br-no-brainkit')).getByRole('button', { name: '去设置' })).toBeInTheDocument()
    // every other view has the banner
    const others: [View['kind'], () => Promise<void>][] = [
      ['todo', () => user.click(bar().getByRole('tab', { name: '待办 6' }))],
      ['brain', () => user.click(bar().getByRole('tab', { name: 'Brain' }))],
      ['team', () => user.click(bar().getByRole('tab', { name: '运行机' }))],
      ['import', () => user.click(bar().getByRole('button', { name: '导入仓库' }))],
      ['overview', () => user.click(bar().getByRole('tab', { name: '交付总览' }))],
      ['item', async () => user.click(within(await ledgerRow('PAY-3')).getByRole('button', { name: '详情' }))],
      ['board', () => user.click(bar().getByRole('tab', { name: '需求看板' }))],
    ]
    for (const [kind, open] of others) {
      await open()
      expect(parseView(window.location.search).kind).toBe(kind)
      expect(screen.getByTestId('br-crew-fail')).toHaveTextContent('找不到 brain-dev agent')
      expect(screen.getByTestId('br-no-brainkit')).toBeInTheDocument()
    }
  }, 20_000)

  test('导入仓库 is on the bar of every view; with no repo the overview and 开需求 are one big way in', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.repos = []
    installFixtureRoutes({ [`GET ${API}/status`]: () => s })
    render(<BrainApp pollMs={60_000} />)
    const cta = await screen.findByTestId('import-cta')
    expect(cta).toHaveTextContent('还没有仓库')
    expect(screen.queryByTestId('req-table')).toBeNull()
    await user.click(within(cta).getByRole('button', { name: '导入仓库' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'import' })
    expect(await screen.findByTestId('br-import')).toBeInTheDocument()
    expect(bar().getByRole('button', { name: '导入仓库' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(bar().getByRole('tab', { name: '开需求' }))
    const cta2 = await screen.findByTestId('import-cta')
    expect(cta2).toHaveTextContent('开需求之前，先导入一个仓库')
    expect(screen.queryByRole('form', { name: '开需求' })).toBeNull()
    await user.click(bar().getByRole('button', { name: '设置' }))
    expect(within(await screen.findByRole('region', { name: '仓库' })).getByText('还没有仓库：点「导入仓库」。')).toBeInTheDocument()
    await user.click(bar().getByRole('button', { name: '导入仓库' }))
    expect(navigations.at(-1)).toBe('/apps/brain?view=import')
  })

  test('a repo whose brain-kit is only on the install branch is said above the overview, not as an error', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.repos[1] = { ...s.repos[1], error: '', pending: fx.importInspectPending().pending }
    const ov = fx.overview()
    ov.errors = []
    installFixtureRoutes({ [`GET ${API}/status`]: () => s, [`GET ${API}/overview*`]: () => ov })
    render(<BrainApp pollMs={60_000} />)
    const note = await screen.findByTestId('repo-pending')
    expect(note).toHaveTextContent('shop-web：安装在 brain/install 分支上，合并后生效。推送并开 MR（在「导入仓库」里），合并以后就能用了')
    expect(note).toHaveAttribute('role', 'status') // a note, not an alert
    expect(note).toHaveAttribute('data-repo', 'r2')
    // its repo pill says it waits for the merge, and cannot be picked yet
    const pill = within(await screen.findByRole('navigation', { name: '仓库' })).getByRole('button', { name: /^shop-web/ })
    expect(pill).toHaveTextContent('shop-web等合并')
    expect(pill).toBeDisabled()
    await user.click(within(note).getByRole('button', { name: '去导入仓库' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'import', path: '/Users/alice/workplace/shop-web' })
    expect(await screen.findByLabelText('仓库目录')).toHaveValue('/Users/alice/workplace/shop-web')
  })

  test('a status that cannot be read is a banner with errorText', async () => {
    installFixtureRoutes({ [`GET ${API}/status`]: () => { throw apiError(403, 'forbidden', '只接受 dashboard 主人本人的请求') } })
    render(<BrainApp pollMs={60_000} />)
    expect(await screen.findByText('读不到 app 的状态：只接受 dashboard 主人本人的请求（403）')).toBeInTheDocument()
  })
})
