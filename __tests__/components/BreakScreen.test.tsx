import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { breakStateAtom, BREAK_DURATION, initialBreakState } from '@/store/breakAtom'

// next/navigation モック
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

// react-icons モック
vi.mock('react-icons/fa', () => ({
  FaCoffee: () => <span data-testid="coffee-icon" />,
}))

import BreakScreen from '@/components/BreakScreen'

describe('BreakScreen', () => {
  let store: ReturnType<typeof createStore>
  let fetchSpy: ReturnType<typeof vi.spyOn>

  function renderWithStore() {
    return render(
      <Provider store={store}>
        <BreakScreen />
      </Provider>,
    )
  }

  beforeEach(() => {
    store = createStore()
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
    pushMock.mockClear()
  })

  // ── idle → 休憩開始 ──

  it('idle 状態でマウントすると startBreak API を呼ぶ', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'break-1' }), { status: 200 }),
    )

    renderWithStore()

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/breaks', { method: 'POST' })
    })

    const state = store.get(breakStateAtom)
    expect(state.status).toBe('breaking')
    expect(state.breakRecordId).toBe('break-1')
    expect(state.remainingSeconds).toBe(BREAK_DURATION)
  })

  it('startBreak API 失敗時はエラーをキャッチしクラッシュしない', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('API error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithStore()

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    expect(screen.getByText('休憩中')).toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  // ── paused → 再開 ──

  it('paused 状態でマウントすると resume API を呼ぶ', async () => {
    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 1800,
      pausedAt: Date.now(),
      breakRecordId: 'break-1',
    })

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    renderWithStore()

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/break-1/resume', { method: 'PATCH' })
    })

    const state = store.get(breakStateAtom)
    expect(state.status).toBe('breaking')
  })

  // ── 表示 ──

  it('コーヒーアイコンと「休憩中」テキストを表示する', async () => {
    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: Date.now(),
      remainingSeconds: BREAK_DURATION,
      pausedAt: null,
      breakRecordId: 'break-1',
    })

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    renderWithStore()

    expect(screen.getByTestId('coffee-icon')).toBeInTheDocument()
    expect(screen.getByText('休憩中')).toBeInTheDocument()
  })

  it('出動対応ボタンを表示する', () => {
    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: Date.now(),
      remainingSeconds: BREAK_DURATION,
      pausedAt: null,
      breakRecordId: 'break-1',
    })

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    renderWithStore()

    expect(screen.getByText('出動対応')).toBeInTheDocument()
  })

  // ── 出動対応ボタン ──

  it('出動対応ボタンクリックで pause API を呼びホームに遷移する', async () => {
    const now = Date.now()
    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: now,
      remainingSeconds: BREAK_DURATION,
      pausedAt: null,
      breakRecordId: 'break-1',
    })

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    renderWithStore()

    await act(async () => {
      fireEvent.click(screen.getByText('出動対応'))
    })

    expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/break-1/pause', { method: 'PATCH' })
    const state = store.get(breakStateAtom)
    expect(state.status).toBe('paused')
    expect(state.startTime).toBeNull()
    expect(state.pausedAt).not.toBeNull()
    expect(pushMock).toHaveBeenCalledWith('/')
  })

  it('出動対応で pause API 失敗してもホームに遷移する', async () => {
    const now = Date.now()
    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: now,
      remainingSeconds: BREAK_DURATION,
      pausedAt: null,
      breakRecordId: 'break-1',
    })

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('API error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithStore()

    await act(async () => {
      fireEvent.click(screen.getByText('出動対応'))
    })

    const state = store.get(breakStateAtom)
    expect(state.status).toBe('paused')
    expect(pushMock).toHaveBeenCalledWith('/')
    consoleSpy.mockRestore()
  })

  // ── エッジケース ──

  it('startTime が null のとき出動対応ボタンは何もしない', async () => {
    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: null,
      remainingSeconds: BREAK_DURATION,
      pausedAt: null,
      breakRecordId: 'break-1',
    })

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    renderWithStore()

    await act(async () => {
      fireEvent.click(screen.getByText('出動対応'))
    })

    // startTime が null なので handleDispatch は early return
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('初期表示時間が正しいフォーマットで表示される', () => {
    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: Date.now(),
      remainingSeconds: 2465, // 41:05
      pausedAt: null,
      breakRecordId: 'break-1',
    })

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    renderWithStore()

    expect(screen.getByText('41:05')).toBeInTheDocument()
  })

  it('unmount 時に cancelAnimationFrame が呼ばれる', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame')

    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: Date.now(),
      remainingSeconds: BREAK_DURATION,
      pausedAt: null,
      breakRecordId: 'break-1',
    })

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    const { unmount } = renderWithStore()
    unmount()

    expect(cancelSpy).toHaveBeenCalled()
    cancelSpy.mockRestore()
  })
})
