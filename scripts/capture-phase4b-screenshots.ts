/**
 * Phase 4-B スクリーンショット撮影スクリプト（一時用、未トラック）。
 *
 * - playwright-core + Playwright キャッシュ済み chromium を使用
 * - dev server (localhost:3100) が起動済みであることを前提
 * - admin@shimoda.example.com / admin1234 でログイン
 *
 * 撮影:
 *   29-pc-dispatch-calendar.png             - PC・カレンダータブ通常表示
 *   30-pc-dispatch-calendar-multiple.png    - PC・+N 件バッジ展開モーダル
 *   31-pc-dispatch-edit-form.png            - PC・通常案件 (PH4B-001) の編集画面
 *   32-pc-dispatch-edit-form-with-scheduled-secondary.png - PC・PH4B-002 (scheduledSecondaryAt あり)
 *   33-sp-dispatch-edit-form.png            - SP 375x812・編集画面
 *
 * 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/capture-phase4b-screenshots.ts
 *
 * 引数: ターゲット dispatch id を seed スクリプトの出力からコピーして環境変数で渡す
 *   PH4B_001_ID=... PH4B_002_ID=... npx ts-node ... capture-phase4b-screenshots.ts
 */
import { chromium } from 'playwright-core'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const CHROME_BIN = path.join(
  process.env.HOME!,
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const SCREEN_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'phase-4-b')

async function login(page: import('playwright-core').Page) {
  await page.goto('http://localhost:3100/login', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('text=メール / パスワードでログイン', {
    timeout: 60000,
  })
  await page.click('text=メール / パスワードでログイン')
  await page.waitForSelector('input[type="email"]', { timeout: 30000 })
  await page.fill('input[type="email"]', 'admin@shimoda.example.com')
  await page.fill('input[type="password"]', 'admin1234')
  await Promise.all([
    page.waitForURL(/\/(admin|dashboard|home|$)/, { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ])
}

async function main() {
  const prisma = new PrismaClient()
  const tenant = await prisma.tenant.findFirst()
  if (!tenant) throw new Error('tenant not found')
  const subject = await prisma.dispatch.findFirst({
    where: { tenantId: tenant.id, dispatchNumber: 'PH4B-001' },
    select: { id: true },
  })
  const stored = await prisma.dispatch.findFirst({
    where: { tenantId: tenant.id, dispatchNumber: 'PH4B-002' },
    select: { id: true },
  })
  await prisma.$disconnect()
  if (!subject || !stored) throw new Error('seed missing')

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
  })

  // ---------- PC ----------
  const pcContext = await browser.newContext({
    viewport: { width: 1280, height: 1600 },
    deviceScaleFactor: 2,
  })
  const pcPage = await pcContext.newPage()
  await login(pcPage)

  // 1) カレンダータブ通常表示
  await pcPage.goto('http://localhost:3100/admin/dispatches', {
    waitUntil: 'domcontentloaded',
  })
  await pcPage.waitForSelector('[data-testid="tab-calendar"]', {
    timeout: 60000,
  })
  await pcPage.click('[data-testid="tab-calendar"]')
  await pcPage.waitForSelector('[data-testid="calendar-grid"]', {
    timeout: 60000,
  })
  await pcPage.waitForTimeout(1500)
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '29-pc-dispatch-calendar.png'),
    fullPage: true,
  })
  console.log('saved 29-pc-dispatch-calendar.png')

  // 2) +N 件バッジクリック → モーダル展開
  const moreBadge = pcPage.locator('[data-testid="calendar-more-badge"]').first()
  if ((await moreBadge.count()) > 0) {
    await moreBadge.click()
    await pcPage.waitForSelector('[data-testid="calendar-modal"]', {
      timeout: 5000,
    })
    await pcPage.waitForTimeout(500)
  } else {
    console.warn(
      'WARN: +N badge not found. seed may not produce >3 events on a single day. Capturing as-is.',
    )
  }
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '30-pc-dispatch-calendar-multiple.png'),
    fullPage: true,
  })
  console.log('saved 30-pc-dispatch-calendar-multiple.png')

  // 3) 編集画面 (PH4B-001 通常案件)
  await pcPage.goto(
    `http://localhost:3100/admin/dispatches/${subject.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await pcPage.waitForSelector('[data-testid="dispatch-edit-form"]', {
    timeout: 60000,
  })
  await pcPage.waitForTimeout(1200)
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '31-pc-dispatch-edit-form.png'),
    fullPage: true,
  })
  console.log('saved 31-pc-dispatch-edit-form.png')

  // 4) 編集画面 (PH4B-002 scheduledSecondaryAt あり)
  await pcPage.goto(
    `http://localhost:3100/admin/dispatches/${stored.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await pcPage.waitForSelector('[data-testid="dispatch-edit-form"]', {
    timeout: 60000,
  })
  await pcPage.waitForTimeout(1200)
  await pcPage.screenshot({
    path: path.join(
      SCREEN_DIR,
      '32-pc-dispatch-edit-form-with-scheduled-secondary.png',
    ),
    fullPage: true,
  })
  console.log('saved 32-pc-dispatch-edit-form-with-scheduled-secondary.png')

  // ---------- SP ----------
  const spContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  })
  const spPage = await spContext.newPage()
  await login(spPage)
  await spPage.goto(
    `http://localhost:3100/admin/dispatches/${subject.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await spPage.waitForSelector('[data-testid="dispatch-edit-form"]', {
    timeout: 60000,
  })
  await spPage.waitForTimeout(1200)
  await spPage.screenshot({
    path: path.join(SCREEN_DIR, '33-sp-dispatch-edit-form.png'),
    fullPage: true,
  })
  console.log('saved 33-sp-dispatch-edit-form.png')

  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
