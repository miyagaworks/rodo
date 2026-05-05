import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

import { useActiveDispatch } from '@/hooks/useActiveDispatch'

/**
 * useActiveDispatch のテスト。
 *
 * カバレッジ:
 *   - 200 success（dispatch あり / null 両方）
 *   - 401 / 500 → error にセット、loading=false
 *   - 503 + X-SW-Offline: 1 → 楽観的レスポンスを error 経路に流す
 *   - network error（fetch reject）→ catch で console.error + setError
 *   - refresh() で再フェッチ
 */

function makeJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

describe('useActiveDispatch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('200 + dispatch あり → activeDispatch をセットして loading=false', async () => {
    const payload = {
      dispatch: {
        id: 'd1',
        dispatchNumber: '20260504001',
        status: 'DISPATCHED',
        returnTime: null,
        type: 'ONSITE',
        subPhase: 'DISPATCHING',
        assistance: { name: '東京救援' },
      },
    }
    fetchSpy.mockResolvedValueOnce(makeJsonResponse(payload))

    const { result } = renderHook(() => useActiveDispatch())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.activeDispatch).toEqual(payload.dispatch)
    expect(result.current.error).toBeNull()
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/dispatches/active',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
  })

  it('200 + dispatch null → activeDispatch=null、error=null', async () => {
    fetchSpy.mockResolvedValueOnce(makeJsonResponse({ dispatch: null }))

    const { result } = renderHook(() => useActiveDispatch())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.activeDispatch).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('401 → activeDispatch 据え置き、error にセット', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    )

    const { result } = renderHook(() => useActiveDispatch())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error?.message).toMatch(/401/)
    expect(result.current.activeDispatch).toBeNull()
  })

  it('500 → error にセット', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    )

    const { result } = renderHook(() => useActiveDispatch())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error?.message).toMatch(/500/)
  })

  it('503 + X-SW-Offline: 1 → 楽観的レスポンス扱いで error にセット、activeDispatch は据え置き', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Offline', {
        status: 503,
        headers: { 'X-SW-Offline': '1' },
      }),
    )

    const { result } = renderHook(() => useActiveDispatch())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error?.message).toMatch(/オフライン/)
    expect(result.current.activeDispatch).toBeNull()
  })

  it('network error → catch で error にセット', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    fetchSpy.mockRejectedValueOnce(new Error('network down'))

    const { result } = renderHook(() => useActiveDispatch())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error?.message).toBe('network down')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('refresh() で再フェッチが走る', async () => {
    fetchSpy.mockResolvedValueOnce(makeJsonResponse({ dispatch: null }))

    const { result } = renderHook(() => useActiveDispatch())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    fetchSpy.mockResolvedValueOnce(
      makeJsonResponse({
        dispatch: {
          id: 'd2',
          dispatchNumber: '20260504002',
          status: 'ONSITE',
          returnTime: null,
          type: 'ONSITE',
          subPhase: 'ONSITE',
          assistance: { name: 'テスト救援' },
        },
      }),
    )

    await act(async () => {
      await result.current.refresh()
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.current.activeDispatch?.id).toBe('d2')
    expect(result.current.error).toBeNull()
  })
})
