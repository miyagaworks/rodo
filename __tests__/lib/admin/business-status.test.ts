/**
 * toBusinessStatus の単体テスト。
 *
 * - 各 (status, subPhase) 組み合わせで業務 6 ステータスへの変換が正しいか
 * - 休憩中（BREAK）が他のすべてに優先するか
 * - 想定外 subPhase は 'standby' にフォールバックするか
 */
import { describe, it, expect } from 'vitest'
import { toBusinessStatus } from '@/lib/admin/business-status'
import type { MemberStatusItem } from '@/hooks/useMembersStatus'

const baseMember: MemberStatusItem = {
  id: 'user-1',
  name: '山田太郎',
  vehicle: null,
  status: 'STANDBY',
  activeDispatch: null,
  activeBreak: null,
}

describe('toBusinessStatus', () => {
  describe('待機中', () => {
    it('status="STANDBY" → "standby"', () => {
      expect(toBusinessStatus(baseMember)).toBe('standby')
    })
  })

  describe('出動中（subPhase 別）', () => {
    it.each([
      ['DISPATCHING', 'dispatch'],
      ['ONSITE', 'work'],
      ['TRANSPORTING', 'transport'],
      ['RETURNING_TO_BASE', 'return'],
    ] as const)(
      'subPhase=%s → BusinessStatus=%s',
      (subPhase, expected) => {
        const member: MemberStatusItem = {
          ...baseMember,
          status: 'DISPATCHING',
          activeDispatch: {
            id: 'd1',
            dispatchNumber: '20260502-001',
            subPhase,
            assistanceName: 'PA',
          },
        }
        expect(toBusinessStatus(member)).toBe(expected)
      },
    )

    it('status="DISPATCHING" だが activeDispatch が null（防御的）→ "standby"', () => {
      const member: MemberStatusItem = {
        ...baseMember,
        status: 'DISPATCHING',
        activeDispatch: null,
      }
      expect(toBusinessStatus(member)).toBe('standby')
    })

    it('subPhase が想定外値（防御的）→ "standby"', () => {
      // 型上は到達不能だが、サーバ側仕様変更等で未知の subPhase が来た場合の防御
      const member = {
        ...baseMember,
        status: 'DISPATCHING',
        activeDispatch: {
          id: 'd1',
          dispatchNumber: '20260502-001',
          subPhase: 'UNKNOWN_PHASE',
          assistanceName: 'PA',
        },
      } as unknown as MemberStatusItem
      expect(toBusinessStatus(member)).toBe('standby')
    })
  })

  describe('休憩中（BREAK は最優先）', () => {
    it('status="BREAK" → "break"', () => {
      const member: MemberStatusItem = {
        ...baseMember,
        status: 'BREAK',
        activeBreak: {
          id: 'b1',
          startTime: new Date().toISOString(),
        },
      }
      expect(toBusinessStatus(member)).toBe('break')
    })

    it('status="BREAK" は activeDispatch が同時に立っていても "break" を返す（防御的優先）', () => {
      const member: MemberStatusItem = {
        ...baseMember,
        status: 'BREAK',
        activeDispatch: {
          id: 'd1',
          dispatchNumber: '20260502-001',
          subPhase: 'ONSITE',
          assistanceName: 'PA',
        },
        activeBreak: {
          id: 'b1',
          startTime: new Date().toISOString(),
        },
      }
      expect(toBusinessStatus(member)).toBe('break')
    })
  })
})
