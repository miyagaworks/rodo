# 設定画面 ドラッグ&ドロップ並び替え機能 実装計画

作成日: 2026-04-26
対象プロジェクト: `/Users/miyagawakiyomi/Projects/rodo/app`
対象スタック: Next.js 16.2.3 / React 19.2.4 / Prisma 6.19.3 / Zod 4.3.6 / PWA スマホ縦専用
作業ブランチ: `feature/drag-reorder`

---

## 0. 目的と要件サマリ

設定画面の 3 タブ（アシスタンス / 隊員 / 車両）に、各行をドラッグ&ドロップで並び替える機能を追加する。並び順はサーバーに永続化し、再読込・他デバイスでも同じ順序で表示される状態を作る。

### 機能フロー

```
管理者: 設定画面のタブを開く
  → 各行の左端に「≡」ハンドルを表示
  → ハンドルを長押し / マウスドラッグで掴む
  → 別の行の上にドロップ
  → 一覧の並び順が即時反映（楽観的更新）
  → 並列して reorder API が走る
    → 成功: 何もしない（既に画面は新しい順）
    → 失敗: alert で通知し、元の順序に戻す（ロールバック）
```

### スコープ

- `AssistanceTab.tsx`（アシスタンス管理）
- `MembersTab.tsx`（隊員登録）
- `VehiclesTab.tsx`（車両管理）

上記 3 タブ各行のドラッグ並び替え + 順序のサーバー永続化。

### スコープ外

- `InsuranceCompany`（schema 上 `sortOrder` フィールドあり、現状 PUT 時にインデックス順で再付与。今回は手をつけない）
- `DispatchPhoto`（schema 上 `sortOrder` フィールドあり、現状 POST 時に max+1 を付与。今回は手をつけない）
- 隊員一覧・車両一覧の MembersTab / VehiclesTab 以外への波及（出動画面の VehicleSelector など）。並び順を別の場所で利用するかは別タスク。
- ヘッダー位置の固定や表示密度変更などレイアウトの抜本変更
- 並び替え途中の自動スクロール（dnd-kit のオプション挙動に委ねる）
- 並び替え操作のキーボードナビゲーション仕様の独自定義（dnd-kit デフォルトに委ねる）

---

## 1. 技術選定

### 1.1 ライブラリ比較

| 候補 | 最新版 | React 19 対応 | タッチ対応 | バンドル | 状態 |
|---|---|---|---|---|---|
| **A: @dnd-kit/core 6.3.1 + @dnd-kit/sortable 10.0.0 + @dnd-kit/utilities 3.2.2** | 6.3.1（約1年前リリース） | peerDependencies が `react: >=16.8.0` のため React 19 で `--legacy-peer-deps` 不要 | TouchSensor / PointerSensor / KeyboardSensor を標準提供 | core ~10KB gzip 程度 | レガシー版だが現役。後継 `@dnd-kit/react` は 0.4.0 で stable 未到達 |
| B: @dnd-kit/react 0.4.x | 0.4.0（pre-1.0） | React 19 対応 | 同等 | 同程度 | 開発初期。production 利用は時期尚早 |
| C: react-beautiful-dnd | 13.x | React 18 までのみ。**React 19 で動作しない既知問題が複数報告** | あり | ~30KB | メンテナンス停止。Atlassian 内部で継続使用のフォーク版あり |
| D: react-dnd | 16.x | 公式 React 19 サポート未表明、HTML5 backend のみではタッチ非対応 | TouchBackend 別途 | ~25KB | バックエンド分離設計で導入コスト高 |

**→ 選定: A（@dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities）**

確定済み判断（ユーザー指示）に従う。本計画書では選定の根拠と検証結果を以下に明示する。

### 1.2 採用理由

1. **タッチとキーボード両対応**: `TouchSensor` / `PointerSensor` / `KeyboardSensor` を標準提供。スマホ縦専用 PWA では TouchSensor が必須。
2. **PWA 互換**: 標準 DOM API ベース。Service Worker / オフライン環境でも DnD の動作自体は影響を受けない（API 呼び出しは別途 offlineFetch 検討が必要、9 章参照）。
3. **軽量**: `@dnd-kit/core` 単体で gzip ~10KB 程度、`sortable` プリセット込みでも ~15KB 前後。`react-beautiful-dnd` の半分以下。
4. **Next.js 16 / React 19 互換性検証結果**:
   - `@dnd-kit/core@6.3.1` の `package.json` を unpkg で直接確認（`https://unpkg.com/@dnd-kit/core@6.3.1/package.json`）
   - `peerDependencies: { react: ">=16.8.0", react-dom: ">=16.8.0" }` を確認
   - `@dnd-kit/sortable@10.0.0` の peer は `react: ">=16.8.0", @dnd-kit/core: ^6.3.0`
   - `@dnd-kit/utilities@3.2.2` の peer は `react: ">=16.8.0"`
   - 結論: React 19.2.4 はすべてのパッケージの peer を満たす。`npm install` で `ERESOLVE` 警告は発生しない見込み
5. **Class component 廃止の影響なし**: dnd-kit はすべて関数コンポーネント / Hook で実装。React 19 で削除された旧 API を使用していない
6. **代替案 C のリスク**: `react-beautiful-dnd` は Atlassian 公式が 2022 年にメンテナンス停止を表明済み。React 19 で `Cannot read properties of null (reading 'isReactComponent')` 系のエラー報告あり。新規採用は不適切

### 1.3 残存リスクと検証ポイント（要 Phase 2 早期検証）

| 項目 | 検証方法 |
|---|---|
| React 19 ランタイム互換（peer 範囲は満たすが内部で削除済み API を使っていないか） | Phase 2 の最初に 3 行並び替えの最小サンプルを `npm run dev` / `npm run build` 双方で動作確認 |
| Next.js 16 の Turbopack / SWC との相性 | 同上。バンドル成果物に dnd-kit が含まれることを確認 |
| iOS Safari (PWA 起動時) のタッチ操作 | Phase 2 で実機検証。`TouchSensor` の `activationConstraint: { delay: 150, tolerance: 5 }` を初期値、長押し誤発火を確認 |
| 後継 `@dnd-kit/react` への将来移行 | 公式 Discussion #1842 で maintainer 未回答（2025-11 時点）。当面 legacy で問題なし |

### 1.4 新規依存パッケージ

```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

devDependencies への追加なし。型定義は本体に含まれる（`typings: dist/index.d.ts`）。

---

## 2. データモデル変更

### 2.1 対象モデル

| モデル | sortOrder 現状 | 必要対応 |
|---|---|---|
| `Assistance` | あり（`prisma/schema.prisma` L83: `sortOrder Int @default(0)`） | フィールド追加不要。既存レコードへ連番付与とソート使用のみ |
| `User` | なし | `sortOrder Int @default(0)` 追加 + 既存レコード連番付与 |
| `Vehicle` | なし | `sortOrder Int @default(0)` 追加 + 既存レコード連番付与 |
| `InsuranceCompany` | あり（L100） | スコープ外。変更なし |
| `DispatchPhoto` | あり（L289） | スコープ外。変更なし |

### 2.2 schema.prisma 変更案

```prisma
model User {
  // ... 既存フィールド ...
  sortOrder Int @default(0)
  // ...
  @@index([tenantId])
}

model Vehicle {
  // ... 既存フィールド ...
  sortOrder Int @default(0)
  // ...
  @@unique([tenantId, plateNumber])
  @@index([tenantId])
}
```

`Assistance` には変更なし。

複合インデックス（`@@index([tenantId, sortOrder])`）は今回見送る。理由:
- 設定画面の一覧取得は管理者のみが行う低頻度操作
- 1 テナントあたりの行数が現実的に数十件程度（数千件オーダーではない）
- 将来必要になった場合に追加可能

### 2.3 スキーマ変更と backfill の手順

本プロジェクトは `prisma db push` 運用（`prisma/migrations/` ディレクトリは存在しない）。8.5 で確定した手順は以下:

1. `schema.prisma` を編集して `User` / `Vehicle` に `sortOrder Int @default(0)` を追加
2. `npx prisma db push` でカラム追加
3. `scripts/backfill-sort-order.ts` を新規作成し、`npx tsx scripts/backfill-sort-order.ts` で実行
4. `npx prisma generate` で Prisma Client 再生成
5. dev server を再起動（Prisma Client がプロセスにキャッシュされるため必須。MEMORY 教訓 #7 参照）

`Int @default(0)` のみでは既存行がすべて `sortOrder = 0` となり、orderBy の安定性が保てない。よって **backfill スクリプトで既存レコードに createdAt 昇順の連番を付与**する。

#### scripts/backfill-sort-order.ts の内容（概要）

```ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function backfillUser() {
  // テナント単位で createdAt 昇順に 0, 1, 2, ... を付与
  const tenants = await prisma.user.findMany({
    select: { tenantId: true },
    distinct: ['tenantId'],
  })
  for (const { tenantId } of tenants) {
    const users = await prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    await prisma.$transaction(
      users.map((u, i) =>
        prisma.user.update({ where: { id: u.id }, data: { sortOrder: i } })
      )
    )
  }
}

// Vehicle / Assistance も同パターン
// Assistance は既存ロジックで max+1 が付与されているが、シード時の 0 残存に備えて再付与
async function main() {
  await backfillUser()
  await backfillVehicle()
  await backfillAssistance()
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

スクリプト実装の詳細は implementer に委ねる。要件: 冪等性（再実行しても結果が変わらない）、テナント単位の独立性、トランザクション保証。

### 2.4 Prisma orderBy 方針

すべての一覧取得で **複合キー `[sortOrder ASC, createdAt ASC]` を採用**する。

```ts
orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
```

理由:
- 同一 sortOrder の行（並び替え API の中間状態など）が発生した場合、順序が不定になるのを避ける
- `createdAt` をタイブレーカーにすることで、同点時は登録順という直感的な挙動
- パフォーマンス影響は無視できる（数十件オーダー）

対象 API:
- `GET /api/assistances`（既存: `orderBy: { sortOrder: 'asc' }` のみ → 複合キーに変更）
- `GET /api/users`（既存: `orderBy: { createdAt: 'asc' }` → 上記複合キーに変更）
- `GET /api/settings/vehicles`（既存: `orderBy: { createdAt: 'asc' }` → 上記複合キーに変更）

### 2.5 既存ロジックとの整合性

`POST /api/assistances` の sortOrder 末尾配置ロジック（`app/api/assistances/route.ts` L37-42）は既存どおり保持。

```ts
// 現状の実装（L37-42）
const maxResult = await prisma.assistance.aggregate({
  where: { tenantId: session.user.tenantId },
  _max: { sortOrder: true },
})
const nextSortOrder = (maxResult._max.sortOrder ?? -1) + 1
```

新規追加時は最大 sortOrder + 1 で末尾に配置 → リストの最後に表示される。Drag&Drop で並び替えると、reorder API が `orderedIds` の順に sortOrder を 0, 1, 2, ... と再付与する。Assistance 既存ロジックとは矛盾しない（reorder 後も「次の追加は末尾」が成立）。

`POST /api/users`（`app/api/users/route.ts` L59-82）と `POST /api/settings/vehicles`（`app/api/settings/vehicles/route.ts` L24-63）には現状 sortOrder 付与ロジックが存在しない → **Phase 1 の API 修正で末尾配置ロジック（Assistance と同パターン）を追加する**。

---

## 3. API 設計

### 3.1 共通仕様

3 つの reorder API は同一の構造を持つ。

#### リクエスト形式

```http
POST /api/{resource}/reorder
Content-Type: application/json

{
  "orderedIds": ["clx...", "cly...", "clz..."]
}
```

#### レスポンス

| ステータス | 内容 |
|---|---|
| `200` | `{ success: true }` |
| `400` | バリデーションエラー / orderedIds が空配列 / ID 重複 |
| `401` | 未認証 |
| `403` | 権限不足（ADMIN 以外） |
| `404` | orderedIds に該当テナント内に存在しない ID が含まれる |
| `409` | orderedIds の集合が現在のレコード集合と一致しない（同時編集競合） |
| `500` | DB エラー |

#### Zod スキーマ（共通定義案）

`lib/validations/schemas/reorder.ts` を新規作成し、3 API で共有する。

```ts
import { z } from 'zod'

export const reorderSchema = z.object({
  orderedIds: z
    .array(z.string().min(1))
    .min(1, '並び替え対象が空です')
    .refine(
      (ids) => new Set(ids).size === ids.length,
      { message: 'ID が重複しています' }
    ),
})

export type ReorderInput = z.infer<typeof reorderSchema>
```

`lib/validations/index.ts` に `export { reorderSchema } from './schemas/reorder'` を追加。

### 3.2-3.4 reorder API 3 本（共通仕様）

| API | ファイル | 対象テーブル | スコープ補足 |
|---|---|---|---|
| `POST /api/assistances/reorder` | `app/api/assistances/reorder/route.ts`（新規） | `Assistance` | tenantId 内全件 |
| `POST /api/users/reorder` | `app/api/users/reorder/route.ts`（新規） | `User` | tenantId 内全 User（ADMIN / MEMBER 区別なし） |
| `POST /api/settings/vehicles/reorder` | `app/api/settings/vehicles/reorder/route.ts`（新規） | `Vehicle` | tenantId 内全件（`isActive: false` の停止中車両も対象。VehiclesTab が表示するため） |

**共通ロジック（3 本とも同型）**:

1. `auth()` で session 取得 + `role !== 'ADMIN'` なら 403
2. body を `reorderSchema.safeParse` → 失敗で 400
3. 整合性検証: `prisma.{model}.findMany({ where: { tenantId }, select: { id: true } })` で取得した ID 集合が `orderedIds` と完全一致するか確認 → 不一致で 409
4. 一括更新: `prisma.$transaction(orderedIds.map((id, index) => prisma.{model}.update({ where: { id, tenantId: session.user.tenantId }, data: { sortOrder: index } })))`
5. `NextResponse.json({ success: true })`

**Tenant スコープ**: `update` の `where` 句に `tenantId` を必ず付与し、他テナントの ID を含む orderedIds で更新が走らない構造にする（手順 3 の集合一致検証と二重防御）。

### 3.5 既存 API の修正

| ファイル | 変更内容 |
|---|---|
| `app/api/assistances/route.ts` GET | `orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]` に変更 |
| `app/api/users/route.ts` GET | 同上 |
| `app/api/users/route.ts` POST | sortOrder 末尾配置ロジック追加（Assistance と同パターン） |
| `app/api/settings/vehicles/route.ts` GET | 同上 |
| `app/api/settings/vehicles/route.ts` POST | sortOrder 末尾配置ロジック追加 |

### 3.6 トランザクションの選択

3.2-3.4 では `prisma.$transaction([...array of update])` を使用する。

代替案として `prisma.$executeRaw` で 1 本の `UPDATE ... WHERE id IN (...) CASE WHEN id = ... THEN ...` 形式の SQL を発行する手もあるが、以下の理由で却下:

- 数十件オーパーで発行回数の差は実用上無視できる
- Prisma の interactive transaction は all-or-nothing を保証する
- 型安全性とテスタビリティを優先

---

## 4. UI 設計

### 4.1 共通 SortableList コンポーネント設計

3 タブで再利用可能な汎用コンポーネントを 1 つ作成する。

**新規ファイル**: `components/common/SortableList.tsx`

#### Props 設計

```ts
interface SortableListProps<T extends { id: string }> {
  items: T[]
  onReorder: (orderedIds: string[]) => Promise<void>
  renderItem: (item: T, dragHandle: React.ReactNode) => React.ReactNode
}
```

- `items`: 並び替え対象の配列（既に sortOrder 順にソート済み）
- `onReorder`: ドロップ確定時に呼ばれる。`orderedIds` を受け取り API 呼び出しを行う
- `renderItem`: 各行の描画。第 2 引数 `dragHandle` を行の左端に配置することでドラッグハンドル領域を提供

ジェネリクスにより、Assistance / User / Vehicle どの型でも型安全に使える。

#### 内部実装方針（dnd-kit 利用、概念）

- `'use client'` 必須
- 利用 import: `DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCenter, DragEndEvent`（@dnd-kit/core）/ `SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove`（@dnd-kit/sortable）/ `CSS`（@dnd-kit/utilities）
- 内部 state: `useState(props.items)` でローカル順序を保持
- センサー設定:
  - `PointerSensor`: `activationConstraint: { distance: 5 }`
  - `TouchSensor`: `activationConstraint: { delay: 150, tolerance: 5 }`
  - `KeyboardSensor`: `coordinateGetter: sortableKeyboardCoordinates`
- `onDragEnd`:
  1. `arrayMove(items, oldIndex, newIndex)` で次順を計算
  2. 旧順を `prev` に退避し `setItems(next)` で楽観的更新
  3. `await props.onReorder(next.map(i => i.id))`
  4. catch で `setItems(prev)` + `alert('並び替えの保存に失敗しました')`
- 外部 props.items 変更時の同期: `useEffect(() => setItems(props.items), [props.items])`
- 行コンポーネント `SortableRow`: `useSortable({ id: item.id })` の戻り値（`attributes, listeners, setNodeRef, transform, transition, isDragging`）を使用
  - `setNodeRef` は **行全体の `<div>`** に渡す
  - `attributes` + `listeners` は **ハンドル `<button>`** に渡す（行全体には渡さない。さもないと行全体がドラッグ起点となり編集ボタン等と競合）
  - ハンドルには `className="cursor-grab touch-none p-2 text-gray-400"`（`touch-none` は Tailwind の `touch-action: none`、iOS Safari の縦スクロール競合を防ぐ）
  - `aria-label="並び替え"` でスクリーンリーダ対応

#### ドラッグハンドルアイコン

**確定: `RxDragHandleDots2`（Radix Icons）** — 8.1 でユーザー承認済み

```ts
import { RxDragHandleDots2 } from 'react-icons/rx'
```

縦 6 ドット表現。GitHub Projects / Notion / Linear 等で採用されているデファクト UI。「掴める感」が強い。

### 4.2 各タブへの組込方針

#### 共通: button-in-button 問題

3 タブとも `<Accordion.Trigger>` は内部で `<button>` 要素として描画される（Radix 仕様）。その中にハンドル `<button>` をネストするのは HTML 仕様違反。**ハンドルは Trigger の外側** に配置し、`<div className="flex items-stretch">` で横並びレイアウトにする。

```tsx
<Accordion.Item>
  <div className="flex items-stretch">
    {dragHandle}
    <Accordion.Header className="flex-1">
      <Accordion.Trigger>...</Accordion.Trigger>
    </Accordion.Header>
  </div>
  <Accordion.Content>...</Accordion.Content>
</Accordion.Item>
```

#### AssistanceTab.tsx（374 行）

現状: `<Accordion.Root>` 直下で `assistances.map()` で `<Accordion.Item>` を描画。
変更後: `<Accordion.Root>` の中身を `<SortableList items={assistances} onReorder={...} renderItem={(a, h) => <Accordion.Item>...</Accordion.Item>} />` で包む。

`onReorder` 内で `fetch('/api/assistances/reorder', { method: 'POST', body: JSON.stringify({ orderedIds: ids }) })` を呼び、`!res.ok` で throw（SortableList 側で catch → ロールバック）。

#### MembersTab.tsx（409 行）

同パターン。各行 Trigger の右側に既存削除ボタン（`<X />`）あり、左に dragHandle を追加。

#### VehiclesTab.tsx（287 行）— **既存挙動との衝突に注意**

L42-44 の `sortedVehicles = [...vehicles].sort((a, b) => a.plateNumber.localeCompare(b.plateNumber, 'ja', { numeric: true }))` は **削除する**。さもないと API で sortOrder を更新しても、クライアント自然順ソートで並び順が上書きされる。API から返る順序（sortOrder ASC）をそのまま使用。

注意: MembersTab L72-84 の `vehicleOptionsFor`（使用車両セレクタ）は同じ自然順ソートを行っているが、本計画書のスコープでは **変更しない**（plateNumber 自然順を維持。判断は 8.2 参照）。

### 4.3 楽観的更新 + ロールバック実装パターン

**選定: `useState` ベース**（jotai / React Query は使わない）

| 候補 | 判断 |
|---|---|
| **useState** | 採用。既存 3 タブはすべて `useState` + 素の `fetch` で実装済みで整合的。SortableList 内に閉じ込められる |
| jotai | 既存設定タブで未使用。今回 3 タブ独立で共有不要 |
| React Query | 既存 fetch パターンと不整合 |

具体パターンは 4.1 の `handleDragEnd` 参照（即時 setItems → await onReorder → catch でロールバック + alert）。

### 4.4 タッチ操作の調整

`TouchSensor` の `activationConstraint` は次の初期値で開始:

```ts
useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
```

- `delay: 150ms`: 短すぎるとスクロールと誤検知。長すぎると操作感が鈍い。一般的な推奨値
- `tolerance: 5px`: 指のブレ許容値

iOS Safari の PWA 起動モードで実機検証（Phase 3 完了時、Phase 4 完了時にそれぞれ確認）し、必要なら `delay: 200` まで上げる。

### 4.5 削除ボタン・編集ボタンとの共存

| 操作領域 | 配置 |
|---|---|
| ドラッグハンドル | 行の最左端（flex の最初） |
| アコーディオン Trigger | 中央（flex-1） |
| 削除ボタン（`<X />`） | 行の最右端（既存どおり） |
| 編集ボタン | アコーディオン展開時の Content 内（既存どおり） |

ハンドル領域はクリック / タップ単発では何も起きない（ドラッグ専用）。誤操作防止のため、ハンドルがアコーディオンの開閉トリガーに伝搬しないよう `onClick={e => e.stopPropagation()}` を追加（dnd-kit の `listeners` の挙動次第で不要になる場合あり）。

---

## 5. Phase 分け

### Phase 1: Schema + backfill スクリプト + Reorder API 3 本（テスト含む）

**目的**: バックエンド基盤を完成させ、Phase 2 以降の UI 実装が API に対して直接動作確認可能な状態にする

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `prisma/schema.prisma` | 修正 | `User.sortOrder Int @default(0)`, `Vehicle.sortOrder Int @default(0)` 追加 |
| `scripts/backfill-sort-order.ts` | 新規 | 既存レコードに createdAt 昇順で連番付与（User / Vehicle / Assistance） |
| `lib/validations/schemas/reorder.ts` | 新規 | `reorderSchema` 定義 |
| `lib/validations/index.ts` | 修正 | `reorderSchema` の export 追加 |
| `app/api/assistances/reorder/route.ts` | 新規 | POST: assistance reorder |
| `app/api/users/reorder/route.ts` | 新規 | POST: user reorder |
| `app/api/settings/vehicles/reorder/route.ts` | 新規 | POST: vehicle reorder |
| `app/api/assistances/route.ts` | 修正 | GET orderBy 複合キー化（`sortOrder` 既存のため修正は最小） |
| `app/api/users/route.ts` | 修正 | GET orderBy 複合キー化 + POST sortOrder 末尾配置追加 |
| `app/api/settings/vehicles/route.ts` | 修正 | GET orderBy 複合キー化 + POST sortOrder 末尾配置追加 |
| `__tests__/api/reorder-assistances.test.ts` | 新規 | reorder API テスト |
| `__tests__/api/reorder-users.test.ts` | 新規 | 同上 |
| `__tests__/api/reorder-vehicles.test.ts` | 新規 | 同上 |
| `__tests__/lib/reorder-schema.test.ts` | 新規 | Zod スキーマテスト |

**実行手順**:
1. `schema.prisma` 編集 → `npx prisma db push` でカラム追加
2. `scripts/backfill-sort-order.ts` 作成 → `npx tsx scripts/backfill-sort-order.ts` で実行
3. `npx prisma generate` で Prisma Client 再生成
4. dev server 再起動（Prisma Client キャッシュ対策）
5. 各 API・テスト実装

**完了判定**:
- `prisma db push` 成功
- `npx tsx scripts/backfill-sort-order.ts` 成功
- `prisma studio` で `User.sortOrder` / `Vehicle.sortOrder` / `Assistance.sortOrder` が連番で入っていることを目視確認
- 全 reorder API が curl で `200 success` を返すことを手動確認
- 全テスト pass（既存 478 件 + 新規分）
- `npx tsc --noEmit` 型エラー 0
- `npm run build` エラーなし

**依存**: なし（最初の Phase）

---

### Phase 2: @dnd-kit 導入 + 共通 SortableList コンポーネント

**目的**: ライブラリインストールと共通コンポーネントの構築。React 19 / Next.js 16 環境での dnd-kit の動作を最小サンプルで検証する

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `package.json` | 修正 | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` 追加 |
| `package-lock.json` | 自動生成 | npm install 結果 |
| `components/common/SortableList.tsx` | 新規 | 共通並び替えコンポーネント（型ジェネリクス） |
| `__tests__/components/SortableList.test.tsx` | 新規 | 並び替え動作・楽観的更新・ロールバックのテスト |

**完了判定**:
- `npm install` で peer dependency 警告なし
- `npm run build` エラーなし
- `npm run dev` 起動後、最小サンプル（テスト用ページ or Storybook 的な検証ページ）で 3 行の並び替えが動作することを目視確認
- `npm test` で SortableList のテストが pass

**Phase 2 で実施する検証スパイク（重要）**:

ライブラリ導入直後、以下を確認してから本実装に進む:

1. dev server で `import { DndContext } from '@dnd-kit/core'` が解決できる
2. `DndContext` を含む小さなコンポーネントが SSR エラーなく Hydrate できる（`'use client'` 必須）
3. `npm run build` が dnd-kit を含めてバンドル成功する
4. ブラウザで PointerSensor によるマウスドラッグが動作する
5. iOS Safari (実機 or Chrome DevTools のタッチエミュレーション) で TouchSensor が動作する

これらが失敗した場合、Phase 3 以降に進まずユーザーに報告して判断を仰ぐ。

**依存**: Phase 1 完了が必要（API が無いとロールバック含めた挙動の確認ができない）

---

### Phase 3: AssistanceTab に組込

**目的**: 最も単純なタブ（行の中にネストデータが少ない）で組込パターンを確立する

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `components/settings/AssistanceTab.tsx` | 修正 | SortableList で `<Accordion.Item>` を包む。dragHandle を Trigger 内 or Trigger 外左に配置 |
| `__tests__/components/AssistanceTab.test.tsx` | 新規 or 既存修正 | 並び替え後に `/api/assistances/reorder` が呼ばれることを検証 |

**完了判定**:
- 設定画面 → アシスタンスタブで各行の左端にハンドルが表示される
- ハンドルをドラッグして並び替えると即時反映される
- ページリロード後も並び順が維持される
- API 失敗時に元の順序に戻り、alert が表示される
- 編集 / 削除 / 新規追加機能が壊れていない（リグレッション無し）
- `npm run build` / `npm test` 全 pass

**依存**: Phase 1, 2 完了が必要

---

### Phase 4: MembersTab に組込

**目的**: AssistanceTab で確立したパターンを 2 つ目のタブに適用

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `components/settings/MembersTab.tsx` | 修正 | SortableList で各行を包む。Trigger 内 button-in-button 問題に注意（4.2 参照） |
| `__tests__/components/MembersTab.test.tsx` | 新規 or 既存修正 | 並び替え後に `/api/users/reorder` が呼ばれることを検証 |

**完了判定**:
- 設定画面 → 隊員登録タブで各行の左端にハンドルが表示される
- 並び替え動作が AssistanceTab と同等に動作する
- 既存の編集 / 削除 / 新規追加 / 使用車両セレクタが壊れていない
- 自分自身を上下に並び替えてもエラーにならない（自身の削除制限はあるが並び替えは制限不要）
- `npm run build` / `npm test` 全 pass

**依存**: Phase 1, 2, 3 完了が必要

---

### Phase 5: VehiclesTab に組込

**目的**: 既存の `localeCompare` ソートを sortOrder ベースに置き換える + 並び替え組込

**変更ファイル一覧**:

| パス | 変更種別 | 内容 |
|---|---|---|
| `components/settings/VehiclesTab.tsx` | 修正 | `sortedVehicles` の `localeCompare` を削除し、API 順序をそのまま使用。SortableList で包む |
| `__tests__/components/VehiclesTab.test.tsx` | 新規 or 既存修正 | 並び替え後に `/api/settings/vehicles/reorder` が呼ばれることを検証 |

**完了判定**:
- 設定画面 → 車両管理タブで各行の左端にハンドルが表示される
- 並び替え動作が他タブと同等に動作する
- アクティブ / 停止中車両の両方が並び替え対象になる
- 既存の編集 / 削除 / 新規追加が壊れていない
- 進行中の出動に紐付いた車両を停止中にしてもエラーにならない（既存ロジック維持）
- `npm run build` / `npm run lint` / `npm test` 全 pass

**依存**: Phase 1, 2, 4 完了が必要（Phase 3 と Phase 4 は独立、Phase 5 は他 2 タブの後）

---

### Phase 順序の依存関係

```
Phase 1 (Schema + API)
  ↓
Phase 2 (@dnd-kit 導入 + SortableList)
  ↓
Phase 3 (AssistanceTab) ──┬→ Phase 4 (MembersTab) ──┬→ Phase 5 (VehiclesTab)
                          └─ 並列可能 ───────────────┘
```

Phase 3 と Phase 4 は別タブで独立しているため worktree による並列実行も可能。ただし共通の SortableList コンポーネントを使うため、Phase 3 で発見した不具合があれば Phase 4 開始前に修正すること。

---

## 6. テスト方針

### 6.1 reorder API ユニットテスト（Phase 1）

各 API（assistances / users / vehicles）に共通で以下をテスト:

- 正常系: 全件並び替えで DB の sortOrder が orderedIds 順に更新
- 認可: 未認証 → 401 / MEMBER ロール → 403 / 別テナント ID 含む → 409
- バリデーション: orderedIds 空配列 → 400 / 重複 → 400 / undefined → 400
- 整合性: 件数不一致 → 409 / 集合不一致（存在しない ID or 既存 ID 欠落）→ 409
- トランザクション: 一部 update 失敗時に全更新ロールバック（`$transaction` 仕様確認）

実装は `__tests__/api/vehicles.test.ts` のパターンを踏襲。`vi.mock('@/lib/prisma')` + `vi.mock('@/auth')` で session / DB をモック。

### 6.2 SortableList コンポーネントテスト（Phase 2）

`@testing-library/react` を使用:

| ケース |
|---|
| `items` を渡すと、各 item に対して `renderItem(item, dragHandle)` が呼ばれ、結果が描画される |
| ドラッグハンドルが各行に表示される |
| `onReorder` を成功させた場合、items の順序が変わったまま維持される |
| `onReorder` を reject させた場合、items の順序が元に戻り、`window.alert` が呼ばれる |
| 親コンポーネントが新しい `items` を渡した場合、表示順が同期される |

ドラッグ操作のシミュレーションは `@dnd-kit/core` のテスト方針に従う。dnd-kit はテスト用に `KeyboardSensor` を使った操作のシミュレーションを推奨している。

### 6.3 各タブの組込テスト（Phase 3-5）

| ケース |
|---|
| 並び替え後、対応する reorder API（fetch）が `orderedIds` を含む POST で呼ばれる |
| API 失敗時、元の順序に戻る + alert が表示される |
| 既存の機能（編集 / 削除 / 新規追加）が壊れていない（既存テスト pass） |

### 6.4 既存テスト（478 件）への影響

| テストファイル | 影響予想 |
|---|---|
| `__tests__/api/assistances-validation.test.ts` | 影響なし（sortOrder スキーマ変更なし） |
| `__tests__/api/users-validation.test.ts` | 影響なし（同上） |
| `__tests__/api/vehicles.test.ts` | GET の順序前提があれば修正要。`_count` 構造は維持 |
| `__tests__/components/*.test.tsx` の既存テスト | DOM 構造変更（dragHandle 追加）でセレクタが破綻する可能性。Phase 3-5 で都度修正 |

Phase 1 完了時点で `npm test` を実行し、影響範囲を確定。予想外の箇所が壊れたら都度ユーザーに報告。

---

## 7. リスクと対策

| # | リスク | 影響度 | 発生確率 | 対策 |
|---|---|---|---|---|
| R1 | @dnd-kit が React 19 ランタイムで動作しない（peer は満たすが内部 API が壊れている） | 高 | 低 | Phase 2 の検証スパイクで早期発見。失敗時はユーザーに報告し `@dnd-kit/react` への移行か別ライブラリ採用を検討 |
| R2 | iOS Safari PWA でのタッチ操作不能（縦スクロールとの競合） | 高 | 中 | TouchSensor の `activationConstraint: { delay: 150, tolerance: 5 }` で開始。Phase 3 完了時に実機検証必須。`touch-action: none` を dragHandle に明示 |
| R3 | Radix Accordion と SortableList のネスト不整合（Accordion.Root の直接の子要件） | 高 | 中 | Phase 3 着手時に動作確認。代替案（Radix を使わない自前アコーディオン）を予備で検討 |
| R4 | Prisma Client キャッシュ問題（schema 変更後 `User.sortOrder` / `Vehicle.sortOrder` を TS が認識しない） | 中 | 高 | Phase 1 で `prisma generate` 実行後に dev server 再起動。`AGENTS.md` の Next.js 16 警告どおり、cache 起因の挙動差異に注意 |
| R5 | 楽観的更新失敗時の UX 悪化（alert 連発） | 低 | 低 | 失敗時 1 回だけ alert。alert 後は即座に元の順序に戻すため、ユーザーが連続でドラッグしても破綻しない |
| R6 | Assistance 既存の sortOrder 末尾配置ロジックとの整合性（reorder 後に追加すると max+1 で末尾） | 低 | 低 | reorder API が必ず 0..n-1 の連番を付与するため、`max + 1` は常に `n` となり末尾配置として正しく機能する |
| R7 | 同時編集競合（管理者 A と B が同時に並び替え） | 中 | 低 | reorder API が orderedIds の集合と DB 全件の集合を比較し不一致なら 409 を返す。フロントは alert で再読込を促す |
| R8 | button-in-button 問題（Accordion.Trigger 内に dragHandle button をネスト） | 中 | 中 | 4.2 の対処方針どおり、ハンドルを Trigger の **外側** に配置。flex で横並びレイアウト |
| R9 | VehiclesTab の `localeCompare` 廃止による既存利用者への混乱 | 低 | 低 | 初期 sortOrder を createdAt 昇順で付与するため、リリース直後の表示順は既存と異なる可能性あり。リリースノートで「初回表示順は管理者がドラッグで調整可能」と明記 |
| R10 | offlineFetch 経由の reorder（オフライン時の並び替え） | 低 | 低 | 設定画面は管理者のオンライン操作前提。オフラインキューイングは対象外。ただし fetch 失敗時のロールバック動作は機能する |
| R11 | dnd-kit 後継 `@dnd-kit/react` への将来移行コスト | 低 | 中 | SortableList を 1 つの共通コンポーネントに集約しているため、移行時は SortableList のみ書き換えれば各タブは無修正で済む |

**最大リスク R3 の深掘り**: Phase 3 着手前に Radix Accordion 仕様を `node_modules/@radix-ui/react-accordion/dist/index.d.ts` と公式 docs の Anatomy で確認。`Accordion.Root` の子に `<div ref={setNodeRef}>` が挟まる構造で動作するか実機検証。動作不可なら、`useState` ベースの自前アコーディオン（開閉状態管理 + `<button>` + 条件描画）にフォールバック。Radix のアクセシビリティ・アニメーションは一部失われる。

---

## 8. ユーザー承認済み事項（2026-04-27 確定）

すべての項目について、ユーザー承認済み。

### 8.1 ドラッグハンドルアイコン

**確定: `RxDragHandleDots2`（Radix Icons）**

```ts
import { RxDragHandleDots2 } from 'react-icons/rx'
```

縦 6 ドット表現。Notion / GitHub Projects / Linear 等で採用されている標準的なドラッグハンドル UI。`IoMdMenu` はハンバーガーメニューと混同される懸念があるため不採用。

### 8.2 MembersTab の使用車両セレクタの並び順

**確定: 現状維持（plateNumber localeCompare 自然順）**

MembersTab L72-84 の `vehicleOptionsFor` は変更しない。ナンバーで探しやすい運用を優先。VehiclesTab の sortOrder 順と一貫させたい場合は別タスク。

### 8.3 reorder API のレスポンス形式

**確定: `{ success: true }` のみ**

楽観的更新で UI を先行させるため返却データ不要。フロントは失敗時のロールバック以外で再 fetch を行わない。

### 8.4 reorder API の権限

**確定: ADMIN 限定**

設定画面自体が ADMIN 専用 UI のため、reorder API も ADMIN 限定。MEMBER ロールは 403。

### 8.5 backfill SQL の実行方法

**確定: 既存の `prisma db push` 運用を維持し、backfill は専用スクリプトで実行**

理由: `prisma/migrations/` ディレクトリが存在せず、本プロジェクトは `prisma db push` で運用されている。今回の機能追加スコープで `prisma migrate dev` 運用への切替は行わない。

手順は 2.3 を参照。`scripts/backfill-sort-order.ts` を新規作成し、Phase 1 で 1 度だけ手動実行する。本番環境がデプロイされた際は、別途デプロイ手順に backfill 実行を組み込む（本計画書スコープ外）。

### 8.6 Phase 順序

**確定: タブ単位（Phase 3 = AssistanceTab、Phase 4 = MembersTab、Phase 5 = VehiclesTab）**

各タブ独立にリリース・ロールバックできる構成を維持。

### 8.7 並び替えの取り消し（Undo）

**確定: 提供しない（スコープ外）**

失敗時の alert + 自動ロールバックで対応。成功後の Undo は本計画書スコープ外。

---

## 9. オフライン対応

設定画面（タブ全般）は **管理者向けオンライン操作前提** のため、reorder API のオフラインキューイングは行わない。

理由:
- 管理者のスマホは通常オフィス内（Wi-Fi 圏内）で操作される
- 隊員アプリのようにオフライン操作を保証する必要が低い
- オフライン時に並び替えると、後から同期する際に他の管理者の並び替えと競合する可能性が高く、UX 上の混乱を招く

**挙動**: オフライン時にドラッグした場合、API が失敗 → 楽観的更新がロールバック → alert で通知。

---

## 10. ファイル変更サマリ

### 新規ファイル（11）

| パス | Phase | 責務 |
|---|---|---|
| `scripts/backfill-sort-order.ts` | 1 | 既存レコードへの sortOrder 連番付与（一度だけ実行） |
| `lib/validations/schemas/reorder.ts` | 1 | reorderSchema |
| `app/api/assistances/reorder/route.ts` | 1 | アシスタンス並び替え API |
| `app/api/users/reorder/route.ts` | 1 | 隊員並び替え API |
| `app/api/settings/vehicles/reorder/route.ts` | 1 | 車両並び替え API |
| `__tests__/api/reorder-assistances.test.ts` | 1 | API テスト |
| `__tests__/api/reorder-users.test.ts` | 1 | API テスト |
| `__tests__/api/reorder-vehicles.test.ts` | 1 | API テスト |
| `__tests__/lib/reorder-schema.test.ts` | 1 | Zod スキーマテスト |
| `components/common/SortableList.tsx` | 2 | 共通並び替えコンポーネント |
| `__tests__/components/SortableList.test.tsx` | 2 | コンポーネントテスト |

### 修正ファイル（7）

| パス | Phase | 変更内容 |
|---|---|---|
| `prisma/schema.prisma` | 1 | User / Vehicle に sortOrder 追加 |
| `lib/validations/index.ts` | 1 | reorderSchema export 追加 |
| `app/api/assistances/route.ts` | 1 | GET orderBy 複合キー化 |
| `app/api/users/route.ts` | 1 | GET orderBy 複合キー化 + POST 末尾配置 |
| `app/api/settings/vehicles/route.ts` | 1 | GET orderBy 複合キー化 + POST 末尾配置 |
| `package.json` | 2 | @dnd-kit 3 パッケージ追加 |
| `components/settings/AssistanceTab.tsx` | 3 | SortableList 組込 |
| `components/settings/MembersTab.tsx` | 4 | SortableList 組込 |
| `components/settings/VehiclesTab.tsx` | 5 | localeCompare 廃止 + SortableList 組込 |

### 既存テスト修正（影響範囲は Phase 1 完了時に確定）

- `__tests__/api/vehicles.test.ts`（GET レスポンス順序前提のケースがあれば）
- `__tests__/components/MembersTab.test.tsx`（DOM 構造変更で破綻するセレクタがあれば）
- `__tests__/components/AssistanceTab.test.tsx`（同上、存在する場合）

合計: 新規 11 ファイル + 修正 9 ファイル + 既存テスト微修正

---

## 11. 見積り（Phase 別）

| Phase | 変更ファイル数 | 新規行数（概算） | 難易度 |
|---|---|---|---|
| 1: Schema + API | 14 | ~400 行 | 中（DB マイグレーション + テスト） |
| 2: SortableList | 4 | ~250 行 | **高**（dnd-kit 検証 + ジェネリクス設計） |
| 3: AssistanceTab | 2 | ~50 行 | 中（Radix Accordion ネスト確認） |
| 4: MembersTab | 2 | ~50 行 | 低（Phase 3 で確立したパターン適用） |
| 5: VehiclesTab | 2 | ~50 行 | 低（同上 + localeCompare 削除） |
| **合計** | **24** | **~800 行** | - |

最大リスクは Phase 2（dnd-kit の React 19 / Next.js 16 互換性検証）。Phase 1 完了後の最初に検証スパイクを実施し、問題があれば Phase 3 以降に進まない。
