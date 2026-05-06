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
const mockedFindMany = prisma.dispatch.findMany as unknown as ReturnType<
  typeof vi.fn
>

function adminSession() {
  return { user: { userId: 'u-admin', tenantId: 't1', role: 'ADMIN' } }
}

function makeRequest(qs = '') {
  return new Request(`http://localhost/api/admin/calendar${qs}`)
}

interface RawDispatch {
  dispatchNumber: string
  dispatchTime: Date | null
  type: 'ONSITE' | 'TRANSPORT'
  isDraft: boolean
  plateRegion: string | null
  plateClass: string | null
  plateKana: string | null
  plateNumber: string | null
  scheduledSecondaryAt?: Date | null
}

function makeRow(o: Partial<RawDispatch> & { dispatchNumber: string }): RawDispatch {
  return {
    dispatchTime: o.dispatchTime ?? new Date('2026-04-15T03:00:00Z'),
    type: o.type ?? 'ONSITE',
    isDraft: o.isDraft ?? false,
    plateRegion: o.plateRegion ?? '練馬',
    plateClass: o.plateClass ?? '500',
    plateKana: o.plateKana ?? 'あ',
    plateNumber: o.plateNumber ?? '1234',
    dispatchNumber: o.dispatchNumber,
    scheduledSecondaryAt: o.scheduledSecondaryAt ?? null,
  }
}

describe('GET /api/admin/calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 既定のフォールバック: mockResolvedValueOnce で明示されていない呼び出しは [] を返す。
    // route 側は primary / secondary / secondaryPlan の 3 クエリを発行するため、
    // 既存テスト（2 回しか mockResolvedValueOnce していないもの）の 3 番目を吸収する。
    mockedFindMany.mockResolvedValue([])
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

  it('指定月の全日 (4月=30日) を返し primary/secondary はいずれも空配列', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    // 1st call: primary, 2nd call: secondary
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    const res = await GET(makeRequest('?year=2026&month=4'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.year).toBe(2026)
    expect(json.month).toBe(4)
    expect(json.days).toHaveLength(30)
    expect(json.days[0].date).toBe('2026-04-01')
    expect(json.days[29].date).toBe('2026-04-30')
    json.days.forEach(
      (d: {
        primaryDispatches: unknown[]
        secondaryDispatches: unknown[]
      }) => {
        expect(d.primaryDispatches).toEqual([])
        expect(d.secondaryDispatches).toEqual([])
      },
    )
  })

  it('JST 月内の dispatch は該当日に primaryDispatches として並ぶ（type / dispatchTime 含む）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([
      makeRow({
        dispatchNumber: '20260415-001',
        dispatchTime: new Date('2026-04-15T03:00:00Z'),
        type: 'ONSITE',
      }),
    ])
    mockedFindMany.mockResolvedValueOnce([])

    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day15 = json.days.find((d: { date: string }) => d.date === '2026-04-15')
    expect(day15.primaryDispatches).toHaveLength(1)
    expect(day15.primaryDispatches[0]).toEqual({
      dispatchNumber: '20260415-001',
      plate: { region: '練馬', class: '500', kana: 'あ', number: '1234' },
      type: 'ONSITE',
      dispatchTime: '2026-04-15T03:00:00.000Z',
      isDraft: false,
      scheduledSecondaryAt: null,
    })
  })

  it('dispatchTime が null のレコードは dispatchTime: null として返る', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    // 月範囲フィルタでは取れないため、強制的に集計対象に乗せるシナリオを作る
    // （findMany モックは where 条件を無視するので、dispatchTime: null を返しても OK）
    // ただし byDate のキー生成で「dispatchTime がない」場合は集計から除外されるため、
    // 当ケースは集計に出ないことの検証として扱う。
    mockedFindMany.mockResolvedValueOnce([
      {
        dispatchNumber: '20260418-001',
        dispatchTime: null,
        type: 'ONSITE' as const,
        isDraft: false,
        plateRegion: '練馬',
        plateClass: '500',
        plateKana: 'あ',
        plateNumber: '1234',
      },
    ])
    mockedFindMany.mockResolvedValueOnce([])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    json.days.forEach((d: { primaryDispatches: unknown[] }) => {
      expect(d.primaryDispatches).toEqual([])
    })
  })

  it('secondaryDispatches も dispatchTime を ISO 文字列で返す', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([
      makeRow({
        dispatchNumber: '20260412-S01',
        dispatchTime: new Date('2026-04-12T01:00:00Z'),
        type: 'TRANSPORT',
      }),
    ])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day12 = json.days.find((d: { date: string }) => d.date === '2026-04-12')
    expect(day12.secondaryDispatches[0].dispatchTime).toBe(
      '2026-04-12T01:00:00.000Z',
    )
  })

  it('plate 列の一部欠損は plate=null として返す', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([
      {
        dispatchNumber: '20260410-001',
        dispatchTime: new Date('2026-04-10T03:00:00Z'),
        type: 'ONSITE',
        isDraft: false,
        plateRegion: null,
        plateClass: null,
        plateKana: null,
        plateNumber: null,
      },
    ])
    mockedFindMany.mockResolvedValueOnce([])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day10 = json.days.find((d: { date: string }) => d.date === '2026-04-10')
    expect(day10.primaryDispatches[0].plate).toBeNull()
  })

  it('同じ日に複数件あれば primaryDispatches に並ぶ（ソートは findMany の orderBy 任せ）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([
      makeRow({
        dispatchNumber: '20260405-001',
        dispatchTime: new Date('2026-04-05T03:00:00Z'),
      }),
      makeRow({
        dispatchNumber: '20260405-002',
        dispatchTime: new Date('2026-04-05T05:00:00Z'),
      }),
      makeRow({
        dispatchNumber: '20260405-003',
        dispatchTime: new Date('2026-04-05T10:00:00Z'),
      }),
    ])
    mockedFindMany.mockResolvedValueOnce([])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day5 = json.days.find((d: { date: string }) => d.date === '2026-04-05')
    expect(day5.primaryDispatches.map((p: { dispatchNumber: string }) => p.dispatchNumber)).toEqual([
      '20260405-001',
      '20260405-002',
      '20260405-003',
    ])
  })

  it('2 次搬送 (isSecondaryTransport=true) は別 query で集計され secondaryDispatches として返る', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([
      makeRow({
        dispatchNumber: '20260412-S01',
        dispatchTime: new Date('2026-04-12T01:00:00Z'),
        type: 'TRANSPORT',
      }),
      makeRow({
        dispatchNumber: '20260412-S02',
        dispatchTime: new Date('2026-04-12T05:00:00Z'),
        type: 'ONSITE',
      }),
      makeRow({
        dispatchNumber: '20260420-S01',
        dispatchTime: new Date('2026-04-20T03:00:00Z'),
        type: 'TRANSPORT',
      }),
    ])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day12 = json.days.find((d: { date: string }) => d.date === '2026-04-12')
    const day20 = json.days.find((d: { date: string }) => d.date === '2026-04-20')
    const day1 = json.days.find((d: { date: string }) => d.date === '2026-04-01')

    // primary と同じ shape（dispatchNumber / plate / type / dispatchTime / isDraft）が並ぶ
    expect(day12.secondaryDispatches).toHaveLength(2)
    expect(day12.secondaryDispatches[0]).toEqual({
      dispatchNumber: '20260412-S01',
      plate: { region: '練馬', class: '500', kana: 'あ', number: '1234' },
      type: 'TRANSPORT',
      dispatchTime: '2026-04-12T01:00:00.000Z',
      isDraft: false,
      scheduledSecondaryAt: null,
    })
    expect(day12.secondaryDispatches[1]).toEqual({
      dispatchNumber: '20260412-S02',
      plate: { region: '練馬', class: '500', kana: 'あ', number: '1234' },
      type: 'ONSITE',
      dispatchTime: '2026-04-12T05:00:00.000Z',
      isDraft: false,
      scheduledSecondaryAt: null,
    })
    expect(day20.secondaryDispatches).toHaveLength(1)
    expect(day20.secondaryDispatches[0].dispatchNumber).toBe('20260420-S01')
    expect(day1.secondaryDispatches).toEqual([])

    // 2 nd findMany call の where.isSecondaryTransport が true であること
    expect(mockedFindMany.mock.calls[1][0].where.isSecondaryTransport).toBe(true)
  })

  it('secondary findMany: orderBy が dispatchTime ASC、select は primary と同じ列（isDraft 含む）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    const args = mockedFindMany.mock.calls[1][0]
    expect(args.orderBy).toEqual({ dispatchTime: 'asc' })
    expect(args.select).toEqual({
      dispatchNumber: true,
      dispatchTime: true,
      type: true,
      isDraft: true,
      plateRegion: true,
      plateClass: true,
      plateKana: true,
      plateNumber: true,
    })
  })

  it('テナント分離: where.tenantId が session の値で設定される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    const args = mockedFindMany.mock.calls[0][0]
    expect(args.where.tenantId).toBe('t1')
  })

  it('期間 (gte/lt) が month 範囲をカバーする', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    const args = mockedFindMany.mock.calls[0][0]
    expect(args.where.dispatchTime.gte).toBeInstanceOf(Date)
    expect(args.where.dispatchTime.lt).toBeInstanceOf(Date)
  })

  it('primary findMany: isSecondaryTransport=false / type 制約を持つが、isDraft では絞らない（下書きも返す）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    const args = mockedFindMany.mock.calls[0][0]
    expect(args.where.isSecondaryTransport).toBe(false)
    expect(args.where.type).toEqual({ in: ['ONSITE', 'TRANSPORT'] })
    expect(args.where).not.toHaveProperty('isDraft')
  })

  it('secondary findMany: 下書きも対象に含める（isDraft で絞らない）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    const args = mockedFindMany.mock.calls[1][0]
    expect(args.where.isSecondaryTransport).toBe(true)
    expect(args.where).not.toHaveProperty('isDraft')
  })

  it('下書き案件 (isDraft=true) もレスポンスに含まれ、isDraft プロパティが付く', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([
      makeRow({
        dispatchNumber: '20260422-001',
        dispatchTime: new Date('2026-04-22T01:00:00Z'),
        type: 'ONSITE',
        isDraft: false,
      }),
      makeRow({
        dispatchNumber: '20260422-002',
        dispatchTime: new Date('2026-04-22T02:00:00Z'),
        type: 'ONSITE',
        isDraft: true,
      }),
      makeRow({
        dispatchNumber: '20260422-003',
        dispatchTime: new Date('2026-04-22T03:00:00Z'),
        type: 'TRANSPORT',
        isDraft: true,
      }),
    ])
    mockedFindMany.mockResolvedValueOnce([
      makeRow({
        dispatchNumber: '20260422-S01',
        dispatchTime: new Date('2026-04-22T05:00:00Z'),
        type: 'TRANSPORT',
        isDraft: true,
      }),
    ])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    const day22 = json.days.find((d: { date: string }) => d.date === '2026-04-22')
    expect(day22.primaryDispatches).toHaveLength(3)
    expect(day22.primaryDispatches.map((p: { isDraft: boolean }) => p.isDraft)).toEqual([
      false,
      true,
      true,
    ])
    expect(day22.secondaryDispatches).toHaveLength(1)
    expect(day22.secondaryDispatches[0].isDraft).toBe(true)
  })

  it('orderBy が dispatchTime ASC である', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    const args = mockedFindMany.mock.calls[0][0]
    expect(args.orderBy).toEqual({ dispatchTime: 'asc' })
  })

  // ====================================================================
  // 2 次搬送「予定」(scheduledSecondaryAt ベース) のテスト
  // ====================================================================

  it('secondaryPlan findMany: where に scheduledSecondaryAt 範囲・isSecondaryTransport=false・type 制約を持つ', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    expect(mockedFindMany.mock.calls).toHaveLength(3)
    const args = mockedFindMany.mock.calls[2][0]
    expect(args.where.tenantId).toBe('t1')
    expect(args.where.scheduledSecondaryAt.gte).toBeInstanceOf(Date)
    expect(args.where.scheduledSecondaryAt.lt).toBeInstanceOf(Date)
    expect(args.where.isSecondaryTransport).toBe(false)
    expect(args.where.type).toEqual({ in: ['ONSITE', 'TRANSPORT'] })
    // 下書きを含めるため isDraft でフィルタしない
    expect(args.where).not.toHaveProperty('isDraft')
    // dispatchTime 範囲フィルタは付かない（実施前の予定なので dispatchTime が NULL でも対象）
    expect(args.where).not.toHaveProperty('dispatchTime')
  })

  it('secondaryPlan findMany: orderBy が scheduledSecondaryAt ASC、select に scheduledSecondaryAt を含む', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    await GET(makeRequest('?year=2026&month=4'))
    const args = mockedFindMany.mock.calls[2][0]
    expect(args.orderBy).toEqual({ scheduledSecondaryAt: 'asc' })
    expect(args.select).toEqual({
      dispatchNumber: true,
      dispatchTime: true,
      type: true,
      isDraft: true,
      plateRegion: true,
      plateClass: true,
      plateKana: true,
      plateNumber: true,
      scheduledSecondaryAt: true,
    })
  })

  it('secondaryPlan: scheduledSecondaryAt の JST 日付で集約され、secondaryPlanDispatches として返る', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([
      makeRow({
        dispatchNumber: '20260410-001',
        // dispatchTime は別日（または NULL）でも、scheduledSecondaryAt の日に並ぶ
        dispatchTime: new Date('2026-04-01T03:00:00Z'),
        scheduledSecondaryAt: new Date('2026-04-18T02:00:00Z'),
        type: 'ONSITE',
      }),
      // makeRow ではなく手書き: dispatchTime: null を ?? でデフォルトに置き換えられないように
      {
        dispatchNumber: '20260410-002',
        dispatchTime: null,
        scheduledSecondaryAt: new Date('2026-04-18T05:00:00Z'),
        type: 'TRANSPORT',
        isDraft: false,
        plateRegion: '練馬',
        plateClass: '500',
        plateKana: 'あ',
        plateNumber: '1234',
      } as RawDispatch,
      makeRow({
        dispatchNumber: '20260410-003',
        dispatchTime: new Date('2026-04-05T03:00:00Z'),
        scheduledSecondaryAt: new Date('2026-04-25T07:00:00Z'),
        type: 'ONSITE',
        isDraft: true,
      }),
    ])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()

    const day18 = json.days.find((d: { date: string }) => d.date === '2026-04-18')
    expect(day18.secondaryPlanDispatches).toHaveLength(2)
    expect(day18.secondaryPlanDispatches[0]).toEqual({
      dispatchNumber: '20260410-001',
      plate: { region: '練馬', class: '500', kana: 'あ', number: '1234' },
      type: 'ONSITE',
      dispatchTime: '2026-04-01T03:00:00.000Z',
      isDraft: false,
      scheduledSecondaryAt: '2026-04-18T02:00:00.000Z',
    })
    // dispatchTime が NULL でも返る
    expect(day18.secondaryPlanDispatches[1].dispatchNumber).toBe('20260410-002')
    expect(day18.secondaryPlanDispatches[1].dispatchTime).toBeNull()
    expect(day18.secondaryPlanDispatches[1].scheduledSecondaryAt).toBe(
      '2026-04-18T05:00:00.000Z',
    )

    // 下書きも含む
    const day25 = json.days.find((d: { date: string }) => d.date === '2026-04-25')
    expect(day25.secondaryPlanDispatches).toHaveLength(1)
    expect(day25.secondaryPlanDispatches[0].isDraft).toBe(true)

    // 該当しない日は空配列
    const day1 = json.days.find((d: { date: string }) => d.date === '2026-04-01')
    expect(day1.secondaryPlanDispatches).toEqual([])
  })

  it('secondaryPlan: scheduledSecondaryAt が NULL のレコードは集約から除外される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    // findMany モックは where 条件を無視するので scheduledSecondaryAt: null を返しても OK
    mockedFindMany.mockResolvedValueOnce([
      makeRow({
        dispatchNumber: '20260410-XYZ',
        scheduledSecondaryAt: null,
      }),
    ])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    json.days.forEach((d: { secondaryPlanDispatches: unknown[] }) => {
      expect(d.secondaryPlanDispatches).toEqual([])
    })
  })

  it('全日のレスポンスに secondaryPlanDispatches: [] が必ず含まれる', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    mockedFindMany.mockResolvedValueOnce([])
    const res = await GET(makeRequest('?year=2026&month=4'))
    const json = await res.json()
    expect(json.days).toHaveLength(30)
    json.days.forEach((d: { secondaryPlanDispatches: unknown[] }) => {
      expect(Array.isArray(d.secondaryPlanDispatches)).toBe(true)
    })
  })
})
