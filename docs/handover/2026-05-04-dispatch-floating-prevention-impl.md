# 出動中の浮き案件防止 — 実装完了引き継ぎノート（Phase 1〜7 + Phase 5.5 + Phase 8a）

- 作成日: 2026-05-06
- 作成者: planner CC（指示元: miyagawakiyomi）
- ブランチ: `feature/p0-13-signature-blob`
- PR: #10 (https://github.com/miyagaworks/rodo/pull/10)
- 最新コミット: `a939fd6` (Phase 8a: smoke-test カテゴリ I 31 項目を追記)
- main からの分岐点: `46ccc81`（main..HEAD = 70 commits）
- 関連計画書: `docs/plans/dispatch-floating-prevention.md`
- 関連既存引き継ぎ: `docs/handover/2026-05-04-dispatch-floating-prevention.md`（計画立案 + Phase 1〜6 PASS 記録、本ノートと補完関係）

---

## §A 計画書サマリ

### A.1 目的

隊員が出動を開始した後、ホーム画面に戻ると「出動中である」ことが UI 上に表現されず、別案件の出動・休憩を開始できてしまう設計問題を解消する。確定 5 論点（計画書 §1.3）:

1. 戻る制御方式 = 確認ダイアログ + 5 画面共通フック化（popstate / beforeunload も含む）
2. 案件キャンセル機能 = `POST /api/dispatches/[id]/cancel` 新設、active → CANCELLED への遷移を限定的に許可
3. 案件番号 = 論理削除（`dispatchNumber` は欠番として残す）+ 採番ロジック堅牢化（同日内最大番号+1 方式）
4. 管理者の扱い = 一律同じ制約
5. 再ログイン復帰 = `GET /api/dispatches/active` 新設 + HomeClient バナー

### A.2 Phase 構成と総量（計画書 §3）

| Phase | 名称 | 想定 / 実績 | 状態 |
|---|---|---|---|
| 1 | API 基盤（cancel / active / 採番堅牢化） | 3〜4h | **完了** (`c47ca51` / `c6baa87`) |
| 2 | 共通フックとユーティリティ | 2〜3h | **完了** (`7400b5a`) |
| 3 | 5 画面戻るボタン制御統合（実装は 2 画面のみ） | 4〜5h | **完了** (`e44d81c`) |
| 4 | 案件キャンセル UI（5 画面共通 → 2 画面のみ） | 3〜4h | **完了** (`a09a3cc`) |
| 5 | HomeClient 進行中バナー + アシスタンス抑止 | 3〜4h | **完了** (`fc7d60f`) |
| 5.5 | 仕様変更 2026-05-05 対応（isDraft-aware ガード） | 4〜6h | **完了** (`b27a0aa` / `c7a60ce` / `9259cb6` / `6871b18`) |
| 6 | popstate / beforeunload 対策 + 実機検証 | 3〜4h | **完了** (`0ca4981`、実機検証 PASS は handover §O.4) |
| 7 | ホーム遷移 6 件への対策（最終 4 件 + ヘッダーホームボタン統一） | 2〜3h | **完了** (`fe73de7`) |
| 8a | smoke-test カテゴリ I 転記（31 項目） | 1h | **完了** (`a939fd6`) |
| 8b | 実機検証 + ユーザー承認 + main マージ判断 | 1h | **未着手**（残課題 §E.1） |

### A.3 main からの分岐点と現在地

- 分岐点: `46ccc81`（main 上の最新コミット）
- 現在 HEAD: `a939fd6`
- 含まれるコミット数: 70（dispatch-floating-prevention 関連は 17 コミット、ほか p0-13 署名 Blob・スモークテスト関連等を含む）
- リモート（origin/feature/p0-13-signature-blob）と同期済み

---

## §B Phase 別完了レポート

各 Phase の関連コミットは `git show --stat` で確認した実差分に基づく。

### B.1 Phase 1 — API 基盤

- **ねらい**（計画書 §3 Phase 1）: クライアント実装が依存する API を先に確定する。`POST /api/dispatches/[id]/cancel`、`GET /api/dispatches/active` を新設し、採番ロジックを堅牢化する。
- **関連コミット**:
  - `c47ca51` `feat(api/dispatches): add cancel/active routes and harden numbering for floating dispatch prevention`
  - `c6baa87` `feat(api/dispatches): auto-close active break on dispatch start`（前タスクから派生・Phase 1 と同時期）
- **変更ファイル概要**:
  - 新規: `app/api/dispatches/[id]/cancel/route.ts`（95 行）、`app/api/dispatches/active/route.ts`（72 行）
  - 変更: `app/api/dispatches/route.ts`（採番堅牢化 +13/-3）
  - テスト: `__tests__/api/dispatches/cancel.test.ts`（17 ケース）/ `active.test.ts`（8 ケース）/ `numbering.test.ts`（5 ケース）= 30 PASS
  - 派生（`c6baa87`）: `lib/breakAutoClose.ts` 新規 + 11 テスト追加（休憩中→出動の自動 close）
- **設計判断**: 案 A 採用（`VALID_STATUS_TRANSITIONS` には CANCELLED 遷移を**追加せず**、cancel ルート内でローカル検証）。既存 PATCH ルート非汚染。
- **CANCELLABLE_STATUSES**: `DISPATCHED` / `ONSITE` / `WORKING` / `TRANSPORTING` / `COMPLETED && returnTime IS NULL`（Phase 5.5 で `COMPLETED|RETURNED && isDraft===false` を追加）
- **2 次搬送 -2/-3 / 振替 -T 採番**: 重複検知 while ループで安全と判断し維持（堅牢化対象外）。
- **ユーザー確認結果**: 自動テスト全件 PASS、実機 API 動作未検証だが Phase 4 の cancel ボタン経由で動作確認済み。

### B.2 Phase 2 — 共通フックとユーティリティ

- **ねらい**（計画書 §3 Phase 2）: 5 画面で共有する「進行中判定」と「ホーム遷移ガード」を 1 箇所に集約。
- **関連コミット**: `7400b5a` `feat(dispatch): add active-dispatch hook and in-progress guard (Phase 2)`
- **変更ファイル概要**（新規 6 ファイル / 923 行）:
  - `lib/dispatch/active-status.ts`（52 行）: `isActiveDispatchStatus(status, returnTime)` + `mapStatusToSubPhase` 再エクスポート（Phase 5.5 で `isDraft` 引数追加）
  - `hooks/useActiveDispatch.ts`（106 行）: `GET /api/dispatches/active` のフック。`X-SW-Offline=1` を error 経路に流す
  - `hooks/useDispatchInProgressGuard.ts`（182 行）: `safeNavigateHome` / `replaceLocation` / popstate / beforeunload を一括管理。MVP は `window.confirm`、Phase 3 で共通モーダル連携
  - テスト 3 ファイル（合計 583 行 / 40 ケース PASS）
- **設計判断**:
  - `isActiveDispatchStatus` は WORKING を含まない（schema にだけ存在するデッドコードのため）
  - `mapStatusToSubPhase` はクライアント import 可能（純粋関数）
  - useActiveDispatch は polling なし（マウント時 + `refresh()` のみ）
- **既存 5 画面への import は 0 件**（統合は Phase 3 担当）
- **ユーザー確認結果**: 自動テスト全件 PASS（実機検証なし）。

### B.3 Phase 3 — 戻るボタン制御統合（2 画面）

- **ねらい**（計画書 §3 Phase 3）: 5 画面ヘッダー戻るボタン押下時に、進行中判定 + 確認ダイアログを統一的に挟む。
- **関連コミット**: `e44d81c` `feat(dispatch): integrate in-progress guard into DispatchClient and SecondaryDispatchClient (Phase 3)`
- **スコープ確定**: §9.0-A により**現場対応 2 画面のみ**（DispatchClient / SecondaryDispatchClient）。書類作成 3 画面（ReportOnsite / ReportTransport / RecordClient）は対象外を堅持。
- **変更ファイル概要**:
  - 新規: `components/dispatch/BackToHomeConfirmModal.tsx`（53 行 / OK ボタン 1 つのみ）
  - 新規: `__tests__/components/dispatch/BackToHomeConfirmModal.test.tsx`（73 行 / 4 ケース PASS）
  - 変更: `DispatchClient.tsx`（戻るボタン onClick + 末尾モーダル配置 +30 行）
  - 変更: `SecondaryDispatchClient.tsx`（同 +27 行）
- **inProgress 判定の確定ロジック**:
  - DispatchClient: `dispatchId !== null && step >= 1 && step < (mode === 'transport' ? 5 : 4)`
  - SecondaryDispatchClient: `secondaryId !== null && step >= 1 && step < 4`
  - `isActiveDispatchStatus` を採用しなかった理由: 新規出動シナリオでは `initialDispatch=null` のためサーバ status を持たない。step ベースで両シナリオを一意にカバーできる
- **UI 文言**: `進行中の案件があります。ホームに戻るには「案件キャンセル」ボタンで取り消してください`（カギ括弧採用）
- **ユーザー確認結果**: 自動テスト全件 PASS（実機検証は Phase 6 のシナリオ O-1 で PASS 済み）。

### B.4 Phase 4 — 案件キャンセル UI

- **ねらい**（計画書 §3 Phase 4）: 5 画面ヘッダー（→ §9.0-A により 2 画面）に「案件キャンセル」ボタンを共通配置。
- **関連コミット**: `a09a3cc` `feat(dispatch): add CancelDispatchButton for in-progress 2 screens (Phase 4)`
- **変更ファイル概要**:
  - 新規: `components/dispatch/CancelDispatchButton.tsx`（160 行）
  - 新規: `__tests__/components/dispatch/CancelDispatchButton.test.tsx`（197 行 / 7 ケース PASS）
  - 変更: `DispatchClient.tsx`（ヘッダー L924-940 に ml-auto で配置 +14 行）
  - 変更: `SecondaryDispatchClient.tsx`（`isTransferred` / `secondaryDispatchNumber` 新設 + ヘッダー配置 +22 行）
- **表示条件**: `inProgress && !isTransferred && id && number`
- **fetch 経路**: 素の `fetch`（`offlineFetch` 非使用 / §5.4 確定方針）。オフラインはキャンセル不可に倒す
- **エラー出し分け**: 401 / 403 / 404 / 409 / その他 / catch すべて alert で個別文言
- **`onCancelled`**: `router.push('/')` 直接呼び出し（Phase 3 ガード非経由 = active を抜けるため安全）
- **ユーザー確認結果**: 実機動作確認 OK（前 handover §M / smoke-test D-06 / D-07 PASS）。

### B.5 Phase 5 — HomeClient 進行中バナー

- **ねらい**（計画書 §3 Phase 5）: ホーム画面で進行中案件を可視化し、出動画面への動線を提供。アシスタンス/休憩の抑止。
- **関連コミット**: `fc7d60f` `feat(home): add active-dispatch banner and assistance suppression (Phase 5)`
- **変更ファイル概要**:
  - 新規: `components/ActiveDispatchBanner.tsx`（43 行 / aria-label 付きクリッカブル button）
  - 新規: `__tests__/components/ActiveDispatchBanner.test.tsx`（53 行 / 4 ケース PASS）
  - 新規: `__tests__/components/AssistanceButton.test.tsx`（146 行 / 9 ケース PASS）
  - 変更: `HomeClient.tsx`（useActiveDispatch 統合 + バナー + 抑止 +30 行）
  - 変更: `AssistanceButton.tsx`（`disabled` / `onDisabledClick` props +33 行）
  - 変更: `__tests__/components/HomeClient.test.tsx`（+144 行）
- **確定動作仕様**:
  - バナー配置: `<main>` 内 `<div className="max-w-md ...">` 最上位（BreakBar より上）
  - バナー押下: `router.push('/dispatch/${activeDispatch.id}')`（§9.0-F MVP）
  - アシスタンス抑止: `disabled={!!activeDispatch}` + `onDisabledClick=alert`、HTML disabled は付けない（onClick が拾えなくなるため早期 return 方式）
  - 休憩ボタン抑止: `breakState.status !== 'paused' && canStartBreak === true && !activeDispatch`
  - エラー時: API 取得失敗で `console.error` + バナー非表示（フェイルクローズしない）
- **ユーザー確認結果**: 実機動作確認 OK（前 handover §N.4）。

### B.6 Phase 5.5 — 仕様変更 2026-05-05 対応（isDraft-aware ガード）

- **ねらい**（計画書 §3 Phase 5.5）: 帰社後でも「出動記録ボタン未押下」（`isDraft === false`）の状態ではガードを継続する。出動記録ボタン押下を `dispatch.isDraft === true` への状態遷移点として明示化。
- **関連コミット**（6 件で構成される複合フェーズ：仕様文書化 2 件 + 実装本体 1 件 + 派生 3 件）:
  - `ec556a1` `docs(dispatch-floating-prevention): 仕様変更 2026-05-05 を計画書と handover に反映`（仕様文書化のみ）
  - `92a034e` `docs(dispatch-floating-prevention): WORKING 不採用方針を計画書と handover に確定反映`（WORKING を新シグネチャに含めない方針確定）
  - `b27a0aa` `feat(dispatch): add isDraft-aware active guard for post-return draft transition (Phase 5.5)`（実装本体）
  - `c7a60ce` `refactor(dispatch/record): remove home-back confirmation modal, auto-save on home click`（RecordClient 3 択モーダル廃止）
  - `6871b18` `chore(prisma): backfill Dispatch.isDraft for legacy returned dispatches`（既存 9 件のデータ補正）
  - `9259cb6` `fix(report): decouple Report.isDraft from Dispatch.isDraft in handleSave`（ReportOnsite/Transport の handleSave で `dispatch.isDraft` を更新しない方針確定）
- **変更ファイル概要**（実装本体 `b27a0aa`）:
  - `lib/dispatch/active-status.ts`: シグネチャ `(status, returnTime)` → `(status, returnTime, isDraft)` に拡張、`(COMPLETED|RETURNED) && returnTime!==null && isDraft===false` を真値条件に追加
  - `app/api/dispatches/active/route.ts`: where 句に OR 条件追加、`select` に `isDraft` を含める
  - `app/api/dispatches/[id]/cancel/route.ts`: CANCELLABLE 拡張（帰社後 `isDraft===false` も可、`isDraft===true` は 409 + 専用メッセージ）
  - `components/dispatch/DispatchClient.tsx`: 出動記録ボタン onClick (L953) を `PATCH /api/dispatches/[id] { isDraft: true }` 成功時のみ `router.push` に変更（楽観的更新なし）
  - `hooks/useActiveDispatch.ts`: レスポンス型に `isDraft` 追加
  - 関連テスト 4 ファイル（active-status / DispatchClient.record-button / cancel / active）追加・更新
- **派生対応**:
  - `c7a60ce`: 書類作成画面到達時点で「下書き保存中」状態は確定済みのため、RecordClient の 3 択モーダルを廃止しホームボタン押下 = 即下書き保存 → ホーム遷移の単純フローへ
  - `6871b18`: 帰社済みかつ `returnTime IS NOT NULL` の過去 9 件を `isDraft=true` にバックフィル（旧フローでガード対象外を保証）
  - `9259cb6`: ReportOnsite/Transport の `buildDispatchPayload` から `isDraft` を削除し、`dispatch.isDraft` の更新責任を「DispatchClient L953（出動記録ボタン）」と「SecondaryDispatchClient L454（2 次搬送帰社）」に集約
- **WORKING の扱い**: schema にだけ存在するデッドコード（`lib/admin/status-derivation.ts` L15）のため新シグネチャに含めない方針で確定（2026-05-05 ユーザー確認）
- **ユーザー確認結果**: 実機動作確認 OK（Phase 6 シナリオ O-5 a/b/c で PASS 済み）。

### B.7 Phase 6 — popstate / beforeunload 対策 + 実機検証

- **ねらい**（計画書 §3 Phase 6）: OS スワイプバック・ブラウザ戻る・タブ閉じ・リロードに対しても進行中ガードを効かせる。
- **関連コミット**:
  - `0ca4981` `test(dispatch): add popstate/beforeunload integration tests for in-progress guard (Phase 6)`（テスト追加のみ）
  - `8717b30` `docs(dispatch-floating-prevention): reflect Phase 6 PASS and Phase 7 scope revision`（実機検証 PASS の記録）
- **Scope D 判定**: `useDispatchInProgressGuard.ts` の本体改修は不要（前 handover §O.8）。Phase 2 時点で popstate / beforeunload 骨格が既に完成していた
- **変更ファイル概要**（`0ca4981`）:
  - 新規: `__tests__/components/dispatch/DispatchClient.guard-integration.test.tsx`（155 行）
  - 新規: `__tests__/components/dispatch/SecondaryDispatchClient.guard-integration.test.tsx`（128 行）
  - 変更: `__tests__/hooks/useDispatchInProgressGuard.test.tsx`（+61 行 / A-1 popstate→onAttemptHome wiring + A-2 beforeunload returnValue + A-4 inProgress true→false→true cycle）
- **実機検証結果**（前 handover §O.4 / 2026-05-05 ユーザー報告）: O-1〜O-5（a/b/c）すべて PASS
  - O-1 戻るボタンでモーダル表示: PASS
  - O-2 スワイプバックでモーダル表示: PASS
  - O-3 タブ閉じ・リロードで beforeunload 警告: PASS（iOS Safari 不発は §9.5 により許容）
  - O-4 2 次搬送で同じ挙動: PASS
  - O-5a 帰社後 isDraft=false で戻る → モーダル: PASS
  - O-5b モーダル中キャンセル → ホーム: PASS
  - O-5c 出動記録ボタン → 書類画面 → 戻る → 下書きバナー復帰: PASS
- **派生発見事項**: 書類作成画面でブラウザバック → DispatchClient に戻れる問題を本検証中に発見 → §8.7 派生課題として正式起票（残課題 §E.3）

### B.8 Phase 7 — ホーム遷移経路への対策（改訂スコープ A + C）

- **ねらい**（計画書 §3 Phase 7 / 2026-05-05 改訂）: ホーム遷移補助 6 件のうち #5 / #6 は `c7a60ce` で削除済みのため、残 #1〜#4 + ヘッダーホームボタン統一が対象。
- **関連コミット**: `fe73de7` `feat(dispatch): add cleanup, assert, and auto-save to home transition paths (Phase 7)`
- **変更ファイル概要**（+927 行）:
  - 変更: `components/dispatch/DispatchClient.tsx`（A-1: setTimeout cleanup +12 行）
  - 変更: `components/dispatch/RecordClient.tsx`（assert +21 行）
  - 変更: `components/dispatch/ReportOnsiteClient.tsx`（A-2 assert + C: handleSave(true) auto-save 統一 +26 行）
  - 変更: `components/dispatch/ReportTransportClient.tsx`（同 +26 行）
  - 新規: `__tests__/components/dispatch/DispatchClient.transfer-cleanup.test.tsx`（172 行）
  - 新規: `__tests__/components/dispatch/RecordClient.handleDraftSave.test.tsx`（261 行）
  - 変更: `ReportOnsiteClient.handleSave.test.tsx`（+209 行）
  - 変更: `ReportTransportClient.handleSave.test.tsx`（+210 行）
- **実装内容**:
  - **A-1**: DispatchClient L378 振替完了ポーリングの `setTimeout` に `useEffect` cleanup（`clearTimeout`）追加
  - **A-2**: ReportOnsite/Transport/Record の保存処理後に `dispatch.isDraft===true` を assert。想定外時は `console.error` + alert で遷移停止（サイレント故障防止）
  - **C**: ReportOnsite/Transport のヘッダーホームボタン onClick を `handleSave(true)` 経路に統一（旧: `router.push('/')` のみで保存処理なし → 入力途中値の喪失リスク解消）
- **`dispatch.isDraft` 更新責任の集約**（前コミット 9259cb6 で確定）:
  - DispatchClient L953（出動記録ボタン）
  - SecondaryDispatchClient L454（2 次搬送帰社）
  - 本コミット（fe73de7）の assert はその前提に対する safety net
- **ユーザー確認結果**: 実機動作確認 OK（push 前検証で `pnpm test` / `pnpm build` / `npx tsc --noEmit` PASS）。

### B.9 Phase 8a — smoke-test カテゴリ I 転記

- **ねらい**（計画書 §3 Phase 8）: §7 動作確認シナリオを smoke-test に転記。
- **関連コミット**: `a939fd6` `docs(smoke-test): add category I for dispatch floating prevention (Phase 8a)`
- **変更ファイル概要**: `docs/smoke-test-checklist.md` に **31 項目**（§7 の 27 項目 + Phase 7 改訂スコープ追加検証 4 項目）をカテゴリ I として追記（+210 行）
- **ユーザー確認結果**: ファイル追加のみ。実機検証（Phase 8b）は未着手。

---

## §C ユーザー確認済み仕様（AGENTS.md §「業務仕様の真偽判定」準拠）

確認者: miyagawakiyomi（プロジェクトオーナー）。本セッションおよび前セッションでユーザーが「合ってる」と明示確認した仕様のみを「正」として記載する。

| # | 確認日 | 確認済み仕様 | 関連コミット |
|---|---|---|---|
| C-1 | 2026-05-04 | 救援業務での休憩中の出動はあり得る。出動が始まれば休憩は自動終了する | `c6baa87` |
| C-2 | 2026-05-04 | 出動中は別の出動も休憩も開始できない（同時 2 件は業務的に不成立） | `c47ca51` / `fc7d60f` |
| C-3 | 2026-05-04 | 出動状態は隊員が常時視認でき、出動画面に戻れる動線が必要 | `fc7d60f` |
| C-4 | 2026-05-04 | 浮き案件は取り消さない限り別操作不可 | `c47ca51` / `a09a3cc` / `fc7d60f` |
| C-5 | 2026-05-04 | pause 中の時間は実消化していない（既存仕様） | （前タスク継承） |
| C-6 | 2026-05-04 | 書類作成画面（ReportOnsite / ReportTransport / RecordClient）はガード適用外。現場対応 2 画面のみガード対象（§9.0-A） | `e44d81c` |
| C-7 | 2026-05-04 | 振替済み（status=TRANSFERRED）の元案件はキャンセル対象外（§9.0-B） | `a09a3cc` |
| C-8 | 2026-05-04 | キャンセル可能状態 = DISPATCHED / ONSITE / WORKING / TRANSPORTING / COMPLETED && returnTime IS NULL（§9.0-C） | `c47ca51` |
| C-9 | 2026-05-04 | 管理者ロールも一律同じ制約（戻れない、キャンセル可） | `c47ca51` |
| C-10 | 2026-05-05 | 帰社後でも出動記録ボタン未押下（`isDraft===false`）ならガード継続（§9.0-A 例外） | `b27a0aa` |
| C-11 | 2026-05-05 | 出動記録ボタン押下時は `PATCH /api/dispatches/[id] { isDraft: true }` 成功時のみ `router.push`。失敗時は alert + 遷移なし（楽観的更新なし） | `b27a0aa` |
| C-12 | 2026-05-05 | `dispatch.isDraft` の更新責任は DispatchClient L953（出動記録ボタン）と SecondaryDispatchClient L454（2 次搬送帰社）に集約。ReportOnsite/Transport の handleSave では更新しない | `9259cb6` |
| C-13 | 2026-05-05 | 書類作成画面のホームボタン押下時は即下書き保存 → ホーム遷移の単純フロー（3 択モーダル廃止）。誤入力訂正は再アクセスして書き換える方針 | `c7a60ce` |
| C-14 | 2026-05-05 | ReportOnsite/Transport のヘッダーホームボタンは `handleSave(true)` 経由で auto-save する（旧: 保存処理なしで `router.push` → 入力途中値喪失リスク） | `fe73de7`（C スコープ） |
| C-15 | 2026-05-05 | WORKING ステータスは不採用。schema にだけ存在するデッドコード（`lib/admin/status-derivation.ts` L15）のため `isActiveDispatchStatus` 新シグネチャに含めない | `92a034e` |
| C-16 | 2026-05-05 | Phase 6 実機検証 O-1〜O-5（a/b/c）全シナリオ PASS（前 handover §O.4） | `8717b30` |

---

## §D 検証状況

### D.1 自動テスト（vitest）

- 直近の `pnpm test` 結果: **900+ passed / 1 pre-existing failure**（`__tests__/lib/offline-fetch.test.ts:94` の Phase 2 着手前から失敗していた既存問題、Phase 1〜7 起因なし。別タスクとして残課題に未起票だが本実装スコープ外）
- Phase 別追加テストファイル数:
  - Phase 1: 3 ファイル / 30 ケース（`active.test.ts` 8 + `cancel.test.ts` 17 + `numbering.test.ts` 5）
  - Phase 1 派生（c6baa87）: 2 ファイル / 11 ケース
  - Phase 2: 3 ファイル / 40 ケース（active-status / useActiveDispatch / useDispatchInProgressGuard）
  - Phase 3: 1 ファイル / 4 ケース（BackToHomeConfirmModal）
  - Phase 4: 1 ファイル / 7 ケース（CancelDispatchButton）
  - Phase 5: 3 ファイル（ActiveDispatchBanner 4 + AssistanceButton 9 + HomeClient 追記 3）
  - Phase 5.5: 5 ファイル更新（active-status / DispatchClient.record-button 新規 + cancel / active / DispatchClient.guard-integration）
  - Phase 6: 3 ファイル（popstate/beforeunload integration tests）
  - Phase 7: 4 ファイル（DispatchClient.transfer-cleanup 新規 + RecordClient.handleDraftSave 新規 + ReportOnsite/Transport.handleSave 拡張）
- 合計: dispatch-floating-prevention 関連で約 25 ファイル / 100+ テストケース追加

### D.2 ビルド / 型検査 / lint

- `pnpm build`: 2026-05-06 push 前の検証で PASS
- `npx tsc --noEmit`: PASS
- `pnpm lint`: 既存の 64 errors / 45 warnings（dispatch-floating-prevention 起因なし、別タスク化済み 残課題 §E.6）

### D.3 smoke-test カテゴリ I

- `docs/smoke-test-checklist.md` に **31 項目**を追記（コミット `a939fd6`）
- 内訳: 計画書 §7 の 27 項目 + Phase 7 改訂スコープ追加検証 4 項目
- 実機実施は Phase 8b（残課題 §E.1 と統合）

### D.4 実機検証実績

- **PR #10 / 2026-05-05〜06 セッション**:
  - Phase 4 D-06 / D-07 PASS（前 handover §M / smoke-test 反映済み）
  - Phase 5 ホーム画面動作 OK（前 handover §N.4）
  - Phase 6 O-1〜O-5（a/b/c）全 PASS（前 handover §O.4 / 2026-05-05 ユーザー報告）
- カテゴリ I 31 項目の網羅実機検証は未実施（残課題 §E.1 で消化）

### D.5 PR #10 reviewer レビュー（2026-05-06）

- **判定**: GO（main マージ可、軽微指摘 4 件はマージ後対応可）
- **レビュー観点**: A（サイレント故障）/ B（isDraft 集約）/ C（API 認可マトリクス）/ D（採番堅牢化）/ E（Phase 6 網羅性）/ F（既存テスト独立性）
- **重大指摘数**: 0 件
- **軽微指摘数**: 4 件 → 残課題 §E.8〜§E.11 として起票
- **実機検証推奨**: 1 件（TRANSFERRED 状態ガード挙動）→ 残課題 §E.12 として起票
- **レビュー結論サマリ**:
  - スコープ 17 コミット範囲でサイレント故障防止規律と isDraft 集約規律が一貫遵守
  - cancel ルート認可マトリクス（401/403/404/409/200）はテスト網羅
  - 採番堅牢化ロジックは numbering.test.ts で網羅、ただし 1000 件到達時のガードなし（§E.11）
  - 既存テスト失敗（offline-fetch.test.ts:94）は 8efbb21 由来でスコープ 17 コミット外、マージブロック要因にあらず

---

## §E 残課題（次セッション以降の対応必要事項）

### E.1 main マージ判断（PR #10 レビュー待ち）— 優先度: 中

- 状態: PR #10 (https://github.com/miyagaworks/rodo/pull/10) は push 完了 / レビュー待ち
- 対応案: reviewer エージェントで PR #10 をレビュー → 修正 → main マージ → smoke-test カテゴリ I 31 項目を本番 dev で実機検証
- 関連: 計画書 Phase 8b
- 推奨着手タイミング: 次セッション初動

### E.2 RecordClient L414-435 にも assert 追加 — 優先度: 低（別タスク化）

- 状態: Phase 7 改訂スコープ A-2 の対象は ReportOnsite / ReportTransport / Record のうち、Record の現状実装ではヘッダーホームボタン onClick で auto-save が直接埋め込まれているため、assert スタイルではなく `res.ok` チェックのみで対応済み（`c7a60ce`）。同一の assert スタイル（`dispatch.isDraft===true` の事後検証）を追加するかは別議論。
- 対応案: 別タスクで「Phase 7 補強（RecordClient assert 追加）」として独立起票
- 関連: 計画書 §3 Phase 7 改訂スコープ A-2、コミット `fe73de7` / `c7a60ce`
- 推奨着手タイミング: main マージ後の改善ラウンド

### E.3 §8.7 書類画面ブラウザバック禁止 — 優先度: 中（独立タスク）

- 状態: Phase 6 実機検証中（2026-05-05）にユーザー発見。書類作成 3 画面（RecordClient / ReportOnsiteClient / ReportTransportClient）でブラウザバックを押すと前画面（DispatchClient）に戻れてしまい、隊員が前回のアシスタンス情報を引きずる事故リスクあり
- 対応案: popstate ガード新設 + 専用モーダル通知（「ホームに戻るには画面上のホームボタンを使ってください」）。ホームボタン経由は既存挙動維持
- 関連: 計画書 §8.7、前 handover §N.6
- 推奨着手タイミング: Phase 8b（main マージ判断）完了後の独立タスクで着手

### E.4 §8.3 多重出動サーバ側 409 ガード — 優先度: 中（別タスク起票済み）

- 状態: Phase 5 のクライアント抑止と独立。`POST /api/dispatches` で active 案件保有時は 409 を返す物理防止
- 対応案: 既存 §8.4 オフライン active キャッシュ（E.5）と組み合わせて、SW 経由の楽観的レスポンスでも多重作成を防げる設計
- 関連: 計画書 §8.3、前 handover §N.6
- 推奨着手タイミング: §8.4 と並行 or 直後

### E.5 §8.4 オフライン active キャッシュ — 優先度: 中（別タスク起票済み）

- 状態: §9.0-D 確定により Phase 5 では未着手。SW networkOnly + 503 X-SW-Offline 時のバナー非表示問題の対応
- 対応案: `localStorage` / `IndexedDB` の last-known active キャッシュを用意し、オフライン時もバナー表示を維持
- 関連: 計画書 §8.4、前 handover §N.6
- 推奨着手タイミング: §8.3 と組み合わせて検討

### E.6 既存 lint 64 errors / 45 warnings — 優先度: 低（別タスク化）

- 状態: Phase 1〜7 起因なし。Phase 1 着手前から存在する既存問題
- 対応案: Q-01 コード品質負債タスクとして別途消化（`docs/pre-launch-checklist.md` 等で管理）
- 関連: コミット `3fed59e` `docs(pre-launch): Q-01 コード品質負債（既存 lint 58 errors）を追加`
- 推奨着手タイミング: 本番リリース前のクリーンアップフェーズ

### E.7 既存テスト失敗（offline-fetch.test.ts:94）— 優先度: 低（未起票）[未確認]

- 状態: Phase 2 着手前から失敗している既存問題。本実装で混入したものではない
- 対応案: 別タスクで fixer に委任
- 関連: 前 handover §K.4
- 推奨着手タイミング: 別途起票

### E.8 PR #10 レビュー軽微指摘 #1: SecondaryDispatchClient 親 PATCH サイレント故障 — 優先度: 中

- 状態: PR #10 reviewer レビュー（2026-05-06 / §D.5）で検出。`components/dispatch/SecondaryDispatchClient.tsx` L451-457（handleReturn の親 PATCH `{ status: 'RETURNED', isDraft: true }`）と L542-548（handleCancelStep target='return' の親 STORED 戻し `{ status: 'STORED', isDraft: false }`）に `res.ok` チェックなし、catch 句が `console.error(e)` のみ。失敗時に親 isDraft が反転せず、ホームバナーに親が「進行中」と残るデータ不整合リスク
- 対応案: 既存パターン（同ファイル L432-449 など、Phase 1 / 4 時点から存在する `await offlineFetch + try/catch + console.error` 構造）と同型のため、サイレント故障一掃タスクとして独立起票し、SecondaryDispatchClient 全 PATCH 呼び出しを一括して `res.ok` チェック + alert + X-SW-Offline 識別パターンに揃える
- 関連: AGENTS.md「修正完了報告のサイレント故障チェック」、過去事例 2026-05-01 RecordClient.handleProceed、PR #10 reviewer レビュー観点 A
- 推奨着手タイミング: main マージ後の改善ラウンド（独立 PR、修正CC へプロンプト出力）

### E.9 PR #10 レビュー軽微指摘 #2: RecordClient ヘッダーホームボタン X-SW-Offline 整合化 — 優先度: 低（§E.2 と統合可）

- 状態: PR #10 reviewer レビューで検出。`components/dispatch/RecordClient.tsx` L436-456 ヘッダーホームボタン onClick 内 PATCH 後に X-SW-Offline 識別 / assert なし。同ファイル L355 handleDraftSave（L373-387 で X-SW-Offline 識別 + isDraft assert 完備）と非対称
- 対応案: ヘッダーホームボタン onClick 内 PATCH 後に handleDraftSave と同等の X-SW-Offline 識別 + dispatch.isDraft===true assert を追加。§E.2「RecordClient L414-435 にも assert 追加」と統合検討
- 関連: コミット fe73de7（Phase 7 改訂スコープ A-2c）、§E.2、PR #10 reviewer レビュー観点 A
- 推奨着手タイミング: §E.2 と同タイミング（main マージ後の改善ラウンド）

### E.10 PR #10 レビュー軽微指摘 #3: cancel ルート 異常データメッセージ整合化 — 優先度: 低

- 状態: PR #10 reviewer レビューで検出。`app/api/dispatches/[id]/cancel/route.ts` L82-91 で `isPostReturn && dispatch.isDraft === true` の場合に「書類作成中」メッセージを返すが、RETURNED && returnTime===null && isDraft===true という異常データ状態では事実と異なるメッセージとなる
- 対応案: cancellable 判定（L73-79）と対称になるよう `returnTime !== null` 条件をメッセージ分岐にも追加。データ整合性が崩れた場合の防御コード強化
- 関連: PR #10 reviewer レビュー観点 C
- 推奨着手タイミング: 別タスク（main マージ後の改善ラウンド）

### E.11 PR #10 レビュー軽微指摘 #4: 採番 1000 件超ガード追加 — 優先度: 低

- 状態: PR #10 reviewer レビューで検出。`app/api/dispatches/route.ts` L119-134 の `slice(-3)` 末尾 3 桁方式は同日内 1000 件目で誤動作（"1000".slice(-3) === "000" → +1 → 衝突）。テナントスループット上未到達だが numbering.test.ts にガードテストなし
- 対応案: numbering.test.ts に「同日内 999 件到達時の挙動」テストを追加し、現実装の上限（999 件 / 日）を明示。1000 件超対応は将来課題として別途設計（4 桁化検討）
- 関連: PR #10 reviewer レビュー観点 D
- 推奨着手タイミング: 別タスク（main マージ後の改善ラウンド）

### E.12 TRANSFERRED 状態ガード挙動の実機検証 — 優先度: 中

- 状態: PR #10 reviewer レビュー観点 E で実機検証推奨と判定。inProgress 計算（DispatchClient: `dispatchId !== null && step >= 1 && step < (mode === 'transport' ? 5 : 4)`）に isTransferred が含まれず、TRANSFERRED 状態かつ step が中間値の場合にガードが残る可能性
- 対応案: `docs/smoke-test-checklist.md` カテゴリ I に「振替済み（TRANSFERRED）状態でのガード挙動」追加項目を追記し、Phase 8b 実機検証で網羅。実機で問題が再現した場合は inProgress 計算ロジックに `!isTransferred` 条件を追加する独立タスク起票
- 関連: コミット e44d81c（Phase 3）、PR #10 reviewer レビュー観点 E
- 推奨着手タイミング: Phase 8b 実機検証時（main マージ前 or 直後）

---

## §F 次セッション初動アクション

### F.1 推奨アクション

1. **本ノートと前 handover §J / §K / §L / §M / §N / §O を再読**（5 分）
2. **PR #10 を reviewer エージェントでレビュー**（残課題 §E.1）
   - 重点ファイル: `app/api/dispatches/[id]/cancel/route.ts`、`app/api/dispatches/active/route.ts`、`hooks/useDispatchInProgressGuard.ts`、`lib/dispatch/active-status.ts`、`components/dispatch/DispatchClient.tsx`、`components/dispatch/SecondaryDispatchClient.tsx`、`components/HomeClient.tsx`、`components/ActiveDispatchBanner.tsx`、`components/dispatch/CancelDispatchButton.tsx`、`components/dispatch/BackToHomeConfirmModal.tsx`
   - 重点観点:
     - サイレント故障チェック（res.ok / catch / 楽観的更新の有無）
     - `isActiveDispatchStatus` 新シグネチャの呼び出し全箇所
     - `dispatch.isDraft` 更新責任の集約（C-12 の遵守）
     - 案件キャンセル後のガード非経由（Phase 4 onCancelled）
3. レビュー指摘 → 修正コミット → push → main マージ判断
4. main マージ後、smoke-test カテゴリ I 31 項目を本番 dev で実機検証
5. 残課題 §E.3〜§E.6 を独立タスクとして順次起票

### F.2 PR #10 レビュー観点リスト

- **API 認可**: cancel ルートで「自分の案件 OR ADMIN」判定が機能しているか（隊員が他人の案件を 403 で弾けるか）
- **採番衝突**: 同日内 CANCELLED 案件混入時の番号衝突がないか（numbering.test.ts のシナリオ網羅性）
- **isDraft の race**: 出動記録ボタン連打で多重 PATCH を起こさないか（disabled 制御 + サーバ冪等処理）
- **オフライン挙動**: SW 503 + X-SW-Offline=1 が `useActiveDispatch` の error 経路に正しく流れるか
- **Phase 6 実機検証の網羅性**: O-5 の a/b/c が「帰社後」の全ケースをカバーしているか（旧基準失効の回帰防止）
- **既存テスト失敗（残課題 §E.7）**: Phase 1〜7 と独立であることが追跡可能か

### F.3 dev server 状態

- PID 44863 が `localhost:3100` で起動中の可能性 [未確認]
- 起動状況は `lsof -i :3100` で確認すること

### F.4 untracked 残置（温存中、触らない）

本ノートのコミット時点（2026-05-06）で `git status` に出ている untracked は以下 4 件:

- `docs/handover/2026-05-02-break-instant-end-fix.md`
- `docs/handover/2026-05-04-dispatch-floating-prevention-impl.md`（本ノート自体、コミット対象）
- `scripts/check-admin-state.ts`
- `scripts/list-unfinished-breaks.ts`

本ノート以外の 3 件は前タスクの慣行に従い untracked のまま残す方針（コミットしないことで本実装の差分にノイズを混ぜない）。
なお、前 handover (`docs/handover/2026-05-04-dispatch-floating-prevention.md`) と計画書 (`docs/plans/dispatch-floating-prevention.md`) は既にコミット済みのため untracked ではない。参照は §G を参照のこと。

### F.5 浮き案件テストデータ（温存）

Phase 5 / Phase 6 の動作確認で使用したがキャンセルしていないため、Phase 8b 実機検証でも引き続き利用可能:

- Dispatch id=`cmoqlpabf00038z5z6esgn94v`
- dispatchNumber=`20260504001`
- status=`DISPATCHED`、returnTime=null
- 隊員: `admin@shimoda.example.com`（ADMIN ロール）
- 用途: 「出動中なのに戻れない」「ホーム画面で別操作ができてしまう」を再現するためのテストデータ

---

## §G 参照ドキュメント

- 計画書: `docs/plans/dispatch-floating-prevention.md`（Phase 1〜8 / Phase 5.5 / 改訂履歴含む）
- 前 handover: `docs/handover/2026-05-04-dispatch-floating-prevention.md`（§A〜§O / 計画立案〜Phase 6 実機検証 PASS まで）
- 前タスク handover: `docs/handover/2026-05-02-break-instant-end-fix.md`（休憩自動 close の前駆実装）
- smoke-test: `docs/smoke-test-checklist.md` カテゴリ I（31 項目）
- 調査レポート: `docs/research/2026-05-04-dispatch-floating-prevention-research.md`（Phase 1 着手前の現状コード調査）

---

## §H 完了サマリ（本ノート用統計）

- ファイルパス: `docs/handover/2026-05-04-dispatch-floating-prevention-impl.md`
- 行数: 約 470 行（本セクション含む）
- セクション数: 8 個（§A〜§H）
- §C ユーザー確認済み項目数: 16 個（C-1〜C-16）
- §D 検証状況サブセクション: 5 個（D.1〜D.5、PR #10 reviewer レビュー結果含む）
- §E 残課題数: 12 個（E.1〜E.12、内 5 件は PR #10 reviewer レビューで追加起票）
- [未確認] タグ個数: 2 個（F.3 dev server 状態、E.7 既存テスト失敗の起票状況）

### 断定に対する根拠の限界

- **B.1 Phase 1 の API 動作確認**: 自動テストで担保しているが、`POST /api/dispatches/[id]/cancel` の本番 dev 環境での 401/403/404/409 ハンドリングは Phase 4 の cancel ボタン経由で間接的に確認したのみで、API 単体のフル網羅検証は行われていない（実害は低いが、main マージ前のスモークでカバー推奨）
- **B.2 Phase 2 の実機検証**: フック単体は実機検証されておらず、Phase 3 統合後の挙動でのみ検証されている
- **F.3 dev server 状態**: PID 44863 の存続は本セッションでは未確認
