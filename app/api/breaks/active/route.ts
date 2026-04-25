import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * 現在ログイン中ユーザーの未終了休憩（endTime === null）を返す。
 * クライアント側の atom が失われた状態で、DB に休憩が残っている場合に
 * 状態を復元するためのエンドポイント。
 */
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const activeBreak = await prisma.breakRecord.findFirst({
      where: {
        userId: session.user.userId,
        tenantId: session.user.tenantId,
        endTime: null,
      },
      orderBy: { startTime: 'desc' },
    })

    if (!activeBreak) {
      return NextResponse.json({ error: 'No active break' }, { status: 404 })
    }

    return NextResponse.json(activeBreak)
  } catch (e) {
    console.error('[GET /api/breaks/active]', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
