import { z } from 'zod/v4'
import {
  odometerReading,
  dateString,
  nullableString,
  cuid,
} from '../helpers'

export const createDispatchSchema = z.object({
  assistanceId: cuid,
  type: z.enum(['onsite', 'transport']),
  departureOdo: odometerReading,
  arrivalOdo: odometerReading,
  transportStartOdo: odometerReading,
  returnOdo: odometerReading,
  dispatchTime: dateString,
  parentDispatchId: z.string().nullable().optional(),
  isSecondaryTransport: z.boolean().optional(),
})

const dispatchStatus = z.enum([
  'STANDBY',
  'DISPATCHED',
  'ONSITE',
  'WORKING',
  'TRANSPORTING',
  'COMPLETED',
  'STORED',
  'RETURNED',
  'CANCELLED',
  'TRANSFERRED',
])

const highwayDirection = z.enum(['UP', 'DOWN'])
const situationType = z.enum(['ACCIDENT', 'BREAKDOWN'])
const deliveryType = z.enum(['DIRECT', 'STORAGE'])
const parkingLocation = z.enum(['EMERGENCY_PARKING', 'SHOULDER', 'DRIVING_LANE'])

export const updateDispatchSchema = z.object({
  status: dispatchStatus.optional(),
  type: z.enum(['onsite', 'transport']).optional(),

  // タイムスタンプ
  arrivalTime: dateString,
  completionTime: dateString,
  transportStartTime: dateString,
  returnTime: dateString,
  dispatchTime: dateString,

  // 距離 (ODO)
  departureOdo: odometerReading,
  arrivalOdo: odometerReading,
  transportStartOdo: odometerReading,
  completionOdo: odometerReading,
  returnOdo: odometerReading,

  // 案件情報
  address: nullableString,
  highwayName: nullableString,
  highwayDirection: highwayDirection.nullable().optional(),
  kiloPost: z.union([z.string(), z.number()]).nullable().optional(),
  customerName: nullableString,
  vehicleName: nullableString,
  plateRegion: nullableString,
  plateClass: nullableString,
  plateKana: nullableString,
  plateNumber: nullableString,
  situationType: situationType.nullable().optional(),
  situationDetail: nullableString,
  canDrive: z.boolean().nullable().optional(),
  deliveryType: deliveryType.nullable().optional(),
  memo: nullableString,
  isHighway: z.boolean().nullable().optional(),
  weather: nullableString,
  trafficControl: z.union([z.boolean(), z.string()]).nullable().optional(),
  parkingLocation: parkingLocation.nullable().optional(),
  areaIcName: nullableString,
  insuranceCompanyId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  isDraft: z.boolean().optional(),

  // 作業時間
  workStartTime: dateString,
  workEndTime: dateString,
  workDuration: z.number().int().nonnegative().nullable().optional(),
}).partial()

/**
 * ADMIN 専用 案件更新スキーマ。
 *
 * 既存 `updateDispatchSchema` は隊員視点の制約に閉じているため、
 * 管理者の「全項目自由編集」（請求業務上の誤り訂正）には別 schema を使用する。
 * 隊員フローへの影響を最小化するため、本スキーマは独立して維持する。
 *
 * `userId` / `assistanceId` / `dispatchNumber` / `billedAt` も含め、
 * Dispatch モデルのほぼすべての列を更新可能とする（ステータス遷移ガードは API 側で別途実施）。
 */
export const adminUpdateDispatchSchema = z.object({
  // 関連
  userId: z.string().min(1).optional(),
  assistanceId: z.string().min(1).optional(),
  insuranceCompanyId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  dispatchNumber: z.string().min(1).optional(),

  // ステータス・タイプ
  status: dispatchStatus.optional(),
  type: z.enum(['onsite', 'transport']).optional(),
  isDraft: z.boolean().optional(),

  // タイムスタンプ
  arrivalTime: dateString,
  completionTime: dateString,
  transportStartTime: dateString,
  returnTime: dateString,
  dispatchTime: dateString,

  // 距離 (ODO)
  departureOdo: odometerReading,
  arrivalOdo: odometerReading,
  transportStartOdo: odometerReading,
  completionOdo: odometerReading,
  returnOdo: odometerReading,

  // 案件情報
  address: nullableString,
  highwayName: nullableString,
  highwayDirection: highwayDirection.nullable().optional(),
  kiloPost: z.union([z.string(), z.number()]).nullable().optional(),
  customerName: nullableString,
  vehicleName: nullableString,
  plateRegion: nullableString,
  plateClass: nullableString,
  plateKana: nullableString,
  plateNumber: nullableString,
  situationType: situationType.nullable().optional(),
  situationDetail: nullableString,
  canDrive: z.boolean().nullable().optional(),
  deliveryType: deliveryType.nullable().optional(),
  memo: nullableString,
  isHighway: z.boolean().nullable().optional(),
  weather: nullableString,
  trafficControl: z.union([z.boolean(), z.string()]).nullable().optional(),
  parkingLocation: parkingLocation.nullable().optional(),
  areaIcName: nullableString,

  // 作業時間
  workStartTime: dateString,
  workEndTime: dateString,
  workDuration: z.number().int().nonnegative().nullable().optional(),

  // 請求
  billedAt: dateString,

  // 二次搬送予定日時 (STORED 案件用)。null/undefined を許容（未定にするケース）。
  scheduledSecondaryAt: dateString,
}).partial()
