import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { deleteTransportDestinationSchema } from '@/lib/validations'

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json()
  const parsed = deleteTransportDestinationSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { shopName, phone, address } = parsed.data

  // 該当する履歴の搬送先情報をクリア（レポート自体は削除しない）
  await prisma.report.updateMany({
    where: {
      dispatch: { tenantId: session.user.tenantId },
      transportShopName: shopName,
      ...(phone ? { transportPhone: phone } : {}),
      ...(address ? { transportAddress: address } : {}),
    },
    data: {
      transportShopName: null,
      transportPhone: null,
      transportAddress: null,
      transportContact: null,
    },
  })

  return NextResponse.json({ ok: true })
}
