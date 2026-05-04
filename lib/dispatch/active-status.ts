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
 * - WORKING ステータスは Phase 1 cancel route では CANCELLABLE に含むが、
 *   `GET /api/dispatches/active` の判定には含まない（schema にだけ存在するデッドコード扱い）。
 *   本関数は **GET /active と一致させる**（= WORKING は false）。
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
 *
 * `app/api/dispatches/active/route.ts` の where 句と完全に一致する。
 *
 * @param status   Dispatch.status の値（enum / string どちらでも可）
 * @param returnTime 帰社時刻。null = 未帰社
 */
export function isActiveDispatchStatus(
  status: DispatchStatus | string,
  returnTime: Date | null,
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
  return false
}
