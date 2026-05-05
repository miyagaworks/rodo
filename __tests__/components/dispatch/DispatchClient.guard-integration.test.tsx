import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

/**
 * DispatchClient — 進行中ガードの popstate→モーダル表示 結合テスト（Phase 6 / Scope B）。
 *
 * 検証範囲（最小限）:
 *   - inProgress=true（step >= 1）の状態でマウント
 *   - window.dispatchEvent(new PopStateEvent('popstate')) で popstate を発火
 *   - useDispatchInProgressGuard 経由で onAttemptHome → setShowGuardModal(true)
 *   - BackToHomeConfirmModal が表示される
 *   - モーダルの onClose（OK ボタン）で showGuardModal=false に戻る
 *
 * スコープ膨張を避けるため、全機能の検証はせず popstate→モーダル wiring のみ確認する。
 *
 * 計画書: docs/plans/dispatch-floating-prevention.md §3 Phase 6
 * 引き継ぎ: docs/handover/2026-05-04-dispatch-floating-prevention.md §N.7
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

// 重い子コンポーネントを軽量モック化（描画コスト削減 + 内部 fetch 抑止）
vi.mock('@/components/dispatch/ClockPicker', () => ({
  default: () => null,
}))
vi.mock('@/components/common/OdoDialInput', () => ({
  default: () => null,
}))
vi.mock('@/components/common/AppFooter', () => ({
  default: () => null,
}))
vi.mock('@/components/dispatch/CancelDispatchButton', () => ({
  CancelDispatchButton: () => null,
}))

// 動的 import 対象なので import 後に
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

const ACTIVE_DISPATCH = {
  id: 'disp_active_1',
  dispatchNumber: '20260504001',
  status: 'DISPATCHED',
  type: 'ONSITE',
  departureOdo: 100,
  arrivalOdo: null,
  transportStartOdo: null,
  completionOdo: null,
  returnOdo: null,
  dispatchTime: new Date('2026-05-04T02:49:38.387Z').toISOString(),
  arrivalTime: null,
  completionTime: null,
  returnTime: null,
  transportStartTime: null,
  deliveryType: null,
  transferStatus: null,
  transferredFromId: null,
  transferredToUserName: null,
  transferredToDispatchNumber: null,
  transferredFromUserName: null,
  vehicleId: null,
  isDraft: false,
}

describe('DispatchClient — 進行中ガードの popstate→モーダル表示 結合', () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    pushMock.mockClear()
    // jsdom は scrollIntoView を実装しないため空関数を割り当てる
    scrollIntoViewSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewSpy as unknown as typeof Element.prototype.scrollIntoView

    // 念のため、global fetch も無効化（マウント時に走る可能性のある fetch を抑止）
    originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('popstate 発火で BackToHomeConfirmModal が表示され、OK 押下で閉じる', () => {
    render(
      React.createElement(DispatchClient, {
        assistanceId: 'assistance-1',
        dispatchType: 'onsite',
        session: SESSION,
        initialDispatch: ACTIVE_DISPATCH,
        initialVehicleId: null,
      }),
    )

    // 初期状態ではモーダル非表示
    expect(screen.queryByText(/進行中の案件があります/)).not.toBeInTheDocument()

    // popstate 発火 → useDispatchInProgressGuard の onAttemptHome → setShowGuardModal(true)
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    // モーダルが表示される
    expect(screen.getByText(/進行中の案件があります/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()

    // OK ボタン押下 → onClose → showGuardModal=false → モーダル消える
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByText(/進行中の案件があります/)).not.toBeInTheDocument()

    // popstate ハンドラは router.push を呼ばない（戻れない仕様）
    expect(pushMock).not.toHaveBeenCalled()
  })
})
