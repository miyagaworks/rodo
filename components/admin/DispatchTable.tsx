'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useAdminDispatches,
  type DispatchItem,
  type DispatchesFilter,
  type DispatchesResponse,
} from '@/hooks/useAdminDispatches'

/**
 * 案件管理テーブル (Phase 4-A)。
 *
 * 列: 案件番号 | 日時 | 隊員 | AS | 状態 | 搬送予定 | 請求
 *   - 「搬送予定」列はフィルタ問わず常時表示。NULL は「—」表示。
 *
 * - 状態バッジ優先順位:
 *   1) 保管中 + scheduledSecondaryAt あり → 「2次予定」（#71a9f7・白）
 *   2) isDraft=true → 「下書き」
 *   3) status に応じた既存ラベル
 *   ※ カレンダー側 RowKindBadge と優先順位を揃えている。
 * - 持ち越し強調: dispatchTime が today より前 かつ billedAt が null
 *   → 案件番号セル横に赤バッジ「持ち越し」+ 行背景 bg-red-50/40
 * - 請求トグル: PATCH /api/admin/dispatches/[id]/billing { billed: boolean }
 *   - 楽観更新 + エラー時ロールバック (TanStack Query onMutate / onError パターン)
 *   - 暫定 UI: Phase 5 で billing 画面に置換予定
 * - ページング: < 1 2 3 ... N > 形式 (pageSize=50 固定)
 * - SP: 列を縦積みカード化
 *
 * 「today」は呼出側から YYYY-MM-DD を受け取り、JST 比較に使う。
 */

const PAGE_SIZE = 50
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

interface DispatchTableProps {
  filter: Omit<DispatchesFilter, 'page' | 'pageSize'>
  /** 「持ち越し」判定の基準となる業務日 (YYYY-MM-DD)。dispatchTime が today より前で billedAt=null の行を強調。 */
  today: string
}

/** ISO 文字列を JST で "M/D HH:mm" にフォーマット。 */
function formatDispatchTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  const m = jst.getUTCMonth() + 1
  const day = jst.getUTCDate()
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${m}/${day} ${hh}:${mm}`
}

/** ISO 文字列を JST で "M/D(曜) HH:mm" にフォーマット (搬送予定列用)。 */
function formatScheduled(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  const m = jst.getUTCMonth() + 1
  const day = jst.getUTCDate()
  const wd = WEEKDAYS[jst.getUTCDay()]
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${m}/${day}(${wd}) ${hh}:${mm}`
}

/** ISO の dispatchTime から JST の YYYY-MM-DD を返す。 */
function dispatchDateJst(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 状態バッジのラベル。
 * 優先順位: STORED+scheduledSecondaryAt > isDraft > status。
 * カレンダー側 rowKindOf と同じ優先順位（2予 / secondaryPlan）に揃えている。
 */
function statusLabel(
  status: string,
  isDraft: boolean,
  scheduledSecondaryAt: string | null,
): string {
  // 保管中で 2 次搬送予定がある場合は isDraft より優先。
  if (status === 'STORED' && scheduledSecondaryAt) return '2次予定'
  if (isDraft) return '下書き'
  switch (status) {
    case 'STANDBY':
      return '待機'
    case 'DISPATCHED':
      return '出動中'
    case 'ONSITE':
      return '作業中'
    case 'WORKING':
      return '作業中'
    case 'TRANSPORTING':
      return '搬送中'
    case 'COMPLETED':
      return '完了'
    case 'STORED':
      return '保管中'
    case 'RETURNED':
      return '帰社'
    case 'CANCELLED':
      return 'キャンセル'
    case 'TRANSFERRED':
      return '引継済'
    default:
      return status
  }
}

/**
 * 状態バッジのクラス。
 * 「2次予定」のみ専用色（#71a9f7・白）が必要だが、Tailwind の任意色は inline style で
 * 与える方針（カレンダー RowKindBadge と統一）。ここでは枠線・テキスト色のみ返す。
 */
function statusBadgeClass(
  status: string,
  isDraft: boolean,
  scheduledSecondaryAt: string | null,
): string {
  // 「2次予定」: 背景は inline style で #71a9f7。ここでは枠線透明 + 白テキストのみ。
  if (status === 'STORED' && scheduledSecondaryAt) {
    return 'border-transparent text-white'
  }
  if (isDraft) return 'bg-gray-100 text-gray-600 border-gray-200'
  switch (status) {
    case 'DISPATCHED':
    case 'ONSITE':
    case 'WORKING':
    case 'TRANSPORTING':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'COMPLETED':
    case 'RETURNED':
      return 'bg-green-50 text-green-700 border-green-200'
    case 'STORED':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'CANCELLED':
    case 'TRANSFERRED':
      return 'bg-gray-100 text-gray-600 border-gray-200'
    case 'STANDBY':
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

interface PageNumber {
  type: 'page'
  page: number
}
interface Ellipsis {
  type: 'ellipsis'
  key: string
}
type PageItem = PageNumber | Ellipsis

/**
 * 1 ... 4 5 [6] 7 8 ... N の形を作る。1 ≤ current ≤ totalPages 前提。
 */
function buildPageItems(current: number, totalPages: number): PageItem[] {
  if (totalPages <= 1) return [{ type: 'page', page: 1 }]
  const items: PageItem[] = []
  const window = 1 // 現在ページ前後の表示数
  const pages = new Set<number>()
  pages.add(1)
  pages.add(totalPages)
  for (let i = current - window; i <= current + window; i++) {
    if (i >= 1 && i <= totalPages) pages.add(i)
  }
  const sorted = Array.from(pages).sort((a, b) => a - b)
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    items.push({ type: 'page', page: p })
    if (i < sorted.length - 1 && sorted[i + 1] - p > 1) {
      items.push({ type: 'ellipsis', key: `e${p}` })
    }
  }
  return items
}

export default function DispatchTable({ filter, today }: DispatchTableProps) {
  const [page, setPage] = useState(1)

  // フィルタ変更時はページを 1 に戻す
  const filterKey = JSON.stringify(filter)
  useEffect(() => {
    setPage(1)
  }, [filterKey])

  const queryFilter: DispatchesFilter = {
    ...filter,
    page,
    pageSize: PAGE_SIZE,
  }

  const { data, isLoading, isError } = useAdminDispatches(queryFilter)

  const queryClient = useQueryClient()

  // 暫定 UI: Phase 5 で billing 画面に置換予定
  const billingMutation = useMutation({
    mutationFn: async (vars: { id: string; billed: boolean }) => {
      const res = await fetch(`/api/admin/dispatches/${vars.id}/billing`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ billed: vars.billed }),
      })
      if (!res.ok) throw new Error(`billing PATCH failed: ${res.status}`)
      return res.json() as Promise<{ id: string; billedAt: string | null }>
    },
    onMutate: async (vars) => {
      // 楽観更新: 該当 dispatch の billedAt を即時更新
      await queryClient.cancelQueries({ queryKey: ['admin', 'dispatches'] })
      const snapshots = queryClient.getQueriesData<DispatchesResponse>({
        queryKey: ['admin', 'dispatches'],
      })
      const nextBilledAt = vars.billed ? new Date().toISOString() : null
      for (const [key, prev] of snapshots) {
        if (!prev) continue
        queryClient.setQueryData<DispatchesResponse>(key, {
          ...prev,
          dispatches: prev.dispatches.map((d) =>
            d.id === vars.id ? { ...d, billedAt: nextBilledAt } : d,
          ),
        })
      }
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      // ロールバック
      if (!ctx) return
      for (const [key, prev] of ctx.snapshots) {
        queryClient.setQueryData(key, prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'dispatches'] })
    },
  })

  const dispatches = data?.dispatches ?? []
  const total = data?.total ?? 0
  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE)

  return (
    <section data-testid="dispatch-table">
      {isLoading && (
        <div className="text-sm text-gray-500 py-4">読み込み中...</div>
      )}
      {isError && (
        <div className="text-sm text-red-600 py-4">取得失敗</div>
      )}

      {data && dispatches.length === 0 && (
        <div
          className="text-sm text-gray-400 py-8 text-center bg-white rounded-xl shadow-sm"
          data-testid="dispatch-empty"
        >
          該当する案件はありません
        </div>
      )}

      {data && dispatches.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* ヘッダ行 (PC のみ。「搬送予定」列は常時表示。) */}
          <div
            className="hidden sm:grid grid-cols-[180px_120px_120px_80px_100px_180px_minmax(240px,1fr)] gap-3 px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-100"
          >
            <span>案件番号</span>
            <span>日時</span>
            <span>隊員</span>
            <span>AS</span>
            <span>状態</span>
            <span>搬送予定</span>
            <span className="text-right">請求</span>
          </div>

          <ul className="divide-y divide-gray-100">
            {dispatches.map((d) => (
              <DispatchRow
                key={d.id}
                dispatch={d}
                today={today}
                onToggleBilling={(billed) =>
                  billingMutation.mutate({ id: d.id, billed })
                }
                isPendingTarget={
                  billingMutation.isPending &&
                  billingMutation.variables?.id === d.id
                }
              />
            ))}
          </ul>
        </div>
      )}

      {/* ページング */}
      {data && totalPages > 1 && (
        <nav
          className="flex items-center justify-center gap-1 mt-4 text-sm"
          data-testid="dispatch-pagination"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
            aria-label="前のページ"
          >
            &lt;
          </button>
          {buildPageItems(page, totalPages).map((item) =>
            item.type === 'ellipsis' ? (
              <span
                key={item.key}
                className="px-2 text-gray-400"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={item.page}
                type="button"
                onClick={() => setPage(item.page)}
                aria-current={item.page === page ? 'page' : undefined}
                className={`min-w-[2rem] rounded border px-2 py-1 ${
                  item.page === page
                    ? 'border-transparent bg-[#1C2948] text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.page}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
            aria-label="次のページ"
          >
            &gt;
          </button>
        </nav>
      )}
    </section>
  )
}

interface DispatchRowProps {
  dispatch: DispatchItem
  today: string
  onToggleBilling: (billed: boolean) => void
  isPendingTarget: boolean
}

function DispatchRow({
  dispatch: d,
  today,
  onToggleBilling,
  isPendingTarget,
}: DispatchRowProps) {
  const dispatchDate = dispatchDateJst(d.dispatchTime)
  const isOverdue = !!(
    dispatchDate &&
    dispatchDate < today &&
    d.billedAt === null &&
    !d.isDraft
  )

  const rowClass = isOverdue ? 'bg-red-50/40' : ''
  const billed = !!d.billedAt
  const isSecondaryPlan =
    d.status === 'STORED' && !!d.scheduledSecondaryAt

  return (
    <li className={rowClass}>
      <div
        className="grid grid-cols-1 sm:grid-cols-[180px_120px_120px_80px_100px_180px_minmax(240px,1fr)] gap-2 sm:gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
        data-testid="dispatch-row"
        data-overdue={isOverdue ? 'true' : 'false'}
      >
        {/* 案件番号 + 持ち越しバッジ */}
        <span className="flex items-center gap-2 font-mono text-xs text-gray-700 sm:text-sm">
          <Link
            href={`/dispatch/${d.id}/report`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
            data-testid="dispatch-number-link"
          >
            {d.dispatchNumber}
          </Link>
          {isOverdue && (
            <span
              className="inline-flex items-center whitespace-nowrap rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
              data-testid="overdue-badge"
            >
              持ち越し
            </span>
          )}
        </span>

        {/* 日時 */}
        <span className="text-xs sm:text-sm text-gray-700">
          <span className="sm:hidden text-gray-500 mr-1">日時:</span>
          {formatDispatchTime(d.dispatchTime)}
        </span>

        {/* 隊員 */}
        <span className="text-xs sm:text-sm" style={{ color: '#1C2948' }}>
          <span className="sm:hidden text-gray-500 mr-1">隊員:</span>
          {d.user.name}
        </span>

        {/* AS */}
        <span className="text-xs sm:text-sm text-gray-700">
          <span className="sm:hidden text-gray-500 mr-1">AS:</span>
          {d.assistance.displayAbbreviation}
        </span>

        {/* 状態 */}
        <span className="text-xs sm:text-sm">
          <span className="sm:hidden text-gray-500 mr-1">状態:</span>
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(
              d.status,
              d.isDraft,
              d.scheduledSecondaryAt,
            )}`}
            style={
              isSecondaryPlan ? { backgroundColor: '#71a9f7' } : undefined
            }
            data-testid="status-badge"
            data-secondary-plan={isSecondaryPlan ? 'true' : 'false'}
          >
            {statusLabel(d.status, d.isDraft, d.scheduledSecondaryAt)}
          </span>
        </span>

        {/* 搬送予定（常時表示。NULL は「—」） */}
        <span className="text-xs sm:text-sm text-gray-700">
          <span className="sm:hidden text-gray-500 mr-1">搬送予定:</span>
          {formatScheduled(d.scheduledSecondaryAt)}
        </span>

        {/* 請求列 (暫定 UI: Phase 5 で billing 画面に置換予定) */}
        <span className="flex min-w-[240px] items-center justify-end gap-2 whitespace-nowrap">
          <Link
            href={`/dispatch/${d.id}/report`}
            className="whitespace-nowrap rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100"
            data-testid="dispatch-edit-link"
          >
            編集
          </Link>
          {billed ? (
            <>
              <span
                className="inline-flex items-center whitespace-nowrap rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700"
                data-testid="billed-badge"
              >
                請求済
              </span>
              <button
                type="button"
                onClick={() => onToggleBilling(false)}
                disabled={isPendingTarget}
                className="whitespace-nowrap rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                data-testid="billing-toggle-off"
              >
                未請求に戻す
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onToggleBilling(true)}
              disabled={isPendingTarget}
              className="whitespace-nowrap rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              data-testid="billing-toggle-on"
            >
              請求済にする
            </button>
          )}
        </span>
      </div>
    </li>
  )
}
