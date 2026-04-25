import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/dispatches/last-return-odo?vehicleId=xxx
 *
 * 指定車両 (vehicleId) × 同一テナント (session.user.tenantId) の
 * 直前の returnOdo (non-null) を返す。
 *
 * - vehicleId 未指定:   400 { error: 'vehicleId is required' }
 * - 見つかった場合:     200 { lastReturnOdo: number }
 * - 見つからない場合:   200 { lastReturnOdo: null }
 * - 未認証:            401
 * - DB エラー:         500
 *
 * Cache-Control: no-store (出動のたびに変わる値のためキャッシュ禁止)
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicleId')
  if (!vehicleId) {
    return NextResponse.json({ error: 'vehicleId is required' }, { status: 400 })
  }

  try {
    const latest = await prisma.dispatch.findFirst({
      where: {
        vehicleId,
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
