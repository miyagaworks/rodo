'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * members-status API のレスポンス型
 * (docs/plans/admin-dashboard.md §4.1 に準拠)
 */

export type MemberStatus = 'STANDBY' | 'DISPATCHING' | 'BREAK'
export type DispatchSubPhase =
  | 'DISPATCHING'
  | 'ONSITE'
  | 'TRANSPORTING'
  | 'RETURNING_TO_BASE'

export interface MemberStatusItem {
  id: string
  name: string
  vehicle: { plateNumber: string; displayName: string | null } | null
  status: MemberStatus
  activeDispatch: {
    id: string
    dispatchNumber: string
    subPhase: DispatchSubPhase
    assistanceName: string
  } | null
  activeBreak: {
    id: string
    startTime: string
  } | null
}

export interface MembersStatusResponse {
  members: MemberStatusItem[]
  fetchedAt: string
}

async function fetchMembersStatus(): Promise<MembersStatusResponse> {
  const res = await fetch('/api/admin/members-status')
  if (!res.ok) {
    throw new Error(`members-status fetch failed: ${res.status}`)
  }
  return res.json()
}

/**
 * 隊員ステータスをポーリングする React Query フック。
 *
 * - refetchInterval: 10000ms (§2.3)
 * - dataUpdatedAt: 「最終更新: N 秒前」の計算に使用
 * - refetch(): 手動リフレッシュボタン用
 */
export function useMembersStatus() {
  return useQuery<MembersStatusResponse>({
    queryKey: ['admin', 'members-status'],
    queryFn: fetchMembersStatus,
    refetchInterval: 10_000,
  })
}
