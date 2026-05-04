import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    breakRecord: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { GET } from '@/app/api/admin/members-status/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getBusinessDayDate } from '@/lib/admin/business-day'
import { BREAK_DURATION_SECONDS } from '@/lib/constants/break'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>
const mockedTenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<
  typeof vi.fn
>
const mockedBreakFindMany = prisma.breakRecord.findMany as unknown as ReturnType<
  typeof vi.fn
>
const mockedBreakUpdate = prisma.breakRecord.update as unknown as ReturnType<
  typeof vi.fn
>

function adminSession() {
  return { user: { userId: 'u-admin', tenantId: 't1', role: 'ADMIN' } }
}

function memberSession() {
  return { user: { userId: 'u-mem', tenantId: 't1', role: 'MEMBER' } }
}

describe('GET /api/admin/members-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 業務日開始は 0:00（JST 当日）をデフォルトに
    mockedTenantFindUnique.mockResolvedValue({ businessDayStartMinutes: 0 })
    // closeStaleBreaksForTenant のデフォルト挙動: 孤児なし（既存テストへの影響をゼロにする）
    mockedBreakFindMany.mockResolvedValue([])
    mockedBreakUpdate.mockResolvedValue({})
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

  describe('dispatches.where のフィルタ強化（業務日 + 下書き除外）', () => {
    it('isDraft: false が dispatches.where に含まれる', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedFindMany.mockResolvedValueOnce([])
      await GET()
      const args = mockedFindMany.mock.calls[0][0]
      expect(args.select.dispatches.where.isDraft).toBe(false)
    })

    it('dispatchTime に gte=今日0:00 JST / lt=翌日0:00 JST が含まれる', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedFindMany.mockResolvedValueOnce([])
      await GET()
      const args = mockedFindMany.mock.calls[0][0]
      const range = args.select.dispatches.where.dispatchTime
      expect(range.gte).toBeInstanceOf(Date)
      expect(range.lt).toBeInstanceOf(Date)

      // 今日（業務日）の YYYY-MM-DD を business-day ユーティリティから取得
      const todayStr = getBusinessDayDate(new Date(), 0)
      const expectedStart = new Date(`${todayStr}T00:00:00.000+09:00`)
      const expectedEnd = new Date(expectedStart)
      expectedEnd.setUTCDate(expectedEnd.getUTCDate() + 1)

      expect((range.gte as Date).toISOString()).toBe(
        expectedStart.toISOString(),
      )
      expect((range.lt as Date).toISOString()).toBe(expectedEnd.toISOString())

      // gte / lt はちょうど 24 時間差になっていること（境界が翌日 0:00 JST 未満）
      const diffMs = (range.lt as Date).getTime() - (range.gte as Date).getTime()
      expect(diffMs).toBe(24 * 60 * 60 * 1000)
    })

    it('businessDayStartMinutes=360 のとき、業務日開始が JST 6:00 起点で計算される', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedTenantFindUnique.mockReset()
      mockedTenantFindUnique.mockResolvedValueOnce({
        businessDayStartMinutes: 360,
      })
      mockedFindMany.mockResolvedValueOnce([])
      await GET()
      const args = mockedFindMany.mock.calls[0][0]
      const range = args.select.dispatches.where.dispatchTime

      const todayStr = getBusinessDayDate(new Date(), 360)
      const expectedStart = new Date(`${todayStr}T00:00:00.000+09:00`)

      expect((range.gte as Date).toISOString()).toBe(
        expectedStart.toISOString(),
      )
    })

    /**
     * ケース1: 過去日の ONSITE Dispatch のみがある隊員 → STANDBY
     *
     * Prisma の where が dispatchTime: { gte: 今日0:00, lt: 翌日0:00 } で
     * 絞り込まれる結果、過去日の ONSITE は dispatches 配列に含まれない。
     * モックではフィルタ評価をしないため、フィルタ後を想定して dispatches=[] を返す。
     */
    it('ケース1: 過去日の ONSITE のみ（SQL で除外済み想定）→ STANDBY', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '山田',
          vehicle: null,
          dispatches: [], // 過去日 ONSITE は SQL で除外されるため空
          breakRecords: [],
        },
      ])
      const res = await GET()
      const json = await res.json()
      expect(json.members[0].status).toBe('STANDBY')
      expect(json.members[0].activeDispatch).toBeNull()
    })

    /**
     * ケース2: 今日の isDraft=true ONSITE のみ → SQL で除外 → STANDBY
     */
    it('ケース2: 今日の isDraft=true ONSITE のみ（SQL で除外済み想定）→ STANDBY', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '鈴木',
          vehicle: null,
          dispatches: [], // isDraft=true は SQL で除外されるため空
          breakRecords: [],
        },
      ])
      const res = await GET()
      const json = await res.json()
      expect(json.members[0].status).toBe('STANDBY')
      expect(json.members[0].activeDispatch).toBeNull()
    })

    /**
     * ケース3: 今日の isDraft=false ONSITE → DISPATCHING / ONSITE
     */
    it('ケース3: 今日の isDraft=false ONSITE → DISPATCHING / subPhase=ONSITE', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '田中',
          vehicle: null,
          dispatches: [
            {
              id: 'd1',
              dispatchNumber: '20260502001',
              status: 'ONSITE',
              returnTime: null,
              assistance: { name: 'PA' },
            },
          ],
          breakRecords: [],
        },
      ])
      const res = await GET()
      const json = await res.json()
      expect(json.members[0].status).toBe('DISPATCHING')
      expect(json.members[0].activeDispatch?.subPhase).toBe('ONSITE')
    })

    /**
     * ケース4: Dispatch が一切ない隊員 → STANDBY
     */
    it('ケース4: Dispatch が一切ない隊員 → STANDBY', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())
      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '佐藤',
          vehicle: null,
          dispatches: [],
          breakRecords: [],
        },
      ])
      const res = await GET()
      const json = await res.json()
      expect(json.members[0].status).toBe('STANDBY')
      expect(json.members[0].activeDispatch).toBeNull()
      expect(json.members[0].activeBreak).toBeNull()
    })
  })

  /**
   * 孤児 BreakRecord の自動クローズ（closeStaleBreaksForTenant 経由）
   *
   * ダッシュボード経路では users 取得前に tenant 単位で
   * 上限超過した endTime=null を一括クローズする。
   * モック上は user.findMany と breakRecord.findMany が独立しているため、
   * 「クローズ後の状態」を user.findMany の戻り値で再現する。
   */
  describe('孤児 BreakRecord の自動クローズ（closeStaleBreaksForTenant）', () => {
    const limitMs = BREAK_DURATION_SECONDS * 1000

    it('上限超過した endTime=null の BreakRecord は endTime がセットされ、status は STANDBY で返る', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())

      // 孤児: 90 分前開始 + 80 分前 pause（上限超過）
      const now = new Date()
      const startTime = new Date(now.getTime() - 90 * 60 * 1000)
      const pauseTime = new Date(now.getTime() - 80 * 60 * 1000)

      mockedBreakFindMany.mockResolvedValueOnce([
        { id: 'orphan-1', startTime, pauseTime },
      ])

      // クローズ後の状態を user.findMany 側で表現:
      // breakRecords は endTime=null フィルタなので、クローズ済みなら空配列で返る
      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '管理者',
          vehicle: null,
          dispatches: [],
          breakRecords: [],
        },
      ])

      const res = await GET()
      const json = await res.json()

      // closeStaleBreaksForTenant が tenantId スコープで findMany を呼んでいる
      expect(mockedBreakFindMany).toHaveBeenCalledTimes(1)
      const findArg = mockedBreakFindMany.mock.calls[0][0]
      expect(findArg.where).toEqual({ tenantId: 't1', endTime: null })

      // pauseTime あり → endTime = pauseTime で update
      expect(mockedBreakUpdate).toHaveBeenCalledTimes(1)
      expect(mockedBreakUpdate).toHaveBeenCalledWith({
        where: { id: 'orphan-1' },
        data: { endTime: pauseTime },
      })

      // ステータスは STANDBY（孤児がクローズされたため）
      expect(json.members[0].status).toBe('STANDBY')
      expect(json.members[0].activeBreak).toBeNull()
    })

    it('上限内（60 分以内）の endTime=null は触らず、status は BREAK で返る', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())

      // 30 分前開始（上限内）
      const now = new Date()
      const startTime = new Date(now.getTime() - 30 * 60 * 1000)

      mockedBreakFindMany.mockResolvedValueOnce([
        { id: 'fresh-1', startTime, pauseTime: null },
      ])

      // クローズされていないので user.findMany 側でも breakRecords にそのまま残す
      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '隊員A',
          vehicle: null,
          dispatches: [],
          breakRecords: [{ id: 'fresh-1', startTime }],
        },
      ])

      const res = await GET()
      const json = await res.json()

      // findMany は呼ばれるが update は呼ばれない
      expect(mockedBreakFindMany).toHaveBeenCalledTimes(1)
      expect(mockedBreakUpdate).not.toHaveBeenCalled()

      // ステータスは BREAK（上限内の未終了レコードは生きている）
      expect(json.members[0].status).toBe('BREAK')
      expect(json.members[0].activeBreak).toEqual({
        id: 'fresh-1',
        startTime: startTime.toISOString(),
      })
    })

    it('同 tenant の複数 user の孤児レコードを一度に処理できる', async () => {
      mockedAuth.mockResolvedValueOnce(adminSession())

      const now = new Date()
      // user1 の孤児: 90 分前開始 + 80 分前 pause → endTime = pauseTime
      const start1 = new Date(now.getTime() - 90 * 60 * 1000)
      const pause1 = new Date(now.getTime() - 80 * 60 * 1000)
      // user2 の孤児: 75 分前開始 + pauseTime なし → endTime = startTime + 60min
      const start2 = new Date(now.getTime() - 75 * 60 * 1000)

      mockedBreakFindMany.mockResolvedValueOnce([
        { id: 'orphan-u1', startTime: start1, pauseTime: pause1 },
        { id: 'orphan-u2', startTime: start2, pauseTime: null },
      ])

      mockedFindMany.mockResolvedValueOnce([
        {
          id: 'u1',
          name: '隊員A',
          vehicle: null,
          dispatches: [],
          breakRecords: [], // クローズ済み
        },
        {
          id: 'u2',
          name: '隊員B',
          vehicle: null,
          dispatches: [],
          breakRecords: [], // クローズ済み
        },
      ])

      const res = await GET()
      const json = await res.json()

      // findMany は 1 回（tenant 一括）
      expect(mockedBreakFindMany).toHaveBeenCalledTimes(1)
      // update は 2 回（孤児 2 件）
      expect(mockedBreakUpdate).toHaveBeenCalledTimes(2)

      // 1 件目: orphan-u1 → endTime = pauseTime
      expect(mockedBreakUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: 'orphan-u1' },
        data: { endTime: pause1 },
      })

      // 2 件目: orphan-u2 → endTime = startTime + limitMs
      const call2 = mockedBreakUpdate.mock.calls[1][0]
      expect(call2.where).toEqual({ id: 'orphan-u2' })
      expect((call2.data.endTime as Date).getTime()).toBe(
        start2.getTime() + limitMs,
      )

      // 両 user とも STANDBY
      expect(json.members).toHaveLength(2)
      expect(json.members[0].status).toBe('STANDBY')
      expect(json.members[1].status).toBe('STANDBY')
    })
  })
})
