/**
 * StoredVehicleList コンポーネントのテスト
 *
 * - 0 件表示
 * - 「未定」バッジの出現
 * - 複数件のソート結果（today → tomorrow → undecided の順）
 * - [編集] クリックで Editor が開く
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import StoredVehicleList from '@/components/admin/StoredVehicleList'

function wrap(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

function makeItem(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? `d-${Math.random()}`,
    dispatchNumber: overrides.dispatchNumber ?? '20260428-001',
    dispatchTime: '2026-04-28T01:00:00.000Z',
    status: 'STORED',
    isDraft: false,
    billedAt: null,
    scheduledSecondaryAt: overrides.scheduledSecondaryAt ?? null,
    type: 'TRANSPORT' as const,
    user: { id: 'u1', name: '山田' },
    assistance: { id: 'a1', name: 'PA', displayAbbreviation: 'PA' },
    customerName: null,
    plate: {
      region: '練馬',
      class: '500',
      kana: 'あ',
      number: '1234',
    },
    report: null,
    ...overrides,
  }
}

describe('StoredVehicleList', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('0 件のとき「保管中の車両はありません」が表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ dispatches: [], total: 0, page: 1, pageSize: 200 }),
    })

    wrap(<StoredVehicleList today="2026-04-28" />)

    await waitFor(() => {
      expect(screen.getByTestId('stored-empty')).toBeTruthy()
    })
    expect(screen.getByTestId('stored-empty').textContent).toContain(
      '保管中の車両はありません',
    )
  })

  it('「未定」案件には未定バッジが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          dispatches: [
            makeItem({
              id: 'd-undec',
              dispatchNumber: '20260428-001',
              scheduledSecondaryAt: null,
            }),
          ],
          total: 1,
          page: 1,
          pageSize: 200,
        }),
    })

    wrap(<StoredVehicleList today="2026-04-28" />)

    await waitFor(() => {
      const badge = screen.getByTestId('scheduled-badge')
      expect(badge.textContent).toBe('未定')
    })
  })

  it('複数件: today → tomorrow → undecided の順で並ぶ', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          dispatches: [
            makeItem({
              id: 'd-undec',
              dispatchNumber: '20260423-001',
              scheduledSecondaryAt: null,
            }),
            makeItem({
              id: 'd-tomorrow',
              dispatchNumber: '20260424-001',
              scheduledSecondaryAt: new Date(
                '2026-04-29T05:00:00+09:00',
              ).toISOString(),
            }),
            makeItem({
              id: 'd-today',
              dispatchNumber: '20260425-001',
              scheduledSecondaryAt: new Date(
                '2026-04-28T15:00:00+09:00',
              ).toISOString(),
            }),
          ],
          total: 3,
          page: 1,
          pageSize: 200,
        }),
    })

    wrap(<StoredVehicleList today="2026-04-28" />)

    await waitFor(() => {
      expect(screen.getAllByTestId('stored-vehicle-row')).toHaveLength(3)
    })

    const numbers = screen
      .getAllByTestId('dispatch-number')
      .map((el) => el.textContent)
    expect(numbers).toEqual([
      '#20260425-001', // today
      '#20260424-001', // tomorrow
      '#20260423-001', // undecided
    ])
  })

  it('[編集] クリックで Editor が開く', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          dispatches: [
            makeItem({
              id: 'd-1',
              dispatchNumber: '20260428-001',
              scheduledSecondaryAt: null,
            }),
          ],
          total: 1,
          page: 1,
          pageSize: 200,
        }),
    })

    wrap(<StoredVehicleList today="2026-04-28" />)

    const editBtn = await screen.findByTestId('edit-button')
    expect(screen.queryByTestId('scheduled-secondary-editor')).toBeNull()
    fireEvent.click(editBtn)
    expect(screen.getByTestId('scheduled-secondary-editor')).toBeTruthy()
  })
})
