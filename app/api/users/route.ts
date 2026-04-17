import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { createUserSchema } from '@/lib/validations'

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

  const raw = await req.json()
  const parsed = createUserSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body = parsed.data

  // email 重複チェック
  const existing = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(body.password, 12)

  const user = await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      name: body.name,
      email: body.email,
      role: body.role,
      passwordHash,
      vehicleNumber: body.vehicleNumber,
      monthlySalary: body.monthlySalary,
      overtimeRate: body.overtimeRate,
      transportationAllowance: body.transportationAllowance,
    },
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
  })

  return NextResponse.json(user, { status: 201 })
}
