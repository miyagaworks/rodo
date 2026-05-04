import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  closeStaleBreaks,
  closeStaleBreaksForTenant,
} from '@/lib/breakAutoClose'
import { BREAK_DURATION_SECONDS } from '@/lib/constants/break'

/**
 * closeStaleBreaks の単体テスト。
 *
 * 引数 client は Prisma.TransactionClient の最小サブセットを持つオブジェクト。
 * モック関数 findMany / update を持たせて呼び出しを検証する。
 */

type FakeClient = {
  breakRecord: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

function createFakeClient(stale: Array<{
  id: string
  startTime: Date
  pauseTime: Date | null
}>): FakeClient {
  return {
    breakRecord: {
      findMany: vi.fn().mockResolvedValue(stale),
      update: vi.fn().mockResolvedValue({}),
    },
  }
}

describe('closeStaleBreaks', () => {
  const userId = 'u1'
  const tenantId = 't1'
  const limitMs = BREAK_DURATION_SECONDS * 1000

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('60 分未満の未終了レコードはクローズされない', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    // 30 分前に開始（経過 30 分 < 60 分）
    const startTime = new Date(now.getTime() - 30 * 60 * 1000)
    const client = createFakeClient([
      { id: 'r1', startTime, pauseTime: null },
    ])

    await closeStaleBreaks(
      client as never,
      { userId, tenantId, now },
    )

    expect(client.breakRecord.update).not.toHaveBeenCalled()
  })

  it('60 分超過 + pauseTime あり → endTime = pauseTime', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    // 90 分前に開始 → 経過 90 分 > 60 分
    const startTime = new Date(now.getTime() - 90 * 60 * 1000)
    // 80 分前に pause
    const pauseTime = new Date(now.getTime() - 80 * 60 * 1000)
    const client = createFakeClient([
      { id: 'r-pause', startTime, pauseTime },
    ])

    await closeStaleBreaks(
      client as never,
      { userId, tenantId, now },
    )

    expect(client.breakRecord.update).toHaveBeenCalledTimes(1)
    expect(client.breakRecord.update).toHaveBeenCalledWith({
      where: { id: 'r-pause' },
      data: { endTime: pauseTime },
    })
  })

  it('60 分超過 + pauseTime なし → endTime = startTime + BREAK_DURATION_SECONDS * 1000', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    // 90 分前に開始 → 経過 90 分 > 60 分
    const startTime = new Date(now.getTime() - 90 * 60 * 1000)
    const client = createFakeClient([
      { id: 'r-no-pause', startTime, pauseTime: null },
    ])

    await closeStaleBreaks(
      client as never,
      { userId, tenantId, now },
    )

    expect(client.breakRecord.update).toHaveBeenCalledTimes(1)
    const call = client.breakRecord.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'r-no-pause' })
    // endTime は startTime + limitMs（タイマー満了時刻）
    const expectedEndMs = startTime.getTime() + limitMs
    expect((call.data.endTime as Date).getTime()).toBe(expectedEndMs)
  })

  it('境界: 経過時間がちょうど 60 分の場合はクローズされない（>= ではなく > の判定）', async () => {
    // 仕様: elapsedMs <= limitMs は continue（クローズしない）。
    // ちょうど 3600 秒経過のレコードはまだ「上限ぴったり」で、上限超過には該当しない。
    const now = new Date('2026-05-02T12:00:00.000Z')
    const startTime = new Date(now.getTime() - limitMs)
    const client = createFakeClient([
      { id: 'r-boundary', startTime, pauseTime: null },
    ])

    await closeStaleBreaks(
      client as never,
      { userId, tenantId, now },
    )

    expect(client.breakRecord.update).not.toHaveBeenCalled()
  })

  it('複数レコード混在: 上限超過のみ更新される', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    const fresh = new Date(now.getTime() - 10 * 60 * 1000) // 10 分前
    const stale = new Date(now.getTime() - 70 * 60 * 1000) // 70 分前
    const client = createFakeClient([
      { id: 'r-fresh', startTime: fresh, pauseTime: null },
      { id: 'r-stale', startTime: stale, pauseTime: null },
    ])

    await closeStaleBreaks(
      client as never,
      { userId, tenantId, now },
    )

    expect(client.breakRecord.update).toHaveBeenCalledTimes(1)
    expect(client.breakRecord.update.mock.calls[0][0].where).toEqual({
      id: 'r-stale',
    })
  })

  it('findMany には userId / tenantId / endTime: null の where が渡される', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    const client = createFakeClient([])

    await closeStaleBreaks(
      client as never,
      { userId: 'target-u', tenantId: 'target-t', now },
    )

    expect(client.breakRecord.findMany).toHaveBeenCalledTimes(1)
    const arg = client.breakRecord.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      userId: 'target-u',
      tenantId: 'target-t',
      endTime: null,
    })
    // select で id / startTime / pauseTime のみ取得していること
    expect(arg.select).toEqual({
      id: true,
      startTime: true,
      pauseTime: true,
    })
  })

  it('該当レコードがない場合は update を呼ばない', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    const client = createFakeClient([])

    await closeStaleBreaks(
      client as never,
      { userId, tenantId, now },
    )

    expect(client.breakRecord.update).not.toHaveBeenCalled()
  })

  it('now 引数を省略した場合は new Date() が使われる（モック時刻でも動作する）', async () => {
    const realNow = new Date()
    // 90 分前
    const startTime = new Date(realNow.getTime() - 90 * 60 * 1000)
    const client = createFakeClient([
      { id: 'r1', startTime, pauseTime: null },
    ])

    await closeStaleBreaks(client as never, { userId, tenantId })

    expect(client.breakRecord.update).toHaveBeenCalledTimes(1)
  })
})

describe('closeStaleBreaksForTenant', () => {
  const tenantId = 't1'
  const limitMs = BREAK_DURATION_SECONDS * 1000

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('findMany には tenantId / endTime: null のみが渡され、userId は含まれない', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    const client = createFakeClient([])

    await closeStaleBreaksForTenant(
      client as never,
      { tenantId: 'target-t', now },
    )

    expect(client.breakRecord.findMany).toHaveBeenCalledTimes(1)
    const arg = client.breakRecord.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      tenantId: 'target-t',
      endTime: null,
    })
    expect(arg.where).not.toHaveProperty('userId')
    expect(arg.select).toEqual({
      id: true,
      startTime: true,
      pauseTime: true,
    })
  })

  it('該当レコードがない場合は update を呼ばない', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    const client = createFakeClient([])

    await closeStaleBreaksForTenant(client as never, { tenantId, now })

    expect(client.breakRecord.update).not.toHaveBeenCalled()
  })

  it('上限内（60 分以内）のレコードは触らない', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    const startTime = new Date(now.getTime() - 30 * 60 * 1000) // 30 分前
    const client = createFakeClient([
      { id: 'r1', startTime, pauseTime: null },
    ])

    await closeStaleBreaksForTenant(client as never, { tenantId, now })

    expect(client.breakRecord.update).not.toHaveBeenCalled()
  })

  it('複数 user の孤児レコードを一括処理する（pauseTime あり / なしの混在）', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    // user1: 90 分前開始 + 80 分前 pause → endTime = pauseTime
    const start1 = new Date(now.getTime() - 90 * 60 * 1000)
    const pause1 = new Date(now.getTime() - 80 * 60 * 1000)
    // user2: 70 分前開始 + pauseTime なし → endTime = startTime + 60min
    const start2 = new Date(now.getTime() - 70 * 60 * 1000)
    // user3: 30 分前開始（上限内、触らない）
    const start3 = new Date(now.getTime() - 30 * 60 * 1000)

    const client = createFakeClient([
      { id: 'r-u1', startTime: start1, pauseTime: pause1 },
      { id: 'r-u2', startTime: start2, pauseTime: null },
      { id: 'r-u3', startTime: start3, pauseTime: null },
    ])

    await closeStaleBreaksForTenant(client as never, { tenantId, now })

    // 上限超過は 2 件のみ
    expect(client.breakRecord.update).toHaveBeenCalledTimes(2)

    // 1 件目: user1 → endTime = pauseTime
    expect(client.breakRecord.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'r-u1' },
      data: { endTime: pause1 },
    })

    // 2 件目: user2 → endTime = startTime + limitMs
    const call2 = client.breakRecord.update.mock.calls[1][0]
    expect(call2.where).toEqual({ id: 'r-u2' })
    expect((call2.data.endTime as Date).getTime()).toBe(
      start2.getTime() + limitMs,
    )
  })

  it('境界: ちょうど 60 分経過のレコードはクローズされない（既存 closeStaleBreaks と同条件）', async () => {
    const now = new Date('2026-05-02T12:00:00.000Z')
    const startTime = new Date(now.getTime() - limitMs)
    const client = createFakeClient([
      { id: 'r-boundary', startTime, pauseTime: null },
    ])

    await closeStaleBreaksForTenant(client as never, { tenantId, now })

    expect(client.breakRecord.update).not.toHaveBeenCalled()
  })

  it('now 引数を省略した場合は new Date() が使われる', async () => {
    const realNow = new Date()
    const startTime = new Date(realNow.getTime() - 90 * 60 * 1000)
    const client = createFakeClient([
      { id: 'r1', startTime, pauseTime: null },
    ])

    await closeStaleBreaksForTenant(client as never, { tenantId })

    expect(client.breakRecord.update).toHaveBeenCalledTimes(1)
  })
})
