# 管理者ダッシュボード 実装計画

作成日: 2026-04-27
対象プロジェクト: `/Users/miyagawakiyomi/Projects/rodo/app`
対象スタック: Next.js 16.2.3 / React 19.2.4 / Prisma 6.19.3 (PostgreSQL) / Tailwind 4 / next-auth 5.0 beta / @tanstack/react-query 5.99 / jotai 2.19 / Vitest
作業ブランチ（予定）: `feature/admin-dashboard`

---

## 1. 概要

### 1.1 目的
ロードサービス業務アプリ RODO に管理者専用機能を追加する。現状、ADMIN ロールでログインしても隊員と同じホーム画面（`HomeClient.tsx`）と「設定」リンクしか表示されない。今回、管理者の業務フロー（隊員ステータスのリアルタイム把握、全案件の閲覧・修正、請求管理、未処理案件のカレンダー可視化）に必要な UI と API を整備する。

### 1.2 背景
- `auth.ts` の session は `role` / `tenantId` / `userId` を保持済み。認可の土台は揃っている。
- `HomeClient.tsx` は ADMIN 向けに `<a href="/settings">設定</a>` を出すのみ（line 133-135）。
- `SettingsClient.tsx` は Radix Tabs ベースで完成しており、変更不要。
- `DispatchClient.tsx`（1537 行）は出動隊員視点のフローに最適化されており、管理者の編集 UI に流用するのは重い。別系統の編集画面を起こす方針が妥当。
- 想定テナント規模は 20 名以下。リアルタイム性は 10 秒ポーリングで十分。
- 本アプリはリリース後、紙ベースの業務台帳と一定期間併用しながら運用検証を行う方針。併用期間中は紙で請求した案件もアプリ上で「請求済みボタン」を押し、アプリ側のデータと紙の運用を同期させる。

### 1.3 対象ユーザー
- ADMIN ロールの管理者（兼任で出動もする）。
- MEMBER ロールには影響しない（既存ホーム・出動フローは維持）。

---

## 2. 確定要件（壁打ち済み）

### 2.1 隊員ステータス
- 粒度: **待機中 / 出動中（サブフェーズ）/ 休憩中** の 3 ステート。
- 出動中サブフェーズ: 出動中 → 作業中 → 搬送中 → 帰社中。
- 排他: 業務上、休憩は待機中にのみ取るため、出動中と休憩中は同時発生しない。
- 導出ロジック（優先順位順）:
  1. アクティブな `BreakRecord`（`endTime IS NULL`）が存在 → **休憩中**
  2. アクティブな `Dispatch`（`status` が `DISPATCHED` / `ONSITE` / `TRANSPORTING` / `COMPLETED` 帰社前）が存在 → **出動中** + サブフェーズ
  3. どちらもなし → **待機中**
- 注: `DispatchStatus.WORKING` enum は `prisma/schema.prisma` に存在するが、実際の遷移ロジック（`DispatchClient.tsx` / `SecondaryDispatchClient.tsx` / `VALID_STATUS_TRANSITIONS`）では一切使用されていないデッドコード。本機能では使用しない（要件外）。将来のクリーンアップは別タスクとする。

### 2.2 案件管理
- ライフサイクル: 下書き（`isDraft=true`）→ 出動中（`STANDBY`〜`TRANSPORTING`）→ 完了（`COMPLETED`）/ 保管（`STORED`）→ 報告書完成（`Report.isDraft=false`）→ 請求済み（`Dispatch.billedAt IS NOT NULL`）。
- 請求管理: `Dispatch.billedAt DateTime?` を追加。`null` = 未請求、値あり = 請求済み。
- 持ち越し: 前日以前の未請求案件を視覚的に強調（赤バッジまたは行ハイライト）。
- カレンダー: 月間表示。「未処理案件（=未請求 or 報告書下書き）」がある日にバッジ。
- 修正範囲: 全項目編集可能（管理者の請求業務上、明らかな誤りを修正する必要があるため）。
- 監査ログ: 不要。隊員側に「修正された」表示も不要。

### 2.3 リアルタイム
- 採用: **React Query の `refetchInterval: 10000`**（10 秒）。
- 不採用: Pusher / SSE / WebSocket（20 名以下想定で過剰）。

### 2.4 UI 構造
- 管理者専用ハンバーガーメニュー（☰）。
  - スマホ: スライドメニュー（左から）。
  - PC: 常時表示サイドバー（`md:` ブレークポイント）。
- メニュー項目: ホーム / ダッシュボード / 案件管理 / 設定 / ログアウト。
- 既存ホーム（`HomeClient.tsx` のアシスタンスボタン）は管理者でも維持（管理者も出動するため）。`HomeClient.tsx` 内の `<a href="/settings">設定</a>` リンクはハンバーガー化に伴い削除。
- 設定画面（`SettingsClient.tsx`）は既存のまま、ハンバーガーから遷移する。

### 2.5 請求画面
- PC 左右分割: 左に「報告兼請求項目」、右に「各会社の請求画面」。
- 入力完了後「請求済み」ボタンで `Dispatch.billedAt` をセット。
- 各アシスタンス会社の請求フォーマット差異は **Phase 5 着手前に追加ヒアリング**（本計画書のスコープ外）。

---

## 3. データモデル変更

### 3.1 スキーマ追加
`prisma/schema.prisma` の `Dispatch` モデルに 1 列追加。

```prisma
model Dispatch {
  // ... 既存フィールド ...

  /// 請求済みタイムスタンプ。NULL = 未請求、値あり = 請求済み。
  billedAt DateTime?

  // ... 既存フィールド ...
}
```

合わせてインデックス追加（カレンダーの未処理判定 / 請求一覧フィルタを高速化）:
```prisma
@@index([tenantId, billedAt])
```

### 3.2 マイグレーション戦略
- マイグレーション名: `add_billed_at_to_dispatch`
- 全行のデフォルトは `NULL`（=未請求）。既存データは「未請求扱い」になる。
- 本機能リリース時点で本アプリは未稼働。DB に過去案件は存在しないため、`billedAt` 列追加に伴う既存データ移行は不要。紙併用期間中は、紙で請求した案件をアプリ上でも「請求済みボタン」で同期する運用とする。
- 手順:
  1. `npx prisma migrate dev --name add_billed_at_to_dispatch`
  2. `npm run build` で型生成エラーがないことを確認。
  3. 本番反映前に `prisma migrate diff` で SQL を確認。

### 3.3 型エクスポート
- 既存の Prisma 型がそのまま反映される。Zod schema（`lib/validations.ts`）に `billedAt` を含む `updateDispatchSchema` 拡張版を追加するか、管理者用のスキーマを別建てする（Phase 1 で判断）。

---

## 4. API 設計

すべて `/api/admin/*` 配下に配置。**全エンドポイントで以下の共通認可** を冒頭に置く。

```ts
const session = await auth()
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

`tenantId` は session から取得し、すべてのクエリの `where` に必ず含める（テナント分離はアプリ層で担保）。

### 4.1 GET `/api/admin/members-status`
**目的**: 隊員一覧 + 各隊員のリアルタイムステータス（待機 / 出動 / 休憩）を返す。

**ファイル**: `app/api/admin/members-status/route.ts`

**Query**: なし。

**Response**:
```ts
{
  members: Array<{
    id: string
    name: string
    vehicle: { plateNumber: string; displayName: string | null } | null
    status: 'STANDBY' | 'DISPATCHING' | 'BREAK'
    // status === 'DISPATCHING' の場合のみ埋まる
    activeDispatch: {
      id: string
      dispatchNumber: string
      subPhase: 'DISPATCHING' | 'ONSITE' | 'TRANSPORTING' | 'RETURNING_TO_BASE'
      assistanceName: string
    } | null
    // status === 'BREAK' の場合のみ埋まる
    activeBreak: {
      id: string
      startTime: string  // ISO
    } | null
  }>
  fetchedAt: string  // ISO（クライアント側で「N 秒前」を計算）
}
```

**実装方針**:
- 1 クエリで `prisma.user.findMany` + `dispatches` (アクティブのみ) + `breakRecords` (`endTime: null` のみ) を `include`。
- ステータス導出は API 層で確定（クライアントには加工済みデータのみ返す）。
- `subPhase` のマッピング:
  - `DISPATCHED` → `'DISPATCHING'`（表示: 出動中）
  - `ONSITE` → `'ONSITE'`（表示: 作業中）
  - `TRANSPORTING` → `'TRANSPORTING'`（表示: 搬送中）
  - `COMPLETED && returnTime IS NULL` → `'RETURNING_TO_BASE'`（表示: 帰社中）
- 以下の status は `activeDispatch` 判定から除外（隊員ステータスは「待機中」扱い）:
  - `WORKING`（schema にだけ存在するデッドコード、実遷移には現れない）
  - `COMPLETED && returnTime IS NOT NULL`（帰社済み）
  - `RETURNED`（帰社済み）
  - `STORED`（保管済み）

**ポーリング**: クライアント側で `useQuery` の `refetchInterval: 10000`。

### 4.2 GET `/api/admin/dispatches`
**目的**: 全案件の一覧取得（ページング・フィルタ対応）。

**ファイル**: `app/api/admin/dispatches/route.ts`

**Query**:
| キー | 型 | 用途 |
|---|---|---|
| `from` | `YYYY-MM-DD` | dispatchTime 下限 |
| `to` | `YYYY-MM-DD` | dispatchTime 上限 |
| `status` | `'draft' \| 'active' \| 'completed' \| 'unbilled' \| 'billed' \| 'all'` | ステータスフィルタ |
| `userId` | `string` | 担当隊員フィルタ |
| `assistanceId` | `string` | アシスタンス会社フィルタ |
| `page` | `number` | ページ番号（1 始まり、デフォ 1） |
| `pageSize` | `number` | ページサイズ（デフォ 50、上限 200） |

**Response**:
```ts
{
  dispatches: Array<{
    id: string
    dispatchNumber: string
    dispatchTime: string | null
    status: DispatchStatus
    isDraft: boolean
    billedAt: string | null
    type: 'ONSITE' | 'TRANSPORT'
    user: { id: string; name: string }
    assistance: { id: string; name: string; displayAbbreviation: string }
    customerName: string | null
    plate: { region: string; class: string; kana: string; number: string } | null
    report: { id: string; isDraft: boolean; totalConfirmedAmount: number | null } | null
  }>
  total: number
  page: number
  pageSize: number
}
```

**実装方針**:
- 既存 `app/api/dispatches/route.ts` の `where` 構築を参考にしつつ、ADMIN なので `userId` 強制フィルタは外す。
- `unbilled` フィルタ: `billedAt: null`。
- `billed` フィルタ: `billedAt: { not: null }`。
- ソート: `dispatchTime DESC NULLS LAST, createdAt DESC`。
- 案件件数が将来増えるリスクに備え、最初から page/pageSize を実装。

### 4.3 GET `/api/admin/calendar`
**目的**: 月間カレンダー用のサマリ（日付ごとの案件件数 / 未処理件数）。

**ファイル**: `app/api/admin/calendar/route.ts`

**Query**:
| キー | 型 | 用途 |
|---|---|---|
| `year` | `number` | 対象年（例 2026） |
| `month` | `number` | 対象月（1-12） |

**Response**:
```ts
{
  year: number
  month: number
  days: Array<{
    date: string  // YYYY-MM-DD
    totalCount: number      // dispatchTime がその日の案件総数
    unprocessedCount: number  // 未請求 or 報告書 isDraft=true の件数
  }>
}
```

**実装方針**:
- `prisma.dispatch.findMany` を JST 月初〜月末の範囲で取り、API 層で日別集計。
- DB 側の `GROUP BY` を使う場合は raw SQL になるため、まず Prisma の通常クエリで実装し、件数増大時に最適化。
- JST 境界処理は既存 `app/api/dispatches/route.ts` の dispatchNumber 採番ロジック（`jstOffset = 9 * 60 * 60 * 1000`）と整合させる。

### 4.4 PATCH `/api/admin/dispatches/[id]/billing`
**目的**: 「請求済み」ボタンで `billedAt` をセット / 解除する。

**ファイル**: `app/api/admin/dispatches/[id]/billing/route.ts`

**Body**:
```ts
{ billed: boolean }   // true=請求済みにする, false=未請求に戻す
```

**Response**:
```ts
{ id: string; billedAt: string | null }
```

**実装方針**:
- `billed: true` の場合は `billedAt: new Date()` をセット。
- `billed: false` の場合は `billedAt: null`。
- テナント検証: `prisma.dispatch.update({ where: { id, tenantId } })` の where 条件に必ず `tenantId` を入れる。

> 注記: ページは `/admin/billing/[id]` 配下、API は `/api/admin/dispatches/[id]/billing` 配下に配置（ページ階層と API 階層を分離）。

### 4.5 既存 API の拡張（補足）
- 案件全項目修正は既存 `PATCH /api/dispatches/[id]` を流用したいが、現状の `updateDispatchSchema`（`lib/validations.ts`）が許可するフィールドが隊員視点に絞られている可能性あり。Phase 1 で `lib/validations.ts` を確認し、ADMIN 専用の `adminUpdateDispatchSchema`（全フィールド許可）を別建てするか、共通 schema にフィールド追加するかを決める。**現時点の方針: ADMIN 専用エンドポイント `/api/admin/dispatches/[id]` を別途作成し、認可は ADMIN 限定で全フィールド更新を許可する。** これにより既存の隊員フローへの影響を最小化する。

---

## 5. ファイル構成

### 5.1 新規追加ファイル

#### サーバー側
- `prisma/migrations/{timestamp}_add_billed_at_to_dispatch/migration.sql`
- `app/api/admin/members-status/route.ts`
- `app/api/admin/dispatches/route.ts`
- `app/api/admin/dispatches/[id]/route.ts`
- `app/api/admin/dispatches/[id]/billing/route.ts`
- `app/api/admin/calendar/route.ts`

#### ページ
- `app/admin/layout.tsx`（ADMIN 認可 + ハンバーガーメニュー枠）
- `app/admin/dashboard/page.tsx`
- `app/admin/dispatches/page.tsx`
- `app/admin/dispatches/[id]/page.tsx`（編集画面）
- カレンダーは `app/admin/dispatches/page.tsx` 内のタブとして実装する方針を採用（独立ページ `app/admin/calendar/page.tsx` は作成しない）。理由: ワイヤーフレーム §6.3 で同一ページ内のタブ切替で設計しているため、ページ分離するとフィルタ状態の引き継ぎが複雑化する。
- `app/admin/billing/[id]/page.tsx`（Phase 5）

#### コンポーネント
- `components/admin/AdminShell.tsx`（ハンバーガー + サイドバー枠）
- `components/admin/AdminMenu.tsx`（メニュー項目定義）
- `components/admin/MemberStatusCard.tsx`
- `components/admin/MemberStatusGrid.tsx`（ポーリング含む）
- `components/admin/TodayDispatchSummary.tsx`
- `components/admin/DispatchTable.tsx`
- `components/admin/DispatchTableFilters.tsx`
- `components/admin/DispatchCalendar.tsx`
- `components/admin/DispatchEditForm.tsx`（DispatchClient とは別の管理者用編集フォーム）
- `components/admin/BillingSplitView.tsx`（Phase 5）

#### Hooks / Utils
- `hooks/useMembersStatus.ts`（React Query + 10s ポーリング）
- `hooks/useAdminDispatches.ts`
- `lib/admin/status-derivation.ts`（テストしやすいように純粋関数で導出ロジックを切り出す）

#### テスト
- `__tests__/api/admin/members-status.test.ts`
- `__tests__/api/admin/dispatches.test.ts`
- `__tests__/api/admin/calendar.test.ts`
- `__tests__/api/admin/billing.test.ts`
- `__tests__/lib/admin/status-derivation.test.ts`
- `__tests__/components/admin/MemberStatusCard.test.tsx`
- `__tests__/components/admin/DispatchTable.test.tsx`

### 5.2 改修ファイル
| ファイル | 改修内容 |
|---|---|
| `prisma/schema.prisma` | `Dispatch.billedAt` 追加、`@@index([tenantId, billedAt])` 追加 |
| `lib/validations.ts` | `updateAdminDispatchSchema` / `billingSchema` を追加 |
| `components/HomeClient.tsx` | line 133-135 の `<a href="/settings">設定</a>` を削除（ハンバーガーに統合） |
| `app/page.tsx` | ADMIN ログイン時の遷移先を `/admin/dashboard` に変更するか検討。**初期版は維持（ホーム=出動画面のまま、ハンバーガーから管理者ページへ）** とし、業務運用に合わせて後日調整 |
| `app/settings/page.tsx` | 既存維持。`/admin/settings` にエイリアスを張るかは Phase 2 で判断 |

---

## 6. 画面ワイヤーフレーム

### 6.1 ハンバーガーメニュー（PC: サイドバー / SP: スライドメニュー）

```
PC (md以上):
┌────────┬────────────────────────────┐
│ RODO   │ ヘッダー（ページタイトル / ユーザー名）   │
│        ├────────────────────────────┤
│ ホーム   │                              │
│ ダッシュ │                              │
│ ボード   │     コンテンツ                  │
│ 案件管理 │                              │
│ 設定    │                              │
│ ─────  │                              │
│ ログアウト│                              │
└────────┴────────────────────────────┘

SP (md未満):
┌────────────────────────────────────┐
│ ☰ RODO       管理者ダッシュボード       │
├────────────────────────────────────┤
│                                    │
│        コンテンツ                    │
│                                    │
└────────────────────────────────────┘

☰ をタップ:
┌─────────┐
│ × 閉じる │
├─────────┤
│ ホーム    │
│ ダッシュ  │
│ ボード    │
│ 案件管理  │
│ 設定     │
│ ─────   │
│ ログアウト│
└─────────┘
```

### 6.2 ダッシュボード（`/admin/dashboard`）

```
┌──────────────────────────────────────────────┐
│ 管理者ダッシュボード        最終更新: 12 秒前 ↻ │
├──────────────────────────────────────────────┤
│ ▼ 隊員ステータス                               │
│ ┌────────┬────────┬────────┬────────┐       │
│ │ 山田   │ 鈴木   │ 田中   │ 佐藤   │       │
│ │ ●出動中│ ●休憩中│ ○待機中│ ●出動中│       │
│ │ 現場   │ 03:24  │        │ 搬送   │       │
│ │ #20260427-001         │ #20260427-003     │       │
│ │ PA / 練馬500   │      │ AWP / 品川500     │       │
│ └────────┴────────┴────────┴────────┘       │
│                                              │
│ ▼ 今日の案件サマリ                             │
│ ┌──────────┬──────────┬──────────┐         │
│ │ 進行中    │ 完了      │ 未請求    │         │
│ │   3      │   5      │  12      │         │
│ └──────────┴──────────┴──────────┘         │
│                                              │
│ ▼ 持ち越し案件（前日以前の未請求）              │
│ ┌──────────────────────────────────────┐     │
│ │ #20260425-002 山田 PA 練馬500あ1234  │     │
│ │ #20260424-001 鈴木 SC 横浜300い5678  │     │
│ └──────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

### 6.3 案件管理（`/admin/dispatches`）

```
┌────────────────────────────────────────────────┐
│ 案件管理                                        │
├────────────────────────────────────────────────┤
│ [テーブル] [カレンダー]                          │
├────────────────────────────────────────────────┤
│ フィルタ: [▼期間] [▼ステータス] [▼隊員] [▼AS]  │
├────────────────────────────────────────────────┤
│ 案件番号       日時      隊員  AS  状態  請求    │
│ 20260427-001  10:23    山田  PA  完了  未請求 ⚠ │
│ 20260427-002  11:05    鈴木  SC  搬送中 -      │
│ 20260426-005  09:11    田中  AWP 完了  請求済   │
│ ...                                              │
│ < 1 2 3 ... 50 >                                │
└────────────────────────────────────────────────┘

カレンダー切替時:
┌────────────────────────────────────────────────┐
│ 2026 年 4 月        < 前月  今月  次月 >         │
├──┬──┬──┬──┬──┬──┬──┤                       │
│日│月│火│水│木│金│土│                       │
├──┼──┼──┼──┼──┼──┼──┤                       │
│ 1│ 2│ 3│ 4│ 5│ 6│ 7│  ← 件数 + 未処理バッジ   │
│  │5 │3⚠│2 │  │1 │  │                       │
├──┼──┼──┼──┼──┼──┼──┤                       │
│...│                                          │
└────────────────────────────────────────────────┘
```

### 6.4 案件編集（`/admin/dispatches/[id]`）

```
┌─────────────────────────────────────────┐
│ ← 案件編集 #20260427-001                │
├─────────────────────────────────────────┤
│ 基本情報                                  │
│  担当隊員  [▼山田]                       │
│  アシスタンス [▼PA]                      │
│  状態     [▼完了]                       │
│  下書き   [□]                          │
├─────────────────────────────────────────┤
│ 出動情報                                  │
│  出動時刻  [10:23]                       │
│  現場到着  [10:45]                       │
│  完了時刻  [11:30]                       │
│  帰社時刻  [12:00]                       │
│  各 ODO ...                             │
├─────────────────────────────────────────┤
│ 案件詳細                                  │
│  顧客名 / 車両 / プレート ...             │
├─────────────────────────────────────────┤
│ 報告書（紐付け表示）                       │
│  確定金額 [¥48,000]                      │
│  下書き  [□]                           │
├─────────────────────────────────────────┤
│ [請求画面へ →]    [保存]   [キャンセル] │
└─────────────────────────────────────────┘
```

### 6.5 請求画面（PC 専用 `/admin/billing/[id]`、Phase 5）

```
┌────────────────────────────────────────────────────┐
│ 請求 #20260427-001 (PA)              [請求済みにする]│
├──────────────────────────┬─────────────────────────┤
│ 報告兼請求項目            │ PA 請求フォーマット      │
│ ─────────              │ ─────────             │
│ 距離合計  X km           │ [PA 専用入力欄群]       │
│ 高速料金 ¥Y              │                          │
│ 作業内容 ...             │                          │
│ 確定金額 ¥Z              │                          │
│                          │                          │
│                          │                          │
└──────────────────────────┴─────────────────────────┘
```

---

## 7. Phase 別タスク分解

### Phase 1: スキーマ拡張 + 管理者用 API 4 本

**目的**: データレイヤと API レイヤを先行整備。UI なしで API 単体テストを通せる状態にする。

**タスク**:
1. `prisma/schema.prisma` に `Dispatch.billedAt`、`@@index([tenantId, billedAt])` を追加。
2. `npx prisma migrate dev --name add_billed_at_to_dispatch` を実行。
3. `lib/validations.ts` に `adminUpdateDispatchSchema` / `billingSchema` を追加。
4. `lib/admin/status-derivation.ts`（純粋関数で隊員ステータス導出）を新規作成。
5. API 4 本を実装:
   - `app/api/admin/members-status/route.ts`
   - `app/api/admin/dispatches/route.ts`
   - `app/api/admin/dispatches/[id]/route.ts` (PATCH 全項目編集)
   - `app/api/admin/dispatches/[id]/billing/route.ts`
   - `app/api/admin/calendar/route.ts`
6. 各 API のテスト（モック Prisma + auth）を `__tests__/api/admin/` に追加。
7. `DispatchStatus.WORKING` の使用実態を grep で確認し、Phase 1 報告書に [未確認] → [確認済み] への変更を記載。

**成果物**:
- マイグレーションファイル 1 件
- API ルート 5 ファイル
- バリデーションスキーマ 2 件
- 純粋関数 1 ファイル + 単体テスト
- API テスト 4 ファイル

**完了条件**:
- `npm run test` がグリーン
- `npm run build` がグリーン
- 手動で `curl -H "Cookie: ..." http://localhost:3000/api/admin/members-status` が想定 JSON を返す

**想定ファイル数**: 新規 12〜15、改修 2

---

### Phase 2: ハンバーガーメニュー + /admin ルーティング

**目的**: 管理者ページの土台（認可・ナビゲーション）を作る。

**タスク**:
1. `app/admin/layout.tsx` を作成。`auth()` で ADMIN チェック、非 ADMIN は `/` へリダイレクト。
2. `components/admin/AdminShell.tsx`（PC サイドバー / SP スライドメニュー）を作成。
3. `components/admin/AdminMenu.tsx`（メニュー項目配列）を作成。
4. `app/admin/dashboard/page.tsx`、`app/admin/dispatches/page.tsx` の空ページ（"Coming soon" でも可）を作成。
5. `components/HomeClient.tsx` から ADMIN 用「設定」リンク（line 133-135）を削除し、ハンバーガー（PC は不要、SP のみ）に置き換え or 「管理メニューへ」ボタン化。
6. PWA viewport（既存 manifest）と整合する SP スライドの z-index / overscroll を確認。

**成果物**:
- レイアウト 1 ファイル
- AdminShell + AdminMenu コンポーネント 2 ファイル
- 空のページ 4 ファイル
- HomeClient.tsx 1 行修正

**完了条件**:
- ADMIN ログイン → `/admin/dashboard` 直 URL 訪問で表示
- MEMBER ログイン → `/admin/*` は `/` にリダイレクト
- SP（≦ 768px）でハンバーガー開閉が動作
- PC でサイドバー常時表示

**想定ファイル数**: 新規 7〜9、改修 1〜2

---

### Phase 3: ダッシュボード（隊員ステータスカード + 今日の案件サマリ）

**目的**: ダッシュボード `/admin/dashboard` を実装。

**タスク**:
1. `hooks/useMembersStatus.ts`（React Query, `refetchInterval: 10000`）を作成。
2. `components/admin/MemberStatusCard.tsx`（1 隊員分のカード）を作成。
3. `components/admin/MemberStatusGrid.tsx`（隊員一覧グリッド + 最終更新表示）を作成。
4. `components/admin/TodayDispatchSummary.tsx`（進行中 / 完了 / 未請求の 3 カード）を作成。
5. 持ち越し案件リスト（前日以前の未請求）を `useAdminDispatches` で取得して表示。
6. ダッシュボードページ組み立て。
7. テスト追加（カード表示 / ポーリング動作）。
8. React Query Provider をどこで初期化するか確定（`app/admin/layout.tsx` か `app/layout.tsx` か）。**初期方針: ADMIN 機能でしか使わないため `app/admin/layout.tsx` 内に閉じ込める**。

**成果物**:
- フック 1
- コンポーネント 4
- ダッシュボードページ実装
- テスト 2〜3

**完了条件**:
- `/admin/dashboard` で隊員ステータスがリアルタイムに（10 秒ごとに）更新される
- 隊員が休憩開始 → 30 秒以内にカード表示が「休憩中」に切り替わる（手動受け入れテスト）
- 持ち越し案件が表示される

**想定ファイル数**: 新規 7〜10

---

### Phase 4: 案件管理（テーブル + カレンダー + 編集画面）

**目的**: `/admin/dispatches` と `/admin/dispatches/[id]` を実装。

**タスク**:
1. `hooks/useAdminDispatches.ts`（一覧取得 + フィルタ）を作成。
2. `components/admin/DispatchTableFilters.tsx`（期間 / ステータス / 隊員 / AS）を作成。
3. `components/admin/DispatchTable.tsx`（ページング付きテーブル、持ち越し行の強調）を作成。
4. `components/admin/DispatchCalendar.tsx`（月間カレンダー、未処理バッジ）を作成。
5. `app/admin/dispatches/page.tsx`（テーブル / カレンダー切替タブ）を実装。
6. `components/admin/DispatchEditForm.tsx`（全項目編集フォーム、`react-hook-form` + Zod）を新規作成。**`DispatchClient.tsx` は流用しない**。
7. `app/admin/dispatches/[id]/page.tsx`（SSR で初期データ取得 → クライアント編集フォーム）を実装。
8. テスト追加（テーブル表示 / フィルタ動作 / カレンダーバッジ / 編集フォーム送信）。
9. DispatchTable の行アクションに「請求済みにする / 未請求に戻す」ボタンを追加（Phase 5 の本格的な請求画面が出来上がるまでの暫定 UI）。`PATCH /api/admin/dispatches/[id]/billing` を呼び出す。

**成果物**:
- フック 1
- コンポーネント 4〜5
- ページ 2
- テスト 4〜5

**完了条件**:
- 全テナント案件がテーブルに表示される
- ステータス / 期間フィルタが動作する
- カレンダーで未処理案件のある日にバッジ表示
- カレンダーは `/admin/dispatches` のタブ切替として実装され、独立ページは作成しない
- 編集フォームで全項目を更新でき、`PATCH /api/admin/dispatches/[id]` が呼ばれる
- 持ち越し案件（前日以前の未請求）がテーブルで赤バッジ強調される
- テーブルから billedAt の手動セット / 解除ができる

**想定ファイル数**: 新規 8〜12

---

### Phase 5: 請求画面（PC 左右分割、各会社フォーマット対応）

**※ Phase 5 着手前に追加ヒアリング・設計が必要。本計画書はラフな枠組みのみ記載。**

**前提**: 各アシスタンス会社（PA / SC / プライム / AWP / 東京海上 / グラン）の請求フォーマット詳細を業務担当者からヒアリング → サブ計画書を作成 → 承認を得てから着手。

**タスク（仮）**:
1. 各社フォーマットの共通項目 / 個別項目を分解し、汎用 + 会社別の入力スキーマを設計。
2. `components/admin/BillingSplitView.tsx`（PC 左右分割レイアウト）を作成。
3. 左パネル: 報告兼請求項目（既存 `Report` から表示）。
4. 右パネル: 会社別フォーム（`BillingFormPA.tsx` / `BillingFormSC.tsx` ...）。会社の `displayAbbreviation` で動的選択。
5. 「請求済みにする」ボタン → `PATCH /api/admin/dispatches/[id]/billing { billed: true }`。
6. 各社フォームの PDF 出力 / クリップボードコピー / メール送信などの要件は追加ヒアリング項目。

**成果物**: 追加設計後に確定。

**完了条件**: 追加設計後に確定。

**想定ファイル数**: 未確定。会社数 × フォーマット差異により 8〜20 ファイル想定。

---

## 8. リスク・懸念

| ID | リスク | 影響 | 対策 |
|---|---|---|---|
| R1 | **Phase 5 の追加設計が未完** | 請求機能リリース遅延 | Phase 5 着手前に必ずヒアリングと設計レビューを行う。Phase 1〜4 は Phase 5 と独立してリリース可能な構造にする（`Dispatch.billedAt` の手動セット UI を Phase 4 にも仮で置く） |
| R2 | **案件件数の将来的な増大** | カレンダー / 一覧 API のレスポンス劣化 | (a) ページングを最初から実装、(b) `@@index([tenantId, billedAt])` 追加、(c) カレンダー集計は将来的に raw SQL の `GROUP BY` に置換できるよう関数で隔離 |
| R3 | **DispatchClient.tsx を流用するか別途編集画面を作るか** | 工数 / 保守性のトレードオフ | **別途作成（`DispatchEditForm.tsx`）** を採用。理由: DispatchClient は隊員視点フローに最適化された 1537 行で、管理者の「全項目自由編集」とは要件が大きく異なる。流用するとフラグ分岐が爆発する |
| R4 | **`DispatchStatus.WORKING` の使用実態 [未確認]** | サブフェーズ「作業」のロジックが破綻する可能性 | Phase 1 着手時に最優先で grep 確認。未使用なら要件側を「作業」=`ONSITE` の長時間継続として再定義する案を提示し再ヒアリング |
| R5 | **管理者のホーム遷移先** | UX が割れる（ADMIN は出動画面を見たい？管理画面を見たい？） | 初期版は変更せず（既存 `app/page.tsx` のまま）、ハンバーガーから管理画面へ遷移する形で運用観察。3 か月後に切り替え判断 |
| R6 | **10 秒ポーリングの帯域コスト** | `members-status` API は管理者 1 人あたり 10 秒間隔 = 6 req/min。隊員数 20 名はレスポンスの件数であり、リクエスト数とは無関係。同時にダッシュボードを開く管理者が N 人いる場合、テナント当たり 6N req/min。通常運用では管理者は 1〜2 人なので、テナント当たり最大 12 req/min 程度。レスポンスサイズ（隊員 20 名分）も小さく、Vercel の課金にもほぼ影響しない | 当面は問題なし。将来管理者が 5 人を超える / 隊員が 50 名超で 1 レスポンスが大きくなる場合は React Query の `refetchInterval` を可変化、もしくは SSE 切り替え検討 |
| R7 | **ADMIN が誤って案件を破壊的に編集** | データ毀損 | (a) 編集画面に変更前 / 変更後の差分プレビュー、(b) 「保存」を 2 段確認に、(c) 監査ログは要件外のため Phase 4 では実装せず、運用ルールで対応 |
| R8 | **既存 `lib/validations.ts` の updateDispatchSchema との衝突** | 隊員視点の制約が ADMIN 編集を妨げる | ADMIN 用に別 schema (`adminUpdateDispatchSchema`) を新設し、既存 schema には触れない |
| R9 | **PWA + サイドバー UI のオフライン挙動** | オフライン時に管理画面の操作が中途半端に動く | ADMIN 機能はオフライン非対応として明示。Service Worker のキャッシュ対象外にする（`offlineFetch` を使わない方針） |
| R10 | **マイグレーションのロールバック** | `billedAt` 追加後にロールバックすると過去データの請求済み状態が消える | リリース後の即時ロールバック計画を立てておく。`prisma migrate diff` で逆方向 SQL を事前確認 |

---

## 9. 未確定事項（要追加ヒアリング・追加調査）

| ID | 項目 | 担当 | タイミング |
|---|---|---|---|
| Q1 | **各アシスタンス会社の請求フォーマット**（PA / SC / プライム / AWP / 東京海上 / グランの個別フィールド・出力形式） | 業務担当者 | Phase 5 着手前 |
| Q2 | **解消**: `DispatchStatus.WORKING` は schema.prisma の enum にのみ存在するデッドコード。`DispatchClient.tsx` / `SecondaryDispatchClient.tsx` / `VALID_STATUS_TRANSITIONS` のいずれにも遷移経路はなく、本機能では使用しない（サブフェーズは 4 段階に確定） | — | 解消済み |
| Q3 | **解消**（実業務未使用のため発生せず）: 本アプリはまだ未稼働で DB に過去案件が存在しない。紙併用期間中は紙で請求した案件もアプリ上で「請求済みボタン」を押す運用で同期する | — | 解消済み |
| Q4 | **ADMIN ログイン時のホーム遷移先**（`/` のままか `/admin/dashboard` に変えるか） | 業務担当者 | Phase 2 着手前（変更しないなら確認のみ） |
| Q5 | **「持ち越し」の閾値**（前日以前 / 3 日前以前 / 月跨ぎ など） | 業務担当者 | Phase 3 着手前 |
| Q6 | **ADMIN が編集した案件を隊員側に通知するか** | 業務担当者 | Phase 4 着手前（要件には「修正された表示は不要」とあるが、無音で書き換わると現場混乱の可能性） |
| Q7 | **請求業務の同時編集**（複数管理者が同時に同じ案件を編集する想定があるか） | 業務担当者 | Phase 4 / Phase 5 着手前 |
| Q8 | **テナント設定（`businessDayStartMinutes`）と「今日の案件」の境界** | 既存仕様確認 | Phase 3 着手時 |
| Q9 | **解消**: `DispatchClient.tsx` L688-690 / L817-818 で `COMPLETED ↔ RETURNED` 遷移時に `returnTime` のセット / 解除が行われていることを確認済み。「`COMPLETED && returnTime IS NULL` → 帰社中」判定ロジックは妥当 | — | 解消済み |

---

## 10. 依存関係 / 推奨実行順

```
Phase 1（スキーマ + API）
   │
   ▼
Phase 2（ハンバーガー + /admin ルーティング）
   │
   ├─────────────┐
   ▼             ▼
Phase 3       Phase 4
（ダッシュボード）（案件管理）
   │             │
   └─────┬───────┘
         ▼
       Phase 5（請求、※追加設計後）
```

- Phase 3 と Phase 4 は API（Phase 1）と土台（Phase 2）が揃っていれば **並列実行可** （worktree 推奨）。
- Phase 5 は Phase 4 で `Dispatch.billedAt` の最低限の手動操作 UI（テーブル行の「請求済みにする」ボタン）を仮実装しておけば、Phase 5 リリース前でも請求業務は最低限回せる。

---

## 11. 計画書承認後の次アクション

1. 本計画書の最終承認を得る。
2. `feature/admin-dashboard` ブランチを `main` から切る。
3. Phase 1 を implementer に委任して着手（Q2 / Q3 / Q9 は事前確認済み・解消）。
4. Phase 1 完了後、Phase 2 の `AdminShell` / `AdminMenu` 着手プロンプトを別途設計（ハンバーガーアイコンは `IoMenu from react-icons/io5` を使用）。

---

## 付録 A: 確認済み既存コード（実装計画の根拠）

| 確認事項 | 確認方法 | 根拠 |
|---|---|---|
| ADMIN ロールチェックは session で完結 | Read `auth.ts` | `session.user.role` が `'ADMIN' \| 'MEMBER'` |
| 設定画面は ADMIN ガード済み | Read `app/settings/page.tsx` | `if (session.user.role !== 'ADMIN') redirect('/')` |
| HomeClient は ADMIN に「設定」リンクのみ表示 | Read `components/HomeClient.tsx` line 133-135 | 既存の最小管理機能 |
| reorder API は ADMIN ガード + tenantId 検証パターン確立 | Read `app/api/users/reorder/route.ts` | 本計画の admin API はこのパターンを踏襲 |
| Dispatch 型は status enum で完結 | Read `prisma/schema.prisma` | 10 種の DispatchStatus + 既存 status 遷移マップ |
| BreakRecord は `endTime: null` でアクティブ判定可能 | Read `app/api/breaks/active/route.ts` | 「休憩中」判定の根拠 |
| `@dnd-kit/*` / `@tanstack/react-query` / `jotai` は導入済み | Read `package.json` | 追加依存なし（カレンダーライブラリのみ要検討、後述） |
| Vitest + Testing Library 環境済み | Read `package.json` | `npm run test` で確定 |

## 付録 B: 採用ライブラリ判断（追加検討事項）

- **カレンダー UI**: 自前実装か `react-day-picker` などの導入か。月間グリッドにバッジを載せるだけなので **自前実装で十分**（追加依存を避ける）。Phase 4 着手時に再評価。
- **テーブル UI**: ページング + フィルタを TanStack Table で組むか自前で組むか。20〜200 件/ページ程度なら **自前実装で十分**。Phase 4 着手時に再評価。
- **PDF / メール送信（Phase 5）**: 既存 `@react-pdf/renderer` が導入済みなので流用可。
