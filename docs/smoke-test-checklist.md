# 本番リリース前 スモークテスト チェックリスト（P2-03）

最終更新: 2026-04-30
対象ブランチ: `feature/p0-13-signature-blob`（PR #10）
担当: tester（人手による一気通貫検証）
所要見積: 2〜3 時間（全項目通し）

---

## 0. 本ドキュメントの位置付け

`docs/pre-launch-todo.md` §2.3 P2-03「スモークテスト実施」の作業手順書。PR #10（署名画像 Vercel Blob 化）を **マージする前のローカル検証** として実施する。本番テナント（P2-01）作成後に同じチェックリストを本番環境に対して再実行することを想定している。

ローカル検証で全合格 → PR #10 マージ → Vercel Preview デプロイ → 本番 P3-01 切替、という運用順。

---

## 1. 前提環境

| 項目 | 値 |
|---|---|
| Node.js | プロジェクトの `.nvmrc` または package.json `engines` に従う |
| パッケージマネージャ | `npm` または `pnpm`（package-lock.json は npm 前提） |
| DB | ローカル PostgreSQL（Docker / Postgres.app 等） or Neon Branch |
| `.env.local` 必須キー | `DATABASE_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BLOB_READ_WRITE_TOKEN`（PR #10 で追加） |
| ブラウザ | Chrome（DevTools / Application タブ常用）+ Safari（PWA 検証時のみ） |

> `.env.example` に PR #10 で `BLOB_READ_WRITE_TOKEN` が追加済み。Vercel ダッシュボードの Storage → Blob → `.env.local` Tab で取得して `.env.local` にセット、もしくは `vercel env pull`。

---

## 2. 起動手順

```sh
# 1. PR #10 ブランチをチェックアウト
gh pr checkout 10

# 2. 依存関係インストール
npm install
# Tailwind 4 + macOS で lightningcss が入らない場合
# npm rebuild lightningcss

# 3. Prisma マイグレーション
npx prisma migrate dev

# 4. シードデータ（必要に応じて）
npx prisma db seed

# 5. dev server 起動
npm run dev
```

> シードユーザーの ADMIN / MEMBER アカウントは `prisma/seed.ts` を Read して把握すること [未確認: ファイル本体は本ドキュメント作成時未読]。

---

## 3. 検証者記入欄

| 項目 | 記入 |
|---|---|
| 検証者名 | |
| 検証日 | |
| 検証ブラウザ / OS | |
| Node バージョン | |
| DB（ローカル or Neon Branch） | |
| `BLOB_READ_WRITE_TOKEN` 設定 | □ 設定済み |
| 開始時刻 | |
| 終了時刻 | |

---

## 4. チェック項目

### カテゴリ A: 認証フロー（10 項目）

実装根拠: `auth.ts`（NextAuth v5 beta + JWT strategy + trustHost: true）, `proxy.ts`（middleware 相当）, `app/login/page.tsx`, `app/admin/layout.tsx:13`（ADMIN 限定リダイレクト）

- [x] A-01 未ログインで `/` にアクセス → `/login` にリダイレクト
  - **手順**: シークレットウィンドウで `http://localhost:3100/` を開く
  - **期待結果**: `/login` に遷移、ログインフォームが表示される
  - **関連ファイル**: `proxy.ts:39-41`, `app/page.tsx:6-7`
  - **失敗時**: ネットワークタブで 200 が `/` から返っていれば middleware が効いていない → `proxy.ts` の matcher 確認

- [x] A-02 メール + パスワードでログイン成功
  - **手順**: シードユーザーの email / password を入力 → 「ログイン」
  - **期待結果**: `/` に遷移、HomeClient が表示される
  - **関連ファイル**: `auth.ts:13-43`（Credentials provider）
  - **失敗時**: bcrypt 比較失敗 → `passwordHash` が NULL でないか DB 確認

- [x] A-03 不正パスワードでログイン失敗
  - **手順**: 正しい email + 不正な password → 「ログイン」
  - **期待結果**: ログインフォームに留まる、エラー表示
  - **関連ファイル**: `auth.ts:33`（authorize が null を返す）

- [x] A-04 Google OAuth でログイン（既存ユーザー）
  - **手順**: 「Google でログイン」→ Google アカウント選択 → 戻る
  - **期待結果**: `/` に遷移、`User.image` が更新される
  - **関連ファイル**: `auth.ts:46-67`（jwt callback で DB から tenantId/role を補完）, `auth.ts:76-90`（signIn callback で image 更新）
  - **失敗時**: `/api/auth/callback/google` が 401 → リダイレクト URI を Google Console で確認、ローカルなら `http://localhost:3100/api/auth/callback/google`

- [x] A-05 Google OAuth で未登録ユーザー → 拒否
  - **手順**: DB に存在しない email の Google アカウントでサインイン試行
  - **期待結果**: `signIn` callback が `false` を返し、ログインが拒否される
  - **関連ファイル**: `auth.ts:81-83`

- [x] A-06 ADMIN ロール限定: MEMBER で `/admin/dashboard` にアクセス → `/` にリダイレクト
  - **手順**: MEMBER アカウントでログイン後、URL に `/admin/dashboard` を直接入力
  - **期待結果**: `/` にリダイレクトされる
  - **関連ファイル**: `app/admin/layout.tsx:13`

- [x] A-07 セッション維持（再読込）
  - **手順**: ログイン後、`/` でブラウザリロード（F5）
  - **期待結果**: ログアウトされず HomeClient のまま
  - **関連ファイル**: `auth.ts:95-97`（jwt strategy）

- [x] A-08 ログイン済みで `/login` にアクセス → `/` にリダイレクト
  - **手順**: ログイン済みのまま `/login` にアクセス
  - **期待結果**: `/` にリダイレクト
  - **関連ファイル**: `proxy.ts:43-45`

- [x] A-09 ログアウト動作
  - **手順**: 設定 / ヘッダーのログアウトボタン押下
  - **期待結果**: `/login` に戻り、Cookie がクリア
  - **関連ファイル**: `auth.ts` (signOut), Header コンポーネント [未確認: signOut 呼び出し箇所]

- [x] A-10 認証必須 API: 未ログインで `/api/dispatches` を fetch → 401
  - **手順**: シークレットウィンドウのコンソールで `fetch('/api/dispatches').then(r=>r.status)`
  - **期待結果**: `401`
  - **関連ファイル**: `proxy.ts:32-37`

---

### カテゴリ B: 業務フロー（ドライバー視点）（22 項目）

実装根拠: `app/dispatch/**/page.tsx`, `components/dispatch/DispatchClient.tsx`, `RecordClient.tsx`, `ConfirmationClient.tsx`, `SecondaryDispatchClient.tsx`, `app/api/dispatches/**`, `prisma/schema.prisma` (Dispatch / DispatchEtc / DispatchPhoto / WorkConfirmation / Report)

#### B-1. ホーム画面と新規出動

- [x] B-01 ホーム画面 表示
  - **手順**: ログイン後の `/`
  - **期待結果**: HomeClient（アシスタンスボタングリッド 6社 + 条件付き休憩ボタン + 必要時に休憩中バー）が表示
  - **関連ファイル**: `components/HomeClient.tsx`, `components/AssistanceButton.tsx`, `components/BreakBar.tsx`
  - **備考**: 「保有出動リスト」「新規出動ボタン」UI は実装に存在しない。新規出動の起点はアシスタンスボタン押下（2026-04-30 検証で確認・チェックリスト修正）

- [x] B-02 新規出動 — 起点遷移（DispatchClient 表示まで）
  - **手順**: ホームでアシスタンスボタンを押下
  - **期待結果**:
    - `/dispatch/new?assistanceId=xxx&type=onsite` に遷移
    - DispatchClient が step=0（初期）で表示される
    - **この時点では DB レコード未作成**（POST は B-03 の出動ボタン押下時）
  - **関連ファイル**: `components/AssistanceButton.tsx:24`, `app/dispatch/new/page.tsx`, `components/dispatch/DispatchClient.tsx`
  - **備考**: 旧記述「ホーム →『新規出動』ボタン」は実装に存在しない（2026-04-30 検証で修正）。AssistanceButton クリック時点では `type=onsite` が固定で渡るため、TRANSPORT 種別での起動は DispatchClient 内の種別切替で行う

#### B-2. 出動 → 現着 → 帰社（ONSITE フロー）

- [x] B-03 出動ボタン押下（Dispatch 作成 + 出発記録）
  - **手順**: `/dispatch/new` で必要に応じて種別切替（onsite/transport）→ 出発ODO入力 → 「出動」ボタン
  - **期待結果**:
    - 初回: POST `/api/dispatches` で Dispatch 作成、`dispatchTime` / `departureOdo` 同時記録、status=DISPATCHED、`/dispatch/[id]` に `router.replace` で遷移
    - 取消後の再出動: 既存レコードを PATCH で再利用（dispatchNumber 欠番防止）
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx:463-522`, `app/api/dispatches/route.ts`, `app/api/dispatches/[id]/route.ts`
  - **失敗時**:
    - `dispatchNumber` 採番失敗 → JST 基準（jstOffset = 9*60*60*1000）の `tenantId+dispatchNumber` ユニーク制約を確認
  - **備考**: B-02（DispatchClient 表示）と B-03（Dispatch 作成）は別操作だが、ホーム → 出動完了までで実施するボタン操作は「アシスタンスボタン」「出動ボタン」の 2 押下のみ（2026-04-30 検証で実装と整合化）

- [x] B-04 写真撮影（出動中）
  - **手順**: 「写真撮影」→ カメラ起動 → 撮影 → アップロード
  - **期待結果**: `DispatchPhoto` レコード追加、サムネイルが表示
  - **関連ファイル**: `components/dispatch/PhotoModal.tsx`, `PhotoThumbnails.tsx`, `hooks/usePhotoCapture.ts`, `app/api/dispatches/[id]/photos/route.ts`
  - **既知**: 写真上限は未実装（P0-17 未着手、grep で `MAX_PHOTOS` / `photoLimit` / バリデーション無しを確認）。現状は上限なしで保存可能。上限制御の検証は P0-17 完了後に実施する。2026-04-30 検証で 11 枚保存可能を確認、想定通り。

- [x] B-05 写真削除
  - **手順**: サムネイル横の削除ボタン
  - **期待結果**: DELETE `/api/dispatches/[id]/photos/[photoId]` が 204、サムネイル消える
  - **関連ファイル**: `app/api/dispatches/[id]/photos/[photoId]/route.ts`

- [x] B-06 現着登録（ONSITE）
  - **手順**: 「現着」ボタン
  - **期待結果**: `arrivalTime`, `arrivalOdo` 記録、status=ONSITE
  - **関連ファイル**: `DispatchClient.tsx`

- [x] B-07 作業内容入力 / 状況入力
  - **手順**: 状況区分（事故 / 故障）、状況詳細、メモ等の入力
  - **期待結果**: PATCH `/api/dispatches/[id]` で保存、再読込でも保持
  - **関連ファイル**: `DispatchClient.tsx`

- [x] B-08 作業確認書 → 顧客署名取得
  - **手順**: `/dispatch/[id]/confirmation` → 顧客署名欄でサイン → 保存
  - **期待結果**: POST or PATCH `/api/dispatches/[id]/confirmation` 200、`customerSignature` に Vercel Blob URL が保存される（PR #10）
  - **関連ファイル**: `app/api/dispatches/[id]/confirmation/route.ts:69-94`, `components/dispatch/ConfirmationClient.tsx`, `lib/blob/signature-storage.ts`
  - **失敗時**: 詳細はカテゴリ G を参照

- [x] B-09 作業確認書 → ショップ署名取得
  - **手順**: ショップ署名欄でサイン → 保存
  - **期待結果**: `shopSignature` に Blob URL が保存

- [x] B-10 作業確認書 → 事後承認署名取得
  - **手順**: 事後承認欄チェック → 署名 → 保存
  - **期待結果**: `postApprovalCheck=true`, `postApprovalSignature` に Blob URL

- [x] B-11 共有トークン発行 → `/c/[token]` でアクセス
  - **手順**: ConfirmationClient の共有ボタン → QR / URL を表示 → 別タブで `/c/[token]` を開く
  - **期待結果**: 認証不要で confirmation が閲覧できる
  - **関連ファイル**: `components/dispatch/QrShareModal.tsx`, `app/c/[token]/page.tsx`, `app/api/c/[token]/route.ts`, `proxy.ts:9`（`/api/c` はホワイトリスト）

- [x] B-12 公開ページから PDF 生成
  - **手順**: `/c/[token]` の PDF ダウンロードボタン
  - **期待結果**: PDF が DL される、署名画像が PDF 内に表示される
  - **関連ファイル**: `app/api/c/[token]/pdf/route.ts`, `lib/pdf/confirmation-template.tsx:86`
  - **失敗時**: `@react-pdf/renderer` の `<Image src={url}>` がサーバー fetch に失敗 → CSP / Blob ドメイン到達性 / token の正当性

- [x] B-13 報告書（Report）入力
  - **手順**: `/dispatch/[id]/report` → 距離 / 高速料金 / 場所名 / 金額入力 → 保存
  - **期待結果**: PATCH `/api/dispatches/[id]/report` で Report レコード upsert、`isDraft=true`
  - **関連ファイル**: `app/api/dispatches/[id]/report/route.ts`, `components/dispatch/ReportOnsiteClient.tsx` / `ReportTransportClient.tsx`

- [x] B-14 ETC 入力（出動 → 現着）
  - **手順**: 報告書画面で ETC 区間 1（DISPATCH_TO_ARRIVAL）を入力 → 保存
  - **期待結果**: `DispatchEtc` レコードに `phase=DISPATCH_TO_ARRIVAL` で保存
  - **関連ファイル**: `prisma/schema.prisma` `DispatchEtc`, ReportClient（ETC 入力 UI）

- [x] B-15 ETC 入力（帰社時）
  - **手順**: ETC 区間 2（COMPLETION_TO_RETURN）を入力 → 保存
  - **期待結果**: `phase=COMPLETION_TO_RETURN` で保存

- [x] B-16 報告書 完了化
  - **手順**: 報告書「完了」ボタン
  - **期待結果**: `Report.isDraft=false`、status が COMPLETED もしくは関連状態に
  - **関連ファイル**: `app/api/dispatches/[id]/report/complete/route.ts`

- [x] B-17 帰社登録（returnOdo / returnTime）
  - **手順**: 「帰社」ボタン
  - **期待結果**: `returnTime`, `returnOdo` 記録、status=RETURNED
  - **関連ファイル**: `app/dispatch/[id]/record/page.tsx`, `RecordClient.tsx`

#### B-3. TRANSPORT / 二次搬送 / 振替

- [x] B-18 TRANSPORT 1 次：搬送開始 → 搬送完了
  - **手順**: TRANSPORT 種別の出動で「搬送開始」（`transportStartTime`, `transportStartOdo`）→ 「搬送完了」（`completionTime`, `completionOdo`）
  - **期待結果**: 各タイムスタンプ / ODO が記録、status 遷移 TRANSPORTING → COMPLETED
  - **関連ファイル**: `DispatchClient.tsx`

- [x] B-19 二次搬送（SECONDARY）作成
  - **手順**: 1 次搬送完了画面 → 「二次搬送」ボタン → `/dispatch/[id]/secondary`
  - **期待結果**: `parentDispatchId` を持つ子 Dispatch が作成（`isSecondaryTransport=true`）
  - **関連ファイル**: `app/dispatch/[id]/secondary/page.tsx`, `SecondaryDispatchClient.tsx`

- [x] B-20 振替リクエスト発信
  - **手順**: 出動詳細画面 → 「振替」→ 振替先隊員選択 → 送信
  - **期待結果**: `transferStatus=PENDING`, `transferRequestedAt` 記録、相手側に通知（30 秒ポーリング）
  - **関連ファイル**: `app/api/dispatches/[id]/transfer/route.ts`, `DispatchClient.tsx:327-372`

- [x] B-21 振替受諾
  - **手順**: 受信側が「受諾」
  - **期待結果**: 元案件 status=TRANSFERRED、新案件作成、`transferredFromId` / `transferredToId` リンク
  - **関連ファイル**: `app/api/dispatches/[id]/transfer/accept/route.ts`

- [x] B-22 振替キャンセル
  - **手順**: PENDING 中に発信側が「キャンセル」
  - **期待結果**: `transferStatus=CANCELLED`、PENDING 解除
  - **関連ファイル**: `app/api/dispatches/[id]/transfer/cancel/route.ts`

#### B-3.5 種別切替・保管・搬送署名・二次搬送（追加）

- [x] B-25 `/dispatch/new?type=transport` の初期表示
  - **手順**: ?type=transport で `/dispatch/new` に直接アクセス
  - **期待結果**:
    - 背景色 `#C6D8FF`（搬送モード）
    - 「現場 / 搬送」トグルの「搬送」が濃色 `#1C2948` で選択済み
    - 「搬開」ODO 欄、「搬送開始」ボタン、「搬送高速」は描画されるが `step!==2` で全て disabled
    - 「出発」ODO 入力で「出動」ボタンが活性化
  - **関連ファイル**: `app/dispatch/new/page.tsx:31`, `components/dispatch/DispatchClient.tsx:250-252, 875, 1247-1396`
  - **備考**: `?type` 不正値（例: `hoge`）は onsite にフォールバック（`new/page.tsx:31`）

- [x] B-26 出動種別切替 — step=0 でのローカル切替（DB 未作成）
  - **手順**: `/dispatch/new` で「現場 / 搬送」トグルを切替（「出動」ボタン押下前）
  - **期待結果**:
    - DB レコードは作成されない（POST はまだ走らない）
    - クライアント側 `mode` state のみ更新
    - 初回「出動」ボタン押下時に最終 `type` が確定して POST `/api/dispatches`
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx:937-938, 980-981, 463-464`

- [x] B-27 出動種別切替 — step>2 で完了系データを巻き戻し
  - **手順**: 搬送開始（step>2）まで進んだ TRANSPORT 案件で「現場」トグルを押下
  - **期待結果**:
    - `window.confirm`「現着後に戻り、完了時刻・帰社時刻等はリセットされます」が表示
    - 承諾 → `step=2` にリセット、PATCH `/api/dispatches/[id]` で以下が `null` に:
      - `transportStartTime` / `completionTime` / `returnTime`
      - `transportStartOdo` / `completionOdo` / `returnOdo`
      - `workStartTime` / `workEndTime` / `workDuration` / `canDrive` / `deliveryType`
    - 保持される: `dispatchTime` / `arrivalTime` / `arrivalOdo` / `departureOdo` / `DispatchPhoto`
    - サーバー: `originalType` 未設定時のみ初回 `type` を保存（再切替で上書きしない）
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx:940-961, 983-1004`, `app/api/dispatches/[id]/route.ts:170-189`

- [x] B-28 出動種別切替 — TRANSFERRED で API 拒否（自動テストでカバー）
  - **理由**: 振替済み案件はどの画面にも表示されない仕様のため、手動テスト不可能
  - **自動テスト**: `__tests__/api/dispatches-patch.test.ts` の TRANSFERRED ガード describe ブロック
  - **関連ファイル**: `app/api/dispatches/[id]/route.ts:111-116`

- [x] B-29 搬送 step 4 「保管」選択 → STORED 遷移
  - **手順**: TRANSPORT で搬送完了 → step 4「帰社 / 保管」2択 → `returnOdo` 入力 → 「保管」ボタン
  - **期待結果**:
    - PATCH で `status=STORED`, `deliveryType=STORAGE`, `returnTime`, `returnOdo` 記録
    - `step=5` に進み「帰社」ボタンはスキップ
    - 取消（`handleCancelStep('return')`）で `deliveryType:null` に戻る
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx:667-705, 777-779, 1421-1444`

- [x] B-30 搬送 step 4 「帰社」選択 → RETURNED 遷移
  - **手順**: 同 2択画面で `returnOdo` 入力 → 「帰社」ボタン
  - **期待結果**: PATCH で `status=RETURNED`, `returnTime`, `returnOdo` 記録、`step=5`、`deliveryType` は `null` のまま
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx:1421-1444`

- [x] B-31 搬送モードでの 3 種署名取得（onsite と同一 UI）
  - **手順**: TRANSPORT 案件で `/dispatch/[id]/confirmation` を開く → 3 種すべて署名 → 保存
  - **期待結果**:
    - `customerSignature`（作業前/作業完了後ご署名欄）+ `shopSignature`（入庫先ご担当者様記入欄）+ `postApprovalSignature`（作業完了後承認欄）が onsite と完全同一の UI で取得・保存される
    - `ConfirmationClient.tsx` 内に `dispatch.type` 参照はなく、UI / バリデーション分岐なし
    - 二次搬送ページ（`SecondaryDispatchClient`）には作業確認書ボタンが存在せず、二次搬送フロー画面からの導線は無い
  - **関連ファイル**: `components/dispatch/ConfirmationClient.tsx:30, 352, 409, 525-531, 585, 638-644`, `app/api/dispatches/[id]/confirmation/route.ts`
  - **備考**: 二次搬送案件で `/dispatch/[secondaryId]/confirmation` に直接 URL アクセスすれば API レベルでは保存可能。UI からの導線は意図的に無い

- [x] B-32 二次搬送 — 親情報の引継ぎ確認
  - **手順**: TRANSPORT 1 次搬送が `status=STORED` に到達 → ProcessingBar の「二次搬送」から `/dispatch/[parentId]/secondary` → 出動 → 子 `Dispatch` 作成
  - **期待結果**: API（`app/api/dispatches/route.ts:111-152`）で親から自動継承される値:
    - `customerName` / `vehicleName` / `plateRegion` / `plateClass` / `plateKana` / `plateNumber`
    - `situationType` / `situationDetail` / `canDrive`
    - `address` / `isHighway` / `highwayName` / `highwayDirection` / `kiloPost` / `areaIcName`
    - `insuranceCompanyId` / `memo` / `assistanceId`
    - 出動番号サフィックス `-2`（既存子があれば `-3` …）
    - `vehicleId` は **現ユーザー** の `vehicleId`（親値ではない）
    - `isSecondaryTransport=true`, `parentDispatchId`, `type='transport'`
  - **関連ファイル**: `app/api/dispatches/route.ts:111-152, 162`, `components/dispatch/SecondaryDispatchClient.tsx:312-318`

- [x] B-33 二次搬送 完了 → 親 status 同時更新
  - **手順**: 二次搬送で帰社（`handleReturn`）押下
  - **期待結果**: 二次自身が `status=RETURNED`、**同時に** 親 `Dispatch` も `{ status:'RETURNED', isDraft:true }` に更新
  - **関連ファイル**: `components/dispatch/SecondaryDispatchClient.tsx:423-429`

- [x] B-34 二次搬送 取消 → 親 STORED に復元
  - **手順**: 二次搬送で帰社後、`handleCancelStep('return')` 相当（取消ボタン）
  - **期待結果**: 親 `Dispatch` が `{ status:'STORED', isDraft:false }` に戻る
  - **関連ファイル**: `components/dispatch/SecondaryDispatchClient.tsx:514-520`

- [x] B-35 二次搬送 — 親 status ガード
  - **手順**: 親 `status !== 'STORED'` の `Dispatch` で `/dispatch/[parentId]/secondary` に直接 URL アクセス
  - **期待結果**: `/` にリダイレクト
  - **関連ファイル**: `app/dispatch/[id]/secondary/page.tsx:21`

#### B-4. 休憩

- [x] B-23 休憩開始 → 終了
  - **手順**: ホーム or `/break` → 「休憩開始」→ しばらく待つ → 「休憩終了」
  - **期待結果**: `BreakRecord` 作成、`endTime IS NULL` で同時存在判定、終了で `endTime` 設定
  - **関連ファイル**: `app/break/page.tsx`, `app/api/breaks/route.ts`, `app/api/breaks/[id]/end/route.ts`, `components/BreakBar.tsx`, `BreakScreen.tsx`

- [x] B-24 休憩 一時停止 → 再開
  - **手順**: 休憩中に「一時停止」→ 「再開」
  - **期待結果**: `pauseTime`, `resumeTime`, `totalBreakMinutes` が更新
  - **関連ファイル**: `app/api/breaks/[id]/pause/route.ts`, `resume/route.ts`

---

### カテゴリ C: オフライン同期（10 項目）

実装根拠: `lib/offline-db.ts`（idb / IndexedDB スキーマ v1: pendingActions, dispatchDraft, photos, syncMeta）, `lib/offline-fetch.ts`, `lib/sync.ts`, `hooks/useOfflineAction.ts`, `hooks/useOnlineStatus.ts`, `components/OfflineProvider.tsx`, `public/sw.js`（v6）

- [ ] C-01 Service Worker 登録確認
  - **手順**: DevTools → Application → Service Workers
  - **期待結果**: `/sw.js` が `activated and is running`、scope が `/`
  - **関連ファイル**: `components/OfflineProvider.tsx:8-22`

- [ ] C-02 SW キャッシュ名 v6 確認
  - **手順**: DevTools → Application → Cache Storage
  - **期待結果**: `rodo-v6`, `rodo-static-v6`, `rodo-images-v6` のみ存在（v5 以前は削除済み）
  - **関連ファイル**: `public/sw.js:3-5, 25-36`

- [ ] C-03 IndexedDB 構造確認
  - **手順**: DevTools → Application → IndexedDB → `rodo-offline`（version 1）
  - **期待結果**: `pendingActions`, `dispatchDraft`, `photos`, `syncMeta` の 4 オブジェクトストア
  - **関連ファイル**: `lib/offline-db.ts:36-86`

- [ ] C-04 オフラインで dispatch 更新 → IndexedDB にキューイング
  - **手順**: DevTools → Network → Offline → 出動状態を進める（PATCH 系）
  - **期待結果**: `pendingActions` に新規エントリ、UI は楽観的に成功表示、`SyncIndicator` で「未同期 N 件」表示
  - **関連ファイル**: `hooks/useOfflineAction.ts:31-60`, `components/common/SyncIndicator.tsx` [未確認: ファイル本体]

- [ ] C-05 オンライン復帰 → 自動同期
  - **手順**: Network → Online に戻す
  - **期待結果**: `useOnlineStatus.handleRetry` 等で `syncPendingActions` が起動、`pendingActions` が 0 件に、`syncMeta.lastSync` 更新
  - **関連ファイル**: `lib/sync.ts:17-41`, `hooks/useOnlineStatus.ts`

- [ ] C-06 リトライ動作（5xx）
  - **手順**: API を一時的に 5xx で応答させる（手動でサーバー停止 → 復旧）か、500 をモック
  - **期待結果**: `sendWithRetry` が exponential backoff（1s, 2s, 4s）で最大 3 回再試行、最終失敗で IndexedDB に残る
  - **関連ファイル**: `lib/sync.ts:46-75`

- [ ] C-07 4xx は再試行しない
  - **手順**: 不正な data で API が 400 を返す状態を作る
  - **期待結果**: `sendWithRetry` が即座に false、`pendingActions` から削除されない（手動リカバリ要）
  - **関連ファイル**: `lib/sync.ts:60-64`

- [ ] C-08 Service Worker のオフラインフォールバック（コミット eb0cce8 修正点）
  - **手順**: DevTools → Network → Offline → 静的アセット（例: `/some-page-not-cached`）にナビゲート
  - **期待結果**: `networkFirst` の catch 経路で `caches.match('/')` が **await されて** Response を返す。await されていない旧バグなら Promise オブジェクトが truthy 判定されて TypeError になる
  - **関連ファイル**: `public/sw.js:118-133`
  - **失敗時**: SW タブで Update on reload を有効化、Skip waiting を実行して v6 が反映されているか確認

- [ ] C-09 オフライン時の写真保存
  - **手順**: オフラインで写真撮影 → 保存
  - **期待結果**: `photos` ストアに blob として保存、復帰時にアップロード
  - **関連ファイル**: `lib/offline-db.ts:131-151`, `lib/sync.ts:77-`（写真アップロード処理）

- [ ] C-10 dispatchDraft（途中保存）
  - **手順**: 出動フォームで一部入力 → ページを離れる → 戻る
  - **期待結果**: `dispatchDraft` から復元される
  - **関連ファイル**: `lib/offline-db.ts:114-127`

---

### カテゴリ D: 管理者ダッシュボード（20 項目）

実装根拠: `app/admin/**/page.tsx`, `components/admin/*.tsx`（14 ファイル）, `app/api/admin/**`, `lib/admin/*.ts`, `docs/handover/2026-04-28-super-agent.md`（Phase 1〜3.5 実装済み + Phase 4 まで進行）

#### D-1. レイアウト・ナビ（Phase 2 / 2.5）

- [x] D-01 PC 幅 → 上部水平ナビ表示
  - **手順**: 1280px 以上の幅で `/admin/dashboard`
  - **期待結果**: AppHeader 内に「ホーム / ダッシュボード / 案件管理 / 設定 / ログアウト」が水平表示
  - **関連ファイル**: `components/admin/AdminLayoutShell.tsx`, `AdminMenu.tsx`（orientation prop）, `components/common/AppHeader.tsx`

- [x] D-02 SP 幅 → 右ドロワー
  - **手順**: 375px 幅で `/admin/dashboard` → ハンバーガー
  - **期待結果**: `AdminShell` が右からスライドイン、menu.svg ロゴ表示
  - **関連ファイル**: `AdminShell.tsx`, `public/menu.svg`

- [x] D-03 フッター表示
  - **手順**: ページ下部までスクロール
  - **期待結果**: AppFooter が表示
  - **関連ファイル**: `AdminLayoutShell.tsx`

#### D-2. ダッシュボード（Phase 3 / 3.5）

- [x] D-04 隊員ステータス一覧表示
  - **手順**: `/admin/dashboard`
  - **期待結果**: MemberStatusGrid に各隊員のカードが表示され、業務6ステータス（待機中 / 出動中 / 作業中 / 搬送中 / 帰社中 / 休憩中）がピル型バッジ（色+アイコン）で表示される
  - **関連ファイル**: `components/admin/MemberStatusGrid.tsx`, `MemberStatusCard.tsx`, `components/admin/MemberStatusBadge.tsx`, `lib/admin/status-derivation.ts`, `lib/admin/business-status.ts`, `app/api/admin/members-status/route.ts`

- [x] D-05 隊員ステータス 10 秒ポーリング
  - **手順**: DevTools → Network で `/api/admin/members-status` の周期確認
  - **期待結果**: 約 10 秒間隔で再取得（ReactQuery 設定）
  - **関連ファイル**: `hooks/useMembersStatus.ts`, `AdminQueryProvider.tsx`

- [x] D-06 業務6ステータスバッジ（色+アイコン）表示確認
  - **手順**: status と subPhase を組み合わせ、6 ステータス各々の隊員を用意して `/admin/dashboard` を表示
  - **期待結果**: 各カードが以下の色+アイコンのピル型バッジで表示される

    | ステータス | 表示色 | アイコン |
    |---|---|---|
    | standby（待機中） | `#2FBF71` | `stand-by.svg` |
    | dispatch（出動中） | `#D3170A` | `dispatch.svg` |
    | work（作業中） | `#ea7600` | `work.svg` |
    | transport（搬送中） | `#71A9F7` | `transportation-start.svg` |
    | return（帰社中） | `#1c2948` | `return-truck.svg` |
    | break（休憩中） | `#888888` | `FaCoffee` |

  - **関連ファイル**: `components/admin/MemberStatusBadge.tsx`, `MemberStatusCard.tsx`, `lib/admin/business-status.ts`
  - **既知**: Seed に DISPATCHING 系（特に subPhase=ONSITE/TRANSPORTING/RETURNING_TO_BASE）の案件がないため、dispatch/work/transport/return の 4 状態は実データ投入後検証

- [x] D-07 当日案件サマリ
  - **手順**: TodayDispatchSummary の数字
  - **期待結果**: 当日（業務日: `businessDayStartMinutes` 基準）の出動件数 / 完了件数等が表示
  - **関連ファイル**: `TodayDispatchSummary.tsx`, `lib/admin/business-day.ts`

- [ ] D-08 持ち越し案件リスト（Overdue）
  - **手順**: 前日以前の未完了案件を作って `/admin/dashboard`
  - **期待結果**: OverdueDispatchList に表示
  - **関連ファイル**: `OverdueDispatchList.tsx`

- [ ] D-09 保管車両リスト（StoredVehicleList）
  - **手順**: status=STORED の Dispatch を作って表示
  - **期待結果**: 5 状態分類（today / tomorrow / future / undecided / past）でグルーピング表示
  - **関連ファイル**: `StoredVehicleList.tsx`, `lib/admin/scheduled-secondary-sort.ts`

- [ ] D-10 二次搬送予定日 編集
  - **手順**: 保管車両の編集アイコン → ScheduledSecondaryEditor → 日時設定 → 保存
  - **期待結果**: `Dispatch.scheduledSecondaryAt` が更新（送信時 +09:00 付与で UTC 化）、再読込でも JST 表示が一致
  - **関連ファイル**: `ScheduledSecondaryEditor.tsx`, `app/api/admin/dispatches/[id]/route.ts`, `lib/validations/schemas/dispatch.ts` `adminUpdateDispatchSchema`

#### D-3. 案件管理（Phase 4）

- [ ] D-11 `/admin/dispatches` テーブル表示
  - **手順**: 「案件管理」タブ
  - **期待結果**: DispatchTable に案件リスト、ページング動作
  - **関連ファイル**: `app/admin/dispatches/page.tsx`, `DispatchTable.tsx`

- [ ] D-12 フィルタ動作
  - **手順**: status / 担当隊員 / アシスタンス / 期間で絞り込み
  - **期待結果**: `/api/admin/dispatches?...` のクエリパラメータが反映、結果が絞り込まれる
  - **関連ファイル**: `DispatchTableFilters.tsx`, `app/api/admin/dispatches/route.ts`

- [ ] D-13 カレンダータブ表示（新仕様: 出動番号 + 車番）
  - **手順**: テーブル / カレンダー切替 → カレンダー
  - **期待結果**: 各日セルに `primaryDispatches` の出動番号 + 車番が表示
  - **関連ファイル**: `DispatchCalendar.tsx`, `app/api/admin/calendar/route.ts`（Phase 4 で Response 仕様変更）

- [ ] D-14 カレンダー 月送り
  - **手順**: 前月 / 翌月ボタン
  - **期待結果**: 月別 fetch、URL クエリ更新

- [ ] D-15 案件編集画面
  - **手順**: `/admin/dispatches/[id]` → DispatchEditForm
  - **期待結果**: 既存値が JST datetime-local 形式で表示、編集 → 保存で PATCH `/api/admin/dispatches/[id]` 200
  - **関連ファイル**: `app/admin/dispatches/[id]/page.tsx`, `DispatchEditForm.tsx`
  - **失敗時**: ODO 範囲（0〜9_999_999 整数）、`adminUpdateDispatchSchema` のフィールド許可リスト確認

- [ ] D-16 案件編集 → scheduledSecondaryAt
  - **手順**: フォーム内の二次搬送予定日 datetime-local を変更 → 保存
  - **期待結果**: 200、DB に UTC で保存、再表示で JST 一致
  - **関連ファイル**: `DispatchEditForm.tsx`

- [ ] D-17 請求済みマーキング
  - **手順**: 案件詳細から「請求済み」ボタン
  - **期待結果**: `Dispatch.billedAt` に現在時刻、再表示で「請求済み」表示
  - **関連ファイル**: `app/api/admin/dispatches/[id]/billing/route.ts`, `lib/validations/schemas/billing.ts`

#### D-4. 設定（既存）

- [ ] D-18 `/settings` 2 ペインレイアウト（PC）
  - **手順**: `/settings`（ADMIN）
  - **期待結果**: 左に項目 / 右に詳細の 2 ペイン構成
  - **関連ファイル**: `components/SettingsClient.tsx`

- [ ] D-19 隊員管理（並べ替え）
  - **手順**: 隊員一覧を D&D で並べ替え
  - **期待結果**: `User.sortOrder` が更新、再読込でも維持
  - **関連ファイル**: `app/api/users/reorder/route.ts`, `app/api/users/route.ts`

- [ ] D-20 車両マスタ管理
  - **手順**: 車両追加 / 編集 / 並べ替え
  - **期待結果**: `Vehicle` レコード CRUD 成功
  - **関連ファイル**: `app/api/settings/vehicles/**`, `prisma/schema.prisma` `Vehicle`

---

### カテゴリ E: PWA 機能（7 項目）

実装根拠: `public/manifest.json`（standalone, theme #1C2948, background #C6D8FF）, `public/icon-192.png`, `public/icon-512.png`, `public/sw.js`, `components/OfflineProvider.tsx`

- [ ] E-01 manifest.json 取得
  - **手順**: `/manifest.json` を直接アクセス
  - **期待結果**: 正しい JSON、`name=RODO`, `display=standalone`
  - **関連ファイル**: `public/manifest.json`

- [ ] E-02 manifest 参照確認
  - **手順**: DevTools → Application → Manifest
  - **期待結果**: 認識される、エラーなし、Identity / Presentation / Icons セクション表示
  - **失敗時**: `<link rel="manifest">` が `app/layout.tsx` に書かれているか確認 [未確認: layout.tsx の manifest link]

- [ ] E-03 アイコン表示
  - **手順**: Manifest セクションのアイコンプレビュー
  - **期待結果**: 192x192 / 512x512 ともに表示、Maskable 設定がない場合は purpose 警告のみ

- [ ] E-04 インストール可否（Chrome）
  - **手順**: アドレスバー右の「インストール」アイコン
  - **期待結果**: クリックでインストールダイアログ
  - **失敗時**: SW 登録失敗 / manifest 不備 / start_url 到達失敗のいずれか

- [ ] E-05 スタンドアロン起動
  - **手順**: インストール後、デスクトップ / ホーム画面のアイコン
  - **期待結果**: ブラウザ UI なしで起動、theme_color が反映

- [ ] E-06 SW プリキャッシュ
  - **手順**: install 直後の Cache Storage `rodo-static-v6`
  - **期待結果**: `/manifest.json`, `/rodo-logo.svg`, `/rodo-login-logo.svg`, `/rodo-square-logo.svg` が含まれる（`/` は除外、動的ページのため）
  - **関連ファイル**: `public/sw.js:9-22`

- [ ] E-07 外部ドメインは SW 介入なし
  - **手順**: コンソールで `fetch('https://accounts.google.com/...')` 等
  - **期待結果**: SW がスキップ（CSP 競合 / キャッシュ汚染防止）
  - **関連ファイル**: `public/sw.js:46-47`

---

### カテゴリ F: マイグレーション（8 項目）

実装根拠: `prisma/migrations/0_init/`（ベースライン）, `prisma/migrations/add_billed_at_to_dispatch/`, `20260428053624_add_scheduled_secondary_at_to_dispatch`, `20260429043511_change_signature_to_blob_url/`（PR #10）, `scripts/migrate-signatures-to-blob.ts`（PR #10）, `docs/MIGRATION.md`, `docs/handover/p0-13-rollback-sql.md`

- [ ] F-01 `prisma migrate dev` 完走（クリーン DB）
  - **手順**: 空の DB で `npx prisma migrate dev`
  - **期待結果**: 全 migration が PASS、`prisma generate` が走る
  - **関連ファイル**: `prisma/migrations/`

- [ ] F-02 既存データありで migration を当てる（base64 が短い場合）
  - **手順**: 旧 schema で seed して短い base64 を入れた状態で PR #10 ブランチに切替 → `prisma migrate deploy`（dev 不可、データ消える可能性のためコピー DB で実施）
  - **期待結果**: ALTER COLUMN `VARCHAR(2048)` が成功
  - **関連ファイル**: `prisma/migrations/20260429043511_change_signature_to_blob_url/migration.sql`

- [ ] F-03 既存データ 2048 文字超で migration が失敗することの確認
  - **手順**: 1 レコードに 90KB 相当の DataURL を入れた状態で migration 適用試行
  - **期待結果**: `value too long for type character varying(2048)` 等で migration 失敗 → `migrate-signatures-to-blob.ts --apply` の事前実行が必須であることが分かる
  - **関連ファイル**: `migration.sql` 冒頭コメント、`docs/plans/p0-13-signature-blob-migration.md` 7.3 節

- [ ] F-04 `migrate-signatures-to-blob.ts` dry-run
  - **手順**: `npx tsx scripts/migrate-signatures-to-blob.ts`（または `pnpm tsx ...`）
  - **期待結果**: `mode=DRY-RUN`, 対象件数表示、書き換えなし、終了コード 0
  - **関連ファイル**: `scripts/migrate-signatures-to-blob.ts:1908-1939`

- [ ] F-05 `migrate-signatures-to-blob.ts` --apply
  - **手順**: 短い base64 DataURL を 1 件入れた状態で `--apply` 実行
  - **期待結果**: `@vercel/blob.put` が呼ばれて `signatures/{tenantId}/{dispatchId}/{type}-{timestamp}.png` に保存、DB 値が `https://...vercel-storage.com/...` に更新、`success=1 error=0`
  - **関連ファイル**: `lib/blob/signature-storage.ts:1556-1631`
  - **失敗時**: `BLOB_READ_WRITE_TOKEN` 未設定なら 401 → `.env.local` 確認

- [ ] F-06 NODE_ENV=production の保護
  - **手順**: `NODE_ENV=production npx tsx scripts/migrate-signatures-to-blob.ts`（環境変数 `MIGRATE_SIG_CONFIRM` なし）
  - **期待結果**: 拒否されて exit 1
  - **関連ファイル**: `scripts/migrate-signatures-to-blob.ts:1911-1916`

- [ ] F-07 既存 `0_init` ベースライン migration の確認
  - **手順**: `npx prisma migrate status`
  - **期待結果**: `0_init` を含む全 migration が `Applied`
  - **関連ファイル**: `docs/MIGRATION.md`（本番反映時は `npx prisma migrate resolve --applied 0_init` 先行）

- [ ] F-08 ロールバック SQL 文書の存在確認
  - **手順**: `docs/handover/p0-13-rollback-sql.md` の存在確認、SQL の構文を `psql` で dry-run（`BEGIN; ... ROLLBACK;`）
  - **期待結果**: ALTER COLUMN TYPE TEXT が構文エラーなく通る
  - **関連ファイル**: `docs/handover/p0-13-rollback-sql.md`

---

### カテゴリ G: 署名画像 Blob 化（PR #10 検証）（15 項目）

実装根拠: `lib/blob/signature-storage.ts`, `app/api/dispatches/[id]/confirmation/route.ts:69-94, 147-170`, `components/dispatch/ConfirmationClient.tsx:142-189`（SignaturePad 拡張）, `components/confirmation/ConfirmationView.tsx:111-118`, `lib/pdf/confirmation-template.tsx:86`, `lib/validations/helpers.ts:38-67`（signatureValue）, `next.config.ts`（CSP）

- [ ] G-01 BLOB_READ_WRITE_TOKEN 設定確認
  - **手順**: `.env.local` を確認 / `process.env.BLOB_READ_WRITE_TOKEN` をサーバーログで確認
  - **期待結果**: `vercel_blob_rw_...` が設定されている
  - **関連ファイル**: `.env.example`

- [ ] G-02 新規署名 → Blob URL に変換されて DB 保存
  - **手順**: 顧客署名を新規取得 → 保存 → DB `WorkConfirmation.customerSignature` を直接確認
  - **期待結果**: `https://*.public.blob.vercel-storage.com/signatures/{tenantId}/{dispatchId}/customer-{timestamp}.png` 形式で保存
  - **関連ファイル**: `lib/blob/signature-storage.ts:1556-1631`

- [ ] G-03 同じ署名を 2 回保存（更新パス）
  - **手順**: 既に保存済みの confirmation で再度署名し直す → 保存
  - **期待結果**: 古い Blob は残存（クリーンアップは P0-14 以降のスコープ）、新 Blob URL に上書き
  - **失敗時**: 旧 URL を再送信した場合は `value.startsWith('https://')` 経路でそのまま維持（`signature-storage.ts:1581-1583`）

- [ ] G-04 既存 base64 データの表示（移行前データ）
  - **手順**: DataURL のまま DB に残っているレコードを `/c/[token]` または confirmation 画面で表示
  - **期待結果**: `<img src="data:image/png;base64,...">` で正常表示
  - **関連ファイル**: `components/confirmation/ConfirmationView.tsx:111-118`

- [ ] G-05 既存 base64 を含む confirmation の編集（読み込み時の互換）
  - **手順**: DataURL レコードのまま `/dispatch/[id]/confirmation` を開く
  - **期待結果**: `SignaturePad` が `initialData.startsWith('data:')` 経路で同期ロード、再表示成功
  - **関連ファイル**: `components/dispatch/ConfirmationClient.tsx:802-811`

- [ ] G-06 HTTPS URL からの編集ロード
  - **手順**: Blob URL レコードで confirmation を開く
  - **期待結果**: `fetch(initialData)` → `Blob` → `FileReader.readAsDataURL` → `fromDataURL` の async チェーンで読み込み成功
  - **関連ファイル**: `components/dispatch/ConfirmationClient.tsx:813-841`
  - **失敗時**: CSP 違反 / CORS / Blob URL 失効 → DevTools コンソール

- [ ] G-07 CSP 違反が出ないこと
  - **手順**: 署名表示ページで DevTools コンソール
  - **期待結果**: `Content Security Policy` の violation がないこと（`img-src 'self' data: blob: https://*.public.blob.vercel-storage.com`）
  - **関連ファイル**: `next.config.ts:24`（connect-src）, `next.config.ts:28`（img-src）

- [ ] G-08 PNG マジックバイト検証（不正データ）
  - **手順**: `curl -X POST .../confirmation` で `customerSignature` に `data:image/png;base64,AAAA...`（PNG ヘッダなし）を送信
  - **期待結果**: 400, body に `Signature payload is not a valid PNG`
  - **関連ファイル**: `lib/blob/signature-storage.ts:1533-1541, 1617-1621`

- [ ] G-09 base64 長さ上限（120000 文字）超過 → 400
  - **手順**: 120001 文字の base64 DataURL を送信
  - **期待結果**: 400, body に `Signature too large: ... exceeds limit 120000`
  - **関連ファイル**: `lib/blob/signature-storage.ts:1524, 1600-1604`

- [ ] G-10 base64 空文字 → 400
  - **手順**: `data:image/png;base64,`（base64 部分なし）を送信
  - **期待結果**: 400, body に `base64 payload is empty`
  - **関連ファイル**: `lib/blob/signature-storage.ts:1595-1599`

- [ ] G-11 不正 prefix → 400（zod レベルで弾かれる）
  - **手順**: `data:image/jpeg;base64,...` を送信
  - **期待結果**: 400, zod の `signatureValue` で `Signature DataURL must be PNG base64`
  - **関連ファイル**: `lib/validations/helpers.ts:1738-1742`

- [ ] G-12 VARCHAR(2048) 上限超過の URL 送信
  - **手順**: 2049 文字以上の HTTPS URL を `customerSignature` に直接 PATCH（API レベル）
  - **期待結果**: zod `signatureValue` の `.max(2048)` で 400
  - **関連ファイル**: `lib/validations/helpers.ts:1744`

- [ ] G-13 PDF 生成で Blob URL 画像が描画される
  - **手順**: B-12 と同じ手順で PDF 生成、PDF を開く
  - **期待結果**: 顧客署名 / ショップ署名 / 事後承認署名の 3 画像が PDF に表示
  - **関連ファイル**: `lib/pdf/confirmation-template.tsx:86`（`<Image src={url}>` がサーバー fetch）
  - **既知**: P0-14 で Blob private 化されると失敗する（対応案 A/B が必要）。本検証時点では `access:'public'` のため動作する想定

- [ ] G-14 シェアトークン公開ページの署名表示
  - **手順**: `/c/[token]` で署名画像 3 種を確認
  - **期待結果**: いずれも表示される（DataURL / Blob URL の両対応）
  - **関連ファイル**: `components/confirmation/ConfirmationView.tsx`

- [ ] G-15 vitest テストの全通過確認
  - **手順**: `npm run test`
  - **期待結果**: 全件 PASS（PR #10 で `__tests__/api/confirmation-signature-upload.test.ts` と `__tests__/lib/blob/signature-storage.test.ts` が追加。既存の base64 サンプル文字列も Blob URL に差し替え済み）
  - **関連ファイル**: PR #10 の `__tests__/**` 変更ファイル

---

### カテゴリ H: パフォーマンス・基本動作（8 項目）

- [ ] H-01 `npm run build` 成功
  - **手順**: `npm run build`
  - **期待結果**: エラー / 重大警告なし、`.next/` 生成
  - **失敗時**: `lightningcss.darwin-x64.node` 不在 → `npm rebuild lightningcss`
  - **既知**: PR #10 PR 本文に「`next build` 成功」「lint は本プロジェクト未導入」と記載

- [ ] H-02 `/admin/dashboard` 初回ロード < 3s（dev mode）
  - **手順**: DevTools → Network → ハードリロード → DOMContentLoaded
  - **期待結果**: 3 秒以内に主要コンテンツ表示（dev mode 基準。本番ビルドでは更に短い想定）

- [ ] H-03 主要 API レスポンス < 500ms（ローカル）
  - **手順**: Network タブで `/api/admin/members-status`, `/api/admin/dispatches`, `/api/admin/calendar` の Time
  - **期待結果**: いずれも 500ms 以下

- [ ] H-04 コンソールエラー / 警告なし
  - **手順**: 主要 7 ページ（`/login`, `/`, `/dispatch/new`, `/dispatch/[id]`, `/dispatch/[id]/confirmation`, `/admin/dashboard`, `/admin/dispatches`）を順に開く
  - **期待結果**: コンソールに React / Next / TypeError / 401 / CSP / Hydration mismatch のエラーが出ない

- [ ] H-05 hydration mismatch なし
  - **手順**: H-04 と同じ
  - **期待結果**: `Hydration failed because...` 系エラーがない

- [ ] H-06 next/image 警告
  - **手順**: H-04 と同じ
  - **期待結果**: 署名画像は意図的に `<img>` 直書き（PR #10 コメント）。`@next/next/no-img-element` の警告は既知抑制で OK

- [ ] H-07 vitest 全グリーン
  - **手順**: `npm run test`
  - **期待結果**: 全件 PASS（PR #10 マージ前時点で 700+ ケース想定）

- [ ] H-08 TypeScript 型チェック
  - **手順**: `npx tsc --noEmit`
  - **期待結果**: 型エラーなし
  - **失敗時**: PR #10 の `convertConfirmationSignatures<T extends ConfirmationSignatures>` のジェネリクス推論まわりで失敗が出るかをまず確認

---

### カテゴリ I: dispatch floating prevention（Phase 1-7 検証 + reviewer 派生）（32 項目）

実装根拠: `docs/plans/dispatch-floating-prevention.md` §7 / Phase 5.5 補強（コミット `9259cb6`）/ Phase 7 改訂スコープ（コミット `fe73de7`）

前提:
- テストデータ: `Dispatch.id=cmoqlpabf00038z5z6esgn94v`, `dispatchNumber=20260504001`, `status=DISPATCHED`
- 計画書: `docs/plans/dispatch-floating-prevention.md`
- 引き継ぎノート: `docs/handover/2026-05-04-dispatch-floating-prevention.md`

#### I-1. 戻るボタンブロック（8 項目）

転記元: 計画書 §7.1 (L812-821)

- [ ] I-1.1 DispatchClient: 出動押下後の戻るボタンブロック
  - **手順**: 出動押下 → 画面ヘッダーまたは UI の戻るボタンを押下
  - **期待結果**: 「進行中の出動があります」モーダルが表示され、ホームに戻れない
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`

- [ ] I-1.2 DispatchClient: 現着押下後の戻るボタンブロック
  - **手順**: 現着押下 → 戻るボタン
  - **期待結果**: モーダル表示、ホームに戻れない
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`

- [ ] I-1.3 DispatchClient: 搬送開始押下後の戻るボタンブロック
  - **手順**: 搬送開始押下 → 戻るボタン
  - **期待結果**: モーダル表示、ホームに戻れない
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`

- [ ] I-1.4 DispatchClient: 完了（onsite）押下後の戻るボタンブロック
  - **手順**: onsite 完了押下 → 戻るボタン
  - **期待結果**: モーダル表示、ホームに戻れない
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`

- [ ] I-1.5 SecondaryDispatchClient: 各 step での戻るボタンブロック
  - **手順**: 2 次搬送の各 step（出動 / 現着 / 搬送開始 / 帰社）で戻るボタン
  - **期待結果**: 全 step でモーダル表示、ホームに戻れない
  - **関連ファイル**: `components/dispatch/SecondaryDispatchClient.tsx`

- [ ] I-1.6 ReportOnsiteClient: 報告作成中（dispatch active）に戻るボタン
  - **手順**: 報告画面（onsite）で入力中に画面下部の戻るボタン
  - **期待結果**: モーダル表示、ホームに戻れない（ヘッダーのホームボタンは I-8.1 で別検証）
  - **関連ファイル**: `components/dispatch/ReportOnsiteClient.tsx`

- [ ] I-1.7 ReportTransportClient: 報告作成中に戻るボタン
  - **手順**: 報告画面（transport）で入力中に画面下部の戻るボタン
  - **期待結果**: モーダル表示、ホームに戻れない（ヘッダーのホームボタンは I-8.2 で別検証）
  - **関連ファイル**: `components/dispatch/ReportTransportClient.tsx`

- [ ] I-1.8 RecordClient: 既存モーダル + 進行中ガードの統合動作
  - **手順**: 出動記録画面で入力中に戻るボタン
  - **期待結果**: 既存の下書きモーダル（「保存して戻る」「保存せず戻る」）と進行中ガードが両立し、誤遷移しない
  - **関連ファイル**: `components/dispatch/RecordClient.tsx`

#### I-2. ブラウザバック・履歴 API（4 項目）

転記元: 計画書 §7.2 (L823-828)

- [ ] I-2.1 Android Chrome: 出動中にスワイプバック
  - **手順**: 出動中の画面で Android Chrome のスワイプバックジェスチャ
  - **期待結果**: ブロックされる（戻るボタンと同じモーダル）
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`（`popstate` / `beforeunload`）

- [ ] I-2.2 Desktop Chrome: 出動中にブラウザ戻るボタン
  - **手順**: 出動中に Chrome の戻るボタン押下
  - **期待結果**: ブロックされる
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`

- [ ] I-2.3 [未確認] iOS Safari: 出動中にスワイプバック
  - **手順**: iOS Safari でスワイプバック
  - **期待結果**: ブロックされる
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`
  - **既知**: iOS Safari の history API 制約あり（計画書 §7.2 11 番）

- [ ] I-2.4 Desktop Chrome: 出動中にタブ閉じ
  - **手順**: 出動中にタブの × ボタン
  - **期待結果**: `beforeunload` 警告ダイアログが表示される
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`

#### I-3. 案件キャンセル（4 項目）

転記元: 計画書 §7.3 (L830-835)

- [ ] I-3.1 DispatchClient: 出動押下 → キャンセル → ホーム遷移
  - **手順**: 出動押下 → キャンセルボタン押下 → 確認モーダルで OK
  - **期待結果**: `status=CANCELLED` に更新、ホーム遷移、進行中バナー消える
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`, `app/api/dispatches/[id]/cancel/route.ts`

- [ ] I-3.2 5 画面それぞれでキャンセル動作
  - **手順**: DispatchClient の各 step（出動 / 現着 / 搬送開始 / 完了 / 振替）でキャンセル
  - **期待結果**: いずれも `CANCELLED` に更新、ホーム遷移
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx`

- [ ] I-3.3 隊員ロールの他人案件: cancel API 直接呼び出しで 403/404
  - **手順**: 隊員アカウントから他人の `dispatchId` に対し cancel API を直接 POST
  - **期待結果**: 403 または 404
  - **関連ファイル**: `app/api/dispatches/[id]/cancel/route.ts`

- [ ] I-3.4 管理者ロール: 他人案件もキャンセル可能
  - **手順**: 管理者アカウントから他人の `dispatchId` にキャンセル
  - **期待結果**: 200, `status=CANCELLED`
  - **関連ファイル**: `app/api/dispatches/[id]/cancel/route.ts`

#### I-4. 再ログイン時の復帰（3 項目）

転記元: 計画書 §7.4 (L837-841)

- [ ] I-4.1 別タブでログアウト → 再ログイン → 進行中バナー
  - **手順**: 出動中に別タブで `/api/auth/signout` → 同タブで再ログイン → ホーム画面
  - **期待結果**: ホームに進行中バナー表示、クリックで出動画面に復帰
  - **関連ファイル**: `app/page.tsx`, ホーム画面の進行中バナー描画箇所

- [ ] I-4.2 別端末でログイン → 進行中バナー
  - **手順**: PC A で出動中、PC B で同アカウントログイン
  - **期待結果**: PC B でも進行中バナー表示、出動画面復帰可能
  - **関連ファイル**: `app/page.tsx`

- [ ] I-4.3 [未確認] オフライン時のバナー挙動
  - **手順**: オフラインで再ログイン
  - **期待結果**: 進行中バナーが表示される（SW キャッシュ経由）
  - **既知**: 計画書 §6.5 実装次第。要追加調査

#### I-5. 採番の堅牢性（2 項目）

転記元: 計画書 §7.5 (L843-846)

- [ ] I-5.1 同日内 001 / 002 作成 → 002 キャンセル → 003 作成
  - **手順**: 同日内に 2 件作成、2 件目をキャンセル、3 件目を新規作成
  - **期待結果**: 003 番号で衝突せず作成（最大値 + 1 方式の新採番）
  - **関連ファイル**: 採番ロジック（`lib/dispatch/` 配下、`Dispatch.dispatchNumber` 生成箇所）

- [ ] I-5.2 同日内 001 作成 → キャンセル → 002 作成
  - **手順**: 1 件作成 → キャンセル → 2 件目作成
  - **期待結果**: ユニーク制約違反なし、002 で作成成功
  - **関連ファイル**: 同上

#### I-6. 多重出動防止（3 項目）

転記元: 計画書 §7.6 (L848-852)

- [ ] I-6.1 ホーム画面で active バナー表示中: アシスタンスボタングレーアウト
  - **手順**: 出動中状態で別タブからホームを開く
  - **期待結果**: アシスタンスボタンが押下不可（disabled / グレー表示）
  - **関連ファイル**: `app/page.tsx`, ホーム画面のアシスタンスボタン

- [ ] I-6.2 休憩ボタン非表示確認
  - **手順**: active バナー表示中のホーム画面
  - **期待結果**: 休憩ボタンが非表示
  - **関連ファイル**: `app/page.tsx`

- [ ] I-6.3 [未確認] URL 直打ち `/dispatch?assistanceId=...` の動作
  - **手順**: active バナー表示中に URL 直打ちで `/dispatch?assistanceId=...` へ遷移
  - **期待結果**: 多重出動防止が効く（404 / リダイレクト）
  - **既知**: 計画書 §6.7 実装次第。サーバ側 409 ガードは別タスク（残課題 #6）

#### I-7. 既存機能の非破壊確認（3 項目）

転記元: 計画書 §7.7 (L854-858)

- [ ] I-7.1 振替完了後の自動遷移
  - **手順**: 振替フローを実行し、転送先からの完了通知をシミュレート
  - **期待結果**: 振替完了後 3 秒で自動的にホームへ遷移
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx` L368-393（振替ポーリング）
  - **関連検証**: I-8.4 の cleanup と同時に確認すること

- [ ] I-7.2 報告兼請求項目の保存後遷移
  - **手順**: 報告画面で全項目入力 → 保存ボタン押下
  - **期待結果**: 保存後にホーム or 次画面へ正常遷移
  - **関連ファイル**: `components/dispatch/ReportOnsiteClient.tsx`, `components/dispatch/ReportTransportClient.tsx`

- [ ] I-7.3 RecordClient の下書きモーダル「保存して戻る」「保存せず戻る」
  - **手順**: 出動記録で入力中に戻るボタン → モーダルで両ボタン動作確認
  - **期待結果**: 「保存して戻る」で下書き保存 + ホーム、「保存せず戻る」でそのままホーム
  - **関連ファイル**: `components/dispatch/RecordClient.tsx`

#### I-8. Phase 7 改訂スコープ追加検証（4 項目）

実装根拠: コミット `fe73de7`（Phase 7 改訂スコープ A + C）

- [ ] I-8.1 [C-1] ReportOnsiteClient ヘッダーホームボタン: auto-save + 入力値保持
  - **手順**: 報告画面（onsite）で部分入力 → ヘッダーのホーム（家アイコン）ボタン押下
  - **期待結果**: `handleSave(true)` が走り、下書き保存後にホーム遷移。再度開くと入力値が復元される
  - **関連ファイル**: `components/dispatch/ReportOnsiteClient.tsx` L408-417（`onClick` を `router.push('/')` から `() => { void handleSave(true) }` に変更）
  - **失敗時**: 旧実装（`router.push('/')` 直接呼び）に戻ると入力値が失われる
  - **既知**: `disabled={loading}` により保存中の二重押下は防止される

- [ ] I-8.2 [C-2] ReportTransportClient ヘッダーホームボタン: auto-save + 入力値保持
  - **手順**: 報告画面（transport）で部分入力 → ヘッダーのホームボタン押下
  - **期待結果**: `handleSave(true)` が走り、下書き保存後にホーム遷移。再表示で入力値復元
  - **関連ファイル**: `components/dispatch/ReportTransportClient.tsx` L571-580
  - **失敗時**: 入力値喪失（旧実装の挙動）

- [ ] I-8.3 [A-2] 保存後 `dispatch.isDraft=true` 維持（assert 誤発火なし）
  - **手順**: 報告（onsite / transport）および記録（record）の各画面で正常保存を実行
  - **期待結果**: `dispatch.isDraft=true` のまま維持され、assert（`console.error` / `alert`）が一切発火しない
  - **関連ファイル**:
    - `components/dispatch/ReportOnsiteClient.tsx` L334-356
    - `components/dispatch/ReportTransportClient.tsx` L498-520
    - `components/dispatch/RecordClient.tsx` L365-387
  - **失敗時**: `alert('保存後の状態が想定外です。ホームに戻れません。サポートに連絡してください。')` が表示された場合、PATCH 経路で `isDraft=false` に書き換わっているバグ。`isDraft` を更新している箇所を grep で全件洗い出すこと
  - **既知**: SW 楽観的レスポンス（`X-SW-Offline: 1` ヘッダ）時は assert を skip する設計。`dispatch.isDraft` の更新責任は DispatchClient L953（出動記録ボタン）と SecondaryDispatchClient L454（2 次搬送帰社）に集約済み（コミット `9259cb6`）

- [ ] I-8.4 [A-1] 振替完了ポーリング cleanup（アンマウント時の `router.push` 抑止）
  - **手順**: 振替フローで `transferPending=true` の状態を作る → 別ページに遷移して DispatchClient をアンマウント → 以後 30 秒以上待つ
  - **期待結果**: アンマウント後に `router.push('/')` が走らない（cleanup で `clearTimeout`）
  - **関連ファイル**: `components/dispatch/DispatchClient.tsx` L368-393
  - **失敗時**: コンソールに React の「router.push called after unmount」警告、または意図しないホーム遷移
  - **既知**: 関連テスト `__tests__/components/dispatch/DispatchClient.transfer-cleanup.test.tsx` で自動検証済み

#### I-9. PR #10 reviewer 派生: TRANSFERRED 状態ガード挙動（1 項目）

実装根拠: コミット `e44d81c`（Phase 3）/ PR #10 reviewer レビュー観点 E

- [ ] I-9.1 [E.12] TRANSFERRED 状態 + step 中間値でのガード残存有無
  - **手順**:
    1. 振替フローを実行し元案件を `Dispatch.status=TRANSFERRED` に遷移させる
    2. 元案件側 DispatchClient で `step` が中間値（`mode='transport'` なら 1〜4、それ以外なら 1〜3 の途中）の状態を作る
    3. ブラウザバック / 戻るボタン / ヘッダーホームボタンを押下
  - **期待結果**: [業務仕様未確認] 振替済み案件はガード対象外として扱われ、ホームへ戻れることが想定される。業務仕様としての挙動はユーザー確認待ちのため、検証時に実機挙動を観察し結果欄に記録する
  - **検証ポイント**: `components/dispatch/DispatchClient.tsx` の `inProgress` 計算が `dispatchId !== null && step >= 1 && step < (mode === 'transport' ? 5 : 4)` のみで `isTransferred` を含まないため、TRANSFERRED 状態かつ step 中間値でガードが残る可能性
  - **失敗時**: 「進行中の出動があります」モーダルが表示されホーム遷移できない場合、`inProgress` 計算ロジックに `&& !isTransferred` 条件を追加する独立タスクを起票
  - **関連**: 引き継ぎノート §E.12（`docs/handover/2026-05-04-dispatch-floating-prevention-impl.md`）, PR #10 reviewer レビュー観点 E

---

## 5. 推奨検証順序

依存関係から、以下の順での実施を推奨する：

```
F (マイグレーション)
  └─ F-01 ~ F-04（dry-run まで）
       ↓
A (認証フロー)
  └─ A-01 ~ A-10
       ↓
B (業務フロー)
  ├─ B-01 ~ B-07（出動 → 現着）
  ├─ B-08 ~ B-12（署名 → 共有 → PDF）  ← 同時に G-01 ~ G-07 を兼ねる
  ├─ B-13 ~ B-17（報告書・ETC・帰社）
  ├─ B-18 ~ B-22（TRANSPORT / 二次搬送 / 振替）
  ├─ B-23 ~ B-24（休憩）
  └─ B-25 ~ B-35（種別切替・保管・搬送署名・二次搬送詳細）
       ↓
C (オフライン同期)
  └─ C-01 ~ C-10（DevTools Offline 切替）
       ↓
D (管理者ダッシュボード)
  ├─ D-01 ~ D-03（レイアウト）
  ├─ D-04 ~ D-10（ダッシュボード Phase 3 / 3.5）
  ├─ D-11 ~ D-17（案件管理 Phase 4）
  └─ D-18 ~ D-20（設定）
       ↓
G (Blob 化の境界ケース)
  └─ G-08 ~ G-15（API 直叩きの 400 系・テスト系）
       ↓
F-05 ~ F-08（--apply / 本番想定）
       ↓
E (PWA)
  └─ E-01 ~ E-07
       ↓
H (パフォーマンス・全体)
  └─ H-01 ~ H-08
```

---

## 6. 確認結果サマリ

| カテゴリ | 合格 | 不合格 | 未確認 | 全件 |
|---|---|---|---|---|
| A 認証フロー | / 10 | | | 10 |
| B 業務フロー | / 35 | | | 35 |
| C オフライン同期 | / 10 | | | 10 |
| D 管理者ダッシュボード | / 20 | | | 20 |
| E PWA | / 7 | | | 7 |
| F マイグレーション | / 8 | | | 8 |
| G 署名 Blob 化 | / 15 | | | 15 |
| H パフォーマンス | / 8 | | | 8 |
| **合計** | **/ 113** | | | **113** |

---

## 7. 発見した問題の記録欄

| # | 関連ID | 重大度 | 概要 | 関連ログ / スクショ | 対応方針 / Issue 番号 |
|---|---|---|---|---|---|
| 1 | G-06 / B-08 | Blocker | CSP `connect-src` に Vercel Blob ドメイン未指定で `fetch(blobUrl)` がブロックされ、既存署名が再表示されないバグ（B-04 検証で発見） | コミット `d3bb47c` | 修正済（PR #10 内 / `next.config.ts` connect-src に `https://*.public.blob.vercel-storage.com` 追加） |
| 2 | B-16 | Major | 完了済みレコードでも「下書き保存」ボタンが表示され、押下すると `isDraft=true` に戻ってしまうバグ（B-16 検証で発見） | コミット `a7cd03d` | 修正済（PR #10 内 / Onsite/Transport 両 ReportClient と RecordClient で `isDraft` 条件分岐） |
| 3 | | | | | |

重大度の目安：
- **Blocker**: P0-13 マージ不可 / 本番切替不可
- **Major**: マージ可だが切替前に修正必須
- **Minor**: 別 PR で対応、切替後でも可

---

## 8. 次のアクション

### 全件合格時
1. PR #10 をレビュアーに依頼 / approve 後にマージ
2. Vercel Preview で同じチェックリストの抜粋（A-01〜A-04, B-08〜B-12, G-01〜G-07）を再実行
3. `docs/pre-launch-todo.md` の P2-03 状態を「完了」に更新、コミットリンクを記録
4. 第3波（P1-03 Neon Launch → P1-06 ドメイン → P1-07 本番 env → P1-09 Google OAuth → P2-01 本番テナント作成）に進む

### 不合格項目あり
1. **Blocker / Major** がある場合: PR #10 をマージせず、修正コミットを feature/p0-13-signature-blob に追加 → 該当カテゴリのみ再検証
2. **Minor のみ** の場合: 別ブランチ / 別 PR を切る Issue を起票 → PR #10 はマージ可
3. いずれも `docs/pre-launch-todo.md` の B 群テーブルに該当行を追加し、ID を採番（例: P0-18 等）

---

## 9. 既知の未確認事項（このチェックリストの限界）

本チェックリスト作成時点（2026-04-30）に planner が直接 Read で確認できなかった項目：

- `prisma/seed.ts` の具体的なシードユーザー（A-02 でログインに使う email / password）
- `components/common/SyncIndicator.tsx` の表示仕様（C-04 の表示判定）
- `app/layout.tsx` 内の `<link rel="manifest">` 記述（E-02 の前提）
- `hooks/useOnlineStatus.ts` の `handleRetry` の同期トリガ条件（C-05）
- P0-17（写真上限実装）の完了状態。引き継ぎ書では「実装プロンプト出力済」のみ。B-04 の上限 10 枚動作は **実装されていれば** 確認、未実装なら検証スキップ

これらは検証実行者が初手で Read して、必要なら本チェックリストに追記すること。

---

## 10. [未実装] セクション

以下は本チェックリスト作成時点で **実装未着手 or 未確認** のため、本検証スコープから外す：

- **P0-14 Blob private 化（access: 'private'）**: PR #10 は `access:'public'` で実装。private 化と署名付き URL 配信は次フェーズ（`docs/pre-launch-todo.md` P0-14）。本チェックリスト G-13 の PDF 生成は public 前提
- **P0-17 写真上限**: B-04 注記参照。未実装なら現状「上限なし」で動く想定
- **J-09 Sentry / Vercel Analytics**: 本検証時点では未導入。コンソールエラー（H-04）の手動確認のみ
- **エラー通知 Slack/メール（J-10）**: 同上、手動確認のみ
- **本番環境（shimoda.rodo.run）でのスモークテスト**: 本ドキュメントはローカル検証用。本番版は P2-01 完了後に本ドキュメントを複製し、`https://shimoda.rodo.run` を対象に再実行する
