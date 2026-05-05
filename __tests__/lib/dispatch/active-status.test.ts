import { describe, it, expect } from 'vitest'
import {
  isActiveDispatchStatus,
  mapStatusToSubPhase,
} from '@/lib/dispatch/active-status'

/**
 * isActiveDispatchStatus の真理値表テスト。
 *
 * 仕様: `app/api/dispatches/active/route.ts` の where 句と完全一致させる。
 *   - DISPATCHED / ONSITE / TRANSPORTING → true
 *   - COMPLETED && returnTime IS NULL    → true（帰社中）
 *   - (COMPLETED || RETURNED) && returnTime !== null && isDraft === false → true
 *     （帰社後・書類作成未着手 / 2026-05-05 ユーザー確定 Phase 5.5 拡張）
 *   - (COMPLETED || RETURNED) && returnTime !== null && isDraft === true  → false
 *   - WORKING / STANDBY / STORED / CANCELLED / TRANSFERRED → false
 */
describe('isActiveDispatchStatus', () => {
  const SOME_DATE = new Date('2026-05-04T10:00:00.000Z')

  it('DISPATCHED → true（returnTime / isDraft に関わらず）', () => {
    expect(isActiveDispatchStatus('DISPATCHED', null, false)).toBe(true)
    expect(isActiveDispatchStatus('DISPATCHED', SOME_DATE, false)).toBe(true)
    expect(isActiveDispatchStatus('DISPATCHED', null, true)).toBe(true)
    expect(isActiveDispatchStatus('DISPATCHED', SOME_DATE, true)).toBe(true)
  })

  it('ONSITE → true', () => {
    expect(isActiveDispatchStatus('ONSITE', null, false)).toBe(true)
    expect(isActiveDispatchStatus('ONSITE', SOME_DATE, false)).toBe(true)
    expect(isActiveDispatchStatus('ONSITE', null, true)).toBe(true)
  })

  it('TRANSPORTING → true', () => {
    expect(isActiveDispatchStatus('TRANSPORTING', null, false)).toBe(true)
    expect(isActiveDispatchStatus('TRANSPORTING', SOME_DATE, false)).toBe(true)
    expect(isActiveDispatchStatus('TRANSPORTING', null, true)).toBe(true)
  })

  it('COMPLETED && returnTime === null → true（帰社中）', () => {
    expect(isActiveDispatchStatus('COMPLETED', null, false)).toBe(true)
    expect(isActiveDispatchStatus('COMPLETED', null, true)).toBe(true)
  })

  it('COMPLETED && returnTime !== null && isDraft === false → true（帰社後・書類未着手 / 2026-05-05 拡張）', () => {
    expect(isActiveDispatchStatus('COMPLETED', SOME_DATE, false)).toBe(true)
  })

  it('COMPLETED && returnTime !== null && isDraft === true → false（書類作成中はガード解除）', () => {
    expect(isActiveDispatchStatus('COMPLETED', SOME_DATE, true)).toBe(false)
  })

  it('RETURNED && returnTime !== null && isDraft === false → true（帰社後・書類未着手 / 2026-05-05 拡張）', () => {
    expect(isActiveDispatchStatus('RETURNED', SOME_DATE, false)).toBe(true)
  })

  it('RETURNED && returnTime !== null && isDraft === true → false（書類作成中はガード解除）', () => {
    expect(isActiveDispatchStatus('RETURNED', SOME_DATE, true)).toBe(false)
  })

  it('RETURNED && returnTime === null → false（業務上ありえない / 防御的に false）', () => {
    expect(isActiveDispatchStatus('RETURNED', null, false)).toBe(false)
    expect(isActiveDispatchStatus('RETURNED', null, true)).toBe(false)
  })

  it('WORKING → false（schema デッドコードのため新シグネチャ対象外 / 2026-05-05 ユーザー確認確定）', () => {
    // WORKING はリグレッション検出用。新仕様で WORKING を含めないことの保証。
    expect(isActiveDispatchStatus('WORKING', null, false)).toBe(false)
    expect(isActiveDispatchStatus('WORKING', null, true)).toBe(false)
    expect(isActiveDispatchStatus('WORKING', SOME_DATE, false)).toBe(false)
    expect(isActiveDispatchStatus('WORKING', SOME_DATE, true)).toBe(false)
  })

  it('STANDBY → false', () => {
    expect(isActiveDispatchStatus('STANDBY', null, false)).toBe(false)
    expect(isActiveDispatchStatus('STANDBY', null, true)).toBe(false)
  })

  it('STORED → false', () => {
    expect(isActiveDispatchStatus('STORED', null, false)).toBe(false)
    expect(isActiveDispatchStatus('STORED', SOME_DATE, false)).toBe(false)
    expect(isActiveDispatchStatus('STORED', SOME_DATE, true)).toBe(false)
  })

  it('CANCELLED → false', () => {
    expect(isActiveDispatchStatus('CANCELLED', null, false)).toBe(false)
    expect(isActiveDispatchStatus('CANCELLED', SOME_DATE, false)).toBe(false)
    expect(isActiveDispatchStatus('CANCELLED', SOME_DATE, true)).toBe(false)
  })

  it('TRANSFERRED → false', () => {
    expect(isActiveDispatchStatus('TRANSFERRED', null, false)).toBe(false)
    expect(isActiveDispatchStatus('TRANSFERRED', SOME_DATE, false)).toBe(false)
    expect(isActiveDispatchStatus('TRANSFERRED', SOME_DATE, true)).toBe(false)
  })

  it('未知の status 文字列 → false', () => {
    expect(isActiveDispatchStatus('UNKNOWN_STATUS', null, false)).toBe(false)
    expect(isActiveDispatchStatus('UNKNOWN_STATUS', SOME_DATE, true)).toBe(false)
  })
})

/**
 * mapStatusToSubPhase の再エクスポート確認。
 * 本体実装は `lib/admin/status-derivation.ts` にあり、本モジュールは挙動一致を担保する。
 */
describe('mapStatusToSubPhase（再エクスポート挙動一致）', () => {
  const SOME_DATE = new Date('2026-05-04T10:00:00.000Z')

  it('DISPATCHED → DISPATCHING', () => {
    expect(mapStatusToSubPhase('DISPATCHED', null)).toBe('DISPATCHING')
  })

  it('ONSITE → ONSITE', () => {
    expect(mapStatusToSubPhase('ONSITE', null)).toBe('ONSITE')
  })

  it('TRANSPORTING → TRANSPORTING', () => {
    expect(mapStatusToSubPhase('TRANSPORTING', null)).toBe('TRANSPORTING')
  })

  it('COMPLETED && returnTime === null → RETURNING_TO_BASE', () => {
    expect(mapStatusToSubPhase('COMPLETED', null)).toBe('RETURNING_TO_BASE')
  })

  it('COMPLETED && returnTime !== null → null（待機扱い）', () => {
    expect(mapStatusToSubPhase('COMPLETED', SOME_DATE)).toBe(null)
  })

  it('STANDBY / WORKING / RETURNED / STORED / CANCELLED / TRANSFERRED → null', () => {
    expect(mapStatusToSubPhase('STANDBY', null)).toBe(null)
    expect(mapStatusToSubPhase('WORKING', null)).toBe(null)
    expect(mapStatusToSubPhase('RETURNED', null)).toBe(null)
    expect(mapStatusToSubPhase('STORED', null)).toBe(null)
    expect(mapStatusToSubPhase('CANCELLED', null)).toBe(null)
    expect(mapStatusToSubPhase('TRANSFERRED', null)).toBe(null)
  })
})
