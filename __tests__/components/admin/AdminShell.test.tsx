/**
 * AdminShell コンポーネントのテスト
 *
 * - open=false のときドロワーは閉じている（-translate-x-full）
 * - open=true のときドロワーは開いている（translate-x-0）
 * - オーバーレイクリックで onClose が呼ばれる
 * - ESC キーで onClose が呼ばれる
 * - 閉じるボタン（×）で onClose が呼ばれる
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// AdminMenu はモック（usePathname を呼ぶため）
vi.mock('@/components/admin/AdminMenu', () => ({
  default: ({ onItemClick }: { onItemClick?: () => void }) => (
    <div data-testid="admin-menu" onClick={onItemClick}>
      AdminMenu
    </div>
  ),
}))

import AdminShell from '@/components/admin/AdminShell'

describe('AdminShell', () => {
  afterEach(() => {
    // body スタイルのクリーンアップ
    document.body.style.overflow = ''
  })

  it('open=false ではドロワーが閉じている（-translate-x-full）', () => {
    const onClose = vi.fn()
    render(<AdminShell open={false} onClose={onClose} isAdminPage={false} />)

    const drawer = screen.getByLabelText('管理者ナビゲーション')
    expect(drawer.className).toContain('-translate-x-full')
  })

  it('open=true ではドロワーが開いている（translate-x-0）', () => {
    const onClose = vi.fn()
    render(<AdminShell open={true} onClose={onClose} isAdminPage={false} />)

    const drawer = screen.getByLabelText('管理者ナビゲーション')
    expect(drawer.className).toContain('translate-x-0')
  })

  it('オーバーレイクリックで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    const { container } = render(
      <AdminShell open={true} onClose={onClose} isAdminPage={false} />,
    )

    const overlay = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('閉じるボタン（×）で onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(<AdminShell open={true} onClose={onClose} isAdminPage={false} />)

    const closeBtn = screen.getByLabelText('メニューを閉じる')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ESC キーで onClose が呼ばれる（open=true のとき）', () => {
    const onClose = vi.fn()
    render(<AdminShell open={true} onClose={onClose} isAdminPage={false} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ESC キーは open=false では onClose を呼ばない', () => {
    const onClose = vi.fn()
    render(<AdminShell open={false} onClose={onClose} isAdminPage={false} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('open=true で body の overflow が hidden になる', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <AdminShell open={true} onClose={onClose} isAdminPage={false} />,
    )

    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    // unmount で復元される
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('isAdminPage=true ではドロワーに md:translate-x-0 / md:static クラスが付く', () => {
    const onClose = vi.fn()
    render(<AdminShell open={false} onClose={onClose} isAdminPage={true} />)

    const drawer = screen.getByLabelText('管理者ナビゲーション')
    expect(drawer.className).toContain('md:translate-x-0')
    expect(drawer.className).toContain('md:static')
  })

  it('isAdminPage=false ではオーバーレイに md:hidden クラスが付かない（PC でもオーバーレイ表示）', () => {
    const onClose = vi.fn()
    const { container } = render(
      <AdminShell open={true} onClose={onClose} isAdminPage={false} />,
    )

    const overlay = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(overlay.className).not.toContain('md:hidden')
  })

  it('isAdminPage=true ではオーバーレイに md:hidden クラスが付く（PC ではオーバーレイ非表示）', () => {
    const onClose = vi.fn()
    const { container } = render(
      <AdminShell open={true} onClose={onClose} isAdminPage={true} />,
    )

    const overlay = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(overlay.className).toContain('md:hidden')
  })
})
