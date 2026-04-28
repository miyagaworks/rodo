'use client'

import { useQuery } from '@tanstack/react-query'

/**
 * dispatches API のレスポンス型
 * (docs/plans/admin-dashboard.md §4.2 に準拠)
 */

export interface DispatchItem {
  id: string
  dispatchNumber: string
  dispatchTime: string | null
  status: string
  isDraft: boolean
  billedAt: string | null
  /** 二次搬送予定日時 (ISO 文字列)。null = 未定。Phase 3.5 で追加。 */
  scheduledSecondaryAt: string | null
  type: 'ONSITE' | 'TRANSPORT'
  user: { id: string; name: string }
  assistance: { id: string; name: string; displayAbbreviation: string }
  customerName: string | null
  plate: { region: string; class: string; kana: string; number: string } | null
  report: { id: string; isDraft: boolean; totalConfirmedAmount: number | null } | null
}

export interface DispatchesResponse {
  dispatches: DispatchItem[]
  total: number
  page: number
  pageSize: number
}

export interface DispatchesFilter {
  from?: string
  to?: string
  status?:
    | 'draft'
    | 'active'
    | 'completed'
    | 'unbilled'
    | 'billed'
    | 'stored'
    | 'all'
  userId?: string
  assistanceId?: string
  page?: number
  pageSize?: number
}

async function fetchDispatches(
  filter: DispatchesFilter,
): Promise<DispatchesResponse> {
  const params = new URLSearchParams()
  if (filter.from) params.set('from', filter.from)
  if (filter.to) params.set('to', filter.to)
  if (filter.status) params.set('status', filter.status)
  if (filter.userId) params.set('userId', filter.userId)
  if (filter.assistanceId) params.set('assistanceId', filter.assistanceId)
  if (filter.page) params.set('page', String(filter.page))
  if (filter.pageSize) params.set('pageSize', String(filter.pageSize))

  const qs = params.toString()
  const url = `/api/admin/dispatches${qs ? `?${qs}` : ''}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`dispatches fetch failed: ${res.status}`)
  }
  return res.json()
}

/**
 * 管理者用案件一覧を取得する React Query フック。
 *
 * - フィルタ変更で自動再取得
 * - ポーリングは行わない（ダッシュボードのサマリ用途で使う場合は refetchInterval を外から指定可能）
 */
export function useAdminDispatches(
  filter: DispatchesFilter = {},
  options?: { refetchInterval?: number; enabled?: boolean },
) {
  return useQuery<DispatchesResponse>({
    queryKey: ['admin', 'dispatches', filter],
    queryFn: () => fetchDispatches(filter),
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled,
  })
}
