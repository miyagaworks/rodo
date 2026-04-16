import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { updateUserSchema } from '@/lib/validations'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const raw = await req.json()
  const parsed = updateUserSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body = parsed.data

  const user = await prisma.user.update({
    where: { id, tenantId: session.user.tenantId },
    data: {
      name: body.name,
      vehicleNumber: body.vehicleNumber ?? null,
      monthlySalary: body.monthlySalary ?? null,
      overtimeRate: body.overtimeRate ?? null,
      transportationAllowance: body.transportationAllowance ?? null,
    },
  })

  return NextResponse.json(user)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // 自分自身の削除を防止
  if (id === session.user.userId) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  // 削除対象がADMINの場合、最後のADMINでないか確認
  const targetUser = await prisma.user.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { role: true },
  })
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (targetUser.role === 'ADMIN') {
    const adminCount = await prisma.user.count({
      where: { tenantId: session.user.tenantId, role: 'ADMIN' },
    })
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last admin user' }, { status: 400 })
    }
  }

  await prisma.user.delete({
    where: { id, tenantId: session.user.tenantId },
  })

  return NextResponse.json({ success: true })
}
