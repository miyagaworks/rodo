import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { updateAssistanceSchema } from '@/lib/validations'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const raw = await req.json()
  const parsed = updateAssistanceSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body = parsed.data

  const companies: string[] = Array.isArray(body.insuranceCompanies)
    ? body.insuranceCompanies.filter((v): v is string => v.trim() !== '')
    : []

  const assistance = await prisma.$transaction(async (tx) => {
    await tx.insuranceCompany.deleteMany({
      where: { assistanceId: id, tenantId: session.user.tenantId },
    })

    return tx.assistance.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        name: body.name,
        displayAbbreviation: body.displayAbbreviation,
        insuranceCompanies: {
          create: companies.map((companyName, i) => ({
            tenantId: session.user.tenantId,
            name: companyName,
            sortOrder: i,
          })),
        },
      },
      include: { insuranceCompanies: true },
    })
  })

  return NextResponse.json(assistance)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  await prisma.assistance.delete({
    where: { id, tenantId: session.user.tenantId },
  })

  return NextResponse.json({ success: true })
}
