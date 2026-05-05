/**
 * P0-13: 既存 DataURL 署名を Vercel Blob にマイグレートする ETL スクリプト。
 *
 * 設計書: docs/plans/p0-13-signature-blob-migration.md (7.2 / 7.3 節)
 *
 * 実行例:
 *   pnpm tsx scripts/migrate-signatures-to-blob.ts            # dry-run（デフォルト）
 *   pnpm tsx scripts/migrate-signatures-to-blob.ts --apply    # 実際に書き換える
 *
 * 安全策:
 *   - --dry-run がデフォルト。--apply を明示しない限り書き込みは行わない。
 *   - 各レコードを 1 トランザクションで更新（3 列同時）。
 *   - NODE_ENV=production の場合は MIGRATE_SIG_CONFIRM=yes が必須。
 *
 * 終了コード:
 *   0 = 成功 / 変換対象なし
 *   1 = 失敗（途中で例外）
 */
import { PrismaClient } from '@prisma/client'
import {
  convertSignatureIfDataUrl,
  type SignatureType,
} from '../lib/blob/signature-storage'

const prisma = new PrismaClient()

interface CliOptions {
  apply: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const apply = argv.includes('--apply')
  return { apply }
}

interface RecordSummary {
  id: string
  dispatchId: string
  tenantId: string
  customerSignatureNeeds: boolean
  shopSignatureNeeds: boolean
  postApprovalSignatureNeeds: boolean
}

function isDataUrl(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.startsWith('data:')
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (process.env.NODE_ENV === 'production' && process.env.MIGRATE_SIG_CONFIRM !== 'yes') {
    console.error(
      'Refusing to run in production without MIGRATE_SIG_CONFIRM=yes. Aborting.',
    )
    process.exit(1)
  }

  console.log(`[migrate-signatures-to-blob] mode=${opts.apply ? 'APPLY' : 'DRY-RUN'}`)

  // 1. DataURL を含むレコードを抽出
  const records = await prisma.workConfirmation.findMany({
    where: {
      OR: [
        { customerSignature: { startsWith: 'data:' } },
        { shopSignature: { startsWith: 'data:' } },
        { postApprovalSignature: { startsWith: 'data:' } },
      ],
    },
    include: {
      dispatch: { select: { tenantId: true } },
    },
  })

  console.log(`[migrate-signatures-to-blob] found ${records.length} record(s) with DataURL signatures`)

  if (records.length === 0) {
    console.log('[migrate-signatures-to-blob] nothing to migrate. exiting.')
    await prisma.$disconnect()
    process.exit(0)
  }

  const summary: RecordSummary[] = []
  let successCount = 0
  let errorCount = 0

  for (const r of records) {
    const tenantId = r.dispatch.tenantId
    const dispatchId = r.dispatchId
    const detail: RecordSummary = {
      id: r.id,
      dispatchId,
      tenantId,
      customerSignatureNeeds: isDataUrl(r.customerSignature),
      shopSignatureNeeds: isDataUrl(r.shopSignature),
      postApprovalSignatureNeeds: isDataUrl(r.postApprovalSignature),
    }
    summary.push(detail)

    console.log(
      `[migrate-signatures-to-blob] confirmation=${r.id} dispatch=${dispatchId} tenant=${tenantId} ` +
        `customer=${detail.customerSignatureNeeds} shop=${detail.shopSignatureNeeds} post=${detail.postApprovalSignatureNeeds}`,
    )

    if (!opts.apply) continue

    const updates: { customerSignature?: string; shopSignature?: string; postApprovalSignature?: string } = {}

    try {
      const tasks: Array<Promise<void>> = []
      if (detail.customerSignatureNeeds && r.customerSignature) {
        tasks.push(
          (async () => {
            const url = await convertSignatureIfDataUrl(r.customerSignature, {
              tenantId,
              dispatchId,
              type: 'customer' satisfies SignatureType,
            })
            if (url) updates.customerSignature = url
          })(),
        )
      }
      if (detail.shopSignatureNeeds && r.shopSignature) {
        tasks.push(
          (async () => {
            const url = await convertSignatureIfDataUrl(r.shopSignature, {
              tenantId,
              dispatchId,
              type: 'shop' satisfies SignatureType,
            })
            if (url) updates.shopSignature = url
          })(),
        )
      }
      if (detail.postApprovalSignatureNeeds && r.postApprovalSignature) {
        tasks.push(
          (async () => {
            const url = await convertSignatureIfDataUrl(r.postApprovalSignature, {
              tenantId,
              dispatchId,
              type: 'postApproval' satisfies SignatureType,
            })
            if (url) updates.postApprovalSignature = url
          })(),
        )
      }
      await Promise.all(tasks)

      await prisma.workConfirmation.update({
        where: { id: r.id },
        data: updates,
      })

      successCount += 1
      console.log(`[migrate-signatures-to-blob]   ✓ updated confirmation=${r.id} keys=${Object.keys(updates).join(',')}`)
    } catch (err) {
      errorCount += 1
      console.error(`[migrate-signatures-to-blob]   ✗ failed confirmation=${r.id}:`, err)
    }
  }

  console.log('---')
  console.log(`[migrate-signatures-to-blob] summary: total=${records.length} success=${successCount} error=${errorCount} mode=${opts.apply ? 'APPLY' : 'DRY-RUN'}`)
  if (!opts.apply) {
    console.log('[migrate-signatures-to-blob] dry-run only. re-run with --apply to actually update.')
  }

  await prisma.$disconnect()
  process.exit(errorCount > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('[migrate-signatures-to-blob] fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
