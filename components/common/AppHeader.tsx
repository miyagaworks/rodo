'use client'

import { Session } from 'next-auth'
import { signOut } from 'next-auth/react'
import { HiOutlineLogout } from 'react-icons/hi'
import { IoMenu } from 'react-icons/io5'

interface AppHeaderProps {
  session: Session
  /** ☰ ボタンを表示するか（管理者ナビゲーション用）。デフォルト false */
  showMenuButton?: boolean
  /** ☰ クリック時のコールバック */
  onMenuClick?: () => void
  /**
   * PC で並列にサイドバーを持つページか
   * - true: PC では ☰ を非表示（md:hidden）
   * - false: PC でも ☰ を表示
   * デフォルト false
   */
  hasSidebar?: boolean
}

/**
 * 全管理者ページ共通のヘッダー
 * - 背景色は画面幅いっぱいの帯（#1C2948）
 * - 内側コンテンツは max-w-md で中央寄せ（PC でもスマホ相当の幅に揃える）
 */
export default function AppHeader({
  session,
  showMenuButton = false,
  onMenuClick,
  hasSidebar = false,
}: AppHeaderProps) {
  return (
    <header className="px-4 py-3" style={{ backgroundColor: '#1C2948' }}>
      <div className="max-w-md mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showMenuButton && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="メニューを開く"
              className={`text-white p-1 -ml-1 active:opacity-60 ${
                hasSidebar ? 'md:hidden' : ''
              }`}
            >
              <IoMenu className="w-6 h-6" />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rodo-logo.svg" alt="RODO" className="h-6" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white text-sm">{session.user.name}</span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            aria-label="ログアウト"
            title="ログアウト"
            className="text-white opacity-70 hover:opacity-100 transition-opacity"
          >
            <HiOutlineLogout className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
