import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { GET, PATCH } from '@/app/api/tenant/settings/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindUnique = prisma.tenant.findUnique as unknown as ReturnType<
  typeof vi.fn
>
const mockedUpdate = prisma.tenant.update as unknown as ReturnType<typeof vi.fn>

// Request を生成するヘルパー
const makeRequest = (body: unknown): Request =>
  new Request('http://localhost/api/tenant/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('GET /api/tenant/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未認証の場合は 401 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('MEMBER ロールは 403', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })

    const res = await GET()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ error: 'Forbidden' })
    expect(mockedFindUnique).not.toHaveBeenCalled()
  })

  it('認証済み ADMIN でも 200 で取得できる', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })
    mockedFindUnique.mockResolvedValueOnce({
      id: 't1',
      businessDayStartMinutes: 0,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: 't1', businessDayStartMinutes: 0 })
  })

  it('テナントが存在しない場合は 404', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't-missing', role: 'ADMIN' },
    })
    mockedFindUnique.mockResolvedValueOnce(null)

    const res = await GET()
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'Tenant not found' })
  })

  it('findUnique は id=tenantId で、select に businessDayStartMinutes を含む', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't-target', role: 'ADMIN' },
    })
    mockedFindUnique.mockResolvedValueOnce({
      id: 't-target',
      businessDayStartMinutes: 0,
    })

    await GET()
    expect(mockedFindUnique).toHaveBeenCalledWith({
      where: { id: 't-target' },
      select: { id: true, businessDayStartMinutes: true },
    })
  })

  it('DB エラーは 500', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })
    mockedFindUnique.mockRejectedValueOnce(new Error('boom'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal Server Error' })
    errSpy.mockRestore()
  })
})

describe('PATCH /api/tenant/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未認証は 401', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await PATCH(makeRequest({ businessDayStartMinutes: 540 }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('MEMBER ロールは 403', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })

    const res = await PATCH(makeRequest({ businessDayStartMinutes: 540 }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ error: 'Forbidden' })
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('ADMIN が正しい値を送ると 200 で更新後の値を返す', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })
    mockedUpdate.mockResolvedValueOnce({
      id: 't1',
      businessDayStartMinutes: 540,
    })

    const res = await PATCH(makeRequest({ businessDayStartMinutes: 540 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: 't1', businessDayStartMinutes: 540 })

    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { businessDayStartMinutes: 540 },
      select: { id: true, businessDayStartMinutes: true },
    })
  })

  it('境界値: 0 は有効', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })
    mockedUpdate.mockResolvedValueOnce({
      id: 't1',
      businessDayStartMinutes: 0,
    })

    const res = await PATCH(makeRequest({ businessDayStartMinutes: 0 }))
    expect(res.status).toBe(200)
  })

  it('境界値: 1439 は有効', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })
    mockedUpdate.mockResolvedValueOnce({
      id: 't1',
      businessDayStartMinutes: 1439,
    })

    const res = await PATCH(makeRequest({ businessDayStartMinutes: 1439 }))
    expect(res.status).toBe(200)
  })

  it('バリデーション失敗: -1 は 400', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })

    const res = await PATCH(makeRequest({ businessDayStartMinutes: -1 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(body.details).toBeDefined()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('バリデーション失敗: 1440 は 400', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })

    const res = await PATCH(makeRequest({ businessDayStartMinutes: 1440 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('バリデーション失敗: 文字列は 400', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })

    const res = await PATCH(makeRequest({ businessDayStartMinutes: '540' }))
    expect(res.status).toBe(400)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('バリデーション失敗: 小数は 400', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })

    const res = await PATCH(makeRequest({ businessDayStartMinutes: 1.5 }))
    expect(res.status).toBe(400)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('バリデーション失敗: フィールド欠落は 400', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })

    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('DB エラーは 500', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' },
    })
    mockedUpdate.mockRejectedValueOnce(new Error('boom'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await PATCH(makeRequest({ businessDayStartMinutes: 540 }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal Server Error' })
    errSpy.mockRestore()
  })
})
