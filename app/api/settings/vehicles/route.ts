import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { createVehicleSchema } from '@/lib/validations'
import { Prisma } from '@prisma/client'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { tenantId: session.user.tenantId },
    include: { _count: { select: { users: true, dispatches: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(vehicles, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const raw = await req.json()
  const parsed = createVehicleSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body = parsed.data

  try {
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: session.user.tenantId,
        plateNumber: body.plateNumber,
        displayName: body.displayName,
        isActive: body.isActive,
      },
    })

    return NextResponse.json(vehicle, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json(
        { error: 'Vehicle with this plate number already exists' },
        { status: 409 }
      )
    }
    throw e
  }
}
