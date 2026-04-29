'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMembersStatus } from '@/hooks/useMembersStatus'
import MemberStatusCard from '@/components/admin/MemberStatusCard'

/**
 * 隊員ステータスグリッド。
 *
 * - PC: 4 カラム (lg:grid-cols-4)、タブレット: 2 カラム (md:grid-cols-2)、SP: 1 カラム
 * - 「最終更新: N 秒前」表示（dataUpdatedAt + 1 秒タイマーで更新）
 * - 手動 refetch ボタン
 * - エラー時: 「取得失敗。再読込」表示
 * - 0 名時: 「登録済みの隊員がいません」表示
 */
export default function MemberStatusGrid() {
  const { data, dataUpdatedAt, isError, isLoading, refetch } = useMembersStatus()
  const [secondsAgo, setSecondsAgo] = useState(0)

  // 「N 秒前」を 1 秒ごとに更新
  useEffect(() => {
    if (!dataUpdatedAt) return

    const update = () => {
      setSecondsAgo(Math.floor((Date.now() - dataUpdatedAt) / 1000))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [dataUpdatedAt])

  const handleRefetch = useCallback(() => {
    refetch()
  }, [refetch])

  return (
    <section>
      {/* セクションヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold" style={{ color: '#1C2948' }}>
          隊員ステータス
        </h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {dataUpdatedAt > 0 && (
            <span data-testid="last-updated">最終更新: {secondsAgo} 秒前</span>
          )}
          <button
            type="button"
            onClick={handleRefetch}
            className="p-1 rounded hover:bg-white/60 transition-colors"
            aria-label="再取得"
            data-testid="refetch-button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 01-9.378 2.096l-1.414 1.414a7.5 7.5 0 0012.728-3.51h-1.936zM4.688 8.576a5.5 5.5 0 019.378-2.096l1.414-1.414A7.5 7.5 0 002.752 8.576h1.936z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* ローディング */}
      {isLoading && (
        <div className="text-sm text-gray-500 py-4">読み込み中...</div>
      )}

      {/* エラー */}
      {isError && (
        <div className="text-sm text-red-600 py-4">
          取得失敗。
          <button
            type="button"
            onClick={handleRefetch}
            className="underline ml-1"
          >
            再読込
          </button>
        </div>
      )}

      {/* 0 名 */}
      {data && data.members.length === 0 && (
        <div className="text-sm text-gray-500 py-4">
          登録済みの隊員がいません
        </div>
      )}

      {/* グリッド */}
      {data && data.members.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.members.map((m) => (
            <MemberStatusCard key={m.id} member={m} />
          ))}
        </div>
      )}
    </section>
  )
}
