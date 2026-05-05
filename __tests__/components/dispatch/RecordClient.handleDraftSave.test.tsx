import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * RecordClient — handleDraftSave 後の dispatch.isDraft assert（Phase 7 改訂スコープ A-2c / 2026-05-05）。
 *
 * 検証範囲:
 *   - 下書き保存ボタン押下 → handleDraftSave 経路
 *   - 保存後 PATCH レスポンスの isDraft が true ならホーム遷移
 *   - 保存後 PATCH レスポンスの isDraft が false なら遷移停止 + console.error + alert
 *   - X-SW-Offline:1 ヘッダの場合は assert スキップ
 *
 * 計画書: docs/plans/dispatch-floating-prevention.md §3 Phase 7 #4
 * 引き継ぎ: docs/handover/2026-05-04-dispatch-floating-prevention.md §K.2.1
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
const offlineFetchMock = vi.fn()
vi.mock('@/lib/offline-fetch', () => ({
  offlineFetch: (...args: unknown[]) => offlineFetchMock(...args),
}))

// useFormAutoSave モック
const clearDraftMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/hooks/useFormAutoSave', () => ({
  useFormAutoSave: () => ({
    saveFormData: vi.fn(),
    clearDraft: clearDraftMock,
    restoreDraft: vi.fn().mockResolvedValue(null),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    restored: true,
  }),
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

// useVehicles モック
vi.mock('@/hooks/useVehicles', () => ({
  useVehicles: () => ({ vehicles: [], loading: false }),
}))

// 子コンポーネントモック
vi.mock('@/components/dispatch/ClockPicker', () => ({ default: () => null }))
vi.mock('@/components/dispatch/NumberPlateInput', () => ({ default: () => null }))
vi.mock('@/components/dispatch/VehicleSelector', () => ({ default: () => null }))
vi.mock('@/components/dispatch/PhotoThumbnails', () => ({ default: () => null }))
vi.mock('@/components/dispatch/PhotoModal', () => ({ default: () => null }))

import RecordClient, { type SerializedDispatch } from '@/components/dispatch/RecordClient'

const BASE_DISPATCH: SerializedDispatch = {
  id: 'disp_1',
  dispatchNumber: '20260505001',
  type: 'ONSITE',
  assistanceId: 'assistance-1',
  dispatchTime: new Date('2026-05-05T01:00:00.000Z').toISOString(),
  arrivalTime: new Date('2026-05-05T01:30:00.000Z').toISOString(),
  completionTime: null,
  transportStartTime: null,
  address: null,
  highwayName: null,
  highwayDirection: null,
  kiloPost: null,
  customerName: null,
  vehicleName: null,
  plateRegion: null,
  plateClass: null,
  plateKana: null,
  plateNumber: null,
  situationType: null,
  situationDetail: null,
  canDrive: null,
  deliveryType: null,
  memo: null,
  isHighway: false,
  weather: null,
  trafficControl: null,
  parkingLocation: null,
  areaIcName: null,
  insuranceCompanyId: null,
  isDraft: true,
  vehicleId: null,
  vehicle: null,
}

// jsdom 用 location モック（async fn の finally タイミング問題を回避）
async function withMockedLocation<T>(
  initialHref: string,
  fn: (mock: { href: string }) => Promise<T> | T,
): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(window, 'location')!
  const mock = { href: initialHref }
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: mock,
  })
  try {
    return await fn(mock)
  } finally {
    Object.defineProperty(window, 'location', original)
  }
}

describe('RecordClient — handleDraftSave 後の dispatch.isDraft assert（Phase 7 A-2c）', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let originalFetch: typeof globalThis.fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    pushMock.mockClear()
    offlineFetchMock.mockReset()
    clearDraftMock.mockClear()
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // RecordClient 内部の素 fetch（insurance-companies）対策
    originalFetch = globalThis.fetch
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    alertSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('正常系: PATCH レスポンスで isDraft:true が返る → window.location.href が "/" に書き換わる', async () => {
    offlineFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'disp_1', isDraft: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await withMockedLocation('http://localhost/', async (loc) => {
      render(
        React.createElement(RecordClient, {
          dispatch: BASE_DISPATCH,
          userName: '下田 花子',
          report: null,
        }),
      )

      const draftBtn = screen.getByRole('button', { name: /下書き保存/ })
      await act(async () => {
        fireEvent.click(draftBtn)
      })

      await waitFor(() => {
        expect(loc.href).toBe('/')
      })
      expect(alertSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(clearDraftMock).toHaveBeenCalled()
    })
  })

  it('異常系: PATCH レスポンスで isDraft:false が返る → 遷移せず alert + console.error', async () => {
    offlineFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'disp_1', isDraft: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await withMockedLocation('http://localhost/', async (loc) => {
      render(
        React.createElement(RecordClient, {
          dispatch: BASE_DISPATCH,
          userName: '下田 花子',
          report: null,
        }),
      )

      const draftBtn = screen.getByRole('button', { name: /下書き保存/ })
      await act(async () => {
        fireEvent.click(draftBtn)
      })

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[RecordClient.handleDraftSave] Unexpected dispatch.isDraft after save',
          expect.objectContaining({
            dispatchId: 'disp_1',
            expected: true,
            actual: false,
          }),
        )
      })

      expect(alertSpy).toHaveBeenCalledWith(
        '保存後の状態が想定外です。ホームに戻れません。サポートに連絡してください。',
      )
      expect(loc.href).toBe('http://localhost/')
    })
  })

  it('楽観オフライン: X-SW-Offline:1 ヘッダの場合は assert スキップ → 遷移する', async () => {
    offlineFetchMock.mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: { 'X-SW-Offline': '1', 'Content-Type': 'application/json' },
      }),
    )

    await withMockedLocation('http://localhost/', async (loc) => {
      render(
        React.createElement(RecordClient, {
          dispatch: BASE_DISPATCH,
          userName: '下田 花子',
          report: null,
        }),
      )

      const draftBtn = screen.getByRole('button', { name: /下書き保存/ })
      await act(async () => {
        fireEvent.click(draftBtn)
      })

      await waitFor(() => {
        expect(loc.href).toBe('/')
      })
      expect(alertSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })
  })
})
