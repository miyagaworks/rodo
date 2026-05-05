import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/dispatches - 出動開始による休憩自動クローズの統合テスト（軽量版）
 *
 * 業務シナリオ（2026-05-04 ユーザー確認済み仕様）:
 * 隊員が休憩中に出動要請を受けて出動を開始した際、active な BreakRecord は
 * 自動的に終了したことになる。POST /api/dispatches の $transaction 内で
 * closeActiveBreakOnDispatchStart が呼び出され、Dispatch.create と同一
 * トランザクションで処理されることを確認する。
 *
 * 検証範囲:
 *   1. ヘルパーが想定通りの引数で呼ばれる
 *   2. レスポンス形式が既存と完全同一（201 + Dispatch オブジェクト）
 *   3. 休憩していない user でもヘルパーは呼ばれる（active break の有無は
 *      ヘルパー内部の findMany 結果で分岐）
 *
 * 検証範囲外:
 *   - $transaction の rollback 動作（実機テストで担保）
 *   - BreakRecord 更新の詳細（__tests__/lib/breakAutoClose.test.ts でカバー）
 */

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/breakAutoClose', () => ({
  closeActiveBreakOnDispatchStart: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/prisma', () => {
  const tx = {
    dispatch: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    breakRecord: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  }
  return {
    prisma: {
      assistance: {
        findFirst: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      dispatch: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(
        async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx),
      ),
      // テストから直接アクセスするための tx 参照
      __tx: tx,
    },
  }
})

import { POST } from '@/app/api/dispatches/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { closeActiveBreakOnDispatchStart } from '@/lib/breakAutoClose'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedCloseActiveBreak =
  closeActiveBreakOnDispatchStart as unknown as ReturnType<typeof vi.fn>
const mockedAssistanceFindFirst = prisma.assistance
  .findFirst as unknown as ReturnType<typeof vi.fn>
const mockedUserFindUnique = prisma.user
  .findUnique as unknown as ReturnType<typeof vi.fn>
// $transaction が呼び出すコールバックに渡す tx
const tx = (prisma as unknown as { __tx: {
  dispatch: {
    count: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  breakRecord: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
} }).__tx

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/dispatches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/dispatches - active BreakRecord 自動クローズ', () => {
  const userId = 'u1'
  const tenantId = 't1'
  const assistanceId = 'clxxxxxxxxxxxxxxxa'

  beforeEach(() => {
    vi.clearAllMocks()
    mockedAuth.mockResolvedValue({
      user: { userId, tenantId, role: 'MEMBER' },
    })
    mockedAssistanceFindFirst.mockResolvedValue({ id: assistanceId })
    mockedUserFindUnique.mockResolvedValue({ vehicleId: null })
    tx.dispatch.count.mockResolvedValue(0)
    tx.dispatch.findFirst.mockResolvedValue(null)
  })

  it('休憩中の user で POST: closeActiveBreakOnDispatchStart が想定引数で呼ばれ、Dispatch が作成され 201 が返る', async () => {
    const dispatchTimeIso = '2026-05-04T11:49:38.000Z'
    const expectedNow = new Date(dispatchTimeIso)

    const createdDispatch = {
      id: 'd1',
      dispatchNumber: '20260504001',
      tenantId,
      userId,
      assistanceId,
      type: 'ONSITE',
      status: 'DISPATCHED',
      dispatchTime: expectedNow,
    }
    tx.dispatch.create.mockResolvedValue(createdDispatch)

    const res = await POST(
      makeRequest({
        assistanceId,
        type: 'onsite',
        departureOdo: 12345,
        dispatchTime: dispatchTimeIso,
      }),
    )

    // レスポンス: 201 + 既存形式（Dispatch オブジェクトをそのまま JSON で返す）
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({
      id: 'd1',
      dispatchNumber: '20260504001',
      status: 'DISPATCHED',
    })

    // ヘルパー呼び出し: 同一トランザクション内で tx を渡し、interruptedAt = now
    expect(mockedCloseActiveBreak).toHaveBeenCalledTimes(1)
    const callArgs = mockedCloseActiveBreak.mock.calls[0]
    // 第1引数は tx（prisma 本体ではなくトランザクションクライアント）
    expect(callArgs[0]).toBe(tx)
    // 第2引数は { userId, tenantId, interruptedAt }
    expect(callArgs[1]).toMatchObject({
      userId,
      tenantId,
    })
    expect((callArgs[1] as { interruptedAt: Date }).interruptedAt.getTime()).toBe(
      expectedNow.getTime(),
    )

    // Dispatch.create も同じ tx で実行されている
    expect(tx.dispatch.create).toHaveBeenCalledTimes(1)
  })

  it('休憩していない user で POST: ヘルパーは呼ばれるが BreakRecord 更新は発生せず、Dispatch のみ作成され 201 が返る', async () => {
    // ヘルパーは「active break の有無に関係なく毎回呼ぶ」設計。
    // ヘルパー内部で findMany が空配列を返せば update は呼ばれず、副作用なしで終わる。
    // 統合テストではヘルパーをモックしているため、active break の有無は内部実装の話。
    // ここではヘルパー呼び出しが発生することと、Dispatch 作成が成立することを確認する。
    mockedCloseActiveBreak.mockResolvedValueOnce(undefined)

    const dispatchTimeIso = '2026-05-04T12:00:00.000Z'
    const createdDispatch = {
      id: 'd2',
      dispatchNumber: '20260504001',
      tenantId,
      userId,
      assistanceId,
      type: 'TRANSPORT',
      status: 'DISPATCHED',
    }
    tx.dispatch.create.mockResolvedValue(createdDispatch)

    const res = await POST(
      makeRequest({
        assistanceId,
        type: 'transport',
        dispatchTime: dispatchTimeIso,
      }),
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({
      id: 'd2',
      status: 'DISPATCHED',
    })

    // ヘルパーは呼ばれる（内部で findMany が空配列なら update は走らない設計）
    expect(mockedCloseActiveBreak).toHaveBeenCalledTimes(1)
    // Dispatch は作成される
    expect(tx.dispatch.create).toHaveBeenCalledTimes(1)
  })

  it('レスポンス形式は Dispatch オブジェクトを直接 JSON で返す（既存形式維持）', async () => {
    const createdDispatch = {
      id: 'd-shape',
      dispatchNumber: '20260504001',
      tenantId,
      userId,
      assistanceId,
      type: 'ONSITE',
      status: 'DISPATCHED',
      vehicleId: null,
      departureOdo: null,
      dispatchTime: new Date('2026-05-04T11:49:38.000Z'),
      isSecondaryTransport: false,
      parentDispatchId: null,
    }
    tx.dispatch.create.mockResolvedValue(createdDispatch)

    const res = await POST(
      makeRequest({
        assistanceId,
        type: 'onsite',
      }),
    )

    expect(res.status).toBe(201)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const body = await res.json()
    // ラップ無し（{ data: ... } や { dispatch: ... } のような構造変更がない）
    expect(body).not.toHaveProperty('data')
    expect(body).not.toHaveProperty('dispatch')
    expect(body.id).toBe('d-shape')
    expect(body.dispatchNumber).toBe('20260504001')
  })

  it('Validation 失敗時は 400 を返し、ヘルパーは呼ばれない', async () => {
    const res = await POST(
      makeRequest({
        // assistanceId 欠落 → zod バリデーション失敗
        type: 'onsite',
      }),
    )

    expect(res.status).toBe(400)
    expect(mockedCloseActiveBreak).not.toHaveBeenCalled()
    expect(tx.dispatch.create).not.toHaveBeenCalled()
  })

  it('Unauthorized 時は 401 を返し、ヘルパーは呼ばれない', async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const res = await POST(
      makeRequest({
        assistanceId,
        type: 'onsite',
      }),
    )

    expect(res.status).toBe(401)
    expect(mockedCloseActiveBreak).not.toHaveBeenCalled()
    expect(tx.dispatch.create).not.toHaveBeenCalled()
  })
})
