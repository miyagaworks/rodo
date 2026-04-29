/**
 * AdminShell コンポーネントのテスト（Phase 2.5: SP 専用 + 右スライドイン）
 *
 * - md:hidden ラッパーで PC では DOM 出力が非表示
 * - open=false: ドロワーは閉じている（translate-x-full で右画面外）
 * - open=true: ドロワーは開いている（translate-x-0）
 * - 右起点（top-0 right-0）配置
 * - オーバーレイクリックで onClose
 * - ESC キーで onClose
 * - 閉じるボタン（×）で onClose
 * - body の overflow が hidden になる（open=true）
 * - adminName が AdminMenu に渡される
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// AdminMenu はモック（usePathname を呼ぶため）
vi.mock('@/components/admin/AdminMenu', () => ({
  default: ({
    onItemClick,
    adminName,
  }: {
    onItemClick?: () => void
    adminName?: string | null
  }) => (
    <div data-testid="admin-menu" onClick={onItemClick}>
      AdminMenu{adminName ? `:${adminName}` : ''}
    </div>
  ),
}))

import AdminShell from '@/components/admin/AdminShell'

describe('AdminShell（SP 専用ドロワー、右スライドイン）', () => {
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('ラッパー要素に md:hidden クラスが付く（PC では DOM 非出力扱い）', () => {
    const onClose = vi.fn()
    const { container } = render(<AdminShell open={false} onClose={onClose} />)

    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('md:hidden')
  })

  it('open=false ではドロワーが閉じている（translate-x-full で右画面外）', () => {
    const onClose = vi.fn()
    render(<AdminShell open={false} onClose={onClose} />)

    const drawer = screen.getByLabelText('管理者ナビゲーション')
    expect(drawer.className).toContain('translate-x-full')
    expect(drawer.className).not.toContain('-translate-x-full')
  })

  it('open=true ではドロワーが開いている（translate-x-0）', () => {
    const onClose = vi.fn()
    render(<AdminShell open={true} onClose={onClose} />)

    const drawer = screen.getByLabelText('管理者ナビゲーション')
    expect(drawer.className).toContain('translate-x-0')
  })

  it('ドロワーは右起点（right-0、left クラスは付かない）', () => {
    const onClose = vi.fn()
    render(<AdminShell open={true} onClose={onClose} />)

    const drawer = screen.getByLabelText('管理者ナビゲーション')
    expect(drawer.className).toContain('right-0')
    expect(drawer.className).not.toContain('left-0')
  })

  it('オーバーレイクリックで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    const { container } = render(
      <AdminShell open={true} onClose={onClose} />,
    )

    const overlay = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('閉じるボタン（×）で onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(<AdminShell open={true} onClose={onClose} />)

    const closeBtn = screen.getByLabelText('メニューを閉じる')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ESC キーで onClose が呼ばれる（open=true のとき）', () => {
    const onClose = vi.fn()
    render(<AdminShell open={true} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ESC キーは open=false では onClose を呼ばない', () => {
    const onClose = vi.fn()
    render(<AdminShell open={false} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('open=true で body の overflow が hidden になる', () => {
    const onClose = vi.fn()
    const { unmount } = render(<AdminShell open={true} onClose={onClose} />)

    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('adminName が AdminMenu に渡される', () => {
    const onClose = vi.fn()
    render(
      <AdminShell open={true} onClose={onClose} adminName="鈴木花子" />,
    )

    expect(screen.getByTestId('admin-menu').textContent).toBe(
      'AdminMenu:鈴木花子',
    )
  })
})
