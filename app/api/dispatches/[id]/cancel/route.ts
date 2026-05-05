import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/dispatches/[id]/cancel
 *
 * 案件キャンセル専用ルート（出動中の浮き案件防止 Phase 1 / Phase 5.5 拡張）。
 *
 * 設計方針:
 * - PATCH /api/dispatches/[id] の VALID_STATUS_TRANSITIONS は変更しない（案 A）。
 *   active → CANCELLED の遷移はこのルート内でローカルに検証する。
 * - 認可: 隊員ロールは自分の案件のみ。ADMIN は全案件可。
 * - キャンセル可能な状態（2026-05-04 ユーザー確認済み仕様 §J.3-C +
 *   2026-05-05 Phase 5.5 拡張）:
 *     1. DISPATCHED / ONSITE / WORKING / TRANSPORTING（現場対応中）
 *     2. COMPLETED && returnTime IS NULL（帰社中）
 *     3. **Phase 5.5 拡張**: (COMPLETED || RETURNED) && returnTime IS NOT NULL
 *        && isDraft === false（帰社後・書類作成未着手）
 *   `(COMPLETED || RETURNED) && isDraft === true` は 409 Conflict + 専用メッセージ
 *   （書類作成画面から操作する誘導）。
 *   その他（STANDBY / STORED / CANCELLED / TRANSFERRED 等）は 409。
 * - active な BreakRecord は本ルートでは触らない（出動中に休憩は存在しない前提）。
 * - 楽観的レスポンスは発生させない（Phase 1 計画書 §5.4: キャンセルはオンライン即時確定）。
 */

const ACTIVE_STATUSES = new Set([
  'DISPATCHED',
  'ONSITE',
  'WORKING',
  'TRANSPORTING',
])

const POST_RETURN_STATUSES = new Set(['COMPLETED', 'RETURNED'])

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
      isDraft: true,
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
  const isPostReturn = POST_RETURN_STATUSES.has(status)
  const cancellable =
    // 1. 現場対応中
    ACTIVE_STATUSES.has(status) ||
    // 2. 帰社中（COMPLETED && returnTime === null）
    (status === 'COMPLETED' && dispatch.returnTime === null) ||
    // 3. 帰社後・書類作成未着手（Phase 5.5 / 2026-05-05）
    (isPostReturn && dispatch.returnTime !== null && dispatch.isDraft === false)

  if (!cancellable) {
    // 帰社後・書類作成中（isDraft=true）は専用メッセージで誘導
    if (isPostReturn && dispatch.isDraft === true) {
      return NextResponse.json(
        {
          error:
            '書類作成中の案件はキャンセルできません。書類作成画面から操作してください',
        },
        { status: 409 },
      )
    }
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
