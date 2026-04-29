/**
 * DispatchCalendar のテスト
 *
 * - 月グリッド描画（曜日ヘッダ + 42 セル相当）
 * - PC: 「+N 件」バッジは廃止、詳細ボタン → onJumpToTable
 * - 月ナビボタンで year/month が更新され API 再取得される
 * - SP 詳細ボタンクリックでモーダルが開き、1 次 + 2 次が表示される
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import DispatchCalendar from '@/components/admin/DispatchCalendar'

function wrap(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

interface CalendarPrimary {
  dispatchNumber: string
  plate: { region: string; class: string; kana: string; number: string } | null
  type?: 'ONSITE' | 'TRANSPORT'
  /** ISO 文字列。クライアントで dispatchTime ASC ソートに使う */
  dispatchTime?: string | null
  /** 下書きフラグ。指定なしは false。 */
  isDraft?: boolean
}

function plate(region = '練馬'): CalendarPrimary['plate'] {
  return { region, class: '500', kana: 'あ', number: '1234' }
}

/**
 * 月の全日を生成（特定日に items を入れる、必要なら secondary 件数 or 配列も）。
 * year/month は 1-12 想定。
 *
 * injectSecondary は便宜上「件数 (number)」または「明示配列 (CalendarPrimary[])」のどちらでも渡せる。
 * number 指定の場合は適当なダミー dispatch を件数分生成する。
 */
function buildDays(
  year: number,
  month: number,
  injectPrimary: Record<string, CalendarPrimary[]> = {},
  injectSecondary: Record<string, number | CalendarPrimary[]> = {},
): Array<{
  date: string
  primaryDispatches: CalendarPrimary[]
  secondaryDispatches: CalendarPrimary[]
}> {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const arr = []
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    // primary: 既定で 00:i0 分（最大 9 件まで）
    const primaries = (injectPrimary[date] ?? []).map((p, i) => ({
      ...p,
      type: p.type ?? ('ONSITE' as const),
      isDraft: p.isDraft ?? false,
      dispatchTime:
        p.dispatchTime ??
        `${date}T0${Math.min(9, i)}:00:00.000Z`,
    }))
    const sec = injectSecondary[date]
    let secondaries: CalendarPrimary[]
    if (Array.isArray(sec)) {
      secondaries = sec.map((p, i) => ({
        ...p,
        type: p.type ?? ('TRANSPORT' as const),
        isDraft: p.isDraft ?? false,
        // secondary は既定で primary より後ろ（12:i0 開始）
        dispatchTime:
          p.dispatchTime ??
          `${date}T1${Math.min(9, 2 + i)}:00:00.000Z`,
      }))
    } else {
      const n = typeof sec === 'number' ? sec : 0
      secondaries = Array.from({ length: n }, (_, i) => ({
        dispatchNumber: `${date.replace(/-/g, '')}-S${String(i + 1).padStart(2, '0')}`,
        plate: plate(),
        type: 'TRANSPORT' as const,
        isDraft: false,
        dispatchTime: `${date}T${String(12 + i).padStart(2, '0')}:00:00.000Z`,
      }))
    }
    arr.push({
      date,
      primaryDispatches: primaries,
      secondaryDispatches: secondaries,
    })
  }
  return arr
}

function mockCalendarOnce(
  year: number,
  month: number,
  injectPrimary: Record<string, CalendarPrimary[]> = {},
  injectSecondary: Record<string, number | CalendarPrimary[]> = {},
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        year,
        month,
        days: buildDays(year, month, injectPrimary, injectSecondary),
      }),
  })
}

describe('DispatchCalendar', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // 現在日時を固定 (2026-04-15 JST)
    vi.setSystemTime(new Date('2026-04-15T03:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('月グリッドが描画される（タイトルに年月、曜日ヘッダ、セル）', async () => {
    mockCalendarOnce(2026, 4)
    wrap(<DispatchCalendar />)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    // タイトル
    expect(screen.getByText(/2026 年 4 月/)).toBeTruthy()

    // 曜日ラベル（重複を許容するため getAllByText を使用）
    expect(screen.getAllByText('日').length).toBeGreaterThan(0)
    expect(screen.getAllByText('土').length).toBeGreaterThan(0)

    // 月の日付セル（30 日分）
    const cells = screen.getAllByTestId('calendar-cell')
    expect(cells).toHaveLength(30)
  })

  it('PC: 「+N 件」バッジは描画されない（4 件以上ある日でも）', async () => {
    const date = '2026-04-10'
    const list: CalendarPrimary[] = [
      { dispatchNumber: '20260410-001', plate: plate() },
      { dispatchNumber: '20260410-002', plate: plate('品川') },
      { dispatchNumber: '20260410-003', plate: plate('横浜') },
      { dispatchNumber: '20260410-004', plate: plate('湘南') },
      { dispatchNumber: '20260410-005', plate: plate('足立') },
    ]
    mockCalendarOnce(2026, 4, { [date]: list })
    wrap(<DispatchCalendar />)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    expect(screen.queryByTestId('calendar-more-badge')).toBeNull()
  })

  it('PC: 詳細ボタンは件数を含むラベルで描画され、クリックでモーダルが開く（onJumpToTable は呼ばれない）', async () => {
    const date = '2026-04-10'
    const list: CalendarPrimary[] = [
      { dispatchNumber: '20260410-001', plate: plate() },
      { dispatchNumber: '20260410-002', plate: plate('品川') },
    ]
    mockCalendarOnce(2026, 4, { [date]: list }, { [date]: 1 })
    const onJumpToTable = vi.fn()
    wrap(<DispatchCalendar onJumpToTable={onJumpToTable} />)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    const buttons = screen.getAllByTestId('calendar-cell-pc-detail-button')
    const target = buttons.find(
      (b) => b.closest('[data-date]')?.getAttribute('data-date') === date,
    )
    expect(target).toBeTruthy()
    // 1次2件 + 2次1件 = 3件 を含む詳細ボタン
    expect(target!.textContent).toContain('3件')
    expect(target!.textContent).toContain('詳細を見る')
    expect(target!.getAttribute('aria-label')).toBe(
      `${date} の案件詳細を表示`,
    )
    fireEvent.click(target!)

    // クリックでモーダルが開く（onJumpToTable は呼ばれない）
    await waitFor(() => {
      expect(screen.getByTestId('calendar-modal')).toBeTruthy()
    })
    expect(onJumpToTable).not.toHaveBeenCalled()
  })

  it('PC: 1 次 0 件かつ 2 次のみある日にも詳細ボタンが出る（旧 2次集計バッジは廃止）', async () => {
    const date = '2026-04-09'
    mockCalendarOnce(2026, 4, {}, { [date]: 3 })
    wrap(<DispatchCalendar />)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })
    const buttons = screen.getAllByTestId('calendar-cell-pc-detail-button')
    const target = buttons.find(
      (b) => b.closest('[data-date]')?.getAttribute('data-date') === date,
    )
    expect(target).toBeTruthy()
    // 旧 2次集計バッジは PC では描画されない
    expect(
      screen.queryAllByTestId('calendar-cell-pc-badge-secondary'),
    ).toHaveLength(0)
  })

  it('PC: 1 次・2 次ともに 0 件の日には詳細ボタンが出ない', async () => {
    mockCalendarOnce(2026, 4)
    wrap(<DispatchCalendar />)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })
    expect(
      screen.queryAllByTestId('calendar-cell-pc-detail-button'),
    ).toHaveLength(0)
    // 旧 2次集計バッジは存在しない
    expect(
      screen.queryAllByTestId('calendar-cell-pc-badge-secondary'),
    ).toHaveLength(0)
  })

  it('PC: 1 次・2 次が dispatchTime ASC で統合され、各行に kind バッジが付く（現場/搬送/2次）', async () => {
    const date = '2026-04-11'
    // 意図的にバラバラの dispatchTime で渡し、ソート後に時間順になることを検証
    const primaries: CalendarPrimary[] = [
      {
        dispatchNumber: 'P-LATE-TRANSPORT',
        plate: plate(),
        type: 'TRANSPORT',
        dispatchTime: `${date}T10:00:00.000Z`,
      },
      {
        dispatchNumber: 'P-EARLY-ONSITE',
        plate: plate('品川'),
        type: 'ONSITE',
        dispatchTime: `${date}T01:00:00.000Z`,
      },
    ]
    const secondaries: CalendarPrimary[] = [
      {
        dispatchNumber: 'S-MID',
        plate: plate('横浜'),
        type: 'TRANSPORT',
        dispatchTime: `${date}T05:00:00.000Z`,
      },
    ]
    mockCalendarOnce(2026, 4, { [date]: primaries }, { [date]: secondaries })
    wrap(<DispatchCalendar />)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    // 該当セル内の calendar-dispatch li を抽出
    const cell = document.querySelector(
      `[data-testid="calendar-cell"][data-date="${date}"]`,
    ) as HTMLElement
    expect(cell).toBeTruthy()
    const items = cell.querySelectorAll('[data-testid="calendar-dispatch"]')
    expect(items).toHaveLength(3)

    // 順序: 01:00 ONSITE → 05:00 2次 → 10:00 TRANSPORT
    expect(items[0].textContent).toContain('P-EARLY-ONSITE')
    expect(items[1].textContent).toContain('S-MID')
    expect(items[2].textContent).toContain('P-LATE-TRANSPORT')

    // 各行に kind バッジが付く
    const badges = cell.querySelectorAll(
      '[data-testid="calendar-row-kind-badge"]',
    )
    expect(badges).toHaveLength(3)
    expect(badges[0].getAttribute('data-kind')).toBe('onsite')
    expect(badges[0].textContent).toBe('現場')
    expect(badges[1].getAttribute('data-kind')).toBe('secondary')
    expect(badges[1].textContent).toBe('2次')
    expect(badges[2].getAttribute('data-kind')).toBe('transport')
    expect(badges[2].textContent).toBe('搬送')

    // バッジ背景色: onsite=#ea7600 / transport=#4a90d9 / secondary=#1C2948
    expect((badges[0] as HTMLElement).style.backgroundColor).toMatch(
      /rgb\(234,\s*118,\s*0\)/,
    )
    expect((badges[1] as HTMLElement).style.backgroundColor).toMatch(
      /rgb\(28,\s*41,\s*72\)/,
    )
    expect((badges[2] as HTMLElement).style.backgroundColor).toMatch(
      /rgb\(74,\s*144,\s*217\)/,
    )
  })

  it('PC: 統合後 4 件以上ある日でも先頭 3 件のみ表示（+N 件バッジは無し）', async () => {
    const date = '2026-04-13'
    const primaries: CalendarPrimary[] = [
      { dispatchNumber: 'P1', plate: plate(), type: 'ONSITE' },
      { dispatchNumber: 'P2', plate: plate(), type: 'ONSITE' },
      { dispatchNumber: 'P3', plate: plate(), type: 'ONSITE' },
      { dispatchNumber: 'P4', plate: plate(), type: 'TRANSPORT' },
    ]
    mockCalendarOnce(2026, 4, { [date]: primaries }, { [date]: 2 })
    wrap(<DispatchCalendar />)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })
    const cell = document.querySelector(
      `[data-testid="calendar-cell"][data-date="${date}"]`,
    ) as HTMLElement
    const items = cell.querySelectorAll('[data-testid="calendar-dispatch"]')
    expect(items).toHaveLength(3)
    // +N 件バッジは存在しない
    expect(screen.queryByTestId('calendar-more-badge')).toBeNull()
  })

  it('「次月」クリックで year/month が進み、API が再取得される', async () => {
    mockCalendarOnce(2026, 4)
    mockCalendarOnce(2026, 5)
    wrap(<DispatchCalendar />)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('calendar-next'))

    await waitFor(() => {
      expect(screen.getByText(/2026 年 5 月/)).toBeTruthy()
    })

    // 2 回目の fetch URL が month=5
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
    expect(lastCall).toContain('month=5')
  })

  it('SP 表示: 種別バッヂ（現場 / 搬送 / 2次）と詳細ボタンが描画され、ボタンクリックでモーダルが開く（1 次 + 2 次）', async () => {
    const date = '2026-04-08'
    const list: CalendarPrimary[] = [
      { dispatchNumber: '20260408-001', plate: plate(), type: 'ONSITE' },
      { dispatchNumber: '20260408-002', plate: plate('品川'), type: 'ONSITE' },
      { dispatchNumber: '20260408-003', plate: plate('横浜'), type: 'TRANSPORT' },
    ]
    mockCalendarOnce(2026, 4, { [date]: list }, { [date]: 2 })
    wrap(<DispatchCalendar />)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    // SP セル内サマリ（種別ごとのバッヂ）が描画されること
    const summaries = screen.getAllByTestId('calendar-cell-sp-summary')
    const targetSummary = summaries.find(
      (el) =>
        el.closest('[data-date]')?.getAttribute('data-date') === date,
    )
    expect(targetSummary).toBeTruthy()
    expect(targetSummary!.textContent).toContain('現場 2')
    expect(targetSummary!.textContent).toContain('搬送 1')
    expect(targetSummary!.textContent).toContain('2次 2')

    // バッヂの背景色を style 属性で検証
    const onsiteBadge = targetSummary!.querySelector(
      '[data-testid="calendar-cell-sp-badge-onsite"]',
    ) as HTMLElement
    const transportBadge = targetSummary!.querySelector(
      '[data-testid="calendar-cell-sp-badge-transport"]',
    ) as HTMLElement
    const secondaryBadge = targetSummary!.querySelector(
      '[data-testid="calendar-cell-sp-badge-secondary"]',
    ) as HTMLElement
    expect(onsiteBadge.style.backgroundColor).toMatch(/rgb\(234,\s*118,\s*0\)/)
    expect(transportBadge.style.backgroundColor).toMatch(
      /rgb\(74,\s*144,\s*217\)/,
    )
    expect(secondaryBadge.style.backgroundColor).toMatch(
      /rgb\(28,\s*41,\s*72\)/,
    )

    // 詳細ボタンを押すとモーダル展開（primary 3 件 + secondary 2 件 = 5 件）
    const detailButtons = screen.getAllByTestId('calendar-cell-sp-detail-button')
    const targetButton = detailButtons.find(
      (b) => b.closest('[data-date]')?.getAttribute('data-date') === date,
    )
    expect(targetButton).toBeTruthy()
    fireEvent.click(targetButton!)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-modal')).toBeTruthy()
    })
    const rows = screen.getAllByTestId('calendar-modal-row')
    expect(rows).toHaveLength(5)

    // 各行に新 kind バッジ（calendar-row-kind-badge）が付く。
    // 旧 calendar-modal-row-kind-badge は使われない。
    const modalEl = screen.getByTestId('calendar-modal')
    const kindBadges = modalEl.querySelectorAll(
      '[data-testid="calendar-row-kind-badge"]',
    )
    expect(kindBadges).toHaveLength(5)
    expect(
      modalEl.querySelectorAll('[data-testid="calendar-modal-row-kind-badge"]'),
    ).toHaveLength(0)

    // 既定の dispatchTime 設定: primary は 00:i0、secondary は 12:i0 で並ぶ。
    // よって順序は ONSITE(2 件) → TRANSPORT(1 件) → 2次(2 件)
    expect(kindBadges[0].getAttribute('data-kind')).toBe('onsite')
    expect(kindBadges[0].textContent).toBe('現場')
    expect(kindBadges[1].getAttribute('data-kind')).toBe('onsite')
    expect(kindBadges[2].getAttribute('data-kind')).toBe('transport')
    expect(kindBadges[2].textContent).toBe('搬送')
    expect(kindBadges[3].getAttribute('data-kind')).toBe('secondary')
    expect(kindBadges[3].textContent).toBe('2次')
    expect(kindBadges[4].getAttribute('data-kind')).toBe('secondary')

    // 背景色: 現場=#ea7600 / 搬送=#4a90d9 / 2次=#1C2948
    expect((kindBadges[0] as HTMLElement).style.backgroundColor).toMatch(
      /rgb\(234,\s*118,\s*0\)/,
    )
    expect((kindBadges[2] as HTMLElement).style.backgroundColor).toMatch(
      /rgb\(74,\s*144,\s*217\)/,
    )
    expect((kindBadges[3] as HTMLElement).style.backgroundColor).toMatch(
      /rgb\(28,\s*41,\s*72\)/,
    )
  })

  it('モーダルタイトルは「YYYY年M月D日（曜）の出動一覧」形式である', async () => {
    // 2026-04-26 は日曜日
    const date = '2026-04-26'
    const list: CalendarPrimary[] = [
      { dispatchNumber: '20260426-001', plate: plate() },
    ]
    mockCalendarOnce(2026, 4, { [date]: list })
    wrap(<DispatchCalendar />)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    const buttons = screen.getAllByTestId('calendar-cell-sp-detail-button')
    const target = buttons.find(
      (b) => b.closest('[data-date]')?.getAttribute('data-date') === date,
    )
    expect(target).toBeTruthy()
    fireEvent.click(target!)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-modal')).toBeTruthy()
    })

    expect(screen.getByText('2026年4月26日（日）の出動一覧')).toBeTruthy()
  })

  it('SP 表示: 0 件の日にはセル内サマリ・詳細ボタンが描画されない', async () => {
    mockCalendarOnce(2026, 4, {}, {})
    wrap(<DispatchCalendar />)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })
    expect(screen.queryAllByTestId('calendar-cell-sp-summary')).toHaveLength(0)
    expect(
      screen.queryAllByTestId('calendar-cell-sp-detail-button'),
    ).toHaveLength(0)
  })

  it('SP 表示: 1 次が 0 件でも 2 次のみある日はバッヂが表示される', async () => {
    const date = '2026-04-09'
    mockCalendarOnce(2026, 4, {}, { [date]: 3 })
    wrap(<DispatchCalendar />)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })
    const summaries = screen.getAllByTestId('calendar-cell-sp-summary')
    const target = summaries.find(
      (el) =>
        el.closest('[data-date]')?.getAttribute('data-date') === date,
    )
    expect(target).toBeTruthy()
    expect(target!.textContent).toContain('2次 3')
    // 1 次が 0 件なので「現場」「搬送」バッヂは出ない
    expect(
      target!.querySelector('[data-testid="calendar-cell-sp-badge-onsite"]'),
    ).toBeNull()
    expect(
      target!.querySelector('[data-testid="calendar-cell-sp-badge-transport"]'),
    ).toBeNull()
    // 1 次が 0 件 → 詳細ボタンは出ない（モーダル展開する primary が無いため）
    const detailButtonsInCell = target!
      .closest('[data-testid="calendar-cell"]')!
      .querySelectorAll('[data-testid="calendar-cell-sp-detail-button"]')
    expect(detailButtonsInCell).toHaveLength(0)
  })

  it('モーダル内「テーブルで詳細を見る」クリックで onJumpToTable が該当日付で呼ばれる', async () => {
    const date = '2026-04-12'
    const list: CalendarPrimary[] = [
      { dispatchNumber: '20260412-001', plate: plate() },
      { dispatchNumber: '20260412-002', plate: plate('品川') },
      { dispatchNumber: '20260412-003', plate: plate('横浜') },
      { dispatchNumber: '20260412-004', plate: plate('湘南') },
    ]
    mockCalendarOnce(2026, 4, { [date]: list })
    const onJumpToTable = vi.fn()
    wrap(<DispatchCalendar onJumpToTable={onJumpToTable} />)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    const detailButtons = screen.getAllByTestId('calendar-cell-sp-detail-button')
    const target = detailButtons.find(
      (b) => b.closest('[data-date]')?.getAttribute('data-date') === date,
    )
    expect(target).toBeTruthy()
    fireEvent.click(target!)

    await waitFor(() => {
      expect(screen.getByTestId('calendar-modal')).toBeTruthy()
    })

    const jump = screen.getByTestId('calendar-modal-jump-to-table')
    fireEvent.click(jump)

    expect(onJumpToTable).toHaveBeenCalledTimes(1)
    expect(onJumpToTable).toHaveBeenCalledWith(date)
  })

  it('PC: 下書き行は data-kind="draft" / ラベル「下書」 / 背景 #6b7280 になる（type/kind より優先）', async () => {
    const date = '2026-04-22'
    const primaries: CalendarPrimary[] = [
      // 確定 ONSITE → 「現場」
      {
        dispatchNumber: 'P-CONFIRMED',
        plate: plate(),
        type: 'ONSITE',
        isDraft: false,
        dispatchTime: `${date}T01:00:00.000Z`,
      },
      // 下書き ONSITE → 「下書」（type は無視）
      {
        dispatchNumber: 'P-DRAFT-ONSITE',
        plate: plate('品川'),
        type: 'ONSITE',
        isDraft: true,
        dispatchTime: `${date}T02:00:00.000Z`,
      },
      // 下書き TRANSPORT → 「下書」
      {
        dispatchNumber: 'P-DRAFT-TRANSPORT',
        plate: plate('横浜'),
        type: 'TRANSPORT',
        isDraft: true,
        dispatchTime: `${date}T03:00:00.000Z`,
      },
    ]
    // 下書きの 2 次も「下書」になることを検証するため secondary に下書きを混ぜる
    const secondaries: CalendarPrimary[] = [
      {
        dispatchNumber: 'S-DRAFT',
        plate: plate('湘南'),
        type: 'TRANSPORT',
        isDraft: true,
        dispatchTime: `${date}T04:00:00.000Z`,
      },
    ]
    mockCalendarOnce(2026, 4, { [date]: primaries }, { [date]: secondaries })
    wrap(<DispatchCalendar />)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    const cell = document.querySelector(
      `[data-testid="calendar-cell"][data-date="${date}"]`,
    ) as HTMLElement
    expect(cell).toBeTruthy()
    const items = cell.querySelectorAll('[data-testid="calendar-dispatch"]')
    // PC は MAX_PER_CELL=3 のため 3 件のみ
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('P-CONFIRMED')
    expect(items[1].textContent).toContain('P-DRAFT-ONSITE')
    expect(items[2].textContent).toContain('P-DRAFT-TRANSPORT')

    const badges = cell.querySelectorAll(
      '[data-testid="calendar-row-kind-badge"]',
    )
    expect(badges).toHaveLength(3)
    expect(badges[0].getAttribute('data-kind')).toBe('onsite')
    expect(badges[0].textContent).toBe('現場')
    expect(badges[1].getAttribute('data-kind')).toBe('draft')
    expect(badges[1].textContent).toBe('下書')
    expect(badges[2].getAttribute('data-kind')).toBe('draft')
    expect(badges[2].textContent).toBe('下書')

    // 下書きバッジ背景: #6b7280 → rgb(107, 114, 128)
    expect((badges[1] as HTMLElement).style.backgroundColor).toMatch(
      /rgb\(107,\s*114,\s*128\)/,
    )

    // モーダル展開で下書きの 2 次も「下書」になることを検証
    const detailButton = cell.querySelector(
      '[data-testid="calendar-cell-pc-detail-button"]',
    ) as HTMLElement
    expect(detailButton).toBeTruthy()
    fireEvent.click(detailButton)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-modal')).toBeTruthy()
    })
    const modalEl = screen.getByTestId('calendar-modal')
    const modalBadges = modalEl.querySelectorAll(
      '[data-testid="calendar-row-kind-badge"]',
    )
    expect(modalBadges).toHaveLength(4)
    // 順序: P-CONFIRMED(現場) / P-DRAFT-ONSITE(下書) / P-DRAFT-TRANSPORT(下書) / S-DRAFT(下書)
    expect(modalBadges[0].getAttribute('data-kind')).toBe('onsite')
    expect(modalBadges[1].getAttribute('data-kind')).toBe('draft')
    expect(modalBadges[2].getAttribute('data-kind')).toBe('draft')
    expect(modalBadges[3].getAttribute('data-kind')).toBe('draft')
    expect(modalBadges[3].textContent).toBe('下書')
  })

  it('SP: 「現場/搬送/2次」集計から下書きが除外され、別途「下書 N」グレーバッジが出る', async () => {
    const date = '2026-04-22'
    const primaries: CalendarPrimary[] = [
      { dispatchNumber: 'P1', plate: plate(), type: 'ONSITE', isDraft: false },
      { dispatchNumber: 'P2', plate: plate(), type: 'ONSITE', isDraft: true },
      { dispatchNumber: 'P3', plate: plate(), type: 'ONSITE', isDraft: true },
      {
        dispatchNumber: 'P4',
        plate: plate(),
        type: 'TRANSPORT',
        isDraft: true,
      },
    ]
    const secondaries: CalendarPrimary[] = [
      {
        dispatchNumber: 'S1',
        plate: plate(),
        type: 'TRANSPORT',
        isDraft: false,
      },
      {
        dispatchNumber: 'S2',
        plate: plate(),
        type: 'TRANSPORT',
        isDraft: true,
      },
    ]
    mockCalendarOnce(2026, 4, { [date]: primaries }, { [date]: secondaries })
    wrap(<DispatchCalendar />)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })

    const summaries = screen.getAllByTestId('calendar-cell-sp-summary')
    const target = summaries.find(
      (el) =>
        el.closest('[data-date]')?.getAttribute('data-date') === date,
    )
    expect(target).toBeTruthy()
    // 現場 1（P1のみ）/ 搬送なし（確定 0）/ 2次 1（S1のみ）/ 下書 4（P2 P3 P4 S2）
    expect(target!.textContent).toContain('現場 1')
    expect(target!.textContent).not.toContain('搬送') // 確定 transport 0 件
    expect(target!.textContent).toContain('2次 1')
    expect(target!.textContent).toContain('下書 4')

    // 下書バッジの背景色を検証
    const draftBadge = target!.querySelector(
      '[data-testid="calendar-cell-sp-badge-draft"]',
    ) as HTMLElement
    expect(draftBadge).toBeTruthy()
    expect(draftBadge.style.backgroundColor).toMatch(
      /rgb\(107,\s*114,\s*128\)/,
    )
  })

  it('SP: 下書き 0 件の日には下書バッジが出ない', async () => {
    const date = '2026-04-23'
    mockCalendarOnce(
      2026,
      4,
      {
        [date]: [{ dispatchNumber: 'P1', plate: plate(), type: 'ONSITE' }],
      },
      {},
    )
    wrap(<DispatchCalendar />)
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeTruthy()
    })
    const summaries = screen.getAllByTestId('calendar-cell-sp-summary')
    const target = summaries.find(
      (el) =>
        el.closest('[data-date]')?.getAttribute('data-date') === date,
    )
    expect(target).toBeTruthy()
    expect(
      target!.querySelector('[data-testid="calendar-cell-sp-badge-draft"]'),
    ).toBeNull()
  })

  it('「前月」クリックで 12 月をまたぐと year が前年に', async () => {
    // 1 月で前月に戻す検証のため、初期表示を 2026-01 にしたいので時刻を変更
    vi.setSystemTime(new Date('2026-01-15T03:00:00Z'))

    mockCalendarOnce(2026, 1)
    mockCalendarOnce(2025, 12)
    wrap(<DispatchCalendar />)

    await waitFor(() => {
      expect(screen.getByText(/2026 年 1 月/)).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('calendar-prev'))

    await waitFor(() => {
      expect(screen.getByText(/2025 年 12 月/)).toBeTruthy()
    })
  })
})
