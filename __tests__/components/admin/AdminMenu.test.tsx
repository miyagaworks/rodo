/**
 * AdminMenu コンポーネントのテスト
 *
 * - 全メニュー項目（ホーム / ダッシュボード / 案件管理 / 設定 / ログアウト）が表示される
 * - 現在のパスと一致する項目に aria-current="page" が付与される
 * - ログアウトボタン押下で signOut が呼ばれる
 * - 項目クリックで onItemClick が呼ばれる
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// usePathname を可変にしてテストごとに変更可能にする
let currentPath = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => currentPath,
}))

// signOut をモック化
const signOutMock = vi.fn()
vi.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}))

import AdminMenu from '@/components/admin/AdminMenu'

describe('AdminMenu', () => {
  beforeEach(() => {
    currentPath = '/'
    signOutMock.mockClear()
  })

  it('全メニュー項目（ホーム / ダッシュボード / 案件管理 / 設定 / ログアウト）が表示される', () => {
    render(<AdminMenu />)

    expect(screen.getByText('ホーム')).toBeTruthy()
    expect(screen.getByText('ダッシュボード')).toBeTruthy()
    expect(screen.getByText('案件管理')).toBeTruthy()
    expect(screen.getByText('設定')).toBeTruthy()
    expect(screen.getByText('ログアウト')).toBeTruthy()
  })

  it('リンクは正しい href を持つ', () => {
    render(<AdminMenu />)

    expect(screen.getByText('ホーム').closest('a')).toHaveAttribute('href', '/')
    expect(screen.getByText('ダッシュボード').closest('a')).toHaveAttribute(
      'href',
      '/admin/dashboard',
    )
    expect(screen.getByText('案件管理').closest('a')).toHaveAttribute(
      'href',
      '/admin/dispatches',
    )
    expect(screen.getByText('設定').closest('a')).toHaveAttribute(
      'href',
      '/settings',
    )
  })

  it('現在のパスが /admin/dashboard のときダッシュボード項目に aria-current="page" が付く', () => {
    currentPath = '/admin/dashboard'
    render(<AdminMenu />)

    const dashboardLink = screen.getByText('ダッシュボード').closest('a')!
    expect(dashboardLink).toHaveAttribute('aria-current', 'page')

    // 他の項目には付かない
    const homeLink = screen.getByText('ホーム').closest('a')!
    expect(homeLink).not.toHaveAttribute('aria-current')
  })

  it('現在のパスが /admin/dispatches/abc のとき案件管理項目に aria-current="page" が付く（前方一致）', () => {
    currentPath = '/admin/dispatches/abc'
    render(<AdminMenu />)

    const dispatchesLink = screen.getByText('案件管理').closest('a')!
    expect(dispatchesLink).toHaveAttribute('aria-current', 'page')
  })

  it('現在のパスが / のときホーム項目のみアクティブ（前方一致で他項目をアクティブにしない）', () => {
    currentPath = '/'
    render(<AdminMenu />)

    const homeLink = screen.getByText('ホーム').closest('a')!
    expect(homeLink).toHaveAttribute('aria-current', 'page')

    // / は全パスの前方一致になるが、ホーム以外のリンクはアクティブにならない
    const dashboardLink = screen.getByText('ダッシュボード').closest('a')!
    expect(dashboardLink).not.toHaveAttribute('aria-current')
  })

  it('ログアウトボタン押下で signOut({ callbackUrl: "/login" }) が呼ばれる', () => {
    render(<AdminMenu />)

    fireEvent.click(screen.getByText('ログアウト'))

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/login' })
  })

  it('項目クリックで onItemClick が呼ばれる', () => {
    const onItemClick = vi.fn()
    render(<AdminMenu onItemClick={onItemClick} />)

    fireEvent.click(screen.getByText('ダッシュボード'))
    expect(onItemClick).toHaveBeenCalledTimes(1)
  })

  it('ログアウト押下でも onItemClick が呼ばれる', () => {
    const onItemClick = vi.fn()
    render(<AdminMenu onItemClick={onItemClick} />)

    fireEvent.click(screen.getByText('ログアウト'))
    expect(onItemClick).toHaveBeenCalledTimes(1)
  })
})
