'use client'

import { useMemo } from 'react'
import type { Vehicle } from '@/hooks/useVehicles'
import { formatVehicleLabel } from '@/lib/vehicle-label'

interface VehicleSelectorProps {
  value: string | null
  onChange: (vehicleId: string | null) => void
  /** 外部から注入する車両一覧（useVehicles の結果） */
  vehicles: Vehicle[]
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * 出動フロー共通の車両セレクタ（純粋 UI コンポーネント）。
 *
 * - fetch はしない（呼び出し側で `useVehicles` から渡す）
 * - 選択肢:
 *   - 先頭に `<option value="">未設定</option>`
 *   - アクティブ車両を plateNumber の自然順 (`ja`, `numeric: true`) でソート
 *   - `value` が非アクティブ車両を指していれば先頭（未設定の直後）に `[停止中] ...` ラベルで強制含有
 * - 空文字選択時は null で通知
 */
export default function VehicleSelector({
  value,
  onChange,
  vehicles,
  disabled,
  className,
  style,
}: VehicleSelectorProps) {
  const options = useMemo(() => {
    const active = vehicles
      .filter((v) => v.isActive)
      .sort((a, b) =>
        a.plateNumber.localeCompare(b.plateNumber, 'ja', { numeric: true }),
      )
    const currentInactive =
      value != null
        ? vehicles.find((v) => v.id === value && !v.isActive) ?? null
        : null
    return currentInactive ? [currentInactive, ...active] : active
  }, [vehicles, value])

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      disabled={disabled}
      className={className ?? 'border rounded px-2 py-0.5 text-sm font-bold'}
      style={style}
    >
      <option value="">未設定</option>
      {options.map((v) => (
        <option key={v.id} value={v.id}>
          {formatVehicleLabel(v)}
        </option>
      ))}
    </select>
  )
}
