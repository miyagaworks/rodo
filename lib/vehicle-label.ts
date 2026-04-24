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
 * - null なら "---"
 * - isActive は無視（ヘッダーでは停止中プレフィックス不要）
 */
export function formatCurrentVehicleLabel(
  vehicle: { plateNumber: string; displayName: string | null } | null | undefined
): string {
  if (!vehicle) return '---'
  const suffix = vehicle.displayName ? ` (${vehicle.displayName})` : ''
  return vehicle.plateNumber + suffix
}
