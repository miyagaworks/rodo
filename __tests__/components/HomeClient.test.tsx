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
import { render, screen, waitFor } from '@testing-library/react'
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

  it('ADMINユーザーには設定リンクが表示される', async () => {
    fetchSpy = mockFetch({ ok: true, status: 200, data: [] })

    const adminSession = {
      ...mockSession,
      user: { ...mockSession.user, role: 'ADMIN' as const },
    }
    render(<HomeClient session={adminSession as any} />)

    expect(screen.getByText('設定')).toBeTruthy()
  })

  it('一般ユーザーには設定リンクが表示されない', async () => {
    fetchSpy = mockFetch({ ok: true, status: 200, data: [] })

    render(<HomeClient session={mockSession as any} />)

    expect(screen.queryByText('設定')).toBeNull()
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
})
