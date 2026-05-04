import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

import { BackToHomeConfirmModal } from '@/components/dispatch/BackToHomeConfirmModal'

/**
 * BackToHomeConfirmModal — 出動中の浮き案件防止 Phase 3。
 *
 * 仕様:
 *   - open=false で非表示
 *   - open=true でメッセージ表示
 *   - OK ボタン押下で onClose
 *   - 背景オーバーレイクリックで onClose、内側モーダルクリックでは伝播しない
 *
 * 計画書: docs/plans/dispatch-floating-prevention.md §3 Phase 3
 */

describe('BackToHomeConfirmModal', () => {
  it('open={false} のとき何も描画しない', () => {
    const { container } = render(
      React.createElement(BackToHomeConfirmModal, { open: false, onClose: vi.fn() }),
    )

    // メッセージが DOM に存在しない
    expect(screen.queryByText(/進行中の案件があります/)).not.toBeInTheDocument()
    // ルートが空
    expect(container.firstChild).toBeNull()
  })

  it('open={true} のときメッセージテキストが表示される', () => {
    render(
      React.createElement(BackToHomeConfirmModal, { open: true, onClose: vi.fn() }),
    )

    // <br /> で分割しているので部分一致で確認
    expect(screen.getByText(/進行中の案件があります/)).toBeInTheDocument()
    expect(
      screen.getByText(/ホームに戻るには「案件キャンセル」ボタンで取り消してください/),
    ).toBeInTheDocument()
    // OK ボタン
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
  })

  it('OK ボタン押下で onClose が 1 回呼ばれる', () => {
    const onClose = vi.fn()
    render(
      React.createElement(BackToHomeConfirmModal, { open: true, onClose }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('背景オーバーレイクリックで onClose が呼ばれ、内側モーダルクリックでは呼ばれない', () => {
    const onClose = vi.fn()
    const { container } = render(
      React.createElement(BackToHomeConfirmModal, { open: true, onClose }),
    )

    // 一番外側 (overlay) は container の最初の子要素
    const overlay = container.firstElementChild as HTMLElement
    expect(overlay).not.toBeNull()
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)

    // 内側カードのクリックでは伝播しない（カード内のテキスト要素をクリック）
    onClose.mockClear()
    fireEvent.click(screen.getByText(/進行中の案件があります/))
    expect(onClose).not.toHaveBeenCalled()
  })
})
