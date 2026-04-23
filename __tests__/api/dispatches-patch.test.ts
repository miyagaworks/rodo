import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PATCH /api/dispatches/[id]
 *
 * Phase B で追加された ODO フィールドが
 *   1) allowed list に載り PATCH で保存されること
 *   2) type 変更時に transportStartOdo / completionOdo のみ null 化されること
 *   3) type 変更時でも arrivalOdo / returnOdo / departureOdo は保持されること
 * を検証する。
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
    insuranceCompany: {
      findFirst: vi.fn(),
    },
  },
}))

import { PATCH } from '@/app/api/dispatches/[id]/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindUnique = prisma.dispatch.findUnique as unknown as ReturnType<
  typeof vi.fn
>
const mockedUpdate = prisma.dispatch.update as unknown as ReturnType<
  typeof vi.fn
>

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/dispatches/abc', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = 'abc') {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/dispatches/[id] - Phase B ODO fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
  })

  it('departureOdo を受け入れて update に渡す (既存バグ回帰テスト)', async () => {
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', departureOdo: 10000 })

    const res = await PATCH(makeRequest({ departureOdo: 10000 }), makeParams())

    expect(res.status).toBe(200)
    expect(mockedUpdate).toHaveBeenCalledTimes(1)
    const updateArgs = mockedUpdate.mock.calls[0][0]
    expect(updateArgs.data).toMatchObject({ departureOdo: 10000 })
  })

  it('arrivalOdo を受け入れて update に渡す', async () => {
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', arrivalOdo: 10010 })

    const res = await PATCH(makeRequest({ arrivalOdo: 10010 }), makeParams())

    expect(res.status).toBe(200)
    const updateArgs = mockedUpdate.mock.calls[0][0]
    expect(updateArgs.data).toMatchObject({ arrivalOdo: 10010 })
  })

  it('transportStartOdo を受け入れて update に渡す', async () => {
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', transportStartOdo: 10020 })

    const res = await PATCH(
      makeRequest({ transportStartOdo: 10020 }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    const updateArgs = mockedUpdate.mock.calls[0][0]
    expect(updateArgs.data).toMatchObject({ transportStartOdo: 10020 })
  })

  it('returnOdo を受け入れて update に渡す', async () => {
    mockedUpdate.mockResolvedValueOnce({ id: 'abc', returnOdo: 10200 })

    const res = await PATCH(makeRequest({ returnOdo: 10200 }), makeParams())

    expect(res.status).toBe(200)
    const updateArgs = mockedUpdate.mock.calls[0][0]
    expect(updateArgs.data).toMatchObject({ returnOdo: 10200 })
  })

  it('4 つの新 ODO フィールドを一括で受け入れて update に渡す', async () => {
    mockedUpdate.mockResolvedValueOnce({ id: 'abc' })

    const res = await PATCH(
      makeRequest({
        departureOdo: 10000,
        arrivalOdo: 10010,
        transportStartOdo: 10020,
        returnOdo: 10200,
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    const updateArgs = mockedUpdate.mock.calls[0][0]
    expect(updateArgs.data).toMatchObject({
      departureOdo: 10000,
      arrivalOdo: 10010,
      transportStartOdo: 10020,
      returnOdo: 10200,
    })
  })

  describe('type 変更時のクリア処理', () => {
    it('TRANSPORTING 状態から type 変更時、transportStartOdo と completionOdo が null にクリアされる', async () => {
      // 1 回目: type 変更バリデーション用 findUnique
      mockedFindUnique.mockResolvedValueOnce({
        status: 'TRANSPORTING',
        type: 'TRANSPORT',
        originalType: null,
      })
      // 2 回目: type 切替時 current 取得
      mockedFindUnique.mockResolvedValueOnce({
        originalType: null,
        type: 'TRANSPORT',
        status: 'TRANSPORTING',
      })
      mockedUpdate.mockResolvedValueOnce({ id: 'abc' })

      const res = await PATCH(
        makeRequest({ type: 'onsite' }),
        makeParams(),
      )

      expect(res.status).toBe(200)
      const updateArgs = mockedUpdate.mock.calls[0][0]
      // クリア対象
      expect(updateArgs.data.transportStartOdo).toBeNull()
      expect(updateArgs.data.completionOdo).toBeNull()
      // ONSITE に戻されている
      expect(updateArgs.data.status).toBe('ONSITE')
      // DB enum に変換されている
      expect(updateArgs.data.type).toBe('ONSITE')
    })

    it('type 変更時、arrivalOdo / returnOdo / departureOdo は data に含まれない (保持)', async () => {
      mockedFindUnique.mockResolvedValueOnce({
        status: 'COMPLETED',
        type: 'TRANSPORT',
        originalType: null,
      })
      mockedFindUnique.mockResolvedValueOnce({
        originalType: null,
        type: 'TRANSPORT',
        status: 'COMPLETED',
      })
      mockedUpdate.mockResolvedValueOnce({ id: 'abc' })

      const res = await PATCH(
        makeRequest({ type: 'onsite' }),
        makeParams(),
      )

      expect(res.status).toBe(200)
      const updateArgs = mockedUpdate.mock.calls[0][0]
      // 保持対象フィールドは data に含まれない (undefined)
      expect(updateArgs.data.arrivalOdo).toBeUndefined()
      expect(updateArgs.data.returnOdo).toBeUndefined()
      expect(updateArgs.data.departureOdo).toBeUndefined()
    })

    it('RETURNED 状態から type 変更時も transportStartOdo と completionOdo がクリアされる', async () => {
      mockedFindUnique.mockResolvedValueOnce({
        status: 'RETURNED',
        type: 'TRANSPORT',
        originalType: null,
      })
      mockedFindUnique.mockResolvedValueOnce({
        originalType: null,
        type: 'TRANSPORT',
        status: 'RETURNED',
      })
      mockedUpdate.mockResolvedValueOnce({ id: 'abc' })

      const res = await PATCH(
        makeRequest({ type: 'onsite' }),
        makeParams(),
      )

      expect(res.status).toBe(200)
      const updateArgs = mockedUpdate.mock.calls[0][0]
      expect(updateArgs.data.transportStartOdo).toBeNull()
      expect(updateArgs.data.completionOdo).toBeNull()
    })

    it('ONSITE 状態 (AFTER_ONSITE_STATUSES 外) から type 変更時は ODO クリアが発生しない', async () => {
      mockedFindUnique.mockResolvedValueOnce({
        status: 'ONSITE',
        type: 'ONSITE',
        originalType: null,
      })
      mockedFindUnique.mockResolvedValueOnce({
        originalType: null,
        type: 'ONSITE',
        status: 'ONSITE',
      })
      mockedUpdate.mockResolvedValueOnce({ id: 'abc' })

      const res = await PATCH(
        makeRequest({ type: 'transport' }),
        makeParams(),
      )

      expect(res.status).toBe(200)
      const updateArgs = mockedUpdate.mock.calls[0][0]
      // AFTER_ONSITE_STATUSES 外なので ODO クリアは行われない
      expect(updateArgs.data.transportStartOdo).toBeUndefined()
      expect(updateArgs.data.completionOdo).toBeUndefined()
    })
  })

  it('未認証は 401 を返す', async () => {
    mockedAuth.mockReset()
    mockedAuth.mockResolvedValueOnce(null)

    const res = await PATCH(
      makeRequest({ departureOdo: 100 }),
      makeParams(),
    )

    expect(res.status).toBe(401)
  })

  it('空オブジェクト body は 400 (Empty body refine)', async () => {
    const res = await PATCH(makeRequest({}), makeParams())

    expect(res.status).toBe(400)
  })

  it('ODO に負値が来たら 400 (Zod バリデーション)', async () => {
    const res = await PATCH(
      makeRequest({ departureOdo: -1 }),
      makeParams(),
    )

    expect(res.status).toBe(400)
  })
})
