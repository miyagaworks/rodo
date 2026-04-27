import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    dispatch: {
      count: vi.fn(),
    },
  },
}))

import { GET, POST } from '@/app/api/settings/vehicles/route'
import { PATCH, DELETE } from '@/app/api/settings/vehicles/[id]/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindMany = prisma.vehicle.findMany as unknown as ReturnType<typeof vi.fn>
const mockedCreate = prisma.vehicle.create as unknown as ReturnType<typeof vi.fn>
const mockedUpdate = prisma.vehicle.update as unknown as ReturnType<typeof vi.fn>
const mockedDelete = prisma.vehicle.delete as unknown as ReturnType<typeof vi.fn>
const mockedAggregate = prisma.vehicle.aggregate as unknown as ReturnType<typeof vi.fn>
const mockedDispatchCount = prisma.dispatch.count as unknown as ReturnType<typeof vi.fn>

function makeRequest(body: Record<string, unknown>, method = 'POST'): Request {
  return new Request('http://localhost/api/settings/vehicles', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = 'v1') {
  return { params: Promise.resolve({ id }) }
}

const adminSession = {
  user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
}

const memberSession = {
  user: { userId: 'u2', tenantId: 't1', role: 'MEMBER' },
}

// ─── GET /api/settings/vehicles ──────────────────────────────────────

describe('GET /api/settings/vehicles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401: 未認証', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('200: 認証済み（MEMBER でも OK）で tenantId スコープで取得', async () => {
    mockedAuth.mockResolvedValueOnce(memberSession)
    const mockVehicles = [
      {
        id: 'v1',
        tenantId: 't1',
        plateNumber: '品川 500 あ 1234',
        displayName: null,
        isActive: true,
        _count: { users: 2, dispatches: 5 },
      },
    ]
    mockedFindMany.mockResolvedValueOnce(mockVehicles)

    const res = await GET()

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual(mockVehicles)
    expect(mockedFindMany).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      include: { _count: { select: { users: true, dispatches: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  })

  it('_count が含まれることの確認', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedFindMany.mockResolvedValueOnce([
      { id: 'v1', _count: { users: 3, dispatches: 10 } },
    ])

    const res = await GET()
    const data = await res.json()

    expect(data[0]._count).toEqual({ users: 3, dispatches: 10 })
  })
})

// ─── POST /api/settings/vehicles ─────────────────────────────────────

describe('POST /api/settings/vehicles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401: 未認証', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await POST(makeRequest({ plateNumber: '品川 500 あ 1234' }))

    expect(res.status).toBe(401)
  })

  it('403: MEMBER', async () => {
    mockedAuth.mockResolvedValueOnce(memberSession)

    const res = await POST(makeRequest({ plateNumber: '品川 500 あ 1234' }))

    expect(res.status).toBe(403)
  })

  it('400: plateNumber 欠落', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)

    const res = await POST(makeRequest({ displayName: 'A号車' }))

    expect(res.status).toBe(400)
  })

  it('201: 正常作成', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedAggregate.mockResolvedValueOnce({ _max: { sortOrder: 4 } })
    const created = {
      id: 'v1',
      tenantId: 't1',
      plateNumber: '品川 500 あ 1234',
      displayName: null,
      isActive: true,
      sortOrder: 5,
    }
    mockedCreate.mockResolvedValueOnce(created)

    const res = await POST(makeRequest({ plateNumber: '品川 500 あ 1234' }))

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).toEqual(created)
    expect(mockedCreate).toHaveBeenCalledWith({
      data: {
        tenantId: 't1',
        plateNumber: '品川 500 あ 1234',
        displayName: undefined,
        isActive: true,
        sortOrder: 5,
      },
    })
  })

  it('409: Prisma P2002 発生時', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedAggregate.mockResolvedValueOnce({ _max: { sortOrder: null } })
    mockedCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { target: ['tenantId', 'plateNumber'] },
      })
    )

    const res = await POST(makeRequest({ plateNumber: '品川 500 あ 1234' }))

    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('Vehicle with this plate number already exists')
  })
})

// ─── PATCH /api/settings/vehicles/[id] ───────────────────────────────

describe('PATCH /api/settings/vehicles/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401: 未認証', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await PATCH(
      makeRequest({ plateNumber: '新ナンバー' }, 'PATCH'),
      makeParams()
    )

    expect(res.status).toBe(401)
  })

  it('403: MEMBER', async () => {
    mockedAuth.mockResolvedValueOnce(memberSession)

    const res = await PATCH(
      makeRequest({ plateNumber: '新ナンバー' }, 'PATCH'),
      makeParams()
    )

    expect(res.status).toBe(403)
  })

  it('400: バリデーション失敗（plateNumber を空文字で送信）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)

    const res = await PATCH(
      makeRequest({ plateNumber: '' }, 'PATCH'),
      makeParams()
    )

    expect(res.status).toBe(400)
  })

  it('200: 部分更新（displayName のみ）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    const updated = { id: 'v1', displayName: 'B号車' }
    mockedUpdate.mockResolvedValueOnce(updated)

    const res = await PATCH(
      makeRequest({ displayName: 'B号車' }, 'PATCH'),
      makeParams()
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual(updated)
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: 'v1', tenantId: 't1' },
      data: { displayName: 'B号車' },
    })
  })

  it('200: 部分更新（isActive のみ）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    const updated = { id: 'v1', isActive: false }
    mockedUpdate.mockResolvedValueOnce(updated)

    const res = await PATCH(
      makeRequest({ isActive: false }, 'PATCH'),
      makeParams()
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual(updated)
  })

  it('404: P2025', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedUpdate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.0.0',
        meta: {},
      })
    )

    const res = await PATCH(
      makeRequest({ displayName: 'X号車' }, 'PATCH'),
      makeParams()
    )

    expect(res.status).toBe(404)
  })

  it('409: P2002（plateNumber 変更で重複）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedUpdate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { target: ['tenantId', 'plateNumber'] },
      })
    )

    const res = await PATCH(
      makeRequest({ plateNumber: '既存ナンバー' }, 'PATCH'),
      makeParams()
    )

    expect(res.status).toBe(409)
  })
})

// ─── DELETE /api/settings/vehicles/[id] ──────────────────────────────

describe('DELETE /api/settings/vehicles/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401: 未認証', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await DELETE(
      new Request('http://localhost/api/settings/vehicles/v1', { method: 'DELETE' }),
      makeParams()
    )

    expect(res.status).toBe(401)
  })

  it('403: MEMBER', async () => {
    mockedAuth.mockResolvedValueOnce(memberSession)

    const res = await DELETE(
      new Request('http://localhost/api/settings/vehicles/v1', { method: 'DELETE' }),
      makeParams()
    )

    expect(res.status).toBe(403)
  })

  it('409: 進行中 Dispatch が存在する場合（count > 0）', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedDispatchCount.mockResolvedValueOnce(3)

    const res = await DELETE(
      new Request('http://localhost/api/settings/vehicles/v1', { method: 'DELETE' }),
      makeParams()
    )

    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('Vehicle is in use by active dispatches')
    expect(mockedDispatchCount).toHaveBeenCalledWith({
      where: {
        vehicleId: 'v1',
        tenantId: 't1',
        status: { notIn: ['RETURNED', 'CANCELLED', 'TRANSFERRED'] },
      },
    })
  })

  it('200: 進行中 Dispatch 0件で削除成功', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedDispatchCount.mockResolvedValueOnce(0)
    mockedDelete.mockResolvedValueOnce({ id: 'v1' })

    const res = await DELETE(
      new Request('http://localhost/api/settings/vehicles/v1', { method: 'DELETE' }),
      makeParams()
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })
  })

  it('404: P2025', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedDispatchCount.mockResolvedValueOnce(0)
    mockedDelete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.0.0',
        meta: {},
      })
    )

    const res = await DELETE(
      new Request('http://localhost/api/settings/vehicles/v1', { method: 'DELETE' }),
      makeParams()
    )

    expect(res.status).toBe(404)
  })

  it('テナント越境不可: where の tenantId 条件をモックで確認', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession)
    mockedDispatchCount.mockResolvedValueOnce(0)
    mockedDelete.mockResolvedValueOnce({ id: 'v-other-tenant' })

    await DELETE(
      new Request('http://localhost/api/settings/vehicles/v-other-tenant', {
        method: 'DELETE',
      }),
      makeParams('v-other-tenant')
    )

    // delete の where に tenantId が含まれていることを検証
    expect(mockedDelete).toHaveBeenCalledWith({
      where: { id: 'v-other-tenant', tenantId: 't1' },
    })
    // dispatch.count にも tenantId が含まれている
    expect(mockedDispatchCount).toHaveBeenCalledWith({
      where: {
        vehicleId: 'v-other-tenant',
        tenantId: 't1',
        status: { notIn: ['RETURNED', 'CANCELLED', 'TRANSFERRED'] },
      },
    })
  })
})
