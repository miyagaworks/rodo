import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AssistanceButton from '@/components/AssistanceButton'

// next/navigation モック
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

const mockAssistance = {
  id: 'assist-cuid-123',
  displayKey: 'PA',
  name: 'PAアシスタンス',
  logo: '/logos/assistance-pa.svg',
  abbr: 'PA',
  logoClass: 'max-h-28',
  textClass: 'text-2xl',
  textNudge: 10,
}

describe('AssistanceButton', () => {
  afterEach(() => {
    pushMock.mockClear()
  })

  // ── 既存挙動（disabled === false / 未指定） ──

  it('クリックで /dispatch/new?assistanceId=xxx&type=onsite に遷移する', () => {
    render(<AssistanceButton assistance={mockAssistance} />)

    fireEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith(
      '/dispatch/new?assistanceId=assist-cuid-123&type=onsite',
    )
  })

  it('disabled === false のときは既存挙動（router.push が呼ばれる）', () => {
    const onDisabledClick = vi.fn()
    render(
      <AssistanceButton
        assistance={mockAssistance}
        disabled={false}
        onDisabledClick={onDisabledClick}
      />,
    )

    fireEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith(
      '/dispatch/new?assistanceId=assist-cuid-123&type=onsite',
    )
    // disabled でないので onDisabledClick は呼ばれない
    expect(onDisabledClick).not.toHaveBeenCalled()
  })

  it('略称（abbr）と画像 alt を表示する', () => {
    render(<AssistanceButton assistance={mockAssistance} />)
    expect(screen.getByText('PA')).toBeTruthy()
    expect(screen.getByAltText('PAアシスタンス')).toBeTruthy()
  })

  // ── disabled === true 時の抑止ロジック（Phase 5） ──

  describe('disabled === true', () => {
    it('既存 onClick (router.push) が呼ばれない', () => {
      render(
        <AssistanceButton
          assistance={mockAssistance}
          disabled
          onDisabledClick={() => {}}
        />,
      )

      fireEvent.click(screen.getByRole('button'))
      expect(pushMock).not.toHaveBeenCalled()
    })

    it('代わりに onDisabledClick が呼ばれる', () => {
      const onDisabledClick = vi.fn()
      render(
        <AssistanceButton
          assistance={mockAssistance}
          disabled
          onDisabledClick={onDisabledClick}
        />,
      )

      fireEvent.click(screen.getByRole('button'))
      expect(onDisabledClick).toHaveBeenCalledTimes(1)
    })

    it('スタイルに opacity-50 / cursor-not-allowed が含まれる', () => {
      render(
        <AssistanceButton
          assistance={mockAssistance}
          disabled
          onDisabledClick={() => {}}
        />,
      )

      const button = screen.getByRole('button')
      expect(button.className).toContain('opacity-50')
      expect(button.className).toContain('cursor-not-allowed')
    })

    it('hover/active アニメーションのクラスが含まれない', () => {
      render(
        <AssistanceButton
          assistance={mockAssistance}
          disabled
          onDisabledClick={() => {}}
        />,
      )

      const button = screen.getByRole('button')
      // disabled 時は hover:shadow-lg / active:scale-95 を付けない
      expect(button.className).not.toContain('hover:shadow-lg')
      expect(button.className).not.toContain('active:scale-95')
    })

    it('HTML disabled 属性は付かない（onClick が拾えるようにするため）', () => {
      render(
        <AssistanceButton
          assistance={mockAssistance}
          disabled
          onDisabledClick={() => {}}
        />,
      )

      const button = screen.getByRole('button') as HTMLButtonElement
      // onClick で alert を出すために HTML disabled は付けない
      expect(button.disabled).toBe(false)
      // 視覚補助として aria-disabled は付ける
      expect(button.getAttribute('aria-disabled')).toBe('true')
    })

    it('onDisabledClick 未指定でもクラッシュしない（router.push は呼ばれない）', () => {
      render(<AssistanceButton assistance={mockAssistance} disabled />)

      fireEvent.click(screen.getByRole('button'))
      expect(pushMock).not.toHaveBeenCalled()
    })
  })
})
