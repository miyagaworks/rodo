'use client'

import { useEffect } from 'react'
import { IoClose } from 'react-icons/io5'
import AdminMenu from '@/components/admin/AdminMenu'

interface AdminShellProps {
  /** ドロワー表示状態（SP / PC + isAdminPage=false で参照） */
  open: boolean
  /** ドロワー閉じる際のコールバック */
  onClose: () => void
  /**
   * /admin/* 配下かどうか
   * - true: PC では常時サイドバー、SP ではドロワー
   * - false: PC / SP どちらもドロワー（HomeClient から開く用途）
   */
  isAdminPage: boolean
}

/**
 * 管理者用シェル（ナビゲーション）
 * - SP: スライドドロワー（左から）+ オーバーレイ
 * - PC + isAdminPage=true: 常時サイドバー
 * - PC + isAdminPage=false: SP と同じドロワー挙動
 */
export default function AdminShell({
  open,
  onClose,
  isAdminPage,
}: AdminShellProps) {
  // ESC キーで閉じる
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // ドロワー表示中は body スクロール抑制
  // PC + isAdminPage=true（常時サイドバー）の場合は抑制不要
  useEffect(() => {
    if (isAdminPage) {
      // PC で常時表示の場合は SP ドロワー（open=true）のときだけ抑制
      // ただしレスポンシブ判定は CSS 側で行うため、open のみで判定
      if (!open) return
    } else {
      if (!open) return
    }
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open, isAdminPage])

  return (
    <>
      {/* オーバーレイ（SP は常に、PC は isAdminPage=false のときのみドロワー時に表示） */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${isAdminPage ? 'md:hidden' : ''}`}
      />

      {/* ドロワー / サイドバー */}
      <aside
        aria-label="管理者ナビゲーション"
        className={`fixed top-0 left-0 z-50 h-full w-60 transform transition-transform duration-300 flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${isAdminPage ? 'md:translate-x-0 md:static md:z-auto' : ''}`}
        style={{ backgroundColor: '#1C2948' }}
      >
        {/* ヘッダー（ロゴ + 閉じるボタン） */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ backgroundColor: '#1C2948' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rodo-logo.svg" alt="RODO" className="h-6" />
          <button
            type="button"
            onClick={onClose}
            aria-label="メニューを閉じる"
            className={`text-white p-1 -mr-1 active:opacity-60 ${
              isAdminPage ? 'md:hidden' : ''
            }`}
          >
            <IoClose className="w-6 h-6" />
          </button>
        </div>

        {/* メニュー本体 */}
        <div className="flex-1 overflow-y-auto">
          <AdminMenu onItemClick={onClose} />
        </div>
      </aside>
    </>
  )
}
