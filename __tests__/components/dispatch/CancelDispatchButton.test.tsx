import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'

import { CancelDispatchButton } from '@/components/dispatch/CancelDispatchButton'

/**
 * CancelDispatchButton — 出動中の浮き案件防止 Phase 4。
 *
 * カバーケース（実装プロンプト指定）:
 *   1. ボタン押下でモーダル表示
 *   2. 「閉じる」押下でモーダル消去（fetch 呼ばれない）
 *   3. 「キャンセルする」押下で fetch が /api/dispatches/{id}/cancel に POST
 *   4. res.ok=true で onCancelled が呼ばれモーダル消える
 *   5. res.status=409 で onCancelled が呼ばれず alert される
 *   6. catch (Network エラー) で onCancelled が呼ばれず alert される
 *   7. 二重押下防止: loading 中はボタン disabled
 *
 * 計画書: docs/plans/dispatch-floating-prevention.md §3 Phase 4
 * 引き継ぎ: docs/handover/2026-05-04-dispatch-floating-prevention.md §L
 */

const DEFAULT_PROPS = {
  dispatchId: 'disp_123',
  dispatchNumber: '20260504001',
}

describe('CancelDispatchButton', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, dispatch: { id: 'disp_123', status: 'CANCELLED' } }), { status: 200 }))
  })

  afterEach(() => {
    alertSpy.mockRestore()
    fetchSpy.mockRestore()
  })

  it('1. ボタン押下でモーダルが表示される', () => {
    const onCancelled = vi.fn()
    render(
      React.createElement(CancelDispatchButton, { ...DEFAULT_PROPS, onCancelled }),
    )

    expect(screen.queryByText(/キャンセルしますか/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '案件キャンセル' }))

    expect(screen.getByText(/キャンセルしますか/)).toBeInTheDocument()
    expect(screen.getByText(/案件番号 20260504001/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'キャンセルする' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
  })

  it('2. 「閉じる」押下でモーダルが消え fetch は呼ばれない', () => {
    const onCancelled = vi.fn()
    render(
      React.createElement(CancelDispatchButton, { ...DEFAULT_PROPS, onCancelled }),
    )

    fireEvent.click(screen.getByRole('button', { name: '案件キャンセル' }))
    expect(screen.getByText(/キャンセルしますか/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(screen.queryByText(/キャンセルしますか/)).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('3. 「キャンセルする」押下で fetch が /api/dispatches/{id}/cancel に POST される', async () => {
    const onCancelled = vi.fn()
    render(
      React.createElement(CancelDispatchButton, { ...DEFAULT_PROPS, onCancelled }),
    )

    fireEvent.click(screen.getByRole('button', { name: '案件キャンセル' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセルする' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
    expect(fetchSpy).toHaveBeenCalledWith('/api/dispatches/disp_123/cancel', {
      method: 'POST',
    })
  })

  it('4. res.ok=true で onCancelled が呼ばれモーダルが消える', async () => {
    const onCancelled = vi.fn()
    render(
      React.createElement(CancelDispatchButton, { ...DEFAULT_PROPS, onCancelled }),
    )

    fireEvent.click(screen.getByRole('button', { name: '案件キャンセル' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセルする' }))

    await waitFor(() => {
      expect(onCancelled).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText(/キャンセルしますか/)).not.toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('5. res.status=409 で onCancelled が呼ばれず alert される', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'キャンセルできない状態です' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const onCancelled = vi.fn()
    render(
      React.createElement(CancelDispatchButton, { ...DEFAULT_PROPS, onCancelled }),
    )

    fireEvent.click(screen.getByRole('button', { name: '案件キャンセル' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセルする' }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1)
    })
    expect(alertSpy).toHaveBeenCalledWith('キャンセルできない状態です')
    expect(onCancelled).not.toHaveBeenCalled()
    // モーダルは維持される（loading 終了後にユーザーが「閉じる」を押せる）
    expect(screen.getByText(/キャンセルしますか/)).toBeInTheDocument()
  })

  it('6. catch（ネットワークエラー）で onCancelled が呼ばれず alert される', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const onCancelled = vi.fn()
    // catch ハンドラの console.error を抑制
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      React.createElement(CancelDispatchButton, { ...DEFAULT_PROPS, onCancelled }),
    )

    fireEvent.click(screen.getByRole('button', { name: '案件キャンセル' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセルする' }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1)
    })
    expect(alertSpy).toHaveBeenCalledWith(
      'ネットワーク接続が必要です。オンライン状態でやり直してください',
    )
    expect(onCancelled).not.toHaveBeenCalled()
    expect(screen.getByText(/キャンセルしますか/)).toBeInTheDocument()

    consoleErrorSpy.mockRestore()
  })

  it('7. loading 中は「キャンセルする」ボタンが disabled になる（二重押下防止）', async () => {
    // fetch が解決しない Promise を返す（loading 状態を保持）
    let resolveFetch: ((value: Response) => void) | null = null
    const pendingPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    fetchSpy.mockReturnValueOnce(pendingPromise)

    const onCancelled = vi.fn()
    render(
      React.createElement(CancelDispatchButton, { ...DEFAULT_PROPS, onCancelled }),
    )

    fireEvent.click(screen.getByRole('button', { name: '案件キャンセル' }))
    const cancelBtn = screen.getByRole('button', { name: 'キャンセルする' }) as HTMLButtonElement
    expect(cancelBtn.disabled).toBe(false)

    fireEvent.click(cancelBtn)

    // loading 中: 「処理中…」表示・disabled
    await waitFor(() => {
      const inFlight = screen.getByRole('button', { name: '処理中…' }) as HTMLButtonElement
      expect(inFlight.disabled).toBe(true)
    })

    // 「閉じる」ボタンも loading 中は disabled
    const closeBtn = screen.getByRole('button', { name: '閉じる' }) as HTMLButtonElement
    expect(closeBtn.disabled).toBe(true)

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // 解決させて後処理を流す（act でラップして state 更新の警告を抑制）
    await act(async () => {
      resolveFetch?.(
        new Response(JSON.stringify({ ok: true, dispatch: { id: 'disp_123', status: 'CANCELLED' } }), { status: 200 }),
      )
      await pendingPromise
    })
  })
})
