import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/breaks/active のテスト。
 *
 * - 401 / 200 / 500 のステータス検証
 * - レスポンスに remainingSeconds と serverNow が含まれる
 * - 60 分超過の古いレコードは closeStaleBreaks により自動クローズされ、
 *   その結果 active がなくなり 404 を返す
 * - pauseTime ありの場合、remainingSeconds は calculateUsedBreakMs と同じ計算結果
 */

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    breakRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { GET } from '@/app/api/breaks/active/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { BREAK_DURATION_SECONDS } from '@/lib/constants/break'
import { calculateUsedBreakMs } from '@/lib/breakUsage'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindFirst = prisma.breakRecord.findFirst as unknown as ReturnType<
  typeof vi.fn
>
const mockedFindMany = prisma.breakRecord.findMany as unknown as ReturnType<
  typeof vi.fn
>
const mockedUpdate = prisma.breakRecord.update as unknown as ReturnType<
  typeof vi.fn
>

describe('GET /api/breaks/active', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // closeStaleBreaks 内の findMany はデフォルト「該当なし」
    mockedFindMany.mockResolvedValue([])
    mockedUpdate.mockResolvedValue({})
  })

  it('未認証の場合は 401 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('アクティブな休憩がない場合は 404 を返す', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce(null)

    const res = await GET()
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'No active break' })
  })

  it('アクティブな休憩がある場合、remainingSeconds と serverNow を含むレスポンスを返す', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    // 10 分前に開始したアクティブ休憩
    const startTime = new Date(Date.now() - 600 * 1000)
    mockedFindFirst.mockResolvedValueOnce({
      id: 'b-active',
      userId: 'u1',
      tenantId: 't1',
      startTime,
      endTime: null,
      pauseTime: null,
      resumeTime: null,
      totalBreakMinutes: null,
      dispatchId: null,
      createdAt: new Date(),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.id).toBe('b-active')
    expect(typeof body.remainingSeconds).toBe('number')
    expect(typeof body.serverNow).toBe('string')
    // 10 分経過なので残りは BREAK_DURATION_SECONDS - 600 付近
    expect(body.remainingSeconds).toBeGreaterThanOrEqual(
      BREAK_DURATION_SECONDS - 601,
    )
    expect(body.remainingSeconds).toBeLessThanOrEqual(
      BREAK_DURATION_SECONDS - 599,
    )
    // serverNow は ISO 文字列
    expect(new Date(body.serverNow).toISOString()).toBe(body.serverNow)
  })

  it('pauseTime ありの場合、remainingSeconds は calculateUsedBreakMs と同じ結果になる', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    const now = Date.now()
    // 30 分前に開始 → 10 分前に pause（実消化 20 分）
    const startTime = new Date(now - 30 * 60 * 1000)
    const pauseTime = new Date(now - 10 * 60 * 1000)
    mockedFindFirst.mockResolvedValueOnce({
      id: 'b-paused',
      userId: 'u1',
      tenantId: 't1',
      startTime,
      endTime: null,
      pauseTime,
      resumeTime: null,
      totalBreakMinutes: null,
      dispatchId: null,
      createdAt: new Date(),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()

    // calculateUsedBreakMs と同じ結果になることを検証する
    // serverNow からそのときの now を再構築して比較
    const serverNow = new Date(body.serverNow)
    const usedMs = calculateUsedBreakMs(
      [
        {
          startTime,
          endTime: null,
          pauseTime,
          resumeTime: null,
        },
      ],
      startTime,
      serverNow,
    )
    const expected = Math.max(
      0,
      Math.floor(BREAK_DURATION_SECONDS - usedMs / 1000),
    )
    expect(body.remainingSeconds).toBe(expected)
    // 実消化 20 分なので残り 40 分 = 2400 秒付近
    expect(body.remainingSeconds).toBeGreaterThanOrEqual(2399)
    expect(body.remainingSeconds).toBeLessThanOrEqual(2401)
  })

  it('60 分超過の古い未終了レコードは自動クローズされ、active なしとして 404 を返す', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })

    // closeStaleBreaks 内の findMany が古いレコードを返す
    const now = Date.now()
    const staleStart = new Date(now - 90 * 60 * 1000)
    mockedFindMany.mockReset()
    mockedFindMany.mockResolvedValueOnce([
      { id: 'b-stale', startTime: staleStart, pauseTime: null },
    ])

    // close した後の findFirst は「アクティブなし」
    mockedFindFirst.mockResolvedValueOnce(null)

    const res = await GET()

    // update が呼ばれていること
    expect(mockedUpdate).toHaveBeenCalledTimes(1)
    expect(mockedUpdate.mock.calls[0][0].where).toEqual({ id: 'b-stale' })

    // 結果は 404
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'No active break' })
  })

  it('remainingSeconds は 0 未満にならない（既に上限消化済みの境界ケース）', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    const now = Date.now()
    // 59 分 30 秒前に開始（まだクローズ対象ではないが、ほぼ満了）
    // closeStaleBreaks の判定は elapsedMs > limitMs。59:30 経過は触らない。
    const startTime = new Date(now - (59 * 60 + 30) * 1000)
    mockedFindFirst.mockResolvedValueOnce({
      id: 'b-near-limit',
      userId: 'u1',
      tenantId: 't1',
      startTime,
      endTime: null,
      pauseTime: null,
      resumeTime: null,
      totalBreakMinutes: null,
      dispatchId: null,
      createdAt: new Date(),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.remainingSeconds).toBeGreaterThanOrEqual(0)
    // 残り約 30 秒
    expect(body.remainingSeconds).toBeLessThanOrEqual(31)
  })

  it('DB エラーの場合は 500 を返す', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    // closeStaleBreaks 内の findMany が失敗 → 例外伝播 → 500
    mockedFindMany.mockReset()
    mockedFindMany.mockRejectedValueOnce(new Error('DB failure'))

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal Server Error' })
    errSpy.mockRestore()
  })
})
