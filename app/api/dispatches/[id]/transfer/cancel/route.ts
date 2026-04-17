import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    // 楽観的ロック: transferStatus が PENDING のまま残っている場合のみキャンセル
    const result = await prisma.dispatch.updateMany({
      where: {
        id,
        tenantId: session.user.tenantId,
        userId: session.user.userId,
        transferStatus: 'PENDING',
      },
      data: {
        transferStatus: 'CANCELLED',
      },
    })

    if (result.count === 0) {
      return NextResponse.json(
        { error: '振替は既に引き受けられたかキャンセル済みです' },
        { status: 409 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /api/dispatches/[id]/transfer/cancel error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
