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

/** Report complete POST (isDraft強制false、transport系フィールド除外) */
export const completeReportSchema = z.object({
  ...reportFields,
  // complete時はisDraftを受け付けない（サーバー側でfalse固定）
}).omit({ isDraft: true, transportDistance: true, transportHighway: true, transportPlaceName: true, transportShopName: true, transportPhone: true, transportAddress: true, transportContact: true, transportMemo: true, storageType: true })
