import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { paths } from '../api'
import { fx } from '../test/data'
import { API, fixtureRoutes, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError, navigations, setApiRoutes } from '../test/stubs/app-sdk'
import type { BoardEntry } from '../nav'
import type { ChildStartResult, FamilyActs, ReqBoard, ReqFamily, SplitResult } from '../types'
import { TYPE_IT_YOURSELF } from '../ui'
import type { ViewProps } from '../views/props'
import { BoardPage } from './BoardPage'
import { CELL_GROUPS, actorMeta, fmtCredits } from './format'

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
    expect(apiCalls[0]).toMatchObject({ method: 'GET', path: `${API}/board/r1/PAY-3` })
  })

  test('the KPIs: checks passed, Lean’s stages and the approvals, a person’s acts, the steps of the way, credits', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const kpis = within(screen.getByRole('group', { name: '指标' }))
    expect(kpis.getByTestId('br-checks-counter')).toHaveAccessibleName(`检查通过 ${b.checks.passed}/${b.checks.total}`)
    expect(kpis.getByTestId('br-checks-counter')).toHaveTextContent('2/4')
    expect(kpis.getByText('1 个没过')).toBeInTheDocument()
    expect(kpis.getByText(`AI-DLC Lean · ${b.row.lean.stage_label}`)).toBeInTheDocument()
    const lean = kpis.getByText(`AI-DLC Lean · ${b.row.lean.stage_label}`).parentElement as HTMLElement
    expect(lean).toHaveTextContent(`${b.row.lean.done}/${b.row.lean.total} 个阶段`)
    expect(lean).toHaveTextContent('批准 2退回 0拦下 1')
    const people = kpis.getByText('人介入').parentElement as HTMLElement
    expect(people).toHaveTextContent('2次')
    expect(people).toHaveTextContent('判断点上 2 · 判断点之外 0')
    // 1 of the 10 actors is through (需求审批); 本机会话 and 设计审批 wait for the person
    expect(kpis.getByTestId('br-steps-counter')).toHaveTextContent(`1/${b.actors.length}`)
    expect(kpis.getByText('· 2 个等你', { exact: false })).toBeInTheDocument()
    expect(kpis.getAllByRole('button').map((x) => x.getAttribute('aria-label'))).toEqual(b.actors.map((a) => `${a.title}：${actorMeta(a.status).label}`))
    const credits = kpis.getByText('credits').parentElement as HTMLElement
    expect(credits).toHaveTextContent(fmtCredits(b.credits.total))
    expect(credits).toHaveTextContent(`${b.sessions.length} 个会话合计`)
  })

  test('验收: the one step a person takes, its line to type; 复制 copies the line, 打开会话 opens the session, nothing is sent', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const card = region('验收')
    expect(card).toHaveTextContent('还没到验收')
    expect(card).toHaveTextContent(`需求${b.row.key} ${b.row.title}`)
    expect(within(card).getByTestId('accept-first')).toHaveTextContent(b.mr_desc.first as string)
    expect(card).toHaveTextContent(b.accept.checks)
    expect(card).toHaveTextContent('人 1Brain 条目（引用） 2没归类（Who 不是规定的写法） 1')
    const step = within(card).getByTestId('accept-step')
    expect(step).toHaveTextContent(`${b.accept.step.who}要做的一步`)
    expect(step).toHaveTextContent(b.accept.step.text)
    const line = within(step).getByTestId('type-line')
    expect(within(line).getByText(b.accept.step.line as string)).toHaveClass('br-mono')
    expect(line).toHaveTextContent(TYPE_IT_YOURSELF)
    fireEvent.click(within(line).getByRole('button', { name: '复制' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('approve PLAN 5d1e7a90'))
    expect(await within(line).findByText('已复制')).toBeInTheDocument()
    fireEvent.click(within(line).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual([b.accept.step.session_url])
    expect(apiCalls.filter((c) => c.method !== 'GET')).toEqual([])
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
      for (const word of [a.title, a.sub, actorMeta(a.status).label, a.doing]) expect(name).toContain(word)
    }
    // a line to type is said on the node itself
    expect(nodes.find((n) => n.dataset.role === 'design')).toHaveTextContent('打一行')
    expect(nodes.find((n) => n.dataset.role === 'local')).not.toHaveTextContent('打一行')
    // the two that wait for the person each get the chip that leads to where the person acts
    expect(within(graph).getAllByTestId('kt-wait-chip').map((c) => c.getAttribute('aria-label'))).toEqual(['本机会话：去会话批准', '设计审批：去打那一行'])
    // a tool call to approve is approved in the session: its chip opens it
    fireEvent.click(within(graph).getByRole('button', { name: '本机会话：去会话批准' }))
    expect(navigations).toEqual([b.actors.find((a) => a.key === 'local')!.session!.url])
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
    expect(card).toHaveTextContent(`设计审批${actorMeta(design.status).label}`)
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
    expect(rows.map((l) => l.getAttribute('aria-label'))).toEqual(b.actors.map((a) => `${a.title}：${actorMeta(a.status).label}`))
    const design = rows.find((l) => l.dataset.role === 'design') as HTMLElement
    const d = b.actors.find((a) => a.key === 'design')!
    expect(design).toHaveTextContent(`✋ 等你：${d.doing}`)
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
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Lean 审批', 'verify', '交接', 'Brain 和仓库'])
    present.forEach((g, i) => {
      const cells = within(groups[i]).getAllByTestId('kt-cell')
      expect(cells.map((c) => [c.dataset.case, c.dataset.status])).toEqual(b.checks.cells.filter((c) => c.group === g.key).map((c) => [c.id, c.status]))
    })
    // nothing hovered: the one that failed
    const inspect = within(wall).getByTestId('kt-inspect')
    expect(inspect).toHaveTextContent('1 个没过 引用')
    const plan = b.checks.cells.find((c) => c.id === 'gate-PLAN')!
    const cell = within(wall).getByRole('button', { name: `${plan.name}：等人，${plan.detail}` })
    fireEvent.focus(cell)
    expect(inspect).toHaveTextContent(`✋ ${plan.name}${plan.detail}`)
    fireEvent.blur(cell)
    expect(inspect).toHaveTextContent('1 个没过 引用')
  })

  test('the event feed: the trace newest first; Lean 细节 hides the many quiet steps', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const feed = region('事件')
    expect(feed).toHaveTextContent('来自 brain-kit trace')
    const items = () => Array.from(feed.querySelectorAll<HTMLElement>('li[data-seq]'))
    expect(items().map((li) => Number(li.dataset.seq))).toEqual(b.events.map((e) => e.seq).reverse())
    expect(items()[0]).toHaveTextContent(b.events[b.events.length - 1].text)
    expect(items()[items().length - 1]).toHaveTextContent(b.events[0].text)
    fireEvent.click(within(feed).getByRole('checkbox', { name: 'Lean 细节' }))
    expect(items().map((li) => Number(li.dataset.seq))).toEqual(b.events.filter((e) => !e.detail).map((e) => e.seq).reverse())
  })

  test('the open questions: the ones that wait, with their count; an answered one is not there', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    const b = fx.board()
    const open = b.questions.filter((q) => q.state === 'waiting' || q.state === 'open')
    expect(open).toHaveLength(2)
    const qs = region('等回答的问题')
    expect(within(qs).getByText(String(open.length))).toHaveClass('kt-badge')
    const cards = within(qs).getAllByTestId('question')
    expect(cards).toHaveLength(open.length)
    open.forEach((q, i) => expect(cards[i]).toHaveTextContent(q.question))
    expect(qs).not.toHaveTextContent(b.questions.find((q) => q.state === 'delivered')!.question)
    // the PLAN approval is Lean's: typed in the session, not answered here
    expect(cards[1]).toHaveTextContent('这是 Lean 的审批请求（PLAN 5d1e7a90）')
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
    expect(apiCalls.every((c) => c.method === 'GET' && c.path === paths.board('r1', 'PAY-3'))).toBe(true)
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
    fireEvent.click(crumb().getByRole('button', { name: '交付总览' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'overview' })
    fireEvent.click(crumb().getByRole('button', { name: '← 返回需求详情' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(p.replace).not.toHaveBeenCalled()
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

  test('a requirement the repo does not have (404) says so', async () => {
    installFixtureRoutes(boardRoute(() => { throw apiError(404, 'not_found', '这个仓库里没有 PAY-9') }))
    renderBoard({ repo: 'r1', key: 'PAY-9' })
    expect(await screen.findByRole('alert')).toHaveTextContent('没有这个需求（r1 · PAY-9）：它可能已经不在这个仓库里')
    expect(screen.queryByTestId('kt-graph')).toBeNull()
    expect(boardCalls({ repo: 'r1', key: 'PAY-9' })).toHaveLength(1)
  })

  test('a backend without the /board route (a 404 without an error body) is the same missing state', async () => {
    const routes = fixtureRoutes()
    delete routes[`GET ${API}/board/*`]
    setApiRoutes(routes)
    renderBoard()
    expect(await screen.findByRole('alert')).toHaveTextContent('没有这个需求（r1 · PAY-3）：它可能已经不在这个仓库里')
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

  test('a merged requirement’s 验收: signed, who merged it, and 需求详情 from the card', async () => {
    merged()
    const p = renderBoard(PAY2)
    await loaded()
    const b = fx.boardMerged()
    const card = region('验收')
    expect(card).toHaveClass('is-signed')
    expect(card).toHaveTextContent('已合并')
    expect(within(card).getByRole('status')).toHaveTextContent(`${b.accept.done!.who}`)
    expect(within(card).getByRole('status')).toHaveTextContent(b.accept.done!.how)
    expect(within(card).queryByTestId('accept-step')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: '需求详情 ↗' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-2', from: 'board' })
  })
})

// ---------------------------------------------------------------- 大需求拆成小需求 on the board

const NO_ACTS: FamilyActs = { split: null, claim: null, release: null, start: null, start_on: null, sync: null }
const famBase = (role: ReqFamily['role']): ReqFamily => ({
  role, parent: 'PAY-1', parent_title: '退款大需求', branch: 'ai/alice/PAY-1-big', unit: null, state: null, state_label: '', owner: null,
  depends_on: [], blocked_by: [], paths: [], contracts: [], children: [], progress: null, family_state: null, family_label: '', released: false,
  acts: { ...NO_ACTS }, source: 'brainkit', at: fx.board().at,
})
/** PAY-3, the web unit of PAY-1: in carol's hands (its run going), or nobody's yet */
function childBoard(state: 'in_progress' | 'unclaimed' = 'in_progress', acts: Partial<FamilyActs> = {}): ReqBoard {
  const b = fx.board()
  if (state === 'unclaimed') {
    b.row.state = 'unclaimed'
    b.row.state_label = '待认领'
    b.row.owner = null
  }
  b.row.family = {
    ...famBase('child'), unit: 'web', state, state_label: state === 'unclaimed' ? '待认领' : 'carol 在做', owner: state === 'unclaimed' ? null : 'carol',
    paths: ['web/**'], depends_on: [{ key: 'PAY-2', unit: 'api', state: 'merged', owner: 'alice', merged: true, text: 'PAY-2（api，已合并）' }],
    acts: { ...NO_ACTS, ...acts },
  }
  return b
}
function parentBoard(): ReqBoard {
  const b = fx.board()
  b.row.key = 'PAY-1'
  b.row.title = '退款大需求'
  b.row.family = {
    ...famBase('parent'), family_state: 'in_progress', family_label: '小需求在做', acts: { ...NO_ACTS, split: { ok: true, why: '' } },
    progress: { merged: 1, total: 3, unclaimed: 1, claimed: 0, in_progress: 1, closed: 0, text: '1/3 merged' },
    children: [
      { key: 'PAY-2', unit: 'api', title: '通过接口提交退款', state: 'merged', state_label: '已合并', owner: 'alice', depends_on: [], blocked_by: [] },
      { key: 'PAY-3', unit: 'web', title: '在订单页看到退款状态', state: 'in_progress', state_label: 'carol 在做', owner: 'carol', depends_on: ['PAY-2'], blocked_by: [] },
      { key: 'PAY-4', unit: 'jobs', title: '每晚自动对账', state: 'unclaimed', state_label: '待认领', owner: null, depends_on: [], blocked_by: [] },
    ],
  }
  const n = (commits: number, credits: number | null) => ({ stages_done: 5, verify_rounds: 2, verify_failed: 0, commits_bot: commits, commits_person: 0, blocked: 0,
    human_at_judgment: 2, human_outside_judgment: 0, decisions: 1, questions: 0, credits })
  b.rollup = {
    own: n(4, 10), total: n(15, null), unknown: ['PAY-4 credits'],
    children: [{ key: 'PAY-2', unit: 'api', merged: true, numbers: n(6, 8.2) }, { key: 'PAY-3', unit: 'web', merged: false, numbers: n(5, 3.1) }],
  }
  return b
}
const PAY1: BoardEntry = { repo: 'r1', key: 'PAY-1' }
const famCard = () => screen.getByTestId('fam-panel')
const topBar = () => within(document.querySelector('header.kt-top') as HTMLElement)

describe('需求看板 · 大需求拆成小需求', () => {
  test('a small one names its big one in the crumb and the top bar (that one’s board) with its unit; its family card sits under the conveyor, before its lanes', async () => {
    installFixtureRoutes(boardRoute(() => childBoard()))
    const p = renderBoard()
    await loaded()
    const top = topBar()
    expect(top.getByTestId('br-board-unit')).toHaveTextContent('单元 web')
    fireEvent.click(top.getByRole('button', { name: '大需求 PAY-1' }))
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-1' })
    expect(screen.getByRole('navigation', { name: '位置' })).toHaveTextContent('交付总览›PAY-1›PAY-3›需求看板')
    fireEvent.click(crumb().getByRole('button', { name: 'PAY-1' }))
    expect(p.go).toHaveBeenCalledTimes(2)
    expect(famCard()).toHaveClass('kt-card')
    expect(screen.getByTestId('kt-conveyor').compareDocumentPosition(famCard()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(famCard().compareDocumentPosition(screen.getByTestId('kt-lanes')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(screen.getByRole('complementary', { name: '检查、问题和事件' })).queryByTestId('fam-panel')).toBeNull()
    expect(within(famCard()).getByRole('heading', { level: 2, name: 'PAY-1 的小需求 · 单元 web' })).toBeInTheDocument()
    expect(famCard()).toHaveTextContent('PAY-2（api，已合并）')
  })

  test('the actions are there too: 同步 posts and shows its answer; the board reads itself again', async () => {
    installFixtureRoutes({
      ...boardRoute(() => childBoard('in_progress', { sync: { ok: true, why: '' } })),
      [`POST ${API}/requirements/r1/PAY-3/sync`]: () => ({ ok: true, result: 'up_to_date', text: '已经是最新的', conflicts: [], problem: null, output: '' }),
    })
    const p = renderBoard()
    await loaded()
    const before = boardCalls().length
    fireEvent.click(within(famCard()).getByRole('button', { name: '同步' }))
    expect(await within(famCard()).findByTestId('fam-sync-result')).toHaveTextContent('已经是最新的')
    expect(apiCalls.filter((c) => c.method === 'POST')).toEqual([{ method: 'POST', path: `${API}/requirements/r1/PAY-3/sync`, body: {} }])
    await waitFor(() => expect(boardCalls().length).toBeGreaterThan(before))
    expect(p.reloadStatus).toHaveBeenCalled()
  })

  test('a small one nobody has: its own way, no 开需求; 开工 from its card, and the answer (打开会话) stays when the board becomes the run’s', async () => {
    const started: ChildStartResult = {
      ok: true, key: 'PAY-3', branch: 'ai/carol/PAY-3-web', worktree: '/Users/carol/.brain/worktrees/shop-pay/PAY-3', on: null, text: '开工了：PAY-3',
      blocked: [], can_on: null, problem: null, output: '', slot: 'brain-PAY-3-a1b2', url: '/chat?sid=brain-PAY-3-a1b2', session_error: '',
    }
    let snap = childBoard('unclaimed', { claim: { ok: true, why: '' }, start: { ok: true, why: '' } })
    installFixtureRoutes({
      [`GET ${API}/board/*`]: () => snap,
      [`POST ${API}/requirements/r1/PAY-3/start`]: () => {
        snap = childBoard('in_progress', { sync: { ok: true, why: '' } })
        return started
      },
    })
    renderBoard()
    const intro = await screen.findByTestId('br-board-intro')
    expect(within(intro).getByRole('heading', { name: 'PAY-3 待认领' })).toBeInTheDocument()
    expect(intro).toHaveTextContent('MR 交给大需求的负责人合并（小需求不交给运行机）')
    const way = within(intro).getByRole('list', { name: '一个小需求的路，从左到右' })
    expect(Array.from(way.querySelectorAll('.kt-intro-phase-head b')).map((b) => b.textContent)).toEqual(['0 认领', '1 开工', '2 做 · 同步', '3 交接', '4 合并'])
    expect(screen.queryByRole('button', { name: '去开需求，开工' })).toBeNull()
    expect(screen.queryByRole('button', { name: '去开工' })).toBeNull()
    // the card comes first, with 认领 and 开工
    expect(famCard().compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(famCard()).getByRole('button', { name: '认领' })).toHaveClass('is-primary')
    fireEvent.click(within(famCard()).getByRole('button', { name: '开工' }))
    await loaded()   // the run's board now: graph, counters, the card under the conveyor
    const out = within(famCard()).getByTestId('fam-start-result')
    expect(screen.queryByTestId('br-board-intro')).toBeNull()
    expect(out).toHaveTextContent('开工了：PAY-3')
    expect(within(out).queryByRole('button', { name: '看需求看板' })).toBeNull()   // it is this one
    fireEvent.click(within(out).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-3-a1b2'])
  })

  test('a big one split into small ones: the small ones as lanes with the roll-up and the trace numbers, under the conveyor, before its own lanes', async () => {
    installFixtureRoutes(boardRoute(parentBoard))
    const p = renderBoard(PAY1)
    await loaded()
    const card = screen.getByRole('region', { name: '拆成的小需求' })
    expect(card).toHaveClass('kt-card')
    expect(within(card).getByTestId('fam-merged')).toHaveAccessibleName('已合并 1/3')
    expect(within(card).getAllByTestId('fam-child').map((l) => `${l.dataset.key} ${l.dataset.state}`)).toEqual(['PAY-2 merged', 'PAY-3 in_progress', 'PAY-4 unclaimed'])
    expect(within(card).getAllByTestId('fam-child')[0]).toHaveClass('kt-lane')
    expect(within(card).getByRole('group', { name: '整个大需求加起来' })).toHaveTextContent('提交15')
    expect(within(card).getByTestId('fam-unknown')).toHaveTextContent('PAY-4 credits')
    const belt = screen.getByTestId('kt-conveyor')
    expect(belt.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(screen.getByTestId('kt-lanes')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // the top bar says how far, and jumps there
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView)
    scroll.mockClear()
    fireEvent.click(topBar().getByRole('button', { name: '大需求 · 已合并 1/3' }))
    expect(scroll.mock.contexts[0]).toBe(card)
    fireEvent.click(within(card).getAllByTestId('fam-child')[2])
    expect(p.go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-4' })
    expect(within(card).getByRole('button', { name: '拆成小需求' })).toBeEnabled()
  })

  test('a big one not split yet: what comes next under the counters; 拆成小需求 previews first', async () => {
    const b = fx.board()
    b.row.key = 'PAY-1'
    b.row.family = { ...famBase('big'), acts: { ...NO_ACTS, split: { ok: true, why: '' } } }
    const preview: SplitResult = {
      ok: true, dry_run: true, parent: 'PAY-1', branch: 'ai/alice/PAY-1-big', units_sha: '31369169', design_sha: '4a037c33', warnings: [], problems: [], output: '',
      text: '会拆成 2 个小需求。',
      actions: ['api', 'web'].map((unit) => ({ unit, kind: 'new', kind_label: '新登记（待认领）', key: null, title: unit, paths: [`${unit}/**`], depends_on: [], contracts: [], why: [], attention: false })),
    }
    installFixtureRoutes({ ...boardRoute(() => b), [`POST ${API}/requirements/r1/PAY-1/split`]: () => preview })
    renderBoard(PAY1)
    await loaded()
    const card = screen.getByRole('region', { name: '大需求' })
    expect(screen.getByRole('group', { name: '指标' }).compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(screen.getByTestId('kt-graph')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(topBar().getByRole('button', { name: '大需求 · 还没拆' })).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: '拆成小需求' }))
    expect(await within(card).findByRole('table', { name: '会拆成这些小需求' })).toBeInTheDocument()
    expect(apiCalls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([{ apply: false }])
  })

  test('while it replays the family card offers nothing; after the replay its actions are back', async () => {
    installFixtureRoutes(boardRoute(() => childBoard('in_progress', { sync: { ok: true, why: '' }, release: { ok: true, why: '' }, start_on: 'PAY-2' })))
    renderBoard()
    await loaded()
    expect(within(famCard()).getByRole('group', { name: '小需求的操作' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '▶ 回放' }))
    expect(screen.getByRole('group', { name: '回放' })).toBeInTheDocument()
    expect(within(famCard()).queryByRole('group', { name: '小需求的操作' })).toBeNull()
    expect(within(famCard()).getAllByRole('button').map((b) => b.textContent)).toEqual(['PAY-1'])
    fireEvent.click(within(screen.getByRole('group', { name: '回放' })).getByRole('button', { name: '退出回放' }))
    expect(within(famCard()).getByRole('button', { name: '同步' })).toBeEnabled()
    expect(apiCalls.some((c) => c.method === 'POST')).toBe(false)
  })

  test('a requirement outside a family: no family card, no family pill', async () => {
    installFixtureRoutes()
    renderBoard()
    await loaded()
    expect(screen.queryByTestId('fam-panel')).toBeNull()
    expect(screen.queryByTestId('br-board-unit')).toBeNull()
    expect(topBar().queryByRole('button', { name: /大需求/ })).toBeNull()
  })
})
