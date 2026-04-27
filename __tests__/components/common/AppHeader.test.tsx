/**
 * AppHeader コンポーネントのテスト
 *
 * - showMenuButton=false: ☰ ボタン非表示
 * - showMenuButton=true: ☰ ボタン表示 + クリックで onMenuClick
 * - hasSidebar=true: ☰ に md:hidden クラス
 * - hasSidebar=false: ☰ に md:hidden が付かない
 * - session.user.name 表示
 * - ログアウトボタンクリックで signOut が呼ばれる
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// next-auth/react.signOut をモック
const signOutMock = vi.fn()
vi.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}))

import AppHeader from '@/components/common/AppHeader'

const mockSession = {
  user: {
    name: 'テスト太郎',
    role: 'ADMIN' as const,
    tenantId: 'tenant-1',
  },
  expires: '2099-01-01',
}

describe('AppHeader', () => {
  afterEach(() => {
    signOutMock.mockClear()
  })

  it('showMenuButton=false の時、☰ ボタンが表示されない', () => {
    render(<AppHeader session={mockSession as any} showMenuButton={false} />)

    expect(screen.queryByLabelText('メニューを開く')).toBeNull()
  })

  it('showMenuButton=true の時、☰ ボタンが表示される', () => {
    render(
      <AppHeader
        session={mockSession as any}
        showMenuButton={true}
        onMenuClick={() => {}}
      />,
    )

    expect(screen.getByLabelText('メニューを開く')).toBeTruthy()
  })

  it('☰ ボタンクリックで onMenuClick が呼ばれる', () => {
    const onMenuClick = vi.fn()
    render(
      <AppHeader
        session={mockSession as any}
        showMenuButton={true}
        onMenuClick={onMenuClick}
      />,
    )

    fireEvent.click(screen.getByLabelText('メニューを開く'))

    expect(onMenuClick).toHaveBeenCalledTimes(1)
  })

  it('hasSidebar=true の時、☰ ボタンに md:hidden クラスが付く', () => {
    render(
      <AppHeader
        session={mockSession as any}
        showMenuButton={true}
        onMenuClick={() => {}}
        hasSidebar={true}
      />,
    )

    const menuButton = screen.getByLabelText('メニューを開く')
    expect(menuButton.className).toContain('md:hidden')
  })

  it('hasSidebar=false の時、☰ ボタンに md:hidden クラスが付かない', () => {
    render(
      <AppHeader
        session={mockSession as any}
        showMenuButton={true}
        onMenuClick={() => {}}
        hasSidebar={false}
      />,
    )

    const menuButton = screen.getByLabelText('メニューを開く')
    expect(menuButton.className).not.toContain('md:hidden')
  })

  it('session.user.name が表示される', () => {
    render(<AppHeader session={mockSession as any} />)

    expect(screen.getByText('テスト太郎')).toBeTruthy()
  })

  it('ログアウトボタンクリックで signOut が呼ばれる', () => {
    render(<AppHeader session={mockSession as any} />)

    fireEvent.click(screen.getByLabelText('ログアウト'))

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/login' })
  })
})
