import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const assistanceId = searchParams.get('assistanceId')

  const companies = await prisma.insuranceCompany.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(assistanceId ? { assistanceId } : {}),
    },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, assistanceId: true },
  })

  return NextResponse.json(companies)
}
