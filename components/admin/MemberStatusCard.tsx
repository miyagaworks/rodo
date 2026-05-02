'use client'

import type { MemberStatusItem } from '@/hooks/useMembersStatus'
import { toBusinessStatus } from '@/lib/admin/business-status'
import MemberStatusBadge from './MemberStatusBadge'

/**
 * 隊員ステータスカード（1 隊員分）。
 *
 * バッジは業務 6 ステータスを色 + アイコンで直感判別可能なピル型
 * （MemberStatusBadge）に統一。バッジ右側に補助情報を並べる:
 *   - 休憩中: 経過時間（mm:ss）
 *   - 出動中: 案件番号 + AS 名（バッジ下段に表示）
 */

interface MemberStatusCardProps {
  member: MemberStatusItem
}

export default function MemberStatusCard({ member }: MemberStatusCardProps) {
  const { status, activeDispatch, activeBreak } = member
  const businessStatus = toBusinessStatus(member)

  // 休憩中の経過時間
  // NOTE: refetchInterval (10s) によるカード再描画ごとに mm:ss を計算する仕様。
  // 1 秒粒度の滑らかな更新は不要なため、useState + setInterval ではなく
  // 描画時の Date.now() を許容している（バッジ 6 色化前から同実装）。
  let breakDuration: string | null = null
  if (status === 'BREAK' && activeBreak) {
    const startMs = new Date(activeBreak.startTime).getTime()
    // eslint-disable-next-line react-hooks/purity -- 再描画ごとの mm:ss 算出は仕様（上記コメント参照）
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

      {/* ステータスバッジ */}
      <div className="flex items-center">
        <MemberStatusBadge status={businessStatus} />
      </div>

      {/* 休憩中の経過時間（バッジ下段、別行） */}
      {status === 'BREAK' && breakDuration && (
        <div className="text-xs text-gray-500" data-testid="break-duration">
          {breakDuration}
        </div>
      )}

      {/* 出動中の案件情報 */}
      {status === 'DISPATCHING' && activeDispatch && (
        <div className="text-xs text-gray-600 space-y-0.5">
          <div data-testid="dispatch-number">{activeDispatch.dispatchNumber}</div>
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
