import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// 本番環境での実行を防止
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Seed script must not run in production')
  process.exit(1)
}

const prisma = new PrismaClient()

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin1234'
  const memberPassword = process.env.SEED_MEMBER_PASSWORD || 'member1234'
  // テナント作成
  const tenant = await prisma.tenant.upsert({
    where: { id: 'tenant-shimoda' },
    update: {},
    create: {
      id: 'tenant-shimoda',
      name: '株式会社Shimoda',
    },
  })

  // 車両マスタ作成
  const vehicle1 = await prisma.vehicle.upsert({
    where: {
      tenantId_plateNumber: {
        tenantId: tenant.id,
        plateNumber: '広島 330 あ 1234',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      plateNumber: '広島 330 あ 1234',
    },
  })

  const vehicle2 = await prisma.vehicle.upsert({
    where: {
      tenantId_plateNumber: {
        tenantId: tenant.id,
        plateNumber: '広島 330 い 5678',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      plateNumber: '広島 330 い 5678',
    },
  })

  // 管理者ユーザー作成
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12)
  await prisma.user.upsert({
    where: { email: 'admin@shimoda.example.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@shimoda.example.com',
      name: '管理者',
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
    },
  })

  // 隊員ユーザー作成
  const member1PasswordHash = await bcrypt.hash(memberPassword, 12)
  await prisma.user.upsert({
    where: { email: 'member1@shimoda.example.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'member1@shimoda.example.com',
      name: '田中太郎',
      role: 'MEMBER',
      passwordHash: member1PasswordHash,
      vehicleId: vehicle1.id,
      monthlySalary: 250000,
      overtimeRate: 1500,
      transportationAllowance: 10000,
    },
  })

  const member2PasswordHash = await bcrypt.hash(memberPassword, 12)
  await prisma.user.upsert({
    where: { email: 'member2@shimoda.example.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'member2@shimoda.example.com',
      name: '鈴木次郎',
      role: 'MEMBER',
      passwordHash: member2PasswordHash,
      vehicleId: vehicle2.id,
      monthlySalary: 230000,
      overtimeRate: 1400,
      transportationAllowance: 8000,
    },
  })

  // アシスタンス6社作成
  const assistanceData = [
    {
      name: 'プレステージインターナショナル PA',
      displayAbbreviation: 'PA',
      logoUrl: '/logos/assistance-pa.svg',
      sortOrder: 0,
      companies: ['東京海上日動', '三井住友海上', 'あいおいニッセイ同和'],
    },
    {
      name: 'プレステージインターナショナル SC',
      displayAbbreviation: 'SC',
      logoUrl: '/logos/assistance-sc.svg',
      sortOrder: 1,
      companies: ['損保ジャパン', '日新火災'],
    },
    {
      name: 'プライムアシスタンス',
      displayAbbreviation: 'プライム',
      logoUrl: '/logos/assistance-prime.svg',
      sortOrder: 2,
      companies: ['明治安田損保', 'セコム損保'],
    },
    {
      name: 'AWPジャパン',
      displayAbbreviation: 'AWP',
      logoUrl: '/logos/assistance-awp.svg',
      sortOrder: 3,
      companies: ['チューリッヒ', 'AIG損保'],
    },
    {
      name: '東京海上日動',
      displayAbbreviation: '東京海上',
      logoUrl: '/logos/assistance-tokiomarine.png',
      sortOrder: 4,
      companies: ['東京海上日動'],
    },
    {
      name: 'グランアシスタンス（MS&AD）',
      displayAbbreviation: 'グラン',
      logoUrl: '/logos/assistance-gran.svg',
      sortOrder: 5,
      companies: ['三井住友海上', 'あいおいニッセイ同和'],
    },
  ]

  for (const a of assistanceData) {
    const existing = await prisma.assistance.findFirst({
      where: { tenantId: tenant.id, name: a.name },
    })

    if (!existing) {
      await prisma.assistance.create({
        data: {
          tenantId: tenant.id,
          name: a.name,
          displayAbbreviation: a.displayAbbreviation,
          logoUrl: a.logoUrl,
          sortOrder: a.sortOrder,
          insuranceCompanies: {
            create: a.companies.map((name, i) => ({
              tenantId: tenant.id,
              name,
              sortOrder: i,
            })),
          },
        },
      })
    }
  }

  console.log('Seed completed!')
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('Admin: admin@shimoda.example.com / admin1234')
    console.log('Member: member1@shimoda.example.com / member1234')
    console.log('⚠️  Default passwords used. Set SEED_ADMIN_PASSWORD / SEED_MEMBER_PASSWORD for custom passwords.')
  } else {
    console.log('Admin: admin@shimoda.example.com')
    console.log('Member: member1@shimoda.example.com')
    console.log('(Passwords set from environment variables)')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
