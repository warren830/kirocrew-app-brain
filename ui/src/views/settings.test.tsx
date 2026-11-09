import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, apiError } from '../test/stubs/app-sdk'
import type { Settings } from '../types'
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

  test('a repo whose brain-kit is on the install branch says so, with its MR', () => {
    const s = fx.status()
    s.repos[1] = { ...s.repos[1], error: '', pending: { ...fx.importInspectPending().pending!, mr_url: 'https://gitlab.example.com/shop/shop-web/-/merge_requests/3', next: '在 GitLab 上审核并合并 MR，然后在这个目录里 git pull' } }
    installFixtureRoutes({})
    render(<SettingsView {...props({ status: s })} />)
    const r2 = screen.getByRole('region', { name: '仓库' }).querySelector('[data-repo="r2"]') as HTMLElement
    expect(r2).toHaveTextContent('等合并')
    expect(r2).toHaveTextContent('安装在 brain/install 分支上，合并后生效。在 GitLab 上审核并合并 MR，然后在这个目录里 git pull')
    expect(within(r2).getByRole('link', { name: /看 MR/ })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-web/-/merge_requests/3')
    expect(r2).not.toHaveTextContent('读不到')
  })

  test('team mode asks for bridge.json and runnerd.json only: the signer is named inside bridge.json, never a key', async () => {
    installFixtureRoutes({})
    render(<SettingsView {...props()} />)
    await screen.findByLabelText('brain-kit 在哪')
    const team = screen.getByText('团队模式').closest('fieldset') as HTMLElement
    expect(within(team).getAllByRole('textbox').map((x) => x.id)).toEqual(['set-bridge_config', 'set-runnerd_config'])
    expect(team).toHaveTextContent('"signer": {"type": "spool"')
    expect(team).toHaveTextContent('不写 signing_key')
  })

  test('the same-user trial shows its warning; a save that fails shows errorText', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/settings`]: () => { throw apiError(400, 'bad_settings', 'work_root 必须在 ~/workplace 或 ~/workspace 下面') } })
    render(<SettingsView {...props()} />)
    await screen.findByLabelText('brain-kit 在哪')
    expect(screen.queryByTestId('same-user-warning')).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: '本机试用：签名器和 app 用同一个系统用户' }))
    expect(screen.getByTestId('same-user-warning')).toHaveTextContent('只适合本机试用')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('work_root 必须在 ~/workplace 或 ~/workspace 下面（400）')
  })

  test('the status: brain-kit and its modules, each repo, who I am (a token is only 有/没有), KiroCrew’s checks with a fix', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/crew/fix`]: () => ({ ok: true, text: '装好了 ~/.kiro/agents/brain-dev.json', rows: fx.crew().rows.slice(0, 2) }) })
    const p = props()
    render(<SettingsView {...p} />)
    const kit = screen.getByRole('region', { name: 'brain-kit' })
    expect(kit).toHaveTextContent('0.1.0')
    expect(kit).toHaveTextContent('evaluate 有')
    expect(kit).toHaveTextContent('golden 没有')
    const repos = screen.getByRole('region', { name: '仓库' })
    expect(repos.querySelector('[data-repo="r1"]')).toHaveTextContent('需求号 PAY-n · 跟踪 none · 默认分支 main · GitLab shop/shop-pay')
    expect(repos.querySelector('[data-repo="r2"]')).toHaveTextContent('读不到')
    const me = screen.getByRole('region', { name: '我是谁' })
    expect(me).toHaveTextContent('alice')
    expect(me).toHaveTextContent('GitLab token有')
    const crew = screen.getByRole('region', { name: 'KiroCrew' })
    expect(crew).toHaveTextContent('brain-dev.json 缺 Lean 的 hook：调用工具前')
    await user.click(within(crew).getByRole('button', { name: '装上或补全 brain-dev 的 Lean hook' }))
    expect(await within(crew).findByText('装好了 ~/.kiro/agents/brain-dev.json')).toBeInTheDocument()
    expect(apiCalls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: `${API}/crew/fix`, body: { what: 'agent' } })
    expect(p.reloadStatus).toHaveBeenCalled()
  })
})
