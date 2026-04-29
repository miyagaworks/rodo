/**
 * DispatchTableFilters のテスト
 *
 * - 入力変更で onChange が呼ばれる（status / 期間 / 隊員 / AS）
 * - リセットボタンで EMPTY_FILTERS が onChange に渡る
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import DispatchTableFilters, {
  EMPTY_FILTERS,
  type DispatchTableFiltersValue,
} from '@/components/admin/DispatchTableFilters'

function wrap(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

function mockUserAndAssistanceFetch() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/users')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 'u1', name: '山田' },
            { id: 'u2', name: '鈴木' },
          ]),
      })
    }
    if (url.includes('/api/assistances')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 'a1', name: 'PA Co', displayAbbreviation: 'PA' },
            { id: 'a2', name: 'SC Co', displayAbbreviation: 'SC' },
          ]),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve(null) })
  })
}

describe('DispatchTableFilters', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('開始日を変更すると onChange が呼ばれる', () => {
    mockUserAndAssistanceFetch()
    const onChange = vi.fn()
    wrap(
      <DispatchTableFilters value={EMPTY_FILTERS} onChange={onChange} />,
    )
    const fromInput = screen.getByTestId('filter-from')
    fireEvent.change(fromInput, { target: { value: '2026-04-01' } })
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      from: '2026-04-01',
    })
  })

  it('ステータス select を変更すると onChange が呼ばれる', () => {
    mockUserAndAssistanceFetch()
    const onChange = vi.fn()
    wrap(
      <DispatchTableFilters value={EMPTY_FILTERS} onChange={onChange} />,
    )
    const select = screen.getByTestId('filter-status')
    fireEvent.change(select, { target: { value: 'unbilled' } })
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      status: 'unbilled',
    })
  })

  it('隊員 / AS の選択肢が描画される', async () => {
    mockUserAndAssistanceFetch()
    wrap(
      <DispatchTableFilters value={EMPTY_FILTERS} onChange={vi.fn()} />,
    )
    await waitFor(() => {
      const userSelect = screen.getByTestId('filter-user')
      expect(userSelect.querySelectorAll('option').length).toBe(3) // すべて + 2 件
    })
    await waitFor(() => {
      const asSelect = screen.getByTestId('filter-assistance')
      expect(asSelect.querySelectorAll('option').length).toBe(3)
    })
  })

  it('リセットで EMPTY_FILTERS が onChange に渡る', () => {
    mockUserAndAssistanceFetch()
    const filled: DispatchTableFiltersValue = {
      from: '2026-04-01',
      to: '2026-04-30',
      status: 'unbilled',
      userId: 'u1',
      assistanceId: 'a1',
    }
    const onChange = vi.fn()
    wrap(<DispatchTableFilters value={filled} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('filter-reset'))
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS)
  })
})
