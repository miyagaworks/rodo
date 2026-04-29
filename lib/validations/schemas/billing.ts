import { z } from 'zod/v4'

/**
 * ADMIN 用 請求済みフラグ更新スキーマ。
 *
 * `billed: true`  → API 側で `billedAt = new Date()` をセット
 * `billed: false` → API 側で `billedAt = null` をセット
 */
export const billingSchema = z.object({
  billed: z.boolean(),
})

export type BillingInput = z.infer<typeof billingSchema>
