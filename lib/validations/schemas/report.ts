import { z } from 'zod/v4'
import { odometerReading, distance, monetaryAmount, nullableString } from '../helpers'

/** 完了項目のチェック状態 (キー: string, 値: boolean) */
const completionItems = z.record(z.string(), z.boolean()).nullable().optional()

const reportFields = {
  departureOdo: odometerReading,
  arrivalOdo: odometerReading,
  transportStartOdo: odometerReading,
  returnOdo: odometerReading,
  recoveryDistance: distance,
  transportDistance: distance,
  returnDistance: distance,
  completionOdo: odometerReading,

  recoveryHighway: monetaryAmount,
  transportHighway: monetaryAmount,
  returnHighway: monetaryAmount,
  totalHighway: monetaryAmount,

  departurePlaceName: nullableString,
  arrivalPlaceName: nullableString,
  transportPlaceName: nullableString,

  transportShopName: nullableString,
  transportPhone: nullableString,
  transportAddress: nullableString,
  transportContact: nullableString,
  transportMemo: nullableString,

  primaryCompletionItems: completionItems,
  primaryCompletionNote: nullableString,
  secondaryCompletionItems: completionItems,
  secondaryCompletionNote: nullableString,

  primaryAmount: monetaryAmount,
  secondaryAmount: monetaryAmount,
  totalConfirmedAmount: monetaryAmount,

  billingContactMemo: nullableString,

  storageType: nullableString,
  storageRequired: z.boolean().nullable().optional(),

  isDraft: z.boolean().optional(),
}

/** Report POST/PATCH (upsert) */
export const upsertReportSchema = z.object(reportFields)

/** Report complete POST
 * - isDraft: complete 時は強制 false（クライアント値を無視）
 * - transportDistance: サーバー側で resolveOdos / computeDistances により自動計算するため、
 *   クライアント送信値は使わない（/report/complete/route.ts L80-84 参照）
 * - storageType: 現状クライアント (ReportTransportClient.tsx) から送信されていない。
 *   将来送信されるようになる場合はここから外して buildReportData にも追記すること
 *
 * 上記 3 件以外の transport* 系（PlaceName/ShopName/Phone/Address/Contact/Memo/Highway）は
 * TRANSPORT 案件の必須情報なので omit しない（過去 silent drop の主因。2026-05-02 修正）。
 */
export const completeReportSchema = z.object({
  ...reportFields,
}).omit({
  isDraft: true,
  transportDistance: true,
  storageType: true,
})
