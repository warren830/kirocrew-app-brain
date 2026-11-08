import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, navigations } from '../test/stubs/app-sdk'
import type { ViewProps } from './props'
import { TeamPage } from './Team'

function teamStatus() {
  const s = fx.status()
  s.app.team = true
  s.team = fx.team().status
  return s
}
const props = (over: Partial<ViewProps> = {}): ViewProps => ({
  status: teamStatus(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn(), pollMs: 60_000, ...over,
})

describe('运行机', () => {
  test('the loop status, the ledger, the runs with their MRs, and the signer’s pending and refused', async () => {
    installFixtureRoutes()
    render(<TeamPage {...props()} />)
    const runs = await screen.findByRole('region', { name: '运行' })
    expect(runs).toHaveTextContent('RUN-PAY-4-1')
    expect(within(runs).getByRole('link', { name: /!41/ })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/41')
    expect(runs).toHaveTextContent('停下等回答')
    const ledger = screen.getByRole('region', { name: '账本' })
    expect(ledger.querySelector('[data-ledger="handoffs"]')).toHaveTextContent('accepted 4')
    const signer = screen.getByRole('region', { name: '签名' })
    expect(signer).toHaveTextContent('SIG-0042')
    expect(signer).toHaveTextContent('MR 的作者 dave 不在 decision_roles.owner 里')
    expect(screen.getByTestId('signer-same-user')).toHaveTextContent('签名服务和 app 是同一个系统用户')
    expect(screen.getByRole('region', { name: '运行机状态' })).toHaveTextContent('等签名 1 · 拒签 1')
  })

  test('打开会话 opens the run’s session; a key opens the requirement on the runner', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<TeamPage {...p} />)
    const runs = await screen.findByRole('region', { name: '运行' })
    await user.click(within(runs).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-run-PAY-4-1'])
    await user.click(within(runs).getByRole('button', { name: 'PAY-5' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'item', repo: 'runner', key: 'PAY-5' })
  })

  test('现在跑一轮 posts /team/loop and shows its summary', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/team/loop`]: () => ({ ok: true, summary: { handoffs: 1, answers: 2 }, error: '' }) })
    const p = props()
    render(<TeamPage {...p} />)
    await screen.findByRole('region', { name: '运行' })
    await user.click(screen.getByRole('button', { name: '现在跑一轮' }))
    const result = await screen.findByTestId('loop-result')
    expect(result).toHaveTextContent('这一轮跑完了')
    expect(result).toHaveTextContent('answers 2')
    expect(apiCalls.some((c) => c.method === 'POST' && c.path === `${API}/team/loop`)).toBe(true)
    await waitFor(() => expect(p.reloadStatus).toHaveBeenCalled())
  })

  test('not in team mode: it says so and asks for nothing', async () => {
    installFixtureRoutes()
    render(<TeamPage {...props({ status: fx.status() })} />)
    expect(screen.getByText(/这台机器没开团队模式/)).toBeInTheDocument()
    expect(apiCalls.filter((c) => c.path === `${API}/team`)).toHaveLength(0)
  })
})
