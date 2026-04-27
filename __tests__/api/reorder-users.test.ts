import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { POST } from '@/app/api/users/reorder/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>
const mockedUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>
const mockedTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>

const adminSession = {
  user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
}
const memberSession = {
  user: { userId: 'u2', tenantId: 't1', role: 'MEMBER' },
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/users/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/users/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedTransaction.mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) {
        return ops.map(() => ({}))
      }
      return undefined
    })
    mockedUpdate.mockResolvedValue({ id: 'x' })
  })

  it('401: 未認証', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await POST(makeRequest({ orderedIds: ['u1'] }))

    expect(res.status).toBe(401)
  })

  it('403: MEMBER ロール', async () => {
    mockedAuth.mockResolvedValueOnce(memberSession)

    const res = await POST(makeRequest({ orderedIds: ['u1'] }))

    expect(res.status).toBe(403)
  })

  it('400: orderedIds 空配列', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)

    const res = await POST(makeRequest({ orderedIds: [] }))

    expect(res.status).toBe(400)
  })

  it('400: orderedIds 重複', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)

    const res = await POST(makeRequest({ orderedIds: ['u1', 'u1'] }))

    expect(res.status).toBe(400)
  })

  it('400: orderedIds undefined', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
  })

  it('409: 件数不一致', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedFindMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }])

    const res = await POST(makeRequest({ orderedIds: ['u1', 'u2'] }))

    expect(res.status).toBe(409)
    expect(mockedTransaction).not.toHaveBeenCalled()
  })

  it('409: 別テナントの id を含む', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedFindMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }])

    const res = await POST(
      makeRequest({ orderedIds: ['u1', 'u2', 'other-tenant-user'] })
    )

    expect(res.status).toBe(409)
    expect(mockedTransaction).not.toHaveBeenCalled()
  })

  it('200: 正常系で orderedIds 順に sortOrder が更新される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedFindMany.mockResolvedValueOnce([
      { id: 'u1' },
      { id: 'u2' },
      { id: 'u3' },
    ])

    const res = await POST(
      makeRequest({ orderedIds: ['u2', 'u3', 'u1'] })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })

    expect(mockedUpdate).toHaveBeenCalledTimes(3)
    expect(mockedUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'u2', tenantId: 't1' },
      data: { sortOrder: 0 },
    })
    expect(mockedUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 'u3', tenantId: 't1' },
      data: { sortOrder: 1 },
    })
    expect(mockedUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: 'u1', tenantId: 't1' },
      data: { sortOrder: 2 },
    })

    expect(mockedTransaction).toHaveBeenCalledTimes(1)
  })

  it('findMany は tenantId でスコープされる', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedFindMany.mockResolvedValueOnce([{ id: 'u1' }])

    await POST(makeRequest({ orderedIds: ['u1'] }))

    expect(mockedFindMany).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      select: { id: true },
    })
  })
})
