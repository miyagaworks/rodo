import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dispatch: {
      findMany: vi.fn(),
    },
  },
}))

import { GET } from '@/app/api/admin/calendar/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindMany = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>

function adminSession() {
  return { user: { userId: 'u-admin', tenantId: 't1', role: 'ADMIN' } }
}

function makeRequest(qs = '') {
  return new Request(`http://localhost/api/admin/calendar${qs}`)
}

describe('GET /api/admin/calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未認証は 401', async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('?year=2026&month=4'))
    expect(res.status).toBe(401)
  })

  it('MEMBER は 403', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u', tenantId: 't1', role: 'MEMBER' },
    })
    const res = await GET(makeRequest('?year=2026&month=4'))
    expect(res.status).toBe(403)
  })

  it('year/month が不正なら 400', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const res = await GET(makeRequest('?year=2026&month=13'))
    expect(res.status).toBe(400)
  })

  it('year/month 欠落も 400', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const res = await GET(makeRequest(''))
    expect(res.status).toBe(400)
  })

  it('指定月の全日 (4月=30日) を返す', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    const res = await GET(makeRequest('?year=2026&month=4'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.year).toBe(2026)
    expect(json.month).toBe(4)
    expect(json.days).toHaveLength(30)
    expect(json.days[0].date).toBe('2026-04-01')
    expect(json.days[29].date).toBe('2026-04-30')
    json.days.forEach((d: { totalCount: number; unprocessedCount: number }) => {
      expect(d.totalCount).toBe(0)
      expect(d.unprocessedCount).toBe(0)
    })
  })

  it('JST 月境界: dispatchTime が JST で月内 → 該当日に集計', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    // 2026-04-15 12:00 JST = 2026-04-15 03:00 UTC
    mockedFindMany.mockResolvedValueOnce([
      {
        dispatchTime: new Date('2026-04-15T03:00:00Z'),
        billedAt: new Date('2026-04-20T00:00:00Z'),
        isDraft: false,
        report: { isDraft: false },
      },
    ])

    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day15 = json.days.find((d: { date: string }) => d.date === '2026-04-15')
    expect(day15.totalCount).toBe(1)
    expect(day15.unprocessedCount).toBe(0) // billed なので未処理ではない
  })

  it('未請求 (billedAt=null) は unprocessedCount に加算される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([
      {
        dispatchTime: new Date('2026-04-10T03:00:00Z'),
        billedAt: null,
        isDraft: false,
        report: { isDraft: false },
      },
    ])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day10 = json.days.find((d: { date: string }) => d.date === '2026-04-10')
    expect(day10.totalCount).toBe(1)
    expect(day10.unprocessedCount).toBe(1)
  })

  it('報告書下書き (report.isDraft=true) も unprocessedCount に加算される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([
      {
        dispatchTime: new Date('2026-04-12T03:00:00Z'),
        billedAt: new Date(),
        isDraft: false,
        report: { isDraft: true },
      },
    ])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day12 = json.days.find((d: { date: string }) => d.date === '2026-04-12')
    expect(day12.totalCount).toBe(1)
    expect(day12.unprocessedCount).toBe(1)
  })

  it('複数案件が同じ日に集計される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([
      {
        dispatchTime: new Date('2026-04-05T03:00:00Z'),
        billedAt: null,
        isDraft: false,
        report: null,
      },
      {
        dispatchTime: new Date('2026-04-05T05:00:00Z'),
        billedAt: null,
        isDraft: false,
        report: null,
      },
      {
        dispatchTime: new Date('2026-04-05T10:00:00Z'),
        billedAt: new Date(),
        isDraft: false,
        report: { isDraft: false },
      },
    ])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day5 = json.days.find((d: { date: string }) => d.date === '2026-04-05')
    expect(day5.totalCount).toBe(3)
    expect(day5.unprocessedCount).toBe(2)
  })

  it('テナント分離: where.tenantId が session の値で設定される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    const args = mockedFindMany.mock.calls[0][0]
    expect(args.where.tenantId).toBe('t1')
  })

  it('期間 (gte/lt) が month 範囲をカバーする', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    const args = mockedFindMany.mock.calls[0][0]
    expect(args.where.dispatchTime.gte).toBeInstanceOf(Date)
    expect(args.where.dispatchTime.lt).toBeInstanceOf(Date)
  })
})
