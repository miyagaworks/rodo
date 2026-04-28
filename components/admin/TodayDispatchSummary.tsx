'use client'

import { useMemo } from 'react'
import { useAdminDispatches } from '@/hooks/useAdminDispatches'

/**
 * 今日の案件サマリ（3 カード: 進行中 / 完了 / 未請求）。
 *
 * 集計定義（§設計判断 5）:
 * - 進行中: status が STANDBY/DISPATCHED/ONSITE/TRANSPORTING かつ today 範囲
 * - 完了: status が COMPLETED/RETURNED/STORED かつ today 範囲
 * - 未請求: billedAt が null かつ today 範囲（isDraft=false）
 *
 * today の日付文字列は親コンポーネントから受け取る
 * （businessDayStartMinutes に基づいて計算済み）。
 */

interface TodayDispatchSummaryProps {
  today: string // YYYY-MM-DD
}

const ACTIVE_STATUSES = new Set([
  'STANDBY',
  'DISPATCHED',
  'ONSITE',
  'TRANSPORTING',
])
const COMPLETED_STATUSES = new Set(['COMPLETED', 'RETURNED', 'STORED'])

export default function TodayDispatchSummary({ today }: TodayDispatchSummaryProps) {
  // 今日の全案件を取得（status=all で全件、from/to で今日に絞る）
  const { data, isLoading, isError } = useAdminDispatches(
    { from: today, to: today, status: 'all', pageSize: 200 },
    { refetchInterval: 10_000 },
  )

  const counts = useMemo(() => {
    if (!data) return { active: 0, completed: 0, unbilled: 0 }

    let active = 0
    let completed = 0
    let unbilled = 0

    for (const d of data.dispatches) {
      if (d.isDraft) continue // 下書きは集計対象外
      if (ACTIVE_STATUSES.has(d.status)) active++
      if (COMPLETED_STATUSES.has(d.status)) completed++
      if (d.billedAt === null) unbilled++
    }

    return { active, completed, unbilled }
  }, [data])

  const cards = [
    { label: '進行中', value: counts.active, color: '#3B82F6' },
    { label: '完了', value: counts.completed, color: '#22C55E' },
    { label: '未請求', value: counts.unbilled, color: '#EF4444' },
  ]

  return (
    <section>
      <h2 className="text-base font-bold mb-3" style={{ color: '#1C2948' }}>
        今日の案件サマリ
      </h2>

      {isLoading && (
        <div className="text-sm text-gray-500 py-4">読み込み中...</div>
      )}

      {isError && (
        <div className="text-sm text-red-600 py-4">取得失敗</div>
      )}

      {data && (
        <div className="grid grid-cols-3 gap-3">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl bg-white shadow-sm p-4 text-center"
              data-testid={`summary-card-${c.label}`}
            >
              <div className="text-xs text-gray-500 mb-1">{c.label}</div>
              <div
                className="text-2xl font-bold"
                style={{ color: c.color }}
              >
                {c.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.dispatches.length === 0 && (
        <div className="text-sm text-gray-400 mt-2">今日の案件はありません</div>
      )}
    </section>
  )
}
