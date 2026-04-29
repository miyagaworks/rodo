/**
 * Phase 4-A スクリーンショット撮影スクリプト（一時用、未トラック）。
 *
 * - playwright-core + Playwright キャッシュ済み chromium を使用
 * - dev server (localhost:3100) が起動済みであることを前提
 * - admin@shimoda.example.com / admin1234 でログインして案件管理を撮影
 *
 * 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/capture-phase4a-screenshots.ts
 */
import { chromium } from 'playwright-core'
import path from 'path'

const CHROME_BIN = path.join(
  process.env.HOME!,
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const SCREEN_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'phase-4-a')

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

async function gotoDispatches(page: import('playwright-core').Page) {
  await page.goto('http://localhost:3100/admin/dispatches', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('[data-testid="dispatch-table"]', {
    timeout: 60000,
  })
  await page.waitForTimeout(1500)
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
  })

  // PC ビュー
  const pcContext = await browser.newContext({
    viewport: { width: 1280, height: 1600 },
    deviceScaleFactor: 2,
  })
  const pcPage = await pcContext.newPage()

  // 1) 初期表示
  await login(pcPage)
  await gotoDispatches(pcPage)
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '25-pc-dispatch-table-default.png'),
    fullPage: true,
  })
  console.log('saved 25-pc-dispatch-table-default.png')

  // 2) 持ち越し赤バッジが見える状態（未請求フィルタを掛けて持ち越しのみに絞る）
  await pcPage.selectOption(
    '[data-testid="filter-status"]',
    'unbilled',
  )
  await pcPage.waitForTimeout(800)
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '26-pc-dispatch-table-overdue-highlighted.png'),
    fullPage: true,
  })
  console.log('saved 26-pc-dispatch-table-overdue-highlighted.png')

  // 3) 請求済↔未請求トグル後の状態
  // フィルタを「すべて」に戻し、PH4A-003（持ち越しではない当日未請求）を請求済に切り替える
  await pcPage.selectOption('[data-testid="filter-status"]', 'all')
  await pcPage.waitForTimeout(800)
  // 行内の「請求済にする」ボタンを 1 つクリック
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

  // SP ビュー (375x812)
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
  await gotoDispatches(spPage)
  await spPage.screenshot({
    path: path.join(SCREEN_DIR, '28-sp-dispatch-table.png'),
    fullPage: true,
  })
  console.log('saved 28-sp-dispatch-table.png')

  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
