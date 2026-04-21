import { describe, it, expect, vi, beforeEach } from 'vitest'

// auth と prisma をモック化
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    breakRecord: {
      findMany: vi.fn(),
    },
  },
}))

import { GET } from '@/app/api/breaks/limit-status/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindMany = prisma.breakRecord.findMany as unknown as ReturnType<
  typeof vi.fn
>

describe('GET /api/breaks/limit-status', () => {
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

  it('休憩記録がない場合、usedSeconds=0 / canStartBreak=true', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindMany.mockResolvedValueOnce([])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.limitSeconds).toBe(3600)
    expect(body.usedSeconds).toBe(0)
    expect(body.remainingSeconds).toBe(3600)
    expect(body.canStartBreak).toBe(true)
    expect(typeof body.windowStart).toBe('string')
    expect(typeof body.windowEnd).toBe('string')
  })

  it('Cache-Control: no-store ヘッダが設定されている', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindMany.mockResolvedValueOnce([])

    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('累計 30 分 → canStartBreak=true, remainingSeconds=1800', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    const now = Date.now()
    // 30 分前に開始、今終了した休憩
    mockedFindMany.mockResolvedValueOnce([
      {
        startTime: new Date(now - 30 * 60 * 1000),
        endTime: new Date(now),
        pauseTime: null,
        resumeTime: null,
      },
    ])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    // 多少の時間誤差を許容
    expect(body.usedSeconds).toBeGreaterThanOrEqual(1799)
    expect(body.usedSeconds).toBeLessThanOrEqual(1801)
    expect(body.canStartBreak).toBe(true)
    expect(body.remainingSeconds).toBeGreaterThanOrEqual(1799)
  })

  it('累計 60 分ちょうど → canStartBreak=false, remainingSeconds=0', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    const now = Date.now()
    // startTime === endTime - 3600s。windowEnd = now, startTime = now-3600s で
    // effectiveEnd = endTime。endTime も now と同時刻なので effectiveEnd が now と
    // 一致し、実消化は 3600 秒。windowStart は now-86400s のため全区間がウィンドウ内。
    mockedFindMany.mockResolvedValueOnce([
      {
        startTime: new Date(now - 3600 * 1000),
        endTime: new Date(now),
        pauseTime: null,
        resumeTime: null,
      },
    ])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    // 多少の時間誤差を許容
    expect(body.usedSeconds).toBeGreaterThanOrEqual(3599)
    expect(body.usedSeconds).toBeLessThanOrEqual(3601)
    expect(body.canStartBreak).toBe(false)
    expect(body.remainingSeconds).toBe(0)
  })

  it('累計 75 分 → remainingSeconds=0, canStartBreak=false', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    const now = Date.now()
    mockedFindMany.mockResolvedValueOnce([
      {
        startTime: new Date(now - 75 * 60 * 1000),
        endTime: new Date(now),
        pauseTime: null,
        resumeTime: null,
      },
    ])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.usedSeconds).toBeGreaterThanOrEqual(4499)
    expect(body.remainingSeconds).toBe(0)
    expect(body.canStartBreak).toBe(false)
  })

  it('findMany に渡される where には userId, tenantId, startTime.gte が含まれる', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u-target', tenantId: 't-target', role: 'MEMBER' },
    })
    mockedFindMany.mockResolvedValueOnce([])

    await GET()
    expect(mockedFindMany).toHaveBeenCalledTimes(1)
    const arg = mockedFindMany.mock.calls[0][0]
    expect(arg.where.userId).toBe('u-target')
    expect(arg.where.tenantId).toBe('t-target')
    expect(arg.where.startTime.gte).toBeInstanceOf(Date)
    expect(arg.select).toEqual({
      startTime: true,
      endTime: true,
      pauseTime: true,
      resumeTime: true,
    })
  })

  it('DB エラーの場合は 500 を返す', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindMany.mockRejectedValueOnce(new Error('DB failure'))

    // console.error のスパイ化
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal Server Error' })

    errSpy.mockRestore()
  })
})
