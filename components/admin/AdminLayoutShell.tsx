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
 * /admin/* 配下のレイアウト（Phase 2.5）
 * - PC（md 以上）: AppHeader 内に水平 nav を統合し、main を縦積み
 * - SP（md 未満）: AppHeader（ロゴ + ☰）+ 右からスライドインの AdminShell
 *
 * AdminShell は md:hidden（SP 専用）。PC では AppHeader showAdminNav={true} の水平 nav が代替。
 */
export default function AdminLayoutShell({
  children,
  session,
}: AdminLayoutShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  // role 検証は app/admin/layout.tsx 側で完了済み。ここでは念のため二重防御
  const isAdmin = session.user.role === 'ADMIN'

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#C6D8FF' }}>
      <AppHeader
        session={session}
        showAdminNav={isAdmin}
        onMenuClick={() => setDrawerOpen(true)}
      />

      {/* SP 専用ドロワー（md:hidden） */}
      {isAdmin && (
        <AdminShell
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          adminName={session.user.name}
        />
      )}

      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
