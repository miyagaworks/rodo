import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActiveDispatchBanner from '@/components/ActiveDispatchBanner'

describe('ActiveDispatchBanner', () => {
  it('dispatchNumber を画面に表示する', () => {
    render(
      <ActiveDispatchBanner
        dispatchNumber="20260504001"
        onClick={() => {}}
      />,
    )
    expect(screen.getByText(/20260504001/)).toBeTruthy()
    expect(screen.getByText(/進行中の出動があります/)).toBeTruthy()
  })

  it('クリックで onClick が呼ばれる', () => {
    const onClick = vi.fn()
    render(
      <ActiveDispatchBanner
        dispatchNumber="20260504001"
        onClick={onClick}
      />,
    )

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('aria-label が付与されている（スクリーンリーダー対応）', () => {
    render(
      <ActiveDispatchBanner
        dispatchNumber="20260504001"
        onClick={() => {}}
      />,
    )

    const button = screen.getByLabelText(
      '進行中の出動があります。クリックで出動画面に戻ります',
    )
    expect(button).toBeTruthy()
  })

  it('「出動画面に戻る」ラベルが含まれる', () => {
    render(
      <ActiveDispatchBanner
        dispatchNumber="20260504001"
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('出動画面に戻る')).toBeTruthy()
  })
})
