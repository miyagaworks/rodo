'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import MemberStatusGrid from '@/components/admin/MemberStatusGrid'
import TodayDispatchSummary from '@/components/admin/TodayDispatchSummary'
import StoredVehicleList from '@/components/admin/StoredVehicleList'
import OverdueDispatchList from '@/components/admin/OverdueDispatchList'
import {
  getBusinessDayDate,
  getBusinessDayYesterday,
} from '@/lib/admin/business-day'

/**
 * 管理者ダッシュボード (/admin/dashboard)
 *
 * ワイヤーフレーム §6.2 / §11.2 に準拠:
 * 1. 隊員ステータス（グリッド + 最終更新 + 手動リフレッシュ）
 * 2. 今日の案件サマリ（進行中 / 完了 / 未請求）
 * 3. 保管中の車両（二次搬送予定日時の管理 — Phase 3.5）
 * 4. 持ち越し案件（前日以前の未請求）
 *
 * businessDayStartMinutes を /api/tenant/settings から取得し、
 * 「今日」「昨日」の日付を動的に計算する。
 */

interface TenantSettings {
  id: string
  businessDayStartMinutes: number
}

export default function AdminDashboardPage() {
  const { data: tenantSettings } = useQuery<TenantSettings>({
    queryKey: ['tenant', 'settings'],
    queryFn: async () => {
      const res = await fetch('/api/tenant/settings')
      if (!res.ok) throw new Error('tenant settings fetch failed')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // テナント設定は頻繁に変わらない
  })

  const startMinutes = tenantSettings?.businessDayStartMinutes ?? 0

  // 業務日の「今日」と「昨日」を 1 秒ごとに再評価（日付跨ぎ対応）
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000) // 1 分ごとに十分
    return () => clearInterval(id)
  }, [])

  const today = useMemo(
    () => getBusinessDayDate(now, startMinutes),
    [now, startMinutes],
  )
  const yesterday = useMemo(
    () => getBusinessDayYesterday(now, startMinutes),
    [now, startMinutes],
  )

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      {/* ページタイトル */}
      <h1 className="text-2xl font-bold" style={{ color: '#1C2948' }}>
        管理者ダッシュボード
      </h1>

      {/* 1. 隊員ステータス */}
      <MemberStatusGrid />

      {/* 2. 今日の案件サマリ */}
      <TodayDispatchSummary today={today} />

      {/* 3. 保管中の車両（二次搬送予定日時の管理） */}
      <StoredVehicleList today={today} />

      {/* 4. 持ち越し案件 */}
      <OverdueDispatchList yesterday={yesterday} />
    </div>
  )
}
