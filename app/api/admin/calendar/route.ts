import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/calendar?year=YYYY&month=M
 *
 * 月間カレンダー用サマリ（日付ごとの案件総数 / 未処理件数）。
 * 認可: ADMIN ロールのみ。
 *
 * 「未処理」の定義: billedAt IS NULL OR (report 紐付け済み AND report.isDraft = true)
 *   - 紙併用期間中、紙で請求した案件はアプリ上でも「請求済み」を押すため、
 *     billedAt IS NULL は実質「請求業務未完了」を意味する。
 *   - 報告書下書き状態も未処理に含める。
 *
 * 集計は API 層で実施（Prisma の通常クエリで月単位の rows を取得 → JST 日付で groupBy）。
 * 件数増大時は raw SQL の GROUP BY に置換できるよう、本関数は集計を 1 箇所に閉じ込める。
 *
 * JST 境界: 既存 `app/api/dispatches/route.ts` の jstOffset = 9 * 60 * 60 * 1000 と整合。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

/** Date を JST 日付文字列 'YYYY-MM-DD' に変換 */
function toJstDateString(d: Date): string {
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  // toISOString() で UTC として扱われるが、+offset 済みなので JST 相当の日付として使える
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`
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

  const dispatches = await prisma.dispatch.findMany({
    where: {
      tenantId: session.user.tenantId,
      dispatchTime: { gte: startUtc, lt: endUtc },
    },
    select: {
      dispatchTime: true,
      billedAt: true,
      isDraft: true,
      report: { select: { isDraft: true } },
    },
  })

  // YYYY-MM-DD ごとに集計
  const totals = new Map<string, number>()
  const unprocessed = new Map<string, number>()

  for (const d of dispatches) {
    if (!d.dispatchTime) continue
    const key = toJstDateString(d.dispatchTime)
    totals.set(key, (totals.get(key) ?? 0) + 1)

    const isUnbilled = d.billedAt === null
    const reportDraft = d.report?.isDraft === true
    // 案件本体が下書き（isDraft）の場合は「未処理」というよりは「未確定」だが、
    // 業務上は同じ「対応必要」枠なので未処理に含める。
    if (isUnbilled || reportDraft || d.isDraft) {
      unprocessed.set(key, (unprocessed.get(key) ?? 0) + 1)
    }
  }

  // 月の全日を 1..lastDay 列挙
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const days = Array.from({ length: lastDay }, (_, i) => {
    const day = i + 1
    const date = `${year}-${pad2(month)}-${pad2(day)}`
    return {
      date,
      totalCount: totals.get(date) ?? 0,
      unprocessedCount: unprocessed.get(date) ?? 0,
    }
  })

  return NextResponse.json({ year, month, days })
}
