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
    const breakRecord = await prisma.breakRecord.update({
      where: { id, userId: session.user.userId },
      data: { pauseTime: new Date() },
    })

    return NextResponse.json(breakRecord)
  } catch (e) {
    console.error('[PATCH /api/breaks/[id]/pause]', e)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
