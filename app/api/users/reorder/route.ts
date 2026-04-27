import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { reorderSchema } from '@/lib/validations'

export async function POST(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const raw = await req.json()
  const parsed = reorderSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { orderedIds } = parsed.data
  const tenantId = session.user.tenantId

  // 整合性検証: テナント内の全 id 集合と orderedIds の集合が完全一致するか
  const existing = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((row) => row.id))
  const orderedIdSet = new Set(orderedIds)
  const sameSize = existingIds.size === orderedIdSet.size
  const allMatch = sameSize && [...orderedIdSet].every((id) => existingIds.has(id))
  if (!allMatch) {
    return NextResponse.json(
      { error: 'orderedIds does not match current records' },
      { status: 409 }
    )
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.user.update({
        where: { id, tenantId },
        data: { sortOrder: index },
      })
    )
  )

  return NextResponse.json({ success: true })
}
