import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const existing = await prisma.breakRecord.findUnique({
      where: { id, userId: session.user.userId, tenantId: session.user.tenantId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // 既に終了済みの場合は拒否
    if (existing.endTime) {
      return NextResponse.json({ error: 'Break already ended' }, { status: 409 })
    }

    // 合計休憩時間を計算（分）— 一時停止時間を考慮
    const startMs = existing.startTime.getTime()
    const endMs = Date.now()
    const totalMs = endMs - startMs
    const totalBreakMinutes = Math.round(totalMs / 60000)

    const breakRecord = await prisma.breakRecord.update({
      where: { id, userId: session.user.userId, tenantId: session.user.tenantId },
      data: {
        endTime: new Date(),
        totalBreakMinutes,
      },
    })

    return NextResponse.json(breakRecord)
  } catch (e) {
    console.error('[PATCH /api/breaks/[id]/end]', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
