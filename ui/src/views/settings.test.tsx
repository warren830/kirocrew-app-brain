import { render, screen, within } from '@testing-library/react'
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
  test('save posts the edited settings, puts the answered status in place and says 已保存', async () => {
    const user = userEvent.setup()
    const answered = fx.status()
    answered.repos = answered.repos.slice(0, 1)
    installFixtureRoutes({
      [`POST ${API}/settings`]: (body) => ({ ok: true, settings: body as Settings, status: answered }),
    })
    const p = props()
    render(<SettingsView {...p} />)
    const repos = await screen.findByLabelText('项目仓库（一行一个）')
    expect(repos).toHaveValue('/Users/alice/workplace/shop-pay\n/Users/alice/workplace/shop-web')
    await user.clear(repos)
    await user.type(repos, '/Users/alice/workplace/shop-pay{enter}{enter}')
    await user.click(screen.getByRole('checkbox', { name: '这台机器是团队运行机' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('已保存')).toBeInTheDocument()
    const post = apiCalls.find((c) => c.method === 'POST')
    expect(post?.path).toBe(`${API}/settings`)
    expect(post?.body).toEqual({ ...fx.settings(), repos: ['/Users/alice/workplace/shop-pay'], team: { ...fx.settings().team, enabled: true } })
    expect(p.setStatus).toHaveBeenCalledWith(answered)
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
