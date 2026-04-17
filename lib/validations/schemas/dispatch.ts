import { z } from 'zod/v4'
import {
  gpsLat,
  gpsLng,
  odometerReading,
  dateString,
  nullableString,
  cuid,
} from '../helpers'

export const createDispatchSchema = z.object({
  assistanceId: cuid,
  type: z.enum(['onsite', 'transport']),
  departureOdo: odometerReading,
  dispatchTime: dateString,
  dispatchGpsLat: gpsLat,
  dispatchGpsLng: gpsLng,
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

  // GPS
  arrivalGpsLat: gpsLat,
  arrivalGpsLng: gpsLng,

  // 距離
  completionOdo: odometerReading,

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
  isDraft: z.boolean().optional(),
  vehicleNumber: nullableString,

  // 作業時間
  workStartTime: dateString,
  workEndTime: dateString,
  workDuration: z.number().int().nonnegative().nullable().optional(),
}).partial()
