# ODO 機能拡張 実装計画

Status: Draft (承認待ち)
Target: Next.js 16.2.3 / React 19.2.4 / Prisma 6.19.3 / Zod 4.3.6 (v4) / PWA スマホ縦専用
Author: Planning phase — 実装はしない

---

## 0. 目的・要約

現状は Dispatch / Report とも ODO は「出発（departureOdo）」「完了（completionOdo）」の 2 点のみ。
下記の 3 点を追加し、回送距離・搬送距離・帰社距離の正確な算出と、隊員 = 車両を前提とした ODO 継続管理を実現する。

- `arrivalOdo` — 現場到着時 ODO（新規）
- `transportStartOdo` — 搬送開始時 ODO（新規。搬送 1 次のみ）
- `returnOdo` — 帰社時 ODO（新規）

併せて、現在 `DispatchClient.tsx` / `SecondaryDispatchClient.tsx` に重複定義されている `OdoInput` を共通 **ダイヤル式数字入力コンポーネント `OdoDialInput`** に置き換える（6 桁・iOS 風ピッカー・自前実装・外部ライブラリ不使用）。

初期値ロジックとして、出動作成時の出発 ODO に「同一ユーザーの直前帰社 ODO」を引き継ぎ、各フェーズの ODO 初期値は「直前 ODO + 1km」を入れる（ユーザー編集可）。

---

## 1. 変更ファイル一覧

### 新規（6 ファイル）

| Path | 役割 |
|---|---|
| `components/common/OdoDialInput.tsx` | 6 桁ダイヤル式 ODO 入力共通コンポーネント |
| `components/common/OdoDialInput.module.css` もしくは Tailwind のみ | ダイヤル見た目・スナップ表現（Tailwind v4 で行けるなら不要） |
| `__tests__/components/OdoDialInput.test.tsx` | UI ユニットテスト |
| `__tests__/api/dispatches-odo.test.ts` | Dispatch ODO の create/patch バリデーション |
| `__tests__/api/reports-odo.test.ts` | Report ODO upsert バリデーション |
| `scripts/reset-dispatches-reports.ts` | dev DB の Dispatch/Report 全削除スクリプト（ガード付き） |

### 変更（9 ファイル）

| Path | 変更概要 |
|---|---|
| `prisma/schema.prisma` | `Dispatch` と `Report` に `arrivalOdo` / `transportStartOdo` / `returnOdo` を追加（すべて `Int?`） |
| `lib/validations/schemas/dispatch.ts` | `createDispatchSchema` に `arrivalOdo` 等の扱い方針。`updateDispatchSchema` に `departureOdo` / `arrivalOdo` / `transportStartOdo` / `returnOdo` を追加（既存バグ修正を含む） |
| `lib/validations/schemas/report.ts` | `reportFields` に 3 フィールドを追加。`completeReportSchema` の omit 判断を更新 |
| `app/api/dispatches/route.ts` | 出発 ODO の初期値引き継ぎ元となる「直前帰社 ODO」を POST レスポンスへ含めるか、別 API で取得させるかを決定（下記 5 章参照）。`createDispatchSchema` 変更に追随 |
| `app/api/dispatches/[id]/route.ts` | PATCH の allowed フィールドに新 3 ODO + `departureOdo` を追加 |
| `components/dispatch/DispatchClient.tsx` | 自前 `OdoInput` 削除 → `OdoDialInput` に差し替え。現着・搬開・帰社時に ODO 入力を追加。各 ODO 初期値ロジック |
| `components/dispatch/SecondaryDispatchClient.tsx` | 同上。2 次搬送は現着・搬開なしフロー |
| `components/dispatch/ReportOnsiteClient.tsx` | Report 側 3 フィールド表示・編集、距離再計算（回送・帰社） |
| `components/dispatch/ReportTransportClient.tsx` | Report 側 3 フィールド表示・編集、距離再計算（回送・搬送・帰社）、2 次搬送のサブセクションも対応 |

### 新規 API（検討事項、5 章で判断）

- `GET /api/dispatches/last-return-odo` — 同一ユーザーの直前帰社 ODO 取得（採用する場合のみ）

---

## 2. 実装順序（フェーズ分け）

### Phase A: Schema & マイグレーション

- 成果物: `prisma/schema.prisma` 更新 + `prisma db push` 実行（dev 前提）
- 検証: `prisma studio` で Dispatch/Report に 3 列が追加されていること
- リスク: マイグレーションディレクトリが存在しない運用のため、破壊的変更は発生しない（単純 ADD COLUMN nullable）

### Phase B: Validation / API

- 成果物:
  - `lib/validations/schemas/dispatch.ts` の `createDispatchSchema` / `updateDispatchSchema` 更新
  - `lib/validations/schemas/report.ts` の `reportFields` 更新
  - `app/api/dispatches/route.ts` の POST レスポンス or 新 API 追加
  - `app/api/dispatches/[id]/route.ts` の PATCH allowed フィールド追加（既存バグ `departureOdo` 未対応も同時修正）
- 検証: 既存 `__tests__/api/dispatches-validation.test.ts` 緑 + 新ケース追加

### Phase C: OdoDialInput 共通コンポーネント

- 成果物: `components/common/OdoDialInput.tsx`
- Props 案: `{ value: number | null; onChange: (v: number) => void; disabled?: boolean; label?: string; autoSnap?: boolean }`
- 内部表現: `value` を 6 桁の配列 `[d5, d4, d3, d2, d1, d0]` に分解して各桁コラムでスクロール
- 検証: `__tests__/components/OdoDialInput.test.tsx` で 値反映・桁操作・disabled 挙動
- リスク: タッチイベントとスクロールスナップのブラウザ差異（iOS Safari / Android Chrome）

### Phase D: DispatchClient 統合

- 成果物: 既存自前 `OdoInput` を削除し `OdoDialInput` に差し替え。現着ステップ・搬開ステップ・帰社ステップで ODO 入力表示。初期値ロジック適用
- 検証: 出動→現着→（搬開→）完了→帰社 の全遷移で ODO 保存が PATCH に乗ること、初期値が「前 ODO + 1km」で入ること

### Phase E: SecondaryDispatchClient 統合

- 成果物: 2 次搬送（現着・搬開なし）のフロー反映、`OdoDialInput` に統一
- 前回帰社 ODO 引き継ぎが 1 次と整合性を持たないこと（独立）を UI メッセージで明示

### Phase F: Report クライアント 2 本

- 成果物:
  - `ReportOnsiteClient.tsx`: 新 2 ODO（現着・帰社）編集 UI。距離算出を `(arrivalOdo - departureOdo)` / `(returnOdo - completionOdo)` に修正
  - `ReportTransportClient.tsx`: 新 3 ODO（現着・搬開・帰社）編集 UI。距離算出を `(arrivalOdo - departureOdo)` / `(completionOdo - transportStartOdo)` / `(returnOdo - completionOdo)` に修正
  - 2 次搬送サブセクションも同様に対応（距離は `(completionOdo - departureOdo)` / `(returnOdo - completionOdo)`）
- 検証: 距離が Odo 入力と連動して再計算・保存されること

### Phase G: dev DB リセットスクリプト

- 成果物: `scripts/reset-dispatches-reports.ts`（`--apply` なしは dry run、`DATABASE_URL` が localhost 以外は abort）
- 削除対象: `Report`, `DispatchEtc`, `DispatchPhoto`, `WorkConfirmation`, `BreakRecord (dispatchIdあり)`, `Dispatch`
- 注意: 参照整合制約の順序（onDelete: Cascade のモデルは親の削除で自動削除だが、`BreakRecord.dispatchId` は Cascade 指定なし。独立削除か NULL 化が必要）

### Phase H: 検証・ビルド・リント

- 成果物: `npm run build` / `npm run lint` / `npm test` 全通過
- 実機 or Chrome DevTools モバイルエミュレーションで操作確認（下記 10 章）
- git push 前に必ずビルド・リント・テスト確認

---

## 3. 各ファイルの変更詳細

### 3.1 `prisma/schema.prisma`

`Dispatch` モデルに追加（L104-105 `departureOdo` / `completionOdo` の隣）:

```prisma
departureOdo       Int?
arrivalOdo         Int?   // 現場到着時
transportStartOdo  Int?   // 搬送開始時（TRANSPORT のみ利用）
completionOdo      Int?
returnOdo          Int?   // 帰社時
```

`Report` モデルに追加（L274-278 近辺）:

```prisma
departureOdo       Int?
arrivalOdo         Int?
transportStartOdo  Int?
completionOdo      Int?
returnOdo          Int?
```

その他のカラム（`recoveryDistance`, `transportDistance`, `returnDistance` 等）は**変更なし**（App 側で ODO から計算して保存）。

### 3.2 `lib/validations/schemas/dispatch.ts`

`createDispatchSchema`:
- 新規 3 ODO は通常「出発」のみ送信されるフロー変化なしのため、**追加はオプショナル**で十分。
- `departureOdo` は既存通り `odometerReading`。`arrivalOdo` / `transportStartOdo` / `returnOdo` もすべて `odometerReading`。
- 2 次搬送フラグ（`isSecondaryTransport`）と組み合わせて、**Zod `discriminatedUnion` は不採用** を推奨（理由は 6 章）。

`updateDispatchSchema`:
- 既存で `departureOdo` が欠落（researcher 報告の通り）。**本計画で追加する**。
- 新規 3 ODO も追加: `arrivalOdo: odometerReading` / `transportStartOdo: odometerReading` / `returnOdo: odometerReading`。
- `.partial()` のまま運用。フロー別必須は API 層で `status` 遷移と合わせて検証。

### 3.3 `lib/validations/schemas/report.ts`

`reportFields` に追加:

```ts
arrivalOdo: odometerReading,
transportStartOdo: odometerReading,
returnOdo: odometerReading,
```

`completeReportSchema` の omit 判定:
- 現状は TRANSPORT 専用フィールドを一括 omit しているが、ONSITE 完了時 POST で `transportStartOdo` が null 前提で不要。
- 判断: `transportStartOdo` は `completeReportSchema` の omit 対象に入れる（ONSITE で送らない）。

### 3.4 `app/api/dispatches/route.ts`

- POST レスポンスのフィールドは現状 `dispatch` 丸ごと返却。schema 拡張で新 3 ODO も自動的に含まれる。
- 「前回帰社 ODO」は**クライアントが別エンドポイントで取得**する方式を推奨（5 章参照）。POST 時点で付けると、クライアントは POST 後に reload して値を得る必要があるため UX が劣化する。

### 3.5 `app/api/dispatches/[id]/route.ts`

- `allowed` マップ（L120 前後）に追加:
  ```
  if (body.departureOdo !== undefined) allowed.departureOdo = body.departureOdo
  if (body.arrivalOdo !== undefined) allowed.arrivalOdo = body.arrivalOdo
  if (body.transportStartOdo !== undefined) allowed.transportStartOdo = body.transportStartOdo
  if (body.returnOdo !== undefined) allowed.returnOdo = body.returnOdo
  ```
- `type` 変更時のクリア処理（L182 付近）に `arrivalOdo` / `transportStartOdo` / `returnOdo` もクリア対象として追加するかは判断要: **追加する**（ONSITE ↔ TRANSPORT の type 変更時、ONSITE に戻る場合は搬開 ODO をクリアすべき。現着・帰社 ODO は ONSITE でも使うため保持）。
  - 具体: `TRANSPORTING`/`COMPLETED`/`STORED`/`RETURNED` から ONSITE 変更時、`transportStartOdo = null` / `returnOdo = null` / `arrivalOdo` は保持（実質現着済みのデータ保持優先）。`completionOdo` は既存通りクリア。

### 3.6 `components/common/OdoDialInput.tsx`

Props:
```ts
interface OdoDialInputProps {
  value: number | null        // 0 〜 999999
  onChange: (next: number) => void
  disabled?: boolean
  label?: string              // '出発', '現着', '搬開', '完了', '帰社'
  iconSrc?: string            // デフォルト '/icons/odo.svg'
  suffix?: string             // デフォルト 'km'
  placeholderZero?: boolean   // true なら初期値 null → '000000' 表示
}
```

UI レイアウト（既存 `OdoInput` の横組みを踏襲）:
```
[icon] [label + ODO] [ ダイヤル 6 桁 ] km
```

ダイヤル詳細:
- 6 つの桁コラムを横並び（各幅 ~36px、総幅 ~240px、縦 ~72px）
- 中央ラインで選択値を表示。上下に ±1〜2 桁の値が薄く見える
- 数字フォントサイズ・色は既存 `OdoInput` と近い濃紺系
- スクロール: `overflow-y: auto` + CSS `scroll-snap-type: y mandatory` + 各数字セルに `scroll-snap-align: center`
- 中央行検出: `scrollTop / cellHeight` の round で「現在桁の値」を算出
- 確定: `scroll` の debounce（80ms）後に `onChange(combinedValue)` を発火
- タッチ: `touch-action: pan-y` で縦スワイプのみ受理
- PC: `wheel` イベントで deltaY に応じて桁値を ±1（Ctrl/Shift 押下で ±10 などは実装しない）
- クリック: 桁をタップすると上下「+」「-」ボタン風のオーバーレイを出す（実機で指が滑らない時の fallback）
- アクセシビリティ: 各桁に `role="spinbutton"` / `aria-valuemin=0` / `aria-valuemax=9` / `aria-valuenow` / `aria-label="${label} N 桁目"`
- キーボード: `ArrowUp` / `ArrowDown` で ±1、`ArrowLeft` / `ArrowRight` で桁移動、`Tab` で桁送り、`0-9` 数字キー直接入力
- スマホで確実に動作させるため、`touchmove` は `preventDefault` せず（縦スクロールはブラウザ標準）、`touchend` でスナップ位置から値を確定

### 3.7 `DispatchClient.tsx`

- 冒頭の `OdoInput` 関数定義を削除し、`import OdoDialInput from '@/components/common/OdoDialInput'` に置換
- `departureOdo` の state はそのまま活用
- 新 state 追加:
  ```ts
  const [arrivalOdo, setArrivalOdo] = useState<number | null>(initial.arrivalOdo ?? null)
  const [transportStartOdo, setTransportStartOdo] = useState<number | null>(initial.transportStartOdo ?? null)
  const [completionOdo, setCompletionOdo] = useState<number | null>(initial.completionOdo ?? null)
  const [returnOdo, setReturnOdo] = useState<number | null>(initial.returnOdo ?? null)
  ```
- 出発 ODO 初期値: `GET /api/dispatches/last-return-odo` を `useEffect` で呼び出し → null なら 000000
- 各ステップ遷移時のボタン押下で PATCH にそれぞれの ODO を含める（`/api/dispatches/[id]`）
- 各 ODO の入力表示タイミング（Step 定義に沿う）:
  - Step 1 (出動後 or 出動ボタン押下前): `departureOdo` 編集可
  - Step 2 (現着後 or 現着ボタン押下時): `arrivalOdo` 編集可、`departureOdo` disabled
  - Step 3 (搬開後 / TRANSPORT のみ): `transportStartOdo` 編集可
  - Step 4 (完了後): `completionOdo` 編集可
  - Step 5 (帰社後): `returnOdo` 編集可
- 「前 ODO + 1km」初期値ロジック: 該当 ODO がまだ null で、前 ODO が非 null のとき、フォーカス・ボタン押下タイミングで自動設定

### 3.8 `SecondaryDispatchClient.tsx`

- 同様に `OdoDialInput` に差し替え
- 2 次搬送フロー: 出発 → 完了 → 帰社（現着・搬開なし）
- 出発 ODO は**完全独立**なので、1 次の ODO を参照せず、常に「前回帰社 ODO 引き継ぎ」API を呼ぶ
- UI に「※ 2 次搬送の出発 ODO は直前の帰社 ODO を引き継ぎます。必要に応じてダイヤルで修正してください」の注記

### 3.9 `ReportOnsiteClient.tsx`

- `SerializedDispatchForReport` / `SerializedReport` に 3 ODO 追加
- state 追加: `arrivalOdo`, `returnOdo`（onsite には `transportStartOdo` 不要）
- 距離計算を `useMemo` で:
  ```ts
  const recoveryDistance = useMemo(() => (arrivalOdo != null && departureOdo != null) ? arrivalOdo - departureOdo : null, [arrivalOdo, departureOdo])
  const returnDistance = useMemo(() => (returnOdo != null && completionOdo != null) ? returnOdo - completionOdo : null, [returnOdo, completionOdo])
  ```
- 既存の `recoveryDistance` / `returnDistance` の state を廃止し、ODO から算出した値を upsert 時に送る
- UI: 既存の「回送距離」「帰社距離」フィールドは**読み取り専用の計算結果表示**に変更（ODO を変更すれば連動）。または手動上書きも許容するか（判断要、13 章）

### 3.10 `ReportTransportClient.tsx`

- `arrivalOdo`, `transportStartOdo`, `returnOdo` を state に追加
- 距離:
  ```ts
  recoveryDistance = arrivalOdo - departureOdo
  transportDistance = completionOdo - transportStartOdo
  returnDistance = returnOdo - completionOdo
  ```
- 2 次搬送サブセクションも同様。2 次は `recoveryDistance = null`（現着なし）、`transportDistance = completionOdo - departureOdo`

---

## 4. ダイヤル式 UI の実装方針詳細

### アプローチ選択肢

| 方式 | メリット | デメリット | 採否 |
|---|---|---|---|
| A) CSS scroll-snap + 各桁 `overflow-y: auto` | 実装シンプル、慣性スクロール無料 | スクロール終了検知に debounce 要、iOS Safari の慣性挙動差 | **採用** |
| B) Pointer Events + 自前 transform: translateY | 挙動を完全制御、慣性スクロール自前計算可能 | コード量大、慣性計算の質が悪いと UX 劣化 | 補助的に fallback |
| C) `ClockPicker.tsx` 流の極座標ダイヤル | 既存パターン流用 | 6 桁のダイヤル表現に不向き | 不採用 |

### 実装方針（A を主軸）

1. 各桁を `<div>` のコラムにし、内側に 0-9 の 10 個の `<span>` を置く。前後に空白（padding）を入れて中央揃えを実現
2. `scroll-snap-type: y mandatory` と `scroll-snap-align: center` で各値にスナップ
3. `onScroll` で現在中央値を算出し、debounce 80ms で `onChange` を発火
4. `wheel` イベントは `scroll-snap` 下で自然に機能するので明示ハンドラ不要（必要ならキャプチャして accelerate）
5. 数字キー入力は `keydown` ハンドラで受け取り、現在フォーカス中の桁の値を直接差し替え + 次桁へフォーカス移動
6. iOS Safari のバウンススクロール対策: コンテナに `overscroll-behavior: contain`

### スナップ・桁間移動

- 同一桁の縦スクロール = 値変更
- Tab / 数字キー入力で次桁へフォーカス
- タップで桁選択 → 仮想キーボードが出ないよう `contentEditable=false` + `tabIndex=0`

### アクセシビリティ

- `role="spinbutton"`、`aria-valuenow`, `aria-label`
- スクリーンリーダー向けに全体の ODO 値を `aria-live="polite"` で読み上げ

---

## 5. 「前回帰社 ODO 引き継ぎ」の実装

### 選択肢

| 方式 | 内容 | 採否 |
|---|---|---|
| α) `POST /api/dispatches` レスポンスに含める | 作成時に同一ユーザーの直前 `returnOdo` を取得し、response に `inheritedDepartureOdo` を付与 | △ |
| β) 専用 GET エンドポイント `/api/dispatches/last-return-odo` | クライアント側で画面初期化時にコールして取得 | **採用** |
| γ) `/api/users/me` 等に含める | 責務混在、非推奨 | 不採用 |

### β を推奨する理由

- 「出動作成前」にダイヤル初期値を表示したい。α だと出発ボタンを押す前に値を見せられない
- 将来的に車両切替等で「前回 ODO」の扱いが変わっても、エンドポイントの責務が独立していれば対応しやすい
- 軽量クエリ（1 行 SELECT）で API オーバーヘッドは無視できる

### エンドポイント仕様

```
GET /api/dispatches/last-return-odo

Response 200:
  { lastReturnOdo: number | null, sourceDispatchNumber: string | null }

Auth: 必須（`session.user.userId` を使用）
Query: なし
```

実装メモ:
```ts
const last = await prisma.dispatch.findFirst({
  where: {
    userId: session.user.userId,
    tenantId: session.user.tenantId,
    returnOdo: { not: null },
  },
  orderBy: { createdAt: 'desc' },
  select: { returnOdo: true, dispatchNumber: true },
})
```

インデックスは既存 `Dispatch.userId` にあるため追加不要。

---

## 6. Zod スキーマの discriminatedUnion 設計

### 結論: **採用しない**

### 理由

1. `type` と `isSecondaryTransport` の 2 軸があり、単純な discriminatedUnion にできない（`onsite` / `transport` / `secondaryTransport` の 3 分岐を擬似的に表現する必要あり）
2. 現場対応フローと搬送 1 次フローの差分は「`transportStartOdo` を使うか否か」のみで、**スキーマレベルで必須にする必要は低い**。API 層の `status` 遷移チェックで整合性は取れる
3. discriminatedUnion を入れると `updateDispatchSchema.partial()` との相性が悪い（PATCH では一部フィールドしか送らない）
4. 単調増加チェック（出発 ≤ 現着 ≤ 搬開 ≤ 完了 ≤ 帰社）は Zod の `.refine` で表現可能だが、`partial` PATCH では「新値と既存値の比較」が必要なため**サーバー層で DB から現値取得して判定**するのが適切

### 代替: 軽量な `.refine` + API 層 warning

- `createDispatchSchema` / `updateDispatchSchema` には**必須化は入れない**
- 新規追加する `lib/validations/schemas/dispatch.ts` に `isMonotonicOdo(d: {…}): boolean` のヘルパーを追加し、API 側で警告ログのみ（エラーにしない）
- UI 側でダイヤル変更時に可視フィードバック（前より小さい値なら赤字）

---

## 7. テスト計画

### 新規ユニット

| ファイル | 内容 |
|---|---|
| `__tests__/components/OdoDialInput.test.tsx` | 初期値 null で 000000 表示、`onChange` 発火、disabled 不変、キーボード ±1、タブ桁移動、数字キー直接入力 |
| `__tests__/api/dispatches-odo.test.ts` | createDispatch で 3 ODO optional 通過、updateDispatch で `departureOdo` が PATCH 可能（バグ修正検証）、範囲外値で 400 |
| `__tests__/api/reports-odo.test.ts` | upsertReport で 3 ODO 保存、completeReport で `transportStartOdo` omit |
| `__tests__/api/dispatches-last-return-odo.test.ts` | 履歴なしで null、最新 returnOdo 取得、他ユーザーの returnOdo は返さない |

### 既存テストへの影響

| ファイル | 変更要否 |
|---|---|
| `__tests__/api/dispatches-validation.test.ts` | 新 3 フィールドの optional 通過ケース追加 |
| `__tests__/api/validation-helpers.test.ts` | `odometerReading` は既存のためそのまま |
| `__tests__/components/draft-save-bug.test.tsx` | ODO 入力が絡むなら Props 変更に追随 |

### 統合テスト（任意）

- E2E まで入れる余力は今回の中規模スコープでは不要と判断。手動検証（10 章）で代替

---

## 8. 既存テストへの影響と更新方針

- `dispatches-validation.test.ts` の現行ケースは `departureOdo` のみ検証。新 3 フィールド追加後も **現行テストは通過するはず**（optional のため）
- `completeReportSchema` の omit リストを変更するなら関連テストも追加
- `OdoInput` を直接アサートしているテストは存在しない（Grep 確認済み。`components/common/OdoDialInput.tsx` への切り替えで影響波及なし）

---

## 9. 既存データ削除スクリプト仕様

### `scripts/reset-dispatches-reports.ts`

```
使い方:
  npx tsx scripts/reset-dispatches-reports.ts            # dry run
  npx tsx scripts/reset-dispatches-reports.ts --apply    # 実削除

安全装置:
  - DATABASE_URL に 'localhost' または '127.0.0.1' を含まない場合 abort
  - Tenant 全件の Dispatch/Report を削除対象とする（本番想定でないため）
  - dry run では件数のみ表示

削除順序:
  1. Report (Dispatch の FK Cascade だが明示削除しておく)
  2. WorkConfirmation (Cascade だが明示)
  3. DispatchEtc (Cascade)
  4. DispatchPhoto (Cascade)
  5. BreakRecord で dispatchId 非 null のものは dispatchId = null に UPDATE（Cascade 設定なし）
  6. Dispatch (親) を全削除
```

- `delete-miyagawa-orphan-breaks.ts` の構成を踏襲（エラー処理・finally disconnect パターン）
- `--tenant-id=<id>` オプションは将来導入検討。今回は全件削除

---

## 10. 動作確認手順

### 環境

- 開発: `npm run dev` + Chrome DevTools モバイルエミュレーション（iPhone 14 Pro / Pixel 7）
- 実機検証: PWA インストール後、iPhone Safari / Android Chrome でタッチ操作

### チェックリスト

1. 出動作成画面で「出発 ODO」が直前帰社 ODO で自動入力される
2. ダイヤル縦スワイプで各桁 0-9 が切り替わる
3. 6 桁合算値が `onChange` で取得できている（state 反映を React DevTools で確認）
4. 出動ボタン押下 → PATCH request body に `departureOdo: <数値>` が入る
5. 現着ボタン押下 → `arrivalOdo` 送信、前 ODO + 1 が初期値
6. 搬開ボタン（TRANSPORT のみ）→ `transportStartOdo` 送信
7. 完了ボタン → `completionOdo` 送信
8. 帰社ボタン → `returnOdo` 送信
9. Report 画面で回送/搬送/帰社距離が ODO から自動計算され表示
10. Report 側で ODO を編集すると距離が再計算
11. Report 下書き保存・完了 POST で 3 ODO が Report レコードに保存
12. 2 次搬送作成時、出発 ODO が 1 次と独立して引き継ぎ取得される

### スマホ特有確認

- iOS Safari: ダイヤルスワイプ中にページ縦スクロールが奪われないこと
- Android Chrome: タッチキャンセル時の値確定
- 戻るボタンで状態保持

---

## 11. リスク・懸念

| # | リスク | 影響 | 対策 |
|---|---|---|---|
| R1 | ダイヤル UI のタッチ操作が想定通り動かない（iOS 慣性、Android 反応遅延） | 高（主要 UX） | Phase C 完了後に実機で単独テストし、必要なら方式 B（transform 自前）に切替 |
| R2 | scroll-snap の `onScroll` debounce 値が短すぎると誤入力、長すぎると体感遅い | 中 | 80ms 既定、ユーザーフィードバックで調整 |
| R3 | 6 桁入力の手間が増える（従来は数字キーで直接入力） | 中 | 数字キーボード入力も残す（`keydown` で対応）。フォールバック確保 |
| R4 | PWA オフライン時の `GET /api/dispatches/last-return-odo` 失敗 | 低 | `offlineFetch` 経由 or fallback 000000 |
| R5 | `updateDispatchSchema` に `departureOdo` を追加することで、既存の「silent 無視」挙動に依存した箇所があると挙動変化 | 低〜中 | researcher 報告から、現行で `departureOdo` を PATCH 送信している箇所はない見込み。念のため Grep で全確認する |
| R6 | `dev DB リセット` 実行忘れで既存データと新フィールド不整合（レガシー行の新 ODO が null） | 中 | nullable なので SQL エラーにはならないが、距離計算が null になる。README に記載 |
| R7 | ODO が桁あふれ（7 桁車両） | 低 | 今回は 6 桁固定。将来要件として切り出し |
| R8 | 単調増加チェックなしによる負の距離出力 | 中 | UI 側で赤字警告表示（エラーにはしない、実機運用での誤入力修正可能性を残す） |
| R9 | `completeReportSchema` の omit 変更が既存 complete フローを壊す | 中 | Phase B のテストで網羅 |

---

## 12. ヒアリング後の再検討候補

- **距離単価**: 現在の単価計算は Report 画面で金額フィールドに集約。ODO 自体は単価に影響しないが、下田社長ヒアリングで「回送距離に応じた段階料金」等が出てきた場合、Report 側で計算ロジック追加が必要
- **フロー変更**: 「現場到着」前に「保管場所経由」等の中間ステップが追加される場合、追加 ODO フィールド（例: `viaPointOdo`）の検討
- **車両切替時の ODO**: 隊員 = 車両の前提が崩れる場合、`last-return-odo` の取得条件に `vehicleNumber` を加える必要
- **ODO 上限**: 6 桁で足りない車両が出てきた場合、ダイヤルの桁数を可変に
- **ダイヤル UI の方式**: 下田氏の反応次第で「従来の数字キー入力に戻す」選択肢を残す

---

## 13. 承認待ち事項

以下は実装前に確認したい。

1. **Report 画面の距離フィールド**: ODO から算出した値を「読み取り専用」にするか、「手動上書きも許容」するか
   - 推奨: 読み取り専用（ODO が正なら距離は自動で正しい）。上書き許容は二重管理の温床
2. **単調増加チェックの扱い**: UI で赤字警告のみにするか、保存を拒否するか
   - 推奨: 警告のみ（実運用で給油中の ODO リセット等のレアケースを排除しない）
3. **Dispatch 作成 API の POST レスポンス**: `inheritedDepartureOdo` を付与するか不要か
   - 推奨: 不要（別エンドポイント `GET /api/dispatches/last-return-odo` で取得）
4. **type 変更時のクリア方針**: ONSITE ↔ TRANSPORT の切替で `transportStartOdo` / `returnOdo` / `completionOdo` のどれをクリアするか
   - 推奨: `transportStartOdo` のみクリア。`returnOdo` と `completionOdo` は既存ポリシー踏襲
5. **ダイヤル UI の方式**: CSS scroll-snap 主軸（方式 A）で進めて良いか
   - 推奨: A で進め、Phase C 完了時点で実機検証し必要に応じて B へ切替

---

## 14. スコープ外（再掲）

- 車両切替時の ODO 整合性チェック
- 過去データへの遡及入力
- 請求計算式の変更
- Phase 2（シフト実装）関連
- PWA オフライン対応の変更（既存の `offlineFetch` 経由のみ利用）

---

## 15. 実装着手前の最終確認

- [ ] 承認待ち事項 13.1〜13.5 への回答
- [ ] `npm run build` / `npm run lint` / `npm test` の現状 green 確認（Phase A 前に baseline）
- [ ] dev DB バックアップ（リセット前）
- [ ] researcher 再調査: `updateDispatchSchema` の `departureOdo` が silent 無視されている根拠確認 & 現行で `departureOdo` を PATCH 送信するクライアントがないこと
