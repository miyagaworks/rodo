'use client'

/**
 * 進行中の出動があることをユーザーに通知し、出動画面へ復帰するためのバナー。
 *
 * 出動中の浮き案件防止 Phase 5 (docs/plans/dispatch-floating-prevention.md §3 Phase 5)。
 * - 親 (HomeClient) で `useActiveDispatch` を呼び、active な dispatch がある場合のみレンダリングする
 * - クリックで親が `router.push('/dispatch/${id}')` を実行
 * - 文言は「進行中」を強調し、赤系で目立たせる（業務妨害を避けるため alert は使わない）
 *
 * 仕様: docs/plans/dispatch-floating-prevention.md §9.0-F により遷移先は
 * `/dispatch/${id}` 固定。subPhase ベースの深いリンクは派生課題化。
 */

interface ActiveDispatchBannerProps {
  /** 表示する案件番号（例: "20260504001"） */
  dispatchNumber: string
  /** バナークリック時に呼ばれるハンドラ。親で router.push を実行する */
  onClick: () => void
}

export default function ActiveDispatchBanner({
  dispatchNumber,
  onClick,
}: ActiveDispatchBannerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="進行中の出動があります。クリックで出動画面に戻ります"
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-red-300 bg-red-50 text-red-800 shadow-sm hover:bg-red-100 active:scale-[0.99] transition-all"
    >
      <span className="flex-1 text-left text-sm font-bold leading-snug">
        🚨 進行中の出動があります
        <br />
        <span className="text-xs font-normal">案件番号: {dispatchNumber}</span>
      </span>
      <span className="shrink-0 text-xs font-bold underline whitespace-nowrap">
        出動画面に戻る
      </span>
    </button>
  )
}
