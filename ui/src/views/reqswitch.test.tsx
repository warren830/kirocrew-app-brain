import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls } from '../test/stubs/app-sdk'
import { ReqSwitch, optionText } from './ReqSwitch'

const rowsOf = () => fx.overview().rows

describe('切换需求', () => {
  test('every requirement of 交付总览, 等你 on the ones that wait on you; a pick opens it', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const onPick = vi.fn()
    render(<ReqSwitch repo="r1" reqKey="PAY-3" status={fx.status()} onPick={onPick} />)
    const pick = await screen.findByRole('combobox', { name: '切换需求' })
    const rows = rowsOf()
    expect(within(pick).getAllByRole('option')).toHaveLength(rows.length)
    expect(pick.querySelectorAll('optgroup')).toHaveLength(0) // one repo: no groups
    const mine = rows.find((r) => r.waits.who === 'you')!
    expect(within(pick).getByRole('option', { name: optionText(mine) })).toHaveTextContent('等你')
    expect(apiCalls.some((c) => c.path === `${API}/overview?repo=all`)).toBe(true)
    await user.selectOptions(pick, 'r1\u0001PAY-5')
    expect(onPick).toHaveBeenCalledWith('r1', 'PAY-5')
  })

  test('more than one repo: a group per repo, in the order of /status', async () => {
    const o = fx.overview()
    o.rows[o.rows.length - 1] = { ...o.rows[o.rows.length - 1], repo: 'r2' }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => o })
    render(<ReqSwitch repo="r1" reqKey="PAY-3" status={fx.status()} onPick={vi.fn()} />)
    const pick = await screen.findByRole('combobox', { name: '切换需求' })
    expect([...pick.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['shop-pay', 'shop-web'])
    expect(within(pick.querySelectorAll('optgroup')[1] as HTMLElement).getAllByRole('option')).toHaveLength(1)
  })

  test('nothing to switch to: not shown; a requirement the list does not have stays the one shown', async () => {
    const one = { ...fx.overview(), rows: [rowsOf().find((r) => r.key === 'PAY-3')!] }
    installFixtureRoutes({ [`GET ${API}/overview*`]: () => one })
    const { unmount } = render(<ReqSwitch repo="r1" reqKey="PAY-3" status={fx.status()} onPick={vi.fn()} />)
    await waitFor(() => expect(apiCalls.some((c) => c.path.startsWith(`${API}/overview`))).toBe(true))
    expect(screen.queryByRole('combobox', { name: '切换需求' })).toBeNull()
    unmount()
    render(<ReqSwitch repo="runner" reqKey="OPS-9" status={fx.status()} onPick={vi.fn()} />)
    const pick = await screen.findByRole('combobox', { name: '切换需求' })
    expect(pick).toHaveValue('runner\u0001OPS-9')
    expect(within(pick).getAllByRole('option').map((o) => o.textContent)).toEqual(['OPS-9', optionText(one.rows[0])])
  })
})
