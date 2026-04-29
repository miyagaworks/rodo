/**
 * DispatchTable のテスト
 *
 * - 案件行レンダリング（基本列）
 * - 持ち越し赤バッジ表示（dispatchTime < today かつ billedAt=null）
 * - 請求トグルクリックで PATCH /api/admin/dispatches/[id]/billing が呼ばれる
 * - status=stored 時のみ「搬送予定」列が出現する
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import DispatchTable from '@/components/admin/DispatchTable'

function wrap(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

interface ItemOverride {
  id?: string
  dispatchNumber?: string
  dispatchTime?: string | null
  status?: string
  isDraft?: boolean
  billedAt?: string | null
  scheduledSecondaryAt?: string | null
}

function makeItem(o: ItemOverride = {}) {
  return {
    id: o.id ?? `d-${Math.random()}`,
    dispatchNumber: o.dispatchNumber ?? '20260427-001',
    dispatchTime: o.dispatchTime ?? '2026-04-27T01:23:00.000Z', // JST 10:23
    status: o.status ?? 'COMPLETED',
    isDraft: o.isDraft ?? false,
    billedAt: o.billedAt ?? null,
    scheduledSecondaryAt: o.scheduledSecondaryAt ?? null,
    type: 'ONSITE' as const,
    user: { id: 'u1', name: '山田' },
    assistance: { id: 'a1', name: 'PA Co', displayAbbreviation: 'PA' },
    customerName: null,
    plate: null,
    report: null,
  }
}

function mockListOnce(items: ReturnType<typeof makeItem>[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        dispatches: items,
        total: items.length,
        page: 1,
        pageSize: 50,
      }),
  })
}

describe('DispatchTable', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('案件行が描画される', async () => {
    mockListOnce([
      makeItem({ id: 'd-1', dispatchNumber: '20260427-001' }),
      makeItem({ id: 'd-2', dispatchNumber: '20260427-002' }),
    ])
    wrap(<DispatchTable filter={{}} today="2026-04-28" />)
    await waitFor(() => {
      expect(screen.getAllByTestId('dispatch-row')).toHaveLength(2)
    })
    expect(screen.getByText('20260427-001')).toBeTruthy()
    expect(screen.getByText('20260427-002')).toBeTruthy()
  })

  it('dispatchTime < today かつ billedAt=null の行に「持ち越し」バッジが出る', async () => {
    mockListOnce([
      // 4/27 (前日) で未請求 → 持ち越し
      makeItem({
        id: 'd-overdue',
        dispatchNumber: '20260427-001',
        dispatchTime: '2026-04-27T01:23:00.000Z', // JST 4/27 10:23
        billedAt: null,
      }),
      // 4/28 (当日) で未請求 → 持ち越しではない
      makeItem({
        id: 'd-today',
        dispatchNumber: '20260428-001',
        dispatchTime: '2026-04-28T02:00:00.000Z', // JST 4/28 11:00
        billedAt: null,
      }),
      // 4/26 (前々日) で請求済 → 持ち越しではない
      makeItem({
        id: 'd-billed',
        dispatchNumber: '20260426-005',
        dispatchTime: '2026-04-26T00:11:00.000Z',
        billedAt: '2026-04-27T00:00:00.000Z',
      }),
    ])
    wrap(<DispatchTable filter={{}} today="2026-04-28" />)
    await waitFor(() => {
      expect(screen.getAllByTestId('dispatch-row')).toHaveLength(3)
    })
    const badges = screen.getAllByTestId('overdue-badge')
    expect(badges).toHaveLength(1)
  })

  it('請求トグル「請求済にする」クリックで PATCH /billing が呼ばれる', async () => {
    mockListOnce([
      makeItem({
        id: 'd-1',
        dispatchNumber: '20260427-001',
        billedAt: null,
      }),
    ])
    // PATCH レスポンス
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'd-1', billedAt: new Date().toISOString() }),
    })
    // 楽観更新後の invalidate で再 GET される可能性に備えて
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          dispatches: [
            makeItem({
              id: 'd-1',
              dispatchNumber: '20260427-001',
              billedAt: new Date().toISOString(),
            }),
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
    })

    wrap(<DispatchTable filter={{}} today="2026-04-28" />)

    const toggle = await screen.findByTestId('billing-toggle-on')
    fireEvent.click(toggle)

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/billing'),
      )
      expect(call).toBeTruthy()
      expect(call?.[0]).toBe('/api/admin/dispatches/d-1/billing')
      expect(call?.[1]).toMatchObject({
        method: 'PATCH',
      })
      const body = JSON.parse(call?.[1].body as string)
      expect(body).toEqual({ billed: true })
    })
  })

  it('status=stored のとき「搬送予定」列が出現する', async () => {
    mockListOnce([
      makeItem({
        id: 'd-stored',
        dispatchNumber: '20260427-099',
        status: 'STORED',
        scheduledSecondaryAt: '2026-04-29T05:00:00+09:00',
      }),
    ])
    wrap(<DispatchTable filter={{ status: 'stored' }} today="2026-04-28" />)
    await waitFor(() => {
      expect(screen.getByTestId('dispatch-row')).toBeTruthy()
    })
    // ヘッダかセル本文に「搬送予定」が存在する
    expect(screen.getAllByText(/搬送予定/).length).toBeGreaterThan(0)
  })

  it('status!=stored のとき「搬送予定」列は出現しない', async () => {
    mockListOnce([makeItem({ id: 'd-1' })])
    wrap(<DispatchTable filter={{}} today="2026-04-28" />)
    await waitFor(() => {
      expect(screen.getByTestId('dispatch-row')).toBeTruthy()
    })
    expect(screen.queryAllByText(/搬送予定/)).toHaveLength(0)
  })
})
