/**
 * 指定ユーザー (miyagawakiyomi@gmail.com) の「endTime が null」の BreakRecord を
 * 確認用に列挙するスクリプト。**読み取り専用（dry-run only）**。
 *
 * 用途: 即終了不具合（research/2026-05-02-break-instant-end-investigation.md）の
 * 原因と疑われる「pause 状態のまま放置された未終了レコード」が DB に残っているかを確認する。
 *
 * 使い方:
 *
 *   npx tsx scripts/list-unfinished-breaks.ts
 *
 * 安全装置:
 *   - DATABASE_URL に "localhost" / "127.0.0.1" が含まれていない場合は強制終了
 *   - 削除コードは一切含まない（deleteMany / delete を一切使わない）
 *   - --apply 等のフラグも実装しない
 */

import { PrismaClient } from '@prisma/client'

const TARGET_EMAIL = 'miyagawakiyomi@gmail.com'

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? ''

  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
    console.error(
      `[SAFETY] DATABASE_URL が localhost を含まないため中止します: ${dbUrl.replace(/:[^@]+@/, ':***@')}`,
    )
    process.exit(1)
  }

  const prisma = new PrismaClient()

  try {
    const user = await prisma.user.findUnique({
      where: { email: TARGET_EMAIL },
      select: { id: true, email: true, tenantId: true },
    })
    if (!user) {
      console.error(`[ERROR] User not found: ${TARGET_EMAIL}`)
      process.exit(1)
    }
    console.log(`[INFO] Target user: ${user.email} (id=${user.id})`)

    const records = await prisma.breakRecord.findMany({
      where: {
        userId: user.id,
        endTime: null,
      },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        startTime: true,
        pauseTime: true,
        resumeTime: true,
        createdAt: true,
      },
    })

    console.log(`[INFO] Unfinished BreakRecord 件数: ${records.length}`)

    if (records.length === 0) {
      console.log('[INFO] 該当レコード無し。')
      return
    }

    // console.table 用に ISO 文字列に整形
    const tableRows = records.map((r) => ({
      id: r.id,
      startTime: r.startTime.toISOString(),
      pauseTime: r.pauseTime?.toISOString() ?? null,
      resumeTime: r.resumeTime?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
    console.table(tableRows)

    // 最も古いレコードの startTime からの経過時間
    const oldest = records[0]
    const elapsedMs = Date.now() - oldest.startTime.getTime()
    const elapsedHours = elapsedMs / (60 * 60 * 1000)
    console.log(
      `[INFO] 最古レコード startTime: ${oldest.startTime.toISOString()} / 経過時間: ${elapsedHours.toFixed(2)} 時間 (${(elapsedMs / 60000).toFixed(0)} 分)`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
