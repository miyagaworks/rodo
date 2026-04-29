/**
 * 保管中車両（STORED）の二次搬送予定日時に基づくソート純粋関数。
 *
 * Phase 3.5: 管理者ダッシュボード「保管中の車両」セクション用。
 *
 * 表示優先度（見落としやすい順）:
 *   1. 今日 (today)        - scheduledSecondaryAt が「今日」の業務日に属する
 *   2. 明日 (tomorrow)     - scheduledSecondaryAt が「明日」の業務日に属する
 *   3. それ以降 (future)   - scheduledSecondaryAt が「明日」より未来
 *   4. 未定 (undecided)    - scheduledSecondaryAt が NULL（保険会社からの依頼待ち）
 *   5. 過去 (past)         - scheduledSecondaryAt が「今日」より前（業務上は通常発生しないが防御的に分類）
 *
 * 同一カテゴリ内では scheduledSecondaryAt の昇順で並べる（NULL は dispatchNumber 昇順で安定化）。
 *
 * 「今日」の境界 Date は呼び出し側で `lib/admin/business-day.ts` の
 * `getBusinessDayDate` を使って算出して渡すこと。
 */

export type ScheduledCategory =
  | 'today'
  | 'tomorrow'
  | 'future'
  | 'undecided'
  | 'past'

/** ソート対象に必要な最小フィールド。実際の DispatchItem を受け取れるよう緩く定義。 */
export interface SortableDispatch {
  scheduledSecondaryAt: string | Date | null
  dispatchNumber: string
}

const PRIORITY: Record<ScheduledCategory, number> = {
  today: 0,
  tomorrow: 1,
  future: 2,
  undecided: 3,
  past: 4,
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * Date を JST の YYYY-MM-DD 文字列に変換する。
 */
function toJstDateString(d: Date): string {
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 「今日の業務日 (YYYY-MM-DD)」と scheduledSecondaryAt から分類を決定する。
 */
export function categorize(
  scheduledSecondaryAt: string | Date | null,
  todayBusinessDay: string,
): ScheduledCategory {
  if (scheduledSecondaryAt === null || scheduledSecondaryAt === undefined) {
    return 'undecided'
  }
  const date =
    scheduledSecondaryAt instanceof Date
      ? scheduledSecondaryAt
      : new Date(scheduledSecondaryAt)
  if (Number.isNaN(date.getTime())) {
    return 'undecided'
  }

  const targetDay = toJstDateString(date)
  const tomorrowDay = addOneDayJst(todayBusinessDay)

  if (targetDay === todayBusinessDay) return 'today'
  if (targetDay === tomorrowDay) return 'tomorrow'
  if (targetDay < todayBusinessDay) return 'past'
  return 'future'
}

/**
 * YYYY-MM-DD 文字列に 1 日加算して YYYY-MM-DD を返す。
 * JST 解釈で計算するため、ローカルタイムゾーン非依存。
 */
function addOneDayJst(dateStr: string): string {
  // JST 0 時を起点にするため明示的に +09:00 を付与
  const t = new Date(`${dateStr}T00:00:00.000+09:00`).getTime()
  // 24 時間加算（DST のない JST では問題なし）
  const next = new Date(t + 24 * 60 * 60 * 1000)
  return toJstDateString(next)
}

/**
 * 保管中案件をカテゴリ優先度順にソートして返す。
 *
 * @param items              保管中の Dispatch 配列
 * @param todayBusinessDay   「今日」の業務日 YYYY-MM-DD（呼び出し側で getBusinessDayDate を使って算出）
 * @returns                  優先度順に並べ替えた新しい配列（入力は変更しない）
 */
export function sortByScheduledSecondary<T extends SortableDispatch>(
  items: readonly T[],
  todayBusinessDay: string,
): T[] {
  const decorated = items.map((item) => ({
    item,
    category: categorize(item.scheduledSecondaryAt, todayBusinessDay),
    timestamp:
      item.scheduledSecondaryAt === null ||
      item.scheduledSecondaryAt === undefined
        ? Number.POSITIVE_INFINITY
        : (item.scheduledSecondaryAt instanceof Date
            ? item.scheduledSecondaryAt
            : new Date(item.scheduledSecondaryAt)
          ).getTime(),
  }))

  decorated.sort((a, b) => {
    const pa = PRIORITY[a.category]
    const pb = PRIORITY[b.category]
    if (pa !== pb) return pa - pb

    // カテゴリ内: 時刻昇順、NULL（undecided / 不正値）は dispatchNumber で安定化
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
    return a.item.dispatchNumber.localeCompare(b.item.dispatchNumber)
  })

  return decorated.map((d) => d.item)
}

/**
 * カテゴリごとの集計（バッジ件数表示などに使用可）。本タスクでは未使用だが、
 * 将来の拡張（Phase 4 / 5）で再利用しやすいよう公開しておく。
 */
export function groupByCategory<T extends SortableDispatch>(
  items: readonly T[],
  todayBusinessDay: string,
): Record<ScheduledCategory, T[]> {
  const groups: Record<ScheduledCategory, T[]> = {
    today: [],
    tomorrow: [],
    future: [],
    undecided: [],
    past: [],
  }
  for (const item of items) {
    const category = categorize(item.scheduledSecondaryAt, todayBusinessDay)
    groups[category].push(item)
  }
  return groups
}
