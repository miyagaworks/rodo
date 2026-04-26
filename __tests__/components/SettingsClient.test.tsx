import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// 子コンポーネントをスタブ化
vi.mock('@/components/settings/AssistanceTab', () => ({
  default: () => <div data-testid="assistance-tab">AssistanceTab</div>,
}))
vi.mock('@/components/settings/MembersTab', () => ({
  default: () => <div data-testid="members-tab">MembersTab</div>,
}))
vi.mock('@/components/settings/VehiclesTab', () => ({
  default: () => <div data-testid="vehicles-tab">VehiclesTab</div>,
}))
vi.mock('@/components/settings/TenantTab', () => ({
  default: () => <div data-testid="tenant-tab">TenantTab</div>,
}))

import SettingsClient from '@/components/SettingsClient'

describe('SettingsClient', () => {
  // ── 正常系 ──

  it('ヘッダーに「設定」タイトルと戻るリンクを表示する', () => {
    render(<SettingsClient />)

    expect(screen.getByText('設定')).toBeInTheDocument()
    // 戻るボタンはアイコン（IoIosArrowBack）に変更済み。テキストではなく href="/" のリンクで検証
    const backLink = screen.getByRole('link', { name: '' })
    expect(backLink).toHaveAttribute('href', '/')
  })

  it('4つのタブトリガーを表示する', () => {
    render(<SettingsClient />)

    expect(screen.getByText('アシスタンス')).toBeInTheDocument()
    expect(screen.getByText('隊員登録')).toBeInTheDocument()
    expect(screen.getByText('車両管理')).toBeInTheDocument()
    expect(screen.getByText('テナント設定')).toBeInTheDocument()
  })

  it('デフォルトでアシスタンスタブが表示される', () => {
    render(<SettingsClient />)

    expect(screen.getByTestId('assistance-tab')).toBeInTheDocument()
  })

  it('タブトリガーが正しい role="tab" 属性を持つ', () => {
    render(<SettingsClient />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
    expect(tabs[0]).toHaveTextContent('アシスタンス')
    expect(tabs[1]).toHaveTextContent('隊員登録')
    expect(tabs[2]).toHaveTextContent('車両管理')
    expect(tabs[3]).toHaveTextContent('テナント設定')
  })

  it('デフォルトでアシスタンスタブが active、その他は inactive', () => {
    render(<SettingsClient />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('data-state', 'active')
    expect(tabs[1]).toHaveAttribute('data-state', 'inactive')
    expect(tabs[2]).toHaveAttribute('data-state', 'inactive')
    expect(tabs[3]).toHaveAttribute('data-state', 'inactive')
  })

  it('tabpanel にアシスタンスタブの内容が表示される', () => {
    render(<SettingsClient />)

    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('data-state', 'active')
    expect(screen.getByTestId('assistance-tab')).toBeInTheDocument()
  })

  // ── スタイル検証 ──

  it('ヘッダーの背景色が正しい', () => {
    render(<SettingsClient />)

    const header = screen.getByText('設定').closest('header')!
    expect(header).toHaveStyle({ backgroundColor: '#1C2948' })
  })

  it('ページ全体の背景色が正しい', () => {
    const { container } = render(<SettingsClient />)

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveStyle({ backgroundColor: '#C6D8FF' })
    expect(root).toHaveClass('min-h-screen')
  })
})
