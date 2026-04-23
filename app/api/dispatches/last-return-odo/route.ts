import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/dispatches/last-return-odo
 *
 * 同一ユーザー (session.user.userId) × 同一テナント (session.user.tenantId) の
 * 直前の returnOdo (non-null) を返す。
 *
 * - 見つかった場合:   200 { lastReturnOdo: number }
 * - 見つからない場合: 200 { lastReturnOdo: null }   (404 ではなく null を返す。初回出動で UI 側が 000000 を表示する)
 * - 未認証:         401
 * - DB エラー:      500
 *
 * Cache-Control: no-store (出動のたびに変わる値のためキャッシュ禁止)
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const latest = await prisma.dispatch.findFirst({
      where: {
        userId: session.user.userId,
        tenantId: session.user.tenantId,
        returnOdo: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { returnOdo: true },
    })

    return NextResponse.json(
      { lastReturnOdo: latest?.returnOdo ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('[GET /api/dispatches/last-return-odo]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
