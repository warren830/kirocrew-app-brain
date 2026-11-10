import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ItemEntry } from '../nav'
import { apiCalls, apiError, navigations } from '../test/stubs/app-sdk'
import { fmtCredits, fmtTime } from '../format'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import type { Question, RequirementDetail } from '../types'
import { TYPE_IT_YOURSELF } from '../ui'
import { DetailView, MR_DESC_COPY_HINT } from './Detail'
import type { ViewProps } from './props'

const LINE = 'approve PLAN 5d1e7a90'
const AT = fx.board().at
const MR = 'https://gitlab.example.com/pay/shop-pay/-/merge_requests/44'

function renderDetail(entry: ItemEntry = { repo: 'r1', key: 'PAY-3', from: 'overview' }, over: Partial<ViewProps> = {}) {
  const go = vi.fn()
  const onBack = vi.fn()
  const reloadStatus = vi.fn()
  render(<DetailView entry={entry} onBack={onBack} status={fx.status()} go={go} replace={vi.fn()} reloadStatus={reloadStatus} setStatus={vi.fn()} pollMs={60_000} {...over} />)
  return { go, onBack, reloadStatus }
}

/** The fixture detail changed, served with *more* routes (installFixtureRoutes replaces all overrides at once). */
const withDetail = (change: (d: RequirementDetail) => void, more: Parameters<typeof installFixtureRoutes>[0] = {}) => {
  const d = fx.detail()
  change(d)
  installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => d, ...more })
  return d
}

/** No request ever carries a Lean approval line (path or body). */
const noLineSent = () => {
  for (const c of apiCalls) expect(JSON.stringify(c)).not.toContain('approve PLAN')
}

const pendingApproval = async () => (await screen.findAllByTestId('approval')).find((a) => a.dataset.state === 'pending')!
const now = () => screen.getByRole('region', { name: '此刻' })

const mrQuestion = (over: Partial<Question>): Question => ({
  source: 'mr', id: 'D-3', kind: 'acceptance', kind_label: '验收', question: '验收：回调失败后最多重试 5 次', options: [], recommend: null,
  lean_request: 'RELEASE 0c9a7e21', refs: [], state: 'open', answer: null, answerer: null, voucher_id: null, mr_url: MR, at: AT - 3600,
  answerable_here: false, answer_via: null, ...over,
})

/** PAY-3 handed over and waiting for its acceptance (RELEASE) on the MR. */
const handedOver = (d: RequirementDetail) => {
  d.row.state = 'acceptance'
  d.run!.handoff = { requested_at: '2026-11-08T10:00:00+08:00', by: 'alice' }
  d.row.waits = { who: 'you', text: '等你验收：在 MR 上回答 D-3', line: null, raw: '', do: 'accept', since: AT - 7200, where: 'mr' }
  d.lean.approvals[3] = { ...d.lean.approvals[3], kind: 'RELEASE', line: 'approve RELEASE 0c9a7e21', path: null }
  d.questions = [mrQuestion({})]
  d.timeline.missing = ['桥的账本（这台机器上没有：交接以后的问答在 MR 上看）', 'CI 流水线（在 GitLab 上，这里读不到）']
}

describe('需求详情', () => {
  beforeEach(() => installFixtureRoutes())

  test('the head: title, key, state, whose and where in words; the facts without code names (those are under 细节)', async () => {
    renderDetail()
    const head = await screen.findByRole('region', { name: '需求' })
    for (const t of ['PAY-3', '退款单导出 CSV', '本地开发中', 'alice 的需求 · 在这台机器上做', 'ai/alice/PAY-3-refund-export']) expect(head).toHaveTextContent(t)
    const facts = head.querySelector('dl.br-detail-facts') as HTMLElement
    expect(facts).toHaveTextContent('工作目录/Users/alice/workplace/brain-app/PAY-3-refund-export')
    // the branch, like a path, breaks only after a 「/」: each part whole (DETAIL-24)
    const branch = within(facts).getByTitle('ai/alice/PAY-3-refund-export')
    expect([...branch.querySelectorAll(':scope > span > span')].map((x) => x.textContent)).toEqual(['ai', '/alice', '/PAY-3-refund-export'])
    expect(facts).toHaveTextContent('Lean 记录aidlc-docs/261107-refund-export/')
    expect(facts).toHaveTextContent('MR还没有：交接时开')
    expect(facts).toHaveTextContent('来自产品需求')
    expect(facts).toHaveTextContent('带进来的文档1 份')
    expect(facts).toHaveTextContent('Brain 版本 3f9c2a1b')
    const raw = within(facts).getByText('细节').closest('details')!
    expect(raw).toHaveTextContent('.brain-materials/PKG-PAY-3-1')
    expect(raw).toHaveTextContent('261107-refund-export')
    for (const code of ['PKG-', 'intent', 'product', '工作区']) expect(facts.textContent!.replace(raw.textContent!, '')).not.toContain(code)
  })

  test('a repo done only on this machine says there is no MR; the 开工 fact and 周期 are the same time (brain start, not the claim)', async () => {
    withDetail((d) => { d.row.local_only = true })
    renderDetail()
    const head = await screen.findByRole('region', { name: '需求' })
    expect(head).toHaveTextContent('这个仓库只在本机做，没有 MR')
    expect(within(head).getByTestId('detail-local-only')).toHaveTextContent('这个仓库只在本机做')
    const start = fx.board().events.find((e) => e.kind === 'start')!.at
    const cycle = await screen.findByRole('article', { name: '周期' })
    await waitFor(() => expect(cycle).toHaveTextContent(`${fmtTime(start)} 开工 → 进行中`))
    expect(within(cycle).getByTestId('item-cycle')).toHaveTextContent(/^28 小时$/)   // start → the board's at, 28 h
    expect(head).toHaveTextContent(`开工${fmtTime(start)}`)
  })

  test('此刻 for an approval: who it waits on, the line to type, 复制那一行 and 打开会话 right there; nothing sends it', async () => {
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    expect(bar).toHaveTextContent(`等你${fx.detail().row.waits.text}`)
    expect(bar).not.toHaveTextContent('此刻：')
    expect(within(bar).getByTestId('now-line')).toHaveTextContent(LINE)
    fireEvent.click(within(bar).getByRole('button', { name: '复制那一行' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LINE))
    expect(await within(bar).findByText('已复制')).toBeInTheDocument()
    expect(bar).toHaveTextContent(TYPE_IT_YOURSELF)
    fireEvent.click(within(bar).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-3-7f3a'])
    noLineSent()
  })

  test('此刻 when it is your turn and Lean’s next step is a review: 开审查会话 opens a new session; the line it says folded, 复制那一句', async () => {
    const said = 'Review intent 261107-refund-export against its requirements, design and plans, using the diff, and write construction/build-and-test/review.md.'
    const b = fx.board()
    b.accept.step = { ...b.accept.step, text: '会话空着，轮到你回话。\n先开一个新会话做审查（这个会话写了代码，不能自己审），审查写好再回这个会话接着发布', line: said }
    withDetail((d) => {
      d.row.waits = { who: 'you', text: '构建测试做完了，下一步是发布：先开一个新会话做审查（这个会话写了代码，不能自己审）', line: null, raw: '', do: 'reply', since: AT - 11 * 3600, where: 'session', review: true }
      d.sessions[0].awaiting = false
    }, {
      [`GET ${API}/board/*`]: () => structuredClone(b),
      [`POST ${API}/requirements/r1/PAY-3/session`]: () => ({ ok: true, slot: 'brain-PAY-3-rev1', url: '/chat?sid=brain-PAY-3-rev1' }),
    })
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    await waitFor(() => expect(bar).toHaveTextContent('已等 11 小时'))
    expect(bar).toHaveTextContent('Lean 的下一步是审查：写代码的会话不能自己审，要开一个新会话来审。开审查会话会把 Lean 的审查要求发给新会话。')
    await waitFor(() => expect(within(bar).getByTestId('review-say')).toHaveTextContent(said))
    expect(within(bar).getByTestId('review-say').tagName).toBe('DETAILS')
    fireEvent.click(within(bar).getByRole('button', { name: '复制那一句' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(said))
    // never the session that wrote the code, under any name (REST-18)
    expect(within(bar).queryByRole('button', { name: /^(打开会话|去回话)$/ })).toBeNull()
    fireEvent.click(within(bar).getByRole('button', { name: '开审查会话' }))
    await waitFor(() => expect(navigations).toEqual(['/chat?sid=brain-PAY-3-rev1']))
    expect(apiCalls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: `${API}/requirements/r1/PAY-3/session`, body: { trust: true, kickoff: true, review: true } })
    expect(within(screen.getByRole('region', { name: '会话' })).getByTestId('session')).toHaveTextContent('等你回话')
  })

  test('开审查会话 that only gets the old session back says so and stays here', async () => {
    const user = userEvent.setup()
    withDetail((d) => {
      d.row.waits = { who: 'you', text: '构建测试做完了，下一步是发布：先开一个新会话做审查（这个会话写了代码，不能自己审）', line: null, raw: '', do: 'reply', since: null, where: 'session', review: true }
    }, { [`POST ${API}/requirements/r1/PAY-3/session`]: () => ({ ok: true, slot: 'brain-PAY-3-7f3a', url: '/chat?sid=brain-PAY-3-7f3a' }) })
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    await user.click(within(bar).getByRole('button', { name: '开审查会话' }))
    expect(await within(bar).findByText(/没开成新的审查会话/)).toBeInTheDocument()
    expect(navigations).toEqual([])
  })

  test('handed over, your acceptance is answered on the MR: 此刻, the question and the Lean card all say so, no line to type', async () => {
    withDetail(handedOver)
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    expect(bar).toHaveTextContent('交接以后，批准在 MR 上回答：回答 D-3（approve / reject）')
    expect(within(bar).getByRole('link', { name: /去 MR 上验收 D-3/ })).toHaveAttribute('href', MR)
    const q = within(screen.getByRole('region', { name: '问题和回答' })).getByTestId('question')
    expect(q).toHaveTextContent('这是 Lean 的发布审批请求：在 MR 上验收 D-3（approve / reject），桥会把回答带回运行机。')
    expect(q).not.toHaveTextContent('在会话里')
    expect(within(q).getByRole('link', { name: /去 MR 上验收/ })).toHaveAttribute('href', MR)
    const lean = screen.getByRole('region', { name: 'Lean 进度' })
    expect(lean).toHaveTextContent('交接以后，审批在 MR 上回答')
    expect(lean).not.toHaveTextContent('由你在会话里自己打')
    const release = await pendingApproval()
    expect(release).toHaveTextContent('发布审批在 MR 上等回答')
    expect(release).toHaveTextContent('在 MR 上验收 D-3（approve / reject），这里不能回答。')
    expect(within(release).getByRole('link', { name: /去 MR 上验收/ })).toHaveAttribute('href', MR)
    expect(within(release).queryByTestId('type-line')).toBeNull()
  })

  test('a question someone else answers on the MR: 此刻 names them, the viewer has nothing to do, the link only shows it', async () => {
    withDetail((d) => {
      d.row.state = 'parked'
      d.run!.handoff = { requested_at: '2026-11-08T10:00:00+08:00', by: 'alice' }
      d.row.waits = { who: 'product', text: '停在 D-2：等产品在 MR 上回答', line: null, raw: '', do: 'answer', since: AT - 1800, where: 'mr' }
      d.questions = [mrQuestion({ id: 'D-2', kind: 'clarify', kind_label: '澄清', lean_request: null, options: [{ id: 'A', text: '按小时切' }, { id: 'B', text: '一份' }] })]
    })
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    expect(bar).toHaveTextContent('等产品')
    expect(bar).toHaveTextContent('等产品在 MR 上回答 D-2，你不用做什么')
    const link = within(bar).getByRole('link', { name: /看 MR/ })
    expect(link).not.toHaveClass('is-primary')
    expect(bar).not.toHaveTextContent('去 MR 上回答')
    // one judgment: the question card below says the same, and only looks (DETAIL-10)
    const q = within(screen.getByRole('region', { name: '问题和回答' })).getByTestId('question')
    expect(q).toHaveTextContent('等产品在 MR 上回答')
    expect(within(q).getByRole('link', { name: '看 MR' })).toHaveAttribute('href', MR)
    expect(screen.getByTestId('br-detail')).not.toHaveTextContent('去 MR 上回答')
  })

  test('an approval someone else answers on the MR: the Lean card names them too and only looks (DETAIL-10)', async () => {
    withDetail((d) => {
      handedOver(d)
      d.row.waits = { who: 'product', text: '等产品在 MR 上验收 D-3（approve / reject）', line: null, raw: '', do: 'accept', since: AT - 7200, where: 'mr' }
    })
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    expect(bar).toHaveTextContent('等产品在 MR 上验收 D-3，你不用做什么；验收以后运行机接着做。')
    const release = await pendingApproval()
    expect(release).toHaveTextContent('等产品在 MR 上验收 D-3（approve / reject），你不用做什么。')
    expect(within(release).getByRole('link', { name: '看 MR' })).toHaveAttribute('href', MR)
    const q = within(screen.getByRole('region', { name: '问题和回答' })).getByTestId('question')
    expect(q).toHaveTextContent('这是 Lean 的发布审批请求：等产品在 MR 上验收 D-3')
    expect(within(q).getByRole('link', { name: '看 MR' })).toBeInTheDocument()
    expect(screen.getByTestId('br-detail')).not.toHaveTextContent(/去 MR 上(回答|验收)/)
  })

  test('merged with new knowledge to write back: 此刻 has 回写 Brain, which opens the Brain view’s write-back of it', async () => {
    withDetail((d) => {
      d.row.state = 'merged'
      d.row.waits = { who: 'you', text: '合并了：有 1 条新知识等你回写 Brain', line: null, raw: '', do: 'write_back', since: null, where: 'app' }
    }, { [`GET ${API}/board/*`]: () => fx.boardMerged() })
    const { go } = renderDetail()
    fireEvent.click(await within(await screen.findByRole('region', { name: '此刻' })).findByRole('button', { name: '回写 Brain ↗' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', reflect: 'PAY-3' })
  })

  test('此刻 while the AI is at it: no 「等…」 chip (nobody has to act), just what goes on', async () => {
    withDetail((d) => { d.row.waits = { who: 'agent', text: 'AI 在本机做', line: null, raw: '', do: 'none', since: null, where: null } })
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    expect(bar).toHaveTextContent(/^此刻AI 在本机做$/)
    expect(within(bar).queryByRole('button')).toBeNull()
  })

  test('an older backend without waits.review: its words still tell a review in a new session is next; 开审查会话 all the same', async () => {
    withDetail((d) => {
      d.row.waits = { who: 'you', text: '构建测试做完了，下一步是发布：先开一个新会话做审查（这个会话写了代码，不能自己审）', line: null, raw: '', do: 'reply', since: AT - 3600, where: 'session' }
      d.sessions[0].awaiting = false
      d.lean.next = []
    })
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    expect(within(bar).getByRole('button', { name: '开审查会话' })).toBeInTheDocument()
    expect(bar).toHaveTextContent('Lean 的下一步是审查：写代码的会话不能自己审，要开一个新会话来审。')
    expect(within(bar).queryByTestId('review-say')).toBeNull()
  })

  test('此刻 for a refused hand-over: what to do, 打开会话, the bridge’s own words folded under 细节', async () => {
    withDetail((d) => {
      d.row.state = 'rejected'
      d.row.waits = { who: 'you', text: '接手被拒：标签是 bob 打的，不是负责人 alice', line: null, raw: 'label added by bob, not the owner alice', do: 'redo_handoff', since: null, where: 'session' }
    })
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    expect(bar).toHaveTextContent('做什么：改好后重新交接（在会话里改，再交接一次）。')
    expect(within(bar).getByText('细节').closest('details')).toHaveTextContent('label added by bob')
    expect(within(bar).getByRole('button', { name: '打开会话' })).toBeInTheDocument()
  })

  test('此刻 for a refused hand-over says how to hand it over again as 需求看板 says it, the reason once', async () => {
    const waits = { who: 'you' as const, text: '接手被拒：标签是 bob 打的，不是负责人 alice', line: null, raw: '', do: 'redo_handoff' as const, since: null, where: 'session' as const }
    const b = fx.board()
    b.row.waits = waits
    b.accept.step = { ...b.accept.step, text: '接手被拒：标签是 bob 打的，不是负责人 alice\n改好后，在终端里、这个需求的分支上重新跑 brain handoff', line: null }
    withDetail((d) => { Object.assign(d.row, { state: 'rejected', waits }) }, { [`GET ${API}/board/*`]: () => b })
    renderDetail()
    const bar = await screen.findByRole('region', { name: '此刻' })
    await waitFor(() => expect(bar).toHaveTextContent('做什么：改好后，在终端里、这个需求的分支上重新跑 brain handoff'))
    expect(bar.textContent!.match(/标签是 bob 打的/g)).toHaveLength(1)
  })

  describe('claimed, not started', () => {
    const claimed = (d: RequirementDetail, who: 'you' | 'people' = 'you') => {
      Object.assign(d.row, { state: 'claimed', state_label: '已认领', where: 'claim', branch: null, intent: null, worktree: null, stage: null })
      d.row.waits = { who, text: '认领了，还没开工', line: null, raw: '', do: 'start', since: AT - 12 * 3600, where: 'app' }
      d.run = null
      d.decisions = []
      d.questions = []
      d.sessions = []
      d.credits.total = null
      d.timeline = { source: 'app', items: [], missing: [], error: 'brainkit.trace 读不出这个需求：runs/PAY-3/run.json not found in working tree (a merged run: --ref origin/main)' }
    }

    test('yours: one sentence and 开工, which opens 开需求 with this key and title; no empty cards, no red English', async () => {
      withDetail((d) => claimed(d))
      const { go } = renderDetail()
      const bar = await screen.findByRole('region', { name: '此刻' })
      await waitFor(() => expect(bar).toHaveTextContent('认领了 12 小时，还没开工'))
      fireEvent.click(within(bar).getByRole('button', { name: '开工' }))
      expect(go).toHaveBeenLastCalledWith({ kind: 'new', repo: 'r1', key: 'PAY-3', title: '退款单导出 CSV' })
      for (const name of ['周期', '时间花在哪', '成本', '检查']) expect(screen.queryByRole('article', { name })).toBeNull()
      for (const name of ['价值流', 'Lean 进度', '时间线', '决定']) expect(screen.queryByRole('region', { name })).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
      const page = screen.getByTestId('br-detail')
      const folded = page.querySelector('details')!
      expect(folded).toHaveTextContent('claim/PAY-3')   // the raw values: under 细节 only
      expect((page.textContent ?? '').replace(folded.textContent!, '').replace(page.querySelector('style')!.textContent!, '')).not.toMatch(/brainkit|not found|--ref|claim\//)
      expect(screen.getByRole('region', { name: '需求' })).toHaveTextContent('alice 的需求 · 只有认领')
    })

    test('someone else’s: 「等 … 开工」, no 开工 button', async () => {
      withDetail((d) => claimed(d, 'people'))
      renderDetail()
      const bar = await screen.findByRole('region', { name: '此刻' })
      expect(bar).toHaveTextContent('等 alice 开工')
      expect(within(bar).queryByRole('button', { name: '开工' })).toBeNull()
    })
  })

  test('team mode, a requirement handed to the runner opened at its repo: it says so and opens the runner’s 需求详情; never that it is not there', async () => {
    const o = fx.overview()
    o.rows = o.rows.map((r) => (r.key === 'PAY-4' ? { ...r, repo: 'runner', where: 'runner' } : r))
    const s = fx.status()
    s.app.team = true
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => o })
    const { go } = renderDetail({ repo: 'r1', key: 'PAY-4', from: 'overview' }, { status: s })
    const note = await screen.findByTestId('on-runner')
    expect(note).toHaveTextContent('PAY-4 已交给运行机交付总览把它列在运行机下，以那边的为准。')
    expect(document.body).not.toHaveTextContent(/shop-pay (仓库)?里没有/)
    fireEvent.click(within(note).getByRole('button', { name: '打开运行机上的需求详情' }))
    expect(go).toHaveBeenCalledWith({ kind: 'item', repo: 'runner', key: 'PAY-4' })
    cleanup()
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => o, [`GET ${API}/requirements/*`]: () => { throw apiError(404, 'not_found', '没有这个需求') } })
    renderDetail({ repo: 'r1', key: 'PAY-4', from: 'overview' }, { status: s })
    expect(await screen.findByTestId('on-runner')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '没有这个需求' })).toBeNull()
    cleanup()
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => o })
    renderDetail({ repo: 'r1', key: 'PAY-4', from: 'overview' })   // not team mode: no runner, nothing to say
    await screen.findByRole('region', { name: '此刻' })
    expect(screen.queryByTestId('on-runner')).toBeNull()
  })

  test('a requirement that is not there: which repo, what to do, back where it was opened from (as the crumb); no HTTP code, no 需求看板', async () => {
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => { throw apiError(404, 'not_found', '没有这个需求') } })
    const { go, onBack } = renderDetail({ repo: 'r1', key: 'PAY-99', from: 'todo' })
    const card = await screen.findByRole('region', { name: '没有这个需求' })
    expect(card).toHaveTextContent('shop-pay 仓库里没有 PAY-99')
    expect(card).toHaveTextContent('做什么：在上面「切换需求」里换一个，或者回待办找。')
    expect(document.body).not.toHaveTextContent('404')
    expect(screen.queryByRole('button', { name: '需求看板 ↗' })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: '回待办' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(go).not.toHaveBeenCalled()
    expect(apiCalls.find((c) => !c.path.startsWith(`${API}/overview`))?.path).toBe(`${API}/requirements/r1/PAY-99`)
    cleanup()
    renderDetail({ repo: 'runner', key: 'PAY-99', from: 'team' })
    expect(within(await screen.findByRole('region', { name: '没有这个需求' })).getByRole('button', { name: '回运行机' })).toBeInTheDocument()
    cleanup()
    // opened with no way back (a link): 交付总览
    const go2 = vi.fn()
    render(<DetailView entry={{ repo: 'r1', key: 'PAY-99' }} status={fx.status()} go={go2} replace={vi.fn()} reloadStatus={vi.fn()} setStatus={vi.fn()} pollMs={60_000} />)
    fireEvent.click(within(await screen.findByRole('region', { name: '没有这个需求' })).getByRole('button', { name: '回交付总览' }))
    expect(go2).toHaveBeenCalledWith({ kind: 'overview', repo: 'r1' })
  })

  test('another error answer still shows errorText', async () => {
    installFixtureRoutes({ [`GET ${API}/requirements/*`]: () => { throw apiError(503, 'unavailable', '后端忙') } })
    renderDetail()
    expect(await screen.findByRole('alert')).toHaveTextContent('后端忙')
    expect(screen.queryByRole('region', { name: '需求' })).toBeNull()
  })

  test('the 变更说明: its first line, the whole text formatted (tables as tables), 复制 copies the Markdown', async () => {
    renderDetail()
    const card = await screen.findByRole('region', { name: '变更说明' })
    const m = fx.detail().mr_desc
    expect(within(card).getByTestId('mr-desc-first')).toHaveTextContent(m.first as string)
    // where it comes from in words; the file and the commit only on hover
    const from = within(card).getByTestId('mr-desc-from')
    expect(from).toHaveTextContent(/^分支上还没写好，这份是从记录生成的$/)
    expect(from.title).toBe('提交 7d2c9e4a1b30 · 分支上没有 runs/PAY-3/MR.md')
    expect(card).not.toHaveTextContent('7d2c9e4a1b30')
    const text = within(card).getByTestId('mr-desc-text')
    expect(text.closest('details')).not.toBeNull()   // folded
    expect(within(text).getAllByRole('table')).toHaveLength(2)
    expect(within(text).getByRole('heading', { name: '验收标准和证据' })).toBeInTheDocument()
    expect(text.textContent).not.toMatch(/\|---|\*\*|`|###/)
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
    const from = within(await screen.findByRole('region', { name: '变更说明' })).getByTestId('mr-desc-from')
    expect(from).toHaveTextContent(/^分支上写好的变更说明$/)
    expect(from.title).toBe('runs/PAY-3/MR.md · 提交 7d2c9e4a1b30')
    unmount()
    withDetail((x) => { x.mr_desc = { available: true, text: '', first: null, source: null, path: null, ref: null, error: '还没有 run（只有认领）：开工以后才有变更说明' } })
    renderDetail()
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
    expect(plan).toHaveTextContent('这是 Lean 的代码生成计划审批请求：在会话里自己打批准那一行，这里不能回答。')
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

  test('codes are folded under 细节: a question’s refs and material refs, the 变更说明 first line’s 「（D01#S002 · 097f2e9e）」', async () => {
    withDetail((d) => {
      d.questions[0].question = '导出文件里的时间用哪个时区？（D01#S004 · 9a1b2c3d）'
      d.mr_desc.first = '给 `calc.py` 加乘法（D01#S002 · 097f2e9e）（规模 small）'
    })
    renderDetail()
    const [clarify] = await screen.findAllByTestId('question')
    const line = clarify.querySelector('p.br-strong') as HTMLElement
    expect(line).toHaveTextContent(/^导出文件里的时间用哪个时区？$/)
    const raw = within(clarify).getByTestId('question-raw')
    expect(raw.tagName).toBe('DETAILS')
    expect(raw).toHaveTextContent('D01#S004 · 9a1b2c3d')
    expect(raw).toHaveTextContent('D01#S004')
    const first = within(screen.getByRole('region', { name: '变更说明' })).getByTestId('mr-desc-first')
    expect(first).toHaveTextContent(/^给 calc\.py 加乘法（规模 small）$/)
    expect(first.querySelector('code')).toHaveTextContent('calc.py')
    expect(first.title).toBe('出处 D01#S002 · 097f2e9e')
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

  test('问题和回答: how many, each as asked with its kind and state, the options where there is no form', async () => {
    renderDetail()
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
    expect(within(clarify).getByText(qs[0].refs[0]).closest('details')).toHaveTextContent('细节')   // a ref is a code: folded
    expect(plan).toHaveTextContent('等回答')
    expect(old).toHaveTextContent('已送回')
    const opts = within(within(old).getByRole('list', { name: '选项' })).getAllByRole('listitem')
    expect(opts.map((o) => o.textContent)).toEqual(qs[2].options.map((o) => `${o.id} ${o.text}${o.id === qs[2].recommend ? '推荐' : ''}`))
    expect(within(clarify).queryByRole('list', { name: '选项' })).toBeNull()   // its options are the form's
  })

  test('no questions here, but the decisions record the answers to Q1, Q2 (in their why): it says they were asked in the session', async () => {
    withDetail((d) => {
      d.questions = []
      d.decisions[0].why = 'Q1 答"按推荐"'
      d.decisions[0].asked = ['Q1']
      d.decisions[1].why = 'Q2 答"按推荐"'
      d.decisions[1].asked = ['Q2']
    })
    renderDetail()
    const card = await screen.findByRole('region', { name: '问题和回答' })
    // the count says the two asked in the session, never 「0 个」 above the sentence that they were asked (DETAIL-16)
    expect(card).toHaveTextContent('问题和回答2 个 · 能在这里回答的才有回答框')
    expect(card).not.toHaveTextContent('0 个')
    expect(card).toHaveTextContent('问题都是会话里直接问的（Q1、Q2），回答记在决定 D-1、D-2 里。')
    expect(card).not.toHaveTextContent('没有停下来问过人')
  })

  test('questions here and some asked in the session too: both are said', async () => {
    withDetail((d) => { d.decisions[2].asked = ['Q1'] })
    renderDetail()
    const card = await screen.findByRole('region', { name: '问题和回答' })
    expect(within(card).getAllByTestId('question')).toHaveLength(fx.detail().questions.length)
    expect(card).toHaveTextContent(`问题和回答${fx.detail().questions.length + 1} 个`)
    expect(card).toHaveTextContent('另有会话里直接问的（Q1），回答记在决定 D-3 里。')
  })

  test('no question anywhere: it says nobody was asked', async () => {
    withDetail((d) => { d.questions = []; d.decisions.forEach((x) => { x.asked = [] }) })
    renderDetail()
    const card = await screen.findByRole('region', { name: '问题和回答' })
    expect(card).toHaveTextContent('没有停下来问过人。')
  })

  test('决定: the stage by its name, who settled it in words (vouchers in the hover), every Brain cite opens the Brain view', async () => {
    const { go } = renderDetail()
    const card = await screen.findByRole('region', { name: '决定' })
    const ds = fx.detail().decisions
    expect(card).toHaveTextContent(`${ds.length} 条 · 人定了 ${ds.filter((d) => d.by === 'person').length} 条`)
    const row = (id: string) => within(card).getByText(id).closest('tr')!
    const cell = (id: string, label: string) => row(id).querySelector(`td[data-label="${label}"]`) as HTMLElement
    expect(cell('D-1', '阶段')).toHaveTextContent(/^需求分析$/)
    expect(cell('D-2', '阶段')).toHaveTextContent(/^应用设计$/)
    expect(cell('D-1', '谁定的')).toHaveTextContent(/^照 Brain P-PAY-2-1$/)
    expect(cell('D-2', '谁定的')).toHaveTextContent(/^AI 自己定的$/)
    expect(cell('D-3', '谁定的')).toHaveTextContent(/^一位组员$/)
    expect(cell('D-3', '谁定的').title).toContain('化名 P-1A2B：brain-kit 不写真名')
    expect(cell('D-3', '谁定的').title).toContain('凭证 V-1a2b3c4d5e')
    expect(cell('D-4', '谁定的')).toHaveTextContent(/^没归类$/)
    expect(cell('D-4', '谁定的')).toHaveAttribute('title', '「谁定的」那一格不是规定的写法：没归类，也不猜是谁')
    expect(card).not.toHaveTextContent(/requirements|application-design|code-generation|V-1a2b/)
    for (const d of ds) {
      expect(row(d.id).children[0].getAttribute('title')).toContain(d.src)
      expect(row(d.id)).toHaveTextContent(d.text)
      expect(row(d.id)).toHaveTextContent(d.why!)
    }
    const FILE: Record<string, string> = { P: 'PRODUCT', T: 'TECH' }
    let clicks = 0
    for (const d of ds) {
      for (const c of d.cites) {
        fireEvent.click(within(cell(d.id, '引用 Brain')).getByRole('button', { name: c }))
        expect(go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', id: c, file: FILE[c[0]] })
        clicks++
      }
    }
    expect(clicks).toBe(ds.flatMap((d) => d.cites).length)
  })

  test('决定: the owner’s own decision is 「你（负责人）」; each row opens the board at the moment its stage was recorded', async () => {
    withDetail((d) => { d.decisions[1] = { ...d.decisions[1], by: 'person', who: 'owner' } })
    const { go } = renderDetail()
    const card = await screen.findByRole('region', { name: '决定' })
    await waitFor(() => expect(within(card).getByText('D-2').closest('tr')!).toHaveTextContent('你（负责人）'))   // the board says me
    const stage = fx.detail().lean.stages.find((s) => s.id === 'requirements')!
    fireEvent.click(within(within(card).getByText('D-1').closest('tr')!).getByRole('button', { name: '在看板上看 ↗' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item', at: stage.at })
  })

  test('a decision cite that is not a Brain entry id stays plain text: no button, no markup', async () => {
    withDetail((d) => { d.decisions[0].cites = ['javascript:alert(1)', '<img src=x onerror=alert(1)>', 'P-PAY-2-1'] })
    const { go } = renderDetail()
    const card = await screen.findByRole('region', { name: '决定' })
    const cites = within(card).getByText('D-1').closest('tr')!.querySelector('td[data-label="引用 Brain"]') as HTMLElement
    expect(within(cites).getAllByRole('button').map((b) => b.textContent)).toEqual(['P-PAY-2-1'])
    expect(within(cites).getByText('javascript:alert(1)').tagName).toBe('SPAN')
    expect(within(cites).getByText('<img src=x onerror=alert(1)>').tagName).toBe('SPAN')
    expect(card.querySelector('img, a')).toBeNull()
    fireEvent.click(within(cites).getByText('javascript:alert(1)'))
    expect(go).not.toHaveBeenCalled()
  })

  test('the crumb and ← 返回 go back; a Brain cite in 用到的 Brain opens the Brain view at that entry', async () => {
    const { go, onBack } = renderDetail({ repo: 'r1', key: 'PAY-3', from: 'todo' })
    const crumb = await screen.findByRole('navigation', { name: '位置' })
    await screen.findByRole('region', { name: '决定' })
    expect(crumb).toHaveTextContent('待办›PAY-3')
    fireEvent.click(within(crumb).getByRole('button', { name: '待办' }))
    fireEvent.click(screen.getByRole('button', { name: '← 返回待办' }))
    expect(onBack).toHaveBeenCalledTimes(2)
    const brain = screen.getByRole('region', { name: '用到的 Brain' })
    fireEvent.click(within(brain).getAllByRole('button', { name: 'T-12' })[0])
    expect(go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', id: 'T-12', file: 'TECH' })
    expect(within(brain).getByText('T-PAY-9-1')).toBeInTheDocument()
    expect(within(brain).queryByRole('button', { name: 'T-PAY-9-1' })).toBeNull() // not in the Brain: plain text
  })

  test('opened from 运行机: the crumb and ← 返回 say 运行机', async () => {
    const { onBack } = renderDetail({ repo: 'r1', key: 'PAY-3', from: 'team' })
    const crumb = await screen.findByRole('navigation', { name: '位置' })
    expect(crumb).toHaveTextContent('运行机›PAY-3')
    fireEvent.click(screen.getByRole('button', { name: '← 返回运行机' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  test('opened at a decision (?decision=D-3): its row is scrolled to and picked out; one it does not have is said', async () => {
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView)
    renderDetail({ repo: 'r1', key: 'PAY-3', from: 'overview', decision: 'D-3' })
    const card = await screen.findByRole('region', { name: '决定' })
    const row = within(card).getByText('D-3').closest('tr') as HTMLElement
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(row).toHaveClass('is-picked')
    expect(within(card).getAllByTestId('decision').filter((r) => r.getAttribute('aria-current'))).toHaveLength(1)
    await waitFor(() => expect(scroll.mock.contexts).toContain(row))
  })

  test('opened at a decision it does not have: it says so over the decisions', async () => {
    renderDetail({ repo: 'r1', key: 'PAY-3', decision: 'D-9' })
    const card = await screen.findByRole('region', { name: '决定' })
    expect(within(card).getByRole('status')).toHaveTextContent('这个需求的决定里没有 D-9')
    expect(within(card).getAllByTestId('decision').filter((r) => r.getAttribute('aria-current'))).toHaveLength(0)
  })

  test('用到的 Brain: a proposal already written to its write-back branch says so and opens that write-back', async () => {
    withDetail((x) => {
      x.row.state = 'merged'
      x.brain.proposals = 2
    }, { [`GET ${API}/board/*`]: () => fx.boardMerged() })
    const { go } = renderDetail()
    const card = await screen.findByRole('region', { name: '用到的 Brain' })
    await waitFor(() => expect(within(card).getByTestId('brain-proposals')).toHaveTextContent('提议 2 条新知识：已写到回写分支 brain/PAY-2-reflect-1，等合并'))
    fireEvent.click(within(card).getByRole('button', { name: '在 Brain 里看 ↗' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', reflect: 'PAY-3' })
  })

  test('用到的 Brain: once the write-back branch is on the default branch (the reflect step merged) it says 已合进 Brain', async () => {
    const m = fx.boardMerged()
    const r = m.actors.find((a) => a.key === 'reflect')!
    Object.assign(r, { status: 'merged', doing: '回写分支 brain/PAY-2-reflect-1 已合并' })
    withDetail((x) => {
      x.row.state = 'merged'
      x.brain.proposals = 2
    }, { [`GET ${API}/board/*`]: () => structuredClone(m) })
    renderDetail()
    const card = await screen.findByRole('region', { name: '用到的 Brain' })
    await waitFor(() => expect(within(card).getByTestId('brain-proposals')).toHaveTextContent('提议 2 条新知识：已合进 Brain（回写分支 brain/PAY-2-reflect-1）'))
    expect(card).not.toHaveTextContent('等合并')
  })

  test('the sessions list opens a session; with a live session there is no 开会话', async () => {
    renderDetail()
    const sessions = await screen.findByRole('region', { name: '会话' })
    expect(sessions).toHaveTextContent('等批准')
    expect(sessions).toHaveTextContent('最近活动：6 分钟前')
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
    expect(within(now()).queryByRole('button', { name: '打开会话' })).toBeNull()
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
    withDetail((d) => {
      d.sessions = []
      d.row.state = 'parked'
    })
    renderDetail()
    await screen.findByRole('region', { name: '需求' })
    expect(screen.queryByRole('region', { name: '开会话' })).toBeNull()
  })

  test('价值流: each part named (the gate it waited at, the session, the AI) on a time axis; a part and a moment open the board there', async () => {
    const { go } = renderDetail()
    const card = await screen.findByRole('region', { name: '价值流' })
    expect(apiCalls.map((c) => c.path).filter((p) => !p.startsWith(`${API}/overview`))).toEqual([`${API}/requirements/r1/PAY-3`, `${API}/board/r1/PAY-3`])
    // board.json: the local session works and waits at the approvals (the 设计审批 node also asks for each code-generation
    // plan: the part says which), waits overnight for the person's reply, works, then waits in the session (the question)
    // and at the second plan; the gaps after each approval have nothing recorded
    const parts = [
      'AI 在本机做 31 分钟', '需求审批 21 分钟', 'AI 在本机做 44 分钟', '设计审批 25 分钟', 'AI 在本机做 48 分钟', '代码生成计划审批 17 分钟',
      'AI 在本机做 58 分钟', '会话等人 18 小时 56 分', 'AI 在本机做 4 小时 40 分', '会话等人 14 分钟', '代码生成计划审批 6 分钟',
    ]
    const chart = within(card).getByRole('group', { name: /^价值流：/ })
    expect(chart).toHaveAttribute('aria-label', '价值流：' + parts.join('，'))
    const segs = within(chart).getAllByRole('button').filter((b) => parts.includes(b.getAttribute('aria-label')!))
    expect(segs.map((b) => b.getAttribute('aria-label'))).toEqual(parts)
    expect(card).toHaveTextContent('从开工到此刻，共 28 小时')
    expect(chart).toHaveTextContent('18 小时 56 分')
    // the moments: the start, the approvals, the reply and the question, not the requests, stages or commits
    expect(within(chart).getAllByTestId('vs-moment')).toHaveLength(6)
    for (const t of ['开工', '你批准了需求', '你批准了设计', '你批准了代码生成计划', '你在会话里回话了', '停下问你：澄清']) expect(chart).toHaveTextContent(t)
    expect(chart).not.toHaveTextContent('请你批准')
    // the legend lists only the parts there are
    expect(within(card).queryByText('运行机在做')).toBeNull()
    expect(within(card).queryByText('返工')).toBeNull()
    fireEvent.click(segs[1])
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item', at: 1794047460 })
    fireEvent.click(within(chart).getByRole('button', { name: /你批准了需求：看板回放到这一刻/ }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item', at: 1794048720 })
  })

  test('价值流 says the whole time 周期 says; a quiet end with nothing recorded is said, not drawn', async () => {
    const b = fx.board()
    for (const a of b.actors) a.spans = a.spans.map((x) => ({ ...x, b: x.b ?? b.at }))
    b.at += 5 * 3600
    installFixtureRoutes({ [`GET ${API}/board/*`]: () => structuredClone(b) })
    renderDetail()
    const card = await screen.findByRole('region', { name: '价值流' })
    expect(card).toHaveTextContent('从开工到此刻，共 33 小时（最后 5 小时 没有动静）')
    expect(within(screen.getByRole('article', { name: '周期' })).getByTestId('item-cycle')).toHaveTextContent(/^33 小时$/)
  })

  test('价值流 as a table: one row per part with its time, who, how long and how it ended', async () => {
    renderDetail()
    const card = await screen.findByRole('region', { name: '价值流' })
    fireEvent.click(within(within(card).getByRole('group', { name: '图或表格' })).getByRole('button', { name: '表格' }))
    const rows = within(within(card).getByRole('table', { name: '价值流的每一段' })).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(11)
    expect(rows[0]).toHaveTextContent('AI（本机会话）31 分钟')
    expect(rows[1]).toHaveTextContent('需求审批人21 分钟批准')
    expect(rows[3]).toHaveTextContent('设计审批人25 分钟批准')
    expect(rows[5]).toHaveTextContent('代码生成计划审批人17 分钟批准')
    expect(rows[7]).toHaveTextContent('会话等人人18 小时 56 分回答了')
  })

  test('a merged requirement: nothing after the merge counts (the write-back wait is not the delivery’s); ▶ 回放 ↗', async () => {
    withDetail((d) => { d.row.state = 'merged' }, { [`GET ${API}/board/*`]: () => fx.boardMerged() })
    const { go } = renderDetail()
    const card = await screen.findByRole('region', { name: '价值流' })
    const b = fx.boardMerged()
    const start = b.events.find((e) => e.kind === 'start')!.at
    expect(card).toHaveTextContent('从开工到合并，共 9 小时 19 分')
    expect(within(screen.getByRole('article', { name: '周期' })).getByTestId('item-cycle')).toHaveTextContent(/^9 小时 19 分$/)
    expect(b.ended_at! - start).toBe(33540)
    const time = screen.getByRole('article', { name: '时间花在哪' })
    const sum = [...time.querySelectorAll('.cto-legend b')].map((x) => x.textContent!)
    expect(sum.join('、')).not.toMatch(/1[5-9] 小时|2\d 小时/)
    expect(within(card).queryByText('回写 Brain')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '▶ 回放 ↗' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item', replay: true })
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

  test('Lean’s progress, one way: 做完 · 跳过 · 在做 / 下一步 (the backend’s counts, else counted from the stages); the next stage cell says 下一步', async () => {
    withDetail((d) => {
      delete d.row.lean.done_n
      delete d.row.lean.skipped_n
      delete d.row.lean.next
    })
    renderDetail()
    // code generation is started: 在做, not 下一步
    expect(await screen.findByTestId('lean-progress')).toHaveTextContent('Lean 做完 4 · 跳过 4 · 在做：代码生成')
    expect(screen.getByRole('region', { name: 'Lean 进度' })).toHaveTextContent('做完 4 · 跳过 4 · 在做：代码生成')
    cleanup()
    installFixtureRoutes()   // the backend's counts and stage_state
    renderDetail()
    expect(await screen.findByTestId('lean-progress')).toHaveTextContent('Lean 做完 4 · 跳过 4 · 在做：代码生成')
    withDetail((d) => {
      d.lean.stages = d.lean.stages.map((s) => ({ ...s, state: s.n === 11 ? 'todo' : s.n % 2 ? 'skipped' : 'done' }))
      d.row.lean = { ...d.row.lean, done_n: 5, skipped_n: 5, next: { id: 'release', label: '发布', n: 11 } }
    })
    renderDetail()
    await waitFor(() => expect(screen.getAllByTestId('lean-progress').at(-1)).toHaveTextContent('Lean 做完 5 · 跳过 5 · 下一步：发布'))
    const cells = screen.getAllByRole('list', { name: '11 个阶段' }).at(-1)!
    const last = within(cells).getAllByTestId('stage')[10]
    expect(last).toHaveTextContent('11 · 下一步')
    expect(last).not.toHaveTextContent('没开始')
  })

  test('the Lean card: the 11 stages, each its number, name, state and units; approvals by name, the code values under 细节; only the pending one has the line', async () => {
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
    })
    const rows = within(within(lean).getByRole('list', { name: '审批' })).getAllByTestId('approval')
    expect(rows.map((r) => r.querySelector('b')!.textContent)).toEqual(['需求审批', '设计审批', '代码生成计划审批 · refund-export', '代码生成计划审批 · refund-api'])
    rows.forEach((row, i) => {
      const a = d.lean.approvals[i]
      expect(row).toHaveTextContent(a.state === 'pending' ? '等你批' : '已批准')
      expect(row.querySelector('details')).toHaveTextContent(a.kind)
      expect(within(row).queryByTestId('type-line') !== null).toBe(a.state === 'pending')
    })
    const line = within(lean).getByTestId('type-line')
    expect(within(line).getByText(LINE)).toHaveClass('br-mono')
    expect(line).toHaveTextContent(TYPE_IT_YOURSELF)
    fireEvent.click(within(line).getByRole('button', { name: '复制那一行' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LINE))
    expect(within(line).getByRole('button', { name: '打开会话' })).toBeInTheDocument()
    noLineSent()
  })

  test('检查: names what did not pass, what waits and what is still ahead; only the kinds this requirement has', async () => {
    renderDetail()
    const card = await screen.findByRole('article', { name: '检查' })
    // it waits on the person looking: 等你, as everywhere
    await waitFor(() => expect(within(card).getByTestId('checks-say')).toHaveTextContent('没过：引用的 Brain 条目 · 等你：代码生成计划审批 · 还剩 发布审批、自动检查'))
    // it wraps between its pieces only, each name whole in one piece (a piece wider than the card wraps inside itself:
    // nothing runs past the card's edge)
    const pieces = [...within(card).getByTestId('checks-say').querySelectorAll('.br-phrase')].map((x) => x.textContent)
    expect(pieces).toEqual(['没过：', '引用的 Brain 条目 ·', '等你：', '代码生成计划审批 ·', '还剩 发布审批、', '自动检查'])
    expect(within(card).getByTestId('checks-say').querySelector('.br-nowrap')).toBeNull()
    expect(card).toHaveTextContent('查的是：Lean 审批 · Brain')
    expect(card).toHaveClass('is-bad')
  })

  test('检查 with every check passed so far but the release approval ahead is not green and says what is left', async () => {
    const b = fx.board()
    b.checks.cells = b.checks.cells.map((c) => (c.status === 'fail' || c.status === 'wait' ? { ...c, status: 'pass' as const } : c))
    b.checks = { ...b.checks, passed: 4, failed: 0, total: 4 }
    delete b.checks.todo   // an older backend: the approvals still ahead are counted here
    installFixtureRoutes({ [`GET ${API}/board/*`]: () => b })
    const { go } = renderDetail()
    const card = await screen.findByRole('article', { name: '检查' })
    await waitFor(() => expect(within(card).getByTestId('checks-say')).toHaveTextContent('目前 4 项都过 · 还剩 发布审批'))
    expect(card).not.toHaveClass('is-ok')
    fireEvent.click(within(card).getByRole('button', { name: '在需求看板的检查墙上看每一项' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item', focus: 'checks' })
  })

  test('检查 with one check so far says it as the board does: 1 项过了, not 都过', async () => {
    const b = fx.board()
    b.checks.cells = b.checks.cells.filter((c) => c.id === 'gate-REQUIREMENTS' || c.status === 'skip')
    b.checks = { ...b.checks, passed: 1, failed: 0, total: 1, todo: ['发布审批'] }
    installFixtureRoutes({ [`GET ${API}/board/*`]: () => b })
    renderDetail()
    const card = await screen.findByRole('article', { name: '检查' })
    await waitFor(() => expect(within(card).getByTestId('checks-say')).toHaveTextContent(/^目前 1 项过了 · 还剩 发布审批$/))
  })

  test('检查 after the merge: the 14 days are watched, not waited on', async () => {
    withDetail((d) => { d.row.state = 'merged' }, { [`GET ${API}/board/*`]: () => fx.boardMerged() })
    renderDetail()
    const card = await screen.findByRole('article', { name: '检查' })
    const after = fx.boardMerged().checks.cells.find((c) => c.group === 'after')!
    // the backend's todo names the 14 days too: said once, as 观察中, not as something left
    await waitFor(() => expect(within(card).getByTestId('checks-say')).toHaveTextContent(/^目前 9 项都过 · 观察中：合并后 14 天没有回滚或热修$/))
    expect(within(card).getByTestId('checks-say')).not.toHaveTextContent('等人')
  })

  test('成本: credits and sessions; each session chip says what it is and leads to the sessions; none says so', async () => {
    renderDetail()
    const card = await screen.findByRole('article', { name: '成本' })
    expect(card).toHaveTextContent(`${fmtCredits(fx.detail().credits.total)}credits`)
    expect(card).toHaveTextContent('1 个会话')
    expect(card).not.toHaveTextContent('token')
    const chip = within(within(card).getByLabelText('会话的用量')).getByRole('button')
    expect(chip.title).toBe('PAY-3 退款单导出 CSV · 等批准 · 12.4 credits')
    // the legend says whom it waits on, as waitsOn says it: this machine's session waits on you (BOARD-30)
    expect(within(card).getByText('等你')).toBeInTheDocument()
    expect(card).not.toHaveTextContent('等人')
  })

  test('看每个会话的用量 ↓ and the session icons scroll to the 会话 card, not to the icons themselves', async () => {
    const seen: Element[] = []
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: Element) { seen.push(this) })
    try {
      renderDetail()
      const card = await screen.findByRole('article', { name: '成本' })
      fireEvent.click(within(card).getByRole('button', { name: '看每个会话的用量 ↓' }))
      fireEvent.click(within(within(card).getByLabelText('会话的用量')).getByRole('button'))
      expect(seen).toEqual([screen.getByRole('region', { name: '会话' }), screen.getByRole('region', { name: '会话' })])
    } finally {
      spy.mockRestore()
    }
  })

  test('credits with no session listed: both cards say none is open now, never 还没开过会话; a session not reported yet is not 「— credits」', async () => {
    withDetail((d) => { d.sessions = [] })
    renderDetail()
    const cost = await screen.findByRole('article', { name: '成本' })
    expect(cost).toHaveTextContent(`${fmtCredits(fx.detail().credits.total)}credits`)
    expect(cost).toHaveTextContent('现在没有开着的会话')
    expect(screen.getByTestId('br-detail')).not.toHaveTextContent('还没开过会话')
    expect(screen.getByRole('region', { name: '会话' })).toHaveTextContent('现在没有开着的会话；上面的合计是记下的用量。')
    cleanup()
    withDetail((d) => { d.credits.total = null })
    renderDetail()
    const head = (await screen.findByRole('region', { name: '会话' })).querySelector('.cto-chart-head') as HTMLElement
    expect(head).toHaveTextContent('这个 app 开的 · 用量还没报')
    expect(head).not.toHaveTextContent('—')
  })

  test('成本 without a session: 「还没有」 and 还没开过会话, never 「— credits」', async () => {
    withDetail((d) => {
      d.sessions = []
      d.credits.total = null
    })
    renderDetail()
    const none = await screen.findByRole('article', { name: '成本' })
    expect(none).toHaveTextContent('还没有')
    expect(none).toHaveTextContent('还没开过会话')
    expect(none).not.toHaveTextContent('—')
  })

  test('会话: each session with its state, where it runs, agent, credits and turns; the total', async () => {
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
    fireEvent.click(within(run).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual([runner.url])
  })

  test('时间线: newest first, the app’s own records in words (no commands, slot ids, pseudonyms); unread sources only once handed over', async () => {
    withDetail((d) => {
      d.timeline.items.push(
        { at: '2026-11-08T22:00:00+08:00', kind: 'app', label: '回写 Brain 并推送：成功', detail: 'brain/PAY-3-reflect-1', who: null, src: 'app' },
        { at: '2026-11-07T18:30:00+08:00', kind: 'human', label: '批准需求', detail: null, who: 'G-A29056', src: 'audit' },
      )
    })
    renderDetail()
    const tl = await screen.findByRole('region', { name: '时间线' })
    const items = within(tl).getAllByTestId('tl-item')
    expect(items[0]).toHaveTextContent('回写 Brain 并推送：成功 · 分支 brain/PAY-3-reflect-1')
    expect(items[1]).toHaveTextContent('停下问人：澄清')
    expect(items.at(-1)).toHaveTextContent('在 app 里开工')
    expect(tl).toHaveTextContent('最新的在上面 · brain-kit 记下的')
    expect(tl).toHaveTextContent('开了本机会话 · 工具调用不用逐个批准')
    expect(tl).not.toHaveTextContent(/brain reflect|--apply|G-A29056|claim\/|origin/)
    expect(items.some((i) => i.textContent!.includes('批准需求') && i.title.includes('化名 G-A29056'))).toBe(true)
    expect(tl).not.toHaveTextContent('读不到')   // a local run: the bridge's and the runner's records are not on its way
  })

  test('时间线 of a handed-over requirement says which records could not be read, in words, the original folded', async () => {
    withDetail(handedOver)
    renderDetail()
    const after = await screen.findByRole('region', { name: '时间线' })
    // the backend's words, as it says them (each source and why)
    expect(after.querySelector('.br-tlmissing')).toHaveTextContent(/^时间线里缺这些记录：桥的账本（这台机器上没有：交接以后的问答在 MR 上看）；CI 流水线（在 GitLab 上，这里读不到）$/)
  })

  test('时间线 from an older backend: brain-kit’s English source named in Chinese, its words folded', async () => {
    withDetail((d) => {
      handedOver(d)
      d.timeline.missing = ['runnerd (no ledger on this machine)']
    })
    renderDetail()
    const after = await screen.findByRole('region', { name: '时间线' })
    const note = after.querySelector('.br-tlmissing') as HTMLElement
    expect(note).toHaveTextContent('时间线里缺这些记录：运行机的记录')
    expect(within(note).getByText('细节').closest('details')).toHaveTextContent('runnerd')
  })

  test('时间线 that could not be read in part says so in Chinese, what to do, the original folded', async () => {
    withDetail((d) => { d.timeline.error = 'brainkit.trace: git log failed (exit 128)' })
    renderDetail()
    const tl = await screen.findByRole('region', { name: '时间线' })
    expect(tl).toHaveTextContent('这个需求的记录有一部分读不出来，下面只列读到的。')
    expect(tl).toHaveTextContent('做什么：')
    expect(within(tl).getByText('细节').closest('details')).toHaveTextContent('git log failed')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('时间线 the backend could not read says why in its own words, and what to do; no 细节 to pass on when there is no original', async () => {
    withDetail((d) => { d.timeline.error = 'brain-kit 读不出这个需求的完整记录：下面只有 Lean 自己记下的事' })
    renderDetail()
    const note = await screen.findByTestId('timeline-error')
    expect(note).toHaveTextContent(/^brain-kit 读不出这个需求的完整记录：下面只有 Lean 自己记下的事做什么：等一会儿它会自己再读；一直这样的话，到设置里看 brain-kit 能不能用。$/)
    expect(note).not.toHaveTextContent('原话')
    expect(within(note).queryByText('细节')).toBeNull()
  })

  test('时间线: an answer brain-kit recorded without its words says only that it was answered, and by whom in words', async () => {
    withDetail((d) => {
      d.timeline.items.push({ at: '2026-11-08T21:00:00+08:00', kind: 'human', label: '回答 ：', detail: null, who: 'P-7C1D', src: null })
    })
    renderDetail()
    const tl = await screen.findByRole('region', { name: '时间线' })
    const item = within(tl).getAllByTestId('tl-item').find((i) => i.title.includes('化名 P-7C1D'))!
    expect(item).toHaveTextContent(/^21:00人回答 · 一位组员$/)
    expect(tl).not.toHaveTextContent(/回答 ?：/)
  })

  test('the runner’s run and a hand-over’s commit are said in words, the id and the sha only on hover', async () => {
    withDetail((d) => {
      d.sessions = [{ ...d.sessions[0], slot: 'brain-run-RUN-PAY-3-1', title: 'RUN-PAY-3-1', kind: 'runner', agent: 'brain-run', awaiting: false }]
      d.timeline.items.push(
        { at: '2026-11-08T21:00:00+08:00', kind: 'handover', label: '桥接手了', detail: 'RUN-PAY-3-1', who: null, src: null },
        { at: '2026-11-08T20:00:00+08:00', kind: 'handover', label: '交接', detail: 'd138dc559626', who: 'alice', src: null })
    })
    renderDetail()
    const card = await screen.findByRole('region', { name: '会话' })
    const name = within(within(card).getByTestId('session')).getByText('第 1 次运行')
    expect(name.title).toBe('RUN-PAY-3-1')
    const tl = screen.getByRole('region', { name: '时间线' })
    const items = within(tl).getAllByTestId('tl-item')
    expect(items.find((i) => i.textContent?.startsWith('21:00'))).toHaveTextContent(/^21:00交接桥接手了 · 第 1 次运行$/)
    const hand = items.find((i) => i.textContent?.startsWith('20:00'))!
    expect(hand).toHaveTextContent(/^20:00交接交接 · alice$/)
    expect(hand.title).toBe('提交 d138dc559626')
    expect(card).not.toHaveTextContent('RUN-PAY-3-1')
    expect(tl).not.toHaveTextContent(/RUN-PAY-3-1|d138dc559626/)
  })

  test('需求看板 ↗ and the time card’s parts go to this requirement’s board; no 回放 before it is merged', async () => {
    const { go } = renderDetail()
    await screen.findByRole('region', { name: '价值流' })
    const toBoard = { kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item' }
    fireEvent.click(screen.getByRole('button', { name: '需求看板 ↗' }))
    expect(go).toHaveBeenLastCalledWith(toBoard)
    const [agent, person] = within(screen.getByRole('article', { name: '时间花在哪' })).getAllByRole('button')
    fireEvent.click(agent)
    expect(go).toHaveBeenLastCalledWith({ ...toBoard, focus: 'lanes' })
    fireEvent.click(person)
    expect(go).toHaveBeenLastCalledWith({ ...toBoard, at: 1794047460 })   // the first wait for a person
    expect(screen.queryByRole('button', { name: '▶ 回放 ↗' })).toBeNull()
  })
})
