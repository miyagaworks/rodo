'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * 案件管理テーブルのフィルタバー (Phase 4-A)。
 *
 * - 期間: from / to の date input (YYYY-MM-DD)
 * - ステータス: all / draft / active / completed / unbilled / billed / stored
 * - 隊員: テナント内 User リスト (role=MEMBER 限定にはせず、API が返す順序のまま)
 * - AS: テナント内 Assistance リスト
 * - リセット: 全フィルタクリア
 *
 * 値は親コンポーネント側で useState 管理し、useAdminDispatches に渡す。
 * URL クエリ同期は Phase 4-A では行わない。
 */

export type DispatchTableStatus =
  | 'all'
  | 'draft'
  | 'active'
  | 'completed'
  | 'unbilled'
  | 'billed'
  | 'stored'

export interface DispatchTableFiltersValue {
  from: string
  to: string
  status: DispatchTableStatus
  userId: string
  assistanceId: string
}

export const EMPTY_FILTERS: DispatchTableFiltersValue = {
  from: '',
  to: '',
  status: 'all',
  userId: '',
  assistanceId: '',
}

interface UserListItem {
  id: string
  name: string
}

interface AssistanceListItem {
  id: string
  name: string
  displayAbbreviation: string
}

interface DispatchTableFiltersProps {
  value: DispatchTableFiltersValue
  onChange: (next: DispatchTableFiltersValue) => void
}

const STATUS_OPTIONS: { value: DispatchTableStatus; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'draft', label: '下書き' },
  { value: 'active', label: '進行中' },
  { value: 'completed', label: '完了' },
  { value: 'unbilled', label: '未請求' },
  { value: 'billed', label: '請求済' },
  { value: 'stored', label: '保管中' },
]

export default function DispatchTableFilters({
  value,
  onChange,
}: DispatchTableFiltersProps) {
  const usersQuery = useQuery<UserListItem[]>({
    queryKey: ['admin', 'users-list'],
    queryFn: async () => {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error('users fetch failed')
      const data = await res.json()
      return Array.isArray(data)
        ? data.map((u: { id: string; name: string }) => ({
            id: u.id,
            name: u.name,
          }))
        : []
    },
    staleTime: 5 * 60 * 1000,
  })

  const assistancesQuery = useQuery<AssistanceListItem[]>({
    queryKey: ['admin', 'assistances-list'],
    queryFn: async () => {
      const res = await fetch('/api/assistances')
      if (!res.ok) throw new Error('assistances fetch failed')
      const data = await res.json()
      return Array.isArray(data)
        ? data.map(
            (a: {
              id: string
              name: string
              displayAbbreviation: string
            }) => ({
              id: a.id,
              name: a.name,
              displayAbbreviation: a.displayAbbreviation,
            }),
          )
        : []
    },
    staleTime: 5 * 60 * 1000,
  })

  const update = <K extends keyof DispatchTableFiltersValue>(
    key: K,
    next: DispatchTableFiltersValue[K],
  ) => {
    onChange({ ...value, [key]: next })
  }

  const handleReset = () => {
    onChange(EMPTY_FILTERS)
  }

  return (
    <div
      className="bg-white rounded-xl shadow-sm p-3 sm:p-4"
      data-testid="dispatch-table-filters"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
        {/* 期間 from */}
        <label className="flex flex-col text-xs text-gray-600">
          <span className="mb-1">開始日</span>
          <input
            type="date"
            value={value.from}
            onChange={(e) => update('from', e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            data-testid="filter-from"
          />
        </label>

        {/* 期間 to */}
        <label className="flex flex-col text-xs text-gray-600">
          <span className="mb-1">終了日</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => update('to', e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            data-testid="filter-to"
          />
        </label>

        {/* ステータス */}
        <label className="flex flex-col text-xs text-gray-600">
          <span className="mb-1">ステータス</span>
          <select
            value={value.status}
            onChange={(e) =>
              update('status', e.target.value as DispatchTableStatus)
            }
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            data-testid="filter-status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* 隊員 */}
        <label className="flex flex-col text-xs text-gray-600">
          <span className="mb-1">隊員</span>
          <select
            value={value.userId}
            onChange={(e) => update('userId', e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            data-testid="filter-user"
          >
            <option value="">すべて</option>
            {usersQuery.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        {/* AS */}
        <label className="flex flex-col text-xs text-gray-600">
          <span className="mb-1">AS</span>
          <select
            value={value.assistanceId}
            onChange={(e) => update('assistanceId', e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            data-testid="filter-assistance"
          >
            <option value="">すべて</option>
            {assistancesQuery.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayAbbreviation}（{a.name}）
              </option>
            ))}
          </select>
        </label>

        {/* リセット */}
        <div className="flex justify-start lg:justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            data-testid="filter-reset"
          >
            リセット
          </button>
        </div>
      </div>
    </div>
  )
}
