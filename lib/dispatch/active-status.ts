/**
 * 出動の active 状態判定（クライアント / サーバ共有の純粋関数モジュール）。
 *
 * 出動中の浮き案件防止 Phase 2 (docs/plans/dispatch-floating-prevention.md §3 Phase 2)
 * で 5 画面が共有する「進行中（active）判定」を 1 箇所に集約する。
 *
 * 設計判断:
 * - `lib/admin/status-derivation.ts` は `'use server'` 宣言を持たず、server-only
 *   な依存（prisma 等）も import しない純粋関数のみで構成されているため、
 *   クライアントから直接 import 可能。`mapStatusToSubPhase` はそのまま再エクスポートする。
 * - `isActiveDispatchStatus` は `app/api/dispatches/active/route.ts` (Phase 1) と
 *   完全一致させる。判定ズレはバナー表示と DB 状態の乖離を生むため致命的。
 * - WORKING ステータスは新シグネチャ（2026-05-05）でも真値条件に**含めない**。
 *   `lib/admin/status-derivation.ts` L15 で「schema にだけ存在するデッドコード」と
 *   明記されており、DB に書き込まれない予備値である。「作業中」UI ラベルは
 *   `ONSITE` + step=2 で実現されているため、既存ガードでカバー済み。
 *   将来 WORKING を実装する設計変更が入った時点で改めて判定を見直す。
 *   （2026-05-05 ユーザー確認確定）
 */

import type { DispatchStatus } from '@prisma/client'

export {
  mapStatusToSubPhase,
  type DispatchSubPhase,
} from '@/lib/admin/status-derivation'

/**
 * 出動が「進行中（active）」状態かを判定する。
 *
 * 真値となる条件:
 *   - status が DISPATCHED / ONSITE / TRANSPORTING のいずれか
 *   - もしくは status === 'COMPLETED' && returnTime === null（帰社中）
 *   - もしくは (status === 'COMPLETED' || status === 'RETURNED') &&
 *     returnTime !== null && isDraft === false
 *     （帰社後・書類作成未着手 / 2026-05-05 ユーザー確定）
 *
 * `app/api/dispatches/active/route.ts` の where 句と完全に一致する。
 *
 * WORKING は真値条件に含めない（schema 上のデッドコードのため / 上記モジュール
 * コメント参照）。
 *
 * @param status     Dispatch.status の値（enum / string どちらでも可）
 * @param returnTime 帰社時刻。null = 未帰社
 * @param isDraft    Dispatch.isDraft の値。出動記録ボタン押下後は true。
 */
export function isActiveDispatchStatus(
  status: DispatchStatus | string,
  returnTime: Date | null,
  isDraft: boolean,
): boolean {
  if (
    status === 'DISPATCHED' ||
    status === 'ONSITE' ||
    status === 'TRANSPORTING'
  ) {
    return true
  }
  if (status === 'COMPLETED' && returnTime === null) {
    return true
  }
  // 新規（2026-05-05）: 帰社後でも出動記録ボタン未押下なら active
  if (
    (status === 'COMPLETED' || status === 'RETURNED') &&
    returnTime !== null &&
    isDraft === false
  ) {
    return true
  }
  return false
}
