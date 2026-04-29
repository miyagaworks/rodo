'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { HiOutlineLogout } from 'react-icons/hi'

interface MenuItem {
  label: string
  href: string
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'ホーム', href: '/' },
  { label: 'ダッシュボード', href: '/admin/dashboard' },
  { label: '案件管理', href: '/admin/dispatches' },
  { label: '設定', href: '/settings' },
]

interface AdminMenuProps {
  /** メニュー方向。horizontal は PC AppHeader 内 nav、vertical は SP ドロワー */
  orientation?: 'horizontal' | 'vertical'
  /** メニュー項目クリック時のコールバック（ドロワーを閉じるため） */
  onItemClick?: () => void
  /** vertical 時に最下部に表示する管理者名（任意） */
  adminName?: string | null
}

/**
 * 管理者用メニュー（共通）
 * - orientation="horizontal": PC AppHeader 内に水平配置（リンクのみ、active は金色下線）
 * - orientation="vertical": SP ドロワー内に縦配置（リンク + 区切り線 + 管理者名 + ログアウト）
 * - 現在のパスと一致する項目はハイライト
 */
export default function AdminMenu({
  orientation = 'vertical',
  onItemClick,
  adminName,
}: AdminMenuProps) {
  const pathname = usePathname()

  const isItemActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(href + '/')

  if (orientation === 'horizontal') {
    return (
      <nav aria-label="管理メニュー" className="flex items-center">
        <ul className="flex items-center gap-1 sm:gap-2">
          {MENU_ITEMS.map((item) => {
            const isActive = isItemActive(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onItemClick}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {item.label}
                  {/* active 下線（金色 #C9A961） */}
                  <span
                    aria-hidden="true"
                    className={`absolute left-3 right-3 -bottom-0.5 h-0.5 rounded transition-opacity duration-200 ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{ backgroundColor: '#C9A961' }}
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    )
  }

  // vertical（SP ドロワー）
  return (
    <nav aria-label="管理メニュー" className="flex flex-col h-full">
      <ul className="flex-1 flex flex-col">
        {MENU_ITEMS.map((item) => {
          const isActive = isItemActive(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onItemClick}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center min-h-[48px] px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-white'
                    : 'text-gray-300 hover:bg-white/5 active:bg-white/10'
                }`}
                style={
                  isActive
                    ? { backgroundColor: '#C6D8FF', color: '#1C2948' }
                    : undefined
                }
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* 区切り */}
      <div className="border-t border-white/20" />

      {/* 管理者名（vertical 時のみ。adminName が与えられた場合に表示） */}
      {adminName && (
        <div className="px-4 py-3 text-sm text-white/90">{adminName}</div>
      )}

      {/* ログアウト */}
      <button
        type="button"
        onClick={() => {
          onItemClick?.()
          signOut({ callbackUrl: '/login' })
        }}
        className="flex items-center gap-2 min-h-[48px] px-4 py-3 text-sm font-medium text-gray-300 hover:bg-white/5 active:bg-white/10 transition-colors"
      >
        <HiOutlineLogout className="w-5 h-5" />
        <span>ログアウト</span>
      </button>
    </nav>
  )
}
