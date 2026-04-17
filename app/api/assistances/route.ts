import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { createAssistanceSchema } from '@/lib/validations'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assistances = await prisma.assistance.findMany({
    where: { tenantId: session.user.tenantId },
    include: { insuranceCompanies: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json(assistances, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const raw = await req.json()
  const parsed = createAssistanceSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body = parsed.data

  const assistance = await prisma.assistance.create({
    data: {
      tenantId: session.user.tenantId,
      name: body.name,
      displayAbbreviation: body.displayAbbreviation,
    },
    include: { insuranceCompanies: true },
  })

  return NextResponse.json(assistance, { status: 201 })
}
