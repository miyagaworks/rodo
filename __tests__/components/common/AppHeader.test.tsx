/**
 * AppHeader コンポーネントのテスト
 *
 * 既存 (showAdminNav=false):
 * - showMenuButton=false: ☰ ボタン非表示
 * - showMenuButton=true: ☰ ボタン表示 + クリックで onMenuClick
 * - hasSidebar=true: ☰ に md:hidden クラス
 * - hasSidebar=false: ☰ に md:hidden が付かない
 * - session.user.name 表示
 * - ログアウトボタンクリックで signOut が呼ばれる
 *
 * Phase 2.5 (showAdminNav=true):
 * - PC では水平 nav が表示される
 * - SP（md:hidden 制御）でも nav DOM は出力されるが md:hidden で非表示
 * - SP 用ハンバーガーは右配置（-mr-1 + md:hidden）
 * - PC 用「管理者名 + ログアウト」が hidden md:flex に入っている
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// next-auth/react.signOut をモック
const signOutMock = vi.fn()
vi.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}))

// usePathname を可変モック（AdminMenu が呼ぶ）
let currentPath = '/admin/dashboard'
vi.mock('next/navigation', () => ({
  usePathname: () => currentPath,
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
    currentPath = '/admin/dashboard'
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

  // ── Phase 2.5: showAdminNav 関連 ────────────────────────────

  it('showAdminNav=true の時、水平 nav（管理メニュー）が DOM に出力される', () => {
    render(
      <AppHeader
        session={mockSession as any}
        showAdminNav={true}
        onMenuClick={() => {}}
      />,
    )

    const nav = screen.getByLabelText('管理メニュー')
    expect(nav).toBeTruthy()
    // 主要メニュー項目
    expect(screen.getByText('ダッシュボード')).toBeTruthy()
    expect(screen.getByText('案件管理')).toBeTruthy()
    expect(screen.getByText('設定')).toBeTruthy()
  })

  it('showAdminNav=true の時、PC 用 nav 親要素は hidden md:flex（SP では非表示）', () => {
    render(
      <AppHeader
        session={mockSession as any}
        showAdminNav={true}
        onMenuClick={() => {}}
      />,
    )

    const nav = screen.getByLabelText('管理メニュー')
    const navWrapper = nav.parentElement!
    expect(navWrapper.className).toContain('hidden')
    expect(navWrapper.className).toContain('md:flex')
  })

  it('showAdminNav=true の時、SP 用ハンバーガーは右配置（md:hidden + -mr-1）', () => {
    render(
      <AppHeader
        session={mockSession as any}
        showAdminNav={true}
        onMenuClick={() => {}}
      />,
    )

    const menuButton = screen.getByLabelText('メニューを開く')
    expect(menuButton.className).toContain('md:hidden')
    expect(menuButton.className).toContain('-mr-1')
  })

  it('showAdminNav=true の時、PC 用「管理者名 + ログアウト」は hidden md:flex に入る', () => {
    render(
      <AppHeader
        session={mockSession as any}
        showAdminNav={true}
        onMenuClick={() => {}}
      />,
    )

    const name = screen.getByText('テスト太郎')
    const wrapper = name.parentElement!
    expect(wrapper.className).toContain('hidden')
    expect(wrapper.className).toContain('md:flex')
  })

  it('showAdminNav=true の時、active メニューに aria-current="page" が付く', () => {
    currentPath = '/admin/dashboard'
    render(
      <AppHeader
        session={mockSession as any}
        showAdminNav={true}
        onMenuClick={() => {}}
      />,
    )

    const dashboardLink = screen.getByText('ダッシュボード').closest('a')!
    expect(dashboardLink).toHaveAttribute('aria-current', 'page')
  })

  it('showAdminNav=true の時、☰ クリックで onMenuClick が呼ばれる', () => {
    const onMenuClick = vi.fn()
    render(
      <AppHeader
        session={mockSession as any}
        showAdminNav={true}
        onMenuClick={onMenuClick}
      />,
    )

    fireEvent.click(screen.getByLabelText('メニューを開く'))

    expect(onMenuClick).toHaveBeenCalledTimes(1)
  })
})
