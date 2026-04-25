/**
 * dev 環境の Dispatch / Report を全削除するスクリプト。
 *
 * 背景: ODO 機能拡張（Phase A）で Dispatch / Report に 3 フィールドを追加したため、
 * 既存の中途半端なデータを一掃して整合のとれた状態で再投入できるようにする。
 *
 * 使い方（dev 環境でのみ実行すること）:
 *
 *   # dry run（削除対象件数のみ表示）
 *   npx tsx scripts/reset-dispatches-reports.ts
 *
 *   # 実削除
 *   npx tsx scripts/reset-dispatches-reports.ts --apply
 *
 * 安全装置:
 *   - DATABASE_URL が localhost / 127.0.0.1 を含まない場合は強制終了
 *   - --apply 無しでは件数表示のみ（ドライラン）
 *
 * 削除対象（外部キー制約の順序を踏まえてトランザクション内で実施）:
 *   1. Report                         (onDelete: Cascade だが明示削除)
 *   2. WorkConfirmation               (onDelete: Cascade だが明示削除)
 *   3. DispatchEtc                    (onDelete: Cascade だが明示削除)
 *   4. DispatchPhoto                  (onDelete: Cascade だが明示削除)
 *   5. BreakRecord.dispatchId = null  (Cascade 指定なし。参照を外すのみ、レコード自体は残す)
 *   6. Dispatch                       (親を全削除。子の Secondary も同時に消える)
 *
 * 注意:
 *   - BreakRecord は休憩データなので削除しない。紐付き（dispatchId）のみ null 化する。
 *   - transferredFrom/transferredTo は self relation (Dispatch 同士) なので親の全削除で一緒に消える。
 */

import { PrismaClient } from '@prisma/client'

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
  const startedAt = Date.now()

  try {
    // 削除前件数
    const [
      dispatchBefore,
      reportBefore,
      workConfirmationBefore,
      dispatchEtcBefore,
      dispatchPhotoBefore,
      breakRecordWithDispatchBefore,
    ] = await Promise.all([
      prisma.dispatch.count(),
      prisma.report.count(),
      prisma.workConfirmation.count(),
      prisma.dispatchEtc.count(),
      prisma.dispatchPhoto.count(),
      prisma.breakRecord.count({ where: { dispatchId: { not: null } } }),
    ])

    console.log('[INFO] 削除前件数:')
    console.log(`  - Dispatch:                        ${dispatchBefore}`)
    console.log(`  - Report:                          ${reportBefore}`)
    console.log(`  - WorkConfirmation:                ${workConfirmationBefore}`)
    console.log(`  - DispatchEtc:                     ${dispatchEtcBefore}`)
    console.log(`  - DispatchPhoto:                   ${dispatchPhotoBefore}`)
    console.log(`  - BreakRecord (dispatchId != null): ${breakRecordWithDispatchBefore}`)

    if (dispatchBefore === 0 && reportBefore === 0) {
      console.log('[INFO] 削除対象がありません。終了します。')
      return
    }

    if (!apply) {
      console.log('\n[DRY RUN] --apply を付けると実際に削除します。')
      return
    }

    console.log('\n[APPLY] トランザクション内で削除を実行します...')

    const result = await prisma.$transaction(async (tx) => {
      // 1. Report
      const deletedReport = await tx.report.deleteMany({})
      // 2. WorkConfirmation
      const deletedWorkConfirmation = await tx.workConfirmation.deleteMany({})
      // 3. DispatchEtc
      const deletedDispatchEtc = await tx.dispatchEtc.deleteMany({})
      // 4. DispatchPhoto
      const deletedDispatchPhoto = await tx.dispatchPhoto.deleteMany({})
      // 5. BreakRecord.dispatchId を null 化（レコード自体は残す）
      const detachedBreakRecord = await tx.breakRecord.updateMany({
        where: { dispatchId: { not: null } },
        data: { dispatchId: null },
      })
      // 6. Dispatch（Secondary は self-relation Cascade で自動削除されるよう FK は未設定。
      //    2 次搬送も Secondary として別 Dispatch レコードになっているため deleteMany で一括）
      //    transferredFrom/transferredTo は onDelete 未指定だが両方消えるので問題なし
      const deletedDispatch = await tx.dispatch.deleteMany({})

      return {
        deletedReport: deletedReport.count,
        deletedWorkConfirmation: deletedWorkConfirmation.count,
        deletedDispatchEtc: deletedDispatchEtc.count,
        deletedDispatchPhoto: deletedDispatchPhoto.count,
        detachedBreakRecord: detachedBreakRecord.count,
        deletedDispatch: deletedDispatch.count,
      }
    })

    console.log('[DONE] 削除結果:')
    console.log(`  - Report deleted:               ${result.deletedReport}`)
    console.log(`  - WorkConfirmation deleted:     ${result.deletedWorkConfirmation}`)
    console.log(`  - DispatchEtc deleted:          ${result.deletedDispatchEtc}`)
    console.log(`  - DispatchPhoto deleted:        ${result.deletedDispatchPhoto}`)
    console.log(`  - BreakRecord detached:         ${result.detachedBreakRecord}`)
    console.log(`  - Dispatch deleted:             ${result.deletedDispatch}`)

    // 削除後件数
    const [dispatchAfter, reportAfter] = await Promise.all([
      prisma.dispatch.count(),
      prisma.report.count(),
    ])
    console.log('\n[INFO] 削除後件数:')
    console.log(`  - Dispatch: ${dispatchAfter}`)
    console.log(`  - Report:   ${reportAfter}`)

    const elapsed = Date.now() - startedAt
    console.log(`\n[INFO] 処理時間: ${elapsed}ms`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
