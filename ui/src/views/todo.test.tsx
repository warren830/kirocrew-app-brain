import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { apiCalls, badges, navigations } from '../test/stubs/app-sdk'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { TYPE_IT_YOURSELF } from '../ui'
import type { ViewProps } from './props'
import { TEAM_SENTENCE, TodoView } from './Todo'

function renderTodo(over: Partial<ViewProps> = {}) {
  const go = vi.fn()
  const reloadStatus = vi.fn()
  render(<TodoView status={fx.status()} go={go} replace={vi.fn()} reloadStatus={reloadStatus} setStatus={vi.fn()} pollMs={60_000} {...over} />)
  return { go, reloadStatus }
}

const group = (name: string) => screen.getByRole('region', { name })

describe('待办', () => {
  beforeEach(() => installFixtureRoutes())

  test('items are grouped by kind, in order, under Chinese headings', async () => {
    renderTodo()
    await screen.findByRole('region', { name: 'Lean 审批' })
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(
      ['Lean 审批', '运行机上的问题', '本地澄清', '等验收', '接手被拒', '没交出去的交接', 'KiroCrew 的问题'])
    // one card per item; KiroCrew's problems are its checks' rows, with their fixes
    expect(screen.getAllByTestId('todo-item')).toHaveLength(6)
    expect(screen.queryByText(TEAM_SENTENCE)).toBeNull()
    expect(group('接手被拒')).toHaveTextContent('run.json 的 brain_commit 不在 main 上')
    expect(within(group('接手被拒')).getByRole('link', { name: '看 MR' })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/46')
    expect(within(group('等验收')).getByRole('link', { name: '去 MR 上验收' })).toHaveAttribute('target', '_blank')
    // pushed, but the MR carries no hand-over label (brain handoff exits 1 then): nothing was handed over
    const unlabelled = group('没交出去的交接')
    expect(unlabelled).toHaveTextContent('MR 上没有交接标签 ai-handoff：什么也没交出去')
    expect(within(unlabelled).getByRole('link', { name: '看 MR' })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/52')
    expect(badges).toEqual([]) // the shell sets the badge from /status, not this view
  })

  test('the count as a card: one cell per item, and each kind with its count jumps to its group', async () => {
    renderTodo()
    const count = await screen.findByTestId('todo-count')
    expect(count).toHaveTextContent('7件')
    expect(within(count).getByRole('img')).toHaveAccessibleName('Lean 审批 1，运行机上的问题 1，本地澄清 1，等验收 1，接手被拒 1，没交出去的交接 1，KiroCrew 的问题 1')
    expect(Array.from(count.querySelectorAll('.td-cells i')).map((i) => i.className)).toEqual(['is-wait', 'is-wait', 'is-wait', 'is-wait', 'is-bad', 'is-warn', 'is-bad'])
    const jumps = within(screen.getByRole('navigation', { name: '待办的种类' })).getAllByRole('button')
    expect(jumps.map((b) => b.textContent)).toEqual(['Lean 审批 1', '运行机上的问题 1', '本地澄清 1', '等验收 1', '接手被拒 1', '没交出去的交接 1', 'KiroCrew 的问题 1'])
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView)
    scroll.mockClear()
    fireEvent.click(jumps[4])
    expect(scroll.mock.contexts[0]).toBe(group('接手被拒'))
  })

  test('a card’s border says its state: magenta waits for you, red refused, yellow worth a look', async () => {
    renderTodo()
    await screen.findByRole('region', { name: 'Lean 审批' })
    const card = (name: string) => within(group(name)).getByTestId('todo-item')
    expect(card('Lean 审批')).toHaveClass('is-wait')
    expect(card('本地澄清')).toHaveClass('is-wait')
    expect(card('接手被拒')).toHaveClass('is-bad')
    expect(card('没交出去的交接')).toHaveClass('is-warn')
  })

  test('a key opens its 需求详情 from 待办; a crew item has no key', async () => {
    const { go } = renderTodo()
    await screen.findByRole('region', { name: '运行机上的问题' })
    fireEvent.click(within(group('运行机上的问题')).getByRole('button', { name: 'PAY-4' }))
    expect(go).toHaveBeenCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-4', from: 'todo' })
    // the second way: its 需求看板
    fireEvent.click(within(group('接手被拒')).getByRole('button', { name: '看板' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-7', from: 'todo' })
    const crew = group('KiroCrew 的问题')
    expect(within(crew).queryByRole('button', { name: /^PAY-/ })).toBeNull()
    expect(within(crew).queryByRole('button', { name: '看板' })).toBeNull()
    expect(crew).toHaveTextContent('brain-dev.json 缺 Lean 的 hook')
  })

  test('team mode says answers are given on GitLab', async () => {
    const t = fx.todo()
    t.team = true
    installFixtureRoutes({ [`GET ${API}/todo`]: () => t })
    renderTodo()
    expect(await screen.findByText(TEAM_SENTENCE)).toBeInTheDocument()
  })

  test('a question on the runner links to its MR and has no answer form', async () => {
    renderTodo()
    await screen.findByRole('region', { name: '运行机上的问题' })
    const q = group('运行机上的问题')
    expect(q).toHaveTextContent('D-2')
    expect(q).toHaveTextContent('按商户拆分后，老的合并对账单还要不要保留？')
    expect(within(q).getByRole('link', { name: '去 MR 上回答' })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/41#note_812')
    expect(within(q).queryByRole('form')).toBeNull()
  })

  test('a local clarify question is answered here', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/answer`]: () => ({ ok: true, via: 'session', text: '已送进会话' }) })
    const { reloadStatus } = renderTodo()
    await screen.findByRole('region', { name: '本地澄清' })
    const form = within(group('本地澄清')).getByRole('form')
    expect(form).toHaveTextContent('回答会送进你的本地会话')
    await user.click(within(form).getByRole('radio', { name: /一律 UTC/ }))
    await user.click(within(form).getByRole('button', { name: '回答' }))
    expect(await within(group('本地澄清')).findByText('已送进会话')).toBeInTheDocument()
    expect(apiCalls.filter((c) => c.method === 'POST')).toEqual([{ method: 'POST', path: `${API}/requirements/r1/PAY-3/answer`, body: { choice: 'B' } }])
    expect(reloadStatus).toHaveBeenCalled()
    expect(screen.getAllByRole('form')).toHaveLength(1) // only the clarify question may be answered here
  })

  test('a Lean approval shows its line to type, copies it and opens the session; it is never sent', async () => {
    renderTodo()
    await screen.findByRole('region', { name: 'Lean 审批' })
    const lean = group('Lean 审批')
    const line = within(lean).getByTestId('type-line')
    expect(within(line).getByText('approve PLAN 5d1e7a90')).toHaveClass('br-mono')
    expect(line).toHaveTextContent(TYPE_IT_YOURSELF)
    fireEvent.click(within(line).getByRole('button', { name: '复制' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('approve PLAN 5d1e7a90'))
    fireEvent.click(within(line).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-3-7f3a'])
    expect(within(lean).queryByRole('form')).toBeNull()
    for (const c of apiCalls) expect(JSON.stringify(c)).not.toContain('approve PLAN')
  })

  test('a crew problem offers the fix the backend can make', async () => {
    installFixtureRoutes({ [`POST ${API}/crew/fix`]: () => ({ ok: true, text: '已重装 brain-dev agent', rows: [{ level: 'OK', text: 'brain-dev agent 是最新的' }] }) })
    const { reloadStatus } = renderTodo()
    await screen.findByRole('region', { name: 'KiroCrew 的问题' })
    const crew = group('KiroCrew 的问题')
    expect(within(crew).queryByRole('button', { name: '把引擎换成 kas' })).toBeNull()
    fireEvent.click(within(crew).getByRole('button', { name: /brain-dev 的 Lean hook/ }))
    expect(await within(crew).findByText('已重装 brain-dev agent')).toBeInTheDocument()
    expect(apiCalls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: `${API}/crew/fix`, body: { what: 'agent' } })
    expect(reloadStatus).toHaveBeenCalled()
  })

  test('重装 kit 文件 in place on a team repo: its group stays while 推送 waits, even when the list no longer has the problem', async () => {
    const user = userEvent.setup()
    const todo = fx.todo()
    const later = { ...todo, items: todo.items.filter((i) => i.kind !== 'crew') }
    const job = fx.importUpgradeJob()
    job.result = { ...job.result!, mode: 'inplace', branch: 'main', base: 'main', worktree: null, target: 'main',
      remote_url: 'git@gitlab.example.com:shop/shop-pay.git', text: '提交在 main 上了，现在就生效。远端还没有它：要推送就点「推送」' }
    let fixed = false
    installFixtureRoutes({
      [`GET ${API}/todo`]: () => (fixed ? later : todo),
      [`POST ${API}/import/choices`]: () => fx.importChoices(),
      [`POST ${API}/import/upgrade`]: () => { fixed = true; return { job } },
    })
    const { reloadStatus } = renderTodo({ pollMs: 20 })
    const crew = await screen.findByRole('region', { name: 'KiroCrew 的问题' })
    await user.click(within(crew).getByRole('button', { name: '重装 kit 文件' }))
    await user.click(await within(crew).findByRole('button', { name: '直接更新在 main' }))
    expect(await within(crew).findByText(job.result!.text)).toBeInTheDocument()
    await waitFor(() => expect(apiCalls.filter((c) => c.path === `${API}/todo`).length).toBeGreaterThan(3))   // reloaded since
    expect(screen.getByRole('region', { name: 'KiroCrew 的问题' })).toBeInTheDocument()
    expect(screen.queryByTestId('todo-empty')).toBeNull()
    await user.click(within(screen.getByTestId('push-box')).getByRole('button', { name: '先不推送' }))
    expect(reloadStatus).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'KiroCrew 的问题' })).toBeNull())
  })

  test('nothing to do says so, and what will show up here', async () => {
    installFixtureRoutes({ [`GET ${API}/todo`]: () => ({ items: [], team: false }) })
    const { go } = renderTodo()
    const hero = await screen.findByTestId('todo-empty')
    expect(within(hero).getByRole('heading', { name: '现在没有等你做的事' })).toBeInTheDocument()
    expect(within(hero).getAllByRole('listitem').map((li) => li.querySelector('b')?.textContent)).toEqual(['1Lean 审批', '2澄清', '3交接', '4运行机的问题', '5验收'])
    expect(screen.queryByTestId('todo-count')).toBeNull()
    fireEvent.click(within(hero).getByRole('button', { name: '看交付总览' }))
    expect(go).toHaveBeenCalledWith({ kind: 'overview' })
  })
})
