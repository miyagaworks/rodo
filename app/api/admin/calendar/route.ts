import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/calendar?year=YYYY&month=M
 *
 * 月間カレンダー用データ。Phase 4 仕様（docs/plans/admin-dashboard.md §4.3）。
 *
 * 業務観点: 1 次搬送（ONSITE / TRANSPORT で初動）の出動番号と車番だけをカレンダーに載せる。
 * 「いつ二次搬送するか・誰が持っていくか」はカレンダー外で管理（Phase 3.5 ダッシュボード「保管中の車両」）。
 *
 * 集計対象:
 *   - type ∈ (ONSITE, TRANSPORT)（SECONDARY_TRANSPORT 等は対象外。型としては存在しないが、
 *     1 次/2 次の区別は isSecondaryTransport で表現される。1 次のみを対象とするため
 *     `isSecondaryTransport: false` を明示）
 *   - 下書き案件もカレンダーに表示。下書きは UI 側で「下書」バッジに置換し
 *     現場/搬送/2次バッジと視覚的に区別する（テーブルとの件数乖離を解消するため）
 *   - 2 次搬送「予定」(scheduledSecondaryAt) を持つ 1 次案件を別クエリで集計し
 *     `secondaryPlanDispatches` として返す。UI 側で「2予」バッジ（2 次完了の「2次」と
 *     視覚的に区別）として表示する。下書きも含める。
 *
 * ソート:
 *   - primary / secondary（実施済 2 次）: 各日内で dispatchTime ASC
 *   - secondaryPlan（2 次予定）: 各日内で scheduledSecondaryAt ASC
 *
 * JST 境界: jstOffset = 9 * 60 * 60 * 1000。月初〜月末の UTC 範囲は前実装を踏襲。
 *
 * 認可: ADMIN ロールのみ。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

/** Date を JST 日付文字列 'YYYY-MM-DD' に変換 */
function toJstDateString(d: Date): string {
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`
}

interface CalendarPlate {
  region: string
  class: string
  kana: string
  number: string
}

interface CalendarDispatch {
  dispatchNumber: string
  plate: CalendarPlate | null
  type: 'ONSITE' | 'TRANSPORT'
  /** dispatchTime の ISO 文字列。クライアントでの統合ソートに使用。null の場合は末尾扱い。 */
  dispatchTime: string | null
  /** 下書き状態。UI 側で「下書」バッジに置換するために必要。 */
  isDraft: boolean
  /**
   * 二次搬送予定日時の ISO 文字列。
   * 「2予」バッジ行（secondaryPlanDispatches）はこの値をソートキーとする。
   * primary / secondary（実施済 2 次）の dispatchTime ベースの行では null。
   */
  scheduledSecondaryAt: string | null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? '', 10)
  const month = parseInt(searchParams.get('month') ?? '', 10)

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'Invalid year/month' },
      { status: 400 },
    )
  }

  // JST 月初〜月末の UTC 範囲
  // JST 00:00:00 = UTC 前日 15:00:00
  const startJst = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const startUtc = new Date(startJst.getTime() - JST_OFFSET_MS)
  // 翌月 1 日 JST 00:00:00 を上限（exclusive）
  const endJst = new Date(Date.UTC(year, month, 1, 0, 0, 0))
  const endUtc = new Date(endJst.getTime() - JST_OFFSET_MS)

  // 1 次搬送（カレンダーセル本体に並ぶ案件）。下書きも含む。
  const dispatches = await prisma.dispatch.findMany({
    where: {
      tenantId: session.user.tenantId,
      dispatchTime: { gte: startUtc, lt: endUtc },
      // 1 次搬送のみ（2 次はカレンダーの primary 対象外）
      isSecondaryTransport: false,
      // type は ONSITE / TRANSPORT のいずれか（schema enum 上はこの 2 値のみ。明示）
      type: { in: ['ONSITE', 'TRANSPORT'] },
    },
    orderBy: { dispatchTime: 'asc' },
    select: {
      dispatchNumber: true,
      dispatchTime: true,
      type: true,
      isDraft: true,
      plateRegion: true,
      plateClass: true,
      plateKana: true,
      plateNumber: true,
    },
  })

  // 2 次搬送（同月内）。primary と同じ shape で日付別集約しモーダルに出す。下書きも含む。
  const secondaryRows = await prisma.dispatch.findMany({
    where: {
      tenantId: session.user.tenantId,
      dispatchTime: { gte: startUtc, lt: endUtc },
      isSecondaryTransport: true,
      type: { in: ['ONSITE', 'TRANSPORT'] },
    },
    orderBy: { dispatchTime: 'asc' },
    select: {
      dispatchNumber: true,
      dispatchTime: true,
      type: true,
      isDraft: true,
      plateRegion: true,
      plateClass: true,
      plateKana: true,
      plateNumber: true,
    },
  })

  // 2 次搬送「予定」（同月内に scheduledSecondaryAt を持つ 1 次搬送案件）。
  // dispatchTime ベースの secondary（実施済）と区別し、UI で「2予」バッジを表示する。
  // 業務仕様: 下書きも含む（status フィルタは入れない。scheduledSecondaryAt の存在で判定）。
  const secondaryPlanRows = await prisma.dispatch.findMany({
    where: {
      tenantId: session.user.tenantId,
      scheduledSecondaryAt: { gte: startUtc, lt: endUtc },
      // 2 次搬送そのものには scheduledSecondaryAt は付かない想定（親 = 1 次のみ）
      isSecondaryTransport: false,
      type: { in: ['ONSITE', 'TRANSPORT'] },
    },
    orderBy: { scheduledSecondaryAt: 'asc' },
    select: {
      dispatchNumber: true,
      dispatchTime: true,
      type: true,
      isDraft: true,
      plateRegion: true,
      plateClass: true,
      plateKana: true,
      plateNumber: true,
      scheduledSecondaryAt: true,
    },
  })

  function rowToCalendarDispatch(d: {
    dispatchNumber: string
    dispatchTime: Date | null
    type: 'ONSITE' | 'TRANSPORT'
    isDraft: boolean
    plateRegion: string | null
    plateClass: string | null
    plateKana: string | null
    plateNumber: string | null
    scheduledSecondaryAt?: Date | null
  }): CalendarDispatch {
    const plate: CalendarPlate | null =
      d.plateRegion && d.plateClass && d.plateKana && d.plateNumber
        ? {
            region: d.plateRegion,
            class: d.plateClass,
            kana: d.plateKana,
            number: d.plateNumber,
          }
        : null
    return {
      dispatchNumber: d.dispatchNumber,
      plate,
      type: d.type,
      dispatchTime: d.dispatchTime ? d.dispatchTime.toISOString() : null,
      isDraft: d.isDraft,
      scheduledSecondaryAt: d.scheduledSecondaryAt
        ? d.scheduledSecondaryAt.toISOString()
        : null,
    }
  }

  // YYYY-MM-DD ごとに primaryDispatches を集約
  const byDate = new Map<string, CalendarDispatch[]>()
  for (const d of dispatches) {
    if (!d.dispatchTime) continue
    const key = toJstDateString(d.dispatchTime)
    const list = byDate.get(key) ?? []
    list.push(
      rowToCalendarDispatch({
        dispatchNumber: d.dispatchNumber,
        dispatchTime: d.dispatchTime,
        type: d.type as 'ONSITE' | 'TRANSPORT',
        isDraft: d.isDraft,
        plateRegion: d.plateRegion,
        plateClass: d.plateClass,
        plateKana: d.plateKana,
        plateNumber: d.plateNumber,
      }),
    )
    byDate.set(key, list)
  }

  // YYYY-MM-DD ごとに secondaryDispatches を集約（primary と同 shape）
  const secondaryByDate = new Map<string, CalendarDispatch[]>()
  for (const d of secondaryRows) {
    if (!d.dispatchTime) continue
    const key = toJstDateString(d.dispatchTime)
    const list = secondaryByDate.get(key) ?? []
    list.push(
      rowToCalendarDispatch({
        dispatchNumber: d.dispatchNumber,
        dispatchTime: d.dispatchTime,
        type: d.type as 'ONSITE' | 'TRANSPORT',
        isDraft: d.isDraft,
        plateRegion: d.plateRegion,
        plateClass: d.plateClass,
        plateKana: d.plateKana,
        plateNumber: d.plateNumber,
      }),
    )
    secondaryByDate.set(key, list)
  }

  // YYYY-MM-DD ごとに secondaryPlanDispatches を集約（キーは scheduledSecondaryAt の JST 日付）
  const secondaryPlanByDate = new Map<string, CalendarDispatch[]>()
  for (const d of secondaryPlanRows) {
    if (!d.scheduledSecondaryAt) continue
    const key = toJstDateString(d.scheduledSecondaryAt)
    const list = secondaryPlanByDate.get(key) ?? []
    list.push(
      rowToCalendarDispatch({
        dispatchNumber: d.dispatchNumber,
        dispatchTime: d.dispatchTime,
        type: d.type as 'ONSITE' | 'TRANSPORT',
        isDraft: d.isDraft,
        plateRegion: d.plateRegion,
        plateClass: d.plateClass,
        plateKana: d.plateKana,
        plateNumber: d.plateNumber,
        scheduledSecondaryAt: d.scheduledSecondaryAt,
      }),
    )
    secondaryPlanByDate.set(key, list)
  }

  // 月の全日を 1..lastDay 列挙
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const days = Array.from({ length: lastDay }, (_, i) => {
    const day = i + 1
    const date = `${year}-${pad2(month)}-${pad2(day)}`
    return {
      date,
      primaryDispatches: byDate.get(date) ?? [],
      secondaryDispatches: secondaryByDate.get(date) ?? [],
      secondaryPlanDispatches: secondaryPlanByDate.get(date) ?? [],
    }
  })

  return NextResponse.json({ year, month, days })
}
