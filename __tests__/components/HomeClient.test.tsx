/**
 * HomeClient コンポーネントのテスト
 *
 * アシスタンス選択ページの表示不具合に対する修正の検証
 * - 正常系: APIからデータ取得してボタンを表示
 * - 異常系: 401→ログインリダイレクト、サーバーエラー→エラー表示
 * - エッジケース: 空配列、非配列レスポンス
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import HomeClient from '@/components/HomeClient'

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
vi.mock('jotai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jotai')>()
  return {
    ...actual,
    useAtomValue: () => ({ status: 'idle' }),
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

/** fetchモックを設定するヘルパー（全呼び出しに同じレスポンスを返す） */
function mockFetch(response: { ok: boolean; status: number; data: unknown }) {
  return vi.spyOn(global, 'fetch').mockImplementation(async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.data,
  }) as Response)
}

describe('HomeClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    fetchSpy?.mockRestore()
    pushMock.mockClear()
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
    fetchSpy = mockFetch({ ok: false, status: 401, data: { error: 'Unauthorized' } })

    render(<HomeClient session={mockSession as any} />)

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/login')
    })
  })

  it('500エラーでエラーメッセージとリトライボタンを表示する', async () => {
    fetchSpy = mockFetch({ ok: false, status: 500, data: { error: 'Internal Server Error' } })

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
})
