'use client'

import { useEffect, useState } from 'react'

export interface Vehicle {
  id: string
  plateNumber: string
  displayName: string | null
  isActive: boolean
}

/**
 * `/api/settings/vehicles` から車両一覧を取得するフック。
 *
 * - 認証済みユーザーであれば誰でも取得可能（同一テナント内）
 * - 取得失敗時は空配列のまま（フォールバック UX 担保）
 * - `loading` は初回 fetch 完了時に false に遷移
 */
export function useVehicles(): { vehicles: Vehicle[]; loading: boolean } {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/vehicles')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        if (cancelled) return
        if (Array.isArray(data)) {
          setVehicles(data as Vehicle[])
        }
      })
      .catch(() => {
        /* 失敗時は空配列のまま */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { vehicles, loading }
}
