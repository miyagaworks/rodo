import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/breaks の排他制御と並行実行テスト。
 *
 * フロント側の Strict Mode 二重実行 / ユーザーの連打で並行 POST が到達するケースで、
 * 片方だけが 201 を受け、もう一方は 409 を受けることを保証する。
 */

// auth と prisma をモック化
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

// $transaction は本物に近い振る舞いを持たせるため、直列実行ロックを仕込んだモックを書く。
// これは Prisma の Serializable 分離レベルの擬似再現であり、
// 「並行 POST が findFirst を通過してから create を実行するまでの間に相手トランザクションは割り込めない」
// という不変条件のみを保証する（real DB の serialization failure は別に P2034 テストで扱う）。
vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      breakRecord: {
        findFirst: vi.fn(),
        create: vi.fn(),
        // closeStaleBreaks 内で利用
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  }
})

import { POST } from '@/app/api/breaks/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedFindFirst = prisma.breakRecord.findFirst as unknown as ReturnType<
  typeof vi.fn
>
const mockedCreate = prisma.breakRecord.create as unknown as ReturnType<
  typeof vi.fn
>
const mockedTransaction = prisma.$transaction as unknown as ReturnType<
  typeof vi.fn
>
const mockedFindMany = prisma.breakRecord.findMany as unknown as ReturnType<
  typeof vi.fn
>
const mockedUpdate = prisma.breakRecord.update as unknown as ReturnType<
  typeof vi.fn
>

describe('POST /api/breaks', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // 既定の $transaction 実装: コールバックに tx = prisma を渡してそのまま実行する
    // （単一フロー用）。並行テストケースで上書きする。
    mockedTransaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    )

    // 既定: closeStaleBreaks 内の findMany は「該当なし」
    mockedFindMany.mockResolvedValue([])
    mockedUpdate.mockResolvedValue({})
  })

  it('未認証の場合は 401 を返す', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await POST()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('未終了休憩がなければ 201 を返す', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce(null)
    mockedCreate.mockResolvedValueOnce({
      id: 'new-break-1',
      userId: 'u1',
      tenantId: 't1',
      startTime: new Date(),
      endTime: null,
      pauseTime: null,
      resumeTime: null,
      totalBreakMinutes: null,
      dispatchId: null,
      createdAt: new Date(),
    })

    const res = await POST()
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('new-break-1')
  })

  it('Serializable 分離レベルで $transaction が呼ばれる', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce(null)
    mockedCreate.mockResolvedValueOnce({ id: 'b1' })

    await POST()

    expect(mockedTransaction).toHaveBeenCalledTimes(1)
    const options = mockedTransaction.mock.calls[0][1]
    expect(options).toMatchObject({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  })

  it('未終了休憩が既に存在する場合は 409 を返す', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })
    mockedFindFirst.mockResolvedValueOnce({
      id: 'existing-break',
      endTime: null,
    })

    const res = await POST()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Active break already exists')
    expect(body.breakRecordId).toBe('existing-break')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('Prisma P2034 (serialization failure) の場合は 409 を返す', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })

    // $transaction 自体が P2034 を throw するケースを再現
    mockedTransaction.mockReset()
    mockedTransaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
        { code: 'P2034', clientVersion: '6.19.3' },
      ),
    )

    const res = await POST()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Active break already exists')
  })

  it('並行 POST: 1 件目のトランザクションが create する前に 2 件目が findFirst しても、両方が create する前に直列化される', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })

    // 並行 2 本のトランザクションを擬似再現する。
    // - $transaction コールバックが始まったら tx を渡してコールバックを走らせる
    // - ただし、最初のトランザクションの create を終えるまで 2 本目のトランザクションは
    //   待たされる（これが Serializable の擬似再現）
    let firstTxDone: (() => void) | null = null
    const firstTxComplete = new Promise<void>((resolve) => {
      firstTxDone = resolve
    })
    let callIndex = 0

    mockedFindFirst.mockImplementation(async () => null)
    mockedCreate.mockImplementation(async () => {
      return {
        id: `break-${++callIndex}`,
        userId: 'u1',
        tenantId: 't1',
        startTime: new Date(),
        endTime: null,
        pauseTime: null,
        resumeTime: null,
        totalBreakMinutes: null,
        dispatchId: null,
        createdAt: new Date(),
      }
    })

    let txCallCount = 0
    mockedTransaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        txCallCount += 1
        if (txCallCount === 1) {
          // 1 本目: 通常どおり実行し、終わったら待機フラグを解除
          const result = await fn(prisma)
          firstTxDone?.()
          return result
        }
        // 2 本目: 1 本目が完了するのを待つ。完了時点で DB に未終了 record があるため、
        // findFirst を直前に差し替えて 409 を誘発する。
        await firstTxComplete
        mockedFindFirst.mockImplementationOnce(async () => ({
          id: 'break-1',
          endTime: null,
        }))
        return fn(prisma)
      },
    )

    const [res1, res2] = await Promise.all([POST(), POST()])

    // 1 本目は 201、2 本目は 409
    const statuses = [res1.status, res2.status].sort()
    expect(statuses).toEqual([201, 409])
  })

  it('60 分超過の未終了レコードがあるユーザーが POST → 古いレコードが自動クローズされ、新規 201 で休憩が作成される', async () => {
    mockedAuth.mockResolvedValue({
      user: { userId: 'u1', tenantId: 't1', role: 'MEMBER' },
    })

    // closeStaleBreaks 内の findMany は古いレコードを 1 件返す
    const now = Date.now()
    const staleStart = new Date(now - 90 * 60 * 1000)
    mockedFindMany.mockReset()
    mockedFindMany.mockResolvedValueOnce([
      { id: 'b-stale', startTime: staleStart, pauseTime: null },
    ])

    // closeStaleBreaks の update（古いレコードのクローズ）
    mockedUpdate.mockResolvedValueOnce({ id: 'b-stale' })

    // close した後の findFirst は「アクティブなし」 → create に進む
    mockedFindFirst.mockResolvedValueOnce(null)
    mockedCreate.mockResolvedValueOnce({
      id: 'new-after-stale',
      userId: 'u1',
      tenantId: 't1',
      startTime: new Date(),
      endTime: null,
      pauseTime: null,
      resumeTime: null,
      totalBreakMinutes: null,
      dispatchId: null,
      createdAt: new Date(),
    })

    const res = await POST()

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('new-after-stale')

    // 古いレコードがクローズされたこと
    expect(mockedUpdate).toHaveBeenCalledTimes(1)
    expect(mockedUpdate.mock.calls[0][0].where).toEqual({ id: 'b-stale' })

    // create は 1 回だけ
    expect(mockedCreate).toHaveBeenCalledTimes(1)
  })
})
