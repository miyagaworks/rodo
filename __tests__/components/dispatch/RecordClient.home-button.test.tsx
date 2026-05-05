import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * RecordClient — ホームボタン押下時の直接保存遷移化テスト（Phase 5.5 / 2026-05-05）。
 *
 * 仕様変更:
 *   - 旧: ホームボタン押下 → 確認モーダル（下書き保存して戻る/保存せずに戻る/キャンセル）
 *   - 新: ホームボタン押下 → 即 PATCH（isDraft:true）→ 成功時のみ router.push('/')
 *
 * テストケース:
 *   1) PATCH 成功時に router.push('/') が呼ばれる
 *   2) PATCH 失敗（res.ok=false）時は alert + 遷移なし
 *   3) PATCH 例外（catch）時は alert + 遷移なし
 *   4) loading 中の連打で 2 度目の PATCH が走らない（多重起動阻止）
 *
 * AGENTS.md「サイレント故障チェック」準拠:
 *   - res.ok チェック有
 *   - catch 句で alert（ユーザー通知）
 *   - 楽観的更新は行わない（offlineFetch の Response を待つ）
 *   - 連打防止（disabled / loading ガード）
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

// offline-fetch モック（テストごとに mockResolvedValueOnce で挙動切替）
const offlineFetchMock = vi.fn()
vi.mock('@/lib/offline-fetch', () => ({
  offlineFetch: (...args: unknown[]) => offlineFetchMock(...args),
}))

// useFormAutoSave モック（IndexedDB 不使用化）
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

// 子コンポーネントモック（重い依存を排除）
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

describe('RecordClient — ホームボタン直接保存遷移化（Phase 5.5）', () => {
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

  it('PATCH 成功時に isDraft:true を含む PATCH を送信し router.push("/") が呼ばれる', async () => {
    offlineFetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    render(
      React.createElement(RecordClient, {
        dispatch: BASE_DISPATCH,
        userName: '下田 花子',
        report: null,
      }),
    )

    const homeBtn = screen.getByRole('button', { name: 'ホームに戻る' })
    expect(homeBtn).toBeEnabled()

    await act(async () => {
      fireEvent.click(homeBtn)
    })

    await waitFor(() => {
      expect(offlineFetchMock).toHaveBeenCalledWith(
        '/api/dispatches/disp_1',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          offlineActionType: 'dispatch_update',
          offlineDispatchId: 'disp_1',
        }),
      )
    })

    // body に isDraft:true が含まれる
    const callArgs = offlineFetchMock.mock.calls[0]
    const body = JSON.parse((callArgs[1] as { body: string }).body)
    expect(body.isDraft).toBe(true)

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/')
    })
    expect(alertSpy).not.toHaveBeenCalled()
    expect(clearDraftMock).toHaveBeenCalled()
  })

  it('PATCH 失敗（res.ok=false）時は router.push せず alert を表示する', async () => {
    offlineFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'fail' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(
      React.createElement(RecordClient, {
        dispatch: BASE_DISPATCH,
        userName: '下田 花子',
        report: null,
      }),
    )

    const homeBtn = screen.getByRole('button', { name: 'ホームに戻る' })

    await act(async () => {
      fireEvent.click(homeBtn)
    })

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('下書きの保存に失敗しました')
    })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('PATCH 例外（catch）時は alert を表示し遷移しない', async () => {
    offlineFetchMock.mockRejectedValueOnce(new Error('Network failure'))

    render(
      React.createElement(RecordClient, {
        dispatch: BASE_DISPATCH,
        userName: '下田 花子',
        report: null,
      }),
    )

    const homeBtn = screen.getByRole('button', { name: 'ホームに戻る' })

    await act(async () => {
      fireEvent.click(homeBtn)
    })

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Network failure')
    })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('loading 中の連打で 2 度目の PATCH は走らない（多重起動阻止）', async () => {
    // PATCH を解決可能な Promise で保留させる
    let resolvePatch: ((res: Response) => void) | null = null
    const pending = new Promise<Response>((resolve) => {
      resolvePatch = resolve
    })
    offlineFetchMock.mockReturnValueOnce(pending)

    render(
      React.createElement(RecordClient, {
        dispatch: BASE_DISPATCH,
        userName: '下田 花子',
        report: null,
      }),
    )

    const homeBtn = screen.getByRole('button', { name: 'ホームに戻る' })

    // 1 回目クリック → loading=true へ遷移
    await act(async () => {
      fireEvent.click(homeBtn)
    })

    // disabled 属性が付くまで待機
    await waitFor(() => {
      expect(homeBtn).toBeDisabled()
    })

    // 2 回目クリック（disabled でも fireEvent は呼べるが loading ガードで弾かれる）
    await act(async () => {
      fireEvent.click(homeBtn)
    })

    // PATCH は 1 回しか走っていない
    expect(offlineFetchMock).toHaveBeenCalledTimes(1)

    // 後始末：保留中の PATCH を完了させる
    await act(async () => {
      resolvePatch?.(new Response('{}', { status: 200 }))
      await pending
    })

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/')
    })
  })
})
