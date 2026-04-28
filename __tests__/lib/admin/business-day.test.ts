/**
 * business-day ユーティリティのテスト
 *
 * - getBusinessDayDate: businessDayStartMinutes による日付補正
 * - getBusinessDayYesterday: 業務日の前日
 */
import { describe, it, expect } from 'vitest'
import {
  getBusinessDayDate,
  getBusinessDayYesterday,
} from '@/lib/admin/business-day'

describe('getBusinessDayDate', () => {
  it('startMinutes=0 のとき、JST 午前 0 時以降は当日を返す', () => {
    // 2026-04-28 01:00 JST = 2026-04-27 16:00 UTC
    const now = new Date('2026-04-27T16:00:00.000Z')
    expect(getBusinessDayDate(now, 0)).toBe('2026-04-28')
  })

  it('startMinutes=360 (6:00) のとき、JST 5:59 は前日を返す', () => {
    // 2026-04-28 05:59 JST = 2026-04-27 20:59 UTC
    const now = new Date('2026-04-27T20:59:00.000Z')
    expect(getBusinessDayDate(now, 360)).toBe('2026-04-27')
  })

  it('startMinutes=360 (6:00) のとき、JST 6:00 は当日を返す', () => {
    // 2026-04-28 06:00 JST = 2026-04-27 21:00 UTC
    const now = new Date('2026-04-27T21:00:00.000Z')
    expect(getBusinessDayDate(now, 360)).toBe('2026-04-28')
  })

  it('startMinutes=0 のとき、JST 23:59 は当日を返す', () => {
    // 2026-04-28 23:59 JST = 2026-04-28 14:59 UTC
    const now = new Date('2026-04-28T14:59:00.000Z')
    expect(getBusinessDayDate(now, 0)).toBe('2026-04-28')
  })
})

describe('getBusinessDayYesterday', () => {
  it('業務日の前日を返す', () => {
    // 2026-04-28 10:00 JST = 2026-04-28 01:00 UTC → today=2026-04-28 → yesterday=2026-04-27
    const now = new Date('2026-04-28T01:00:00.000Z')
    expect(getBusinessDayYesterday(now, 0)).toBe('2026-04-27')
  })

  it('startMinutes=360 で業務日開始前なら today が前日扱い → yesterday はさらにその前日', () => {
    // 2026-04-28 05:00 JST → today=2026-04-27 → yesterday=2026-04-26
    const now = new Date('2026-04-27T20:00:00.000Z')
    expect(getBusinessDayYesterday(now, 360)).toBe('2026-04-26')
  })

  it('月初跨ぎ: 2026-05-01 → yesterday = 2026-04-30', () => {
    // 2026-05-01 10:00 JST = 2026-05-01 01:00 UTC
    const now = new Date('2026-05-01T01:00:00.000Z')
    expect(getBusinessDayYesterday(now, 0)).toBe('2026-04-30')
  })
})
