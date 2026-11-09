import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { BrainEntryRef } from '../nav'
import { apiCalls } from '../test/stubs/app-sdk'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import type { ReflectApplyResult, ReflectPreview } from '../types'
import { BrainPage } from './Brain'

const WORKTREE = '/Users/alice/.brain/worktrees/shop-pay/brain-PAY-5-reflect-1'

function setup(entry: BrainEntryRef = { repo: 'r1' }, routes: Parameters<typeof installFixtureRoutes>[0] = {}) {
  installFixtureRoutes({
    [`POST ${API}/brain/reflect/preview`]: () => fx.reflect(),
    [`POST ${API}/brain/reflect/apply`]: (body): ReflectApplyResult => ({
      ok: true, output: `brain/PAY-5-reflect-1：写了 1 条（TECH.md）\n${(body as { push: boolean }).push ? 'MR !52 已开' : '没推'}`, branch: 'brain/PAY-5-reflect-1',
      worktree: WORKTREE,
    }),
    ...routes,
  })
  const props = { status: fx.status(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn() }
  render(<BrainPage entry={entry} {...props} />)
  return { user: userEvent.setup(), props }
}

const fileTab = (key: string) => screen.getByRole('button', { name: new RegExp(`^${key} `) })

describe('Brain', () => {
  test('a tab per file with its count; a tab rewrites the entry; the text and type filters', async () => {
    const { user, props } = setup()
    expect(await screen.findByRole('region', { name: 'PRODUCT.md' })).toBeInTheDocument()
    expect(apiCalls[0].path).toBe(`${API}/brain?repo=r1`)
    const tabs = within(screen.getByRole('group', { name: 'Brain 文件' })).getAllByRole('button')
    expect(tabs).toHaveLength(4)
    ;['PRODUCT 产品 2', 'TECH 技术 3', 'IMPROVEMENT 改进 1', 'PROJECT 项目 1'].forEach((name, i) => expect(tabs[i]).toHaveAccessibleName(name))
    expect(fileTab('PRODUCT')).toHaveAttribute('aria-pressed', 'true')

    await user.click(fileTab('TECH'))
    expect(props.replace).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', file: 'TECH', id: undefined, reflect: undefined })
    const tech = screen.getByRole('region', { name: 'TECH.md' })
    expect(within(tech).getAllByRole('article').map((a) => a.dataset.entryId)).toEqual(['T-PAY-2-1', 'T-12', 'T-PAY-5-1'])
    // the text is plain, line breaks kept
    expect(within(tech).getByText(/退款单号是 RF \+ 9 位/).textContent).toBe('退款单号是 RF + 9 位；样例文件里的 7 位是旧格式。\n校验时两种都认，生成只用新格式。')

    await user.type(screen.getByLabelText('按文字筛'), '回调')
    expect(within(tech).getAllByRole('article').map((a) => a.dataset.entryId)).toEqual(['T-PAY-5-1'])
    expect(tech).toHaveTextContent('显示 1/3 条')
    await user.clear(screen.getByLabelText('按文字筛'))
    // the type filter: a chip per type the file has, with its count; the same chip again shows all
    const types = within(tech).getByRole('group', { name: '按类型筛' })
    expect(within(types).getAllByRole('button').map((b) => b.textContent)).toEqual(['全部 3', '决定 1', '准则 1', '坑 1'])
    await user.click(within(types).getByRole('button', { name: '准则 1' }))
    expect(within(types).getByRole('button', { name: '准则 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(tech).getAllByRole('article').map((a) => a.dataset.entryId)).toEqual(['T-12'])
    await user.click(within(types).getByRole('button', { name: '准则 1' }))
    expect(within(tech).getAllByRole('article')).toHaveLength(3)
  })

  test('the entry the URL names is picked out, on its file’s tab, and scrolled to once; filters do not hide it', async () => {
    const { user } = setup({ repo: 'r1', id: 'T-12' })
    const el = await screen.findByRole('article', { name: 'T-12' })
    expect(el).toHaveClass('is-hl')
    expect(el).toHaveAttribute('aria-current', 'true')
    expect(fileTab('TECH')).toHaveAttribute('aria-pressed', 'true')
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView)
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    expect(scroll.mock.contexts[0]).toBe(el)
    expect(scroll.mock.calls[0][0]).toEqual({ behavior: 'smooth', block: 'center' })
    await user.type(screen.getByLabelText('按文字筛'), '回调')
    expect(within(screen.getByRole('region', { name: 'TECH.md' })).getAllByRole('article').map((a) => a.dataset.entryId)).toEqual(['T-12', 'T-PAY-5-1'])
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  test('a withdraw candidate says so; repeats are counted; how often runs load and use an entry', async () => {
    setup()
    const p7 = await screen.findByRole('article', { name: 'P-7' })
    expect(within(p7).getByText('撤回候选')).toBeInTheDocument()
    expect(p7).toHaveClass('is-cand')
    expect(p7).toHaveTextContent('6 次加载 · 0 次用上')
    const p21 = screen.getByRole('article', { name: 'P-PAY-2-1' })
    expect(p21).not.toHaveTextContent('撤回候选')
    expect(p21).toHaveTextContent('5 次加载 · 2 次用上（引用 3 处）')
    expect(within(p21).getByText('RUN-PAY-2-1')).toHaveClass('br-tag')
  })

  test('the counter cards: entries per file, the two rates as cells, withdraw candidates (a chip picks one out), lint', async () => {
    const { user, props } = setup({ repo: 'r1', file: 'TECH' })
    const kpis = await screen.findByRole('group', { name: '指标' })
    const entries = within(kpis).getByTestId('kpi-entries')
    expect(entries).toHaveTextContent('7条')
    expect(within(entries).getByRole('img')).toHaveAccessibleName('PRODUCT 2，TECH 3，IMPROVEMENT 1，PROJECT 1')
    expect(entries).toHaveTextContent('产品 2技术 3改进 1项目 1')
    const useful = within(kpis).getByTestId('usage-useful')
    expect(within(useful).getByRole('img')).toHaveAccessibleName('5/8 用上的')
    expect(useful.querySelectorAll('.kt-segs i.is-pass')).toHaveLength(5)
    expect(within(kpis).getByTestId('usage-repeat').querySelectorAll('.kt-segs i.is-fail')).toHaveLength(1)
    const cand = within(kpis).getByTestId('kpi-candidates')
    expect(cand).toHaveTextContent('1条')
    await user.click(within(cand).getByRole('button', { name: 'P-7' }))
    expect(props.replace).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', file: 'PRODUCT', id: 'P-7', reflect: undefined })
    expect(await screen.findByRole('article', { name: 'P-7' })).toHaveClass('is-hl')
    const lint = within(kpis).getByTestId('kpi-lint')
    expect(lint).toHaveClass('is-bad')
    expect(lint).toHaveTextContent('1个错')
    expect(lint).toHaveTextContent('2 个提醒')
  })

  test('lint as problem rows (FAIL, then WARN) with 做什么 and brain lint’s own words folded; usage rates; 「该改成 gate 了」 at two repeats; an id chip picks out its entry', async () => {
    const { user, props } = setup()
    const lint = await screen.findByRole('region', { name: '检查' })
    const { errors, warnings } = fx.brain().lint
    const rows = within(lint).getAllByRole('listitem')
    expect(rows.map((r) => r.dataset.level)).toEqual(['FAIL', 'WARN', 'WARN'])
    expect(rows[0]).toHaveTextContent(errors[0].text)
    expect(rows[0]).toHaveTextContent(`做什么${errors[0].todo}`)
    expect(within(rows[0]).getByText('brain-kit 的原话').closest('details')).not.toHaveAttribute('open')
    expect(rows[1]).toHaveTextContent(warnings[0].text)
    expect(lint).toHaveClass('is-bad')
    expect(screen.getByTestId('usage-useful')).toHaveTextContent('63%5/8')
    expect(screen.getByTestId('usage-repeat')).toHaveTextContent('17%1/6')
    const repeats = within(screen.getByTestId('usage-repeats')).getAllByRole('listitem')
    expect(repeats[0]).toHaveTextContent('T-PAY-2-1重复 2 次该改成 gate 了')
    expect(repeats[1]).toHaveTextContent('I-PAY-2-1重复 1 次')
    expect(repeats[1]).not.toHaveTextContent('该改成 gate 了')

    const runs = screen.getByRole('table', { name: '每次运行' })
    await user.click(within(runs).getAllByRole('button', { name: 'T-12' })[0])
    expect(props.replace).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', file: 'TECH', id: 'T-12', reflect: undefined })
    expect(await screen.findByRole('article', { name: 'T-12' })).toHaveClass('is-hl')
    await user.click(within(runs).getByRole('button', { name: 'PAY-3' }))
    expect(props.go).toHaveBeenCalledWith({ kind: 'item', repo: 'r1', key: 'PAY-3', from: 'brain' })
  })

  test('reflect: preview, then each write behind a confirm step (push false / true), output verbatim', async () => {
    const { user, props } = setup({ repo: 'r1', reflect: 'PAY-5' })
    const card = await screen.findByRole('region', { name: '回写' })
    expect(within(card).getByLabelText('选一个需求')).toHaveValue('PAY-5')
    const steps = () => Array.from(within(card).getByRole('list', { name: '回写的步骤' }).children).map((li) => (li as HTMLElement).dataset.state ?? '')
    expect(steps()).toEqual(['done', 'now', '', ''])
    await user.click(within(card).getByRole('button', { name: '预览' }))
    const preview = await within(card).findByTestId('reflect-preview')
    expect(steps()).toEqual(['done', 'done', 'now', ''])
    expect(apiCalls.find((c) => c.path === `${API}/brain/reflect/preview`)?.body).toEqual({ repo: 'r1', key: 'PAY-5' })
    const ops = within(preview).getByRole('table', { name: '要写的改动' })
    expect(within(ops).getAllByRole('row')).toHaveLength(3)
    expect(ops).toHaveTextContent('支付网关的回调可能先于下单接口的响应到达：先查单再处理。')
    expect(preview).toHaveTextContent('人工队列的处理时限')
    expect(preview).toHaveTextContent('T-12 被这次运行标成过时')

    await user.click(within(preview).getByRole('button', { name: '写入新分支' }))
    expect(apiCalls.some((c) => c.path === `${API}/brain/reflect/apply`)).toBe(false) // not before the confirm
    const confirm = within(preview).getByRole('group', { name: '确认写入' })
    expect(confirm).toHaveTextContent('只在本机，不推')
    await user.click(within(confirm).getByRole('button', { name: '取消' }))
    expect(within(preview).queryByRole('group', { name: '确认写入' })).toBeNull()

    await user.click(within(preview).getByRole('button', { name: '写入新分支' }))
    await user.click(within(preview).getByRole('button', { name: '确定写入' }))
    const applied = await within(card).findByTestId('reflect-applied')
    expect(applied).toHaveTextContent('分支 brain/PAY-5-reflect-1')
    expect(steps()).toEqual(['done', 'done', 'done', 'done'])
    // the worktree brain-kit wrote the branch in
    expect(within(applied).getByTestId('reflect-worktree')).toHaveTextContent(`工作区：${WORKTREE}`)
    expect(within(applied).getByText(WORKTREE)).toHaveClass('br-mono')
    expect(within(applied).getByText(/没推/).textContent).toBe('brain/PAY-5-reflect-1：写了 1 条（TECH.md）\n没推')

    await user.click(within(preview).getByRole('button', { name: '写入并开 MR' }))
    expect(within(preview).getByRole('group', { name: '确认写入' })).toHaveTextContent('推到远端并开 MR')
    await user.click(within(preview).getByRole('button', { name: '确定写入' }))
    await waitFor(() => expect(within(card).getByTestId('reflect-applied')).toHaveTextContent('MR !52 已开'))
    const applies = apiCalls.filter((c) => c.path === `${API}/brain/reflect/apply`).map((c) => c.body)
    expect(applies).toEqual([{ repo: 'r1', key: 'PAY-5', push: false }, { repo: 'r1', key: 'PAY-5', push: true }])
    // the Brain is read again after a write
    expect(apiCalls.filter((c) => c.path === `${API}/brain?repo=r1`).length).toBeGreaterThanOrEqual(2)

    await user.selectOptions(within(card).getByLabelText('选一个需求'), 'PAY-2')
    expect(props.replace).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r1', file: 'PRODUCT', id: undefined, reflect: 'PAY-2' })
    expect(within(card).queryByTestId('reflect-preview')).toBeNull()
  })

  test('a preview with problems (or nothing substantive) cannot be written', async () => {
    const problem = 'TECH.md 的 T-PAY-2-1 在 brain/PAY-2-reflect-1 分支上也改了：先合并或关掉那个 MR'
    const { user } = setup({ repo: 'r1' }, { [`POST ${API}/brain/reflect/preview`]: (): ReflectPreview => ({ ...fx.reflect(), problems: [problem] }) })
    const card = await screen.findByRole('region', { name: '回写' })
    await user.selectOptions(within(card).getByLabelText('选一个需求'), 'PAY-5')
    await user.click(within(card).getByRole('button', { name: '预览' }))
    const preview = await within(card).findByTestId('reflect-preview')
    expect(within(within(preview).getByTestId('reflect-problems')).getByText(problem).closest('li')).toHaveAttribute('data-level', 'FAIL')
    expect(within(card).getByRole('list', { name: '回写的步骤' }).children[2]).toHaveAttribute('data-state', 'bad')
    expect(within(preview).getByRole('button', { name: '写入新分支' })).toBeDisabled()
    expect(within(preview).getByRole('button', { name: '写入并开 MR' })).toBeDisabled()
  })

  test('a preview that only adds sources is not substantive: no write', async () => {
    const { user } = setup({ repo: 'r1', reflect: 'PAY-5' }, { [`POST ${API}/brain/reflect/preview`]: (): ReflectPreview => ({ ...fx.reflect(), substantive: false }) })
    const card = await screen.findByRole('region', { name: '回写' })
    await user.click(within(card).getByRole('button', { name: '预览' }))
    const preview = await within(card).findByTestId('reflect-preview')
    expect(preview).toHaveTextContent('不用开分支')
    expect(within(card).getByRole('list', { name: '回写的步骤' }).children[2]).toHaveAttribute('data-state', 'off')
    expect(within(preview).getByRole('button', { name: '写入并开 MR' })).toBeDisabled()
  })

  test('a Brain error from the backend is shown; the repo select rewrites the entry', async () => {
    const status = fx.status()
    status.repos[1] = { ...status.repos[0], id: 'r2', name: 'shop-web' }
    installFixtureRoutes({ [`GET ${API}/brain*`]: (_b, path) => (path.endsWith('r2') ? { ...fx.brain(), repo: 'r2', error: 'brain/ 目录不在 main 上' } : fx.brain()) })
    const replace = vi.fn()
    render(<BrainPage entry={{ repo: 'r1' }} status={status} go={vi.fn()} replace={replace} reloadStatus={vi.fn()} setStatus={vi.fn()} />)
    const user = userEvent.setup()
    await screen.findByRole('region', { name: 'PRODUCT.md' })
    await user.selectOptions(screen.getByLabelText('仓库'), 'r2')
    expect(replace).toHaveBeenLastCalledWith({ kind: 'brain', repo: 'r2' })
    expect(await screen.findByText('brain/ 目录不在 main 上')).toBeInTheDocument()
  })

  test('an empty Brain says what fills it, and 回写 is still there', async () => {
    const empty = fx.brain()
    empty.files = empty.files.map((f) => ({ ...f, count: 0, sections: [] }))
    empty.lint = { errors: [], warnings: [] }
    installFixtureRoutes({ [`GET ${API}/brain*`]: () => empty })
    render(<BrainPage entry={{ repo: 'r1' }} status={fx.status()} go={vi.fn()} replace={vi.fn()} reloadStatus={vi.fn()} setStatus={vi.fn()} />)
    const hero = await screen.findByTestId('brain-empty')
    expect(within(hero).getByRole('heading', { name: 'Brain 还是空的' })).toBeInTheDocument()
    expect(hero).toHaveTextContent('brain reflect')
    expect(within(hero).getAllByRole('listitem').map((li) => li.querySelector('b')?.textContent)).toEqual(['1做完一个需求', '2合并', '3回写', '4下一次用上'])
    expect(screen.queryByRole('group', { name: 'Brain 文件' })).toBeNull()
    expect(screen.queryByRole('region', { name: '检查' })).toBeNull()
    expect(screen.getByRole('region', { name: '回写' })).toBeInTheDocument()
  })

  test('no repo the app can use: the way in is 导入仓库', async () => {
    const status = fx.status()
    status.repos = []
    installFixtureRoutes()
    const go = vi.fn()
    render(<BrainPage entry={{}} status={status} go={go} replace={vi.fn()} reloadStatus={vi.fn()} setStatus={vi.fn()} />)
    const cta = screen.getByTestId('import-cta')
    expect(cta).toHaveTextContent('还没有能用的仓库')
    await userEvent.setup().click(within(cta).getByRole('button', { name: '导入仓库' }))
    expect(go).toHaveBeenCalledWith({ kind: 'import' })
    expect(apiCalls.filter((c) => c.path.startsWith(`${API}/brain`))).toHaveLength(0)
  })
})
