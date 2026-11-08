import { describe, expect, it } from 'vitest'
import { ago, fmtAgo, fmtCredits, fmtIso, fmtRate, fmtSpan, isoDay, lines } from './format'
import { errorStatus, errorText } from './api'

describe('format', () => {
  it('formats spans and ages', () => {
    expect(fmtSpan(45)).toBe('45 秒')
    expect(fmtSpan(1400)).toBe('23 分钟')
    expect(fmtSpan(3900)).toBe('1 小时 5 分')
    expect(fmtAgo(2)).toBe('刚刚')
    expect(fmtAgo(31)).toBe('31 秒前')
    expect(fmtAgo(185)).toBe('3 分钟前')
    expect(fmtAgo(5 * 3600)).toBe('5 小时前')
    expect(fmtAgo(3 * 86400)).toBe('3 天前')
    expect(ago(1000, 1360)).toBe('6 分钟前')
    expect(ago(null)).toBe('—')
  })

  it('formats credits and rates', () => {
    expect(fmtCredits(null)).toBe('—')
    expect(fmtCredits(66.5)).toBe('66.5')
    expect(fmtCredits(12)).toBe('12.0')
    expect(fmtCredits(231.4)).toBe('231')
    expect(fmtRate([5, 8])).toEqual({ frac: '5/8', pct: '63%' })
    expect(fmtRate([0, 0])).toEqual({ frac: '0/0', pct: '—' })
  })

  it('reads ISO times and textarea lines', () => {
    expect(isoDay(null)).toBeNull()
    expect(isoDay('not a time')).toBeNull()
    expect(isoDay('2026-11-08T12:00:00+08:00')).toMatch(/^2026-11-0[78]$/)
    expect(fmtIso('garbage')).toBe('garbage')
    expect(lines(' a \n\n b\n')).toEqual(['a', 'b'])
  })
})

describe('errorText: the SDK rejects with `API <status>: <body>`', () => {
  it('says the backend’s own error, or what the status means', () => {
    expect(errorText(new Error('API 409: {"error": "PAY-3 已经有人认领了", "code": "claimed"}'))).toBe('PAY-3 已经有人认领了（409）')
    expect(errorText(new Error('API 401: '))).toBe('需要登录 KiroCrew dashboard（401）')
    expect(errorText(new Error('API 403: nope'))).toBe('没有权限：只接受 dashboard 主人本人的请求（403）')
    expect(errorText(new Error('API 404: Not Found'))).toBe('后端还没有这个接口（404）')
    expect(errorText(new Error('API 500: boom'))).toBe('请求失败（500）：boom')
    expect(errorText(new Error('Failed to fetch'))).toBe('Failed to fetch')
    expect(errorStatus(new Error('API 502: x'))).toBe(502)
    expect(errorStatus('nothing')).toBe(0)
  })
})
