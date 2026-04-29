'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import DispatchTableFilters, {
  EMPTY_FILTERS,
  type DispatchTableFiltersValue,
} from '@/components/admin/DispatchTableFilters'
import DispatchTable from '@/components/admin/DispatchTable'
import DispatchCalendar from '@/components/admin/DispatchCalendar'
import { getBusinessDayDate } from '@/lib/admin/business-day'
import type { DispatchesFilter } from '@/hooks/useAdminDispatches'

/**
 * 案件管理 (/admin/dispatches)
 *
 * Phase 4-A: テーブル + フィルタ
 *   - [テーブル][カレンダー] のタブ切替（カレンダーは Phase 4-B 用 placeholder）
 *   - 上部にフィルタバー、下部に DispatchTable
 *   - URL 同期は行わない（タブ・フィルタとも useState のみ）
 *
 * Phase 4-B 以降: カレンダータブの実装、案件編集画面の実装
 */

interface TenantSettings {
  id: string
  businessDayStartMinutes: number
}

type TabKey = 'table' | 'calendar'

export default function AdminDispatchesPage() {
  const [tab, setTab] = useState<TabKey>('table')
  const [filters, setFilters] = useState<DispatchTableFiltersValue>(EMPTY_FILTERS)

  // 業務日の「今日」を 1 分ごとに再評価（持ち越し判定用）
  const { data: tenantSettings } = useQuery<TenantSettings>({
    queryKey: ['tenant', 'settings'],
    queryFn: async () => {
      const res = await fetch('/api/tenant/settings')
      if (!res.ok) throw new Error('tenant settings fetch failed')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
  const startMinutes = tenantSettings?.businessDayStartMinutes ?? 0

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const today = useMemo(
    () => getBusinessDayDate(now, startMinutes),
    [now, startMinutes],
  )

  const tableFilter = useMemo<Omit<DispatchesFilter, 'page' | 'pageSize'>>(
    () => ({
      from: filters.from || undefined,
      to: filters.to || undefined,
      status: filters.status === 'all' ? undefined : filters.status,
      userId: filters.userId || undefined,
      assistanceId: filters.assistanceId || undefined,
    }),
    [filters],
  )

  // カレンダーモーダル「テーブルで詳細を見る」リンクのハンドラ。
  // 該当日 (YYYY-MM-DD) を from / to に同時にセットし、テーブルタブへ切替。
  const handleJumpToTable = (dateYmd: string) => {
    setFilters((prev) => ({ ...prev, from: dateYmd, to: dateYmd }))
    setTab('table')
  }

  return (
    <div className="max-w-6xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-3" style={{ color: '#1C2948' }}>
        案件管理
      </h1>

      {/* タブ切替（active 下線は金色 #C9A961、inactive はグレー）*/}
      <div
        className="flex gap-2 border-b border-gray-200 mb-3"
        role="tablist"
        aria-label="案件管理ビュー切替"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'table'}
          onClick={() => setTab('table')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'table'
              ? 'text-[#1C2948]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          style={
            tab === 'table'
              ? { borderBottomColor: '#C9A961' }
              : undefined
          }
          data-testid="tab-table"
        >
          テーブル
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'calendar'}
          onClick={() => setTab('calendar')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'calendar'
              ? 'text-[#1C2948]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          style={
            tab === 'calendar'
              ? { borderBottomColor: '#C9A961' }
              : undefined
          }
          data-testid="tab-calendar"
        >
          カレンダー
        </button>
      </div>

      {tab === 'table' ? (
        <div className="space-y-3" role="tabpanel">
          <DispatchTableFilters value={filters} onChange={setFilters} />
          <DispatchTable filter={tableFilter} today={today} />
        </div>
      ) : (
        <div role="tabpanel">
          <DispatchCalendar onJumpToTable={handleJumpToTable} />
        </div>
      )}
    </div>
  )
}
