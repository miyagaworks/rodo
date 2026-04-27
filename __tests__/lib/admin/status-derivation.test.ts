import { describe, it, expect } from 'vitest'
import {
  deriveStatus,
  mapStatusToSubPhase,
  type ActiveDispatchInput,
  type ActiveBreakInput,
} from '@/lib/admin/status-derivation'

const baseDispatch = (
  overrides: Partial<ActiveDispatchInput> = {},
): ActiveDispatchInput => ({
  id: 'd1',
  dispatchNumber: '20260427001',
  status: 'DISPATCHED',
  returnTime: null,
  assistance: { name: 'PA' },
  ...overrides,
})

const baseBreak = (
  overrides: Partial<ActiveBreakInput> = {},
): ActiveBreakInput => ({
  id: 'b1',
  startTime: new Date('2026-04-27T10:00:00Z'),
  ...overrides,
})

describe('mapStatusToSubPhase', () => {
  it('DISPATCHED → DISPATCHING', () => {
    expect(mapStatusToSubPhase('DISPATCHED', null)).toBe('DISPATCHING')
  })

  it('ONSITE → ONSITE', () => {
    expect(mapStatusToSubPhase('ONSITE', null)).toBe('ONSITE')
  })

  it('TRANSPORTING → TRANSPORTING', () => {
    expect(mapStatusToSubPhase('TRANSPORTING', null)).toBe('TRANSPORTING')
  })

  it('COMPLETED && returnTime IS NULL → RETURNING_TO_BASE', () => {
    expect(mapStatusToSubPhase('COMPLETED', null)).toBe('RETURNING_TO_BASE')
  })

  it('COMPLETED && returnTime あり → null（帰社済み = 待機扱い）', () => {
    expect(mapStatusToSubPhase('COMPLETED', new Date())).toBeNull()
  })

  it.each(['STANDBY', 'WORKING', 'RETURNED', 'STORED', 'CANCELLED', 'TRANSFERRED'])(
    '%s → null（待機扱い）',
    (status) => {
      expect(mapStatusToSubPhase(status, null)).toBeNull()
      expect(mapStatusToSubPhase(status, new Date())).toBeNull()
    },
  )
})

describe('deriveStatus', () => {
  describe('休憩中（BREAK）', () => {
    it('アクティブな break のみあり → BREAK', () => {
      const result = deriveStatus(null, baseBreak())
      expect(result.status).toBe('BREAK')
      expect(result.activeDispatch).toBeNull()
      expect(result.activeBreak).toEqual({
        id: 'b1',
        startTime: '2026-04-27T10:00:00.000Z',
      })
    })

    it('break と dispatch が同時に立っていても break 優先', () => {
      const result = deriveStatus(
        baseDispatch({ status: 'ONSITE' }),
        baseBreak(),
      )
      expect(result.status).toBe('BREAK')
      expect(result.activeDispatch).toBeNull()
      expect(result.activeBreak).not.toBeNull()
    })
  })

  describe('出動中（DISPATCHING）の各サブフェーズ', () => {
    it('DISPATCHED → 出動中 (DISPATCHING)', () => {
      const result = deriveStatus(baseDispatch({ status: 'DISPATCHED' }), null)
      expect(result.status).toBe('DISPATCHING')
      expect(result.activeDispatch).toEqual({
        id: 'd1',
        dispatchNumber: '20260427001',
        subPhase: 'DISPATCHING',
        assistanceName: 'PA',
      })
      expect(result.activeBreak).toBeNull()
    })

    it('ONSITE → 作業中 (ONSITE)', () => {
      const result = deriveStatus(baseDispatch({ status: 'ONSITE' }), null)
      expect(result.status).toBe('DISPATCHING')
      expect(result.activeDispatch?.subPhase).toBe('ONSITE')
    })

    it('TRANSPORTING → 搬送中 (TRANSPORTING)', () => {
      const result = deriveStatus(baseDispatch({ status: 'TRANSPORTING' }), null)
      expect(result.status).toBe('DISPATCHING')
      expect(result.activeDispatch?.subPhase).toBe('TRANSPORTING')
    })

    it('COMPLETED && returnTime=null → 帰社中 (RETURNING_TO_BASE)', () => {
      const result = deriveStatus(
        baseDispatch({ status: 'COMPLETED', returnTime: null }),
        null,
      )
      expect(result.status).toBe('DISPATCHING')
      expect(result.activeDispatch?.subPhase).toBe('RETURNING_TO_BASE')
    })
  })

  describe('待機中（STANDBY）', () => {
    it('break も dispatch も無し → STANDBY', () => {
      const result = deriveStatus(null, null)
      expect(result.status).toBe('STANDBY')
      expect(result.activeDispatch).toBeNull()
      expect(result.activeBreak).toBeNull()
    })

    it('COMPLETED && returnTime あり（帰社済み）→ STANDBY', () => {
      const result = deriveStatus(
        baseDispatch({ status: 'COMPLETED', returnTime: new Date() }),
        null,
      )
      expect(result.status).toBe('STANDBY')
      expect(result.activeDispatch).toBeNull()
    })

    it.each(['WORKING', 'RETURNED', 'STORED', 'CANCELLED', 'TRANSFERRED', 'STANDBY'])(
      'status=%s（サブフェーズ未マッピング）→ STANDBY',
      (status) => {
        const result = deriveStatus(baseDispatch({ status }), null)
        expect(result.status).toBe('STANDBY')
        expect(result.activeDispatch).toBeNull()
      },
    )
  })
})
