'use client'

/**
 * 出動中の浮き案件防止 — 戻るボタン押下時に表示する共通モーダル。
 *
 * 仕様:
 *   - 進行中（active）の出動画面でホームに戻ろうとした際に表示
 *   - 「戻れない」仕様のため OK ボタン 1 つのみ（保存して戻る / 保存せず戻る は提供しない）
 *   - 背景オーバーレイのタップでも閉じる（RecordClient の既存モーダルと同パターン）
 *
 * 計画書: docs/plans/dispatch-floating-prevention.md §3 Phase 3 ステップ 1
 * 引き継ぎ: docs/handover/2026-05-04-dispatch-floating-prevention.md §K.3
 */

interface Props {
  open: boolean
  onClose: () => void
}

export function BackToHomeConfirmModal({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
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
          進行中の案件があります。<br />
          ホームに戻るには「案件キャンセル」ボタンで取り消してください
        </p>
        <div className="space-y-2">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-md font-bold text-sm text-white active:opacity-80"
            style={{ backgroundColor: '#1C2948' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
