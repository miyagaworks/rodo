import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { shopName, phone, address } = await req.json()

  if (!shopName) return NextResponse.json({ error: 'shopName is required' }, { status: 400 })

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
