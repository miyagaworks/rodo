'use client'

import { useState } from 'react'
import { Session } from 'next-auth'
import AdminShell from '@/components/admin/AdminShell'
import AppHeader from '@/components/common/AppHeader'

interface AdminLayoutShellProps {
  children: React.ReactNode
  session: Session
}

/**
 * /admin/* 配下のレイアウト
 * - PC (md 以上): 左サイドバー常時表示 + 右に main
 * - SP: ☰ ボタン付きヘッダー + ドロワー
 *
 * AdminShell の open/onClose 状態を保持するクライアントコンポーネント。
 * サーバーコンポーネントの app/admin/layout.tsx から呼び出される。
 */
export default function AdminLayoutShell({
  children,
  session,
}: AdminLayoutShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#C6D8FF' }}>
      {/* サイドバー / ドロワー */}
      <AdminShell
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isAdminPage
      />

      {/* メイン領域 */}
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader
          session={session}
          showMenuButton={true}
          onMenuClick={() => setDrawerOpen(true)}
          hasSidebar={true}
        />
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}
