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
