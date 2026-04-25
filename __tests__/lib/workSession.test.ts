import { describe, it, expect } from 'vitest'
import { getCurrentWorkSession } from '@/lib/workSession'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

describe('getCurrentWorkSession (Phase 1: 過去 24h スライディングウィンドウ)', () => {
  it('end が指定した now と一致する', () => {
    const now = new Date('2026-04-21T12:34:56.000Z')
    const { end } = getCurrentWorkSession('user-1', now)
    expect(end.getTime()).toBe(now.getTime())
  })

  it('start が now から正確に 24 時間前である', () => {
    const now = new Date('2026-04-21T12:34:56.000Z')
    const { start } = getCurrentWorkSession('user-1', now)
    expect(start.getTime()).toBe(now.getTime() - ONE_DAY_MS)
  })

  it('end - start がちょうど 86,400,000 ms である', () => {
    const now = new Date('2026-04-21T00:00:00.000Z')
    const { start, end } = getCurrentWorkSession('user-1', now)
    expect(end.getTime() - start.getTime()).toBe(ONE_DAY_MS)
  })

  it('now を省略した場合も 24h 差のウィンドウを返す', () => {
    const before = Date.now()
    const { start, end } = getCurrentWorkSession('user-1')
    const after = Date.now()
    expect(end.getTime()).toBeGreaterThanOrEqual(before)
    expect(end.getTime()).toBeLessThanOrEqual(after)
    expect(end.getTime() - start.getTime()).toBe(ONE_DAY_MS)
  })

  it('userId の内容によって結果が変わらない（Phase 1）', () => {
    const now = new Date('2026-04-21T12:00:00.000Z')
    const a = getCurrentWorkSession('user-a', now)
    const b = getCurrentWorkSession('user-b', now)
    expect(a.start.getTime()).toBe(b.start.getTime())
    expect(a.end.getTime()).toBe(b.end.getTime())
  })

  it('返り値は Date インスタンスである', () => {
    const now = new Date('2026-04-21T12:00:00.000Z')
    const { start, end } = getCurrentWorkSession('user-1', now)
    expect(start).toBeInstanceOf(Date)
    expect(end).toBeInstanceOf(Date)
  })

  it('境界値: now ちょうどの時刻 (ミリ秒単位で一致)', () => {
    const now = new Date(1_700_000_000_000)
    const { start, end } = getCurrentWorkSession('user-1', now)
    expect(end.getTime()).toBe(1_700_000_000_000)
    expect(start.getTime()).toBe(1_700_000_000_000 - ONE_DAY_MS)
  })
})
