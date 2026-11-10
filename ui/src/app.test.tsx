import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import BrainApp, { pickRequirement } from './main'
import { brainkitProblem } from './ui'
import { AppBar } from './AppBar'
import { parseView, type View } from './nav'
import { fx } from './test/data'
import { API, installFixtureRoutes } from './test/routes'
import { apiCalls, apiError, badges, navigations } from './test/stubs/app-sdk'

const bar = () => within(screen.getByTestId('br-appbar'))
const FIX = '补上 Lean 的拦截'
/** the bar's 待办 tab: its count is the number of things on 待办 */
const TODO_N = fx.todo().items.length
const TODO_TAB = `待办 ${TODO_N}`
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
    expect(bar().getAllByRole('tab').map((t) => t.textContent)).toEqual(['交付总览', '需求详情', '需求看板', '开需求', 'Brain', `待办${TODO_N}`])
    expect(bar().getByRole('tab', { name: /^需求详情/ })).toBeEnabled() // nothing in hand yet: they still open one
    expect(bar().getByRole('tab', { name: /^需求看板/ })).toBeEnabled()
    expect(fx.status().counts.todo).toBe(TODO_N)
    expect(await bar().findByRole('tab', { name: TODO_TAB })).toBeInTheDocument()
    expect(badges).toContain(TODO_N) // the sidebar badge
    expect(bar().getByRole('button', { name: '设置' })).toBeInTheDocument()
  })

  test('需求看板 with nothing opened yet opens the requirement that waits on you; it is still in hand after a reload', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const want = pickRequirement(fx.overview().rows)
    expect(want?.waits.who).toBe('you')
    const { unmount } = render(<BrainApp pollMs={60_000} />)
    await screen.findByTestId('req-table')
    await user.click(bar().getByRole('tab', { name: /^需求看板/ }))
    await waitFor(() => expect(parseView(window.location.search)).toMatchObject({ kind: 'board', repo: want!.repo, key: want!.key }))
    unmount()
    window.history.replaceState(null, '', '/apps/brain?view=overview')
    render(<BrainApp pollMs={60_000} />)
    await screen.findByTestId('req-table')
    await user.click(bar().getByRole('tab', { name: /^需求详情/ }))
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
    // the requirement in hand is on both of its tabs, from any view: what they open is said before the click
    expect(screen.getByRole('tab', { name: '需求详情 PAY-3' })).toBeEnabled()
    expect(screen.getByRole('tab', { name: '需求看板 PAY-3' })).toBeEnabled()
    screen.getByRole('tab', { name: 'Brain' }).click()
    screen.getByRole('tab', { name: '待办 3' }).click() // the view it is on: nothing
    expect(views).toEqual(['brain'])
    expect(screen.getByRole('button', { name: '导入仓库' })).toHaveAttribute('title', '本机目录或克隆：先检查它，没装 brain-kit 的直接装上')
  })

  test('a requirement its repo does not have: 需求详情 says so, and the 需求看板 tab says it cannot open it rather than opening it', async () => {
    window.history.replaceState(null, '', '/apps/brain?view=item&repo=r1&key=PAY-99')
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => { throw apiError(404, 'not_found', '没有这个需求') } })
    const user = userEvent.setup()
    render(<BrainApp pollMs={60_000} />)
    expect(await screen.findByTestId('detail-missing')).toBeInTheDocument()
    const tab = bar().getByRole('tab', { name: '需求看板 PAY-99' })
    await waitFor(() => expect(tab).toHaveAttribute('aria-disabled', 'true'))
    expect(tab).toHaveAttribute('title', '没有 PAY-99 这个需求：需求看板打不开')
    await user.click(tab)
    expect(parseView(window.location.search)).toEqual({ kind: 'item', repo: 'r1', key: 'PAY-99' })
    expect(apiCalls.some((c) => c.path.startsWith(`${API}/board/`))).toBe(false)
  })

  test('运行机 opened outside team mode is still the selected tab, greyed, so a person sees where they are', () => {
    render(<AppBar view="team" onView={() => {}} todo={0} team={false} />)
    const tab = screen.getByRole('tab', { name: '运行机' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(tab).toHaveClass('is-off')
    expect(tab).toHaveAttribute('title', '这台机器不是团队运行机')
  })

  test('a move to another view is a navigation (history entry); a filter inside a view rewrites the entry', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    await screen.findByTestId('req-table')
    await user.click(within(screen.getByTestId('state-filter')).getByRole('button', { name: '等验收 1' }))
    expect(window.location.search).toBe('?view=overview&state=acceptance')
    expect(navigations).toEqual([])
    await user.click(bar().getByRole('tab', { name: TODO_TAB }))
    expect(navigations).toEqual(['/apps/brain?view=todo'])
    expect(parseView(window.location.search)).toEqual({ kind: 'todo' })
    await user.click(bar().getByRole('button', { name: '设置' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'settings' })
    expect(await screen.findByTestId('settings')).toBeInTheDocument()
    // back to 交付总览: its filter comes back with it
    await user.click(bar().getByRole('tab', { name: '交付总览' }))
    expect(window.location.search).toBe('?view=overview&state=acceptance')
  })

  test('需求详情 on a ledger row opens 需求详情 (from=overview); its tab then holds it; ← 返回 goes back to the overview', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    await user.click(within(await ledgerRow('PAY-3')).getByRole('button', { name: '需求详情' }))
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
    await user.click(bar().getByRole('tab', { name: /^需求详情/ }))
    expect(parseView(window.location.search)).toEqual({ kind: 'item', repo: 'r1', key: 'PAY-3' })
    await user.click(bar().getByRole('tab', { name: '开需求' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'new', repo: 'r1' })
    await user.click(bar().getByRole('tab', { name: /^需求看板/ }))
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
    await user.click(bar().getByRole('tab', { name: /^需求详情/ }))
    expect(parseView(window.location.search)).toEqual({ kind: 'item', repo: 'r1', key: 'PAY-5' })
  })

  test('切换需求 on 需求详情 and 需求看板 opens another requirement in the same view; ← 返回 still goes where it came from', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    await user.click(within(await ledgerRow('PAY-3')).getByRole('button', { name: '需求详情' }))
    const pick = await screen.findByRole('combobox', { name: '切换需求' })
    expect(pick).toHaveValue(`r1\u0001PAY-3`)
    const keys = within(pick).getAllByRole('option').map((o) => o.textContent?.split(' ')[0])
    expect(keys).toEqual(expect.arrayContaining(fx.overview().rows.map((r) => r.key)))
    await user.selectOptions(pick, `r1\u0001PAY-5`)
    expect(parseView(window.location.search)).toEqual({ kind: 'item', repo: 'r1', key: 'PAY-5', from: 'overview' })
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/requirements/r1/PAY-5`)).toBe(true))
    expect(bar().getByRole('tab', { name: /^需求详情/ })).toHaveTextContent('PAY-5')
    // its board, then another one there
    await user.click(screen.getByRole('button', { name: '需求看板 ↗' }))
    expect(parseView(window.location.search)).toMatchObject({ kind: 'board', repo: 'r1', key: 'PAY-5' })
    const onBoard = await within(await screen.findByTestId('br-board')).findByRole('combobox', { name: '切换需求' })
    await user.selectOptions(onBoard, `r1\u0001PAY-3`)
    expect(parseView(window.location.search)).toEqual({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item' })
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/board/r1/PAY-3`)).toBe(true))
    expect(bar().getByRole('tab', { name: /^需求详情/ })).toHaveAttribute('title', expect.stringContaining('PAY-3'))
  })

  test('back and forward show the view the entry says', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    render(<BrainApp pollMs={60_000} />)
    await screen.findByTestId('req-table')
    await user.click(bar().getByRole('tab', { name: TODO_TAB }))
    expect(await screen.findByTestId('br-todo')).toBeInTheDocument()
    window.history.back()
    expect(await screen.findByTestId('req-table')).toBeInTheDocument()
    expect(bar().getByRole('tab', { name: '交付总览' })).toHaveAttribute('aria-selected', 'true')
  })

  test('no brain-kit: one banner for it on every view but 设置 (where to get it, 去填位置); 设置 says it at its top, and its KiroCrew row points at that card', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.brainkit.ok = false
    s.brainkit.error = '这里没有 brain-kit（找不到 /Users/alice/src/brain-kit/brainkit/__init__.py）'
    // what crewcheck answers without brain-kit: that one row (problems.brainkit_missing)
    s.crew.rows = [{ level: 'FAIL', text: 'brain-kit 没装载', todo: '在「设置」里写对 brain-kit 的位置', fix: null, repo: null, raw: '' }]
    installFixtureRoutes({ [`GET ${API}/status`]: () => s, [`GET ${API}/crew`]: () => ({ ...fx.crew(), rows: s.crew.rows }) })
    render(<BrainApp pollMs={60_000} />)
    const nokit = await screen.findByTestId('br-no-brainkit')
    expect(nokit).toHaveTextContent('找不到 brain-kit做什么在设置的「brain-kit 在哪」写上它的目录，点「保存」；这台机器上还没有的话，先在终端里克隆一份（点「复制」拿命令），再写它的位置')
    expect(within(nokit).getByTestId('cmd-line')).toHaveTextContent('git clone https://github.com/warren830/brain-kit.git ~/brain-kit复制')
    expect(within(nokit).getByText('细节').closest('details')).not.toHaveAttribute('open')
    expect(within(nokit).getByText(s.brainkit.error)).toBeInTheDocument()
    expect(screen.getAllByRole('alert').filter((e) => e.closest('[data-testid=br-banners]'))).toHaveLength(1)
    expect(screen.queryByTestId('br-crew-fail')).toBeNull()                  // one cause, one banner
    await user.click(within(nokit).getByRole('button', { name: '去填位置' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'settings' })
    // 设置 asks for brain-kit's place at its top: no banner over it, and nothing there says to go to 「设置」
    const card = await screen.findByTestId('settings-no-brainkit')
    expect(card).toHaveTextContent('做什么在下面的「brain-kit 在哪」写上它的目录，点「保存」')
    expect(screen.queryByTestId('br-no-brainkit')).toBeNull()
    const crew = screen.getByRole('region', { name: 'KiroCrew' })
    expect(crew).toHaveTextContent('brain-kit 没装载做什么照最上面「找不到 brain-kit」那张卡做')
    expect(screen.getByTestId('br-app')).not.toHaveTextContent('在「设置」里')
    expect(screen.getByTestId('br-app')).not.toHaveTextContent('在设置的')
    for (const open of [() => user.click(bar().getByRole('tab', { name: 'Brain' })), () => user.click(bar().getByRole('button', { name: '导入仓库' })),
      () => user.click(bar().getByRole('tab', { name: '交付总览' }))]) {
      await open()
      expect(await screen.findByTestId('br-no-brainkit')).toBeInTheDocument()
      expect(screen.queryByTestId('br-crew-fail')).toBeNull()
    }
  }, 20_000)

  test('KiroCrew FAIL rows: a banner with their fix button on every view but 开需求, 设置 and 待办, which list them', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.app.team = true
    s.crew.rows = [{ level: 'FAIL', text: '找不到 brain-dev agent：~/.kiro/agents/brain-dev.json 不存在' }, { level: 'OK', text: 'KiroCrew 在跑' }]
    installFixtureRoutes({
      [`GET ${API}/status`]: () => s,
      [`GET ${API}/crew`]: () => ({ ...fx.crew(), rows: s.crew.rows }),
      [`POST ${API}/crew/fix`]: () => ({ ok: true, text: '装好了', rows: [] }),
    })
    render(<BrainApp pollMs={60_000} />)
    const crew = await screen.findByTestId('br-crew-fail')
    expect(crew).toHaveTextContent('KiroCrew 这边有 1 件要先处理')
    expect(crew).toHaveTextContent('找不到 brain-dev agent')
    expect(crew).not.toHaveTextContent('KiroCrew 在跑') // only the failing rows
    await user.click(within(crew).getByRole('button', { name: FIX }))
    expect(await within(crew).findByText('装好了')).toBeInTheDocument()
    expect(apiCalls.some((c) => c.method === 'POST' && c.path === `${API}/crew/fix`)).toBe(true)
    await user.click(bar().getByRole('button', { name: '设置' }))
    // 设置 and 开需求 list KiroCrew's rows themselves, with the fix: no banner over them
    const card = await screen.findByRole('region', { name: 'KiroCrew' })
    expect(screen.queryByTestId('br-crew-fail')).toBeNull()
    expect(card).toHaveTextContent('找不到 brain-dev agent')
    expect(within(card).getByRole('button', { name: FIX })).toBeInTheDocument()
    await user.click(bar().getByRole('tab', { name: '开需求' }))
    const checks = await screen.findByRole('region', { name: 'KiroCrew 的检查' })
    expect(checks).toHaveTextContent('找不到 brain-dev agent')
    expect(within(checks).getByRole('button', { name: FIX })).toBeInTheDocument()
    expect(screen.queryByTestId('br-crew-fail')).toBeNull()
    // 待办 lists them in its KiroCrew group, once
    await user.click(bar().getByRole('tab', { name: TODO_TAB }))
    expect(within(await screen.findByRole('region', { name: 'KiroCrew 的问题' })).getByRole('button', { name: FIX })).toBeInTheDocument()
    expect(screen.queryByTestId('br-crew-fail')).toBeNull()
    // every other view has the banner
    const others: [View['kind'], () => Promise<void>][] = [
      ['brain', () => user.click(bar().getByRole('tab', { name: 'Brain' }))],
      ['team', () => user.click(bar().getByRole('tab', { name: '运行机' }))],
      ['import', () => user.click(bar().getByRole('button', { name: '导入仓库' }))],
      ['overview', () => user.click(bar().getByRole('tab', { name: '交付总览' }))],
      ['item', async () => user.click(within(await ledgerRow('PAY-3')).getByRole('button', { name: '需求详情' }))],
      ['board', () => user.click(bar().getByRole('tab', { name: /^需求看板/ }))],
    ]
    for (const [kind, open] of others) {
      await open()
      expect(parseView(window.location.search).kind).toBe(kind)
      expect(screen.getByTestId('br-crew-fail')).toHaveTextContent('找不到 brain-dev agent')
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
    expect(note).toHaveTextContent('shop-web：装在 brain/install 分支上，还没推送：合进 main 以后生效。推送并开 MR 给团队看；只有你一个人用的话，也可以在本机合并')
    expect(note).toHaveAttribute('role', 'status') // a note, not an alert
    expect(note).toHaveAttribute('data-repo', 'r2')
    // its repo pill says it waits for the merge, and cannot be picked yet
    const pill = within(await screen.findByRole('navigation', { name: '仓库' })).getByRole('button', { name: /^shop-web/ })
    expect(pill).toHaveTextContent('shop-web还没推送')
    expect(pill).toBeDisabled()
    await user.click(within(note).getByRole('button', { name: '去导入仓库' }))
    expect(parseView(window.location.search)).toEqual({ kind: 'import', path: '/Users/alice/workplace/shop-web' })
    expect(await screen.findByLabelText('仓库目录')).toHaveValue('/Users/alice/workplace/shop-web')
  })

  test('a status that cannot be read says why in words and what to do; the backend’s own words are folded', async () => {
    const user = userEvent.setup()
    let fail = true
    installFixtureRoutes({ [`GET ${API}/status`]: () => { if (fail) throw apiError(403, 'forbidden', 'Token required'); return fx.status() } })
    render(<BrainApp pollMs={60_000} />)
    const b = await screen.findByTestId('br-status-error')
    expect(b).toHaveTextContent('登录过期了做什么重新打开 KiroCrew 仪表盘，登录以后点「再试一次」')
    expect(b).not.toHaveTextContent(/Token required.*细节/)              // the host's English only under 细节
    expect(within(b).getByText('细节').closest('details')).not.toHaveAttribute('open')
    expect(b.querySelector('details pre')).toHaveTextContent('API 403: {"error":"Token required","code":"forbidden"}')
    fail = false
    await user.click(within(b).getByRole('button', { name: '再试一次' }))
    await waitFor(() => expect(screen.queryByTestId('br-status-error')).toBeNull())
  })

  test('no answer at all says so in words, with 再试一次; the browser’s own words folded', async () => {
    installFixtureRoutes({ [`GET ${API}/status`]: () => { throw new TypeError('Failed to fetch') } })
    render(<BrainApp pollMs={60_000} />)
    const b = await screen.findByTestId('br-status-error')
    expect(b).toHaveTextContent('连不上 app 的后端做什么KiroCrew 或这个 app 可能停了，网络也可能断了：等一会儿点「再试一次」')
    expect(within(b).getByRole('button', { name: '再试一次' })).toBeInTheDocument()
    expect(b.querySelector('details pre')).toHaveTextContent('Failed to fetch')
  })

  test('brain-kit that cannot be used says its own cause, the same in the banner and in 设置', async () => {
    const old = brainkitProblem('brain-kit 太旧（没有 trace.build）：要 72b278e 或更新的版本', '/Users/alice/src/brain-kit')
    expect(old).toMatchObject({ kind: 'old', text: 'brain-kit 太旧了（位置是对的）', cmd: 'git -C /Users/alice/src/brain-kit pull --ff-only' })
    expect(old.todo).not.toMatch(/72b278e|git/)                                    // the version and the command: not in the words
    const broken = brainkitProblem('brain-kit 导入失败：ModuleNotFoundError: No module named \'yaml\'', '/Users/alice/my kit')
    expect(broken).toMatchObject({ kind: 'broken', text: 'brain-kit 读不进来（位置是对的）', cmd: "git -C '/Users/alice/my kit' pull --ff-only" })
    expect(broken.todo).not.toMatch(/ModuleNotFoundError/)
    expect(brainkitProblem('这里没有 brain-kit（找不到 /x/brainkit/__init__.py）')).toMatchObject({ kind: 'missing', text: '找不到 brain-kit', cmd: 'git clone https://github.com/warren830/brain-kit.git ~/brain-kit' })
    // too old: the banner leads to 设置 (not to its place, which is right) with the line to pull it
    const user = userEvent.setup()
    const s = fx.status()
    s.brainkit = { ...s.brainkit, ok: false, error: 'brain-kit 太旧（没有 sign.SpoolSigner）：要 72b278e 或更新的版本' }
    installFixtureRoutes({ [`GET ${API}/status`]: () => s })
    render(<BrainApp pollMs={60_000} />)
    const b = await screen.findByTestId('br-no-brainkit')
    expect(b).toHaveTextContent('brain-kit 太旧了（位置是对的）做什么在它的目录里拉取最新的代码（点「复制」拿命令），再到设置里点「保存」重新读它')
    expect(within(b).getByTestId('cmd-line')).toHaveTextContent(`git -C ${s.brainkit.path} pull --ff-only`)
    expect(within(b).queryByRole('button', { name: '去填位置' })).toBeNull()
    await user.click(within(b).getByRole('button', { name: '去设置' }))
    expect(within(await screen.findByTestId('settings-no-brainkit')).getByTestId('cmd-line')).toHaveTextContent(`git -C ${s.brainkit.path} pull --ff-only`)
  })
})
