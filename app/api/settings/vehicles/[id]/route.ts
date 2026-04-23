import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { updateVehicleSchema } from '@/lib/validations'
import { Prisma } from '@prisma/client'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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
  const parsed = updateVehicleSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body = parsed.data

  try {
    const vehicle = await prisma.vehicle.update({
      where: { id, tenantId: session.user.tenantId },
      data: body,
    })

    return NextResponse.json(vehicle)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') {
        return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
      }
      if (e.code === 'P2002') {
        return NextResponse.json(
          { error: 'Vehicle with this plate number already exists' },
          { status: 409 }
        )
      }
    }
    throw e
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const activeDispatches = await prisma.dispatch.count({
    where: {
      vehicleId: id,
      tenantId: session.user.tenantId,
      status: { notIn: ['RETURNED', 'CANCELLED', 'TRANSFERRED'] },
    },
  })
  if (activeDispatches > 0) {
    return NextResponse.json(
      { error: 'Vehicle is in use by active dispatches' },
      { status: 409 }
    )
  }

  try {
    await prisma.vehicle.delete({
      where: { id, tenantId: session.user.tenantId },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
    }
    throw e
  }
}
