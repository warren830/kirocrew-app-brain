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
      ['Lean 审批', '运行机上的问题', '本地澄清', '等验收', '接手被拒', 'KiroCrew 的问题'])
    expect(screen.getAllByTestId('todo-item')).toHaveLength(6)
    expect(screen.queryByText(TEAM_SENTENCE)).toBeNull()
    expect(group('接手被拒')).toHaveTextContent('run.json 的 brain_commit 不在 main 上')
    expect(within(group('接手被拒')).getByRole('link', { name: '看 MR' })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/46')
    expect(within(group('等验收')).getByRole('link', { name: '去 MR 上验收' })).toHaveAttribute('target', '_blank')
    expect(badges).toEqual([]) // the shell sets the badge from /status, not this view
  })

  test('a key opens its 需求详情 from 待办; a crew item has no key', async () => {
    const { go } = renderTodo()
    await screen.findByRole('region', { name: '运行机上的问题' })
    fireEvent.click(within(group('运行机上的问题')).getByRole('button', { name: 'PAY-4' }))
    expect(go).toHaveBeenCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-4', from: 'todo' })
    const crew = group('KiroCrew 的问题')
    expect(within(crew).queryByRole('button', { name: /^PAY-/ })).toBeNull()
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
    fireEvent.click(within(crew).getByRole('button', { name: '装上或补全 brain-dev 的 Lean hook' }))
    expect(await within(crew).findByText('已重装 brain-dev agent')).toBeInTheDocument()
    expect(apiCalls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: `${API}/crew/fix`, body: { what: 'agent' } })
    expect(reloadStatus).toHaveBeenCalled()
  })

  test('nothing to do says so', async () => {
    installFixtureRoutes({ [`GET ${API}/todo`]: () => ({ items: [], team: false }) })
    renderTodo()
    expect(await screen.findByText('现在没有等你做的事。')).toBeInTheDocument()
  })
})
