import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/dispatches/last-return-odo
 *
 * 同一ユーザー (session.user.userId) × 同一テナント (session.user.tenantId) の
 * 直前の returnOdo を取得する薄いエンドポイント。
 */

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dispatch: {
      findFirst: vi.fn(),
    },
  },
}))

import { GET } from '@/app/api/dispatches/last-return-odo/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindFirst = prisma.dispatch.findFirst as unknown as ReturnType<
  typeof vi.fn
>

describe('GET /api/dispatches/last-return-odo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未認証の場合は 401 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(mockedFindFirst).not.toHaveBeenCalled()
  })

  it('returnOdo non-null の Dispatch があれば { lastReturnOdo: <値> } を 200 で返す', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce({ returnOdo: 123456 })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ lastReturnOdo: 123456 })
  })

  it('Dispatch が存在しない場合は { lastReturnOdo: null } を 200 で返す (404 ではない)', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce(null)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ lastReturnOdo: null })
  })

  it('Cache-Control: no-store ヘッダが付与される', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce({ returnOdo: 10000 })

    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('findFirst のクエリ条件に userId / tenantId / returnOdo not null / createdAt desc が指定される', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'user-xyz', tenantId: 'tenant-abc', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce({ returnOdo: 42 })

    await GET()

    expect(mockedFindFirst).toHaveBeenCalledTimes(1)
    const arg = mockedFindFirst.mock.calls[0][0]
    expect(arg.where).toMatchObject({
      userId: 'user-xyz',
      tenantId: 'tenant-abc',
      returnOdo: { not: null },
    })
    expect(arg.orderBy).toEqual({ createdAt: 'desc' })
    expect(arg.select).toEqual({ returnOdo: true })
  })

  it('複数レコードがあっても findFirst + orderBy: createdAt desc で最新 1 件を返す (プリズマに委譲)', async () => {
    // 注: findFirst + orderBy は Prisma レイヤーの責務。
    // このテストでは「クエリが正しく発行される」ことと「モックが返す値をそのまま通す」ことだけ担保する。
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce({ returnOdo: 77777 })

    const res = await GET()
    const body = await res.json()
    expect(body.lastReturnOdo).toBe(77777)
  })

  it('異なる userId のレコードが混ざらないよう findFirst に自ユーザーの userId が渡される', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'me', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce(null)

    await GET()

    const arg = mockedFindFirst.mock.calls[0][0]
    expect(arg.where.userId).toBe('me')
  })

  it('異なる tenantId のレコードが混ざらないよう findFirst に自テナントの tenantId が渡される', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 'my-tenant', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce(null)

    await GET()

    const arg = mockedFindFirst.mock.calls[0][0]
    expect(arg.where.tenantId).toBe('my-tenant')
  })

  it('DB エラー時は 500 を返し、console.error にエンドポイント名を含める', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockRejectedValueOnce(new Error('db boom'))

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal server error' })
    expect(errorSpy).toHaveBeenCalled()
    const firstArg = errorSpy.mock.calls[0]?.[0]
    expect(firstArg).toBe('[GET /api/dispatches/last-return-odo]')

    errorSpy.mockRestore()
  })
})
