/**
 * 隊員ステータス導出（純粋関数）。
 *
 * 仕様（docs/plans/admin-dashboard.md §2.1 / §4.1）:
 *
 * 1. アクティブな BreakRecord（endTime IS NULL）あり → 'BREAK'
 * 2. アクティブな Dispatch あり → 'DISPATCHING' + サブフェーズ
 *    - DISPATCHED                          → 'DISPATCHING'   （表示: 出動中）
 *    - ONSITE                              → 'ONSITE'        （表示: 作業中）
 *    - TRANSPORTING                        → 'TRANSPORTING'  （表示: 搬送中）
 *    - COMPLETED && returnTime IS NULL     → 'RETURNING_TO_BASE'（表示: 帰社中）
 * 3. 上記以外 → 'STANDBY'（待機中）
 *
 * 「アクティブな Dispatch」判定から除外する status:
 *   - WORKING                          : schema にだけ存在するデッドコード
 *   - COMPLETED && returnTime IS NOT NULL : 帰社済み
 *   - RETURNED                         : 帰社済み
 *   - STORED                           : 保管済み（隊員フローの主担当ではない）
 *   - CANCELLED / TRANSFERRED          : 終了済み
 *   - STANDBY / DISPATCHED 以外で帰社後 : 待機扱い
 */

export type MemberStatus = 'STANDBY' | 'DISPATCHING' | 'BREAK'

export type DispatchSubPhase =
  | 'DISPATCHING'
  | 'ONSITE'
  | 'TRANSPORTING'
  | 'RETURNING_TO_BASE'

/** 入力: アクティブな Dispatch（無ければ null） */
export interface ActiveDispatchInput {
  id: string
  dispatchNumber: string
  status: string
  returnTime: Date | null
  assistance: { name: string }
}

/** 入力: アクティブな BreakRecord（endTime IS NULL）。無ければ null */
export interface ActiveBreakInput {
  id: string
  startTime: Date
}

/** 出力（`activeDispatch` / `activeBreak` は status に応じてのみ埋まる） */
export interface DerivedStatus {
  status: MemberStatus
  activeDispatch: {
    id: string
    dispatchNumber: string
    subPhase: DispatchSubPhase
    assistanceName: string
  } | null
  activeBreak: {
    id: string
    startTime: string
  } | null
}

/** Dispatch.status → サブフェーズへのマッピング。マッピング不能なら null（=待機扱い） */
export function mapStatusToSubPhase(
  dispatchStatus: string,
  returnTime: Date | null,
): DispatchSubPhase | null {
  switch (dispatchStatus) {
    case 'DISPATCHED':
      return 'DISPATCHING'
    case 'ONSITE':
      return 'ONSITE'
    case 'TRANSPORTING':
      return 'TRANSPORTING'
    case 'COMPLETED':
      // 帰社時刻が立っていれば帰社済み（待機扱い）。null なら帰社中。
      return returnTime === null ? 'RETURNING_TO_BASE' : null
    default:
      // STANDBY / WORKING / RETURNED / STORED / CANCELLED / TRANSFERRED 等は待機扱い
      return null
  }
}

/**
 * 隊員ステータスを導出する純粋関数。
 *
 * - 入力は API 層で取得した「アクティブな Dispatch」「アクティブな BreakRecord」に絞る。
 * - 同一隊員に対して両方が同時にアクティブになる業務シナリオは無い前提。
 *   ただし防御的に、break が立っていれば break を優先する。
 */
export function deriveStatus(
  activeDispatch: ActiveDispatchInput | null,
  activeBreak: ActiveBreakInput | null,
): DerivedStatus {
  // 1. 休憩が最優先
  if (activeBreak) {
    return {
      status: 'BREAK',
      activeDispatch: null,
      activeBreak: {
        id: activeBreak.id,
        startTime: activeBreak.startTime.toISOString(),
      },
    }
  }

  // 2. アクティブな Dispatch があり、サブフェーズに当てはまる場合
  if (activeDispatch) {
    const subPhase = mapStatusToSubPhase(
      activeDispatch.status,
      activeDispatch.returnTime,
    )
    if (subPhase !== null) {
      return {
        status: 'DISPATCHING',
        activeDispatch: {
          id: activeDispatch.id,
          dispatchNumber: activeDispatch.dispatchNumber,
          subPhase,
          assistanceName: activeDispatch.assistance.name,
        },
        activeBreak: null,
      }
    }
  }

  // 3. それ以外は待機中
  return {
    status: 'STANDBY',
    activeDispatch: null,
    activeBreak: null,
  }
}
