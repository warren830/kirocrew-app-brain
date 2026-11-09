import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { paths } from '../api'
import { fx } from '../test/data'
import { API, fixtureRoutes, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError, navigations, setApiRoutes } from '../test/stubs/app-sdk'
import type { BoardEntry } from '../nav'
import type { ReqBoard } from '../types'
import { TYPE_IT_YOURSELF } from '../ui'
import type { ViewProps } from '../views/props'
import { BoardPage } from './BoardPage'
import { tickLabel } from './Lanes'
import { GW, SCALE, graphWidth } from './layout'
import { CELL_GROUPS, actorMeta, fmtCredits, fmtWhen } from './format'

const PAY3: BoardEntry = { repo: 'r1', key: 'PAY-3' }
const PAY2: BoardEntry = { repo: 'r1', key: 'PAY-2' }

function props(over: Partial<ViewProps> = {}): ViewProps {
  return { status: fx.status(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn(), pollMs: 60_000, ...over }
}

function renderBoard(entry: BoardEntry = PAY3, over: Partial<ViewProps> = {}, onBack?: () => void) {
  const p = props(over)
  render(<BoardPage entry={entry} onBack={onBack} {...p} />)
  return p
}

/** the board answers with this snapshot (a fresh copy per request) */
const boardRoute = (make: () => ReqBoard) => ({ [`GET ${API}/board/*`]: () => make() })
const boardCalls = (entry: BoardEntry = PAY3) => apiCalls.filter((c) => c.method === 'GET' && c.path === paths.board(entry.repo, entry.key))
const region = (name: string) => screen.getByRole('region', { name })
const loaded = () => screen.findByTestId('kt-graph')
const crumb = () => within(screen.getByRole('navigation', { name: '位置' }))

describe('需求看板', () => {
  test('the header: the requirement’s title, its key, state and branch; the crumb names the key', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const r = fx.board().row
    expect(screen.getByRole('button', { name: r.title })).toHaveClass('kt-run-title')
    expect(screen.getByTestId('br-board-key')).toHaveTextContent(r.key)
    expect(screen.getByText(r.state_label)).toBeInTheDocument()
    expect(screen.getByText(`${r.branch} ← main · ${r.owner}`)).toBeInTheDocument()
    expect(crumb().getByRole('button', { name: 'PAY-3' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '位置' })).toHaveTextContent(/需求看板$/)
    expect(screen.getByRole('button', { name: '跟随' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('此刻有人在做')).toBeNull() // live is false
    expect(apiCalls.find((c) => !c.path.startsWith(`${API}/overview`))).toMatchObject({ method: 'GET', path: `${API}/board/r1/PAY-3` })
  })

  test('the KPIs: checks passed, Lean’s stages and the approvals, a person’s acts, the steps of the way, credits', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const kpis = within(screen.getByRole('group', { name: '指标' }))
    expect(kpis.getByTestId('br-checks-counter')).toHaveAccessibleName(`检查通过 ${b.checks.passed}/${b.checks.total}`)
    expect(kpis.getByTestId('br-checks-counter')).toHaveTextContent('2/4')
    expect(kpis.getByTestId('br-checks-say')).toHaveTextContent('1 项没过')
    const lean = kpis.getByText('AI-DLC Lean').parentElement as HTMLElement
    expect(lean).toHaveAccessibleName('AI-DLC Lean：做完 4 · 跳过 4 · 在做：代码生成')   // the stage it works on is 在做, not 下一步
    expect(within(lean).getByTestId('br-lean-counter')).toHaveTextContent('4做完 · 跳过 4')
    expect(lean).toHaveTextContent('在做：代码生成')
    expect(lean).toHaveTextContent('批准 3退回 0拦下 1')
    // the person's acts: 3 approvals, and the answer they decided (D-3) counts as a judgment point too
    const people = kpis.getByText('人介入').parentElement as HTMLElement
    expect(people).toHaveTextContent('4次')
    expect(people).toHaveTextContent('判断点上 4（审批 3 · 回答 1） · 判断点之外 0')
    // 1 of the 10 actors is through (需求审批); 本机会话, 设计审批 and the question answerable here wait for the person
    expect(kpis.getByTestId('br-steps-counter')).toHaveTextContent(`1/${b.actors.length}`)
    expect(kpis.getByText('· 3 个等你', { exact: false })).toBeInTheDocument()
    expect(kpis.getAllByRole('button').map((x) => x.getAttribute('aria-label'))).toEqual(b.actors.map((a) => `${a.title}：${a.status === 'awaiting_approval' ? '等你' : actorMeta(a.status).label}`))
    const credits = kpis.getByText('credits').parentElement as HTMLElement
    expect(credits).toHaveTextContent(fmtCredits(b.credits.total))
    expect(credits).toHaveTextContent(`${b.sessions.length} 个会话合计`)
  })

  test('你要做的一步: every thing that waits for the person, one row each, the means beside it; nothing is sent', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const strip = region('你要做的一步')
    expect(strip).toHaveTextContent('3 件事等你')
    const steps = within(strip).getAllByTestId('br-next-step')
    // the question answerable right here comes first, then 验收's step (the line to type), then the tool call
    expect(steps.map((x) => x.dataset.do)).toEqual(['answer', 'approve', 'tool'])
    expect(steps[0]).toHaveTextContent(b.questions[0].question)
    expect(steps[1]).toHaveTextContent(b.accept.step.text)
    const line = within(steps[1]).getByTestId('type-line')
    expect(within(line).getByText(b.accept.step.line as string)).toHaveClass('br-mono')
    expect(line).toHaveAttribute('title', TYPE_IT_YOURSELF)
    fireEvent.click(within(line).getByRole('button', { name: '复制那一行' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('approve PLAN 5d1e7a90'))
    expect(await within(line).findByText('已复制')).toBeInTheDocument()
    fireEvent.click(within(line).getByRole('button', { name: '打开会话' }))
    expect(steps[2]).toHaveTextContent('会话里有一个工具调用等你批准')
    fireEvent.click(within(steps[2]).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual([b.accept.step.session_url, b.actors[0].session!.url])
    expect(apiCalls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  test('before acceptance the step strip is above the graph and 验收 under the lanes; at acceptance 验收 comes up', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const order = () => Array.from(screen.getByTestId('br-board').querySelectorAll('[data-testid="br-next"], [data-testid="kt-graph"], [data-testid="kt-lanes"], #br-accept')).map((e) => e.getAttribute('data-testid'))
    expect(order()).toEqual(['br-next', 'kt-graph', 'kt-lanes', 'br-accept'])
    cleanup()
    const b = fx.board()
    b.accept = { ...b.accept, state: 'waiting', step: { text: '等你验收：在 MR 上回答 D-3', who: '你', line: null, mr_url: 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/44', session_url: null } }
    b.row.waits = { ...b.row.waits, do: 'accept', where: 'mr', line: null }
    for (const a of b.actors) if (a.status === 'awaiting_approval') Object.assign(a, { status: 'done', line: null })
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    expect(order()).toEqual(['br-next', 'br-accept', 'kt-graph', 'kt-lanes'])
    expect(within(region('你要做的一步')).getByRole('link', { name: '去 MR 上验收 ↗' })).toHaveAttribute('href', b.accept.step.mr_url)
  })

  test('验收: the requirement, its 变更说明, what the checks say, who decided (in words), what it cost', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const card = region('验收')
    expect(card).toHaveTextContent('还没到验收')
    expect(card).toHaveTextContent(`需求${b.row.key} ${b.row.title}`)
    expect(within(card).getByTestId('accept-first')).toHaveTextContent(b.mr_desc.first as string)
    // the same sentence as the counter's, not a second count
    expect(within(card).getByTestId('accept-checks')).toHaveTextContent('1 项没过')
    expect(card).toHaveTextContent('人 1照 Brain 2没归类（「谁定的」没按规定写） 1')
    expect(card).not.toHaveTextContent('Who')
    expect(card).toHaveTextContent('金额列带币种，单独一列 currency · 一位组员')
    expect(card).not.toHaveTextContent('P-1A2B')
    expect(card).toHaveTextContent(`花了多少${fmtCredits(b.credits.total)} credits · ${b.sessions.length} 个会话`)
    expect(within(card).queryByTestId('accept-step')).toBeNull()
  })

  test('验收: 复制 beside 变更说明 copies the whole text', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const desc = within(region('验收')).getByText('变更说明', { exact: false })
    fireEvent.click(within(desc).getByRole('button', { name: '复制' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(fx.board().mr_desc.text))
    expect(await within(region('验收')).findByText('已复制')).toBeInTheDocument()
  })

  test('the graph: one node per actor, its state in data attributes and in words; a waiting actor has its chip', async () => {
    installFixtureRoutes()
    renderBoard()
    const graph = await loaded()
    const b = fx.board()
    const nodes = Array.from(graph.querySelectorAll<SVGGElement>('g.kt-node'))
    expect(nodes.map((n) => [n.dataset.role, n.dataset.status])).toEqual(b.actors.map((a) => [a.key, a.status]))
    for (const a of b.actors) {
      const node = nodes.find((n) => n.dataset.role === a.key) as SVGGElement
      expect(node).toHaveAttribute('role', 'button')
      expect(node).toHaveAttribute('aria-pressed', 'false')
      const name = node.getAttribute('aria-label') ?? ''
      for (const word of [a.title, a.sub, a.status === 'awaiting_approval' ? '等你' : actorMeta(a.status).label, a.doing]) expect(name).toContain(word)
    }
    // a line to type is said on the node itself
    expect(nodes.find((n) => n.dataset.role === 'design')).toHaveTextContent('打一行')
    expect(nodes.find((n) => n.dataset.role === 'local')).not.toHaveTextContent('打一行')
    // the two that wait for the person each get the chip naming the step, the words used everywhere
    expect(within(graph).getAllByTestId('kt-wait-chip').map((c) => c.getAttribute('aria-label'))).toEqual(['本机会话：去批准工具调用', '设计审批：去批准'])
    // a tool call to approve is approved in the session: its chip opens it
    fireEvent.click(within(graph).getByRole('button', { name: '本机会话：去批准工具调用' }))
    expect(navigations).toEqual([b.actors.find((a) => a.key === 'local')!.session!.url])
    // the dashed lines from the person run to the ones that wait for them
    expect(graph.querySelectorAll('.kt-cmd')).toHaveLength(2)
    expect(within(graph).getByTestId('kt-station')).toHaveAccessibleName('检查 2/4')
    expect(within(graph).getByTestId('kt-orch')).toHaveTextContent(b.person.owner as string)
    expect(within(graph).getByRole('note', { name: '图例' })).toHaveTextContent('等你')
  })

  test('a node’s card on hover: what it is, what it waits for, the line to type; 打开会话 opens its session', async () => {
    installFixtureRoutes()
    renderBoard()
    const graph = await loaded()
    const b = fx.board()
    const design = b.actors.find((a) => a.key === 'design')!
    fireEvent.mouseEnter(graph.querySelector('g.kt-node[data-role="design"]') as Element)
    const card = await screen.findByRole('dialog', { name: '设计审批做了什么' })
    expect(card).toHaveTextContent('设计审批等你')
    expect(card).toHaveTextContent(`是什么 ${design.sub}`)
    expect(card).toHaveTextContent(design.doing)
    for (const f of design.facts) expect(card).toHaveTextContent(f)
    expect(within(card).getByText(design.line as string).tagName).toBe('CODE')
    expect(within(card).queryByRole('button', { name: '打开会话' })).toBeNull() // no session of its own
    fireEvent.mouseLeave(graph.querySelector('g.kt-node[data-role="design"]') as Element)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '设计审批做了什么' })).toBeNull())

    fireEvent.mouseEnter(graph.querySelector('g.kt-node[data-role="local"]') as Element)
    const local = await screen.findByRole('dialog', { name: '本机会话做了什么' })
    fireEvent.click(within(local).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual([b.actors[0].session!.url])
  })

  test('a click on a node looks at that actor only, everywhere; a second click or Esc lets go', async () => {
    installFixtureRoutes()
    renderBoard()
    const graph = await loaded()
    const node = graph.querySelector('g.kt-node[data-role="design"]') as Element
    fireEvent.click(node)
    expect(node).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('navigation', { name: '位置' })).toHaveTextContent(/需求看板 · 设计审批$/)
    expect(screen.getByTestId('kt-focusbar')).toHaveTextContent('设计审批')
    const lane = (k: string) => screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === k) as HTMLElement
    expect(lane('design')).toHaveClass('is-focus')
    expect(lane('local')).toHaveClass('is-dim')
    // the feed shows the events that touch it
    const seqs = Array.from(screen.getByTestId('kt-feed').querySelectorAll('li[data-seq]')).map((li) => Number(li.getAttribute('data-seq')))
    expect(seqs).toEqual(fx.board().events.filter((e) => e.from === 'design' || e.to === 'design').map((e) => e.seq).reverse())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(node).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('kt-focusbar')).toBeNull()
    fireEvent.click(node)
    fireEvent.click(within(screen.getByTestId('kt-focusbar')).getByRole('button', { name: '看全部' }))
    expect(node).toHaveAttribute('aria-pressed', 'false')
  })

  test('the lanes: one per actor on the way, its state and what it waits for, the line to type in its lane', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const lanes = within(region('各环节的泳道'))
    const rows = lanes.getAllByTestId('kt-lane')
    expect(rows.map((l) => [l.dataset.role, l.dataset.status])).toEqual(b.actors.map((a) => [a.key, a.status]))
    expect(rows.map((l) => l.getAttribute('aria-label'))).toEqual(b.actors.map((a) => `${a.title}：${a.status === 'awaiting_approval' ? '等你' : actorMeta(a.status).label}`))
    const design = rows.find((l) => l.dataset.role === 'design') as HTMLElement
    const d = b.actors.find((a) => a.key === 'design')!
    expect(design).toHaveTextContent(`✋${d.doing}`)
    expect(design).not.toHaveTextContent('等你：等你')   // whom it waits on is said once
    expect(within(within(design).getByTestId('type-line')).getByText(d.line as string)).toBeInTheDocument()
    expect(within(design).getByRole('img')).toHaveAccessibleName(/^设计审批的时间线：/)
    const req = rows.find((l) => l.dataset.role === 'req') as HTMLElement
    expect(req).toHaveTextContent('✔ 完成')
    expect(within(req).getByRole('list', { name: '最近的记录' })).toHaveTextContent('你批准了需求')
    const bridge = b.actors.find((a) => a.key === 'bridge')!
    expect(rows.find((l) => l.dataset.role === 'bridge')).toHaveTextContent(`还没轮到：${bridge.doing}`)
    // only 本机会话 has a session to open
    const local = rows.find((l) => l.dataset.role === 'local') as HTMLElement
    expect(lanes.getAllByRole('button', { name: '打开会话 ›' })).toHaveLength(1)
    fireEvent.click(within(local).getByRole('button', { name: '打开会话 ›' }))
    expect(navigations).toEqual([b.actors[0].session!.url])
    expect(screen.queryByTestId('kt-lanes-out')).toBeNull()
  })

  test('an actor not on this requirement’s way has no lane: one line says what is not needed', async () => {
    const b = fx.board()
    for (const a of b.actors) if (a.key === 'bridge' || a.key === 'signer') Object.assign(a, { status: 'skipped', doing: '只在本机' })
    for (const a of b.actors) if (a.key === 'reflect') Object.assign(a, { status: 'skipped', doing: '没有可回写的' })
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    expect(screen.getAllByTestId('kt-lane').map((l) => l.dataset.role)).toEqual(['local', 'req', 'design', 'handover', 'runner', 'ci', 'release'])
    // the ones skipped for one reason together
    expect(screen.getByTestId('kt-lanes-out')).toHaveTextContent('这次不需要：桥、签名（只在本机）；回写 Brain（没有可回写的）')
    const bridge = screen.getByTestId('kt-graph').querySelector('g.kt-node[data-role="bridge"]')
    expect(bridge).toHaveAttribute('data-status', 'skipped')
    expect(bridge?.getAttribute('aria-label')).toContain('这次不需要')
  })

  test('the conveyor: every commit of the run branch in order, from the base to the branch head', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const belt = region('提交传送带')
    expect(belt).toHaveTextContent(`${b.belt.length} 次提交`)
    const chips = Array.from(belt.querySelectorAll<HTMLElement>('.kt-belt-chip'))
    expect(chips).toHaveLength(b.belt.length)
    b.belt.forEach((x, i) => {
      expect(chips[i]).toHaveTextContent(`本机${x.sha.slice(0, 8)} · ${x.files} 个文件 · `)
      expect(chips[i]).toHaveTextContent(x.text)
    })
    expect(chips[0]).toHaveTextContent('（只改记录）') // records_only
    expect(chips[1]).not.toHaveTextContent('（只改记录）')
    expect(belt.querySelector('.kt-belt-end.is-base')).toHaveTextContent(`从 ${b.base}`)
    expect(belt.querySelector('.kt-belt-end.is-head')).toHaveTextContent(b.branch as string)
    expect(belt).not.toHaveTextContent('已合并')
    // a chip looks at its actor
    fireEvent.click(within(chips[0]).getByRole('button'))
    expect(screen.getByTestId('kt-focusbar')).toHaveTextContent('本机会话')
  })

  test('the check wall: its groups in wall order, a cell per check with its state; focusing a cell says why', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const wall = region('检查墙')
    expect(wall).toHaveTextContent(`检查墙${b.checks.passed}/${b.checks.total}`)
    const groups = within(wall).getAllByRole('group')
    const present = CELL_GROUPS.filter((g) => b.checks.cells.some((c) => c.group === g.key))
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(present.map((g) => g.label))
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Lean 审批', '自动检查', '交接', 'Brain 和仓库'])
    present.forEach((g, i) => {
      const cells = within(groups[i]).getAllByTestId('kt-cell')
      expect(cells.map((c) => [c.dataset.case, c.dataset.status])).toEqual(b.checks.cells.filter((c) => c.group === g.key).map((c) => [c.id, c.status]))
    })
    // nothing hovered: the one that failed
    const inspect = within(wall).getByTestId('kt-inspect')
    expect(inspect).toHaveTextContent('1 项没过 · 还剩 发布审批、自动检查 · 没过的是 引用')
    const plan = b.checks.cells.find((c) => c.id === 'gate-PLAN')!
    const cell = within(wall).getByRole('button', { name: `${plan.name}：等你，${plan.detail}` })
    fireEvent.focus(cell)
    expect(inspect).toHaveTextContent(`✋ ${plan.name}${plan.detail}`)
    fireEvent.blur(cell)
    expect(inspect).toHaveTextContent('1 项没过 · 还剩 发布审批、自动检查 · 没过的是 引用')
  })

  test('the event feed: the trace newest first; Lean 细节 hides the many quiet steps', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const feed = region('事件')
    expect(feed).toHaveTextContent('来自 brain-kit 的记录')
    expect(feed).not.toHaveTextContent('trace')
    const items = () => Array.from(feed.querySelectorAll<HTMLElement>('li[data-seq]'))
    expect(items().map((li) => Number(li.dataset.seq))).toEqual(b.events.map((e) => e.seq).reverse())
    expect(items()[0]).toHaveTextContent(b.events[b.events.length - 1].text)
    expect(items()[items().length - 1]).toHaveTextContent(b.events[0].text)
    fireEvent.click(within(feed).getByRole('checkbox', { name: 'Lean 细节' }))
    expect(items().map((li) => Number(li.dataset.seq))).toEqual(b.events.filter((e) => !e.detail).map((e) => e.seq).reverse())
  })

  test('the open questions: one answerable here is at the top (回答 opens its form there); the others beside the wall', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const [here, lean] = b.questions.filter((q) => q.state === 'waiting' || q.state === 'open')
    const strip = region('你要做的一步')
    expect(within(strip).queryByTestId('question')).toBeNull()
    fireEvent.click(within(strip).getByRole('button', { name: '回答' }))
    expect(within(strip).getByTestId('question')).toHaveTextContent(here.question)
    expect(within(strip).getByRole('button', { name: '收起' })).toHaveAttribute('aria-expanded', 'true')
    const qs = region('等回答的问题')
    expect(within(qs).getByText('1')).toHaveClass('kt-badge')
    const cards = within(qs).getAllByTestId('question')
    expect(cards).toHaveLength(1)
    // the PLAN approval is Lean's: typed in the session, not answered here
    expect(cards[0]).toHaveTextContent(lean.question)
    expect(cards[0]).toHaveTextContent('这是 Lean 的代码生成计划审批请求：在会话里自己打批准那一行，这里不能回答。')
    expect(qs).not.toHaveTextContent(b.questions.find((q) => q.state === 'delivered')!.question)
  })

  test('it polls the board path and shows each new snapshot', async () => {
    let n = 0
    installFixtureRoutes(boardRoute(() => {
      const b = fx.board()
      if (++n >= 2) for (const a of b.actors) if (a.key === 'design') Object.assign(a, { status: 'merged', doing: '你批准了 · 计划', line: null })
      return b
    }))
    renderBoard(PAY3, { pollMs: 30 })
    await loaded()
    await waitFor(() => expect(boardCalls().length).toBeGreaterThanOrEqual(3))
    expect(apiCalls.every((c) => c.method === 'GET' && (c.path === paths.board('r1', 'PAY-3') || c.path === paths.overview('all')))).toBe(true)
    await waitFor(() => expect(screen.getByTestId('kt-graph').querySelector('g.kt-node[data-role="design"]')).toHaveAttribute('data-status', 'merged'))
    expect(screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === 'design')).toHaveAttribute('data-status', 'merged')
  })

  test('a failed refresh keeps the last board and says so', async () => {
    let n = 0
    installFixtureRoutes(boardRoute(() => {
      if (++n >= 2) throw apiError(500, 'internal', '读不到 trace')
      return fx.board()
    }))
    renderBoard(PAY3, { pollMs: 30 })
    await loaded()
    expect(await screen.findByRole('alert')).toHaveTextContent('刷新没成：读不到 trace（500），显示的是上一次拿到的数据')
    expect(screen.getByTestId('kt-graph')).toBeInTheDocument()
  })

  test('the 详情 buttons go to the requirement’s 需求详情, from the board; 交付总览 and ← 返回 go back', async () => {
    installFixtureRoutes()
    const onBack = vi.fn()
    const p = renderBoard({ ...PAY3, from: 'item' }, {}, onBack)
    await loaded()
    const item = { kind: 'item', repo: 'r1', key: 'PAY-3', from: 'board' }
    fireEvent.click(screen.getByRole('button', { name: '需求详情 ↗' }))
    expect(p.go).toHaveBeenLastCalledWith(item)
    fireEvent.click(screen.getByRole('button', { name: fx.board().row.title }))
    expect(p.go).toHaveBeenLastCalledWith(item)
    fireEvent.click(crumb().getByRole('button', { name: 'PAY-3' }))
    expect(p.go).toHaveBeenLastCalledWith(item)
    expect(p.go).toHaveBeenCalledTimes(3)
    // the crumb's first step is the way back, named as ← 返回 names it
    fireEvent.click(crumb().getByRole('button', { name: '需求详情' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '← 返回需求详情' }))
    expect(onBack).toHaveBeenCalledTimes(2)
    expect(p.go).toHaveBeenCalledTimes(3)
    expect(p.replace).not.toHaveBeenCalled()
  })

  test('opened from 待办: the crumb and ← 返回 both say 待办; opened from nowhere, the crumb starts at 交付总览', async () => {
    installFixtureRoutes()
    const onBack = vi.fn()
    renderBoard({ ...PAY3, from: 'todo' }, {}, onBack)
    await loaded()
    expect(screen.getByRole('navigation', { name: '位置' })).toHaveTextContent(/^待办›PAY-3›需求看板$/)
    fireEvent.click(crumb().getByRole('button', { name: '待办' }))
    fireEvent.click(screen.getByRole('button', { name: '← 返回待办' }))
    expect(onBack).toHaveBeenCalledTimes(2)
    cleanup()
    const p = renderBoard()
    await loaded()
    fireEvent.click(crumb().getByRole('button', { name: '交付总览' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'overview' })
    expect(screen.queryByRole('button', { name: /^← 返回/ })).toBeNull()
  })

  test('跟随 scrolls to the actor that moved last', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView)
    scroll.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '跟随' }))
    expect(screen.getByRole('button', { name: '跟随' })).toHaveAttribute('aria-pressed', 'true')
    // 本机会话 and 设计审批 wait for the person; 本机会话's state is the newer
    const local = screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === 'local')
    await waitFor(() => expect(scroll.mock.contexts).toContain(local))
  })

  test('a board GET that fails says why, in an alert', async () => {
    installFixtureRoutes(boardRoute(() => { throw apiError(500, 'internal', '读不到 trace') }))
    renderBoard()
    expect(await screen.findByRole('alert')).toHaveTextContent(/^读不到 trace（500）$/)
    expect(screen.queryByTestId('kt-graph')).toBeNull()
    expect(screen.queryByRole('region', { name: '验收' })).toBeNull()
  })

  test('a requirement the repo does not have (404): which repo by its name, what to do, back to 交付总览; no repo id, no HTTP code', async () => {
    installFixtureRoutes(boardRoute(() => { throw apiError(404, 'not_found', '这个仓库里没有 PAY-9') }))
    const p = renderBoard({ repo: 'r1', key: 'PAY-9' })
    const card = await screen.findByRole('region', { name: '没有这个需求' })
    expect(card).toHaveTextContent('shop-pay 仓库里没有 PAY-9')
    expect(card).toHaveTextContent('做什么：在上面「切换需求」里换一个，或者回交付总览找。')
    expect(screen.getByTestId('br-board')).not.toHaveTextContent(/404|r1 ·/)
    expect(screen.queryByTestId('kt-graph')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: '回交付总览' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'overview', repo: 'r1' })
    expect(boardCalls({ repo: 'r1', key: 'PAY-9' })).toHaveLength(1)
    cleanup()
    // opened from 待办: back there, as the crumb says
    const back = vi.fn()
    renderBoard({ repo: 'r1', key: 'PAY-9', from: 'todo' }, {}, back)
    fireEvent.click(within(await screen.findByRole('region', { name: '没有这个需求' })).getByRole('button', { name: '回待办' }))
    expect(back).toHaveBeenCalledTimes(1)
  })

  test('a backend without the /board route (a 404 without an error body) is the same missing state', async () => {
    const routes = fixtureRoutes()
    delete routes[`GET ${API}/board/*`]
    setApiRoutes(routes)
    renderBoard()
    expect(await screen.findByRole('region', { name: '没有这个需求' })).toHaveTextContent('shop-pay 仓库里没有 PAY-3')
  })

  test('the loading line while the first snapshot is on its way', async () => {
    let release: (b: ReqBoard) => void = () => {}
    installFixtureRoutes(boardRoute(() => new Promise<ReqBoard>((r) => (release = r)) as unknown as ReqBoard))
    renderBoard()
    expect(screen.getByText('正在读取…')).toBeInTheDocument()
    await waitFor(() => expect(boardCalls()).toHaveLength(1))
    expect(screen.getByText('正在读取…')).toBeInTheDocument()
    release(fx.board())
    await loaded()
    expect(screen.queryByText('正在读取…')).toBeNull()
  })
})

const H = 3600

/** PAY-3 as an idle session that waits for the person to talk (UI问题清单 #2, #4). */
function idle(): ReqBoard {
  const b = fx.board()
  const since = b.at - 11 * H - 30 * 60
  b.row.waits = { who: 'you', text: '会话空着：轮到你回话', line: null, raw: '', do: 'reply', since, where: 'session', review: false }
  b.row.lean = { ...b.row.lean, stage: 'release', stage_label: '发布', stage_n: 11, stage_state: 'todo', done: 10, done_n: 4, skipped_n: 6, next: { id: 'release', label: '发布', n: 11 } }
  b.accept.step = { text: '构建和测试做完了，下一步是发布：在会话里让它接着做', who: '你', line: null, mr_url: null, session_url: '/chat?sid=brain-PAY-3-7f3a' }
  b.questions = []
  b.person = { ...b.person, doing: '会话空着：轮到你回话' }
  for (const a of b.actors) {
    a.marks = a.marks.filter((m) => m.at <= since)
    a.spans = a.spans.filter((x) => x.a <= since).map((x) => ({ ...x, b: x.b === null || x.b > since ? since : x.b }))
    if (a.key === 'design') Object.assign(a, { status: 'done', line: null, doing: '你批准了 · 设计' })
    if (a.key === 'local') Object.assign(a, { doing: '会话空着：轮到你回话', since, spans: [{ a: b.started_at!, b: since, kind: 'work' }, { a: since, b: null, kind: 'wait' }] })
  }
  b.events = b.events.filter((e) => e.at <= since)
  b.belt = b.belt.filter((x) => x.at <= since)
  return b
}

/** PAY-3 waiting for product's answer on the MR, after the hand-over. */
function forProduct(): ReqBoard {
  const b = fx.board()
  b.row.waits = { who: 'product', text: '停在 D-2：等产品在 MR 上回答', line: null, raw: '', do: 'answer', since: b.at - H, where: 'mr' }
  b.accept.step = { text: '停在 D-2：等产品在 MR 上回答', who: '产品', line: null, mr_url: 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/41', session_url: null }
  b.person = { ...b.person, doing: '停在 D-2：等产品在 MR 上回答' }
  b.questions = []
  for (const a of b.actors) {
    if (a.key === 'local') Object.assign(a, { status: 'done', line: null, doing: '交给运行机了' })
    if (a.key === 'design') Object.assign(a, { status: 'merged', line: null, doing: '你批准了 · 设计' })
    if (a.key === 'runner') Object.assign(a, { status: 'awaiting_approval', doing: '停在 D-2：等产品在 MR 上回答', since: b.at - H })
  }
  return b
}

/** A repo done only on this machine: the runner's part is off the way. */
function localOnly(b: ReqBoard = fx.board()): ReqBoard {
  b.row.local_only = true
  b.direct = true
  for (const a of b.actors) if (['handover', 'bridge', 'signer', 'runner'].includes(a.key)) Object.assign(a, { status: 'skipped', doing: '这次不需要：这个仓库只在本机做', line: null })
  return b
}

describe('需求看板 · 轮到谁、做什么', () => {
  test('a claimed requirement: 开工 opens 开需求 with its key and title; no English error about a run it does not have yet', async () => {
    const b = fx.board()
    Object.assign(b.row, { state: 'claimed', state_label: '已认领' })
    b.error = 'brainkit.trace 读不出这个需求：runs/PAY-3/run.json not found in working tree (a merged run: --ref origin/main)'
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    const p = renderBoard()
    const intro = await screen.findByTestId('br-board-intro')
    expect(screen.queryByTestId('br-board-problem')).toBeNull()
    expect(screen.getByTestId('br-board')).not.toHaveTextContent('not found')
    fireEvent.click(within(intro).getByRole('button', { name: '开工 PAY-3' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'new', repo: 'r1', key: 'PAY-3', title: b.row.title })
  })

  test('someone else’s claim: it says whose it is and waits for them; no 开工', async () => {
    const b = fx.board()
    Object.assign(b.row, { state: 'claimed', state_label: '已认领', owner: 'carol' })
    b.person = { ...b.person, owner: 'carol', me: false }
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    const intro = await screen.findByTestId('br-board-intro')
    expect(within(intro).getByTestId('br-intro-start')).toHaveTextContent('carol 认领的，等 carol 开工')
    expect(screen.queryByRole('button', { name: /^开工/ })).toBeNull()
  })

  test('a board brain-kit could not read whole: one Chinese sentence and what to do, its own words under 细节', async () => {
    const b = fx.board()
    b.error = 'brainkit.trace 读不出这个需求：runs/PAY-3/run.json not found in working tree'
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    const banner = screen.getByTestId('br-board-problem')
    expect(banner).toHaveTextContent('这个需求的运行记录没读全')
    expect(banner).toHaveTextContent('做什么：')
    const raw = within(banner).getByText('细节').closest('details') as HTMLElement
    expect(raw).not.toHaveAttribute('open')
    expect(raw).toHaveTextContent('run.json not found in working tree')
  })

  test('an idle session: the step says what to say and where, 打开会话 right there; the lane draws the wait as a wait', async () => {
    const b = idle()
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    const graph = await loaded()
    const strip = region('你要做的一步')
    expect(strip).toHaveTextContent('已经等了 11 小时 30 分')
    expect(strip).toHaveTextContent(b.accept.step.text)
    fireEvent.click(within(strip).getByRole('button', { name: '打开会话' }))
    // the chip under the session says the same step and opens the session too, never 去回答
    fireEvent.click(within(graph).getByRole('button', { name: '本机会话：去回话' }))
    expect(navigations).toEqual([b.accept.step.session_url, b.actors[0].session!.url])
    expect(graph).not.toHaveTextContent('去回答')
    const lane = screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === 'local') as HTMLElement
    expect(lane).toHaveTextContent('⏱ 等了 11 小时 30 分')
    expect(within(lane).getByRole('img')).toHaveAccessibleName(/等你 11 小时 30 分$/)
    expect(lane.querySelector('.kt-track-span.is-wait.is-live')).not.toBeNull()
    expect(lane.querySelector('.kt-track-span.is-work.is-live')).toBeNull()
    // the axis ends at the last activity; the eleven quiet hours are drawn short at its end
    expect(screen.getByTestId('kt-axis-tail')).toHaveTextContent('之后 11 小时 30 分')
    expect(screen.getByTestId('kt-axis-tail')).toHaveAttribute('title', '最后一次动静以后又过了 11 小时 30 分，一直在等：这一段画短了')
  })

  test('waiting for product: 等产品, never 等你; no chip, no dashed line, nothing blinks; the strip says it is not your turn', async () => {
    const b = forProduct()
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    const graph = await loaded()
    const runner = graph.querySelector('g.kt-node[data-role="runner"]') as SVGGElement
    expect(runner).toHaveTextContent('等产品')
    expect(runner).toHaveClass('is-other')
    expect(runner.querySelector('.kt-node-halo')).toBeNull()
    expect(graph.querySelectorAll('.kt-cmd')).toHaveLength(0)
    expect(within(graph).queryAllByTestId('kt-wait-chip')).toHaveLength(0)
    expect(graph.querySelector('g.kt-node')?.closest('svg')).not.toHaveTextContent('等你')
    expect(screen.getByTestId('br-next')).toHaveTextContent('此刻不用你做什么停在 D-2：等产品在 MR 上回答')
    expect(screen.getByRole('group', { name: '指标' })).toHaveTextContent('1 个等产品')
    const lane = screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === 'runner') as HTMLElement
    expect(lane).toHaveAttribute('aria-label', '运行机：等产品')
  })

  test('a refused hand-over: why first, then what to do and where (the command to copy), the bridge’s words under 细节', async () => {
    const b = fx.board()
    Object.assign(b.row, { state: 'rejected', state_label: '接手被拒' })
    b.row.waits = { who: 'you', text: '接手被拒：标签是 bob 打的，不是负责人 alice', line: null, raw: "label 'ai-handoff' was added by bob, not by the branch owner alice", do: 'redo_handoff', since: b.at - H, where: null }
    b.accept.step = { text: '改好后在分支上重新 brain handoff（它提交交接、推送并打标签）', who: '你', line: null, mr_url: 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/46', session_url: '/chat?sid=brain-PAY-3-7f3a' }
    b.questions = []
    for (const a of b.actors) if (a.key === 'design') Object.assign(a, { status: 'merged', line: null })
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    const strip = region('你要做的一步')
    expect(strip).toHaveTextContent('为什么被拒标签是 bob 打的，不是负责人 alice')
    expect(strip).toHaveTextContent(`怎么办${b.accept.step.text}`)
    expect(strip).toHaveTextContent('在哪做在这个需求的工作目录里开一个终端，敲：brain handoff')
    fireEvent.click(within(strip).getByRole('button', { name: '复制命令' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`cd "${b.row.worktree}" && brain handoff`))
    expect(within(strip).getByText('细节').closest('details')).toHaveTextContent('was added by bob')
    expect(within(strip).getByRole('link', { name: '看 MR ↗' })).toHaveAttribute('href', b.accept.step.mr_url)
  })

  test('a refused hand-over as the backend says it (the reason, then what to do): the reason once; no wait time it does not know', async () => {
    const b = fx.board()
    Object.assign(b.row, { state: 'rejected', state_label: '接手被拒' })
    b.row.waits = { who: 'you', text: '接手被拒：标签是 bob 打的，不是负责人 alice', line: null, raw: '', do: 'redo_handoff', since: null, where: 'session' }
    b.accept.step = { text: '接手被拒：标签是 bob 打的，不是负责人 alice\n改好后，在终端里、这个需求的分支上重新跑 brain handoff', who: '你', line: null, mr_url: null, session_url: null }
    b.questions = []
    for (const a of b.actors) if (a.key === 'design') Object.assign(a, { status: 'merged', line: null })
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    const strip = region('你要做的一步')
    expect(strip.textContent!.match(/标签是 bob 打的/g)).toHaveLength(1)
    expect(strip).toHaveTextContent('怎么办改好后，在终端里、这个需求的分支上重新跑 brain handoff')
    expect(strip).not.toHaveTextContent('已经等了')
  })

  test('an idle session whose next step is Lean’s review in a new session: that step, 开审查会话 right there, the line it says folded', async () => {
    const said = 'Review intent 261107-refund-export against its requirements, design and plans, using the diff, and write construction/build-and-test/review.md.'
    const b = idle()
    b.row.waits = { ...b.row.waits, text: '构建测试做完了，下一步是发布：先开一个新会话做审查（这个会话写了代码，不能自己审）', review: false }
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    // the backend's judgment, not the words
    expect(within(region('你要做的一步')).queryByRole('button', { name: '开审查会话' })).toBeNull()
    cleanup()
    b.row.waits.review = true
    b.accept.step = { ...b.accept.step, line: said }
    installFixtureRoutes({ ...boardRoute(() => structuredClone(b)), [`POST ${API}/requirements/r1/PAY-3/session`]: () => ({ ok: true, slot: 'brain-PAY-3-r2', url: '/chat?sid=brain-PAY-3-r2' }) })
    renderBoard()
    await loaded()
    const strip = region('你要做的一步')
    expect(strip).toHaveTextContent('先开一个新会话做审查（这个会话写了代码，不能自己审）')
    expect(strip).toHaveTextContent('开审查会话会把 Lean 的审查要求发给新会话')
    expect(within(strip).queryByTestId('type-line')).toBeNull()
    const fold = within(strip).getByTestId('review-say')
    expect(fold.tagName).toBe('DETAILS')
    expect(fold).toHaveTextContent(`细节：开审查会话对新会话说的那一句${said}`)
    fireEvent.click(within(fold).getByRole('button', { name: '复制那一句' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(said))
    // the chip under the session names the same step and brings the strip, not the session that wrote the code
    fireEvent.click(within(screen.getByTestId('kt-graph')).getByRole('button', { name: '本机会话：开审查会话' }))
    expect(navigations).toEqual([])
    fireEvent.click(within(strip).getByRole('button', { name: '开审查会话' }))
    await waitFor(() => expect(apiCalls.find((c) => c.method === 'POST')).toMatchObject({ body: { trust: true, kickoff: true, review: true } }))
    await waitFor(() => expect(navigations).toEqual(['/chat?sid=brain-PAY-3-r2']))
  })

  test('a repo done only here: its runner part is one narrow 「这次不需要」 band, no node of it; the top says so', async () => {
    installFixtureRoutes(boardRoute(() => structuredClone(localOnly())))
    renderBoard()
    const graph = await loaded()
    const band = within(graph).getByTestId('kt-phase-folded')
    expect(band).toHaveTextContent('2 运行机这次不需要只在本机做')
    for (const k of ['handover', 'bridge', 'signer', 'runner']) expect(graph.querySelector(`g.kt-node[data-role="${k}"]`)).toBeNull()
    expect(graph.querySelector('g.kt-node[data-role="ci"]')).not.toBeNull()
    expect(screen.getByTestId('br-local-only')).toHaveTextContent('这个仓库只在本机做')
    expect(screen.getByTestId('kt-lanes-out')).toHaveTextContent(/^这次不需要：交接、桥、签名、运行机（这个仓库只在本机做）$/)
  })

  test('a claimed requirement of a repo done only here: its introduction is the way it will go, without the runner', async () => {
    const b = localOnly()
    Object.assign(b.row, { state: 'claimed', state_label: '已认领' })
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    const intro = await screen.findByTestId('br-board-intro')
    expect(intro).not.toHaveTextContent('运行机')
    expect(intro).not.toHaveTextContent('桥')
    expect(intro).toHaveTextContent('发布审批')
  })

  test('the checks: what is left is said (目前 … 都过 · 还剩 …), not 全过; the 14 days after the merge are 观察中, nobody’s turn', async () => {
    const b = fx.board()
    b.checks.cells = b.checks.cells.map((c) => (c.id === 'brain-cite' || c.id === 'gate-PLAN' ? { ...c, status: 'pass' } : c))
    Object.assign(b.checks, { passed: 4, failed: 0, total: 4, todo: ['发布审批'] })
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    expect(screen.getByTestId('br-checks-say')).toHaveTextContent('目前 4 项都过 · 还剩 发布审批')
    expect(screen.getByTestId('kt-station')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '指标' }).querySelector('.kt-kpi-tests')).not.toHaveClass('is-green')
    cleanup()
    const m = fx.boardMerged()
    m.checks.cells = m.checks.cells.map((c) => (c.id === 'after-14d' ? { ...c, status: 'watch' } : c))
    Object.assign(m.checks, { total: 9 })
    installFixtureRoutes(boardRoute(() => structuredClone(m)))
    renderBoard(PAY2)
    await loaded()
    // the backend's todo names the 14 days too: they are said once, as 在观察, not as something left to do
    expect(screen.getByTestId('br-checks-say')).toHaveTextContent(/^9 项全过 · 1 项在观察$/)
    expect(screen.getByRole('group', { name: '指标' })).not.toHaveTextContent('等人')
    expect(within(region('检查墙')).getByRole('button', { name: /^合并后 14 天没有回滚或热修：观察中，/ })).toHaveAttribute('data-status', 'watch')
  })

  test('the wall asks to fix the repo’s kit: 去设置修 right there opens 设置', async () => {
    const b = fx.board()
    b.checks.cells.push({ id: 'kit-0', group: 'brain', label: 'kit', name: 'kit 文件', status: 'fail', at: null, detail: '仓库里的 kit 是旧的：重装 kit 文件', actor: null })
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    const p = renderBoard()
    await loaded()
    const fix = screen.getByTestId('kt-wall-fix')
    expect(fix).toHaveTextContent('仓库的 kit 有 1 处要修')
    fireEvent.click(within(fix).getByRole('button', { name: '去设置修 ›' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'settings' })
  })

  test('Lean’s progress the one way: done, skipped, the next stage lit; the session’s lane says the same', async () => {
    installFixtureRoutes(boardRoute(() => structuredClone(idle())))
    renderBoard()
    await loaded()
    const lean = screen.getByText('AI-DLC Lean').parentElement as HTMLElement
    expect(lean).toHaveAccessibleName('AI-DLC Lean：做完 4 · 跳过 6 · 下一步：发布')
    expect(lean.querySelectorAll('.kt-segs .is-pass')).toHaveLength(4)
    expect(lean.querySelectorAll('.kt-segs .is-skip')).toHaveLength(6)
    expect(lean.querySelectorAll('.kt-segs .is-next')).toHaveLength(1)
    const lane = screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === 'local') as HTMLElement
    expect(within(lane).getByRole('list', { name: '事实' })).toHaveTextContent('Lean 做完 4 · 跳过 6 · 下一步：发布')
    expect(lane).not.toHaveTextContent('10/11')
  })

  test('the lanes show what each one changed: the files and their lines, the commits', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const lane = screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === 'local') as HTMLElement
    const changes = within(lane).getByTestId('kt-changes')
    const head = changes.querySelector('.kt-files-head') as HTMLElement
    expect(head.querySelector('.kt-add')).toHaveTextContent(/^\+323$/)
    expect(head.querySelector('.kt-del')).toHaveTextContent(/^−21$/)
    expect(head).toHaveTextContent('7 个文件 · 提交 4 次')
    // a file two commits changed is one row, its lines summed; the biggest first, five shown
    const rows = Array.from(changes.querySelectorAll<HTMLElement>('.kt-files li:not(.kt-more)'))
    expect(rows.map((r) => r.querySelector('.kt-file-path')!.textContent)).toEqual([
      'aidlc-docs/261107-refund-export/audit.md', 'aidlc-docs/261107-refund-export/inception/application-design/application-design.md',
      'src/refund/api.py', 'tests/test_refund.py', 'src/refund/jobs.py',
    ])
    expect(rows[0]).toHaveTextContent('+104 −14')
    expect(rows[3]).toHaveTextContent('+31 −7')
    expect(changes).toHaveTextContent('还有 2 个文件')
    // the newest commits, newest first
    expect(within(changes).getByRole('list', { name: '提交' })).toHaveTextContent(/^61ddbc30PAY-3：refund-api 的代码计划193239b7PAY-3：refund-export：分批写 CSV93b2dea5PAY-3：导出接口的骨架还有 1 次提交/)
  })

  test('a backend that read no files: each commit says how many files it changed', async () => {
    const b = fx.board()
    for (const x of b.belt) delete x.changes
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    const lane = screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === 'local') as HTMLElement
    const changes = within(lane).getByTestId('kt-changes')
    expect(changes.querySelector('.kt-files-head')).toHaveTextContent(/^改动提交 4 次$/)
    expect(within(changes).getByRole('list', { name: '提交' })).toHaveTextContent('61ddbc30PAY-3：refund-api 的代码计划1 个文件 · 只改记录')
  })

  test('small words: one credits number everywhere, 运行记录里的合计 without sessions; +N for more Brain entries; one verify round is said, not drawn', async () => {
    const b = fx.board()
    b.credits = { ...b.credits, total: 36.954 }
    b.sessions = []
    b.brain = { ...b.brain, cited: ['P-PAY-2-1', 'T-PAY-2-1', 'T-12', 'T-13', 'T-14', 'T-15'] }
    b.checks.history = [{ at: b.at - H, passed: 3, failed: 0 }]
    b.mr_desc = { ...b.mr_desc, first: '给 `calc.py` 加乘法（D01#S002 · 097f2e9e）' }
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    const graph = await loaded()
    const credits = within(screen.getByRole('group', { name: '指标' })).getByText('credits').parentElement as HTMLElement
    expect(credits).toHaveTextContent('37.0运行记录里的合计')
    expect(region('验收')).toHaveTextContent('花了多少37.0 credits · 运行记录里的合计')
    expect(within(graph).getByTestId('kt-roster')).toHaveTextContent('+2 条')
    expect(region('检查墙').querySelector('.kt-spark')).toBeNull()
    expect(region('检查墙')).toHaveTextContent('自动检查跑了 1 次：3 项过了')
    const first = within(region('验收')).getByTestId('accept-first')
    expect(first).toHaveTextContent('给 calc.py 加乘法')
    expect(within(first).getByText('calc.py').tagName).toBe('CODE')
    expect(first).not.toHaveTextContent('D01#S002')
  })

  test('the owner’s card on hover has the whole sentence their node can only start', async () => {
    installFixtureRoutes()
    renderBoard()
    const graph = await loaded()
    fireEvent.mouseEnter(within(graph).getByTestId('kt-orch'))
    const card = await screen.findByRole('dialog', { name: '负责人' })
    expect(card).toHaveTextContent(`你（alice）等你${fx.board().person.doing}`)
  })

  test('the top bar says 打开会话, the word used everywhere', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    expect(within(screen.getByTestId('br-board').querySelector('.kt-top') as HTMLElement).getByRole('button', { name: '打开会话' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '本机会话' })).toBeNull()
  })
})

test('the time axis names each tick once: half hours are said, not rounded onto the next hour', () => {
  expect([0, 1800, 3600, 5400, 7200, 3 * 3600, 86400 + 6 * 3600].map(tickLabel)).toEqual(['0', '30 分', '1 小时', '1 小时 30 分', '2 小时', '3 小时', '1 天 6 时'])
})

describe('需求看板 · 回放', () => {
  const merged = () => installFixtureRoutes(boardRoute(() => fx.boardMerged()))
  const bar = () => screen.getByRole('group', { name: '回放' })
  const feedSeqs = () => Array.from(screen.getByTestId('kt-feed').querySelectorAll('li[data-seq]')).length

  test('▶ 回放 opens the controls: playing, the scrubber, 1× 2× 4×, 退出回放', async () => {
    merged()
    renderBoard(PAY2)
    await loaded()
    expect(screen.queryByRole('group', { name: '回放' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '▶ 回放' }))
    const rp = within(bar())
    expect(rp.getByRole('button', { name: '暂停' })).toBeInTheDocument()
    expect(rp.getByRole('slider', { name: '回放进度' })).toBeInTheDocument()
    expect(rp.getAllByRole('radio').map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([['1×', 'true'], ['2×', 'false'], ['4×', 'false']])
    expect(rp.getByRole('button', { name: '退出回放' })).toBeInTheDocument()
    expect(bar()).toHaveTextContent('按记录重放：安静的时段缩短了，不调用 agent')
    expect(screen.getByRole('navigation', { name: '位置' })).toHaveTextContent(/需求看板 · 回放$/)
    expect(screen.queryByRole('button', { name: '▶ 回放' })).toBeNull()
    // it starts at the beginning: fewer events than the whole record
    expect(feedSeqs()).toBeLessThan(fx.boardMerged().events.length)
  })

  test('暂停 and 播放; the speeds are a radio group', async () => {
    merged()
    renderBoard(PAY2)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: '▶ 回放' }))
    const rp = within(bar())
    fireEvent.click(rp.getByRole('button', { name: '暂停' }))
    expect(rp.getByRole('button', { name: '播放' })).toBeInTheDocument()
    fireEvent.click(rp.getByRole('radio', { name: '4×' }))
    expect(rp.getByRole('radio', { name: '4×' })).toHaveAttribute('aria-checked', 'true')
    expect(rp.getByRole('radio', { name: '1×' })).toHaveAttribute('aria-checked', 'false')
    expect(rp.getByRole('radio', { name: '4×' })).toHaveClass('is-on')
    fireEvent.click(rp.getByRole('radio', { name: '2×' }))
    expect(rp.getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    fireEvent.click(rp.getByRole('button', { name: '播放' }))
    expect(rp.getByRole('button', { name: '暂停' })).toBeInTheDocument()
  })

  test('the scrubber: to the end shows the board as it ended, to the start the beginning', async () => {
    merged()
    renderBoard(PAY2)
    await loaded()
    const b = fx.boardMerged()
    fireEvent.click(screen.getByRole('button', { name: '▶ 回放' }))
    const rp = within(bar())
    fireEvent.click(rp.getByRole('button', { name: '暂停' }))
    const scrub = rp.getByRole('slider', { name: '回放进度' }) as HTMLInputElement
    fireEvent.change(scrub, { target: { value: scrub.max } })
    expect(scrub.value).toBe(scrub.max)
    expect(rp.getByRole('button', { name: '从头再放' })).toBeInTheDocument()
    expect(bar()).toHaveTextContent('放完了：下面是这个需求最后的样子')
    expect(feedSeqs()).toBe(b.events.length)
    expect(screen.getAllByTestId('kt-lane').map((l) => l.dataset.status)).toEqual(b.actors.map((a) => a.status))
    fireEvent.change(scrub, { target: { value: '0' } })
    expect(scrub.value).toBe('0')
    expect(bar()).toHaveTextContent('第 0 秒')
    expect(feedSeqs()).toBe(b.events.filter((e) => e.at <= Math.min(b.started_at ?? Infinity, ...b.events.map((x) => x.at))).length)
    expect(rp.getByRole('button', { name: '播放' })).toBeInTheDocument()
  })

  test('退出回放 goes back to the live board; the replay sends nothing; the URL says replay=1 while it replays', async () => {
    merged()
    const p = renderBoard(PAY2)
    await loaded()
    const b = fx.boardMerged()
    fireEvent.click(screen.getByRole('button', { name: '▶ 回放' }))
    expect(p.replace).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-2', replay: true })
    fireEvent.click(within(bar()).getByRole('button', { name: '退出回放' }))
    expect(p.replace).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-2' })
    expect(screen.queryByRole('group', { name: '回放' })).toBeNull()
    expect(screen.getByRole('button', { name: '▶ 回放' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '位置' })).toHaveTextContent(/需求看板$/)
    expect(feedSeqs()).toBe(b.events.length)
    expect(screen.getAllByTestId('kt-lane').map((l) => l.dataset.status)).toEqual(b.actors.map((a) => a.status))
    expect(apiCalls.filter((c) => c.method !== 'GET')).toEqual([])
    expect(p.replace).toHaveBeenCalledTimes(2)
    expect(p.go).not.toHaveBeenCalled()
  })

  test('while it plays nothing can be done: no line to type, no step, no questions, no chips under the nodes', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    expect(screen.getAllByTestId('type-line')).toHaveLength(2) // 验收's step and 设计审批's lane
    fireEvent.click(screen.getByRole('button', { name: '▶ 回放' }))
    expect(bar()).toBeInTheDocument()
    expect(screen.queryAllByTestId('type-line')).toHaveLength(0)
    expect(screen.queryByTestId('accept-step')).toBeNull()
    expect(screen.queryByRole('region', { name: '等回答的问题' })).toBeNull()
    expect(screen.queryAllByTestId('kt-wait-chip')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '本机会话' })).toBeNull()
    fireEvent.click(within(bar()).getByRole('button', { name: '退出回放' }))
    expect(screen.getAllByTestId('type-line')).toHaveLength(2)
    expect(region('等回答的问题')).toBeInTheDocument()
  })

  test('every counter rewinds: Lean from its stage events, credits and citations not shown; an unfinished one ends 「放到现在了」', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: '▶ 回放' }))
    fireEvent.click(within(bar()).getByRole('button', { name: '暂停' }))
    fireEvent.change(within(bar()).getByRole('slider', { name: '回放进度' }), { target: { value: '0' } })
    const kpis = within(screen.getByRole('group', { name: '指标' }))
    expect(kpis.getByTestId('br-lean-counter')).toHaveTextContent('0做完')
    expect(kpis.getByText('credits').parentElement).toHaveTextContent('—回放时不算')
    expect(within(screen.getByTestId('kt-roster')).getByText('引用 —')).toBeInTheDocument()
    const slider = within(bar()).getByRole('slider', { name: '回放进度' })
    fireEvent.change(slider, { target: { value: slider.getAttribute('max') } })
    expect(bar()).toHaveTextContent('放到现在了：它还在进行')
  })

  test('?replay=1 opens the board replaying, scrolled to the graph', async () => {
    merged()
    renderBoard({ ...PAY2, replay: true })
    await loaded()
    expect(await screen.findByRole('group', { name: '回放' })).toBeInTheDocument()
    expect(within(bar()).getByRole('button', { name: '暂停' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '位置' })).toHaveTextContent(/需求看板 · 回放$/)
    expect(screen.queryByRole('button', { name: '▶ 回放' })).toBeNull()
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView)
    await waitFor(() => expect(scroll.mock.contexts).toContain(screen.getByTestId('kt-graph')))
  })

  test('?at= opens the replay stopped at that moment (a decision, a part of 价值流); 退出回放 drops the moment from the URL', async () => {
    merged()
    const b = fx.boardMerged()
    const at = b.events.find((e) => e.kind === 'approve' && e.to === 'design')!.at
    const p = renderBoard({ ...PAY2, from: 'item', at })
    await loaded()
    const rp = within(await screen.findByRole('group', { name: '回放' }))
    expect(rp.getByRole('button', { name: '播放' })).toBeInTheDocument()
    expect(bar()).toHaveTextContent(`${fmtWhen(at)} · 第`)
    expect(bar()).toHaveTextContent('停在这一刻：按 ▶ 接着放')
    expect(feedSeqs()).toBe(b.events.filter((e) => e.at <= at).length)
    expect(screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === 'design')).toHaveAttribute('data-status', 'merged')
    expect(p.replace).not.toHaveBeenCalled()
    fireEvent.click(rp.getByRole('button', { name: '退出回放' }))
    expect(p.replace).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-2', from: 'item' })
    expect(feedSeqs()).toBe(b.events.length)
  })

  test('a merged requirement’s 验收: signed, who merged it, and 需求详情 from the card', async () => {
    merged()
    const p = renderBoard(PAY2)
    await loaded()
    const b = fx.boardMerged()
    const card = region('验收')
    expect(card).toHaveClass('is-signed')
    expect(card).toHaveTextContent('已合并')
    // who merged it, said as a person, never as a pseudonym code
    expect(within(card).getByRole('status')).toHaveTextContent(b.accept.done!.who as string)
    expect(within(card).getByRole('status')).not.toHaveTextContent(/P-[0-9A-F]{4}/)
    expect(within(card).getByRole('status')).toHaveTextContent(b.accept.done!.how)
    expect(within(card).queryByTestId('accept-step')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: '需求详情 ↗' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-2', from: 'board' })
  })
})

describe('需求看板 · 谁做的、等谁、看得清', () => {
  const placeOf = (seq: number) => within(screen.getByTestId('kt-feed').querySelector(`[data-seq="${seq}"]`) as HTMLElement).queryAllByTestId('kt-ev-place').map((e) => e.textContent)

  /** PAY-3 handed over, then a question on the MR, the product's release approval there and an answer there. */
  function onTheMr(me: boolean): ReqBoard {
    const b = fx.board()
    b.person = { ...b.person, me, owner: me ? 'alice' : 'erin' }
    const t = Math.max(...b.events.map((e) => e.at))
    const ev = (seq: number, dt: number, kind: ReqBoard['events'][number]['kind'], from: string, to: string, text: string) => ({ seq, at: t + dt, kind, from, to, text, detail: false, src: null })
    b.events.push(ev(900, 10, 'handover', 'local', 'handover', '交给运行机'), ev(901, 20, 'question', 'bridge', 'person', 'D-1 在 MR 上问人：验收'),
      ev(902, 30, 'approve', 'person', 'release', '产品在 MR 上批准了发布'), ev(903, 40, 'answer', 'person', 'bridge', 'D-2 回答了：approve'))
    return b
  }

  test('event chips name who acted: the owner on their own way (你 only to them), 产品 or the MR for what happened on the MR', async () => {
    installFixtureRoutes(boardRoute(() => onTheMr(false)))
    renderBoard()
    await loaded()
    const claim = fx.board().events.find((e) => e.kind === 'claim')!.seq
    expect(placeOf(claim)).toEqual(['erin'])
    expect(placeOf(901)).toEqual(['产品'])
    expect(placeOf(902)).toEqual(['产品'])
    expect(placeOf(903)).toEqual(['MR'])
    expect(screen.getByTestId('kt-feed').querySelectorAll('[data-testid="kt-ev-place"]').length).toBeGreaterThan(3)
    expect([...screen.getByTestId('kt-feed').querySelectorAll('[data-testid="kt-ev-place"]')].map((e) => e.textContent)).not.toContain('你')
    cleanup()
    installFixtureRoutes(boardRoute(() => onTheMr(true)))
    renderBoard()
    await loaded()
    expect(placeOf(claim)).toEqual(['你'])
    expect(placeOf(902)).toEqual(['产品'])
  })

  test('a wait that is over says whom it was on, by the same rule as the one going on (等产品, 等你)', async () => {
    const b = fx.board()
    const a = b.actors.find((x) => x.key === 'local')!
    const t0 = b.started_at!, t1 = t0 + 3600, t2 = t0 + 7200
    a.spans = [{ a: t0, b: t1, kind: 'work' }, { a: t1, b: t2, kind: 'wait' }, { a: t2, b: null, kind: 'wait' }]
    a.history = [{ at: t0, status: 'running', doing: '在做' }, { at: t1, status: 'awaiting_approval', doing: '等产品回答', who: 'product' },
      { at: t2, status: 'awaiting_approval', doing: '会话里有一个工具调用等你批准', who: 'you' }]
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    const lane = screen.getAllByTestId('kt-lane').find((l) => l.dataset.role === 'local') as HTMLElement
    const waits = [...lane.querySelectorAll('.kt-track-span.is-wait')]
    expect(waits.map((w) => w.getAttribute('title')?.split('：')[0])).toEqual(['等产品', '等你'])
    expect(waits.map((w) => w.classList.contains('is-other'))).toEqual([true, false])
    expect(lane.querySelector('.kt-track')?.getAttribute('aria-label')).not.toContain('等人')
  })

  test('a wait on the owner said to the owner is never 「等 <their own name>」 (a replay of their own requirement)', async () => {
    const b = fx.board()
    const runner = b.actors.find((x) => x.key === 'runner')!
    Object.assign(runner, { status: 'awaiting_approval', doing: '停下问人：设计', since: b.at - 60, history: [{ at: b.at - 60, status: 'awaiting_approval', doing: '停下问人：设计', who: 'people' }] })
    b.row.waits = { ...b.row.waits, who: 'people', do: 'answer', where: 'mr', line: null }
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    const graph = await loaded()
    expect(graph.querySelector('g.kt-node[data-role="runner"]')).toHaveTextContent('等别人')
    expect(graph).not.toHaveTextContent('等 alice')
  })

  test('a pushed hand-over without its label: the counter counts it as waiting on you, the button is 补上交接标签', async () => {
    const b = fx.board()
    const text = '推上去了，但 MR 上没有交接标签：什么也没交出去。看一眼 MR，再交接一次'
    Object.assign(b.row, { state: 'handed_over', state_label: '已交接' })
    b.row.waits = { who: 'you', text, line: null, raw: '', do: 'label_handoff', since: b.at - H, where: 'session' }
    b.accept.step = { text, who: '你', line: null, mr_url: 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/50', session_url: null }
    b.questions = []
    for (const a of b.actors) {
      if (a.status === 'awaiting_approval') Object.assign(a, { status: 'done', line: null })
      if (a.key === 'bridge') Object.assign(a, { status: 'stalled', doing: text })
    }
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    expect(screen.getByRole('group', { name: '指标' })).toHaveTextContent('没有在做的 · 1 个等你')
    expect(within(region('你要做的一步')).getByRole('link', { name: '补上交接标签 ↗' })).toHaveAttribute('href', b.accept.step.mr_url)
    expect(screen.queryByRole('link', { name: '去 MR ↗' })).toBeNull()
  })

  test('the graph is never drawn below its scale: a narrow app gets a narrower layout, then the graph scrolls (the text stays)', () => {
    expect(graphWidth(null)).toBe(GW)
    expect(graphWidth(1558)).toBe(GW)
    // the full way cannot be narrower than its columns: it keeps the scale and scrolls
    const full = graphWidth(1008)
    expect(full).toBeLessThan(GW)
    expect(Math.floor(full * SCALE)).toBeGreaterThan(1008)
    // a repo done only here fits 1050 (1280 minus the KiroCrew sidebar) at the scale
    const local = graphWidth(1008, ['runner'])
    expect(Math.floor(local * SCALE)).toBeLessThanOrEqual(1008)
    expect(SCALE * 12).toBeGreaterThanOrEqual(10)
  })

  test('the introduction keeps every word whole: what a step does breaks only after a 、', async () => {
    const b = fx.board()
    Object.assign(b.row, { state: 'claimed', state_label: '已认领' })
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    const intro = await screen.findByTestId('br-board-intro')
    for (const w of ['把分支交出去', '核对、', '转问题', '读 Brain、', '会话里打一行']) expect(within(intro).getAllByText(w)[0]).toHaveClass('br-phrase')
  })

  test('the conveyor without the trace says what it shows, not a module name', async () => {
    const b = fx.board()
    Object.assign(b, { source: 'app', belt: [] })
    installFixtureRoutes(boardRoute(() => structuredClone(b)))
    renderBoard()
    await loaded()
    const belt = screen.getByTestId('kt-conveyor')
    expect(belt).toHaveTextContent('这里还读不到运行分支的提交：图上只画了 Lean 自己记下的事')
    expect(belt).not.toHaveTextContent(/trace|模块/)
  })

  test('a repo done only here: the graph names its phases as its introduction does (认领, 检查 · 发布), no 验收', async () => {
    installFixtureRoutes(boardRoute(() => structuredClone(localOnly())))
    renderBoard()
    const graph = await loaded()
    const phases = [...graph.querySelectorAll('.kt-phase-title')].map((t) => t.textContent)
    expect(phases).toContain('0 认领')
    expect(phases).toContain('3 检查 · 发布')
    expect(phases).not.toContain('3 检查 · 验收')
  })
})
