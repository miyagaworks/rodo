'use client'

import { useCallback } from 'react'
import { useSetAtom } from 'jotai'
import { syncStateAtom } from '@/store/syncAtom'
import { addPendingAction, type PendingAction } from '@/lib/offline-db'

type ActionParams = Omit<PendingAction, 'id' | 'timestamp'>

/**
 * オフライン対応のアクション実行フック。
 *
 * オンライン時: そのまま fetch して結果を返す
 * オフライン時: IndexedDB にキューイングして楽観的に成功を返す
 *
 * @returns execute 関数
 */
export function useOfflineAction() {
  const setSyncState = useSetAtom(syncStateAtom)

  const execute = useCallback(
    async (
      params: ActionParams,
      options?: {
        /** オンライン時でもキューに入れる（バッチ送信したい場合） */
        forceQueue?: boolean
      },
    ): Promise<{ ok: boolean; data?: unknown; queued: boolean }> => {
      const isOnline = navigator.onLine

      if (isOnline && !options?.forceQueue) {
        // オンライン → 直接送信
        try {
          const res = await fetch(params.endpoint, {
            method: params.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params.data),
          })
          if (res.ok) {
            const data = await res.json().catch(() => null)
            return { ok: true, data, queued: false }
          }
          // サーバーエラー → キューに保存してオフライン扱い
          if (res.status >= 500) {
            await queueAction(params)
            return { ok: true, queued: true }
          }
          // 4xx → クライアントエラー（キューしても意味がない）
          return { ok: false, queued: false }
        } catch {
          // ネットワークエラー → キューに保存
          await queueAction(params)
          return { ok: true, queued: true }
        }
      }

      // オフライン → キューに保存して楽観的成功
      await queueAction(params)
      return { ok: true, queued: true }
    },
    [setSyncState],
  )

  const queueAction = useCallback(
    async (params: ActionParams) => {
      await addPendingAction({
        ...params,
        timestamp: Date.now(),
      })
      const { getPendingCount } = await import('@/lib/sync')
      const count = await getPendingCount()
      setSyncState((prev) => ({
        ...prev,
        status: navigator.onLine ? prev.status : 'offline',
        pendingCount: count,
      }))
    },
    [setSyncState],
  )

  return { execute }
}
