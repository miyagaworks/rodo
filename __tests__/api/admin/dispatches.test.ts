import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    dispatch: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { GET } from '@/app/api/admin/dispatches/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>

function adminSession() {
  return { user: { userId: 'u-admin', tenantId: 't1', role: 'ADMIN' } }
}

function makeRequest(qs = '') {
  return new Request(`http://localhost/api/admin/dispatches${qs}`)
}

/**
 * $transaction で渡された PrismaPromise の代わりに、count / findMany の実引数を取り出す。
 * 実装は `prisma.$transaction([prisma.dispatch.count(...), prisma.dispatch.findMany(...)])` を呼んでいる。
 * モックの count / findMany は `vi.fn()` のままだが、呼び出し時に渡された引数を解析対象とする。
 */
function setupTxResolve(count: number, dispatches: unknown[]) {
  mockedTransaction.mockImplementationOnce(async (calls: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void calls
    return [count, dispatches]
  })
}

describe('GET /api/admin/dispatches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未認証は 401', async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('MEMBER は 403', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u', tenantId: 't1', role: 'MEMBER' },
    })
    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  it('ADMIN ならデフォルトページ（page=1, pageSize=50）で 200 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    setupTxResolve(0, [])
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ dispatches: [], total: 0, page: 1, pageSize: 50 })
  })

  it('pageSize は MAX 200 にクランプされる', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    setupTxResolve(0, [])
    const res = await GET(makeRequest('?pageSize=500'))
    const json = await res.json()
    expect(json.pageSize).toBe(200)
  })

  it('status=draft フィルタ: where.isDraft=true で count/findMany が呼ばれる', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    let countWhere: unknown = null
    let findWhere: unknown = null
    const countMock = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>
    const findMock = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>
    countMock.mockImplementationOnce((args: { where: unknown }) => {
      countWhere = args.where
      return Promise.resolve(0)
    })
    findMock.mockImplementationOnce((args: { where: unknown }) => {
      findWhere = args.where
      return Promise.resolve([])
    })
    mockedTransaction.mockImplementationOnce(async (calls: Promise<unknown>[]) => {
      return Promise.all(calls)
    })

    await GET(makeRequest('?status=draft'))
    expect(countWhere).toMatchObject({ tenantId: 't1', isDraft: true })
    expect(findWhere).toMatchObject({ tenantId: 't1', isDraft: true })
  })

  it('status=unbilled フィルタ: billedAt=null のみ（業務仕様 2026-05-06 §C-4: isDraft フィルタなし）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const countMock = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>
    const findMock = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>
    let captured: { billedAt?: unknown; isDraft?: unknown } | null = null
    countMock.mockImplementationOnce((args: { where: typeof captured }) => {
      captured = args.where
      return Promise.resolve(0)
    })
    findMock.mockImplementationOnce(() => Promise.resolve([]))
    mockedTransaction.mockImplementationOnce(async (calls: Promise<unknown>[]) =>
      Promise.all(calls),
    )

    await GET(makeRequest('?status=unbilled'))
    expect(captured).toMatchObject({ billedAt: null })
    // 下書き案件も持ち越しリストに含めるため、isDraft フィルタは付与されない
    expect(captured?.isDraft).toBeUndefined()
  })

  it('status=unbilled フィルタ: 下書き案件 (isDraft=true) もレスポンスに含まれる', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    setupTxResolve(2, [
      {
        id: 'd-draft',
        dispatchNumber: '20260505001',
        dispatchTime: new Date('2026-05-05T01:00:00Z'),
        status: 'COMPLETED',
        isDraft: true,
        billedAt: null,
        scheduledSecondaryAt: null,
        returnTime: new Date('2026-05-05T03:00:00Z'),
        type: 'ONSITE',
        customerName: '顧客 D',
        plateRegion: null,
        plateClass: null,
        plateKana: null,
        plateNumber: null,
        user: { id: 'u1', name: '山田' },
        assistance: { id: 'a1', name: 'PA', displayAbbreviation: 'PA' },
        report: null,
      },
      {
        id: 'd-final',
        dispatchNumber: '20260505002',
        dispatchTime: new Date('2026-05-05T02:00:00Z'),
        status: 'COMPLETED',
        isDraft: false,
        billedAt: null,
        scheduledSecondaryAt: null,
        returnTime: new Date('2026-05-05T04:00:00Z'),
        type: 'ONSITE',
        customerName: '顧客 F',
        plateRegion: null,
        plateClass: null,
        plateKana: null,
        plateNumber: null,
        user: { id: 'u1', name: '山田' },
        assistance: { id: 'a1', name: 'PA', displayAbbreviation: 'PA' },
        report: null,
      },
    ])

    const res = await GET(makeRequest('?status=unbilled'))
    const json = await res.json()
    expect(json.dispatches).toHaveLength(2)
    expect(json.dispatches.map((d: { id: string }) => d.id)).toEqual([
      'd-draft',
      'd-final',
    ])
    // 下書きフラグはレスポンスに保持される（表示側でバッジ色分けに使用）
    expect(json.dispatches[0].isDraft).toBe(true)
    expect(json.dispatches[1].isDraft).toBe(false)
  })

  it('status=stored フィルタ: status=STORED のみ（業務仕様 2026-05-06 §C-1: 下書き保存中の保管案件も含める）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const countMock = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>
    const findMock = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>
    let captured: { status?: unknown; isDraft?: unknown } | null = null
    countMock.mockImplementationOnce((args: { where: typeof captured }) => {
      captured = args.where
      return Promise.resolve(0)
    })
    findMock.mockImplementationOnce(() => Promise.resolve([]))
    mockedTransaction.mockImplementationOnce(async (calls: Promise<unknown>[]) =>
      Promise.all(calls),
    )

    await GET(makeRequest('?status=stored'))
    expect(captured?.status).toBe('STORED')
    expect(captured?.isDraft).toBeUndefined()
  })

  it('レスポンスに scheduledSecondaryAt が含まれる', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const scheduled = new Date('2026-04-28T05:00:00.000Z')
    setupTxResolve(1, [
      {
        id: 'd1',
        dispatchNumber: '20260428001',
        dispatchTime: null,
        status: 'STORED',
        isDraft: false,
        billedAt: null,
        scheduledSecondaryAt: scheduled,
        type: 'TRANSPORT',
        customerName: null,
        plateRegion: null,
        plateClass: null,
        plateKana: null,
        plateNumber: null,
        user: { id: 'u1', name: '山田' },
        assistance: { id: 'a1', name: 'PA', displayAbbreviation: 'PA' },
        report: null,
      },
    ])

    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.dispatches[0].scheduledSecondaryAt).toBe(scheduled.toISOString())
  })

  it('status=billed フィルタ: billedAt !== null', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const countMock = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>
    const findMock = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>
    let captured: { billedAt?: unknown; tenantId?: unknown } | null = null
    countMock.mockImplementationOnce((args: { where: typeof captured }) => {
      captured = args.where
      return Promise.resolve(0)
    })
    findMock.mockImplementationOnce(() => Promise.resolve([]))
    mockedTransaction.mockImplementationOnce(async (calls: Promise<unknown>[]) =>
      Promise.all(calls),
    )

    await GET(makeRequest('?status=billed'))
    expect(captured?.billedAt).toEqual({ not: null })
  })

  it('userId / assistanceId フィルタが where に反映される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const countMock = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>
    const findMock = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>
    let captured: unknown = null
    countMock.mockImplementationOnce((args: { where: unknown }) => {
      captured = args.where
      return Promise.resolve(0)
    })
    findMock.mockImplementationOnce(() => Promise.resolve([]))
    mockedTransaction.mockImplementationOnce(async (calls: Promise<unknown>[]) =>
      Promise.all(calls),
    )

    await GET(makeRequest('?userId=u9&assistanceId=a9'))
    expect(captured).toMatchObject({ userId: 'u9', assistanceId: 'a9', tenantId: 't1' })
  })

  it('期間フィルタ from/to が dispatchTime OR scheduledSecondaryAt の範囲条件として渡る', async () => {
    // 業務仕様 2026-05-06（§C-2 / §J-3）: カレンダーが該当日セルに集約する集合と
    // テーブルが返す集合を一致させるため、両フィールドの OR で絞る。
    mockedAuth.mockResolvedValueOnce(adminSession())
    const countMock = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>
    const findMock = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>
    type RangeFilter = { gte?: Date; lte?: Date }
    type OrCondition =
      | { dispatchTime?: RangeFilter; scheduledSecondaryAt?: undefined }
      | { scheduledSecondaryAt?: RangeFilter; dispatchTime?: undefined }
    let captured: { OR?: OrCondition[] } | null = null
    countMock.mockImplementationOnce((args: { where: typeof captured }) => {
      captured = args.where
      return Promise.resolve(0)
    })
    findMock.mockImplementationOnce(() => Promise.resolve([]))
    mockedTransaction.mockImplementationOnce(async (calls: Promise<unknown>[]) =>
      Promise.all(calls),
    )

    await GET(makeRequest('?from=2026-04-01&to=2026-04-30'))

    // OR 配列が組み立てられ、dispatchTime / scheduledSecondaryAt 両方を含む
    expect(Array.isArray(captured?.OR)).toBe(true)
    expect(captured?.OR).toHaveLength(2)

    const dispatchTimeBranch = captured?.OR?.find(
      (c): c is { dispatchTime: RangeFilter } => 'dispatchTime' in c && c.dispatchTime !== undefined,
    )
    const scheduledBranch = captured?.OR?.find(
      (c): c is { scheduledSecondaryAt: RangeFilter } =>
        'scheduledSecondaryAt' in c && c.scheduledSecondaryAt !== undefined,
    )

    expect(dispatchTimeBranch?.dispatchTime?.gte).toBeInstanceOf(Date)
    expect(dispatchTimeBranch?.dispatchTime?.lte).toBeInstanceOf(Date)
    expect(scheduledBranch?.scheduledSecondaryAt?.gte).toBeInstanceOf(Date)
    expect(scheduledBranch?.scheduledSecondaryAt?.lte).toBeInstanceOf(Date)

    // ルート直下の where.dispatchTime は二重指定になるため設定されない
    expect((captured as unknown as { dispatchTime?: unknown })?.dispatchTime).toBeUndefined()
  })

  it('期間フィルタ: scheduledSecondaryAt のみ範囲一致のレコードも where.OR で拾える構造になっている', async () => {
    // ケース: dispatchTime=2026-04-15（範囲外）、scheduledSecondaryAt=2026-05-07（範囲内）
    // 実際の DB マッチングは Prisma の責任なので、ここでは「OR 構造が正しく構築されている」ことを検証する。
    mockedAuth.mockResolvedValueOnce(adminSession())
    const countMock = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>
    const findMock = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>
    type RangeFilter = { gte?: Date; lte?: Date }
    let captured:
      | {
          OR?: Array<
            { dispatchTime?: RangeFilter } | { scheduledSecondaryAt?: RangeFilter }
          >
        }
      | null = null
    countMock.mockImplementationOnce((args: { where: typeof captured }) => {
      captured = args.where
      return Promise.resolve(0)
    })
    findMock.mockImplementationOnce(() => Promise.resolve([]))
    mockedTransaction.mockImplementationOnce(async (calls: Promise<unknown>[]) =>
      Promise.all(calls),
    )

    await GET(makeRequest('?from=2026-05-07&to=2026-05-07'))

    const scheduledBranch = captured?.OR?.find(
      (c): c is { scheduledSecondaryAt: RangeFilter } =>
        'scheduledSecondaryAt' in c &&
        (c as { scheduledSecondaryAt?: RangeFilter }).scheduledSecondaryAt !== undefined,
    )
    expect(scheduledBranch).toBeDefined()
    // 5/7 00:00 JST 以降、5/7 23:59:59.999 JST 以前
    expect(scheduledBranch?.scheduledSecondaryAt?.gte).toBeInstanceOf(Date)
    expect(scheduledBranch?.scheduledSecondaryAt?.lte).toBeInstanceOf(Date)
    expect(scheduledBranch?.scheduledSecondaryAt?.gte?.toISOString()).toBe(
      new Date('2026-05-07T00:00:00.000+09:00').toISOString(),
    )
    expect(scheduledBranch?.scheduledSecondaryAt?.lte?.toISOString()).toBe(
      new Date('2026-05-07T23:59:59.999+09:00').toISOString(),
    )
  })

  it('期間フィルタ: dispatchTime のみ範囲一致のレコードも where.OR で拾える構造になっている', async () => {
    // ケース: dispatchTime=2026-05-07（範囲内）、scheduledSecondaryAt=null
    // OR の dispatchTime ブランチが正しく構築されていれば DB が拾う。
    mockedAuth.mockResolvedValueOnce(adminSession())
    const countMock = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>
    const findMock = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>
    type RangeFilter = { gte?: Date; lte?: Date }
    let captured:
      | {
          OR?: Array<
            { dispatchTime?: RangeFilter } | { scheduledSecondaryAt?: RangeFilter }
          >
        }
      | null = null
    countMock.mockImplementationOnce((args: { where: typeof captured }) => {
      captured = args.where
      return Promise.resolve(0)
    })
    findMock.mockImplementationOnce(() => Promise.resolve([]))
    mockedTransaction.mockImplementationOnce(async (calls: Promise<unknown>[]) =>
      Promise.all(calls),
    )

    await GET(makeRequest('?from=2026-05-07&to=2026-05-07'))

    const dispatchTimeBranch = captured?.OR?.find(
      (c): c is { dispatchTime: RangeFilter } =>
        'dispatchTime' in c &&
        (c as { dispatchTime?: RangeFilter }).dispatchTime !== undefined,
    )
    expect(dispatchTimeBranch).toBeDefined()
    expect(dispatchTimeBranch?.dispatchTime?.gte?.toISOString()).toBe(
      new Date('2026-05-07T00:00:00.000+09:00').toISOString(),
    )
    expect(dispatchTimeBranch?.dispatchTime?.lte?.toISOString()).toBe(
      new Date('2026-05-07T23:59:59.999+09:00').toISOString(),
    )
  })

  it('ページング (skip/take) が反映される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const countMock = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>
    const findMock = prisma.dispatch.findMany as unknown as ReturnType<typeof vi.fn>
    let findArgs: { skip?: number; take?: number } | null = null
    countMock.mockImplementationOnce(() => Promise.resolve(0))
    findMock.mockImplementationOnce((args: typeof findArgs) => {
      findArgs = args
      return Promise.resolve([])
    })
    mockedTransaction.mockImplementationOnce(async (calls: Promise<unknown>[]) =>
      Promise.all(calls),
    )

    await GET(makeRequest('?page=3&pageSize=20'))
    expect(findArgs?.skip).toBe(40)
    expect(findArgs?.take).toBe(20)
  })

  it('レスポンスに plate オブジェクトが組み立てられる', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    setupTxResolve(1, [
      {
        id: 'd1',
        dispatchNumber: '20260427001',
        dispatchTime: new Date('2026-04-27T01:00:00Z'),
        status: 'COMPLETED',
        isDraft: false,
        billedAt: null,
        type: 'ONSITE',
        customerName: '顧客 A',
        plateRegion: '練馬',
        plateClass: '500',
        plateKana: 'あ',
        plateNumber: '1234',
        user: { id: 'u1', name: '山田' },
        assistance: { id: 'a1', name: 'PA', displayAbbreviation: 'PA' },
        report: null,
      },
    ])

    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.dispatches[0].plate).toEqual({
      region: '練馬',
      class: '500',
      kana: 'あ',
      number: '1234',
    })
  })

  it('plate 系全 null なら plate=null', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    setupTxResolve(1, [
      {
        id: 'd1',
        dispatchNumber: '20260427001',
        dispatchTime: null,
        status: 'STANDBY',
        isDraft: true,
        billedAt: null,
        type: 'ONSITE',
        customerName: null,
        plateRegion: null,
        plateClass: null,
        plateKana: null,
        plateNumber: null,
        user: { id: 'u1', name: '山田' },
        assistance: { id: 'a1', name: 'PA', displayAbbreviation: 'PA' },
        report: null,
      },
    ])

    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.dispatches[0].plate).toBeNull()
  })
})
