import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ItemEntry } from '../nav'
import { apiCalls, apiError, navigations } from '../test/stubs/app-sdk'
import { fmtCredits } from '../format'
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
    expect(apiCalls.find((c) => !c.path.startsWith(`${API}/overview`))).toMatchObject({ method: 'GET', path: `${API}/requirements/r1/PAY-3` })
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

  test('the crumb and ← 返回 go back; a Brain cite opens the Brain view at that entry', async () => {
    const { go, onBack } = renderDetail({ repo: 'r1', key: 'PAY-3', from: 'todo' })
    const crumb = await screen.findByRole('navigation', { name: '位置' })
    await screen.findByRole('region', { name: '决定' })
    expect(crumb).toHaveTextContent('待办›PAY-3')
    fireEvent.click(within(crumb).getByRole('button', { name: '待办' }))
    fireEvent.click(screen.getByRole('button', { name: '← 返回待办' }))   // beside 需求看板 ↗, no longer in the crumb
    expect(onBack).toHaveBeenCalledTimes(2)
    const decisions = screen.getByRole('region', { name: '决定' })
    fireEvent.click(within(decisions).getByRole('button', { name: 'P-PAY-2-1' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', id: 'P-PAY-2-1', file: 'PRODUCT' })
    const brain = screen.getByRole('region', { name: '用到的 Brain' })
    fireEvent.click(within(brain).getAllByRole('button', { name: 'T-12' })[0])
    expect(go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', id: 'T-12', file: 'TECH' })
    expect(within(brain).getByText('T-PAY-9-1')).toBeInTheDocument()
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
    expect(apiCalls.find((c) => !c.path.startsWith(`${API}/overview`))?.path).toBe(`${API}/requirements/r1/PAY-99`)
  })

  test('价值流: the board’s time as parts in order (quiet stretches left out), its moments under it; a part opens the board', async () => {
    const { go } = renderDetail()
    const card = await screen.findByRole('region', { name: '价值流' })
    expect(apiCalls.map((c) => c.path).filter((p) => !p.startsWith(`${API}/overview`))).toEqual([`${API}/requirements/r1/PAY-3`, `${API}/board/r1/PAY-3`])
    // board.json: the local session works with three waits for a person between (REQUIREMENTS, DESIGN, then the
    // question running into the pending PLAN, one part); the gaps after each approval have nothing recorded
    const parts = ['AI 在本机做 31 分钟', '等人 21 分钟', 'AI 在本机做 41 分钟', '等人 25 分钟', 'AI 在本机做 25 小时 35 分', '等人 20 分钟']
    const band = within(card).getByRole('img')
    expect(band).toHaveAttribute('aria-label', '价值流：' + parts.join('，'))
    expect(within(card).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(parts)
    expect(card).toHaveTextContent('从开工到此刻，记下的 27 小时 53 分')
    // the moments: approvals and the question, not the requests, stages or commits
    for (const t of ['你批准了需求', '你批准了设计', '停下问你：澄清']) expect(band).toHaveTextContent(t)
    expect(band).not.toHaveTextContent('请你批准')
    expect(band).not.toHaveTextContent('提交')
    fireEvent.click(within(card).getByRole('button', { name: '等人 21 分钟' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item' })
  })

  test('a board that does not come is silent: no 价值流, no error, the cards say the board has not come', async () => {
    installFixtureRoutes({ [`GET ${API}/board/*`]: () => { throw apiError(503, 'unavailable', '看板读不到') } })
    renderDetail()
    await screen.findByRole('region', { name: 'Lean 进度' })
    await waitFor(() => expect(apiCalls.map((c) => c.path)).toContain(`${API}/board/r1/PAY-3`))
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })   // let the failed board answer land
    expect(within(screen.getByRole('article', { name: '时间花在哪' })).getByText('看板的数据还没来')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '检查' })).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('region', { name: '价值流' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/看板读不到/)).toBeNull()
  })

  test('the Lean card: the 11 stages in order, each its number, name, state and units; only the pending approval has the line to type', async () => {
    renderDetail()
    const lean = await screen.findByRole('region', { name: 'Lean 进度' })
    const d = fx.detail()
    const STATE: Record<string, string> = { done: '做完', skipped: '跳过', started: '在做', todo: '没开始' }
    const cells = within(within(lean).getByRole('list', { name: '11 个阶段' })).getAllByTestId('stage')
    expect(cells).toHaveLength(11)
    cells.forEach((cell, i) => {
      const s = d.lean.stages[i]
      expect(cell.dataset.state).toBe(s.state)
      expect(cell).toHaveTextContent(`${s.n} · ${STATE[s.state]}`)
      expect(cell).toHaveTextContent(s.label)
      for (const u of s.units) expect(cell).toHaveTextContent(`${u.unit} · ${STATE[u.state]}`)
      expect(cell).toHaveAttribute('title', s.note ?? STATE[s.state])
    })
    expect(lean).toHaveTextContent(`做完或跳过 ${d.row.lean.done}/${d.row.lean.total} 个阶段`)
    const rows = within(within(lean).getByRole('list', { name: '审批' })).getAllByTestId('approval')
    expect(rows).toHaveLength(d.lean.approvals.length)
    rows.forEach((row, i) => {
      const a = d.lean.approvals[i]
      expect(row).toHaveTextContent(a.kind)
      expect(row).toHaveTextContent(a.state === 'pending' ? '等你批' : '已批准')
      if (a.sha8) expect(row).toHaveTextContent(a.sha8)
      if (a.path) expect(row).toHaveTextContent(a.path)
      expect(within(row).queryByTestId('type-line') !== null).toBe(a.state === 'pending')
    })
    const line = within(lean).getByTestId('type-line')   // the one line, on the pending PLAN
    expect(within(line).getByText(LINE)).toHaveClass('br-mono')
    expect(line).toHaveTextContent(TYPE_IT_YOURSELF)
    expect(within(line).getByRole('button', { name: '打开会话' })).toBeInTheDocument()   // the live local session
    noLineSent()
  })

  test('决定: each decision with its stage, why and vouchers; every Brain cite opens the Brain view at that entry', async () => {
    const { go } = renderDetail()
    const card = await screen.findByRole('region', { name: '决定' })
    const ds = fx.detail().decisions
    expect(card).toHaveTextContent(`decisions.md · ${ds.length} 条 · 人定了 ${ds.filter((d) => d.by === 'person').length} 条`)
    const FILE: Record<string, string> = { P: 'PRODUCT', T: 'TECH' }
    let clicks = 0
    for (const d of ds) {
      const row = within(card).getByText(d.id).closest('tr')!
      expect(row.children[0]).toHaveAttribute('title', d.src)
      expect(row).toHaveTextContent(d.text)
      expect(row).toHaveTextContent(d.stage!)
      expect(row).toHaveTextContent(d.why!)
      for (const v of d.vouchers) expect(within(row).getByText(v).tagName).toBe('CODE')
      const cites = row.children[6] as HTMLElement
      if (d.cites.length === 0) expect(cites).toHaveTextContent(/^—$/)
      for (const c of d.cites) {
        fireEvent.click(within(cites).getByRole('button', { name: c }))
        expect(go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', id: c, file: FILE[c[0]] })
        clicks++
      }
    }
    expect(clicks).toBe(ds.flatMap((d) => d.cites).length)
    expect(go).toHaveBeenCalledTimes(clicks)
  })

  test('a decision cite that is not a Brain entry id stays plain text: no button, no markup', async () => {
    const d = fx.detail()
    d.decisions[0].cites = ['javascript:alert(1)', '<img src=x onerror=alert(1)>', 'P-PAY-2-1']
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => d })
    const { go } = renderDetail()
    const card = await screen.findByRole('region', { name: '决定' })
    const cites = within(card).getByText('D-1').closest('tr')!.children[6] as HTMLElement
    expect(within(cites).getAllByRole('button').map((b) => b.textContent)).toEqual(['P-PAY-2-1'])
    expect(within(cites).getByText('javascript:alert(1)').tagName).toBe('SPAN')
    expect(within(cites).getByText('<img src=x onerror=alert(1)>').tagName).toBe('SPAN')
    expect(card.querySelector('img, a')).toBeNull()
    fireEvent.click(within(cites).getByText('javascript:alert(1)'))
    expect(go).not.toHaveBeenCalled()
  })

  test('问题和回答: how many, each question as asked with its kind and state, the options where there is no form; none says so', async () => {
    const { unmount } = render(<DetailView entry={{ repo: 'r1', key: 'PAY-3' }} status={fx.status()} go={vi.fn()} replace={vi.fn()} reloadStatus={vi.fn()} setStatus={vi.fn()} pollMs={60_000} />)
    const card = await screen.findByRole('region', { name: '问题和回答' })
    const qs = fx.detail().questions
    expect(card).toHaveTextContent(`${qs.length} 个 · 能在这里回答的才有回答框`)
    const shown = within(card).getAllByTestId('question')
    expect(shown).toHaveLength(qs.length)
    shown.forEach((el, i) => {
      expect(el).toHaveTextContent(qs[i].question!)
      expect(el).toHaveTextContent(qs[i].kind_label)
      expect(el).toHaveTextContent('本地会话')   // park.json
    })
    const [clarify, plan, old] = shown
    expect(clarify).toHaveTextContent('等回答')
    expect(within(clarify).getByText(qs[0].refs[0])).toBeInTheDocument()
    expect(plan).toHaveTextContent('等回答')
    expect(old).toHaveTextContent('已送回')
    const opts = within(within(old).getByRole('list', { name: '选项' })).getAllByRole('listitem')
    expect(opts.map((o) => o.textContent)).toEqual(qs[2].options.map((o) => `${o.id} ${o.text}${o.id === qs[2].recommend ? '推荐' : ''}`))
    expect(within(clarify).queryByRole('list', { name: '选项' })).toBeNull()   // its options are the form's
    unmount()
    const none = fx.detail()
    none.questions = []
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => none })
    renderDetail()
    const empty = await screen.findByRole('region', { name: '问题和回答' })
    expect(empty).toHaveTextContent('0 个')
    expect(empty).toHaveTextContent('没有问过人。')
    expect(within(empty).queryByTestId('question')).toBeNull()
  })

  test('变更说明 复制 the clipboard refuses says so; copying sends nothing', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'))
    renderDetail()
    const card = await screen.findByRole('region', { name: '变更说明' })
    fireEvent.click(within(card).getByRole('button', { name: '复制' }))
    expect(await within(card).findByRole('status')).toHaveTextContent('没复制成：请展开全文手动选中')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(fx.detail().mr_desc.text)
    expect(within(card).queryByText('已复制')).toBeNull()
    expect(apiCalls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  test('会话: each session with its state, where it runs, agent, credits and turns; the total and where credits come from', async () => {
    const d = fx.detail()
    const runner = { ...d.sessions[0], slot: 'brain-PAY-3-run1', title: 'PAY-3 运行机', kind: 'runner' as const, agent: 'brain-runner', credits: 3.5, turns: 4, awaiting: false, error: '会话断了', url: '/chat?sid=brain-PAY-3-run1' }
    d.sessions.push(runner)
    d.credits.total = 15.9
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => d })
    renderDetail()
    const card = await screen.findByRole('region', { name: '会话' })
    const [local, run] = within(card).getAllByTestId('session')
    const s = d.sessions[0]
    for (const t of [s.title, '等批准', '本机', s.agent, `credits ${fmtCredits(s.credits)}`, `${s.turns} 轮`]) expect(local).toHaveTextContent(t)
    for (const t of [runner.title, '出错', '运行机', runner.agent, 'credits 3.5', '4 轮', '会话断了']) expect(run).toHaveTextContent(t)
    expect(card).toHaveTextContent('这个 app 开的 · 合计 15.9 credits')
    expect(card).toHaveTextContent(d.credits.note)
    fireEvent.click(within(run).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual([runner.url])
  })

  test('需求看板 ↗ and the cards’ board links go to this requirement’s board; no 回放 before it is merged', async () => {
    const { go } = renderDetail()
    await screen.findByRole('region', { name: '价值流' })
    const toBoard = { kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item' }
    fireEvent.click(screen.getByRole('button', { name: '需求看板 ↗' }))
    expect(go).toHaveBeenLastCalledWith(toBoard)
    fireEvent.click(within(screen.getByRole('article', { name: '检查' })).getByRole('button', { name: '在需求看板的检查墙上看每一项' }))
    const legend = within(screen.getByRole('article', { name: '时间花在哪' })).getAllByRole('button')
    expect(legend.map((b) => b.title)).toEqual(['在需求看板上看', '在需求看板上看'])   // AI 在本机做, 等人
    for (const b of legend) fireEvent.click(b)
    expect(go).toHaveBeenCalledTimes(4)
    for (const [v] of go.mock.calls) expect(v).toEqual(toBoard)
    expect(screen.queryByRole('button', { name: /回放/ })).toBeNull()
  })

  test('a merged requirement offers ▶ 回放 ↗: its board with the replay', async () => {
    const d = fx.detail()
    d.row.state = 'merged'
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => d, [`GET ${API}/board/*`]: () => fx.boardMerged() })
    const { go } = renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: '▶ 回放 ↗' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item', replay: true })
  })
})
