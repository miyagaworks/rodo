import { z } from 'zod/v4'

// --- 再利用可能なカスタムスキーマ ---

/** GPS緯度 (-90 ~ 90) */
export const gpsLat = z.number().min(-90).max(90).nullable().optional()

/** GPS経度 (-180 ~ 180) */
export const gpsLng = z.number().min(-180).max(180).nullable().optional()

/** 走行距離メーター (0以上の整数、文字列からの自動変換対応) */
export const odometerReading = z.union([
  z.number().int().nonnegative(),
  z.string().transform((v) => parseInt(v, 10)).pipe(z.number().int().nonnegative()),
]).nullable().optional()

/** 金額 (0以上の整数、文字列からの自動変換対応) */
export const monetaryAmount = z.union([
  z.number().int().nonnegative(),
  z.string().transform((v) => parseInt(v, 10)).pipe(z.number().int().nonnegative()),
]).nullable().optional()

/** 距離 (0以上の数値、小数可、文字列からの自動変換対応) */
export const distance = z.union([
  z.number().nonnegative(),
  z.string().transform((v) => parseFloat(v)).pipe(z.number().nonnegative()),
]).nullable().optional()

/** ISO8601日時文字列 */
export const isoDatetime = z.string().datetime({ offset: true }).nullable().optional()

/** 日時文字列 (ISO8601厳密でないものも許容 — new Date() で解析可能な文字列) */
export const dateString = z.string().nullable().optional()

/** 空でない文字列 */
export const nonEmptyString = z.string().min(1)

/** nullable な文字列 (空文字許容) */
export const nullableString = z.string().nullable().optional()

/** CUID形式のID */
export const cuid = z.string().min(1)

// --- 共通バリデーションヘルパー ---

/**
 * Zodスキーマでリクエストボディをパースし、失敗時は400レスポンスを返す。
 * 成功時はパース済みデータを返す。
 */
export function parseBody<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data)
  if (!result.success) {
    return { success: false, error: result.error }
  }
  return { success: true, data: result.data }
}
