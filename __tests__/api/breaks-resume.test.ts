import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PATCH /api/breaks/[id]/resume のバリデーション確認。
 *
 * 既知のバグ③（pauseTime=null の record に対して resumeTime が書き込まれる）への
 * 回帰防止として、resume API 側が異常状態を弾くことを担保する。
 */

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    breakRecord: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { PATCH } from '@/app/api/breaks/[id]/resume/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindUnique = prisma.breakRecord.findUnique as unknown as ReturnType<
  typeof vi.fn
>
const mockedUpdate = prisma.breakRecord.update as unknown as ReturnType<
  typeof vi.fn
>

function makeRequest(id: string) {
  // Request body は使わないが、シグネチャ互換のためダミーを渡す
  return new Request(`http://localhost/api/breaks/${id}/resume`, {
    method: 'PATCH',
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/breaks/[id]/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未認証の場合は 401 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await PATCH(makeRequest('b1'), makeParams('b1'))
    expect(res.status).toBe(401)
  })

  it('該当 record が存在しない場合は 404 を返す', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindUnique.mockResolvedValueOnce(null)

    const res = await PATCH(makeRequest('b1'), makeParams('b1'))
    expect(res.status).toBe(404)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('既に endTime がある record の resume は 409 を返す', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindUnique.mockResolvedValueOnce({
      id: 'b1',
      endTime: new Date(),
      pauseTime: null,
    })

    const res = await PATCH(makeRequest('b1'), makeParams('b1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Break already ended')
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('pauseTime が null の record に対しては 409 を返す（バグ③回帰防止）', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindUnique.mockResolvedValueOnce({
      id: 'b1',
      endTime: null,
      pauseTime: null,
    })

    const res = await PATCH(makeRequest('b1'), makeParams('b1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Break is not paused')
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('pauseTime がセットされている record の resume は 200 を返し、pauseTime=null / resumeTime=now で更新する', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindUnique.mockResolvedValueOnce({
      id: 'b1',
      endTime: null,
      pauseTime: new Date(),
    })
    mockedUpdate.mockResolvedValueOnce({
      id: 'b1',
      endTime: null,
      pauseTime: null,
      resumeTime: new Date(),
    })

    const res = await PATCH(makeRequest('b1'), makeParams('b1'))
    expect(res.status).toBe(200)
    expect(mockedUpdate).toHaveBeenCalledTimes(1)

    const updateArgs = mockedUpdate.mock.calls[0][0]
    expect(updateArgs.data.pauseTime).toBeNull()
    expect(updateArgs.data.resumeTime).toBeInstanceOf(Date)
  })
})
