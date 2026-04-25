/**
 * 宮川清実アカウントの「孤立した BreakRecord」を削除するための一回限りスクリプト。
 *
 * 対象: バグ①（POST /api/breaks の二重作成）で生じた 2 件を始末する用途。
 *
 * 使い方（dev 環境でのみ実行すること）:
 *
 *   # dry run（削除候補の一覧表示のみ）
 *   npx tsx scripts/delete-miyagawa-orphan-breaks.ts
 *
 *   # 実削除
 *   npx tsx scripts/delete-miyagawa-orphan-breaks.ts --apply
 *
 * 安全装置:
 *   - DATABASE_URL に "localhost" が含まれていない場合は強制終了
 *   - 対象は userId = 'cmo1kyz0500018ox048a2wxgn' または email = 'miyagawakiyomi@gmail.com'
 *   - 特定 2 件の id のみを削除（SPECIFIC_IDS）。念のため userId フィルタとの AND で削除する
 */

import { PrismaClient } from '@prisma/client'

const TARGET_EMAIL = 'miyagawakiyomi@gmail.com'
const TARGET_USER_ID = 'cmo1kyz0500018ox048a2wxgn'

// ユーザー報告のあった 2 件の id
const SPECIFIC_IDS = ['cmo8mxh8v00018od1hkh2jvsw', 'cmo8mxh8y00038od1g7cbhnmq']

async function main() {
  const apply = process.argv.includes('--apply')
  const dbUrl = process.env.DATABASE_URL ?? ''

  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
    console.error(
      `[SAFETY] DATABASE_URL が localhost を含まないため中止します: ${dbUrl.replace(/:[^@]+@/, ':***@')}`,
    )
    process.exit(1)
  }

  const prisma = new PrismaClient()

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: TARGET_USER_ID }, { email: TARGET_EMAIL }],
      },
      select: { id: true, email: true, tenantId: true },
    })
    if (!user) {
      console.error(`[ERROR] User not found: ${TARGET_EMAIL} / ${TARGET_USER_ID}`)
      process.exit(1)
    }
    console.log(`[INFO] Target user: ${user.email} (id=${user.id})`)

    // 特定の id と userId の両方に一致する record のみを対象にする
    const candidates = await prisma.breakRecord.findMany({
      where: {
        id: { in: SPECIFIC_IDS },
        userId: user.id,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        pauseTime: true,
        resumeTime: true,
      },
    })

    console.log(`[INFO] Matched ${candidates.length} record(s):`)
    for (const r of candidates) {
      console.log(
        `  - id=${r.id} startTime=${r.startTime.toISOString()} endTime=${r.endTime?.toISOString() ?? 'null'}`,
      )
    }

    if (candidates.length === 0) {
      console.log('[INFO] No records to delete. Exiting.')
      return
    }

    if (!apply) {
      console.log('[DRY RUN] Pass --apply to actually delete.')
      return
    }

    const result = await prisma.breakRecord.deleteMany({
      where: {
        id: { in: candidates.map((c) => c.id) },
        userId: user.id,
      },
    })
    console.log(`[DONE] Deleted ${result.count} record(s).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
