import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError } from '../test/stubs/app-sdk'
import type { RepoMe, Settings } from '../types'
import type { ViewProps } from './props'
import { SettingsView } from './Settings'

const props = (over: Partial<ViewProps> = {}): ViewProps => ({
  status: fx.status(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn(), pollMs: 60_000, ...over,
})

describe('设置', () => {
  test('save posts the edited settings without the repos (the list is 导入仓库’s and 移出列表’s), puts the answered status in place', async () => {
    const user = userEvent.setup()
    const answered = fx.status()
    installFixtureRoutes({
      [`POST ${API}/settings`]: (body) => ({ ok: true, settings: { ...fx.settings(), ...(body as Partial<Settings>) }, status: answered }),
    })
    const p = props()
    render(<SettingsView {...p} />)
    await screen.findByLabelText('brain-kit 在哪')
    expect(screen.queryByLabelText('项目仓库（一行一个）')).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: '这台机器是团队运行机' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('已保存')).toBeInTheDocument()
    const post = apiCalls.find((c) => c.method === 'POST')
    expect(post?.path).toBe(`${API}/settings`)
    const { repos: _repos, ...rest } = fx.settings()
    expect(post?.body).toEqual({ ...rest, team: { ...fx.settings().team, enabled: true } })
    expect(p.setStatus).toHaveBeenCalledWith(answered)
  })

  test('仓库: 导入仓库, and 移出列表 after a confirm that says it changes no file', async () => {
    const user = userEvent.setup()
    const after = fx.status()
    after.repos = after.repos.slice(1).map((r) => ({ ...r, id: 'r1' }))
    installFixtureRoutes({ [`POST ${API}/repos/remove`]: () => ({ ok: true, text: '从列表里移出了 shop-pay（文件、分支都没动）', status: after }) })
    const p = props()
    render(<SettingsView {...p} />)
    const card = screen.getByRole('region', { name: '仓库' })
    await user.click(within(card).getByRole('button', { name: '导入仓库' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'import' })
    const r1 = card.querySelector('[data-repo="r1"]') as HTMLElement
    await user.click(within(r1).getByRole('button', { name: '移出列表' }))
    const ask = within(r1).getByRole('group', { name: '移出 shop-pay' })
    expect(ask).toHaveTextContent('只从 app 的列表里去掉 shop-pay：不删文件，不动分支和工作目录。')
    expect(apiCalls.some((c) => c.path === `${API}/repos/remove`)).toBe(false)
    await user.click(within(ask).getByRole('button', { name: '移出' }))
    await waitFor(() => expect(p.setStatus).toHaveBeenCalledWith(after))
    expect(apiCalls.find((c) => c.path === `${API}/repos/remove`)?.body).toEqual({ path: '/Users/alice/workplace/shop-pay' })
  })

  test('a team repo whose brain-kit is on the install branch with an open MR: the MR first; a local merge is 导入仓库’s', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.repos[1] = { ...s.repos[1], error: '', pending: { ...fx.importInspectPending().pending!, pushed: true, word: 'MR 等合并',
      mr_url: 'https://gitlab.example.com/shop/shop-web/-/merge_requests/3', text: '装在 brain/install 分支上，MR 开着：合进 main 以后生效',
      next: '在 GitLab 上合并 MR（团队的做法），合并以后点「拉取」', merge: { ok: true, why: '', confirm: true } } }
    const p = props({ status: s })
    render(<SettingsView {...p} />)
    const r2 = screen.getByRole('region', { name: '仓库' }).querySelector('[data-repo="r2"]') as HTMLElement
    expect(r2).toHaveTextContent('MR 等合并')
    expect(r2).toHaveTextContent('装在 brain/install 分支上，MR 开着：合进 main 以后生效。在 GitLab 上合并 MR（团队的做法），合并以后点「拉取」')
    expect(within(r2).getByRole('link', { name: /在 GitLab 上看 MR/ })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-web/-/merge_requests/3')
    expect(r2).not.toHaveTextContent('读不到')
    // its 推送 must stay on the page, and a row is redrawn every half minute
    expect(within(r2).queryByRole('button', { name: /合并到 main/ })).toBeNull()
    await user.click(within(r2).getByRole('button', { name: '去导入仓库' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'import', path: '/Users/alice/workplace/shop-web' })
  })

  test('重装 kit 文件 on a team repo: where it goes is asked (推荐 marked); in place, 推送 stays even when a reload drops the row', async () => {
    const user = userEvent.setup()
    const job = fx.importUpgradeJob()
    job.steps = [{ id: 'check', label: '看能不能直接装', state: 'ok', detail: '在 main 上，检出是干净的' }, ...job.steps.slice(1)]
    job.result = { ...job.result!, mode: 'inplace', branch: 'main', base: 'main', worktree: null, target: 'main',
      remote_url: 'git@gitlab.example.com:shop/shop-pay.git', text: '提交在 main 上了，现在就生效。远端还没有它：要推送就点「推送」' }
    installFixtureRoutes({
      [`POST ${API}/import/choices`]: () => fx.importChoices(),
      [`POST ${API}/import/upgrade`]: () => ({ job }),
    })
    const p = props()
    const { rerender } = render(<SettingsView {...p} />)
    const crew = screen.getByRole('region', { name: 'KiroCrew' })
    await user.click(within(crew).getByRole('button', { name: '重装 kit 文件' }))
    expect(apiCalls.find((c) => c.path === `${API}/import/choices`)?.body).toEqual({ path: '/Users/alice/workplace/shop-pay', purpose: 'upgrade' })
    const pick = await within(crew).findByTestId('mode-pick')
    const rec = pick.querySelector('[data-mode="branch"]') as HTMLElement
    expect(rec).toHaveTextContent('更新到新分支，开 MR 给团队看推荐')
    expect(pick.querySelector('[data-mode="inplace"]')).toHaveTextContent('更新在你现在的检出里，提交在 main 上；推送到远端以后生效（这会直接改团队的 main，没有 MR 评审）')
    await user.click(within(pick).getByRole('button', { name: '直接更新在 main' }))
    expect(apiCalls.find((c) => c.path === `${API}/import/upgrade`)?.body).toEqual({ path: '/Users/alice/workplace/shop-pay', mode: 'inplace' })
    expect(await within(crew).findByText(job.result!.text)).toBeInTheDocument()
    expect(p.reloadStatus).not.toHaveBeenCalled()                       // 推送 first: the page waits
    const fixed = fx.status()
    fixed.crew.rows = fixed.crew.rows.filter((r) => r.fix !== 'kit')     // the next status: the kit files are fine now
    rerender(<SettingsView {...p} status={fixed} />)
    const box = within(screen.getByRole('region', { name: 'KiroCrew' })).getByTestId('push-box')
    await user.click(within(box).getByRole('button', { name: '先不推送' }))
    expect(p.reloadStatus).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByTestId('push-box')).toBeNull())
    expect(screen.getByRole('region', { name: 'KiroCrew' })).not.toHaveTextContent('适配文件是旧版')
    expect(apiCalls.some((c) => c.path === `${API}/import/push`)).toBe(false)
  })

  test('重装 kit 文件 with one way only (no remote, nothing uncommitted): one click, then the page moves on', async () => {
    const user = userEvent.setup()
    const one = { ...fx.importChoices(), recommend: 'inplace' as const, remote_url: '',
      options: [{ mode: 'inplace' as const, title: '直接更新在 main', line: '更新在你现在的检出里，提交在 main 上，马上生效', ok: true, why: '' }] }
    const job = fx.importUpgradeJob()
    job.result = { ...job.result!, mode: 'inplace', branch: 'main', base: 'main', worktree: null, remote_url: '', text: '提交在 main 上了，现在就生效' }
    installFixtureRoutes({
      [`POST ${API}/import/choices`]: () => one,
      [`POST ${API}/import/upgrade`]: () => ({ job }),
    })
    const p = props()
    render(<SettingsView {...p} />)
    await user.click(within(screen.getByRole('region', { name: 'KiroCrew' })).getByRole('button', { name: '重装 kit 文件' }))
    await waitFor(() => expect(p.reloadStatus).toHaveBeenCalled())
    expect(screen.queryByTestId('mode-pick')).toBeNull()
    expect(apiCalls.find((c) => c.path === `${API}/import/upgrade`)?.body).toEqual({ path: '/Users/alice/workplace/shop-pay', mode: 'inplace' })
    expect(screen.queryByTestId('push-box')).toBeNull()
  })

  test('a repo without a remote, on its install branch: no waiting for a merge, 「合并到 main」 right on the row', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.repos[1] = { ...s.repos[1], error: '', pending: { ...fx.importInspectPending().pending!, remote_url: '', gitlab_base: '', gitlab_project: '',
      can_open_mr: false, word: '还没合进 main', text: '装在本机分支 brain/install 上，还没合进 main', next: '点「合并到 main」就能用（快进，不多一个提交）',
      merge: { ok: true, why: '', confirm: false } } }
    const merged = { ...fx.importMerge(), remote_url: '', text: '合进 main 了（快进到 d6342283）：这个仓库现在就能用。' }
    installFixtureRoutes({ [`POST ${API}/import/merge`]: () => merged })
    render(<SettingsView {...props({ status: s })} />)
    const r2 = screen.getByRole('region', { name: '仓库' }).querySelector('[data-repo="r2"]') as HTMLElement
    expect(r2).toHaveTextContent('还没合进 main')
    expect(r2).not.toHaveTextContent('等合并')
    expect(within(r2).queryByRole('button', { name: '去导入仓库' })).toBeNull()
    await user.click(within(r2).getByRole('button', { name: '合并到 main' }))
    expect(await within(r2).findByText(merged.text)).toBeInTheDocument()
    expect(apiCalls.find((c) => c.path === `${API}/import/merge`)?.body).toEqual({ path: '/Users/alice/workplace/shop-web', confirm: false })
    expect(within(r2).queryByTestId('push-box')).toBeNull()
  })

  test('team mode off is one checkbox, no red; on, it asks for bridge.json and runnerd.json only (the signer inside bridge.json, folded)', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.team = { ...s.team, enabled: false, error: '运行机模式没打开' }
    installFixtureRoutes({})
    render(<SettingsView {...props({ status: s })} />)
    await screen.findByLabelText('brain-kit 在哪')
    const team = screen.getByText('团队模式').closest('fieldset') as HTMLElement
    expect(within(team).queryAllByRole('textbox')).toEqual([])
    expect(team).not.toHaveTextContent('bridge')
    expect(screen.getByRole('region', { name: '团队运行机' })).not.toHaveTextContent('运行机模式没打开')
    await user.click(within(team).getByRole('checkbox', { name: '这台机器是团队运行机' }))
    expect(within(team).getAllByRole('textbox').map((x) => x.id)).toEqual(['set-bridge_config', 'set-runnerd_config'])
    expect(within(team).getByLabelText('桥的配置文件')).toHaveAttribute('placeholder', '…/bridge.json')
    expect(within(team).getByLabelText('运行机的配置文件')).toHaveAttribute('placeholder', '…/runnerd.json')
    expect(within(team).getByText(/"signer": \{"type": "spool"/).closest('details')).not.toHaveAttribute('open')
    expect(team.textContent?.replace(within(team).getByText(/"signer"/).textContent ?? '', '')).not.toMatch(/bridge |runnerd /) // the code names only under 细节
    expect(team).toHaveTextContent('不写签名私钥')
  })

  test('the same-user trial shows its warning; a save that fails shows errorText', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/settings`]: () => { throw apiError(400, 'bad_settings', 'work_root 必须在 ~/workplace 或 ~/workspace 下面') } })
    render(<SettingsView {...props()} />)
    await screen.findByLabelText('brain-kit 在哪')
    expect(screen.queryByTestId('same-user-warning')).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: '这台机器是团队运行机' }))
    await user.click(screen.getByRole('checkbox', { name: '本机试用：签名器和 app 用同一个系统用户' }))
    expect(screen.getByTestId('same-user-warning')).toHaveTextContent('只适合本机试用')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('work_root 必须在 ~/workplace 或 ~/workspace 下面（400）')
  })

  test('the status: brain-kit and its modules, each repo, who I am (a token is only 有/没有), KiroCrew’s checks with a fix', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/crew/fix`]: () => ({ ok: true, text: '给 brain-dev 的设置补上了 Lean 的拦截：调用工具前。别的都没动；改之前的那份留作备份：brain-dev.json.bak-20261110-091500。新开的会话才会用上。', rows: fx.crew().rows.slice(0, 2) }) })
    const p = props()
    render(<SettingsView {...p} />)
    const kit = screen.getByRole('region', { name: 'brain-kit' })
    expect(kit).toHaveTextContent('0.1.0')
    expect(kit).toHaveTextContent('交付评估 有')                                          // what the part does, not its module name
    expect(kit).toHaveTextContent('标准考题 没有')
    expect(kit).not.toHaveTextContent('evaluate')
    expect(within(kit).getByText('找到了')).toHaveClass('tone-ok')
    expect(screen.getByRole('region', { name: '团队运行机' })).toHaveTextContent('没开')
    const repos = screen.getByRole('region', { name: '仓库' })
    const r1 = repos.querySelector('[data-repo="r1"]') as HTMLElement
    expect(r1).toHaveClass('is-ok')
    expect(Array.from(r1.querySelectorAll('.st-kit .br-tag')).map((t) => t.textContent)).toEqual(['需求号 PAY-n', '跟踪 不用 Jira', '默认分支 main', 'GitLab shop/shop-pay'])
    expect(within(r1).getByText('能用')).toHaveClass('tone-ok')
    const r2 = repos.querySelector('[data-repo="r2"]') as HTMLElement
    expect(r2).not.toHaveClass('is-bad')                                                // not installed is no fault
    expect(within(r2).getByText('没装')).toHaveClass('tone-idle')
    await user.click(within(r2).getByRole('button', { name: '去装' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'import', path: '/Users/alice/workplace/shop-web' })
    const me = screen.getByRole('region', { name: '你是谁' })
    expect(me).toHaveTextContent('alice')
    expect(me).toHaveTextContent('GitLab 令牌 有')
    expect(me).not.toHaveTextContent('glpat')
    const crew = screen.getByRole('region', { name: 'KiroCrew' })
    expect(crew).toHaveTextContent('brain-dev 的设置缺 Lean 的拦截：调用工具前')
    expect(within(crew).getByRole('img', { name: '1 正常，1 注意，1 有问题' })).toBeInTheDocument()
    expect(crew).toHaveClass('is-bad')
    await user.click(within(crew).getByRole('button', { name: '补上 Lean 的 hook' }))
    expect(await within(crew).findByText('给 brain-dev 的设置补上了 Lean 的拦截：调用工具前。别的都没动；改之前的那份留作备份：brain-dev.json.bak-20261110-091500。新开的会话才会用上。')).toBeInTheDocument()
    expect(apiCalls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: `${API}/crew/fix`, body: { what: 'agent' } })
    expect(p.reloadStatus).toHaveBeenCalled()
  })

  test('no repo yet: the 仓库 card says how one gets in', () => {
    const s = fx.status()
    s.repos = []
    installFixtureRoutes({})
    render(<SettingsView {...props({ status: s })} />)
    const card = screen.getByRole('region', { name: '仓库' })
    expect(within(card).getByText('还没有仓库：点「导入仓库」。')).toBeInTheDocument()
    expect(within(within(card).getByRole('list', { name: '导入仓库的步骤' })).getAllByRole('listitem')).toHaveLength(4)
  })

  test('team mode on: the runner card says when the last round ran, the signer’s counts and the way to 运行机', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    s.app.team = true
    s.team = { ...fx.team().status }
    installFixtureRoutes({})
    const p = props({ status: s })
    render(<SettingsView {...p} />)
    const card = screen.getByRole('region', { name: '团队运行机' })
    expect(card).toHaveTextContent('正常')
    expect(card).toHaveTextContent('等签名 1')
    expect(card).toHaveTextContent('拒签 1')
    expect(card).toHaveTextContent('签名服务和 app 是同一个系统用户')
    await user.click(within(card).getByRole('button', { name: '看运行机' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'team' })
  })

  test('a round that failed and a name never set: said in words; the step’s own words and the command apart', () => {
    const s = fx.status()
    s.app.team = true
    s.team = { ...fx.team().status, loop_error: 'poll: HTTPError 502 Bad Gateway' }
    s.me = { ...s.me, user: null }
    s.repos = s.repos.map((r) => ({ ...r, me: null }))
    installFixtureRoutes({})
    render(<SettingsView {...props({ status: s })} />)
    const runner = screen.getByRole('region', { name: '团队运行机' })
    expect(runner).toHaveTextContent('上一轮有一步没成：点「看运行机」看是哪一步')
    expect(runner.querySelector('details pre')).toHaveTextContent('poll: HTTPError 502 Bad Gateway')
    expect(runner.querySelector('details')).not.toHaveAttribute('open')
    const who = screen.getByRole('region', { name: '你是谁' })
    expect(who).toHaveTextContent('导入仓库时会问你的名字，在那里填上，点「保存」。')
    const cmd = within(who).getByTestId('cmd-line')                                       // the command, folded under 细节
    expect(cmd).toHaveTextContent('git config --global brain.user 你的用户名复制')
    expect(cmd.closest('details')).not.toHaveAttribute('open')
  })
  test('你是谁 per repo: the login name without GitLab; 「你的 GitLab 用户名」 where brain-kit would not know, saved into that repo', async () => {
    const user = userEvent.setup()
    const s = fx.status()
    const login: RepoMe = { name: 'alice', source: 'login', gitlab: '', text: 'alice（这台机器的登录名：这个仓库不用 GitLab）', ask: false,
      label: '', why: '', suggest: '', error: '' }
    const ask: RepoMe = { name: null, source: 'none', gitlab: 'https://gitlab.example.com', text: '', ask: true, label: '你的 GitLab 用户名',
      why: '这个仓库用 GitLab：认领和交接都按这个名字认人，要和你在 GitLab 上的用户名一样', suggest: 'alice', error: '' }
    s.me = { user: null, token: false, how: 'GitLab 令牌（没有）' }
    s.repos = [{ ...s.repos[0], me: login }, { ...s.repos[0], id: 'r2', path: '/Users/alice/workplace/shop-web', name: 'shop-web', me: ask }]
    const after = fx.status()
    installFixtureRoutes({ [`POST ${API}/me/name`]: () => ({ ok: true, text: '这个仓库的 git config brain.user 设成了 alice',
      me: { ...ask, name: 'alice', source: 'git', text: 'alice（这个仓库里记下的名字）', ask: false }, status: after }) })
    const p = props({ status: s })
    render(<SettingsView {...p} />)
    const kpi = screen.getByRole('region', { name: '你是谁' })
    expect(kpi).toHaveTextContent('alice')
    expect(kpi).toHaveTextContent('1 个仓库里 brain-kit 还不知道你是谁：在下面「仓库」那一行看一眼名字，点「保存」')
    const card = screen.getByRole('region', { name: '仓库' })
    const r1 = card.querySelector('[data-repo="r1"]') as HTMLElement
    expect(within(r1).getByTestId('me-line')).toHaveTextContent('alice（这台机器的登录名：这个仓库不用 GitLab）')
    expect(within(r1).queryByRole('textbox')).toBeNull()
    const r2 = card.querySelector('[data-repo="r2"]') as HTMLElement
    const who = within(r2).getByRole('group', { name: '你的 GitLab 用户名' })
    expect(within(who).getByLabelText('你的 GitLab 用户名')).toHaveValue('alice')
    expect(who).toHaveTextContent(ask.why)
    await user.click(within(who).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(p.setStatus).toHaveBeenCalledWith(after))
    expect(apiCalls.find((c) => c.path === `${API}/me/name`)?.body).toEqual({ path: '/Users/alice/workplace/shop-web', name: 'alice' })
    expect(within(r2).getByTestId('me-line')).toHaveTextContent('alice（这个仓库里记下的名字）已保存')
    for (const c of apiCalls) expect(JSON.stringify(c.body ?? '')).not.toMatch(/token/i)    // nothing asks for a token
  })

  test('no brain-kit: its place is asked first, at the top, focused, with why (by the reason) and where to get one', async () => {
    const missing = fx.status()
    missing.brainkit = { ...missing.brainkit, ok: false, version: null, error: '这里没有 brain-kit（找不到 /Users/alice/src/brain-kit/brainkit/__init__.py）' }
    missing.repos[0] = { ...missing.repos[0], ok: false, error: 'brain-kit 没装载', me: null }
    installFixtureRoutes({})
    const { unmount } = render(<SettingsView {...props({ status: missing })} />)
    const card = screen.getByTestId('settings-no-brainkit')
    expect(card).toHaveTextContent('找不到 brain-kit')
    expect(card).toHaveTextContent('做什么在设置的「brain-kit 在哪」写上它的目录，点「保存」')
    expect(within(card).getByTestId('cmd-line')).toHaveTextContent('git clone https://github.com/warren830/brain-kit.git ~/brain-kit复制')
    const input = await within(card).findByLabelText('brain-kit 在哪')
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getAllByLabelText('brain-kit 在哪')).toHaveLength(1)                  // not a second time in the form below
    expect(card.compareDocumentPosition(screen.getByRole('region', { name: '仓库' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // a repo that waits for brain-kit points at that card, not at 导入仓库
    const waiting = screen.getByRole('region', { name: '仓库' }).querySelector<HTMLElement>('li[data-repo="r1"]') as HTMLElement
    expect(waiting).toHaveTextContent('等 brain-kit')
    expect(waiting).toHaveTextContent('brain-kit 没装载：先在最上面写对 brain-kit 的位置，这个仓库就能读了')
    expect(within(waiting).queryByRole('button', { name: /去检查|去装/ })).toBeNull()
    expect(within(waiting).getByTestId('repo-waits-kit').parentElement?.children).toHaveLength(1)   // one line, no gap before its colon
    // nor can one without brain-kit be installed now: no 去装 to a page that cannot install it
    const bare = screen.getByRole('region', { name: '仓库' }).querySelector<HTMLElement>('li[data-repo="r2"]') as HTMLElement
    expect(bare).toHaveTextContent('还没装 brain-kit：先在最上面写对 brain-kit 的位置，才能装')
    expect(bare).not.toHaveTextContent('在「导入仓库」里检查它')
    expect(within(bare).queryByRole('button', { name: /去检查|去装/ })).toBeNull()
    unmount()
    const old = fx.status()
    old.brainkit = { ...old.brainkit, ok: false, error: 'brain-kit 太旧（没有 sign.SpoolSigner）：要 72b278e 或更新的版本' }
    const { unmount: u2 } = render(<SettingsView {...props({ status: old })} />)
    expect(screen.getByTestId('settings-no-brainkit')).toHaveTextContent('brain-kit 太旧了（位置是对的）')
    expect(screen.getByTestId('settings-no-brainkit')).toHaveTextContent('做什么在它的目录里拉取最新的代码（点「复制」拿命令），再到设置里点「保存」重新读它')
    expect(within(screen.getByTestId('settings-no-brainkit')).getByTestId('cmd-line')).toHaveTextContent(`git -C ${old.brainkit.path} pull --ff-only`)
    expect(screen.getByTestId('settings-no-brainkit')).not.toHaveTextContent('git clone')
    u2()
    const broken = fx.status()
    broken.brainkit = { ...broken.brainkit, ok: false, error: "brain-kit 导入失败：ModuleNotFoundError: No module named 'x'" }
    render(<SettingsView {...props({ status: broken })} />)
    const b = screen.getByTestId('settings-no-brainkit')
    expect(b).toHaveTextContent('brain-kit 读不进来')
    expect(b.querySelector('details pre')).toHaveTextContent('ModuleNotFoundError')       // the Python error only under 细节
    expect(b.querySelector('details')).not.toHaveAttribute('open')
  })

  test('a repo says its state by the reason; without GitLab it says so instead of an empty tag', () => {
    const s = fx.status()
    s.repos = [
      { ...s.repos[0], kit: { ...s.repos[0].kit!, gitlab_base: '', gitlab_project: '' } },
      { ...s.repos[1], id: 'r2', error: '找不到这个目录' },
    ]
    installFixtureRoutes({})
    render(<SettingsView {...props({ status: s })} />)
    const r1 = document.querySelector('[data-repo="r1"]') as HTMLElement
    expect(Array.from(r1.querySelectorAll('.st-kit .br-tag')).map((t) => t.textContent)).toContain('不用 GitLab')
    const r2 = document.querySelector('[data-repo="r2"]') as HTMLElement
    expect(within(r2).getByText('找不到目录')).toHaveClass('tone-bad')
    expect(within(r2).getByRole('button', { name: '移出列表' }).closest('.st-repo-top')).toBeTruthy()  // on the name's line, at its end
  })
})
