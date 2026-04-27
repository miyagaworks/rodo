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
      vehicleId: true,
      vehicle: { select: { plateNumber: true, displayName: true } },
      monthlySalary: true,
      overtimeRate: true,
      transportationAllowance: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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

  // sortOrder: 末尾配置 (同一テナント内の max + 1)
  const maxResult = await prisma.user.aggregate({
    where: { tenantId: session.user.tenantId },
    _max: { sortOrder: true },
  })
  const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1

  const user = await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      name: body.name,
      email: body.email,
      role: body.role,
      passwordHash,
      vehicleId: body.vehicleId ?? null,
      monthlySalary: body.monthlySalary,
      overtimeRate: body.overtimeRate,
      transportationAllowance: body.transportationAllowance,
      sortOrder: nextSortOrder,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      vehicleId: true,
      vehicle: { select: { plateNumber: true, displayName: true } },
      monthlySalary: true,
      overtimeRate: true,
      transportationAllowance: true,
    },
  })

  return NextResponse.json(user, { status: 201 })
}
