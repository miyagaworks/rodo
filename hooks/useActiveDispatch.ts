'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DispatchSubPhase } from '@/lib/dispatch/active-status'

/**
 * 自分の active な Dispatch を 1 件 fetch するクライアントフック。
 *
 * 出動中の浮き案件防止 Phase 2 (docs/plans/dispatch-floating-prevention.md §3 Phase 2)。
 * 本フック単体は Phase 2 では既存 5 画面に未統合。Phase 3 以降で各画面が import する。
 *
 * 設計判断:
 * - GET なので素の `fetch` を使う（offlineFetch は使わない: 計画書 §4.3 / §5.1）。
 * - `res.ok` チェック必須。失敗時はサイレント故障せず `setError`（AGENTS.md 準拠）。
 * - catch 句では `console.error` + `setError`。**alert は出さない**
 *   （ホーム画面で頻繁に出ると業務阻害になるため。計画書 §5.3-#1）。
 * - SW から 503 + `X-SW-Offline: 1` が返るケースは**楽観的レスポンスではなくエラー**として扱い、
 *   `activeDispatch` には反映しない。呼び出し元側で「進行中状態不明」のフェイルセーフ判断をさせる。
 * - ポーリングは行わない。マウント時 1 回 + `refresh()` のみ。
 */

export interface ActiveDispatchPayload {
  id: string
  dispatchNumber: string
  /** Dispatch.status enum 値の文字列表現 */
  status: string
  /** 帰社時刻（ISO 文字列）。null = 未帰社 */
  returnTime: string | null
  /** 'ONSITE' | 'TRANSPORT' */
  type: string
  /** status / returnTime から導出されたサブフェーズ。判定不能なら null */
  subPhase: DispatchSubPhase | null
  assistance: { name: string }
}

interface ActiveDispatchResponse {
  dispatch: ActiveDispatchPayload | null
}

export interface UseActiveDispatchResult {
  activeDispatch: ActiveDispatchPayload | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

export function useActiveDispatch(): UseActiveDispatchResult {
  const [activeDispatch, setActiveDispatch] =
    useState<ActiveDispatchPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchActive = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await fetch('/api/dispatches/active', {
        method: 'GET',
        cache: 'no-store',
      })

      // SW フォールバックの楽観的レスポンス検知（503 + X-SW-Offline: 1）。
      // 識別ヘッダで明示的に分岐し、activeDispatch に false ネガティブを書き込まない。
      if (res.headers.get('X-SW-Offline') === '1') {
        setError(
          new Error(
            'オフラインのため進行中の出動を確認できません（SW フォールバック）',
          ),
        )
        return
      }

      if (!res.ok) {
        // 401 / 500 等。activeDispatch は据え置き、error にセット。
        setError(
          new Error(`active dispatch fetch failed: HTTP ${res.status}`),
        )
        return
      }

      const data = (await res.json()) as ActiveDispatchResponse
      setActiveDispatch(data.dispatch ?? null)
      setError(null)
    } catch (e) {
      console.error('[useActiveDispatch] fetch failed', e)
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 初回マウント時に 1 回だけ active 状態を取得する。
    // fetchActive 内で setLoading 等の setState を呼ぶため
    // react-hooks/set-state-in-effect が反応するが、本フックはマウント時取得が必須挙動。
    // 既存の usePhotoCapture / useOnlineStatus と同パターン。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchActive()
  }, [fetchActive])

  return {
    activeDispatch,
    loading,
    error,
    refresh: fetchActive,
  }
}
