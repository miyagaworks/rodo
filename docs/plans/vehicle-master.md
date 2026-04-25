# 車両マスタ機能 実装計画

Status: Approved (承認済み、実装待ち)
Target: Next.js 16.2.3 / React 19.2.4 / Prisma 6.19.3 / Zod 4.3.6 (v4) / PWA スマホ縦専用
Author: Planning phase — 実装はしない

---

## 0. 目的・要約

車両を自由入力文字列（`User.vehicleNumber` / `Dispatch.vehicleNumber`）から正規化されたマスタ管理（`Vehicle` テーブル）へ移行する。
これにより (1) 前回帰社 ODO を「車両ベース」で正確に取得し、(2) 表記揺れによる車両分裂を根絶し、(3) 管理者が車両台数・隊員紐付けを一元管理できるようにする。
既存の vehicleNumber データは全削除し、段階移行は行わない（ユーザー承認済み）。

---

## 1. 現状分析

### 1.1 Prisma スキーマ上の vehicleNumber

| モデル | フィールド | 型 | 行 |
|---|---|---|---|
| `User` | `vehicleNumber` | `String?` | `prisma/schema.prisma` L37 |
| `Dispatch` | `vehicleNumber` | `String?` | `prisma/schema.prisma` L102 |

どちらも nullable な自由文字列。インデックスなし、リレーションなし。

### 1.2 vehicleNumber 使用箇所（node_modules 除外、全 17 ファイル）

#### API ルート（5 ファイル）

| ファイル | 行 | 処理 |
|---|---|---|
| `app/api/users/route.ts` | L20, L65, L75 | GET: select に含む / POST: body から設定 |
| `app/api/users/[id]/route.ts` | L27 | PUT: `body.vehicleNumber ?? null` で更新 |
| `app/api/dispatches/route.ts` | L90, L162 | POST: ログインユーザーの vehicleNumber を Dispatch に自動コピー |
| `app/api/dispatches/[id]/route.ts` | L160 | PATCH: allowed フィールドとして受理 |
| `app/api/dispatches/[id]/transfer/accept/route.ts` | L42, L82 | 振替受理時: 受理ユーザーの vehicleNumber を Dispatch にコピー |

#### SSR ページ（2 ファイル）

| ファイル | 行 | 処理 |
|---|---|---|
| `app/dispatch/[id]/record/page.tsx` | L22, L62 | User.vehicleNumber を fallback としてシリアライズ |
| `app/dispatch/[id]/report/page.tsx` | L65, L143 | Dispatch.vehicleNumber をシリアライズ（1次/2次搬送共通） |

#### クライアントコンポーネント（4 ファイル）

| ファイル | 行 | 処理 |
|---|---|---|
| `components/dispatch/RecordClient.tsx` | L53, L236, L314, L427, L441 | state 管理 / 自由入力 UI / PATCH 送信 |
| `components/dispatch/ReportTransportClient.tsx` | L30, L231, L236, L307, L389, L493, L507 | 表示 + 編集 / 2次搬送 vehicleNumber の独立保存 |
| `components/dispatch/ReportOnsiteClient.tsx` | L29, L175, L236, L390, L404 | 表示 + 編集 |
| `components/settings/MembersTab.tsx` | L10, L105, L120 | Member 型定義 / 表示 / 自由テキスト編集 |

#### バリデーションスキーマ（2 ファイル）

| ファイル | 行 | 処理 |
|---|---|---|
| `lib/validations/schemas/user.ts` | L9, L17 | createUserSchema / updateUserSchema に `nullableString` |
| `lib/validations/schemas/dispatch.ts` | L88 | updateDispatchSchema に `nullableString` |

#### テスト（2 ファイル）

| ファイル | 処理 |
|---|---|
| `__tests__/components/draft-save-bug.test.tsx` | vehicleNumber を含む mock データ・allowed マップ検証 |
| `__tests__/api/users-validation.test.ts` | createUserSchema の vehicleNumber テスト |

#### Seed（1 ファイル）

| ファイル | 行 | 処理 |
|---|---|---|
| `prisma/seed.ts` | L50, L67 | `'広島 330 あ 1234'`, `'広島 330 い 5678'` のハードコード |

### 1.3 NumberPlateInput.tsx の位置付け

`components/dispatch/NumberPlateInput.tsx` は**お客様の車両ナンバープレート**入力コンポーネントであり、隊員の使用車両（vehicleNumber）とは無関係。Dispatch の `plateRegion` / `plateClass` / `plateKana` / `plateNumber` に対応する。車両マスタ登録 UI としての直接流用は不適切（目的が異なる）。ただし、ナンバープレート形式の入力部品として参考にはなる。

### 1.4 `/api/dispatches/last-return-odo` の現状仕様

```
GET /api/dispatches/last-return-odo
```

- `session.user.userId` × `session.user.tenantId` で `returnOdo` が非 null の最新 Dispatch を取得
- レスポンス: `{ lastReturnOdo: number | null }`
- **問題**: ユーザーベースのため、同じ車両を別隊員が使った場合の ODO 連続性が取れない。また隊員が別車両に乗り換えた場合、前車両の ODO が返される

### 1.5 odo-expansion.md との関係

ODO 機能拡張計画（`docs/plans/odo-expansion.md`）は arrivalOdo / transportStartOdo / returnOdo の追加が主旨で、実装済みの部分が多い（schema.prisma に 3 フィールド追加済み、last-return-odo API 実装済み、updateDispatchSchema に ODO フィールド追加済み）。同計画の「12. ヒアリング後の再検討候補」に「車両切替時の ODO」「`last-return-odo` の取得条件に `vehicleNumber` を加える必要」が明記されており、本計画はその未解決課題を正面から扱う。

### 1.6 設定画面の現状構成

`components/SettingsClient.tsx` が Radix UI Tabs で 3 タブを構成:
- `assistances` → `AssistanceTab.tsx`（アシスタンス管理）
- `members` → `MembersTab.tsx`（隊員登録）
- `tenant` → `TenantTab.tsx`（テナント設定）

API パターン: `AssistanceTab` は `/api/assistances` / `/api/assistances/[id]`、`MembersTab` は `/api/users` / `/api/users/[id]` を使用。テナント設定は `/api/tenant/settings`。

---

## 2. 新スキーマ設計

### 2.1 Vehicle モデル（新規）

```prisma
model Vehicle {
  id          String  @id @default(cuid())
  tenantId    String
  plateNumber String  // ナンバー文字列（例: "広島 330 あ 1234"）
  displayName String? // 表示名（任意。例: "1号車", "田中号"）
  isActive    Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant     Tenant     @relation(fields: [tenantId], references: [id])
  users      User[]     // デフォルト車両として紐付けられたユーザー
  dispatches Dispatch[] // この車両で出動した記録

  @@unique([tenantId, plateNumber])
  @@index([tenantId])
}
```

### 2.2 User モデル変更

```prisma
model User {
  // 既存フィールド省略...

  // vehicleNumber String?        // ← 削除
  vehicleId String?               // ← 追加（デフォルト車両）

  vehicle  Vehicle? @relation(fields: [vehicleId], references: [id]) // ← 追加

  @@index([tenantId])
}
```

### 2.3 Dispatch モデル変更

```prisma
model Dispatch {
  // 既存フィールド省略...

  // vehicleNumber String?        // ← 削除
  vehicleId String?               // ← 追加（出動時の車両）

  vehicle  Vehicle? @relation(fields: [vehicleId], references: [id]) // ← 追加

  // 既存インデックス省略...
  @@index([vehicleId])            // ← 追加（車両ベース ODO 検索用）
}
```

### 2.4 Tenant モデル変更

```prisma
model Tenant {
  // 既存フィールド省略...
  vehicles Vehicle[]              // ← 追加
}
```

### 2.5 既存フィールドの扱い

| 対象 | 操作 |
|---|---|
| `User.vehicleNumber` | **削除**（vehicleId に置換） |
| `Dispatch.vehicleNumber` | **削除**（vehicleId に置換） |
| 既存データ | 全削除（マイグレーション移行なし。2.6 参照） |

### 2.6 データ削除方針

- Dispatch / Report / 関連レコード（DispatchEtc, DispatchPhoto, WorkConfirmation, BreakRecord）を全削除
- User.vehicleNumber は null 化後にカラム自体を削除
- 既存スクリプト `scripts/reset-dispatches-reports.ts` を拡張して使用
- 本番データの扱いは運用時判断（計画書ではスクリプト提供のみ）

---

## 3. API 設計

### 3.1 `GET /api/settings/vehicles` — 車両一覧取得

**認可**: ADMIN のみ（同一テナント）

**備考**: 既存 API パターンは `/api/assistances`、`/api/users` とフラット構造だが、車両は管理者設定専用のため `/api/settings/vehicles` とする。

**リクエスト**: なし（クエリパラメータ不要）

**レスポンス 200**:
```ts
{
  id: string
  plateNumber: string
  displayName: string | null
  isActive: boolean
  createdAt: string // ISO 8601
  updatedAt: string
  _count: { users: number; dispatches: number } // 紐付け状況表示用
}[]
```

**エラー**:
- `401`: 未認証
- `403`: ADMIN 以外

---

### 3.2 `POST /api/settings/vehicles` — 車両登録

**認可**: ADMIN のみ

**リクエスト Zod スキーマ**:
```ts
const createVehicleSchema = z.object({
  plateNumber: z.string().min(1, 'ナンバーは必須です'),
  displayName: nullableString,
  isActive: z.boolean().default(true),
})
```

**レスポンス 201**:
```ts
{ id: string; plateNumber: string; displayName: string | null; isActive: boolean }
```

**エラー**:
- `400`: バリデーションエラー
- `401`: 未認証
- `403`: ADMIN 以外
- `409`: 同一テナント内で plateNumber 重複

---

### 3.3 `PATCH /api/settings/vehicles/[id]` — 車両更新

**認可**: ADMIN のみ（同一テナント内のみ）

**リクエスト Zod スキーマ**:
```ts
const updateVehicleSchema = z.object({
  plateNumber: z.string().min(1).optional(),
  displayName: nullableString,
  isActive: z.boolean().optional(),
}).partial()
```

**レスポンス 200**: 更新後の Vehicle オブジェクト

**エラー**:
- `400`: バリデーションエラー
- `401`: 未認証
- `403`: ADMIN 以外
- `404`: 該当 ID のテナント内車両なし
- `409`: plateNumber 変更時に重複

---

### 3.4 `DELETE /api/settings/vehicles/[id]` — 車両削除

**認可**: ADMIN のみ

**削除条件**: 使用中チェック

```ts
// 使用中 = 進行中の Dispatch に紐付いている
const activeDispatches = await prisma.dispatch.count({
  where: {
    vehicleId: id,
    status: { notIn: ['RETURNED', 'CANCELLED', 'TRANSFERRED'] },
  },
})
if (activeDispatches > 0) {
  return 409 // 使用中車両の削除拒否
}
```

**完了済み Dispatch との関係**: `onDelete: SetNull`（Dispatch.vehicleId を null 化し、履歴は保持）

**レスポンス 200**: `{ success: true }`

**エラー**:
- `401`: 未認証
- `403`: ADMIN 以外
- `404`: 該当 ID のテナント内車両なし
- `409`: 進行中の出動に紐付いている車両

---

### 3.5 `GET /api/dispatches/last-return-odo` — 車両ベース前回帰社 ODO

**現状仕様変更**: userId ベース → vehicleId ベースに変更

**リクエスト**:
```
GET /api/dispatches/last-return-odo?vehicleId=xxx
```

**Zod スキーマ**:
```ts
const lastReturnOdoQuerySchema = z.object({
  vehicleId: z.string().min(1),
})
```

**レスポンス 200**:
```ts
{ lastReturnOdo: number | null }
```

**ロジック変更**:
```ts
// Before (userId ベース)
const latest = await prisma.dispatch.findFirst({
  where: {
    userId: session.user.userId,
    tenantId: session.user.tenantId,
    returnOdo: { not: null },
  },
  orderBy: { createdAt: 'desc' },
  select: { returnOdo: true },
})

// After (vehicleId ベース)
const latest = await prisma.dispatch.findFirst({
  where: {
    vehicleId: vehicleId,
    tenantId: session.user.tenantId,
    returnOdo: { not: null },
  },
  orderBy: { createdAt: 'desc' },
  select: { returnOdo: true },
})
```

**フォールバック**: vehicleId が未指定の場合は 400 エラー（旧仕様の userId ベースは廃止）

**エラー**:
- `400`: vehicleId 未指定
- `401`: 未認証
- `500`: DB エラー

---

## 4. UI 設計

### 4-1. 管理者ページ: 車両タブ新規追加

#### 新規ファイル
- `components/settings/VehiclesTab.tsx`

#### 変更ファイル
- `components/SettingsClient.tsx` — 4 番目のタブ「車両管理」を追加

#### タブ構成（変更後）

```
[アシスタンス] [隊員登録] [車両管理] [テナント設定]
```

#### VehiclesTab UI 仕様

既存の `AssistanceTab.tsx` / `MembersTab.tsx` のアコーディオン UI パターンを踏襲。

- **一覧表示**: 各車両をアコーディオン行で表示（ナンバー / 表示名 / アクティブ状態）
- **新規登録**: `+ 車両を追加` ボタン → インライン編集フォーム
  - 入力フィールド: ナンバー（テキスト）、表示名（テキスト、任意）
  - ナンバー入力は自由テキスト（NumberPlateInput は顧客車両用 UI なので流用しない。隊員車両のナンバーは「広島 330 あ 1234」のような文字列を直接入力する想定）
- **編集**: アコーディオン展開 → 各フィールド編集 → 保存
- **削除**: ✕ ボタン → confirm → API DELETE（409 の場合はアラート「この車両は進行中の出動に使用されています」）
- **非アクティブ化**: isActive トグル（削除の代替。選択肢から除外するが履歴は保持）

---

### 4-2. MembersTab の修正

#### 変更ファイル
- `components/settings/MembersTab.tsx`

#### 現状
L120: `{ key: 'vehicleNumber', label: '使用車両', type: 'text' }` で自由テキスト入力

#### 新仕様
- 登録済み車両一覧を `/api/settings/vehicles` から取得（`useEffect`）
- 自由テキスト → `<select>` ドロップダウンに変更
- 選択肢: `[未設定, ...vehicles.map(v => v.plateNumber + (v.displayName ? ` (${v.displayName})` : ''))]`
- 値: `vehicleId` を保存
- 表示: `vehicleNumber` → `vehicle.plateNumber` に変更

#### Member 型変更
```ts
// Before
interface Member {
  vehicleNumber: string | null
  // ...
}

// After
interface Member {
  vehicleId: string | null
  vehicle: { plateNumber: string; displayName: string | null } | null
  // ...
}
```

---

### 4-3. 出動フローの車両確定タイミング（重要論点）

#### 前提

現状の出動作成フロー（`DispatchClient.tsx`）:
1. 画面でアシスタンス・出動タイプを選択
2. 出発ボタン押下 → `POST /api/dispatches` → Dispatch 作成
3. Dispatch 作成時、`User.vehicleNumber` が自動コピーされる（L162）
4. 出動記録ページ（`RecordClient.tsx`）で vehicleNumber を自由入力で修正可能
5. Report ページでも vehicleNumber を修正可能

vehicleNumber は**出動開始時点では確定せず、後から記録する**運用。

#### 案 X: 出動開始時に車両選択ステップ追加

**概要**: 出発ボタン押下前に車両セレクタを表示し、明示選択を必須化

**メリット**:
- 車両が確実に記録される（未入力防止）
- last-return-odo を出発 ODO 初期値に使うフローが完全に機能する

**デメリット**:
- 出動開始の操作ステップが 1 つ増える（緊急時の UX 悪化）
- `DispatchClient.tsx`（1,400 行超）の出発フローに大きな変更が入る
- `SecondaryDispatchClient.tsx` にも同様の変更が必要

**影響ファイル**: DispatchClient.tsx, SecondaryDispatchClient.tsx, `POST /api/dispatches`

---

#### 案 Y: User.vehicleId をデフォルトとして自動設定、出動記録ページで変更可能（推奨）

**概要**: 出動作成時に `User.vehicleId` を `Dispatch.vehicleId` に自動コピー。出動記録ページで別車両へ変更可能

**メリット**:
- 出動開始フローは現状とほぼ同じ UX（操作ステップ増なし）
- User にデフォルト車両が設定されていれば、ほとんどの場合そのまま正しい
- 自由テキスト → セレクタへの変更のみで、入力揺れを解消
- last-return-odo は `User.vehicleId` をデフォルトとして即座に取得可能

**デメリット**:
- User.vehicleId が未設定の場合、Dispatch.vehicleId も null になる（後から記録ページで設定が必要）
- 「車両未設定のまま出動完了」が理論上可能（ただし現状の vehicleNumber でも同じ）

**影響ファイル**: `POST /api/dispatches`（vehicleNumber → vehicleId に変更のみ）、RecordClient.tsx、ReportTransportClient.tsx、ReportOnsiteClient.tsx

---

#### 案 Z: 出動開始時点では未確定、出動記録ページで確定（last-return-odo は User.vehicleId をフォールバック）

**概要**: Dispatch 作成時は vehicleId を null で作成。出動記録ページで初めて車両を選択。last-return-odo の初期クエリには User.vehicleId を使う

**メリット**:
- 出動開始が最速（現状と同じ）
- 車両を持たない隊員のフローが自然

**デメリット**:
- 出発 ODO の初期値が不正確になりうる（User.vehicleId とは異なる車両に乗る場合）
- 車両未設定の出動レコードが残りやすい

**影響ファイル**: RecordClient.tsx（車両セレクタ追加）、last-return-odo API（フォールバックロジック追加で複雑化）

---

#### 推奨: 案 Y

**根拠**:
1. 現状の運用フロー（出動→後から記録）を大きく変えずに済む
2. 「隊員と車両は基本紐付いているが、必ずしもその車両に乗るとは限らない」という前提と整合
3. `POST /api/dispatches` の既存コード（L88-91, L162）が `User.vehicleNumber` を取得してコピーしている処理を `User.vehicleId` に変えるだけで実現可能
4. 出動記録ページの vehicleNumber 自由テキスト入力を車両セレクタに変えるのみ
5. last-return-odo は `vehicleId` が確定しているため、正確な値を返せる

---

### 4-4. Dispatch / Report 関連ファイルの vehicleNumber → vehicleId 変更

#### 変更一覧

| ファイル | 変更概要 |
|---|---|
| `components/dispatch/RecordClient.tsx` | L53: 型定義 `vehicleNumber` → `vehicleId` / L236: state を vehicleId に / L314: PATCH body に vehicleId / L420-449: 自由テキスト入力 → 車両セレクタ（dropdown） |
| `components/dispatch/ReportTransportClient.tsx` | L30: 型定義 / L231, L236: state / L307: upsert body / L389: 2次搬送 vehicleId / L493-507: 表示（plateNumber を vehicle リレーションから取得） |
| `components/dispatch/ReportOnsiteClient.tsx` | L29: 型定義 / L175: state / L236: upsert body / L390-404: 表示 |
| `components/dispatch/DispatchClient.tsx` | L334: last-return-odo 呼び出しに vehicleId パラメータ追加 / vehicleNumber 関連の表示はなし（出動画面では車両情報は表示のみ） |
| `components/dispatch/SecondaryDispatchClient.tsx` | vehicleNumber 参照箇所の vehicleId 変更 |

#### SSR ページ変更

| ファイル | 変更概要 |
|---|---|
| `app/dispatch/[id]/record/page.tsx` | L22: User の select を `vehicleId` に / L62: フォールバックロジック変更 / Dispatch に vehicle リレーションの include 追加 |
| `app/dispatch/[id]/report/page.tsx` | L65, L143: vehicleNumber → vehicleId + vehicle リレーション |

#### 車両セレクタの実装方針

RecordClient / ReportTransportClient / ReportOnsiteClient で使う車両セレクタは共通コンポーネント化が望ましい:

```
components/dispatch/VehicleSelector.tsx (新規)
```

Props:
```ts
interface VehicleSelectorProps {
  value: string | null           // vehicleId
  onChange: (vehicleId: string | null) => void
  disabled?: boolean
}
```

内部で `/api/settings/vehicles` を fetch して選択肢を構築。ADMIN 以外も読み取りが必要なため、**車両一覧の読み取り API は ADMIN 制限を緩和するか、別エンドポイントを用意する必要がある**（3.1 の認可要件を再検討。後述: 9. 未確定事項）。

---

## 5. データリセットスクリプト

### 概要

既存の `scripts/reset-dispatches-reports.ts`（142 行）を拡張し、vehicleNumber クリア処理を追加する。

### ファイル

`scripts/reset-vehicles-and-dispatches.ts`（新規）

### 仕様

```
使い方:
  npx tsx scripts/reset-vehicles-and-dispatches.ts            # dry run
  npx tsx scripts/reset-vehicles-and-dispatches.ts --apply    # 実削除

安全装置:
  - DATABASE_URL に 'localhost' または '127.0.0.1' を含まない場合 abort
  - dry run では件数のみ表示

処理順序:
  1. Report 全削除
  2. WorkConfirmation 全削除
  3. DispatchEtc 全削除
  4. DispatchPhoto 全削除
  5. BreakRecord.dispatchId を null に UPDATE
  6. Dispatch 全削除
  7. User.vehicleNumber を null に UPDATE（schema 変更前の互換用）
  8. 完了ログ出力

参考: 既存 delete-miyagawa-orphan-breaks.ts のエラー処理・finally disconnect パターンを踏襲
```

---

## 6. Phase 分け

### Phase 1: DB スキーマ + データリセット

**成果物**:
- `prisma/schema.prisma` に Vehicle モデル追加、User/Dispatch の vehicleNumber → vehicleId 変更
- `prisma/seed.ts` の vehicleNumber → Vehicle 作成 + vehicleId 紐付けに変更
- `scripts/reset-vehicles-and-dispatches.ts` 新規作成
- `prisma db push` 実行

**変更ファイル一覧**:
| 種別 | ファイル |
|---|---|
| 変更 | `prisma/schema.prisma` |
| 変更 | `prisma/seed.ts` |
| 新規 | `scripts/reset-vehicles-and-dispatches.ts` |

**完了判定**:
- `prisma db push` がエラーなく完了
- `prisma studio` で Vehicle テーブルが存在し、User.vehicleId / Dispatch.vehicleId カラムが存在
- リセットスクリプトの dry run が正常動作

**注記**: Phase 1 完了時点では `npm run build` / `npm test` は型エラーで失敗する。
`User.vehicleNumber` / `Dispatch.vehicleNumber` を参照している既存コード（API・コンポーネント・テスト）が一斉に壊れるため、
これらの解消は Phase 2 の責務とする。Phase 1 ではビルド成功・テスト pass を完了判定に含めない。

**依存**: なし（最初の Phase）

---

### Phase 2: API 実装 + バリデーション + テスト

**成果物**:
- 車両 CRUD API（4 エンドポイント）
- バリデーションスキーマ（vehicle.ts 新規）
- User / Dispatch のバリデーションスキーマ更新
- 既存 API の vehicleNumber → vehicleId 変更
- last-return-odo API の vehicleId ベース化
- ユニットテスト

**変更ファイル一覧**:
| 種別 | ファイル |
|---|---|
| 新規 | `app/api/settings/vehicles/route.ts` |
| 新規 | `app/api/settings/vehicles/[id]/route.ts` |
| 新規 | `lib/validations/schemas/vehicle.ts` |
| 新規 | `__tests__/api/vehicles.test.ts` |
| 新規 | `__tests__/api/dispatches-last-return-odo-vehicle.test.ts` |
| 変更 | `lib/validations/schemas/user.ts` |
| 変更 | `lib/validations/schemas/dispatch.ts` |
| 変更 | `lib/validations/index.ts`（export 追加） |
| 変更 | `app/api/users/route.ts` |
| 変更 | `app/api/users/[id]/route.ts` |
| 変更 | `app/api/dispatches/route.ts` |
| 変更 | `app/api/dispatches/[id]/route.ts` |
| 変更 | `app/api/dispatches/[id]/transfer/accept/route.ts` |
| 変更 | `app/api/dispatches/last-return-odo/route.ts` |

**完了判定**:
- 全テスト pass
- `npm run build` エラーなし（型エラー 0）
- 車両 CRUD を curl / Postman で動作確認

**依存**: Phase 1 完了が必要

---

### Phase 3: 管理者ページ UI（車両タブ + MembersTab 修正）

**成果物**:
- VehiclesTab コンポーネント
- SettingsClient にタブ追加
- MembersTab の vehicleNumber → vehicleId セレクタ化

**変更ファイル一覧**:
| 種別 | ファイル |
|---|---|
| 新規 | `components/settings/VehiclesTab.tsx` |
| 変更 | `components/SettingsClient.tsx` |
| 変更 | `components/settings/MembersTab.tsx` |

**完了判定**:
- 車両タブで CRUD 操作が正常に動作
- MembersTab で車両ドロップダウンから選択・保存が可能
- `npm run build` エラーなし

**依存**: Phase 2 完了が必要（API が存在すること）

---

### Phase 4: 出動フロー統合（案 Y に従う）

**成果物**:
- 出動作成時の vehicleId 自動設定
- 出動記録ページの車両セレクタ
- Report ページの車両表示変更
- VehicleSelector 共通コンポーネント

**変更ファイル一覧**:
| 種別 | ファイル |
|---|---|
| 新規 | `components/dispatch/VehicleSelector.tsx` |
| 変更 | `components/dispatch/RecordClient.tsx` |
| 変更 | `components/dispatch/ReportTransportClient.tsx` |
| 変更 | `components/dispatch/ReportOnsiteClient.tsx` |
| 変更 | `components/dispatch/SecondaryDispatchClient.tsx` |
| 変更 | `app/dispatch/[id]/record/page.tsx` |
| 変更 | `app/dispatch/[id]/report/page.tsx` |

**完了判定**:
- 出動作成 → 記録 → Report の全フローで vehicleId が正しく保存される
- 車両セレクタで別車両への変更が可能
- `npm run build` エラーなし

**依存**: Phase 2, Phase 3 完了が必要

---

### Phase 5: last-return-odo 車両ベース化 + 呼び出し元修正

**成果物**:
- DispatchClient の last-return-odo 呼び出しに vehicleId パラメータ追加
- SecondaryDispatchClient の同様修正
- 既存テスト更新

**変更ファイル一覧**:
| 種別 | ファイル |
|---|---|
| 変更 | `components/dispatch/DispatchClient.tsx` |
| 変更 | `components/dispatch/SecondaryDispatchClient.tsx` |
| 変更 | `__tests__/api/dispatches-last-return-odo.test.ts` |
| 変更 | `__tests__/components/draft-save-bug.test.tsx` |

**完了判定**:
- 出発 ODO 初期値が「その車両の前回帰社 ODO」で設定される
- 別車両を選択したら、その車両の前回帰社 ODO に切り替わる
- 全テスト pass
- `npm run build` / `npm run lint` / `npm test` 全通過

**依存**: Phase 4 完了が必要

---

## 7. テスト方針

### 7.1 スキーマテスト

- Vehicle モデルの作成・更新・削除が正常動作すること
- `@@unique([tenantId, plateNumber])` の重複チェック
- User.vehicleId / Dispatch.vehicleId の外部キー制約

### 7.2 API ユニットテスト

| テストファイル | 対象 | ケース |
|---|---|---|
| `__tests__/api/vehicles.test.ts` | 車両 CRUD 4 API | 正常系 CRUD / 401 未認証 / 403 非 ADMIN / 409 重複 / 409 使用中削除 / 404 不存在 |
| `__tests__/api/dispatches-last-return-odo-vehicle.test.ts` | last-return-odo | vehicleId ベース取得 / vehicleId 未指定で 400 / 別テナント車両で結果なし |
| `__tests__/api/users-validation.test.ts` | ユーザースキーマ | vehicleNumber → vehicleId への変更反映 |

### 7.3 バリデーションスキーマテスト

- `createVehicleSchema`: plateNumber 必須 / displayName optional
- `updateVehicleSchema`: partial で各フィールド optional
- `createUserSchema` / `updateUserSchema`: vehicleId が cuid optional
- `updateDispatchSchema`: vehicleId が string optional

### 7.4 UI コンポーネントテスト（Vitest + Testing Library）

| テストファイル | 対象 | ケース |
|---|---|---|
| `__tests__/components/VehiclesTab.test.tsx` | VehiclesTab | 一覧表示 / 新規追加 / 編集保存 / 削除 |
| `__tests__/components/VehicleSelector.test.tsx` | VehicleSelector | 選択肢表示 / 選択変更 / 未設定状態 |

### 7.5 統合テスト

| シナリオ | 検証内容 |
|---|---|
| 出動→帰社→次回出動 | 同一車両の ODO が継続して引き継がれること |
| 車両変更 | 出動記録ページで別車両に変更 → last-return-odo が新車両の値に切り替わること |
| 隊員交代 | 別隊員が同じ車両で出動 → 前回帰社 ODO が引き継がれること |

### 7.6 既存テスト更新

| ファイル | 更新内容 |
|---|---|
| `__tests__/components/draft-save-bug.test.tsx` | vehicleNumber → vehicleId に mock データ変更 |
| `__tests__/api/users-validation.test.ts` | vehicleNumber → vehicleId |
| `__tests__/api/dispatches-last-return-odo.test.ts` | vehicleId パラメータ追加、userId ベースのテストを vehicleId ベースに変更 |

---

## 8. リスク・懸念

| # | リスク | 影響 | 対策 |
|---|---|---|---|
| R1 | 出動中に管理者が車両を削除した場合 | Dispatch.vehicleId が null 化され、Report の車両情報が消える | `DELETE` API で進行中 Dispatch チェック（3.4 参照）。isActive フラグによるソフトデリートを推奨 |
| R2 | Vehicle 削除時の参照整合性 | User.vehicleId / Dispatch.vehicleId が orphan 化 | Prisma relation に `onDelete: SetNull` を指定。User/Dispatch 側は null 許容のため安全 |
| R3 | 一車両を複数隊員が同時使用 | ODO の整合性が崩れる（同時に 2 つの出動が同じ vehicleId を持つ） | 排他制御は不要（現実的に同じ車両を 2 人が同時使用するケースは運用で防ぐ）。ただし、同一車両で同時に進行中の Dispatch がある場合の警告 UI は検討の余地あり |
| R4 | オフラインキャッシュの vehicleId 整合性 | offlineFetch でキューイングされたリクエストに vehicleId が含まれるが、オフライン中に車両が削除された場合 | 既存の offlineFetch は PATCH body をそのまま送信するため、サーバー側で vehicleId の存在チェックが必要。存在しない場合は vehicleId を null として処理 |
| R5 | NumberPlateInput の位置付け | 車両登録 UI として使えるか混乱する可能性 | 計画書で明記: NumberPlateInput は顧客車両のナンバー入力用。隊員車両の登録は VehiclesTab で自由テキスト入力 |
| R6 | 車両一覧の読み取り権限 | ADMIN 以外の隊員が VehicleSelector で車両一覧を取得する必要がある | 車両一覧 GET は ADMIN 制限を緩和するか、専用の軽量 API を用意する（9. 未確定事項） |
| R7 | 既存テスト大量修正 | vehicleNumber → vehicleId 変更で mock データ・assertion が壊れる | Phase 2 で一括対応。影響範囲は 3 テストファイルと限定的 |
| R8 | DispatchClient.tsx の巨大さ | 1,400 行超のファイルへの変更はリグレッションリスクが高い | 案 Y の採用により DispatchClient への変更は last-return-odo の呼び出しパラメータ変更のみに限定 |

---

## 9. 未確定事項・ユーザー判断が必要な事項

### 9.1 出動フローの車両確定タイミング（4-3）

案 X / Y / Z の最終選択。推奨は案 Y。

### 9.2 車両一覧の読み取り権限

`GET /api/settings/vehicles` は ADMIN 限定だが、出動フローの VehicleSelector で一般隊員も車両一覧が必要。選択肢:

- **A**: `GET /api/settings/vehicles` の認可を「同一テナントの認証済みユーザー」に緩和
- **B**: `GET /api/vehicles` を別途用意（最低限の id / plateNumber / displayName のみ返す、ADMIN 以外も利用可）

推奨: A（車両情報は秘匿する必要がなく、実装がシンプル）

### 9.3 Vehicle マスタの拡張フィールド

現時点の最小構成: `id`, `tenantId`, `plateNumber`, `displayName`, `isActive`, `createdAt`, `updatedAt`

将来的に追加が想定されるフィールド（今回はスコープ外、Vehicle テーブルが存在すれば後から ADD COLUMN で対応可能）:
- 車種（vehicleType）
- ETC カード番号
- メンテナンス期限（nextMaintenanceDate）
- 車検期限
- 走行距離上限

### 9.4 車両の並び順

現時点のデフォルト: `createdAt ASC`（登録順）

選択肢:
- **登録順**: 実装最シンプル
- **ナンバー順**: plateNumber で COLLATE（日本語ソートの問題あり）
- **使用頻度順**: Dispatch.count が必要で実装コスト高
- **手動 sortOrder**: AssistanceTab と同じパターン（`sortOrder Int @default(0)`）

**決定: plateNumber の自然順ソート（Intl.Collator('ja', { numeric: true })）**

理由: 実運用で plateNumber は「11, 12, 100, 103」のような数字が入るケースが多く、
単純な文字列ソートでは "100" < "11" < "12" となり見づらい。
自然順ソートなら数字混在でも意図通りに並び、数字のみ・文字列混在の両ケースで正しく動作する。

実装方針:
- DB `orderBy` は `createdAt ASC` のまま（Prisma では自然順ソート不可）
- VehiclesTab / VehicleSelector でクライアント側ソートを適用

```ts
[...vehicles].sort((a, b) =>
  a.plateNumber.localeCompare(b.plateNumber, 'ja', { numeric: true })
)
```

### 9.5 Vehicle 削除の挙動

- **物理削除 + SetNull**: 完了済み Dispatch の vehicleId が null 化（車両情報が失われる）
- **ソフトデリート（isActive = false）**: 選択肢からは除外されるが、履歴は保持

推奨: ソフトデリート（isActive = false）をメインの運用とし、物理削除は「Dispatch が 0 件の車両」に限定

---

## 変更ファイル総数サマリ

| 種別 | ファイル数 | 主なファイル |
|---|---|---|
| 新規 | 8 | VehiclesTab.tsx, VehicleSelector.tsx, vehicles API (2), vehicle.ts, テスト (3) |
| 変更 | 19 | schema.prisma, seed.ts, SettingsClient.tsx, MembersTab.tsx, RecordClient.tsx, ReportTransportClient.tsx, ReportOnsiteClient.tsx, DispatchClient.tsx, SecondaryDispatchClient.tsx, dispatches API (3), users API (2), last-return-odo, record/page.tsx, report/page.tsx, validation schemas (2) |
| 新規スクリプト | 1 | reset-vehicles-and-dispatches.ts |
| **合計** | **28** | |
