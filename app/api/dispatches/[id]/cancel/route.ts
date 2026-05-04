import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/dispatches/[id]/cancel
 *
 * 案件キャンセル専用ルート（出動中の浮き案件防止 Phase 1）。
 *
 * 設計方針:
 * - PATCH /api/dispatches/[id] の VALID_STATUS_TRANSITIONS は変更しない（案 A）。
 *   active → CANCELLED の遷移はこのルート内でローカルに検証する。
 * - 認可: 隊員ロールは自分の案件のみ。ADMIN は全案件可。
 * - キャンセル可能な状態（2026-05-04 ユーザー確認済み仕様 §J.3-C）:
 *     DISPATCHED / ONSITE / WORKING / TRANSPORTING / COMPLETED && returnTime IS NULL
 *   それ以外（STANDBY / RETURNED / STORED / CANCELLED / TRANSFERRED /
 *   COMPLETED && returnTime IS NOT NULL）は 409 Conflict。
 * - active な BreakRecord は本ルートでは触らない（出動中に休憩は存在しない前提）。
 * - 楽観的レスポンスは発生させない（Phase 1 計画書 §5.4: キャンセルはオンライン即時確定）。
 */

const CANCELLABLE_STATUSES = new Set([
  'DISPATCHED',
  'ONSITE',
  'WORKING',
  'TRANSPORTING',
  'COMPLETED',
])

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const dispatch = await prisma.dispatch.findUnique({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true,
      userId: true,
      status: true,
      returnTime: true,
    },
  })

  if (!dispatch) {
    return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  }

  // 認可: 隊員は自分の案件のみ。ADMIN は全案件可。
  const isAdmin = session.user.role === 'ADMIN'
  const isOwner = dispatch.userId === session.user.userId
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // キャンセル可能状態判定
  const status = dispatch.status
  const cancellable =
    CANCELLABLE_STATUSES.has(status) &&
    // COMPLETED は returnTime が null（帰社中）の場合のみ
    (status !== 'COMPLETED' || dispatch.returnTime === null)

  if (!cancellable) {
    return NextResponse.json(
      { error: 'キャンセルできない状態です' },
      { status: 409 },
    )
  }

  try {
    const updated = await prisma.dispatch.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: 'CANCELLED' },
      select: { id: true, status: true },
    })

    return NextResponse.json({ ok: true, dispatch: updated })
  } catch (err) {
    console.error('POST /api/dispatches/[id]/cancel error:', err)
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
