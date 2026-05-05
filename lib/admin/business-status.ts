/**
 * 業務6ステータス変換ヘルパ。
 *
 * 隊員ステータス（MemberStatusItem）を、管理者ダッシュボードのバッジ表示用
 * 6ステータスに集約する。色・アイコンは MemberStatusBadge 側で解決。
 *
 * 業務6ステータス:
 *   - 'break'    : 休憩中（最優先。他のすべてに優先する）
 *   - 'standby'  : 待機中
 *   - 'dispatch' : 出動中
 *   - 'work'     : 作業中
 *   - 'transport': 搬送中
 *   - 'return'   : 帰社中
 *
 * マッピング規則:
 *   1. status === 'BREAK'         → 'break'   （最優先）
 *   2. status === 'STANDBY'       → 'standby'
 *   3. status === 'DISPATCHING'   → activeDispatch.subPhase で分岐
 *      - 'DISPATCHING'        → 'dispatch'
 *      - 'ONSITE'             → 'work'
 *      - 'TRANSPORTING'       → 'transport'
 *      - 'RETURNING_TO_BASE'  → 'return'
 *      - その他（防御的）     → 'standby'
 *   4. それ以外（防御的）         → 'standby'
 */

import type { MemberStatusItem } from '@/hooks/useMembersStatus'

export type BusinessStatus =
  | 'standby'
  | 'dispatch'
  | 'work'
  | 'transport'
  | 'return'
  | 'break'

/**
 * 隊員 1 名分のステータスを業務 6 ステータスへ集約する。
 *
 * @param member 隊員ステータス（API レスポンスの 1 要素）
 * @returns 業務 6 ステータスのいずれか
 */
export function toBusinessStatus(member: MemberStatusItem): BusinessStatus {
  // 1. 休憩中を最優先
  if (member.status === 'BREAK') {
    return 'break'
  }

  // 2. 待機中
  if (member.status === 'STANDBY') {
    return 'standby'
  }

  // 3. 出動中: subPhase で分岐
  if (member.status === 'DISPATCHING' && member.activeDispatch) {
    switch (member.activeDispatch.subPhase) {
      case 'DISPATCHING':
        return 'dispatch'
      case 'ONSITE':
        return 'work'
      case 'TRANSPORTING':
        return 'transport'
      case 'RETURNING_TO_BASE':
        return 'return'
      default:
        // 想定外の subPhase（型上は到達不能だが防御的に standby に倒す）
        return 'standby'
    }
  }

  // 4. 想定外の組み合わせ（型上は到達不能だが防御的に standby）
  return 'standby'
}
