/**
 * 管理者の現在の状態確認用（読み取り専用）。
 * - active BreakRecord（endTime=null）
 * - 今日のアクティブ Dispatch（DISPATCHED/ONSITE/TRANSPORTING/COMPLETED 系）
 * を一覧する。
 */
import { PrismaClient } from '@prisma/client'

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? ''
  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
    console.error('[SAFETY] not localhost'); process.exit(1)
  }
  const prisma = new PrismaClient()
  try {
    const admin = await prisma.user.findFirst({
      where: { email: 'admin@shimoda.example.com' },
    })
    if (!admin) { console.error('admin not found'); return }

    console.log(`=== admin: ${admin.name} (id=${admin.id}) ===`)

    const breaks = await prisma.breakRecord.findMany({
      where: { userId: admin.id, endTime: null },
      orderBy: { startTime: 'desc' },
    })
    console.log(`\n[active BreakRecord (endTime=null)]: ${breaks.length} 件`)
    for (const b of breaks) {
      const elapsed = Math.floor((Date.now() - b.startTime.getTime()) / 60000)
      console.log(`- id=${b.id} start=${b.startTime.toISOString()} pause=${b.pauseTime?.toISOString() ?? 'null'} resume=${b.resumeTime?.toISOString() ?? 'null'} elapsed=${elapsed}min`)
    }

    const dispatches = await prisma.dispatch.findMany({
      where: {
        userId: admin.id,
        status: { in: ['DISPATCHED', 'ONSITE', 'TRANSPORTING', 'COMPLETED'] },
        isDraft: false,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })
    console.log(`\n[recent active-ish Dispatch]: ${dispatches.length} 件`)
    for (const d of dispatches) {
      console.log(`- id=${d.id} number=${d.dispatchNumber} status=${d.status} returnTime=${d.returnTime?.toISOString() ?? 'null'} dispatchTime=${d.dispatchTime?.toISOString() ?? 'null'} updated=${d.updatedAt.toISOString()}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
