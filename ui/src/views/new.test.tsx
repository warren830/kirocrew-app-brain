import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { apiCalls, apiError, navigations } from '../test/stubs/app-sdk'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import type { IntakeCheck } from '../types'
import { GATE45, NewView, REVIEW_HINT } from './NewReq'

function setup(routes: Parameters<typeof installFixtureRoutes>[0] = {}) {
  installFixtureRoutes({
    [`POST ${API}/intake/check`]: () => fx.intakeCheck(),
    [`POST ${API}/intake/start`]: () => fx.start(),
    ...routes,
  })
  const props = { status: fx.status(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn() }
  render(<NewView entry={{}} {...props} />)
  return { user: userEvent.setup(), props }
}

const PATHS = '预计会改的路径（用逗号、空格或换行分开）'
const startBtn = () => screen.getByRole('button', { name: '开工' })
const checkBtn = () => screen.getByRole('button', { name: '先检查（不写入）' })

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('PAY-8'))
  await user.type(screen.getByLabelText('标题'), '商户结算周报')
  await user.type(screen.getByLabelText('slug'), 'merchant-weekly')
}

async function fillGates(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('文档（一行一个路径）'), '/Users/alice/Downloads/结算周报需求')
  await user.click(screen.getByLabelText('我是作者，或已取得作者同意'))
  await user.click(screen.getByLabelText('不确定（按机密处理）'))
  await user.click(screen.getByLabelText('原样保留'))
  await user.type(screen.getByLabelText('不收这些文件（glob，一行一个）'), '*合作方*')
}

describe('开需求', () => {
  test('a check shows brain-kit’s findings verbatim; 开工 waits for a clean check of exactly this form; the start posts the whole body', async () => {
    const { user, props } = setup()
    await fillBasics(user)
    await fillGates(user)
    await user.type(screen.getByLabelText(PATHS), 'src/statement/{Enter}src/report/weekly.py')
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('有文档：先检查一遍')

    await user.click(checkBtn())
    const findings = await screen.findByTestId('findings')
    for (const line of fx.intakeCheck().findings) expect(within(findings).getByText(line)).toBeInTheDocument()
    expect(screen.getByTestId('check-summary')).toHaveTextContent('文档包 PKG-PAY-8-1 · 密级 confidential · 3 份来源 · 12 段')
    expect(screen.getByText(/截图\.png：图片文件不收/)).toBeInTheDocument()
    const checkCall = apiCalls.find((c) => c.method === 'POST' && c.path === `${API}/intake/check`)
    expect(checkCall?.body).toEqual({
      repo: 'r1', key: 'PAY-8', slug: 'merchant-weekly', title: '商户结算周报', docs: ['/Users/alice/Downloads/结算周报需求'],
      consent: true, classification: 'unsure', business: 'keep', exclude: ['*合作方*'],
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
    expect(within(out).getByText(/认领 PAY-8：claim\/PAY-8 已推到 origin/)).toBeInTheDocument()
    expect(out).toHaveTextContent('ai/alice/PAY-8-merchant-weekly')
    expect(out).toHaveTextContent('/Users/alice/workplace/brain-app/PAY-8-merchant-weekly')
    const startCall = apiCalls.find((c) => c.method === 'POST' && c.path === `${API}/intake/start`)
    expect(startCall?.body).toEqual({
      repo: 'r1', key: 'PAY-8', slug: 'merchant-weekly', title: '商户结算周报',
      docs: ['/Users/alice/Downloads/结算周报需求', '/Users/alice/Downloads/样例.xlsx'],
      consent: true, classification: 'unsure', business: 'keep', exclude: ['*合作方*'],
      paths: ['src/statement/', 'src/report/weekly.py'], open_session: true, trust: true,
    })
    expect(props.reloadStatus).toHaveBeenCalled()
    expect(startBtn()).toBeDisabled() // started once

    await user.click(within(out).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-PAY-8-2c9d'])
    await user.click(within(out).getByRole('button', { name: '看这个需求' }))
    expect(props.go).toHaveBeenCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-8' })
  })

  test('what may be a name or a password is listed under 请你确认 (not masked, not stopping 开工); the gate 4 rule says so', async () => {
    const { user } = setup()
    expect(screen.getByText(GATE45)).toBeInTheDocument()
    expect(GATE45).toContain('请你确认')
    await fillBasics(user)
    await fillGates(user)
    await user.click(checkBtn())
    const review = await screen.findByTestId('review')
    expect(within(review).getByText('请你确认')).toBeInTheDocument()
    const [item] = fx.intakeCheck().review
    expect(within(review).getByText(item)).toHaveTextContent('D01 结算周报需求.docx：请你确认 1 处')
    expect(review).toHaveTextContent('「对接人：张三李四」')
    expect(review).toHaveTextContent(REVIEW_HINT)
    expect(within(screen.getByTestId('findings')).getByText(fx.intakeCheck().findings[0])).toBeInTheDocument() // verbatim too
    expect(startBtn()).toBeEnabled()
  })

  test('a check without review findings shows no 请你确认', async () => {
    const { user } = setup({ [`POST ${API}/intake/check`]: (): IntakeCheck => ({ ...fx.intakeCheck(), review: [] }) })
    await fillBasics(user)
    await fillGates(user)
    await user.click(checkBtn())
    await screen.findByTestId('findings')
    expect(screen.queryByTestId('review')).toBeNull()
  })

  test('a check that a gate would stop keeps 开工 off and shows the blocking line in red', async () => {
    const blocking = '门 2：D03 合作方接口说明.pdf 标着 Confidential，高于你选的 internal'
    const { user } = setup({
      [`POST ${API}/intake/check`]: (): IntakeCheck => ({ ...fx.intakeCheck(), ok: false, classification: 'internal', blocking: [blocking] }),
    })
    await fillBasics(user)
    await fillGates(user)
    await user.click(checkBtn())
    const line = await within(await screen.findByTestId('findings')).findByText(blocking)
    expect(line).toHaveClass('is-blocking')
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('检查没过')
  })

  test('a check that fails (a hard stop or a request error) says so and keeps 开工 off', async () => {
    const { user } = setup({ [`POST ${API}/intake/check`]: () => { throw apiError(400, 'no_consent', '门 1：确认你是作者，或已取得作者同意') } })
    await fillBasics(user)
    await user.type(screen.getByLabelText('文档（一行一个路径）'), '/Users/alice/Downloads/a.docx')
    await user.click(checkBtn())
    expect(await screen.findByText('门 1：确认你是作者，或已取得作者同意（400）')).toBeInTheDocument()
    expect(startBtn()).toBeDisabled()
  })

  test('without documents nothing needs checking: 开工 is on once title and slug are valid', async () => {
    const { user } = setup()
    await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('PAY-8'))
    expect(startBtn()).toBeDisabled()
    expect(checkBtn()).toBeDisabled()
    await user.type(screen.getByLabelText('标题'), '商户结算周报')
    await user.type(screen.getByLabelText('slug'), 'Bad_Slug')
    expect(screen.getByLabelText('slug')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('slug 只能用英文小写、数字和 -')
    expect(startBtn()).toBeDisabled()
    await user.clear(screen.getByLabelText('slug'))
    await user.type(screen.getByLabelText('slug'), 'merchant-weekly')
    expect(startBtn()).toBeEnabled()
    await user.click(startBtn())
    await screen.findByTestId('start-result')
    const startCall = apiCalls.find((c) => c.method === 'POST' && c.path === `${API}/intake/start`)
    expect(startCall?.body).toMatchObject({ docs: [], paths: [], open_session: true, trust: true })
    expect(apiCalls.some((c) => c.path === `${API}/intake/check`)).toBe(false)
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
    await user.type(screen.getByLabelText('标题'), '商户结算周报')
    await user.type(screen.getByLabelText('slug'), 'merchant-weekly')
    expect(await screen.findByText(/这个仓库用 Jira：填 Jira 上的需求号/)).toBeInTheDocument()
    expect(startBtn()).toBeDisabled()
    expect(screen.getByTestId('start-why')).toHaveTextContent('要填需求号')
    await user.type(screen.getByLabelText('需求号'), 'PAY-21')
    expect(startBtn()).toBeEnabled()
  })

  test('KiroCrew’s doubtful checks are above the form; the fix button posts {what: agent}', async () => {
    const { user, props } = setup({
      [`POST ${API}/crew/fix`]: () => ({ ok: true, text: '装好了：~/.kiro/agents/brain-dev.json', rows: fx.crew().rows.map((r) => ({ ...r, level: 'OK' })) }),
    })
    const card = await screen.findByRole('region', { name: 'KiroCrew 的检查' })
    expect(card).toHaveTextContent('缺 Lean 的 hook：调用工具前（preToolUse）')
    expect(card).not.toHaveTextContent('KiroCrew 在跑') // OK rows are not listed here
    await user.click(within(card).getByRole('button', { name: '装上或补全 brain-dev 的 Lean hook' }))
    await waitFor(() => expect(apiCalls.find((c) => c.path === `${API}/crew/fix`)?.body).toEqual({ what: 'agent' }))
    expect(await screen.findByText('KiroCrew 的检查都过了。')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'KiroCrew 的检查' })).toBeNull()
    expect(props.reloadStatus).toHaveBeenCalled()
  })

  test('picking another repo rewrites the entry and reads its next key', async () => {
    const status = fx.status()
    status.repos[1] = { ...status.repos[0], id: 'r2', name: 'shop-web', path: '/Users/alice/workplace/shop-web' }
    installFixtureRoutes({ [`GET ${API}/intake/next*`]: (_b, path) => ({ ...fx.intakeNext(), repo: path.endsWith('r2') ? 'r2' : 'r1', key: path.endsWith('r2') ? 'WEB-4' : 'PAY-8' }) })
    const replace = vi.fn()
    render(<NewView entry={{}} status={status} go={vi.fn()} replace={replace} reloadStatus={vi.fn()} setStatus={vi.fn()} />)
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('PAY-8'))
    await user.selectOptions(screen.getByLabelText('仓库'), 'r2')
    expect(replace).toHaveBeenCalledWith({ kind: 'new', repo: 'r2' })
    await waitFor(() => expect(screen.getByLabelText('需求号')).toHaveValue('WEB-4'))
  })
  test('no repo at all: no form, one way in; repos but none usable (one waits for its install branch): 导入仓库 and 去设置', async () => {
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
    waiting.repos = waiting.repos.map((r) => ({ ...r, ok: false, kit: null }))
    waiting.repos[1].pending = fx.importInspectPending().pending
    render(<NewView entry={{}} status={waiting} go={go} replace={vi.fn()} reloadStatus={vi.fn()} setStatus={vi.fn()} />)
    const banner = screen.getByTestId('no-usable-repo')
    expect(banner).toHaveTextContent('没有能用的仓库：1 个在等 brain-kit 的分支合并。')
    await user.click(within(banner).getByRole('button', { name: '导入仓库' }))
    await user.click(within(banner).getByRole('button', { name: '去设置' }))
    expect(go).toHaveBeenLastCalledWith({ kind: 'settings' })
  })
})
