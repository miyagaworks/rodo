# 作業確認書 PDF・QRコード共有機能 実装計画

作成日: 2026-04-26
対象プロジェクト: `/Users/miyagawakiyomi/Projects/rodo/app`
対象スタック: Next.js 16.2.3 / React 19.2.4 / Prisma 6.19.3 / Zod 4.3.6 / PWA

---

## 0. 目的と要件サマリ

ロードアシスタンスの出動完了後、お客様に作業確認書の控えをデジタルで渡す。隊員のスマホにQRコードを表示し、お客様が自分のスマホで読み取り → 閲覧 → PDF保存する流れ。

### 機能フロー

```
隊員: 作業完了後承認の署名完了
  → 保存成功
  → QRコードモーダル表示（shareToken ベースの公開URL）

お客様: スマホでQR読み取り
  → /c/[token] にアクセス（認証不要）
  → モバイル最適化UIで作業確認書を閲覧
  → 「PDFを保存」ボタンでダウンロード
```

### スコープ

- 作業完了後のお客様署名（`postApprovalSignature`）保存成功時にQRコード表示
- 公開ページ `/c/[token]` で作業確認書を閲覧可能
- PDF生成・ダウンロード機能
- QRコード表示

### スコープ外

- メール・SMS での共有リンク送信（将来拡張として検討可能）
- PDF の印刷最適化（A4レイアウト）
- QRコードの有効期限管理UI（管理者画面）
- 既存 ConfirmationClient.tsx のリファクタリング

---

## 1. 技術選定

### 1.1 PDF生成ライブラリ

| 選択肢 | 方式 | 長所 | 短所 |
|---|---|---|---|
| **A: @react-pdf/renderer** | サーバーサイド（Route Handler） | テキスト選択可能、ファイルサイズ小、レイアウト完全制御、モバイル表示安定 | 独自コンポーネント（View/Text）でレイアウト再実装が必要 |
| B: html2canvas + jsPDF | クライアントサイド | HTML/CSSをそのままPDF化、レイアウト共通化可能 | モバイルブラウザでの描画品質にばらつき、テキスト選択不可（画像化）、バンドルサイズ大（~500KB） |

**→ 選定: A（@react-pdf/renderer）**

理由:
1. スマホ縦長レイアウトの PDF を確実に制御できる（カスタムページサイズ指定可能）
2. 署名画像（base64 PNG）の埋め込みが `Image` コンポーネントで安定動作する
3. サーバーサイド生成のため、モバイルブラウザの差異に影響されない
4. テキスト選択可能な正規のPDFを出力できる
5. html2canvas はCSS Grid/Flexbox の再現精度が低く、モバイルUIの変換品質が不安定

トレードオフ: 公開閲覧ページ（HTML）とPDFテンプレートでレイアウトが二重管理になる。ただし、データ構造は同一なのでコンポーネント間でデータ取得ロジックは共通化できる。

### 1.2 QRコードライブラリ

| 選択肢 | 週間DL数 | サイズ | 特徴 |
|---|---|---|---|
| **qrcode.react** | ~2.5M | 軽量 | React コンポーネント、SVG/Canvas 出力、TypeScript対応 |
| react-qr-code | ~500K | 軽量 | SVG のみ |

**→ 選定: qrcode.react**

理由: デファクトスタンダード。SVG出力でCSPの `img-src` 制約に抵触しない（data: URI不要）。

### 1.3 新規ライブラリまとめ

```
npm install @react-pdf/renderer qrcode.react
npm install -D @types/qrcode.react  # 型定義（必要に応じて）
```

注: `@react-pdf/renderer` は Node.js 環境で動作するため、Route Handler（サーバーサイド）でのみ使用する。クライアントコンポーネントにインポートしない。

---

## 2. セキュリティ設計

### 2.1 共有トークン

| 項目 | 仕様 |
|---|---|
| 生成方式 | `createId()`（cuid2, 24文字, 暗号論的擬似乱数） |
| 衝突耐性 | cuid2 は 24 文字で ~10^36 の空間 → 実用上衝突なし |
| 推測耐性 | 連番・タイムスタンプベースではない。ブルートフォース非現実的 |
| DB制約 | `@unique` インデックスで一意性を保証 |

### 2.2 有効期限

**方針: Phase 1 では有効期限なし。`sharedAt` タイムスタンプのみ記録する。**

根拠:
- お客様が後日PDFを再ダウンロードするユースケースがある（保険請求、修理記録）
- トークンの推測困難性で十分なセキュリティを担保できる
- 有効期限管理UIは複雑度を増すだけで、Phase 1 では費用対効果が低い

将来の拡張ポイント: `sharedAt` が記録されていれば、後から「共有後90日で無効化」のようなポリシーを追加可能。

### 2.3 公開ページのアクセス制御

- `proxy.ts`（Next.js 16 の旧 middleware）で `/c/` パスを認証除外
- 公開ページは読み取り専用（GET のみ）
- レート制限: Vercel のデフォルト制限に委ねる（Phase 1）

### 2.4 情報漏洩リスク

公開ページに表示される情報:
- 作業日、車種名、登録番号、作業内容、会社名、担当者名、署名画像、バッテリー明細、注意事項

→ 個人を特定する強い情報（氏名・住所・電話番号）は含まない。車両登録番号が最もセンシティブだが、作業確認書の性質上、共有先のお客様自身の車両情報である。トークンの推測困難性と合わせてリスクは許容範囲。

---

## 3. Phase 分け

### Phase 1: Schema変更 + 共有トークン生成 API

**目的**: データ基盤の準備

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `prisma/schema.prisma` | 修正 | WorkConfirmation に `shareToken`, `sharedAt` フィールド追加 |
| `prisma/migrations/YYYYMMDD_add_share_token/` | 新規 | マイグレーションファイル |
| `lib/validations/schemas/confirmation.ts` | 修正 | shareToken の Zod スキーマ追加 |
| `app/api/dispatches/[id]/confirmation/route.ts` | 修正 | PATCH 時に shareToken 生成ロジック追加 |

**Schema 変更詳細**:

```prisma
model WorkConfirmation {
  // ... 既存フィールド ...
  shareToken  String?   @unique
  sharedAt    DateTime?
}
```

- `shareToken` は nullable。作業完了後署名が保存された PATCH リクエスト時に、未生成であれば `createId()` で生成。
- `sharedAt` は shareToken 生成時に `new Date()` をセット。
- 既存データには影響しない（nullable のため）。

**トークン生成タイミング**: `postApprovalSignature` が非null の PATCH リクエストで、かつ `shareToken` が未設定の場合に自動生成。レスポンスに `shareToken` を含めて返す。

**成果物**: マイグレーション適用済み、PATCH APIが shareToken を返す状態

---

### Phase 2: 公開 API（認証不要）

**目的**: 公開ページ用のデータ取得エンドポイント + PDF 生成エンドポイント

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `app/api/c/[token]/route.ts` | 新規 | 公開用 GET: shareToken でデータ取得 |
| `app/api/c/[token]/pdf/route.ts` | 新規 | 公開用 GET: PDF バイナリ生成・返却 |
| `lib/pdf/confirmation-template.tsx` | 新規 | @react-pdf/renderer の PDF テンプレート |
| `lib/pdf/styles.ts` | 新規 | PDF スタイル定義 |
| `proxy.ts` | 修正 | `/c/` と `/api/c/` を認証除外パスに追加 |

**API 設計**:

```
GET /api/c/[token]
→ 200: WorkConfirmation のJSON（署名はbase64のまま）
→ 404: トークン不正 or 存在しない

GET /api/c/[token]/pdf
→ 200: application/pdf バイナリ
  Content-Disposition: attachment; filename="work-confirmation-{date}.pdf"
→ 404: トークン不正 or 存在しない
```

**proxy.ts の変更**:

```typescript
// 既存の isPublicAsset 判定の後に追加
if (pathname.startsWith('/c/') || pathname.startsWith('/api/c/')) {
  return NextResponse.next()
}
```

**PDF テンプレート設計**:

- ページサイズ: 幅 375pt（iPhone SE 幅相当）× 高さ auto（内容に応じて伸長）
  → `@react-pdf/renderer` ではページ高さ auto 不可のため、十分な高さ（例: 900pt）を設定し、余白を許容
- フォント: LINE Seed JP（プロジェクト統一フォント）— `fonts/LINESeedJP_A_TTF_Rg.ttf` / `Bd.ttf` をローカル登録。CDN不要
- セクション構成: ConfirmationClient.tsx の表示セクションと同一順序
- 署名画像: `Image` コンポーネントで base64 PNG を直接埋め込み

**成果物**: `/api/c/[token]` でJSON取得、`/api/c/[token]/pdf` でPDFダウンロード可能

---

### Phase 3: 公開閲覧ページ（/c/[token]）

**目的**: お客様がQRコードからアクセスするモバイル最適化閲覧ページ

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `app/c/[token]/page.tsx` | 新規 | Server Component: トークン検証 + データ取得 |
| `app/c/[token]/layout.tsx` | 新規 | 公開ページ専用レイアウト（ヘッダー/認証なし） |
| `components/confirmation/ConfirmationView.tsx` | 新規 | 読み取り専用の確認書表示コンポーネント |
| `app/c/[token]/not-found.tsx` | 新規 | 無効なトークン用の404ページ |

**ページ設計**:

```
/c/[token]
├── ヘッダー: 「作業確認書」タイトル + ロゴ
├── 作業日
├── 作業前承認欄（チェック結果の表示のみ）
├── 車両情報
├── 作業内容
├── 入庫先担当者情報 + 署名画像
├── 作業完了後承認 + 署名画像
├── バッテリー作業明細（該当時のみ表示）
├── 注意事項・その他
├── 担当者氏名
└── フッター: 「PDFを保存」ボタン（固定フッター）
```

- Server Component でデータ取得（`prisma.workConfirmation.findUnique({ where: { shareToken } })`）
- 認証不要のため、`auth()` を呼ばない
- 署名画像は `<img src="data:image/png;base64,..." />` で表示（CSP の `img-src: data:` は対応済み）
- 「PDFを保存」ボタンは `/api/c/[token]/pdf` への `<a href download>` リンク

**レイアウト方針**:
- 既存の `app/layout.tsx`（認証チェック、サイドバー等を含む）は使わない
- 公開ページ専用の簡素なレイアウトを新設
- Tailwind CSS のみでスタイリング（既存UIライブラリ依存を最小化）

**ConfirmationView.tsx について**:
- ConfirmationClient.tsx（編集可能、署名パッド、保存機能）とは別に、読み取り専用の表示コンポーネントを新設
- ConfirmationClient.tsx は変更しない（既存機能への影響ゼロ）
- データ構造は同一のため、型定義は共通利用

**成果物**: QRコード読み取り → ブラウザで確認書閲覧 → PDF保存の一連のフロー完成

---

### Phase 4: QRコード表示（隊員側UI）

**目的**: 隊員のスマホにQRコードを表示する

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `app/components/dispatch/ConfirmationClient.tsx` | 修正 | QRコードモーダル表示の追加 |
| `app/components/dispatch/QrShareModal.tsx` | 新規 | QRコード表示モーダルコンポーネント |

**ConfirmationClient.tsx への変更（最小化方針）**:

変更箇所は2点のみ:
1. `handleSave` の成功コールバック内で、レスポンスに `shareToken` が含まれている場合にQRモーダルを開く state を追加
2. `QrShareModal` のレンダリング追加（コンポーネント末尾）

```
// 追加する state（概念）
const [qrToken, setQrToken] = useState<string | null>(null)

// handleSave 成功時（概念）
if (data.shareToken) setQrToken(data.shareToken)

// JSX末尾に追加（概念）
{qrToken && <QrShareModal token={qrToken} onClose={() => setQrToken(null)} />}
```

**QrShareModal.tsx 設計**:

```
モーダル
├── 「お客様にQRコードを提示してください」テキスト
├── QRCode（qrcode.react の SVG 出力）
│   URL: `${NEXT_PUBLIC_BASE_URL}/c/${token}`
├── URL テキスト表示（手動入力用フォールバック）
└── 「閉じる」ボタン
```

- QRコードサイズ: 256x256px（スマホカメラでの読み取りに十分）
- SVG出力: Canvas出力と比べてPWA環境での描画が安定
- 環境変数 `NEXT_PUBLIC_BASE_URL` から公開URLのドメインを取得

**表示タイミングの判定ロジック**:

```
QRモーダルを表示する条件:
  1. PATCH レスポンスに shareToken が含まれている
  2. かつ、そのリクエストで postApprovalSignature を送信した（＝作業完了後署名を保存した）

※ 毎回の保存で表示するのではなく、作業完了署名の保存時のみ
```

この判定により、車両情報だけを途中保存した場合にはQRが表示されない。

**成果物**: 作業完了署名の保存後にQRコードがモーダル表示される

---

### Phase 5: テスト

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `__tests__/api/confirmation-share.test.ts` | 新規 | shareToken 生成ロジックのテスト |
| `__tests__/api/public-confirmation.test.ts` | 新規 | 公開API（/api/c/[token]）のテスト |
| `__tests__/api/public-confirmation-pdf.test.ts` | 新規 | PDF生成APIのテスト |
| `__tests__/components/QrShareModal.test.tsx` | 新規 | QRモーダルの表示・非表示テスト |
| `__tests__/components/ConfirmationView.test.tsx` | 新規 | 公開閲覧ページの表示テスト |

**テスト観点**:

| カテゴリ | テストケース |
|---|---|
| トークン生成 | postApprovalSignature 保存時に shareToken が生成される |
| トークン生成 | 既に shareToken がある場合は再生成しない |
| トークン生成 | postApprovalSignature なしの PATCH では生成しない |
| 公開API | 有効なトークンで 200 + 正しいデータ |
| 公開API | 無効なトークンで 404 |
| 公開API | 認証ヘッダーなしでもアクセス可能 |
| PDF生成 | 有効なトークンで PDF バイナリが返る（Content-Type 検証） |
| PDF生成 | 署名画像が PDF に含まれる（バイナリ内の PNG マーカー検証） |
| QRモーダル | shareToken 受信時にモーダルが表示される |
| QRモーダル | 閉じるボタンでモーダルが非表示になる |
| QRモーダル | QRコードに正しいURLが含まれる |
| 閲覧ページ | 全セクションが正しく表示される |
| 閲覧ページ | 署名画像が表示される |
| 閲覧ページ | PDF保存リンクが正しいURLを指す |

**成果物**: 全テストが通過

---

## 4. ファイル変更サマリ

### 新規ファイル（10ファイル）

| パス | Phase | 責務 |
|---|---|---|
| `prisma/migrations/YYYYMMDD_add_share_token/` | 1 | マイグレーション |
| `app/api/c/[token]/route.ts` | 2 | 公開データ取得API |
| `app/api/c/[token]/pdf/route.ts` | 2 | PDF生成API |
| `lib/pdf/confirmation-template.tsx` | 2 | PDFテンプレート |
| `lib/pdf/styles.ts` | 2 | PDFスタイル |
| `app/c/[token]/page.tsx` | 3 | 公開閲覧ページ |
| `app/c/[token]/layout.tsx` | 3 | 公開ページレイアウト |
| `app/c/[token]/not-found.tsx` | 3 | 404ページ |
| `components/confirmation/ConfirmationView.tsx` | 3 | 読み取り専用確認書 |
| `components/dispatch/QrShareModal.tsx` | 4 | QRモーダル |

### 修正ファイル（4ファイル）

| パス | Phase | 変更内容 |
|---|---|---|
| `prisma/schema.prisma` | 1 | shareToken, sharedAt フィールド追加 |
| `lib/validations/schemas/confirmation.ts` | 1 | Zodスキーマ拡張 |
| `app/api/dispatches/[id]/confirmation/route.ts` | 1 | shareToken 生成ロジック |
| `proxy.ts` | 2 | `/c/` パスの認証除外 |
| `components/dispatch/ConfirmationClient.tsx` | 4 | QRモーダル state + レンダリング追加（約15行） |

### テストファイル（5ファイル）

Phase 5 参照。

---

## 5. オフライン対応（PWA環境）

### 隊員側（QR表示）

- `offlineFetch` 経由の PATCH が成功した場合にのみ QR を表示 → **オンライン必須**
- オフラインキューイングされた PATCH の場合、レスポンスを受け取れないため QR 表示不可
- **対応方針**: QR表示はオンライン時のみ。オフライン保存時は「オフラインで保存しました。オンライン復帰後にQRコードが利用可能になります」とトースト表示
- 将来拡張: オフラインキュー消化後に Push 通知で QR 表示を促す（Phase 1 スコープ外）

### お客様側（公開ページ閲覧）

- QRコードを読み取る時点でお客様はオンライン（スマホカメラ→ブラウザ）
- 公開ページは Network Only 戦略（sw.js の navigate ルール）→ 問題なし
- PDF ダウンロードも通常のHTTPリクエスト → 問題なし

**結論**: オフライン対応の追加実装は不要。オフライン時のQR非表示メッセージのみ対応。

---

## 6. 日本語フォントの対応

@react-pdf/renderer はデフォルトで日本語フォントを含まない。対応方針:

**方針: LINE Seed JP（.ttf）をローカル登録**

```typescript
import { Font } from '@react-pdf/renderer'
import path from 'path'

Font.register({
  family: 'LineSeedJP',
  fonts: [
    { src: path.join(process.cwd(), 'fonts/LINESeedJP_A_TTF_Rg.ttf'), fontWeight: 'normal' },
    { src: path.join(process.cwd(), 'fonts/LINESeedJP_A_TTF_Bd.ttf'), fontWeight: 'bold' },
  ],
})
```

**利点**:
- プロジェクト統一フォント（Web表示と同一書体）
- CDN依存なし → CSP変更不要、オフライン耐性あり
- .ttf ファイルは既に `fonts/` ディレクトリに配置済み（Rg: 3.7MB, Bd: 3.5MB）

---

## 7. リスク

| リスク | 影響度 | 発生確率 | 対策 |
|---|---|---|---|
| @react-pdf/renderer が Next.js 16 の Route Handler で動作しない | 高 | 低 | Phase 2 の初手で最小 PDF 生成の動作確認を行う。失敗時は html2canvas + jsPDF にフォールバック |
| 日本語フォントのレンダリング品質問題（文字化け、レイアウト崩れ） | 中 | 中 | Noto Sans JP は @react-pdf/renderer との実績が多い。Phase 2 で早期検証 |
| Google Fonts CDN の CSP ブロック | 中 | 中 | `next.config.ts` の CSP 更新漏れ。Phase 2 チェックリストに含める |
| QRコード読み取り失敗（画面輝度、カメラ性能） | 低 | 低 | URLテキスト表示をフォールバックとして提供 |
| shareToken の漏洩（URLの第三者転送） | 中 | 低 | 含まれる情報の機微性は限定的。Phase 1 では許容。必要に応じて後から無効化機能を追加 |
| Vercel Serverless の PDF 生成タイムアウト（10秒制限） | 中 | 低 | 署名画像のサイズを確認。base64 が巨大な場合はリサイズ処理を追加 |
| proxy.ts の next-auth ラッパー形式と認証除外の互換性 | 中 | 低 | `export default auth(...)` 内で `pathname.startsWith('/c/')` を先頭判定すれば `NextResponse.next()` で抜けられる。Next.js 16 の proxy 仕様を `node_modules/next/dist/docs/` で事前確認 |

**最大リスクの軽減策**: Phase 2 の最初に「最小PDF生成スパイク」を実施する。日本語テキスト + base64署名画像 1枚を含むPDFをRoute Handlerから返す最小コードを書き、Next.js 16 環境での動作を確認する。これが失敗した場合のフォールバック計画:

- **フォールバックA**: `jspdf` + 手動レイアウト（html2canvas なし。テキスト座標指定でPDF構築）
- **フォールバックB**: クライアントサイドで `@react-pdf/renderer` の `pdf()` 関数を使用（Blobをダウンロードするアプローチだがバンドルサイズ増加）

---

## 8. 実装順序の依存関係

```
Phase 1 (Schema + API修正)
  ↓
Phase 2 (公開API + PDF生成)  ← ここで @react-pdf/renderer の動作検証
  ↓
Phase 3 (公開閲覧ページ)
  ↓
Phase 4 (QRコード表示)  ← ConfirmationClient.tsx への変更はここだけ
  ↓
Phase 5 (テスト)
```

Phase 2 と Phase 3 は部分的に並列化可能（公開APIのモック → 閲覧ページUI先行実装）。ただし、PDF動作検証を Phase 2 で確実に行ってから Phase 3 に進むことを推奨。

---

## 9. 公開URL（QRコード埋め込み）

マルチテナント・サブドメイン構成（`{tenant}.rodo.run`）のため、環境変数ではなくリクエストの `Host` ヘッダーから動的に取得する。

```typescript
// QRコード用URL生成（ConfirmationClient.tsx 内）
const host = window.location.origin  // e.g. https://shimoda.rodo.run
const qrUrl = `${host}/c/${shareToken}`
```

環境変数 `NEXT_PUBLIC_BASE_URL` は不要。

---

## 10. 見積り（Phase別）

| Phase | 変更ファイル数 | 新規行数（概算） | 難易度 |
|---|---|---|---|
| 1: Schema + トークン生成 | 4 | ~60行 | 低 |
| 2: 公開API + PDF生成 | 5 | ~300行 | **高**（PDF テンプレート + フォント設定） |
| 3: 公開閲覧ページ | 4 | ~250行 | 中 |
| 4: QRコード表示 | 2 | ~80行 | 低 |
| 5: テスト | 5 | ~400行 | 中 |
| **合計** | **20** | **~1,090行** | - |

Phase 2 が最もリスクが高く実装量も多い。ここをクリアすれば残りは定型的な実装。
