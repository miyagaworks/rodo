/**
 * AdminMenu コンポーネントのテスト
 *
 * 共通:
 * - 全メニュー項目（ホーム / ダッシュボード / 案件管理 / 設定）が表示される
 * - リンクは正しい href を持つ
 * - 現在のパスと一致する項目に aria-current="page" が付与される
 * - 項目クリックで onItemClick が呼ばれる
 *
 * orientation="vertical"（SP ドロワー）:
 * - ログアウトボタンが表示される
 * - ログアウト押下で signOut + onItemClick
 * - adminName が与えられた場合に表示される
 *
 * orientation="horizontal"（PC AppHeader 内 nav）:
 * - ログアウト / 管理者名は出力されない（AppHeader 側で管理）
 * - active 時に金色下線（#C9A961）の span が opacity-100
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

  describe('共通動作', () => {
    it('全メニュー項目（ホーム / ダッシュボード / 案件管理 / 設定）が表示される', () => {
      render(<AdminMenu orientation="vertical" />)

      expect(screen.getByText('ホーム')).toBeTruthy()
      expect(screen.getByText('ダッシュボード')).toBeTruthy()
      expect(screen.getByText('案件管理')).toBeTruthy()
      expect(screen.getByText('設定')).toBeTruthy()
    })

    it('リンクは正しい href を持つ', () => {
      render(<AdminMenu orientation="vertical" />)

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
      render(<AdminMenu orientation="vertical" />)

      const dashboardLink = screen.getByText('ダッシュボード').closest('a')!
      expect(dashboardLink).toHaveAttribute('aria-current', 'page')

      const homeLink = screen.getByText('ホーム').closest('a')!
      expect(homeLink).not.toHaveAttribute('aria-current')
    })

    it('現在のパスが /admin/dispatches/abc のとき案件管理項目に aria-current="page" が付く（前方一致）', () => {
      currentPath = '/admin/dispatches/abc'
      render(<AdminMenu orientation="vertical" />)

      const dispatchesLink = screen.getByText('案件管理').closest('a')!
      expect(dispatchesLink).toHaveAttribute('aria-current', 'page')
    })

    it('現在のパスが / のときホーム項目のみアクティブ（前方一致で他項目をアクティブにしない）', () => {
      currentPath = '/'
      render(<AdminMenu orientation="vertical" />)

      const homeLink = screen.getByText('ホーム').closest('a')!
      expect(homeLink).toHaveAttribute('aria-current', 'page')

      const dashboardLink = screen.getByText('ダッシュボード').closest('a')!
      expect(dashboardLink).not.toHaveAttribute('aria-current')
    })

    it('項目クリックで onItemClick が呼ばれる', () => {
      const onItemClick = vi.fn()
      render(<AdminMenu orientation="vertical" onItemClick={onItemClick} />)

      fireEvent.click(screen.getByText('ダッシュボード'))
      expect(onItemClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('orientation="vertical"（SP ドロワー）', () => {
    it('ログアウトボタンが表示される', () => {
      render(<AdminMenu orientation="vertical" />)
      expect(screen.getByText('ログアウト')).toBeTruthy()
    })

    it('ログアウトボタン押下で signOut({ callbackUrl: "/login" }) が呼ばれる', () => {
      render(<AdminMenu orientation="vertical" />)

      fireEvent.click(screen.getByText('ログアウト'))

      expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/login' })
    })

    it('ログアウト押下でも onItemClick が呼ばれる', () => {
      const onItemClick = vi.fn()
      render(<AdminMenu orientation="vertical" onItemClick={onItemClick} />)

      fireEvent.click(screen.getByText('ログアウト'))
      expect(onItemClick).toHaveBeenCalledTimes(1)
    })

    it('adminName が与えられた場合に表示される', () => {
      render(<AdminMenu orientation="vertical" adminName="山田太郎" />)
      expect(screen.getByText('山田太郎')).toBeTruthy()
    })

    it('adminName 未指定では表示されない', () => {
      render(<AdminMenu orientation="vertical" />)
      // 「ログアウト」だけが表示され、ユーザー名は無し
      expect(screen.queryByText('山田太郎')).toBeNull()
    })
  })

  describe('orientation="horizontal"（PC AppHeader 内 nav）', () => {
    it('ログアウトボタンは出力されない（AppHeader 側で管理）', () => {
      render(<AdminMenu orientation="horizontal" />)
      expect(screen.queryByText('ログアウト')).toBeNull()
    })

    it('管理者名は出力されない（AppHeader 側で管理）', () => {
      render(<AdminMenu orientation="horizontal" adminName="山田太郎" />)
      expect(screen.queryByText('山田太郎')).toBeNull()
    })

    it('active 項目には金色下線 span（背景 #C9A961）が opacity-100 で付く', () => {
      currentPath = '/admin/dashboard'
      const { container } = render(<AdminMenu orientation="horizontal" />)

      const dashboardLink = screen.getByText('ダッシュボード').closest('a')!
      const underline = dashboardLink.querySelector('span[aria-hidden="true"]') as HTMLElement
      expect(underline).toBeTruthy()
      expect(underline.className).toContain('opacity-100')
      expect(underline.style.backgroundColor).toBe('rgb(201, 169, 97)') // #C9A961
    })

    it('non-active 項目の下線 span は opacity-0', () => {
      currentPath = '/admin/dashboard'
      render(<AdminMenu orientation="horizontal" />)

      const homeLink = screen.getByText('ホーム').closest('a')!
      const underline = homeLink.querySelector('span[aria-hidden="true"]') as HTMLElement
      expect(underline.className).toContain('opacity-0')
    })

    it('horizontal ではメニューを ul で横並び（flex）にする', () => {
      render(<AdminMenu orientation="horizontal" />)
      const list = screen.getByLabelText('管理メニュー').querySelector('ul')!
      expect(list.className).toContain('flex')
    })
  })
})
