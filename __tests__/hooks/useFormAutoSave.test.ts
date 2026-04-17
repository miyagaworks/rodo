import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// offline-db モック
const mockSaveDraft = vi.fn()
const mockGetDraft = vi.fn()
const mockDeleteDraft = vi.fn()

vi.mock('@/lib/offline-db', () => ({
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
  deleteDraft: (...args: unknown[]) => mockDeleteDraft(...args),
}))

import { useFormAutoSave } from '@/hooks/useFormAutoSave'

describe('useFormAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSaveDraft.mockReset()
    mockGetDraft.mockReset()
    mockDeleteDraft.mockReset()
    mockSaveDraft.mockResolvedValue(undefined)
    mockDeleteDraft.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── restoreDraft ──

  it('restoreDraft で IndexedDB から下書きを復元する', async () => {
    const draftData = { key: 'disp-1', formData: { name: 'test' }, updatedAt: 1000 }
    mockGetDraft.mockResolvedValue(draftData)

    const { result } = renderHook(() => useFormAutoSave('disp-1'))

    let restoredData: Record<string, unknown> | null = null
    await act(async () => {
      restoredData = await result.current.restoreDraft()
    })

    expect(restoredData).toEqual({ name: 'test' })
    expect(result.current.restored).toBe(true)
    expect(mockGetDraft).toHaveBeenCalledWith('disp-1')
  })

  it('restoreDraft で下書きが無い場合は null を返す', async () => {
    mockGetDraft.mockResolvedValue(undefined)

    const { result } = renderHook(() => useFormAutoSave('disp-1'))

    let restoredData: Record<string, unknown> | null = null
    await act(async () => {
      restoredData = await result.current.restoreDraft()
    })

    expect(restoredData).toBeNull()
    expect(result.current.restored).toBe(true)
  })

  it('restoreDraft で IndexedDB エラー時は null を返し restored を true にする', async () => {
    mockGetDraft.mockRejectedValue(new Error('DB error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useFormAutoSave('disp-1'))

    let restoredData: Record<string, unknown> | null = null
    await act(async () => {
      restoredData = await result.current.restoreDraft()
    })

    expect(restoredData).toBeNull()
    expect(result.current.restored).toBe(true)
    consoleSpy.mockRestore()
  })

  // ── saveFormData ──

  it('saveFormData は 1 秒デバウンスで保存する', async () => {
    const { result } = renderHook(() => useFormAutoSave('disp-1'))

    act(() => {
      result.current.saveFormData({ field: 'value' })
    })

    // 1秒前には保存されない
    expect(mockSaveDraft).not.toHaveBeenCalled()

    // 1秒後に保存される
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(mockSaveDraft).toHaveBeenCalledWith('disp-1', { field: 'value' })
  })

  it('saveFormData を連続呼び出しするとデバウンスで最後の値だけ保存する', async () => {
    const { result } = renderHook(() => useFormAutoSave('disp-1'))

    act(() => {
      result.current.saveFormData({ field: 'first' })
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    act(() => {
      result.current.saveFormData({ field: 'second' })
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    act(() => {
      result.current.saveFormData({ field: 'third' })
    })

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
    expect(mockSaveDraft).toHaveBeenCalledWith('disp-1', { field: 'third' })
  })

  it('enabled=false のとき saveFormData は何もしない', async () => {
    const { result } = renderHook(() => useFormAutoSave('disp-1', false))

    act(() => {
      result.current.saveFormData({ field: 'value' })
    })

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it('saveFormData で IndexedDB エラーが発生しても例外をスローしない', async () => {
    mockSaveDraft.mockRejectedValue(new Error('DB write error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useFormAutoSave('disp-1'))

    act(() => {
      result.current.saveFormData({ field: 'value' })
    })

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    // エラーはconsole.errorに出力されるが例外にはならない
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  // ── clearDraft ──

  it('clearDraft で IndexedDB から下書きを削除する', async () => {
    const { result } = renderHook(() => useFormAutoSave('disp-1'))

    await act(async () => {
      await result.current.clearDraft()
    })

    expect(mockDeleteDraft).toHaveBeenCalledWith('disp-1')
  })

  it('clearDraft で IndexedDB エラー時も例外をスローしない', async () => {
    mockDeleteDraft.mockRejectedValue(new Error('DB error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useFormAutoSave('disp-1'))

    await act(async () => {
      await result.current.clearDraft()
    })

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  // ── クリーンアップ ──

  it('unmount 時にタイマーをクリアする', async () => {
    const { result, unmount } = renderHook(() => useFormAutoSave('disp-1'))

    act(() => {
      result.current.saveFormData({ field: 'value' })
    })

    unmount()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    // unmount 後はタイマーがクリアされているので保存されない
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })
})
