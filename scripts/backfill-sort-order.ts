/**
 * 設定画面ドラッグ並び替え機能 (Phase 1) の backfill スクリプト。
 *
 * User / Vehicle / Assistance の 3 テーブルに対して、テナント単位で
 * createdAt 昇順に sortOrder = 0, 1, 2, ... を再付与する。
 *
 * 冪等性: 何度実行しても結果は同じ。毎回 createdAt 昇順で連番を再付与する。
 *
 * 使い方:
 *   npx tsx scripts/backfill-sort-order.ts
 *
 * 参考: docs/plans/drag-and-drop-reorder.md §2.3
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type TenantRow = { tenantId: string }

async function listTenantIds(model: 'user' | 'vehicle' | 'assistance'): Promise<string[]> {
  let rows: TenantRow[]
  if (model === 'user') {
    rows = await prisma.user.findMany({
      select: { tenantId: true },
      distinct: ['tenantId'],
    })
  } else if (model === 'vehicle') {
    rows = await prisma.vehicle.findMany({
      select: { tenantId: true },
      distinct: ['tenantId'],
    })
  } else {
    rows = await prisma.assistance.findMany({
      select: { tenantId: true },
      distinct: ['tenantId'],
    })
  }
  return rows.map((r) => r.tenantId)
}

async function backfillUser(): Promise<number> {
  const tenantIds = await listTenantIds('user')
  let updated = 0
  for (const tenantId of tenantIds) {
    const users = await prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (users.length === 0) continue
    await prisma.$transaction(
      users.map((u, i) =>
        prisma.user.update({
          where: { id: u.id },
          data: { sortOrder: i },
        })
      )
    )
    updated += users.length
    console.log(
      `  [User] tenant=${tenantId}: ${users.length} 件に sortOrder 再付与`
    )
  }
  return updated
}

async function backfillVehicle(): Promise<number> {
  const tenantIds = await listTenantIds('vehicle')
  let updated = 0
  for (const tenantId of tenantIds) {
    const vehicles = await prisma.vehicle.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (vehicles.length === 0) continue
    await prisma.$transaction(
      vehicles.map((v, i) =>
        prisma.vehicle.update({
          where: { id: v.id },
          data: { sortOrder: i },
        })
      )
    )
    updated += vehicles.length
    console.log(
      `  [Vehicle] tenant=${tenantId}: ${vehicles.length} 件に sortOrder 再付与`
    )
  }
  return updated
}

async function backfillAssistance(): Promise<number> {
  const tenantIds = await listTenantIds('assistance')
  let updated = 0
  for (const tenantId of tenantIds) {
    const assistances = await prisma.assistance.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (assistances.length === 0) continue
    await prisma.$transaction(
      assistances.map((a, i) =>
        prisma.assistance.update({
          where: { id: a.id },
          data: { sortOrder: i },
        })
      )
    )
    updated += assistances.length
    console.log(
      `  [Assistance] tenant=${tenantId}: ${assistances.length} 件に sortOrder 再付与`
    )
  }
  return updated
}

async function main() {
  const startedAt = Date.now()
  console.log('[backfill-sort-order] 開始')

  const [userTenants, vehicleTenants, assistanceTenants] = await Promise.all([
    listTenantIds('user'),
    listTenantIds('vehicle'),
    listTenantIds('assistance'),
  ])
  console.log(
    `[INFO] テナント数: User=${userTenants.length} Vehicle=${vehicleTenants.length} Assistance=${assistanceTenants.length}`
  )

  console.log('[INFO] User backfill...')
  const userUpdated = await backfillUser()

  console.log('[INFO] Vehicle backfill...')
  const vehicleUpdated = await backfillVehicle()

  console.log('[INFO] Assistance backfill...')
  const assistanceUpdated = await backfillAssistance()

  const elapsed = Date.now() - startedAt
  console.log('')
  console.log('[DONE] 更新件数:')
  console.log(`  User       : ${userUpdated}`)
  console.log(`  Vehicle    : ${vehicleUpdated}`)
  console.log(`  Assistance : ${assistanceUpdated}`)
  console.log(`  処理時間    : ${elapsed}ms`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
