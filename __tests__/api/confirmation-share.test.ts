import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST / PATCH /api/dispatches/[id]/confirmation
 *
 * Phase 5: shareToken 自動生成ロジックの単体テスト。
 *
 *  - postApprovalSignature が送られてきた時点で shareToken を発行する
 *  - 既に shareToken がある場合は再発行しない
 *  - postApprovalSignature が null / 空文字の場合は発行しない
 */

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dispatch: {
      findFirst: vi.fn(),
    },
    workConfirmation: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@paralleldrive/cuid2', () => ({
  createId: vi.fn(() => 'fixed-token-xxx'),
}))

import { POST, PATCH } from '@/app/api/dispatches/[id]/confirmation/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { createId } from '@paralleldrive/cuid2'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedDispatchFindFirst = prisma.dispatch.findFirst as unknown as ReturnType<
  typeof vi.fn
>
const mockedUpsert = prisma.workConfirmation.upsert as unknown as ReturnType<
  typeof vi.fn
>
const mockedUpdate = prisma.workConfirmation.update as unknown as ReturnType<
  typeof vi.fn
>
const mockedCreateId = createId as unknown as ReturnType<typeof vi.fn>

function makeRequest(
  body: Record<string, unknown>,
  method: 'POST' | 'PATCH' = 'PATCH',
): Request {
  return new Request('http://localhost/api/dispatches/abc/confirmation', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = 'abc') {
  return { params: Promise.resolve({ id }) }
}

const baseUpserted = {
  id: 'cfm1',
  dispatchId: 'abc',
  shareToken: null as string | null,
  sharedAt: null as Date | null,
  postApprovalSignature: 'data:image/png;base64,sig',
  customerSignature: null,
  workDate: new Date('2026-04-26'),
  preApprovalChecks: null,
  customerName: null,
  customerDate: null,
  vehicleType: null,
  registrationNumber: null,
  workContent: null,
  shopCompanyName: null,
  shopContactName: null,
  shopSignature: null,
  postApprovalCheck: false,
  postApprovalName: null,
  batteryDetails: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('POST/PATCH /api/dispatches/[id]/confirmation - shareToken 生成', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedDispatchFindFirst.mockResolvedValue({
      id: 'abc',
      tenantId: 't1',
      status: 'COMPLETED',
    })
    mockedCreateId.mockReturnValue('fixed-token-xxx')
  })

  describe('POST', () => {
    it('postApprovalSignature 送信 + shareToken 未発行 のとき shareToken を新規発行する', async () => {
      mockedUpsert.mockResolvedValueOnce({ ...baseUpserted, shareToken: null })
      mockedUpdate.mockResolvedValueOnce({
        ...baseUpserted,
        shareToken: 'fixed-token-xxx',
        sharedAt: new Date('2026-04-26T00:00:00Z'),
      })

      const res = await POST(
        makeRequest(
          { postApprovalSignature: 'data:image/png;base64,sig' },
          'POST',
        ),
        makeParams(),
      )

      expect(res.status).toBe(201)
      expect(mockedUpdate).toHaveBeenCalledTimes(1)
      const updateArgs = mockedUpdate.mock.calls[0][0]
      expect(updateArgs.where).toEqual({ id: 'cfm1' })
      expect(updateArgs.data.shareToken).toBe('fixed-token-xxx')
      expect(updateArgs.data.sharedAt).toBeInstanceOf(Date)

      const body = await res.json()
      expect(body.shareToken).toBe('fixed-token-xxx')
    })
  })

  describe('PATCH', () => {
    it('postApprovalSignature 送信 + shareToken 未発行 のとき shareToken を新規発行する', async () => {
      mockedUpsert.mockResolvedValueOnce({ ...baseUpserted, shareToken: null })
      mockedUpdate.mockResolvedValueOnce({
        ...baseUpserted,
        shareToken: 'fixed-token-xxx',
        sharedAt: new Date('2026-04-26T00:00:00Z'),
      })

      const res = await PATCH(
        makeRequest({ postApprovalSignature: 'data:image/png;base64,sig' }),
        makeParams(),
      )

      expect(res.status).toBe(200)
      expect(mockedUpdate).toHaveBeenCalledTimes(1)
      const updateArgs = mockedUpdate.mock.calls[0][0]
      expect(updateArgs.data.shareToken).toBe('fixed-token-xxx')
      expect(updateArgs.data.sharedAt).toBeInstanceOf(Date)

      const body = await res.json()
      expect(body.shareToken).toBe('fixed-token-xxx')
    })
  })

  describe('既に shareToken がある場合は再発行しない', () => {
    it('POST: shareToken が存在 → update は呼ばれない', async () => {
      mockedUpsert.mockResolvedValueOnce({
        ...baseUpserted,
        shareToken: 'existing-token',
        sharedAt: new Date('2026-04-25'),
      })

      const res = await POST(
        makeRequest(
          { postApprovalSignature: 'data:image/png;base64,sig' },
          'POST',
        ),
        makeParams(),
      )

      expect(res.status).toBe(201)
      expect(mockedUpdate).not.toHaveBeenCalled()
      expect(mockedCreateId).not.toHaveBeenCalled()

      const body = await res.json()
      expect(body.shareToken).toBe('existing-token')
    })

    it('PATCH: shareToken が存在 → update は呼ばれない', async () => {
      mockedUpsert.mockResolvedValueOnce({
        ...baseUpserted,
        shareToken: 'existing-token',
        sharedAt: new Date('2026-04-25'),
      })

      const res = await PATCH(
        makeRequest({ postApprovalSignature: 'data:image/png;base64,sig' }),
        makeParams(),
      )

      expect(res.status).toBe(200)
      expect(mockedUpdate).not.toHaveBeenCalled()
      expect(mockedCreateId).not.toHaveBeenCalled()
    })
  })

  describe('postApprovalSignature が無い / 空 のときは発行しない', () => {
    it('PATCH: postApprovalSignature: null → update は呼ばれない', async () => {
      mockedUpsert.mockResolvedValueOnce({ ...baseUpserted, shareToken: null })

      const res = await PATCH(
        makeRequest({ postApprovalSignature: null }),
        makeParams(),
      )

      expect(res.status).toBe(200)
      expect(mockedUpdate).not.toHaveBeenCalled()
      expect(mockedCreateId).not.toHaveBeenCalled()
    })

    it('PATCH: postApprovalSignature: "" → update は呼ばれない (falsy 判定)', async () => {
      mockedUpsert.mockResolvedValueOnce({ ...baseUpserted, shareToken: null })

      const res = await PATCH(
        makeRequest({ postApprovalSignature: '' }),
        makeParams(),
      )

      expect(res.status).toBe(200)
      expect(mockedUpdate).not.toHaveBeenCalled()
      expect(mockedCreateId).not.toHaveBeenCalled()
    })

    it('PATCH: postApprovalSignature を含まない body → update は呼ばれない', async () => {
      mockedUpsert.mockResolvedValueOnce({ ...baseUpserted, shareToken: null })

      const res = await PATCH(makeRequest({ notes: 'メモのみ' }), makeParams())

      expect(res.status).toBe(200)
      expect(mockedUpdate).not.toHaveBeenCalled()
      expect(mockedCreateId).not.toHaveBeenCalled()
    })
  })
})
