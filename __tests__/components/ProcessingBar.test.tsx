/**
 * ProcessingBar コンポーネントのテスト
 *
 * リファクタリング後のUI:
 * - 4ボタン（下書き・完了・保管・振替）を常に表示
 * - 各ボタンにカウントバッジ表示
 * - 0件のカテゴリはdisabled + opacity-35
 * - 複数件クリック時はポップアップメニューを表示
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ProcessingBar from '@/components/ProcessingBar'

// next/navigation モック
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

// next-auth/react モック
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { userId: 'test-user-id', tenantId: 'test-tenant', role: 'MEMBER' } },
    status: 'authenticated',
  }),
}))

/** 4つのfetch呼び出し（draft, stored, completed, transfer）をモックする */
function mockThreeFetches(
  drafts: unknown[] = [],
  stored: unknown[] = [],
  completed: unknown[] = [],
  transfers: unknown[] = [],
) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    if (url.includes('status=draft')) {
      return { ok: true, json: async () => drafts } as Response
    }
    if (url.includes('status=stored')) {
      return { ok: true, json: async () => stored } as Response
    }
    if (url.includes('status=completed')) {
      return { ok: true, json: async () => completed } as Response
    }
    if (url.includes('status=transfer')) {
      return { ok: true, json: async () => transfers } as Response
    }
    return { ok: true, json: async () => [] } as Response
  })
}

const makeDraft = (id: string, num: string) => ({
  id,
  dispatchNumber: num,
  isDraft: true,
  status: 'DISPATCHED',
  type: 'ONSITE' as const,
  plateRegion: null,
  plateClass: null,
  plateKana: null,
  plateNumber: null,
})

describe('ProcessingBar', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    fetchSpy?.mockRestore()
    pushMock.mockClear()
  })

  // ── 正常系 ──

  it('下書きも保管も完了もなければ空のバーを表示する', async () => {
    fetchSpy = mockThreeFetches([], [], [])

    const { container } = render(<ProcessingBar />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(4)
    })

    // 空のバーは min-h-[44px] で表示される
    const bar = container.firstElementChild as HTMLElement
    expect(bar).toHaveClass('min-h-[44px]')
    // ボタンは存在しない（空バーのみ）
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('下書きが1件あるとき下書きボタンにカウント1を表示する', async () => {
    fetchSpy = mockThreeFetches(
      [makeDraft('d1', '20260414001')],
      [],
      [],
    )

    render(<ProcessingBar />)

    await waitFor(() => {
      // 下書きボタンが有効で表示される
      const draftBtn = screen.getByText('下書き').closest('button')!
      expect(draftBtn).not.toBeDisabled()
    })

    // カウントバッジに「1」が表示される
    const draftBtn = screen.getByText('下書き').closest('button')!
    expect(draftBtn).toHaveStyle({ backgroundColor: '#D3170A' })
    expect(draftBtn.querySelector('.rounded-full')?.textContent).toBe('1')
  })

  it('下書きが3件あるとき下書きボタンにカウント3を表示する', async () => {
    const drafts = [
      makeDraft('d1', '20260414001'),
      makeDraft('d2', '20260414002'),
      makeDraft('d3', '20260414003'),
    ]
    fetchSpy = mockThreeFetches(drafts, [], [])

    render(<ProcessingBar />)

    await waitFor(() => {
      const draftBtn = screen.getByText('下書き').closest('button')!
      expect(draftBtn.querySelector('.rounded-full')?.textContent).toBe('3')
    })
  })

  it('下書き1件クリックで直接recordページに遷移する', async () => {
    fetchSpy = mockThreeFetches(
      [makeDraft('d1', '20260414001')],
      [],
      [],
    )

    render(<ProcessingBar />)

    await waitFor(() => {
      expect(screen.getByText('下書き').closest('button')).not.toBeDisabled()
    })

    fireEvent.click(screen.getByText('下書き').closest('button')!)

    expect(pushMock).toHaveBeenCalledWith('/dispatch/d1/record')
  })

  it('下書き複数件クリックでポップアップメニューを表示する', async () => {
    const drafts = [
      makeDraft('d1', '20260414001'),
      makeDraft('d2', '20260414002'),
    ]
    fetchSpy = mockThreeFetches(drafts, [], [])

    render(<ProcessingBar />)

    await waitFor(() => {
      expect(screen.getByText('下書き').closest('button')).not.toBeDisabled()
    })

    fireEvent.click(screen.getByText('下書き').closest('button')!)

    // ポップアップメニューに各出動番号が表示される
    await waitFor(() => {
      expect(screen.getByText('20260414001')).toBeInTheDocument()
      expect(screen.getByText('20260414002')).toBeInTheDocument()
    })
  })

  it('ポップアップメニューの項目クリックで該当recordに遷移する', async () => {
    const drafts = [
      makeDraft('d1', '20260414001'),
      makeDraft('d2', '20260414002'),
    ]
    fetchSpy = mockThreeFetches(drafts, [], [])

    render(<ProcessingBar />)

    await waitFor(() => {
      expect(screen.getByText('下書き').closest('button')).not.toBeDisabled()
    })

    fireEvent.click(screen.getByText('下書き').closest('button')!)

    await waitFor(() => {
      expect(screen.getByText('20260414001')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('20260414001'))

    expect(pushMock).toHaveBeenCalledWith('/dispatch/d1/record')
  })

  // ── 保管・完了ボタン ──

  it('保管が0件のときdisabledになる', async () => {
    fetchSpy = mockThreeFetches(
      [makeDraft('d1', '20260414001')],
      [],
      [],
    )

    render(<ProcessingBar />)

    await waitFor(() => {
      expect(screen.getByText('下書き').closest('button')).not.toBeDisabled()
    })

    const storageBtn = screen.getByText('保管').closest('button')!
    expect(storageBtn).toBeDisabled()
    expect(storageBtn).toHaveClass('opacity-35')
  })

  it('保管が1件あるときクリックでsecondaryページに遷移する', async () => {
    fetchSpy = mockThreeFetches(
      [],
      [{ id: 's1', dispatchNumber: '20260414010', isDraft: false, status: 'STORED', type: 'TRANSPORT', plateRegion: null, plateClass: null, plateKana: null, plateNumber: null }],
      [],
    )

    render(<ProcessingBar />)

    await waitFor(() => {
      const storageBtn = screen.getByText('保管').closest('button')!
      expect(storageBtn).not.toBeDisabled()
    })

    fireEvent.click(screen.getByText('保管').closest('button')!)

    expect(pushMock).toHaveBeenCalledWith('/dispatch/s1/secondary')
  })

  it('完了が0件のときdisabledになる', async () => {
    fetchSpy = mockThreeFetches(
      [makeDraft('d1', '20260414001')],
      [],
      [],
    )

    render(<ProcessingBar />)

    await waitFor(() => {
      expect(screen.getByText('下書き').closest('button')).not.toBeDisabled()
    })

    const completedBtn = screen.getByText('完了').closest('button')!
    expect(completedBtn).toBeDisabled()
    expect(completedBtn).toHaveClass('opacity-35')
  })

  it('振替0件のときdisabledになる', async () => {
    fetchSpy = mockThreeFetches(
      [makeDraft('d1', '20260414001')],
      [],
      [],
      [],
    )

    render(<ProcessingBar />)

    await waitFor(() => {
      expect(screen.getByText('下書き').closest('button')).not.toBeDisabled()
    })

    // 振替ボタンはアイコンのみでテキストなし。4番目のボタン
    const buttons = screen.getAllByRole('button')
    const transferBtn = buttons[buttons.length - 1]
    expect(transferBtn).toBeDisabled()
    expect(transferBtn).toHaveClass('opacity-35')
  })

  // ── 異常系 ──

  it('APIがエラーを返してもクラッシュしない', async () => {
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<ProcessingBar />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    // バーは描画されるべき（空の状態）
    expect(container.firstElementChild).toBeTruthy()
    consoleSpy.mockRestore()
  })

  it('APIが配列以外を返してもクラッシュしない', async () => {
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => ({ error: 'something went wrong' }),
    }) as Response)

    const { container } = render(<ProcessingBar />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    // 空バーとして表示
    expect(container.firstElementChild).toBeTruthy()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
