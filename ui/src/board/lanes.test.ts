import { describe, expect, it } from 'vitest'
import type { TestCase } from '../types'
import { axisSpan, axisTicks, groupCases } from './Lanes'

const tc = (id: string, ac: string | null, status: TestCase['status']): TestCase => ({ id, ac, name: `${ac ?? id}: 用例 ${id}`, file: 'tests/api-x.test.js', status, owner: 'backend', ms: 1, message: status === 'fail' ? 'expected 409' : null })

describe('owned tests on a role card', () => {
  it('one chip per criterion, red when any of its cases fails, with the case count', () => {
    const g = groupCases([tc('a', 'AC-1', 'pass'), tc('b', 'AC-1', 'fail'), tc('c', 'AC-1', 'pass'), tc('d', 'AC-2', 'pass'), tc('e', null, 'skip')])
    expect(g.map((x) => [x.key, x.status, x.count])).toEqual([['AC-1', 'fail', 3], ['AC-2', 'pass', 1], ['e: 用例 e', 'skip', 1]])
    expect(g[0].titles[1]).toBe('✗ AC-1: 用例 b：expected 409')
  })
})


it('a live run\'s time axis is a round span that grows in steps, so bars grow left to right and ticks stay put', () => {
  expect(axisSpan(33, false)).toBe(600) // 33 s in: a 10-minute axis, not a 33-second one
  expect(axisSpan(600, false)).toBe(600)
  expect(axisSpan(601, false)).toBe(900)
  expect(axisSpan(25 * 60, false)).toBe(30 * 60)
  expect(axisSpan(5 * 3600, false)).toBe(5 * 3600)
  expect(axisSpan(703, true)).toBe(703) // an ended run: its own length
})

it('the axis ticks are round minutes', () => {
  expect(axisTicks(600)).toEqual([0, 120, 240, 360, 480, 600])
  expect(axisTicks(900)).toEqual([0, 300, 600, 900])
  expect(axisTicks(703)).toEqual([0, 120, 240, 360, 480, 600])
  expect(axisTicks(90)).toEqual([0, 30, 60, 90])
})
