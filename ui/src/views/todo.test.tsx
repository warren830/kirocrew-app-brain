import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { apiCalls, badges, navigations } from '../test/stubs/app-sdk'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import type { ChildStartResult, Todo, TodoItem } from '../types'
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

  // ---------------------------------------------------------------- 大需求拆成小需求

  const SINCE = fx.overview().at - 600
  const item = (over: Partial<TodoItem>): TodoItem => ({
    kind: 'child_start', repo: 'r1', key: 'PAY-3', title: '在订单页看到退款状态', text: 'PAY-1 的单元 web：你认领了，依赖都合进来了：可以开工',
    line: null, approval: null, mr_url: null, question: null, session: null, since: SINCE, ...over,
  })
  const CHILD = item({})
  const PARENT = item({ kind: 'parent_release', key: 'PAY-1', title: '退款大需求', text: 'PAY-1 的 3 个小需求都合并了：评审、发布（lean verify、lean release，再批 RELEASE）' })
  const withFamily = (): Todo => {
    const t = fx.todo()
    t.items = [...t.items, CHILD, PARENT]
    return t
  }
  test('a closed requirement whose branch or MR is still there: its own group, yellow, after 没交出去的交接', async () => {
    const left = item({ kind: 'closed_leftover', key: 'PAY-9', title: '旧的退款导出',
      text: '需求关了，分支 ai/alice/PAY-9-x 还在：用不着就删掉分支（本地 git branch -D ai/alice/PAY-9-x；远端 git push origin --delete ai/alice/PAY-9-x）' })
    installFixtureRoutes({ [`GET ${API}/todo`]: () => { const t = fx.todo(); t.items = [...t.items, left]; return t } })
    renderTodo()
    await screen.findByRole('region', { name: '关了的需求还留着分支或 MR' })
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(names.indexOf('关了的需求还留着分支或 MR')).toBe(names.indexOf('没交出去的交接') + 1)
    const g = group('关了的需求还留着分支或 MR')
    expect(g).toHaveTextContent('git branch -D ai/alice/PAY-9-x')
    expect(within(g).getByTestId('todo-item')).toHaveClass('is-warn')
  })

  const STARTED: ChildStartResult = {
    ok: true, key: 'PAY-3', branch: 'ai/alice/PAY-3-web', worktree: '/Users/alice/.brain/worktrees/shop-pay/PAY-3', on: null, text: '开工了：PAY-3',
    blocked: [], can_on: null, problem: null, output: 'Started PAY-3', slot: 'brain-PAY-3-a1b2', url: '/chat?sid=brain-PAY-3-a1b2', session_error: '',
  }

  test('two family groups in the waiting ones: 可以开工的小需求 and 等评审、发布的大需求; the counter card and its jumps count them', async () => {
    installFixtureRoutes({ [`GET ${API}/todo`]: () => withFamily() })
    const { go } = renderTodo()
    await screen.findByRole('region', { name: '可以开工的小需求' })
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(
      ['Lean 审批', '运行机上的问题', '本地澄清', '等验收', '可以开工的小需求', '等评审、发布的大需求', '接手被拒', '没交出去的交接', 'KiroCrew 的问题'])
    const count = screen.getByTestId('todo-count')
    expect(count).toHaveTextContent('9件')
    expect(Array.from(count.querySelectorAll('.td-cells i')).map((i) => i.className)).toEqual(
      ['is-wait', 'is-wait', 'is-wait', 'is-wait', 'is-wait', 'is-wait', 'is-bad', 'is-warn', 'is-bad'])
    const jumps = within(screen.getByRole('navigation', { name: '待办的种类' })).getAllByRole('button')
    expect(jumps.map((b) => b.textContent)).toContain('可以开工的小需求 1')
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView)
    scroll.mockClear()
    fireEvent.click(within(screen.getByRole('navigation', { name: '待办的种类' })).getByRole('button', { name: '等评审、发布的大需求 1' }))
    expect(scroll.mock.contexts[0]).toBe(group('等评审、发布的大需求'))

    const kid = group('可以开工的小需求')
    expect(kid).toHaveTextContent('你认领了，依赖都合进来了')
    expect(within(kid).getByTestId('todo-item')).toHaveClass('is-wait')
    expect(within(kid).getByRole('button', { name: '开工' })).toHaveClass('is-primary')
    const big = group('等评审、发布的大需求')
    expect(big).toHaveTextContent('PAY-1 的 3 个小需求都合并了：评审、发布')
    expect(within(big).queryByRole('button', { name: '开工' })).toBeNull()
    const board = within(big).getByRole('button', { name: '看板' })
    expect(board).toHaveClass('is-primary')
    fireEvent.click(board)
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-1', from: 'todo' })
  })

  test('开工 posts start with its session; the answer (打开会话) stays when the list no longer has the item', async () => {
    const user = userEvent.setup()
    let started = false
    installFixtureRoutes({
      [`GET ${API}/todo`]: () => (started ? fx.todo() : withFamily()),
      [`POST ${API}/requirements/r1/PAY-3/start`]: () => { started = true; return STARTED },
    })
    const { reloadStatus } = renderTodo()
    const kid = await screen.findByRole('region', { name: '可以开工的小需求' })
    await user.click(within(kid).getByRole('button', { name: '开工' }))
    expect(await within(group('可以开工的小需求')).findByTestId('fam-start-result')).toHaveTextContent('开工了：PAY-3')
    expect(apiCalls.filter((c) => c.method === 'POST')).toEqual([{ method: 'POST', path: `${API}/requirements/r1/PAY-3/start`, body: { open_session: true } }])
    expect(reloadStatus).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('region', { name: '等评审、发布的大需求' })).toBeNull())   // the list was read again
    const out = within(group('可以开工的小需求')).getByTestId('fam-start-result')
    expect(out).toHaveTextContent('ai/alice/PAY-3-web')
    expect(within(group('可以开工的小需求')).queryByRole('button', { name: '开工' })).toBeNull()
    expect(screen.getByTestId('todo-count')).toHaveTextContent('7件')   // it no longer waits on you
    await user.click(within(out).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-3-a1b2'])
  })

  test('a start brain-kit refused says why, with brain start’s output; 开工 stays', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({
      [`GET ${API}/todo`]: () => withFamily(),
      [`POST ${API}/requirements/r1/PAY-3/start`]: () => ({ ...STARTED, ok: false, branch: null, worktree: null, url: null, slot: null, text: '没开成',
        problem: { level: 'FAIL', text: '设了 AIDLC_LEAN_TEAM，和单元对不上', todo: '先 unset AIDLC_LEAN_TEAM' }, output: 'AIDLC_LEAN_TEAM=api does not match unit web' }),
    })
    renderTodo()
    const kid = await screen.findByRole('region', { name: '可以开工的小需求' })
    await user.click(within(kid).getByRole('button', { name: '开工' }))
    const out = await within(group('可以开工的小需求')).findByTestId('fam-start-result')
    expect(out).toHaveClass('is-bad')
    expect(within(out).getByTestId('check-rows')).toHaveTextContent('设了 AIDLC_LEAN_TEAM，和单元对不上做什么先 unset AIDLC_LEAN_TEAM')
    expect(within(out).getByText('brain start 的输出')).toBeInTheDocument()
    expect(within(group('可以开工的小需求')).getByRole('button', { name: '开工' })).toBeEnabled()
  })
})

