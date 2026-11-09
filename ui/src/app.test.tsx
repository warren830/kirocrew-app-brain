import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import BrainApp from './main'
import { AppBar } from './AppBar'
import { parseView } from './nav'
import { fx } from './test/data'
import { API, installFixtureRoutes } from './test/routes'
import { apiCalls, apiError, badges, navigations } from './test/stubs/app-sdk'

const bar = () => within(screen.getByTestId('br-appbar'))

describe('the app: one bar over the views', () => {
  test('it opens on 交付总览; the bar has the name once, the tabs, the 待办 count, and 设置', async () => {
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    expect(await screen.findByTestId('req-table')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Brain')
    expect(bar().getByRole('tab', { name: '交付总览' })).toHaveAttribute('aria-selected', 'true')
    expect(bar().getAllByRole('tab').map((t) => t.textContent)).toEqual(['交付总览', '需求详情', '开需求', 'Brain', '待办6'])
    expect(bar().getByRole('tab', { name: '需求详情' })).toBeDisabled() // no requirement in hand yet
    expect(await bar().findByRole('tab', { name: '待办 6' })).toBeInTheDocument()
    expect(badges).toContain(6) // the sidebar badge
    expect(bar().getByRole('button', { name: '设置' })).toBeInTheDocument()
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

  test('a key opens 需求详情 (from=overview); its tab then holds it; ← back returns to the overview', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    const table = await screen.findByTestId('req-table')
    await user.click(within(table).getByRole('button', { name: 'PAY-3' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'item', repo: 'r1', key: 'PAY-3', from: 'overview' })
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/requirements/r1/PAY-3`)).toBe(true))
    expect(bar().getByRole('tab', { name: '需求详情' })).toHaveAttribute('aria-selected', 'true')
    await user.click(bar().getByRole('tab', { name: '开需求' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'new', repo: 'r1' })
    await user.click(bar().getByRole('tab', { name: '需求详情' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'item', repo: 'r1', key: 'PAY-3' })
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

  test('banner on every view: brain-kit not found → 去设置; KiroCrew FAIL rows with their fix button', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.brainkit.ok = false
    s.brainkit.error = '/Users/alice/src/brain-kit 里没有 brainkit/'
    s.crew.rows = [{ level: 'FAIL', text: '找不到 brain-dev agent：~/.kiro/agents/brain-dev.json 不存在' }, { level: 'OK', text: 'KiroCrew 在跑' }]
    installFixtureRoutes({
      [`GET ${API}/status`]: () => s,
      [`POST ${API}/crew/fix`]: () => ({ ok: true, text: '装好了', rows: [] }),
    })
    render(<BrainApp pollMs={60_000} />)
    const nokit = await screen.findByTestId('br-no-brainkit')
    expect(nokit).toHaveTextContent('找不到 brain-kit（/Users/alice/src/brain-kit 里没有 brainkit/）：')
    const crew = screen.getByTestId('br-crew-fail')
    expect(crew).toHaveTextContent('找不到 brain-dev agent')
    expect(crew).not.toHaveTextContent('KiroCrew 在跑') // only the failing rows
    await user.click(within(crew).getByRole('button', { name: '装上或补全 brain-dev 的 Lean hook' }))
    expect(await within(crew).findByText('装好了')).toBeInTheDocument()
    expect(apiCalls.some((c) => c.method === 'POST' && c.path === `${API}/crew/fix`)).toBe(true)
    await user.click(within(nokit).getByRole('button', { name: '去设置' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'settings' })
    expect(await screen.findByTestId('br-no-brainkit')).toBeInTheDocument() // still there on 设置 …
    expect(within(screen.getByTestId('br-no-brainkit')).queryByRole('button', { name: '去设置' })).toBeNull() // … without the way to it
  })

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
    expect(within(screen.getByRole('combobox', { name: '仓库' })).getByRole('option', { name: 'shop-web（等合并）' })).toBeDisabled()
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
