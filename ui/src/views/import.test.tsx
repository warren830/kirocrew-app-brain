import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { clone, fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError, type RouteHandler } from '../test/stubs/app-sdk'
import type { ImportInspect, ImportJob } from '../types'
import { ImportView, SAFE_INSTALL, nameFromUrl } from './Import'
import type { ViewProps } from './props'

const REPO = '/Users/alice/workplace/refund'

function setup(routes: Record<string, RouteHandler> = {}, entry: { path?: string } = {}) {
  installFixtureRoutes(routes)
  const props: ViewProps = { status: fx.status(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn(), pollMs: 5 }
  render(<ImportView entry={entry} {...props} />)
  return { user: userEvent.setup(), props }
}

/** A job that is running the first *n* reads, then ends as *end*. */
function jobRoute(end: ImportJob<unknown>, n = 1): RouteHandler {
  let reads = 0
  return () => {
    reads += 1
    if (reads <= n) {
      const j = clone(end)
      j.state = 'running'
      j.ended_at = null
      j.result = null
      j.steps = j.steps.map((s, i) => ({ ...s, state: i === 0 ? 'running' : 'todo', detail: '' }))
      return j
    }
    return clone(end)
  }
}

const running = (j: ImportJob<unknown>) => ({ job: { ...clone(j), state: 'running', result: null, ended_at: null, steps: j.steps.map((s) => ({ ...s, state: 'todo', detail: '' })) } })

function installed(): ImportInspect {
  const c = fx.importInspect()
  c.next = 'add'
  c.kit = { state: 'checkout', values: { tracker: 'none', req_prefix: 'REF', default_branch: 'main', gitlab_base: 'https://gitlab.example.com', gitlab_project: 'shop/refund' } }
  c.checks = c.checks.map((x) => (['kit', 'lean', 'brain', 'agents'].includes(x.id) ? { ...x, level: 'OK' as const, why: '装了', todo: '' } : x))
  return c
}

async function inspectPath(user: ReturnType<typeof userEvent.setup>, path = REPO) {
  await user.type(screen.getByLabelText('仓库目录'), path)
  await user.click(screen.getByRole('button', { name: '检查' }))
  return screen.findByTestId('inspect')
}

describe('导入仓库', () => {
  test('an installed repo is one click: 检查, each row ✓ / ! / ✗ with why and what to do, then 加入列表', async () => {
    const status = fx.status()
    status.repos.push({ id: 'r3', path: REPO, name: 'refund', ok: true, error: '', kit: installed().kit.values, pending: null })
    const { user, props } = setup({
      [`POST ${API}/import/inspect`]: () => installed(),
      [`POST ${API}/import/add`]: () => ({ ok: true, id: 'r3', text: '加入了（r3）', status }),
    })
    const card = await inspectPath(user)
    expect(apiCalls.find((c) => c.path === `${API}/import/inspect`)?.body).toEqual({ path: REPO })
    const row = (id: string) => card.querySelector(`[data-check="${id}"]`) as HTMLElement
    expect(row('kit')).toHaveAttribute('data-level', 'OK')
    expect(within(row('kit')).getByRole('img', { name: '正常' })).toHaveTextContent('✓')
    expect(row('clean')).toHaveTextContent('有 1 个改动没提交：README.md')
    expect(within(row('clean')).getByRole('img', { name: '注意' })).toHaveTextContent('!')
    expect(row('clean')).toHaveTextContent('不影响：安装在单独的工作目录里做，你的检出不会动')
    expect(within(card).getByText(/没有 ~\/\.kiro\/agents\/brain-dev\.json/)).toBeInTheDocument() // KiroCrew's rows
    expect(within(card).getByRole('button', { name: '装上或补全 brain-dev 的 Lean hook' })).toBeInTheDocument()
    expect(screen.queryByTestId('install')).toBeNull()
    await user.click(screen.getByRole('button', { name: '加入列表' }))
    expect(await screen.findByTestId('added')).toHaveTextContent('加入了（r3）')
    expect(apiCalls.find((c) => c.path === `${API}/import/add`)?.body).toEqual({ path: REPO })
    expect(props.setStatus).toHaveBeenCalledWith(status)
    await user.click(screen.getByRole('button', { name: '开需求' }))
    expect(props.go).toHaveBeenCalledWith({ kind: 'new', repo: 'r3' })
  })

  test('not installed: the prefilled form, 安装到新分支 as a job with its steps, the result, then the pending state', async () => {
    let inspected = 0
    const { user, props } = setup({
      [`POST ${API}/import/inspect`]: () => (++inspected === 1 ? fx.importInspect() : fx.importInspectPending()),
      [`POST ${API}/import/install`]: () => running(fx.importJob()),
      [`GET ${API}/import/jobs/*`]: jobRoute(fx.importJob(), 2),
    })
    await inspectPath(user)
    const form = await screen.findByRole('form', { name: 'kit.json' })
    expect(within(form).getByLabelText('需求号前缀')).toHaveValue('REFUND')
    expect(within(form).getByLabelText('GitLab 地址')).toHaveValue('https://gitlab.example.com')
    expect(within(form).getByLabelText('GitLab 项目')).toHaveValue('shop/refund')
    expect(within(form).getByText('从 origin 的地址猜的：检查一下。')).toBeInTheDocument()
    expect(within(form).getByLabelText('默认分支')).toHaveValue('main')
    expect(within(form).getByLabelText('新分支名')).toHaveValue('brain/install')
    expect(screen.getByTestId('install-safe')).toHaveTextContent(SAFE_INSTALL)
    await user.clear(within(form).getByLabelText('需求号前缀'))
    await user.type(within(form).getByLabelText('需求号前缀'), 'ref')
    expect(within(form).getByText('需求号会是 REF-1、REF-2 …')).toBeInTheDocument()
    await user.type(within(form).getByLabelText('团队（可不填）'), '退款组')
    await user.click(within(form).getByRole('button', { name: '安装到新分支' }))
    expect(apiCalls.find((c) => c.path === `${API}/import/install`)?.body).toEqual({
      path: REPO, branch: 'brain/install',
      kit: { req_prefix: 'REF', tracker: 'none', jira_base: '', gitlab_base: 'https://gitlab.example.com', gitlab_project: 'shop/refund', default_branch: 'main', team: '退款组' },
    })
    const steps = await screen.findByRole('list', { name: '安装的进度' })
    expect(within(steps).getAllByRole('listitem').map((li) => li.dataset.step)).toEqual(['branch', 'install', 'kit', 'doctor', 'commit'])
    const out = await screen.findByTestId('install-result')
    expect(screen.getByTestId('job-install')).toHaveAttribute('data-state', 'done')
    expect(out).toHaveTextContent('brain/install（从 origin/main 建）')
    expect(out).toHaveTextContent('/Users/alice/workplace/brain-app/refund/_brain-install')
    expect(within(out).getByText('改了 14 个文件')).toBeInTheDocument()
    expect(within(out).getByTestId('changed-files')).toHaveTextContent('新增 .brain/kit.json')
    expect(within(out).getByTestId('doctor')).toHaveTextContent('kit config valid')
    expect(within(out).getByTestId('commit-ok')).toHaveTextContent('提交了 eb43199f（作者 Alice Example <alice@example.com>）')
    expect(props.reloadStatus).toHaveBeenCalled()
    // checked again: on the install branch now
    const pending = await screen.findByTestId('pending')
    expect(pending).toHaveTextContent('安装在 brain/install 分支上，合并后生效')
    expect(inspected).toBe(2)
    expect(screen.getByTestId('add')).toHaveTextContent('4 · 加入列表')
    expect(screen.getByTestId('add')).toHaveTextContent('列表里这个仓库会显示「安装在 brain/install 分支上，合并后生效」')
  })

  test('推送并开 MR asks first, saying which branch goes where; only then it posts, and shows the MR', async () => {
    const { user } = setup({
      [`POST ${API}/import/inspect`]: () => fx.importInspectPending(),
      [`POST ${API}/import/publish`]: () => fx.importPublish(),
    })
    await inspectPath(user)
    await user.click(await screen.findByRole('button', { name: '推送并开 MR' }))
    const confirm = screen.getByTestId('publish-confirm')
    expect(confirm).toHaveTextContent('会把分支 brain/install 推到 origin（git@gitlab.example.com:shop/refund.git），再在 GitLab 的 shop/refund 上开 MR：brain/install → main。')
    expect(apiCalls.some((c) => c.path === `${API}/import/publish`)).toBe(false)
    await user.click(within(confirm).getByRole('button', { name: '取消' }))
    expect(screen.queryByTestId('publish-confirm')).toBeNull()
    await user.click(screen.getByRole('button', { name: '推送并开 MR' }))
    await user.click(within(screen.getByTestId('publish-confirm')).getByRole('button', { name: '确定推送' }))
    const out = await screen.findByTestId('publish-result')
    expect(apiCalls.find((c) => c.path === `${API}/import/publish`)?.body).toEqual({
      path: REPO, branch: 'brain/install', target: 'main', remote_url: 'git@gitlab.example.com:shop/refund.git', confirm: true,
    })
    expect(out).toHaveTextContent('推上去了，开了 MR !7')
    expect(within(out).getByRole('link', { name: /MR !7/ })).toHaveAttribute('href', 'https://gitlab.example.com/shop/refund/-/merge_requests/7')
    expect(within(out).queryByTestId('commands')).toBeNull()
  })

  test('when the app cannot open the MR: the link and the exact commands, with 复制', async () => {
    const p = fx.importPublish()
    p.mr = null
    p.text = '推上去了。这台机器上没有 GitLab token（$GITLAB_TOKEN 或 ~/.brain/gitlab-token），MR 要你自己开：用下面的命令或链接。'
    const pend = fx.importInspectPending()
    pend.pending!.can_open_mr = false
    const { user } = setup({ [`POST ${API}/import/inspect`]: () => pend, [`POST ${API}/import/publish`]: () => p })
    await inspectPath(user)
    await user.click(await screen.findByRole('button', { name: '推送并开 MR' }))
    expect(screen.getByTestId('publish-confirm')).toHaveTextContent('这台机器上没有 GitLab token：只推送，MR 用给出的命令或链接自己开。')
    await user.click(screen.getByRole('button', { name: '确定推送' }))
    const out = await screen.findByTestId('publish-result')
    expect(within(out).getByRole('link', { name: /在 GitLab 上开 MR/ })).toHaveAttribute('href', p.new_mr_url as string)
    expect(within(out).getByTestId('commands')).toHaveTextContent(/^glab mr create -R https:\/\/gitlab\.example\.com\/shop\/refund --source-branch brain\/install/)
    expect(within(out).getByTestId('commands')).not.toHaveTextContent('git -C') // pushed already: only the MR command
    const writeText = vi.fn(async () => {})   // user-event put its own clipboard in; this one records
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    fireEvent.click(within(out).getByRole('button', { name: '复制' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(p.commands.slice(1).join('\n')))
    expect(await within(out).findByText('已复制')).toBeInTheDocument()
  })

  test('a hook that says no: what it said, then 再提交一次', async () => {
    const blocked = fx.importJob()
    blocked.result!.commit = { ok: false, sha: null, blocked: true, output: '扫描到可疑的 token', text: '提交被拦下了（多半是 git hook），它说：\n扫描到可疑的 token\n\n改动还在 /Users/alice/workplace/brain-app/refund/_brain-install 里：处理好以后点「再提交一次」。' }
    blocked.steps[4] = { ...blocked.steps[4], state: 'fail', detail: blocked.result!.commit.text }
    let inspected = 0
    const { user } = setup({
      [`POST ${API}/import/inspect`]: () => (++inspected === 1 ? fx.importInspect() : fx.importInspectPending()),
      [`POST ${API}/import/install`]: () => ({ job: blocked }),
      [`POST ${API}/import/commit`]: () => ({ ok: true, sha: 'f'.repeat(40), blocked: false, text: '提交了 ffffffff（作者 Alice Example <alice@example.com>）', output: '' }),
    })
    await inspectPath(user)
    await user.click(await screen.findByRole('button', { name: '安装到新分支' }))
    const no = await screen.findByTestId('commit-blocked')
    expect(no).toHaveTextContent('扫描到可疑的 token')
    expect(inspected).toBe(1) // not checked again: nothing was committed
    await user.click(within(no).getByRole('button', { name: '再提交一次' }))
    expect(await screen.findByTestId('commit-ok')).toHaveTextContent('提交了 ffffffff')
    expect(apiCalls.find((c) => c.path === `${API}/import/commit`)?.body).toEqual({ path: REPO })
    await waitFor(() => expect(inspected).toBe(2))
    expect(await screen.findByTestId('pending')).toBeInTheDocument()
  })

  test('克隆: the parent folder from the defaults, the job’s progress, a failure in plain words, then a clone is checked', async () => {
    const failed = fx.importCloneJob()
    failed.state = 'failed'
    failed.error = 'SSH 登录没过（密钥或证书不对，或者过期了）：刷新你的 SSH 凭据（比如重新跑 mwinit，或者 ssh-add 加上密钥），再试一次。'
    failed.steps[0] = { ...failed.steps[0], state: 'fail', detail: failed.error }
    failed.result = { path: null, output: 'git@gitlab.example.com: Permission denied (publickey).', kind: 'auth' }
    let clones = 0
    const { user } = setup({
      [`POST ${API}/import/clone`]: () => running(++clones === 1 ? failed : fx.importCloneJob()),
      [`GET ${API}/import/jobs/*`]: (_b, path) => (path.endsWith(failed.id) && clones === 1 ? clone(failed) : fx.importCloneJob()),
      [`POST ${API}/import/inspect`]: () => fx.importInspect(),
    })
    await user.click(screen.getByLabelText('克隆（git 地址）'))
    expect(await screen.findByLabelText('放在哪个目录下')).toHaveValue('/Users/alice/workplace')
    await user.type(screen.getByLabelText('仓库地址'), 'git@gitlab.example.com:shop/refund.git')
    expect(screen.getByLabelText('目录名（可不填）')).toHaveAttribute('placeholder', 'refund')
    await user.click(screen.getByRole('button', { name: '克隆' }))
    expect(apiCalls.find((c) => c.path === `${API}/import/clone`)?.body).toEqual({ url: 'git@gitlab.example.com:shop/refund.git', parent: '/Users/alice/workplace', name: '' })
    expect(await screen.findByText(/刷新你的 SSH 凭据/, { selector: '[role="alert"]' })).toBeInTheDocument()
    expect(apiCalls.some((c) => c.path === `${API}/import/inspect`)).toBe(false)
    await user.click(screen.getByRole('button', { name: '克隆' }))
    expect(await screen.findByText(`克隆好了：${REPO}。下面是它的检查。`)).toBeInTheDocument()
    expect(await screen.findByTestId('inspect')).toBeInTheDocument()
    expect(apiCalls.find((c) => c.path === `${API}/import/inspect`)?.body).toEqual({ path: REPO })
  })

  test('a refusal of the clone itself (the folder is taken) is the backend’s words', async () => {
    const { user } = setup({ [`POST ${API}/import/clone`]: () => { throw apiError(409, 'exists', `${REPO} 已经有了：换个目录名；它要是就是这个仓库，用「本机目录」导入它`) } })
    await user.click(screen.getByLabelText('克隆（git 地址）'))
    await user.type(screen.getByLabelText('仓库地址'), 'git@gitlab.example.com:shop/refund.git')
    await user.click(screen.getByRole('button', { name: '克隆' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('已经有了：换个目录名；它要是就是这个仓库，用「本机目录」导入它（409）')
  })

  test('a path from the URL only fills the box; a path that is refused or not a repo says so and offers nothing else', async () => {
    const bad = fx.importInspect()
    bad.next = 'fix'
    bad.error = '路径经过一个符号链接：/Users/alice/workplace/refund → /etc。不顺着链接走：直接写它指向的真实目录'
    bad.checks = [{ id: 'path', level: 'FAIL', label: '目录', why: bad.error, todo: '换一个目录' }]
    bad.form = null
    const { user } = setup({ [`POST ${API}/import/inspect`]: () => bad }, { path: REPO })
    expect(screen.getByLabelText('仓库目录')).toHaveValue(REPO)
    await waitFor(() => expect(apiCalls.some((c) => c.path === `${API}/import/defaults`)).toBe(true))
    expect(apiCalls.filter((c) => c.method === 'POST')).toEqual([])
    await user.click(screen.getByRole('button', { name: '检查' }))
    const card = await screen.findByTestId('inspect')
    expect(within(card).getByRole('alert')).toHaveTextContent('符号链接')
    expect(screen.getByTestId('next-fix')).toHaveTextContent('先处理上面打 ✗ 的几行')
    expect(screen.queryByTestId('install')).toBeNull()
    expect(screen.queryByTestId('add')).toBeNull()
    // the box changed: the check no longer counts
    await user.type(screen.getByLabelText('仓库目录'), '2')
    expect(screen.queryByTestId('inspect')).toBeNull()
    expect(screen.getByText('目录改过了：再检查一遍。')).toBeInTheDocument()
  })

  test('already in the list: the way to the overview', async () => {
    const listed = installed()
    listed.next = 'listed'
    listed.listed = 'r1'
    const { user, props } = setup({ [`POST ${API}/import/inspect`]: () => listed })
    await inspectPath(user)
    const done = await screen.findByTestId('next-listed')
    expect(done).toHaveTextContent('已经在列表里（r1）。')
    await user.click(within(done).getByRole('button', { name: '去交付总览' }))
    expect(props.go).toHaveBeenCalledWith({ kind: 'overview' })
    expect(screen.queryByTestId('add')).toBeNull()
  })

  test('listed already, and still on its install branch (the way back from its pending note): the push is offered', async () => {
    const c = fx.importInspectPending()
    c.next = 'listed'
    c.listed = 'r2'
    const { user } = setup({ [`POST ${API}/import/inspect`]: () => c }, { path: REPO })
    await user.click(screen.getByRole('button', { name: '检查' }))
    expect(await screen.findByTestId('next-listed')).toHaveTextContent('已经在列表里（r2）。')
    expect(screen.getByTestId('pending')).toHaveTextContent('安装在 brain/install 分支上，合并后生效')
    expect(screen.getByRole('button', { name: '推送并开 MR' })).toBeInTheDocument()
    expect(screen.queryByTestId('add')).toBeNull()
  })

  test('a clone folder name is the URL’s last part without .git', () => {
    expect(nameFromUrl('git@gitlab.example.com:shop/refund.git')).toBe('refund')
    expect(nameFromUrl('https://gitlab.example.com/shop/refund/')).toBe('refund')
    expect(nameFromUrl('/srv/git/pay.git')).toBe('pay')
  })
})

