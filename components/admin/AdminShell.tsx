'use client'

import { useEffect } from 'react'
import { IoClose } from 'react-icons/io5'
import AdminMenu from '@/components/admin/AdminMenu'

interface AdminShellProps {
  /** ドロワー表示状態 */
  open: boolean
  /** ドロワーを閉じるコールバック */
  onClose: () => void
  /** ドロワー最下部に表示する管理者名（任意） */
  adminName?: string | null
}

/**
 * 管理者用ドロワー（SP 専用）
 * - md 以上では DOM 自体を出さない（md:hidden）。PC は AppHeader の水平 nav を利用する
 * - **右からスライドイン**（right-0 起点 + transform translate-x-full → translate-x-0）
 * - 中身は AdminMenu orientation="vertical"
 */
export default function AdminShell({
  open,
  onClose,
  adminName,
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
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  return (
    <div className="md:hidden">
      {/* オーバーレイ */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ドロワー本体（右からスライドイン） */}
      <aside
        aria-label="管理者ナビゲーション"
        className={`fixed top-0 right-0 z-50 h-full w-72 transform transition-transform duration-300 flex flex-col overscroll-contain ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
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
            className="text-white p-1 -mr-1 active:opacity-60"
          >
            <IoClose className="w-6 h-6" />
          </button>
        </div>

        {/* メニュー本体 */}
        <div className="flex-1 overflow-y-auto">
          <AdminMenu
            orientation="vertical"
            onItemClick={onClose}
            adminName={adminName}
          />
        </div>
      </aside>
    </div>
  )
}
