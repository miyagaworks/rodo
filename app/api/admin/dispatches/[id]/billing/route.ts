import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { billingSchema } from '@/lib/validations'

/**
 * PATCH /api/admin/dispatches/[id]/billing
 *
 * 「請求済み」ボタン用エンドポイント。
 * 認可: ADMIN ロールのみ。
 *
 * Body: { billed: boolean }
 *   true  → billedAt = now()
 *   false → billedAt = null
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const raw = await req.json()
  const parsed = billingSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const billedAt = parsed.data.billed ? new Date() : null

  try {
    const updated = await prisma.dispatch.update({
      where: { id, tenantId: session.user.tenantId },
      data: { billedAt },
      select: { id: true, billedAt: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
    }
    console.error('PATCH /api/admin/dispatches/[id]/billing error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
