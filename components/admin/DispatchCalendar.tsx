'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IoIosArrowForward } from 'react-icons/io'
import { BiSolidDetail } from 'react-icons/bi'

/**
 * 案件管理カレンダー（Phase 4-B）。
 *
 * docs/plans/admin-dashboard.md §6.3 ワイヤーフレーム準拠:
 *   - 月ナビ < 前月 | 今月 | 次月 >
 *   - 日 月 火 水 木 金 土 のヘッダ + 6 週分のセル
 *   - 各セルに 1 次搬送（ONSITE / TRANSPORT）の「#出動番号 / 車番」を縦並び（最大 3 件）
 *   - 4 件以上ある日は 3 件 + 「+N 件」バッジ。バッジクリックで該当日のモーダル展開
 *   - 各案件行クリックで /admin/dispatches/[id] へ遷移（ただし API は id を返さないため
 *     dispatchNumber でフォールバックリンクを張る）
 *
 * 注: API レスポンス（§4.3）は `dispatchNumber` と `plate` のみ返す。dispatch 編集画面への
 * 遷移には id が必要だが、本仕様では dispatchNumber 経由のリンクは張らず、編集導線は
 * テーブルタブ側に閉じる。代わりに「案件管理ページ内のテーブルタブで該当日付フィルタを
 * 適用する遷移」も検討余地ありだが、本実装ではテーブル内 Link への置換が現実解。
 *
 * → 暫定: API レスポンスに id を含めず、行クリックではテーブルタブへの遷移リンクを
 *   `/admin/dispatches?from=YYYY-MM-DD&to=YYYY-MM-DD` として作る。タブ切替の URL 同期は
 *   未実装なので動作しないが、せめてリンク自体は張っておくのは過剰。本実装では行は
 *   div としてレンダリングし、編集遷移は伴わない（業務上カレンダーは「俯瞰」目的）。
 *
 *   ただし「+N 件」モーダル内では dispatchNumber でリンクは張らない（id が無いため）。
 *
 *   将来 API に id を追加する場合は本コンポーネント側を改修。
 */

interface CalendarPlate {
  region: string
  class: string
  kana: string
  number: string
}

export interface CalendarPrimaryDispatch {
  dispatchNumber: string
  plate: CalendarPlate | null
  type: 'ONSITE' | 'TRANSPORT'
  /**
   * dispatchTime の ISO 文字列。クライアントで 1 次・2 次を統合した行リストを
   * dispatchTime ASC でソートするのに使う。null は末尾扱い。
   */
  dispatchTime: string | null
  /** 下書きフラグ。true の場合は行頭バッジを「下書」(グレー) に置換する。 */
  isDraft: boolean
}

export interface CalendarDay {
  date: string // YYYY-MM-DD
  primaryDispatches: CalendarPrimaryDispatch[]
  /** その日の 2 次搬送（primary と同 shape。モーダルでは 2次バッジ付きで列挙） */
  secondaryDispatches: CalendarPrimaryDispatch[]
}

export interface CalendarResponse {
  year: number
  month: number
  days: CalendarDay[]
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
const MAX_PER_CELL = 3
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function plateLabel(p: CalendarPlate | null): string {
  if (!p) return '車番なし'
  return `${p.region}${p.class}${p.kana}${p.number}`
}

/**
 * 行頭バッジの種類。
 * - 'draft'     : 下書き案件（type/kind 問わず最優先）→ 「下書」/ 背景 #6b7280
 * - 'onsite'    : 確定 1 次 ONSITE → 「現場」/ 背景 #ea7600
 * - 'transport' : 確定 1 次 TRANSPORT → 「搬送」/ 背景 #4a90d9
 * - 'secondary' : 確定 2 次（type 不問）→ 「2次」/ 背景 #1C2948
 */
type RowKind = 'draft' | 'onsite' | 'transport' | 'secondary'

function rowKindOf(row: {
  kind: '1次' | '2次'
  dispatch: CalendarPrimaryDispatch
}): RowKind {
  // 下書きは type/kind に関係なく最優先で「下書」バッジに置換する
  if (row.dispatch.isDraft) return 'draft'
  if (row.kind === '2次') return 'secondary'
  return row.dispatch.type === 'ONSITE' ? 'onsite' : 'transport'
}

const ROW_KIND_META: Record<
  RowKind,
  { label: string; bg: string }
> = {
  draft: { label: '下書', bg: '#6b7280' },
  onsite: { label: '現場', bg: '#ea7600' },
  transport: { label: '搬送', bg: '#4a90d9' },
  secondary: { label: '2次', bg: '#1C2948' },
}

function RowKindBadge({ kind }: { kind: RowKind }) {
  const meta = ROW_KIND_META[kind]
  return (
    <span
      className="inline-flex h-5 w-9 items-center justify-center whitespace-nowrap rounded text-center text-[10px] font-medium leading-none text-white"
      style={{ backgroundColor: meta.bg }}
      data-testid="calendar-row-kind-badge"
      data-kind={kind}
    >
      {meta.label}
    </span>
  )
}

/** dispatchTime ASC で安定ソート（null は末尾）。 */
function combinedSort(rows: Array<{
  kind: '1次' | '2次'
  dispatch: CalendarPrimaryDispatch
}>): Array<{ kind: '1次' | '2次'; dispatch: CalendarPrimaryDispatch }> {
  return [...rows].sort((a, b) => {
    const ta = a.dispatch.dispatchTime
      ? Date.parse(a.dispatch.dispatchTime)
      : Number.POSITIVE_INFINITY
    const tb = b.dispatch.dispatchTime
      ? Date.parse(b.dispatch.dispatchTime)
      : Number.POSITIVE_INFINITY
    return ta - tb
  })
}

/** 現在の JST 年月を返す。月は 1-12。 */
function currentJstYearMonth(): { year: number; month: number } {
  const now = new Date()
  const jst = new Date(now.getTime() + JST_OFFSET_MS)
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 }
}

/** 月の開始曜日（0=日）と末日を返す。 */
function monthInfo(year: number, month: number): {
  firstDow: number
  lastDay: number
} {
  // 月初日の曜日を JST で算出するが、UTC を JST と見立てて Date.UTC で構築すれば DST のない地域では問題ない
  const first = new Date(Date.UTC(year, month - 1, 1))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { firstDow: first.getUTCDay(), lastDay }
}

/** 「今日」JST の YYYY-MM-DD。 */
function todayJst(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + JST_OFFSET_MS)
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`
}

/**
 * `YYYY-MM-DD` を JST の Date として解釈し「YYYY年M月D日（曜）の出動一覧」に整形。
 * 曜日は WEEKDAY_LABELS（日始まり）を流用。純関数。
 */
function formatJpDateWithDow(ymd: string): string {
  // YYYY-MM-DD をパースし JST の Date を作る（UTC 00:00 と見なせばそのまま JST 当日扱い）
  const [ys, ms, ds] = ymd.split('-')
  const y = Number(ys)
  const m = Number(ms)
  const d = Number(ds)
  // JST 日付を UTC 00:00 で構築 → getUTCDay は曜日と一致
  const jst = new Date(Date.UTC(y, m - 1, d))
  const dow = WEEKDAY_LABELS[jst.getUTCDay()]
  return `${y}年${m}月${d}日（${dow}）の出動一覧`
}

async function fetchCalendar(
  year: number,
  month: number,
): Promise<CalendarResponse> {
  const res = await fetch(`/api/admin/calendar?year=${year}&month=${month}`)
  if (!res.ok) throw new Error(`calendar fetch failed: ${res.status}`)
  return res.json()
}

export interface DispatchCalendarProps {
  /**
   * モーダル内「テーブルで詳細を見る」クリック時のコールバック。
   * dateYmd は YYYY-MM-DD（JST）。親はテーブルタブに切り替え、
   * filter.from = filter.to = dateYmd をセットする想定。
   */
  onJumpToTable?: (dateYmd: string) => void
}

export default function DispatchCalendar({
  onJumpToTable,
}: DispatchCalendarProps = {}) {
  const initial = currentJstYearMonth()
  const [year, setYear] = useState<number>(initial.year)
  const [month, setMonth] = useState<number>(initial.month)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<CalendarResponse>({
    queryKey: ['admin', 'calendar', year, month],
    queryFn: () => fetchCalendar(year, month),
  })

  const today = todayJst()
  const { firstDow, lastDay } = monthInfo(year, month)

  // セル構築（前月空白 + 当月 + 末尾空白で 6 週=42 セル固定）
  const cells = useMemo<
    Array<{ date: string | null; day: number | null }>
  >(() => {
    const arr: Array<{ date: string | null; day: number | null }> = []
    for (let i = 0; i < firstDow; i++) arr.push({ date: null, day: null })
    for (let d = 1; d <= lastDay; d++) {
      arr.push({
        date: `${year}-${pad2(month)}-${pad2(d)}`,
        day: d,
      })
    }
    while (arr.length < 42) arr.push({ date: null, day: null })
    return arr
  }, [firstDow, lastDay, year, month])

  const dayMap = useMemo<Map<string, CalendarPrimaryDispatch[]>>(() => {
    const m = new Map<string, CalendarPrimaryDispatch[]>()
    if (!data) return m
    for (const d of data.days) m.set(d.date, d.primaryDispatches)
    return m
  }, [data])

  const secondaryMap = useMemo<Map<string, CalendarPrimaryDispatch[]>>(() => {
    const m = new Map<string, CalendarPrimaryDispatch[]>()
    if (!data) return m
    for (const d of data.days) m.set(d.date, d.secondaryDispatches ?? [])
    return m
  }, [data])

  const goPrev = () => {
    setExpandedDate(null)
    if (month === 1) {
      setYear(year - 1)
      setMonth(12)
    } else {
      setMonth(month - 1)
    }
  }
  const goNext = () => {
    setExpandedDate(null)
    if (month === 12) {
      setYear(year + 1)
      setMonth(1)
    } else {
      setMonth(month + 1)
    }
  }
  const goToday = () => {
    const t = currentJstYearMonth()
    setYear(t.year)
    setMonth(t.month)
    setExpandedDate(null)
  }

  // モーダルに出す行：1次 + 2次 を統合し、dispatchTime ASC で並べ替えて kind バッジを付ける
  type ExpandedRow = {
    kind: '1次' | '2次'
    dispatch: CalendarPrimaryDispatch
  }
  const expandedRows: ExpandedRow[] = expandedDate
    ? combinedSort([
        ...(dayMap.get(expandedDate) ?? []).map<ExpandedRow>((p) => ({
          kind: '1次',
          dispatch: p,
        })),
        ...(secondaryMap.get(expandedDate) ?? []).map<ExpandedRow>((p) => ({
          kind: '2次',
          dispatch: p,
        })),
      ])
    : []

  return (
    <section data-testid="dispatch-calendar" className="space-y-3">
      {/* 月ナビ */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold" style={{ color: '#1C2948' }}>
          {year} 年 {month} 月
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
            data-testid="calendar-prev"
            aria-label="前月"
          >
            &lt; 前月
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
            data-testid="calendar-today"
          >
            今月
          </button>
          <button
            type="button"
            onClick={goNext}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
            data-testid="calendar-next"
            aria-label="次月"
          >
            次月 &gt;
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-gray-500 py-4">読み込み中...</div>
      )}
      {isError && (
        <div className="text-sm text-red-600 py-4">取得失敗</div>
      )}

      {data && (
        <div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          data-testid="calendar-grid"
        >
          {/* 曜日ヘッダ */}
          <div className="grid grid-cols-7 border-b border-gray-100 text-center text-xs font-medium">
            {WEEKDAY_LABELS.map((w, i) => (
              <div
                key={w}
                className={`py-2 ${
                  i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-gray-600'
                }`}
              >
                {w}
              </div>
            ))}
          </div>
          {/* セル */}
          <div className="grid grid-cols-7">
            {cells.map((cell, idx) => {
              if (!cell.date) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[110px] border-b border-r border-gray-100 bg-gray-50"
                  />
                )
              }
              // 上の `if (!cell.date) return` で narrowing 済みだが、JSX 内のクロージャ
              // で型情報が失われるケースがあるため明示的に string 変数として保持。
              const date: string = cell.date
              const list = dayMap.get(date) ?? []
              const isToday = date === today
              const dow = idx % 7
              const secondaryList = secondaryMap.get(date) ?? []
              // SP 集計: 下書きは「現場 / 搬送 / 2次」の件数から除外し、別カウント。
              const onsiteCount = list.filter(
                (p) => p.type === 'ONSITE' && !p.isDraft,
              ).length
              const transportCount = list.filter(
                (p) => p.type === 'TRANSPORT' && !p.isDraft,
              ).length
              const secondaryCount = secondaryList.filter(
                (p) => !p.isDraft,
              ).length
              const draftCount =
                list.filter((p) => p.isDraft).length +
                secondaryList.filter((p) => p.isDraft).length
              const hasAnyForSp =
                onsiteCount > 0 ||
                transportCount > 0 ||
                secondaryCount > 0 ||
                draftCount > 0
              // PC セル用の統合行リスト（1次 + 2次 を dispatchTime ASC でソート）
              const combinedList = combinedSort([
                ...list.map((p) => ({ kind: '1次' as const, dispatch: p })),
                ...secondaryList.map((p) => ({
                  kind: '2次' as const,
                  dispatch: p,
                })),
              ])
              const headCombined = combinedList.slice(0, MAX_PER_CELL)
              const hasAnyForPcDetail = combinedList.length > 0
              return (
                <div
                  key={date}
                  className={`flex min-h-[120px] flex-col border-b border-r border-gray-100 px-1.5 py-1.5 text-sm ${
                    isToday ? 'bg-blue-50/50' : 'bg-white'
                  }`}
                  data-testid="calendar-cell"
                  data-date={date}
                >
                  <div
                    className={`px-1 pb-1 text-xs font-semibold ${
                      dow === 0
                        ? 'text-red-600'
                        : dow === 6
                        ? 'text-blue-600'
                        : 'text-gray-700'
                    }`}
                  >
                    {cell.day}
                  </div>
                  {/* SP（< sm）: 種別ごとの色付きバッヂ群。0 件のカテゴリは出さない */}
                  {hasAnyForSp && (
                    <div
                      className="flex flex-col gap-0.5 sm:hidden"
                      data-testid="calendar-cell-sp-summary"
                    >
                      {onsiteCount > 0 && (
                        <span
                          className="inline-flex h-5 w-full items-center justify-center whitespace-nowrap rounded text-center text-[10px] font-medium leading-none text-white"
                          style={{ backgroundColor: '#ea7600' }}
                          data-testid="calendar-cell-sp-badge-onsite"
                        >
                          現場 {onsiteCount}
                        </span>
                      )}
                      {transportCount > 0 && (
                        <span
                          className="inline-flex h-5 w-full items-center justify-center whitespace-nowrap rounded text-center text-[10px] font-medium leading-none text-white"
                          style={{ backgroundColor: '#4a90d9' }}
                          data-testid="calendar-cell-sp-badge-transport"
                        >
                          搬送 {transportCount}
                        </span>
                      )}
                      {secondaryCount > 0 && (
                        <span
                          className="inline-flex h-5 w-full items-center justify-center whitespace-nowrap rounded text-center text-[10px] font-medium leading-none text-white"
                          style={{ backgroundColor: '#1C2948' }}
                          data-testid="calendar-cell-sp-badge-secondary"
                        >
                          2次 {secondaryCount}
                        </span>
                      )}
                      {draftCount > 0 && (
                        <span
                          className="inline-flex h-5 w-full items-center justify-center whitespace-nowrap rounded text-center text-[10px] font-medium leading-none text-white"
                          style={{ backgroundColor: '#6b7280' }}
                          data-testid="calendar-cell-sp-badge-draft"
                        >
                          下書 {draftCount}
                        </span>
                      )}
                    </div>
                  )}
                  {/* SP（< sm）: 詳細ボタンはセル下部中央。1 件以上ある日のみ表示 */}
                  {list.length > 0 && (
                    <div className="mt-auto flex justify-center pt-1 sm:hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedDate(date)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                        aria-label={`${date} の案件詳細を表示`}
                        data-testid="calendar-cell-sp-detail-button"
                      >
                        <BiSolidDetail className="text-xl" />
                      </button>
                    </div>
                  )}
                  {/* PC（sm 以上）: 1 次・2 次を統合した最大 3 件を行表示。
                      行頭バッジで「現場 / 搬送 / 2次」を表示する。
                      バッジ右のカラム内に出動番号と車番を縦並びにすることで、
                      車番が出動番号と同じ x 位置から始まるよう揃える。 */}
                  <ul className="hidden space-y-2 sm:block">
                    {headCombined.map((row) => {
                      const p = row.dispatch
                      return (
                        <li
                          key={`${row.kind}-${p.dispatchNumber}`}
                          className="rounded bg-gray-100 px-1.5 py-1 leading-snug"
                          data-testid="calendar-dispatch"
                          data-row-kind={rowKindOf(row)}
                        >
                          <div className="flex items-center gap-1.5">
                            <RowKindBadge kind={rowKindOf(row)} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-mono text-xs text-gray-700">
                                {p.dispatchNumber}
                              </div>
                              <div
                                className="truncate text-xs"
                                style={{ color: '#1C2948' }}
                              >
                                {plateLabel(p.plate)}
                              </div>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {/* PC（sm 以上）: 詳細ボタン（セル下部中央）。
                      白背景 + アイコン + 「N件 詳細を見る」。
                      クリックで日付モーダルを展開（onJumpToTable には使わない）。 */}
                  {hasAnyForPcDetail && (
                    <div className="mt-auto hidden flex-col items-center gap-1 pt-1 sm:flex">
                      <button
                        type="button"
                        onClick={() => setExpandedDate(date)}
                        className="hidden items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700 sm:inline-flex"
                        aria-label={`${date} の案件詳細を表示`}
                        data-testid="calendar-cell-pc-detail-button"
                      >
                        <BiSolidDetail className="text-base" />
                        <span>{combinedList.length}件 詳細を見る</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 展開モーダル */}
      {expandedDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="calendar-modal"
          onClick={() => setExpandedDate(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: '#1C2948' }}>
                {formatJpDateWithDow(expandedDate)}
              </h3>
              <button
                type="button"
                onClick={() => setExpandedDate(null)}
                className="flex h-8 w-8 items-center justify-center rounded text-2xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {expandedRows.map((row) => {
                const p = row.dispatch
                return (
                  <li
                    key={`${row.kind}-${p.dispatchNumber}`}
                    className="flex items-center justify-between py-3 text-base"
                    data-testid="calendar-modal-row"
                  >
                    <span className="flex items-center gap-2">
                      <RowKindBadge kind={rowKindOf(row)} />
                      <span className="font-mono text-sm text-gray-700">
                        {p.dispatchNumber}
                      </span>
                    </span>
                    <span className="text-base" style={{ color: '#1C2948' }}>
                      {plateLabel(p.plate)}
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 text-right">
              <button
                type="button"
                onClick={() => {
                  if (expandedDate && onJumpToTable) {
                    onJumpToTable(expandedDate)
                  }
                  setExpandedDate(null)
                }}
                className="inline-flex items-center text-sm text-blue-600 hover:underline"
                data-testid="calendar-modal-jump-to-table"
              >
                <span>テーブルで詳細を見る</span>
                <IoIosArrowForward className="ml-1" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
