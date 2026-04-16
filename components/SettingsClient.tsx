'use client'

import * as Tabs from '@radix-ui/react-tabs'
import AssistanceTab from '@/components/settings/AssistanceTab'
import MembersTab from '@/components/settings/MembersTab'

export default function SettingsClient() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#C6D8FF' }}>
      {/* ヘッダー */}
      <header className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#1C2948' }}>
        <a href="/" className="text-white">← 戻る</a>
        <h1 className="text-white font-bold text-lg">設定</h1>
      </header>

      <Tabs.Root defaultValue="assistances" className="flex flex-col">
        <Tabs.List className="flex" style={{ backgroundColor: '#374151' }}>
          <Tabs.Trigger
            value="assistances"
            className="flex-1 py-3 text-sm font-medium text-gray-300 data-[state=active]:text-white data-[state=active]:bg-gray-600 transition-colors"
          >
            アシスタンス
          </Tabs.Trigger>
          <Tabs.Trigger
            value="members"
            className="flex-1 py-3 text-sm font-medium text-gray-300 data-[state=active]:text-white data-[state=active]:bg-gray-600 transition-colors"
          >
            隊員登録
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="assistances" className="p-4">
          <AssistanceTab />
        </Tabs.Content>

        <Tabs.Content value="members" className="p-4">
          <MembersTab />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
