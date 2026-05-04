import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/dispatches/active
 *
 * 「出動中の浮き案件防止」Phase 1 で新設された active dispatch 取得ルートのテスト。
 *
 * 検証範囲:
 *  - 認証必須（401）
 *  - active な Dispatch があれば dispatch 情報を返す（subPhase 含む）
 *  - active がなければ { dispatch: null }
 *  - COMPLETED && returnTime IS NULL のみが残っていても active として扱われる
 *  - DB 例外は 500
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

import { GET } from '@/app/api/dispatches/active/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindFirst = prisma.dispatch.findFirst as unknown as ReturnType<
  typeof vi.fn
>

describe('GET /api/dispatches/active', () => {
  const userId = 'u1'
  const tenantId = 't1'

  beforeEach(() => {
    vi.clearAllMocks()
    mockedAuth.mockResolvedValue({
      user: { userId, tenantId, role: 'MEMBER' },
    })
  })

  it('未認証は 401 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(mockedFindFirst).not.toHaveBeenCalled()
  })

  it('active な Dispatch があれば subPhase 付きで返す（DISPATCHED → DISPATCHING）', async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: 'd1',
      dispatchNumber: '20260504001',
      status: 'DISPATCHED',
      returnTime: null,
      type: 'ONSITE',
      assistance: { name: '下田救援' },
    })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      dispatch: {
        id: 'd1',
        dispatchNumber: '20260504001',
        status: 'DISPATCHED',
        returnTime: null,
        type: 'ONSITE',
        subPhase: 'DISPATCHING',
        assistance: { name: '下田救援' },
      },
    })

    // クエリの主要条件確認
    const callArgs = mockedFindFirst.mock.calls[0][0]
    expect(callArgs.where.tenantId).toBe(tenantId)
    expect(callArgs.where.userId).toBe(userId)
    expect(callArgs.where.OR).toBeDefined()
  })

  it('ONSITE → ONSITE subPhase', async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: 'd2',
      dispatchNumber: '20260504002',
      status: 'ONSITE',
      returnTime: null,
      type: 'TRANSPORT',
      assistance: { name: '下田救援' },
    })

    const res = await GET()
    const body = await res.json()
    expect(body.dispatch.subPhase).toBe('ONSITE')
  })

  it('TRANSPORTING → TRANSPORTING subPhase', async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: 'd3',
      dispatchNumber: '20260504003',
      status: 'TRANSPORTING',
      returnTime: null,
      type: 'TRANSPORT',
      assistance: { name: '下田救援' },
    })

    const res = await GET()
    const body = await res.json()
    expect(body.dispatch.subPhase).toBe('TRANSPORTING')
  })

  it('COMPLETED && returnTime IS NULL（帰社中）が active として返る', async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: 'd4',
      dispatchNumber: '20260504004',
      status: 'COMPLETED',
      returnTime: null,
      type: 'ONSITE',
      assistance: { name: '下田救援' },
    })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispatch.subPhase).toBe('RETURNING_TO_BASE')
    expect(body.dispatch.status).toBe('COMPLETED')
  })

  it('active 案件なしの場合は { dispatch: null } を返す', async () => {
    mockedFindFirst.mockResolvedValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ dispatch: null })
  })

  it('全案件が終端状態（findFirst が null）の場合も { dispatch: null }', async () => {
    // findFirst の where 条件で終端状態は除外されるため、
    // 結果は null。レスポンスは上記と同じ。
    mockedFindFirst.mockResolvedValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ dispatch: null })
  })

  it('DB エラーの場合は 500 を返す', async () => {
    mockedFindFirst.mockRejectedValueOnce(new Error('DB failure'))

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    errSpy.mockRestore()

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
