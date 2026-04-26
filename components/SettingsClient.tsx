'use client'

import { IoIosArrowBack } from 'react-icons/io'
import * as Tabs from '@radix-ui/react-tabs'
import AssistanceTab from '@/components/settings/AssistanceTab'
import MembersTab from '@/components/settings/MembersTab'
import VehiclesTab from '@/components/settings/VehiclesTab'
import TenantTab from '@/components/settings/TenantTab'

export default function SettingsClient() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#C6D8FF' }}>
      {/* ヘッダー */}
      <header className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#1C2948' }}>
        <a href="/" className="text-white p-1 -ml-1 active:opacity-60"><IoIosArrowBack className="w-6 h-6" /></a>
        <h1 className="text-white font-bold text-lg">設定</h1>
      </header>

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
  )
}
