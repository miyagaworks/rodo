import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    assistance: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { POST } from '@/app/api/assistances/reorder/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindMany = prisma.assistance.findMany as unknown as ReturnType<typeof vi.fn>
const mockedUpdate = prisma.assistance.update as unknown as ReturnType<typeof vi.fn>
const mockedTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>

const adminSession = {
  user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
}
const memberSession = {
  user: { userId: 'u2', tenantId: 't1', role: 'MEMBER' },
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/assistances/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/assistances/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedTransaction.mockImplementation(async (ops: unknown) => {
      // 渡された配列の中身は本物の prisma update ではなくただの mock の戻り値（undefined）
      if (Array.isArray(ops)) {
        return ops.map(() => ({}))
      }
      return undefined
    })
    // update() を呼んでも例外にならないようにダミーを返す
    mockedUpdate.mockResolvedValue({ id: 'x' })
  })

  it('401: 未認証', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await POST(makeRequest({ orderedIds: ['a', 'b'] }))

    expect(res.status).toBe(401)
  })

  it('403: MEMBER ロール', async () => {
    mockedAuth.mockResolvedValueOnce(memberSession)

    const res = await POST(makeRequest({ orderedIds: ['a', 'b'] }))

    expect(res.status).toBe(403)
  })

  it('400: orderedIds 空配列', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)

    const res = await POST(makeRequest({ orderedIds: [] }))

    expect(res.status).toBe(400)
  })

  it('400: orderedIds 重複', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)

    const res = await POST(makeRequest({ orderedIds: ['a1', 'a1'] }))

    expect(res.status).toBe(400)
  })

  it('400: orderedIds undefined', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
  })

  it('409: DB の id 集合と orderedIds の集合が件数不一致', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedFindMany.mockResolvedValueOnce([
      { id: 'a1' },
      { id: 'a2' },
      { id: 'a3' },
    ])

    const res = await POST(makeRequest({ orderedIds: ['a1', 'a2'] }))

    expect(res.status).toBe(409)
    expect(mockedTransaction).not.toHaveBeenCalled()
  })

  it('409: 別テナントの id を含む（findMany は tenantId スコープのため集合不一致）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    // 自テナントには a1, a2 のみ存在
    mockedFindMany.mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }])

    // 別テナントの id 'other-tenant-id' を含む
    const res = await POST(
      makeRequest({ orderedIds: ['a1', 'a2', 'other-tenant-id'] })
    )

    expect(res.status).toBe(409)
    expect(mockedTransaction).not.toHaveBeenCalled()
  })

  it('200: 正常系で orderedIds 順に sortOrder が更新される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedFindMany.mockResolvedValueOnce([
      { id: 'a1' },
      { id: 'a2' },
      { id: 'a3' },
    ])

    const res = await POST(
      makeRequest({ orderedIds: ['a3', 'a1', 'a2'] })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })

    // update が orderedIds 順に sortOrder=0,1,2 で 3 回呼ばれる
    expect(mockedUpdate).toHaveBeenCalledTimes(3)
    expect(mockedUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'a3', tenantId: 't1' },
      data: { sortOrder: 0 },
    })
    expect(mockedUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 'a1', tenantId: 't1' },
      data: { sortOrder: 1 },
    })
    expect(mockedUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: 'a2', tenantId: 't1' },
      data: { sortOrder: 2 },
    })

    // $transaction が 1 回呼ばれている
    expect(mockedTransaction).toHaveBeenCalledTimes(1)
  })

  it('findMany は tenantId でスコープされる', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedFindMany.mockResolvedValueOnce([{ id: 'a1' }])

    await POST(makeRequest({ orderedIds: ['a1'] }))

    expect(mockedFindMany).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      select: { id: true },
    })
  })
})
