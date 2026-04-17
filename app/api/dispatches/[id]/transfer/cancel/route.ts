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

  const dispatch = await prisma.dispatch.findUnique({
    where: { id, tenantId: session.user.tenantId },
  })
  if (!dispatch) {
    return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  }

  // 自分の出動のみキャンセル可能
  if (dispatch.userId !== session.user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // PENDING でなければキャンセル不可
  if (dispatch.transferStatus !== 'PENDING') {
    return NextResponse.json(
      { error: 'Transfer is not in PENDING status' },
      { status: 409 },
    )
  }

  try {
    const updated = await prisma.dispatch.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        transferStatus: 'CANCELLED',
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('POST /api/dispatches/[id]/transfer/cancel error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
