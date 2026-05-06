# 2026-05-06 引き継ぎノート: D-10 派生タスク完了 / Phase 8b スモークテスト再開待ち

## §A. セッション概要

本セッションは Phase 8b スモークテスト（カテゴリ I）の再開を目的として開始したが、
途中で D-10「二次搬送予定日 編集」の検証中に業務仕様問題を発見し、
カレンダー・テーブル両方への「2 次予定」表示機能を実装・コミット・プッシュまで完了した。

カテゴリ I のスモークテスト（残 31 項目）は次セッションで再開予定。

## §B. 完了した作業

### B-1. 検証

- **I-1.1** DispatchClient 出動押下後の戻るボタンブロック → 検証 OK、チェック反映済み
- **D-10** 二次搬送予定日 編集 → 実装確認 OK（ScheduledSecondaryEditor + API + 型定義 + バリデーション全て揃っていた）

### B-2. 業務仕様問題の発見

保管案件は業務フロー上 `isDraft=true` のまま運用されるため、
DispatchCalendar / DispatchTable の isDraft 最優先ロジックにより
`scheduledSecondaryAt` が UI で見えない状態だった。

a000374 コミット（業務仕様 2026-05-06: 下書き保管案件もダッシュボード表示）と
矛盾するため、表示優先順位の見直しを実施。

### B-3. 実装（3 コミット、push 済み）

| ハッシュ | コミットメッセージ | 内容 |
|---|---|---|
| 05c63e8 | feat(admin/calendar): add "2予" badge with priority over "下書" | calendar API に secondaryPlanRows 追加、DispatchCalendar に "2予" バッジ（#71a9f7）、rowKindOf 優先順位変更、ScheduledSecondaryEditor の invalidate 拡張、テスト 15 件追加 |
| b6c8a77 | feat(admin/table): add "2次予定" badge and always-on "搬送予定" column | statusLabel/statusBadgeClass に scheduledSecondaryAt 引数、STORED + 予定あり → "2次予定" バッジ、搬送予定列の常時表示化、テスト 4 件追加 |
| bb4fe7d | docs(smoke-test): mark D-08 and I-1.1 as verified | チェックリスト 2 項目反映 |

### B-4. 検証結果

- tsc --noEmit: PASS
- next build: PASS
- 全体テスト: 948 PASS / 2 FAIL（既存失敗 2 件は本変更と無関係）
- ユーザー実機確認: OK
- リモート push 完了

## §C. ユーザー確認済み業務仕様（次セッションで参照すべき）

### C-1. 下書き保管案件の表示（2026-05-06 確認）

- 同一 Dispatch レコードが「下書きリスト」と「保管リスト」両方に表示される（a000374 で実装）
- `app/api/admin/dispatches/route.ts` の `case 'stored'` は isDraft フィルタなし
- ホーム/案件管理どちらでも、isDraft フィルタは保管リストに適用しない

### C-2. 二次搬送予定の表示優先順位（2026-05-06 確認）

- `scheduledSecondaryAt` は `isDraft` と別軸の業務情報
- カレンダー・テーブルで「2予」「2次予定」を「下書」より優先表示
- 1 次（onsite/transport）の下書き判定は変更しない（既存維持）
- 実施済「2次」と「2次予定」は色で区別

### C-3. ラベルと色（確定）

| 表示先 | ラベル | 色 | 条件 |
|---|---|---|---|
| カレンダー | 2予 | #71a9f7 | scheduledSecondaryAt あり（isSecondaryTransport=false） |
| カレンダー | 2次 | #1C2948 | dispatchTime ベース（実施済 2 次） |
| テーブル | 2次予定 | #71a9f7 + 白文字 | status=STORED + scheduledSecondaryAt あり |

### C-4. 持ち越し案件への下書き表示（2026-05-06 確認）

- `case 'unbilled'` フィルタから `isDraft = false` 条件を削除
- 下書き状態の前日以前未請求案件も、ダッシュボードの「持ち越し案件」リストに表示する
- 理由: 下書き = 完成させ忘れた案件であり、持ち越しリストで気づくべき対象
- §C-1（保管案件）と同じ趣旨の追従修正
- 関連: research/2026-05-06-overdue-dispatch-disappear-on-report-view.md

## §D. プロジェクト状態（次セッション開始時の前提）

### D-1. git 状態

- ブランチ: `feature/dispatch-floating-prevention-phase8b`
- 最新コミット: `bb4fe7d docs(smoke-test): mark D-08 and I-1.1 as verified`
- リモート: 同期済み（push 完了）
- main へのマージはまだ（PR / マージは別タスク扱い）

### D-2. dev サーバ

- 本セッション開始時に PORT=3100 で起動済み（PID 14767）
- 次セッション開始時に再確認推奨: `lsof -i :3100`
- 停止していれば: `cd ~/Projects/rodo/app && PORT=3100 npm run dev`

### D-3. 未コミット・未追跡

- 未コミット変更: なし
- 未追跡ファイル 3 件（本セッション処理対象外として保留）:
  - `docs/handover/2026-05-02-break-instant-end-fix.md`
  - `scripts/check-admin-state.ts`
  - `scripts/list-unfinished-breaks.ts`

## §E. 残課題（優先度順）

### 🟡 中: E-1. Phase 8b スモークテスト再開（本筋）

- 場所: `docs/smoke-test-checklist.md` カテゴリ I（L753〜）
- 残: I-1.2 〜 I-9.1 の 31 項目
- 完了済み: I-1.1
- 各項目は実機（ブラウザ）操作で確認、結果を Super に報告 → チェックリスト反映

### 🟡 中: E-2. scheduledSecondaryAt クリア運用

- 内容: 子（`isSecondaryTransport=true`）が完了したら親の `scheduledSecondaryAt` を NULL に戻す業務フロー追加
- 必要性: 完了済 2 次搬送の親レコードに `scheduledSecondaryAt` が残ると、カレンダーに「2予」が誤表示される
- 業務仕様確認 + 実装が必要
- 関連ファイル候補（要調査）: 2 次搬送完了処理（report API or PATCH dispatch route）

### 🟢 低: E-3. 既存テスト失敗 2 件

- `__tests__/lib/offline-fetch.test.ts` 「オンライン POST で 5xx」（事前から失敗）
- `__tests__/api/admin/dispatches.test.ts` 「status=stored フィルタ」（a000374 の追従漏れ、isDraft=false 制約が外れたためテスト期待値が古い）

### 🟢 低: E-4. ESLint 既存エラー

- `components/admin/DispatchTable.tsx:198` `react-hooks/set-state-in-effect`
- 本タスク変更前から存在
- useEffect + setPage(1) を derived state 化 or useMemo 化で解消推奨

### 🟢 低: E-5. D-10 チェック反映（先送り）

- 本セッションで実装・動作確認 OK
- 次セッションで `smoke-test-checklist.md` の D-10 を `[x]` に更新

### 🟢 低: E-6. 未追跡ファイルの扱い判断

- `docs/handover/2026-05-02-break-instant-end-fix.md` ほか 2 件
- 中身確認 → コミット or 削除を判断

## §F. 次セッション開始時の推奨手順

1. このノートを Super に読ませる: `docs/handover/2026-05-06-d10-secondary-plan-handover.md`
2. dev サーバ起動確認: `lsof -i :3100`、停止していれば `cd ~/Projects/rodo/app && PORT=3100 npm run dev`
3. 推奨開始タスク: **E-1（Phase 8b スモークテスト I-1.2 から再開）**
4. ユーザーが別優先を指定した場合は E-2 / E-5 / E-3 / E-4 / E-6 から選択

## §G. ユーザー特性メモ（Super に必須）

- 業界用語ゼロ前提（git の commit/push/PR/merge 等を知らない可能性が常時）
- 選択肢を並べると判断不能 → 「OK / 待って / 変えて」3 択で誘導
- 専門用語は例え話とセット
- Super 側で方針確定して誘導
- 区切りごとのコミット必須（後で一気にコミット禁止）
- 称賛・同調禁止、根拠を問う
- 推測発言は `[推測]` `[未確認]` タグ必須
- 「決め打ち」「決めうち」表現禁止（「方針確定」「結論」等で代替）

## §H. プロジェクト固有ルール（rodo）

- `AGENTS.md` に「This is NOT the Next.js you know」: Next.js 16 系で破壊的変更あり、`node_modules/next/dist/docs/` を参照してから着手
- 業務仕様判断: ユーザー明示確認のみ「正」、推論は `[未確認]` タグ
- 旧ノートの誤った仕様は削除せず ⚠️ 警告ヘッダーを付けて残す
- 修正前チェックリスト（fetch/auth/SW/offline 関連の横断変更時）
- サイレント故障チェック（修正完了報告に必須）

## §I. 直近のコミット履歴（参考）

```
bb4fe7d docs(smoke-test): mark D-08 and I-1.1 as verified
b6c8a77 feat(admin/table): add "2次予定" badge and always-on "搬送予定" column
05c63e8 feat(admin/calendar): add "2予" badge with priority over "下書"
a000374 fix(admin): include draft dispatches in stored list and today summary
89c0a52 docs(smoke-test): add E.12 TRANSFERRED guard verification to category I
6a32966 Merge pull request #10 from miyagaworks/feature/p0-13-signature-blob
d8d853a docs(handover): add PR #10 review results and 5 follow-up tasks (E.8-E.12)
```

## §J. 2026-05-06 セッション後半の状態（タスクA・B 進捗）

### J-1. 完了済み（push 済み）

| コミット | 内容 |
|---|---|
| `dec97ac` | fix(admin/dashboard): include draft dispatches in overdue list — §C-4 持ち越しリスト isDraft フィルタ削除 |
| `5cf4041` | feat(admin/table): add edit button and improve dispatch number link visibility — タスクA |

### J-2. タスクA 完了内容（参考）

- `components/admin/DispatchTable.tsx` のみ変更（4 箇所、+11/-4 行）
- 案件番号 Link を `text-blue-600 hover:text-blue-800 hover:underline` に変更
- 請求列に `<Link data-testid="dispatch-edit-link">編集</Link>` を追加（全行常時表示）
- グリッド最終列の min-width を 180px → 240px に拡張（ヘッダ L278・行 L392 両方）
- tsc / build / vitest 13/13 PASS、サイレント故障チェック該当なし

### J-3. 進行中: タスクB（カレンダー「テーブルで詳細を見る」空表示問題）

#### 不具合内容

- カレンダー 5/7 セルの「2予 20260506001」（dispatchTime=2026-05-06, scheduledSecondaryAt=2026-05-07）
- セル下部「N件 詳細を見る」 → 日付別出動一覧モーダル表示
- モーダル内「テーブルで詳細を見る」クリック → from=to=2026-05-07 でテーブルフィルタ
- 案件管理画面が「該当する案件はありません」と表示される

#### 調査CC 報告サマリ（仮説: 真）

- `app/api/admin/dispatches/route.ts` L57-71: `where.dispatchTime` のみで絞る（scheduledSecondaryAt は select のみ）
- `app/api/admin/calendar/route.ts` L142-162, L239-258: secondaryPlanRows は scheduledSecondaryAt 由来で 5/7 セルに集約
- `components/admin/DispatchCalendar.tsx` L429-441, L575: モーダル N件 = primary + secondary + secondaryPlan の和集合
- 既存テスト（`__tests__/api/admin/dispatches.test.ts` L263-280）に scheduledSecondaryAt 考慮の日付フィルタテストは **なし**

#### 業務仕様確定（2026-05-06 ユーザー確認）

> 「カレンダー 5/7 セルから『テーブルで詳細を見る』を押した時、5/7 セルにバッジが出ていた案件だけを見たい」

= カレンダーが 5/7 セルで集約している集合（dispatchTime=5/7 **OR** scheduledSecondaryAt=5/7）と完全一致するものをテーブルで見せる。

採用案: **案A（テーブル日付フィルタを `dispatchTime` OR `scheduledSecondaryAt` の OR 条件に拡張）**

#### 不採用案（記録）

- 案B: カレンダーから親 dispatchTime（5/6）に飛ばす → UX のねじれ大（5/7 セルから飛んだのに 5/6 が出る）
- 案C: 新フィルタ軸追加 → UI 拡張過剰
- 案D1: `dateMatch=any` 切替パラメータ → API 仕様増過剰

#### 次セッションで実施すること

1. **Super 役割**: 案A の修正CC 用プロンプトを設計
2. 修正対象: `app/api/admin/dispatches/route.ts` の where 句拡張
   - 現状: `where.dispatchTime = { gte, lte }`
   - 変更後: `where.OR = [{ dispatchTime: { gte, lte } }, { scheduledSecondaryAt: { gte, lte } }]`（範囲式は同じ）
   - 既存の他 where 条件（status, userId 等）と OR が干渉しないよう、AND/OR の入れ子に注意
3. テスト追加（`__tests__/api/admin/dispatches.test.ts`）:
   - scheduledSecondaryAt のみ範囲一致でヒットすること
   - dispatchTime のみ範囲一致でヒットすること
   - 両方一致時に重複行が出ないこと（findMany の挙動として OR は自然に重複しないが念のため）
4. UX 補助バッジ（行に「2次予定 5/7」表示）は **別タスク**として起票（今回スコープ外）

### J-4. 別件メモ

- 未追跡ファイル 3件（`docs/handover/2026-05-02-break-instant-end-fix.md` / `scripts/check-admin-state.ts` / `scripts/list-unfinished-breaks.ts`）は §E-6 で保留中
- dev サーバ PID 14767 は Mac mini 再起動で消える前提。再起動後は `cd ~/Projects/rodo/app && PORT=3100 npm run dev`
- ブランチ: `feature/dispatch-floating-prevention-phase8b`、最新コミットは push 完了後に確認

### J-5. 再起動後の Super 起動プロンプト（旧版・参考）

旧プロンプト（再起動直後セッションで使用済み・履歴）:

```
~/Projects/rodo/app/docs/handover/2026-05-06-d10-secondary-plan-handover.md
を読んで把握してください。完了したら「引き継ぎ把握完了」と返してください。
§J（特に J-3）に本セッション後半の状態が追記されています。
タスクB（案A 採用済み）の修正CC プロンプト設計から再開します。
モデルは全 CC で Opus を使用してください。
```

### J-6. 2026-05-06 セッション最終後半の追加作業（コミット bbe36bc 〜 99d549f）

#### J-6-a. タスクB（案A）実装完了

| コミット | 内容 |
|---|---|
| `bbe36bc` | fix(admin/dispatches): include scheduledSecondaryAt in date range filter |

- `app/api/admin/dispatches/route.ts` の期間フィルタを `where.OR = [{ dispatchTime }, { scheduledSecondaryAt }]` に拡張
- `__tests__/api/admin/dispatches.test.ts` の既存「期間フィルタ」テストを OR 構造に書き換え
- 新規テスト 2 件追加（scheduledSecondaryAt のみ一致 / dispatchTime のみ一致）
- vitest 16 PASS / 1 既知 FAIL（§E-3 既知）、tsc / build PASS

#### J-6-b. 案件編集ページ廃止 → 報告ページ統合（ユーザー要望 2026-05-06）

ユーザー要望: 「案件編集ページの内容は報告/請求ページの全項目を入れたい」
→ Super 提案: 報告ページ UI を管理者画面でも流用する案を採用（重複 UI 解消）

| コミット | 内容 |
|---|---|
| `3e291f7` | refactor(admin/table): redirect dispatch links to existing report page |
| `99d549f` | refactor(admin): remove deprecated dispatch edit page and form |

- `DispatchTable.tsx` の案件番号リンク・編集ボタン両方を `/dispatch/[id]/report` に変更
- `app/admin/dispatches/[id]/page.tsx` 削除
- `components/admin/DispatchEditForm.tsx` 削除（620 行）
- `__tests__/components/admin/DispatchEditForm.test.tsx` 削除（7 テスト）
- 認可改修不要（report ページは tenantId スコープで管理者は他案件アクセス可）
- API ルート（PATCH 系・billing）は ScheduledSecondaryEditor / 請求ボタンが現役で使用中のため残置

#### J-6-c. ドキュメント反映

| コミット | 内容 |
|---|---|
| `bc64420` | docs(smoke-test): mark D-10 to D-20 as verified |

- D-10 〜 D-20 の 11 項目を verified に変更（ユーザー実機確認済み）

## §K. 次セッションで対応する残課題

### K-1. 🟢低: smoke-test-checklist.md の旧手順記述更新

- 内容: D-23 等の `/admin/dispatches/[id]` 経由の編集手順記載を `/dispatch/[id]/report` 導線に書き換え
- 関連: J-6-b（編集ページ廃止）の追従
- 規模: 小（docs のみ、実機影響なし）
- 依存: なし

### K-2. 🟢低: DispatchCalendar.tsx L10-32 の古い設計議論コメント整理

- 内容: 過去の設計選択肢議論が含まれる長大コメント（L10-32）を、現状実装に即した簡潔な説明に書き換え
- 関連: J-6-b（編集ページ廃止後、`/admin/dispatches/[id]` 言及がさらに無意味化）
- 規模: 小（コメントのみ）
- 依存: なし

### K-3. 🟢低: §E-3 既存失敗テスト 2 件の追従修正

- `__tests__/lib/offline-fetch.test.ts` 「オンライン POST で 5xx」（事前から失敗、原因未特定）
- `__tests__/api/admin/dispatches.test.ts` 「status=stored フィルタ」（コミット a000374 で `isDraft=false` 制約が外れたためテスト期待値が古い）
- 規模: 中（offline-fetch は要調査、status=stored は単純な期待値修正）
- 依存: なし

### K-4. 🟢低: §J-3 補助 UX バッジ実装

- 内容: テーブル日付フィルタ OR 拡張により「5/7 で絞ったのに dispatchTime=5/6 の行が並ぶ」UX 違和感が残る
- 解決案: 行に「2次予定 5/7」のような補助バッジを表示し、なぜヒットしたかを可視化
- 規模: 中（DispatchTable.tsx + テスト）
- 依存: J-6-a 完了が前提（完了済）

### K-5. 🟡中: §E-1 Phase 8b スモークテスト カテゴリI 残項目

- 場所: `docs/smoke-test-checklist.md` カテゴリI（L753 〜）
- 残: I-1.2 〜 I-9.1 の 31 項目
- 完了済: I-1.1
- 各項目は実機（ブラウザ）操作で確認 → ユーザーが結果を Super に報告 → チェックリスト反映
- 規模: 大（実機検証 31 項目）
- 依存: なし（本筋タスク）

### K-6. 🟡中: §E-2 scheduledSecondaryAt クリア運用

- 内容: 子（`isSecondaryTransport=true`）が完了したら親の `scheduledSecondaryAt` を NULL に戻す業務フロー追加
- 必要性: 完了済 2 次搬送の親レコードに `scheduledSecondaryAt` が残ると、カレンダーに「2予」が誤表示される
- 規模: 中（業務仕様確認 + 実装）
- 依存: 業務仕様判断が必要（ユーザー確認）
- 関連ファイル候補（要調査）: 2 次搬送完了処理（report API or PATCH dispatch route）

### K-7. 🟢低: §E-6 未追跡ファイル 3 件の扱い判断

- `docs/handover/2026-05-02-break-instant-end-fix.md`
- `scripts/check-admin-state.ts`
- `scripts/list-unfinished-breaks.ts`
- 中身確認 → コミット or 削除を判断
- 規模: 小（ファイル中身確認 + 判断のみ）
- 依存: なし

### K-8. 次セッション開始時の Super 起動プロンプト

新セッション冒頭に以下をコピペ:

```
~/Projects/rodo/app/docs/handover/2026-05-06-d10-secondary-plan-handover.md
を読んで把握してください。完了したら「引き継ぎ把握完了」と返してください。

§K（残課題一覧）に次セッションで進めたいタスクが整理されています。
§K-1 〜 K-7 の各項目について「優先度・所要時間目安・依存関係」を踏まえ、
どのタスクから着手するのが効率的か Super として方針提案してください。
私（ユーザー）は提案を見て「OK / 待って / 変えて」で選びます。

モデルは全 CC で Opus を使用してください。
```
