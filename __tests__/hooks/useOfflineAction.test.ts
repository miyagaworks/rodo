import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { syncStateAtom } from '@/store/syncAtom'

// offline-db モック
const mockAddPendingAction = vi.fn()
vi.mock('@/lib/offline-db', () => ({
  addPendingAction: (...args: unknown[]) => mockAddPendingAction(...args),
}))

// sync モック（動的import用）
const mockGetPendingCount = vi.fn()
vi.mock('@/lib/sync', () => ({
  getPendingCount: (...args: unknown[]) => mockGetPendingCount(...args),
}))

import { useOfflineAction } from '@/hooks/useOfflineAction'

describe('useOfflineAction', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  let store: ReturnType<typeof createStore>
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

  function setOnline(online: boolean) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...navigator, onLine: online },
      writable: true,
      configurable: true,
    })
  }

  function createWrapper() {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store }, children)
  }

  const baseParams = {
    type: 'dispatch_create' as const,
    dispatchId: 'disp-1',
    gps: null,
    data: { name: 'test' },
    endpoint: '/api/dispatches',
    method: 'POST' as const,
  }

  beforeEach(() => {
    store = createStore()
    mockAddPendingAction.mockReset()
    mockGetPendingCount.mockReset()
    mockAddPendingAction.mockResolvedValue('queued-id')
    mockGetPendingCount.mockResolvedValue(1)
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    }
  })

  // ── オンライン正常系 ──

  it('オンライン成功時は fetch 結果を返す（queued: false）', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '123' }), { status: 200 }),
    )

    const { result } = renderHook(() => useOfflineAction(), { wrapper: createWrapper() })

    let res: { ok: boolean; data?: unknown; queued: boolean } | undefined
    await act(async () => {
      res = await result.current.execute(baseParams)
    })

    expect(res).toEqual({ ok: true, data: { id: '123' }, queued: false })
    expect(mockAddPendingAction).not.toHaveBeenCalled()
  })

  // ── オンライン 5xx ──

  it('オンライン 5xx → キューに保存して queued: true を返す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Error', { status: 500 }),
    )

    const { result } = renderHook(() => useOfflineAction(), { wrapper: createWrapper() })

    let res: { ok: boolean; queued: boolean } | undefined
    await act(async () => {
      res = await result.current.execute(baseParams)
    })

    expect(res).toEqual({ ok: true, queued: true })
    expect(mockAddPendingAction).toHaveBeenCalledTimes(1)
  })

  // ── オンライン 4xx ──

  it('オンライン 4xx → キューせず ok: false を返す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Bad Request', { status: 400 }),
    )

    const { result } = renderHook(() => useOfflineAction(), { wrapper: createWrapper() })

    let res: { ok: boolean; queued: boolean } | undefined
    await act(async () => {
      res = await result.current.execute(baseParams)
    })

    expect(res).toEqual({ ok: false, queued: false })
    expect(mockAddPendingAction).not.toHaveBeenCalled()
  })

  // ── オンライン ネットワークエラー ──

  it('オンラインでネットワークエラー → キューに保存して queued: true を返す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useOfflineAction(), { wrapper: createWrapper() })

    let res: { ok: boolean; queued: boolean } | undefined
    await act(async () => {
      res = await result.current.execute(baseParams)
    })

    expect(res).toEqual({ ok: true, queued: true })
    expect(mockAddPendingAction).toHaveBeenCalledTimes(1)
  })

  // ── オフライン ──

  it('オフライン → キューに保存して queued: true を返す', async () => {
    setOnline(false)
    fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() => useOfflineAction(), { wrapper: createWrapper() })

    let res: { ok: boolean; queued: boolean } | undefined
    await act(async () => {
      res = await result.current.execute(baseParams)
    })

    expect(res).toEqual({ ok: true, queued: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockAddPendingAction).toHaveBeenCalledTimes(1)
  })

  it('オフライン時に syncState の pendingCount が更新される', async () => {
    setOnline(false)
    mockGetPendingCount.mockResolvedValue(3)

    const { result } = renderHook(() => useOfflineAction(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.execute(baseParams)
    })

    const syncState = store.get(syncStateAtom)
    expect(syncState.pendingCount).toBe(3)
  })

  // ── forceQueue ──

  it('forceQueue: true ならオンラインでもキューに保存する', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() => useOfflineAction(), { wrapper: createWrapper() })

    let res: { ok: boolean; queued: boolean } | undefined
    await act(async () => {
      res = await result.current.execute(baseParams, { forceQueue: true })
    })

    expect(res).toEqual({ ok: true, queued: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockAddPendingAction).toHaveBeenCalledTimes(1)
  })

  // ── エッジケース ──

  it('fetch の json() が失敗しても ok: true を返す', async () => {
    setOnline(true)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    const { result } = renderHook(() => useOfflineAction(), { wrapper: createWrapper() })

    let res: { ok: boolean; data?: unknown; queued: boolean } | undefined
    await act(async () => {
      res = await result.current.execute(baseParams)
    })

    expect(res?.ok).toBe(true)
    expect(res?.queued).toBe(false)
    expect(res?.data).toBeNull() // json() failed → catch → null
  })
})
