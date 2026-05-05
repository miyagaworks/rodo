'use client'

import { useState } from 'react'

/**
 * 出動中の浮き案件防止 — 案件キャンセルボタン（Phase 4）。
 *
 * 仕様（docs/plans/dispatch-floating-prevention.md §3 Phase 4 / §9.0-A,B,C）:
 *   - クリックで確認モーダル表示（取り返しのつかない操作のため必須）
 *   - 「キャンセルする」押下で `POST /api/dispatches/[id]/cancel` を実行
 *   - 素の fetch を使用（offlineFetch は使わない＝§5.4 / §6.5 確定方針:
 *     オフライン時は楽観的レスポンスを発生させずキャンセル禁止に倒す）
 *   - res.ok を全分岐で判定し、catch 句では必ず alert を表示する
 *     （AGENTS.md「サイレント故障チェック」準拠）
 *   - 二重押下防止: loading 中はボタン disabled
 *
 * 参考: components/dispatch/BackToHomeConfirmModal.tsx（モーダルのスタイル）
 *       — ただし本モーダルは二択（キャンセルする / 閉じる）のため構造は別
 *
 * 配置（Phase 4 スコープ）:
 *   - components/dispatch/DispatchClient.tsx
 *   - components/dispatch/SecondaryDispatchClient.tsx
 *
 * 引き継ぎ: docs/handover/2026-05-04-dispatch-floating-prevention.md §L
 */

interface Props {
  dispatchId: string
  dispatchNumber: string
  /**
   * キャンセル成功時のコールバック。
   * 呼び出し元で `router.push('/')` 等を実行する。Phase 3 のホーム遷移ガード
   * （useDispatchInProgressGuard）はこの経路を通さないこと（CancelDispatchButton
   * 経由は既にユーザー確認モーダルを通過しており、二重ガードは UX を損ねる）。
   */
  onCancelled: () => void
  /**
   * 親側の inProgress 状態に応じて非表示にしたい場合の予備。基本は親で条件 render する。
   */
  disabled?: boolean
}

export function CancelDispatchButton({
  dispatchId,
  dispatchNumber,
  onCancelled,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleCancel = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/dispatches/${dispatchId}/cancel`, {
        method: 'POST',
      })

      if (res.ok) {
        setOpen(false)
        onCancelled()
        return
      }

      // エラー分岐
      if (res.status === 401) {
        alert('ログインし直してください')
        return
      }
      if (res.status === 403) {
        alert('この案件をキャンセルする権限がありません')
        return
      }
      if (res.status === 404) {
        alert('案件が見つかりません')
        return
      }
      if (res.status === 409) {
        // レスポンス JSON の error または message を読む
        let message = 'この案件は既にキャンセル可能な状態ではありません'
        try {
          const data = (await res.json()) as { error?: string; message?: string }
          if (data.error) message = data.error
          else if (data.message) message = data.message
        } catch {
          /* JSON parse 失敗時は既定文言で通知 */
        }
        alert(message)
        return
      }
      alert(`キャンセルに失敗しました（status: ${res.status}）`)
    } catch (err) {
      // TypeError 等のネットワークエラー（オフライン含む）
      console.error('CancelDispatchButton fetch error:', err)
      alert('ネットワーク接続が必要です。オンライン状態でやり直してください')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || loading}
        className="px-3 py-1.5 rounded-md text-xs font-bold text-white active:opacity-60 disabled:opacity-40"
        style={{ backgroundColor: '#D3170A' }}
      >
        案件キャンセル
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => {
            if (!loading) setOpen(false)
          }}
        >
          <div
            className="mx-6 w-full max-w-sm rounded-xl p-5 space-y-4"
            style={{ backgroundColor: '#FFFFFF' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="text-sm font-bold text-center leading-relaxed"
              style={{ color: '#1C2948' }}
            >
              案件番号 {dispatchNumber} を<br />
              キャンセルしますか？<br />
              取り消した案件は復元できません
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="w-full py-3 rounded-md font-bold text-sm text-white active:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: '#D3170A' }}
              >
                {loading ? '処理中…' : 'キャンセルする'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="w-full py-3 rounded-md font-bold text-sm border active:opacity-80 disabled:opacity-50"
                style={{ borderColor: '#1C2948', color: '#1C2948', backgroundColor: '#FFFFFF' }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
