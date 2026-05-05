'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useAtom } from 'jotai'
import { syncStateAtom } from '@/store/syncAtom'
import { syncPendingActions, getPendingCount } from '@/lib/sync'

/** ハートビート間隔 (ms)。30 秒ごとに /api/health を叩く。 */
const HEARTBEAT_INTERVAL_MS = 30_000

/** ハートビート fetch のタイムアウト (ms)。 */
const HEARTBEAT_TIMEOUT_MS = 10_000

/**
 * オンライン/オフライン状態を監視し、復帰時に自動同期を実行する。
 * アプリのルートで1回だけ呼び出す。
 *
 * 検出方式:
 *   1. window 'online' / 'offline' イベント（ブラウザ提供）
 *   2. /api/health への 30 秒ハートビート（イベント未発火環境への保険）
 *   3. visibilitychange でタブ復帰時に即座にハートビート実行
 *
 * Chrome の VPN 切替や iOS Safari など、'online' イベントが発火しない環境でも
 * バナーが永久に消えなくなる現象を防ぐため、(2)(3) を併用している。
 */
export function useOnlineStatus() {
  const [syncState, setSyncState] = useAtom(syncStateAtom)
  // status を ref で参照することで、ハートビート内のクロージャが古い値を見ないようにする
  const statusRef = useRef(syncState.status)
  useEffect(() => {
    statusRef.current = syncState.status
  }, [syncState.status])

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

  /**
   * /api/health に GET し、ネット接続性を確認する。
   *
   * 判定:
   *   - fetch が resolve かつ Service Worker フォールバック由来でない → online
   *   - SW フォールバック由来（`X-SW-Offline: 1` ヘッダ付き 503）→ offline
   *   - fetch が reject（ネット失敗）またはタイムアウト → offline
   *
   * 注意:
   *   public/sw.js は /api/health を透過させる設定だが、古い SW がアクティブな
   *   端末では 503 フォールバックが返り得る。そのため `X-SW-Offline` ヘッダを
   *   明示的にチェックして二重に保護する。
   */
  const probeHealth = useCallback(async (): Promise<boolean> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS)
    try {
      const res = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })
      if (res.headers.get('X-SW-Offline') === '1') return false
      return true
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const handleOnline = () => {
      runSync()
    }

    const handleOffline = () => {
      setSyncState((prev) => ({ ...prev, status: 'offline' }))
    }

    /**
     * ハートビート / visibilitychange からの確認処理。
     * - reachable: offline 状態なら online 復帰として runSync を起動
     * - unreachable: syncing 中以外なら offline へ落とす
     *   （syncing 中の上書きは進行中の同期処理が完結時に適切なステータスを書き戻す）
     */
    const checkConnectivity = async () => {
      const reachable = await probeHealth()
      if (cancelled) return

      const current = statusRef.current
      if (reachable) {
        if (current === 'offline') {
          // オフラインから復帰 → 同期実行（ペンディングなしなら online 確定）
          runSync()
        }
      } else {
        if (current !== 'offline' && current !== 'syncing') {
          setSyncState((prev) => ({ ...prev, status: 'offline' }))
        }
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkConnectivity()
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)

    // 30 秒ごとのハートビート
    const intervalId = window.setInterval(checkConnectivity, HEARTBEAT_INTERVAL_MS)

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
      cancelled = true
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.clearInterval(intervalId)
    }
  }, [runSync, setSyncState, probeHealth])

  return { syncState, handleRetry }
}
