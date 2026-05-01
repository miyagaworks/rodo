# 2026-05-01 振替先 -T レコードの ODO 設計確定 + 残タスク 引き継ぎノート

担当: super-agent → 次セッション
ブランチ: `feature/p0-13-signature-blob`（origin より 4 commits ahead、push 未実施）
背景: 業務仕様の理解違いで前々セッション・前セッションともに手戻り発生。本ノートは前セッション末でユーザーに「合ってる」と確認済みの仕様のみを記載する。

---

## ⚠️ 最重要原則（読む順序）

1. 本ノートの **§C「ユーザー確認済みの業務仕様」が唯一の正** とする
2. 既存の `docs/handover/2026-04-30-transfer-odo-redesign.md` および `docs/research/2026-04-30-transfer-arrivalOdo-loss.md` の業務仕様部分は **誤りを含む**。技術情報のみ参考扱い
3. ユーザーに業務仕様を再確認させない（前セッションで確定済み）
4. 推測で実装を進めない。判断に迷ったら本ノートに戻る

---

## A. 前提状況（事実）

### A.1 直近コミット履歴
```
7aa1da7  Revert "fix(transfer): 振替先 Dispatch 作成時に arrivalOdo のコピー漏れを修正"
2677f91  docs(handover): 振替時ODO設計の再考と新規問題4件の引き継ぎノート追加
7a753c6  fix(transfer): 振替先 Dispatch 作成時に arrivalOdo のコピー漏れを修正  ← revert済
9bbaa35  refactor(report): 2次の secondaryRecoveryDistance を完全削除し項目順を業務フローに合わせる
```

### A.2 未コミットファイル一覧
```
modified:   app/api/dispatches/[id]/transfer/accept/route.ts
modified:   app/dispatch/[id]/record/page.tsx
modified:   app/dispatch/[id]/report/page.tsx
modified:   components/dispatch/DispatchClient.tsx
modified:   components/dispatch/RecordClient.tsx
modified:   components/dispatch/ReportOnsiteClient.tsx
modified:   components/dispatch/ReportTransportClient.tsx
modified:   docs/handover/2026-04-30-transfer-odo-redesign.md
modified:   hooks/useOnlineStatus.ts
```

---

## B. 完了済みタスク（事実）

| タスク | 状態 | 内容 |
|---|---|---|
| タスクA | ✅ コミット済（9bbaa35）| 2次の secondaryRecoveryDistance 削除 + 項目順修正 |
| タスクB | ✅ コミット 7a753c6 → revert 7aa1da7 | 旧仕様で誤修正、revert 済 |
| タスクB-rev2 | ✅ 実装完了・未コミット | accept/route.ts: departureOdo / arrivalOdo を1次の値コピー、transportStartOdo は NULL（未指定） |
| タスクC | ✅ 実装完了・未コミット | 1次UIに現着ODO・搬開ODO・振替バッジ追加（3ファイル） |
| タスクD | ✅ 実装完了・未コミット | 2次時間に修正ボタン追加（ReportTransportClient.tsx） |
| タスクE | ✅ 実装完了・未コミット | 下書きボタン消失修正（RecordClient.tsx + record/page.tsx） |

### B.1 タスクB-rev2 の最終仕様（accept/route.ts L84-89 抜粋）
```ts
// 時刻（現着までのデータのみ引き継ぎ）
dispatchTime: dispatch.dispatchTime,
arrivalTime: dispatch.arrivalTime,
// ODO（1次の値をコピー。transportStartOdo 以降はフロント側で初期値表示）
departureOdo: dispatch.departureOdo,
arrivalOdo: dispatch.arrivalOdo,
// completionOdo / returnOdo / transportStartOdo は data に未指定 = NULL
```

---

## C. ユーザー確認済みの業務仕様（唯一の正）

前セッション末、ユーザーが「合ってる」と明示確認した内容。

### C.1 振替フロー
1. 1次担当: 車Aで出発 → 現場到着 → 「対応不可」と判断 → 振替ボタン押下
2. 2次担当: 振替を受諾 → 車Bで現場まで移動（1次が既に現着している場所）
3. 2次担当: 現場で **搬送開始から続きを入力**（出動・現着は1次のデータをそのまま使う）

### C.2 振替先 -T レコードのフィールド設計

| 項目 | DB値 | 表示 | 操作 |
|---|---|---|---|
| 出発ODO | 1次の値 | 決定済み | 基本変えない（修正可） |
| 現着ODO | 1次の値 | 決定済み | 基本変えない（修正可） |
| **搬開ODO** | **NULL（未入力）** | **車Bの最終ODOを薄く初期値表示** | **入力→決定でDB保存** |
| 完了ODO | NULL | 空 | 完了時に入力 |
| 帰社ODO | NULL | 空 | 帰社時に入力 |
| 出動時刻 | 1次の値 | 決定済み | 基本変えない |
| 現着時刻 | 1次の値 | 決定済み | 基本変えない |
| **搬送開始ボタン** | - | **非アクティブ** | **搬開ODO決定後にアクティブ化** |

### C.3 重要な業務理解
- ODO は「車両単位で連続するもの」ではなく「**案件単位で記録される**」
- 振替先 -T レコードでは、1次の出発ODO・現着ODO がそのまま残るのが正しい
- 「車Bの最終ODO」は **搬開ODO の初期値（薄く表示）専用**。DBに事前保存しない
- 搬送開始ボタンは「搬開ODOが DB保存済み」のときのみアクティブ

### C.4 1次データ保護
- ユーザー仕様「**1次担当の出発ODOと現着ODOはそのままの値で変えない**」
- → -T では出動・現着の「取消」ボタンを **非表示** にする必要あり（タスクGで対処）
- 「修正」ボタンは表示維持（極稀な訂正用途）

---

## D. ⚠️ 旧引き継ぎノートの誤り（警告）

### D.1 旧ノート `docs/handover/2026-04-30-transfer-odo-redesign.md`
- §2「タスクB（arrivalOdo コピー追加）= 誤修正、revert必須」→ **誤り**。arrivalOdo は1次の値でコピーすべきだった
- §4.2「振替先 Dispatch（-T）の departureOdo / arrivalOdo / transportStartOdo はすべて車Bの値」→ **誤り**
- §4.1「車両ごとに独立したODOメーター」→ ODO の業務的意味の理解が誤り

### D.2 旧調査 `docs/research/2026-04-30-transfer-arrivalOdo-loss.md`
- 結論「コメントは正しいが実装側の追従漏れではなく、コピーしないのが正」→ **誤り**

### D.3 旧調査 `docs/research/2026-04-30-transfer-odo-redesign-investigation.md`
- Step 1〜2 の技術情報（`/api/dispatches/last-return-odo` 既存、Vehicle にODOカラム無し等）は **有効**
- Step 6「タスクB-rev API実装案」の departureOdo / arrivalOdo / transportStartOdo すべてを lastReturnOdo で初期化する案 → **誤り**（採用してはならない）

### D.4 新調査 `docs/research/2026-05-01-transfer-T-transportStartOdo-and-offline-banner.md`
- Step 1〜6 の技術情報は **有効**。タスクF/G/オフラインバナー修正の根拠として使える

---

## E. 未完了タスク

| 順 | タスク | 概要 |
|---|---|---|
| 1 | タスクF+G統合 | DispatchClient.tsx で搬開ODO初期値表示 + 搬送開始ボタン制御 + -T で取消ボタン非表示 |
| 2 | オフラインバナー修正 | useOnlineStatus.ts + 新規 /api/health/route.ts でハートビート + visibilitychange 追加 |
| 3 | 動作確認 | ブラウザで主要フロー確認 |
| 4 | コミット | 論理単位で2本（① accept/route.ts、② UI まとめ）|
| 5 | push | build/lint 最終確認後 |
| 6 | バックフィル SQL | 過去-Tレコードの arrivalOdo を1次の値で再設定（対象: cmol9cgz500038owwmdclwzw6 / cmolfo3xg000h8owwu5mdmski / 20260430012-T）|

---

## F. 修正CC向けプロンプト（前セッションで設計済み・確定版）

### F.1 タスクF+G統合プロンプト（修正CC向け）

```
タスク: 振替先 -T レコードの2点修正
1. 搬開ODO の薄い初期値表示 + 搬送開始ボタンの活性化制御
2. 出動・現着の「取消」ボタンを -T では非表示にする（1次データ保護）

# 背景・調査結果
research/2026-05-01-transfer-T-transportStartOdo-and-offline-banner.md 参照。
- 搬開ODO は OdoDialInput (L1247-1254)、state L263-265、保存は搬送開始押下時 PATCH (L567-590)
- 搬送開始ボタン (L1262-1275)、disabled は step !== 2 || transportStartOdo === null
- 振替判定 isTransferredIn = !!dispatch.transferredFromId（L305 既存、UI分岐未使用）
- last-return-odo API は既に L308-326 useEffect で取得、placeholder chain L411-421 で使用
- accept/route.ts で -T 作成時 dispatchTime / arrivalTime / departureOdo / arrivalOdo をコピー、
  status='ONSITE'、getInitialStep で step=2 → 出動・現着が自動で決定状態（正常動作）

# 対象ファイル
components/dispatch/DispatchClient.tsx

# 仕様1: 搬開ODO の薄い初期値表示 + 搬送開始ボタン制御
- -T レコード（isTransferredIn === true）の場合:
  - 搬開ODO 入力欄の placeholder に lastReturnOdo（受諾者車両の最終 returnOdo）を表示
  - ユーザーが値を入力→単体 PATCH で transportStartOdo を保存（搬送開始押下を待たない）
  - 「搬送開始」ボタンは transportStartOdo が DB 保存済み（≠ローカル state）の時のみアクティブ化
  - handleTransportStart の PATCH body から -T 時の transportStartOdo を除外（既に保存済みのため）
- -T 以外（通常案件）の場合: 現状動作のまま

# 仕様2: 出動・現着の「取消」ボタンを -T では非表示
- isTransferredIn === true の場合、出動・現着の「取消」ボタン（onCancel）を非表示
- 「修正」ボタン（onEdit）は表示維持（1次データ訂正の必要性に対応）
- 該当箇所は ActionButton ラッパーまたは直接の取消ボタン（要特定）

# 変更内容（具体）
1. transportStartPlaceholder を isTransferredIn ? lastReturnOdo : 既存値 で上書き
2. OdoDialInput の onChange 内で isTransferredIn の場合、単体 PATCH を発火
   （body: { transportStartOdo: 値 }、エンドポイント: /api/dispatches/${dispatch.id}）
3. isTransportStartOdoSaved フラグ追加（DB保存済みかをローカル state ベースで判定）
4. 搬送開始ボタン disabled 条件:
   - 既存: step !== 2 || transportStartOdo === null
   - 変更後: step !== 2 || (isTransferredIn ? !isTransportStartOdoSaved : transportStartOdo === null)
5. handleTransportStart 内 PATCH body から isTransferredIn 時の transportStartOdo を除外
6. -T の場合の出動・現着「取消」ボタン非表示（ActionButton の onCancel prop を条件分岐）

# 検証
1. typecheck（npx tsc --noEmit）
2. lint（npm run lint）
3. ビルド（npm run build）
4. 動作確認手順:
   - 通常案件: 既存動作のまま（搬送開始押下時に transportStartOdo 保存）
   - -T 案件: 搬開ODO 欄が薄く lastReturnOdo を表示、入力→決定で DB 保存、
     その後「搬送開始」ボタンがアクティブ化、出動・現着「取消」ボタン非表示

# スコープ制限
- DispatchClient.tsx 以外の編集は最小限（必要な型エクスポート等のみ）
- 通常案件の挙動を変えない
- API 側の変更不要（accept/route.ts は確定済み）

# 期待出力
- 変更ファイルパスと差分
- 検証結果
- 通常案件と -T 案件で挙動が分岐していることの確認
```

### F.2 オフラインバナー修正プロンプト（修正CC向け）

```
タスク: オフラインバナー（"オフライン - データはローカルに保存されます"）が
       通信回復後も常時表示される現象を修正する。

# 背景
研究結果: window 'online' イベント発火に完全依存。Chrome VPN 切替・iOS Safari 等で
ブラウザが発火しないケースでバナーが永久消えない設計バグ。
ポーリング・ハートビート・成功 fetch によるクリアいずれも未実装。

# 対象ファイル
- hooks/useOnlineStatus.ts （既存、変更）
- app/api/health/route.ts （新規作成）

# 変更内容

## 1. /api/health エンドポイント新規作成
- パス: app/api/health/route.ts
- 仕様: GET、認証不要、200 OK + JSON `{ ok: true }` を返すだけ
- Next.js 16 の Route Handler 規約に従う（node_modules/next/dist/docs/ 参照）
- DB アクセスなし、軽量レスポンス

## 2. useOnlineStatus.ts に以下を追加
- 30秒ごとのハートビート: setInterval で `/api/health` に GET fetch
  - レスポンスOK → online 判定
  - 失敗 or タイムアウト → offline 判定
- visibilitychange イベントリスナー: タブ復帰時に即座に /api/health で確認
- 既存の window 'online' / 'offline' イベントは維持
- cleanup 関数で interval / listener を解除

# 検証
1. typecheck
2. lint
3. ビルド
4. 動作確認手順:
   - オフラインバナー表示中にネット復帰 → 30秒以内に消える
   - タブ切替→復帰でバナー状態が即更新される

# スコープ制限
- 上記2ファイル以外の編集なし
- 既存コンポーネントの useOnlineStatus 呼び出し側は変更不要

# 期待出力
- 変更ファイル差分
- 新規 /api/health/route.ts の内容
- 検証結果
```

---

## G. 関連ファイル早見表

| 役割 | パス | 主要行 |
|---|---|---|
| 振替 accept API | `app/api/dispatches/[id]/transfer/accept/route.ts` | L84-89（タスクB-rev2 完了状態）|
| 出動記録メイン | `components/dispatch/DispatchClient.tsx` | L263-265（state）/ L305（isTransferredIn）/ L308-326（lastReturnOdo 取得）/ L411-421（placeholder chain）/ L567-590（handleTransportStart）/ L1247-1254（OdoDialInput）/ L1262-1275（搬送開始ボタン）|
| 報告書UI | `components/dispatch/ReportTransportClient.tsx` | タスクD完了済 |
| 出動記録 | `components/dispatch/RecordClient.tsx` | タスクE完了済 |
| ページ | `app/dispatch/[id]/record/page.tsx` | タスクE完了済 |
| オンライン判定 | `hooks/useOnlineStatus.ts` | バナー修正対象 |
| 既存last-return-odo | `app/api/dispatches/last-return-odo/route.ts` | 51行、再利用可 |

---

## H. 次セッションの最初のアクション（順序固定）

1. **本ノート全体を読む**（特に §C と §D の警告）
2. `git log --oneline -5` で 7aa1da7 が直近であることを確認
3. `git status` で未コミット9ファイルを確認
4. **§F.1（タスクF+G統合）と §F.2（オフラインバナー）を修正CCに並列投入**
5. 両方の完了報告を確認
6. ユーザーにブラウザでの動作確認を依頼
7. 動作確認OKならコミット2本作成
   - コミット1: `fix(transfer): 振替先 -T の ODO 設計を業務仕様に合わせて再修正` (accept/route.ts のみ)
   - コミット2: `feat(dispatch): 振替先 -T のUI制御 + 関連UI修正まとめ` (UI 8ファイル)
8. push 前に `npm run build` と `npm run lint` で最終確認
9. push（ユーザー承認後）
10. バックフィル SQL（§E.6）実行（ユーザー承認後）

---

## I. 既知の潜在課題（タスクGで対処予定）

### I.1 -T で出動・現着の「取消」ボタンを押すと1次データが破壊される
- 現状の onCancel ハンドラが該当フィールドを NULL に戻す挙動
- ユーザー仕様「1次担当の出発ODOと現着ODOはそのままの値で変えない」と矛盾
- → タスクF+G統合プロンプト §仕様2 で対処（取消ボタン非表示化）

### I.2 lint 既存負債
- baseline: 58 errors / 46 warnings
- タスクCで +4 errors（react/no-unstable-nested-components 機械的複製）
- 現状 62 errors / 46 warnings（タスクB-rev2 / D / E では新規エラー無し）
- push 時の例外プッシュ許容（宮川承認済 2026-04-30）
- タスクF+G / オフラインバナー完了後に最終 lint 数を再確認・記録更新

---

## J. バックフィル SQL（実行は次セッションで）

過去の振替先 -T レコードで arrivalOdo が NULL になっているものを、1次の値で再設定する。

### J.1 対象確認 SELECT
```sql
SELECT
  d.id,
  d."dispatchNumber",
  d."arrivalOdo"            AS "current_arrival_odo",
  parent."arrivalOdo"       AS "primary_arrival_odo",
  d."transferredFromId"
FROM "Dispatch" d
LEFT JOIN "Dispatch" parent ON parent.id = d."transferredFromId"
WHERE d.id IN (
  'cmol9cgz500038owwmdclwzw6',
  'cmolfo3xg000h8owwu5mdmski'
)
   OR d."dispatchNumber" = '20260430012-T';
```

### J.2 バックフィル UPDATE（SELECT で確認後）
```sql
UPDATE "Dispatch" d
SET "arrivalOdo" = parent."arrivalOdo"
FROM "Dispatch" parent
WHERE parent.id = d."transferredFromId"
  AND d."transferredFromId" IS NOT NULL
  AND d."arrivalOdo" IS NULL
  AND parent."arrivalOdo" IS NOT NULL
  AND (
    d.id IN ('cmol9cgz500038owwmdclwzw6', 'cmolfo3xg000h8owwu5mdmski')
    OR d."dispatchNumber" = '20260430012-T'
  );
```

**安全装置**:
- 振替先（transferredFromId IS NOT NULL）のみ
- 既存値ありレコードは上書きしない（d."arrivalOdo" IS NULL）
- 親の arrivalOdo がある場合のみ
- 対象IDを明示で限定

---

## K. 次セッション開始時の挨拶テンプレ

```
前セッションの引き継ぎノート docs/handover/2026-05-01-transfer-T-handover.md を読みました。

現状確認:
- タスクA、B revert 済（コミット済）
- タスクB-rev2、C、D、E は実装完了・未コミット（9ファイル）
- 業務仕様は §C で確定（旧ノートの仕様部分は誤り）
- 残タスク: タスクF+G統合、オフラインバナー修正、動作確認、コミット、push、バックフィル

最初のステップとして、§F.1 と §F.2 のプロンプトを修正CCに並列投入してよろしいですか？

「OK」 / 「待って」 / 「変えて」 でお返事ください。
```

---

最終更新: 2026-05-01
作成者: super-agent（前セッション）
次担当: 次セッションの super-agent
