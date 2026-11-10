import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { fmtIso } from '../format'
import { fx } from '../test/data'
import { API, installFixtureRoutes } from '../test/routes'
import { apiCalls, navigations } from '../test/stubs/app-sdk'
import type { CheckRow, TeamConfigRow, TeamNote } from '../types'
import type { ViewProps } from './props'
import { HANDOVER_RESULT, OUTBOX_STATE, RUN_STATE, TeamPage, handoverMeta, noteTone, outboxMeta, runStateMeta } from './Team'

function teamStatus() {
  const s = fx.status()
  s.app.team = true
  s.team = fx.team().status
  return s
}
const props = (over: Partial<ViewProps> = {}): ViewProps => ({
  status: teamStatus(), go: vi.fn(), replace: vi.fn(), reloadStatus: vi.fn(), setStatus: vi.fn(), pollMs: 60_000, ...over,
})

describe('运行机', () => {
  test('the loop status, the ledger, the runs with their MRs, and the signer’s pending and refused', async () => {
    installFixtureRoutes()
    render(<TeamPage {...props()} />)
    const runs = await screen.findByRole('region', { name: '运行' })
    // a run in words, its id on hover
    expect(runs).toHaveTextContent('第 1 次运行')
    expect(runs).not.toHaveTextContent('RUN-PAY-4-1')
    expect(within(runs).getAllByTitle('RUN-PAY-4-1')).toHaveLength(1)
    expect(within(runs).getByRole('link', { name: /!41/ })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/41')
    const ledger = screen.getByRole('region', { name: '账本' })
    expect(ledger.querySelector('[data-ledger="handoffs"]')).toHaveTextContent('已接手 4')
    const signer = screen.getByRole('region', { name: '签名' })
    // what each signature is for, in words (the request id is no one's business)
    expect(signer).toHaveTextContent('回答的凭证')
    expect(signer).toHaveTextContent('交接的合同')
    expect(signer).not.toHaveTextContent('answer')
    expect(signer).not.toHaveTextContent('handoff')
    expect(signer).toHaveTextContent('负责人和认领记录对不上')
    expect(screen.getByTestId('signer-same-user')).toHaveTextContent('签名服务和 app 是同一个系统用户')
    expect(screen.getByTestId('signer-same-user')).toHaveTextContent('做什么正式给团队用之前，让签名服务换成另一个系统用户来跑')
    expect(screen.getByRole('region', { name: '运行机状态' })).toHaveTextContent('等签名 1 · 拒签 1')
  })

  test('runs and the ledger say brain-kit’s run states in words (an unknown one as it is); decision states as on the MR', async () => {
    const tv = fx.team()
    tv.runs[0].state = 'parked_somewhere' as never
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    const runs = await screen.findByRole('region', { name: '运行' })
    const chip = (runId: string) => within(within(runs).getByTitle(runId).closest('tr') as HTMLElement).getByText(/./, { selector: '.br-chip' })
    expect(chip('RUN-PAY-9-1')).toHaveTextContent('parked_somewhere')
    expect(chip('RUN-PAY-9-1')).toHaveClass('tone-idle')
    expect(chip('RUN-PAY-4-1')).toHaveTextContent('已派给会话')
    expect(chip('RUN-PAY-4-1')).toHaveClass('tone-run')
    expect(chip('RUN-PAY-2-1')).toHaveTextContent('已合并')
    const ledger = screen.getByRole('region', { name: '账本' })
    const line = (k: string) => Array.from(ledger.querySelectorAll(`[data-ledger="${k}"] .tm-leg`)).map((t) => t.textContent)
    expect(line('runs')).toEqual(['签名中 1', '已派给会话 2', '已合并 3'])
    // brain-kit 72b278e: asking, a bridge posting the question right now
    expect(line('decisions')).toEqual(['正在发到 MR 1', '已发出，等回答 1', '已收到回答，等桥签名送回 1', '已送回 4', '签名服务拒签 1', '作废 1'])
    expect(line('handoffs')).toEqual(['已接手 4', '拒绝接手 1'])
    expect(ledger.querySelector('[data-ledger="runs"] .tm-leg')).not.toHaveAttribute('title') // no state's code name on hover
    // each count card: its total (hand-overs: taken of all) and a segment bar by state
    expect(ledger.querySelector('[data-ledger="runs"]')).toHaveTextContent('运行6个')
    expect(within(ledger.querySelector('[data-ledger="runs"]') as HTMLElement).getByRole('img')).toHaveAccessibleName('签名中 1，已派给会话 2，已合并 3')
    expect(ledger.querySelector('[data-ledger="handoffs"]')).toHaveTextContent('交接4/5')
    expect(ledger.querySelector('[data-ledger="signer"]')).toHaveTextContent('签名1等签名')
    expect(ledger.querySelector('[data-ledger="signer"]')).toHaveTextContent('拒签 1 · 上一轮没等到 1')
    // every run state of brain-kit has words
    expect(Object.keys(RUN_STATE).sort()).toEqual(['closed', 'dispatched', 'failed', 'merged', 'ready', 'send_unknown', 'signing', 'spooled'])
    expect(runStateMeta('send_unknown')).toEqual({ label: '送没送到不清楚', tone: 'warn', hint: '桥每轮看会话，看到了就接着做；一直这样要人看一下' })
    expect(runStateMeta('signing').label).toBe('签名中')
  })

  test('failed is 没能开始 (no workspace, or the hand-over never got into the session); send_unknown says the bridge looks each round', async () => {
    const tv = fx.team()
    tv.runs[2].state = 'failed'
    tv.runs[1].state = 'send_unknown'
    tv.ledger.runs = { send_unknown: 1, failed: 1, merged: 1 }
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    const runs = await screen.findByRole('region', { name: '运行' })
    const cell = (runId: string) => (within(runs).getByTitle(runId).closest('tr') as HTMLElement).querySelector('.tm-state') as HTMLElement
    const failed = within(cell('RUN-PAY-5-1')).getByText('没能开始')
    expect(failed).toHaveClass('br-chip', 'tone-bad')
    expect(failed).toHaveAttribute('title', '工作区没建成，或接手消息一直送不进会话')
    expect(cell('RUN-PAY-5-1')).toHaveTextContent('没能开始工作区没建成，或接手消息一直送不进会话')
    expect(within(cell('RUN-PAY-4-1')).getByText('送没送到不清楚')).toHaveClass('tone-warn')
    expect(cell('RUN-PAY-4-1').querySelector('.tm-state-hint')).toHaveTextContent('桥每轮看会话，看到了就接着做；一直这样要人看一下')
    // a state with nothing more to say has no line under its chip
    expect(cell('RUN-PAY-9-1').querySelector('.tm-state-hint')).toBeNull()
    expect(cell('RUN-PAY-2-1').querySelector('.tm-state-hint')).toBeNull()
    const ledger = screen.getByRole('region', { name: '账本' })
    expect(Array.from(ledger.querySelectorAll('[data-ledger="runs"] .tm-leg')).map((t) => t.textContent)).toEqual(['送没送到不清楚 1', '没能开始 1', '已合并 1'])
    expect(runStateMeta('failed')).toEqual({ label: '没能开始', tone: 'bad', hint: '工作区没建成，或接手消息一直送不进会话' })
  })

  test('送进会话的消息: a counter card beside the others, its states in words and tones, sent of all; a border while one needs a look', async () => {
    const show = async (outbox: Record<string, number>) => {
      const tv = fx.team()
      tv.ledger.outbox = outbox
      installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
      const r = render(<TeamPage {...props()} />)
      await screen.findByRole('region', { name: '运行' })
      const ledger = screen.getByRole('region', { name: '账本' })
      return { ...r, ledger, card: ledger.querySelector('[data-ledger="outbox"]') as HTMLElement }
    }
    const legs = (card: HTMLElement) => Array.from(card.querySelectorAll('.tm-leg'))
    // the backend counts them as they come; the card says them in brain-kit's order
    const a = await show({ sent: 5, unknown: 2, dropped: 1, sending: 1, interrupted: 1 })
    expect(Array.from(a.ledger.children).map((c) => c.getAttribute('data-ledger'))).toEqual(['runs', 'decisions', 'handoffs', 'outbox', 'signer'])
    expect(a.card).toHaveTextContent('送进会话的消息5/10')
    expect(legs(a.card).map((t) => t.textContent)).toEqual(['正在送 1', '送的时候桥停了 1', '送到了 5', '不知道送到没有 2', '不送了 1'])
    expect(legs(a.card).map((t) => t.querySelector('i')?.className)).toEqual(['tone-run', 'tone-warn', 'tone-ok', 'tone-warn', 'tone-bad'])
    expect(legs(a.card).some((t) => t.hasAttribute('title'))).toBe(false)   // no state's code name on hover
    expect(within(a.card).getByRole('img')).toHaveAccessibleName('正在送 1，送的时候桥停了 1，送到了 5，不知道送到没有 2，不送了 1')
    expect(a.card).toHaveClass('has-bad')
    expect(a.card).toHaveTextContent('桥每轮看会话：看到了就算送到，一直这样要人看一下')
    a.unmount()
    // not known to have landed: amber, the note; all landed: no border, no note
    const b = await show({ sent: 3, unknown: 1 })
    expect(b.card).toHaveClass('has-warn')
    expect(b.card).not.toHaveClass('has-bad')
    expect(b.card).toHaveTextContent('3/4')
    b.unmount()
    const c = await show({ sent: 7 })
    expect(c.card).not.toHaveClass('has-warn')
    expect(c.card).not.toHaveClass('has-bad')
    expect(c.card).not.toHaveTextContent('桥每轮看会话')
    c.unmount()
    // none yet (or an older brain-kit): 0/0 and a dash
    const d = await show({})
    expect(d.card).toHaveTextContent('送进会话的消息0/0—')
    expect(d.card.querySelector('.tm-stack')).toHaveClass('is-empty')
    expect(Object.keys(OUTBOX_STATE)).toEqual(['sending', 'interrupted', 'sent', 'unknown', 'dropped'])
    expect(outboxMeta('later')).toEqual({ label: 'later', tone: 'idle' })
  })

  test('what the bridge holds about a run is a line under it, toned by its kind, with when', async () => {
    const at = Math.floor(Date.now() / 1000) - 3 * 3600
    const note = (kind: string, text: string, when: number | null = at): TeamNote => ({ kind, text, at: when })
    const tv = fx.team()
    tv.runs[1].notes = [
      note('ci_wait', '验收问题等 MR 的流水线通过才发（通过以后桥自动发）'),
      note('outbox_unknown', '接手消息不知道送到会话没有（送过 2 次）：桥每轮看一下会话，看到了就算送到；一直这样就要人看一下会话'),
    ]
    tv.runs[2].notes = [
      note('runnerd_silent', '运行机很久没准备好工作区、也没报错：请负责人看一下 brain-runnerd'),
      note('runnerd_retry', '运行机建工作区没成，过一会儿再试'),
      note('gaveup', '消息送了 3 次都没进会话：桥接着送，一直不行就看一下 KiroCrew'),
      note('ci_red', '流水线一直没过：验收问题没发，请负责人看一下'),
      note('outbox_dropped', '接手消息不送了：KiroCrew 一直没收下，这个 run 算没能开始'),
      note('queued', '在排队：运行机上的 run 满了，有空位就开始', null),
      note('ci_later', '以后的流水线说法'),
      note('something_new', '以后的别的说法'),
    ]
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    const runs = await screen.findByRole('region', { name: '运行' })
    const under = (runId: string) => (within(runs).getByTitle(runId).closest('tr') as HTMLElement).nextElementSibling as HTMLElement
    // right under its run, across the whole row
    expect(under('RUN-PAY-4-1')).toHaveAttribute('data-notes', 'RUN-PAY-4-1')
    expect(under('RUN-PAY-4-1').querySelector('td')).toHaveAttribute('colspan', '7')
    const list = within(runs).getByRole('list', { name: 'PAY-4 的第 1 次运行：桥记着的事' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.getAttribute('data-kind'))).toEqual(['ci_wait', 'outbox_unknown'])
    expect(items[0]).toHaveTextContent('验收问题等 MR 的流水线通过才发（通过以后桥自动发）')
    expect(items[0]).toHaveTextContent('3 小时前')
    expect(items[0]).toHaveClass('tm-note', 'tone-warn')
    expect(items[1]).toHaveClass('tone-warn')
    const tones = Array.from(under('RUN-PAY-5-1').querySelectorAll('li')).map((li) => [li.getAttribute('data-kind'), li.className.replace('tm-note ', '')])
    expect(tones).toEqual([
      ['runnerd_silent', 'tone-bad'], ['runnerd_retry', 'tone-warn'], ['gaveup', 'tone-bad'], ['ci_red', 'tone-bad'],
      ['outbox_dropped', 'tone-bad'], ['queued', 'tone-idle'], ['ci_later', 'tone-warn'], ['something_new', 'tone-idle'],
    ])
    const glyphs = Array.from(under('RUN-PAY-5-1').querySelectorAll('.tm-note-glyph')).map((g) => g.textContent)
    expect(glyphs).toEqual(['✕', '!', '✕', '✕', '✕', '·', '!', '·'])
    // no time when the ledger has none
    const queued = under('RUN-PAY-5-1').querySelector('[data-kind="queued"]') as HTMLElement
    expect(queued).toHaveTextContent('在排队：运行机上的 run 满了，有空位就开始')
    expect(queued.querySelector('.tm-note-at')).toBeNull()
    // a run with nothing held has no line under it; its own row carries no gap for one
    const plain = within(runs).getByTitle('RUN-PAY-9-1').closest('tr') as HTMLElement
    expect(plain).not.toHaveClass('has-notes')
    expect(plain.nextElementSibling).not.toHaveAttribute('data-notes')
    expect(within(runs).getByTitle('RUN-PAY-4-1').closest('tr')).toHaveClass('has-notes')
    expect(noteTone('outbox_interrupted')).toBe('warn')
    expect(noteTone('ci_wait')).toBe('warn')
  })

  test('配置: bridge.json and runnerd.json by file, the key in code, the value with a quiet 默认, its line; none read yet, one line', async () => {
    const row = (file: TeamConfigRow['file'], key: string, value: string, isDefault: boolean, text: string): TeamConfigRow => ({ file, key, value, default: isDefault, text })
    const bridge = [
      row('bridge.json', 'interval', '60 秒', true, '桥每隔这么久跑一轮'),
      row('bridge.json', 'send_give_up_minutes', '30 分钟', false, '接手消息送了 3 次都没进运行机的会话，过了这么久就算这个 run 没能开始（回答和通知一直送，不放弃）'),
      row('bridge.json', 'runnerd_wait_minutes', '90 分钟', true, '运行机这么久没准备好工作区、也没报错，就在 MR 上说一声（桥接着等）'),
      row('bridge.json', 'acceptance_ci_wait_minutes', '60 分钟', true, '验收问题等流水线通过才发：流水线这么久还没跑完，就在 MR 上说一声'),
      row('bridge.json', 'edit_check_rounds', '3', true, '查不到回复有没有被别人改过：连着这么多轮，就在 MR 上说一声（回答先等着，不算也不丢）'),
      row('bridge.json', 'edit_check_wait_minutes', '30 分钟', true, '……或者从第一次查不到起过了这么久'),
    ]
    const runnerd = [
      row('runnerd.json', 'kit_dir', '/opt/brain-kit', false, '运行机用哪份 brain-kit 的 kit/：每建一个工作区前查一次，它的 lean-hook.py 要是第 3 版'),
      row('runnerd.json', 'agent_spec', '不查', true, 'brain-run 的 agent 文件：查它带着 lean-hook.py --runner 的三个 hook（工具调用前的匹配要是 *）'),
      row('runnerd.json', 'hook_path', '/usr/bin:/bin', true, '运行机上的 hook 找 git 和 ssh-keygen 用的 PATH'),
      row('runnerd.json', 'git_timeout', '300 秒', true, '每次 fetch（和拉 brain-intake）最多等这么久'),
      row('runnerd.json', 'clone_timeout', '3600 秒', true, '第一次克隆最多等这么久'),
      row('runnerd.json', 'tries', '3', true, '建工作区失败了，最多试这么多次'),
    ]
    const show = async (config: TeamConfigRow[]) => {
      const tv = fx.team()
      tv.config = config
      installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
      const r = render(<TeamPage {...props()} />)
      return { ...r, card: await screen.findByRole('region', { name: '配置' }) }
    }
    // runnerd.json's rows first: still grouped, bridge.json first
    const a = await show([...runnerd, ...bridge])
    expect(a.card).toHaveTextContent('改过 2 项，其余用默认')
    const groups = within(a.card).getAllByRole('rowgroup').filter((g) => g.hasAttribute('data-file'))
    expect(groups.map((g) => g.getAttribute('data-file'))).toEqual(['bridge.json', 'runnerd.json'])
    const keys = (file: string) => Array.from(within(a.card).getByRole('rowgroup', { name: file }).querySelectorAll('tr[data-key]')).map((t) => t.getAttribute('data-key'))
    expect(keys('bridge.json')).toEqual(['interval', 'send_give_up_minutes', 'runnerd_wait_minutes', 'acceptance_ci_wait_minutes', 'edit_check_rounds', 'edit_check_wait_minutes'])
    expect(keys('runnerd.json')).toEqual(['kit_dir', 'agent_spec', 'hook_path', 'git_timeout', 'clone_timeout', 'tries'])
    expect(within(groups[0]).getByRole('rowheader', { name: /bridge\.json/ })).toHaveTextContent('bridge.json桥')
    expect(within(groups[1]).getByRole('rowheader', { name: /runnerd\.json/ })).toHaveTextContent('runnerd.json运行机（brain-runnerd）')
    const tr = (key: string) => a.card.querySelector(`tr[data-key="${key}"]`) as HTMLElement
    expect(within(tr('send_give_up_minutes')).getByText('send_give_up_minutes').tagName).toBe('CODE')
    expect(tr('send_give_up_minutes')).toHaveTextContent('30 分钟')
    expect(tr('send_give_up_minutes')).toHaveTextContent('过了这么久就算这个 run 没能开始')
    expect(within(tr('send_give_up_minutes')).queryByText('默认')).toBeNull()
    expect(within(tr('interval')).getByText('默认')).toHaveClass('tm-def')
    expect(tr('interval')).toHaveClass('is-default')
    expect(tr('kit_dir')).toHaveTextContent('/opt/brain-kit')
    expect(within(tr('kit_dir')).queryByText('默认')).toBeNull()
    expect(within(tr('agent_spec')).getByText('不查')).toBeInTheDocument()
    expect(within(tr('agent_spec')).getByText('默认')).toBeInTheDocument()
    expect(within(a.card).getAllByText('默认')).toHaveLength(10)
    a.unmount()
    // no runnerd.json: said so
    const b = await show(bridge)
    expect(within(b.card).getByRole('rowgroup', { name: 'runnerd.json' })).toHaveTextContent('没配 runnerd.json')
    expect(b.card).toHaveTextContent('改过 1 项，其余用默认')
    b.unmount()
    // nothing read yet
    const c = await show([])
    expect(c.card).toHaveTextContent('还没读到设置')
    expect(within(c.card).queryByRole('table')).toBeNull()
  })

  test('运行机的 Lean hook: the hooks rows as brain-runnerd checks them, with 做什么 and brain-kit’s words; none, no card', async () => {
    const show = async (hooks: CheckRow[]) => {
      const tv = fx.team()
      tv.hooks = hooks
      installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
      const r = render(<TeamPage {...props()} />)
      await screen.findByRole('region', { name: '运行' })
      return r
    }
    const a = await show([
      { level: 'FAIL', text: '运行机的 brain-kit 带的 hook 适配器是旧版（第 2 版，要第 3 版）', todo: '在运行机上更新 brain-kit：在那之前 brain-runnerd 不建工作区',
        fix: null, repo: null, raw: "the installed brain-kit's hook adapter /opt/brain-kit/kit/.kiro/brain/lean-hook.py is version 2, needs 3" },
      { level: 'FAIL', text: '/etc/brain/brain-run.json 没有跑 Lean 的「工具调用前」hook', todo: '照 brain-kit 的 remote/agents/brain-run.json 补上：用运行机装的 lean-hook.py --runner',
        fix: null, repo: null, raw: '' },
    ])
    const card = screen.getByRole('region', { name: '运行机的 Lean hook' })
    expect(card).toHaveClass('br-card', 'is-bad')
    expect(within(card).getByText('有问题')).toHaveClass('tone-bad')
    expect(card).toHaveTextContent('hook 适配器第 3 版，brain-run 的三个 hook')
    const rows = within(within(card).getByTestId('check-rows')).getAllByRole('listitem').filter((li) => li.hasAttribute('data-level'))
    expect(rows.map((r) => r.getAttribute('data-level'))).toEqual(['FAIL', 'FAIL'])
    expect(rows[0]).toHaveTextContent('运行机的 brain-kit 带的 hook 适配器是旧版（第 2 版，要第 3 版）')
    expect(rows[0]).toHaveTextContent('做什么在运行机上更新 brain-kit：在那之前 brain-runnerd 不建工作区')
    expect(within(rows[0]).getByText('brain-kit 的原话')).toBeInTheDocument()
    expect(within(rows[1]).queryByText('brain-kit 的原话')).toBeNull()
    // it sits with the runs, before the signer
    const order = Array.from(screen.getByTestId('team').querySelectorAll(':scope > section')).map((s) => s.getAttribute('aria-label'))
    expect(order.slice(order.indexOf('运行'))).toEqual(['运行', '运行机的 Lean hook', '签名', '配置'])
    a.unmount()
    const b = await show([{ level: 'OK', text: '运行机的 Lean hook 没问题：brain-kit 带的 lean-hook.py 是第 3 版，brain-run 的三个 hook 都对', todo: '', fix: null, repo: null, raw: '' }])
    const ok = screen.getByRole('region', { name: '运行机的 Lean hook' })
    expect(ok).toHaveClass('is-ok')
    expect(within(ok).getByText('正常')).toHaveClass('tone-ok')
    expect(ok).toHaveTextContent('brain-run 的三个 hook 都对')
    b.unmount()
    await show([])
    expect(screen.queryByRole('region', { name: '运行机的 Lean hook' })).toBeNull()
    expect(screen.queryByTestId('runner-hooks')).toBeNull()
  })

  test('what the bridge said about each labelled MR last round: waiting and unlabelled are looked at again next round', async () => {
    installFixtureRoutes()
    const { unmount } = render(<TeamPage {...props()} />)
    const ho = await screen.findByRole('region', { name: '交接' })
    const item = (r: string) => ho.querySelector(`[data-result="${r}"]`) as HTMLElement
    expect(item('waiting')).toHaveTextContent('正在别处签名')
    expect(item('waiting')).toHaveTextContent('下一轮再看')
    // the hand-over's commit on hover, not as text
    expect(item('waiting')).not.toHaveTextContent('9c1d2e3f4a5b')
    expect(item('waiting')).toHaveAttribute('title', '交接的提交 9c1d2e3f4a5b')
    expect(within(item('waiting')).getByRole('link', { name: /shop\/shop-pay!48/ })).toHaveAttribute('href', 'https://gitlab.example.com/shop/shop-pay/-/merge_requests/48')
    expect(item('unlabelled')).toHaveTextContent('标签刚被拿掉')
    expect(item('unlabelled')).toHaveTextContent('重新交接、再打一次标签时会这样')
    expect(item('error')).toHaveTextContent('这一轮没查成')
    expect(item('error')).toHaveTextContent(fx.team().handovers.find((h) => h.result === 'error')!.error) // its error instead of the hint
    expect(item('error')).not.toHaveTextContent('下一轮再试')
    // on the conveyor: dashed (looked at again next round); the belt ends at the runner, outside the part that wraps
    expect(item('waiting')).toHaveClass('kt-belt-chip', 'is-pending')
    expect(within(item('waiting')).getByText('正在别处签名')).toHaveClass('kt-pill', 'tone-hand')
    expect(ho.querySelector('.kt-belt-end.is-head')).toHaveTextContent('运行机')
    expect(ho.querySelector('.kt-belt .kt-belt-end')).toBeNull()
    expect(Object.keys(HANDOVER_RESULT).sort()).toEqual(['accepted', 'error', 'rejected', 'seen', 'unlabelled', 'waiting'])
    expect(handoverMeta('later')).toEqual({ label: 'later', tone: 'idle', hint: '' })
    unmount()
    const tv = fx.team()
    tv.handovers = []
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    expect(await screen.findByRole('region', { name: '交接' })).toHaveTextContent('上一轮没有打着交接标签的 MR')
  })

  test('brain-kit’s English (the bridge not set up, an MR it could not check) is said in words, the original folded', async () => {
    const tv = fx.team()
    tv.status = { ...tv.status, ok: false, error: "FileNotFoundError: [Errno 2] No such file or directory: 'bridge.json'" }
    tv.handovers = tv.handovers.map((h) => (h.result === 'error' ? { ...h, error: 'GitLab 502: Bad Gateway' } : h))
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    const err = await screen.findByTestId('team-error')
    expect(err).toHaveTextContent('桥没准备好做什么看设置里团队模式填的两个配置文件')
    expect((within(err).getByText('细节').closest('details') as HTMLDetailsElement).open).toBe(false)
    const chip = screen.getByRole('region', { name: '交接' }).querySelector('[data-result="error"]') as HTMLElement
    expect(chip).toHaveTextContent('没查成：原话在细节里')
    expect(within(chip).getByText('GitLab 502: Bad Gateway').closest('details')).not.toHaveAttribute('open')
  })

  test('a bridge that did not start: what is wrong and what to do in words; the file names and keys only under 细节', async () => {
    const tv = fx.team()
    const raw = 'bridge.json 不能写 signing_key：私钥只给签名服务（signer/），桥用 "signer": {"type": "spool", …} 请签名服务签'
    tv.status = { ...tv.status, ok: false, error: '桥的配置文件里写了私钥', error_todo: '把私钥从桥的配置文件里删掉：私钥只给签名服务，桥只把要签的东西交给签名服务', error_raw: raw }
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    const err = await screen.findByTestId('team-error')
    expect(err).toHaveTextContent('桥的配置文件里写了私钥做什么把私钥从桥的配置文件里删掉')
    const fold = within(err).getByText('细节').closest('details') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    expect(within(fold).getByText(raw)).toBeInTheDocument()
    // nothing of the file names or keys outside the fold
    const face = Array.from(err.childNodes).filter((n) => n !== fold).map((n) => n.textContent).join('')
    expect(face).not.toMatch(/bridge\.json|signing_key|signer|spool/)
  })

  test('the vouchers the signer did not answer last round are listed (asked for again next round); none, no heading', async () => {
    installFixtureRoutes()
    const { unmount } = render(<TeamPage {...props()} />)
    const signer = await screen.findByRole('region', { name: '签名' })
    expect(within(signer).getByRole('heading', { name: '上一轮没等到签名（下一轮再要同一张凭证）' })).toBeInTheDocument()
    const item = within(within(signer).getByTestId('signer-waiting')).getByRole('listitem')
    expect(item).toHaveTextContent('回答 D-2')
    expect(within(item).getByText('回答的凭证')).toHaveClass('br-tag')
    expect(item).toHaveTextContent('PAY-4 的第 1 次运行')
    expect(item).not.toHaveTextContent('RUN-PAY-4-1')
    expect(item).toHaveTextContent(fmtIso('2026-11-08T21:40:00+08:00'))
    unmount()
    const tv = fx.team()
    tv.signer.waiting = []
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    await screen.findByRole('region', { name: '签名' })
    expect(screen.queryByText(/上一轮没等到签名/)).toBeNull()
  })

  test('打开会话 opens the run’s session; a key opens the requirement on the runner', async () => {
    const user = userEvent.setup()
    installFixtureRoutes()
    const p = props()
    render(<TeamPage {...p} />)
    const runs = await screen.findByRole('region', { name: '运行' })
    await user.click(within(runs).getByRole('button', { name: '打开会话' }))
    expect(navigations).toEqual(['/chat?sid=brain-run-PAY-4-1'])
    await user.click(within(runs).getByRole('button', { name: 'PAY-5' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'item', repo: 'runner', key: 'PAY-5', from: 'team' })
  })

  test('现在跑一轮 posts /team/loop and says what the round did, step by step in words', async () => {
    const user = userEvent.setup()
    installFixtureRoutes({ [`POST ${API}/team/loop`]: () => ({ ok: true, summary: { poll: 2, prepared: 0, dispatch: 1, watch: 1, collect: 0, reconcile: 0 }, error: '' }) })
    const p = props()
    render(<TeamPage {...p} />)
    await screen.findByRole('region', { name: '运行' })
    await user.click(screen.getByRole('button', { name: '现在跑一轮' }))
    const result = await screen.findByTestId('loop-result')
    expect(result).toHaveTextContent('这一轮跑完了')
    expect(within(result).getAllByText(/ 个$/).map((t) => t.textContent)).toEqual(['看了 MR 2 个', '准备好工作区 0 个', '派给会话 1 个', '看了会话 1 个', '收回结果 0 个', '对了账 0 个'])
    expect(result).not.toHaveTextContent('poll')
    expect(apiCalls.some((c) => c.method === 'POST' && c.path === `${API}/team/loop`)).toBe(true)
    await waitFor(() => expect(p.reloadStatus).toHaveBeenCalled())
  })

  test('a round that failed a step says which, in words, what to do, and folds the error', async () => {
    const tv = fx.team()
    tv.status.loop_error = 'poll: GitLab 401 Unauthorized；collect: [Errno 2] No such file or directory'
    installFixtureRoutes({ [`GET ${API}/team`]: () => tv })
    render(<TeamPage {...props()} />)
    const err = await screen.findByTestId('loop-error')
    expect(err).toHaveTextContent('上一轮有一步没成：看 MR、收结果')
    expect(err).toHaveTextContent('做什么下一轮会自动再试')
    expect(within(err).getByText(tv.status.loop_error).closest('details')).not.toHaveAttribute('open')
  })

  test('not in team mode: it says so, how a runner works, the way to 设置, and asks for nothing', async () => {
    installFixtureRoutes()
    const p = props({ status: fx.status() })
    render(<TeamPage {...p} />)
    const hero = screen.getByTestId('team-off')
    expect(within(hero).getByText(/这台机器没开团队模式/)).toBeInTheDocument()
    for (const word of ['bridge.json', 'runnerd', 'brain-run']) expect(hero).not.toHaveTextContent(word)
    expect(within(hero).getAllByRole('listitem')).toHaveLength(5)
    // each step's words break only where a phrase ends (1050: 「MR 上回 / 答、验收」 broke inside a word): kept whole,
    // the last step's title is the two things done there, where in its line
    const last = within(hero).getAllByRole('listitem')[4]
    expect(last.querySelector('b')).toHaveTextContent(/^5回答、验收$/)
    expect(last.querySelector('small')?.textContent).toBe('在 MR 上，以\u00a0GitLab\u00a0身份')
    expect(document.querySelector('style')?.textContent).toContain('.tm-root .br-flow > li { word-break: keep-all;')
    await userEvent.setup().click(within(hero).getByRole('button', { name: '去设置' }))
    expect(p.go).toHaveBeenCalledWith({ kind: 'settings' })
    expect(apiCalls.filter((c) => c.path === `${API}/team`)).toHaveLength(0)
  })
})
