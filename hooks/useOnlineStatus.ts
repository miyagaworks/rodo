'use client'

import { useEffect, useCallback } from 'react'
import { useAtom } from 'jotai'
import { syncStateAtom } from '@/store/syncAtom'
import { syncPendingActions, getPendingCount } from '@/lib/sync'

/**
 * オンライン/オフライン状態を監視し、復帰時に自動同期を実行する。
 * アプリのルートで1回だけ呼び出す。
 */
export function useOnlineStatus() {
  const [syncState, setSyncState] = useAtom(syncStateAtom)

  const runSync = useCallback(async () => {
    const count = await getPendingCount()
    if (count === 0) {
      setSyncState((prev) => ({ ...prev, status: 'online', pendingCount: 0 }))
      return
    }

    setSyncState((prev) => ({ ...prev, status: 'syncing', pendingCount: count, errorMessage: null }))

    const { failed } = await syncPendingActions((synced, total) => {
      setSyncState((prev) => ({ ...prev, pendingCount: total - synced }))
    })

    if (failed > 0) {
      setSyncState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: `${failed}件の同期に失敗しました`,
      }))
    } else {
      setSyncState((prev) => ({
        ...prev,
        status: 'online',
        pendingCount: 0,
        lastSyncAt: Date.now(),
        errorMessage: null,
      }))
    }
  }, [setSyncState])

  const handleRetry = useCallback(() => {
    if (navigator.onLine) {
      runSync()
    }
  }, [runSync])

  useEffect(() => {
    const handleOnline = () => {
      runSync()
    }

    const handleOffline = () => {
      setSyncState((prev) => ({ ...prev, status: 'offline' }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // 初期状態チェック
    if (!navigator.onLine) {
      setSyncState((prev) => ({ ...prev, status: 'offline' }))
    } else {
      // オンラインなら明示的にステータスを設定し、未送信データがあれば同期
      setSyncState((prev) => prev.status === 'offline' ? { ...prev, status: 'online' } : prev)
      getPendingCount().then((count) => {
        if (count > 0) runSync()
      })
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [runSync, setSyncState])

  return { syncState, handleRetry }
}
