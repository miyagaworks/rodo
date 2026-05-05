import { z } from 'zod/v4'
import { dateString, nullableString, signatureValue } from '../helpers'

export const upsertConfirmationSchema = z.object({
  workDate: dateString,
  preApprovalChecks: z.array(z.boolean()).optional(),
  // P0-13: 署名 3 フィールドは DataURL（移行期間中）または HTTPS URL を許容。
  // サーバー側で DataURL → Blob URL に変換される（lib/blob/signature-storage.ts）。
  customerSignature: signatureValue,
  customerName: nullableString,
  customerDate: dateString,
  vehicleType: nullableString,
  registrationNumber: nullableString,
  workContent: nullableString,
  shopCompanyName: nullableString,
  shopContactName: nullableString,
  shopSignature: signatureValue,
  postApprovalCheck: z.boolean().optional(),
  postApprovalSignature: signatureValue,
  postApprovalName: nullableString,
  batteryDetails: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: nullableString,
})
