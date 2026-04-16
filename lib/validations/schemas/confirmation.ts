import { z } from 'zod/v4'
import { dateString, nullableString } from '../helpers'

export const upsertConfirmationSchema = z.object({
  workDate: dateString,
  preApprovalChecks: z.array(z.boolean()).optional(),
  customerSignature: nullableString,
  customerName: nullableString,
  customerDate: dateString,
  vehicleType: nullableString,
  registrationNumber: nullableString,
  workContent: nullableString,
  shopCompanyName: nullableString,
  shopContactName: nullableString,
  shopSignature: nullableString,
  postApprovalCheck: z.boolean().optional(),
  postApprovalSignature: nullableString,
  postApprovalName: nullableString,
  batteryDetails: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: nullableString,
})
