import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

/**
 * QrShareModal — 作業確認書 QR 共有モーダル。
 *
 * Phase 5: token から `${origin}/c/${token}` を組み立てて
 *   - QR コード表示
 *   - URL テキスト表示
 *   - 閉じるボタン / 背景タップ で onClose
 *   - カード内タップでは onClose しない (e.stopPropagation)
 */

// qrcode.react を data-testid 付きの span に差し替えて value を観測できるようにする
vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props: { value: string; size?: number }) =>
    React.createElement('span', {
      'data-testid': 'qr-svg',
      'data-value': props.value,
    }),
}))

import QrShareModal from '@/components/dispatch/QrShareModal'

describe('QrShareModal', () => {
  beforeEach(() => {
    // jsdom の window.location.origin はデフォルト 'http://localhost:3000'
    // 上書き可能性に依存しないためそのまま使う
  })

  it('token が渡されたとき QRCodeSVG が描画され value が `${origin}/c/${token}`', () => {
    render(React.createElement(QrShareModal, { token: 'tok-abc', onClose: vi.fn() }))

    const qr = screen.getByTestId('qr-svg')
    expect(qr).toBeInTheDocument()
    expect(qr.getAttribute('data-value')).toBe(
      `${window.location.origin}/c/tok-abc`,
    )
  })

  it('URL テキストが表示される', () => {
    render(React.createElement(QrShareModal, { token: 'tok-xyz', onClose: vi.fn() }))

    const url = `${window.location.origin}/c/tok-xyz`
    expect(screen.getByText(url)).toBeInTheDocument()
  })

  it('「閉じる」ボタンで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(React.createElement(QrShareModal, { token: 'tok1', onClose }))

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('背景オーバーレイのタップで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    const { container } = render(
      React.createElement(QrShareModal, { token: 'tok1', onClose }),
    )

    // 一番外側 (overlay) は container の最初の子要素
    const overlay = container.firstElementChild as HTMLElement
    expect(overlay).not.toBeNull()
    fireEvent.click(overlay)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('カード内タップでは onClose が呼ばれない (stopPropagation)', () => {
    const onClose = vi.fn()
    render(React.createElement(QrShareModal, { token: 'tok1', onClose }))

    // QR は中央カード内に配置されているので、QR をクリックすれば内側カードに伝播する
    fireEvent.click(screen.getByTestId('qr-svg'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('ヘッダー文言「作業確認書を共有」が表示される', () => {
    render(React.createElement(QrShareModal, { token: 'tok1', onClose: vi.fn() }))

    expect(screen.getByText('作業確認書を共有')).toBeInTheDocument()
  })
})
