import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

// AppHeader モック（共通ヘッダー。signOut 等の依存を切り離す）
vi.mock('@/components/common/AppHeader', () => ({
  default: ({
    showMenuButton,
    onMenuClick,
    session,
  }: {
    showMenuButton?: boolean
    onMenuClick?: () => void
    session: { user: { name?: string | null } }
  }) => (
    <div data-testid="app-header">
      {showMenuButton && (
        <button aria-label="メニューを開く" onClick={onMenuClick}>
          menu
        </button>
      )}
      <span>{session.user.name}</span>
    </div>
  ),
}))

// AdminShell モック（HomeClient と同様、内部で usePathname を使うため）
vi.mock('@/components/admin/AdminShell', () => ({
  default: ({ open }: { open: boolean }) => (
    <div data-testid="admin-shell" data-open={open} />
  ),
}))

// AppFooter モック
vi.mock('@/components/common/AppFooter', () => ({
  default: () => <div data-testid="app-footer" />,
}))

import SettingsClient from '@/components/SettingsClient'

const mockSession = {
  user: {
    name: 'テスト管理者',
    role: 'ADMIN' as const,
    tenantId: 'tenant-1',
  },
  expires: '2099-01-01',
}

describe('SettingsClient', () => {
  // ── 正常系 ──

  it('サブタイトルとして「設定」を表示する', () => {
    render(<SettingsClient session={mockSession as any} />)

    expect(screen.getByText('設定')).toBeInTheDocument()
  })

  it('AppHeader を表示する（☰ ボタン付き）', () => {
    render(<SettingsClient session={mockSession as any} />)

    expect(screen.getByTestId('app-header')).toBeInTheDocument()
    expect(screen.getByLabelText('メニューを開く')).toBeInTheDocument()
  })

  it('「← 戻る」リンクは表示しない（廃止済み）', () => {
    render(<SettingsClient session={mockSession as any} />)

    // 戻る用の link は存在しない
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('4つのタブトリガーを表示する', () => {
    render(<SettingsClient session={mockSession as any} />)

    expect(screen.getByText('アシスタンス')).toBeInTheDocument()
    expect(screen.getByText('隊員登録')).toBeInTheDocument()
    expect(screen.getByText('車両管理')).toBeInTheDocument()
    expect(screen.getByText('テナント設定')).toBeInTheDocument()
  })

  it('デフォルトでアシスタンスタブが表示される', () => {
    render(<SettingsClient session={mockSession as any} />)

    expect(screen.getByTestId('assistance-tab')).toBeInTheDocument()
  })

  it('タブトリガーが正しい role="tab" 属性を持つ', () => {
    render(<SettingsClient session={mockSession as any} />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
    expect(tabs[0]).toHaveTextContent('アシスタンス')
    expect(tabs[1]).toHaveTextContent('隊員登録')
    expect(tabs[2]).toHaveTextContent('車両管理')
    expect(tabs[3]).toHaveTextContent('テナント設定')
  })

  it('デフォルトでアシスタンスタブが active、その他は inactive', () => {
    render(<SettingsClient session={mockSession as any} />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('data-state', 'active')
    expect(tabs[1]).toHaveAttribute('data-state', 'inactive')
    expect(tabs[2]).toHaveAttribute('data-state', 'inactive')
    expect(tabs[3]).toHaveAttribute('data-state', 'inactive')
  })

  it('tabpanel にアシスタンスタブの内容が表示される', () => {
    render(<SettingsClient session={mockSession as any} />)

    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('data-state', 'active')
    expect(screen.getByTestId('assistance-tab')).toBeInTheDocument()
  })

  // ── スタイル検証 ──

  it('ページ全体の背景色が正しい', () => {
    const { container } = render(<SettingsClient session={mockSession as any} />)

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveStyle({ backgroundColor: '#C6D8FF' })
    expect(root).toHaveClass('min-h-screen')
  })
})
