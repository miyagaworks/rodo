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
 *   - COMPLETED && returnTime IS NULL    → true
 *   - COMPLETED && returnTime !== null   → false
 *   - WORKING / STANDBY / RETURNED / STORED / CANCELLED / TRANSFERRED → false
 */
describe('isActiveDispatchStatus', () => {
  const SOME_DATE = new Date('2026-05-04T10:00:00.000Z')

  it('DISPATCHED → true（returnTime に関わらず）', () => {
    expect(isActiveDispatchStatus('DISPATCHED', null)).toBe(true)
    expect(isActiveDispatchStatus('DISPATCHED', SOME_DATE)).toBe(true)
  })

  it('ONSITE → true', () => {
    expect(isActiveDispatchStatus('ONSITE', null)).toBe(true)
    expect(isActiveDispatchStatus('ONSITE', SOME_DATE)).toBe(true)
  })

  it('TRANSPORTING → true', () => {
    expect(isActiveDispatchStatus('TRANSPORTING', null)).toBe(true)
    expect(isActiveDispatchStatus('TRANSPORTING', SOME_DATE)).toBe(true)
  })

  it('COMPLETED && returnTime === null → true（帰社中）', () => {
    expect(isActiveDispatchStatus('COMPLETED', null)).toBe(true)
  })

  it('COMPLETED && returnTime !== null → false（帰社済み）', () => {
    expect(isActiveDispatchStatus('COMPLETED', SOME_DATE)).toBe(false)
  })

  it('WORKING → false（active 判定からは除外）', () => {
    expect(isActiveDispatchStatus('WORKING', null)).toBe(false)
    expect(isActiveDispatchStatus('WORKING', SOME_DATE)).toBe(false)
  })

  it('STANDBY → false', () => {
    expect(isActiveDispatchStatus('STANDBY', null)).toBe(false)
  })

  it('RETURNED → false', () => {
    expect(isActiveDispatchStatus('RETURNED', null)).toBe(false)
    expect(isActiveDispatchStatus('RETURNED', SOME_DATE)).toBe(false)
  })

  it('STORED → false', () => {
    expect(isActiveDispatchStatus('STORED', null)).toBe(false)
    expect(isActiveDispatchStatus('STORED', SOME_DATE)).toBe(false)
  })

  it('CANCELLED → false', () => {
    expect(isActiveDispatchStatus('CANCELLED', null)).toBe(false)
    expect(isActiveDispatchStatus('CANCELLED', SOME_DATE)).toBe(false)
  })

  it('TRANSFERRED → false', () => {
    expect(isActiveDispatchStatus('TRANSFERRED', null)).toBe(false)
    expect(isActiveDispatchStatus('TRANSFERRED', SOME_DATE)).toBe(false)
  })

  it('未知の status 文字列 → false', () => {
    expect(isActiveDispatchStatus('UNKNOWN_STATUS', null)).toBe(false)
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
