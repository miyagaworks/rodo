/**
 * Phase 4 追加修正 #3 のスクリーンショット撮影スクリプト（一時用、未トラック）。
 *
 * 修正内容:
 *   1. 編集ページのタイトル直下余白増加 (mb-10)
 *   2. 戻るボタンを「←」文字から IoIosArrowBack へ置換
 *   3. カレンダーモーダル「テーブルで詳細を見る」リンクを機能化
 *      （onJumpToTable コールバックでテーブルタブ + filter.from/to 自動適用）
 *   4. タブ周りスタイル調整（タイトル・フィルタとの間隔縮小、active 下線を金色 #C9A961 へ）
 *   5. fieldset/legend を section/h2 に置換（カード内 padding と整合）
 *
 * - playwright-core + Playwright キャッシュ済み chromium を使用
 * - dev server (localhost:3100) が起動済みであることを前提
 * - admin@shimoda.example.com / admin1234 でログイン
 * - phase-4-b で投入した PH4B-* シードを再利用
 *
 * 撮影:
 *   25-pc-dispatch-table-default.png                      - PC・タブスタイリッシュ後の初期表示
 *   29-pc-dispatch-calendar.png                           - PC・タブスタイリッシュ後のカレンダー
 *   30-pc-dispatch-calendar-multiple.png                  - PC・+N 件モーダル（リンク機能化済み）
 *   31-pc-dispatch-edit-form.png                          - PC・余白増 + 戻るボタン IoIosArrowBack + section/h2
 *   32-pc-dispatch-edit-form-with-scheduled-secondary.png - PC・同上、scheduledSecondaryAt 入力済み
 *   34-pc-dispatch-table-after-calendar-jump.png          - PC・カレンダーモーダル → リンク → テーブル(filter適用)
 *
 * 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/capture-phase4-fix3-screenshots.ts
 */
import { chromium } from 'playwright-core'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const CHROME_BIN = path.join(
  process.env.HOME!,
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const SCREEN_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'phase-4-fix3')

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

  const pcContext = await browser.newContext({
    viewport: { width: 1280, height: 1800 },
    deviceScaleFactor: 2,
  })
  const pcPage = await pcContext.newPage()
  await login(pcPage)

  // 1) 25-pc-dispatch-table-default: タブスタイリッシュ後の初期表示
  await pcPage.goto('http://localhost:3100/admin/dispatches', {
    waitUntil: 'domcontentloaded',
  })
  await pcPage.waitForSelector('[data-testid="dispatch-table"]', {
    timeout: 60000,
  })
  await pcPage.waitForTimeout(1000)
  await pcPage.screenshot({
    path: path.join(SCREEN_DIR, '25-pc-dispatch-table-default.png'),
    fullPage: true,
  })
  console.log('saved 25-pc-dispatch-table-default.png')

  // 2) 29-pc-dispatch-calendar: タブスタイリッシュ後のカレンダー
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

  // 3) 30-pc-dispatch-calendar-multiple: +N 件モーダル展開（リンク機能化済み）
  const moreBadge = pcPage.locator('[data-testid="calendar-more-badge"]').first()
  let badgeOpened = false
  let badgeDate: string | null = null
  if ((await moreBadge.count()) > 0) {
    // モーダルに渡される日付を抽出するため、バッジを含むセルの data-date を取得
    badgeDate = await moreBadge.evaluate((el) => {
      const cell = el.closest('[data-testid="calendar-cell"]') as HTMLElement | null
      return cell?.dataset.date ?? null
    })
    await moreBadge.click()
    await pcPage.waitForSelector('[data-testid="calendar-modal"]', {
      timeout: 5000,
    })
    await pcPage.waitForTimeout(500)
    badgeOpened = true
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

  // 4) 34-pc-dispatch-table-after-calendar-jump: モーダル内リンクでテーブルへジャンプ
  if (badgeOpened) {
    const jumpLink = pcPage.locator('[data-testid="calendar-modal-jump-to-table"]')
    await jumpLink.click()
    // タブが table に切り替わり、テーブル表示まで待つ
    await pcPage.waitForSelector('[data-testid="dispatch-table"]', {
      timeout: 60000,
    })
    await pcPage.waitForTimeout(1500)
    await pcPage.screenshot({
      path: path.join(
        SCREEN_DIR,
        '34-pc-dispatch-table-after-calendar-jump.png',
      ),
      fullPage: true,
    })
    console.log(
      `saved 34-pc-dispatch-table-after-calendar-jump.png (filter date=${badgeDate ?? 'unknown'})`,
    )

    // フィルタ適用の検証: filter-from / filter-to の値が badgeDate と一致するか確認
    if (badgeDate) {
      const fromVal = await pcPage
        .locator('[data-testid="filter-from"]')
        .inputValue()
      const toVal = await pcPage
        .locator('[data-testid="filter-to"]')
        .inputValue()
      console.log(`  filter.from=${fromVal} filter.to=${toVal}`)
      if (fromVal !== badgeDate || toVal !== badgeDate) {
        console.warn(
          `WARN: filter values not matching expected (${badgeDate}). got from=${fromVal} to=${toVal}`,
        )
      }
    }
  } else {
    console.warn('WARN: skipping 34 capture because badge was not opened')
  }

  // 5) 31-pc-dispatch-edit-form: 編集画面 (PH4B-001) - 余白増 + IoIosArrowBack + section/h2
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

  // 6) 32-pc-dispatch-edit-form-with-scheduled-secondary: 同上、scheduledSecondaryAt 入力済み
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
