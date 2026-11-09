import { describe, expect, it } from 'vitest'
import { fx } from '../test/data'
import type { BeltItem, BoardEvent, ReqBoard } from '../types'
import { diffBoards, maxSeq } from './diff'

// board.json (PAY-3): the code-generation plan (PLAN) waits for the owner's approval. N is the seq of the first event
// the next poll brings.
const REQ = 'r1/PAY-3'
const AT = 1794146400
const N = maxSeq(fx.board()) + 1
const QUIET = { req: REQ, first: true, fresh: [], items: [], flashes: [], flips: [], belt: [], actors: [], announce: null }
const NOTHING = { ...QUIET, first: false }

function ev(over: Partial<BoardEvent> & Pick<BoardEvent, 'kind'>): BoardEvent {
  return { seq: N, at: AT, from: null, to: null, text: '', detail: false, src: null, ...over }
}

/** The next snapshot: a fresh copy of board.json with *change* made to it. */
function after(change: (b: ReqBoard) => void): ReqBoard {
  const b = fx.board()
  change(b)
  return b
}

function handedOver(b: ReqBoard) {
  b.row.state = 'handed_over'
  b.row.state_label = '已交接'
}

const actor = (b: ReqBoard, key: string) => b.actors.find((a) => a.key === key)!
const cell = (b: ReqBoard, id: string) => b.checks.cells.find((c) => c.id === id)!

describe('diffBoards: history, nothing animates', () => {
  it('the first snapshot', () => {
    expect(diffBoards(null, fx.board())).toEqual(QUIET)
  })

  it('a snapshot of another requirement before this one', () => {
    expect(diffBoards(fx.boardMerged(), fx.board())).toEqual(QUIET)
  })

  it('a resync (the page was hidden), however much changed meanwhile', () => {
    const next = after((b) => {
      b.events.push(ev({ kind: 'reject', from: 'person', to: 'design', text: '你退回了代码生成计划' }))
      cell(b, 'gate-PLAN').status = 'fail'
    })
    expect(diffBoards(fx.board(), next, { resync: true })).toEqual(QUIET)
  })

  it('events that went backwards (a restart)', () => {
    expect(diffBoards(fx.board(), after((b) => void (b.events = b.events.slice(0, N - 2))))).toEqual(QUIET)
  })
})

describe('diffBoards: one poll', () => {
  it('the same snapshot again: nothing fresh, nothing moves, nothing said', () => {
    expect(diffBoards(fx.board(), fx.board())).toEqual(NOTHING)
  })

  it('only events after the last seen seq are fresh, in seq order', () => {
    const next = after((b) => b.events.push(ev({ seq: N + 1, at: AT + 1, kind: 'stage', from: 'local', to: 'local' }), ev({ kind: 'stage', from: 'local', to: 'local' })))
    expect(diffBoards(fx.board(), next).fresh.map((e) => e.seq)).toEqual([N, N + 1])
  })

  it('a fresh approval is a comet from 你 to its approval, with its word', () => {
    const d = diffBoards(fx.board(), after((b) => b.events.push(ev({ kind: 'approve', from: 'person', to: 'design', text: '你批准了代码生成计划' }))))
    expect(d.items).toEqual([{ key: `${REQ}#${N}`, t: AT, kind: 'approve', from: 'orch', to: 'design', tone: 'pass', shape: 'comet', prio: 3, label: '批准' }])
    expect(d.flashes).toEqual([])
  })

  it('a Lean stage is a spark on its node', () => {
    const d = diffBoards(fx.board(), after((b) => b.events.push(ev({ kind: 'stage', from: 'local', to: 'local', text: '做完「代码生成（refund-api）」' }))))
    expect(d.items).toEqual([{ key: `${REQ}#${N}`, t: AT, kind: 'stage', from: 'local', to: 'local', tone: 'tool', shape: 'spark', prio: 0 }])
  })

  it('an event with no place on the graph is fresh but flies nothing', () => {
    const e = ev({ kind: 'app', text: '看板刷新' })
    const d = diffBoards(fx.board(), after((b) => b.events.push(e)))
    expect(d.fresh).toEqual([e])
    expect(d.items).toEqual([])
    expect(d.flashes).toEqual([])
  })

  it('a 退回 bounces to its approval and flashes it red', () => {
    const d = diffBoards(fx.board(), after((b) => b.events.push(ev({ kind: 'reject', from: 'person', to: 'design', text: '你退回了代码生成计划' }))))
    expect(d.items).toEqual([{ key: `${REQ}#${N}`, t: AT, kind: 'reject', from: 'orch', to: 'design', tone: 'bounce', shape: 'comet', prio: 3, label: '退回' }])
    expect(d.flashes).toEqual([{ key: `${REQ}#${N}`, target: 'design', tone: 'bad', kind: 'reject' }])
  })

  it('a blocked tool call is a cross on the node it happened on, which flashes red', () => {
    const d = diffBoards(fx.board(), after((b) => b.events.push(ev({ kind: 'blocked', from: 'local', to: 'local', text: 'Lean 拦下了写 src/refund/api.py' }))))
    expect(d.items).toEqual([{ key: `${REQ}#${N}`, t: AT, kind: 'blocked', from: 'local', to: 'local', tone: 'danger', shape: 'cross', prio: 2 }])
    expect(d.flashes).toEqual([{ key: `${REQ}#${N}`, target: 'local', tone: 'bad', kind: 'blocked' }])
  })

  it('a failed verify flies from the run branch to the checks with its score and flashes them red', () => {
    const d = diffBoards(fx.board(), after((b) => b.events.push(ev({ kind: 'verify', from: 'branch', to: 'checks', text: 'verify 没过：pytest' }))))
    // board.json has one verify cell, not passed yet
    expect(d.items).toEqual([{ key: `${REQ}#${N}`, t: AT, kind: 'verify', from: 'run', to: 'tests', tone: 'fail', shape: 'comet', prio: 3, label: '0/1' }])
    expect(d.flashes).toEqual([{ key: `${REQ}#${N}`, target: 'tests', tone: 'bad', kind: 'verify' }])
  })

  it('a passing verify is green, carries the score, and flashes nothing red', () => {
    const next = after((b) => {
      cell(b, 'verify').status = 'pass'
      b.events.push(ev({ kind: 'verify', from: 'branch', to: 'checks', text: 'verify 通过：1 项都过了' }))
    })
    const d = diffBoards(fx.board(), next)
    expect(d.items).toEqual([expect.objectContaining({ from: 'run', to: 'tests', tone: 'pass', label: '1/1' })])
    expect(d.flashes).toEqual([])
  })

  it('an event more than lateS older than the snapshot is fresh but does not fly or flash', () => {
    const reject = (at: number) => ev({ at, kind: 'reject', from: 'person', to: 'design', text: '你退回了代码生成计划' })
    const late = diffBoards(fx.board(), after((b) => b.events.push(reject(AT - 31))), { at: AT, lateS: 30 })
    expect(late.fresh.map((e) => e.seq)).toEqual([N])
    expect(late.items).toEqual([])
    expect(late.flashes).toEqual([])
    const justInTime = diffBoards(fx.board(), after((b) => b.events.push(reject(AT - 30))), { at: AT, lateS: 30 })
    expect(justInTime.items.map((i) => i.key)).toEqual([`${REQ}#${N}`])
    expect(justInTime.flashes).toHaveLength(1)
  })

  it('over max items the most important stay, in the order they happened', () => {
    const next = after((b) => b.events.push(
      ev({ seq: N, at: AT, kind: 'commit', from: 'local', to: 'branch', text: '提交 1a2b3c4d：PAY-3：导出' }), // prio 2
      ev({ seq: N + 1, at: AT + 1, kind: 'stage', from: 'local', to: 'local', text: '做完「代码生成」' }), // prio 0
      ev({ seq: N + 2, at: AT + 2, kind: 'approve', from: 'person', to: 'design', text: '你批准了代码生成计划' }), // prio 3
    ))
    const d = diffBoards(fx.board(), next, { max: 2 })
    expect(d.fresh).toHaveLength(3)
    expect(d.items.map((i) => [i.key, i.prio])).toEqual([[`${REQ}#${N}`, 2], [`${REQ}#${N + 2}`, 3]])
  })

  it('the merge flashes every merged actor and the run branch green, once', () => {
    const next = after((b) => {
      b.ended_at = AT
      actor(b, 'design').status = 'merged'
    })
    expect(diffBoards(fx.board(), next).flashes).toEqual([
      { key: `${REQ}#merged`, target: 'req', tone: 'ok', kind: 'merge' },
      { key: `${REQ}#merged`, target: 'design', tone: 'ok', kind: 'merge' },
      { key: `${REQ}#merged-run`, target: 'run', tone: 'ok', kind: 'merge' },
    ])
    expect(diffBoards(next, after((b) => void (b.ended_at = AT))).flashes).toEqual([])
  })

  it('checks that turn all green flash the check ring', () => {
    const next = after((b) => Object.assign(b.checks, { passed: 4, failed: 0, total: 4, at: AT }))
    expect(diffBoards(fx.board(), next).flashes).toEqual([{ key: `${REQ}#green@${AT}`, target: 'tests', tone: 'ok', kind: 'verify' }])
  })

  it('a check cell whose status changed flips; a new cell does not', () => {
    const next = after((b) => {
      cell(b, 'gate-PLAN').status = 'pass'
      b.checks.cells.push({ ...cell(b, 'verify'), id: 'verify-ruff-1', status: 'pass', at: AT })
    })
    expect(diffBoards(fx.board(), next).flips).toEqual([{ id: 'gate-PLAN', from: 'wait', to: 'pass' }])
  })

  it('an actor whose status changed is listed with from and to', () => {
    const d = diffBoards(fx.board(), after((b) => void (actor(b, 'design').status = 'merged')))
    expect(d.actors).toEqual([{ key: 'design', from: 'awaiting_approval', to: 'merged' }])
  })

  it('a new commit on the conveyor is listed by its belt key, the old ones are not', () => {
    const commit: BeltItem = { kind: 'commit', at: AT, sha: 'abcdef123456', by: 'person', text: 'PAY-3：导出按钮', files: 2, records_only: false, actor: 'local' }
    expect(diffBoards(fx.board(), after((b) => b.belt.push(commit))).belt).toEqual(['commit@abcdef123456@1794146400'])
  })
})

describe('diffBoards: what the live region says', () => {
  it('the requirement changing state', () => {
    const next = after(handedOver)
    expect(diffBoards(fx.board(), next).announce).toBe('需求已交接')
  })

  it('the checks changing, before → after', () => {
    const next = after((b) => void (b.checks.passed = 3))
    expect(diffBoards(fx.board(), next).announce).toBe('检查 2/4 → 3/4')
  })

  it('the latest loud event, in its own words', () => {
    const next = after((b) => b.events.push(
      ev({ seq: N, kind: 'question', from: 'local', to: 'person', text: '停下问你：导出的时区' }),
      ev({ seq: N + 1, at: AT + 1, kind: 'request', from: 'local', to: 'design', text: '请你批准代码生成计划（PLAN · 9c0ffee1）' }),
    ))
    expect(diffBoards(fx.board(), next).announce).toBe('请你批准代码生成计划（PLAN · 9c0ffee1）')
  })

  it('a calm event when there is room for it, after the loud one', () => {
    const calm = diffBoards(fx.board(), after((b) => b.events.push(ev({ kind: 'approve', from: 'person', to: 'design', text: '你批准了代码生成计划' }))))
    expect(calm.announce).toBe('你批准了代码生成计划')
    const both = diffBoards(fx.board(), after((b) => b.events.push(
      ev({ seq: N, kind: 'approve', from: 'person', to: 'design', text: '你批准了代码生成计划' }),
      ev({ seq: N + 1, at: AT + 1, kind: 'question', from: 'local', to: 'person', text: '停下问你：导出的时区' }),
    )))
    expect(both.announce).toBe('停下问你：导出的时区；你批准了代码生成计划')
  })

  it('two things at most, in order: the state, the checks, the loud event', () => {
    const next = after((b) => {
      handedOver(b)
      b.checks.passed = 3
      b.events.push(ev({ kind: 'reject', from: 'person', to: 'design', text: '你退回了代码生成计划' }))
    })
    expect(diffBoards(fx.board(), next).announce).toBe('需求已交接；检查 2/4 → 3/4')
  })

  it('nothing for events nobody needs to be told about', () => {
    const next = after((b) => b.events.push(
      ev({ seq: N, kind: 'stage', from: 'local', to: 'local', text: '做完「代码生成」' }),
      ev({ seq: N + 1, at: AT + 1, kind: 'commit', from: 'local', to: 'branch', text: '提交 1a2b3c4d：PAY-3：导出' }),
    ))
    const d = diffBoards(fx.board(), next)
    expect(d.fresh).toHaveLength(2)
    expect(d.announce).toBeNull()
  })
})
