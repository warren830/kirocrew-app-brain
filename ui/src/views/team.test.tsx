import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { fmtIso } from '../format'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, navigations } from '../test/stubs/app-sdk'
import type { ViewProps } from './props'
import { HANDOVER_RESULT, RUN_STATE, TeamPage, handoverMeta, runStateMeta } from './Team'

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
    const ledger = screen.getByRole('region', { name: '账本' })
    expect(ledger.querySelector('[data-ledger="handoffs"]')).toHaveTextContent('已接手 4')
    const signer = screen.getByRole('region', { name: '签名' })
    // what each signature is for, in words (the request id is no one's business)
    expect(signer).toHaveTextContent('回答的凭证')
    expect(signer).toHaveTextContent('交接的合同')
    expect(signer).not.toHaveTextContent('answer')
    expect(signer).not.toHaveTextContent('handoff')
    expect(signer).toHaveTextContent('MR 的作者 dave 不在 decision_roles.owner 里')
    expect(screen.getByTestId('signer-same-user')).toHaveTextContent('签名服务和 app 是同一个系统用户')
    expect(screen.getByTestId('signer-same-user')).toHaveTextContent('做什么正式给团队用之前，让签名服务换成另一个系统用户来跑')
    expect(screen.getByRole('region', { name: '运行机状态' })).toHaveTextContent('等签名 1 · 拒签 1')
  })

  test('runs and the ledger say brain-kit’s run states in words (an unknown one as it is); decision states as on the MR', async () => {
    const tv = fx.team()
    tv.runs[0].state = 'parked_somewhere' as never
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    const runs = await screen.findByRole('region', { name: '运行' })
    const chip = (runId: string) => within(within(runs).getByText(runId).closest('tr') as HTMLElement).getByText(/./, { selector: '.br-chip' })
    expect(chip('RUN-PAY-8-1')).toHaveTextContent('parked_somewhere')
    expect(chip('RUN-PAY-8-1')).toHaveClass('tone-idle')
    expect(chip('RUN-PAY-4-1')).toHaveTextContent('已派给会话')
    expect(chip('RUN-PAY-4-1')).toHaveClass('tone-run')
    expect(chip('RUN-PAY-2-1')).toHaveTextContent('已合并')
    const ledger = screen.getByRole('region', { name: '账本' })
    const line = (k: string) => Array.from(ledger.querySelectorAll(`[data-ledger="${k}"] .tm-leg`)).map((t) => t.textContent)
    expect(line('runs')).toEqual(['签名中 1', '已派给会话 2', '已合并 3'])
    // brain-kit 72b278e: asking, a bridge posting the question right now
    expect(line('decisions')).toEqual(['正在发到 MR 1', '已发出，等回答 1', '已收到回答，等桥签名送回 1', '已送回 4', '签名服务拒签 1', '作废 1'])
    expect(line('handoffs')).toEqual(['已接手 4', '拒绝接手 1'])
    expect(ledger.querySelector('[data-ledger="runs"] .tm-leg')).not.toHaveAttribute('title') // no state's code name on hover
    // each count card: its total (hand-overs: taken of all) and a segment bar by state
    expect(ledger.querySelector('[data-ledger="runs"]')).toHaveTextContent('运行6个')
    expect(within(ledger.querySelector('[data-ledger="runs"]') as HTMLElement).getByRole('img')).toHaveAccessibleName('签名中 1，已派给会话 2，已合并 3')
    expect(ledger.querySelector('[data-ledger="handoffs"]')).toHaveTextContent('交接4/5')
    expect(ledger.querySelector('[data-ledger="signer"]')).toHaveTextContent('签名1等签名')
    expect(ledger.querySelector('[data-ledger="signer"]')).toHaveTextContent('拒签 1 · 上一轮没等到 1')
    // every run state of brain-kit has words
    expect(Object.keys(RUN_STATE).sort()).toEqual(['closed', 'dispatched', 'failed', 'merged', 'ready', 'send_unknown', 'signing', 'spooled'])
    expect(runStateMeta('send_unknown')).toEqual({ label: '送没送到不清楚', tone: 'warn' })
    expect(runStateMeta('signing').label).toBe('签名中')
  })

  test('what the bridge said about each labelled MR last round: waiting and unlabelled are looked at again next round', async () => {
    installFixtureRoutes()
    const { unmount } = render(<TeamPage {...props()} />)
    const ho = await screen.findByRole('region', { name: '交接' })
    const item = (r: string) => ho.querySelector(`[data-result="${r}"]`) as HTMLElement
    expect(item('waiting')).toHaveTextContent('正在别处签名')
    expect(item('waiting')).toHaveTextContent('下一轮再看')
    expect(item('waiting')).toHaveTextContent('9c1d2e3f4a5b')
    expect(within(item('waiting')).getByRole('link', { name: /shop\/shop-pay!48/ })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/48')
    expect(item('unlabelled')).toHaveTextContent('标签刚被拿掉')
    expect(item('unlabelled')).toHaveTextContent('重新交接、再打一次标签时会这样')
    expect(item('error')).toHaveTextContent('这一轮没查成')
    expect(item('error')).toHaveTextContent(fx.team().handovers.find((h) => h.result === 'error')!.error) // its error instead of the hint
    expect(item('error')).not.toHaveTextContent('下一轮再试')
    // on the conveyor: dashed (looked at again next round); the belt ends at the runner, outside the part that scrolls
    expect(item('waiting')).toHaveClass('kt-belt-chip', 'is-pending')
    expect(within(item('waiting')).getByText('正在别处签名')).toHaveClass('kt-pill', 'tone-hand')
    expect(ho.querySelector('.kt-belt-end.is-head')).toHaveTextContent('运行机')
    expect(ho.querySelector('.kt-belt .kt-belt-end')).toBeNull()
    expect(Object.keys(HANDOVER_RESULT).sort()).toEqual(['accepted', 'error', 'rejected', 'seen', 'unlabelled', 'waiting'])
    expect(handoverMeta('later')).toEqual({ label: 'later', tone: 'idle', hint: '' })
    unmount()
    const tv = fx.team()
    tv.handovers = []
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    expect(await screen.findByRole('region', { name: '交接' })).toHaveTextContent('上一轮没有打着交接标签的 MR')
  })

  test('the vouchers the signer did not answer last round are listed (asked for again next round); none, no heading', async () => {
    installFixtureRoutes()
    const { unmount } = render(<TeamPage {...props()} />)
    const signer = await screen.findByRole('region', { name: '签名' })
    expect(within(signer).getByRole('heading', { name: '上一轮没等到签名（下一轮再要同一张凭证）' })).toBeInTheDocument()
    const item = within(within(signer).getByTestId('signer-waiting')).getByRole('listitem')
    expect(item).toHaveTextContent('回答 D-2')
    expect(within(item).getByText('回答的凭证')).toHaveClass('br-tag')
    expect(item).toHaveTextContent('RUN-PAY-4-1')
    expect(item).toHaveTextContent(fmtIso('2026-11-08T21:40:00+08:00'))
    unmount()
    const tv = fx.team()
    tv.signer.waiting = []
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    await screen.findByRole('region', { name: '签名' })
    expect(screen.queryByText(/上一轮没等到签名/)).toBeNull()
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
    expect(p.go).toHaveBeenCalledWith({ kind: 'item', repo: 'runner', key: 'PAY-5', from: 'team' })
  })

  test('现在跑一轮 posts /team/loop and says what the round did, step by step in words', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/team/loop`]: () => ({ ok: true, summary: { poll: 2, prepared: 0, dispatch: 1, watch: 1, collect: 0, reconcile: 0 }, error: '' }) })
    const p = props()
    render(<TeamPage {...p} />)
    await screen.findByRole('region', { name: '运行' })
    await user.click(screen.getByRole('button', { name: '现在跑一轮' }))
    const result = await screen.findByTestId('loop-result')
    expect(result).toHaveTextContent('这一轮跑完了')
    expect(within(result).getAllByText(/ 个$/).map((t) => t.textContent)).toEqual(['看了 MR 2 个', '准备好工作区 0 个', '派给会话 1 个', '看了会话 1 个', '收回结果 0 个', '对了账 0 个'])
    expect(result).not.toHaveTextContent('poll')
    expect(apiCalls.some((c) => c.method === 'POST' && c.path === `${API}/team/loop`)).toBe(true)
    await waitFor(() => expect(p.reloadStatus).toHaveBeenCalled())
  })

  test('a round that failed a step says which, in words, what to do, and folds the error', async () => {
    const tv = fx.team()
    tv.status.loop_error = 'poll: GitLab 401 Unauthorized；collect: [Errno 2] No such file or directory'
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    const err = await screen.findByTestId('loop-error')
    expect(err).toHaveTextContent('上一轮有一步没成：看 MR、收结果')
    expect(err).toHaveTextContent('做什么下一轮会自动再试')
    expect(within(err).getByText(tv.status.loop_error).closest('details')).not.toHaveAttribute('open')
  })

  test('not in team mode: it says so, how a runner works, the way to 设置, and asks for nothing', async () => {
    installFixtureRoutes()
    const p = props({ status: fx.status() })
    render(<TeamPage {...p} />)
    const hero = screen.getByTestId('team-off')
    expect(within(hero).getByText(/这台机器没开团队模式/)).toBeInTheDocument()
    for (const word of ['bridge.json', 'runnerd', 'brain-run']) expect(hero).not.toHaveTextContent(word)
    expect(within(hero).getAllByRole('listitem')).toHaveLength(5)
    await userEvent.setup().click(within(hero).getByRole('button', { name: '去设置' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'settings' })
    expect(apiCalls.filter((c) => c.path === `${API}/team`)).toHaveLength(0)
  })
})
