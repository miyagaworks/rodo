/**
 * MemberStatusBadge コンポーネントのテスト。
 *
 * - 6 ステータス全パターンでラベル / 背景色 / アイコン種別が正しいこと
 * - aria-label にステータス名が入っていること
 * - data-business-status 属性で外部から状態を判別できること
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MemberStatusBadge from '@/components/admin/MemberStatusBadge'
import type { BusinessStatus } from '@/lib/admin/business-status'

/** jsdom は style の hex を rgb(...) に正規化するため、hex→rgb 文字列に変換 */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

interface Expectation {
  label: string
  bgColor: string
  iconKind: 'svg' | 'react-icon'
  iconSrc?: string
}

const EXPECTATIONS: Record<BusinessStatus, Expectation> = {
  standby: {
    label: '待機中',
    bgColor: '#2FBF71',
    iconKind: 'svg',
    iconSrc: '/icons/stand-by.svg',
  },
  dispatch: {
    label: '出動中',
    bgColor: '#D3170A',
    iconKind: 'svg',
    iconSrc: '/icons/dispatch.svg',
  },
  work: {
    label: '作業中',
    bgColor: '#ea7600',
    iconKind: 'svg',
    iconSrc: '/icons/work.svg',
  },
  transport: {
    label: '搬送中',
    bgColor: '#71A9F7',
    iconKind: 'svg',
    iconSrc: '/icons/transportation-start.svg',
  },
  return: {
    label: '帰社中',
    bgColor: '#1c2948',
    iconKind: 'svg',
    iconSrc: '/icons/return-truck.svg',
  },
  break: {
    label: '休憩中',
    bgColor: '#888888',
    iconKind: 'react-icon',
  },
}

describe('MemberStatusBadge', () => {
  it.each(Object.entries(EXPECTATIONS) as [BusinessStatus, Expectation][])(
    'status=%s → ラベル / 背景色 / アイコン種別が一致',
    (status, exp) => {
      const { container } = render(<MemberStatusBadge status={status} />)

      const badge = screen.getByTestId('status-badge')

      // ラベル
      expect(badge).toHaveTextContent(exp.label)

      // 背景色（インラインスタイル）— jsdom が rgb(...) に正規化するので変換して比較
      expect(badge.getAttribute('style') ?? '').toContain(
        `background-color: ${hexToRgb(exp.bgColor)}`,
      )

      // data-business-status
      expect(badge.getAttribute('data-business-status')).toBe(status)

      // aria-label
      expect(badge.getAttribute('aria-label')).toBe(exp.label)

      // アイコン種別
      const img = container.querySelector('img')
      if (exp.iconKind === 'svg') {
        expect(img).not.toBeNull()
        expect(img?.getAttribute('src')).toBe(exp.iconSrc)
      } else {
        // FaCoffee は <svg> として描画される（img タグでは無い）
        expect(img).toBeNull()
        // react-icons は role 無しの <svg> を吐く
        const svg = container.querySelector('svg')
        expect(svg).not.toBeNull()
      }
    },
  )

  it('長丸（rounded-full）クラスが適用される', () => {
    render(<MemberStatusBadge status="standby" />)
    const badge = screen.getByTestId('status-badge')
    expect(badge.className).toContain('rounded-full')
  })

  it('テキスト色がホワイト（text-white）', () => {
    render(<MemberStatusBadge status="dispatch" />)
    const badge = screen.getByTestId('status-badge')
    expect(badge.className).toContain('text-white')
  })
})
