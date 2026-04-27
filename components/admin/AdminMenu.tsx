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
  /** メニュー項目クリック時のコールバック（ドロワーを閉じるため） */
  onItemClick?: () => void
}

/**
 * 管理者用メニュー項目（共通）
 * - スライドドロワー / PC サイドバー の両方から利用される
 * - 現在のパスと一致する項目はハイライト
 */
export default function AdminMenu({ onItemClick }: AdminMenuProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="管理メニュー" className="flex flex-col h-full">
      <ul className="flex-1 flex flex-col">
        {MENU_ITEMS.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(item.href + '/')
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
