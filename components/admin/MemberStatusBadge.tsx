'use client'

import { FaCoffee } from 'react-icons/fa'
import type { BusinessStatus } from '@/lib/admin/business-status'

/**
 * 業務 6 ステータスを示すアイコン付きバッジ。
 *
 * - 形状: 長丸（rounded-full / pill）
 * - サイズ: 高さ 28px / 横 padding 14px / 標準アイコン 16px / フォント 14px
 * - 色: 6ステータスごとに固定（ホワイト文字 + ホワイトアイコン）
 * - アイコン: 5ステータスは public/icons/ 配下の SVG（brightness-0 invert で白抜き）
 *           休憩中のみ react-icons の FaCoffee
 * - 例外サイズ: 搬送中のアイコンは視認性向上のため 20px に拡大
 *
 * 注: SVG アイコンは brightness-0 invert で白抜き化する（ProcessingBar.tsx 等の既存パターン踏襲）。
 */

interface BadgeConfig {
  bgColor: string
  label: string
  iconType: 'svg' | 'react-icon'
  iconSrc?: string
  /** アイコンサイズの Tailwind クラス。未指定時は w-4 h-4 (16px) */
  iconSizeClass?: string
}

const DEFAULT_ICON_SIZE_CLASS = 'w-4 h-4'

const BADGE_CONFIG: Record<BusinessStatus, BadgeConfig> = {
  standby: {
    bgColor: '#2FBF71',
    label: '待機中',
    iconType: 'svg',
    iconSrc: '/icons/stand-by.svg',
  },
  dispatch: {
    bgColor: '#D3170A',
    label: '出動中',
    iconType: 'svg',
    iconSrc: '/icons/dispatch.svg',
  },
  work: {
    bgColor: '#ea7600',
    label: '作業中',
    iconType: 'svg',
    iconSrc: '/icons/work.svg',
  },
  transport: {
    bgColor: '#71A9F7',
    label: '搬送中',
    iconType: 'svg',
    iconSrc: '/icons/transportation-start.svg',
    iconSizeClass: 'w-5 h-5',
  },
  return: {
    bgColor: '#1c2948',
    label: '帰社中',
    iconType: 'svg',
    iconSrc: '/icons/return-truck.svg',
  },
  break: {
    bgColor: '#888888',
    label: '休憩中',
    iconType: 'react-icon',
  },
}

interface MemberStatusBadgeProps {
  status: BusinessStatus
}

export default function MemberStatusBadge({ status }: MemberStatusBadgeProps) {
  const config = BADGE_CONFIG[status]
  const iconSize = config.iconSizeClass ?? DEFAULT_ICON_SIZE_CLASS

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white"
      style={{ backgroundColor: config.bgColor, height: '28px' }}
      data-testid="status-badge"
      data-business-status={status}
      aria-label={config.label}
      role="status"
    >
      {config.iconType === 'svg' ? (
        // 既存の /icons/*.svg 参照は素の <img> で統一（ProcessingBar.tsx 等）。
        // brightness-0 invert で白抜き化する。
        // eslint-disable-next-line @next/next/no-img-element -- 既存 SVG 参照パターンと統一
        <img
          src={config.iconSrc}
          alt=""
          aria-hidden="true"
          className={`${iconSize} brightness-0 invert flex-shrink-0`}
        />
      ) : (
        <FaCoffee aria-hidden="true" className={`${iconSize} flex-shrink-0`} />
      )}
      <span>{config.label}</span>
    </span>
  )
}
