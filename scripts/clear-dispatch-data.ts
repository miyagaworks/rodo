/**
 * ローカル開発DBから「案件サイクル関連レコード」のみを削除するスクリプト。
 * マスタ系（User / Tenant / Vehicle / Assistance / InsuranceCompany）は保持する。
 *
 * 使い方:
 *   dry-run（デフォルト）: npx tsx scripts/clear-dispatch-data.ts
 *   実削除:                npx tsx scripts/clear-dispatch-data.ts --execute
 *
 * 安全装置（バイパス不可）:
 *   - DATABASE_URL 未定義なら abort
 *   - DATABASE_URL に本番疑いのキーワード（prod / production / supabase.co /
 *     vercel.app / railway.app / render.com / neon.tech）が含まれるなら abort
 *   - DATABASE_URL のホストが localhost / 127.0.0.1 でなければ abort
 *   - --execute 時は readline で "yes" 入力を要求（"yes" 以外なら abort）
 *   - --force 等のバイパスフラグは実装しない
 */

import { PrismaClient } from '@prisma/client'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

// =====================================================================
// 削除対象の3分類（prisma/schema.prisma を読んで確定）
// =====================================================================

/** 案件サイクル関連レコード。子→親の順に並べる（FK 依存順）。 */
const TARGETS_TO_DELETE = [
  'DispatchEtc',
  'DispatchPhoto',
  'Report',
  'WorkConfirmation',
  'BreakRecord',
  'Dispatch',
] as const

/** マスタ・認証系。削除対象外。 */
const TARGETS_TO_KEEP = [
  'User',
  'Tenant',
  'Vehicle',
  'Assistance',
  'InsuranceCompany',
] as const

/** 判別が曖昧で削除可否を保留するモデル。現スキーマでは該当なし。 */
const TARGETS_TO_REVIEW: readonly string[] = []

// =====================================================================
// 安全装置
// =====================================================================

const FORBIDDEN_URL_KEYWORDS = [
  'prod',
  'production',
  'supabase.co',
  'vercel.app',
  'railway.app',
  'render.com',
  'neon.tech',
]

function maskUrl(url: string): string {
  return url.replace(/:[^@/]+@/, ':***@')
}

function ensureLocalDb(dbUrl: string): void {
  if (!dbUrl) {
    console.error('[SAFETY] DATABASE_URL が未定義です。中止します。')
    process.exit(1)
  }

  const lower = dbUrl.toLowerCase()
  for (const kw of FORBIDDEN_URL_KEYWORDS) {
    if (lower.includes(kw)) {
      console.error(
        `[SAFETY] DATABASE_URL に "${kw}" が含まれます。本番疑いのため中止: ${maskUrl(dbUrl)}`,
      )
      process.exit(1)
    }
  }

  const isLocal = lower.includes('localhost') || lower.includes('127.0.0.1')
  if (!isLocal) {
    console.error(
      `[SAFETY] DATABASE_URL のホストが localhost / 127.0.0.1 ではありません。中止: ${maskUrl(dbUrl)}`,
    )
    process.exit(1)
  }
}

// =====================================================================
// 件数取得
// =====================================================================

async function countAll(prisma: PrismaClient): Promise<Record<string, number>> {
  const [
    dispatchEtc,
    dispatchPhoto,
    report,
    workConfirmation,
    breakRecord,
    dispatch,
    user,
    tenant,
    vehicle,
    assistance,
    insuranceCompany,
  ] = await Promise.all([
    prisma.dispatchEtc.count(),
    prisma.dispatchPhoto.count(),
    prisma.report.count(),
    prisma.workConfirmation.count(),
    prisma.breakRecord.count(),
    prisma.dispatch.count(),
    prisma.user.count(),
    prisma.tenant.count(),
    prisma.vehicle.count(),
    prisma.assistance.count(),
    prisma.insuranceCompany.count(),
  ])

  return {
    DispatchEtc: dispatchEtc,
    DispatchPhoto: dispatchPhoto,
    Report: report,
    WorkConfirmation: workConfirmation,
    BreakRecord: breakRecord,
    Dispatch: dispatch,
    User: user,
    Tenant: tenant,
    Vehicle: vehicle,
    Assistance: assistance,
    InsuranceCompany: insuranceCompany,
  }
}

function pad(name: string): string {
  return name.padEnd(18, ' ')
}

function printCountTable(
  title: string,
  models: readonly string[],
  counts: Record<string, number>,
): void {
  console.log(title)
  if (models.length === 0) {
    console.log('  (該当なし)')
  } else {
    for (const m of models) {
      const v = counts[m]
      console.log(`  ${pad(m)} ${v} 件`)
    }
  }
  console.log('')
}

// =====================================================================
// メイン
// =====================================================================

async function main() {
  const args = new Set(process.argv.slice(2))
  const execute = args.has('--execute')

  const dbUrl = process.env.DATABASE_URL ?? ''
  ensureLocalDb(dbUrl)

  console.log(`=== Database: ${maskUrl(dbUrl)} ===`)
  console.log(`=== Mode: ${execute ? 'EXECUTE (実削除)' : 'DRY-RUN'} ===`)
  console.log('')

  const prisma = new PrismaClient()

  try {
    const before = await countAll(prisma)

    printCountTable('[Before / 削除対象]', TARGETS_TO_DELETE, before)
    printCountTable('[Maintained / 保持対象]', TARGETS_TO_KEEP, before)

    if (TARGETS_TO_REVIEW.length > 0) {
      console.log('[Review / 判定保留 → 削除しない]')
      for (const m of TARGETS_TO_REVIEW) {
        console.log(`  ${pad(m)} (要ユーザー判断)`)
      }
      console.log('')
    } else {
      console.log('[Review / 判定保留] 該当なし')
      console.log('')
    }

    if (!execute) {
      console.log('[After dry-run] 何も変更していません。')
      console.log('実削除するには: npx tsx scripts/clear-dispatch-data.ts --execute')
      return
    }

    // ---- 実削除モード: 確認プロンプト ----
    const rl = readline.createInterface({ input, output })
    const answer = await rl.question(
      '本当に削除しますか？ ローカルDBから案件サイクル関連レコードを全削除します。\n"yes" と入力してください: ',
    )
    rl.close()

    if (answer.trim() !== 'yes') {
      console.error('[ABORT] "yes" 以外が入力されました。中止します。')
      process.exit(1)
    }

    console.log('')
    console.log('[削除中] トランザクション開始...')

    const deleted = await prisma.$transaction(async (tx) => {
      // Dispatch の自己参照 FK（parentDispatchId / transferredFromId /
      // transferredToId）は ON DELETE のカスケード指定が無いため、
      // deleteMany 前に null 化する必要がある。
      await tx.dispatch.updateMany({
        data: {
          parentDispatchId: null,
          transferredFromId: null,
          transferredToId: null,
        },
      })

      const r = {
        DispatchEtc: (await tx.dispatchEtc.deleteMany({})).count,
        DispatchPhoto: (await tx.dispatchPhoto.deleteMany({})).count,
        Report: (await tx.report.deleteMany({})).count,
        WorkConfirmation: (await tx.workConfirmation.deleteMany({})).count,
        BreakRecord: (await tx.breakRecord.deleteMany({})).count,
        Dispatch: (await tx.dispatch.deleteMany({})).count,
      }
      return r
    })

    console.log('[削除完了]')
    for (const m of TARGETS_TO_DELETE) {
      console.log(`  ${pad(m)} ${deleted[m as keyof typeof deleted]} 件削除`)
    }
    console.log('')

    const after = await countAll(prisma)
    console.log('[After]')
    for (const m of TARGETS_TO_DELETE) {
      console.log(`  ${pad(m)} ${before[m]} → ${after[m]} 件`)
    }
    for (const m of TARGETS_TO_KEEP) {
      console.log(`  ${pad(m)} ${before[m]} → ${after[m]} 件 (保持)`)
    }
  } catch (err) {
    console.error('')
    console.error('[ERROR] 削除中にエラーが発生しました。トランザクションは rollback されました。')
    console.error(err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
