'use client'

import { useMemo, useState } from 'react'
import { useAdminDispatches, type DispatchItem } from '@/hooks/useAdminDispatches'
import {
  sortByScheduledSecondary,
  categorize,
  type ScheduledCategory,
} from '@/lib/admin/scheduled-secondary-sort'
import ScheduledSecondaryEditor from './ScheduledSecondaryEditor'

/**
 * 保管中車両リスト（status=STORED の Dispatch）。
 *
 * Phase 3.5 ダッシュボード 3 つ目のセクション:
 *   ▼ 保管中の車両
 *   出動番号 / 車番 / 搬送予定 / [編集]
 *
 * - ソート: 今日 → 明日 → それ以降 → 未定 → 過去（防御的）
 * - 「未定」行: 淡い赤バッジで強調
 * - 「過去」行: 淡いオレンジで「予定超過」表示
 * - 行右の [編集] で ScheduledSecondaryEditor を行内展開
 * - 0 件時: 「保管中の車両はありません」
 *
 * 「今日」の業務日は呼出側で getBusinessDayDate を使い算出して props で受ける。
 */

interface StoredVehicleListProps {
  /** 「今日」の業務日 YYYY-MM-DD。dashboard/page.tsx から渡す。 */
  today: string
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** ISO 文字列を JST で "M/D(曜) HH:mm" にフォーマット。 */
function formatScheduled(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  const m = jst.getUTCMonth() + 1
  const day = jst.getUTCDate()
  const wd = WEEKDAYS[jst.getUTCDay()]
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${m}/${day}(${wd}) ${hh}:${mm}`
}

function plateLabel(d: DispatchItem): string {
  if (!d.plate) return '-'
  return `${d.plate.region}${d.plate.class}${d.plate.kana}${d.plate.number}`
}

function categoryStyle(category: ScheduledCategory): {
  rowClass: string
  badge?: { text: string; className: string }
} {
  switch (category) {
    case 'today':
      return {
        rowClass: '',
        badge: {
          text: '今日',
          className: 'bg-blue-50 text-blue-700 border-blue-200',
        },
      }
    case 'tomorrow':
      return {
        rowClass: '',
        badge: {
          text: '明日',
          className: 'bg-sky-50 text-sky-700 border-sky-200',
        },
      }
    case 'undecided':
      return {
        rowClass: 'bg-red-50/40',
        badge: {
          text: '未定',
          className: 'bg-red-50 text-red-700 border-red-200',
        },
      }
    case 'past':
      return {
        rowClass: 'bg-orange-50/40',
        badge: {
          text: '予定超過',
          className: 'bg-orange-50 text-orange-700 border-orange-200',
        },
      }
    case 'future':
    default:
      return { rowClass: '' }
  }
}

export default function StoredVehicleList({ today }: StoredVehicleListProps) {
  const { data, isLoading, isError } = useAdminDispatches(
    { status: 'stored', pageSize: 200 },
    { refetchInterval: 30_000 },
  )

  const [editingId, setEditingId] = useState<string | null>(null)

  const sorted = useMemo<DispatchItem[]>(() => {
    if (!data?.dispatches) return []
    return sortByScheduledSecondary(data.dispatches, today)
  }, [data?.dispatches, today])

  return (
    <section data-testid="stored-vehicle-list">
      <h2 className="text-base font-bold mb-3" style={{ color: '#1C2948' }}>
        保管中の車両
      </h2>

      {isLoading && (
        <div className="text-sm text-gray-500 py-4">読み込み中...</div>
      )}

      {isError && <div className="text-sm text-red-600 py-4">取得失敗</div>}

      {data && sorted.length === 0 && (
        <div
          className="text-sm text-gray-400 py-8 text-center bg-white rounded-xl shadow-sm"
          data-testid="stored-empty"
        >
          保管中の車両はありません
        </div>
      )}

      {data && sorted.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* ヘッダ行 (PC のみ表示) */}
          <div className="hidden sm:grid grid-cols-[140px_1fr_180px_80px] gap-3 px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
            <span>出動番号</span>
            <span>車番</span>
            <span>搬送予定</span>
            <span className="text-right">操作</span>
          </div>

          <ul className="divide-y divide-gray-100">
            {sorted.map((d) => {
              const category = categorize(d.scheduledSecondaryAt, today)
              const { rowClass, badge } = categoryStyle(category)
              const isEditing = editingId === d.id

              return (
                <li key={d.dispatchNumber} className={rowClass}>
                  <div
                    className="grid grid-cols-[1fr_auto] sm:grid-cols-[140px_1fr_180px_80px] gap-2 sm:gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
                    data-testid="stored-vehicle-row"
                  >
                    {/* 出動番号 */}
                    <span
                      className="font-mono text-xs text-gray-700 sm:text-sm"
                      data-testid="dispatch-number"
                    >
                      #{d.dispatchNumber}
                    </span>

                    {/* 車番 */}
                    <span
                      className="text-xs sm:text-sm sm:font-medium order-3 sm:order-none col-span-2 sm:col-span-1"
                      style={{ color: '#1C2948' }}
                      data-testid="plate"
                    >
                      {plateLabel(d)}
                    </span>

                    {/* 搬送予定 */}
                    <span
                      className="flex items-center gap-2 text-xs sm:text-sm order-4 sm:order-none col-span-2 sm:col-span-1"
                      data-testid="scheduled"
                    >
                      {badge && (
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
                          data-testid="scheduled-badge"
                        >
                          {badge.text}
                        </span>
                      )}
                      <span className="text-gray-700">
                        {d.scheduledSecondaryAt
                          ? formatScheduled(d.scheduledSecondaryAt)
                          : '—'}
                      </span>
                    </span>

                    {/* 操作 */}
                    <div className="flex justify-end order-2 sm:order-none">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingId(isEditing ? null : d.id)
                        }
                        className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100"
                        data-testid="edit-button"
                      >
                        {isEditing ? '閉じる' : '編集'}
                      </button>
                    </div>
                  </div>
                  {isEditing && (
                    <ScheduledSecondaryEditor
                      dispatchId={d.id}
                      initialValue={d.scheduledSecondaryAt}
                      onClose={() => setEditingId(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
