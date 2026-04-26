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

  // sortOrder: 末尾配置 (同一テナント内の max + 1)
  const maxResult = await prisma.assistance.aggregate({
    where: { tenantId: session.user.tenantId },
    _max: { sortOrder: true },
  })
  const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1

  const assistance = await prisma.assistance.create({
    data: {
      tenantId: session.user.tenantId,
      name: body.name,
      displayAbbreviation: body.displayAbbreviation,
      sortOrder: nextSortOrder,
      insuranceCompanies: body.insuranceCompanies?.length
        ? {
            create: body.insuranceCompanies.map((name, i) => ({
              tenantId: session.user.tenantId,
              name,
              sortOrder: i,
            })),
          }
        : undefined,
    },
    include: { insuranceCompanies: { orderBy: { sortOrder: 'asc' } } },
  })

  return NextResponse.json(assistance, { status: 201 })
}
