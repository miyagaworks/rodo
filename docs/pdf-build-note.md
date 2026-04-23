# shimoda-hearing-items.pdf 生成手順メモ

ヒアリングシート印刷用PDFの再生成手順。md本文を更新したら、このメモに従って PDF を再生成する。

## 成果物

| ファイル | 役割 |
|---|---|
| `shimoda-hearing-items.md` | 原本（本文）。**改変しない** |
| `hearing-print.css` | 印刷用スタイルシート（A4縦、日本語フォント、手書き欄、改ページ等） |
| `build-pdf.mjs` | md → HTML → PDF 変換スクリプト |
| `shimoda-hearing-items.pdf` | 出力物（印刷用） |

## 必要な依存

macOS（Apple Silicon/Intel 両対応）を想定。

```bash
brew install pandoc weasyprint
# Node.js は本プロジェクトの開発環境で既に入っている想定（v20+ 推奨）
```

日本語フォントは macOS 標準搭載の「ヒラギノ角ゴシック（Hiragino Sans）」を使う。追加インストール不要。
非 macOS 環境で生成する場合は `hearing-print.css` の `font-family` を `"Noto Sans CJK JP"` 等に差し替えること。

## 再生成コマンド

```bash
cd ~/Projects/rodo/app/docs
node build-pdf.mjs
```

約3〜5秒で `shimoda-hearing-items.pdf` が更新される。

実行時にターミナルへ以下が出力されれば成功:

```
[1/5] pandoc で HTML フラグメントを生成...
[2/5] HTML を後処理（質問ブロック整形、メモ欄注入）...
[3/5] 表紙・目次を組み立て...
[4/5] 中間HTMLを書き出し...
[5/5] weasyprint で PDF 生成...
完成: .../shimoda-hearing-items.pdf
サイズ: ~410 KB
```

## 生成フロー概要

```
shimoda-hearing-items.md
         │
         │  pandoc --to html5
         ▼
  HTML フラグメント
         │
         │  build-pdf.mjs の後処理
         │  ・質問ブロックの3分割（質問/確認したいこと/回答で得たい情報）
         │  ・メモ欄（30mm 罫線）を各質問下に注入
         │  ・カテゴリー扉（h3 + 狙い）を専用ブロックに変換
         │  ・巻末（ヒアリング後のアクション〜想定リスク）を .appendix でラップ
         │  ・表紙ページと目次ページを前置
         ▼
  完成 HTML（中間ファイル /tmp/ 下に書き出し）
         │
         │  weasyprint + hearing-print.css
         ▼
  shimoda-hearing-items.pdf
```

## 仕様対応表

| 要件 | 実装箇所 |
|---|---|
| A4縦 / 余白17-18mm | `hearing-print.css` の `@page` |
| ページ番号（右下） | `@page { @bottom-right { content: counter(page) "/" counter(pages); } }` |
| ヘッダー（2ページ目以降） | `@page { @top-right }` + `@page :first { @top-right { content: ""; } }` |
| 目次（ページ番号付き） | `build-pdf.mjs` の `tocRows` + CSS `target-counter(attr(href), page)` |
| 時間推定 | `CATEGORIES` 配列の `minutes` を目次に表示 |
| 質問番号 20pt以上 | `.question-block h4 { font-size: 20pt }` |
| 質問本文 14pt | `.q-main { font-size: 14pt }` |
| 補足情報を薄背景で分離 | `.q-meta { background: #f5f5f5; border-left: 3pt solid }` |
| 質問がページ跨がない | `.question-block { page-break-inside: avoid }` |
| メモ欄（罫線 30mm） | `.memo-lines { height: 30mm; repeating-linear-gradient }` |
| カテゴリーで改ページ | `.category-cover { page-break-before: always }` |
| カテゴリー扉の「狙い」 | `.category-cover .aim` ブロック |
| 巻末に情報ページ（記入欄なし） | `.appendix` セクション（`build-pdf.mjs` の `wrapAppendix`） |

## よくある修正

### 1. 質問本文や「確認したいこと」を変更したい
`shimoda-hearing-items.md` を編集して `node build-pdf.mjs` を再実行。

### 2. 新しい質問を追加した
md に `#### X-N. タイトル` を追加し、`build-pdf.mjs` の `QUESTIONS` 配列にも同じ `code` と `title` を追加する（目次生成に必要）。
カテゴリー自体を追加した場合は `CATEGORIES` 配列にも行を足すこと。

### 3. メモ欄をもっと大きく/小さくしたい
`hearing-print.css` の `.memo-lines { height: 30mm }` を調整。
罫線間隔は `7.4mm / 7.5mm` のペア（罫線幅0.1mm + 余白7.4mm）で決まる。行数=height÷7.5mm。

### 4. 質問番号のフォント色を変えたい
`hearing-print.css` の `.question-block h4 { color: #2a4d8f }` を修正。

### 5. 表紙の肩書や日付を変えたい
`build-pdf.mjs` の `coverHtml` 定義内を直接編集。

### 6. weasyprint が見つからないと言われる
`brew install weasyprint` を再実行し、`which weasyprint` でパスを確認する。

## 確認観点（再生成後の手動チェック）

macOS Preview で PDF を開いて以下を確認する:

1. **表紙（1ページ目）**: タイトル・作成日・実施者・対象・所要時間が正しいか
2. **目次（2-4ページ）**: 全36問がページ番号付きで並んでいるか。時間推定が合っているか
3. **イントロ（5ページ前後）**: 「ヒアリングの目的」「想定所要時間」「進め方」が読めるか
4. **カテゴリー扉（6, 16, 22, 30, 35, 42ページあたり）**: 濃紺ベタに白抜きでカテゴリー名、下に「狙い」枠が表示されているか
5. **各質問ページ**: 質問番号（C-1 等）が大きく、質問本文が黄色枠、確認したいこと/回答で得たい情報が灰色枠、メモ欄が罫線付きで30mm確保されているか
6. **巻末（48-49ページ）**: ヒアリング後のアクションと想定リスクが灰色ヘッダで表示され、メモ欄が無いこと
7. **ヘッダ・フッタ**: 1ページ目はヘッダ無し、2ページ目以降は右上に「shimoda社長ヒアリングシート」、右下に「n/49」

## トラブルシュート

- **日本語が豆腐（□）になる**: weasyprint がフォントを見つけていない。`fc-list :lang=ja` でヒラギノが出るか確認し、必要なら `hearing-print.css` の font-family から日本語フォントの優先順位を変える
- **ページ番号が ? や 0 になる**: `target-counter` が効いていない。weasyprint のバージョンが古い可能性。`brew upgrade weasyprint`
- **1ページに1問しか入らない**: これは page-break-inside: avoid の帰着で期待動作。質問＋メモ欄の高さが半ページを超えるとこうなる。許容範囲（49ページ前後）
- **ファイルサイズが急増**: 画像を追加していないか確認。現状はテキストのみで410KB程度

## バージョン履歴

- 2026-04-20 初版作成（宮川 / Senrigan）
- 2026-04-21 目次にページ番号を追加（target-counter）、q-main を 14pt に調整
