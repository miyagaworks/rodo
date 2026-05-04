import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

/**
 * SecondaryDispatchClient — 進行中ガードの popstate→モーダル表示 結合テスト（Phase 6 / Scope B）。
 *
 * 検証範囲（最小限）:
 *   - inProgress=true（step >= 1）の状態でマウント
 *   - window.dispatchEvent(new PopStateEvent('popstate')) で popstate を発火
 *   - useDispatchInProgressGuard 経由で onAttemptHome → setShowGuardModal(true)
 *   - BackToHomeConfirmModal が表示される
 *   - モーダルの onClose（OK ボタン）で showGuardModal=false に戻る
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

// offline-fetch モック
vi.mock('@/lib/offline-fetch', () => ({
  offlineFetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
}))

// 重い子コンポーネントを軽量モック化
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

import SecondaryDispatchClient from '@/components/dispatch/SecondaryDispatchClient'

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
} as unknown as React.ComponentProps<typeof SecondaryDispatchClient>['session']

const PARENT_DISPATCH = {
  id: 'parent_disp_1',
  dispatchNumber: '20260504001',
  assistanceId: 'assistance-1',
  status: 'COMPLETED',
  completionOdo: 200,
}

const ACTIVE_SECONDARY = {
  id: 'sec_disp_1',
  dispatchNumber: '20260504001-2',
  status: 'DISPATCHED',
  departureOdo: 200,
  arrivalOdo: null,
  completionOdo: null,
  returnOdo: null,
  dispatchTime: new Date('2026-05-04T03:30:00.000Z').toISOString(),
  arrivalTime: null,
  completionTime: null,
  returnTime: null,
}

describe('SecondaryDispatchClient — 進行中ガードの popstate→モーダル表示 結合', () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    pushMock.mockClear()
    scrollIntoViewSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewSpy as unknown as typeof Element.prototype.scrollIntoView

    originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('popstate 発火で BackToHomeConfirmModal が表示され、OK 押下で閉じる', () => {
    render(
      React.createElement(SecondaryDispatchClient, {
        parentDispatch: PARENT_DISPATCH,
        initialSecondary: ACTIVE_SECONDARY,
        session: SESSION,
      }),
    )

    expect(screen.queryByText(/進行中の案件があります/)).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByText(/進行中の案件があります/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByText(/進行中の案件があります/)).not.toBeInTheDocument()

    expect(pushMock).not.toHaveBeenCalled()
  })
})
