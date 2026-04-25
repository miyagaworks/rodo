import { z } from 'zod/v4'
import { nullableString } from '../helpers'

export const createVehicleSchema = z.object({
  plateNumber: z.string().min(1, 'ナンバーは必須です'),
  displayName: nullableString,
  isActive: z.boolean().default(true),
})

export const updateVehicleSchema = z.object({
  plateNumber: z.string().min(1).optional(),
  displayName: nullableString,
  isActive: z.boolean().optional(),
}).partial()
