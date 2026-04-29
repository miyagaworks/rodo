/**
 * Phase 4 レイアウト修正スクリーンショット撮影スクリプト（一時用、未トラック）。
 *
 * - playwright-core + Playwright キャッシュ済み chromium を使用
 * - dev server (localhost:3100) が起動済みであることを前提
 * - admin@shimoda.example.com / admin1234 でログイン
 * - phase-4-a/4-b で投入した PH4A-* / PH4B-* シードを再利用
 *
 * 撮影:
 *   27-pc-dispatch-table-billing-toggle.png             - PC・請求列改行解消後の状態
 *   29-pc-dispatch-calendar.png                         - PC・カレンダー全幅活用 + テキスト拡大
 *   30-pc-dispatch-calendar-multiple.png                - PC・+N 件モーダル拡大版
 *   31-pc-dispatch-edit-form.png                        - PC・編集画面タイトル位置揃え
 *   32-pc-dispatch-edit-form-with-scheduled-secondary.png - PC・scheduledSecondaryAt あり
 *
 * 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/capture-phase4-fix-screenshots.ts
 */
import { chromium } from 'playwright-core'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const CHROME_BIN = path.join(
  process.env.HOME!,
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const SCREEN_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'phase-4-fix')

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
  if (!subject || !stored) {
    throw new Error(
      'PH4B-001 / PH4B-002 が seed されていません。先に scripts/seed-phase4b-screenshot-data.ts を実行してください。',
    )
  }

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
  })

  // ---------- PC ----------
  // 案件管理ページは max-w-[1536px] 化したため viewport も広めにする
  const pcContext = await browser.newContext({
    viewport: { width: 1536, height: 1800 },
    deviceScaleFactor: 2,
  })
  const pcPage = await pcContext.newPage()
  await login(pcPage)

  // 1) 27-pc-dispatch-table-billing-toggle: 請求列改行解消
  await pcPage.goto('http://localhost:3100/admin/dispatches', {
    waitUntil: 'domcontentloaded',
  })
  await pcPage.waitForSelector('[data-testid="dispatch-table"]', {
    timeout: 60000,
  })
  await pcPage.waitForTimeout(800)
  // 「請求済にする」ボタンを 1 つクリックして「請求済」+ 「未請求に戻す」状態を作る
  const firstToggle = pcPage.locator('[data-testid="billing-toggle-on"]').first()
  if ((await firstToggle.count()) > 0) {
    await firstToggle.click()
    await pcPage.waitForTimeout(1200)
  }
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '27-pc-dispatch-table-billing-toggle.png'),
    fullPage: true,
  })
  console.log('saved 27-pc-dispatch-table-billing-toggle.png')

  // 2) 29-pc-dispatch-calendar: カレンダー通常表示
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

  // 3) 30-pc-dispatch-calendar-multiple: +N 件モーダル展開
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

  // 4) 31-pc-dispatch-edit-form: 編集画面 (PH4B-001 通常案件)
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

  // 5) 32-pc-dispatch-edit-form-with-scheduled-secondary
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

  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
