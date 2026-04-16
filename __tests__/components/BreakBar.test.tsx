import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  FaCoffee: () => React.createElement('span', { 'data-testid': 'coffee-icon' }),
}))

import BreakBar from '@/components/BreakBar'

describe('BreakBar', () => {
  let store: ReturnType<typeof createStore>

  function renderWithStore() {
    return render(
      React.createElement(Provider, { store },
        React.createElement(BreakBar),
      ),
    )
  }

  afterEach(() => {
    pushMock.mockClear()
  })

  // ── 正常系 ──

  it('status が idle のとき何も表示しない', () => {
    store = createStore()
    // 初期状態は idle

    const { container } = renderWithStore()
    expect(container.firstElementChild).toBeNull()
  })

  it('status が breaking のとき何も表示しない', () => {
    store = createStore()
    store.set(breakStateAtom, {
      status: 'breaking',
      startTime: Date.now(),
      remainingSeconds: BREAK_DURATION,
      pausedAt: null,
      breakRecordId: 'test-id',
    })

    const { container } = renderWithStore()
    expect(container.firstElementChild).toBeNull()
  })

  it('status が paused のときバーを表示する', () => {
    store = createStore()
    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 2400, // 40:00
      pausedAt: Date.now(),
      breakRecordId: 'test-id',
    })

    renderWithStore()

    expect(screen.getByText('休憩')).toBeInTheDocument()
    expect(screen.getByText('40:00')).toBeInTheDocument()
  })

  it('残り時間を MM:SS 形式で表示する', () => {
    store = createStore()
    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 125, // 2:05
      pausedAt: Date.now(),
      breakRecordId: 'test-id',
    })

    renderWithStore()

    expect(screen.getByText('02:05')).toBeInTheDocument()
  })

  it('タップで /break に遷移する', () => {
    store = createStore()
    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 1800,
      pausedAt: Date.now(),
      breakRecordId: 'test-id',
    })

    renderWithStore()

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(pushMock).toHaveBeenCalledWith('/break')
  })

  it('コーヒーアイコンが表示される', () => {
    store = createStore()
    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 1800,
      pausedAt: Date.now(),
      breakRecordId: 'test-id',
    })

    renderWithStore()

    expect(screen.getByTestId('coffee-icon')).toBeInTheDocument()
  })

  // ── エッジケース ──

  it('remainingSeconds が 0 のとき 00:00 を表示する', () => {
    store = createStore()
    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 0,
      pausedAt: Date.now(),
      breakRecordId: 'test-id',
    })

    renderWithStore()

    expect(screen.getByText('00:00')).toBeInTheDocument()
  })

  it('remainingSeconds が 3600（60分）のとき 60:00 を表示する', () => {
    store = createStore()
    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 3600,
      pausedAt: Date.now(),
      breakRecordId: 'test-id',
    })

    renderWithStore()

    expect(screen.getByText('60:00')).toBeInTheDocument()
  })

  it('remainingSeconds が小数の場合は切り捨てる', () => {
    store = createStore()
    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 65.7, // 1分5.7秒 → 01:05
      pausedAt: Date.now(),
      breakRecordId: 'test-id',
    })

    renderWithStore()

    expect(screen.getByText('01:05')).toBeInTheDocument()
  })
})
