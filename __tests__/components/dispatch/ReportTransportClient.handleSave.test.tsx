import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * ReportTransportClient — handleSave の Dispatch PATCH に isDraft が含まれないことを検証する
 * テスト（Phase 5.5 補強 / 2026-05-05）。
 *
 * 仕様の根拠は ReportOnsiteClient.handleSave.test.tsx を参照。
 *
 * テスト方針:
 *   - handleSave(true)（下書き保存ボタン）→ PATCH /api/dispatches/[id] body に
 *     isDraft キーが含まれないことを assert
 *   - handleSave(false)（完了ボタン）→ PATCH /api/dispatches/[id] body に
 *     isDraft キーが含まれないことを assert
 *   - Report POST（/report or /report/complete）の body には isDraft が引き続き含まれる
 *
 * 追加の注意:
 *   - secondaryData は付けない（DIRECT 配送・1 次のみ）
 *   - dispatch.deliveryType を 'DIRECT' にしないと storage 系の必須が走るため設定する
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

// 子コンポーネントモック
vi.mock('@/components/dispatch/ClockPicker', () => ({ default: () => null }))
vi.mock('@/components/dispatch/VehicleSelector', () => ({ default: () => null }))
vi.mock('@/components/dispatch/TransportShopAutocomplete', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    React.createElement('input', {
      'data-testid': 'transport-shop',
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    }),
}))

import ReportTransportClient from '@/components/dispatch/ReportTransportClient'
import type {
  SerializedDispatchForReport,
  SerializedReport,
} from '@/components/dispatch/ReportOnsiteClient'

const FILLED_DISPATCH: SerializedDispatchForReport = {
  id: 'disp_trans_1',
  dispatchNumber: '20260505201',
  type: 'TRANSPORT',
  dispatchTime: new Date('2026-05-05T01:00:00.000Z').toISOString(),
  arrivalTime: new Date('2026-05-05T01:30:00.000Z').toISOString(),
  transportStartTime: new Date('2026-05-05T02:00:00.000Z').toISOString(),
  completionTime: new Date('2026-05-05T03:00:00.000Z').toISOString(),
  returnTime: new Date('2026-05-05T03:30:00.000Z').toISOString(),
  departureOdo: 12000,
  arrivalOdo: 12030,
  transportStartOdo: 12030,
  completionOdo: 12080,
  returnOdo: 12110,
  vehicleId: null,
  vehicle: null,
  deliveryType: 'DIRECT',
  transferredFromId: null,
}

const FILLED_REPORT: SerializedReport = {
  id: 'rep_t_1',
  departureOdo: 12000,
  arrivalOdo: 12030,
  transportStartOdo: 12030,
  recoveryDistance: 30,
  transportDistance: 50,
  returnDistance: 30,
  completionOdo: 12080,
  returnOdo: 12110,
  recoveryHighway: null,
  transportHighway: null,
  returnHighway: null,
  totalHighway: null,
  departurePlaceName: '基地',
  arrivalPlaceName: '現場B',
  transportPlaceName: '搬送先',
  transportShopName: '○○整備工場',
  transportPhone: '03-0000-0000',
  transportAddress: '東京都港区...',
  transportContact: '担当者',
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

// jsdom 用 location モック
function withMockedLocation<T>(initialHref: string, fn: (mock: { href: string }) => T): T {
  const original = Object.getOwnPropertyDescriptor(window, 'location')!
  const mock = { href: initialHref }
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: mock,
  })
  try {
    return fn(mock)
  } finally {
    Object.defineProperty(window, 'location', original)
  }
}

describe('ReportTransportClient — handleSave の Dispatch PATCH に isDraft が含まれない（Phase 5.5 補強）', () => {
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
    offlineFetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await withMockedLocation('http://localhost/', async () => {
      render(
        React.createElement(ReportTransportClient, {
          dispatch: FILLED_DISPATCH,
          report: FILLED_REPORT,
          userName: '下田 花子',
          secondaryData: null,
        }),
      )

      const draftBtn = screen.getByRole('button', { name: /下書き保存/ })
      await act(async () => {
        fireEvent.click(draftBtn)
      })

      await waitFor(() => {
        expect(offlineFetchMock).toHaveBeenCalledWith(
          '/api/dispatches/disp_trans_1',
          expect.objectContaining({
            method: 'PATCH',
            offlineActionType: 'dispatch_update',
            offlineDispatchId: 'disp_trans_1',
          }),
        )
      })
    })

    const dispatchCall = offlineFetchMock.mock.calls.find(
      (c) =>
        c[0] === '/api/dispatches/disp_trans_1' &&
        (c[1] as { method?: string })?.method === 'PATCH',
    )
    expect(dispatchCall).toBeDefined()
    const dispatchBody = JSON.parse((dispatchCall![1] as { body: string }).body)
    expect(dispatchBody).not.toHaveProperty('isDraft')

    const reportCall = offlineFetchMock.mock.calls.find(
      (c) => c[0] === '/api/dispatches/disp_trans_1/report',
    )
    expect(reportCall).toBeDefined()
    const reportBody = JSON.parse((reportCall![1] as { body: string }).body)
    expect(reportBody).toHaveProperty('isDraft', true)
    // 搬送固有フィールドが Report payload に含まれることも確認
    expect(reportBody).toHaveProperty('transportStartOdo', 12030)
  })

  it('handleSave(false): 完了で Dispatch PATCH body に isDraft が含まれない / Report POST(complete) には含まれる', async () => {
    offlineFetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await withMockedLocation('http://localhost/', async () => {
      render(
        React.createElement(ReportTransportClient, {
          dispatch: FILLED_DISPATCH,
          report: FILLED_REPORT,
          userName: '下田 花子',
          secondaryData: null,
        }),
      )

      const completeBtn = screen.getByRole('button', { name: /完　了|完 了|完了/ })
      expect(completeBtn).toBeEnabled()

      await act(async () => {
        fireEvent.click(completeBtn)
      })

      await waitFor(() => {
        expect(offlineFetchMock).toHaveBeenCalledWith(
          '/api/dispatches/disp_trans_1/report/complete',
          expect.objectContaining({ method: 'POST' }),
        )
      })
    })

    const dispatchCall = offlineFetchMock.mock.calls.find(
      (c) =>
        c[0] === '/api/dispatches/disp_trans_1' &&
        (c[1] as { method?: string })?.method === 'PATCH',
    )
    expect(dispatchCall).toBeDefined()
    const dispatchBody = JSON.parse((dispatchCall![1] as { body: string }).body)
    expect(dispatchBody).not.toHaveProperty('isDraft')

    const reportCall = offlineFetchMock.mock.calls.find(
      (c) => c[0] === '/api/dispatches/disp_trans_1/report/complete',
    )
    expect(reportCall).toBeDefined()
    const reportBody = JSON.parse((reportCall![1] as { body: string }).body)
    expect(reportBody).toHaveProperty('isDraft', false)
    expect(reportBody).toHaveProperty('transportStartOdo', 12030)
  })
})
