/**
 * Phase 3.5 スクリーンショット撮影スクリプト（一時用、未トラック）。
 *
 * - playwright-core + Playwright キャッシュ済み chromium を使用
 * - dev server (localhost:3000) が起動済みであることを前提
 * - admin@shimoda.example.com / admin1234 でログインしてダッシュボードを撮影
 *
 * 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/capture-phase35-screenshots.ts
 */
import { chromium } from 'playwright-core'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const CHROME_BIN = path.join(
  process.env.HOME!,
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const SCREEN_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'phase-3.5')

async function login(page: import('playwright-core').Page) {
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' })
  // 折りたたみフォームを展開
  await page.waitForSelector('text=メール / パスワードでログイン', { timeout: 60000 })
  await page.click('text=メール / パスワードでログイン')
  await page.waitForSelector('input[type="email"]', { timeout: 30000 })
  await page.fill('input[type="email"]', 'admin@shimoda.example.com')
  await page.fill('input[type="password"]', 'admin1234')
  await Promise.all([
    page.waitForURL(/\/(admin|dashboard|home|$)/, { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ])
}

async function gotoDashboard(page: import('playwright-core').Page) {
  await page.goto('http://localhost:3000/admin/dashboard', {
    waitUntil: 'domcontentloaded',
  })
  // 「保管中の車両」セクションが描画されるまで待機
  await page.waitForSelector('[data-testid="stored-vehicle-list"]', {
    timeout: 60000,
  })
  // データ取得が落ち着くまで少し待つ
  await page.waitForTimeout(1500)
}

async function setStoredVisible(visible: boolean) {
  const prisma = new PrismaClient()
  try {
    if (visible) {
      // SS-TEST-001..005 を STORED + isDraft=false に戻す
      await prisma.dispatch.updateMany({
        where: { dispatchNumber: { startsWith: 'SS-TEST-' } },
        data: { status: 'STORED', isDraft: false },
      })
    } else {
      // 一時的に隠す: isDraft=true に
      await prisma.dispatch.updateMany({
        where: { dispatchNumber: { startsWith: 'SS-TEST-' } },
        data: { isDraft: true },
      })
    }
  } finally {
    await prisma.$disconnect()
  }
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

  // 1) ログイン → デフォルトダッシュボード（保管中複数件）
  await setStoredVisible(true)
  await login(pcPage)
  await gotoDashboard(pcPage)
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '20-pc-stored-list-default.png'),
    fullPage: true,
  })
  console.log('saved 20-pc-stored-list-default.png')

  // 2) 「未定」だけ強調されている状態（特に新規スクショ不要だが計画に従って取得）
  // sorted の最後尾に未定が出るので、20 の中に既に含まれている。23 として「未定」拡大版を撮るため、
  // 該当箇所を含む viewport で full page を再撮影。
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '23-pc-stored-undecided.png'),
    fullPage: true,
  })
  console.log('saved 23-pc-stored-undecided.png')

  // 3) 編集 UI を開いた状態
  // 最初の行の [編集] をクリック
  await pcPage.click('[data-testid="edit-button"]')
  await pcPage.waitForSelector('[data-testid="scheduled-secondary-editor"]')
  await pcPage.waitForTimeout(300)
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '22-pc-stored-editor.png'),
    fullPage: true,
  })
  console.log('saved 22-pc-stored-editor.png')

  // 4) 0 件状態
  await setStoredVisible(false)
  await gotoDashboard(pcPage)
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '21-pc-stored-list-empty.png'),
    fullPage: true,
  })
  console.log('saved 21-pc-stored-list-empty.png')

  // 戻す
  await setStoredVisible(true)

  // SP ビュー (iPhone 14)
  const spContext = await browser.newContext({
    viewport: { width: 390, height: 1400 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  })
  const spPage = await spContext.newPage()
  await login(spPage)
  await gotoDashboard(spPage)
  await spPage.screenshot({
    path: path.join(SCREEN_DIR, '24-sp-stored-list.png'),
    fullPage: true,
  })
  console.log('saved 24-sp-stored-list.png')

  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
