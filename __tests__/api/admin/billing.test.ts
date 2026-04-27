import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dispatch: {
      update: vi.fn(),
    },
  },
}))

import { PATCH } from '@/app/api/admin/dispatches/[id]/billing/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedUpdate = prisma.dispatch.update as unknown as ReturnType<typeof vi.fn>

function adminSession() {
  return { user: { userId: 'u-admin', tenantId: 't1', role: 'ADMIN' } }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/admin/dispatches/d1/billing', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = 'd1') {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/admin/dispatches/[id]/billing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未認証は 401', async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const res = await PATCH(makeRequest({ billed: true }), makeParams())
    expect(res.status).toBe(401)
  })

  it('MEMBER は 403', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u', tenantId: 't1', role: 'MEMBER' },
    })
    const res = await PATCH(makeRequest({ billed: true }), makeParams())
    expect(res.status).toBe(403)
  })

  it('billed フィールド欠落は 400', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const res = await PATCH(makeRequest({}), makeParams())
    expect(res.status).toBe(400)
  })

  it('billed: true → billedAt = Date 値で update される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const now = new Date('2026-04-27T12:00:00Z')
    mockedUpdate.mockResolvedValueOnce({ id: 'd1', billedAt: now })

    const res = await PATCH(makeRequest({ billed: true }), makeParams())
    expect(res.status).toBe(200)

    const args = mockedUpdate.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'd1', tenantId: 't1' })
    expect(args.data.billedAt).toBeInstanceOf(Date)

    const json = await res.json()
    expect(json.id).toBe('d1')
    expect(typeof json.billedAt).toBe('string')
  })

  it('billed: false → billedAt = null で update される', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedUpdate.mockResolvedValueOnce({ id: 'd1', billedAt: null })

    const res = await PATCH(makeRequest({ billed: false }), makeParams())
    expect(res.status).toBe(200)

    const args = mockedUpdate.mock.calls[0][0]
    expect(args.data.billedAt).toBeNull()
    const json = await res.json()
    expect(json.billedAt).toBeNull()
  })

  it('テナント分離: where.tenantId は session の値で固定 (他テナントの id は P2025 で 404)', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const err = new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: 'x',
    })
    mockedUpdate.mockRejectedValueOnce(err)

    const res = await PATCH(makeRequest({ billed: true }), makeParams('d-other-tenant'))
    expect(res.status).toBe(404)
  })

  it('billed が boolean でない場合は 400', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const res = await PATCH(makeRequest({ billed: 'yes' }), makeParams())
    expect(res.status).toBe(400)
  })
})
