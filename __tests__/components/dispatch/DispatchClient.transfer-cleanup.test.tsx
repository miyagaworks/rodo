import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'

/**
 * DispatchClient — 振替完了ポーリングの setTimeout cleanup テスト（Phase 7 改訂スコープ A-1 / 2026-05-05）。
 *
 * 検証範囲:
 *   - transferStatus='PENDING' でマウント
 *   - 30秒後にポーリングで status='TRANSFERRED' を取得 → setTransferCompleted(true) + clearInterval
 *     さらに 3 秒後の router.push('/') 用 setTimeout を登録
 *   - その setTimeout が発火する前にコンポーネントを unmount
 *   - cleanup で clearTimeout が動作し、router.push が呼ばれないこと
 *
 * 計画書: docs/plans/dispatch-floating-prevention.md §3 Phase 7 #1
 * 引き継ぎ: docs/handover/2026-05-04-dispatch-floating-prevention.md §J.1 / §K.2.1
 */

// next/navigation モック
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// offline-fetch モック（DispatchClient 内の各種 PATCH/POST が呼ばれる可能性は低いが安全側）
vi.mock('@/lib/offline-fetch', () => ({
  offlineFetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
}))

// usePhotoCapture モック（マウント時のフェッチ・IndexedDB アクセスを回避）
vi.mock('@/hooks/usePhotoCapture', () => ({
  usePhotoCapture: () => ({
    photos: [],
    photoCount: 0,
    fileInputRef: { current: null },
    openCamera: vi.fn(),
    handleFileChange: vi.fn(),
    removePhoto: vi.fn(),
    reload: vi.fn(),
  }),
}))

// 重い子コンポーネントを軽量モック化
vi.mock('@/components/dispatch/ClockPicker', () => ({ default: () => null }))
vi.mock('@/components/common/OdoDialInput', () => ({ default: () => null }))
vi.mock('@/components/common/AppFooter', () => ({ default: () => null }))
vi.mock('@/components/dispatch/CancelDispatchButton', () => ({
  CancelDispatchButton: () => null,
}))

import DispatchClient from '@/components/dispatch/DispatchClient'

const SESSION = {
  user: {
    id: 'user-1',
    userId: 'user-1',
    email: 'admin@shimoda.example.com',
    name: '下田 花子',
    role: 'ADMIN',
    tenantId: 'tenant-1',
  },
  expires: '2099-01-01',
} as unknown as React.ComponentProps<typeof DispatchClient>['session']

const TRANSFER_PENDING_DISPATCH = {
  id: 'disp_pending_1',
  dispatchNumber: '20260505101',
  status: 'DISPATCHED',
  type: 'ONSITE' as const,
  departureOdo: 100,
  arrivalOdo: null,
  transportStartOdo: null,
  completionOdo: null,
  returnOdo: null,
  dispatchTime: new Date('2026-05-05T01:00:00.000Z').toISOString(),
  arrivalTime: null,
  completionTime: null,
  returnTime: null,
  transportStartTime: null,
  deliveryType: null,
  transferStatus: 'PENDING' as const,
  transferredFromId: null,
  transferredToUserName: null,
  transferredToDispatchNumber: null,
  transferredFromUserName: null,
  vehicleId: null,
  isDraft: false,
}

describe('DispatchClient — 振替完了ポーリングの setTimeout cleanup（Phase 7 A-1）', () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>
  let originalFetch: typeof globalThis.fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    pushMock.mockClear()
    vi.useFakeTimers({ shouldAdvanceTime: false })

    // jsdom は scrollIntoView を実装しないため空関数を割り当てる
    scrollIntoViewSpy = vi.fn()
    Element.prototype.scrollIntoView =
      scrollIntoViewSpy as unknown as typeof Element.prototype.scrollIntoView

    // ポーリングで status='TRANSFERRED' を返すモック
    originalFetch = globalThis.fetch
    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/dispatches/disp_pending_1') && !url.includes('last-return-odo')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: 'TRANSFERRED' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('TRANSFERRED 検出で 3 秒後 setTimeout を登録 → unmount 時に clearTimeout され router.push が呼ばれない', async () => {
    const { unmount } = render(
      React.createElement(DispatchClient, {
        assistanceId: 'assistance-1',
        dispatchType: 'onsite',
        session: SESSION,
        initialDispatch: TRANSFER_PENDING_DISPATCH,
        initialVehicleId: null,
      }),
    )

    // 30 秒経過 → setInterval のコールバックが走る → fetch resolve → setTransferCompleted + setTimeout 登録
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })

    // ポーリングが少なくとも 1 回呼ばれた（dispatchId 取得）ことを確認
    const pollCalls = fetchMock.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('/api/dispatches/disp_pending_1') &&
        !c[0].includes('last-return-odo'),
    )
    expect(pollCalls.length).toBeGreaterThanOrEqual(1)

    // この時点では setTimeout(3000) は未発火 → router.push は呼ばれていない
    expect(pushMock).not.toHaveBeenCalled()

    // setTimeout(3000) が発火する前に unmount → cleanup で clearTimeout が走る
    unmount()

    // 3 秒以上進めても setTimeout コールバックは実行されない（clearTimeout 済みのため）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(pushMock).not.toHaveBeenCalled()
  })

})
