import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ItemEntry } from '../nav'
import { apiCalls, apiError, navigations } from '../test/stubs/app-sdk'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { TYPE_IT_YOURSELF } from '../ui'
import { DetailView, MR_DESC_COPY_HINT } from './Detail'
import type { ViewProps } from './props'

const LINE = 'approve PLAN 5d1e7a90'

function renderDetail(entry: ItemEntry = { repo: 'r1', key: 'PAY-3', from: 'overview' }, over: Partial<ViewProps> = {}) {
  const go = vi.fn()
  const onBack = vi.fn()
  const reloadStatus = vi.fn()
  render(<DetailView entry={entry} onBack={onBack} status={fx.status()} go={go} replace={vi.fn()} reloadStatus={reloadStatus} setStatus={vi.fn()} pollMs={60_000} {...over} />)
  return { go, onBack, reloadStatus }
}

/** No request ever carries a Lean approval line (path or body). */
const noLineSent = () => {
  for (const c of apiCalls) expect(JSON.stringify(c)).not.toContain('approve PLAN')
}

const pendingApproval = async () => (await screen.findAllByTestId('approval')).find((a) => a.dataset.state === 'pending')!

describe('需求详情', () => {
  beforeEach(() => installFixtureRoutes())

  test('header, Lean stages with per-unit chips, approvals and the timeline', async () => {
    renderDetail()
    const head = await screen.findByRole('region', { name: '需求' })
    expect(head).toHaveTextContent('PAY-3')
    expect(head).toHaveTextContent('退款单导出 CSV')
    expect(head).toHaveTextContent('本地开发中')
    expect(head).toHaveTextContent('ai/alice/PAY-3-refund-export')
    expect(head).toHaveTextContent('/Users/alice/workplace/brain-app/PAY-3-refund-export')
    expect(within(screen.getByTestId('detail-waits')).getByText(LINE)).toHaveClass('br-mono')
    expect(screen.getAllByTestId('stage')).toHaveLength(11)
    const lean = screen.getByRole('region', { name: 'Lean 进度' })
    expect(within(lean).getByText('refund-api · 在做')).toBeInTheDocument()
    expect(screen.getAllByTestId('approval').map((a) => a.dataset.state)).toEqual(['approved', 'approved', 'approved', 'pending'])
    expect(screen.getAllByTestId('tl-item')).toHaveLength(7)
    const tl = screen.getByRole('region', { name: '时间线' })
    expect(tl).toHaveTextContent('来自 brain-kit trace')
    expect(tl).toHaveTextContent('这些来源没读到：runnerd')
    expect(screen.getByRole('region', { name: '会话记录' })).toHaveTextContent('refund-api 的代码计划写好了，等批准。')
    expect(apiCalls[0]).toMatchObject({ method: 'GET', path: `${API}/requirements/r1/PAY-3` })
  })

  test('a pending approval shows its line: 复制 copies it, 打开会话 opens the session; nothing sends it', async () => {
    renderDetail()
    const pending = await pendingApproval()
    const line = within(pending).getByTestId('type-line')
    expect(within(line).getByText(LINE)).toBeInTheDocument()
    expect(line).toHaveTextContent(TYPE_IT_YOURSELF)
    fireEvent.click(within(line).getByRole('button', { name: '复制' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LINE))
    expect(await within(line).findByText('已复制')).toBeInTheDocument()
    fireEvent.click(within(line).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-3-7f3a'])
    expect(window.location.search).toBe('?sid=brain-PAY-3-7f3a')
    noLineSent()
  })

  test('the 变更说明: its first line, the whole text folded, 复制 copies the text brain-kit made inert', async () => {
    renderDetail()
    const card = await screen.findByRole('region', { name: '变更说明' })
    const m = fx.detail().mr_desc
    expect(within(card).getByTestId('mr-desc-first')).toHaveTextContent(m.first as string)
    expect(card).toHaveTextContent('由记录生成 · 提交 7d2c9e4a1b30（分支上还没有 runs/PAY-3/MR.md）')
    expect(within(card).getByTestId('mr-desc-text').textContent).toBe(m.text)
    expect(within(card).getByTestId('mr-desc-text').closest('details')).not.toBeNull()   // folded
    fireEvent.click(within(card).getByRole('button', { name: '复制' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(m.text))
    expect(await within(card).findByText('已复制')).toBeInTheDocument()
    expect(card).toHaveTextContent(MR_DESC_COPY_HINT)
    expect(apiCalls.filter((c) => c.method !== 'GET')).toEqual([])          // copying sends nothing
  })

  test('the 变更说明 from runs/<KEY>/MR.md says so; without one, the reason and no 复制', async () => {
    const d = fx.detail()
    d.mr_desc = { ...d.mr_desc, source: 'file' }
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => d })
    const { unmount } = render(<DetailView entry={{ repo: 'r1', key: 'PAY-3' }} status={fx.status()} go={vi.fn()} replace={vi.fn()} reloadStatus={vi.fn()} setStatus={vi.fn()} pollMs={60_000} />)
    expect(await screen.findByRole('region', { name: '变更说明' })).toHaveTextContent('runs/PAY-3/MR.md · 提交 7d2c9e4a1b30')
    unmount()
    const none = fx.detail()
    none.mr_desc = { available: true, text: '', first: null, source: null, path: null, ref: null, error: '还没有 run（只有认领）：开工以后才有变更说明' }
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => none })
    render(<DetailView entry={{ repo: 'r1', key: 'PAY-3' }} status={fx.status()} go={vi.fn()} replace={vi.fn()} reloadStatus={vi.fn()} setStatus={vi.fn()} pollMs={60_000} />)
    const card = await screen.findByRole('region', { name: '变更说明' })
    expect(card).toHaveTextContent('开工以后才有变更说明')
    expect(within(card).queryByRole('button', { name: '复制' })).toBeNull()
    expect(within(card).queryByTestId('mr-desc-text')).toBeNull()
  })

  test('the answer form is there only for a question that may be answered here; it posts the answer', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/answer`]: () => ({ ok: true, via: 'session', text: '已送进会话 brain-PAY-3-7f3a' }) })
    const { reloadStatus } = renderDetail()
    const qs = await screen.findAllByTestId('question')
    expect(qs).toHaveLength(3)
    expect(screen.getAllByRole('form')).toHaveLength(1)
    const [clarify, plan, old] = qs
    expect(within(plan).queryByRole('form')).toBeNull()
    expect(plan).toHaveTextContent('这是 Lean 的审批请求')
    expect(within(plan).queryByRole('button', { name: /批准|approve|reject|拒/ })).toBeNull()
    expect(within(old).queryByRole('form')).toBeNull()
    expect(old).toHaveTextContent('回答：A · alice')
    const form = within(clarify).getByRole('form')
    expect(form).toHaveTextContent('回答会送进你的本地会话')
    const send = within(form).getByRole('button', { name: '回答' })
    expect(send).toBeDisabled()
    await user.click(within(form).getByRole('radio', { name: /商户所在地的时区/ }))
    await user.type(within(form).getByLabelText('补一句（可不填）'), '文件头写时区')
    await user.click(send)
    expect(await within(clarify).findByText('已送进会话 brain-PAY-3-7f3a')).toBeInTheDocument()
    const post = apiCalls.find((c) => c.method === 'POST')!
    expect(post).toEqual({ method: 'POST', path: `${API}/requirements/r1/PAY-3/answer`, body: { choice: 'A', note: '文件头写时区' } })
    expect(reloadStatus).toHaveBeenCalled()
    noLineSent()
  })

  test('a question answered on the MR says so in the form, and the answer names its D-n', async () => {
    const d = fx.detail()
    d.questions[0].answer_via = 'mr'
    d.questions[0].source = 'mr'
    d.questions[0].id = 'D-7'
    installFixtureRoutes({
      [`GET ${API}/requirements/*`]: () => d,
      [`POST ${API}/requirements/r1/PAY-3/answer`]: () => ({ ok: true, via: 'mr', text: '已经发在 MR 上' }),
    })
    renderDetail()
    const [clarify] = await screen.findAllByTestId('question')
    const form = within(clarify).getByRole('form')
    expect(form).toHaveTextContent('回答会以你的 GitLab 身份发在 MR 上')
    fireEvent.click(within(form).getAllByRole('radio')[0])
    fireEvent.click(within(form).getByRole('button', { name: '回答' }))
    await screen.findByText('已经发在 MR 上')
    const post = apiCalls.find((c) => c.method === 'POST' && c.path.endsWith('/answer'))
    expect(post?.body).toEqual({ choice: 'A', id: 'D-7' })
  })

  test('a question without options is answered 同意 / 不同意: the form posts choice approve', async () => {
    const user = userEvent.setup()
    const d = fx.detail()
    d.questions[0].options = []
    d.questions[0].recommend = null
    installFixtureRoutes({
      [`GET ${API}/requirements/*`]: () => d,
      [`POST ${API}/requirements/r1/PAY-3/answer`]: () => ({ ok: true, via: 'session', text: '已送进会话' }),
    })
    renderDetail()
    const [clarify] = await screen.findAllByTestId('question')
    const form = within(clarify).getByRole('form')
    expect(within(form).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['approve', 'reject'])
    expect(within(form).queryByRole('textbox', { name: '你的回答' })).toBeNull()
    expect(within(form).getByRole('button', { name: '回答' })).toBeDisabled()
    await user.click(within(form).getByRole('radio', { name: '不同意（reject）' }))
    await user.click(within(form).getByRole('radio', { name: '同意（approve）' }))
    await user.click(within(form).getByRole('button', { name: '回答' }))
    await within(clarify).findByText('已送进会话')
    expect(apiCalls.find((c) => c.method === 'POST' && c.path.endsWith('/answer'))?.body).toEqual({ choice: 'approve' })
  })

  test('an answered question on the MR waits for the bridge to sign it back; an answered park.json question is just answered', async () => {
    const d = fx.detail()
    d.questions[2].state = 'answered'
    d.questions[1] = { ...d.questions[2], source: 'mr', id: 'D-5', state: 'answered', answer_via: 'mr' }
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => d })
    renderDetail()
    const [, mr, park] = await screen.findAllByTestId('question')
    expect(mr).toHaveTextContent('已收到回答，等桥签名送回')
    expect(park).toHaveTextContent('已回答')
    expect(park).not.toHaveTextContent('等桥签名')
  })

  test('who decided each decision, in brain-kit’s Who vocabulary: a pseudonym, Brain entries, agent, 没归类 (never a name)', async () => {
    renderDetail()
    const decisions = await screen.findByRole('region', { name: '决定' })
    const who = (id: string) => within(decisions).getByText(id).closest('tr')!.children[5] as HTMLElement
    expect(who('D-1')).toHaveTextContent(/^P-PAY-2-1 · Brain$/)
    expect(who('D-2')).toHaveTextContent(/^agent$/)
    expect(who('D-3')).toHaveTextContent(/^P-1A2B · 人$/)
    expect(who('D-4')).toHaveTextContent(/^没归类$/)
    expect(who('D-4')).toHaveAttribute('title', 'Who 不是规定的写法：没归类，也不猜是谁')
    expect(who('D-3')).not.toHaveAttribute('title')
  })

  test('the crumb goes back; a Brain cite opens the Brain view at that entry', async () => {
    const { go, onBack } = renderDetail({ repo: 'r1', key: 'PAY-3', from: 'todo' })
    const crumb = await screen.findByRole('navigation', { name: '位置' })
    await screen.findByRole('region', { name: '决定' })
    fireEvent.click(within(crumb).getByRole('button', { name: '待办' }))
    fireEvent.click(within(crumb).getByRole('button', { name: '← 返回待办' }))
    expect(onBack).toHaveBeenCalledTimes(2)
    const decisions = screen.getByRole('region', { name: '决定' })
    fireEvent.click(within(decisions).getByRole('button', { name: 'P-PAY-2-1' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', id: 'P-PAY-2-1', file: 'PRODUCT' })
    const brain = screen.getByRole('region', { name: '用到的 Brain' })
    fireEvent.click(within(brain).getAllByRole('button', { name: 'T-12' })[0])
    expect(go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', id: 'T-12', file: 'TECH' })
    expect(within(brain).queryByRole('button', { name: 'T-PAY-9-1' })).toBeNull() // not in the Brain: plain text
  })

  test('the sessions list opens a session; with a live session there is no 开会话', async () => {
    renderDetail()
    const sessions = await screen.findByRole('region', { name: '会话' })
    expect(sessions).toHaveTextContent('等批准')
    expect(sessions).toHaveTextContent('brain-dev')
    expect(screen.queryByRole('region', { name: '开会话' })).toBeNull()
    fireEvent.click(within(sessions).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-3-7f3a'])
  })

  test('a local requirement without a live session offers 开会话 with trust and kickoff', async () => {
    const user = userEvent.setup()
    const d = fx.detail()
    d.sessions = []
    installFixtureRoutes({
      [`GET ${API}/requirements/*`]: () => d,
      [`POST ${API}/requirements/r1/PAY-3/session`]: () => ({ ok: true, slot: 'brain-PAY-3-9e1d', url: '/chat?sid=brain-PAY-3-9e1d' }),
    })
    const { reloadStatus } = renderDetail()
    const card = await screen.findByRole('region', { name: '开会话' })
    // no session to open: the pending line is still shown and copied, without 打开会话
    expect(within(await pendingApproval()).queryByRole('button', { name: '打开会话' })).toBeNull()
    expect(within(card).getByRole('checkbox', { name: '这个会话的工具调用不用逐个批准' })).toBeChecked()
    await user.click(within(card).getByRole('checkbox', { name: /开场/ }))
    await user.click(within(card).getByRole('button', { name: '开会话' }))
    expect(await within(card).findByText('会话开好了。')).toBeInTheDocument()
    expect(apiCalls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: `${API}/requirements/r1/PAY-3/session`, body: { trust: true, kickoff: false } })
    expect(reloadStatus).toHaveBeenCalled()
    await user.click(within(card).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-3-9e1d'])
    noLineSent()
  })

  test('no 开会话 for a requirement that is not local', async () => {
    const d = fx.detail()
    d.sessions = []
    d.row.state = 'parked'
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => d })
    renderDetail()
    await screen.findByRole('region', { name: '需求' })
    expect(screen.queryByRole('region', { name: '开会话' })).toBeNull()
  })

  test('an error answer shows errorText', async () => {
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => { throw apiError(404, 'not_found', '没有这个需求') } })
    renderDetail({ repo: 'r1', key: 'PAY-99' })
    expect(await screen.findByRole('alert')).toHaveTextContent('没有这个需求（404）')
    expect(screen.queryByRole('region', { name: '需求' })).toBeNull()
    expect(apiCalls[0].path).toBe(`${API}/requirements/r1/PAY-99`)
  })
})
