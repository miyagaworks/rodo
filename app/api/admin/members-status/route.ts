import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { deriveStatus } from '@/lib/admin/status-derivation'

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
