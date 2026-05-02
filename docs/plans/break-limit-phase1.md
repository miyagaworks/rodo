# 休憩時間上限制御 Phase 1 実装計画

作成日: 2026-04-21
対象プロジェクト: `/Users/miyagawakiyomi/Projects/rodo/app`
対象スタック: Next.js 16.2.3 / React 19.2.4 / next-auth 5.0.0-beta.30 / Prisma 6.19.3 / Zod 4.3.6

---

## 0. 目的と要件サマリ

- 1 勤務あたりの休憩時間上限を 60 分に制限し、消化後はホーム画面の「休憩」ボタンを非表示にする。
- 勤務の定義は Phase 1 では「過去 24 時間のスライディングウィンドウ」。Phase 2 で `Shift` テーブルに差し替える前提で抽象化レイヤ (`lib/workSession.ts`) を用意する。
- 累計時間は pause/resume の停止時間を差し引いた「実消化時間」で算出（カウントダウン的定義に忠実）。
- 運営日設定（`Tenant.businessDayStartMinutes`）を管理者設定画面に新設。用途は出動番号の日付計算用のみ、今回の休憩制御では使わない。

### スコープ外（明確化）

- 休憩時間（60 分）の可変化。定数のまま。
- 既存 `BreakRecord.totalBreakMinutes` の pause 差し引きバグの修正。別タスクとして切り出す。
- `Shift` テーブル・出勤/退勤 API・`BreakRecord.shiftId` 追加。

---

## 1. 変更ファイル一覧

### 1.1 新規

| パス | 責務 |
|---|---|
| `lib/workSession.ts` | 勤務区間を返す抽象関数 `getCurrentWorkSession`。Phase 1 は過去 24h を返す |
| `lib/breakUsage.ts` | `BreakRecord[]` から pause 差し引きの実消化ミリ秒を算出する純関数 |
| `lib/validations/schemas/tenant.ts` | `Tenant.businessDayStartMinutes` の Zod スキーマ |
| `app/api/breaks/limit-status/route.ts` | GET: 勤務区間内の累計使用秒と `canStartBreak` を返す |
| `app/api/tenant/settings/route.ts` | GET/PATCH: ADMIN のみ。`businessDayStartMinutes` の取得・更新 |
| `components/settings/TenantTab.tsx` | 運営日設定 UI（既存 AssistanceTab 踏襲の `useState` ベース） |
| `__tests__/lib/workSession.test.ts` | Phase 1 の 24h ウィンドウ境界テスト |
| `__tests__/lib/breakUsage.test.ts` | pause 差し引きロジックの純関数テスト |
| `__tests__/api/breaks-limit-status.test.ts` | 60 分到達前後・未認証・データ無しケース |
| `__tests__/api/tenant-settings.test.ts` | ADMIN 認可・Zod バリデーション・更新反映 |
| `__tests__/components/TenantTab.test.tsx` | 表示・保存・エラー表示 |

### 1.2 変更

| パス | 変更内容 |
|---|---|
| `prisma/schema.prisma` | `Tenant` に `businessDayStartMinutes Int @default(0)` 追加 |
| `components/SettingsClient.tsx` | タブに「テナント設定」を追加（既存 2 タブは保持） |
| `components/HomeClient.tsx` | マウント時に `/api/breaks/limit-status` を取得し、`canStartBreak === false` の間は休憩ボタンを非表示 |
| `__tests__/components/SettingsClient.test.tsx` | 新タブの存在アサーションを追加 |
| `__tests__/components/HomeClient.test.tsx` | 休憩ボタン表示/非表示ケースを追加 |

触らないファイル: `BreakScreen.tsx`, `BreakBar.tsx`, `store/breakAtom.ts`, 既存 `/api/breaks/*`（pause/resume/end/active/POST）。

---

## 2. 実装順序（フェーズ分け）

### Phase 1-A: DB スキーマ

- `schema.prisma` を編集し `Tenant.businessDayStartMinutes` を追加
- `npx prisma db push` でローカル DB に反映（マイグレーションディレクトリは運用上作らない）
- `prisma generate` は db push に付随
- **成果物**: 更新済み `schema.prisma`、ローカル DB に列追加
- **リスク**: 既存テナントレコードに NOT NULL 追加が必要。`@default(0)` で既存行は自動的に 0 埋めされる想定だが、本番 DB では必ず手動で `db push` 前に既存行状態を確認する

### Phase 1-B: lib ユーティリティ

- `lib/workSession.ts` 実装: `getCurrentWorkSession(userId: string, now: Date): Promise<{ start: Date; end: Date }>`
  - Phase 1 実装は `{ start: new Date(now.getTime() - 24*60*60*1000), end: now }` を同期的に Promise でラップして返す
- `lib/breakUsage.ts` 実装: `sumBreakUsageMs(records: BreakRecordLike[], range: { start: Date; end: Date }): number`
  - 引数の形式・計算ロジックは「3. 各ファイル詳細」に記載
- **成果物**: 2 つの純関数と単体テスト
- **リスク**: 純関数のため低い

### Phase 1-C: API

- `app/api/breaks/limit-status/route.ts` (GET)
- `app/api/tenant/settings/route.ts` (GET/PATCH)
- **成果物**: API 2 本とテスト
- **リスク**: `session.user.role` 判定と `tenantId` スコープ。既存コードと同じ 401/403/400 ハンドリングを踏襲

### Phase 1-D: UI

- `components/settings/TenantTab.tsx` 追加
- `components/SettingsClient.tsx` にタブ追加
- `components/HomeClient.tsx` に fetch + 条件分岐を追加
- **成果物**: 更新 UI、コンポーネントテスト
- **リスク**: ホーム画面の表示フラッシュ（ボタンがいったん出て消える問題）。初期値を `null` にして「判定完了まで非表示 or スケルトン」扱いにする方針を採用

### Phase 1-E: 検証・リセット

- 手動動作確認（9 章）
- 宮川清実アカウントの当日 BreakRecord リセット（8 章）

---

## 3. 各ファイルの変更詳細

### 3.1 `lib/workSession.ts`

```
export interface WorkSessionRange {
  start: Date
  end: Date
}

export async function getCurrentWorkSession(
  userId: string,
  now: Date = new Date(),
): Promise<WorkSessionRange>
```

- Phase 1: `userId` は無視し、`start = now - 24h`, `end = now` を返す
- Phase 2 への拡張ポイント: 引数に `tenantId` を追加し、`Shift` テーブルから直近の `clockInTime/clockOutTime` を参照。関数シグネチャを変えないよう、将来は第 2 引数を options オブジェクトに拡張

### 3.2 `lib/breakUsage.ts`

```
interface BreakRecordLike {
  startTime: Date
  endTime: Date | null
  pauseTime: Date | null
  resumeTime: Date | null
}

export function sumBreakUsageMs(
  records: BreakRecordLike[],
  range: { start: Date; end: Date },
  now: Date = new Date(),
): number
```

- 各 record について以下を計算し合算:
  - **確定区間の決定**: effectiveStart = `max(record.startTime, range.start)`, effectiveEnd = `min(record.endTime ?? (record.pauseTime ?? now), range.end)`
  - **停止中の除外**: `record.pauseTime != null && record.resumeTime == null` なら、実消化は `pauseTime` までで止める
  - **resumeTime 非存在仕様**: pause API は `pauseTime` をセット。resume API は `pauseTime=null` にして `resumeTime` を更新（1 回分）。複数回 pause は対象外（現仕様）
- 単位はミリ秒、呼び出し側で秒・分に丸め

### 3.3 `app/api/breaks/limit-status/route.ts` (GET)

- 認証: `await auth()`、未認証 401
- 処理:
  1. `getCurrentWorkSession(userId, now)` で `{ start, end }`
  2. `prisma.breakRecord.findMany({ where: { userId, tenantId, startTime: { gte: start } } })`
  3. `sumBreakUsageMs(records, { start, end })` で使用ミリ秒
  4. 残り = `max(0, 60*60*1000 - usedMs)`
  5. `canStartBreak = remaining > 0` かつ `usedMs < limit`
- レスポンス:
```
{
  limitSeconds: 3600,
  usedSeconds: number,
  remainingSeconds: number,
  canStartBreak: boolean,
  windowStart: string (ISO),
  windowEnd: string (ISO)
}
```
- エラー: 500 は `{ error: 'Internal Server Error' }`

### 3.4 `app/api/tenant/settings/route.ts`

- **GET**:
  - 認証必須、ADMIN 限定（非 ADMIN は 403）
  - `prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { id, name, businessDayStartMinutes } })`
- **PATCH**:
  - 認証必須、ADMIN 限定
  - Body を Zod `tenantSettingsPatchSchema` で `safeParse`
  - 失敗時 `{ error: 'ValidationError', details: parsed.error.flatten() }` の 400
  - `prisma.tenant.update(...)` で更新後、更新済みオブジェクトを 200 で返す

### 3.5 `lib/validations/schemas/tenant.ts`

```
import { z } from 'zod'

export const tenantSettingsPatchSchema = z.object({
  businessDayStartMinutes: z.number().int().min(0).max(1439),
})

export type TenantSettingsPatchInput = z.infer<typeof tenantSettingsPatchSchema>
```

- 値域: 0〜1439（0 時 0 分〜23 時 59 分を分で表現）
- `lib/validations/index.ts` に re-export を追加

### 3.6 `components/settings/TenantTab.tsx`

- `useState` ベースで既存 `AssistanceTab` 踏襲
- マウント時に GET `/api/tenant/settings` で現在値取得
- 入力は「時」と「分」の 2 つのセレクト (0〜23 / 0〜59) を採用し、保存時に `hour*60 + minute` で算出
  - 採用理由: 分総量 (0〜1439) を直接数値入力させると UX が悪い
- 「保存」ボタン押下で PATCH。成功時トースト代替の簡易メッセージ（既存と同じ方針）
- エラー時は 400 の `details` を表示し、保存ボタンを再有効化

### 3.7 `components/SettingsClient.tsx`

- タブ `value="tenant"` を追加
- タブラベル: 「テナント設定」
- 既存 2 タブの順序・デザインは変えない

### 3.8 `components/HomeClient.tsx`

- 追加 state:
```
const [canStartBreak, setCanStartBreak] = useState<boolean | null>(null)
```
- マウント時と、`breakState.status` が `'idle'` に遷移したタイミング（`useEffect` 依存）で `/api/breaks/limit-status` を GET
- 休憩ボタンの表示条件を以下に変更:
  - `breakState.status !== 'paused'` **かつ** `canStartBreak === true`
  - `canStartBreak === null` のあいだは非表示（フラッシュ防止）
- BreakScreen で休憩終了後にホームへ戻った際にも再 fetch されるよう、`router` ナビゲーションイベントに依存させる代わりに、`window` の `focus` イベントでも再取得する

---

## 4. Zod スキーマ仕様

```
tenantSettingsPatchSchema:
  businessDayStartMinutes: integer, 0 <= x <= 1439
```

- 文字列→数値の自動変換は行わない（フロント側で数値で送る）
- 将来 `name` 等他のテナント設定が増えたら同スキーマに追加。今回は単一フィールドのみ

---

## 5. テスト計画

### 5.1 `lib/workSession.test.ts`

- 固定 now を与えて start/end が期待どおり 24h 差になること
- `end - start` がちょうど 86,400,000 ms であること
- userId の内容に依存しないこと（Phase 1）

### 5.2 `lib/breakUsage.test.ts`

- **基本**: 1 件完了済み record、10 分消化 → 600,000 ms
- **pause 中のみ（resumeTime null）**: pauseTime までをカウント
- **resume 後に終了**: 全区間 − pause 停止中の時間
- **range 境界外**: `record.startTime < range.start` のケースで start でクリップ
- **range 境界外**: `record.endTime > range.end` のケースで end でクリップ
- **未終了・pause なし**: `now` までの経過時間を計上
- **空配列**: 0
- **複数 record 合算**: 2 件を正しく足し合わせる

### 5.3 `__tests__/api/breaks-limit-status.test.ts`

- 401: 未ログイン
- 200: 60 分未消化 → `canStartBreak: true`, `remainingSeconds > 0`
- 200: ちょうど 60 分 → `canStartBreak: false`, `remainingSeconds: 0`
- 200: 超過 → `remainingSeconds: 0`（負値にならない）
- 200: `tenantId` が別のテナントのレコードは含まない
- pause 中のレコードが含まれるケース

### 5.4 `__tests__/api/tenant-settings.test.ts`

- GET 401: 未ログイン
- GET 403: 非 ADMIN
- GET 200: ADMIN で値取得
- PATCH 400: 範囲外（-1, 1440, 小数, 非整数）
- PATCH 400: フィールド欠落
- PATCH 200: 正常更新で反映
- PATCH 403: 非 ADMIN

### 5.5 `__tests__/components/TenantTab.test.tsx`

- 初期マウントで fetch GET が呼ばれる
- 時/分 select 変更 → 保存 → PATCH ボディが `hour*60+minute`
- 400 エラー表示

### 5.6 `__tests__/components/SettingsClient.test.tsx`（既存に追記）

- 「テナント設定」タブトリガーが存在する
- クリックで TenantTab が表示される

### 5.7 `__tests__/components/HomeClient.test.tsx`（既存に追記）

- `limit-status` が `canStartBreak: true` を返す → 休憩ボタン表示
- `canStartBreak: false` を返す → 非表示
- 取得中（null）→ 非表示
- API エラー → 非表示（フェイルクローズ。勤務時間を保護する方針）

---

## 6. Phase 2 への移行ポイント

1. **`getCurrentWorkSession` の差し替え**: Phase 2 で `Shift` テーブルを参照する際、関数シグネチャを維持するか、破壊的変更にして `(tenantId, userId, now)` にするか要判断。
   - 推奨: Phase 1 段階で `(userId: string, now?: Date, options?: { tenantId?: string })` を受けられるように第 3 引数を予約しておく。
2. **`BreakRecord.shiftId` 追加時**: `sumBreakUsageMs` の引数を `shiftId` フィルタに変えられるよう、呼び出し側（API 層）で records を絞る責務を持たせ、`sumBreakUsageMs` は records 配列を受け取るピュア関数を維持する設計が有効。
3. **運営日設定の出動番号日付計算への適用**: 本タスク外。設定値の読み取り箇所は `prisma.tenant.findUnique` に集約しておき、将来のドメイン層で共通利用できるようにする。
4. **休憩中の強制終了**: Phase 2 では「残り時間が 0 になった休憩を自動で end する」要件が出る可能性。limit-status API の形をそのまま残り時間ソースとして使える想定。

---

## 7. リスク・懸念

| リスク | 影響 | 緩和策 |
|---|---|---|
| 24h ウィンドウは日をまたいだシフトで不自然な挙動を起こし得る（午前 0 時直後に前日の休憩が大量に計上される等） | 中 | Phase 2 で Shift 参照に移行。Phase 1 は UX 上は「過去 24h」と明示しないが、シンプルさを優先 |
| `/api/breaks/limit-status` 取得中に休憩ボタンがフラッシュで表示される | 小 | `canStartBreak === null` の間は非表示にするか「確認中」スケルトンを出す |
| pause 中に limit-status を呼ぶと、実消化時間として `pauseTime` までしか計上されず、ユーザーの残時間が増えたように見える | 中 | UI 側では pause 中は休憩ボタン自体を元から非表示にしている。API レスポンスは正しい実消化を返す設計のため矛盾しない |
| `prisma db push` で本番に当てる際、`businessDayStartMinutes` のデフォルト適用が既存行に反映されない DB がある | 中 | 本番反映前にステージング確認。必要なら明示的に `UPDATE "Tenant" SET "businessDayStartMinutes" = 0 WHERE ...` |
| ADMIN 判定を文字列 `'ADMIN'` で行っており、ロール列挙が変わると漏れる | 低 | 既存踏襲。今回は変えない |
| `sumBreakUsageMs` は現行実装の resume が 1 回仕様であることを前提にしている | 中 | 複数 pause/resume が実装された際は純関数のまま累積に変更できるよう、テストでガードする |
| Home 画面の `window focus` で再 fetch にすると、バックグラウンド復帰時の無駄な API 呼び出しが増える | 小 | 必要なら `visibilitychange` に限定。Phase 2 の検討事項 |

---

## 8. 宮川清実 当日分 BreakRecord リセット手順

対象: `miyagawakiyomi@gmail.com`、当日（ローカルタイム基準の 0:00〜23:59:59）の `BreakRecord` のみ削除。

### 選択肢 A: Prisma Studio 手動削除（推奨・本番相当の安全策）

手順:
1. `cd /Users/miyagawakiyomi/Projects/rodo/app`
2. `npx prisma studio`
3. `User` テーブルで `email = miyagawakiyomi@gmail.com` の `id` をコピー
4. `BreakRecord` テーブルで `userId` をフィルタし、`createdAt` が当日のものを選択
5. 対象行を削除

- **メリット**: 誤削除防止（目視確認）、本番でも使える
- **デメリット**: 工数、複数レコード時の手間

### 選択肢 B: dev 用 Node スクリプト（dev 環境のみ）

配置: `/Users/miyagawakiyomi/Projects/rodo/app/scripts/reset-miyagawa-breaks-today.ts`（コミット対象外 or `scripts/.gitignore` 管理）

方針:
- `PrismaClient` を直接利用
- 対象抽出条件: `user.email = 'miyagawakiyomi@gmail.com'` かつ `createdAt >= 当日 0:00 (ローカル)` かつ `createdAt < 翌日 0:00`
- 実行前に dry-run (削除候補の `id/startTime` を console.log のみ) → `--apply` フラグでのみ実際に削除
- 実行: `npx tsx scripts/reset-miyagawa-breaks-today.ts`（dry run）→ 確認後 `... --apply`
- 本番 DB 接続でうっかり動かさないよう、冒頭で `process.env.DATABASE_URL` が `localhost` を含むか assert
- **メリット**: 繰り返しテストで楽
- **デメリット**: 本番で誤実行した場合の影響大。安全装置の実装が必須

### 推奨

- 初回は **選択肢 A** で実施。以降繰り返し発生するなら **選択肢 B** を追加。
- 本タスクでは ADMIN API は作らない（恒久機能ではないため）。

---

## 9. 動作確認手順（ローカル）

前提: ローカル DB、宮川清実（ADMIN）でログインできる状態。

1. `schema.prisma` 反映: `npx prisma db push`
2. dev サーバ起動: `npm run dev`
3. 「8 章」の手順で当日の BreakRecord を 0 件にリセット
4. ホーム画面を開く → `GET /api/breaks/limit-status` がネットワークタブで 200、`canStartBreak: true`
5. 休憩を開始 → 1 分待って end
6. ホームへ戻る → `usedSeconds: 60`（前後）、`canStartBreak: true`
7. BreakRecord を手動で `startTime = now-59m`, `endTime = now` の record に書き換え（Prisma Studio）
8. ホームへ戻る → `canStartBreak: true` のまま、残 1 分前後
9. さらに 1 分相当の record を足して 60 分以上にする → ホームで休憩ボタンが消える
10. `/settings` → 「テナント設定」タブ → 時・分を変更 → 保存 → GET で反映確認
11. 非 ADMIN ユーザーでログイン → `/api/tenant/settings` が 403、設定画面にアクセスできない（既存動作踏襲）
12. pause 中の record がある状態で limit-status を確認 → 実消化のみカウント

### ビルド/リント（ユーザールール）

- push 前に必ず `npm run build` と `npm run lint`（プロジェクト定義のコマンドに合わせる）
- エラーがあれば修正してから再実行

---

## 10. 承認待ち事項

実装着手前に以下を確認したい:

1. `TenantTab` の入力 UI は「時 select + 分 select」で良いか、単一分入力欄が良いか
2. ホーム画面で limit-status 取得中の扱い（非表示 / スケルトン / 「確認中」表示）
3. 当日 BreakRecord リセットは選択肢 A / B のどちらで進めるか
4. `limit-status` の API エラー時の UI（フェイルクローズ＝非表示にする方針で良いか、開発時は fallback で表示する方針か）

---

## 11. Phase 1 逸脱の修正記録（2026-05-02）

### 経緯

Phase 1 実装後、以下の不具合が報告された:

> ホーム画面で「休憩」ボタンを押下すると、休憩画面（カウントダウン）に滞在せず、即座に「休憩終了」扱いとなりホームへ戻る。

`research/2026-05-02-break-instant-end-investigation.md` の調査により、根本原因は次の通り判明:

1. ブラウザを閉じる/電源断などで `/end` API が呼ばれず、DB に `endTime=null` の古い未終了 BreakRecord が残るケースがある
2. POST /api/breaks は既存の未終了レコードを検出して 409 を返す
3. クライアント (`components/BreakScreen.tsx`) は 409 復元 path で `(Date.now() - startTime) / 1000` から残時間を計算していたが、`pauseTime` を考慮していなかった
4. 結果として「pause で実消化が小さいまま放置されたが、開始から 60 分以上経過した」レコードがある場合、`remaining = 0` がセットされ即終了処理が走っていた

つまり「サーバー側に古い未終了レコードを締めるロジックが無い」「クライアント 409 path の残時間計算が limit-status と乖離している」という 2 層の問題。

### 計画外で実施した変更

Phase 1 計画書には含まれない以下を本タスクで実施した:

#### 層 1: サーバー側で「上限超過した未終了レコード」を自動クローズ

新規ファイル: `lib/breakAutoClose.ts`

- `closeStaleBreaks(client, { userId, tenantId, now? })` ヘルパーを追加
- userId/tenantId に紐づく `endTime=null` のレコードのうち、`(now - startTime) > BREAK_DURATION_SECONDS * 1000` を超えているものに `endTime` をセット
  - `pauseTime` があれば `endTime = pauseTime`（実消化はそこで止まっている扱い）
  - なければ `endTime = startTime + BREAK_DURATION_SECONDS * 1000`（タイマー満了時刻）
- `BREAK_DURATION_SECONDS` のみ参照。マジックナンバー直書き禁止

呼び出し箇所:
- `app/api/breaks/active/route.ts` (GET): 冒頭で実行 → 古いレコードを片付けてから findFirst
- `app/api/breaks/route.ts` (POST): Serializable トランザクション内で `findFirst` の前に同じ `tx` を渡して実行

#### 層 2: GET /api/breaks/active のレスポンスに `remainingSeconds` を含める

- `app/api/breaks/active/route.ts` のレスポンスに以下を追加:
  - `remainingSeconds: number`（pause を考慮した「この個別休憩の残り秒数」、0 以上の整数）
  - `serverNow: string`（ISO 文字列、時計ずれ検証用）
- `remainingSeconds` の計算は既存純関数 `calculateUsedBreakMs`（`lib/breakUsage.ts`）を流用
- これにより `limit-status` と `active` で「pause/resume の解釈」が完全一致する

#### 層 2 の連動: クライアント `components/BreakScreen.tsx` の 409 path 修正

- 旧: 取得した `active.startTime` から `(Date.now() - serverStartMs) / 1000` で elapsed を計算 → `remaining = max(0, BREAK_DURATION - elapsed)` をセット
- 新: `active.remainingSeconds` をそのまま `setBreakState` の `remainingSeconds` に渡す
- `active.remainingSeconds` が `number` でない場合は atom を更新せずエラーログのみ（フェイルクローズ）
- `active.pauseTime !== null && resumeTime === null` のときに 'paused' で復元する責務は本タスクのスコープ外（TODO コメントを残置）

### 計画外実施の理由

層 1（自動クローズ）は計画書に含まれないが、これを入れないとデータが汚染され続け、層 2 の修正だけでは「初回再現を防げない」だけで「過去レコードによる継続的な詰まり」を解決できない。研究ノートの「修正方針 5」に該当する措置。

層 2 のクライアント側変更は `BreakScreen.tsx` のロジック修正であり、Phase 1 計画書の「変更ファイル一覧」には含まれていなかった。「409 path での独自残時間計算」が Phase 1 で導入された経緯があるため、修正も同時に行った（同 commit で生まれたバグを同タスクで閉じる）。

### 追加・書き換えテスト

- 新規: `__tests__/lib/breakAutoClose.test.ts`（8 ケース）
- 新規: `__tests__/api/breaks-active.test.ts`（7 ケース）
- 書き換え: `__tests__/components/BreakScreen.test.tsx` の「409 ⇒ 独自計算で復元」テストを「409 ⇒ active.remainingSeconds をそのまま atom にセット」に変更
- 追記: `__tests__/api/breaks-post.test.ts` に「60 分超過レコードが自動クローズされて新規 201」ケースを追加

### サイレント故障チェック（同タスク完了時）

- `closeStaleBreaks` 失敗時: 例外を握り潰さず呼び出し側へ伝播させる方針。両 API ルートの `try/catch` で 500 として返却される
- active API レスポンスの `remainingSeconds` が `undefined` の場合: クライアントは atom を更新せずエラーログを出す（独自計算へのフォールバックは意図的に行わない。limit-status と必ず同じ計算に揃えるため）
- POST /api/breaks の Serializable トランザクション内で `closeStaleBreaks` を実行することによる競合: 既存の P2034 ハンドリング（409 として処理）でカバーされる

### スコープ外（残課題）

- `BreakScreen.tsx` の 409 path で `active.pauseTime !== null && resumeTime === null` のレコードを 'paused' 状態として復元する処理（現状は問答無用で 'breaking' をセット）
- 過去 24h より古いがまだ 60 分未満の未終了レコード（バックグラウンド job で定期クリーンアップする手段は別タスク）
