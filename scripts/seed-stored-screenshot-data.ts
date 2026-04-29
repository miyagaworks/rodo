/**
 * Phase 3.5 スクリーンショット用テストデータ投入スクリプト（一時用、未トラック）。
 *
 * - 既存 STORED 案件には触れない（isDraft=true なので一覧には出ない）
 * - 「今日」「明日」「未来」「未定」「過去」を網羅した STORED 案件を新規追加
 * - 撮影完了後はそのまま残しても dev DB なので問題なし
 *
 * 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-stored-screenshot-data.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tenant = await prisma.tenant.findFirst()
  if (!tenant) throw new Error('No tenant found. Run seed first.')

  const member = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'MEMBER' },
  })
  if (!member) throw new Error('No member found. Run seed first.')

  const assistance = await prisma.assistance.findFirst({
    where: { tenantId: tenant.id },
  })
  if (!assistance) throw new Error('No assistance found. Run seed first.')

  // JST の「今日」「明日」「未来」「過去」を計算
  const now = new Date()
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const todayJstStr = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`

  const todayPm = new Date(`${todayJstStr}T15:00:00+09:00`)
  const tomorrowAm = new Date(
    new Date(`${todayJstStr}T09:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000,
  )
  const future3d = new Date(
    new Date(`${todayJstStr}T13:00:00+09:00`).getTime() + 3 * 24 * 60 * 60 * 1000,
  )
  const yesterday = new Date(
    new Date(`${todayJstStr}T10:00:00+09:00`).getTime() - 24 * 60 * 60 * 1000,
  )

  const cases = [
    {
      dispatchNumber: 'SS-TEST-001',
      scheduledSecondaryAt: todayPm,
      plate: { region: '練馬', class: '500', kana: 'あ', number: '1234' },
    },
    {
      dispatchNumber: 'SS-TEST-002',
      scheduledSecondaryAt: tomorrowAm,
      plate: { region: '横浜', class: '300', kana: 'い', number: '5678' },
    },
    {
      dispatchNumber: 'SS-TEST-003',
      scheduledSecondaryAt: future3d,
      plate: { region: '湘南', class: '500', kana: 'え', number: '3456' },
    },
    {
      dispatchNumber: 'SS-TEST-004',
      scheduledSecondaryAt: null,
      plate: { region: '品川', class: '300', kana: 'う', number: '9012' },
    },
    {
      dispatchNumber: 'SS-TEST-005',
      scheduledSecondaryAt: yesterday,
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
        scheduledSecondaryAt: c.scheduledSecondaryAt,
        status: 'STORED',
        isDraft: false,
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
        type: 'TRANSPORT',
        status: 'STORED',
        isDraft: false,
        scheduledSecondaryAt: c.scheduledSecondaryAt,
        plateRegion: c.plate.region,
        plateClass: c.plate.class,
        plateKana: c.plate.kana,
        plateNumber: c.plate.number,
      },
    })
    console.log(`upserted ${c.dispatchNumber}`)
  }

  const count = await prisma.dispatch.count({
    where: { tenantId: tenant.id, status: 'STORED', isDraft: false },
  })
  console.log(`STORED + isDraft=false count: ${count}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
