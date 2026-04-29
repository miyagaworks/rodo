/**
 * Phase 4-B スクリーンショット用テストデータ投入スクリプト（一時用、未トラック）。
 *
 * - カレンダー（1 次搬送 + +N バッジが見える状態）+ 編集画面 + scheduledSecondaryAt あり
 * - 既存 PA-PH4A-* には触れず、PH4B-* を upsert
 *
 * 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-phase4b-screenshot-data.ts
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

  // 「+N 件」バッジを見せたいので、特定日 (今日) に 5 件投入
  const today10 = new Date(`${todayJst}T10:00:00+09:00`)
  const today11 = new Date(`${todayJst}T11:00:00+09:00`)
  const today12 = new Date(`${todayJst}T12:00:00+09:00`)
  const today13 = new Date(`${todayJst}T13:00:00+09:00`)
  const today14 = new Date(`${todayJst}T14:00:00+09:00`)

  // 別日 1 件（カレンダーの広がりを見せる）
  const otherDay = new Date(
    new Date(`${todayJst}T09:00:00+09:00`).getTime() + 2 * 24 * 60 * 60 * 1000,
  )

  // scheduledSecondaryAt 入りの STORED 案件（編集画面の表示用）
  const tomorrowSched = new Date(
    new Date(`${todayJst}T15:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000,
  )

  const cases = [
    {
      dispatchNumber: 'PH4B-001',
      dispatchTime: today10,
      type: 'ONSITE' as const,
      status: 'COMPLETED' as const,
      isDraft: false,
      plate: { region: '練馬', class: '500', kana: 'あ', number: '1234' },
      scheduledSecondaryAt: null as Date | null,
    },
    {
      dispatchNumber: 'PH4B-002',
      dispatchTime: today11,
      type: 'TRANSPORT' as const,
      status: 'STORED' as const,
      isDraft: false,
      plate: { region: '横浜', class: '300', kana: 'い', number: '5678' },
      scheduledSecondaryAt: tomorrowSched,
    },
    {
      dispatchNumber: 'PH4B-003',
      dispatchTime: today12,
      type: 'ONSITE' as const,
      status: 'COMPLETED' as const,
      isDraft: false,
      plate: { region: '湘南', class: '500', kana: 'え', number: '3456' },
      scheduledSecondaryAt: null,
    },
    {
      dispatchNumber: 'PH4B-004',
      dispatchTime: today13,
      type: 'ONSITE' as const,
      status: 'COMPLETED' as const,
      isDraft: false,
      plate: { region: '品川', class: '300', kana: 'う', number: '9012' },
      scheduledSecondaryAt: null,
    },
    {
      dispatchNumber: 'PH4B-005',
      dispatchTime: today14,
      type: 'TRANSPORT' as const,
      status: 'TRANSPORTING' as const,
      isDraft: false,
      plate: { region: '足立', class: '500', kana: 'お', number: '7890' },
      scheduledSecondaryAt: null,
    },
    {
      dispatchNumber: 'PH4B-006',
      dispatchTime: otherDay,
      type: 'ONSITE' as const,
      status: 'COMPLETED' as const,
      isDraft: false,
      plate: { region: '春日部', class: '500', kana: 'き', number: '2468' },
      scheduledSecondaryAt: null,
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
        type: c.type,
        status: c.status,
        isDraft: c.isDraft,
        plateRegion: c.plate.region,
        plateClass: c.plate.class,
        plateKana: c.plate.kana,
        plateNumber: c.plate.number,
        scheduledSecondaryAt: c.scheduledSecondaryAt,
        customerName: '田中 太郎',
        vehicleName: 'プリウス',
      },
      create: {
        tenantId: tenant.id,
        dispatchNumber: c.dispatchNumber,
        userId: member.id,
        assistanceId: assistance.id,
        type: c.type,
        status: c.status,
        isDraft: c.isDraft,
        dispatchTime: c.dispatchTime,
        plateRegion: c.plate.region,
        plateClass: c.plate.class,
        plateKana: c.plate.kana,
        plateNumber: c.plate.number,
        scheduledSecondaryAt: c.scheduledSecondaryAt,
        customerName: '田中 太郎',
        vehicleName: 'プリウス',
      },
    })
    console.log(`upserted ${c.dispatchNumber}`)
  }

  // 編集画面用の id を出力（撮影スクリプトで利用）
  const subject = await prisma.dispatch.findFirst({
    where: {
      tenantId: tenant.id,
      dispatchNumber: 'PH4B-001',
    },
    select: { id: true },
  })
  const stored = await prisma.dispatch.findFirst({
    where: {
      tenantId: tenant.id,
      dispatchNumber: 'PH4B-002',
    },
    select: { id: true },
  })
  console.log(`PH4B-001 id: ${subject?.id}`)
  console.log(`PH4B-002 (stored, with scheduledSecondaryAt) id: ${stored?.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
