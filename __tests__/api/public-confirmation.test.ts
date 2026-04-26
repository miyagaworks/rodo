import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/c/[token]
 *
 * Phase 5: 共有 URL からアクセスする公開 GET API。
 * 認証不要であり、shareToken が一致する WorkConfirmation を返す。
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workConfirmation: {
      findUnique: vi.fn(),
    },
  },
}))

import { GET } from '@/app/api/c/[token]/route'
import { prisma } from '@/lib/prisma'

const mockedFindUnique = prisma.workConfirmation
  .findUnique as unknown as ReturnType<typeof vi.fn>

function makeRequest(token: string): Request {
  return new Request(`http://localhost/api/c/${token}`, { method: 'GET' })
}

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) }
}

const sampleConfirmation = {
  id: 'cfm1',
  dispatchId: 'd1',
  workDate: new Date('2026-04-26'),
  preApprovalChecks: [true, true, false, false, false],
  customerSignature: 'data:image/png;base64,sig',
  customerName: null,
  customerDate: null,
  vehicleType: 'トヨタ プリウス',
  registrationNumber: '品川 500 あ 1234',
  workContent: 'バッテリー上がり対応',
  shopCompanyName: null,
  shopContactName: null,
  shopSignature: null,
  postApprovalCheck: true,
  postApprovalSignature: 'data:image/png;base64,sig2',
  postApprovalName: '宮川 清美',
  batteryDetails: null,
  notes: null,
  shareToken: 'tok1',
  sharedAt: new Date('2026-04-26'),
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('GET /api/c/[token] - 公開閲覧 API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有効なトークンで 200 とデータを返す', async () => {
    mockedFindUnique.mockResolvedValueOnce(sampleConfirmation)

    const res = await GET(makeRequest('tok1'), makeParams('tok1'))

    expect(res.status).toBe(200)
    expect(mockedFindUnique).toHaveBeenCalledWith({
      where: { shareToken: 'tok1' },
    })

    const body = await res.json()
    expect(body.id).toBe('cfm1')
    expect(body.shareToken).toBe('tok1')
    expect(body.vehicleType).toBe('トヨタ プリウス')
  })

  it('無効なトークンで 404 を返す', async () => {
    mockedFindUnique.mockResolvedValueOnce(null)

    const res = await GET(makeRequest('invalid'), makeParams('invalid'))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'Not found' })
  })

  it('認証ヘッダーが無くてもアクセスできる (auth() を呼ばない)', async () => {
    // auth() を一切モックしていない状態で呼ばれていないことを示す。
    // 認証チェックがあれば import 時点や実行時に落ちるはず。
    mockedFindUnique.mockResolvedValueOnce(sampleConfirmation)

    const res = await GET(makeRequest('tok1'), makeParams('tok1'))

    expect(res.status).toBe(200)
  })

  it('空文字トークンでも findUnique を空文字で呼び、結果が無ければ 404', async () => {
    mockedFindUnique.mockResolvedValueOnce(null)

    const res = await GET(makeRequest(''), makeParams(''))

    expect(res.status).toBe(404)
    expect(mockedFindUnique).toHaveBeenCalledWith({
      where: { shareToken: '' },
    })
  })
})
