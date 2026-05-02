import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { breakStateAtom, BREAK_DURATION } from '@/store/breakAtom'

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
      new Response(JSON.stringify({ id: 'break-1' }), { status: 201 }),
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

  it('startBreak 409 応答時は GET /api/breaks/active のレスポンス remainingSeconds をそのまま atom にセットする', async () => {
    // サーバーが返す remainingSeconds をクライアントは独自計算せずそのまま使う仕様。
    // 古い実装では startTime からの経過秒で再計算していたが、pauseTime 考慮もれで
    // remaining=0 を生み即終了してしまう不具合があった（research/2026-05-02-break-instant-end-investigation.md 参照）。
    const serverRemainingSeconds = 1800

    fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockImplementation(
      (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url === '/api/breaks') {
          return new Response(
            JSON.stringify({ error: 'Active break already exists', breakRecordId: 'break-existing' }),
            { status: 409 },
          )
        }
        if (url === '/api/breaks/active') {
          // 故意に古い startTime を渡しても、クライアントはそれを使わず
          // サーバーから渡された remainingSeconds をそのまま採用する。
          const farPastStart = new Date(Date.now() - 90 * 60 * 1000).toISOString()
          return new Response(
            JSON.stringify({
              id: 'break-existing',
              startTime: farPastStart,
              endTime: null,
              pauseTime: null,
              resumeTime: null,
              remainingSeconds: serverRemainingSeconds,
              serverNow: new Date().toISOString(),
            }),
            { status: 200 },
          )
        }
        return new Response('not found', { status: 404 })
      }) as typeof fetch,
    )

    renderWithStore()

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/active')
    })

    const state = store.get(breakStateAtom)
    expect(state.status).toBe('breaking')
    expect(state.breakRecordId).toBe('break-existing')
    // サーバー値をそのまま採用（startTime ベースの再計算は行わない）
    expect(state.remainingSeconds).toBe(serverRemainingSeconds)
  })

  it('startBreak 409 応答時に active.remainingSeconds が欠けていれば atom を更新しない', async () => {
    // フォールバック仕様: サーバーが新仕様レスポンスを返さなかった場合、
    // クライアントは独自計算に逃げず、atom を更新せずにエラーログを出す。
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockImplementation(
      (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url === '/api/breaks') {
          return new Response(
            JSON.stringify({ error: 'Active break already exists', breakRecordId: 'break-existing' }),
            { status: 409 },
          )
        }
        if (url === '/api/breaks/active') {
          // remainingSeconds なし
          return new Response(
            JSON.stringify({
              id: 'break-existing',
              startTime: new Date().toISOString(),
              endTime: null,
            }),
            { status: 200 },
          )
        }
        return new Response('not found', { status: 404 })
      }) as typeof fetch,
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithStore()

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/active')
    })

    const state = store.get(breakStateAtom)
    expect(state.status).toBe('idle')
    expect(state.breakRecordId).toBeNull()
    consoleSpy.mockRestore()
  })

  it('startBreak 409 後 GET /api/breaks/active も失敗した場合は atom を更新しない', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockImplementation(
      (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url === '/api/breaks') {
          return new Response(
            JSON.stringify({ error: 'Active break already exists', breakRecordId: 'break-existing' }),
            { status: 409 },
          )
        }
        if (url === '/api/breaks/active') {
          return new Response(JSON.stringify({ error: 'Internal' }), { status: 500 })
        }
        return new Response('not found', { status: 404 })
      }) as typeof fetch,
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithStore()

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/active')
    })

    const state = store.get(breakStateAtom)
    expect(state.status).toBe('idle')
    expect(state.breakRecordId).toBeNull()
    consoleSpy.mockRestore()
  })

  it('startBreak が 500 応答した場合は atom を更新せずエラーをログする', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Internal' }), { status: 500 }),
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithStore()

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/breaks', { method: 'POST' })
    })

    const state = store.get(breakStateAtom)
    expect(state.status).toBe('idle')
    expect(state.breakRecordId).toBeNull()
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

  it('Strict Mode で useEffect が二重実行されても startBreak は 1 回しか POST しない', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'break-1' }), { status: 201 }),
    )

    // Strict Mode をシミュレートするため、コンポーネントを <StrictMode> で包む。
    // Strict Mode では dev モード時、useEffect が mount → unmount → mount と擬似的に走り、
    // 二重の副作用実行が検知される。
    render(
      <React.StrictMode>
        <Provider store={store}>
          <BreakScreen />
        </Provider>
      </React.StrictMode>,
    )

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    // 少し待って二度目の effect が走っても重複 POST が発生しないことを確認
    await new Promise((resolve) => setTimeout(resolve, 10))

    const postCalls = fetchSpy.mock.calls.filter(
      ([input, init]) => {
        const url = typeof input === 'string' ? input : (input as URL | Request).toString()
        return url === '/api/breaks' && (init as RequestInit | undefined)?.method === 'POST'
      },
    )
    expect(postCalls).toHaveLength(1)
  })

  it('Strict Mode で paused 再開時も resume API は 1 回しか呼ばれない', async () => {
    store.set(breakStateAtom, {
      status: 'paused',
      startTime: null,
      remainingSeconds: 1800,
      pausedAt: Date.now(),
      breakRecordId: 'break-paused-1',
    })

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    render(
      <React.StrictMode>
        <Provider store={store}>
          <BreakScreen />
        </Provider>
      </React.StrictMode>,
    )

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    const resumeCalls = fetchSpy.mock.calls.filter(
      ([input, init]) => {
        const url = typeof input === 'string' ? input : (input as URL | Request).toString()
        return (
          url === '/api/breaks/break-paused-1/resume' &&
          (init as RequestInit | undefined)?.method === 'PATCH'
        )
      },
    )
    expect(resumeCalls).toHaveLength(1)
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
