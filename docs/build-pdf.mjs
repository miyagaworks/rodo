#!/usr/bin/env node
/**
 * 下田社長ヒアリングシート 印刷用PDF 生成スクリプト
 *
 * 使い方:
 *   cd ~/Projects/rodo/app/docs
 *   node build-pdf.mjs
 *
 * 依存:
 *   - pandoc  (brew install pandoc)
 *   - weasyprint (brew install weasyprint)
 *
 * 入力:  shimoda-hearing-items.md  (本文は改変しない)
 *        hearing-print.css         (印刷用スタイル)
 * 出力:  shimoda-hearing-items.pdf
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = __dirname

const MD_PATH = join(DOCS_DIR, 'shimoda-hearing-items.md')
const CSS_PATH = join(DOCS_DIR, 'hearing-print.css')
const PDF_PATH = join(DOCS_DIR, 'shimoda-hearing-items.pdf')

// カテゴリー定義（md本文の順序に合わせる）
// 時間推定: 1問あたり 2分（1.5〜2.5分 の中間値）
const CATEGORIES = [
  { code: 'C', label: 'C. 機能の共通性・独自性', count: 9, minutes: 18, note: '最重要', skip: false },
  { code: 'A', label: 'A. アシスタンス会社の運用実態', count: 5, minutes: 10, note: '',        skip: false },
  { code: 'D', label: 'D. 料金プラン設計のヒント', count: 7, minutes: 14, note: '',           skip: false },
  { code: 'B', label: 'B. 地域特性（地名・高速道路マスタ）', count: 4, minutes: 8,  note: '',   skip: false },
  { code: 'E', label: 'E. 営業戦略・販路',                      count: 6, minutes: 12, note: '時間切れなら後日メール', skip: true },
  { code: 'F', label: 'F. その他（技術に関わる判断）',          count: 5, minutes: 10, note: '時間切れなら後日メール', skip: true },
]

// 全質問の一覧（目次用）
const QUESTIONS = [
  ['C','C-1','業務フローの共通性'],
  ['C','C-2','振替（TransferStatus）機能の普及度'],
  ['C','C-3','二次搬送の頻度感'],
  ['C','C-4','「達成賞」のような独自インセンティブ制度'],
  ['C','C-5','給与・残業代・交通費の計算ロジックのばらつき'],
  ['C','C-6','作業確認書（お客様サイン書）の項目構成'],
  ['C','C-7','作業確認書の免責文言の重要度'],
  ['C','C-8','オフライン運用の必要性'],
  ['C','C-9','写真・帳票出力のニーズ'],
  ['A','A-1','現在の6社は業界標準か'],
  ['A','A-2','6社以外の取引先候補'],
  ['A','A-3','アシスタンス表示デザインの確定時期'],
  ['A','A-4','アシスタンス会社別の運用ルールの違い'],
  ['A','A-5','関連損保会社の構成'],
  ['D','D-1','競合SaaSの存在'],
  ['D','D-2','業界の現状の業務管理ツール'],
  ['D','D-3','月額として払える妥当な価格帯'],
  ['D','D-4','隊員数 / 車両数による課金軸'],
  ['D','D-5','基本プラン / 上位プランで分けるなら'],
  ['D','D-6','買取型（100万円）と月額SaaSの切り分け'],
  ['D','D-7','初期費用・導入支援の有無'],
  ['B','B-1','ナンバー地名の表示順序（運用観察前提）'],
  ['B','B-2','高速道路マスタの並び順（運用観察前提）'],
  ['B','B-3','全国展開している会社と地域密着の会社の運用差'],
  ['B','B-4','業務範囲のエリア'],
  ['E','E-1','業界内人脈・紹介ルート'],
  ['E','E-2','業界団体の活用'],
  ['E','E-3','shimoda の「広告塔」としての関与'],
  ['E','E-4','競合の動向'],
  ['E','E-5','商談の決裁スピード感'],
  ['E','E-6','shimoda運用中の「業界一般との違い」観察メモ運用'],
  ['F','F-1','独自ドメイン運用の希望'],
  ['F','F-2','データ分離の温度感'],
  ['F','F-3','外国人ドライバー雇用の動向'],
  ['F','F-4','買取型（100万円）への誘導方針の確認'],
  ['F','F-5','既存業務システムとの連携希望'],
]

// ---------- pandoc で md → html フラグメント ----------
console.log('[1/5] pandoc で HTML フラグメントを生成...')
const htmlFragment = execFileSync(
  'pandoc',
  [MD_PATH, '--from', 'markdown', '--to', 'html5', '--wrap=none'],
  { encoding: 'utf-8' },
).toString()

// ---------- HTML 後処理 ----------
console.log('[2/5] HTML を後処理（質問ブロック整形、メモ欄注入）...')

/** h4 (質問) ブロックをラップし、メモ欄を注入 */
function wrapQuestionBlocks(html) {
  // <h4>...</h4> 以降 次のヘッダ or <hr> までを1つの質問ブロックとして扱う
  // 質問ブロック内の <p> に 質問/確認したいこと/回答で得たい情報 の strong がまとまって入っているので分解する
  return html.replace(
    /<h4[^>]*>([\s\S]*?)<\/h4>([\s\S]*?)(?=<h[1-4][^>]*>|<hr\s*\/?>|$)/g,
    (match, headingInner, bodyHtml) => {
      // <p>...</p> 内の strong を境界に分割
      const pMatch = bodyHtml.match(/<p>([\s\S]*?)<\/p>/)
      if (!pMatch) {
        return match // 想定外形式はそのまま
      }
      const inner = pMatch[1]

      // <strong>ラベル</strong>: 内容 の連続を抽出
      const parts = {}
      const splitRegex = /<strong>(質問|確認したいこと|回答で得たい情報)<\/strong>[:：]\s*/g
      const segments = inner.split(splitRegex)
      // segments[0] は先頭ラベル前のテキスト（通常は空）、以降は [label, content, label, content, ...]
      for (let i = 1; i < segments.length; i += 2) {
        const label = segments[i]
        const content = (segments[i + 1] || '').trim()
        parts[label] = content
      }

      let formatted = ''
      if (parts['質問']) {
        formatted += `<div class="q-main"><span class="q-main-label">質問</span>${parts['質問']}</div>`
      }
      if (parts['確認したいこと']) {
        formatted += `<div class="q-meta"><span class="q-meta-label">確認したいこと</span>${parts['確認したいこと']}</div>`
      }
      if (parts['回答で得たい情報']) {
        formatted += `<div class="q-meta"><span class="q-meta-label">回答で得たい情報</span>${parts['回答で得たい情報']}</div>`
      }

      // 質問コード（C-1 等）を抽出してid化
      const codeMatch = headingInner.match(/([A-Z]-\d+)/)
      const id = codeMatch ? `q-${codeMatch[1]}` : ''

      return (
        `<section class="question-block"${id ? ` id="${id}"` : ''}>` +
        `<h4>${headingInner.trim()}</h4>` +
        formatted +
        `<div class="memo-area">` +
        `<div class="memo-label">回答メモ</div>` +
        `<div class="memo-lines"></div>` +
        `</div>` +
        `</section>`
      )
    },
  )
}

/** カテゴリー扉（h3）を専用マークアップに変換 */
function wrapCategoryCovers(html) {
  // <h3>カテゴリーX: ...</h3> 直後の <p><strong>狙い</strong>: ...</p> をセットにして扉ページ化
  return html.replace(
    /<h3[^>]*>(カテゴリー[A-Z][^<]*)<\/h3>\s*<p><strong>狙い<\/strong>[:：]\s*([\s\S]*?)<\/p>/g,
    (m, heading, aim) => {
      const code = (heading.match(/カテゴリー([A-Z])/) || [])[1] || ''
      const catMeta = CATEGORIES.find((c) => c.code === code)
      const minutes = catMeta ? catMeta.minutes : ''
      const count = catMeta ? catMeta.count : ''
      const skipMark = catMeta && catMeta.skip ? '（時間切れ時はスキップ候補）' : ''
      return (
        `<section class="category-cover is-category" id="cat-${code}">` +
        `<h3 class="is-category">${heading}</h3>` +
        `<div class="aim">` +
        `<span class="aim-label">狙い</span>${aim.trim()}` +
        `</div>` +
        `<div class="category-meta">質問数 ${count}問 ／ 想定時間 約${minutes}分 ${skipMark}</div>` +
        `</section>`
      )
    },
  )
}

/** 巻末の情報ページ（ヒアリング後のアクション〜想定リスク・留意点）にクラス付与 */
function wrapAppendix(html) {
  // pandocは<h2 id="...">を出すので id 付きもマッチさせる
  const m = html.match(/<h2[^>]*>\s*ヒアリング後のアクション\s*<\/h2>/)
  if (!m) return html
  const idx = m.index
  const before = html.slice(0, idx)
  const after = html.slice(idx)
  return before + `<section class="appendix">` + after + `</section>`
}

let body = htmlFragment
body = wrapQuestionBlocks(body)
body = wrapCategoryCovers(body)
body = wrapAppendix(body)

// ---------- 表紙 + 目次 を組み立て ----------
console.log('[3/5] 表紙・目次を組み立て...')

// 目次の行を生成。カテゴリー合計行+各質問行
// ページ番号は weasyprint の target-counter(attr(href), page) でリンク先のページを自動取得
const tocRows = []
for (const cat of CATEGORIES) {
  tocRows.push(
    `<tr class="toc-category-sum">` +
    `<td class="col-cat">${cat.code}</td>` +
    `<td class="col-q"></td>` +
    `<td class="col-title"><a href="#cat-${cat.code}" class="toc-link">${cat.label}${cat.note ? `（${cat.note}）` : ''}</a></td>` +
    `<td class="col-time">約 ${cat.minutes} 分</td>` +
    `<td class="col-page"><a href="#cat-${cat.code}" class="toc-page-ref"></a></td>` +
    `</tr>`,
  )
  for (const [qcat, qcode, qtitle] of QUESTIONS) {
    if (qcat !== cat.code) continue
    tocRows.push(
      `<tr>` +
      `<td class="col-cat"></td>` +
      `<td class="col-q">${qcode}</td>` +
      `<td class="col-title"><a href="#q-${qcode}" class="toc-link">${qtitle}</a></td>` +
      `<td class="col-time">約 2 分</td>` +
      `<td class="col-page"><a href="#q-${qcode}" class="toc-page-ref"></a></td>` +
      `</tr>`,
    )
  }
}

const totalMinutes = CATEGORIES.reduce((s, c) => s + c.minutes, 0)
const totalQuestions = CATEGORIES.reduce((s, c) => s + c.count, 0)

const coverHtml = `
<section class="cover-page">
  <h1>下田社長<br>ヒアリングシート</h1>
  <div class="cover-meta">
    <dl>
      <dt>作成日</dt><dd>2026-04-20</dd>
      <dt>ヒアリング実施者</dt><dd>宮川（Senrigan）</dd>
      <dt>対象</dt><dd>株式会社shimoda 下田社長</dd>
      <dt>形式</dt><dd>対面 もしくは Zoom</dd>
      <dt>想定所要時間</dt><dd>60〜90分（全${totalQuestions}問）</dd>
    </dl>
  </div>
</section>
`

const tocHtml = `
<section class="toc-page">
  <h2>目次・タイムテーブル</h2>
  <div class="toc-note">
    時間目安: 全${totalQuestions}問で合計 約${totalMinutes}分（1問あたり約2分）。<br>
    当日、残り時間が厳しい場合は <strong>E・F を後日メールフォロー</strong> に切り替え、C〜B を優先してください。
  </div>
  <table class="toc-table">
    <thead>
      <tr>
        <th class="col-cat">分類</th>
        <th class="col-q">No.</th>
        <th class="col-title">質問タイトル</th>
        <th class="col-time">想定時間</th>
        <th class="col-page">P.</th>
      </tr>
    </thead>
    <tbody>
      ${tocRows.join('\n')}
    </tbody>
  </table>
</section>
`

// ---------- 完成HTML ----------
const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>下田社長ヒアリングシート</title>
  <link rel="stylesheet" href="hearing-print.css">
</head>
<body>
  ${coverHtml}
  ${tocHtml}
  ${body}
</body>
</html>
`

// ---------- 一時HTMLを書き出して weasyprint ----------
console.log('[4/5] 中間HTMLを書き出し...')
const tmp = mkdtempSync(join(tmpdir(), 'hearing-pdf-'))
const tmpHtml = join(tmp, 'hearing.html')
// CSS は相対パスで参照しているので同じディレクトリにコピー
writeFileSync(tmpHtml, html)
// ただし weasyprint の CWD 問題を避けるため、CSS 絶対パスで指定する形に切り替え
const htmlAbs = html.replace('href="hearing-print.css"', `href="${CSS_PATH}"`)
writeFileSync(tmpHtml, htmlAbs)

console.log('[5/5] weasyprint で PDF 生成...')
execFileSync('weasyprint', [tmpHtml, PDF_PATH, '--base-url', DOCS_DIR], {
  stdio: 'inherit',
})

rmSync(tmp, { recursive: true, force: true })

// ---------- 完了メッセージ ----------
const { size } = readFileSync(PDF_PATH) && { size: readFileSync(PDF_PATH).length }
console.log(`\n完成: ${PDF_PATH}`)
console.log(`サイズ: ${(size / 1024).toFixed(1)} KB`)
