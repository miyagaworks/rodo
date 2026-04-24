import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// VehiclesTab は useEffect で fetch するため、fetch モックが必要
let fetchSpy: ReturnType<typeof vi.spyOn>

const mockVehicles = [
  {
    id: 'v1',
    plateNumber: '品川 100 あ 1234',
    displayName: '1号車',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    _count: { users: 2, dispatches: 5 },
  },
  {
    id: 'v2',
    plateNumber: '品川 200 い 5678',
    displayName: null,
    isActive: false,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    _count: { users: 0, dispatches: 3 },
  },
]

beforeEach(() => {
  fetchSpy = vi.spyOn(global, 'fetch')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
})

// デフォルトの fetch モック: GET で mockVehicles を返す
function setupFetchMock(overrides?: Partial<Response>) {
  fetchSpy.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => mockVehicles,
    ...overrides,
  }) as Response)
}

describe('VehiclesTab', () => {
  it('一覧取得: fetch モックで vehicles を返却し一覧がレンダリングされる', async () => {
    setupFetchMock()
    const VehiclesTab = (await import('@/components/settings/VehiclesTab')).default
    render(<VehiclesTab />)

    await waitFor(() => {
      expect(screen.getByText(/品川 100 あ 1234/)).toBeInTheDocument()
    })
    // 停止中の車両は [停止中] ラベルが付く
    expect(screen.getByText(/\[停止中\].*品川 200 い 5678/)).toBeInTheDocument()
  })

  it('新規追加: ボタンクリックで POST リクエストが発火する', async () => {
    setupFetchMock()
    const VehiclesTab = (await import('@/components/settings/VehiclesTab')).default
    render(<VehiclesTab />)

    await waitFor(() => {
      expect(screen.getByText(/品川 100 あ 1234/)).toBeInTheDocument()
    })

    fetchSpy.mockClear()
    setupFetchMock()

    fireEvent.click(screen.getByText('車両を追加'))

    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        (call) => call[1] && (call[1] as RequestInit).method === 'POST'
      )
      expect(postCall).toBeDefined()
      expect(postCall![0]).toBe('/api/settings/vehicles')
    })
  })

  it('削除: 削除ボタン + confirm OK で DELETE が発火する', async () => {
    setupFetchMock()
    const VehiclesTab = (await import('@/components/settings/VehiclesTab')).default
    render(<VehiclesTab />)

    await waitFor(() => {
      expect(screen.getByText(/品川 100 あ 1234/)).toBeInTheDocument()
    })

    fetchSpy.mockClear()
    setupFetchMock()

    // X ボタン（削除）をクリック — role="button" で取得
    const deleteButtons = screen.getAllByRole('button').filter(
      (btn) => btn.querySelector('svg') && btn.classList.contains('cursor-pointer')
    )
    expect(deleteButtons.length).toBeGreaterThan(0)
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      const deleteCall = fetchSpy.mock.calls.find(
        (call) => call[1] && (call[1] as RequestInit).method === 'DELETE'
      )
      expect(deleteCall).toBeDefined()
      expect(deleteCall![0]).toContain('/api/settings/vehicles/')
    })
  })

  it('409 削除エラー: DELETE が 409 返した場合に alert が呼び出される', async () => {
    setupFetchMock()
    const VehiclesTab = (await import('@/components/settings/VehiclesTab')).default
    render(<VehiclesTab />)

    await waitFor(() => {
      expect(screen.getByText(/品川 100 あ 1234/)).toBeInTheDocument()
    })

    // DELETE が 409 を返すよう設定
    fetchSpy.mockImplementation(async (url, opts) => {
      if (opts && (opts as RequestInit).method === 'DELETE') {
        return { ok: false, status: 409, json: async () => ({}) } as Response
      }
      return { ok: true, status: 200, json: async () => mockVehicles } as Response
    })

    const deleteButtons = screen.getAllByRole('button').filter(
      (btn) => btn.querySelector('svg') && btn.classList.contains('cursor-pointer')
    )
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('この車両は進行中の出動に使用されています')
    })
  })

  it('編集保存: 編集モード遷移 → 保存ボタンで PATCH が発火する', async () => {
    setupFetchMock()
    const VehiclesTab = (await import('@/components/settings/VehiclesTab')).default
    render(<VehiclesTab />)

    await waitFor(() => {
      expect(screen.getByText(/品川 100 あ 1234/)).toBeInTheDocument()
    })

    // アコーディオンを開く（Trigger クリック）
    const trigger = screen.getByText(/品川 100 あ 1234/)
    fireEvent.click(trigger)

    // 編集ボタンをクリック
    await waitFor(() => {
      expect(screen.getByText('編集')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('編集'))

    // 編集フォームが表示される（plateNumber の値が入った input）
    await waitFor(() => {
      expect(screen.getByDisplayValue('品川 100 あ 1234')).toBeInTheDocument()
    })

    fetchSpy.mockClear()
    setupFetchMock()

    // 保存ボタンをクリック
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => {
      const patchCall = fetchSpy.mock.calls.find(
        (call) => call[1] && (call[1] as RequestInit).method === 'PATCH'
      )
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/settings/vehicles/')
    })
  })
})
