import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const user = await prisma.user.update({
    where: { id, tenantId: session.user.tenantId },
    data: {
      name: body.name,
      vehicleNumber: body.vehicleNumber || null,
      monthlySalary: body.monthlySalary || null,
      overtimeRate: body.overtimeRate || null,
      transportationAllowance: body.transportationAllowance || null,
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

  await prisma.user.delete({
    where: { id, tenantId: session.user.tenantId },
  })

  return NextResponse.json({ success: true })
}
