'use client'

import { useRouter } from 'next/navigation'

interface Assistance {
  id: string          // DB の cuid（ナビゲーション用）
  displayKey: string  // 内部キー（'pa' など、表示設定用）
  name: string
  logo: string
  abbr: string
  logoClass?: string
  textClass?: string
  textNudge?: number
}

interface AssistanceButtonProps {
  assistance: Assistance
  /**
   * 押下を抑止するか。true のとき:
   *   - 既存 onClick (router.push) は呼ばれない
   *   - スタイルが opacity-50 / cursor-not-allowed になる
   *   - 代わりに onDisabledClick が呼ばれる
   *
   * 出動中の浮き案件防止 Phase 5 (docs/plans/dispatch-floating-prevention.md §9.0-E)。
   * HTML `disabled` 属性は使わない（onClick が拾えなくなり alert を出せないため）。
   */
  disabled?: boolean
  /** disabled === true のときに押下されたときのハンドラ。親で alert を出す想定 */
  onDisabledClick?: () => void
}

export default function AssistanceButton({
  assistance,
  disabled = false,
  onDisabledClick,
}: AssistanceButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    if (disabled) {
      // disabled 時は遷移させず、親に通知する（alert 表示用）。
      onDisabledClick?.()
      return
    }
    router.push(`/dispatch/new?assistanceId=${assistance.id}&type=onsite`)
  }

  // disabled 時は hover/active アニメーションを切り、視覚的にも押下不可と分かるようにする
  const baseClass =
    'bg-white rounded-lg shadow-md p-4 flex flex-col items-center justify-center gap-3 transition-all'
  const interactiveClass = disabled
    ? 'opacity-50 cursor-not-allowed'
    : 'hover:shadow-lg active:scale-95'

  return (
    <button
      className={`${baseClass} ${interactiveClass}`}
      style={{ aspectRatio: '1 / 0.8' }}
      onClick={handleClick}
      aria-disabled={disabled || undefined}
    >
      <div className="flex-1 flex items-center justify-center w-full">
        <img
          src={assistance.logo}
          alt={assistance.name}
          className={`max-w-[85%] object-contain ${assistance.logoClass ?? 'max-h-20'}`}
        />
      </div>
      <span
        className={`font-bold text-gray-800 ${assistance.textClass ?? 'text-xl'}`}
        style={assistance.textNudge ? { transform: `translateY(-${assistance.textNudge}px)` } : undefined}
      >
        {assistance.abbr}
      </span>
    </button>
  )
}
