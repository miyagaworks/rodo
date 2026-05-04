import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { mapStatusToSubPhase } from '@/lib/admin/status-derivation'

/**
 * GET /api/dispatches/active
 *
 * 自分（session.user.userId）が現在 active な Dispatch を 1 件返す。
 *
 * active の判定（status-derivation.ts と同期）:
 *   - status が DISPATCHED / ONSITE / TRANSPORTING のいずれか
 *   - もしくは status が COMPLETED かつ returnTime IS NULL（帰社中）
 *
 * 同一隊員に対して active が同時に複数存在する業務シナリオはないが、
 * 防御的に最新 1 件を返す（dispatchTime desc）。
 *
 * レスポンス:
 *   - 該当あり: { dispatch: { id, dispatchNumber, status, returnTime, type, subPhase, assistance: { name } } }
 *   - 該当なし: { dispatch: null }
 *
 * 認証必須。proxy.ts の PUBLIC_API_PREFIXES には追加しない。
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const dispatch = await prisma.dispatch.findFirst({
      where: {
        tenantId: session.user.tenantId,
        userId: session.user.userId,
        OR: [
          { status: { in: ['DISPATCHED', 'ONSITE', 'TRANSPORTING'] } },
          { status: 'COMPLETED', returnTime: null },
        ],
      },
      orderBy: { dispatchTime: 'desc' },
      select: {
        id: true,
        dispatchNumber: true,
        status: true,
        returnTime: true,
        type: true,
        assistance: { select: { name: true } },
      },
    })

    if (!dispatch) {
      return NextResponse.json({ dispatch: null })
    }

    const subPhase = mapStatusToSubPhase(dispatch.status, dispatch.returnTime)

    return NextResponse.json({
      dispatch: {
        id: dispatch.id,
        dispatchNumber: dispatch.dispatchNumber,
        status: dispatch.status,
        returnTime: dispatch.returnTime,
        type: dispatch.type,
        subPhase,
        assistance: dispatch.assistance,
      },
    })
  } catch (e) {
    console.error('[GET /api/dispatches/active]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
