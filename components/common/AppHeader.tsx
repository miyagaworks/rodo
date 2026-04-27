'use client'

import { Session } from 'next-auth'
import { signOut } from 'next-auth/react'
import { HiOutlineLogout } from 'react-icons/hi'
import { IoMenu } from 'react-icons/io5'
import AdminMenu from '@/components/admin/AdminMenu'

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
  /**
   * 管理者ナビゲーションを統合表示するか（Phase 2.5）
   * - true: PC では水平 nav + 名前 + ログアウト、SP では左ロゴ + 右 ☰ のみ
   * - false: 既存動作維持（showMenuButton / hasSidebar に従う）
   * デフォルト false。`AdminLayoutShell` 側で role 検証後に true を渡す
   */
  showAdminNav?: boolean
}

/**
 * 全ページ共通のヘッダー
 * - 背景色は画面幅いっぱいの帯（#1C2948）
 * - showAdminNav=false（デフォルト）: 内側コンテンツは max-w-md（隊員 / 設定画面用）
 * - showAdminNav=true: 内側コンテンツは max-w-7xl（PC で水平 nav を広く配置）
 */
export default function AppHeader({
  session,
  showMenuButton = false,
  onMenuClick,
  hasSidebar = false,
  showAdminNav = false,
}: AppHeaderProps) {
  if (showAdminNav) {
    return (
      <header className="px-4 py-3" style={{ backgroundColor: '#1C2948' }}>
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          {/* 左: ロゴ + (PC では nav が続く) */}
          <div className="flex items-center gap-6 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rodo-logo.svg" alt="RODO" className="h-6 flex-shrink-0" />
            {/* PC のみ水平 nav を表示 */}
            <div className="hidden md:flex items-center">
              <AdminMenu orientation="horizontal" />
            </div>
          </div>

          {/* 右: PC では 名前 + ログアウト、SP ではハンバーガー */}
          <div className="flex items-center gap-3">
            {/* PC のみ表示 */}
            <div className="hidden md:flex items-center gap-3">
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
            {/* SP のみ表示: ハンバーガー（右配置） */}
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="メニューを開く"
              className="md:hidden text-white p-1 -mr-1 active:opacity-60"
            >
              <IoMenu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>
    )
  }

  // 既存動作（showAdminNav=false）
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
