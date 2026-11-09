import { describe, expect, it } from 'vitest'
import { fx } from '../test/data'
import type { ReqBoard } from '../types'
import { GAP_S, replayAt, replayClock, replaySpan } from './timeline'

// board-merged.json (PAY-2): claimed at START, merged at MERGE, written back into the Brain at END (its last event)
const START = 1793620800
const BEGIN = 1793628000 // 开工, two quiet hours after the claim
const MERGE = 1793661540
const END = 1793715540
const RELEASE_ASKED = 1793655180
const RELEASE_OK = 1793659500
const VERIFY_OK = 1793654580

/** What only grows while a replay plays forward. */
function counts(r: ReqBoard) {
  return {
    events: r.events.length,
    belt: r.belt.length,
    passed: r.checks.passed,
    rounds: r.checks.history.length,
    started: r.actors.filter((a) => a.status !== 'waiting').length,
    spans: r.actors.reduce((n, a) => n + a.spans.length, 0),
    closed: r.actors.reduce((n, a) => n + a.spans.filter((s) => s.b !== null).length, 0),
    marks: r.actors.reduce((n, a) => n + a.marks.length, 0),
  }
}

/** A board with nothing on record: no events, never started. */
function noTrace(): ReqBoard {
  const b = fx.board()
  b.events = []
  b.started_at = null
  b.ended_at = null
  return b
}

describe('replaySpan', () => {
  it('runs from the claim to the last event, which may come after the merge (the 回写)', () => {
    const b = fx.boardMerged()
    expect(b.ended_at).toBe(MERGE)
    expect(replaySpan(b)).toEqual({ start: START, end: END })
  })

  it('ends at the last event of a requirement still going (not at the snapshot time)', () => {
    const b = fx.board()
    expect(replaySpan(b)).toEqual({ start: 1794038400, end: 1794146040 })
    expect(b.at).toBe(1794146400)
  })

  it('starts at started_at when that is before the first event', () => {
    const b = fx.boardMerged()
    b.started_at = START - 600
    expect(replaySpan(b).start).toBe(START - 600)
  })

  it('a board with nothing on record gets a one-second span at its snapshot time', () => {
    const b = noTrace()
    expect(replaySpan(b)).toEqual({ start: b.at, end: b.at + 1 })
  })
})

describe('replayClock', () => {
  it('cuts every quiet gap to GAP_S: the two hours before 开工 and the 15 hours after the merge', () => {
    const clk = replayClock(fx.boardMerged())
    expect(clk.toPlay(START)).toBe(0)
    expect(clk.toPlay(BEGIN)).toBe(GAP_S)
    expect(clk.toPlay(END) - clk.toPlay(MERGE)).toBe(GAP_S)
    expect(clk.total).toBe(22080)
    expect(clk.total).toBeLessThan(END - START)
  })

  it('plays each step between two events as its real length, at most GAP_S', () => {
    const b = fx.boardMerged()
    const clk = replayClock(b)
    const ats = [...new Set(b.events.map((e) => e.at))].sort((x, y) => x - y)
    for (let i = 1; i < ats.length; i++) expect(clk.toPlay(ats[i]) - clk.toPlay(ats[i - 1])).toBeCloseTo(Math.min(ats[i] - ats[i - 1], GAP_S), 6)
  })

  it('is clamped at the span\'s ends both ways', () => {
    const clk = replayClock(fx.boardMerged())
    expect(clk.toPlay(START - 3600)).toBe(0)
    expect(clk.toPlay(END + 3600)).toBe(clk.total)
    expect(clk.toReal(-5)).toBe(START)
    expect(clk.toReal(0)).toBe(START)
    expect(clk.toReal(clk.total)).toBe(END)
    expect(clk.toReal(clk.total + 5)).toBe(END)
  })

  it('toReal undoes toPlay at every event', () => {
    const b = fx.boardMerged()
    const clk = replayClock(b)
    for (const e of b.events) expect(clk.toReal(clk.toPlay(e.at))).toBeCloseTo(e.at, 3)
  })

  it('played at 1×, 2× and 4×, the board time only moves forward, a faster speed is never behind, and it stops at the end', () => {
    const clk = replayClock(fx.boardMerged())
    const rate = clk.total / 60 // the whole requirement in about a minute at 1×
    const at = (elapsed: number, speed: number) => clk.toReal(elapsed * speed * rate)
    for (const speed of [1, 2, 4]) {
      let last = -Infinity
      for (let e = 0; e <= 70; e += 0.25) {
        const t = at(e, speed)
        expect(t).toBeGreaterThanOrEqual(last)
        expect(t).toBeGreaterThanOrEqual(START)
        expect(t).toBeLessThanOrEqual(END)
        if (speed > 1) expect(t).toBeGreaterThanOrEqual(at(e, speed / 2))
        last = t
      }
      expect(at(60 / speed, speed)).toBe(END)
      expect(at(70, speed)).toBe(END)
    }
  })

  it('with no cap on gaps it is the real time from the start', () => {
    const clk = replayClock(fx.boardMerged(), Infinity)
    expect(clk.total).toBe(END - START)
    expect(clk.toPlay(MERGE)).toBe(MERGE - START)
    expect(clk.toReal(MERGE - START)).toBe(MERGE)
  })

  it('a board with nothing on record plays one second, at finite times', () => {
    const b = noTrace()
    const clk = replayClock(b)
    expect(clk.total).toBe(1)
    expect(clk.toReal(0.5)).toBe(b.at + 0.5)
    expect(clk.toReal(clk.total)).toBe(b.at + 1)
  })
})

describe('replayAt', () => {
  it('at the start nothing has happened yet but the claim', () => {
    const b = fx.boardMerged()
    const r = replayAt(b, START)
    expect(r.events.map((e) => [e.seq, e.kind])).toEqual([[1, 'claim']])
    expect(r.belt).toEqual([])
    for (const a of r.actors)
      expect({ key: a.key, status: a.status, doing: a.doing, since: a.since, spans: a.spans, marks: a.marks })
        .toEqual({ key: a.key, status: 'waiting', doing: '还没轮到', since: null, spans: [], marks: [] })
    expect(r.checks.cells.map((c) => [c.status, c.at, c.detail])).toEqual(b.checks.cells.map(() => ['skip', null, '还没到这一步']))
    expect(r.checks).toMatchObject({ passed: 0, failed: 0, total: 0, at: null, history: [] })
    expect(r.person).toMatchObject({ status: 'waiting', doing: '没有等你的事' })
    expect(r.live).toBe(false)
    expect(r.ended_at).toBeNull()
    expect(r.accept.state).toBe('not_yet')
  })

  it('before its first change an actor that still waits keeps its own line; one that moves on later says the plain words', () => {
    const b = fx.board()
    const r = replayAt(b, replaySpan(b).start)
    const still = b.actors.filter((a) => a.status === 'waiting')
    expect(still.map((a) => a.key)).toEqual(['handover', 'bridge', 'signer', 'runner', 'ci', 'release', 'reflect'])
    for (const a of still) expect(r.actors.find((x) => x.key === a.key)).toMatchObject({ status: 'waiting', doing: a.doing, since: null })
    for (const a of b.actors.filter((x) => x.status !== 'waiting')) expect(r.actors.find((x) => x.key === a.key)).toMatchObject({ status: 'waiting', doing: '还没轮到', since: null })
  })

  it('before the start not even the claim is there', () => {
    expect(replayAt(fx.boardMerged(), START - 60).events).toEqual([])
  })

  it('at and after the end it is the final board itself', () => {
    const b = fx.boardMerged()
    expect(replayAt(b, END)).toBe(b)
    expect(replayAt(b, END + 3600)).toBe(b)
  })

  it('a moment before the end, the rebuilt record is the final one: events, conveyor, lanes, decided checks', () => {
    const b = fx.boardMerged()
    b.ended_at = END + 60 // the span now ends a minute after the last event
    const r = replayAt(b, END + 59)
    expect(r).not.toBe(b)
    expect(r.events).toEqual(b.events)
    expect(r.belt).toEqual(b.belt)
    expect(r.checks.history).toEqual(b.checks.history)
    const lane = (x: ReqBoard['actors'][number]) => ({ key: x.key, status: x.status, doing: x.doing, since: x.since, spans: x.spans, marks: x.marks })
    expect(r.actors.map(lane)).toEqual(b.actors.map(lane))
    expect(r.checks.cells.filter((c) => c.at !== null)).toEqual(b.checks.cells.filter((c) => c.at !== null))
  })

  it('only moves forward: sampled across the span, nothing done is ever undone, and it ends on the final board', () => {
    const b = fx.boardMerged()
    const clk = replayClock(b)
    const N = 80
    let prev = counts(replayAt(b, clk.toReal(0)))
    for (let i = 1; i <= N; i++) {
      const now = counts(replayAt(b, clk.toReal((clk.total * i) / N)))
      for (const k of Object.keys(now) as (keyof typeof now)[]) expect(now[k], `${k} at sample ${i}`).toBeGreaterThanOrEqual(prev[k])
      prev = now
    }
    expect(prev).toEqual(counts(b))
    expect(prev).toMatchObject({ events: 49, belt: 11, passed: 9, rounds: 2 })
  })

  it('shows a check cell only once it is decided, with its final status', () => {
    const b = fx.boardMerged()
    const verify = (r: ReqBoard) => r.checks.cells.filter((c) => c.group === 'verify').map((c) => c.status)
    const before = replayAt(b, VERIFY_OK - 1)
    expect(verify(before)).toEqual(['skip', 'skip', 'skip'])
    expect(before.checks).toMatchObject({ passed: 4, failed: 0, total: 4, at: 1793639460, history: [{ at: 1793652660, passed: 2, failed: 1 }] })
    const after = replayAt(b, VERIFY_OK)
    expect(verify(after)).toEqual(['pass', 'pass', 'pass'])
    expect(after.checks).toMatchObject({ passed: 7, total: 7, at: VERIFY_OK })
    expect(after.checks.history).toHaveLength(2)
  })

  it('shows an undated cell that waits for a person only while its actor waits for one', () => {
    const b = fx.board()
    b.events.push({ seq: 22, at: b.at, kind: 'app', from: null, to: null, text: '看板刷新', detail: false, src: null })
    const plan = (r: ReqBoard) => r.checks.cells.find((c) => c.id === 'gate-PLAN')
    const waiting = replayAt(b, 1794146100)
    expect(waiting.actors.find((a) => a.key === 'design')?.status).toBe('awaiting_approval')
    expect(plan(waiting)).toEqual(plan(b))
    expect(plan(waiting)?.status).toBe('wait')
    const earlier = replayAt(b, 1794100000)
    expect(earlier.actors.find((a) => a.key === 'design')?.status).toBe('merged')
    expect(plan(earlier)).toMatchObject({ status: 'skip', at: null, detail: '还没到这一步' })
  })

  it('glows while an actor is at work, and the person is told the AI is on it', () => {
    const r = replayAt(fx.boardMerged(), 1793640000)
    expect(r.actors.find((a) => a.key === 'runner')?.status).toBe('running')
    expect(r.live).toBe(true)
    expect(r.person).toMatchObject({ status: 'running', doing: 'AI 在做' })
  })

  it('while 发布 waits for its approval, the person waits with its words and 验收 waits too', () => {
    const r = replayAt(fx.boardMerged(), RELEASE_ASKED + 20)
    expect(r.actors.find((a) => a.key === 'release')).toMatchObject({ status: 'awaiting_approval', doing: '等人在 MR 上批准发布', since: RELEASE_ASKED })
    expect(r.person).toMatchObject({ status: 'awaiting_approval', doing: '等人在 MR 上批准发布' })
    expect(r.accept.state).toBe('waiting')
  })

  it('验收 is accepted once 发布 is approved', () => {
    const b = fx.boardMerged()
    expect(replayAt(b, RELEASE_OK - 1).accept.state).toBe('waiting')
    expect(replayAt(b, RELEASE_OK).accept.state).toBe('accepted')
  })

  it('offers nothing to do: no line to type, no step, no facts or credits', () => {
    for (const [b, t] of [[fx.board(), 1794100000], [fx.boardMerged(), RELEASE_OK + 60]] as const) {
      const r = replayAt(b, t)
      expect(r.actors.map((a) => [a.line, a.facts, a.credits])).toEqual(r.actors.map(() => [null, [], null]))
      expect(r.accept.step).toEqual({ text: '', who: '', line: null, mr_url: null, session_url: null })
      expect(r.accept.done).toBeNull()
    }
  })
})
