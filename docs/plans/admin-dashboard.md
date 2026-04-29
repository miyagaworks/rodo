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

> **更新履歴**: 2026-04-28 に「PC 常時表示サイドバー」案を破棄。PC でロゴ重複・操作テンポ低下が判明したため、PC は上部水平メニュー、SP はハンバーガー（右）+ 右スライドインドロワーに刷新。

#### レイアウト基本方針
- 管理者ナビゲーションは画面サイズで切り替える。
  - **PC（`md:` 以上）**: `AppHeader` 内に上部水平メニューを統合。左にロゴ／中央〜右に nav（ホーム / ダッシュボード / 案件管理 / 設定）／最右に管理者名 + ログアウトアイコン。サイドバーは持たない。
  - **SP（`md:` 未満）**: `AppHeader` は左にロゴ・右にハンバーガー（☰）のみ。☰ タップで **右から**スライドインのドロワー（`AdminShell`）。SP では「管理者」表示と単独ログアウトアイコンは AppHeader から外し、**ドロワー最下部に区切り線付きで管理者名 + ログアウト**を表示。
- メニュー項目: ホーム / ダッシュボード / 案件管理 / 設定 / ログアウト。

#### 表示制御の責務分離
- `AppHeader` に `showAdminNav?: boolean` prop（default `false`）を導入し、これで PC nav / SP ☰ の表示を切り替える。
  - **`usePathname()` で `/admin` を内部判定しない**（命名規約への密結合・テスト容易性低下を避けるため）。
  - `AdminLayoutShell` が `session.user.role === 'ADMIN'` を検証した結果のみ `showAdminNav={true}` を渡す。
  - `HomeClient` / `SettingsClient` は明示的に `showAdminNav={false}`（または default false に依存）。
  - 隊員（MEMBER）が `/admin` に直接アクセスした場合の防御は **middleware / page guard の責務**とし、`AppHeader` では扱わない。

#### アクティブ表示
- アクティブメニュー判定は `usePathname()` を利用。
- active 時は下線（金色 `#C9A961` 系の既存トークン）+ `transition` でスタイリッシュに切り替える。

#### 既存画面への影響
- 既存ホーム（`HomeClient.tsx` のアシスタンスボタン）は管理者でも維持（管理者も出動するため）。`HomeClient.tsx` 内の `<a href="/settings">設定</a>` リンクは Phase 2 で削除済み。`HomeClient` は `max-w-md` を維持（出動ボタンはスマホ前提）。
- 設定画面（`SettingsClient.tsx`）は既存のまま、PC 水平メニュー or SP ドロワーから遷移する。情報量はロール非依存のため幅は **`max-w-2xl` を ADMIN/MEMBER 共通**で適用。
- ダッシュボード / 案件管理は情報密度が高いため `max-w-6xl` を採用。

#### コンポーネント責務（決定）
| コンポーネント | PC 時 | SP 時 |
|---|---|---|
| `AppHeader` | ロゴ + 水平 nav + 管理者名/ログアウト | ロゴ + ☰ |
| `AdminMenu` | `orientation="horizontal"`（リンクのみ） | `orientation="vertical"`（リンク + 管理者名 + ログアウト） |
| `AdminShell` | DOM 出力なし（`md:hidden`） | 右スライドインのドロワー本体 |
| `AdminLayoutShell` | `AppHeader` → `main` の縦積み（flex 左右分割は撤廃、`isAdminPage` prop 廃止） | 同左 |

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
    primaryDispatches: Array<{
      dispatchNumber: string
      plate: { region: string; class: string; kana: string; number: string } | null
    }>
  }>
}
```

**実装方針**:
- 月内の `Dispatch` を `dispatchTime` で日別に集計
- 各日付に 1 次搬送（`type=ONSITE | TRANSPORT` で初動）の出動番号と車番のみを返す
- 「いつ二次搬送するか・誰が持っていくか」はカレンダーには載せない（業務状況依存のため）
- JST 境界処理は既存 `app/api/dispatches/route.ts` の dispatchNumber 採番ロジック（`jstOffset = 9 * 60 * 60 * 1000`）と整合させる。

> **Phase 4 カレンダー仕様変更（2026-04-28）**: 元設計の「totalCount / unprocessedCount」サマリ方式から、業務ヒアリングを受けて「1 次搬送の出動番号と車番を一覧で見せる」方式に変更。二次搬送の予定日時は Phase 3.5 のダッシュボード「保管中の車両」セクションで管理する。

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
- `components/admin/AdminShell.tsx`（SP 専用ドロワー。右からスライドイン。`AdminMenu orientation="vertical"` を内包。md 以上では DOM 非出力）
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
| `components/HomeClient.tsx` | line 133-135 の `<a href="/settings">設定</a>` を削除（Phase 2 で対応済み）。`max-w-md` は維持。Phase 2.5 では `showAdminNav` を渡さない（default false） |
| `components/SettingsClient.tsx` | コンテンツ幅を `max-w-2xl` に変更（ADMIN/MEMBER 共通）。Phase 2.5 では `showAdminNav` を渡さない（default false） |
| `app/page.tsx` | ADMIN ログイン時の遷移先を `/admin/dashboard` に変更するか検討。**初期版は維持（ホーム=出動画面のまま、ハンバーガーから管理者ページへ）** とし、業務運用に合わせて後日調整 |
| `app/settings/page.tsx` | 既存維持。`/admin/settings` にエイリアスを張るかは Phase 2 で判断 |
| `components/common/AppHeader.tsx` | **Phase 2.5**: `showAdminNav?: boolean` prop（default `false`）を追加。PC 時は内部に `<nav>` 水平メニューを統合（左ロゴ／中央 nav／右に管理者名 + ログアウト）。SP 時は左ロゴ + 右ハンバーガー（☰）。active 判定は `usePathname()`、active 時は金色 `#C9A961` 系下線 + transition |
| `components/admin/AdminMenu.tsx` | **Phase 2.5**: `orientation: "horizontal" \| "vertical"` prop を追加。horizontal はリンクのみ、vertical は最下部に区切り線 + 管理者名 + ログアウトを描画 |
| `components/admin/AdminShell.tsx` | **Phase 2.5**: SP 専用ドロワーに縮小（PC では DOM 非出力 = `md:hidden`）。**右スライドイン**（`right-0` 起点 + `transform translate-x-full → translate-x-0`）。中身は `AdminMenu orientation="vertical"`。ロゴ／ヘッダー機能は `AppHeader` へ移譲 |
| `components/admin/AdminLayoutShell.tsx` | **Phase 2.5**: flex 左右分割を撤廃し、`AppHeader` → `main` の縦積みに簡略化。`isAdminPage` prop を廃止。`session.user.role === 'ADMIN'` を検証した結果のみ `AppHeader` に `showAdminNav={true}` を渡す |
| `app/admin/dashboard/page.tsx` | **Phase 2.5**: コンテンツ幅を `max-w-6xl` に変更 |
| `app/admin/dispatches/page.tsx` | **Phase 2.5**: コンテンツ幅を `max-w-6xl` に変更 |
| `__tests__/components/common/AppHeader.test.tsx` | **Phase 2.5**: `showAdminNav` prop による分岐テスト、PC で nav 表示 / SP で hidden、ハンバーガー右配置のアサーション |
| `__tests__/components/admin/AdminMenu.test.tsx` | **Phase 2.5**: `orientation` prop による分岐テスト |
| `__tests__/components/admin/AdminShell.test.tsx` | **Phase 2.5**: SP 専用化、右スライドイン方向のクラス確認 |

---

## 6. 画面ワイヤーフレーム

### 6.1 管理者ナビゲーション（PC: 上部水平メニュー / SP: 右ハンバーガー + 右スライドイン）

> **更新（2026-04-28）**: 旧「PC サイドバー」「SP 左スライド」案を破棄。PC ロゴ重複・操作テンポ低下のため。

#### PC レイアウト（1440 × 900 想定）

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [RODO]   ホーム   ダッシュボード   案件管理   設定           山田 ⏻        │  ← AppHeader（h-14〜16）
│                  ━━━━━━━━━━                                              │  ← active 時のみ金色 #C9A961 下線
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                                                                          │
│                  ┌────────────────────────────────────┐                 │
│                  │       コンテンツ（max-w-6xl）        │                 │
│                  │       管理者ダッシュボード等         │                 │
│                  └────────────────────────────────────┘                 │
│                                                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

要件:
- ロゴは AppHeader 内に 1 つだけ（左サイドバーは存在しない）
- nav は中央〜右寄せ、メニュー間は適度な余白でメリハリ
- 最右端に「管理者名 ⏻（ログアウト）」を配置
- active メニューは金色 #C9A961 系の下線 + hover で transition
- ダッシュボード / 案件管理は max-w-6xl、設定は max-w-2xl、ホーム（HomeClient）は max-w-md
```

#### SP レイアウト（375 × 812 想定）

```
ドロワー閉:
┌──────────────────────────┐
│ [RODO]                ☰ │  ← AppHeader: 左ロゴ・右ハンバーガー
├──────────────────────────┤  「管理者」表示と単独ログアウトは SP では非表示
│                          │
│                          │
│      コンテンツ          │
│   （ページの max-w を    │
│    そのまま縦積み）       │
│                          │
│                          │
└──────────────────────────┘

☰ タップ → ドロワー右からスライドイン:
┌──────────────────────────┐
│ [RODO]            × ☰    │
├──────────────────────────┤
│           ┌──────────────┤
│           │  ホーム        │  ← AdminMenu orientation="vertical"
│           │  ダッシュボード │
│           │  案件管理      │
│           │  設定          │
│           ├──────────────┤  ← 区切り線
│           │  山田          │
│           │  ⏻ ログアウト  │
│           └──────────────┘
└──────────────────────────┘

要件:
- ハンバーガーは右配置（左ではない）
- ドロワーは画面右からスライドイン（Tailwind: right-0 起点 + transform translate-x-full → translate-x-0）
- ドロワー幅は w-72〜w-80 程度、背景はオーバーレイで暗転
- ドロワー最下部に区切り線 + 管理者名 + ログアウト
- 閉じるアクション: × ボタン or オーバーレイタップ or ESC キー
- PC（md 以上）では AdminShell 自体を DOM 出力しない（md:hidden）
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
│ 1│ 2│ 3│ 4│ 5│ 6│ 7│                       │
│  │ 20260402-001  │  │   ← セルに 1次搬送の出動番号 + 車番│
│  │ 練馬500あ1234 │  │                       │
│  │               │  │                       │
│  │ 20260402-002  │  │                       │
│  │ 横浜300い5678 │  │                       │
├──┼──┼──┼──┼──┼──┼──┤                       │
│...│                                          │
└────────────────────────────────────────────────┘
```

> 1 日に複数件ある場合は出動番号と車番を縦に並べる。件数が多い日はセル内スクロール or "+N 件" 表示で対応（Phase 4 着手時に判断）。「いつ・誰が」搬送するかはカレンダーには載せない。

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
| R9 | **PWA + ドロワー UI のオフライン挙動（z-index / overscroll-behavior / viewport の整合性）** | オフライン時に管理画面の操作が中途半端に動く。加えて、SP ドロワー（右スライドイン）が PWA の viewport / overscroll / 既存モーダルとの z-index で競合し描画破綻する可能性 | ADMIN 機能はオフライン非対応として明示。Service Worker のキャッシュ対象外にする（`offlineFetch` を使わない方針）。ドロワー実装時は `overscroll-behavior: contain`、明示的な z-index 階層、`viewport-fit=cover` 環境下でのセーフエリア検証を行う |
| R10 | **マイグレーションのロールバック** | `billedAt` 追加後にロールバックすると過去データの請求済み状態が消える | リリース後の即時ロールバック計画を立てておく。`prisma migrate diff` で逆方向 SQL を事前確認 |

---

## 9. 未確定事項（要追加ヒアリング・追加調査）

| ID | 項目 | 担当 | タイミング |
|---|---|---|---|
| Q1 | **各アシスタンス会社の請求フォーマット**（PA / SC / プライム / AWP / 東京海上 / グランの個別フィールド・出力形式） | 業務担当者 | Phase 5 着手前 |
| Q2 | **解消**: `DispatchStatus.WORKING` は schema.prisma の enum にのみ存在するデッドコード。`DispatchClient.tsx` / `SecondaryDispatchClient.tsx` / `VALID_STATUS_TRANSITIONS` のいずれにも遷移経路はなく、本機能では使用しない（サブフェーズは 4 段階に確定） | — | 解消済み |
| Q3 | **解消**（実業務未使用のため発生せず）: 本アプリはまだ未稼働で DB に過去案件が存在しない。紙併用期間中は紙で請求した案件もアプリ上で「請求済みボタン」を押す運用で同期する | — | 解消済み |
| Q4 | **ADMIN ログイン時のホーム遷移先**（`/` のままか `/admin/dashboard` に変えるか） | 業務担当者 | Phase 2 着手前（変更しないなら確認のみ） |
| Q5 | **解消**（前日以前で確定。Phase 3 で実装済み） | — | 解消済み |
| Q6 | **ADMIN が編集した案件を隊員側に通知するか** | 業務担当者 | Phase 4 着手前（要件には「修正された表示は不要」とあるが、無音で書き換わると現場混乱の可能性） |
| Q7 | **請求業務の同時編集**（複数管理者が同時に同じ案件を編集する想定があるか） | 業務担当者 | Phase 4 / Phase 5 着手前 |
| Q8 | **解消**（`lib/admin/business-day.ts` で対応済み） | — | 解消済み |
| Q9 | **解消**: `DispatchClient.tsx` L688-690 / L817-818 で `COMPLETED ↔ RETURNED` 遷移時に `returnTime` のセット / 解除が行われていることを確認済み。「`COMPLETED && returnTime IS NULL` → 帰社中」判定ロジックは妥当 | — | 解消済み |
| Q10 | **保管中の車両を一括で「連休後 9 時」のような時刻に揃える操作は必要か** | 業務担当者 | Phase 3.5 リリース後の運用観察 |
| Q11 | **未定状態が長期化した案件を自動でアラートするか** | 業務担当者 | Phase 3.5 リリース後の運用観察 |

---

## 10. 依存関係 / 推奨実行順

```
Phase 1（スキーマ + API）
   │
   ▼
Phase 2（ハンバーガー + /admin ルーティング）
   │
   ▼
Phase 2.5（PC レイアウト是正）
   │
   ▼
Phase 3（ダッシュボード）
   │
   ▼
Phase 3.5（保管車両の二次搬送予定日管理）
   │
   ▼
Phase 4（案件管理 + カレンダー新仕様）
   │
   ▼
Phase 5（請求、※追加設計後）
```

> Phase 3.5 と Phase 4 を並列にしない。Phase 3.5 で `Dispatch.scheduledSecondaryAt` を導入する前提で Phase 4 のカレンダーが設計される、というほどではないが、業務優先度として「保管見落とし防止」を先行させる。

- Phase 5 は Phase 4 で `Dispatch.billedAt` の最低限の手動操作 UI（テーブル行の「請求済みにする」ボタン）を仮実装しておけば、Phase 5 リリース前でも請求業務は最低限回せる。

---

## 11. 計画書承認後の次アクション

1. 本計画書の最終承認を得る。
2. `feature/admin-dashboard` ブランチを `main` から切る。
3. Phase 1 を implementer に委任して着手（Q2 / Q3 / Q9 は事前確認済み・解消）。
4. Phase 1 完了後、Phase 2 の `AdminShell` / `AdminMenu` 着手プロンプトを別途設計（ハンバーガーアイコンは `IoMenu from react-icons/io5` を使用）。
5. **Phase 2.5（PC レイアウト是正）を Phase 3 着手前に必ず完了させる**（下記参照）。

---

### 11.1 Phase 2.5: PC レイアウト是正（最優先・Phase 3 前提条件）

**経緯**: 2026-04-28 に Phase 2 完了後の実画面確認で、PC で AppHeader と AdminShell サイドバーがロゴを二重表示する不具合が判明。前任 super-agent がコードレベル確認だけで OK 判定し失敗。**実画面スクリーンショット必須**。

**目的**: §2.4 の刷新後仕様（PC 上部水平メニュー / SP 右ハンバーガー）を既存コンポーネントに反映する。Phase 3（ダッシュボード実装）は本フェーズ完了後に着手する。

**改修ファイル一覧**: §5.2 の「**Phase 2.5**」マーカー付きの行を参照（10 ファイル）。

**確定済み設計判断**:
- AppHeader の admin nav 表示は `showAdminNav?: boolean` prop で制御。`usePathname` での内部判定はしない。
- `AdminLayoutShell` が `session.user.role === 'ADMIN'` を検証した上で `showAdminNav={true}` を渡す。
- `HomeClient` / `SettingsClient` は明示的に `showAdminNav={false}`（または default false）。
- `SettingsClient` の `max-w-2xl` は ADMIN/MEMBER 共通で適用。
- ドロワーは右からスライドイン。Tailwind の `right-0` 起点 + `transform translate-x-full → translate-x-0`。

**実行順序（依存ありのため並列不可）**:
1. `AdminMenu` に `orientation` prop を追加（他コンポーネントの依存元）
2. `AppHeader` に `showAdminNav` prop と PC nav / SP ☰ の出し分けを実装
3. `AdminShell` を SP 専用に縮退（右スライドイン、PC では DOM 非出力）
4. `AdminLayoutShell` を縦積みに簡略化、`isAdminPage` prop 廃止
5. ページの `max-w` 調整 3 ファイル（dashboard / dispatches / SettingsClient）
6. テスト 3 ファイル更新
7. 検証ゲート A〜F を全通過

**検証ゲート（implementer 必須・省略不可）**:

| ID | 内容 | 合格条件 |
|---|---|---|
| A | baseline テスト件数を改修着手前に記録 | `npm test` 合格件数を変数 X として保存 |
| B | 改修後の `npm test` | 合格件数 Y が **Y ≥ X** かつ全グリーン（追加された Phase 2.5 テストにより Y > X が想定値） |
| C | `npm run lint` | エラー 0 |
| D | `npm run build` | 成功 |
| E | dev server 起動 + スクリーンショット 4 枚取得 | 解像度 PC 1440×900 / SP 375×812。下記 4 種<br>- PC `/admin/dashboard`<br>- PC `/admin/dispatches`<br>- SP `/admin/dashboard`（ドロワー閉）<br>- SP `/admin/dashboard`（ドロワー開） |
| F | スクリーンショット目視確認 | PC: ロゴ 1 個・サイドバー消失・上部水平メニュー表示・active 下線<br>SP: ロゴ左／ハンバーガー右・右からスライドイン・ドロワー内に管理者名 + ログアウト<br>隊員画面（`/`）: nav 非表示で従来通り |

> ⚠️ **コードレベル確認だけで OK 判定するのは禁止**。前任 super-agent がこれで失敗した経緯あり。スクリーンショット添付なき完了報告は受領しない。

**禁止事項**:
- `app/api/admin/*` / `lib/admin/status-derivation.ts` / `prisma/schema.prisma` / `prisma/migrations/` への変更
- `HomeClient` のヘッダー以外のロジック変更（`max-w-md` は維持）
- Phase 3 機能（ダッシュボードのカード等）の先行実装

**成果物**:
- 改修ファイル 10 件（実装 7 + テスト 3）
- スクリーンショット 4 枚（コミット履歴に添付 or `docs/screenshots/phase-2.5/` に保存）
- 完了報告（変更ファイル一覧 / baseline 件数 X / 改修後合格件数 Y / lint・build 結果 / スクショ パス / 残課題 / コミット要否確認）

**完了条件**:
- 検証ゲート A〜F を全通過。
- ユーザーがスクリーンショットを目視で承認。
- 承認後にコミット → push。

**想定ファイル数**: 改修 10（新規 0）

**リスク**:
- AGENTS.md 警告: Next.js 16.x は破壊的変更あり。implementer は `node_modules/next/dist/docs/` の関連ガイド（`usePathname` / Client Components / `app/.../layout.tsx`）を **コードを書く前に必ず参照**する。
- `AppHeader` を共有する `HomeClient` / `SettingsClient` で意図せぬ表示が起きないこと（`showAdminNav={false}` の明示で防御）。
- ドロワー方向反転で z-index / overscroll / PWA viewport の整合性が崩れないこと。

---

### 11.2 Phase 3.5: 保管車両の二次搬送予定日管理（Phase 3 補強・Phase 4 前提条件）

**背景**:
- 業務ヒアリング（2026-04-28）で、保管中（`status=STORED`）の車両について「いつ二次搬送するか」を管理者が忘れやすいことが判明。
- 業務フロー: 保険会社から「いつどこへ搬送して」の依頼が来る。午前回収 → 当日午後 / 夜回収 → 翌日 / 連休中保管 → 連休明け、等のパターン。
- 現状は紙台帳で管理。アプリ化により管理者の見落としを防ぐ。

**目的**:
`Dispatch` に「二次搬送予定日時」フィールドを追加し、ダッシュボードに「保管中の車両」セクションを設ける。管理者が手動で日時を登録・更新できる UI を提供する。

**確定要件**:
- 自動算出ロジックは導入しない（依頼内容が業務状況依存のため、手動入力で十分）
- 「未定」状態を許容する（`NULL` = 保険会社からの依頼待ち）
- 表示優先度: 今日 → 明日 → それ以降 → 未定 の順（見落としやすい順）
- 「未定」行は淡い赤バッジ等で強調

**スキーマ変更**:
```prisma
model Dispatch {
  // 既存フィールド
  /// 二次搬送予定日時。NULL = 未定（保険会社からの依頼待ち）。
  scheduledSecondaryAt DateTime?
  // 既存フィールド
  @@index([tenantId, status, scheduledSecondaryAt])
}
```

マイグレーション名: `add_scheduled_secondary_at_to_dispatch`
既存データは全行 `NULL`。本アプリは未稼働のため移行不要。

**API 変更**:
- `lib/validations/schemas/billing.ts` または `dispatch.ts` の `adminUpdateDispatchSchema` に `scheduledSecondaryAt: z.date().nullable().optional()` を追加
- 既存 `PATCH /api/admin/dispatches/[id]` で更新可能にする（新規エンドポイント不要）
- `GET /api/admin/dispatches?status=stored` を機能拡張（既存の status フィルタに `stored` を追加し、`Dispatch.status === 'STORED'` で抽出）

**新規ファイル**:
- `prisma/migrations/{timestamp}_add_scheduled_secondary_at_to_dispatch/migration.sql`
- `components/admin/StoredVehicleList.tsx`（保管中車両リスト + 編集 UI）
- `components/admin/ScheduledSecondaryEditor.tsx`（行内編集 or モーダル）
- `__tests__/components/admin/StoredVehicleList.test.tsx`
- `__tests__/lib/admin/scheduled-secondary-sort.test.ts`（ソート純粋関数のテスト）
- `lib/admin/scheduled-secondary-sort.ts`（ソート純粋関数）

**改修ファイル**:
- `prisma/schema.prisma`（フィールド + インデックス追加）
- `lib/validations/schemas/billing.ts` または `dispatch.ts`（`adminUpdateDispatchSchema` 拡張）
- `app/api/admin/dispatches/route.ts`（`status=stored` フィルタ）
- `app/admin/dashboard/page.tsx`（保管セクション追加）
- `hooks/useAdminDispatches.ts`（`status=stored` 取得用フック追加 or パラメータ拡張）

**ワイヤーフレーム（PC）**:

```
▼ 保管中の車両
┌─────────────────────────────────────────────────────┐
│ 出動番号       車番             搬送予定         操作  │
│ 20260425-002  練馬500あ1234   4/28(火) PM     [編集]│
│ 20260424-003  横浜300い5678   4/29(水) AM     [編集]│
│ 20260423-001  品川300う9012   未定 ⚠          [編集]│
└─────────────────────────────────────────────────────┘
```

**編集 UX**:
- 行右の `[編集]` ボタンで日時ピッカー（`input[type="datetime-local"]` を基本、DatePicker 導入は後日判断）
- 保存で `PATCH /api/admin/dispatches/[id]` 呼出
- 同一テーブル内で更新（モーダルではなく行内展開、もしくは小型モーダル）

**検証ゲート**:
- `tsc` / `build` / `test` グリーン
- dev server で `/admin/dashboard` を開き、保管セクションのソート挙動を確認
- 「未定」「今日」「明日」「未来」「過去」の各状態で正しく分類・強調表示されることを目視
- スクリーンショット必須:
  - PC: 保管セクションあり / なし の 2 種
  - SP: 同上
  - 編集 UI 起動状態 1 枚

**想定ファイル数**: 新規 6、改修 5

**完了条件**:
- 検証ゲート全通過
- ユーザーがスクリーンショットを目視で承認
- 承認後にコミット → push

**禁止事項**:
- 自動算出ロジックの導入
- 「誰が搬送するか」の割当 UI 追加（業務状況依存のため Phase 3.5 では扱わない）
- `SecondaryDispatchClient.tsx` への変更（隊員側フローには影響させない）

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
