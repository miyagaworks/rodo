import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST/PATCH /api/dispatches/[id]/confirmation - 署名 Blob 変換の単体テスト。
 *
 * 設計書 P0-13 8.1 / 8.2 節:
 *   DataURL を受領したとき @vercel/blob.put が呼び出され、
 *   DB upsert の data には HTTPS URL が渡されること、
 *   shareToken 発行ロジックが URL（truthy）でも動くことを検証する。
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
    },
  },
}))

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}))

vi.mock('@paralleldrive/cuid2', () => ({
  createId: vi.fn(() => 'fixed-token-xxx'),
}))

import { POST, PATCH } from '@/app/api/dispatches/[id]/confirmation/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { put } from '@vercel/blob'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedDispatchFindFirst = prisma.dispatch
  .findFirst as unknown as ReturnType<typeof vi.fn>
const mockedUpsert = prisma.workConfirmation.upsert as unknown as ReturnType<
  typeof vi.fn
>
const mockedUpdate = prisma.workConfirmation.update as unknown as ReturnType<
  typeof vi.fn
>
const mockedPut = put as unknown as ReturnType<typeof vi.fn>

/**
 * 最小有効 PNG (透明 1×1 px) を base64 化したもの。
 * convertSignatureIfDataUrl の PNG マジックバイト検証を通過する。
 */
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
const VALID_DATAURL = `data:image/png;base64,${MINIMAL_PNG_BASE64}`

const baseUpserted = {
  id: 'cfm1',
  dispatchId: 'abc',
  shareToken: null as string | null,
  sharedAt: null as Date | null,
  postApprovalSignature: null as string | null,
  customerSignature: null,
  workDate: new Date('2026-04-29'),
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

function makeRequest(body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'PATCH'): Request {
  return new Request('http://localhost/api/dispatches/abc/confirmation', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = 'abc') {
  return { params: Promise.resolve({ id }) }
}

describe('POST/PATCH /api/dispatches/[id]/confirmation - 署名 Blob 変換', () => {
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
  })

  it('DataURL を受領したとき @vercel/blob.put が呼ばれ、URL が DB upsert に渡る', async () => {
    mockedPut.mockResolvedValueOnce({
      url: 'https://example.public.blob.vercel-storage.com/signatures/t1/abc/customer-1.png',
    })
    mockedUpsert.mockResolvedValueOnce({ ...baseUpserted, shareToken: null })

    const res = await PATCH(
      makeRequest({ customerSignature: VALID_DATAURL }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(mockedPut).toHaveBeenCalledTimes(1)
    const [path, _payload, options] = mockedPut.mock.calls[0]
    expect(path).toMatch(/^signatures\/t1\/abc\/customer-\d+\.png$/)
    expect(options).toEqual({ access: 'public', contentType: 'image/png' })

    expect(mockedUpsert).toHaveBeenCalledTimes(1)
    const upsertArgs = mockedUpsert.mock.calls[0][0]
    expect(upsertArgs.update.customerSignature).toBe(
      'https://example.public.blob.vercel-storage.com/signatures/t1/abc/customer-1.png',
    )
  })

  it('既に URL が送られた場合は put を呼ばずそのまま DB に渡す', async () => {
    const existingUrl =
      'https://example.public.blob.vercel-storage.com/signatures/t1/abc/customer-old.png'
    mockedUpsert.mockResolvedValueOnce({ ...baseUpserted, shareToken: null })

    const res = await PATCH(
      makeRequest({ customerSignature: existingUrl }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(mockedPut).not.toHaveBeenCalled()
    const upsertArgs = mockedUpsert.mock.calls[0][0]
    expect(upsertArgs.update.customerSignature).toBe(existingUrl)
  })

  it('3 署名すべて DataURL → put が 3 回並列で呼ばれる', async () => {
    mockedPut
      .mockResolvedValueOnce({ url: 'https://example.public.blob.vercel-storage.com/signatures/t1/abc/customer-1.png' })
      .mockResolvedValueOnce({ url: 'https://example.public.blob.vercel-storage.com/signatures/t1/abc/shop-1.png' })
      .mockResolvedValueOnce({ url: 'https://example.public.blob.vercel-storage.com/signatures/t1/abc/postApproval-1.png' })
    mockedUpsert.mockResolvedValueOnce({
      ...baseUpserted,
      shareToken: null,
      postApprovalSignature: 'https://example.public.blob.vercel-storage.com/signatures/t1/abc/postApproval-1.png',
    })
    mockedUpdate.mockResolvedValueOnce({
      ...baseUpserted,
      shareToken: 'fixed-token-xxx',
      sharedAt: new Date(),
    })

    const res = await POST(
      makeRequest(
        {
          customerSignature: VALID_DATAURL,
          shopSignature: VALID_DATAURL,
          postApprovalSignature: VALID_DATAURL,
        },
        'POST',
      ),
      makeParams(),
    )

    expect(res.status).toBe(201)
    expect(mockedPut).toHaveBeenCalledTimes(3)

    const upsertArgs = mockedUpsert.mock.calls[0][0]
    expect(upsertArgs.update.customerSignature).toMatch(/customer-1\.png$/)
    expect(upsertArgs.update.shopSignature).toMatch(/shop-1\.png$/)
    expect(upsertArgs.update.postApprovalSignature).toMatch(/postApproval-1\.png$/)
  })

  it('postApprovalSignature が URL のときも shareToken 発行ロジックは truthy で動く', async () => {
    const postApprovalUrl =
      'https://example.public.blob.vercel-storage.com/signatures/t1/abc/postApproval-1.png'
    mockedUpsert.mockResolvedValueOnce({
      ...baseUpserted,
      shareToken: null,
      postApprovalSignature: postApprovalUrl,
    })
    mockedUpdate.mockResolvedValueOnce({
      ...baseUpserted,
      shareToken: 'fixed-token-xxx',
      sharedAt: new Date(),
      postApprovalSignature: postApprovalUrl,
    })

    const res = await PATCH(
      makeRequest({ postApprovalSignature: postApprovalUrl }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(mockedPut).not.toHaveBeenCalled()
    expect(mockedUpdate).toHaveBeenCalledTimes(1)
    const updateArgs = mockedUpdate.mock.calls[0][0]
    expect(updateArgs.data.shareToken).toBe('fixed-token-xxx')
    const body = await res.json()
    expect(body.shareToken).toBe('fixed-token-xxx')
  })

  it('PNG マジックバイトに合致しない base64 は 400 を返す（put は呼ばれない）', async () => {
    const res = await PATCH(
      makeRequest({
        // valid prefix だがデコード結果が PNG マジックバイトでない
        customerSignature: 'data:image/png;base64,AAAAAAAA',
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect(mockedPut).not.toHaveBeenCalled()
    expect(mockedUpsert).not.toHaveBeenCalled()
    const body = await res.json()
    // SignatureValidationError か zod のどちらかで弾かれる（どちらでも 400）
    expect(body.error).toBeTruthy()
  })

  it('未認証は 401（put / upsert は呼ばれない）', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await PATCH(
      makeRequest({ customerSignature: VALID_DATAURL }),
      makeParams(),
    )

    expect(res.status).toBe(401)
    expect(mockedPut).not.toHaveBeenCalled()
    expect(mockedUpsert).not.toHaveBeenCalled()
  })

  it('別テナントの dispatch は 404（put / upsert は呼ばれない）', async () => {
    mockedDispatchFindFirst.mockResolvedValueOnce(null)

    const res = await PATCH(
      makeRequest({ customerSignature: VALID_DATAURL }),
      makeParams(),
    )

    expect(res.status).toBe(404)
    expect(mockedPut).not.toHaveBeenCalled()
    expect(mockedUpsert).not.toHaveBeenCalled()
  })

  it('TRANSFERRED dispatch は 403（put / upsert は呼ばれない）', async () => {
    mockedDispatchFindFirst.mockResolvedValueOnce({
      id: 'abc',
      tenantId: 't1',
      status: 'TRANSFERRED',
    })

    const res = await PATCH(
      makeRequest({ customerSignature: VALID_DATAURL }),
      makeParams(),
    )

    expect(res.status).toBe(403)
    expect(mockedPut).not.toHaveBeenCalled()
    expect(mockedUpsert).not.toHaveBeenCalled()
  })
})
