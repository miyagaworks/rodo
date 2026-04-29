import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}))

import { GET } from '@/app/api/admin/members-status/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>

function adminSession() {
  return { user: { userId: 'u-admin', tenantId: 't1', role: 'ADMIN' } }
}

function memberSession() {
  return { user: { userId: 'u-mem', tenantId: 't1', role: 'MEMBER' } }
}

describe('GET /api/admin/members-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未認証の場合は 401 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('MEMBER ロールは 403 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(memberSession())
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('ADMIN ロールは tenantId を where に渡してユーザー一覧を取得する', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])

    const res = await GET()
    expect(res.status).toBe(200)
    const args = mockedFindMany.mock.calls[0][0]
    expect(args.where).toEqual({ tenantId: 't1' })
  })

  it('待機中の隊員: dispatches も break も無し → STANDBY', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([
      {
        id: 'u1',
        name: '山田',
        vehicle: null,
        dispatches: [],
        breakRecords: [],
      },
    ])

    const res = await GET()
    const json = await res.json()
    expect(json.members).toHaveLength(1)
    expect(json.members[0].status).toBe('STANDBY')
    expect(json.members[0].activeDispatch).toBeNull()
    expect(json.members[0].activeBreak).toBeNull()
  })

  it('休憩中の隊員: 出動と break が同時にあっても BREAK が優先', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    const breakStart = new Date('2026-04-27T01:00:00Z')
    mockedFindMany.mockResolvedValueOnce([
      {
        id: 'u1',
        name: '鈴木',
        vehicle: { plateNumber: '練馬500あ1234', displayName: 'PA車' },
        dispatches: [
          {
            id: 'd1',
            dispatchNumber: '20260427001',
            status: 'ONSITE',
            returnTime: null,
            assistance: { name: 'PA' },
          },
        ],
        breakRecords: [{ id: 'b1', startTime: breakStart }],
      },
    ])

    const res = await GET()
    const json = await res.json()
    expect(json.members[0].status).toBe('BREAK')
    expect(json.members[0].activeDispatch).toBeNull()
    expect(json.members[0].activeBreak).toEqual({
      id: 'b1',
      startTime: '2026-04-27T01:00:00.000Z',
    })
  })

  describe('出動中（DISPATCHING）の各サブフェーズ', () => {
    const cases: Array<[string, string]> = [
      ['DISPATCHED', 'DISPATCHING'],
      ['ONSITE', 'ONSITE'],
      ['TRANSPORTING', 'TRANSPORTING'],
    ]
    it.each(cases)('status=%s → subPhase=%s', async (status, expected) => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '田中',
          vehicle: null,
          dispatches: [
            {
              id: 'd1',
              dispatchNumber: '20260427002',
              status,
              returnTime: null,
              assistance: { name: 'AWP' },
            },
          ],
          breakRecords: [],
        },
      ])

      const res = await GET()
      const json = await res.json()
      expect(json.members[0].status).toBe('DISPATCHING')
      expect(json.members[0].activeDispatch).toMatchObject({
        id: 'd1',
        dispatchNumber: '20260427002',
        subPhase: expected,
        assistanceName: 'AWP',
      })
    })

    it('COMPLETED && returnTime=null → 帰社中（RETURNING_TO_BASE）', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '佐藤',
          vehicle: null,
          dispatches: [
            {
              id: 'd1',
              dispatchNumber: '20260427003',
              status: 'COMPLETED',
              returnTime: null,
              assistance: { name: 'SC' },
            },
          ],
          breakRecords: [],
        },
      ])

      const res = await GET()
      const json = await res.json()
      expect(json.members[0].status).toBe('DISPATCHING')
      expect(json.members[0].activeDispatch?.subPhase).toBe('RETURNING_TO_BASE')
    })

    it('COMPLETED && returnTime あり（帰社済み）→ STANDBY', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '佐藤',
          vehicle: null,
          dispatches: [
            {
              id: 'd1',
              dispatchNumber: '20260427003',
              status: 'COMPLETED',
              returnTime: new Date(),
              assistance: { name: 'SC' },
            },
          ],
          breakRecords: [],
        },
      ])

      const res = await GET()
      const json = await res.json()
      expect(json.members[0].status).toBe('STANDBY')
      expect(json.members[0].activeDispatch).toBeNull()
    })
  })

  it('レスポンスに fetchedAt が含まれる', async () => {
    mockedAuth.mockResolvedValueOnce(adminSession())
    mockedFindMany.mockResolvedValueOnce([])
    const res = await GET()
    const json = await res.json()
    expect(typeof json.fetchedAt).toBe('string')
    expect(() => new Date(json.fetchedAt)).not.toThrow()
  })
})
