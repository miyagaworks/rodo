/**
 * Phase 4-A スクリーンショット用テストデータ投入スクリプト（一時用、未トラック）。
 *
 * - 持ち越し案件（前日以前 + 未請求）と請求済案件を網羅
 * - 既存案件には触れず PA-PH4A-* を upsert
 *
 * 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-phase4a-screenshot-data.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tenant = await prisma.tenant.findFirst()
  if (!tenant) throw new Error('No tenant found. Run seed first.')

  const member = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'MEMBER' },
  })
  if (!member) throw new Error('No member found.')

  const assistance = await prisma.assistance.findFirst({
    where: { tenantId: tenant.id },
  })
  if (!assistance) throw new Error('No assistance found.')

  const now = new Date()
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const todayJst = `${jstNow.getUTCFullYear()}-${String(
    jstNow.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`

  const yesterday10 = new Date(
    new Date(`${todayJst}T10:00:00+09:00`).getTime() - 24 * 60 * 60 * 1000,
  )
  const dayBefore09 = new Date(
    new Date(`${todayJst}T09:11:00+09:00`).getTime() - 2 * 24 * 60 * 60 * 1000,
  )
  const today11 = new Date(`${todayJst}T11:05:00+09:00`)
  const today10 = new Date(`${todayJst}T10:23:00+09:00`)

  const cases = [
    // 持ち越し（前日 + 未請求）
    {
      dispatchNumber: 'PH4A-001',
      dispatchTime: yesterday10,
      billedAt: null,
      isDraft: false,
      status: 'COMPLETED' as const,
      plate: { region: '練馬', class: '500', kana: 'あ', number: '1234' },
    },
    // 持ち越し（前々日 + 未請求）
    {
      dispatchNumber: 'PH4A-002',
      dispatchTime: dayBefore09,
      billedAt: null,
      isDraft: false,
      status: 'COMPLETED' as const,
      plate: { region: '横浜', class: '300', kana: 'い', number: '5678' },
    },
    // 当日完了 + 未請求（持ち越しではない）
    {
      dispatchNumber: 'PH4A-003',
      dispatchTime: today11,
      billedAt: null,
      isDraft: false,
      status: 'COMPLETED' as const,
      plate: { region: '湘南', class: '500', kana: 'え', number: '3456' },
    },
    // 当日 + 請求済
    {
      dispatchNumber: 'PH4A-004',
      dispatchTime: today10,
      billedAt: now,
      isDraft: false,
      status: 'COMPLETED' as const,
      plate: { region: '品川', class: '300', kana: 'う', number: '9012' },
    },
    // 進行中（搬送中）
    {
      dispatchNumber: 'PH4A-005',
      dispatchTime: today11,
      billedAt: null,
      isDraft: false,
      status: 'TRANSPORTING' as const,
      plate: { region: '足立', class: '500', kana: 'お', number: '7890' },
    },
  ]

  for (const c of cases) {
    await prisma.dispatch.upsert({
      where: {
        tenantId_dispatchNumber: {
          tenantId: tenant.id,
          dispatchNumber: c.dispatchNumber,
        },
      },
      update: {
        dispatchTime: c.dispatchTime,
        status: c.status,
        isDraft: c.isDraft,
        billedAt: c.billedAt,
        plateRegion: c.plate.region,
        plateClass: c.plate.class,
        plateKana: c.plate.kana,
        plateNumber: c.plate.number,
      },
      create: {
        tenantId: tenant.id,
        dispatchNumber: c.dispatchNumber,
        userId: member.id,
        assistanceId: assistance.id,
        type: 'ONSITE',
        status: c.status,
        isDraft: c.isDraft,
        dispatchTime: c.dispatchTime,
        billedAt: c.billedAt,
        plateRegion: c.plate.region,
        plateClass: c.plate.class,
        plateKana: c.plate.kana,
        plateNumber: c.plate.number,
      },
    })
    console.log(`upserted ${c.dispatchNumber}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
