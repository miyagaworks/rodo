import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * ReportOnsiteClient — handleSave の Dispatch PATCH に isDraft が含まれないことを検証する
 * テスト（Phase 5.5 補強 / 2026-05-05）。
 *
 * 背景:
 *   Phase 5.5 で `dispatch.isDraft` は「書類作成中フラグ」として、出動記録ボタン押下
 *   （DispatchClient.handleClickRecord）と 2 次搬送帰社時（SecondaryDispatchClient L454）
 *   でのみ更新する設計に確定した。Report 系 handleSave の Dispatch PATCH に isDraft を
 *   含めると、報告完了時に false に巻き戻されて active 判定（帰社後・isDraft=false → active）
 *   と矛盾し、ホーム画面で進行中バナーが復活する。
 *
 * テスト方針:
 *   - handleSave(true)（下書き保存ボタン）→ PATCH /api/dispatches/[id] body に
 *     isDraft キーが含まれないことを assert
 *   - handleSave(false)（完了ボタン）→ PATCH /api/dispatches/[id] body に
 *     isDraft キーが含まれないことを assert
 *   - Report 用 POST（/api/dispatches/[id]/report or report/complete）の body には
 *     isDraft が引き続き含まれることを assert（buildReportPayload は変更しない仕様）
 *
 * AGENTS.md「サイレント故障チェック」:
 *   - res.ok チェック有（dispatchRes / reportRes とも throw に変換されている）
 *   - catch 句で alert（ユーザー通知）
 *   - 楽観的更新は行わない（offlineFetch の Response を待ってから clearDraft）
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
const saveFormDataMock = vi.fn()
vi.mock('@/hooks/useFormAutoSave', () => ({
  useFormAutoSave: () => ({
    saveFormData: saveFormDataMock,
    clearDraft: clearDraftMock,
    restoreDraft: vi.fn().mockResolvedValue(null),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    restored: true,
  }),
}))

// useVehicles モック
vi.mock('@/hooks/useVehicles', () => ({
  useVehicles: () => ({ vehicles: [], loading: false }),
}))

// 子コンポーネントモック（重い依存を排除）
vi.mock('@/components/dispatch/ClockPicker', () => ({ default: () => null }))
vi.mock('@/components/dispatch/VehicleSelector', () => ({ default: () => null }))

import ReportOnsiteClient, {
  type SerializedDispatchForReport,
  type SerializedReport,
} from '@/components/dispatch/ReportOnsiteClient'

// 完了ボタンを有効化するため、必須項目をすべて埋めた fixture
const FILLED_DISPATCH: SerializedDispatchForReport = {
  id: 'disp_onsite_1',
  dispatchNumber: '20260505101',
  type: 'ONSITE',
  dispatchTime: new Date('2026-05-05T01:00:00.000Z').toISOString(),
  arrivalTime: new Date('2026-05-05T01:30:00.000Z').toISOString(),
  transportStartTime: null,
  completionTime: new Date('2026-05-05T02:30:00.000Z').toISOString(),
  returnTime: new Date('2026-05-05T03:00:00.000Z').toISOString(),
  departureOdo: 12000,
  arrivalOdo: null,
  transportStartOdo: null,
  completionOdo: 12030,
  returnOdo: 12060,
  vehicleId: null,
  vehicle: null,
  deliveryType: null,
  transferredFromId: null,
}

const FILLED_REPORT: SerializedReport = {
  id: 'rep_1',
  departureOdo: 12000,
  arrivalOdo: null,
  transportStartOdo: null,
  recoveryDistance: 30,
  transportDistance: null,
  returnDistance: 30,
  completionOdo: 12030,
  returnOdo: 12060,
  recoveryHighway: null,
  transportHighway: null,
  returnHighway: null,
  totalHighway: null,
  departurePlaceName: '基地',
  arrivalPlaceName: '現場A',
  transportPlaceName: null,
  transportShopName: null,
  transportPhone: null,
  transportAddress: null,
  transportContact: null,
  transportMemo: null,
  primaryCompletionItems: { doily: false, cleaning: false, protection: false },
  primaryCompletionNote: null,
  secondaryCompletionItems: null,
  secondaryCompletionNote: null,
  primaryAmount: null,
  secondaryAmount: null,
  totalConfirmedAmount: null,
  storageRequired: null,
  billingContactMemo: null,
  isDraft: true,
}

// jsdom は window.location.href への代入を未サポートのため、location オブジェクト自体を
// テスト中だけ Proxy で差し替えて代入を検出する。
// 注意: try { return fn(mock) } finally { ... } の形だと async fn の場合 finally が
// 同期的に走り、await 中に location が元に戻ってしまう。`return await` で promise を
// 解決してから finally に到達させる。
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

describe('ReportOnsiteClient — handleSave の Dispatch PATCH に isDraft が含まれない（Phase 5.5 補強）', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    pushMock.mockClear()
    offlineFetchMock.mockReset()
    clearDraftMock.mockClear()
    saveFormDataMock.mockClear()
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    alertSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('handleSave(true): 下書き保存で Dispatch PATCH body に isDraft が含まれない / Report POST には含まれる', async () => {
    // 1 回目: Dispatch PATCH, 2 回目: Report POST
    offlineFetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await withMockedLocation('http://localhost/', async () => {
      render(
        React.createElement(ReportOnsiteClient, {
          dispatch: FILLED_DISPATCH,
          report: FILLED_REPORT,
          userName: '下田 花子',
        }),
      )

      const draftBtn = screen.getByRole('button', { name: /下書き保存/ })
      await act(async () => {
        fireEvent.click(draftBtn)
      })

      await waitFor(() => {
        expect(offlineFetchMock).toHaveBeenCalledWith(
          '/api/dispatches/disp_onsite_1',
          expect.objectContaining({
            method: 'PATCH',
            offlineActionType: 'dispatch_update',
            offlineDispatchId: 'disp_onsite_1',
          }),
        )
      })
    })

    // Dispatch PATCH (1 回目)
    const dispatchCall = offlineFetchMock.mock.calls.find(
      (c) =>
        c[0] === '/api/dispatches/disp_onsite_1' &&
        (c[1] as { method?: string })?.method === 'PATCH',
    )
    expect(dispatchCall).toBeDefined()
    const dispatchBody = JSON.parse((dispatchCall![1] as { body: string }).body)
    expect(dispatchBody).not.toHaveProperty('isDraft')

    // Report POST (下書き保存なら /report エンドポイント)
    const reportCall = offlineFetchMock.mock.calls.find(
      (c) => c[0] === '/api/dispatches/disp_onsite_1/report',
    )
    expect(reportCall).toBeDefined()
    const reportBody = JSON.parse((reportCall![1] as { body: string }).body)
    expect(reportBody).toHaveProperty('isDraft', true)
  })

  it('handleSave(false): 完了で Dispatch PATCH body に isDraft が含まれない / Report POST(complete) には含まれる', async () => {
    offlineFetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await withMockedLocation('http://localhost/', async () => {
      render(
        React.createElement(ReportOnsiteClient, {
          dispatch: FILLED_DISPATCH,
          report: FILLED_REPORT,
          userName: '下田 花子',
        }),
      )

      // 必須項目が埋まっているため「完　了」ボタンが有効
      const completeBtn = screen.getByRole('button', { name: /完　了|完 了|完了/ })
      expect(completeBtn).toBeEnabled()

      await act(async () => {
        fireEvent.click(completeBtn)
      })

      await waitFor(() => {
        expect(offlineFetchMock).toHaveBeenCalledWith(
          '/api/dispatches/disp_onsite_1/report/complete',
          expect.objectContaining({ method: 'POST' }),
        )
      })
    })

    // Dispatch PATCH
    const dispatchCall = offlineFetchMock.mock.calls.find(
      (c) =>
        c[0] === '/api/dispatches/disp_onsite_1' &&
        (c[1] as { method?: string })?.method === 'PATCH',
    )
    expect(dispatchCall).toBeDefined()
    const dispatchBody = JSON.parse((dispatchCall![1] as { body: string }).body)
    expect(dispatchBody).not.toHaveProperty('isDraft')

    // Report POST (complete エンドポイント)
    const reportCall = offlineFetchMock.mock.calls.find(
      (c) => c[0] === '/api/dispatches/disp_onsite_1/report/complete',
    )
    expect(reportCall).toBeDefined()
    const reportBody = JSON.parse((reportCall![1] as { body: string }).body)
    expect(reportBody).toHaveProperty('isDraft', false)
  })
})

describe('ReportOnsiteClient — handleSave 後の dispatch.isDraft assert（Phase 7 A-2a）', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    pushMock.mockClear()
    offlineFetchMock.mockReset()
    clearDraftMock.mockClear()
    saveFormDataMock.mockClear()
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    alertSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('正常系: PATCH レスポンスで isDraft:true が返る → window.location.href が "/" に書き換わる', async () => {
    // 1 回目: Dispatch PATCH（isDraft:true を返す）, 2 回目: Report POST
    offlineFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'disp_onsite_1', isDraft: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    offlineFetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    )

    await withMockedLocation('http://localhost/', async (loc) => {
      render(
        React.createElement(ReportOnsiteClient, {
          dispatch: FILLED_DISPATCH,
          report: FILLED_REPORT,
          userName: '下田 花子',
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

  it('異常系: PATCH レスポンスで isDraft:false が返る → 遷移せず alert + console.error', async () => {
    offlineFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'disp_onsite_1', isDraft: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    offlineFetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    )

    await withMockedLocation('http://localhost/', async (loc) => {
      render(
        React.createElement(ReportOnsiteClient, {
          dispatch: FILLED_DISPATCH,
          report: FILLED_REPORT,
          userName: '下田 花子',
        }),
      )

      const draftBtn = screen.getByRole('button', { name: /下書き保存/ })
      await act(async () => {
        fireEvent.click(draftBtn)
      })

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[ReportOnsiteClient.handleSave] Unexpected dispatch.isDraft after save',
          expect.objectContaining({
            dispatchId: 'disp_onsite_1',
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
    offlineFetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    )

    await withMockedLocation('http://localhost/', async (loc) => {
      render(
        React.createElement(ReportOnsiteClient, {
          dispatch: FILLED_DISPATCH,
          report: FILLED_REPORT,
          userName: '下田 花子',
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

describe('ReportOnsiteClient — ヘッダーホームボタン auto-save 統一（Phase 7 C-1）', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    pushMock.mockClear()
    offlineFetchMock.mockReset()
    clearDraftMock.mockClear()
    saveFormDataMock.mockClear()
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    alertSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('ヘッダーホームボタン押下 → handleSave(true) 経路 → Dispatch PATCH + Report POST + window.location.href="/"', async () => {
    offlineFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'disp_onsite_1', isDraft: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    offlineFetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    )

    await withMockedLocation('http://localhost/', async (loc) => {
      render(
        React.createElement(ReportOnsiteClient, {
          dispatch: FILLED_DISPATCH,
          report: FILLED_REPORT,
          userName: '下田 花子',
        }),
      )

      const homeBtn = screen.getByRole('button', { name: 'ホームに戻る' })
      expect(homeBtn).toBeEnabled()

      await act(async () => {
        fireEvent.click(homeBtn)
      })

      await waitFor(() => {
        expect(loc.href).toBe('/')
      })
    })

    // Dispatch PATCH が呼ばれている
    const dispatchCall = offlineFetchMock.mock.calls.find(
      (c) =>
        c[0] === '/api/dispatches/disp_onsite_1' &&
        (c[1] as { method?: string })?.method === 'PATCH',
    )
    expect(dispatchCall).toBeDefined()

    // Report POST（下書き = /report エンドポイント）が呼ばれている
    const reportCall = offlineFetchMock.mock.calls.find(
      (c) => c[0] === '/api/dispatches/disp_onsite_1/report',
    )
    expect(reportCall).toBeDefined()
    const reportBody = JSON.parse((reportCall![1] as { body: string }).body)
    expect(reportBody).toHaveProperty('isDraft', true)
  })
})
