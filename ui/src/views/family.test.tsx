import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError, navigations } from '../test/stubs/app-sdk'
import type {
  ChildStartResult, ClaimResult, FamilyActs, FamilyChild, FamilyDep, FamilyRollup, ReqFamily, SplitResult, SyncResult,
} from '../types'
import { BIG_HINT, FamilyPanel, useFamily } from './Family'

// ---------------------------------------------------------------- the family of docs/安装和使用.md §4.7: PAY-1 退款大需求,
// split into api (PAY-2), web (PAY-3, depends on api) and jobs (PAY-4)

const AT = fx.overview().at
const NO_ACTS: FamilyActs = { split: null, claim: null, release: null, start: null, start_on: null, sync: null }
const DEP2: FamilyDep = { key: 'PAY-2', unit: 'api', state: 'in_progress', owner: 'alice', merged: false, text: 'PAY-2（api，alice 在做）' }
const DEP5: FamilyDep = { key: 'PAY-5', unit: 'schema', state: 'merged', owner: 'dave', merged: true, text: 'PAY-5（schema，已合并）' }
const KIDS: FamilyChild[] = [
  { key: 'PAY-2', unit: 'api', title: '通过接口提交退款', state: 'in_progress', state_label: 'alice 在做', owner: 'alice', depends_on: [], blocked_by: [] },
  { key: 'PAY-3', unit: 'web', title: '在订单页看到退款状态', state: 'unclaimed', state_label: '待认领', owner: null, depends_on: ['PAY-2'], blocked_by: ['PAY-2'] },
  { key: 'PAY-4', unit: 'jobs', title: '每晚自动对账', state: 'claimed', state_label: 'bob 认领了', owner: 'bob', depends_on: [], blocked_by: [] },
  { key: 'PAY-6', unit: 'admin', title: '后台退款', state: 'merged', state_label: '已合并', owner: 'dave', depends_on: [], blocked_by: [] },
]

const base = (role: ReqFamily['role']): ReqFamily => ({
  role, parent: 'PAY-1', parent_title: '退款大需求', branch: 'ai/alice/PAY-1-big', unit: null, state: null, state_label: '', owner: null,
  depends_on: [], blocked_by: [], paths: [], contracts: [], children: [], progress: null, family_state: null, family_label: '', released: false,
  acts: { ...NO_ACTS }, source: 'brainkit', at: AT,
})
const parent = (over: Partial<ReqFamily> = {}): ReqFamily => ({
  ...base('parent'), children: KIDS.map((c) => ({ ...c })),
  progress: { merged: 1, total: 4, unclaimed: 1, claimed: 1, in_progress: 1, closed: 0, text: '1/4 merged' },
  family_state: 'in_progress', family_label: '小需求在做', ...over,
})
const child = (over: Partial<ReqFamily> = {}): ReqFamily => ({
  ...base('child'), unit: 'web', state: 'unclaimed', state_label: '待认领', depends_on: [DEP2, DEP5], blocked_by: ['PAY-2'],
  paths: ['web/**', 'aidlc-docs/contracts/web/**'], contracts: ['aidlc-docs/contracts/api/refunds.yaml'], ...over,
})
const big = (over: Partial<ReqFamily> = {}): ReqFamily => ({ ...base('big'), ...over })

const ROLLUP: FamilyRollup = {
  own: { stages_done: 6, verify_rounds: 0, verify_failed: 0, commits_bot: 4, commits_person: 0, blocked: 0, human_at_judgment: 2, human_outside_judgment: 0, decisions: 3, questions: 0, credits: 12.5 },
  total: { stages_done: 20, verify_rounds: 5, verify_failed: 1, commits_bot: 17, commits_person: 1, blocked: 1, human_at_judgment: 7, human_outside_judgment: 1, decisions: 9, questions: 2, credits: null },
  unknown: ['PAY-1 credits', 'PAY-4 verify'],
  children: [
    { key: 'PAY-2', unit: 'api', merged: false, numbers: { stages_done: 8, verify_rounds: 3, verify_failed: 1, commits_bot: 9, commits_person: 1, blocked: 1, human_at_judgment: 3, human_outside_judgment: 1, decisions: 4, questions: 2, credits: 21.4 } },
    { key: 'PAY-3', unit: 'web', merged: false, numbers: null },
  ],
}

const CLAIMED: ClaimResult = { ok: true, text: '认领了 PAY-3', owner: 'carol', problem: null, output: 'claimed PAY-3 (pushed claim/PAY-3)' }
const LOST: ClaimResult = { ok: false, text: '晚了一步：PAY-3 已经被 alice 认领了', owner: 'alice', problem: null, output: 'PAY-3 was just claimed by alice' }
const STARTED: ChildStartResult = {
  ok: true, key: 'PAY-3', branch: 'ai/carol/PAY-3-web', worktree: '/Users/carol/.brain/worktrees/shop-pay/PAY-3', on: null, text: '开工了：PAY-3',
  blocked: [], can_on: null, problem: null, output: 'Started PAY-3 on ai/carol/PAY-3-web', slot: 'brain-PAY-3-a1b2', url: '/chat?sid=brain-PAY-3-a1b2', session_error: '',
}
const BLOCKED: ChildStartResult = {
  ...STARTED, ok: false, branch: null, worktree: null, slot: null, url: null, text: '没开成：PAY-3 依赖的 PAY-2 还没合进大需求的分支',
  blocked: [DEP2], can_on: 'PAY-2', output: 'PAY-3 depends on PAY-2 (unit api, claimed by alice), which has not merged into ai/alice/PAY-1-big yet.',
}
const action = (unit: string, kind: string, kind_label: string, key: string | null, over: Partial<SplitResult['actions'][number]> = {}) => ({
  unit, kind, kind_label, key, title: `${unit} 的故事`, paths: [`${unit}/**`], depends_on: [], contracts: [], why: [], attention: false, ...over,
})
const PREVIEW: SplitResult = {
  ok: true, dry_run: true, parent: 'PAY-1', branch: 'ai/alice/PAY-1-big', units_sha: '31369169', design_sha: '4a037c33',
  actions: [
    action('api', 'new', '新登记（待认领）', null, { paths: ['services/api/**', 'aidlc-docs/contracts/api/**'], contracts: ['aidlc-docs/contracts/api/refunds.yaml'] }),
    action('web', 'new', '新登记（待认领）', null, { depends_on: ['api（新）'] }),
    action('jobs', 'new', '新登记（待认领）', null),
  ],
  warnings: [{ level: 'WARN', text: 'AC-3 的文字过不了 Brain 内容检查：只抄了编号', todo: '在小需求里补上验收标准', raw: 'WARN unit web: AC-3 text failed the content check' }],
  text: '会拆成 3 个小需求，都是新登记（待认领）。', problems: [], output: 'PAY-1 would split into 3 small requirements (dry run)',
}
const APPLIED: SplitResult = {
  ...PREVIEW, dry_run: false, warnings: [], text: 'PAY-1 拆成 3 个小需求，已推送 ai/alice/PAY-1-big。',
  actions: PREVIEW.actions.map((a, i) => ({ ...a, key: `PAY-${i + 2}`, depends_on: a.unit === 'web' ? ['PAY-2'] : [] })),
  output: 'PAY-1 拆成 3 个小需求（unit-of-work.md 31369169，DESIGN 4a037c33 批过，2026-11-09）',
}

// ---------------------------------------------------------------- the harness: the panel with its page's actions

function Harness({ f, look, rollup, quiet, onChanged, go, reqKey }: {
  f: ReqFamily; look: 'board' | 'detail'; rollup: FamilyRollup | null; quiet: boolean; onChanged: () => void; go: () => void; reqKey: string
}) {
  const ctl = useFamily('r1', reqKey, onChanged)
  return <main className="kt-root"><FamilyPanel f={f} repo="r1" reqKey={reqKey} ctl={ctl} look={look} go={go} rollup={rollup} quiet={quiet} /></main>
}

function renderPanel(f: ReqFamily, o: { look?: 'board' | 'detail'; rollup?: FamilyRollup | null; quiet?: boolean; reqKey?: string } = {}) {
  const go = vi.fn()
  const onChanged = vi.fn()
  const reqKey = o.reqKey ?? (f.role === 'child' ? 'PAY-3' : 'PAY-1')
  const props = { look: o.look ?? 'detail', rollup: o.rollup ?? null, quiet: o.quiet ?? false, onChanged, go, reqKey } as const
  const r = render(<Harness f={f} {...props} />)
  return { go, onChanged, user: userEvent.setup(), rerender: (g: ReqFamily) => r.rerender(<Harness f={g} {...props} />) }
}

const panel = () => screen.getByTestId('fam-panel')
const posts = () => apiCalls.filter((c) => c.method === 'POST')
const btn = (name: string | RegExp) => within(panel()).getByRole('button', { name })
const noBtn = (name: string | RegExp) => expect(within(panel()).queryByRole('button', { name })).toBeNull()

describe('家族面板 · 拆成的小需求（大需求）', () => {
  beforeEach(() => installFixtureRoutes())

  test('the roll-up (已合并 n/m and each count), the family’s state and release, one lane per small one with its key, unit, state, owner, dependencies and what blocks it', () => {
    renderPanel(parent())
    const p = panel()
    expect(p).toHaveAttribute('data-role', 'parent')
    expect(within(p).getByRole('heading', { name: '拆成的小需求' })).toBeInTheDocument()
    expect(within(p).getByTestId('fam-label')).toHaveTextContent('小需求在做')
    expect(p).toHaveTextContent('还没发布')
    expect(within(p).getByTestId('fam-merged')).toHaveAccessibleName('已合并 1/4')
    expect(within(p).getByTestId('fam-merged')).toHaveAttribute('title', '1/4 merged')
    const counts = within(within(p).getByRole('group', { name: '小需求的进度' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(counts).toEqual(['1待认领', '1认领了', '1在做', '0已关闭'])
    // one cell per small one, coloured by its state
    expect(Array.from(p.querySelectorAll('.br-fam-merged .kt-segs i')).map((i) => i.className)).toEqual(['is-run', '', 'is-claimed', 'is-pass'])

    const lanes = within(within(p).getByRole('list', { name: '小需求' })).getAllByTestId('fam-child')
    expect(lanes.map((l) => l.dataset.key)).toEqual(['PAY-2', 'PAY-3', 'PAY-4', 'PAY-6'])
    expect(lanes.map((l) => l.dataset.state)).toEqual(['in_progress', 'unclaimed', 'claimed', 'merged'])
    const web = lanes[1]
    expect(web).toHaveAccessibleName('PAY-3：待认领')
    expect(web).toHaveTextContent('单元 web')
    expect(web).toHaveTextContent('在订单页看到退款状态')
    expect(web).toHaveTextContent('没人认领')
    expect(within(web).getByLabelText('依赖')).toHaveTextContent('依赖⏸PAY-2')
    expect(within(web).getByTestId('fam-blocked')).toHaveTextContent('等依赖：PAY-2 还没合进大需求的分支')
    expect(lanes[0]).toHaveTextContent('alice 在做')
    expect(lanes[0]).toHaveTextContent('不依赖别的小需求')
    expect(within(lanes[0]).queryByTestId('fam-blocked')).toBeNull()
    expect(lanes[2]).toHaveTextContent('bob')
    expect(lanes[3]).toHaveClass('tone-ok')
    // no trace numbers outside the board
    expect(within(p).queryByTestId('fam-rollup')).toBeNull()
    expect(within(p).queryByLabelText('它的数')).toBeNull()
  })

  test('a released family that is done says so; every small one merged: 已合并 4/4 in green', () => {
    renderPanel(parent({ released: true, family_state: 'done', family_label: '发布了、小需求都合并了',
      progress: { merged: 4, total: 4, unclaimed: 0, claimed: 0, in_progress: 0, closed: 1, text: '4/4 merged' } }))
    expect(within(panel()).getByTestId('fam-label')).toHaveTextContent('发布了、小需求都合并了')
    expect(within(panel()).getByTestId('fam-label')).toHaveClass('tone-ok')
    expect(panel()).toHaveTextContent('发布审批过了')
    expect(panel().querySelector('.br-fam-merged .kt-kpi-big')).toHaveClass('tone-ok')
    expect(within(panel()).getByText('已关闭').closest('li')).not.toHaveClass('is-zero')
  })

  test('a lane opens that small one’s 需求看板: from 需求详情 it comes back to the detail; on the board plainly', async () => {
    const { go, user } = renderPanel(parent())
    await user.click(screen.getAllByTestId('fam-child')[2])
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-4', from: 'item' })
    await user.click(btn('PAY-2'))
    expect(go).toHaveBeenCalledTimes(2) // the key is the lane's control: one move, not two
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-2', from: 'item' })
  })

  test('on the board also the trace roll-up: commits, verify rounds, a person’s acts at and outside the judgment points, credits, its own beside; what nobody knows is said plainly', async () => {
    const { go, user } = renderPanel(parent(), { look: 'board', rollup: ROLLUP })
    const p = panel()
    expect(p).toHaveClass('kt-card')
    expect(within(p).getByRole('heading', { level: 2, name: '拆成的小需求' })).toBeInTheDocument()
    const roll = within(p).getByRole('group', { name: '整个大需求加起来' })
    const cells = within(roll).getAllByRole('listitem')
    expect(cells.map((c) => c.getAttribute('aria-label'))).toEqual(['提交 18', '自动检查 5', '人介入 8', 'credits —'])
    expect(cells[0]).toHaveTextContent('AI 17 · 人 1')
    expect(cells[0]).toHaveTextContent('大需求自己 4')
    expect(cells[1]).toHaveTextContent('轮 · 没过 1')
    expect(cells[2]).toHaveTextContent('判断点上 7 · 判断点之外 1')
    expect(cells[2]).toHaveClass('is-warn')
    expect(cells[3]).toHaveTextContent('大需求自己 12.5')
    expect(within(roll).getByTestId('fam-unknown')).toHaveTextContent('不知道的（没有记录，不按 0 算）：PAY-1 credits、PAY-4 verify')
    // each lane its own numbers, or that the trace has none
    const lanes = screen.getAllByTestId('fam-child')
    expect(within(lanes[0]).getByLabelText('它的数')).toHaveTextContent('提交 10自动检查 3 轮人介入 421.4 credits')
    expect(lanes[1]).toHaveTextContent('brain-kit 记下的时间线里还没有它的数')
    await user.click(btn('PAY-3'))
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3' })
  })

  test('before brain-kit answered (source local): the counts from the small ones, and it says so', () => {
    renderPanel(parent({ progress: null, source: 'local', at: null }))
    expect(within(panel()).getByTestId('fam-merged')).toHaveAccessibleName('已合并 1/4')
    expect(panel()).toHaveTextContent('brain-kit 还没回话：按本机上次拉到的认领显示。')
  })
})

describe('家族面板 · 小需求', () => {
  beforeEach(() => installFixtureRoutes())

  test('「PAY-1 的小需求 · 单元 web」 with its big one (its 需求看板), its paths, contracts, each dependency with how far it is, what blocks it', async () => {
    const { go, user } = renderPanel(child())
    const p = panel()
    expect(p).toHaveAccessibleName('PAY-1 的小需求')
    expect(within(p).getByRole('heading', { name: 'PAY-1 的小需求 · 单元 web' })).toBeInTheDocument()
    expect(within(p).getByTestId('fam-state')).toHaveTextContent('待认领')
    expect(p).toHaveTextContent('没人认领')
    expect(p).toHaveTextContent('大需求：退款大需求')
    const deps = within(p).getAllByTestId('fam-dep')
    expect(deps.map((d) => d.textContent)).toEqual(['⏸还没合PAY-2（api，alice 在做）', '✔合进来了PAY-5（schema，已合并）'])
    expect(deps.map((d) => d.dataset.merged)).toEqual(['false', 'true'])
    expect(within(p).getByTestId('fam-blocked')).toHaveTextContent('挡着它：PAY-2 还没合进大需求的分支 ai/alice/PAY-1-big。等它合并，或者在它的分支上先做。')
    expect(within(p).getByText('web/**')).toBeInTheDocument()
    expect(within(p).getByText('aidlc-docs/contracts/web/**')).toBeInTheDocument()
    expect(within(p).getByText('aidlc-docs/contracts/api/refunds.yaml')).toBeInTheDocument()
    // nothing offered: no actions at all
    expect(within(p).queryByRole('group', { name: '小需求的操作' })).toBeNull()
    await user.click(btn('PAY-1'))
    expect(go).toHaveBeenCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-1', from: 'item' })
  })

  test('a merged one: nothing blocks it any more; no contracts says so', () => {
    renderPanel(child({ state: 'merged', state_label: '已合并', owner: 'carol', blocked_by: [], contracts: [], depends_on: [{ ...DEP2, merged: true, text: 'PAY-2（api，已合并）' }] }))
    expect(within(panel()).getByTestId('fam-state')).toHaveTextContent('已合并')
    expect(within(panel()).queryByTestId('fam-blocked')).toBeNull()
    expect(panel()).toHaveTextContent('契约没有')
    expect(panel()).toHaveTextContent('carol')
  })
})

describe('家族面板 · 还没拆的大需求', () => {
  beforeEach(() => installFixtureRoutes())

  test('one line on what comes next; 拆成小需求 off with its why while DESIGN is not approved', () => {
    renderPanel(big({ acts: { ...NO_ACTS, split: { ok: false, why: 'DESIGN 还没批：先批 DESIGN（批的就是这个拆法）' } } }))
    const p = panel()
    expect(p).toHaveAttribute('data-role', 'big')
    expect(within(p).getByRole('heading', { name: '大需求：还没拆成小需求' })).toBeInTheDocument()
    expect(within(p).getByTestId('fam-next')).toHaveTextContent(`下一步：${BIG_HINT}`)
    const split = btn('拆成小需求')
    expect(split).toBeDisabled()
    expect(split).toHaveAccessibleDescription('DESIGN 还没批：先批 DESIGN（批的就是这个拆法）')
  })

  test('without the act (someone else’s, or not on this machine) there is no button', () => {
    renderPanel(big())
    expect(within(panel()).getByTestId('fam-next')).toBeInTheDocument()
    noBtn('拆成小需求')
  })
})

describe('家族面板 · 操作', () => {
  beforeEach(() => installFixtureRoutes())

  test('the actions follow family.acts: null is not shown, ok false is off with its why next to it', () => {
    renderPanel(child({
      acts: { ...NO_ACTS, claim: { ok: true, why: '' }, start: { ok: false, why: 'PAY-3 依赖 PAY-2（api，alice 在做）：它还没合进 ai/alice/PAY-1-big' } },
    }))
    const acts = within(panel()).getByRole('group', { name: '小需求的操作' })
    expect(within(acts).getAllByRole('button').map((b) => b.textContent)).toEqual(['认领', '开工'])
    expect(btn('认领')).toBeEnabled()
    expect(btn('认领')).toHaveClass('is-primary')
    expect(btn('开工')).toBeDisabled()
    expect(btn('开工')).toHaveAccessibleDescription('PAY-3 依赖 PAY-2（api，alice 在做）：它还没合进 ai/alice/PAY-1-big')
    noBtn('放弃认领')
    noBtn('同步')
    noBtn(/的分支上先做/)
  })

  test('认领 posts claim and shows its words; the panel reads itself again', async () => {
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/claim`]: () => CLAIMED })
    const { user, onChanged } = renderPanel(child({ acts: { ...NO_ACTS, claim: { ok: true, why: '' } } }))
    await user.click(btn('认领'))
    const out = await screen.findByTestId('fam-claim-result')
    expect(out).toHaveClass('is-ok')
    expect(within(out).getByRole('status')).toHaveTextContent('认领了 PAY-3')
    expect(out.querySelector('details')).not.toHaveAttribute('open')
    expect(within(out).getByText('细节：认领时 brain-kit 的原话')).toBeInTheDocument()
    expect(posts()).toEqual([{ method: 'POST', path: `${API}/requirements/r1/PAY-3/claim`, body: {} }])
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  test('the loser of a race sees who was first; a refusal’s problem is a check row', async () => {
    let answer: ClaimResult = LOST
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/claim`]: () => answer })
    const { user, onChanged } = renderPanel(child({ acts: { ...NO_ACTS, claim: { ok: true, why: '' } } }))
    await user.click(btn('认领'))
    const out = await screen.findByTestId('fam-claim-result')
    expect(out).toHaveClass('is-bad')
    expect(within(out).getByRole('status')).toHaveTextContent('晚了一步：PAY-3 已经被 alice 认领了')
    expect(onChanged).toHaveBeenCalled() // the page shows the new owner
    // brain-kit's text without the owner: the owner said beside it
    answer = { ...LOST, text: '晚了一步', problem: { level: 'FAIL', text: '有人先认领了', todo: '找别的小需求认领' } }
    await user.click(btn('认领'))
    await waitFor(() => expect(screen.getByTestId('fam-claim-result')).toHaveTextContent('现在在 alice 手里。'))
    const rows = within(screen.getByTestId('fam-claim-result')).getByTestId('check-rows')
    expect(rows).toHaveTextContent('有人先认领了')
    expect(rows).toHaveTextContent('做什么找别的小需求认领')
  })

  test('放弃认领 asks first; 取消 sends nothing; 确定放弃 posts {release: true}', async () => {
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/claim`]: () => ({ ok: true, text: '放回去了：PAY-3 又是待认领', owner: null, problem: null, output: '' }) })
    const { user } = renderPanel(child({ state: 'claimed', state_label: 'carol 认领了', owner: 'carol', acts: { ...NO_ACTS, release: { ok: true, why: '' } } }))
    await user.click(btn('放弃认领'))
    const ask = screen.getByRole('group', { name: '确认放弃认领' })
    expect(ask).toHaveTextContent('放回去以后，PAY-3 又是待认领，谁都能认领。')
    await user.click(within(ask).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('group', { name: '确认放弃认领' })).toBeNull()
    expect(posts()).toEqual([])
    await user.click(btn('放弃认领'))
    await user.click(within(screen.getByRole('group', { name: '确认放弃认领' })).getByRole('button', { name: '确定放弃' }))
    expect(await screen.findByTestId('fam-claim-result')).toHaveTextContent('放回去了：PAY-3 又是待认领')
    expect(posts()).toEqual([{ method: 'POST', path: `${API}/requirements/r1/PAY-3/claim`, body: { release: true } }])
  })

  test('放弃认领 off once its run branch is there: the why beside it', () => {
    renderPanel(child({ state: 'in_progress', acts: { ...NO_ACTS, release: { ok: false, why: '已经开了 run 分支：不让放回' } } }))
    expect(btn('放弃认领')).toBeDisabled()
    expect(btn('放弃认领')).toHaveAccessibleDescription('已经开了 run 分支：不让放回')
  })

  test('开工 posts start with its session; the answer: its branch and worktree, 打开会话, and in 需求详情 看需求看板', async () => {
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/start`]: () => STARTED })
    const { user, go, onChanged } = renderPanel(child({ blocked_by: [], depends_on: [DEP5], state: 'claimed', owner: 'carol', acts: { ...NO_ACTS, start: { ok: true, why: '' } } }))
    expect(btn('开工')).toHaveClass('is-primary')
    await user.click(screen.getByLabelText('开工后这个会话的工具调用不用逐个批准'))   // off
    await user.click(btn('开工'))
    const out = await screen.findByTestId('fam-start-result')
    expect(within(out).getByRole('status')).toHaveTextContent('开工了：PAY-3')
    expect(out).toHaveTextContent('ai/carol/PAY-3-web')
    expect(out).toHaveTextContent('/Users/carol/.brain/worktrees/shop-pay/PAY-3')
    expect(posts()).toEqual([{ method: 'POST', path: `${API}/requirements/r1/PAY-3/start`, body: { open_session: true, trust: false } }])
    expect(onChanged).toHaveBeenCalled()
    await user.click(within(out).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-3-a1b2'])
    await user.click(within(out).getByRole('button', { name: '需求看板' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-3', from: 'item' })
  })

  test('on the board the start offers no 看需求看板 (it is this one); a session that did not open says why', async () => {
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/start`]: () => ({ ...STARTED, url: null, slot: null, session_error: 'KiroCrew 没有回应' }) })
    const { user } = renderPanel(child({ acts: { ...NO_ACTS, start: { ok: true, why: '' } } }), { look: 'board' })
    await user.click(btn('开工'))
    const out = await screen.findByTestId('fam-start-result')
    expect(within(out).queryByRole('button', { name: '需求看板' })).toBeNull()
    expect(within(out).queryByRole('button', { name: '打开会话' })).toBeNull()
    expect(within(out).getByRole('alert')).toHaveTextContent('会话没开成：KiroCrew 没有回应')
  })

  test('「在 PAY-2 的分支上先做」 only when acts.start_on is set; it posts start {on}', async () => {
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/start`]: () => ({ ...STARTED, on: 'PAY-2', text: '开工了：PAY-3（在 PAY-2 的分支上）' }) })
    const off = { ok: false, why: 'PAY-3 依赖 PAY-2（api，alice 在做）：它还没合进 ai/alice/PAY-1-big' }
    const { user, rerender } = renderPanel(child({ acts: { ...NO_ACTS, start: off } }))
    noBtn(/的分支上先做/)
    rerender(child({ acts: { ...NO_ACTS, start: off, start_on: 'PAY-2' } }))
    const on = btn('在 PAY-2 的分支上先做')
    expect(on).toBeEnabled()
    expect(panel()).toHaveTextContent('PAY-2 合并之前，你的 MR 里也带着它的提交')
    await user.click(on)
    const out = await screen.findByTestId('fam-start-result')
    expect(out).toHaveTextContent('开工了：PAY-3（在 PAY-2 的分支上）')
    expect(out).toHaveTextContent('先做在PAY-2的分支上')
    expect(posts()).toEqual([{ method: 'POST', path: `${API}/requirements/r1/PAY-3/start`, body: { on: 'PAY-2', open_session: true, trust: true } }])
  })

  test('a start refused for a dependency names it and who has it; when brain-kit allows it, --on right there; brain start’s output stays folded', async () => {
    let calls = 0
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/start`]: () => (++calls === 1 ? BLOCKED : { ...STARTED, on: 'PAY-2' }) })
    const { user } = renderPanel(child({ acts: { ...NO_ACTS, start: { ok: true, why: '' } } }))
    await user.click(btn('开工'))
    const out = await screen.findByTestId('fam-start-result')
    expect(out).toHaveClass('is-bad')
    expect(within(out).getByRole('status')).toHaveTextContent('没开成：PAY-3 依赖的 PAY-2 还没合进大需求的分支')
    expect(within(out).getByTestId('fam-dep')).toHaveTextContent('PAY-2（api，alice 在做）')
    expect(out.querySelector('details')).not.toHaveAttribute('open')
    expect(within(out).getByText(BLOCKED.output)).toBeInTheDocument()
    expect(within(out).queryByRole('button', { name: '打开会话' })).toBeNull()
    await user.click(within(out).getByRole('button', { name: '在 PAY-2 的分支上先做' }))
    await waitFor(() => expect(screen.getByTestId('fam-start-result')).toHaveClass('is-ok'))
    expect(posts().map((c) => c.body)).toEqual([{ open_session: true, trust: true }, { on: 'PAY-2', open_session: true, trust: true }])
  })

  test('同步 posts sync; conflicts are listed with what to do', async () => {
    const conflicts: SyncResult = { ok: false, result: 'conflicts', text: '合进来了，但有 2 个文件冲突', conflicts: ['web/src/refund.tsx', 'aidlc-docs/audit/ledger.jsonl'], problem: null, output: 'CONFLICT (content): Merge conflict in web/src/refund.tsx' }
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/sync`]: () => conflicts })
    const { user, onChanged } = renderPanel(child({ state: 'in_progress', owner: 'carol', blocked_by: [], acts: { ...NO_ACTS, sync: { ok: true, why: '' } } }))
    await user.click(btn('同步'))
    const out = await screen.findByTestId('fam-sync-result')
    expect(out).toHaveAttribute('data-result', 'conflicts')
    expect(out).toHaveClass('is-warn')
    expect(within(out).getByRole('status')).toHaveTextContent('合进来了，但有 2 个文件冲突')
    const list = within(out).getByTestId('fam-conflicts')
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['web/src/refund.tsx', 'aidlc-docs/audit/ledger.jsonl'])
    expect(list).toHaveTextContent('做什么在这个小需求的工作目录里改好这些文件，git add、git commit，再点一次「同步」。')
    expect(within(out).getByText('细节：同步时 brain-kit 的原话').closest('details')).not.toHaveAttribute('open')
    expect(posts()).toEqual([{ method: 'POST', path: `${API}/requirements/r1/PAY-3/sync`, body: {} }])
    expect(onChanged).toHaveBeenCalled()
  })

  test('同步 refused: its problem as a check row; merged: brain-kit’s words', async () => {
    let answer: SyncResult = { ok: false, result: 'refused', text: '没同步', conflicts: [], output: 'refusing: uncommitted changes',
      problem: { level: 'FAIL', text: '工作目录里还有别的没提交的改动', todo: '先提交或收起来，再同步' } }
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/sync`]: () => answer })
    const { user } = renderPanel(child({ state: 'in_progress', acts: { ...NO_ACTS, sync: { ok: true, why: '' } } }))
    await user.click(btn('同步'))
    const out = await screen.findByTestId('fam-sync-result')
    expect(out).toHaveClass('is-bad')
    expect(within(out).getByTestId('check-rows')).toHaveTextContent('工作目录里还有别的没提交的改动做什么先提交或收起来，再同步')
    answer = { ok: true, result: 'merged', text: '把 ai/alice/PAY-1-big 合进来了；Lean 自己的文件自动解决了', conflicts: [], problem: null, output: '' }
    await user.click(btn('同步'))
    await waitFor(() => expect(screen.getByTestId('fam-sync-result')).toHaveClass('is-ok'))
    expect(screen.getByTestId('fam-sync-result')).toHaveTextContent('把 ai/alice/PAY-1-big 合进来了；Lean 自己的文件自动解决了')
    expect(within(screen.getByTestId('fam-sync-result')).queryByText(/brain-kit 的原话$/)).toBeNull()
  })

  test('an error answer shows errorText', async () => {
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-3/sync`]: () => { throw apiError(409, 'no_worktree', '这个小需求的工作目录不在这台机器上') } })
    const { user } = renderPanel(child({ state: 'in_progress', acts: { ...NO_ACTS, sync: { ok: true, why: '' } } }))
    await user.click(btn('同步'))
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('这个小需求的工作目录不在这台机器上（409）')
  })

  test('拆成小需求: the preview first, as a table (新号 for a new one), warnings as check rows; nothing is written before 确定拆', async () => {
    installFixtureRoutes({
      [`POST ${API}/requirements/r1/PAY-1/split`]: (body) => ((body as { apply: boolean }).apply ? APPLIED : PREVIEW),
    })
    const { user, onChanged } = renderPanel(big({ acts: { ...NO_ACTS, split: { ok: true, why: '' } } }))
    expect(panel()).toHaveTextContent('先看会拆成什么，什么都不写')
    await user.click(btn('拆成小需求'))
    const box = await screen.findByTestId('split-preview')
    expect(within(box).getByRole('status')).toHaveTextContent('先看一眼：会这样拆（还什么都没写）')
    expect(box).toHaveTextContent('会拆成 3 个小需求，都是新登记（待认领）。')
    expect(box).toHaveTextContent('unit-of-work.md 31369169 · 设计审批 4a037c33 批过 · 大需求的分支 ai/alice/PAY-1-big')
    const table = within(box).getByRole('table', { name: '会拆成这些小需求' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['单元', '需求号', '怎么办', '路径', '依赖', '契约'])
    const rows = within(table).getAllByTestId('split-row')
    expect(rows.map((r) => r.querySelector('td:nth-child(2)')?.textContent)).toEqual(['新号', '新号', '新号'])
    expect(rows[0]).toHaveTextContent('services/api/**aidlc-docs/contracts/api/**')
    expect(rows[0]).toHaveTextContent('aidlc-docs/contracts/api/refunds.yaml')
    expect(rows[1]).toHaveTextContent('api（新）')
    expect(rows[2]).toHaveTextContent('不依赖')
    expect(rows[0]).toHaveTextContent('新登记（待认领）')
    const warn = within(box).getByLabelText('提醒')
    expect(within(warn).getByTestId('check-rows')).toHaveTextContent('AC-3 的文字过不了 Brain 内容检查：只抄了编号')
    expect(within(box).getByText('细节：看拆法时 brain-kit 的原话').closest('details')).not.toHaveAttribute('open')
    expect(posts()).toEqual([{ method: 'POST', path: `${API}/requirements/r1/PAY-1/split`, body: { apply: false } }])
    expect(onChanged).not.toHaveBeenCalled()

    await user.click(btn('确定拆'))
    const done = await screen.findByTestId('split-result')
    expect(within(done).getByRole('status')).toHaveTextContent('拆好了')
    expect(done).toHaveTextContent('PAY-1 拆成 3 个小需求，已推送 ai/alice/PAY-1-big。')
    const keys = within(within(done).getByRole('table', { name: '拆成了这些小需求' })).getAllByTestId('split-row').map((r) => r.querySelector('td:nth-child(2)')?.textContent)
    expect(keys).toEqual(['PAY-2', 'PAY-3', 'PAY-4'])
    expect(within(done).getByText('细节：拆成小需求时 brain-kit 的原话')).toBeInTheDocument()
    expect(posts().map((c) => c.body)).toEqual([{ apply: false }, { apply: true }])
    expect(onChanged).toHaveBeenCalledTimes(1)
    noBtn('确定拆')
    await user.click(btn('收起'))
    expect(screen.queryByTestId('split-box')).toBeNull()
  })

  test('the answer of a split stays when the panel becomes the parent’s (the page read itself again)', async () => {
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-1/split`]: (body) => ((body as { apply: boolean }).apply ? APPLIED : PREVIEW) })
    const { user, rerender } = renderPanel(big({ acts: { ...NO_ACTS, split: { ok: true, why: '' } } }))
    await user.click(btn('拆成小需求'))
    await user.click(await within(panel()).findByRole('button', { name: '确定拆' }))
    await screen.findByTestId('split-result')
    rerender(parent({ acts: { ...NO_ACTS, split: { ok: true, why: '' } } }))
    expect(panel()).toHaveAttribute('data-role', 'parent')
    expect(screen.getByTestId('split-result')).toHaveTextContent('拆好了')
  })

  test('a re-split on a parent marks the rows that need a word with whoever has them', async () => {
    const again: SplitResult = {
      ...PREVIEW, text: '拆法变了：1 个新登记，1 个按新拆法更新，1 个已经有人认领：没改。',
      actions: [
        action('api', 'same', '没变', 'PAY-2'),
        action('web', 'update', '按新拆法更新（还没人认领）', 'PAY-3'),
        action('jobs', 'changed', '拆分变了，但已经有人认领或开工：没改', 'PAY-4', { why: ['bob 认领了：和他说一声'], attention: true }),
        action('admin', 'new', '新登记（待认领）', null),
      ],
      warnings: [],
    }
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-1/split`]: () => again })
    const { user } = renderPanel(parent({ acts: { ...NO_ACTS, split: { ok: true, why: '' } } }))
    expect(panel()).toHaveTextContent('拆法变了、设计又批了：再拆一次')
    await user.click(btn('拆成小需求'))
    const rows = within(await screen.findByTestId('split-preview')).getAllByTestId('split-row')
    expect(rows.map((r) => r.dataset.attention ?? '')).toEqual(['', '', 'true', ''])
    expect(rows[2]).toHaveClass('is-attention')
    expect(rows[2]).toHaveTextContent('拆分变了，但已经有人认领或开工：没改要和认领的人说一声bob 认领了：和他说一声')
    expect(rows.map((r) => r.querySelector('td:nth-child(2)')?.textContent)).toEqual(['PAY-2', 'PAY-3', 'PAY-4', '新号'])
    expect(within(screen.getByTestId('split-preview')).queryByLabelText('提醒')).toBeNull()
  })

  test('a refused split shows why as check rows, offers no 确定拆; 取消 closes it and nothing was written', async () => {
    const refused: SplitResult = {
      ...PREVIEW, ok: false, actions: [], warnings: [], units_sha: null, design_sha: null, text: '拆不了：有 2 条不满足。', output: 'refused: 2 problems',
      problems: [
        { level: 'FAIL', text: 'DESIGN 批完以后又改了 unit-of-work.md', todo: '重新 lean stage done units，再批一次 DESIGN' },
        { level: 'FAIL', text: 'aidlc-docs/ 还有没提交的改动', todo: '先提交' },
      ],
    }
    installFixtureRoutes({ [`POST ${API}/requirements/r1/PAY-1/split`]: () => refused })
    const { user } = renderPanel(big({ acts: { ...NO_ACTS, split: { ok: true, why: '' } } }))
    await user.click(btn('拆成小需求'))
    const box = await screen.findByTestId('split-preview')
    expect(box).toHaveClass('is-bad')
    expect(within(box).getByRole('status')).toHaveTextContent('拆不了')
    const why = within(within(box).getByLabelText('为什么拆不了')).getByTestId('check-rows')
    expect(within(why).getAllByRole('listitem').map((li) => li.dataset.level)).toEqual(['FAIL', 'FAIL'])
    expect(why).toHaveTextContent('DESIGN 批完以后又改了 unit-of-work.md做什么重新 lean stage done units，再批一次 DESIGN')
    noBtn('确定拆')
    expect(btn('再看一次')).toBeEnabled()
    await user.click(btn('取消'))
    expect(screen.queryByTestId('split-box')).toBeNull()
    expect(btn('拆成小需求')).toBeEnabled()
    expect(posts().map((c) => c.body)).toEqual([{ apply: false }])
  })

  test('in a replay (quiet) nothing is offered: no actions, no split', () => {
    const acts: FamilyActs = { split: { ok: true, why: '' }, claim: { ok: true, why: '' }, release: { ok: true, why: '' }, start: { ok: true, why: '' }, start_on: 'PAY-2', sync: { ok: true, why: '' } }
    const { rerender } = renderPanel(child({ acts }), { quiet: true, look: 'board' })
    expect(within(panel()).getAllByRole('button').map((b) => b.textContent)).toEqual(['PAY-1'])   // only the way to its big one
    rerender(parent({ acts }))
    noBtn('拆成小需求')
  })
})
