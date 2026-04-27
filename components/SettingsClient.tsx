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

export default function SettingsClient({ session }: SettingsClientProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#C6D8FF' }}>
      <AppHeader
        session={session}
        showMenuButton={true}
        onMenuClick={() => setDrawerOpen(true)}
        hasSidebar={false}
      />
      <AdminShell
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isAdminPage={false}
      />

      {/* サブタイトル */}
      <div className="max-w-md mx-auto w-full px-4 pt-3 pb-2">
        <h1 className="text-lg font-bold" style={{ color: '#1C2948' }}>設定</h1>
      </div>

      <div className="max-w-md mx-auto w-full">
        <Tabs.Root defaultValue="assistances" className="flex flex-col">
          <Tabs.List className="flex" style={{ backgroundColor: '#374151' }}>
            <Tabs.Trigger
              value="assistances"
              className="flex-auto py-3 text-sm font-medium text-gray-300 data-[state=active]:text-white data-[state=active]:bg-gray-600 transition-colors"
            >
              アシスタンス
            </Tabs.Trigger>
            <div className="w-px self-stretch my-2.5 bg-gray-500" />
            <Tabs.Trigger
              value="members"
              className="flex-auto py-3 text-sm font-medium text-gray-300 data-[state=active]:text-white data-[state=active]:bg-gray-600 transition-colors"
            >
              隊員登録
            </Tabs.Trigger>
            <div className="w-px self-stretch my-2.5 bg-gray-500" />
            <Tabs.Trigger
              value="vehicles"
              className="flex-auto py-3 text-sm font-medium text-gray-300 data-[state=active]:text-white data-[state=active]:bg-gray-600 transition-colors"
            >
              車両管理
            </Tabs.Trigger>
            <div className="w-px self-stretch my-2.5 bg-gray-500" />
            <Tabs.Trigger
              value="tenant"
              className="flex-auto py-3 text-sm font-medium text-gray-300 data-[state=active]:text-white data-[state=active]:bg-gray-600 transition-colors"
            >
              テナント設定
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="assistances" className="p-4 pb-24">
            <AssistanceTab />
          </Tabs.Content>

          <Tabs.Content value="members" className="p-4 pb-24">
            <MembersTab />
          </Tabs.Content>

          <Tabs.Content value="vehicles" className="p-4 pb-24">
            <VehiclesTab />
          </Tabs.Content>

          <Tabs.Content value="tenant" className="p-4 pb-24">
            <TenantTab />
          </Tabs.Content>
        </Tabs.Root>
      </div>

      <AppFooter />
    </div>
  )
}
