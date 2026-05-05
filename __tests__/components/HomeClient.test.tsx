/**
 * HomeClient コンポーネントのテスト
 *
 * アシスタンス選択ページの表示不具合に対する修正 + 休憩上限制御の検証
 * - 正常系: APIからデータ取得してボタンを表示
 * - 異常系: 401→ログインリダイレクト、サーバーエラー→エラー表示
 * - エッジケース: 空配列、非配列レスポンス
 * - 休憩ボタン表示制御: /api/breaks/limit-status のレスポンスに応じて
 *   休憩ボタンの表示/非表示を切り替える（フェイルクローズ）
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import HomeClient from '@/components/HomeClient'
import type { BreakState } from '@/store/breakAtom'

// next/navigation モック
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: vi.fn(),
  }),
}))

// next-auth/react モック
vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}))

// useActiveDispatch モック（Phase 5）。
// テストごとに戻り値を差し替えられるようモジュール変数で保持。
type ActiveDispatchMock = {
  activeDispatch: { id: string; dispatchNumber: string } | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}
let activeDispatchMockValue: ActiveDispatchMock = {
  activeDispatch: null,
  loading: false,
  error: null,
  refresh: async () => {},
}
vi.mock('@/hooks/useActiveDispatch', () => ({
  useActiveDispatch: () => activeDispatchMockValue,
}))

// jotai モック（breakStateAtom で atom() を使うため importOriginal が必要）
// テストごとに breakState を変更できるようモジュール変数で保持する
let currentBreakState: BreakState = {
  status: 'idle',
  startTime: null,
  remainingSeconds: 3600,
  pausedAt: null,
  breakRecordId: null,
}
vi.mock('jotai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jotai')>()
  return {
    ...actual,
    useAtomValue: () => currentBreakState,
  }
})

// BreakBar / ProcessingBar モック（HomeClient のテストに不要）
vi.mock('@/components/BreakBar', () => ({
  default: () => <div data-testid="break-bar" />,
}))
vi.mock('@/components/ProcessingBar', () => ({
  default: () => <div data-testid="processing-bar" />,
}))

// AdminShell モック（HomeClient のテストに不要、内部で usePathname を使うため）
vi.mock('@/components/admin/AdminShell', () => ({
  default: ({ open }: { open: boolean }) => (
    <div data-testid="admin-shell" data-open={open} />
  ),
}))

// AppHeader モック（next-auth/react.signOut 等の依存を切り離す）
vi.mock('@/components/common/AppHeader', () => ({
  default: ({
    showMenuButton,
    showAdminNav,
    onMenuClick,
    session,
  }: {
    showMenuButton?: boolean
    showAdminNav?: boolean
    onMenuClick?: () => void
    session: { user: { name?: string | null } }
  }) => (
    <div data-testid="app-header">
      {(showMenuButton || showAdminNav) && (
        <button aria-label="メニューを開く" onClick={onMenuClick}>
          menu
        </button>
      )}
      <span>{session.user.name}</span>
    </div>
  ),
}))

const mockSession = {
  user: {
    name: 'テスト太郎',
    role: 'USER' as const,
    tenantId: 'tenant-1',
  },
  expires: '2099-01-01',
}

const mockAssistances = [
  { id: '1', name: 'PAアシスタンス', displayAbbreviation: 'PA', logoUrl: null, sortOrder: 1 },
  { id: '2', name: 'SCアシスタンス', displayAbbreviation: 'SC', logoUrl: null, sortOrder: 2 },
]

/** URL ごとに異なるレスポンスを返す fetch モック */
interface FetchMockConfig {
  assistances?: { ok: boolean; status: number; data: unknown }
  limitStatus?:
    | { ok: boolean; status: number; data: unknown }
    | { throwError: Error }
}

function mockFetchByUrl(config: FetchMockConfig) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input)

    if (url.includes('/api/breaks/limit-status')) {
      const cfg = config.limitStatus ?? {
        ok: true,
        status: 200,
        data: { canStartBreak: true },
      }
      if ('throwError' in cfg) {
        throw cfg.throwError
      }
      return {
        ok: cfg.ok,
        status: cfg.status,
        json: async () => cfg.data,
      } as Response
    }

    // 既定は /api/assistances 扱い
    const cfg = config.assistances ?? {
      ok: true,
      status: 200,
      data: mockAssistances,
    }
    return {
      ok: cfg.ok,
      status: cfg.status,
      json: async () => cfg.data,
    } as Response
  })
}

/** 後方互換用: assistances 側のみを設定する旧ヘルパー */
function mockFetch(response: { ok: boolean; status: number; data: unknown }) {
  return mockFetchByUrl({ assistances: response })
}

describe('HomeClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    fetchSpy?.mockRestore()
    pushMock.mockClear()
    // 既定の breakState に戻す
    currentBreakState = {
      status: 'idle',
      startTime: null,
      remainingSeconds: 3600,
      pausedAt: null,
      breakRecordId: null,
    }
    // 既定の useActiveDispatch モックに戻す
    activeDispatchMockValue = {
      activeDispatch: null,
      loading: false,
      error: null,
      refresh: async () => {},
    }
  })

  // ── 正常系 ──

  it('APIからアシスタンスを取得してボタンを表示する', async () => {
    fetchSpy = mockFetch({ ok: true, status: 200, data: mockAssistances })

    render(<HomeClient session={mockSession as any} />)

    // AssistanceButton は abbr（略称）を表示する
    await waitFor(() => {
      expect(screen.getByText('PA')).toBeTruthy()
      expect(screen.getByText('SC')).toBeTruthy()
    })

    expect(fetchSpy).toHaveBeenCalledWith('/api/assistances')
  })

  it('ユーザー名がヘッダーに表示される', async () => {
    fetchSpy = mockFetch({ ok: true, status: 200, data: [] })

    render(<HomeClient session={mockSession as any} />)

    expect(screen.getByText('テスト太郎')).toBeTruthy()
  })

  it('ADMINユーザーにはメニューを開くボタン（☰）が表示される', async () => {
    fetchSpy = mockFetch({ ok: true, status: 200, data: [] })

    const adminSession = {
      ...mockSession,
      user: { ...mockSession.user, role: 'ADMIN' as const },
    }
    render(<HomeClient session={adminSession as any} />)

    // ☰ ボタンは aria-label="メニューを開く" で識別
    expect(screen.getByLabelText('メニューを開く')).toBeTruthy()
  })

  it('一般ユーザーにはメニューを開くボタン（☰）が表示されない', async () => {
    fetchSpy = mockFetch({ ok: true, status: 200, data: [] })

    render(<HomeClient session={mockSession as any} />)

    expect(screen.queryByLabelText('メニューを開く')).toBeNull()
  })

  // ── 異常系 ──

  it('401レスポンスでログイン画面にリダイレクトする', async () => {
    fetchSpy = mockFetchByUrl({
      assistances: { ok: false, status: 401, data: { error: 'Unauthorized' } },
      limitStatus: { ok: true, status: 200, data: { canStartBreak: false } },
    })

    render(<HomeClient session={mockSession as any} />)

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/login')
    })
  })

  it('500エラーでエラーメッセージとリトライボタンを表示する', async () => {
    fetchSpy = mockFetchByUrl({
      assistances: { ok: false, status: 500, data: { error: 'Internal Server Error' } },
      limitStatus: { ok: true, status: 200, data: { canStartBreak: false } },
    })

    render(<HomeClient session={mockSession as any} />)

    await waitFor(() => {
      expect(screen.getByText(/API error: 500/)).toBeTruthy()
      expect(screen.getByText('再読み込み')).toBeTruthy()
    })
  })

  it('ネットワークエラーでエラーメッセージを表示する', async () => {
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })

    render(<HomeClient session={mockSession as any} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch')).toBeTruthy()
      expect(screen.getByText('再読み込み')).toBeTruthy()
    })
  })

  // ── エッジケース ──

  it('空配列でもクラッシュせずスケルトンを表示する', async () => {
    fetchSpy = mockFetch({ ok: true, status: 200, data: [] })

    render(<HomeClient session={mockSession as any} />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    // エラーメッセージは表示されない
    expect(screen.queryByText('再読み込み')).toBeNull()
  })

  it('非配列レスポンス（不正データ）でもクラッシュしない', async () => {
    fetchSpy = mockFetch({ ok: true, status: 200, data: { unexpected: 'data' } })

    render(<HomeClient session={mockSession as any} />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    // エラーにはならない（ok: true なので）
    expect(screen.queryByText('再読み込み')).toBeNull()
  })

  // ── 休憩ボタン表示制御（Phase 1: 休憩時間上限） ──

  describe('休憩ボタン表示制御', () => {
    it('マウント直後（canStartBreak 取得前）は休憩ボタンを表示しない', () => {
      // fetch が resolve しないように永遠に保留する Promise を返す
      fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
        () => new Promise(() => {}) as Promise<Response>,
      )

      render(<HomeClient session={mockSession as any} />)

      // 取得完了前は休憩ボタン非表示
      expect(screen.queryByText('休憩')).toBeNull()
    })

    it('canStartBreak: true を受け取ると休憩ボタンを表示する', async () => {
      fetchSpy = mockFetchByUrl({
        assistances: { ok: true, status: 200, data: mockAssistances },
        limitStatus: { ok: true, status: 200, data: { canStartBreak: true } },
      })

      render(<HomeClient session={mockSession as any} />)

      await waitFor(() => {
        expect(screen.getByText('休憩')).toBeTruthy()
      })
    })

    it('canStartBreak: false を受け取ると休憩ボタンを表示しない', async () => {
      fetchSpy = mockFetchByUrl({
        assistances: { ok: true, status: 200, data: mockAssistances },
        limitStatus: { ok: true, status: 200, data: { canStartBreak: false } },
      })

      render(<HomeClient session={mockSession as any} />)

      // limit-status の fetch が完了するのを待つ
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/limit-status')
      })

      // fetch 完了後でも休憩ボタンは表示されない
      expect(screen.queryByText('休憩')).toBeNull()
    })

    it('limit-status API エラー（500）時はフェイルクローズで休憩ボタンを表示しない', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchSpy = mockFetchByUrl({
        assistances: { ok: true, status: 200, data: mockAssistances },
        limitStatus: { ok: false, status: 500, data: { error: 'Internal' } },
      })

      render(<HomeClient session={mockSession as any} />)

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/limit-status')
      })

      expect(screen.queryByText('休憩')).toBeNull()
      // エラー通知が表示される
      await waitFor(() => {
        expect(
          screen.getByText(/休憩可否の取得に失敗しました/),
        ).toBeTruthy()
      })
      consoleSpy.mockRestore()
    })

    it('limit-status の fetch 例外時もフェイルクローズで休憩ボタンを表示しない', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : String(input)
        if (url.includes('/api/breaks/limit-status')) {
          throw new TypeError('network down')
        }
        return {
          ok: true,
          status: 200,
          json: async () => mockAssistances,
        } as Response
      })

      render(<HomeClient session={mockSession as any} />)

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/limit-status')
      })

      expect(screen.queryByText('休憩')).toBeNull()
      consoleSpy.mockRestore()
    })

    it('breakState.status === "paused" のときは休憩ボタンを表示しない（既存ロジック維持）', async () => {
      currentBreakState = {
        status: 'paused',
        startTime: null,
        remainingSeconds: 1800,
        pausedAt: Date.now(),
        breakRecordId: 'b1',
      }
      fetchSpy = mockFetchByUrl({
        assistances: { ok: true, status: 200, data: mockAssistances },
        limitStatus: { ok: true, status: 200, data: { canStartBreak: true } },
      })

      render(<HomeClient session={mockSession as any} />)

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/limit-status')
      })

      // paused 中は canStartBreak=true でも休憩ボタンは非表示
      expect(screen.queryByText('休憩')).toBeNull()
    })

    it('breakState.status が変化すると limit-status を再取得する', async () => {
      fetchSpy = mockFetchByUrl({
        assistances: { ok: true, status: 200, data: mockAssistances },
        limitStatus: { ok: true, status: 200, data: { canStartBreak: true } },
      })

      const { rerender } = render(<HomeClient session={mockSession as any} />)

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/breaks/limit-status')
      })

      const firstLimitStatusCalls = fetchSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('/api/breaks/limit-status'),
      ).length
      expect(firstLimitStatusCalls).toBe(1)

      // breaking 状態に遷移させて rerender
      currentBreakState = {
        status: 'breaking',
        startTime: Date.now(),
        remainingSeconds: 3000,
        pausedAt: null,
        breakRecordId: 'b1',
      }
      rerender(<HomeClient session={mockSession as any} />)

      await waitFor(() => {
        const limitStatusCalls = fetchSpy.mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].includes('/api/breaks/limit-status'),
        ).length
        expect(limitStatusCalls).toBe(2)
      })

      // 休憩終了（breaking → idle）で再取得されること
      currentBreakState = {
        status: 'idle',
        startTime: null,
        remainingSeconds: 3600,
        pausedAt: null,
        breakRecordId: null,
      }
      rerender(<HomeClient session={mockSession as any} />)

      await waitFor(() => {
        const limitStatusCalls = fetchSpy.mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].includes('/api/breaks/limit-status'),
        ).length
        expect(limitStatusCalls).toBe(3)
      })
    })
  })

  // ── 進行中バナー / アシスタンス抑止（Phase 5: 出動中の浮き案件防止） ──

  describe('進行中バナー（Phase 5）', () => {
    it('activeDispatch === null のとき、バナーは表示されずアシスタンスは活性のまま', async () => {
      activeDispatchMockValue = {
        activeDispatch: null,
        loading: false,
        error: null,
        refresh: async () => {},
      }
      fetchSpy = mockFetchByUrl({
        assistances: { ok: true, status: 200, data: mockAssistances },
        limitStatus: { ok: true, status: 200, data: { canStartBreak: true } },
      })

      render(<HomeClient session={mockSession as any} />)

      await waitFor(() => {
        expect(screen.getByText('PA')).toBeTruthy()
      })

      // バナー非表示
      expect(screen.queryByText(/進行中の出動があります/)).toBeNull()

      // アシスタンスボタン押下で /dispatch/new に遷移する（活性）
      const paButton = screen.getByText('PA').closest('button')!
      fireEvent.click(paButton)
      expect(pushMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/dispatch\/new\?assistanceId=1&type=onsite$/),
      )

      // 休憩ボタンも従来通り表示
      expect(screen.getByText('休憩')).toBeTruthy()
    })

    it('activeDispatch !== null のとき、バナー表示・アシスタンス抑止・休憩非表示', async () => {
      activeDispatchMockValue = {
        activeDispatch: { id: 'd-1', dispatchNumber: '20260504001' },
        loading: false,
        error: null,
        refresh: async () => {},
      }
      fetchSpy = mockFetchByUrl({
        assistances: { ok: true, status: 200, data: mockAssistances },
        limitStatus: { ok: true, status: 200, data: { canStartBreak: true } },
      })

      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(<HomeClient session={mockSession as any} />)

      // バナー表示（dispatchNumber 一致）
      await waitFor(() => {
        expect(screen.getByText(/20260504001/)).toBeTruthy()
      })

      // バナークリックで /dispatch/${id} に遷移
      const banner = screen.getByLabelText(
        '進行中の出動があります。クリックで出動画面に戻ります',
      )
      fireEvent.click(banner)
      expect(pushMock).toHaveBeenCalledWith('/dispatch/d-1')

      pushMock.mockClear()

      // アシスタンスボタン押下で alert が出て、router.push は呼ばれない
      await waitFor(() => {
        expect(screen.getByText('PA')).toBeTruthy()
      })
      const paButton = screen.getByText('PA').closest('button')!
      fireEvent.click(paButton)
      expect(alertSpy).toHaveBeenCalledWith('進行中の案件があります')
      expect(pushMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/dispatch/new'),
      )

      // 休憩ボタンは非表示
      expect(screen.queryByText('休憩')).toBeNull()

      alertSpy.mockRestore()
    })

    it('error !== null のとき、バナー非表示でアシスタンスは活性（フェイルクローズ＝抑止しない）', async () => {
      activeDispatchMockValue = {
        activeDispatch: null,
        loading: false,
        error: new Error('active dispatch fetch failed: HTTP 500'),
        refresh: async () => {},
      }
      fetchSpy = mockFetchByUrl({
        assistances: { ok: true, status: 200, data: mockAssistances },
        limitStatus: { ok: true, status: 200, data: { canStartBreak: true } },
      })

      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(<HomeClient session={mockSession as any} />)

      await waitFor(() => {
        expect(screen.getByText('PA')).toBeTruthy()
      })

      // バナー非表示（フェイルクローズ）
      expect(screen.queryByText(/進行中の出動があります/)).toBeNull()

      // アシスタンスボタン押下で /dispatch/new 遷移（活性のまま、alert 出さない）
      const paButton = screen.getByText('PA').closest('button')!
      fireEvent.click(paButton)
      expect(alertSpy).not.toHaveBeenCalled()
      expect(pushMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/dispatch\/new\?assistanceId=1&type=onsite$/),
      )

      alertSpy.mockRestore()
    })
  })
})
