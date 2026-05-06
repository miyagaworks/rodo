/**
 * TodayDispatchSummary の集計ロジックテスト。
 *
 * 集計定義（components/admin/TodayDispatchSummary.tsx 上部 JSDoc 参照）:
 * - 進行中: STANDBY / DISPATCHED / ONSITE / TRANSPORTING
 *           + COMPLETED && returnTime === null（帰社中）
 * - 完了:   COMPLETED && returnTime !== null / RETURNED / STORED
 * - 未請求: billedAt === null（status 問わず）
 * - 業務仕様 2026-05-06: isDraft=true（下書き）も集計対象に含める
 *
 * useAdminDispatches フック自体をモックして、純粋に集計分岐の振る舞いを検証する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DispatchItem, DispatchesResponse } from '@/hooks/useAdminDispatches'

// useAdminDispatches モック（テストごとに返却値を差し替えられるよう外側に変数を置く）
const useAdminDispatchesMock = vi.fn()
vi.mock('@/hooks/useAdminDispatches', () => ({
  useAdminDispatches: (...args: unknown[]) => useAdminDispatchesMock(...args),
}))

import TodayDispatchSummary from '@/components/admin/TodayDispatchSummary'

/** DispatchItem の最小インスタンスを生成するヘルパー */
function makeDispatch(overrides: Partial<DispatchItem>): DispatchItem {
  return {
    id: overrides.id ?? 'd-' + Math.random().toString(36).slice(2, 8),
    dispatchNumber: '0001',
    dispatchTime: '2026-05-02T01:00:00.000Z',
    status: 'STANDBY',
    isDraft: false,
    billedAt: null,
    returnTime: null,
    scheduledSecondaryAt: null,
    type: 'ONSITE',
    user: { id: 'u1', name: '山田' },
    assistance: { id: 'a1', name: 'アシ会社', displayAbbreviation: 'A' },
    customerName: null,
    plate: null,
    report: null,
    ...overrides,
  }
}

function mockResponse(dispatches: DispatchItem[]): DispatchesResponse {
  return {
    dispatches,
    total: dispatches.length,
    page: 1,
    pageSize: 200,
  }
}

/** カードのカウント値を testid から取り出す */
function readCount(label: '進行中' | '完了' | '未請求'): number {
  const card = screen.getByTestId(`summary-card-${label}`)
  // 数値表示は "text-2xl font-bold" の div
  const valueDiv = card.querySelector('div.text-2xl')
  return Number(valueDiv?.textContent ?? 'NaN')
}

describe('TodayDispatchSummary 集計ロジック', () => {
  beforeEach(() => {
    useAdminDispatchesMock.mockReset()
  })

  it('case A: STANDBY/DISPATCHED/ONSITE/TRANSPORTING はすべて進行中にカウント', () => {
    const dispatches = [
      makeDispatch({ id: 'a1', status: 'STANDBY' }),
      makeDispatch({ id: 'a2', status: 'DISPATCHED' }),
      makeDispatch({ id: 'a3', status: 'ONSITE' }),
      makeDispatch({ id: 'a4', status: 'TRANSPORTING' }),
    ]
    useAdminDispatchesMock.mockReturnValue({
      data: mockResponse(dispatches),
      isLoading: false,
      isError: false,
    })

    render(<TodayDispatchSummary today="2026-05-02" />)

    expect(readCount('進行中')).toBe(4)
    expect(readCount('完了')).toBe(0)
  })

  it('case B: COMPLETED && returnTime=null（帰社中）は進行中にカウントされ、完了には入らない', () => {
    const dispatches = [
      makeDispatch({
        id: 'b1',
        status: 'COMPLETED',
        returnTime: null, // 帰社中
      }),
    ]
    useAdminDispatchesMock.mockReturnValue({
      data: mockResponse(dispatches),
      isLoading: false,
      isError: false,
    })

    render(<TodayDispatchSummary today="2026-05-02" />)

    expect(readCount('進行中')).toBe(1)
    expect(readCount('完了')).toBe(0)
  })

  it('case C: COMPLETED && returnTime=ISO は完了にカウント', () => {
    const dispatches = [
      makeDispatch({
        id: 'c1',
        status: 'COMPLETED',
        returnTime: '2026-05-02T03:30:00.000Z',
      }),
    ]
    useAdminDispatchesMock.mockReturnValue({
      data: mockResponse(dispatches),
      isLoading: false,
      isError: false,
    })

    render(<TodayDispatchSummary today="2026-05-02" />)

    expect(readCount('進行中')).toBe(0)
    expect(readCount('完了')).toBe(1)
  })

  it('case D: RETURNED / STORED は完了にカウント', () => {
    const dispatches = [
      makeDispatch({ id: 'd1', status: 'RETURNED' }),
      makeDispatch({ id: 'd2', status: 'STORED' }),
    ]
    useAdminDispatchesMock.mockReturnValue({
      data: mockResponse(dispatches),
      isLoading: false,
      isError: false,
    })

    render(<TodayDispatchSummary today="2026-05-02" />)

    expect(readCount('進行中')).toBe(0)
    expect(readCount('完了')).toBe(2)
  })

  it('case E: 業務仕様 2026-05-06 - isDraft=true も status に応じて集計対象に含める', () => {
    const dispatches = [
      // 進行中相当の draft → 進行中にカウント、未請求にもカウント
      makeDispatch({ id: 'e1', status: 'DISPATCHED', isDraft: true, billedAt: null }),
      // 完了相当の draft → 完了にカウント、未請求にもカウント
      makeDispatch({
        id: 'e2',
        status: 'COMPLETED',
        returnTime: '2026-05-02T03:30:00.000Z',
        isDraft: true,
        billedAt: null,
      }),
    ]
    useAdminDispatchesMock.mockReturnValue({
      data: mockResponse(dispatches),
      isLoading: false,
      isError: false,
    })

    render(<TodayDispatchSummary today="2026-05-02" />)

    expect(readCount('進行中')).toBe(1)
    expect(readCount('完了')).toBe(1)
    expect(readCount('未請求')).toBe(2)
  })

  it('case F: billedAt=null は status を問わず未請求にカウント', () => {
    const dispatches = [
      makeDispatch({ id: 'f1', status: 'DISPATCHED', billedAt: null }),
      makeDispatch({
        id: 'f2',
        status: 'COMPLETED',
        returnTime: null, // 帰社中
        billedAt: null,
      }),
      makeDispatch({
        id: 'f3',
        status: 'COMPLETED',
        returnTime: '2026-05-02T03:30:00.000Z',
        billedAt: null,
      }),
      makeDispatch({ id: 'f4', status: 'RETURNED', billedAt: null }),
      // 請求済みは未請求にカウントされない
      makeDispatch({
        id: 'f5',
        status: 'RETURNED',
        billedAt: '2026-05-02T05:00:00.000Z',
      }),
    ]
    useAdminDispatchesMock.mockReturnValue({
      data: mockResponse(dispatches),
      isLoading: false,
      isError: false,
    })

    render(<TodayDispatchSummary today="2026-05-02" />)

    expect(readCount('未請求')).toBe(4)
    // 進行中: f1 (DISPATCHED) + f2 (帰社中)
    expect(readCount('進行中')).toBe(2)
    // 完了: f3 (帰社済み COMPLETED) + f4 (RETURNED) + f5 (RETURNED)
    expect(readCount('完了')).toBe(3)
  })

  it('case G: 0 件のとき「今日の案件はありません」が表示される', () => {
    useAdminDispatchesMock.mockReturnValue({
      data: mockResponse([]),
      isLoading: false,
      isError: false,
    })

    render(<TodayDispatchSummary today="2026-05-02" />)

    expect(screen.getByText('今日の案件はありません')).toBeInTheDocument()
    expect(readCount('進行中')).toBe(0)
    expect(readCount('完了')).toBe(0)
    expect(readCount('未請求')).toBe(0)
  })
})
