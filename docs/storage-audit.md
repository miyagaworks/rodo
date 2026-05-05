# rodo ストレージ調査レポート

調査対象: `~/Projects/rodo/app/`（`node_modules` / `.next` / `.git` を除外）
調査日: 2026-04-20
調査方法: Grep + ファイル精読（修正なし・観察のみ）
前提参照: `docs/hardcode-audit.md` を事前に通読済み。`AGENTS.md` に従い Next.js 16 独自構造を考慮（`middleware.ts` → `proxy.ts` 等）。

---

## サマリー

- 現状のストレージ方式: **混在**
  - 出動写真 → **Vercel Blob**（実装済み・`access: 'public'`）
  - 署名画像（3種）→ **PostgreSQL に Base64 DataURL を TEXT 列で直接格納**
  - アシスタンスロゴ → **`public/logos/*.svg` に静的同梱**（アップロード UI 不在、DB の `logoUrl` はシード時の固定パス）
  - ユーザーアバター → **Google OAuth の外部 URL を DB に保存**（アップロード機能なし）
  - ユーザー自身が撮影してアップロードするのは「出動写真」のみ
- 本番運用への移行要否: **部分的に必要**（致命的ブロッカー 1 件、重大ブロッカー 3 件）
- 推定移行工数: **3〜5 人日**（本番移行前に必須の対応のみ。将来対応分は別途）
- 緊急度: **高**
  - `BLOB_READ_WRITE_TOKEN` が `.env.example` から欠落（本番デプロイで写真アップロードが 500 エラーになる）
  - `next.config.ts` の CSP `img-src` に Vercel Blob ドメインが未列挙（デプロイ後に写真が表示されない可能性）
  - 署名 3 フィールドが Base64 で DB 格納（Neon 容量圧迫・クエリ遅延の主要因候補）
  - Blob が `access: 'public'` で保存され URL 漏洩時にテナント越境閲覧が可能

---

## 1. フィールド別の現状

| フィールド | 用途 | 保存形式 | 保存先 | 本番で問題があるか |
|---|---|---|---|---|
| `DispatchPhoto.photoUrl` | 出動写真（現場撮影） | HTTPS URL 文字列 | **Vercel Blob**（`access: 'public'`、パス `dispatches/{dispatchId}/{timestamp}-{safeName}`） | **有**: (1) テナント分離なし (2) CSP 未許可 (3) 枚数上限なし (4) Cascade 削除時のゴミファイル (5) `BLOB_READ_WRITE_TOKEN` を `.env.example` に未記載 |
| `User.image` | ユーザーアバター | 外部 URL 文字列（Google のプロフィール画像 URL） | **外部サイト（Google）にホスト、rodo 側は URL のみ保存** | **有（軽微）**: `next.config.ts` `images.domains: []` と CSP `img-src 'self' data: blob:` により、次 `next/image` を使うか `<img>` を使うかに関わらず Google ドメインがブロックされる。現状 `user.image` を UI で参照している箇所は `HomeClient.tsx` を含め見つからず、DB 書き込みのみ（`auth.ts:86`）→ 実害は表示時のみ。表示を足す時に対処必要 |
| `Assistance.logoUrl` | アシスタンス会社ロゴ | 相対パス文字列（例 `'/logos/assistance-pa.svg'`） | **`public/logos/*` にアプリバンドル同梱**（6 ファイル固定） | **有（仕様未整備）**: アップロード API/UI が皆無。`components/settings/AssistanceTab.tsx` に logoUrl 編集フィールドなし。`createAssistanceSchema` / `updateAssistanceSchema` も `logoUrl` を受けない。`HomeClient.tsx:16-28` の `DISPLAY_CONFIG` が `displayAbbreviation` 6 キーに紐づく静的ロゴで上書き。新テナントがロゴを登録できない |
| `WorkConfirmation.customerSignature` | 顧客サイン（作業前） | **`data:image/png;base64,...` の DataURL 文字列** | **PostgreSQL `String?` 列に直接**（`prisma/schema.prisma:321`） | **有**: Base64 文字列 PNG を DB TEXT に保存。Canvas は `devicePixelRatio * 2` で拡大（推定 ~600×320px）→ 1 フィールド当たり推定 5〜30KB。1 Dispatch × 3 署名 × 全件で Neon storage 費用・バックアップ容量に直接影響 |
| `WorkConfirmation.shopSignature` | ショップ（入庫先担当者）サイン | 同上 DataURL | PostgreSQL（`schema.prisma:332`） | 同上 |
| `WorkConfirmation.postApprovalSignature` | 作業後承認サイン | 同上 DataURL | PostgreSQL（`schema.prisma:335`） | 同上 |
| `WorkConfirmation.preApprovalChecks` / `postApprovalCheck` | 承認チェックボックス状態 | `Json?` / `Boolean` | PostgreSQL | 無（構造化データ） |
| `WorkConfirmation.batteryDetails` | バッテリー作業明細 | `Json?` | PostgreSQL | 無 |
| その他 `String` 系大容量候補 | — | — | — | なし（`memo`, `notes`, `situationDetail` 等は短文想定） |

補足: 画像・ファイル系の String 列を Grep で網羅的に探索 (`photoUrl` `logoUrl` `signature` `image` `avatar` `file` `upload` `blob` `s3` `storage`) した結果、上記以外にバイナリデータを格納するフィールドは検出されず。`Dispatch` / `Report` / `BreakRecord` にバイナリ系フィールドなし。

---

## 2. アップロード実装の詳細

### 2.1 サーバー側 API

- **`POST /api/dispatches/[id]/photos`** (`app/api/dispatches/[id]/photos/route.ts:64-149`)
  - `@vercel/blob` の `put()` を使用（`route.ts:2`, `127-129`）
  - 保存パス: `` `dispatches/${id}/${Date.now()}-${safeName}` ``
  - `access: 'public'` で保存 → 誰でも URL を知っていれば取得可能
  - `multer` / `formidable` / `busboy` など Node 系ミドルウェアは**使っていない**。Web 標準の `req.formData()` を使用
  - バリデーション:
    - Content-Type ホワイトリスト: `image/jpeg|png|webp|heic|heif`（`lib/validations/schemas/photo.ts:4-10`）
    - マジックバイト実体検証（JPEG/PNG/WebP/HEIC/HEIF ftyp チェック、`route.ts:50-55`）
    - ファイルサイズ上限: **20MB**（`MAX_PHOTO_SIZE = 20 * 1024 * 1024`、`photo.ts:13`）
    - ファイル名サニタイズ（パストラバーサル防止、`route.ts:58-62`）
    - テナント所属確認（`tenantId` で `findFirst`）
    - 転送済み Dispatch は拒否（`status === 'TRANSFERRED'`）
  - DB 側は `blob.url`（Vercel Blob が返す公開 URL）を `DispatchPhoto.photoUrl` に保存
- **`DELETE /api/dispatches/[id]/photos/[photoId]`** (`.../photos/[photoId]/route.ts`)
  - `del(photo.photoUrl)` で Blob 側削除
  - Blob 削除失敗時はログのみ出して DB レコードは削除（`route.ts:31-37`）→ 逆方向のゴミ発生可
- **`POST /api/dispatches/[id]/confirmation`** (`confirmation/route.ts`)
  - JSON body で受ける（`multipart/form-data` ではない）
  - `upsertConfirmationSchema` で zod バリデーション（`confirmation.ts:1-21`）
  - **Base64 の長さ制限・DataURL パターン検証なし** → 任意長の文字列を受け入れる

### 2.2 フロントエンド実装

- **カメラ起動**: `components/dispatch/DispatchClient.tsx:1143-1150`
  ```tsx
  <input type="file" accept="image/*" capture="environment" ... hidden />
  ```
  → モバイル Safari / Chrome でバックカメラを起動
- **圧縮**: `hooks/usePhotoCapture.ts:66` → `lib/image-compress.ts:9-18`
  - `browser-image-compression` ライブラリ（package.json:23）
  - 長辺 1200px 以下、JPEG 品質 80%、WebWorker 使用、EXIF 破棄（回転は自動適用）
  - 出力は必ず `image/jpeg`
- **アップロード**: `hooks/usePhotoCapture.ts:68-102`
  - オンライン時: `FormData` に詰めて `POST /api/dispatches/{id}/photos`
  - 失敗時または最初からオフライン: **IndexedDB（`rodo-offline` → `photos` ストア）に Blob で保存**（`lib/offline-db.ts:131-135`）
  - オンライン復帰時に `lib/sync.ts:84-111` の `syncOfflinePhotos` が IndexedDB から読み出して順次アップロード
- **署名キャプチャ**: `components/dispatch/ConfirmationClient.tsx:86-253`
  - `react-signature-canvas` ^1.1.0-alpha.2（package.json:34）
  - Retina 対応（`devicePixelRatio * 2` でキャンバス拡大、`ConfirmationClient.tsx:96-123`）
  - `handleEnd` で `sigRef.current.toDataURL('image/png')` → state に保持（`:171-178`）
  - 保存時: `handleSave` で JSON body に `customerSignature`/`shopSignature`/`postApprovalSignature` として含めて POST/PATCH（`:360-389`）
  - **圧縮・SVG 化・Blob アップロードは一切行わない**。DataURL のまま DB 直送

### 2.3 画像最適化・配信

- **`next/image` は使用していない**。Grep 結果は `_next/image` 除外設定のみ（`proxy.ts:48`）
- 全て素の `<img src="...">`（例: `components/HomeClient.tsx:97`, `components/AssistanceButton.tsx:34`, `components/dispatch/PhotoThumbnails.tsx:52`）
- **`sharp` の直接依存なし**（`package.json` に記載なし。`package-lock.json` 内の `@img/sharp-*` は `next` の推移的依存で、`next/image` 未使用のため実行時に呼ばれない）
- **CDN 明示設定なし**。Vercel にデプロイする場合 Vercel Edge Network 経由になるのが暗黙の前提

---

## 3. ストレージの実体（特定結果）

| 判定 | 根拠 |
|---|---|
| **Vercel Blob**（出動写真のみ） | `package.json:21` `"@vercel/blob": "^2.3.3"`、`app/api/dispatches/[id]/photos/route.ts:2,127` `put()`、`.../[photoId]/route.ts:2,33` `del()` |
| **ローカル DB（PostgreSQL）への Base64 格納** | 署名 3 フィールド: `schema.prisma:321,332,335` が `String?`、`ConfirmationClient.tsx:173` `toDataURL('image/png')` の戻り値を `confirmation/route.ts:13,21,23` で `data.customerSignature = body.customerSignature` 等としてそのまま Prisma に渡している |
| **アプリバンドル同梱（`public/logos/`）** | `prisma/seed.ts:79,86,93,100,107,114` で `'/logos/assistance-pa.svg'` 等を `Assistance.logoUrl` に投入。`public/logos/` ディレクトリに 6 ファイル実在 |
| **外部 URL 参照（Google）** | `auth.ts:86` の `data: { image: user.image }` で、NextAuth の Google プロバイダが返す `https://lh3.googleusercontent.com/...` 形式の URL を DB に保存 |
| **AWS S3** | **なし**。`grep -r 's3\|aws-sdk' -- app/**` で 0 件（`package-lock.json` の `s390x` 誤マッチは別物） |
| **Supabase Storage** | **なし**。依存パッケージなし |
| **Cloudinary** | **なし**。依存パッケージなし |
| **ローカルファイルシステム書込み** | **なし**。`fs.writeFile` は `docs/build-pdf.mjs`（ドキュメント生成スクリプト）の 1 箇所のみで、アプリコードには皆無 |

---

## 4. 各観点の調査結果

### 4.1 署名画像の扱い

- **ライブラリ**: `react-signature-canvas` ^1.1.0-alpha.2（package.json:34）
- **保存形式**: `data:image/png;base64,...` DataURL（約 600×320px の Retina キャンバスから PNG エンコード）
- **保存先**: PostgreSQL の `WorkConfirmation.customerSignature` / `shopSignature` / `postApprovalSignature`（全て `String?`）
- **3 フィールドでの扱いは統一されている**。`SignaturePad` コンポーネント（`ConfirmationClient.tsx:73-253`）を 3 箇所で再利用（`variant` が `'customer'` / `'shop'` で色違いのみ）
- **圧縮・バリデーションなし**: サーバー側 (`lib/validations/schemas/confirmation.ts:7,15,17`) は `nullableString` で、長さ上限や DataURL プレフィックスのパターン一致チェックなし → 悪意のあるクライアントが任意長の文字列を送信可能
- **推定サイズ**: PNG 600×320 透明背景で 5〜30KB。署名 3 つで 15〜90KB / Dispatch。1 テナントあたり年間 10,000 出動とすると 150MB〜900MB/年。JSON API でも常に同時転送されるため、Dispatch 詳細 API のレスポンス肥大化にも寄与

### 4.2 公開/非公開の設計

- **出動写真**: `access: 'public'`（`photos/route.ts:128`）で保存 → URL を知っている人は誰でも GET 可能
  - URL は推測しにくい（Vercel Blob がランダムなサフィックスを付与）が、認証なしで配信される
  - **テナント境界なし**: テナント A の URL をテナント B のユーザーが入手すれば取得可能
  - 署名付き URL（`access: 'private'` + `getDownloadUrl`）は **未使用**
- **`public/` ディレクトリ全般**: Next.js の既定動作で無認証配信。`public/logos/*.svg` / `rodo-*.svg` / `icons/*` / `icon-192.png` / `icon-512.png` / `favicon.ico` / `manifest.json` / `sw.js` は全テナントから見える
- **CSP `img-src`**: `next.config.ts:24` で `"img-src 'self' data: blob:"`。**Vercel Blob の公開ドメイン（`*.public.blob.vercel-storage.com`）が許可されていない** → 本番デプロイで写真サムネイルが表示されないリスク（`PhotoThumbnails.tsx:52` 等の `<img src="{blob_url}">` が CSP 違反でブロックされる）
- **Google アバター**: `user.image` を表示する UI は未実装だが、実装時に CSP `img-src` へ `https://lh3.googleusercontent.com` 追加が必要

### 4.3 サイズ・数量制限

- **1 枚あたりのサイズ上限**: サーバー 20MB（`MAX_PHOTO_SIZE = 20 * 1024 * 1024`）。クライアント圧縮後は実質 200〜800KB 程度に収まる想定
- **1 Dispatch あたりの写真枚数上限**: **見つからず**（`MAX_PHOTOS` / `photoLimit` / count バリデーションを Grep → 検出 0 件）。UI 側も上限なし（`DispatchClient.tsx:1121-1141` の写真ボタンで何枚でも押せる）
- **合計サイズ・テナント当たりの上限**: **未定義**
- **画像圧縮**: クライアント側で長辺 1200px / JPEG 品質 80%（`lib/image-compress.ts:10-16`）。サーバー側での再圧縮・サムネイル生成は **なし**
- **EXIF**: `preserveExif: false`（位置情報漏洩リスクは回避済み）

### 4.4 削除・更新ロジック

- **`DispatchPhoto.dispatch` リレーションは `onDelete: Cascade`**（`schema.prisma:260`）→ Dispatch 削除で DispatchPhoto レコードは消える
- **Vercel Blob 側の対応 Blob は消えない**（Cascade は DB トリガーであり Blob 削除は呼ばれない）→ **孤児ファイルが確実に発生する**
- ただし **Dispatch DELETE エンドポイントは未実装**（`grep prisma.dispatch.delete` → `app/api/assistances/[id]/route.ts:60` の `prisma.assistance.delete` ヒットのみ、`dispatch.delete` はどこにもない）→ 現時点では実害なし。ただし将来削除を実装すると即座に問題化
- **アシスタンス削除**: `prisma.assistance.delete` → `Dispatch.assistanceId` が `onDelete` 未指定（RESTRICT デフォルト）なので、紐づく Dispatch があれば FK エラーで削除失敗。ロゴファイルは `public/logos/` 配下のため DB 操作と無関係に残る（設計上問題なし）
- **ユーザー削除**: `app/api/users/[id]/route.ts:68` で `prisma.user.delete`。`User.image` の外部 URL は残るが、Google 側にホストされているので実害なし
- **写真個別削除**: `photos/[photoId]/route.ts:31-44` で先に Blob 削除 → 失敗してもログのみ → DB 削除。**逆順（DB 消し Blob 残し）ではないが、Blob 削除成功後の例外で DB 削除失敗すると今度は URL が残る**（孤児 URL → 404）
- **サイン画像の更新**: 上書きしか存在しない（`schema.prisma:320` の `workConfirmation.upsert` で既存の Base64 文字列を丸ごと置換）。履歴保持なし

### 4.5 環境変数

| 変数 | `.env` | `.env.local` | `.env.example` | 備考 |
|---|---|---|---|---|
| `DATABASE_URL` | あり | あり | あり | PostgreSQL 接続文字列 |
| `NEXTAUTH_SECRET` | あり | あり | あり | |
| `NEXTAUTH_URL` | あり | あり | あり | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | あり | あり | あり | |
| `NEXT_PUBLIC_BIZDELI_API_KEY` | あり | **なし** | あり | `.env.local` では未上書き |
| **`BLOB_READ_WRITE_TOKEN`** | **なし** | **なし** | **なし** | **`@vercel/blob` は本番で必須。Vercel 環境では自動注入されるため開発時だけ問題。ただし `.env.example` に無いのは明確なドキュメント欠落** |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | なし | なし | なし | — |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | なし | なし | なし | — |
| `CLOUDINARY_URL` | なし | なし | なし | — |
| `SEED_ADMIN_PASSWORD` / `SEED_MEMBER_PASSWORD` | (未確認、本調査対象外) | | | `seed.ts` で参照（`hardcode-audit.md` 参照） |

`@vercel/blob` の `put()` はデフォルトで `process.env.BLOB_READ_WRITE_TOKEN` を参照する。Vercel にデプロイしてストアを接続すると Vercel が自動で環境変数を注入するが、ローカル開発・CI・Neon 以外のホスティングでは明示設定が必要。`.env.example` に追記しないと新規開発者・別環境デプロイで確実に詰まる。

### 4.6 配信経路

- **`next/image` 未使用** → 自動 WebP 変換・レスポンシブ画像・遅延読み込みの恩恵なし
- **`next.config.ts` の `images.domains: []`** → 空。`next/image` を後から入れても外部ホストを弾く
- **CSP 設定**（`next.config.ts:18-27`）:
  - `img-src 'self' data: blob:` → Vercel Blob の `*.public.blob.vercel-storage.com` は許可されていない
  - `connect-src 'self' https://static.bizdeli.net https://app.bizdeli.net` → 写真取得の fetch は同一オリジンのみ想定
- **PWA サービスワーカー**: `public/sw.js` はプリキャッシュのみで、Blob URL のキャッシュ戦略はなし → オフライン時に既に表示済みの写真も次回は取れない可能性
- **結論**: 現状の CSP では Vercel Blob からの画像表示がブロックされる。本番デプロイ前に CSP 修正が必須

### 4.7 その他大容量データ

- **PDF 生成・保存**: アプリ本体には**なし**。`docs/build-pdf.mjs` はドキュメントビルド用スクリプトでランタイムとは無関係（`jspdf` / `puppeteer` / `@react-pdf` / `pdfkit` の依存なし）
- **Excel / CSV 入出力**: **なし**（`xlsx` / `exceljs` / `papaparse` 依存なし）。`AGENTS.md` とは別に `docs/Excel` ディレクトリ（ヒアリング用素材置き場と推定）は存在するが、アプリが読み込む経路なし
- **大容量 JSON**: `WorkConfirmation.preApprovalChecks` / `batteryDetails` は Json 型だが小規模（チェックボックス配列、数十バイト）
- **帳票エクスポート機能**: **未実装**。将来「作業確認書 PDF 出力」「月次出動レポート Excel 出力」等を追加する計画があるなら、その時点でサーバー側 Storage の本格設計が必要になる

---

## 5. 本番運用に向けた推奨アクション

### 必須対応（本番移行前に必要）

| # | 対応 | 対象フィールド/ファイル | 対応内容 | 目安 |
|---|---|---|---|---|
| 1 | **`.env.example` に `BLOB_READ_WRITE_TOKEN` 追記** | `.env.example` | コメント付きで雛形追加。併せて README に「Vercel Blob ストアを Vercel Dashboard で作成し接続」の手順記載 | 30 分 |
| 2 | **CSP `img-src` に Vercel Blob ドメイン追加** | `next.config.ts:24` | `img-src 'self' data: blob: https://*.public.blob.vercel-storage.com;` に修正（独自ドメイン CDN 経由にする場合はそのホストも） | 30 分 + 動作確認 |
| 3 | **署名 3 フィールドの Blob 化 または 最低限 SVG/PNG 圧縮 + サイズ上限検証** | `WorkConfirmation.customerSignature` / `shopSignature` / `postApprovalSignature` | 推奨案 A: SignatureCanvas → `toSVG()` 相当で SVG 化して DB 格納（SVG なら 1〜5KB）<br>推奨案 B: `POST /api/dispatches/[id]/signature` を新設し Vercel Blob へ PNG アップロード、DB は URL 文字列（`DispatchPhoto` と同じ構造）<br>最低限: zod で `z.string().max(50_000).regex(/^data:image\/png;base64,/)` を付与して DoS 防止 | 案 B: 1 日 / 最低限: 2 時間 |
| 4 | **Vercel Blob を `access: 'public'` → 署名付き URL 配信に変更**（テナント越境漏洩防止） | `app/api/dispatches/[id]/photos/route.ts:127` / `photoUrl` カラムの意味変更 | `put(..., { access: 'private' })` に変更し、取得時は `GET /api/dispatches/[id]/photos/[photoId]/url` で都度セッション認証＋`getSignedDownloadUrl`（有効期限付き）を返す。DB には blob の pathname を保存 | 1 日 |
| 5 | **写真枚数上限の実装** | `photos/route.ts` のアップロード前に `prisma.dispatchPhoto.count({ where: { dispatchId } })` → 例えば 30 枚でブロック | 1 Dispatch あたりの費用上限を決める | 1 時間 |
| 6 | **Dispatch 削除を実装するなら、Blob も必ず削除** | 未実装の `DELETE /api/dispatches/[id]` を今後作る場合 | Prisma の Cascade に任せず、先に `prisma.dispatchPhoto.findMany` → `del()` を個別発行してから DB 削除 | Dispatch 削除 API を作る時点で 2 時間 |

### 推奨対応（本番運用開始後でも良いが、早めが望ましい）

| # | 対応 | 理由 | 目安 |
|---|---|---|---|
| 7 | **`Assistance.logoUrl` のアップロード UI + API** | 2 社目以降のテナントが独自ロゴを登録できない。`hardcode-audit.md` の DISPLAY_CONFIG 撤廃とセットで実施 | 1 日 |
| 8 | **署名付き URL 化に併せた OG 画像等の扱い整理** | 現状 OG/SEO 用の画像生成ルート（例 `opengraph-image.tsx`）は未実装。BtoB のため優先度は低い | 対応時に検討 |
| 9 | **IndexedDB オフライン写真の容量管理** | `lib/offline-db.ts` でオフライン写真数の上限が無い。長期オフライン + 枚数増で iOS Safari の IndexedDB クォータ（～1GB）に到達 | 1 時間（100 枚上限等） |
| 10 | **CSP に `https://lh3.googleusercontent.com` 追加** | 将来 `User.image`（Google アバター）を UI に表示する時 | 表示機能を入れる時に 30 分 |
| 11 | **孤児 Blob のクリーンアップバッチ** | 写真削除時の DB-Blob 不整合、将来の Dispatch 削除時の取りこぼし。Vercel Blob `list()` と DB の差分を週次で照合する Cron | 0.5 日 |

### 将来検討（2 社目以降で必要になる可能性）

| # | 対応 | 契機 |
|---|---|---|
| 12 | **帳票 PDF 生成**（作業確認書・月次レポート） | 紙運用からの完全移行要望が出たとき。候補は `@react-pdf/renderer`（軽量）、`puppeteer-core` + `@sparticuz/chromium`（Vercel 対応だが Function サイズ大）、外部 SaaS（DocRaptor 等） |
| 13 | **Excel エクスポート** | 経理連携要望が出たとき。`exceljs` がサーバー側生成の定番 |
| 14 | **大量履歴データの S3 移行 + Glacier アーカイブ** | 3 年以上の履歴を抱える時点で Neon 容量コストが Blob より割高になる。Blob は長期置き場に向くが、画像以外の帳票も含めるなら S3 + Athena が伸縮しやすい |
| 15 | **テナント別ストレージクォータ** | 1 テナント当たりの月間容量上限を課金プランで分けるとき |
| 16 | **マルチリージョン配信 / 日本向け CDN** | 現状 Vercel Blob は us-east-1 単一リージョン（2026 年時点の一般認識）。日本のモバイル回線から写真 DL が遅い場合は Cloudflare R2 + Images や CloudFront 前段の検討 |

---

## 6. ストレージサービス選定の比較表

rodo の現状要件（1 テナント年間 ~1 万件 Dispatch / 写真 ~3 万枚 / 合計 ~15GB、モバイル主体、Vercel デプロイ前提）に対する比較:

| サービス | 月額目安（2026 年頃） | Vercel との統合性 | マルチテナント向き | 画像最適化 | 推奨度 |
|---|---|---|---|---|---|
| **Vercel Blob** | Pro プラン含む枠内で数 GB。超過は従量（$0.15/GB 保存、$0.30/GB 下り相当の水準） | ◎（`@vercel/blob` 導入済み・環境変数自動注入） | ○（パスにテナント ID を含める運用で論理分離可。物理分離は不可） | △（変換 API は無し。`next/image` と組み合わせて最適化する前提） | **A**（現状の最有力。既に採用済み。当面の課題はアクセス制御と CSP のみ） |
| **Supabase Storage** | Pro $25/月 + $0.021/GB 保存 + $0.09/GB 下り | △（Supabase Auth を使わないと機能半減。rodo は NextAuth） | ○（Policy でテナント分離可能） | △（変換 API あり。ただし別料金） | **C**（Auth が Supabase でない rodo では利点が薄い） |
| **AWS S3** | 保存 $0.023/GB + 下り $0.09/GB + リクエスト課金。CloudFront 経由で $0.085/GB | △（SDK 込みで自前実装が必要。Cold Start 増） | ◎（Prefix / Bucket 単位の IAM で完全分離可） | ×（別途 Lambda@Edge / Sharp レイヤーが必要） | **B**（10 テナント超・法人契約で IAM 分離が必須になったら最有力。それまでは過剰） |
| **Cloudinary** | Plus $89/月 〜（画像変換込み、ストレージ + 帯域込み） | △（URL 生成のみ同梱） | ○（Folder でテナント分離） | ◎（自動 WebP/AVIF 変換、fit/crop/blur 等 URL パラメータ） | **C**（画像変換メリットが強いが、rodo は事前圧縮済み + 現場撮影が中心で変換ニーズ小。月額が重い） |

※ 推奨度 A = 現状要件に最適 / B = 条件付きで最適 / C = 現状要件には過剰または不適合。価格は 2026 年時点の一般的な公表価格帯。

**選定の結論**: rodo の現状要件には **Vercel Blob 継続** が最適。移行コストが無く、Vercel デプロイとの統合がシームレス。ただし「`access: 'public'` のまま」は本番運用で許容不可のため、**署名付き URL 配信への切替（上記 #4）は必須**。将来 10 テナント以上・法人契約で「物理分離された S3 バケット」を顧客から求められた場合のみ、S3 への段階移行を検討。

---

## 7. 所見と懸念

### 現状実装で最も懸念される問題（優先度順）

1. **CSP `img-src` の不備（必須 #2）** — Vercel Blob ドメインが明示許可されていない。ローカル `next dev` では CSP が緩く動いてしまう可能性があり、本番ビルドして初めて発覚するタイプの事故。デプロイ直後にアプリが壊れる
2. **`BLOB_READ_WRITE_TOKEN` の `.env.example` 欠落（必須 #1）** — 本番環境で Vercel Dashboard から Blob ストア接続を忘れると、POST /api/dispatches/[id]/photos が 500 を返す。開発者が何も知らずにデプロイすると事故る
3. **署名の Base64 直格納（必須 #3）** — 1 テナント年間 10,000 出動想定だと署名だけで数百 MB / 年になる。Neon は PostgreSQL なのでフルスキャンや dump/restore でずっと引きずる。20 社入ったら目に見えて遅くなる
4. **`access: 'public'` による越境閲覧（必須 #4）** — Blob URL が DB にプレーン保存されており、`DispatchPhoto` を別テナントが取得できる穴（例: API の tenantId フィルタバグ 1 個で露呈）と組み合わさると直接的な情報漏洩。URL だけが流出しても別テナントの写真が見えるので、システム内部の一次防衛線が弱い
5. **写真枚数上限なし（必須 #5）** — 悪意なくとも「現場で何十枚も撮影」されるとテナント単位の Blob 容量が青天井。コスト暴走リスク

### 移行時に発生しそうな技術的困難

- **署名を Blob 化する場合のオフライン対応**: 現状の `offlineFetch` は JSON body の API を IndexedDB に詰め直す前提。署名が Blob にアップロードされる API に変わると、オフライン時の動線（ConfirmationClient → IndexedDB → sync）を別経路にする必要がある。`lib/offline-db.ts` の `photos` ストアにサイン用の型を追加するか、専用ストアを追加するか設計判断が必要
- **既存データの移行**: 本番リリース前ならテナント 1 社（shimoda）のみなので実害なし。既にデータが入っている環境から署名を Blob 化する場合は、DB の DataURL を読み出し → PNG デコード → Blob アップロード → 列置換、の ETL を書く必要がある（1 日）
- **署名付き URL 化後のキャッシュ**: 有効期限付き URL になると PWA のオフラインキャッシュ戦略（`sw.js`）を再検討する必要。現状は `<img src>` を都度取得で済んでいる
- **`next/image` 導入の是非**: 画像最適化の恩恵（WebP 変換・遅延読み込み）は欲しいが、`<img>` で作られたサムネイル・モーダル UI を置換するコストは無視できない。移行は段階的に

### 2 社目以降のテナント追加時に発生する問題

- **アシスタンスロゴの登録動線が無い**（必須ではないが #7）。新テナントは `public/logos/*` を使えず、DB の `logoUrl` にも書き込めない → ロゴなし運用を強いられる。`DISPLAY_CONFIG`（`hardcode-audit.md` 記載）の撤廃と同時に実装するのが素直
- **Blob のパス設計にテナント ID を入れていない**（現状 `dispatches/{dispatchId}/...`）。cuid の衝突可能性はほぼ無いが、**Vercel Blob ストアを丸ごとダンプして別テナント用に分離する運用**は現状のパス構造だと難しい。`{tenantId}/dispatches/{dispatchId}/...` に変更するなら早い段階で実施（データが少ないうち）
- **容量クォータ課金**: テナント別にストレージ上限を設ける要件が出た場合、現状のスキーマだと集計が厳しい。`DispatchPhoto` に `fileSize` / `contentType` 列を足して Blob 保存時に書き込むと、後々の集計で助かる（今なら軽い追加）

---

## 付録: 確認した調査観点チェックリスト

- [x] 観点 1（Prisma スキーマ上の画像・ファイル系フィールド）
- [x] 観点 2（画像アップロード処理の実装）
- [x] 観点 3（ストレージの実体）
- [x] 観点 4（署名画像の扱い）
- [x] 観点 5（公開/非公開の設計）
- [x] 観点 6（ファイルサイズ・数量の想定）
- [x] 観点 7（画像の削除・更新ロジック）
- [x] 観点 8（環境変数）
- [x] 観点 9（画像配信経路）
- [x] 観点 10（その他の大容量データ）

## 付録: 「存在しない」判定の根拠

以下は Grep で複数パターンを当てた上で 0 件と確認:

- **S3**: `grep -r 's3\|aws-sdk\|@aws-sdk'` → `package-lock.json` の `s390x`（CPU アーキ）誤マッチのみ、本体コードヒット 0
- **Supabase**: `grep -r 'supabase'` → 0 件
- **Cloudinary**: `grep -r 'cloudinary'` → 0 件
- **multer/formidable/busboy**: `grep -r 'multer\|formidable\|busboy'` → 0 件
- **fs.writeFile**（ローカルファイル書込み）: アプリコードで 0 件（`docs/build-pdf.mjs` のドキュメント生成のみヒット）
- **PDF 生成**: `grep 'jspdf\|puppeteer\|@react-pdf\|pdfkit'` を `package.json` に当てて 0 件
- **Excel/CSV**: `grep 'xlsx\|exceljs\|papaparse'` を `package.json` に当てて 0 件
- **写真枚数上限**: `grep 'MAX_PHOTOS\|photoLimit'` → 0 件
- **Dispatch DELETE API**: `grep 'prisma\.dispatch\.delete'` → 0 件（関連は `DispatchPhoto.delete` と `Assistance.delete` のみ）

## 未調査・不明点

- **Vercel Blob のプラン別上限**: 2026 年の正確な価格と Pro 枠内の容量は Vercel 公式を確認のこと。本レポートは「Pro に含まれる枠内で始められ、超過は従量」という一般論に留めた
- **Neon の DB 容量課金**: Launch プランに含まれるストレージ容量の正確な値は Neon 公式参照。署名 Base64 格納の影響評価は「Neon 容量の圧迫」という抽象評価に留めた
- **iOS Safari の PWA IndexedDB 実クォータ**: 端末・OS バージョンによって変動。オフライン写真の上限は実測が必要
- **AGENTS.md が指す Next.js 16 独自仕様**: `proxy.ts`（middleware 代替）は確認したが、画像配信系の独自仕様（例: `next/image` の挙動差）は精査していない。`next/image` 導入時は `node_modules/next/dist/docs/` の該当章を要確認
