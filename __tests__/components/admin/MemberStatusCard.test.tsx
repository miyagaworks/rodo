/**
 * MemberStatusCard コンポーネントのテスト（6色アイコンバッジ化対応版）。
 *
 * 旧仕様の bg-blue-500 / bg-amber-500 / bg-gray-300 検証は、
 * MemberStatusBadge 側に移譲されたため削除。
 *
 * このテストでは:
 * - 派生 status / subPhase に応じた `data-business-status` 属性
 * - 隊員名 / 案件番号 / AS 名 / 経過時間など補助情報の表示有無
 * - 待機中の補足非表示
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import MemberStatusCard from '@/components/admin/MemberStatusCard'
import type { MemberStatusItem } from '@/hooks/useMembersStatus'

// Date.now を固定して休憩の経過時間テストを安定化
const FIXED_NOW = new Date('2026-04-28T10:05:00.000Z').getTime()
let originalDateNow: typeof Date.now

beforeEach(() => {
  originalDateNow = Date.now
  Date.now = vi.fn(() => FIXED_NOW)
})

afterEach(() => {
  Date.now = originalDateNow
})

const baseMember: MemberStatusItem = {
  id: 'user-1',
  name: '山田太郎',
  vehicle: { plateNumber: '練馬500あ1234', displayName: 'トラックA' },
  status: 'STANDBY',
  activeDispatch: null,
  activeBreak: null,
}

describe('MemberStatusCard', () => {
  describe('待機中 (STANDBY)', () => {
    it('バッジに「待機中」が表示される', () => {
      render(<MemberStatusCard member={baseMember} />)

      expect(screen.getByTestId('status-badge')).toHaveTextContent('待機中')
    })

    it('バッジの business-status が "standby"', () => {
      render(<MemberStatusCard member={baseMember} />)

      expect(
        screen.getByTestId('status-badge').getAttribute('data-business-status'),
      ).toBe('standby')
    })

    it('隊員名が表示される', () => {
      render(<MemberStatusCard member={baseMember} />)

      expect(screen.getByText('山田太郎')).toBeTruthy()
    })

    it('案件番号は表示されない', () => {
      render(<MemberStatusCard member={baseMember} />)

      expect(screen.queryByTestId('dispatch-number')).toBeNull()
    })

    it('経過時間は表示されない', () => {
      render(<MemberStatusCard member={baseMember} />)

      expect(screen.queryByTestId('break-duration')).toBeNull()
    })
  })

  describe('出動中 (DISPATCHING)', () => {
    const dispatchingMember: MemberStatusItem = {
      ...baseMember,
      status: 'DISPATCHING',
      activeDispatch: {
        id: 'dispatch-1',
        dispatchNumber: '20260428-001',
        subPhase: 'ONSITE',
        assistanceName: 'PA',
      },
    }

    it('subPhase=ONSITE → バッジに「作業中」が表示される', () => {
      render(<MemberStatusCard member={dispatchingMember} />)

      expect(screen.getByTestId('status-badge')).toHaveTextContent('作業中')
    })

    it('subPhase=ONSITE → business-status が "work"', () => {
      render(<MemberStatusCard member={dispatchingMember} />)

      expect(
        screen.getByTestId('status-badge').getAttribute('data-business-status'),
      ).toBe('work')
    })

    it('案件番号が表示される', () => {
      render(<MemberStatusCard member={dispatchingMember} />)

      expect(screen.getByTestId('dispatch-number')).toHaveTextContent(
        '20260428-001',
      )
    })

    it('AS 名が表示される', () => {
      render(<MemberStatusCard member={dispatchingMember} />)

      expect(screen.getByTestId('assistance-name')).toHaveTextContent('PA')
    })

    it.each([
      ['DISPATCHING', '出動中', 'dispatch'],
      ['ONSITE', '作業中', 'work'],
      ['TRANSPORTING', '搬送中', 'transport'],
      ['RETURNING_TO_BASE', '帰社中', 'return'],
    ] as const)(
      'subPhase=%s → バッジ「%s」/ business-status=%s',
      (subPhase, label, businessStatus) => {
        const m: MemberStatusItem = {
          ...dispatchingMember,
          activeDispatch: {
            ...dispatchingMember.activeDispatch!,
            subPhase,
          },
        }
        render(<MemberStatusCard member={m} />)

        const badge = screen.getByTestId('status-badge')
        expect(badge).toHaveTextContent(label)
        expect(badge.getAttribute('data-business-status')).toBe(businessStatus)
      },
    )
  })

  describe('休憩中 (BREAK)', () => {
    const breakMember: MemberStatusItem = {
      ...baseMember,
      status: 'BREAK',
      activeBreak: {
        id: 'break-1',
        startTime: new Date('2026-04-28T10:00:00.000Z').toISOString(), // 5 分前
      },
    }

    it('バッジに「休憩中」が表示される', () => {
      render(<MemberStatusCard member={breakMember} />)

      expect(screen.getByTestId('status-badge')).toHaveTextContent('休憩中')
    })

    it('business-status が "break"', () => {
      render(<MemberStatusCard member={breakMember} />)

      expect(
        screen.getByTestId('status-badge').getAttribute('data-business-status'),
      ).toBe('break')
    })

    it('経過時間が表示される（5 分 → 05:00）', () => {
      render(<MemberStatusCard member={breakMember} />)

      expect(screen.getByTestId('break-duration')).toHaveTextContent('05:00')
    })

    it('案件番号は表示されない', () => {
      render(<MemberStatusCard member={breakMember} />)

      expect(screen.queryByTestId('dispatch-number')).toBeNull()
    })
  })
})
