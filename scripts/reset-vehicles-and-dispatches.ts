/**
 * dev 環境の Vehicle / Dispatch / Report 関連データを全削除するスクリプト。
 *
 * 背景: 車両マスタ機能（Phase 1）で Vehicle テーブルを新設し、
 * User.vehicleNumber / Dispatch.vehicleNumber を vehicleId（FK）に置換したため、
 * 既存データを一掃して整合のとれた状態から再投入できるようにする。
 *
 * 使い方（dev 環境でのみ実行すること）:
 *
 *   # dry run（削除対象件数のみ表示）
 *   npx tsx scripts/reset-vehicles-and-dispatches.ts
 *
 *   # 実削除
 *   npx tsx scripts/reset-vehicles-and-dispatches.ts --apply
 *
 * 安全装置:
 *   - DATABASE_URL が localhost / 127.0.0.1 を含まない場合は強制終了
 *   - --apply 無しでは件数表示のみ（ドライラン）
 *
 * 削除対象（外部キー制約の順序を踏まえてトランザクション内で実施）:
 *   1. Report
 *   2. WorkConfirmation
 *   3. DispatchEtc
 *   4. DispatchPhoto
 *   5. BreakRecord.dispatchId = null（レコード自体は残す）
 *   6. Dispatch
 *   7. Vehicle
 *
 * 注意:
 *   - BreakRecord は休憩データなので削除しない。紐付き（dispatchId）のみ null 化する。
 *   - Phase 1 で User.vehicleNumber カラム自体が削除されているため、
 *     このスクリプトは vehicleNumber 処理を含まない。
 *   - Vehicle 削除前に User.vehicleId を null 化する（FK 制約対応）。
 *
 * 参考: scripts/reset-dispatches-reports.ts のパターンを踏襲。
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
      reportBefore,
      workConfirmationBefore,
      dispatchEtcBefore,
      dispatchPhotoBefore,
      breakRecordWithDispatchBefore,
      dispatchBefore,
      vehicleBefore,
    ] = await Promise.all([
      prisma.report.count(),
      prisma.workConfirmation.count(),
      prisma.dispatchEtc.count(),
      prisma.dispatchPhoto.count(),
      prisma.breakRecord.count({ where: { dispatchId: { not: null } } }),
      prisma.dispatch.count(),
      prisma.vehicle.count(),
    ])

    if (!apply) {
      console.log('[DRY RUN] 以下のレコードが削除されます:')
      console.log(`  Report:                          ${reportBefore}件`)
      console.log(`  WorkConfirmation:                ${workConfirmationBefore}件`)
      console.log(`  DispatchEtc:                     ${dispatchEtcBefore}件`)
      console.log(`  DispatchPhoto:                   ${dispatchPhotoBefore}件`)
      console.log(`  BreakRecord (dispatchId→null):   ${breakRecordWithDispatchBefore}件`)
      console.log(`  Dispatch:                        ${dispatchBefore}件`)
      console.log(`  Vehicle:                         ${vehicleBefore}件`)
      console.log('')
      console.log('実行するには --apply を付けてください')
      return
    }

    console.log('[APPLY] トランザクション内で削除を実行します...')

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
      // 6. Dispatch 全削除
      const deletedDispatch = await tx.dispatch.deleteMany({})
      // 7. User.vehicleId を null 化（Vehicle 削除前に FK 制約を解除）
      const detachedUserVehicle = await tx.user.updateMany({
        where: { vehicleId: { not: null } },
        data: { vehicleId: null },
      })
      // 8. Vehicle 全削除
      const deletedVehicle = await tx.vehicle.deleteMany({})

      return {
        deletedReport: deletedReport.count,
        deletedWorkConfirmation: deletedWorkConfirmation.count,
        deletedDispatchEtc: deletedDispatchEtc.count,
        deletedDispatchPhoto: deletedDispatchPhoto.count,
        detachedBreakRecord: detachedBreakRecord.count,
        deletedDispatch: deletedDispatch.count,
        detachedUserVehicle: detachedUserVehicle.count,
        deletedVehicle: deletedVehicle.count,
      }
    })

    console.log('[DONE] 削除結果:')
    console.log(`  Report deleted:                  ${result.deletedReport}`)
    console.log(`  WorkConfirmation deleted:         ${result.deletedWorkConfirmation}`)
    console.log(`  DispatchEtc deleted:             ${result.deletedDispatchEtc}`)
    console.log(`  DispatchPhoto deleted:            ${result.deletedDispatchPhoto}`)
    console.log(`  BreakRecord detached:            ${result.detachedBreakRecord}`)
    console.log(`  Dispatch deleted:                ${result.deletedDispatch}`)
    console.log(`  User vehicle detached:           ${result.detachedUserVehicle}`)
    console.log(`  Vehicle deleted:                 ${result.deletedVehicle}`)

    // 削除後件数
    const [dispatchAfter, reportAfter, vehicleAfter] = await Promise.all([
      prisma.dispatch.count(),
      prisma.report.count(),
      prisma.vehicle.count(),
    ])
    console.log('\n[INFO] 削除後件数:')
    console.log(`  Dispatch: ${dispatchAfter}`)
    console.log(`  Report:   ${reportAfter}`)
    console.log(`  Vehicle:  ${vehicleAfter}`)

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
