import { z } from 'zod/v4'

/**
 * テナント設定の PATCH 用スキーマ。
 *
 * businessDayStartMinutes: 運営日の開始時刻を分で表現した値（0〜1439）。
 *   - 0 = 0 時 0 分
 *   - 1439 = 23 時 59 分
 *   - 用途は出動番号の日付計算用のみ。休憩制御では使用しない。
 */
export const tenantSettingsPatchSchema = z.object({
  businessDayStartMinutes: z
    .number()
    .int('整数で指定してください')
    .min(0, '0 以上で指定してください')
    .max(1439, '1439 以下で指定してください'),
})

export type TenantSettingsPatchInput = z.infer<typeof tenantSettingsPatchSchema>
