/**
 * Phase 4 SP カレンダー表示改善のスクリーンショット撮影スクリプト（一時用、未トラック）。
 *
 * 修正内容:
 *   - SP（< sm: 640px）でカレンダーセル内に「N 件」テキスト + 詳細ボタン (BiSolidDetail) を表示
 *   - 0 件の日は何も表示しない（日付数字のみ）
 *   - PC（>= sm）の表示は変更なし
 *
 * - playwright-core + Playwright キャッシュ済み chromium を使用
 * - dev server (localhost:3100) が起動済みであることを前提
 * - admin@shimoda.example.com / admin1234 でログイン
 * - phase-4-b で投入した PH4B-* シードを再利用
 *
 * 撮影:
 *   sp-calendar-default.png   - SP / カレンダー全体（件数 + 詳細ボタン）
 *   sp-calendar-modal.png     - SP / 詳細ボタンクリック後のモーダル展開
 *
 * 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/capture-phase4-sp-calendar.ts
 */
import { chromium } from 'playwright-core'
import path from 'path'

const CHROME_BIN = path.join(
  process.env.HOME!,
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const SCREEN_DIR = path.join(
  __dirname,
  '..',
  'docs',
  'screenshots',
  'phase-4-fix-sp-calendar',
)

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
  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
  })

  // ---------- SP (375x812 = iPhone X 相当) ----------
  const spContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const spPage = await spContext.newPage()
  await login(spPage)

  // 1) sp-calendar-default: カレンダー全体
  await spPage.goto('http://localhost:3100/admin/dispatches', {
    waitUntil: 'domcontentloaded',
  })
  await spPage.waitForSelector('[data-testid="tab-calendar"]', {
    timeout: 60000,
  })
  await spPage.click('[data-testid="tab-calendar"]')
  await spPage.waitForSelector('[data-testid="calendar-grid"]', {
    timeout: 60000,
  })
  // SP セル内サマリの描画を待つ
  await spPage.waitForSelector('[data-testid="calendar-cell-sp-summary"]', {
    timeout: 60000,
  })
  await spPage.waitForTimeout(800)
  await spPage.screenshot({
    path: path.join(SCREEN_DIR, 'sp-calendar-default.png'),
    fullPage: true,
  })
  console.log('saved sp-calendar-default.png')

  // 2) sp-calendar-modal: 詳細ボタンを押してモーダル展開
  const detailButtons = spPage.locator(
    '[data-testid="calendar-cell-sp-detail-button"]',
  )
  const count = await detailButtons.count()
  if (count === 0) {
    console.warn(
      'WARN: SP detail button not found. Calendar may have no events. Capturing as-is.',
    )
  } else {
    // 件数の多い日を選びたいので、各 button の親セルを走査して、対応する日を確認
    // セル内に入っている案件件数を直接取れないので、最初に見つかったものをクリック
    // PH4B シードで 2026-04-26 / 2026-04-29 等が +N になる想定
    // できるだけ件数が多そうな日を選ぶため、最後のボタンをクリックする
    const targetIndex = count - 1
    const target = detailButtons.nth(targetIndex)
    const cellDate = await target.evaluate((el) => {
      const cell = el.closest('[data-date]') as HTMLElement | null
      return cell?.dataset.date ?? null
    })
    await target.click()
    await spPage.waitForSelector('[data-testid="calendar-modal"]', {
      timeout: 5000,
    })
    await spPage.waitForTimeout(500)
    console.log(`  modal opened for date=${cellDate ?? 'unknown'}`)
  }
  await spPage.screenshot({
    path: path.join(SCREEN_DIR, 'sp-calendar-modal.png'),
    fullPage: true,
  })
  console.log('saved sp-calendar-modal.png')

  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
