import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { apiCalls, apiError, navigations } from '../test/stubs/app-sdk'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { parseView, searchOf } from '../nav'
import type { CheckRow, CrewChecks, IntakeCheck, RepoMe, Status } from '../types'
import { NAME_RULE } from '../ui'
import { GATE4, GATE5, HERO_TEXT, NO_CONFIDENTIAL, NewView, REVIEW_HINT, STARTED_NEXT, slugFrom } from './NewReq'

/** KiroCrew with nothing that stops a session (the fixtures' status has a ✗ row: the tests of it bring their own). */
function calmCrew(): CrewChecks {
  const c = fx.crew()
  return { ...c, rows: c.rows.filter((r) => r.level === 'OK') }
}
function calmStatus(): Status {
  const s = fx.status()
  s.crew = { ...s.crew, rows: s.crew.rows.filter((r) => r.level === 'OK') }
  return s
}

function setup(routes: Parameters<typeof installFixtureRoutes>[0] = {}, status: Status = calmStatus(), entry = {}) {
  installFixtureRoutes({
    [`GET ${API}/crew`]: () => calmCrew(),
    [`POST ${API}/intake/check`]: () => fx.intakeCheck(),
    [`POST ${API}/intake/start`]: () => fx.start(),
    ...routes,
  })
  const props = { status, go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn() }
  render(<NewView entry={entry} {...props} />)
  return { user: userEvent.setup(), props }
}

const PATHS = '预计会改的路径（用逗号、空格或换行分开）'
const SLUG = '英文短名（用在分支名里）'
const EXCLUDE = '不收这些文件（按文件名，可以用 *，一行一个）'
const startBtn = () => screen.getByRole('button', { name: '开工' })
const gateStates = () => [1, 2, 3, 4, 5].map((n) => screen.getByTestId(`gate-${n}`).dataset.state)
const flowStates = () => within(screen.getByRole('list', { name: '开需求的步骤' })).getAllByRole('listitem').map((li) => li.dataset.state)
const checkBtn = () => screen.getByRole('button', { name: '先检查（不写入）' })

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('PAY-8'))
  await user.type(screen.getByLabelText('标题'), '商户结算周报')
  await user.clear(screen.getByLabelText(SLUG))
  await user.type(screen.getByLabelText(SLUG), 'merchant-weekly')
}

async function fillGates(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('文档（一行一个路径）'), '/Users/alice/Downloads/结算周报需求')
  await user.click(screen.getByLabelText('我是作者，或已取得作者同意'))
  await user.click(screen.getByLabelText('内部'))
  await user.click(screen.getByLabelText('原样保留'))
  await user.type(screen.getByLabelText(EXCLUDE), '*合作方*')
}

describe('开需求', () => {
  test('a check shows each file as a card in plain words; 开工 waits for a clean check of exactly this form; the start posts the whole body', async () => {
    const { user, props } = setup()
    await fillBasics(user)
    await fillGates(user)
    await user.type(screen.getByLabelText(PATHS), 'src/statement/{Enter}src/report/weekly.py')
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('有文档：先检查一遍')

    await user.click(checkBtn())
    const files = await screen.findByTestId('check-files')
    const d01 = files.querySelector('[data-file="D01"]') as HTMLElement
    expect(d01).toHaveTextContent('结算周报需求.docx')
    expect(within(d01).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['电话 2 处：已打码', '金额 4 处：原样保留'])
    expect(files.querySelector('[data-file="D04"]')).toHaveTextContent('没收：图片文件不收')
    expect(files).not.toHaveTextContent('phone×2')                                      // no code labels, no Markdown
    expect(files).not.toHaveTextContent('**')
    const pkg = screen.getByTestId('check-summary')
    expect(within(pkg).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['密级机密', '12段', '需求号PAY-8'])
    // brain-kit's own lines stay, folded under 细节
    const raw = screen.getByTestId('findings')
    expect(raw.closest('details')).not.toHaveAttribute('open')
    for (const line of fx.intakeCheck().findings) expect(raw).toHaveTextContent(line)
    const checkCall = apiCalls.find((c) => c.method === 'POST' && c.path === `${API}/intake/check`)
    expect(checkCall?.body).toEqual({
      repo: 'r1', key: 'PAY-8', slug: 'merchant-weekly', title: '商户结算周报', docs: ['/Users/alice/Downloads/结算周报需求'],
      consent: true, classification: 'internal', business: 'keep', exclude: ['*合作方*'],
    })
    expect(startBtn()).toBeEnabled()

    // a change to what was checked: 开工 is off until the form is checked again
    await user.type(screen.getByLabelText('标题'), '（按周）')
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('表单改过了')
    await user.clear(screen.getByLabelText('标题'))
    await user.type(screen.getByLabelText('标题'), '商户结算周报')
    expect(startBtn()).toBeEnabled() // the same form as the one checked
    await user.type(screen.getByLabelText('文档（一行一个路径）'), '{Enter}/Users/alice/Downloads/样例.xlsx')
    expect(startBtn()).toBeDisabled()
    await user.click(checkBtn())
    await waitFor(() => expect(startBtn()).toBeEnabled())
    // options and expected paths are not part of the gates: no new check needed
    await user.click(screen.getByLabelText('这个会话的工具调用不用逐个批准'))
    await user.click(screen.getByLabelText('这个会话的工具调用不用逐个批准'))
    expect(startBtn()).toBeEnabled()

    await user.click(startBtn())
    const out = await screen.findByTestId('start-result')
    expect(within(out).getByRole('status')).toHaveTextContent('开工了：PAY-8')
    expect(out).toHaveTextContent(STARTED_NEXT)                                       // what happens in the session
    expect(out).toHaveTextContent('ai/alice/PAY-8-merchant-weekly')
    expect(out).toHaveTextContent('/Users/alice/workplace/brain-app/PAY-8-merchant-weekly')
    expect(out.querySelector('dl')).not.toHaveTextContent('Lean intent')
    const startCall = apiCalls.find((c) => c.method === 'POST' && c.path === `${API}/intake/start`)
    expect(startCall?.body).toEqual({
      repo: 'r1', key: 'PAY-8', slug: 'merchant-weekly', title: '商户结算周报',
      docs: ['/Users/alice/Downloads/结算周报需求', '/Users/alice/Downloads/样例.xlsx'],
      consent: true, classification: 'internal', business: 'keep', exclude: ['*合作方*'],
      paths: ['src/statement/', 'src/report/weekly.py'], open_session: true, trust: true,
    })
    expect(props.reloadStatus).toHaveBeenCalled()
    expect(startBtn()).toBeDisabled() // started once

    await user.click(within(out).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-8-2c9d'])
    await user.click(within(out).getByRole('button', { name: '需求看板' }))
    expect(props.go).toHaveBeenCalledWith({ kind: 'board', repo: 'r1', key: 'PAY-8' })
    await user.click(within(out).getByRole('button', { name: '需求详情' }))
    expect(props.go).toHaveBeenLastCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-8' })
  })

  test('what may be a name or a password is listed under 请你确认 (not masked, not stopping 开工); the gate 4 rule says so', async () => {
    const { user } = setup()
    await fillBasics(user)
    await fillGates(user)
    expect(within(screen.getByTestId('gate-4')).getByText(GATE4)).toBeInTheDocument()
    expect(within(screen.getByTestId('gate-5')).getByText(GATE5)).toBeInTheDocument()
    expect(GATE4).toContain('请你确认')
    await user.click(checkBtn())
    const review = await screen.findByTestId('review')
    expect(within(review).getByText('请你确认')).toBeInTheDocument()
    const [item] = fx.intakeCheck().review
    expect(within(review).getByText(item)).toHaveTextContent('D01 结算周报需求.docx：请你确认 1 处')
    expect(review).toHaveTextContent('「对接人：张三李四」')
    expect(review).toHaveTextContent(REVIEW_HINT)
    expect(startBtn()).toBeEnabled()
    expect(screen.getByTestId('gate-4')).toHaveAttribute('data-state', 'warn') // the gate shows it, in the warn tone
    expect(screen.getByTestId('gate-5')).toHaveAttribute('data-state', 'ok')
  })

  test('a check without review findings shows no 请你确认', async () => {
    const { user } = setup({ [`POST ${API}/intake/check`]: (): IntakeCheck => ({ ...fx.intakeCheck(), review: [] }) })
    await fillBasics(user)
    await fillGates(user)
    await user.click(checkBtn())
    await screen.findByTestId('check-files')
    expect(screen.queryByTestId('review')).toBeNull()
  })

  test('a check a gate stops says what to do on this page: the gate goes red, the field it names is marked, 开工 stays off', async () => {
    const blocking = '第 2 关：这个仓库不收机密材料（D03 合作方接口说明.pdf 标着机密）。请产品写一份脱敏摘要再交，或者把这份写进「不收这些文件」'
    const raw = '门 2：材料按机密处理（D03 合作方接口说明.pdf=confidential），而 intake.allow_confidential 是 false（决策 02 未放行）。请产品写一份脱敏摘要再交，或用 --exclude 去掉这份。'
    const { user } = setup({
      [`POST ${API}/intake/check`]: (): IntakeCheck => ({ ...fx.intakeCheck(), ok: false, classification: 'confidential', blocking: [blocking], blocking_raw: [raw] }),
    })
    await fillBasics(user)
    await fillGates(user)
    await user.click(checkBtn())
    const stops = await screen.findByTestId('blocking')
    expect(stops).toHaveTextContent(blocking)
    expect(stops).not.toHaveTextContent('--exclude')
    expect(screen.getByTestId('findings')).toHaveTextContent(raw)                       // brain-kit's words: under 细节
    expect(screen.getByLabelText(EXCLUDE).closest('.br-field')).toHaveAttribute('data-marked', 'true')
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('检查没过')
    expect(screen.getByTestId('gate-2')).toHaveAttribute('data-state', 'bad')
    expect(screen.getByTestId('gate-1')).toHaveAttribute('data-state', 'ok')
    expect(flowStates()).toEqual(['done', 'bad', undefined, undefined, undefined])
  })

  test('gate 2 says up front that this repo takes no confidential material; picking it stops at once', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.type(screen.getByLabelText('文档（一行一个路径）'), '/Users/alice/Downloads/a.docx')
    const gate = screen.getByTestId('gate-2')
    expect(within(gate).getByTestId('gate2-rule')).toHaveTextContent(NO_CONFIDENTIAL)
    const pick = (v: string) => gate.querySelector(`input[value="${v}"]`) as HTMLInputElement
    for (const k of ['confidential', 'secret', 'unsure']) expect(pick(k).closest('label')).toHaveTextContent('不收')
    expect(pick('internal').closest('label')).not.toHaveTextContent('不收')
    await user.click(screen.getByLabelText('我是作者，或已取得作者同意'))
    await user.click(pick('confidential'))
    expect(gate).toHaveAttribute('data-state', 'bad')
    expect(screen.getByTestId('start-why')).toHaveTextContent(NO_CONFIDENTIAL)
    await user.click(within(gate).getByLabelText('内部'))
    expect(gate).toHaveAttribute('data-state', 'ok')
  })

  test('a repo that takes confidential material says nothing of the sort', async () => {
    const { user } = setup({ [`GET ${API}/intake/next*`]: () => ({ ...fx.intakeNext(), allow_confidential: true }) })
    await fillBasics(user)
    await user.type(screen.getByLabelText('文档（一行一个路径）'), '/Users/alice/Downloads/a.docx')
    expect(screen.queryByTestId('gate2-rule')).toBeNull()
    const pick = (v: string) => screen.getByTestId('gate-2').querySelector(`input[value="${v}"]`) as HTMLInputElement
    expect(pick('confidential').closest('label')).not.toHaveTextContent('不收')
    expect(pick('secret').closest('label')).toHaveTextContent('不收')                  // brain-kit never takes it
  })

  test('a check that fails (a hard stop or a request error) says so and keeps 开工 off', async () => {
    const { user } = setup({ [`POST ${API}/intake/check`]: () => { throw apiError(400, 'invalid_intake', '第 1 关：勾上「我是作者，或已取得作者同意」') } })
    await fillBasics(user)
    await user.type(screen.getByLabelText('文档（一行一个路径）'), '/Users/alice/Downloads/a.docx')
    await user.click(checkBtn())
    expect(await screen.findByText('第 1 关：勾上「我是作者，或已取得作者同意」（400）')).toBeInTheDocument()
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('gate-1')).toHaveAttribute('data-state', 'bad')
  })

  test('without documents the five gates are one line and nothing needs checking: 开工 is on once title and 英文短名 are valid', async () => {
    const { user } = setup()
    await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('PAY-8'))
    expect(screen.getByTestId('no-docs')).toHaveTextContent('没有文档：五关')
    expect(screen.queryByTestId('gate-1')).toBeNull()
    expect(screen.queryByRole('button', { name: '先检查（不写入）' })).toBeNull()
    expect(startBtn()).toBeDisabled()
    await user.type(screen.getByLabelText('标题'), '商户结算周报')
    await user.clear(screen.getByLabelText(SLUG))
    await user.type(screen.getByLabelText(SLUG), 'Bad_Slug')
    expect(screen.getByLabelText(SLUG)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('英文短名只能用英文小写、数字和 -')
    expect(startBtn()).toBeDisabled()
    await user.clear(screen.getByLabelText(SLUG))
    await user.type(screen.getByLabelText(SLUG), 'merchant-weekly')
    expect(startBtn()).toBeEnabled()
    await user.click(startBtn())
    await screen.findByTestId('start-result')
    const startCall = apiCalls.find((c) => c.method === 'POST' && c.path === `${API}/intake/start`)
    expect(startCall?.body).toMatchObject({ docs: [], paths: [], open_session: true, trust: true })
    expect(apiCalls.some((c) => c.path === `${API}/intake/check`)).toBe(false)
  })

  test('the 英文短名 follows the title (its English words, else req-<n>) until it is edited', async () => {
    expect(slugFrom('商户结算周报 Weekly Report', 'PAY-8')).toBe('weekly-report')
    expect(slugFrom('商户结算周报', 'PAY-8')).toBe('req-8')
    const { user } = setup()
    await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('PAY-8'))
    await user.type(screen.getByLabelText('标题'), '退款 refund v2')
    expect(screen.getByLabelText(SLUG)).toHaveValue('refund-v2')
    expect(startBtn()).toBeEnabled()
    await user.click(startBtn())
    await screen.findByTestId('start-result')
    expect(apiCalls.find((c) => c.path === `${API}/intake/start`)?.body).toMatchObject({ slug: 'refund-v2', title: '退款 refund v2' })
  })

  test('the expected paths may be separated by commas, spaces or new lines: the start sends them as a list', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.type(screen.getByLabelText(PATHS), 'calc.py, tests')
    await user.click(startBtn())
    await screen.findByTestId('start-result')
    expect(apiCalls.find((c) => c.method === 'POST' && c.path === `${API}/intake/start`)?.body).toMatchObject({ paths: ['calc.py', 'tests'] })
  })

  test('the key is prefilled from /intake/next, editable, and required when the repo uses Jira', async () => {
    const { user } = setup({ [`GET ${API}/intake/next*`]: () => ({ ...fx.intakeNext(), key: null, tracker: 'jira' }) })
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/intake/next?repo=r1`)).toBe(true))
    await user.type(screen.getByLabelText('标题'), '商户结算周报 weekly')
    expect(await screen.findByText(/这个仓库用 Jira：填 Jira 上的需求号/)).toBeInTheDocument()
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('要填需求号')
    await user.type(screen.getByLabelText('需求号'), 'PAY-21')
    expect(startBtn()).toBeEnabled()
  })

  test('a requirement claimed already (from 需求看板): its key fixed, its title filled, 开工 starts that claim', async () => {
    const { user } = setup({}, calmStatus(), { repo: 'r1', key: 'PAY-2', title: '对账单按自然日切分' })
    expect(screen.getByRole('heading', { name: '开工：PAY-2' })).toBeInTheDocument()
    expect(screen.getByLabelText('需求号')).toHaveValue('PAY-2')
    expect(screen.getByLabelText('需求号')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('仓库')).toBeDisabled()
    expect(screen.getByLabelText('标题')).toHaveValue('对账单按自然日切分')
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/intake/next?repo=r1`)).toBe(true))
    expect(screen.getByLabelText('需求号')).toHaveValue('PAY-2')                        // not the next free key
    await user.type(screen.getByLabelText(SLUG), 'x')
    await user.clear(screen.getByLabelText(SLUG))
    await user.type(screen.getByLabelText(SLUG), 'daily-cut')
    await user.click(startBtn())
    await screen.findByTestId('start-result')
    expect(apiCalls.find((c) => c.path === `${API}/intake/start`)?.body).toMatchObject({ key: 'PAY-2', title: '对账单按自然日切分', slug: 'daily-cut' })
    // the link that opens it
    const v = parseView('?view=new&repo=r1&key=PAY-2&title=' + encodeURIComponent('对账单\n按自然日'))
    expect(v).toEqual({ kind: 'new', repo: 'r1', key: 'PAY-2', title: '对账单 按自然日' })
    expect(parseView(searchOf(v))).toEqual(v)
    expect(parseView('?view=new&key=PAY-2')).toEqual({ kind: 'new' })                 // a key only with its repo
    expect(parseView('?view=new&repo=r1&key=pay-2')).toEqual({ kind: 'new', repo: 'r1' })
  })

  test('brain-kit in this checkout only, not on origin yet: 开工 waits for 推送, right there', async () => {
    installFixtureRoutes({ [`POST ${API}/import/push`]: () => fx.importPush() })
    const { user } = setup({ [`GET ${API}/intake/next*`]: () => ({ ...fx.intakeNext(), push: { branch: 'main', remote_url: 'git@gitlab.example.com:shop/shop-pay.git' } }) })
    await fillBasics(user)
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('先推送 main：开工从远端的 main 建分支')
    const box = screen.getByTestId('new-push')
    await user.click(within(box).getByRole('button', { name: '推送 main' }))
    expect(within(box).getByTestId('push-team')).toHaveTextContent('这会直接改团队的 main，没有 MR 评审')
  })

  test('KiroCrew cannot open the session (a ✗): 开工 is off and names the fix button; without a session it may start', async () => {
    const bad: CheckRow = { level: 'FAIL', text: '没有 ~/.kiro/agents/brain-dev.json', todo: '点「装上 brain-dev」：装上 brain-kit 带的那一份；没有它，Lean 的 hook 在 KiroCrew 里不会跑', fix: 'agent', repo: null, raw: '' }
    const crew = { ...fx.crew(), rows: [bad] }
    const status = calmStatus()
    status.crew = { ...status.crew, rows: [bad] }
    const { user } = setup({ [`GET ${API}/crew`]: () => crew }, status)
    await fillBasics(user)
    const card = screen.getByRole('region', { name: 'KiroCrew 的检查' })
    expect(within(card).getByRole('button', { name: '装上 brain-dev' })).toBeInTheDocument()   // the name the text says
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('开不了会话：先点上面的「装上 brain-dev」')
    expect(screen.queryByTestId('start-ready')).toBeNull()
    await user.click(screen.getByLabelText(/开工后开会话/))
    expect(startBtn()).toBeEnabled()
  })

  test('KiroCrew’s checks show at once (from /status) and again from /crew; the fix button posts {what: agent}', async () => {
    let answer: () => void = () => {}
    const slow = new Promise<void>((r) => { answer = r })
    const { user, props } = setup({
      [`GET ${API}/crew`]: async () => { await slow; return fx.crew() },
      [`POST ${API}/crew/fix`]: () => ({ ok: true, text: '装好了：~/.kiro/agents/brain-dev.json', rows: fx.crew().rows.map((r) => ({ ...r, level: 'OK' })) }),
    }, fx.status())
    const card = screen.getByRole('region', { name: 'KiroCrew 的检查' })            // before /crew answered: no jump later
    for (const r of fx.status().crew.rows.filter((x) => x.level !== 'OK')) expect(card).toHaveTextContent(r.text)
    answer()
    expect(card).not.toHaveTextContent('KiroCrew 引擎：kas') // OK rows are not listed here
    await user.click(within(card).getByRole('button', { name: '补上 Lean 的 hook' }))
    await waitFor(() => expect(apiCalls.find((c) => c.path === `${API}/crew/fix`)?.body).toEqual({ what: 'agent' }))
    expect(await screen.findByText('KiroCrew 的检查都过了。')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'KiroCrew 的检查' })).toBeNull()
    expect(props.reloadStatus).toHaveBeenCalled()
  })

  test('picking another repo rewrites the entry and reads its next key', async () => {
    const status = calmStatus()
    status.repos[1] = { ...status.repos[0], id: 'r2', name: 'shop-web', path: '/Users/alice/workplace/shop-web' }
    installFixtureRoutes({
      [`GET ${API}/crew`]: () => calmCrew(),
      [`GET ${API}/intake/next*`]: (_b, path) => ({ ...fx.intakeNext(), repo: path.endsWith('r2') ? 'r2' : 'r1', key: path.endsWith('r2') ? 'WEB-4' : 'PAY-8' }),
    })
    const replace = vi.fn()
    render(<NewView entry={{}} status={status} go={vi.fn()} replace={replace} reloadStatus={vi.fn()} setStatus={vi.fn()} />)
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('PAY-8'))
    expect(within(screen.getByLabelText('仓库')).getAllByRole('option').map((o) => o.textContent)).toEqual(['shop-pay', 'shop-web']) // names, not the app's r1
    await user.selectOptions(screen.getByLabelText('仓库'), 'r2')
    expect(replace).toHaveBeenCalledWith({ kind: 'new', repo: 'r2' })
    await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('WEB-4'))
  })

  test('no repo at all: no form, one way in; repos on their way only: no form, each with its state and its next step', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({})
    const none = fx.status()
    none.repos = []
    const go = vi.fn()
    const { unmount } = render(<NewView entry={{}} status={none} go={go} replace={vi.fn()} reloadStatus={vi.fn()} setStatus={vi.fn()} />)
    expect(screen.getByTestId('import-cta')).toHaveTextContent('开需求之前，先导入一个仓库')
    expect(screen.queryByRole('form', { name: '开需求' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '导入仓库' }))
    expect(go).toHaveBeenCalledWith({ kind: 'import' })
    unmount()
    const waiting = fx.status()
    waiting.repos = waiting.repos.slice(0, 2).map((r) => ({ ...r, ok: false, kit: null, me: null }))
    waiting.repos[0] = { ...waiting.repos[0], error: '还没装 brain-kit（没有 .brain/kit.json）：在「导入仓库」里检查它，装上就能用' }
    waiting.repos[1] = { ...waiting.repos[1], error: '', pending: fx.importInspectPending().pending }
    render(<NewView entry={{}} status={waiting} go={go} replace={vi.fn()} reloadStatus={vi.fn()} setStatus={vi.fn()} />)
    const card = screen.getByTestId('no-usable-repo')
    expect(screen.queryByRole('form', { name: '开需求' })).toBeNull()                   // no form nobody can fill
    const pend = card.querySelector(`[data-repo="${waiting.repos[1].id}"]`) as HTMLElement
    expect(pend).toHaveTextContent(fx.importInspectPending().pending!.word)
    expect(pend).toHaveTextContent(fx.importInspectPending().pending!.text)
    const broken = card.querySelector(`[data-repo="${waiting.repos[0].id}"]`) as HTMLElement
    await user.click(within(broken).getByRole('button', { name: '去导入仓库检查' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'import', path: waiting.repos[0].path })
    await user.click(within(card).getByRole('button', { name: /导入别的仓库/ }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'import' })
  })

  test('the hero says what happens; its steps follow the form: 认领 → 文档过五关 (not needed without documents) → 开工 → Lean 推进', async () => {
    const { user } = setup()
    const hero = screen.getByRole('region', { name: '开需求' })
    expect(hero).toHaveTextContent(HERO_TEXT)
    expect(HERO_TEXT).not.toMatch(/brain start|slug/)
    const steps = within(screen.getByRole('list', { name: '开需求的步骤' })).getAllByRole('listitem')
    expect(steps.map((li) => li.textContent)).toEqual([
      '1认领仓库、标题、需求号', '2文档过五关没有文档：不用过', '3开工在它自己的工作目录里开 AI 开发会话', '4Lean 推进需求和设计由你批准', '5交给运行机团队仓库：交接以后它接着做',
    ])
    expect(flowStates()).toEqual(['now', 'off', undefined, undefined, undefined])
    await fillBasics(user)
    expect(flowStates()).toEqual(['done', 'off', 'now', undefined, undefined])
    await user.type(screen.getByLabelText('文档（一行一个路径）'), '/Users/alice/Downloads/a.docx')
    expect(flowStates()).toEqual(['done', 'now', undefined, undefined, undefined])
    await fillGates(user)
    await user.click(checkBtn())
    await screen.findByTestId('check-result')
    expect(flowStates()).toEqual(['done', 'done', 'now', undefined, undefined])
    await user.click(startBtn())
    await screen.findByTestId('start-result')
    expect(flowStates()).toEqual(['done', 'done', 'done', 'now', undefined])
  })

  test('the five gates show their state: magenta while they wait for you, green once done', async () => {
    const { user } = setup()
    await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('PAY-8'))
    await user.type(screen.getByLabelText('文档（一行一个路径）'), '/Users/alice/Downloads/a.docx')
    expect(gateStates()).toEqual(['wait', 'wait', 'wait', 'auto', 'auto'])
    expect(screen.getByTestId('gate-1')).toHaveTextContent('等你勾')
    expect(screen.getByTestId('gate-2')).toHaveTextContent('等你选')
    expect(screen.getByTestId('gate-4')).toHaveTextContent('自动')
    await user.click(screen.getByLabelText('我是作者，或已取得作者同意'))
    await user.click(screen.getByLabelText('公开'))
    expect(gateStates()).toEqual(['ok', 'ok', 'wait', 'auto', 'auto'])
    await user.click(screen.getByLabelText('换成占位符'))
    expect(gateStates()).toEqual(['ok', 'ok', 'ok', 'auto', 'auto'])
    expect(screen.getByTestId('gate-3')).toHaveTextContent('好了')
    expect(screen.getByLabelText('换成占位符').closest('label')).toHaveClass('is-on')
  })

  test('a start that did not work says why in words and what to do; brain start’s output folded; no session', async () => {
    const problem: CheckRow = { level: 'FAIL', text: 'PAY-8 是 bob 认领的', todo: '只有 bob 能开工：问问 bob，或者开一个新需求', fix: null, repo: null, raw: 'brain: PAY-8 is claimed by bob' }
    const { user } = setup({ [`POST ${API}/intake/start`]: () => ({ ...fx.start(), ok: false, url: null, slot: null, output: 'brain: PAY-8 is claimed by bob', problem }) })
    await fillBasics(user)
    await user.click(startBtn())
    const out = await screen.findByTestId('start-result')
    expect(out).toHaveClass('is-bad')
    expect(within(out).getByRole('status')).toHaveTextContent('没开成：PAY-8 是 bob 认领的')
    expect(out).toHaveTextContent('只有 bob 能开工')
    expect(out.querySelector('details')).not.toHaveAttribute('open')
    expect(out.querySelector('details pre')).toHaveTextContent('brain: PAY-8 is claimed by bob')
    expect(within(out).queryByRole('button', { name: '打开会话' })).toBeNull()
    expect(screen.queryByTestId('start-who')).toBeNull()
    expect(flowStates()[2]).toBe('bad')
  })

  test('a start nobody could say why: its output is open', async () => {
    const { user } = setup({ [`POST ${API}/intake/start`]: () => ({ ...fx.start(), ok: false, url: null, slot: null, output: 'Traceback …' }) })
    await fillBasics(user)
    await user.click(startBtn())
    const out = await screen.findByTestId('start-result')
    expect(within(out).getByRole('status')).toHaveTextContent('没开成')
    expect(out.querySelector('details')).toHaveAttribute('open')
  })

  test('认领人: the name brain-kit goes by; with GitLab and no name 开工 says to click 保存, saved with git config', async () => {
    const ask: RepoMe = { name: null, source: 'none', gitlab: 'https://gitlab.example.com', text: '', ask: true, label: '你的 GitLab 用户名',
      why: '这个仓库用 GitLab：认领和交接都按这个名字认人，要和你在 GitLab 上的用户名一样', suggest: 'alice', error: '' }
    const asking = calmStatus()
    asking.repos[0] = { ...asking.repos[0], me: ask }
    const saved: Status = calmStatus()
    const named: RepoMe = { ...ask, name: 'alice-w', source: 'git', text: 'alice-w（这个仓库里记下的名字）', ask: false, label: '', why: '', suggest: '' }
    saved.repos[0] = { ...saved.repos[0], me: named }
    installFixtureRoutes({
      [`GET ${API}/crew`]: () => calmCrew(),
      [`POST ${API}/me/name`]: () => ({ ok: true, text: '这个仓库的 git config brain.user 设成了 alice-w', me: named, status: saved }),
    })
    const user = userEvent.setup()
    const props = { status: asking, go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn() }
    const { rerender } = render(<NewView entry={{}} {...props} />)
    await fillBasics(user)
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('先在上面「你的 GitLab 用户名」旁点「保存」（确认是 alice）')
    const who = screen.getByRole('group', { name: '你的 GitLab 用户名' })
    const input = within(who).getByLabelText('你的 GitLab 用户名')
    expect(input).toHaveValue('alice')                                              // the login name
    expect(who).toHaveTextContent(ask.why)
    await user.clear(input)
    await user.type(input, 'Alice W')
    expect(within(who).getByRole('button', { name: '保存' })).toBeDisabled()
    expect(who).toHaveTextContent(NAME_RULE)
    await user.clear(input)
    await user.type(input, 'Alice-W{Enter}')                                      // Enter saves; the 开需求 form is not sent
    await waitFor(() => expect(props.setStatus).toHaveBeenCalledWith(saved))
    expect(apiCalls.find((c) => c.path === `${API}/me/name`)?.body).toEqual({ path: '/Users/alice/workplace/shop-pay', name: 'alice-w' })
    expect(apiCalls.some((c) => c.path === `${API}/intake/start`)).toBe(false)
    expect(screen.getByTestId('new-me')).toHaveTextContent('alice-w（这个仓库里记下的名字）已保存')
    rerender(<NewView entry={{}} {...props} status={saved} />)
    expect(startBtn()).toBeEnabled()
    expect(screen.getByTestId('new-me')).toHaveTextContent('认领人')
  })

  test('a start brain-kit refused because it did not know who you are: the why in Chinese and the input right there', async () => {
    const r = { ...fx.start(), ok: false, key: null, branch: null, intent: null, worktree: null, slot: null, url: null,
      output: 'brain: who are you? set GITLAB_TOKEN (preferred) or `git config brain.user <gitlab-username>`',
      problem: { level: 'FAIL' as const, text: 'brain-kit 不知道你是谁', todo: '填上你的名字（用 GitLab 的仓库填 GitLab 用户名）。在下面填上，点「保存」（记在这个仓库的 git 设置里）',
        fix: 'me' as const, repo: '/Users/alice/workplace/shop-pay', raw: 'brain: who are you? …' },
      me: { name: null, source: 'none' as const, gitlab: '', text: '', ask: true, label: '你的名字', why: '要一个名字，认领需求时用：这个仓库不用 GitLab，用登录名就行', suggest: 'alice', error: '' } }
    const { user } = setup({ [`POST ${API}/intake/start`]: () => r })
    await fillBasics(user)
    await user.click(startBtn())
    const out = await screen.findByTestId('start-result')
    expect(within(out).getByRole('status')).toHaveTextContent('没开成：brain-kit 不知道你是谁')
    expect(out).toHaveTextContent('在下面填上，点「保存」')
    const who = screen.getByTestId('start-who')
    expect(within(who).getByRole('textbox', { name: '你的名字' })).toHaveValue('alice')
  })
})
