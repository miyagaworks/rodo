import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { deriveStatus } from '@/lib/admin/status-derivation'
import { getBusinessDayDate } from '@/lib/admin/business-day'
import { closeStaleBreaksForTenant } from '@/lib/breakAutoClose'

/**
 * GET /api/admin/members-status
 *
 * テナント内の全隊員 + 各隊員のリアルタイムステータスを返す。
 * 認可: ADMIN ロールのみ。
 *
 * status の判定は `lib/admin/status-derivation.ts` の純粋関数で行う。
 *
 * 「アクティブな Dispatch」の SQL 上の絞り込み:
 *   - status が 'DISPATCHED' / 'ONSITE' / 'TRANSPORTING' / 'COMPLETED' のいずれか
 *   - status が 'COMPLETED' の場合は returnTime IS NULL のみ（帰社済みは除外）
 *   ただし returnTime の絞り込みは派生関数側でも再度ハンドリングする。
 *   （複合 OR が複雑になるため SQL 側は status だけで広めに取り、関数で確定させる）
 *   - isDraft: false（下書きは判定対象外。TodayDispatchSummary §設計判断 5 と同じ条件）
 *   - dispatchTime が「業務日の今日」の範囲内（前日以前の残置レコードは判定対象外）
 *     業務日は tenant.businessDayStartMinutes に基づき lib/admin/business-day.ts で計算する。
 *
 * 「アクティブな BreakRecord」: endTime IS NULL のみ。
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = session.user.tenantId

  // 業務日の範囲を算出（テナント設定の businessDayStartMinutes を反映）
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { businessDayStartMinutes: true },
  })
  const startMinutes = tenant?.businessDayStartMinutes ?? 0

  // 上限超過した古い未終了 BreakRecord をテナント単位で一括クローズしてから users を取得する。
  // /api/breaks 系（POST / GET active）はユーザー単位で closeStaleBreaks を実行しているが、
  // ここは 10 秒ポーリングで全隊員ステータスを返す経路のため、休憩中にブラウザを閉じる等で
  // 残った endTime=null の孤児がダッシュボードに「休憩中」として永続表示されないよう、
  // 取得前にテナント全体の孤児を一括クローズする（N+1 を避けるため tenant 単位 1 クエリ）。
  await closeStaleBreaksForTenant(prisma, { tenantId })

  const todayStr = getBusinessDayDate(new Date(), startMinutes)
  const todayStart = new Date(`${todayStr}T00:00:00.000+09:00`)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1)

  const users = await prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      vehicle: {
        select: { plateNumber: true, displayName: true },
      },
      dispatches: {
        // サブフェーズに変換可能な status のみ取得（関数側で returnTime を再度評価）
        where: {
          status: {
            in: ['DISPATCHED', 'ONSITE', 'TRANSPORTING', 'COMPLETED'],
          },
          isDraft: false,
          dispatchTime: { gte: todayStart, lt: tomorrowStart },
        },
        select: {
          id: true,
          dispatchNumber: true,
          status: true,
          returnTime: true,
          assistance: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      },
      breakRecords: {
        where: { endTime: null },
        select: { id: true, startTime: true },
        orderBy: { startTime: 'desc' },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const members = users.map((u) => {
    // アクティブな dispatch は派生関数で「サブフェーズに変換できる」最初の 1 件を採用
    // 関数内部で COMPLETED && returnTime !== null は弾かれるため、
    // ここでは最新（updatedAt desc 1 件目）を渡しつつ、ヒットしなければ STANDBY となる。
    const candidate = u.dispatches.find((d) => {
      if (d.status === 'COMPLETED') return d.returnTime === null
      // DISPATCHED / ONSITE / TRANSPORTING は無条件にアクティブ
      return true
    })

    const activeDispatch = candidate
      ? {
          id: candidate.id,
          dispatchNumber: candidate.dispatchNumber,
          status: candidate.status,
          returnTime: candidate.returnTime,
          assistance: candidate.assistance,
        }
      : null

    const activeBreak = u.breakRecords[0]
      ? { id: u.breakRecords[0].id, startTime: u.breakRecords[0].startTime }
      : null

    const derived = deriveStatus(activeDispatch, activeBreak)

    return {
      id: u.id,
      name: u.name,
      vehicle: u.vehicle
        ? { plateNumber: u.vehicle.plateNumber, displayName: u.vehicle.displayName }
        : null,
      status: derived.status,
      activeDispatch: derived.activeDispatch,
      activeBreak: derived.activeBreak,
    }
  })

  return NextResponse.json({
    members,
    fetchedAt: new Date().toISOString(),
  })
}
