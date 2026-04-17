import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { syncStateAtom } from '@/store/syncAtom'

// sync モック
const mockSyncPendingActions = vi.fn()
const mockGetPendingCount = vi.fn()

vi.mock('@/lib/sync', () => ({
  syncPendingActions: (...args: unknown[]) => mockSyncPendingActions(...args),
  getPendingCount: (...args: unknown[]) => mockGetPendingCount(...args),
}))

import { useOnlineStatus } from '@/hooks/useOnlineStatus'

describe('useOnlineStatus', () => {
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

  beforeEach(() => {
    store = createStore()
    mockSyncPendingActions.mockReset()
    mockGetPendingCount.mockReset()
    mockGetPendingCount.mockResolvedValue(0)
    mockSyncPendingActions.mockResolvedValue({ synced: 0, failed: 0 })
  })

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    }
  })

  // ── 初期状態 ──

  it('オンライン初期状態で pending 0 件なら status は online のまま', async () => {
    setOnline(true)
    mockGetPendingCount.mockResolvedValue(0)

    const { result } = renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    // 初期化の非同期処理を待つ
    await act(async () => {})

    expect(result.current.syncState.status).toBe('online')
  })

  it('オフライン初期状態なら status を offline にする', async () => {
    setOnline(false)

    const { result } = renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    await act(async () => {})

    expect(result.current.syncState.status).toBe('offline')
  })

  it('オンライン初期状態で pending が存在する場合は同期を実行する', async () => {
    setOnline(true)
    mockGetPendingCount.mockResolvedValue(3)
    mockSyncPendingActions.mockResolvedValue({ synced: 3, failed: 0 })

    const { result } = renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    await act(async () => {})

    expect(mockSyncPendingActions).toHaveBeenCalled()
    expect(result.current.syncState.status).toBe('online')
    expect(result.current.syncState.pendingCount).toBe(0)
  })

  // ── online イベント ──

  it('online イベントで同期を実行する', async () => {
    setOnline(true)
    mockGetPendingCount.mockResolvedValue(2)
    mockSyncPendingActions.mockResolvedValue({ synced: 2, failed: 0 })

    const { result } = renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(mockSyncPendingActions).toHaveBeenCalled()
    expect(result.current.syncState.status).toBe('online')
  })

  // ── offline イベント ──

  it('offline イベントで status を offline にする', async () => {
    setOnline(true)
    mockGetPendingCount.mockResolvedValue(0)

    const { result } = renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.syncState.status).toBe('offline')
  })

  // ── 同期失敗 ──

  it('同期で一部失敗した場合は error 状態にする', async () => {
    setOnline(true)
    mockGetPendingCount.mockResolvedValue(3)
    mockSyncPendingActions.mockResolvedValue({ synced: 1, failed: 2 })

    const { result } = renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current.syncState.status).toBe('error')
    expect(result.current.syncState.errorMessage).toBe('2件の同期に失敗しました')
  })

  // ── handleRetry ──

  it('handleRetry がオンライン時に同期を再実行する', async () => {
    setOnline(true)
    mockGetPendingCount.mockResolvedValue(1)
    mockSyncPendingActions.mockResolvedValue({ synced: 1, failed: 0 })

    const { result } = renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.handleRetry()
    })

    expect(mockSyncPendingActions).toHaveBeenCalled()
  })

  it('handleRetry はオフライン時に同期を実行しない', async () => {
    setOnline(true)
    mockGetPendingCount.mockResolvedValue(0)

    const { result } = renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    // 初期化待ち
    await act(async () => {})

    mockSyncPendingActions.mockClear()
    mockGetPendingCount.mockClear()

    setOnline(false)

    await act(async () => {
      result.current.handleRetry()
    })

    expect(mockSyncPendingActions).not.toHaveBeenCalled()
  })

  // ── クリーンアップ ──

  it('unmount 時にイベントリスナーを削除する', async () => {
    setOnline(true)
    mockGetPendingCount.mockResolvedValue(0)

    const removeEventSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    await act(async () => {})

    unmount()

    expect(removeEventSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeEventSpy).toHaveBeenCalledWith('offline', expect.any(Function))
    removeEventSpy.mockRestore()
  })

  // ── onProgress ──

  it('同期中に onProgress で pendingCount が更新される', async () => {
    setOnline(true)
    mockGetPendingCount.mockResolvedValue(3)
    mockSyncPendingActions.mockImplementation(async (onProgress) => {
      onProgress?.(1, 3)
      onProgress?.(2, 3)
      onProgress?.(3, 3)
      return { synced: 3, failed: 0 }
    })

    renderHook(() => useOnlineStatus(), { wrapper: createWrapper() })

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    // 最終状態を検証
    const state = store.get(syncStateAtom)
    expect(state.pendingCount).toBe(0)
    expect(state.status).toBe('online')
  })
})
