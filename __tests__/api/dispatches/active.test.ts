import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/dispatches/active
 *
 * 「出動中の浮き案件防止」Phase 1 で新設された active dispatch 取得ルートのテスト
 * （Phase 5.5 / 2026-05-05 仕様変更で帰社後 isDraft=false も active として返す
 * 拡張に対応）。
 *
 * 検証範囲:
 *  - 認証必須（401）
 *  - active な Dispatch があれば dispatch 情報を返す（subPhase / isDraft 含む）
 *  - active がなければ { dispatch: null }
 *  - COMPLETED && returnTime IS NULL のみが残っていても active として扱われる
 *  - Phase 5.5: COMPLETED/RETURNED && returnTime IS NOT NULL && isDraft=false が active
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
  const RETURN_DATE = new Date('2026-05-04T10:00:00Z')

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

  it('active な Dispatch があれば subPhase / isDraft 付きで返す（DISPATCHED → DISPATCHING）', async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: 'd1',
      dispatchNumber: '20260504001',
      status: 'DISPATCHED',
      returnTime: null,
      type: 'ONSITE',
      isDraft: false,
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
        isDraft: false,
        subPhase: 'DISPATCHING',
        assistance: { name: '下田救援' },
      },
    })

    // クエリの主要条件確認
    const callArgs = mockedFindFirst.mock.calls[0][0]
    expect(callArgs.where.tenantId).toBe(tenantId)
    expect(callArgs.where.userId).toBe(userId)
    expect(callArgs.where.OR).toBeDefined()
    // Phase 5.5: where 句に帰社後 isDraft=false ケースが含まれていることを確認
    const orClauses = callArgs.where.OR as Array<Record<string, unknown>>
    const phase55Clause = orClauses.find(
      (c) =>
        Array.isArray((c.status as { in?: string[] })?.in) &&
        ((c.status as { in?: string[] }).in ?? []).includes('RETURNED'),
    )
    expect(phase55Clause).toBeDefined()
    expect(phase55Clause).toMatchObject({ isDraft: false })
    // select に isDraft が含まれている
    expect(callArgs.select.isDraft).toBe(true)
  })

  it('ONSITE → ONSITE subPhase', async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: 'd2',
      dispatchNumber: '20260504002',
      status: 'ONSITE',
      returnTime: null,
      type: 'TRANSPORT',
      isDraft: false,
      assistance: { name: '下田救援' },
    })

    const res = await GET()
    const body = await res.json()
    expect(body.dispatch.subPhase).toBe('ONSITE')
    expect(body.dispatch.isDraft).toBe(false)
  })

  it('TRANSPORTING → TRANSPORTING subPhase', async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: 'd3',
      dispatchNumber: '20260504003',
      status: 'TRANSPORTING',
      returnTime: null,
      type: 'TRANSPORT',
      isDraft: false,
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
      isDraft: false,
      assistance: { name: '下田救援' },
    })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispatch.subPhase).toBe('RETURNING_TO_BASE')
    expect(body.dispatch.status).toBe('COMPLETED')
  })

  // Phase 5.5（2026-05-05）拡張
  it('COMPLETED && returnTime IS NOT NULL && isDraft === false（帰社後・書類未着手）が active として返る', async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: 'd5',
      dispatchNumber: '20260505001',
      status: 'COMPLETED',
      returnTime: RETURN_DATE,
      type: 'ONSITE',
      isDraft: false,
      assistance: { name: '下田救援' },
    })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispatch.id).toBe('d5')
    expect(body.dispatch.isDraft).toBe(false)
    expect(body.dispatch.status).toBe('COMPLETED')
    expect(body.dispatch.returnTime).not.toBeNull()
  })

  it('RETURNED && returnTime IS NOT NULL && isDraft === false（帰社後・書類未着手）が active として返る', async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: 'd6',
      dispatchNumber: '20260505002',
      status: 'RETURNED',
      returnTime: RETURN_DATE,
      type: 'TRANSPORT',
      isDraft: false,
      assistance: { name: '下田救援' },
    })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispatch.id).toBe('d6')
    expect(body.dispatch.isDraft).toBe(false)
    expect(body.dispatch.status).toBe('RETURNED')
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
    // 帰社後 isDraft=true や CANCELLED / TRANSFERRED 等は where から除外される。
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
