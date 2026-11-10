import { describe, expect, it } from 'vitest'
import { ago, fmtAgo, fmtCredits, fmtIso, fmtRate, fmtSpan, isoDay, lines, splitPaths } from './format'
import { errorRaw, errorStatus, errorText, httpProblem } from './api'

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

  it('splits a paths box on new lines, commas (，、 too) and whitespace', () => {
    expect(splitPaths('calc.py, tests')).toEqual(['calc.py', 'tests'])
    expect(splitPaths(' src/a/\nsrc/b.py，src/c、src/d\tsrc/e,,\n')).toEqual(['src/a/', 'src/b.py', 'src/c', 'src/d', 'src/e'])
    expect(splitPaths('  \n ')).toEqual([])
  })
})

describe('errorText: the SDK rejects with `API <status>: <body>`', () => {
  it('says the backend’s own Chinese words, or what the status means; never English', () => {
    expect(errorText(new Error('API 409: {"error": "PAY-3 已经有人认领了", "code": "claimed"}'))).toBe('PAY-3 已经有人认领了（409）')
    expect(errorText(new Error('API 403: {"error": "这些接口只接受 dashboard 主人本人的请求", "code": "owner_only"}'))).toBe('这些接口只接受 dashboard 主人本人的请求（403）')
    // KiroCrew's host when the dashboard login is gone
    expect(errorText(new Error('API 403: {"error": "Token required"}'))).toBe('登录过期了（403）')
    expect(errorText(new Error('API 401: '))).toBe('登录过期了（401）')
    expect(errorText(new Error('API 404: Not Found'))).toBe('app 的后端和页面版本对不上（404）')
    expect(errorText(new Error('API 500: boom'))).toBe('app 的后端出错了（500）')
    expect(errorText(new Error('API 502: 网关没回话'))).toBe('网关没回话（502）')
    expect(errorText(new TypeError('Failed to fetch'))).toBe('连不上 app 的后端')
    expect(errorText(new TypeError('Load failed'))).toBe('连不上 app 的后端')
    expect(errorText(new Error('读不到进度'))).toBe('读不到进度')
    expect(errorRaw(new Error('API 403: {"error": "Token required"}'))).toBe('API 403: {"error": "Token required"}')
    expect(errorStatus(new Error('API 502: x'))).toBe(502)
    expect(errorStatus('nothing')).toBe(0)
  })
  it('says what to do for a status: the login, no answer, the version, the backend', () => {
    expect(httpProblem(403)).toEqual({ text: '登录过期了', todo: '重新打开 KiroCrew 仪表盘，登录以后点「再试一次」' })
    expect(httpProblem(401).text).toBe('登录过期了')
    expect(httpProblem(0).text).toBe('连不上 app 的后端')
    expect(httpProblem(404).text).toBe('app 的后端和页面版本对不上')
    expect(httpProblem(503).text).toBe('app 的后端出错了')
  })
})
