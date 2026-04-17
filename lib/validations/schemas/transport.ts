import { z } from 'zod/v4'
import { nullableString } from '../helpers'

export const deleteTransportDestinationSchema = z.object({
  shopName: z.string().min(1, '店舗名は必須です'),
  phone: nullableString,
  address: nullableString,
})
