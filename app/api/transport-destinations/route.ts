import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  if (!q) return NextResponse.json([])

  const results = await prisma.report.findMany({
    where: {
      dispatch: { tenantId: session.user.tenantId },
      transportShopName: { contains: q, mode: 'insensitive' },
      NOT: {
        AND: [
          { transportPhone: null },
          { transportAddress: null },
        ],
      },
    },
    select: {
      transportShopName: true,
      transportPhone: true,
      transportAddress: true,
      transportContact: true,
    },
    distinct: ['transportShopName', 'transportPhone', 'transportAddress'],
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(results)
}
