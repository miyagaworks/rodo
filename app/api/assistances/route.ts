import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

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

  const body = await req.json()
  const assistance = await prisma.assistance.create({
    data: {
      tenantId: session.user.tenantId,
      name: body.name,
      displayAbbreviation: body.displayAbbreviation || '',
    },
    include: { insuranceCompanies: true },
  })

  return NextResponse.json(assistance, { status: 201 })
}
