/**
 * ScheduledSecondaryEditor のテスト。
 *
 * 焦点: PATCH 成功時に admin/dispatches だけでなく admin/calendar も
 * invalidate されること（カレンダーの「2予」バッジが反映されるため）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import ScheduledSecondaryEditor from '@/components/admin/ScheduledSecondaryEditor'

function makeQc(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function wrap(node: ReactNode, qc: QueryClient) {
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('ScheduledSecondaryEditor', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('保存成功時に admin/dispatches と admin/calendar の両方を invalidate する', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'd1' }),
    })

    const qc = makeQc()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const onClose = vi.fn()

    wrap(
      <ScheduledSecondaryEditor
        dispatchId="d1"
        initialValue={null}
        onClose={onClose}
      />,
      qc,
    )

    // 値を入力（datetime-local 形式）
    const input = screen.getByTestId('scheduled-secondary-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-04-20T10:00' } })

    // 保存ボタンを押下
    fireEvent.click(screen.getByTestId('scheduled-secondary-save'))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })

    // PATCH が呼ばれたこと
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/admin/dispatches/d1')
    expect(opts.method).toBe('PATCH')

    // invalidate が dispatches / calendar の両方で呼ばれたこと
    const calls = invalidateSpy.mock.calls.map((c) => c[0])
    const queryKeys = calls.map((c) => JSON.stringify(c?.queryKey))
    expect(queryKeys).toContain(JSON.stringify(['admin', 'dispatches']))
    expect(queryKeys).toContain(JSON.stringify(['admin', 'calendar']))
  })

  it('「未定にする」(NULL クリア) でも admin/calendar が invalidate される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'd2' }),
    })

    const qc = makeQc()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const onClose = vi.fn()

    wrap(
      <ScheduledSecondaryEditor
        dispatchId="d2"
        initialValue="2026-04-20T01:00:00.000Z"
        onClose={onClose}
      />,
      qc,
    )

    fireEvent.click(screen.getByTestId('scheduled-secondary-clear'))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })

    // 送信ペイロードが NULL
    const [, opts] = mockFetch.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.scheduledSecondaryAt).toBeNull()

    const calls = invalidateSpy.mock.calls.map((c) => c[0])
    const queryKeys = calls.map((c) => JSON.stringify(c?.queryKey))
    expect(queryKeys).toContain(JSON.stringify(['admin', 'calendar']))
  })
})
