
# 出動中の浮き案件防止 — 引き継ぎノート

作成日: 2026-05-04
作成者: Super（前セッション） → 次セッション
ブランチ: feature/p0-13-signature-blob

> **追記（2026-05-05）**: 帰社後ガード継続・出動記録ボタンによる isDraft 状態遷移の仕様変更を反映済み。詳細は計画書 `docs/plans/dispatch-floating-prevention.md` の Phase 5.5 補強タスクおよび §9.0-A 例外を参照。

## §A 概要

ユーザーが smoke-test（D-08 検証）中に発見した設計問題。

**症状**:
- 隊員が出動を開始した後、ホーム画面に戻ると「出動中である」ことが UI 上に表現されない
- ホーム画面から再度休憩・別案件の出動を開始することが可能な状態
- 結果、進行中の案件が「浮いた」状態で DB に残り、ダッシュボードでは「出動中」表示なのに、隊員側は別操作ができてしまう乖離が発生

**ユーザーの設計提案（Super も賛同・確定済み）**:
> 「一度出動すると、取り消さない限り戻ることができない設計が必要」

## §B 関連コミット（時系列）

| 日付 | 識別子 | 内容 |
|---|---|---|
| 2026-05-02 | （前タスク） | `POST /api/breaks` / `GET /api/breaks/active` で `closeStaleBreaks` を自動実行。60分超過の孤児 BreakRecord を片付ける |
| 2026-05-04 | `7f5eeb2` | `/api/admin/members-status` 経由でも `closeStaleBreaksForTenant` を呼ぶ（案B-2）。ダッシュボード経路で60分超過の孤児を片付ける |
| 2026-05-04 | （本セッション最終コミット） | `POST /api/dispatches` で active BreakRecord を自動 close。「休憩中に出動」シナリオに対応 |

## §C ユーザー確認済み仕様（2026-05-04）

確認者: miyagawakiyomi（プロジェクトオーナー）

1. **救援業務での休憩中の出動**: 業務上あり得る。出動が始まれば休憩は自動終了する
2. **出動中の隊員の制約**: 出動中は別の出動も休憩も開始できない（同時に2件持つことは業務的にあり得ない、物理的に1台の車で1案件しか対応できない）
3. **出動状態の可視性**: 出動中であることは隊員が常に視認でき、出動画面に戻れる動線が必要
4. **浮き案件の扱い**: 進行中の案件は取り消さない限り、別の操作（休憩・新規出動）ができない設計が望ましい
5. **pause 中の時間は実消化していない**（既存仕様、2026-05-02 確認の継承）

## §D 既存実装の前提（着手前に再確認すること）

- `POST /api/dispatches` は新しい Dispatch を `status='DISPATCHED'` で作成
- 出動画面は `components/dispatch/DispatchClient.tsx`、出動 ID を URL param で受け取る形式
- ホーム画面 `components/HomeClient.tsx` は「現在 active な Dispatch」を考慮しておらず、アシスタンスボタンは出動状態に関わらず常に表示される
- ホームの休憩ボタンは `breakState.status !== 'paused' && canStartBreak === true` で出し分け（出動状態は判定材料に入っていない）
- ステータス判定の正は `lib/admin/status-derivation.ts` の `deriveStatus`（admin ダッシュボードで使用）

## §E 次セッションで決定すべき論点

### 論点1: 「戻れない」の実装方針

| 案 | 意味 | 業務上の妥当性 |
|---|---|---|
| (a) 強制リダイレクト式 | 出動中の隊員がホームを開こうとすると出動画面へ自動転送 | 強制力は強いが、ダッシュボード閲覧等の操作も封じる可能性。隊員はホーム画面を見られなくなる |
| (b) バナー式 | ホーム上部に「進行中: 案件番号 [出動画面に戻る]」を常時表示 | 業務常識に合う。次に何をすべきかが明確 |
| (c) 操作無効化式 | ホームのアシスタンスボタン・休憩ボタンを全てグレーアウト | バナー式と組み合わせると最強 |

**Super 推奨**: (b) + (c) の組み合わせ。動線確保（バナー）+ 不正操作防止（グレーアウト）。

### 論点2: active Dispatch の判定基準

`deriveStatus` と同じ判定でよいか確認:
- `DISPATCHED` / `ONSITE` / `TRANSPORTING` → active
- `COMPLETED && returnTime IS NULL` → 帰社中扱い、これも active か？
- `STORED` / `RETURNED` / `CANCELLED` / `TRANSFERRED` → 非 active

### 論点3: 出動 ID の取得経路

ホーム画面側で active Dispatch を取得する手段:
- (i) `/api/dispatches?userId=me&active=1` 的な専用エンドポイントを新設
- (ii) 既存の `useAdminDispatches` 等から拾う（隊員視点の API があるか要確認）
- (iii) セッション情報に持たせる（重い）

### 論点4: 管理者ロールの扱い

- 管理者も同じ制約を受けるか
- 業務的には管理者は出動しない想定だが、現状管理者ロールでも `POST /api/dispatches` が通る（本セッションの動作確認で確認済み）
- ロール別の制約とするか、ロール無関係で一律とするか

## §F 現在の DB 状態（次セッションのテストデータ）

### 浮き案件（保持して活用）

- Dispatch id=`cmoqlpabf00038z5z6esgn94v`
- dispatchNumber=`20260504001`
- status=`DISPATCHED`, returnTime=null
- dispatchTime=`2026-05-04T02:49:38.387Z`
- 隊員: 管理者 (`admin@shimoda.example.com`, role=ADMIN)
- 用途: 「出動中なのに戻れない」「ホーム画面で別操作ができてしまう」を再現するためのテストデータ

### 既に手動修正済みの BreakRecord（参考）

- id=`cmoqloh2100018z5zx8xrkwao` の endTime: 手動で `2026-05-04T02:50:39.980Z` に設定済み
- id=`cmoo5owyw00078oloae35m12w`（5/2 の 40時間孤児）の endTime: 手動で `2026-05-02T09:45:36.203Z` に設定済み

## §G 修正前チェックリスト（着手時に必ず確認）

rodo `AGENTS.md` 準拠:

- [ ] `components/HomeClient.tsx` のフロー全体を読む（特にアシスタンスボタン表示条件・休憩ボタン表示条件）
- [ ] `components/dispatch/DispatchClient.tsx` の出動状態管理・遷移条件を読む
- [ ] `lib/admin/status-derivation.ts` の `deriveStatus` を再確認
- [ ] 隊員視点で active Dispatch を返す API が既存にあるか grep（`active.*dispatch` `dispatches.*active` 等）
- [ ] `proxy.ts` / `middleware` の認証ゲート（隊員ロール vs 管理者ロール）の挙動
- [ ] Service Worker (`public/sw.js`) のキャッシュ・フォールバック影響
- [ ] `hooks/useOfflineMutation` 等から `POST /api/dispatches` を叩く経路の影響
- [ ] DB スキーマ（Prisma `Dispatch`）の `status` 列定義と取り得る値

## §H 参照ドキュメント

- `docs/handover/2026-05-02-break-instant-end-fix.md`（5/2 の前タスク）
- `docs/smoke-test-checklist.md`（本タスクの D-08 検証中に発覚）
- 直近のコミット: `7f5eeb2`（案B-2: ダッシュボード経路の孤児自動クローズ）
- 直近のコミット: 本セッション最終コミット（案B: 出動開始時の休憩自動close）

## §I 進め方の推奨（次セッション初動）

1. このノートを冒頭で読む
2. §G のチェックリストを一つずつ消化し、計画書（例: `docs/plans/dispatch-floating-prevention.md`）に書き出す
3. §E の論点1〜4 をユーザーに確認（特に論点1の (a)/(b)/(c) と、論点4 の管理者の扱い）
4. 計画CC（planner）で設計書を作成
5. 設計書承認後、実装CC（implementer）または修正CC（fixer）に委任
6. 実機検証 → コミット・プッシュ → smoke-test 続行

---

**注**: 本ノートは untracked のまま残す方針。前タスクの `2026-05-02-break-instant-end-fix.md` と同じ慣行に従う。コミットしないことで、現セッションでの修正コミットの差分にノイズを混ぜない。

---

## §J 進捗追補（2026-05-04 セッション後半: 調査・計画完了、Phase 1 着手前）

### J.1 完了した作業

| 作業 | 成果物 |
|---|---|
| 現状コード調査（5画面の戻る経路・取り消し実装・進行中判定の根） | `docs/research/2026-05-04-dispatch-floating-prevention-research.md` |
| 実装計画書作成（8 Phase / 35 ステップ / 21〜29h） | `docs/plans/dispatch-floating-prevention.md` |

### J.2 確定済み 5 論点（§E は古い・本セクションが正）

| # | 論点 | 確定方針 |
|---|---|---|
| 1 | 戻る制御方式 | 進行中なら確認ダイアログでホーム遷移をブロック。5画面共通フック化。popstate / beforeunload もカバー。setTimeout / window.location.href のホーム遷移6件にも適用 |
| 2 | 案件キャンセル機能 | `POST /api/dispatches/[id]/cancel` 新設。`VALID_STATUS_TRANSITIONS` に active → CANCELLED 追加。隊員は自分の案件のみ、管理者は全案件 |
| 3 | 案件番号の扱い | 論理削除（status=CANCELLED）。dispatchNumber は欠番として残す。物理削除しない。採番ロジックを `count+1` から `同日内最大番号+1` に堅牢化 |
| 4 | 管理者の扱い | 一律同じ制約 |
| 5 | 再ログイン時の復帰動線 | `GET /api/dispatches/active` 新設、HomeClient に進行中バナー（5論点目として追加） |

### J.3 ユーザー確定事項（2026-05-04 miyagawakiyomi 確認済み）

| # | 確定内容 |
|---|---|
| A | **書類作成画面（ReportOnsiteClient / ReportTransportClient / RecordClient）はガード適用外**。現場対応中（DispatchClient / SecondaryDispatchClient）のみガード対象 |
| B | 振替済み（status=TRANSFERRED）の元案件は本タスクのキャンセル対象外 |
| C | キャンセル可能な状態は「現場で動いている案件のみ」= DISPATCHED / ONSITE / WORKING / TRANSPORTING / COMPLETED && returnTime IS NULL |
| D | 派生課題: (3)(4)(6) 本タスクに組み込み。(1)(2) 別タスク化。(5) 業務確認継続 |

詳細は `docs/plans/dispatch-floating-prevention.md` §9.0 参照。

### J.4 次セッションの初動

1. 本ノート（§J まで）と計画書 §1〜§9 を読む
2. **Phase 1（API 基盤）の implementer CC 投入用プロンプトを Super が提示する**（前セッション末でユーザーが明示要求）
3. 計画書 §3 Phase 1 の実装手順 1〜6 をプロンプトに反映:
   - 採番堅牢化（`app/api/dispatches/route.ts`）
   - 2次搬送・振替の採番堅牢化判断
   - `VALID_STATUS_TRANSITIONS` 拡張（案 A: 専用 cancel ルートで遷移検証ローカル化）
   - `POST /api/dispatches/[id]/cancel` 新設（J.3-C のキャンセル可能状態に従って 409 ガード）
   - `GET /api/dispatches/active` 新設
   - テスト（tester に並列委任可）
4. プロンプト承認後、ユーザーが implementer CC に投入
5. 完了報告 → Super 点検 → Phase 2 へ

### J.5 規模感

- 全 8 Phase で 21〜29 時間 = **3〜5 セッション程度に分割**
- Phase 単位で完了→コミット→次セッション
- 並列化候補: Phase 3 と 5（Phase 2 完了後）、Phase 6 と 7（Phase 3 完了後）

### J.6 別タスク化される派生課題（本タスク完了後に起票予定）

- 写真・入力途中値のブラウザ削除耐性（IndexedDB / SW 調査）
- DispatchClient `handleCancelStep` の res.ok 未チェック修正

### J.7 浮き案件テストデータ（§F から継承）

- Dispatch id=`cmoqlpabf00038z5z6esgn94v` (dispatchNumber=`20260504001`, status=DISPATCHED)
- 動作確認シナリオ（計画書 §7.1〜§7.7）で活用

---

## §K Phase 1 / Phase 2 完了記録（2026-05-04 セッション）

### K.1 Phase 1 完了

- コミット: `c47ca51` `feat(api/dispatches): add cancel/active routes and harden numbering for floating dispatch prevention`
- 成果物:
  - `app/api/dispatches/active/route.ts`（新規）GET。レスポンス: `{ dispatch: { id, dispatchNumber, status, returnTime, type, subPhase, assistance: { name } } | null }`
  - `app/api/dispatches/[id]/cancel/route.ts`（新規）POST。401 / 403 / 404 / 409 / 200 `{ ok: true, dispatch: { id, status } }`。CANCELLABLE_STATUSES = DISPATCHED/ONSITE/WORKING/TRANSPORTING/COMPLETED(returnTime null)
  - `app/api/dispatches/route.ts`（変更）採番堅牢化（`同日内最大 dispatchNumber + 1`）
- 案 A 採用: `VALID_STATUS_TRANSITIONS` には CANCELLED 遷移を**追加せず**、cancel ルート内でローカル検証（既存 PATCH ルート非汚染）

### K.2 Phase 2 完了

- コミット: `7400b5a` `feat(dispatch): add active-dispatch hook and in-progress guard (Phase 2)`
- 成果物（新規 6 ファイル）:
  - `lib/dispatch/active-status.ts`: `isActiveDispatchStatus(status, returnTime)` + `mapStatusToSubPhase` 再エクスポート
  - `hooks/useActiveDispatch.ts`: GET /api/dispatches/active のクライアント側フック。X-SW-Offline=1 を error 経路に流す
  - `hooks/useDispatchInProgressGuard.ts`: `safeNavigateHome` / `replaceLocation` / popstate / beforeunload。MVP は `window.confirm`、Phase 3 で共通モーダル（`BackToHomeConfirmModal`）を `onAttemptHome` callback に差し込む
  - `__tests__/lib/dispatch/active-status.test.ts`
  - `__tests__/hooks/useActiveDispatch.test.tsx`
  - `__tests__/hooks/useDispatchInProgressGuard.test.tsx`（40 テスト全件 PASS）
- **既存 5 画面への import は 0 件**（統合は Phase 3 担当・計画書 Phase 2 完了条件準拠）
- 設計判断確定:
  - `isActiveDispatchStatus` は WORKING を含まない（GET /active と一致、cancel route の CANCELLABLE_STATUSES とは別軸）
  - `mapStatusToSubPhase` はクライアント import 可能（status-derivation.ts は純粋関数のみ）
  - useActiveDispatch は polling なし（マウント時 + refresh() のみ）

#### K.2.1 補足（2026-05-05 ユーザー確定）— `isActiveDispatchStatus` シグネチャ拡張

> ⚠️ 上記 K.2 の設計判断（`isActiveDispatchStatus(status, returnTime)` / WORKING を含まない / Phase 2 時点）は **2026-05-05 ユーザー確定の仕様変更により改訂される**。改訂の実装は計画書 `docs/plans/dispatch-floating-prevention.md` Phase 5.5 で行うため、Phase 2 完了時点のコードはそのまま参照値として残す。
>
> **変更前（Phase 2 実装済み / 2026-05-04 確定）**
>
> ```ts
> export function isActiveDispatchStatus(
>   status: DispatchStatus | string,
>   returnTime: Date | null,
> ): boolean {
>   if (status === 'DISPATCHED' || status === 'ONSITE' || status === 'TRANSPORTING') return true
>   if (status === 'COMPLETED' && returnTime === null) return true
>   return false
> }
> ```
>
> **変更後（2026-05-05 ユーザー確定 / Phase 5.5 で実装）**
>
> ```ts
> export function isActiveDispatchStatus(
>   status: DispatchStatus | string,
>   returnTime: Date | null,
>   isDraft: boolean,
> ): boolean {
>   if (
>     status === 'DISPATCHED' ||
>     status === 'ONSITE' ||
>     status === 'TRANSPORTING'
>   ) return true
>   if (status === 'COMPLETED' && returnTime === null) return true
>   // 新規（2026-05-05）: 帰社後でも出動記録ボタン未押下なら active
>   if (
>     (status === 'COMPLETED' || status === 'RETURNED') &&
>     returnTime !== null &&
>     isDraft === false
>   ) return true
>   return false
> }
> ```
>
> **追加された真値条件**
> - **新規**: (`COMPLETED` || `RETURNED`) && `returnTime !== null` && `isDraft === false`（帰社後・書類作成未着手）
>
> **WORKING の扱い（2026-05-05 ユーザー確認確定）**
>
> WORKING は `lib/admin/status-derivation.ts` L15 で「schema にだけ存在するデッドコード」と明記されており、DB に書き込まれない予備値である。「作業中」UI ラベルは `ONSITE` + step=2 で実現されているため、WORKING を新シグネチャに含めない方針で確定。将来 WORKING を実装する設計変更が入った時点で改めてガード対象判定を見直す。
>
> **呼び出し側の影響箇所（Phase 5.5 で改修）**
>
> | ファイル | 修正内容 |
> |---|---|
> | `lib/dispatch/active-status.ts` | シグネチャ拡張・判定追加 |
> | `app/api/dispatches/active/route.ts` | where 句に `isDraft === false` 条件を追加（GET /active と関数判定の整合性維持） |
> | `components/dispatch/DispatchClient.tsx` | `isActiveDispatchStatus(status, returnTime, dispatch.isDraft)` で呼び出し。L1544 出動記録ボタン onClick も同 Phase で修正 |
> | `components/dispatch/SecondaryDispatchClient.tsx` | 同上（2 次搬送側） |
> | `hooks/useDispatchInProgressGuard.ts` | `isDraft` を引数に追加 or `useActiveDispatch` から取得 |
> | `hooks/useActiveDispatch.ts` | レスポンスに `isDraft` を含める（API 側で select 追加が必要） |
> | `components/HomeClient.tsx` | `ActiveDispatchBanner` の表示条件で `isDraft` を考慮 |
> | `components/ProcessingBar.tsx` | active 判定で `isDraft` を考慮（必要に応じて）[未確認] |
>
> **注意**: K.2 で「`isActiveDispatchStatus` は WORKING を含まない」と確定した設計判断は、新仕様でも維持される。**2026-05-05 ユーザー確認確定**: WORKING は `lib/admin/status-derivation.ts` L15 で「schema にだけ存在するデッドコード」と明記、DB に書き込まれない予備値のため新シグネチャに含めない方針で確定（「作業中」UI ラベルは `ONSITE` + step=2 で実現済み・既存ガードでカバー済み）。将来 WORKING を実装する設計変更が入った時点で改めてガード対象判定を見直す。

### K.3 Phase 3 着手前の注意点（次セッション初動）

1. **§9.0-A 確定事項を再確認**: 書類作成画面（ReportOnsiteClient / ReportTransportClient / RecordClient）は **ガード適用外**。Phase 3 のスコープは **現場対応 2 画面（DispatchClient / SecondaryDispatchClient）に絞られる**
2. 計画書 §3 Phase 3 のファイル一覧のうち、ReportOnsiteClient / ReportTransportClient / RecordClient への変更は §9.0-A により**スキップ**
3. 新規ファイル: `components/dispatch/BackToHomeConfirmModal.tsx`（5 画面共通だが Phase 3 では 2 画面のみ統合）
4. useDispatchInProgressGuard の `onAttemptHome` callback に BackToHomeConfirmModal の表示制御を差し込む二段階アプローチ
5. inProgress 判定: `step` ベース or `dispatch.status` ベース。Phase 3 implementer 投入時に Read で再確認
6. Phase 3 完了条件: 2 画面で戻るボタン押下 → モーダル表示 → ホーム遷移しない（実機確認）

### K.4 派生事項（別タスク化済み・未起票）

- `__tests__/lib/offline-fetch.test.ts:94` の事前から存在するテスト失敗。Phase 2 着手前から失敗していた既存問題（implementer が git stash で再現確認）。本タスクのスコープ外、fixer 案件として別途起票推奨

### K.5 git 状態（2026-05-04 セッション末）

- ブランチ: `feature/p0-13-signature-blob`
- 直近コミット: `7400b5a` (Phase 2)、`c47ca51` (Phase 1)、`c6baa87` (前タスク: 出動開始時の休憩自動 close)
- リモート同期済み（push 完了）
- untracked のまま残す慣行:
  - `docs/handover/2026-05-04-dispatch-floating-prevention.md`（本ノート）
  - `docs/plans/dispatch-floating-prevention.md`（計画書）
  - `docs/handover/2026-05-02-break-instant-end-fix.md`（前タスクノート）

---

## §L Phase 3 完了記録（2026-05-04 セッション）

### L.1 完了概要

- コミット予定メッセージ: `feat(dispatch): integrate in-progress guard into DispatchClient and SecondaryDispatchClient (Phase 3)`
- 対象スコープ: §9.0-A 確定により**現場対応 2 画面のみ**（DispatchClient / SecondaryDispatchClient）。書類作成画面（ReportOnsite / ReportTransport / RecordClient）は対象外を堅持

### L.2 成果物

| 種別 | パス | 概要 |
|---|---|---|
| 新規 | `components/dispatch/BackToHomeConfirmModal.tsx` | 進行中ガード共通モーダル。OK ボタン 1 つのみ・背景クリックで閉じる |
| 新規 | `__tests__/components/dispatch/BackToHomeConfirmModal.test.tsx` | 4 ケース全件 PASS |
| 変更 | `components/dispatch/DispatchClient.tsx` | useDispatchInProgressGuard 導入 + 戻るボタン (L901) onClick を `safeNavigateHome(router)` 経由に変更 + 末尾モーダル配置 |
| 変更 | `components/dispatch/SecondaryDispatchClient.tsx` | 同上（戻るボタン L583） |

### L.3 inProgress 判定の確定ロジック

- **DispatchClient**: `dispatchId !== null && step >= 1 && step < (mode === 'transport' ? 5 : 4)`
  - 根拠: `getInitialStep` (L60-69) で帰社後は onsite=4 / transport=5。step 0 は未出動
  - `isActiveDispatchStatus` を採用しなかった理由: 新規出動シナリオでは `initialDispatch=null` のためサーバ status を持たない。step ベースで両シナリオを一意にカバーできる
- **SecondaryDispatchClient**: `secondaryId !== null && step >= 1 && step < 4`
  - 根拠: `getInitialStep` (L53-60) で step 4 = 帰社後

### L.4 UI 文言の最終確定

計画書 §3 Phase 3 ステップ 1 の確定文言は引用入れ子のため `『案件キャンセル』` 表記だが、UI 実装は外側 「 」 が存在しない単独表示のため日本語慣行に従い `「案件キャンセル」` を採用した。

- **UI 実装文言**: `進行中の案件があります。ホームに戻るには「案件キャンセル」ボタンで取り消してください`
- 計画書側は引用入れ子として typographically 正しいため**改変しない**。両者は意味同一・括弧種のみ差異

### L.5 サイレント故障チェック

- 新規 fetch なし → 該当なし
- popstate / beforeunload は Phase 2 実装を破壊していない（フック未変更）

### L.6 テスト結果

- `pnpm test`: 1 failed / 872 passed。失敗は `__tests__/lib/offline-fetch.test.ts:94` の §K.4 既存失敗のみ（Phase 3 起因なし）
- `pnpm build`: PASS（ESLint 警告なし）
- `npx tsc --noEmit`: PASS

### L.7 範囲外（Phase 4 以降に持ち越し）

- 案件キャンセル UI（CancelDispatchButton）→ Phase 4
- HomeClient の進行中バナー → Phase 5
- popstate / beforeunload の実機検証（Android Chrome / iOS Safari / Desktop Chrome）→ Phase 6 の手動検証扱い
- ホーム遷移補助 6 件（DispatchClient L343/L1174/L1508、Secondary L747、Report 系、RecordClient）→ Phase 7
- 動作確認シナリオ smoke-test 反映 → Phase 8

### L.8 次セッション初動（Phase 4 / Phase 5 並列着手の可能性）

計画書 §3 補足の依存グラフより、Phase 4（案件キャンセル UI）と Phase 5（HomeClient バナー）は Phase 2 完了済みのため並列実行可能。worktree で並列、もしくは順次実行を Super と相談して決定する。

着手時の必読:
1. 本ノート §J / §K / §L
2. 計画書 §3 Phase 4, §3 Phase 5, §9.0-B（TRANSFERRED 対象外）, §9.0-C（CANCELLABLE 状態）, §9.0-E（アシスタンスボタン抑止方法）, §9.0-F（バナー遷移先 MVP）
3. Phase 1 完成 API: `app/api/dispatches/[id]/cancel/route.ts`, `app/api/dispatches/active/route.ts`
4. Phase 2 完成フック: `hooks/useActiveDispatch.ts`

---

## §M Phase 4 完了記録（2026-05-04 セッション）

### M.1 完了概要

- コミット: `a09a3cc` `feat(dispatch): add CancelDispatchButton for in-progress 2 screens (Phase 4)` + `fc94da0` `docs(smoke-test): mark D-06 / D-07 as verified`
- リモート push 済み（feature/p0-13-signature-blob）
- 対象スコープ: §9.0-A により**現場対応 2 画面のみ**（DispatchClient / SecondaryDispatchClient）。書類作成 3 画面は対象外を堅持

### M.2 成果物

| 種別 | パス | 概要 |
|---|---|---|
| 新規 | `components/dispatch/CancelDispatchButton.tsx` | キャンセル確認モーダル + `POST /api/dispatches/[id]/cancel` 呼び出し |
| 新規 | `__tests__/components/dispatch/CancelDispatchButton.test.tsx` | 7 ケース全件 PASS |
| 変更 | `components/dispatch/DispatchClient.tsx` | ヘッダー右端 (L924-940) に ml-auto で配置 |
| 変更 | `components/dispatch/SecondaryDispatchClient.tsx` | `isTransferred` / `secondaryDispatchNumber` 新設、ヘッダー (L612-625) に配置 |

### M.3 表示・動作の確定仕様

- **表示条件**: `inProgress && !isTransferred && id && number`
- **onCancelled**: `router.push('/')` 直接呼び出し（Phase 3 ガード非経由＝キャンセル成功時は active を抜けるため安全）
- **fetch 経路**: 素の `fetch` 使用、`offlineFetch` 不使用（計画書 §5.4 確定方針）。オフライン時はキャンセル不可に倒す
- **エラー出し分け**: 401 / 403 / 404 / 409 / その他 / catch すべて alert で個別文言

### M.4 検証結果

- `pnpm test`: 879 passed
- `pnpm build`: PASS
- `npx tsc --noEmit`: PASS

### M.5 次セッション = Phase 5（HomeClient 進行中バナー）

Phase 5 は Phase 1 + Phase 2 完了済みのため着手可能（依存グラフより Phase 4 とは並列関係）。本セッション内で着手。

着手時の必読:
1. 本ノート §J / §K / §L / §M
2. 計画書 §3 Phase 5, §9.0-A（書類画面はガード適用外＝Phase 5 のアシスタンス抑止には影響なし）, §9.0-D（§8.4 オフラインキャッシュ判断）, §9.0-E（アシスタンスボタン抑止方法）, §9.0-F（バナー遷移先 MVP）
3. Phase 1 完成 API: `app/api/dispatches/active/route.ts`
4. Phase 2 完成フック: `hooks/useActiveDispatch.ts`
5. 改修対象: `components/HomeClient.tsx`, `components/AssistanceButton.tsx`（disabled prop 非対応のため拡張要）

### M.6 Super 判断（Phase 5 着手前確定）

- **§8.4 オフラインキャッシュは Phase 5 内で実装しない → 別タスク化**
  - 根拠: 計画書 Phase 5 ステップ4 でフェイルクローズ方針確定済み（API 失敗時は console.error + バナー非表示）
  - 多重出動の物理防止は §8.3（POST /api/dispatches サーバ側 409 ガード）で別途担保する設計
  - implementer に「時間予算次第」と委ねるとスコープ膨張のため Phase 5 では明示的にスコープ外とする
- **AssistanceButton の disabled 対応は Phase 5 スコープに含む**
  - 拡張内容: `disabled?: boolean`, `onDisabledClick?: () => void` props を追加
  - disabled 時はグレーアウト（opacity-50 + cursor-not-allowed）+ 押下で `onDisabledClick` 経由 alert
  - 既存呼び出し箇所は HomeClient のみのため影響範囲限定的

---

## §N Phase 5 完了記録（2026-05-05 セッション）

### N.1 完了概要

- コミット: `fc7d60f` `feat(home): add active-dispatch banner and assistance suppression (Phase 5)`
- リモート push 済み（feature/p0-13-signature-blob、`fc94da0..fc7d60f`）
- 対象スコープ: HomeClient のバナー表示 + アシスタンス/休憩抑止のみ。書類画面 3 つは §9.0-A により対象外を堅持

### N.2 成果物

| 種別 | パス | 概要 |
|---|---|---|
| 新規 | `components/ActiveDispatchBanner.tsx`（43 行） | 赤系・aria-label 付きクリッカブル button。Props: `dispatchNumber`, `onClick` |
| 新規 | `__tests__/components/ActiveDispatchBanner.test.tsx`（53 行・4 ケース PASS） | dispatchNumber 表示 / onClick / aria-label / 戻るラベル |
| 新規 | `__tests__/components/AssistanceButton.test.tsx`（146 行・9 ケース PASS） | 既存挙動 3 + disabled 抑止 6 |
| 変更 | `components/HomeClient.tsx`（+30 行） | useActiveDispatch 統合、バナー配置（max-w-md 内最上部）、アシスタンス disabled 化、休憩ボタン条件追加 |
| 変更 | `components/AssistanceButton.tsx`（+33 行） | `disabled?: boolean` / `onDisabledClick?: () => void` props 追加。HTML disabled は使わず handleClick 内早期 return |
| 既存追記 | `__tests__/components/HomeClient.test.tsx`（+144 行） | useActiveDispatch モック化 + Phase 5 シナリオ 3 ケース（null / 進行中あり / error フェイルクローズ） |

### N.3 確定動作仕様

- **バナー配置**: `<main>` 内 `<div className="max-w-md ...">` の最上位（`<div className="mb-3"><BreakBar /></div>` より上）
- **バナー表示条件**: `activeDispatch !== null`
- **バナー押下**: `router.push(`/dispatch/${activeDispatch.id}`)` 直接呼び出し（§9.0-F MVP）
- **アシスタンス抑止**: `disabled={!!activeDispatch}` + `onDisabledClick={() => alert('進行中の案件があります')}`
  - HTML disabled は付けない（onClick が拾えなくなるため）。handleClick 冒頭で `if (disabled) { onDisabledClick?.(); return }` の早期 return
  - スタイル: `opacity-50 cursor-not-allowed`（hover/active アニメーション無効化）
- **休憩ボタン抑止**: `breakState.status !== 'paused' && canStartBreak === true && !activeDispatch`
- **エラーハンドリング**: `useActiveDispatch` の `error` は HomeClient で参照しない。`activeDispatch` が `null` のままなのでバナー非表示・抑止なし＝フェイルクローズしない設計

### N.4 検証結果

- `pnpm test`: 895/896 PASS（事前から既知の `__tests__/lib/offline-fetch.test.ts:94` の 1 件のみ失敗、Phase 5 起因なし）
- `pnpm build`: ✓ Compiled successfully in 3.8s（push 直前に Super 自身が再実行）
- `npx tsc --noEmit`: PASS
- 実機動作確認: ユーザー側で OK 判定済み

### N.5 サイレント故障チェック（4 項目すべて遵守）

- ✅ useActiveDispatch 由来の error で alert 出さず（フェイルクローズ）
- ✅ バナー onClick は素の Next.js Router 呼び出し（fetch 経由ではない）
- ✅ AssistanceButton disabled 時の既存 onClick 漏れ呼び出しなし（テストで pushMock 未呼出を検証）
- ✅ 休憩ボタン条件追加で型エラーなし（`!activeDispatch` で boolean 化）

### N.6 派生課題（別タスク化済み・本タスク完了後に起票）

- **§8.4 オフラインキャッシュ**: §9.0-D 確定により Phase 5 では未着手。SW networkOnly + 503 X-SW-Offline 時のバナー非表示問題は、§8.3 サーバ側 409 ガードで多重出動を物理防止する設計でカバーする想定
- **§8.3 POST /api/dispatches サーバ側 409 ガード**: 多重出動の物理防止。Phase 5 のクライアント抑止と独立した別タスク

### N.7 Phase 6 着手前の注意点（次セッション初動）

#### 必読

1. 本ノート §J / §K / §L / §M / §N
2. 計画書 §3 Phase 6, §6.3（ブラウザバック対策の UX 副作用）, §6.4（SW キャッシュ古さ）, §9.5（iOS Safari beforeunload 不発の許容判断）
3. Phase 2 完成フック: `hooks/useDispatchInProgressGuard.ts`（popstate / beforeunload の骨格は実装済み・MVP は `window.confirm`）
4. Phase 3 完成: `components/dispatch/BackToHomeConfirmModal.tsx`（モーダル UI）

#### Phase 6 のスコープ確認（Super 判断要）

計画書 §3 Phase 6 の主目的は以下:
- popstate ハンドラ実装の本体化（仮想エントリ pushState + popstate で `inProgress` ならモーダル表示）
- beforeunload ハンドラ実装の本体化（`inProgress` 時のみ登録、preventDefault + returnValue=''）
- `window.confirm` ベース MVP から `BackToHomeConfirmModal` 連携への昇格

ただし、**Phase 2 で `useDispatchInProgressGuard.ts` の popstate / beforeunload は既に実装済み**（§K.2 で報告済み）。Phase 6 の実体は「Phase 3 で `window.confirm` のままにしてある箇所をモーダル統合する」だけの可能性が高い。次セッション初動で `useDispatchInProgressGuard.ts` と Phase 3 統合先（DispatchClient / SecondaryDispatchClient）を Read で再確認し、Phase 6 のスコープを確定する。

#### Phase 6 で改修される可能性のあるファイル

| ファイル | 変更想定 |
|---|---|
| `hooks/useDispatchInProgressGuard.ts` | popstate ハンドラの仮想エントリ実装が Phase 2 時点で完成している場合、変更なしの可能性 |
| `components/dispatch/DispatchClient.tsx` | `window.confirm` → `BackToHomeConfirmModal` 連携 |
| `components/dispatch/SecondaryDispatchClient.tsx` | 同上 |

#### 実機検証（Phase 6 の核）

| 端末/ブラウザ | 検証内容 |
|---|---|
| Android Chrome | スワイプバック / ブラウザ戻るで `BackToHomeConfirmModal` 表示・遷移ブロック |
| iOS Safari | スワイプバックでブロック動作（[未確認] iOS の制約あり）。beforeunload は §9.5 により不発許容 |
| Desktop Chrome | ブラウザ戻るボタン / タブ閉じ・リロードで beforeunload 警告 |

実機検証は Phase 6 の完了条件に含まれるため、ユーザーが 3 端末で確認できる時間枠を確保した上で着手すること。

#### Phase 7 との並列化判断

計画書 §3 補足の依存グラフでは Phase 6 と Phase 7 は Phase 3 完了後に並列実行可能。
ただし Super 推奨: **順次実行**（Phase 6 → Phase 7）。
- 根拠: Phase 6 は実機 3 端末検証で集中作業が向く。Phase 7 は fixer 担当の修正系（ホーム遷移補助 6 件）で、Phase 6 で確定したガード挙動を引き継いだ方が手戻り少
- worktree 並列にすると、Phase 6 の挙動変更が Phase 7 マージ時にコンフリクトする可能性

### N.8 git 状態（2026-05-05 セッション末）

- ブランチ: `feature/p0-13-signature-blob`
- 直近コミット: `fc7d60f` (Phase 5)、`fc94da0` (smoke-test D-06/D-07)、`a09a3cc` (Phase 4)、`e44d81c` (Phase 3)、`7400b5a` (Phase 2)、`c47ca51` (Phase 1)
- リモート同期済み（push 完了）
- untracked のまま残す慣行:
  - `docs/handover/2026-05-04-dispatch-floating-prevention.md`（本ノート）
  - `docs/plans/dispatch-floating-prevention.md`（計画書）
  - `docs/handover/2026-05-02-break-instant-end-fix.md`（前タスクノート）
  - `scripts/check-admin-state.ts` / `scripts/list-unfinished-breaks.ts`（調査用ローカルスクリプト）

### N.9 浮き案件テストデータ（§F / §J.7 から継承・温存）

Phase 5 の動作確認で使用したが**キャンセルしていない**ため、Phase 6 / Phase 7 / Phase 8 でも引き続き利用可能:

- Dispatch id=`cmoqlpabf00038z5z6esgn94v`
- dispatchNumber=`20260504001`, status=`DISPATCHED`, returnTime=null
- 隊員: `admin@shimoda.example.com` (ADMIN)

---

## §O Phase 6 実機検証手順（2026-05-05 セッション末作成）

### O.0 検証方針

Phase 6 で改修した `useDispatchInProgressGuard.ts`（popstate / beforeunload ハンドラ）と Phase 3 の `BackToHomeConfirmModal` 統合は、jsdom 上の自動テスト（§N.7 で言及した `useDispatchInProgressGuard.test.tsx` 18 ケース、本セッションで追加した `DispatchClient.guard-integration.test.tsx` / `SecondaryDispatchClient.guard-integration.test.tsx` 各 1 ケース）で wiring レベルは保証された。**ただしブラウザのネイティブな履歴 API・スワイプバック・beforeunload プロンプトは jsdom で再現できないため、3 端末での実機検証が PASS 判定の必須条件**。

### O.1 検証対象端末

| 端末/ブラウザ | 必須/任意 | 備考 |
|---|---|---|
| Android Chrome（実機 or BrowserStack） | 必須 | スワイプバック・ブラウザ戻る・beforeunload すべて要検証 |
| iOS Safari（実機） | 必須 | スワイプバック要検証。beforeunload は §9.5 により不発許容 |
| Desktop Chrome（macOS/Windows） | 必須 | ブラウザ戻る・タブ閉じ・リロードの beforeunload 要検証 |

所要時間目安: 1 端末あたり 15〜20 分 × 3 = **45〜60 分**

### O.2 検証シナリオ表

| ID | 画面 | 操作 | 期待結果 | PASS 判定 |
|----|------|------|----------|-----------|
| O-1 | DispatchClient（出動中・step 1〜3） | ブラウザ戻るボタン押下 | `BackToHomeConfirmModal` が表示。OK 押下で閉じるが、ホームへは遷移しない | モーダル表示 + URL が `/dispatch/...` のまま |
| O-2 | DispatchClient（出動中・step 1〜3） | OS スワイプバック（モバイルのみ） | 同 O-1 | 同上 |
| O-3 | DispatchClient（出動中・step 1〜3） | タブ閉じ・リロード | beforeunload 警告（Desktop Chrome / Android Chrome）。iOS Safari は不発許容 | Desktop/Android で「Leave site?」相当のダイアログ表示。iOS は不発でも許容 |
| O-4 | SecondaryDispatchClient（2次搬送中・step 1〜3） | O-1 / O-2 / O-3 の 3 シナリオ | 同 O-1〜O-3（モーダル表示・遷移ブロック・beforeunload 警告） | 同上 |
| O-5 | DispatchClient（帰社後・onsite step≥4 / transport step≥5） | ブラウザ戻るボタン押下 | §O.2.1 補足参照（2026-05-05 仕様変更により判定基準反転） | §O.2.1 補足参照 |

#### O.2.1 O-5 新基準の詳細（2026-05-05 ユーザー確定 — 判定基準反転）

> ⚠️ O.2 表内の O-5 行の「期待結果 / PASS 判定」は 2026-05-05 ユーザー確定の仕様変更により判定基準が反転している。表内には旧基準を残し対比形式で参照可能にしているが、**実機検証時は本サブセクションの新基準（a / b / c）を必須**とする。旧基準は 2026-05-05 をもって失効。
>
> **旧基準（PASS / 〜2026-05-04）**: ガード解除済み。確認モーダルなしでホームへ遷移できる（モーダル非表示 + URL が `/`）

**新基準の詳細（a / b / c すべてが PASS で O-5 PASS）**

- **a. 帰社後・`isDraft === false` で戻るボタン押下**
  - 期待: `BackToHomeConfirmModal` が表示され、「進行中の案件があります」モーダルが出る。ホーム遷移しない。
  - 期待 URL: `/dispatch/...` のまま
  - 旧基準との差分: 旧基準では「モーダル非表示でホームに遷移」が PASS だったが、新仕様では active 継続のためブロックする
- **b. 上記 a のモーダル表示中に「案件キャンセル」ボタン押下**
  - 期待: 確認ダイアログ → OK → `POST /api/dispatches/[id]/cancel` 成功 → status=CANCELLED → ホームに戻れる
  - 期待 URL: `/`
  - 期待バナー: ホームに active バナーなし（キャンセル済みのため）
- **c. 出動記録ボタン押下後（`isDraft === true`）の戻るボタン挙動**
  - 期待: 出動記録ボタン押下で `PATCH /api/dispatches/[id] { isDraft: true }` 成功 → `router.push(/dispatch/${id}/record)`
  - その後、書類作成画面（RecordClient）の戻るボタン押下でホームに戻れる（§9.0-A 原則どおりガード対象外）
  - ホーム下部の「下書き」バナー（必要に応じて新設 / 既存の場合は復帰動線として機能）からクリックで書類作成画面に復帰可能であること
  - 期待 URL: `/` → バナークリックで `/dispatch/${id}/record` に復帰

**O-5 の判定が変わる理由（2026-05-05 ユーザー確定）**

- 旧仕様では「帰社 = 現場対応終了 = ガード解除」と直線的に扱っていた
- 新仕様では「帰社 + 出動記録ボタン押下」の 2 段階で「現場対応終了 → 書類作成着手」の遷移を明示化する
- これにより「帰社したが書類作成を開始していない案件」が浮き案件化することを防ぐ
- §9.0-A 原則（書類作成画面はガード対象外）は維持し、例外として「出動記録ボタン未押下の段階」を加えた形

**前提依存**: 計画書 Phase 5.5 補強タスク（`isDraft` 状態遷移実装）が完了していること。Phase 5.5 未完了状態で O-5 新基準は検証不可（実装が存在しないため）。

### O.3 浮き案件テストデータでの再現手順

1. **§N.9 のテストデータを使う場合**:
   - 隊員アカウント `admin@shimoda.example.com`（ADMIN ロール）でログイン
   - URL 直打ちで `/dispatch/cmoqlpabf00038z5z6esgn94v` にアクセス（dispatchNumber=`20260504001`, status=`DISPATCHED`）
   - status=DISPATCHED かつ `dispatchTime` あり → `getInitialStep` により step=1 → `inProgress=true`
   - O-1〜O-3 を順に実行
2. **新規出動で再現する場合**:
   - 任意のアシスタンスで「出動」押下 → step=1 になることを確認
   - O-1〜O-3 を順に実行
3. **2 次搬送で再現する場合**（O-4）:
   - 帰社まで完了した親案件に対して 2 次搬送を開始 → SecondaryDispatchClient で step=1 になることを確認
   - O-4 を実行
4. **帰社後のガード解除確認**（O-5）:
   - 出動完了 → 帰社押下 → step が onsite=4 / transport=5 / secondary=4 になることを確認
   - 戻るボタン押下 → モーダルが**表示されない**ことを確認

### O.4 ユーザー記入欄

| シナリオ | 端末名 | OS バージョン | ブラウザ | 確認日 | 結果 (P/F) | 備考 |
|---|---|---|---|---|---|---|
| O-1 | | | Android Chrome | | | |
| O-2 | | | Android Chrome | | | |
| O-3 | | | Android Chrome | | | |
| O-1 | | | iOS Safari | | | |
| O-2 | | | iOS Safari | | | |
| O-3 | | | iOS Safari | | | beforeunload 不発は §9.5 により許容 |
| O-1 | | | Desktop Chrome | | | |
| O-3 | | | Desktop Chrome | | | |
| O-4 (×3) | | | （3 端末） | | | |
| O-5 (a/帰社後 isDraft=false) | | | （3 端末） | | | 新基準 a |
| O-5 (b/モーダル中キャンセル) | | | （3 端末） | | | 新基準 b |
| O-5 (c/isDraft=true 後) | | | （3 端末） | | | 新基準 c。書類画面戻る + 下書きバナー復帰の 2 観点 |

### O.5 失敗時の切り分け指針

- **モーダルが出ない（O-1 / O-2）**: useDispatchInProgressGuard.ts の `handlePopState` 内で `inProgressRef.current` が false になっている可能性。DevTools で `dispatchId` と `step` を console.log して確認
- **モーダル表示後に router.push が走る**: `safeNavigateHome` の戻り値処理を確認。Phase 3 の `onAttemptHome: () => { setShowGuardModal(true); return false }` が常に false を返しているか確認
- **beforeunload 警告が出ない（O-3 / Desktop Chrome）**: ブラウザ側で警告を抑制しているケース（連続で同タブを使った場合など）を疑う。シークレットウィンドウで再試行
- **戻る押下を 2 回繰り返すと突破する**: 仮想エントリ pushState の多重 push 防止 `virtualEntryPushedRef` のリセットロジックを再確認

### O.6 PASS 後のハンドオフ

実機検証 3 端末すべてで O-1〜O-5 が PASS した場合:
1. 本ノートの O.4 表に結果を記入
2. Super に「Phase 6 実機検証 PASS」を報告
3. Super がコミット → push（推奨メッセージ: `feat(dispatch): finalize popstate/beforeunload tests and verification handover (Phase 6)`）
4. Phase 7（ホーム遷移補助 6 件の改修）に着手

### O.7 失敗時のロールバック判断

- 1 シナリオでも FAIL の場合、原因を特定するまで Phase 7 へ進まない
- Phase 6 の実装は Phase 2 の `useDispatchInProgressGuard.ts` および Phase 3 の統合でほぼ完成しているため、ロジック修正は最小限の想定。**スコープ D で改修要否ゼロと判断したため、FAIL は実機固有問題か未対応エッジケースの可能性が高い**

### O.8 Scope D（hooks/useDispatchInProgressGuard.ts 本体改修要否）の判断結果

Phase 6 の implementer が以下 4 観点を Read で点検した結果:

| 観点 | 判断 | 根拠 |
|---|---|---|
| 仮想エントリ pushState の cleanup 不備 | 不要 | マウント時に push する URL は `window.location.href`（現在 URL）と同一。unmount 時に cleanup しなくてもユーザーの履歴が汚染されることはない。戻る矢印の挙動も変わらない |
| popstate ハンドラ内で onAttemptHome が複数回呼ばれる race | 不要 | `tryAttempt()` は async だが `setShowGuardModal(true)` は冪等。連続発火しても副作用なし |
| inProgress=false 化時の virtualEntryPushedRef リセット漏れ | 不要 | useEffect 内 else 分岐 (L148-151) で明示的に `virtualEntryPushedRef.current = false` にリセット済み。A-4 テストで動作検証済み |
| その他バグ | 不要 | 既存 18 ケースの自動テスト全 PASS。コード Read でも明らかな bug なし |

**結論: 本体改修不要**。Phase 6 の実装スコープは Scope A〜C で完結する。
