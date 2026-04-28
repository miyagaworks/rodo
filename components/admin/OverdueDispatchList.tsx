'use client'

import Link from 'next/link'
import { useAdminDispatches } from '@/hooks/useAdminDispatches'

/**
 * 持ち越し案件リスト（前日以前の未請求）。
 *
 * - dispatches?status=unbilled&to=YYYY-MM-DD（昨日の日付）
 * - 前日以前の未請求のみ表示
 * - 該当なしなら「持ち越し案件はありません」
 * - 各行クリックで /dispatch/[id]/report（報告兼請求項目）に遷移
 */

interface OverdueDispatchListProps {
  yesterday: string // YYYY-MM-DD
}

export default function OverdueDispatchList({ yesterday }: OverdueDispatchListProps) {
  const { data, isLoading, isError } = useAdminDispatches(
    { status: 'unbilled', to: yesterday, pageSize: 200 },
    { refetchInterval: 10_000 },
  )

  return (
    <section>
      <h2 className="text-base font-bold mb-3" style={{ color: '#1C2948' }}>
        持ち越し案件（前日以前の未請求）
      </h2>

      {isLoading && (
        <div className="text-sm text-gray-500 py-4">読み込み中...</div>
      )}

      {isError && (
        <div className="text-sm text-red-600 py-4">取得失敗</div>
      )}

      {data && data.dispatches.length === 0 && (
        <div className="text-sm text-gray-400 py-4">
          持ち越し案件はありません
        </div>
      )}

      {data && data.dispatches.length > 0 && (
        <div className="space-y-2">
          {data.dispatches.map((d) => (
            <Link
              key={d.id}
              href={`/dispatch/${d.id}/report`}
              className="flex items-center gap-3 rounded-xl bg-white shadow-sm px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
              data-testid="overdue-dispatch-item"
            >
              <span className="font-mono text-xs text-gray-600">
                #{d.dispatchNumber}
              </span>
              <span className="font-medium" style={{ color: '#1C2948' }}>
                {d.user.name}
              </span>
              <span className="text-xs text-gray-500">
                {d.assistance.displayAbbreviation}
              </span>
              {d.plate && (
                <span className="text-xs text-gray-500">
                  {d.plate.region}
                  {d.plate.class}
                  {d.plate.kana}
                  {d.plate.number}
                </span>
              )}
              {d.customerName && (
                <span className="text-xs text-gray-400 ml-auto truncate max-w-[120px]">
                  {d.customerName}
                </span>
              )}
            </Link>
          ))}
          {data.total > data.dispatches.length && (
            <div className="text-xs text-gray-400 text-center py-1">
              他 {data.total - data.dispatches.length} 件
            </div>
          )}
        </div>
      )}
    </section>
  )
}
