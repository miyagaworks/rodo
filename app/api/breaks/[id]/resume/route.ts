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
    // 現在の状態を確認
    const existing = await prisma.breakRecord.findUnique({
      where: { id, userId: session.user.userId, tenantId: session.user.tenantId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.endTime) {
      return NextResponse.json({ error: 'Break already ended' }, { status: 409 })
    }
    if (!existing.pauseTime) {
      return NextResponse.json({ error: 'Break is not paused' }, { status: 409 })
    }

    const breakRecord = await prisma.breakRecord.update({
      where: { id, userId: session.user.userId, tenantId: session.user.tenantId },
      data: {
        resumeTime: new Date(),
        pauseTime: null,
      },
    })

    return NextResponse.json(breakRecord)
  } catch (e) {
    console.error('[PATCH /api/breaks/[id]/resume]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
