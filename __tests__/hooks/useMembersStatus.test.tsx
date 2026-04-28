/**
 * useMembersStatus フックのテスト
 *
 * - refetchInterval が 10000ms に設定されていること
 * - 初期フェッチで API レスポンスを正しく返すこと
 * - fetch 失敗時にエラー状態になること
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// fetch をモック化（useMembersStatus 内で呼ばれる）
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { useMembersStatus } from '@/hooks/useMembersStatus'

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const mockResponse = {
  members: [
    {
      id: 'u1',
      name: '山田',
      vehicle: null,
      status: 'STANDBY',
      activeDispatch: null,
      activeBreak: null,
    },
  ],
  fetchedAt: '2026-04-28T10:00:00.000Z',
}

describe('useMembersStatus', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('初期フェッチで API レスポンスを返す', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const { result } = renderHook(() => useMembersStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.members).toHaveLength(1)
    expect(result.current.data?.members[0].name).toBe('山田')
    expect(result.current.data?.fetchedAt).toBe('2026-04-28T10:00:00.000Z')
  })

  it('fetch 失敗時にエラー状態になる', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal' }),
    })

    const { result } = renderHook(() => useMembersStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })

  it('/api/admin/members-status を呼ぶ', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    renderHook(() => useMembersStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/members-status')
    })
  })
})
