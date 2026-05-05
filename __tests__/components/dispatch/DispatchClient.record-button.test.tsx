import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * DispatchClient — 出動記録ボタンの PATCH 改修テスト（Phase 5.5 / 2026-05-05）。
 *
 * 仕様:
 *   - 帰社済み（onsite step=4 / transport step=5）になったら出動記録ボタンが有効
 *   - クリック → PATCH /api/dispatches/[id] で `isDraft: true` を送信
 *   - PATCH 成功時のみ router.push(`/dispatch/[id]/record`)
 *   - PATCH 失敗時は alert + 遷移なし
 *   - PATCH ネットワークエラー時は catch → alert + 遷移なし
 *   - 連打防止（disabled 制御）
 *
 * AGENTS.md「サイレント故障チェック」準拠:
 *   - res.ok チェック
 *   - catch 句で alert
 *   - 楽観的更新は行わない（offlineFetch ではなく素の fetch）
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

// offline-fetch モック（PATCH /api/dispatches は素の fetch を使うので、
// offline-fetch は出動関連の他 API 用にだけモック化）
vi.mock('@/lib/offline-fetch', () => ({
  offlineFetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
}))

// usePhotoCapture モック
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

// onsite mode で帰社済みの dispatch（step=4）
const RETURNED_DISPATCH = {
  id: 'disp_returned_1',
  dispatchNumber: '20260505001',
  status: 'COMPLETED',
  type: 'ONSITE',
  departureOdo: 100,
  arrivalOdo: 110,
  transportStartOdo: null,
  completionOdo: 120,
  returnOdo: 130,
  dispatchTime: new Date('2026-05-05T01:00:00.000Z').toISOString(),
  arrivalTime: new Date('2026-05-05T01:30:00.000Z').toISOString(),
  completionTime: new Date('2026-05-05T02:00:00.000Z').toISOString(),
  returnTime: new Date('2026-05-05T03:00:00.000Z').toISOString(),
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

describe('DispatchClient — 出動記録ボタン PATCH 改修（Phase 5.5）', () => {
  let originalFetch: typeof globalThis.fetch
  let alertSpy: ReturnType<typeof vi.spyOn>
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    pushMock.mockClear()
    scrollIntoViewSpy = vi.fn()
    Element.prototype.scrollIntoView =
      scrollIntoViewSpy as unknown as typeof Element.prototype.scrollIntoView

    originalFetch = globalThis.fetch
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    alertSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('PATCH 成功時に isDraft:true を送信し router.push が呼ばれる', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    render(
      React.createElement(DispatchClient, {
        assistanceId: 'assistance-1',
        dispatchType: 'onsite',
        session: SESSION,
        initialDispatch: RETURNED_DISPATCH,
        initialVehicleId: null,
      }),
    )

    // 出動記録へボタンを取得
    const recordBtn = screen.getByRole('button', { name: /出動記録へ/ })
    expect(recordBtn).toBeEnabled()

    await act(async () => {
      fireEvent.click(recordBtn)
    })

    // PATCH /api/dispatches/disp_returned_1 で isDraft:true が送信される
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/dispatches/disp_returned_1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isDraft: true }),
        }),
      )
    })

    // 成功時のみ遷移
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/dispatch/disp_returned_1/record')
    })
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('PATCH 失敗（4xx/5xx）時は router.push せず alert を表示する', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'サーバ拒否' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(
      React.createElement(DispatchClient, {
        assistanceId: 'assistance-1',
        dispatchType: 'onsite',
        session: SESSION,
        initialDispatch: RETURNED_DISPATCH,
        initialVehicleId: null,
      }),
    )

    const recordBtn = screen.getByRole('button', { name: /出動記録へ/ })

    await act(async () => {
      fireEvent.click(recordBtn)
    })

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('サーバ拒否')
    })

    expect(pushMock).not.toHaveBeenCalled()
  })

  it('PATCH ネットワークエラー（catch 経由）でも alert を表示し遷移しない', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failure'))

    render(
      React.createElement(DispatchClient, {
        assistanceId: 'assistance-1',
        dispatchType: 'onsite',
        session: SESSION,
        initialDispatch: RETURNED_DISPATCH,
        initialVehicleId: null,
      }),
    )

    const recordBtn = screen.getByRole('button', { name: /出動記録へ/ })

    await act(async () => {
      fireEvent.click(recordBtn)
    })

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Network failure')
    })

    expect(pushMock).not.toHaveBeenCalled()
  })
})
