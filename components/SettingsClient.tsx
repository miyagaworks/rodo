'use client'

import { useState } from 'react'
import { Session } from 'next-auth'
import * as Tabs from '@radix-ui/react-tabs'
import AppHeader from '@/components/common/AppHeader'
import AdminShell from '@/components/admin/AdminShell'
import AssistanceTab from '@/components/settings/AssistanceTab'
import MembersTab from '@/components/settings/MembersTab'
import VehiclesTab from '@/components/settings/VehiclesTab'
import TenantTab from '@/components/settings/TenantTab'
import AppFooter from '@/components/common/AppFooter'

interface SettingsClientProps {
  session: Session
}

/**
 * SP / PC 共通のタブトリガースタイル
 * SP（〜767px）: 横タブバー（#374151 背景、均等幅）
 * PC（768px〜）: 左サイドナビ（縦並び、active に左ボーダー + 白背景）
 */
const triggerClass = [
  // ── SP（デフォルト）: 横タブバー ──
  'flex-auto py-3 text-sm font-medium text-gray-300 text-center',
  'data-[state=active]:text-white data-[state=active]:bg-gray-600',
  'transition-colors',
  // ── PC（md:）: 左サイドナビ ──
  'md:flex-none md:px-4 md:text-left md:rounded-lg md:w-full md:text-gray-600',
  'md:data-[state=active]:text-[#1C2948] md:data-[state=active]:bg-white',
  'md:data-[state=active]:font-semibold md:data-[state=active]:border-l-4',
  'md:data-[state=active]:border-[#1C2948] md:data-[state=active]:shadow-sm',
  'md:data-[state=inactive]:hover:bg-white/40',
].join(' ')

export default function SettingsClient({ session }: SettingsClientProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isAdmin = session.user.role === 'ADMIN'

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#C6D8FF' }}>
      <AppHeader
        session={session}
        showAdminNav={isAdmin}
        onMenuClick={() => setDrawerOpen(true)}
      />
      {isAdmin && (
        <AdminShell
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          adminName={session.user.name}
        />
      )}

      {/* サブタイトル */}
      <div className="max-w-2xl md:max-w-6xl mx-auto w-full px-4 pt-3 pb-2">
        <h1 className="text-lg font-bold" style={{ color: '#1C2948' }}>設定</h1>
      </div>

      <Tabs.Root defaultValue="assistances" className="flex-1">
        <div className="max-w-2xl md:max-w-6xl mx-auto w-full md:flex md:gap-6 md:px-4">
          {/* Tab List: SP = 横バー / PC = 縦サイドナビ */}
          <Tabs.List className="flex md:flex-col md:w-60 md:shrink-0 md:gap-1 bg-[#374151] md:bg-transparent">
            <Tabs.Trigger value="assistances" className={triggerClass}>
              アシスタンス
            </Tabs.Trigger>
            <div className="w-px self-stretch my-2.5 bg-gray-500 md:hidden" />
            <Tabs.Trigger value="members" className={triggerClass}>
              隊員登録
            </Tabs.Trigger>
            <div className="w-px self-stretch my-2.5 bg-gray-500 md:hidden" />
            <Tabs.Trigger value="vehicles" className={triggerClass}>
              車両管理
            </Tabs.Trigger>
            <div className="w-px self-stretch my-2.5 bg-gray-500 md:hidden" />
            <Tabs.Trigger value="tenant" className={triggerClass}>
              テナント設定
            </Tabs.Trigger>
          </Tabs.List>

          {/* Content: SP = padding あり / PC = 白カード内 */}
          <div className="md:flex-1 md:bg-white md:rounded-xl md:shadow-sm md:p-6 lg:p-8">
            <Tabs.Content value="assistances" className="p-4 pb-24 md:p-0">
              <AssistanceTab />
            </Tabs.Content>

            <Tabs.Content value="members" className="p-4 pb-24 md:p-0">
              <MembersTab />
            </Tabs.Content>

            <Tabs.Content value="vehicles" className="p-4 pb-24 md:p-0">
              <VehiclesTab />
            </Tabs.Content>

            <Tabs.Content value="tenant" className="p-4 pb-24 md:p-0">
              <TenantTab />
            </Tabs.Content>
          </div>
        </div>
      </Tabs.Root>

      <AppFooter />
    </div>
  )
}
