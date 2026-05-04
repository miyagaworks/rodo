import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/dispatches - dispatchNumber 採番ロジックの堅牢化テスト（Phase 1）
 *
 * 旧実装: tx.dispatch.count + 1
 * 新実装: 同日内最大メイン番号 + 1（CANCELLED を欠番として残しても衝突しない）
 *
 * 検証範囲:
 *  - 同日 0 件 → 001
 *  - 同日 既存 002（CANCELLED）あり → 003 を採番（count+1 だと 002 衝突）
 *  - 同日 既存 003 あり → 004
 *  - サフィックス付き番号（-2 / -T）はメイン番号採番に影響しない
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
      $transaction: vi.fn(
        async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx),
      ),
      __tx: tx,
    },
  }
})

import { POST } from '@/app/api/dispatches/route'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedAssistanceFindFirst = prisma.assistance
  .findFirst as unknown as ReturnType<typeof vi.fn>
const mockedUserFindUnique = prisma.user
  .findUnique as unknown as ReturnType<typeof vi.fn>
const tx = (prisma as unknown as {
  __tx: {
    dispatch: {
      count: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
    }
    breakRecord: {
      findMany: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
  }
}).__tx

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/dispatches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/dispatches - dispatchNumber 採番堅牢化', () => {
  const userId = 'u1'
  const tenantId = 't1'
  const assistanceId = 'clxxxxxxxxxxxxxxxa'
  // JST: 2026-05-04 11:49 → JST 20:49 → dateStr = 20260504
  const dispatchTimeIso = '2026-05-04T11:49:38.000Z'

  beforeEach(() => {
    vi.clearAllMocks()
    mockedAuth.mockResolvedValue({
      user: { userId, tenantId, role: 'MEMBER' },
    })
    mockedAssistanceFindFirst.mockResolvedValue({ id: assistanceId })
    mockedUserFindUnique.mockResolvedValue({ vehicleId: null })
    tx.dispatch.create.mockResolvedValue({
      id: 'd-mock',
      dispatchNumber: '20260504-mock',
      status: 'DISPATCHED',
    })
  })

  it('同日 0 件 → 001 を採番', async () => {
    tx.dispatch.findFirst.mockResolvedValueOnce(null)

    await POST(
      makeRequest({
        assistanceId,
        type: 'onsite',
        dispatchTime: dispatchTimeIso,
      }),
    )

    expect(tx.dispatch.create).toHaveBeenCalledTimes(1)
    const createArgs = tx.dispatch.create.mock.calls[0][0]
    expect(createArgs.data.dispatchNumber).toBe('20260504001')
  })

  it('同日に 002 が存在する状態（CANCELLED で欠番化していても）→ 003 を採番', async () => {
    // 既存最大番号として 20260504002 を返す（status は問わない: クエリは status を見ない）
    tx.dispatch.findFirst.mockResolvedValueOnce({
      dispatchNumber: '20260504002',
    })

    await POST(
      makeRequest({
        assistanceId,
        type: 'onsite',
        dispatchTime: dispatchTimeIso,
      }),
    )

    const createArgs = tx.dispatch.create.mock.calls[0][0]
    expect(createArgs.data.dispatchNumber).toBe('20260504003')
  })

  it('同日に 010 が存在する状態 → 011 を採番（3桁ゼロ埋め）', async () => {
    tx.dispatch.findFirst.mockResolvedValueOnce({
      dispatchNumber: '20260504010',
    })

    await POST(
      makeRequest({
        assistanceId,
        type: 'onsite',
        dispatchTime: dispatchTimeIso,
      }),
    )

    const createArgs = tx.dispatch.create.mock.calls[0][0]
    expect(createArgs.data.dispatchNumber).toBe('20260504011')
  })

  it('findFirst の where 条件にサフィックス除外（NOT contains -）が含まれる', async () => {
    tx.dispatch.findFirst.mockResolvedValueOnce(null)

    await POST(
      makeRequest({
        assistanceId,
        type: 'onsite',
        dispatchTime: dispatchTimeIso,
      }),
    )

    expect(tx.dispatch.findFirst).toHaveBeenCalledTimes(1)
    const findFirstArgs = tx.dispatch.findFirst.mock.calls[0][0]
    expect(findFirstArgs.where.tenantId).toBe(tenantId)
    expect(findFirstArgs.where.dispatchNumber).toEqual({
      startsWith: '20260504',
    })
    expect(findFirstArgs.where.NOT).toEqual({
      dispatchNumber: { contains: '-' },
    })
    expect(findFirstArgs.orderBy).toEqual({ dispatchNumber: 'desc' })
  })

  it('シナリオ: 001/002 採番 → 002 を CANCELLED → 次は 003（衝突なし）', async () => {
    // count+1 方式だと CANCELLED 案件もカウントされて 003 になり衝突しないが、
    // 物理削除のケースを模した「最大番号は 002 のまま」状態でも新方式は安全。
    tx.dispatch.findFirst.mockResolvedValueOnce({
      dispatchNumber: '20260504002',
    })

    await POST(
      makeRequest({
        assistanceId,
        type: 'onsite',
        dispatchTime: dispatchTimeIso,
      }),
    )

    const createArgs = tx.dispatch.create.mock.calls[0][0]
    expect(createArgs.data.dispatchNumber).toBe('20260504003')
  })
})
