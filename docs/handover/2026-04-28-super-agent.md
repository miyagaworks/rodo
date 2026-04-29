# Super Agent 引き継ぎ書

作成日: 2026-04-28（Phase 3.5 完了時点で全面リライト）
プロジェクト: `~/Projects/rodo/app`
ブランチ: `feature/admin-dashboard`（origin push 済み）

---

## 一行サマリ

管理者ダッシュボード実装。Phase 1 / 2 / 2.5 / 3 / 3.5 と SW バグ修正まで完了・push 済み。次タスクは Phase 4（案件管理 + カレンダー新仕様）。計画書 `docs/plans/admin-dashboard.md` §11.2 で Phase 3.5、§4.3 / §6.3 で Phase 4 カレンダー新仕様を確定済み。

---

## 完了済み

### Phase 1（コミット済み・push 済み）
- `prisma/schema.prisma`: `Dispatch.billedAt DateTime?` + `@@index([tenantId, billedAt])` 追加
- マイグレーション: `0_init`（ベースライン）+ `add_billed_at_to_dispatch`
- 管理者用 API 5 本（`app/api/admin/`）
  - `GET /api/admin/members-status` — 隊員ステータス一覧（10秒ポーリング想定）
  - `GET /api/admin/dispatches` — 全案件取得（フィルタ・ページング）
  - `PATCH /api/admin/dispatches/[id]` — 全項目編集
  - `PATCH /api/admin/dispatches/[id]/billing` — 請求済みマーキング
  - `GET /api/admin/calendar` — 月別未処理件数集計（後に Phase 4 で Response 仕様変更予定）
- `lib/admin/status-derivation.ts` — 隊員ステータス導出の純粋関数
- `lib/validations/schemas/billing.ts` + `adminUpdateDispatchSchema`
- テスト 66 ケース追加（既存 600 → 666 全グリーン）
- `docs/MIGRATION.md` — 0_init ベースラインの本番反映手順

### Phase 2（コミット済み・push 済み）
- `components/common/AppHeader.tsx` — 共通ヘッダー
- `components/admin/AdminMenu.tsx` — メニュー項目（ホーム / ダッシュボード / 案件管理 / 設定 / ログアウト）
- `components/admin/AdminShell.tsx` — ドロワー本体（Phase 2.5 で SP 専用に縮小済み）
- `components/admin/AdminLayoutShell.tsx` — `/admin/*` のクライアントラッパー
- `app/admin/layout.tsx` + `app/admin/dashboard/page.tsx` + `app/admin/dispatches/page.tsx`
- `HomeClient.tsx` / `SettingsClient.tsx` のヘッダーを AppHeader に統一

### Phase 2.5: PC 上部水平ナビ統合
- コミット: `0468e45 feat(admin): PC上部水平ナビ統合`
- 改修ファイル: `AppHeader.tsx`（`showAdminNav` prop）, `AdminMenu.tsx`（`orientation` prop）, `AdminShell.tsx`（SP 専用化・右スライドイン）, `AdminLayoutShell.tsx`（縦積みに簡略化）, `HomeClient.tsx`, `SettingsClient.tsx`, `app/admin/dashboard/page.tsx`, `app/admin/dispatches/page.tsx`
- スクリーンショット 10 枚を `docs/screenshots/phase-2.5/` に保存

### 設定ページ 2 ペイン化
- コミット: `6a32471 feat(settings): PC 設定ページを 2ペインレイアウトに刷新`
- 改修ファイル: `components/SettingsClient.tsx`
- スクリーンショット 5 枚を `docs/screenshots/phase-2.5-settings/` に保存

### ドロワーロゴ menu.svg 化
- コミット: `d58968f chore(ui): ドロワー上部のロゴを menu.svg に変更`
- 改修: `components/admin/AdminShell.tsx`
- 新規アセット: `public/menu.svg`

### 管理者レイアウトにフッター追加
- コミット: `a387b15 chore(admin): 管理者レイアウトに AppFooter を追加`
- 改修: `components/admin/AdminLayoutShell.tsx`

### Phase 3: ダッシュボード実装
- コミット: `19bad7a feat(admin): Phase 3 ダッシュボード実装`
- 新規ファイル:
  - `components/admin/AdminQueryProvider.tsx`
  - `components/admin/MemberStatusCard.tsx`
  - `components/admin/MemberStatusGrid.tsx`
  - `components/admin/TodayDispatchSummary.tsx`
  - `components/admin/OverdueDispatchList.tsx`
  - `hooks/useMembersStatus.ts`
  - `hooks/useAdminDispatches.ts`
  - `lib/admin/business-day.ts`
- 改修: `app/admin/layout.tsx`, `app/admin/dashboard/page.tsx`
- テスト追加 28 件（640 → 668 全グリーン）
- 既知の残課題: 出動中バッジ（blue-500）は Seed に該当案件がないため未確認。実データ投入後に動作検証必要
- スクリーンショット 4 枚を `docs/screenshots/phase-3/` に保存

### Phase 3.5: 保管車両の二次搬送予定日管理
- コミット: `d1f9c09 feat(admin): Phase 3.5 保管車両の二次搬送予定日管理`
- 業務背景: 保険会社からの依頼で「いつどこへ搬送して」が決まる。午前回収→当日午後 / 夜回収→翌日 / 連休中保管→連休明け の典型パターン。現状は紙台帳管理。
- スキーマ: `Dispatch.scheduledSecondaryAt DateTime?`, `@@index([tenantId, status, scheduledSecondaryAt])`
- マイグレーション: `20260428053624_add_scheduled_secondary_at_to_dispatch`
- 新規ファイル:
  - `lib/admin/scheduled-secondary-sort.ts`（5 状態分類: today/tomorrow/future/undecided/past）
  - `components/admin/StoredVehicleList.tsx`
  - `components/admin/ScheduledSecondaryEditor.tsx`
- 改修: `prisma/schema.prisma`, `lib/validations/schemas/dispatch.ts`（`adminUpdateDispatchSchema` 拡張）, `app/api/admin/dispatches/route.ts`（`status=stored` フィルタ）, `app/api/admin/dispatches/[id]/route.ts`, `hooks/useAdminDispatches.ts`, `app/admin/dashboard/page.tsx`
- TZ: 表示は JST（M/D(曜) HH:mm）、送信時 +09:00 付与で UTC 変換
- テスト追加 23 件（668 → 691 全グリーン）
- スクリーンショット 5 枚を `docs/screenshots/phase-3.5/` に保存
- 計画書 Q5（持ち越し閾値）と Q8（businessDayStartMinutes）は解消済み

### SW バグ修正 + .gitignore 整理
- コミット: `eb0cce8 fix(sw): networkFirst オフラインフォールバックの Promise 扱いバグ + .gitignore に .claude/ 追加`
- 修正: `public/sw.js` 行 131 で `caches.match('/')` を await せず `||` で誤って truthy 判定していたバグを解消
- CACHE 名称を v5 → v6 に更新（既存クライアントの SW 更新を促進）
- `.gitignore` に `.claude/` を追加

### 計画書（更新済み）
- `docs/plans/admin-dashboard.md` は最新（コミット `c4a3515` で Phase 3.5 + Phase 4 カレンダー新仕様を反映済み）
- §11.2 Phase 3.5 の節を新規追加
- §4.3 `GET /api/admin/calendar` の Response を totalCount/unprocessedCount から `primaryDispatches` 配列に変更
- §6.3 カレンダーワイヤーを件数バッジから「出動番号 + 車番」表示に変更
- §10 依存関係図に Phase 3.5 を Phase 3 → Phase 4 の間に直列で挿入
- §9 未確定事項 Q5 / Q8 を解消、Q10 / Q11（運用観察課題）を追加

---

## 過去の論点（解消済み・参考のみ）

> 以下は本セッションで解消済み。Phase 4 着手には影響しないが、再発防止の文脈として残す。

- **PC レイアウト不備（ロゴ二重 / 鈍重なドロワー）**: Phase 2.5 で AppHeader 内に水平 nav を統合し解消（`0468e45`）。
- **計画書 §2.4 が旧サイドバー前提**: Phase 2.5 着手前に同節を「PC 上部水平 / SP 右ドロワー」に書き換えて整合化済み。
- **scheduled secondary at の自動算出案**: 業務状況依存のため不採用。手動入力で確定（Phase 3.5）。

---

## 次にやるべきこと（順序）

### 最優先: Phase 4 案件管理（テーブル + カレンダー新仕様 + 編集画面）

1. 計画書 `docs/plans/admin-dashboard.md` §7 Phase 4 タスクリストを参照。
2. **カレンダーは新仕様**（出動番号 + 車番のみ、§4.3 / §6.3 参照）。旧仕様（totalCount / unprocessedCount）の API レスポンス実装を新仕様に置換する必要あり。
3. Phase 3.5 で追加した `Dispatch.scheduledSecondaryAt` をテーブル列・編集フォームに含めるか判断（→ 設計の方向性 参照）。
4. `DispatchEditForm` は `DispatchClient.tsx` を流用せず新規作成（計画書 R3）。
5. dev server 起動 + スクリーンショット必須（Phase 2.5 の反省点）。

### Phase 4 推奨分割
- Phase 4-A: テーブル + フィルタ
- Phase 4-B: カレンダー（新仕様）+ 編集画面

### その後
- Phase 5: 請求画面（PC 左右分割、各社フォーマット、**着手前に追加ヒアリング必須**）

---

## 設計の方向性（提案、ユーザー承認待ち）

Phase 4 着手前にユーザーに確認すべき点:

- 計画書 §6.3 カレンダーワイヤー（出動番号 + 車番表示）の業務感覚チェック。1 日に複数件ある場合のセル内表示（縦並び / "+N 件" の閾値）も合わせて確認。
- `DispatchEditForm` に `scheduledSecondaryAt` 欄を含めるか（含める方が編集導線が一元化される）。
- テーブル列に `scheduledSecondaryAt` を表示するか（保管中案件のみ意味があるためフィルタ必須）。
- 持ち越し案件（`OverdueDispatchList`）と保管中車両（`StoredVehicleList`）の役割整理 — 重複 / 補完の確認。
- カレンダーは `/admin/dispatches` 内のタブ切替（独立ページなし）で確定済み（計画書 §5.1）。

---

## 既知の落とし穴

- `prisma/migrations/0_init/` はベースライン migration。**本番反映時は `npx prisma migrate resolve --applied 0_init` を必ず先行**（`docs/MIGRATION.md` 参照）。
- `DispatchStatus.WORKING` はデッドコード（schema enum にだけ存在、遷移ロジック未使用）。隊員ステータス導出時は待機扱い。
- `User.sortOrder` は `feature/drag-reorder` PR で追加済み（`prisma/schema.prisma:62`）。
- `BreakRecord` の同時存在判定は `endTime IS NULL`。
- `Dispatch.dispatchNumber` 採番は JST 基準（`jstOffset = 9 * 60 * 60 * 1000`）。
- `Dispatch.scheduledSecondaryAt` は **JST で表示し、送信時に `+09:00` 付与で UTC 変換**する運用。新規実装でも揃える。
- `lightningcss.darwin-x64.node` 不在エラー: `npm rebuild lightningcss` で解決。Tailwind 4 + macOS で頻発する optionalDependencies 解決のずれ。
- zsh グロブ問題: `app/api/.../[id]/...` のような角括弧パスは git add 時にシングルクォート必須。クォートなしだと `no matches found` エラー。
- SW のキャッシュ戦略で `caches.match()` を await せず `||` で扱うとバグる（`public/sw.js` 行 131 で実証済み、修正済み）。
- `.claude/` ディレクトリ: Claude Code のローカル設定。`.gitignore` で除外済み（`eb0cce8`）。
- 実装 CC が `docs/screenshots/` 撮影のために `scripts/` 配下に一時スクリプト（playwright-core 系含む）を生成する傾向。untracked のまま残置でリポジトリ汚染を回避する運用が定着。
- セッション中、修正 CC が指示外で untracked ファイルを削除した事例あり（前任 super-agent が指摘）。修正 CC 向けプロンプトで「指示外のファイル削除禁止」を明示する運用が必要。
- AGENTS.md 警告: Next.js 16.x は破壊的変更あり。実装 CC は `node_modules/next/dist/docs/` の関連ガイドをコードを書く前に必ず参照。

---

## ユーザーの好み・コミュニケーションスタイル

- **称賛・同調は禁止**。端的に。
- **即決を基本としない**（2026-04-29 ルール変更）。「壁打ちを長引かせない」は廃止。選択肢が複数ある場合・曖昧な指摘の場合・既存設計（Phase 2.5 / 3.5 等で確定済みのもの）の変更を含む場合は、必ず確認を取ってから進める。複数往復を許容する。
- 明示的に「判断できない」「OK」「どれでも良い」「お任せ」「一任」と言われた場合のみ super-agent が決定する。それ以外の判断（特にコンテンツ幅・UI スタイリング・業務 UX）は必ず確認する。
- 「鈍臭くないように」を理由に確認を端折らない。確認の往復は判断ミスより安い。
- スクリーンショットによる確認を重視。曖昧な指摘（例: 「右が空いている」）は画像から真因を特定するか、コンポーネント内の問題かコンテナの問題かをユーザーに確認する。
- 「スタイリッシュかどうか」「業務 UX の妥当性」「コンテンツ幅」はユーザー専権。super-agent が判定するのは技術的観点（スコープ遵守・テストグリーン・必須スクショ・既存反省点の再発有無）に限る。
- 業務ヒアリングは具体的なフローと頻度の例を引き出すと精度が上がる（例: 午前 / 夜 / 連休のパターン）。

---

## 反省点（前任 super-agent からの申し送り・本セッション分含む）

1. **コードレベルの確認だけで「OK」と判断するのは禁止**。Phase 2 完了時にこれで失敗。implementer に dev server 起動 + スクリーンショット添付を必須化すること。
2. **SP / PC で別仕様を採用すると複雑性が増す**。統一できるなら統一を最優先。
3. **「壁打ちを長引かせない」は 2026-04-29 に廃止**。即決を理由に確認を端折ると判断ミスを招く。本セッションの実例: ユーザーの「カレンダー右が空いている」指摘を「コンテナ幅が狭い」と短絡解釈し、Phase 2.5 で確定済みの max-w-6xl を勝手に max-w-[1536px] に変更 → ダッシュボードと幅がズレてユーザーから差し戻された。曖昧指摘・既存設計変更・選択肢が複数ある判断はすべて確認を取る運用に変更。
4. **完了報告フォーマット制約**（罫線テーブル禁止 / 絵文字禁止 / 行数制限）が CC 表示崩れの軽減に決定的に有効。プロンプト末尾に必ず付ける。
5. **Session recap**（`/config` 内）を `false` にすると `※ recap: ...` の自動挿入が消え、表示崩れと冗長性が大幅軽減。
6. **計画書の追記ルール**: 既存セクションを書き換えず、独立フェーズ（§11.x）として追加 + §10 依存関係図と §9 未確定事項テーブルを更新する方式が安全。
7. **業務理解の確認は「機械的な仕様」ではなく「業務フローの典型パターンと頻度」を引き出す質問**が有効。
8. **「super-agent が判定する範囲」と「ユーザーが判定する範囲」を最初に明確化する**。これを越権すると訂正されるので最初から線引き。
9. **角括弧パス・lightningcss・SW Promise の 3 つは "発生しやすい環境 / 言語問題" として落とし穴に明記**し、プロンプト側で先回り防御する。
10. **実装 CC が `scripts/` 配下にスクリプトを作る場合は untracked 残置で OK**。ただし指示外で untracked ファイルを削除する事例があるため、プロンプトで明示禁止すること。

---

## 関連ファイル

### 改修対象（Phase 4）
- 新規: `app/admin/dispatches/[id]/page.tsx`, `components/admin/DispatchTable.tsx`, `components/admin/DispatchTableFilters.tsx`, `components/admin/DispatchCalendar.tsx`, `components/admin/DispatchEditForm.tsx`, hooks 拡張等
- 改修: `app/admin/dispatches/page.tsx`（テーブル / カレンダータブ切替）, `app/api/admin/calendar/route.ts`（Response 仕様変更、§4.3 新仕様に追従）
- API 既存利用: `GET /api/admin/dispatches`, `PATCH /api/admin/dispatches/[id]`, `PATCH /api/admin/dispatches/[id]/billing`

### 触らない
- `app/api/admin/members-status`, `lib/admin/status-derivation.ts`, `lib/admin/business-day.ts`, `lib/admin/scheduled-secondary-sort.ts`（Phase 3 / 3.5 完成品）
- `prisma/schema.prisma` の既存フィールド（`scheduledSecondaryAt` 含む。新規フィールド追加が必要なら別途計画）
- `prisma/migrations/` の既存ファイル
- `components/admin/AdminQueryProvider`, `MemberStatusCard`, `MemberStatusGrid`, `TodayDispatchSummary`, `OverdueDispatchList`, `StoredVehicleList`, `ScheduledSecondaryEditor`, `AppHeader`, `AdminShell`, `AdminMenu`, `AdminLayoutShell`
- `HomeClient`, `SettingsClient`
- `public/sw.js`, `.gitignore`, `public/menu.svg`
- `docs/plans/admin-dashboard.md`（Phase 4 の節を更新する必要が出たら別タスク）
- `docs/screenshots/*`（確認用）
- `docs/MIGRATION.md`
- `components/dispatch/DispatchClient.tsx`, `SecondaryDispatchClient.tsx`（隊員側フロー、Phase 4 では `DispatchEditForm` を新規作成する方針）

### 計画書（更新が必要かもしれない）
- Phase 4 着手時に §5.2 改修ファイル表を最新化するか判断（Phase 3.5 で改修したファイルが §5.2 に反映されていないため）

---

## コミット履歴（直近）

```
eb0cce8 fix(sw): networkFirst オフラインフォールバックの Promise 扱いバグ + .gitignore に .claude/ 追加
d1f9c09 feat(admin): Phase 3.5 保管車両の二次搬送予定日管理
c4a3515 docs(plan): Phase 3.5 と Phase 4 カレンダー新仕様を計画書に追記
a387b15 chore(admin): 管理者レイアウトにフッターを追加
19bad7a feat(admin): Phase 3 ダッシュボード実装
d58968f chore(ui): ドロワー上部のロゴを menu.svg に変更
6a32471 feat(settings): PC 設定ページを 2ペインレイアウトに刷新
0468e45 feat(admin): PC上部水平ナビ統合 (Phase 2.5)
7e344b0 refactor(ui): 全管理者ページのヘッダーを AppHeader に統一 + max-w-md 制限
d6605ac feat(admin): ハンバーガーメニュー + /admin ルーティング基盤
232d226 feat(common): AppHeader 共通ヘッダーコンポーネントを追加
9062a67 docs: 管理者ダッシュボード実装計画書を追加
dbc7c01 feat(admin): 管理者用 API 5本実装
87e9ec8 feat(admin): adminUpdateDispatchSchema / billingSchema / status-derivation 追加
32a2a96 feat(admin): Dispatch.billedAt 追加 + ベースライン migration
```

---

## 推奨される最初のアクション（次セッション）

1. このファイルを読む。
2. `docs/plans/admin-dashboard.md` §7 Phase 4、§4.2、§4.3（新仕様）、§6.3（新仕様）を読む。
3. ユーザーに「Phase 4 に着手します。最初に DispatchTable のフィルタ列構成と DispatchEditForm に `scheduledSecondaryAt` を含めるかを確認したい」と短く宣言。
4. 計画書 §6.3 ワイヤーフレーム（出動番号 + 車番表示）の業務感覚を 1 点だけユーザーに確認。
5. 確定後、Phase 4 を Phase 4-A（テーブル + フィルタ）と Phase 4-B（カレンダー + 編集画面）に分割し、A から実装 CC に投入。
6. dev server スクリーンショット必須。
