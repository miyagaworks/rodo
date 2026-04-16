import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // 未終了の休憩が既に存在しないか確認
    const activeBreak = await prisma.breakRecord.findFirst({
      where: {
        userId: session.user.userId,
        tenantId: session.user.tenantId,
        endTime: null,
      },
    })
    if (activeBreak) {
      return NextResponse.json(
        { error: 'Active break already exists', breakRecordId: activeBreak.id },
        { status: 409 },
      )
    }

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
