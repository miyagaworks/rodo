/**
 * 車両の表示ラベル生成ヘルパー。
 *
 * 仕様:
 *   - `plateNumber + " (" + displayName + ")"`（displayName があれば）
 *   - `isActive === false` の車両は `[停止中] ` プレフィックスを付与（option ラベル用）
 *   - null の場合は "---"（未設定プレースホルダ）
 */

export interface VehicleLabelInput {
  plateNumber: string
  displayName: string | null
  isActive?: boolean
}

/**
 * option 表示用ラベル。isActive===false なら [停止中] を付与。
 */
export function formatVehicleLabel(vehicle: VehicleLabelInput): string {
  const prefix = vehicle.isActive === false ? '[停止中] ' : ''
  const suffix = vehicle.displayName ? ` (${vehicle.displayName})` : ''
  return prefix + vehicle.plateNumber + suffix
}

/**
 * ヘッダー等の「現在選択中の車両」表示用ラベル。
 * - vehicle 自体が null/undefined なら "---"
 * - displayName があればそれだけを表示
 * - displayName が null なら「未設定」
 * - plateNumber は表示しない (重複表示回避)
 */
export function formatCurrentVehicleLabel(
  vehicle: { plateNumber: string; displayName: string | null } | null | undefined
): string {
  if (!vehicle) return '---'
  return vehicle.displayName ?? '未設定'
}
