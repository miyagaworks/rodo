/**
 * MemberStatusCard コンポーネントのテスト
 *
 * 各 status (STANDBY/DISPATCHING/BREAK) で正しい表示を検証:
 * - ステータスバッジの色とラベル
 * - 出動中: サブフェーズ表示 + 案件番号 + AS 名
 * - 休憩中: 経過時間表示
 * - 待機中: 補足なし
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
    it('ステータスバッジに「待機中」が表示される', () => {
      render(<MemberStatusCard member={baseMember} />)

      expect(screen.getByTestId('status-badge')).toHaveTextContent('待機中')
    })

    it('隊員名が表示される', () => {
      render(<MemberStatusCard member={baseMember} />)

      expect(screen.getByText('山田太郎')).toBeTruthy()
    })

    it('サブフェーズは表示されない', () => {
      render(<MemberStatusCard member={baseMember} />)

      expect(screen.queryByTestId('sub-phase')).toBeNull()
    })

    it('案件番号は表示されない', () => {
      render(<MemberStatusCard member={baseMember} />)

      expect(screen.queryByTestId('dispatch-number')).toBeNull()
    })

    it('バッジに gray 系のクラスが適用される', () => {
      render(<MemberStatusCard member={baseMember} />)

      const badge = screen.getByTestId('status-badge')
      expect(badge.className).toContain('bg-gray-300')
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

    it('ステータスバッジに「出動中」が表示される', () => {
      render(<MemberStatusCard member={dispatchingMember} />)

      expect(screen.getByTestId('status-badge')).toHaveTextContent('出動中')
    })

    it('バッジに blue 系のクラスが適用される', () => {
      render(<MemberStatusCard member={dispatchingMember} />)

      const badge = screen.getByTestId('status-badge')
      expect(badge.className).toContain('bg-blue-500')
    })

    it('サブフェーズ「作業中」が表示される', () => {
      render(<MemberStatusCard member={dispatchingMember} />)

      expect(screen.getByTestId('sub-phase')).toHaveTextContent('作業中')
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
      ['DISPATCHING', '出動中'],
      ['ONSITE', '作業中'],
      ['TRANSPORTING', '搬送中'],
      ['RETURNING_TO_BASE', '帰社中'],
    ] as const)('サブフェーズ %s のとき「%s」と表示される', (subPhase, label) => {
      const m: MemberStatusItem = {
        ...dispatchingMember,
        activeDispatch: {
          ...dispatchingMember.activeDispatch!,
          subPhase,
        },
      }
      render(<MemberStatusCard member={m} />)

      expect(screen.getByTestId('sub-phase')).toHaveTextContent(label)
    })
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

    it('ステータスバッジに「休憩中」が表示される', () => {
      render(<MemberStatusCard member={breakMember} />)

      expect(screen.getByTestId('status-badge')).toHaveTextContent('休憩中')
    })

    it('バッジに amber 系のクラスが適用される', () => {
      render(<MemberStatusCard member={breakMember} />)

      const badge = screen.getByTestId('status-badge')
      expect(badge.className).toContain('bg-amber-500')
    })

    it('経過時間が表示される', () => {
      render(<MemberStatusCard member={breakMember} />)

      // 5 分 = 05:00
      expect(screen.getByTestId('break-duration')).toHaveTextContent('05:00')
    })

    it('案件番号は表示されない', () => {
      render(<MemberStatusCard member={breakMember} />)

      expect(screen.queryByTestId('dispatch-number')).toBeNull()
    })
  })
})
