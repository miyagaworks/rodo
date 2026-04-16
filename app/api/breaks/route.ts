import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const breakRecord = await prisma.breakRecord.create({
      data: {
        userId: session.user.userId,
        tenantId: session.user.tenantId,
        startTime: new Date(),
      },
    })

    return NextResponse.json(breakRecord, { status: 201 })
  } catch (e) {
    console.error('[POST /api/breaks]', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
