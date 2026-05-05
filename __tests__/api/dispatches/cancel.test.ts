import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/dispatches/[id]/cancel
 *
 * 「出動中の浮き案件防止」Phase 1 で新設された案件キャンセル専用ルートのテスト
 * （Phase 5.5 / 2026-05-05 仕様変更で帰社後 && isDraft===false もキャンセル可に拡張）。
 *
 * 検証範囲:
 *  - 認証 / 認可（隊員 vs ADMIN）
 *  - キャンセル可能な状態と不可能な状態の 409 ガード
 *  - Phase 5.5 拡張: 帰社後 isDraft=false でキャンセル成功 / isDraft=true で 409 + 専用メッセージ
 *  - 存在しない案件の 404
 *  - 楽観的ロック例外時の 404
 */

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dispatch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { POST } from '@/app/api/dispatches/[id]/cancel/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindUnique = prisma.dispatch.findUnique as unknown as ReturnType<
  typeof vi.fn
>
const mockedUpdate = prisma.dispatch.update as unknown as ReturnType<
  typeof vi.fn
>

function makeRequest(): Request {
  return new Request('http://localhost/api/dispatches/abc/cancel', {
    method: 'POST',
  })
}

function makeParams(id = 'abc') {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/dispatches/[id]/cancel', () => {
  const userId = 'u-self'
  const tenantId = 't1'
  const RETURN_DATE = new Date('2026-05-04T10:00:00Z')

  beforeEach(() => {
    vi.clearAllMocks()
    mockedAuth.mockResolvedValue({
      user: { userId, tenantId, role: 'MEMBER' },
    })
  })

  it('未認証は 401 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(mockedFindUnique).not.toHaveBeenCalled()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('対象案件が存在しない場合は 404 を返す', async () => {
    mockedFindUnique.mockResolvedValueOnce(null)

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'Dispatch not found' })
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('隊員が他人の案件をキャンセルしようとすると 403 を返す', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId: 'someone-else',
      status: 'DISPATCHED',
      returnTime: null,
      isDraft: false,
    })

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ error: 'Forbidden' })
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('ADMIN は他人の案件もキャンセルできる', async () => {
    mockedAuth.mockReset()
    mockedAuth.mockResolvedValue({
      user: { userId: 'admin-id', tenantId, role: 'ADMIN' },
    })
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId: 'someone-else',
      status: 'DISPATCHED',
      returnTime: null,
      isDraft: false,
    })
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', status: 'CANCELLED' })

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      ok: true,
      dispatch: { id: 'abc', status: 'CANCELLED' },
    })
    expect(mockedUpdate).toHaveBeenCalledTimes(1)
  })

  it('隊員が自分の DISPATCHED 案件をキャンセルできる（200 / status=CANCELLED）', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId,
      status: 'DISPATCHED',
      returnTime: null,
      isDraft: false,
    })
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', status: 'CANCELLED' })

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      ok: true,
      dispatch: { id: 'abc', status: 'CANCELLED' },
    })
    const updateArgs = mockedUpdate.mock.calls[0][0]
    expect(updateArgs.data).toEqual({ status: 'CANCELLED' })
    expect(updateArgs.where).toEqual({ id: 'abc', tenantId })
  })

  it.each([
    ['ONSITE'],
    ['WORKING'],
    ['TRANSPORTING'],
  ])('隊員が自分の %s 案件をキャンセルできる', async (status) => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId,
      status,
      returnTime: null,
      isDraft: false,
    })
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', status: 'CANCELLED' })

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(200)
  })

  it('COMPLETED && returnTime IS NULL（帰社中）はキャンセル可能', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId,
      status: 'COMPLETED',
      returnTime: null,
      isDraft: false,
    })
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', status: 'CANCELLED' })

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispatch.status).toBe('CANCELLED')
  })

  // Phase 5.5 拡張（2026-05-05）
  it('COMPLETED && returnTime IS NOT NULL && isDraft === false（帰社後・書類未着手）はキャンセル可能', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId,
      status: 'COMPLETED',
      returnTime: RETURN_DATE,
      isDraft: false,
    })
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', status: 'CANCELLED' })

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispatch.status).toBe('CANCELLED')
    expect(mockedUpdate).toHaveBeenCalledTimes(1)
  })

  it('RETURNED && returnTime IS NOT NULL && isDraft === false（帰社後・書類未着手）はキャンセル可能', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId,
      status: 'RETURNED',
      returnTime: RETURN_DATE,
      isDraft: false,
    })
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', status: 'CANCELLED' })

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispatch.status).toBe('CANCELLED')
  })

  it('COMPLETED && isDraft === true（書類作成中）は 409 + 専用メッセージ', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId,
      status: 'COMPLETED',
      returnTime: RETURN_DATE,
      isDraft: true,
    })

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({
      error:
        '書類作成中の案件はキャンセルできません。書類作成画面から操作してください',
    })
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('RETURNED && isDraft === true（書類作成中）は 409 + 専用メッセージ', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId,
      status: 'RETURNED',
      returnTime: RETURN_DATE,
      isDraft: true,
    })

    const res = await POST(makeRequest(), makeParams())

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({
      error:
        '書類作成中の案件はキャンセルできません。書類作成画面から操作してください',
    })
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it.each([['STANDBY'], ['STORED'], ['CANCELLED'], ['TRANSFERRED']])(
    '%s 状態の案件は 409（汎用メッセージ）',
    async (status) => {
      mockedFindUnique.mockResolvedValueOnce({
        id: 'abc',
        userId,
        status,
        returnTime: null,
        isDraft: false,
      })

      const res = await POST(makeRequest(), makeParams())

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body).toEqual({ error: 'キャンセルできない状態です' })
      expect(mockedUpdate).not.toHaveBeenCalled()
    },
  )

  it('Prisma P2025（更新時にレコード消失）は 404 にマッピングされる', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId,
      status: 'DISPATCHED',
      returnTime: null,
      isDraft: false,
    })
    const prismaErr = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: 'test' },
    )
    mockedUpdate.mockRejectedValueOnce(prismaErr)

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeRequest(), makeParams())
    errSpy.mockRestore()

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'Dispatch not found' })
  })

  it('予期しない例外は 500 を返す', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      id: 'abc',
      userId,
      status: 'DISPATCHED',
      returnTime: null,
      isDraft: false,
    })
    mockedUpdate.mockRejectedValueOnce(new Error('DB failure'))

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeRequest(), makeParams())
    errSpy.mockRestore()

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
