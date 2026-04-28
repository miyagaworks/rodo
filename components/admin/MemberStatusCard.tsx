'use client'

import type { MemberStatusItem, DispatchSubPhase } from '@/hooks/useMembersStatus'

/**
 * 隊員ステータスカード（1 隊員分）。
 *
 * ステータスバッジ色（§7）:
 * - 待機中: gray-300 系（淡い）
 * - 出動中: blue-500 系（濃い、目立つ）
 * - 休憩中: amber-500 系
 *
 * サブフェーズはバッジ右に小テキスト。
 */

const SUB_PHASE_LABELS: Record<DispatchSubPhase, string> = {
  DISPATCHING: '出動中',
  ONSITE: '作業中',
  TRANSPORTING: '搬送中',
  RETURNING_TO_BASE: '帰社中',
}

interface MemberStatusCardProps {
  member: MemberStatusItem
}

export default function MemberStatusCard({ member }: MemberStatusCardProps) {
  const { status, activeDispatch, activeBreak } = member

  // バッジ色
  let badgeBg: string
  let badgeText: string
  let statusLabel: string

  switch (status) {
    case 'DISPATCHING':
      badgeBg = 'bg-blue-500'
      badgeText = 'text-white'
      statusLabel = '出動中'
      break
    case 'BREAK':
      badgeBg = 'bg-amber-500'
      badgeText = 'text-white'
      statusLabel = '休憩中'
      break
    case 'STANDBY':
    default:
      badgeBg = 'bg-gray-300'
      badgeText = 'text-gray-700'
      statusLabel = '待機中'
      break
  }

  // 休憩中の経過時間
  let breakDuration: string | null = null
  if (status === 'BREAK' && activeBreak) {
    const startMs = new Date(activeBreak.startTime).getTime()
    const elapsed = Math.floor((Date.now() - startMs) / 1000)
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    breakDuration = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return (
    <div
      className="rounded-xl bg-white shadow-sm p-4 flex flex-col gap-2"
      data-testid="member-status-card"
    >
      {/* 隊員名 */}
      <div className="font-bold text-sm" style={{ color: '#1C2948' }}>
        {member.name}
      </div>

      {/* ステータスバッジ + サブフェーズ */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeBg} ${badgeText}`}
          data-testid="status-badge"
        >
          {statusLabel}
        </span>
        {status === 'DISPATCHING' && activeDispatch && (
          <span className="text-xs text-gray-500" data-testid="sub-phase">
            {SUB_PHASE_LABELS[activeDispatch.subPhase]}
          </span>
        )}
        {status === 'BREAK' && breakDuration && (
          <span className="text-xs text-gray-500" data-testid="break-duration">
            {breakDuration}
          </span>
        )}
      </div>

      {/* 出動中の案件情報 */}
      {status === 'DISPATCHING' && activeDispatch && (
        <div className="text-xs text-gray-600 space-y-0.5">
          <div data-testid="dispatch-number">#{activeDispatch.dispatchNumber}</div>
          <div data-testid="assistance-name">{activeDispatch.assistanceName}</div>
        </div>
      )}

      {/* 待機中は補足なし */}
      {status === 'STANDBY' && (
        <div className="text-xs text-gray-400">-</div>
      )}
    </div>
  )
}
