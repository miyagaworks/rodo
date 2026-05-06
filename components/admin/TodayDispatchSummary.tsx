'use client'

import { useMemo } from 'react'
import { useAdminDispatches } from '@/hooks/useAdminDispatches'

/**
 * 今日の案件サマリ（3 カード: 進行中 / 完了 / 未請求）。
 *
 * 集計定義:
 * - 進行中:
 *     - status が STANDBY / DISPATCHED / ONSITE / TRANSPORTING
 *     - もしくは status === 'COMPLETED' && returnTime === null（帰社中）
 *   ※ 帰社中はまだ動いている隊員がいるので「進行中」に含める
 *     （隊員バッジの subPhase=RETURNING_TO_BASE と整合させる:
 *       lib/admin/status-derivation.ts §1）
 * - 完了:
 *     - status === 'COMPLETED' && returnTime !== null（帰社済み）
 *     - もしくは status === 'RETURNED' / 'STORED'
 * - 未請求: billedAt が null（status 問わず）
 * - 業務仕様 2026-05-06: isDraft=true（下書き）も全集計対象に含める
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
      if (ACTIVE_STATUSES.has(d.status)) {
        active++
      } else if (d.status === 'COMPLETED' && d.returnTime === null) {
        // 帰社中（COMPLETED && returnTime IS NULL）は進行中に含める
        active++
      } else if (
        d.status === 'COMPLETED' ||
        d.status === 'RETURNED' ||
        d.status === 'STORED'
      ) {
        completed++
      }

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
