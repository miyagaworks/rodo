import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useDispatchInProgressGuard } from '@/hooks/useDispatchInProgressGuard'

/**
 * useDispatchInProgressGuard のテスト。
 *
 * カバレッジ:
 *   - inProgress=false: safeNavigateHome / replaceLocation は素通し
 *   - inProgress=true:  onAttemptHome を呼ぶ。true なら遷移、false ならブロック
 *   - inProgress=true:  onAttemptHome 未指定なら window.confirm を表示し常にブロック
 *   - popstate: inProgress=true で発火 → history.pushState が呼ばれる
 *   - beforeunload: inProgress=true で preventDefault が呼ばれる、false では呼ばれない
 *   - unmount: イベントリスナを削除する
 *
 * 注意:
 *   - jsdom は window.location.href への代入をサポートしないため、
 *     `replaceLocation` の遷移挙動は href の getter/setter をスタブして検証する。
 *   - jsdom は origin が同じ URL の pushState のみ許可するので、
 *     pushState テストでは location を差し替えず、spy のみ使う。
 */

function makeRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }
}

describe('useDispatchInProgressGuard', () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    pushStateSpy = vi.spyOn(window.history, 'pushState')
    // jsdom は window.confirm を実装していないため、デフォルトで no-op スタブにする。
    // 必要なテストでは個別に override する。
    vi.spyOn(window, 'confirm').mockReturnValue(false)
  })

  afterEach(() => {
    pushStateSpy.mockRestore()
    vi.restoreAllMocks()
  })

  // ── safeNavigateHome ──

  it('inProgress=false: safeNavigateHome は router.push を直接呼ぶ', async () => {
    const onAttemptHome = vi.fn()
    const { result } = renderHook(() =>
      useDispatchInProgressGuard({ inProgress: false, onAttemptHome }),
    )

    const router = makeRouter()
    await act(async () => {
      await result.current.safeNavigateHome(
        router as unknown as Parameters<
          typeof result.current.safeNavigateHome
        >[0],
      )
    })

    expect(router.push).toHaveBeenCalledWith('/')
    expect(onAttemptHome).not.toHaveBeenCalled()
  })

  it('inProgress=true + onAttemptHome=true: router.push が呼ばれる', async () => {
    const onAttemptHome = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() =>
      useDispatchInProgressGuard({ inProgress: true, onAttemptHome }),
    )

    const router = makeRouter()
    await act(async () => {
      await result.current.safeNavigateHome(
        router as unknown as Parameters<
          typeof result.current.safeNavigateHome
        >[0],
      )
    })

    expect(onAttemptHome).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('inProgress=true + onAttemptHome=false: router.push は呼ばれない', async () => {
    const onAttemptHome = vi.fn().mockResolvedValue(false)
    const { result } = renderHook(() =>
      useDispatchInProgressGuard({ inProgress: true, onAttemptHome }),
    )

    const router = makeRouter()
    await act(async () => {
      await result.current.safeNavigateHome(
        router as unknown as Parameters<
          typeof result.current.safeNavigateHome
        >[0],
      )
    })

    expect(onAttemptHome).toHaveBeenCalledTimes(1)
    expect(router.push).not.toHaveBeenCalled()
    expect(result.current.attemptedExit).toBe(true)
  })

  it('safeNavigateHome は target を指定できる', async () => {
    const { result } = renderHook(() =>
      useDispatchInProgressGuard({ inProgress: false }),
    )

    const router = makeRouter()
    await act(async () => {
      await result.current.safeNavigateHome(
        router as unknown as Parameters<
          typeof result.current.safeNavigateHome
        >[0],
        '/dispatch/abc',
      )
    })

    expect(router.push).toHaveBeenCalledWith('/dispatch/abc')
  })

  it('inProgress=true + onAttemptHome 未指定: window.confirm を表示し常にブロック', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { result } = renderHook(() =>
      useDispatchInProgressGuard({ inProgress: true }),
    )

    const router = makeRouter()
    await act(async () => {
      await result.current.safeNavigateHome(
        router as unknown as Parameters<
          typeof result.current.safeNavigateHome
        >[0],
      )
    })

    expect(confirmSpy).toHaveBeenCalled()
    // 仕様上 OK でも常にブロック
    expect(router.push).not.toHaveBeenCalled()
  })

  // ── replaceLocation ──
  // jsdom は window.location.href への代入を未サポートのため、
  // location オブジェクト自体をテスト中だけ Proxy で差し替えて代入を検出する。

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

  it('inProgress=false: replaceLocation は window.location.href を直接書き換える', async () => {
    const { result } = renderHook(() =>
      useDispatchInProgressGuard({ inProgress: false }),
    )

    await withMockedLocation('http://localhost/', async (mock) => {
      await act(async () => {
        await result.current.replaceLocation('/foo')
      })
      expect(mock.href).toBe('/foo')
    })
  })

  it('inProgress=true + onAttemptHome=false: replaceLocation は遷移しない', async () => {
    const onAttemptHome = vi.fn().mockResolvedValue(false)
    const { result } = renderHook(() =>
      useDispatchInProgressGuard({ inProgress: true, onAttemptHome }),
    )

    await withMockedLocation('http://localhost/', async (mock) => {
      await act(async () => {
        await result.current.replaceLocation('/foo')
      })
      expect(mock.href).toBe('http://localhost/')
    })
    expect(result.current.attemptedExit).toBe(true)
  })

  // ── popstate / pushState ──

  it('inProgress=true マウント時: 仮想履歴エントリを 1 回 push する', () => {
    pushStateSpy.mockClear()
    renderHook(() => useDispatchInProgressGuard({ inProgress: true }))

    expect(pushStateSpy).toHaveBeenCalledTimes(1)
  })

  it('inProgress=false マウント時: 仮想エントリは push しない', () => {
    pushStateSpy.mockClear()
    renderHook(() => useDispatchInProgressGuard({ inProgress: false }))

    expect(pushStateSpy).not.toHaveBeenCalled()
  })

  it('inProgress=true で popstate 発火 → 再度 pushState で吸収', () => {
    renderHook(() => useDispatchInProgressGuard({ inProgress: true }))
    pushStateSpy.mockClear()

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(pushStateSpy).toHaveBeenCalledTimes(1)
  })

  it('inProgress=false で popstate 発火 → pushState は呼ばれない', () => {
    renderHook(() => useDispatchInProgressGuard({ inProgress: false }))
    pushStateSpy.mockClear()

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(pushStateSpy).not.toHaveBeenCalled()
  })

  // ── beforeunload ──

  it('inProgress=true で beforeunload 発火 → preventDefault を呼ぶ', () => {
    renderHook(() => useDispatchInProgressGuard({ inProgress: true }))

    const event = new Event('beforeunload', { cancelable: true })
    const preventSpy = vi.spyOn(event, 'preventDefault')

    act(() => {
      window.dispatchEvent(event)
    })

    expect(preventSpy).toHaveBeenCalled()
  })

  it('inProgress=false で beforeunload 発火 → preventDefault を呼ばない', () => {
    renderHook(() => useDispatchInProgressGuard({ inProgress: false }))

    const event = new Event('beforeunload', { cancelable: true })
    const preventSpy = vi.spyOn(event, 'preventDefault')

    act(() => {
      window.dispatchEvent(event)
    })

    expect(preventSpy).not.toHaveBeenCalled()
  })

  // ── cleanup ──

  it('unmount 時に popstate / beforeunload リスナを削除する', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() =>
      useDispatchInProgressGuard({ inProgress: true }),
    )

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('popstate', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function),
    )
    removeSpy.mockRestore()
  })

  // ── inProgress 切り替え ──

  it('inProgress false → true へ変化: 仮想エントリを push し直す', () => {
    pushStateSpy.mockClear()
    const { rerender } = renderHook(
      ({ inProgress }) => useDispatchInProgressGuard({ inProgress }),
      { initialProps: { inProgress: false } },
    )

    expect(pushStateSpy).not.toHaveBeenCalled()

    rerender({ inProgress: true })

    expect(pushStateSpy).toHaveBeenCalledTimes(1)
  })
})
