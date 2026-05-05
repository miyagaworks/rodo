import { z } from 'zod/v4'

// --- 再利用可能なカスタムスキーマ ---

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

/**
 * 署名フィールド用バリデーション。
 *
 * 設計書: docs/plans/p0-13-signature-blob-migration.md (4.5 節)
 *
 * 受け入れる値:
 *   - 空文字 ''（フロントが署名クリア時に送る）
 *   - null
 *   - PNG DataURL（base64 部分は最大 120000 文字 ≒ 90KB）
 *   - HTTPS URL（Vercel Blob URL を想定、最大 2048 文字）
 *
 * サーバー側で convertSignatureIfDataUrl により DataURL → URL に変換される。
 */
export const signatureValue = z
  .union([
    z.literal(''),
    z.null(),
    z
      .string()
      .regex(
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/,
        'Signature DataURL must be PNG base64',
      )
      .max(120_000 + 'data:image/png;base64,'.length),
    z.string().url().startsWith('https://').max(2048),
  ])
  .optional()
  .nullable()

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
