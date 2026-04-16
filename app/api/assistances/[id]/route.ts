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
  const { name, displayAbbreviation, insuranceCompanies } = body

  const assistance = await prisma.$transaction(async (tx) => {
    await tx.insuranceCompany.deleteMany({
      where: { assistanceId: id },
    })

    return tx.assistance.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        name,
        displayAbbreviation,
        insuranceCompanies: {
          create: (insuranceCompanies as string[]).map((companyName, i) => ({
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
