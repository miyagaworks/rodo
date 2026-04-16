import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: { tenantId: session.user.tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      vehicleNumber: true,
      monthlySalary: true,
      overtimeRate: true,
      transportationAllowance: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(users)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : undefined

  const user = await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      name: body.name,
      email: body.email,
      role: body.role || 'MEMBER',
      passwordHash,
      vehicleNumber: body.vehicleNumber,
      monthlySalary: body.monthlySalary,
      overtimeRate: body.overtimeRate,
      transportationAllowance: body.transportationAllowance,
    },
  })

  return NextResponse.json(user, { status: 201 })
}
