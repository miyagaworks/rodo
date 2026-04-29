# P0-13 設計書: 署名画像の Vercel Blob 移行

作成日: 2026-04-29
作成者: planner
対象タスク: `docs/pre-launch-todo.md` 2.1 節 P0-13 / `docs/tech-prep-plan.md` 4.1 節 P0-13
根拠資料: `docs/storage-audit.md` 4.1 節
スコープ: `WorkConfirmation` の 3 つの署名フィールド（`customerSignature` / `shopSignature` / `postApprovalSignature`）のみ。`DispatchPhoto`（出動写真）は P0-14 の対象であり本計画書の対象外。
**この設計書は実装に着手する前のレビュー・承認を必須とする。**

---

## 0. 結論サマリー

- **保存方式の変更**: PNG DataURL を `WorkConfirmation` の 3 つの `String?` 列に直接格納する現状から、Vercel Blob に PNG ファイルとしてアップロードし、列には HTTPS URL 文字列のみを保存する方式へ変更する。
- **フィールド名は変更しない**（`customerSignature` / `shopSignature` / `postApprovalSignature` のまま、保存内容の意味だけが変わる）。
- **API 設計の推奨案**: 既存の `POST/PATCH /api/dispatches/[id]/confirmation`（JSON）に互換性を持たせたまま、**サーバー側で DataURL を受領したら Blob にアップロードして URL に差し替える** Option C を採用。新規アップロード専用エンドポイント案（Option A）は副案として保持。
- **オフライン対応**: 既存 `confirmation_save` の IndexedDB キュー構造を変更せず、サーバー側で DataURL → URL 変換を行うことで sync 経路を維持する。
- **データ移行**: shimoda 本番は未稼働のため本番データなし。ローカル/ステージング向けに `scripts/migrate-signatures-to-blob.ts` を用意（DataURL 検出 → Blob アップロード → 列更新）。
- **推定工数**: **3.0 人日**（Phase 0 既存見積もり 2〜3 人日の上限値内）。
- **CSP 更新（P0-15）と private 化（P0-14）は別タスク**だが、本タスクで導入される Blob URL は P0-15 完了まで本番 CSP でブロックされる可能性があるため、**P0-13 と P0-15 は同時にマージするか、ステージング検証を分離する** 実行順を推奨する。

---

## 1. 影響範囲リスト

### 1.1 既存ファイル（修正対象）

| ファイル | 行番号 / 該当箇所 | 修正の概要 |
|---|---|---|
| `prisma/schema.prisma` | 364–399（`model WorkConfirmation`）、特に 371 / 382 / 385 行 | 3 列に `@db.VarChar(2048)` を付与し、列タイプを `text` → `varchar(2048)` に変更（DataURL の再混入を物理的に防ぐ）。フィールド名・nullable は維持。Migration 命名: `<timestamp>_change_signature_to_blob_url` |
| `lib/validations/schemas/confirmation.ts` | 7 / 15 / 17 行 | `nullableString` を、HTTPS URL を受け入れる新ヘルパー（`signatureUrlOrLegacyDataUrl`）に差し替え。Option C を採用するため、移行期間中は DataURL もサーバー側で受け付けて変換する（最終的には URL のみに切り替え予定だが、本タスクの完了判定は「新規保存が常に URL 化される」こと） |
| `app/api/dispatches/[id]/confirmation/route.ts` | 14 / 22 / 24 行（`buildData`）、82 / 131 行（`shareToken` 発行ロジック） | `buildData` の前段に「DataURL なら Blob にアップロードして URL に差し替える」ステップを挿入。`shareToken` 発行の truthy 判定は URL 文字列でも成立するため変更不要 |
| `components/dispatch/ConfirmationClient.tsx` | 7 行（import）、89 / 104 行（SignatureCanvas 参照）、174–181 行（`handleEnd`）、314 / 325 / 329 行（state 初期値）、371 / 379 / 381 行（save body） | **Option C のままなら最小改修で済む**: `handleEnd` は `toDataURL` を維持。state も DataURL のまま。サーバーが変換するため、初期 load 時に渡される値は URL になっている可能性がある。**`SignaturePad` の `initialData` は DataURL も URL も受け付けるよう改修が必要**: 現状の `sigRef.current.fromDataURL(initialData, ...)` は DataURL を期待しているため、URL の場合は `<img>` プレビュー表示にフォールバックするか、`fetch(url) → Blob → DataURL に変換 → fromDataURL` を行う |
| `components/confirmation/ConfirmationView.tsx` | 106–125 行（`SignatureImage`）、191 / 272 / 307 行（呼出し） | `<img src={src}>` のままで動作するが、コメント「base64 data URL なので next/image は不要」（114 行）を「Blob URL（または旧 DataURL）」に書き換え |
| `lib/pdf/confirmation-template.tsx` | 12 / 17 / 19 行（型定義）、56–61 行（`SignatureBlock`）、71 / 76 / 78 / 112 / 139 / 155 行（呼出し） | `@react-pdf/renderer` の `<Image src>` は HTTPS URL を **サーバー側 fetch** でロードする。本タスクでは Blob は public のままのため動作するが、**ステージング検証で PDF 生成時に署名が描画されることを必ず確認**。P0-14 で private 化された場合は別の対応（buffer を渡す）に切り替える必要があり、本ファイルにコメントで明記する |
| `app/api/c/[token]/pdf/route.ts` | 26 / 31 / 33 行 | 変更不要（DB の値をそのまま PDF テンプレートに渡しているだけ）。ただしステージング検証必須 |
| `app/api/c/[token]/route.ts` | 全体（19 行） | 変更不要（confirmation を素通しで返却） |
| `app/c/[token]/page.tsx` | 全体（19 行） | 変更不要 |
| `app/dispatch/[id]/confirmation/page.tsx` | 30 / 38 / 40 行 | 変更不要（confirmation オブジェクトを素通しで Client に渡している） |

### 1.2 既存テスト（更新対象）

| ファイル | 行番号 | 更新の概要 |
|---|---|---|
| `__tests__/api/confirmation-share.test.ts` | 71 / 72 / 82 / 106 / 116 / 135 / 144 / 169 / 191 / 215 / 219 行 | モックデータ `'data:image/png;base64,sig'` を `'https://example.public.blob.vercel-storage.com/signatures/.../post.png'` 等の URL 形式に置換。`shareToken` 発行ロジックの truthy 判定が URL でも動くことを確認するケースを追加 |
| `__tests__/api/public-confirmation.test.ts` | 37 / 45 / 47 行 | DataURL を URL に置換。レスポンスに URL が含まれることをアサート |
| `__tests__/api/public-confirmation-pdf.test.ts` | 60 / 68 / 70 行 | DataURL を URL に置換。`@react-pdf/renderer` のモック確認 |
| `__tests__/components/ConfirmationView.test.tsx` | 28 / 36 / 38 / 119–121 行 | DataURL を URL に置換。`<img src>` に URL が描画されることをアサート |
| `__tests__/api/assistances-validation.test.ts` | 110 行 | この行は別文脈での DataURL 例示。本タスクの直接対象外だが、副次的に確認すること |

### 1.3 新規作成ファイル

| ファイル | 役割 |
|---|---|
| `lib/blob/signature-storage.ts` | Blob アップロード・パス生成・DataURL→Blob 変換の純粋関数群（テスト容易性のため API ルートから分離） |
| `__tests__/lib/blob/signature-storage.test.ts` | 上記の単体テスト（DataURL パース、パス生成、エラーハンドリング） |
| `__tests__/api/confirmation-signature-upload.test.ts` | Confirmation API ルートが DataURL 受領時に Blob を呼ぶことの検証（`@vercel/blob` をモック） |
| `scripts/migrate-signatures-to-blob.ts` | 既存 DataURL を Blob にマイグレートする ETL（dry-run モード必須） |
| `prisma/migrations/<timestamp>_change_signature_to_blob_url/migration.sql` | 列タイプ変更マイグレーション |

---

## 2. Prisma schema 変更案

### 2.1 変更内容

```prisma
model WorkConfirmation {
  id         String @id @default(cuid())
  dispatchId String @unique

  workDate DateTime @default(now())

  preApprovalChecks Json?
  customerSignature String? @db.VarChar(2048)  // 旧: PNG DataURL を直接格納 / 新: Vercel Blob HTTPS URL
  customerName      String?
  customerDate      DateTime?
  // ...
  shopSignature   String? @db.VarChar(2048)  // 同上
  // ...
  postApprovalSignature String? @db.VarChar(2048)  // 同上
  // ...
}
```

### 2.2 命名規約

- マイグレーションディレクトリ: `prisma/migrations/<YYYYMMDDHHMMSS>_change_signature_to_blob_url/`
- 既存マイグレーション名の慣例（`add_billed_at_to_dispatch` 等）に合わせて `change_<column>_to_<purpose>` 形式
- 生成コマンド: `pnpm prisma migrate dev --create-only --name change_signature_to_blob_url`

### 2.3 SQL の想定

```sql
-- 想定される migration.sql
ALTER TABLE "WorkConfirmation" ALTER COLUMN "customerSignature" TYPE VARCHAR(2048);
ALTER TABLE "WorkConfirmation" ALTER COLUMN "shopSignature" TYPE VARCHAR(2048);
ALTER TABLE "WorkConfirmation" ALTER COLUMN "postApprovalSignature" TYPE VARCHAR(2048);
```

### 2.4 列タイプを `varchar(2048)` にする理由と注意点

- **理由**: DataURL（数十 KB）の再混入を物理的に拒否し、Postgres レベルで「URL しか入らない」契約を保証する。Vercel Blob URL は実測で 100〜200 文字程度のため 2048 で十分余裕がある
- **注意点**: マイグレーション実行時に既存 DataURL が残っていると `value too long` エラーで失敗する → **マイグレーション前にデータ移行 ETL を必ず先に実行する**（4.1 を参照）
- **代替案**: `String?`（Postgres `text`）のまま列タイプを変更しない選択肢もある。その場合は SQL マイグレーションが空になり、変更履歴を残せない。**推奨は `varchar(2048)` に変更**（防壁効果が大きく、移行コストは ETL の事前確認で吸収できる）

---

## 3. Blob パス設計

### 3.1 採用案

```
signatures/{tenantId}/{dispatchId}/{type}-{timestamp}.png
```

### 3.2 各セグメントの意図と判断根拠

| セグメント | 値の例 | 採用理由 |
|---|---|---|
| `signatures/` | 固定 | 出動写真パス `dispatches/{dispatchId}/...`（`storage-audit.md` 2.1）と並列なルートディレクトリ。ストア全体の俯瞰がしやすい |
| `{tenantId}` | `cmexxx...`（cuid） | **P0-14 で `access: 'private'` + 署名付き URL に切り替えた際、tenant prefix で論理分離する設計の前段**。出動写真の P0-14 計画（`tech-prep-plan.md` 4.2 P0-14 成果物 1）と完全に並列の構造を維持する。**slug ではなく cuid を採用**: P0-03（`Tenant.slug` 追加）の完了に依存させないため、かつ slug は将来変更されうるが id は不変のため |
| `{dispatchId}` | `cmcyyy...`（cuid） | WorkConfirmation は `Dispatch` に 1:1 でぶら下がるため、`dispatchId` で十分一意。`workConfirmationId` を使わない理由: 新規 confirmation の場合は upsert で初めて id が確定する → アップロード時に id がない問題が発生する。`dispatchId` ならアップロード前から確定している |
| `{type}` | `customer` / `shop` / `postApproval` | `customer-` / `shop-` / `postApproval-` の 3 種を区別。バックアップ調査・トラブルシュート時に種別が一目で分かる |
| `{timestamp}.png` | `1730358000000.png` | 同一署名の上書き保存時にキャッシュ衝突を回避（`Date.now()`）。拡張子は常に `.png`（`SignatureCanvas.toDataURL('image/png')` の出力固定） |

### 3.3 議論ポイント: tenantId をパスに含めるべきか

- **含める（採用案）**: P0-14 の private 化で tenant prefix ベースの ACL / 監査が可能。論理分離の表現が物理パスに反映される
- **含めない（不採用）**: パスがシンプルになるが、テナント越境の流出時に「どのテナント由来か」をパスから判別できなくなる
- **判断**: **含める**。コスト 0、将来の private 化（P0-14）に直結するメリット大。ただし P0-13 完了時点では `access: 'public'` のまま運用する（private 化は P0-14 のスコープ）

### 3.4 既存出動写真パスとの整合性に関する補足

- 出動写真の現状パス: `dispatches/{dispatchId}/{timestamp}-{safeName}` （tenantId なし）
- 出動写真の P0-14 計画後パス: `{tenantId}/dispatches/{dispatchId}/photos/xxx.jpg` （`tech-prep-plan.md` 4.2 P0-14）
- **本タスクの署名パス**: `signatures/{tenantId}/{dispatchId}/{type}-{timestamp}.png`（先頭が `signatures/` か `{tenantId}/` かで揺れがある）
- **判断**: P0-13 の段階では `signatures/{tenantId}/...` を採用し、P0-14 で出動写真と署名を統一して `{tenantId}/dispatches/{dispatchId}/photos/...` / `{tenantId}/signatures/{dispatchId}/...` に揃える方針とする。出動写真側との完全な整合性は P0-14 の責務とし、本タスクで先回りしない

---

## 4. 新設する API 設計

### 4.1 採用案: Option C — 既存 confirmation API 内でサーバー側変換

**概要**: クライアントは現状通り `POST/PATCH /api/dispatches/[id]/confirmation` に JSON で DataURL を送る。サーバー側でリクエスト処理冒頭に「DataURL なら Blob にアップロードして URL に差し替える」ステップを挿入する。

**フロー**:

```
[Client]
  ConfirmationClient.handleSave()
    body = { ..., customerSignature: "data:image/png;base64,...", shopSignature: null, postApprovalSignature: "data:image/png;base64,..." }
  ↓ JSON POST/PATCH
[Server] /api/dispatches/[id]/confirmation
  1. auth() / tenant 検証
  2. zod validation（DataURL or URL or null を許容）
  3. NEW: convertSignatures(body, dispatchId, tenantId)
       - customerSignature が DataURL なら Blob put → URL を返す
       - URL ならそのまま
       - null ならそのまま
       - 3 フィールドそれぞれに適用
  4. buildData()
  5. prisma.workConfirmation.upsert({ ..., customerSignature: "https://...", ... })
  6. shareToken 発行ロジック（URL でも truthy で成立）
```

**メリット**:
- フロントエンドの変更が最小（state は DataURL のままで OK）
- `lib/offline-fetch.ts` / `lib/sync.ts` / `lib/offline-db.ts` が無改修で動く（オフライン時に IndexedDB に積まれる JSON は今まで通り DataURL を含む。同期時にサーバーが変換する）
- 既存テストの構造を大幅変更せず、モックデータのみ差し替えで済む

**デメリット**:
- サーバー側で同期 Blob put が走るため、3 署名で最大 3 回のネットワーク I/O が confirmation API 内に追加される（@vercel/blob は Promise.all で並列化可能）
- 既存 URL 値が再送された場合に「もう URL じゃん」と判別する分岐が必要（`startsWith('http')` で判別）

### 4.2 副案: Option A — 専用署名アップロードエンドポイント

**概要**: `POST /api/dispatches/[id]/confirmation/signature` を新設し、クライアントが署名キャプチャ完了時点で個別にアップロード。confirmation API には URL を送る。

**フロー**:
```
[Client] handleEnd → toBlob → POST /signature → URL → state に URL 保持
[Client] handleSave → URL を JSON で送信
[Server] /confirmation はもはや DataURL を扱わない
```

**メリット**:
- 責務分離が明確（既存の `/photos` ルートと完全並列）
- confirmation API のレスポンスが軽い（DataURL 不要）

**デメリット**:
- フロント大改修：`SignaturePad` で `toBlob` → fetch → 状態更新の async フロー導入
- オフライン対応：署名アップロードもオフラインキューに乗せる必要あり、`pendingActions` に新タイプ追加 + `sync.ts` の対応 + `IndexedDB` のスキーマ追加（バージョン番号 +1 必要）
- テスト変更範囲が広い

### 4.3 推奨と決裁ポイント

- **推奨: Option C** を採用。shimoda 単独運用前提では複雑性が引き合わない
- **判断ポイント**: ユーザー宮川氏の承認が必要
- 2 社目以降で署名アップロード回数が増え、サーバー側 Blob put の同期処理が p95 を押し上げる兆候が出たら Option A に再設計（その時点でフロント・オフライン同期も含めて再見積もり）

### 4.4 サーバー側変換ロジックの仕様

**新ヘルパー**: `lib/blob/signature-storage.ts`

```ts
export async function convertSignatureIfDataUrl(
  value: string | null | undefined,
  params: { tenantId: string; dispatchId: string; type: 'customer' | 'shop' | 'postApproval' }
): Promise<string | null | undefined>
```

- `value === null` または `undefined`: そのまま返す
- `value.startsWith('https://')` または `http://`: そのまま返す（既に URL）
- `value.startsWith('data:image/png;base64,')`: base64 デコード → `put()` でアップロード → URL を返す
- 上記いずれにも該当しない: バリデーションエラーを throw（呼び元で 400 を返す）

**バリデーション**:
- DataURL の base64 部分の長さチェック（最大 100KB ＝ デコード後 75KB 程度。実際の署名は 5〜30KB なので余裕）
- マジックバイト検証（PNG 署名 `89 50 4E 47`）— 既存 `app/api/dispatches/[id]/photos/route.ts:50-55` のロジックを流用
- MIME は固定 `image/png`（DataURL のヘッダから取得しつつ強制チェック）

**Blob put 呼出し**:

```ts
const blob = await put(
  `signatures/${tenantId}/${dispatchId}/${type}-${Date.now()}.png`,
  binaryData,
  { access: 'public', contentType: 'image/png' }
)
return blob.url
```

### 4.5 zod バリデーション差し替え

**新ヘルパー**: `lib/validations/helpers.ts` に追加

```ts
export const signatureValue = z.union([
  z.literal(''),                                               // 空文字（フロントが消去時に送る）
  z.null(),
  z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(120_000),  // DataURL 上限 ~90KB の base64
  z.string().url().startsWith('https://').max(2048),           // Blob URL
]).optional().nullable()
```

`upsertConfirmationSchema` の `customerSignature` / `shopSignature` / `postApprovalSignature` を `nullableString` から `signatureValue` に差し替える。

---

## 5. フロントエンド変更箇所と方針

### 5.1 Option C 採用時（推奨ルート）

**変更ファイル**: `components/dispatch/ConfirmationClient.tsx`

| 箇所 | 現状 | 変更内容 |
|---|---|---|
| 89 行（`SignaturePad` ref） | `useRef<SignatureCanvas \| null>(null)` | 変更なし |
| 174–181 行（`handleEnd`） | `sigRef.current.toDataURL('image/png')` | 変更なし。引き続き DataURL を state に保持 |
| 144–152 行（initial load） | `sigRef.current.fromDataURL(initialData, ...)` | **要改修**: `initialData` が URL の場合は `fetch(url) → blob() → FileReader.readAsDataURL → fromDataURL` の async フローに切り替え。`useEffect` 内で `(async () => { ... })()` |
| 314 / 325 / 329 行（state 初期値） | `confirmation?.customerSignature ?? null` | 変更なし。URL でも DataURL でも state に文字列として保持 |
| 371 / 379 / 381 行（save body） | DataURL を JSON 送信 | 変更なし。サーバーが変換する |

**追加ファイル**: なし

**SignaturePad の URL ロード対応の擬似コード**:

```ts
useEffect(() => {
  if (!initialData || !sigRef.current) return
  if (initialData.startsWith('data:')) {
    // 既存の DataURL ロード経路
    sigRef.current.fromDataURL(initialData, { width: w, height: SIG_HEIGHT })
  } else if (initialData.startsWith('http')) {
    // URL ロード経路（新規）
    void fetch(initialData)
      .then(r => r.blob())
      .then(blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }))
      .then(dataUrl => sigRef.current?.fromDataURL(dataUrl, { width: w, height: SIG_HEIGHT }))
  }
  // ...
}, [initialData])
```

### 5.2 Option A を採用する場合（副案。本タスクでは採用しない想定）

- `handleEnd` で `sigRef.current.getCanvas().toBlob(blob => { fetch('/signature', { body: formData }).then(r => r.json()).then(({ url }) => onSave(url)) }, 'image/png')` に変更
- state は URL を保持
- **`react-signature-canvas` v1.1.0-alpha.2 の wrapper 自体は `toBlob()` メソッドを公開していない**ため、`getCanvas()` で取得した `HTMLCanvasElement` の `toBlob` を呼ぶ。これは標準 API であり全モダンブラウザで対応（iOS Safari 11+、Chrome、Edge 全て対応）

### 5.3 react-signature-canvas の互換性確認結果

- **バージョン**: `^1.1.0-alpha.2`（`package.json:34`、`node_modules/react-signature-canvas/package.json` で確認済み）
- **公開 API**（`node_modules/react-signature-canvas/dist/index.d.ts` 確認済み）:
  - `getCanvas(): HTMLCanvasElement` ✅ 利用可能
  - `getTrimmedCanvas(): HTMLCanvasElement` ✅ 利用可能（余白を除いた画像が取れる、PDF 用に有用）
  - `toDataURL: SignaturePad['toDataURL']` ✅ 現状利用中
  - `fromDataURL: SignaturePad['fromDataURL']` ✅ 現状利用中
  - **`toBlob()` メソッドは wrapper には存在しない**。`getCanvas().toBlob(callback, 'image/png')` で代替可能（HTMLCanvasElement 標準 API）
- **判断**: Option C を採用するため、本タスクで `toBlob` を直接使う必要はない。Option A を採用する場合のみ `getCanvas().toBlob` を利用する

---

## 6. PDF 生成側の修正方針

### 6.1 現状

`lib/pdf/confirmation-template.tsx:56-61` の `SignatureBlock` は `<Image src={src} />`（`@react-pdf/renderer`）に DataURL を直接渡している。

### 6.2 変更後

- DB から取得される値が HTTPS URL 文字列に変わる
- `@react-pdf/renderer` の `<Image src>` は **HTTPS URL を fetch して画像を取り込む機能を持つ**（公式仕様）
- **本タスクでは Blob は `access: 'public'` のため、サーバー側 fetch は無認証で成功する** → 修正不要
- `lib/pdf/confirmation-template.tsx` の型定義は `string | null` のまま（DataURL でも URL でも文字列）

### 6.3 検証必須項目（テストでカバーしきれない手動 QA）

- ローカルで `pnpm prisma migrate dev` 後、`/dispatch/<id>/confirmation` で署名 → 保存 → `/c/<token>/pdf` で PDF をダウンロードし、署名画像が描画されているか目視確認
- ステージング環境（本番相当の Vercel デプロイ）でも同じ手順で確認
- Vercel の Functions 実行環境から `*.public.blob.vercel-storage.com` への egress が許容されることを確認（Vercel 同一プラットフォーム内通信のため通常問題ないが、初回検証必須）

### 6.4 P0-14（private 化）後の影響予告（本タスクの対応範囲外、コメントで明記）

- private 化後は `<Image src={url}>` のままだと 401/403 で fetch 失敗する
- 対応案 A: PDF 生成時にサーバー側で `getDownloadUrl(pathname)` を呼んで短期署名 URL を作り、テンプレートに渡す
- 対応案 B: PDF 生成時にサーバー側で `fetch(blob_url)` してバッファを取り、`<Image src={Buffer}>` に渡す（@react-pdf は Buffer も受け付ける）
- **本タスクでは方針記載のみ**。実装は P0-14 の範疇

---

## 7. データ移行の要否判断とスクリプト案

### 7.1 要否判断フロー

```
1. 本番DB（shimoda） → 未稼働のため 0 件 → 移行不要（マイグレーション直接適用可）
2. ローカル開発DB → 開発者各自の作業データに DataURL が残っている可能性 → ETL を提供して各自実行
3. ステージングDB → tester が動作確認用に投入したテストデータ → ETL で移行
```

### 7.2 ETL スクリプト仕様: `scripts/migrate-signatures-to-blob.ts`

**実行コマンド**: `pnpm tsx scripts/migrate-signatures-to-blob.ts [--dry-run]`

**処理フロー**:

```
1. 引数パース（--dry-run フラグ）
2. prisma.workConfirmation.findMany({
     where: {
       OR: [
         { customerSignature: { startsWith: 'data:' } },
         { shopSignature: { startsWith: 'data:' } },
         { postApprovalSignature: { startsWith: 'data:' } },
       ]
     },
     include: { dispatch: { select: { tenantId: true } } }
   })
3. 各レコードに対し:
   a. customerSignature が DataURL なら convertSignatureIfDataUrl で URL に変換
   b. shopSignature 同上
   c. postApprovalSignature 同上
   d. --dry-run なら変換結果をログ出力のみ
   e. --dry-run でなければ prisma.workConfirmation.update で URL に置換
4. 件数サマリーを出力（変換成功 / スキップ / エラー）
5. エラー時はロールバック手順を案内（マイグレーション前なら DB をバックアップから復元）
```

**安全策**:
- **dry-run をデフォルト推奨**。`--apply` フラグを明示しない限り書き込まない
- 各 update を **トランザクションで包む**（1 レコード単位、3 列同時更新）
- スクリプト先頭で `if (process.env.NODE_ENV === 'production')` 検出時は明示的な確認プロンプトまたは環境変数 `MIGRATE_SIG_CONFIRM=yes` を要求

### 7.3 マイグレーション実行順序

```
[ローカル / ステージング]
1. pnpm tsx scripts/migrate-signatures-to-blob.ts --dry-run   # 件数確認
2. 異常がなければ pnpm tsx scripts/migrate-signatures-to-blob.ts --apply
3. SELECT で残 DataURL が 0 件であることを確認
4. pnpm prisma migrate deploy                                  # 列タイプ varchar(2048) 化

[本番（shimoda 切替前）]
1. SELECT で DataURL 件数を確認（0 件想定）
2. 0 件であればステップ ETL をスキップして直接 pnpm prisma migrate deploy
3. 0 件でなかった場合は手順を中断し super-agent に判断を仰ぐ
```

---

## 8. テスト方針

### 8.1 範囲

| レイヤー | 範囲 | 備考 |
|---|---|---|
| 単体（`lib/blob/signature-storage.test.ts`） | `convertSignatureIfDataUrl` の入力分岐（null / URL / DataURL / 不正値）、Blob put のモック呼出し | 新規 |
| API（`__tests__/api/confirmation-signature-upload.test.ts`） | confirmation API が DataURL を受領したとき Blob put が呼ばれること、URL が返却されること、`shareToken` 発行ロジックが URL でも動くこと | 新規 |
| API（既存） | `confirmation-share.test.ts` / `public-confirmation.test.ts` / `public-confirmation-pdf.test.ts` のモックデータを URL 形式に更新 | 既存修正 |
| コンポーネント（`ConfirmationView.test.tsx`） | 既存テストのモックデータ更新（DataURL → URL）、`<img src={url}>` がレンダリングされることのアサーション | 既存修正 |
| E2E | 範囲外（タスク指示通り） | — |

### 8.2 モックの方針

- `@vercel/blob` の `put` を `vi.mock('@vercel/blob', () => ({ put: vi.fn().mockResolvedValue({ url: 'https://...' }) }))` でモック
- 本物のネットワーク呼出しは絶対に発生させない
- DataURL のサンプルは `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...` の最小有効 PNG を使用

### 8.3 既存テストの破壊範囲

- モックデータを書き換える行数は累計 30 行未満（grep で特定済み、1.2 節参照）
- `shareToken` 発行ロジックの truthy 判定は URL 文字列でも変わらず成立するため、テストの構造は変わらない

### 8.4 リグレッション確認

- 既存 `pnpm test` が全件 pass すること
- `pnpm tsc --noEmit` で型エラーなしを確認
- 手動 QA（本番相当環境）で署名 → 保存 → 共有 URL アクセス → PDF ダウンロードが動作すること

---

## 9. 実装順序（依存関係）

```
[Step 1: 独立タスク（並行可能）]
  1a. .env.example に BLOB_READ_WRITE_TOKEN 追記（P0-16 と同時実施）
  1b. lib/blob/signature-storage.ts 新設（純粋関数、テスト容易）
  1c. lib/blob/signature-storage.test.ts 新設

[Step 2: API 改修（Step 1 完了後）]
  2a. lib/validations/schemas/confirmation.ts に signatureValue 適用
  2b. lib/validations/helpers.ts に signatureValue 追加
  2c. app/api/dispatches/[id]/confirmation/route.ts に convertSignatures 統合
  2d. __tests__/api/confirmation-signature-upload.test.ts 新設

[Step 3: フロント改修（Step 2 完了後 / Option C なら最小）]
  3a. components/dispatch/ConfirmationClient.tsx の SignaturePad initialData URL ロード対応
  3b. components/confirmation/ConfirmationView.tsx のコメント修正

[Step 4: PDF 検証（Step 2 完了後）]
  4a. lib/pdf/confirmation-template.tsx に P0-14 対応コメント追記
  4b. ローカルで /c/<token>/pdf を実機検証

[Step 5: 既存テスト更新（Step 2 と並行可能）]
  5a. __tests__/api/confirmation-share.test.ts 更新
  5b. __tests__/api/public-confirmation.test.ts 更新
  5c. __tests__/api/public-confirmation-pdf.test.ts 更新
  5d. __tests__/components/ConfirmationView.test.tsx 更新

[Step 6: データ移行（Step 1〜3 完了後、Step 7 の前）]
  6a. scripts/migrate-signatures-to-blob.ts 新設
  6b. ローカルで dry-run 実行
  6c. 必要なら --apply 実行

[Step 7: マイグレーション適用]
  7a. prisma/migrations/<timestamp>_change_signature_to_blob_url を生成
  7b. pnpm prisma migrate dev で適用

[Step 8: 統合検証]
  8a. pnpm test 全件 pass
  8b. pnpm tsc --noEmit 通過
  8c. ローカルで E2E 手順（出動作成 → 署名 → 保存 → /c/<token> 表示 → PDF DL）
  8d. PR 作成 → reviewer エージェントレビュー
```

---

## 10. リスクとロールバック方針

### 10.1 リスク

| # | リスク | 影響度 | 予防策 | 発生時対応 |
|---|---|---|---|---|
| R-13-01 | マイグレーション実行時に既存 DataURL レコードが残っており `value too long` エラーで失敗 | 中 | Step 6（ETL）を Step 7（migrate）の必須前段に位置付け、ETL の dry-run で件数 0 を確認してから migrate | ETL を再実行、それでも残るなら一旦列タイプを `text` に戻すロールバックマイグレーションを発行 |
| R-13-02 | サーバー側 Blob put が遅延し、confirmation API の p95 が悪化（最大 3 並列 put） | 中 | `Promise.all` で 3 署名を並列化。DataURL → URL 変換が走るのは「新規キャプチャ時のみ」（既存 URL は素通し）であり、編集時の I/O は最小化される | p95 監視で 2 秒超が継続するなら Option A（専用エンドポイント + クライアント直接アップロード）に再設計 |
| R-13-03 | `@react-pdf/renderer` が Vercel 環境で Blob URL の fetch に失敗する（CSP / Functions の egress 制限） | 中 | ステージング検証必須（6.3 節）。Vercel Functions は `*.public.blob.vercel-storage.com` への外向き通信を許容するが、初回検証で確認 | DataURL を fetch でサーバー側取得 → buffer 化 → `<Image src={buffer}>` に切り替え |
| R-13-04 | 本番 CSP `img-src` に Vercel Blob ドメインが未追加（P0-15 未実施）の状態で本タスクをマージし、本番でサインがブラウザに表示されない | 高 | **P0-13 と P0-15 を同一 PR にまとめる、または P0-15 を先行実施**。マージ順序を super-agent が制御 | CSP を緊急修正。Vercel ダッシュボードの Instant Rollback で前バージョンへ戻す |
| R-13-05 | オフライン時にキューイングされた既存 DataURL JSON が、サーバーバージョンアップ後の sync 時に新 zod スキーマで弾かれる | 低 | 新 `signatureValue` スキーマは DataURL を許容するため、移行期間中の互換性は維持される | スキーマで弾かれるケースは発生しない設計。万一発生したら `signatureValue` の許容を一時拡大 |
| R-13-06 | 署名再キャプチャ時の旧 Blob ファイルが孤児化する（DB は新 URL に更新、旧 URL の Blob は残存） | 低 | P2-07（Dispatch 削除時の Blob 連動削除）の調査スコープに「署名置換時の旧 Blob 削除」を追記する。本タスク内では Blob 個別削除のクリーンアップを実装しない（運用観察後に判断） | 将来 P2-07 で `confirmation.upsert` の preHook 等で旧 URL を `del()` する処理を追加 |
| R-13-07 | iOS Safari の PWA で fetch URL → DataURL 変換が CORS で失敗する（SignaturePad の編集時ロード） | 低 | Vercel Blob の public access は CORS 許可されている（公式仕様）。検証で確認 | 編集ロード時は URL のまま `<img>` プレビュー表示にフォールバック、編集再開は「クリアして再署名」とする UX に変更 |

### 10.2 ロールバック方針

**Level 1: アプリケーションレベル（最も軽量）**
- Vercel ダッシュボードから直前のデプロイにロールバック
- 影響範囲: コードのみ。DB の列タイプは `varchar(2048)` のまま
- 注意: 旧コードは DataURL を DB に書き込もうとするが `varchar(2048)` で弾かれる → アプリが書込み失敗で動作不能になる
- **対策**: Level 1 ロールバックを行う場合は同時に Level 2 のスキーマロールバックも実施する

**Level 2: スキーマロールバック**
- 緊急用ロールバックマイグレーションを事前に用意（`prisma/migrations/<timestamp>_revert_signature_to_text/migration.sql`）

```sql
-- 緊急ロールバック SQL（必要時のみ）
ALTER TABLE "WorkConfirmation" ALTER COLUMN "customerSignature" TYPE TEXT;
ALTER TABLE "WorkConfirmation" ALTER COLUMN "shopSignature" TYPE TEXT;
ALTER TABLE "WorkConfirmation" ALTER COLUMN "postApprovalSignature" TYPE TEXT;
```

- **本マイグレーションは PR には含めない**。緊急時に手動で `psql` から実行する想定で、`docs/handover/p0-13-rollback-sql.md` 等に SQL を保管
- 本番では Neon の point-in-time recovery（P2-05 後）も併用可能

**Level 3: データレベル**
- 既に Blob にアップロードされた URL → DataURL に逆変換するスクリプトは作成しない（コスト 大、shimoda 本番未稼働なら実害最小）
- 本番運用後に大規模な逆移行が必要になった場合は別計画書で詳細設計

### 10.3 ロールバック判断基準

- shimoda 本番運用開始**前**にリリースする場合: 障害時は Level 1 + Level 2 を即時実施。Level 3 は実施しない
- shimoda 本番運用開始**後**にリリースする場合（運用観察 1 ヶ月以降の改修）: 障害時は Level 1 を試行 → 改善なければ Level 2、データ整合性異常があれば super-agent + 宮川氏で Level 3 検討

---

## 11. 推定工数

### 11.1 既存計画との対比

- 既存見積もり（`tech-prep-plan.md` 4.1 P0-13）: **2〜3 人日**
- 本設計書による再見積もり: **3.0 人日**（上限値）

### 11.2 内訳

| ステップ | 工数 | 備考 |
|---|---|---|
| Step 1（lib/blob 新設 + 単体テスト） | 0.5d | 純粋関数のため AI 実装でも安全 |
| Step 2（API 改修 + API テスト） | 0.5d | `convertSignatures` の組み込み + Promise.all 並列化 |
| Step 3（フロント改修） | 0.5d | URL ロード対応の async useEffect + iOS Safari 検証 |
| Step 4（PDF 検証） | 0.25d | 主に手動 QA |
| Step 5（既存テスト更新） | 0.5d | 30 行未満のモック書き換え |
| Step 6（ETL スクリプト） | 0.25d | dry-run 設計込み |
| Step 7（マイグレーション） | 0.25d | Prisma migrate dev + 確認 |
| Step 8（統合検証 + reviewer） | 0.25d | 手動 E2E + AI レビュー |
| **合計** | **3.0d** | |

### 11.3 見積もり差異の理由

- 既存見積もり 2〜3 人日は「Option A 前提（フロント大改修 + オフライン同期改修）」を含めた幅であった
- 本設計書では Option C を採用することで Step 3 の改修を最小化（0.5d）し、オフライン同期改修を完全に省いた（0d）
- 一方で、列タイプの `varchar(2048)` 化に伴う ETL（Step 6）とロールバック SQL の事前準備を追加した（合計 0.25d）
- 結果として **2〜3 人日の上限値である 3.0 人日に収束**。下限値 2.0 人日に近づける場合は ETL を省略（=列タイプ変更を諦めて `text` のまま）する判断が必要だが、防壁効果を失うため非推奨

---

## 付録 A: 採用案サマリー（決裁用）

| 項目 | 採用 | 主な根拠 |
|---|---|---|
| API 設計 | **Option C**（既存 confirmation API でサーバー側変換） | フロント・オフライン同期改修ゼロ。shimoda 単独運用で複雑性が引き合わない |
| 列タイプ | `String? @db.VarChar(2048)`（migration で `text` → `varchar(2048)`） | DataURL 再混入の物理的防壁 |
| Blob パス | `signatures/{tenantId}/{dispatchId}/{type}-{timestamp}.png` | P0-14 private 化の tenant prefix 設計と直結 |
| Blob access | `public`（P0-13 時点） | private 化は P0-14 のスコープ |
| データ移行 | dry-run 必須 ETL（`scripts/migrate-signatures-to-blob.ts`） | 本番 0 件想定だが、ローカル/ステージング向けに必須 |
| フィールド名 | 変更なし（`customerSignature` 等のまま） | タスク指示通り |

## 付録 B: 関連タスクとの依存

- **P0-15（CSP `img-src` に Vercel Blob ドメイン追加）**: 本タスク完了後の本番デプロイ時に必須。**同一 PR にまとめるか先行実施を強く推奨**（リスク R-13-04 参照）
- **P0-14（Vercel Blob private 化）**: 本タスクで保存される URL 構造を前提に設計される。本タスクの Blob パスに `tenantId` を含めることが前提条件
- **P0-16（.env.example に `BLOB_READ_WRITE_TOKEN` 追記）**: 本タスクと並行実施推奨（Step 1a）
- **P2-07（Dispatch 削除時の Blob 連動削除）**: 本タスク完了後にスコープ拡大が必要（署名置換時の旧 Blob クリーンアップを追加）

## 付録 C: 未確定事項（実装着手前に確認）

1. **承認**: 本設計書（特に Option C 採用と `varchar(2048)` への列タイプ変更）について宮川氏の承認 — **未確認**
2. **CSP 同時マージ判断**: 本タスクと P0-15 を同一 PR にするか、別々にしてマージ順序を制御するか — **未確認**
3. **ステージング環境の有無**: PDF 生成検証（6.3 節）に使えるステージングが確保されているか — **未確認**（`tech-prep-plan.md` Phase 1 で `staging.rodo.run` 想定の記載あり）
4. **react-signature-canvas のメジャーアップデート可否**: 現状 `^1.1.0-alpha.2` の alpha 版を使用中。本タスクと無関係だが、`toBlob` 利用に切り替える際の安定版確認は P0-13 の範囲外として保留 — **本タスクでは Option C 採用のため影響なし**
