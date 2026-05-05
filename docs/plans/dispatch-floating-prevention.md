# 出動中の浮き案件防止 — 実装計画書

作成日: 2026-05-04
作成者: planner CC
ブランチ: feature/p0-13-signature-blob

---

## §1 概要

### 1.1 目的

隊員が出動を開始した後、ホーム画面に戻ると「出動中である」ことが UI 上に表現されず、別案件の出動・休憩を開始できてしまう設計問題を解消する。「進行中の案件は取り消さない限り戻れない」「再ログイン時に進行中案件へ戻れる」「管理者でも一律同じ制約」を満たす。

### 1.2 背景

- 引き継ぎノート: `docs/handover/2026-05-04-dispatch-floating-prevention.md`
- 調査レポート: `docs/research/2026-05-04-dispatch-floating-prevention-research.md`
- ユーザー確認済み仕様（§C 2026-05-04, miyagawakiyomi）: 出動中は別操作不可。出動状態は常時可視・常時動線確保。浮き案件は取消しない限り操作不可。救援業務での休憩中→出動は休憩自動終了。

### 1.3 確定済み 5 論点（変更不可・本計画の前提）

| # | 論点 | 確定方針 |
|---|---|---|
| 1 | 戻る制御方式 | 進行中なら確認ダイアログを出してホーム遷移をブロック（5画面共通フック化）。ブラウザバック・履歴 API（popstate / beforeunload）も同等にカバー。setTimeout/`window.location.href = '/'` 等のホーム遷移6件にも適用。 |
| 2 | 案件キャンセル機能 | `POST /api/dispatches/[id]/cancel` を新設し、active 状態 → `CANCELLED` への遷移を `VALID_STATUS_TRANSITIONS` に追加。隊員は自分の案件のみ、管理者は全案件。UI は5画面共通の「案件キャンセル」ボタン（確認ダイアログ必須）。 |
| 3 | 案件番号 | 論理削除（status を `CANCELLED` に更新）。`dispatchNumber` は欠番として残す。物理削除しない。**採番ロジックを `count+1` から `同日内最大番号+1` 方式に変更（堅牢化）。** -2/-3 サフィックス・-T サフィックスにも同様の堅牢化を適用するかは Phase 1 内で判断。 |
| 4 | 管理者の扱い | 一律同じ制約（管理者ロールでも進行中なら戻れない、案件キャンセルは可能）。 |
| 5 | 再ログイン時の復帰 | `GET /api/dispatches/active` を新設、`HomeClient.tsx` に進行中バナー表示。Service Worker のオフライン状態でも可能な限り表示。 |

---

## §2 Next.js 16 系の前提確認結果

### 2.1 参照した `node_modules/next/dist/docs/` ファイルパス

- `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` — Client-side transitions / Native History API / `window.history.pushState`・`replaceState` の Next.js Router 統合（L343-345）
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` — Next.js 16 から Middleware が Proxy にリネーム（L15）。`proxy.ts` は本リポジトリで既に採用済み
- 調査レポート §1 を継承

### 2.2 本計画に関わる Next.js 16 仕様の要点

- **`useRouter().push(href)` は client-side transition**：full reload を伴わない。これを「進行中なら遷移させない」ためには、push 呼び出し前に独自で進行中判定→確認ダイアログを挟む必要がある。Next.js 標準の遷移ガード（Server Action 用以外）は **本リポジトリでは利用できない**（調査レポート §1 確認済み）。
- **`window.history.pushState`/`replaceState`** は Next.js Router と統合され `usePathname` / `useSearchParams` と同期する（L343-345）。本計画では「ダミー履歴エントリを積んで `popstate` で戻る方向を捕捉」する古典的手法を採用する。同手法は Next.js Router と非衝突であることが docs L343-345 から判断できる [推測]。
- **`beforeunload`**: Next.js は client-only 遷移には介入しないが、ブラウザのタブ閉じ・リロード・外部 URL 遷移には `beforeunload` イベントが発火する。本計画ではこれを警告ダイアログに使用。
- **見つからなかった項目**: `router.push` を「キャンセル」する公式 API は 04-linking-and-navigating には記載なし。従って push 自体を抑止する設計（呼び出し元でガード）を採る。

### 2.3 注意すべきプロジェクト固有挙動

- `proxy.ts` は `app/api/*` を一律 401 ガード（`PUBLIC_API_PREFIXES` 以外）。新設 API は素通しで認証ゲートを通過する。
- Service Worker (`public/sw.js`) は GET `/api/dispatches/...` を networkOnly で扱う（調査レポート §6.2）。オフライン時は `503 + X-SW-Offline: 1` を返すため、新設 `GET /api/dispatches/active` も同条件で動く。
- `lib/offline-fetch.ts` は SW 503 を検知すると楽観的レスポンスを返す。新設 `POST /api/dispatches/[id]/cancel` は **意図的にオフラインキューに積まない**設計を推奨（取消はオンライン即時確定が望ましい — §4 / §5 / §6 で詳述）。

---

## §3 Phase 分割と実装順序

依存関係順に Phase 1 → 8 で進める。各 Phase の完了承認後、次 Phase に進む。

### Phase 1: API 基盤（バックエンド先行）

**目的**: クライアント実装が依存する API を先に確定させる。

**変更ファイル一覧**

| 種別 | パス | 概要 |
|---|---|---|
| 新規 | `app/api/dispatches/active/route.ts` | GET: 自分の active な Dispatch を返す |
| 新規 | `app/api/dispatches/[id]/cancel/route.ts` | POST: 案件キャンセル（status=CANCELLED） |
| 変更 | `app/api/dispatches/[id]/route.ts` | `VALID_STATUS_TRANSITIONS` に active → CANCELLED を追加（cancel ルートからの利用に限定すべきか検討） |
| 変更 | `app/api/dispatches/route.ts` | 採番ロジックを `count+1` → `同日内最大 dispatchNumber + 1` 方式に堅牢化（2次搬送 -N サフィックスも同様に検討） |
| 変更（必要なら） | `app/api/dispatches/[id]/transfer/accept/route.ts` | -T サフィックス採番の堅牢化（要否を Phase 1 着手時に判断） |
| 変更（必要なら） | `lib/admin/status-derivation.ts` | `mapStatusToSubPhase` を「クライアントから import 可能」な形で再エクスポートする補助モジュール（既に純粋関数で import 可能と推定。動作確認次第で対応） |

**実装手順**

1. **採番堅牢化**: `app/api/dispatches/route.ts` L114-122 を `tx.dispatch.findFirst({ where: { tenantId, dispatchNumber: { startsWith: dateStr } }, orderBy: { dispatchNumber: 'desc' }, select: { dispatchNumber: true } })` に置換し、末尾3桁を Number 化して +1。0件なら `001` 採番。トランザクション内なので race condition も既存と同等。
   - 同日内に CANCELLED 済み番号があっても、欠番を埋めず最大番号+1 で採番される（ユーザー仕様準拠）。
2. **2次搬送・振替の採番堅牢化判断**: `siblingCount + 2` (L132-137) と `-T` 採番（accept route L64-71）の挙動を Read で再確認し、CANCELLED 案件が混入しても衝突しないことを確認。混入リスクがあれば同様に「同 prefix 内最大サフィックス +1」方式に変更。
3. **`VALID_STATUS_TRANSITIONS` 拡張**: `app/api/dispatches/[id]/route.ts` L45-55 に「active 各 status → CANCELLED」を追加。ただし PATCH ルートからの呼び出しは現状 schema 経由で CANCELLED が許可されているため、副作用を抑えるなら以下 2 案から選択。
   - **案 A（推奨）**: PATCH ルートには CANCELLED 遷移を**追加せず**、専用 `POST /api/dispatches/[id]/cancel` を新設し、そのルート内で直接 `prisma.dispatch.update({ status: 'CANCELLED' })` を実行（遷移検証はルート内ローカルロジックで実施）。これにより `VALID_STATUS_TRANSITIONS` への影響を最小化し、既存遷移バグの混入リスクを回避。
   - **案 B**: PATCH ルートの `VALID_STATUS_TRANSITIONS` に `* → CANCELLED` を追加し、cancel ルートは内部で PATCH を呼ぶ薄いラッパー。
   - **判断**: 案 A を採用。理由: 既存遷移マップの汚染を避け、認可ロジック（隊員 vs 管理者）を cancel ルート専用に書ける。
4. **`POST /api/dispatches/[id]/cancel` 新設**: 認可（自分の案件 OR ADMIN）→ 現在 status を取得 → active 状態（DISPATCHED/ONSITE/TRANSPORTING/COMPLETED && returnTime IS NULL）でなければ 409 Conflict → `prisma.dispatch.update({ status: 'CANCELLED' })`。同時に **active な BreakRecord は触らない**（出動中に休憩は存在しない前提だが、念のため検証）。
5. **`GET /api/dispatches/active` 新設**: 認証必須。`prisma.dispatch.findFirst({ where: { tenantId, userId: session.user.userId, status: { notIn: ['STANDBY', 'WORKING', 'RETURNED', 'STORED', 'CANCELLED', 'TRANSFERRED'] }, OR: [{ status: { not: 'COMPLETED' } }, { returnTime: null }] }, select: { id, dispatchNumber, status, returnTime, type, assistance: { select: { name } } } })` 相当。レスポンスは `null` または該当 Dispatch オブジェクト。
   - `mapStatusToSubPhase` を呼んで subPhase をレスポンスに含めるとクライアント実装が簡潔になる。
6. **テスト**: 既存テストパターンに合わせて `__tests__/api/dispatches/cancel.test.ts` `__tests__/api/dispatches/active.test.ts` を tester に依頼（Phase 1 完了条件に含める）。

**テスト方針**

- 単体: 新設 2 ルートと採番ロジックの単体テスト（`__tests__/api/...`）
- 結合: 認可（隊員が他人の案件を cancel できないこと、ADMIN は可能なこと）、active 状態 → CANCELLED への遷移、非 active 状態の cancel 試行で 409
- 採番: 同日内に複数案件作成 → 1件 cancel → 新規作成で番号が衝突しない（ユニーク制約違反なし）

**完了条件**

- `pnpm test` 全件 PASS
- `pnpm build` 成功（`pnpm lint` 含む）
- 採番方式変更による既存テストの影響を吸収済み

**想定所要時間**: 3〜4時間
**担当 CC**: implementer（テストは tester に並列委任可）
**依存する前 Phase**: なし

---

### Phase 2: 共通フックとユーティリティ

**目的**: 5画面で共有する「進行中判定」と「ホーム遷移ガード」を 1 箇所に集約する。

**変更ファイル一覧**

| 種別 | パス | 概要 |
|---|---|---|
| 新規 | `hooks/useActiveDispatch.ts` | `GET /api/dispatches/active` のクライアント側 SWR-like フック |
| 新規 | `hooks/useDispatchInProgressGuard.ts` | 進行中判定 + 戻る制御（router.push ラッパー、popstate、beforeunload を一括管理） |
| 新規 | `lib/dispatch/active-status.ts` | `isActiveDispatchStatus(status, returnTime)` などの純粋関数（status-derivation の薄いラッパー）。クライアント import 専用で server コード非依存にする |

**実装手順**

1. `lib/dispatch/active-status.ts` を新設し、`mapStatusToSubPhase` を再エクスポート。クライアント側の `step` / `dispatch.status` 両方で使えるよう、`isActive(status: string, returnTime: Date | null): boolean` を export。
2. `hooks/useActiveDispatch.ts`: `useEffect` で `/api/dispatches/active` を fetch。レスポンスを state に保持。`refresh()` を返す。エラー時はサイレント故障せず `setError` する。`useOnlineStatus` 連携は不要（オフラインなら `null` 扱いで問題ないが §6 で再考）。
3. `hooks/useDispatchInProgressGuard.ts`: 引数に `inProgress: boolean`, `onBlocked?: () => void` を取り、以下を実装。
   - **`safeNavigateHome(router)`**: `inProgress` なら確認ダイアログ（カスタム UI モーダル経由を推奨だが、フェーズ初期は `window.confirm` で MVP）→ ブロック。ブロック時は `onBlocked` 経由で UI 側にダイアログを出させる。
   - **popstate**: `useEffect` で `history.pushState(null, '', location.href)` を一度積んで「現在地と同じ仮想エントリ」を作り、`popstate` で `inProgress` の場合は再度 push して進行を抑止。
   - **beforeunload**: `inProgress` のときのみ `e.preventDefault(); e.returnValue = ''` でブラウザ標準ダイアログを発火。
   - **`replaceLocation(target)`**: `window.location.href` 相当のフルリロード遷移をガード越しで実行するヘルパー。
4. **設計上の重要判断**: `window.confirm` は機種依存で UI が貧弱。本計画では Phase 2 では `window.confirm` で MVP として実装し、Phase 3 で各画面に既存スタイルの確認モーダルを差し込む二段階アプローチを採る。フック側は「ダイアログを出すかどうか」を呼び出し元に委ねる callback 形式（`onAttemptHome: () => Promise<boolean>`）にする。

**テスト方針**

- 単体: フック単体の `@testing-library/react-hooks`（既存パターンに準ずる）
- 結合: 動作シナリオは Phase 8 にまとめる（Phase 2 単独では関数テストのみ）

**完了条件**

- 3 ファイル新設、`pnpm build` PASS、単体テスト PASS
- 5画面のいずれにも未統合（Phase 3 で統合する）

**想定所要時間**: 2〜3時間
**担当 CC**: implementer
**依存する前 Phase**: Phase 1（active API がないと useActiveDispatch のテストが書けない）

---

### Phase 3: 5画面の戻るボタン制御統合

**目的**: 5画面のヘッダー戻るボタン押下時に、進行中判定 + 確認ダイアログを統一的に挟む。

**変更ファイル一覧**

| 種別 | パス | 概要 |
|---|---|---|
| 新規 | `components/dispatch/BackToHomeConfirmModal.tsx` | 5画面共通の確認モーダル（既存 RecordClient L1011-1078 のパターンを抽出） |
| 変更 | `components/dispatch/DispatchClient.tsx` | L898-903 戻るボタンを useDispatchInProgressGuard 経由に変更 |
| 変更 | `components/dispatch/SecondaryDispatchClient.tsx` | L581-587 同上 |
| 変更 | `components/dispatch/ReportOnsiteClient.tsx` | L386-393 同上 |
| 変更 | `components/dispatch/ReportTransportClient.tsx` | L549-556 同上 |
| 変更 | `components/dispatch/RecordClient.tsx` | L415-422 既存モーダルとの統合（**注意**: RecordClient は既に「未保存の下書きを保存して戻るか」モーダルを持つため、本計画のモーダルとは別軸。両モーダルを連結させる設計が必要） |

**実装手順**

1. `BackToHomeConfirmModal.tsx` 新設: メッセージは確定方針通り「進行中の案件があります。ホームに戻るには『案件キャンセル』ボタンで取り消してください」。ボタンは「OK（モーダルを閉じる）」のみ（「保存して戻る」「保存せず戻る」は提供しない＝**戻れない**）。
2. **DispatchClient.tsx**: `step` から `inProgress` を導出（`step >= 1 && step < 4(onsite)/5(transport) && !isTransferred` 等）。戻るボタン onClick を `safeNavigateHome` 経由に変更。L489 `router.replace` は遷移ではなくURL置換のみなのでガード対象外（要確認）。
3. **SecondaryDispatchClient.tsx**: 同様に `step` から `inProgress` を導出。L581-587 を変更。
4. **ReportOnsiteClient.tsx / ReportTransportClient.tsx**: dispatch.status が active 系（DISPATCHED/ONSITE/TRANSPORTING/COMPLETED && returnTime IS NULL）かつ報告未確定（`report.isDraft !== false`）なら `inProgress=true`。報告画面に到達できる時点で status は COMPLETED 以降のはず。**[未確認]** 業務上「報告作成中はホームに戻れない」が必要かは §9 残課題。Phase 3 では「進行中なら戻れない」共通ルールに従い、報告書 isDraft が false（=確定済み）になった時点で戻れる仕様で実装し、ユーザー検証で要否を判定する。
5. **RecordClient.tsx**: 既存の「下書き保存して戻る／保存せず戻る／キャンセル」モーダルが優先。**進行中判定で戻りブロックすると既存ワークフローが破壊される**ため、RecordClient だけは現行モーダルを維持し、「保存せず戻る」ボタン押下時にもガードを通す（`safeNavigateHome` 経由）方式とする。`inProgress` は `dispatch.status` ベースで判定。
6. 各画面の補助遷移箇所（DispatchClient L1508/L1174、Secondary L747、Report 系 L817/L1384、Record L395/L715）はホーム遷移ではないため対象外。**ただしリストアップだけは行いコメントで残す**。

**テスト方針**

- 結合: Playwright 等で「出動押下後にヘッダー戻るボタン → モーダル表示 → ホーム遷移しない」を検証（既存 E2E に追加）
- 単体: `BackToHomeConfirmModal` のレンダリングテスト

**完了条件**

- 5画面すべてで戻るボタン押下時にモーダル表示されることを実機確認（モーダルキャプチャを引き継ぎノートに残す）
- `pnpm build` PASS
- 既存 RecordClient 下書きモーダルが破綻していないこと

**想定所要時間**: 4〜5時間
**担当 CC**: implementer（RecordClient 統合は fixer 推奨）
**依存する前 Phase**: Phase 2

---

### Phase 4: 案件キャンセル UI（5画面共通）

**目的**: 5画面ヘッダーに「案件キャンセル」ボタンを共通配置する。

**変更ファイル一覧**

| 種別 | パス | 概要 |
|---|---|---|
| 新規 | `components/dispatch/CancelDispatchButton.tsx` | キャンセル確認モーダル + `POST /api/dispatches/[id]/cancel` 呼び出し |
| 変更 | `components/dispatch/DispatchClient.tsx` | ヘッダー右側にボタン配置（戻るボタンの隣 or 別行） |
| 変更 | `components/dispatch/SecondaryDispatchClient.tsx` | 同上 |
| 変更 | `components/dispatch/ReportOnsiteClient.tsx` | 同上 |
| 変更 | `components/dispatch/ReportTransportClient.tsx` | 同上 |
| 変更 | `components/dispatch/RecordClient.tsx` | 同上（RecordClient は status が COMPLETED 以降だが active 状態（COMPLETED && returnTime null）なら表示） |

**実装手順**

1. `CancelDispatchButton.tsx` 新設: props に `dispatchId`, `dispatchNumber`, `onCancelled?: () => void`。クリックで確認モーダル → 「案件をキャンセルしますか？取り消した案件は復元できません」→ OK で fetch（**`offlineFetch` ではなく素の `fetch`**：オフライン時はキャンセル不可に倒す。理由は §5 / §6）。`res.ok` チェック必須、catch で alert。
2. 5画面のヘッダーに `<CancelDispatchButton dispatchId={...} dispatchNumber={...} onCancelled={() => router.push('/')} />` を配置。配置場所は **戻るボタンと同じヘッダー右端**を推奨（5画面でデザイン統一）。
3. ボタン表示条件: `inProgress === true` のときのみ表示。非 active なら非表示（既に CANCELLED 済み・帰社済みでは表示しない）。
4. **`onCancelled` callback での遷移**: cancel 成功後は `inProgress` が false になるため、ガードを外して `router.push('/')` で安全に戻れる。

**テスト方針**

- 単体: `CancelDispatchButton` の確認モーダル表示・fetch 呼び出しテスト
- 結合: 5画面で押下 → status=CANCELLED → ホーム遷移成功まで E2E で検証

**完了条件**

- 5画面でボタン表示・押下・確認モーダル・キャンセル成功後のホーム遷移が動作
- 振替案件 -T や TRANSFERRED 状態では非表示（§9 残課題で要確認: 振替後の元案件キャンセル可否）

**想定所要時間**: 3〜4時間
**担当 CC**: implementer
**依存する前 Phase**: Phase 1（cancel API）+ Phase 2（フック）

---

### Phase 5: HomeClient の進行中バナー

**目的**: ホーム画面で進行中案件を可視化し、出動画面への動線を提供する。

**変更ファイル一覧**

| 種別 | パス | 概要 |
|---|---|---|
| 変更 | `components/HomeClient.tsx` | active dispatch 取得 + バナー表示 + アシスタンス/休憩ボタンの抑止 |
| 新規 | `components/ActiveDispatchBanner.tsx` | バナー UI（`🚨 進行中の出動があります（案件番号: XXXXXX）[出動画面に戻る]`） |

**実装手順**

1. `ActiveDispatchBanner.tsx` 新設: props に `dispatchNumber`, `onClick: () => void`。クリックで「出動画面に戻る」動線。
2. `HomeClient.tsx` 変更: `useActiveDispatch` フック導入。`activeDispatch !== null` なら以下を実装。
   - バナーを `<main>` 上部に表示
   - `displayAssistances.map(... AssistanceButton)` をグレーアウト＋押下無効化（既存 `AssistanceButton` の disabled prop 対応 [未確認] が必要なら拡張）
   - 休憩ボタン (L198) の表示条件に `&& !activeDispatch` を追加
3. **遷移先**: `router.push('/dispatch/${activeDispatch.id}')` で出動画面へ。subPhase が ONSITE/TRANSPORTING なら `/report?type=...` 等への深いリンクも検討するが、まずは出動画面トップで MVP（出動画面側で step を復元できるはず）。
4. **エラー時**: API 取得失敗時は `console.error` + 表示なし（Banner なしで通常運用）。フェイルクローズしない（バナー誤表示で操作不能になるより、表示なしで進める方が業務影響が小さい）。

**テスト方針**

- 単体: ActiveDispatchBanner レンダリングテスト
- 結合: `useActiveDispatch` を msw でモックし、HomeClient のバナー表示・アシスタンスボタン抑止を検証
- E2E: 出動開始 → ホーム遷移（注: Phase 3 完了後はガードでブロックされるため、URL 直打ちでホームに到達 or `router.push` を直接呼ぶ）→ バナー表示 → ボタンクリックで出動画面復帰

**完了条件**

- バナー表示・遷移動作
- アシスタンス/休憩ボタンの抑止動作
- 既存 `BreakBar` `ProcessingBar` との表示重なりがないこと

**想定所要時間**: 3〜4時間
**担当 CC**: implementer
**依存する前 Phase**: Phase 1（active API）+ Phase 2（フック）

---

### Phase 5.5: 仕様変更対応 — 出動記録ボタン経由のガード解除（2026-05-05 ユーザー確定）

**目的**: 帰社後でも「出動記録ボタン未押下」の状態ではガードを継続する仕様変更（2026-05-05 ユーザー確定）に対応する。出動記録ボタン押下を `dispatch.isDraft === true` への状態遷移点とし、それ以降は書類作成画面でホームに戻れるようにする。

**仕様変更サマリ（2026-05-05 ユーザー確定）**

| 項目 | 旧仕様（〜2026-05-04） | 新仕様（2026-05-05〜） |
|---|---|---|
| 帰社後（returnTime IS NOT NULL）の active 判定 | 一律 active 外（ガード解除） | `isDraft === false` なら active 継続（ガード継続） |
| 出動記録ボタンの副作用 | `router.push` のみ（DB 更新なし） | `PATCH /api/dispatches/[id]` で `isDraft: true` を送信 → 成功時のみ `router.push` |
| 案件キャンセル可能条件 | active（DISPATCHED/ONSITE/WORKING/TRANSPORTING/COMPLETED && returnTime IS NULL）のみ | 上記に加え `COMPLETED/RETURNED && returnTime IS NOT NULL && isDraft === false` も可能 |
| 案件キャンセル不可条件 | 上記以外（COMPLETED && returnTime IS NOT NULL も含む）→ 409 | `COMPLETED/RETURNED && isDraft === true`（=既に下書き作成済み）→ 409 |

**§K.2 相当 — `isActiveDispatchStatus` シグネチャ・判定ロジック更新**

> **変更前（Phase 2 実装済み / 2026-05-04 確定）**
>
> `lib/dispatch/active-status.ts` 現行実装:
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
> 真値となる条件:
> - DISPATCHED / ONSITE / TRANSPORTING のいずれか
> - COMPLETED && returnTime === null（帰社中）

> **変更後（2026-05-05 ユーザー確定）**
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
> 追加された真値条件:
> - **新規**: (`COMPLETED` || `RETURNED`) && `returnTime !== null` && `isDraft === false`（帰社後・書類作成未着手）
>
> **WORKING の扱い（2026-05-05 ユーザー確認確定）**
>
> WORKING は `lib/admin/status-derivation.ts` L15 で「schema にだけ存在するデッドコード」と明記されており、DB に書き込まれない予備値である。「作業中」UI ラベルは `ONSITE` + step=2 で実現されているため、WORKING を新シグネチャに含めない方針で確定。将来 WORKING を実装する設計変更が入った時点で改めてガード対象判定を見直す。

**呼び出し側の影響箇所（要修正）**

| ファイル | 修正内容 | 備考 |
|---|---|---|
| `lib/dispatch/active-status.ts` | シグネチャ拡張・判定追加 | Phase 5.5-A |
| `app/api/dispatches/active/route.ts` | where 句に `isDraft === false` 条件を追加（帰社後 active 判定の DB 側一致） | GET /active と関数判定の整合性維持 |
| `components/dispatch/DispatchClient.tsx` | `isActiveDispatchStatus(status, returnTime, dispatch.isDraft)` で呼び出し | L1544 出動記録ボタン onClick も同 Phase で修正 |
| `components/dispatch/SecondaryDispatchClient.tsx` | 同上 | 2 次搬送側 |
| `hooks/useDispatchInProgressGuard.ts` | `isDraft` を引数に追加 or `useActiveDispatch` から取得 | フック呼び出し元で渡す |
| `hooks/useActiveDispatch.ts` | レスポンスに `isDraft` を含める（API 側で select 追加が必要） | バナー表示判定で使用 |
| `components/HomeClient.tsx` | `ActiveDispatchBanner` の表示条件で `isDraft` を考慮（下書きバナーを別表示するか統合するか要決定） | 9.0-A 例外の表示 UX |
| `components/ProcessingBar.tsx` | active 判定で `isDraft` を考慮（必要に応じて） | [未確認] 現行実装を Read で確認 |

**変更ファイル一覧**

| 種別 | パス | 概要 |
|---|---|---|
| 変更 | `lib/dispatch/active-status.ts` | シグネチャ拡張 `(status, returnTime, isDraft)` + 帰社後 `isDraft === false` ケース追加 |
| 変更 | `app/api/dispatches/active/route.ts` | where 句に `OR` 条件で `isDraft: false` ケースを追加。`select` に `isDraft` を含める |
| 変更 | `components/dispatch/DispatchClient.tsx` | 出動記録ボタン onClick: `PATCH /api/dispatches/[id]` で `isDraft: true` 送信 → 成功時のみ `router.push(/dispatch/${dispatchId}/record)`。失敗時はトースト/alert、遷移なし。**楽観的更新は行わない（§5 サイレント故障防止準拠）** |
| 変更 | `components/dispatch/SecondaryDispatchClient.tsx` | 同等の出動記録ボタンが存在する場合は同様に修正 |
| 変更 | `app/api/dispatches/[id]/cancel/route.ts` | CANCELLABLE 条件拡張: `COMPLETED/RETURNED && returnTime IS NOT NULL && isDraft === false` も可。`COMPLETED/RETURNED && isDraft === true` は 409 Conflict（メッセージ「書類作成中の案件はキャンセルできません」） |
| 変更 | `app/api/dispatches/[id]/route.ts` | PATCH ルートで `isDraft` の更新を許可（schema 検証）。既存 schema が許可済みなら不要 [未確認] |
| 変更 | `hooks/useActiveDispatch.ts` | レスポンス型に `isDraft: boolean` を追加 |
| 変更 | `hooks/useDispatchInProgressGuard.ts` | `isDraft` を考慮した active 判定への切替 |
| 変更 | `components/HomeClient.tsx` | バナー表示条件の見直し（active バナー / 下書きバナーの 2 系統表示） |
| 変更 | `__tests__/lib/dispatch/active-status.test.ts` | 新規テストケース: 帰社後 `isDraft === false` で true / `isDraft === true` で false |
| 変更 | `__tests__/components/dispatch/DispatchClient.test.tsx` | 出動記録ボタン押下で PATCH 呼び出し → 成功時遷移 / 失敗時遷移なし |
| 変更 | `__tests__/api/dispatches/cancel.test.ts` | 帰社後 `isDraft === false` でキャンセル成功 / `isDraft === true` で 409 |
| 変更 | `__tests__/api/dispatches/active.test.ts` | 帰社後 `isDraft === false` の dispatch がレスポンスに含まれる |

**実装手順（A〜D）**

#### A) `lib/dispatch/active-status.ts` シグネチャ拡張

1. 関数シグネチャを `(status, returnTime)` → `(status, returnTime, isDraft)` に変更
2. WORKING は真値条件に追加しない（**2026-05-05 ユーザー確認確定** / `lib/admin/status-derivation.ts` L15「schema にだけ存在するデッドコード」のため対象外。「作業中」UI ラベルは `ONSITE` + step=2 で実現済みのため既存ガードでカバー済み）
3. 帰社後 `isDraft === false` 条件を追加
4. JSDoc 更新（旧仕様の WORKING 排除コメントは**維持する**。WORKING を含めない方針が **2026-05-05 ユーザー確認**で確定したため、排除理由を新仕様準拠の表現に更新するのみ）
5. 旧シグネチャの呼び出し箇所をコンパイル時に検出させる（型エラーで漏れ防止）

#### B) `components/dispatch/DispatchClient.tsx` L1544 出動記録ボタン onClick 改修

1. 旧実装（`router.push(/dispatch/${dispatchId}/record)` のみ）を以下に置換:

   ```ts
   const handleClickRecord = async () => {
     try {
       const res = await fetch(`/api/dispatches/${dispatchId}`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ isDraft: true }),
       })
       if (!res.ok) {
         const body = await res.json().catch(() => ({}))
         alert(body?.error ?? '書類作成への遷移に失敗しました')
         return
       }
       router.push(`/dispatch/${dispatchId}/record`)
     } catch (e) {
       alert(e instanceof Error ? e.message : '書類作成への遷移に失敗しました')
     }
   }
   ```

2. **サイレント故障チェック準拠**: `res.ok` チェック必須・catch でユーザー通知必須・楽観的更新なし
3. オフライン時: `offlineFetch` ではなく素の `fetch` 使用（オフラインでドラフト立てを許可すると同期競合のリスクあり）。オフラインなら catch に落ちて alert 表示
4. SecondaryDispatchClient に同等ボタンが存在する場合は同様に修正（要 grep 確認）

#### C) `app/api/dispatches/[id]/cancel/route.ts` CANCELLABLE 条件拡張

1. 現行 `CANCELLABLE_STATUSES` 判定ロジックを Read で確認
2. 以下の条件を追加（疑似コード）:

   ```ts
   const isCancellable =
     // 既存: 現場対応中
     ['DISPATCHED','ONSITE','WORKING','TRANSPORTING'].includes(dispatch.status) ||
     (dispatch.status === 'COMPLETED' && dispatch.returnTime === null) ||
     // 新規（2026-05-05）: 帰社後・書類作成未着手
     (
       ['COMPLETED','RETURNED'].includes(dispatch.status) &&
       dispatch.returnTime !== null &&
       dispatch.isDraft === false
     )

   if (!isCancellable) {
     // 帰社後・書類作成済みは専用エラーメッセージ
     if (
       ['COMPLETED','RETURNED'].includes(dispatch.status) &&
       dispatch.isDraft === true
     ) {
       return NextResponse.json(
         { error: '書類作成中の案件はキャンセルできません。書類作成画面から操作してください' },
         { status: 409 }
       )
     }
     return NextResponse.json({ error: 'この案件はキャンセルできません' }, { status: 409 })
   }
   ```

3. 認可ロジック（隊員 vs 管理者）は既存のまま維持
4. テスト: 既存 cancel.test.ts に新ケース追加

#### D) 関連テスト更新

1. `__tests__/lib/dispatch/active-status.test.ts`:
   - 帰社後 `isDraft === false` で true
   - 帰社後 `isDraft === true` で false
   - WORKING を渡したら false を返すこと（WORKING 不採用方針のリグレッション検出用 / **2026-05-05 ユーザー確認確定**）
2. `__tests__/components/dispatch/DispatchClient.test.tsx`:
   - 出動記録ボタンクリック → PATCH 呼び出し
   - PATCH 成功 → router.push
   - PATCH 失敗（4xx/5xx）→ alert 表示・遷移なし
   - PATCH ネットワークエラー → catch 経由で alert
3. `__tests__/api/dispatches/cancel.test.ts`:
   - 帰社後 `isDraft === false` でキャンセル成功
   - 帰社後 `isDraft === true` で 409 + 専用メッセージ
4. `__tests__/api/dispatches/active.test.ts`:
   - 帰社後 `isDraft === false` の dispatch がレスポンスに含まれる
   - 帰社後 `isDraft === true` の dispatch は含まれない

**テスト方針**

- 単体: 上記 4 テストファイルを更新/追加
- 結合: HomeClient で「帰社後・isDraft=false → バナー表示」「isDraft=true → バナー非表示 or 下書きバナー表示」を検証
- E2E: 出動完了 → 帰社 → 戻るボタン → モーダル → キャンセル可能を実機確認

**完了条件**

- 上記 A〜D 全件完了
- `pnpm test` 全件 PASS（active-status / DispatchClient / cancel / active 関連）
- `pnpm build` 成功
- `pnpm lint` PASS
- サイレント故障チェック（§5）全項目 OK
- ユーザー実機検証（後述 Phase 6 O-5 新基準）PASS

**想定所要時間**: 4〜6 時間

**担当 CC**: implementer（テストは tester に並列委任可）

**依存する前 Phase**: Phase 5 完了（HomeClient バナー実装済み）

**リスク**

| リスク | 内容 | 回避策 |
|---|---|---|
| 既存 `isActiveDispatchStatus` 呼び出し箇所の引数漏れ | 第 3 引数 `isDraft` を渡し忘れ → 型エラー / 実行時 undefined | TypeScript の必須引数化で型レベル検出。既存呼び出し全箇所を grep で洗い出し |
| GET /api/dispatches/active の where 句との乖離 | 関数判定と DB クエリが食い違うとバナー誤表示 | 同じ Phase 内で両者を同時更新・テストで一致確認 |
| isDraft 更新の race condition | 出動記録ボタン連打で多重 PATCH | ボタン disabled 制御 + サーバ側で冪等処理（同じ値なら no-op） |
| 既存案件の `isDraft` デフォルト値 | 既存データは `isDraft: false`（schema default）。帰社済みの過去案件で active バナーが復活する懸念 | マイグレーションで「帰社済み（returnTime IS NOT NULL）かつ書類作成済み」の案件を `isDraft: true` にバックフィル。要否は Phase 5.5 着手時にデータ確認 |
| WORKING ステータスの扱い | 旧 `isActiveDispatchStatus` は WORKING を含まなかった（handover §K.2 設計判断）。新仕様で WORKING を含めるかユーザー確認が必要 | **対応不要（含めないことで確定 / 2026-05-05 ユーザー確認確定）**。WORKING は `lib/admin/status-derivation.ts` L15 で「schema にだけ存在するデッドコード」と明記、DB に書き込まれない予備値のため新シグネチャ対象外 |

**後続実装タスクへの引き継ぎ要約（A〜D）**

```
■ Phase 5.5 補強タスク（仕様変更 2026-05-05 対応）

【背景】
帰社後でも書類作成画面に入っていない（isDraft=false）状態ではガード継続
する仕様にユーザーが確定（2026-05-05）。出動記録ボタン押下を「書類作成
着手」の状態遷移点として扱う。

【作業 A】lib/dispatch/active-status.ts 拡張
  - シグネチャ: (status, returnTime) → (status, returnTime, isDraft)
  - 追加条件: COMPLETED/RETURNED && returnTime!==null && isDraft===false
  - GET /api/dispatches/active の where 句も同時更新

【作業 B】DispatchClient.tsx 出動記録ボタン onClick 改修
  - PATCH /api/dispatches/[id] で isDraft:true を送信
  - 成功時のみ router.push、失敗時は alert・遷移なし
  - 楽観的更新禁止（§5 準拠）
  - SecondaryDispatchClient にも同様の処理が必要なら同 Phase で対応

【作業 C】app/api/dispatches/[id]/cancel/route.ts CANCELLABLE 拡張
  - 帰社後 && isDraft===false もキャンセル可
  - 帰社後 && isDraft===true は 409（メッセージ専用）

【作業 D】テスト追加・修正
  - __tests__/lib/dispatch/active-status.test.ts
  - __tests__/components/dispatch/DispatchClient.test.tsx
  - __tests__/api/dispatches/cancel.test.ts
  - __tests__/api/dispatches/active.test.ts

【完了条件】
  pnpm test / pnpm build / pnpm lint すべて PASS
  実機で Phase 6 O-5 新基準（後述）の a/b/c が PASS

【依存】
  Phase 5（HomeClient バナー）完了済みであること
  Dispatch.isDraft フィールド（schema 既存・確認済み 2026-05-05）

【リスク監視】
  - 既存案件のバックフィル要否
  - WORKING ステータスは含めず確定（2026-05-05 ユーザー確認確定 / schema デッドコードのため対象外）
  - GET /active where 句と関数判定の整合性
```

---

### Phase 6: ブラウザバック・popstate・beforeunload 対策

**目的**: OS スワイプバック・ブラウザの戻るボタン・タブ閉じ・リロードに対しても進行中ガードを効かせる。

**変更ファイル一覧**

| 変更 | `hooks/useDispatchInProgressGuard.ts` | popstate / beforeunload ハンドラ実装の本体（Phase 2 で骨格は作成済み）|
| 変更 | 5画面 | フック呼び出し時の依存配列調整（既に Phase 3 で完了している想定） |

**実装手順**

1. **popstate 対策**: 5画面マウント時に `history.pushState(null, '', window.location.href)` を一度実行（仮想スタックエントリを積む）。`popstate` リスナで `inProgress === true` ならもう一度 `history.pushState(null, '', window.location.href)` を実行し、戻るを無効化。同時に `BackToHomeConfirmModal` を表示。
2. **beforeunload 対策**: `inProgress === true` のときのみ `window.addEventListener('beforeunload', handler)` を登録。`handler` は `e.preventDefault(); e.returnValue = ''` を実行。**注意**: モバイル Safari では beforeunload が発火しないケースがある（iOS の制約）。これは仕様として受容し §9 に残課題として記載。
3. **既存 `router.replace` (DispatchClient L489)** の影響確認: URL 書き換えのみで遷移ではないため、popstate イベントは発火しないはず。要動作確認。
4. **モーダル UI 統合**: `window.confirm` ではなく Phase 3 の `BackToHomeConfirmModal` を表示する。フック側に `setModalOpen` を渡すか、フック内で React Portal でモーダルをマウントするか設計判断。**推奨**: フックは `inProgress` と `attemptedExit` の bool を返し、5画面側でモーダル表示を制御。

**テスト方針**

- 手動: 実機（Android Chrome / iOS Safari / Desktop Chrome）で動作確認
- E2E: `page.goBack()` 等でブラウザバック動作を検証

**観察項目（実機検証 — handover §K 観察項目との対応）**

> 観察項目 O-1 〜 O-4 は handover (`docs/handover/2026-05-04-dispatch-floating-prevention.md` §K の検証マトリクス) の旧基準を継承する。**O-5 は 2026-05-05 ユーザー確定の新仕様により判定基準を反転する**。下記を新基準として扱い、handover §K 側の O-5 行も同期更新すること。

**O-5 観察項目（仕様変更 2026-05-05 ユーザー確定 — 判定基準反転）**

| 項目 | シナリオ | 旧基準（PASS / 〜2026-05-04） | 新基準（PASS / 2026-05-05〜） |
|---|---|---|---|
| O-5 | DispatchClient（帰社後・onsite step≥4 / transport step≥5）でのガード挙動 | ガード解除済み。確認モーダルなしでホームへ遷移できる | 下記 a / b / c の 3 サブケースを順に PASS することを必須とする |

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

**完了条件**

- ブラウザバック・スワイプバックでホームに戻れない
- タブ閉じ・リロードで beforeunload 警告（Desktop / Android のみ）
- iOS Safari の beforeunload 不発は §9 に記載のみ
- **O-5 新基準（a / b / c）すべて PASS**（旧基準は 2026-05-05 をもって失効）
- handover §K の検証マトリクス側 O-5 行も新基準に同期更新済み

**想定所要時間**: 3〜4時間（仕様変更により+1h）
**担当 CC**: implementer
**依存する前 Phase**: Phase 3（モーダル UI）+ Phase 5.5（isDraft 状態遷移）

---

### Phase 7: その他のホーム遷移6件への対策

**目的**: ヘッダー戻るボタン以外のホーム遷移経路にも進行中ガードを適用する。

**対象 6 件（調査レポート §2 から抽出）**

| # | 画面 | 場所 | 行 | 実装 |
|---|---|---|---|---|
| 1 | DispatchClient | 振替完了後 | L343 | `setTimeout(() => router.push('/'), 3000)` |
| 2 | ReportOnsiteClient | 完了/下書き保存後 | L335 | `window.location.href = '/'` |
| 3 | ReportTransportClient | 完了/下書き保存後 | L498 | `window.location.href = '/'` |
| 4 | RecordClient | 下書き保存後 | L370 | `window.location.href = '/'` |
| 5 | RecordClient | モーダル「下書き保存して戻る」 | L1041 | `router.push('/')` |
| 6 | RecordClient | モーダル「保存せずに戻る」 | L1059 | `router.push('/')` |

**実装手順**

1. **#1 振替完了後**: `setTimeout` 内で `inProgress` を再評価。振替完了 = TRANSFERRED 状態なので `inProgress=false` のはず（mapStatusToSubPhase で TRANSFERRED は active 外）。実装上は素通しで OK。**ただし `setTimeout` 中に隊員が画面を閉じても `setTimeout` は cleanup されないと暴走する**ため、useEffect の return cleanup で `clearTimeout` 必須。
2. **#2 / #3 / #4 完了/下書き保存後**: 保存成功時は status が COMPLETED/RETURNED 等で active 系を抜けているはず。`window.location.href = '/'` の前に `inProgress` を再評価し、active なら遷移を抑止（=保存後の状態が想定外＝バックエンド/UI 同期のサイレント故障）。サイレント故障防止のため、saving に成功しても status が想定通りでなければ遷移せずエラー表示。
3. **#5 RecordClient「下書き保存して戻る」**: PATCH 成功後 `router.push('/')`。dispatch.status は変わらない（draft フラグ更新のみ）。**この経路は本来「進行中だが下書きとして保存して戻る」業務フローなので、進行中ガードを通すと操作不能になる**。RecordClient は出動記録画面 = status は COMPLETED 以降のはず。「進行中（active）」判定では false になるはずだが、要動作確認。
4. **#6 RecordClient「保存せずに戻る」**: 同上。

**設計上の判断**

- 「進行中ガード = 戻れない」のルールは厳格に適用。ただし下書き保存後・完了後・振替後など **status 遷移を伴う成功フロー後はガード対象外**（status が active を抜けるため自動的にガードが解除される）。
- 「進行中なのに保存後遷移しようとしている」ケース＝バグなので、Phase 7 では各経路に「assert: inProgress === false で遷移する」のガードを追加し、想定外なら `console.error` + alert で停止する。

**テスト方針**

- 手動: 各 6 件の経路を順に通して、ガード動作・正常遷移を確認
- E2E: 振替完了 → 自動遷移を検証

**完了条件**

- 6 件すべてに対策実装
- サイレント故障チェックリスト（§5）が全 fetch で OK
- `pnpm build` PASS

**想定所要時間**: 2〜3時間
**担当 CC**: fixer（細かい修正のため）
**依存する前 Phase**: Phase 2 + Phase 3

---

### Phase 8: 動作確認シナリオの整備と smoke-test 反映

**目的**: 全 Phase 完了後の総合動作確認と、smoke-test チェックリストへの反映。

**変更ファイル一覧**

| 変更 | `docs/smoke-test-checklist.md` | 新規シナリオ追加（D-09 等） |
| 新規 | `docs/handover/2026-05-04-dispatch-floating-prevention-impl.md` | 実装完了引き継ぎ（既存 untracked ノートとは別ファイル） |

**実装手順**

1. §7 動作確認シナリオを smoke-test に転記
2. 実機検証（Android Chrome / iOS Safari / Desktop Chrome）
3. 浮き案件テストデータ（引き継ぎノート §F の `cmoqlpabf00038z5z6esgn94v`）を使った再現確認
4. ユーザー確認 → コミット・PR 作成

**完了条件**

- §7 全シナリオ PASS
- ユーザー承認

**想定所要時間**: 1〜2時間
**担当 CC**: implementer + ユーザー検証
**依存する前 Phase**: Phase 1〜7 すべて

---

### Phase 別合計

| Phase | 想定時間 | 担当 |
|---|---|---|
| 1 | 3〜4h | implementer / tester |
| 2 | 2〜3h | implementer |
| 3 | 4〜5h | implementer / fixer |
| 4 | 3〜4h | implementer |
| 5 | 3〜4h | implementer |
| **5.5（2026-05-05 仕様変更対応）** | **4〜6h** | **implementer / tester** |
| 6 | 3〜4h（仕様変更により +1h） | implementer |
| 7 | 2〜3h | fixer |
| 8 | 1〜2h | implementer + ユーザー |
| **合計** | **25〜35 時間** | |

総ステップ数: 約 40 ステップ（Phase 5.5 で +5 ステップ）

---

## §4 横断影響の確認（AGENTS.md「修正前チェックリスト」準拠）

### 4.1 該当機能のリクエストフロー全体（Client → SW → proxy → API → DB）

- **戻る操作（既存）**: Client `router.push('/')` → ネットワーク不要のクライアント遷移。SW・proxy は経由しない。**従って戻るブロックはクライアントのみで完結する。**
- **キャンセル操作（新規）**: Client `fetch('/api/dispatches/[id]/cancel', { method: 'POST' })` → SW（POST は素通し L59）→ proxy（401 ガード通過）→ API → Prisma → DB。標準フロー。
- **active 取得（新規）**: Client `fetch('/api/dispatches/active')` → SW（GET は networkOnly L69-71）→ オフライン時 503 + `X-SW-Offline: 1`。proxy（401）→ API → Prisma → DB。
- **採番（変更）**: 既存 POST `/api/dispatches` のトランザクション内のみ変更。クライアント側は無変更。

### 4.2 proxy.ts / middleware の認証ゲートへの影響

- **新設 2 ルート（`/api/dispatches/[id]/cancel`, `/api/dispatches/active`）**: `proxy.ts` の `PUBLIC_API_PREFIXES` に追加しない（認証必須）。L34-39 で 401 ガードを通過することを確認済み。
- **追加対応不要。** proxy.ts の修正は本計画に含めない。

### 4.3 Service Worker (`public/sw.js`) のキャッシュ・フォールバック挙動

- **POST `/cancel`**: SW 素通し（L59）。オンライン時のみ動作。オフライン時は fetch エラー → クライアント側で alert。`offlineFetch` を使わず素の `fetch` にする方針（§6 記載）。
- **GET `/active`**: SW networkOnly（L69-71）。オフライン時は 503 + `X-SW-Offline: 1`。`useActiveDispatch` 側で 503 をハンドリングし「進行中状態不明」のフォールバック表示（または何も表示しない）を選ぶ。**[未確認] バナー誤非表示のリスク**: 出動中なのにオフラインで API 取得できないとバナーが出ない → ユーザーがアシスタンスボタンを押せてしまう。§6 リスクで詳述。
- **対応**: `lib/local-active-dispatch-cache.ts`（新規、必要なら）を導入し、最後に取得した active 状態を localStorage / IndexedDB にキャッシュ。オフライン時はキャッシュからバナー表示。Phase 5 内で要否を判断（時間予算に応じて Phase 派生課題化）。

### 4.4 同パターンの呼び出し箇所の grep 全件洗い出し

- **`router.push('/')`**: 5画面で計 7 箇所（DispatchClient L343, L899; SecondaryDispatch L582; ReportOnsite L387; ReportTransport L550; RecordClient L1041, L1059）→ Phase 3, 7 でカバー
- **`window.location.href = '/'`**: 3 箇所（ReportOnsite L335; ReportTransport L498; RecordClient L370）→ Phase 7 でカバー
- **`POST /api/dispatches`**: DispatchClient L468 → 既存。本計画で挙動変更なし。
- **`PATCH /api/dispatches/[id]`**: DispatchClient（複数）, RecordClient（複数）, Report 系。**status を CANCELLED に変えるパスは本計画で新設の cancel ルート以外に発生させない**（VALID_STATUS_TRANSITIONS を非 cancel 経路では拡張しない）。

### 4.5 DB スキーマ（Prisma）の整合性

- `Dispatch.status: DispatchStatus` enum に `CANCELLED` 既存。スキーマ変更不要。
- `Dispatch.dispatchNumber` の `@@unique([tenantId, dispatchNumber])` は採番堅牢化により衝突リスクが既存より低減。マイグレーション不要。
- BreakRecord との連動は不要（出動キャンセル時に休憩を作る業務はない）。

---

## §5 サイレント故障防止（AGENTS.md 準拠）

### 5.1 新規 fetch 一覧

| # | 呼び出し箇所 | エンドポイント | メソッド | offlineFetch 使用 |
|---|---|---|---|---|
| 1 | `useActiveDispatch` | `/api/dispatches/active` | GET | 不使用（GET は素の fetch） |
| 2 | `CancelDispatchButton` | `/api/dispatches/[id]/cancel` | POST | **不使用**（オフライン時はキャンセル禁止に倒す） |

### 5.2 res.ok チェックの設計

- **#1 active 取得**: `if (!res.ok) { setError(...); return }`。サイレント失敗禁止。
- **#2 cancel**: `if (!res.ok) { alert(エラー文言); return }`。失敗時は modal 維持。

### 5.3 catch 句のユーザー通知

- **#1**: `console.error` + Banner 非表示（フェイルセーフ）。**alert は出さない**（ホーム画面で頻繁に出ると鬱陶しい）。
- **#2**: `alert(e.message ?? 'キャンセルに失敗しました')` 必須。

### 5.4 楽観的レスポンスの識別ヘッダ設計

- **#1 active GET**: 楽観的レスポンスは発生しない（offlineFetch 不使用 + GET）。
- **#2 cancel POST**: **楽観的レスポンスを意図的に発生させない**。`fetch` を直接使う。理由: キャンセルは取り消せない操作。オフライン時に楽観的に「キャンセル成功」を返してしまうと、ユーザーは戻れた気になるが DB は active のまま → サーバ送信失敗時にデータ整合性が崩れる。**オフライン時は明示的に「ネットワーク接続が必要です」と alert する。**

### 5.5 既存サイレント故障への対応（調査レポート §6.3）

- DispatchClient `handleCancelStep` (L810-816) は `res.ok` チェックなし。本計画外だが §8 派生課題として起票する。
- ReportOnsite/Transport L324-331 / L488-495 は `if (!reportRes.ok) throw new Error(...)` ありで OK。
- RecordClient L367 も OK。

---

## §6 リスクと回避策

### 6.1 採番ロジック変更による既存データへの影響

| リスク | 内容 | 回避策 |
|---|---|---|
| 既存 `count+1` で採番された番号と新方式の連続性 | 既存 DB に `001, 002, 003` がある状態で新方式に切り替え → 次は `004`。連続性は保たれる | テスト: 同日内に既存案件あり → 新規作成 → 番号連続性確認 |
| サフィックス番号（-2, -3, -T）の扱い | 既存 `siblingCount + 2` が CANCELLED 案件もカウントするかは要確認 | Phase 1 ステップ 2 で再確認。混入なら同方式に変更 |

### 6.2 VALID_STATUS_TRANSITIONS 変更による既存遷移への副作用

- **回避策**: 案 A（PATCH ルートには CANCELLED 遷移を追加しない）採用により、副作用ゼロ。

### 6.3 ブラウザバック対策の UX 副作用（誤検知で離脱不能）

| リスク | 回避策 |
|---|---|
| キャンセル後に `inProgress=false` 反映が遅延 → ガードが効きすぎて戻れない | キャンセル成功時に `setInProgress(false)` を即時呼ぶ + ガード解除を確認後に router.push |
| iOS Safari で `beforeunload` 不発 | 仕様として受容。バナー + キャンセルボタンで業務上カバー可能 |
| 仮想 popstate エントリの履歴汚染 | フック cleanup で適切に履歴を整理する。問題が出たら §9 に追記 |

### 6.4 Service Worker のキャッシュ古さによるバナー誤表示

- **リスク**: SW が古いビルドの HTML をキャッシュしている場合、新バナーが描画されない → ユーザーが古い UI で操作
- **回避策**: ビルド毎の SW バージョン更新が `public/sw.js` で機能しているか動作確認（既存仕様の範疇）。**[未確認]** 本計画外。

### 6.5 オフライン時の active 取得不能

- **リスク**: オフライン時に GET `/api/dispatches/active` が 503 → バナー出ない → ユーザーがアシスタンスボタンを誤押下
- **回避策**: localStorage キャッシュで last-known active 状態を保持する追加実装（Phase 5 内で時間があれば実施、なければ §8 派生課題化）

### 6.6 報告画面・出動記録画面での active 判定の業務妥当性

- **リスク**: dispatch.status が COMPLETED && returnTime IS NOT NULL の場合（=帰社済み）、status-derivation では非 active。報告画面に到達する時点でこの状態のはず。**しかし帰社後でも報告未提出なら「進行中」として戻れないようにすべきか業務的に未確認** → §9 残課題

### 6.7 同時 active の防御（多重出動防止）

- **リスク**: 既存 POST `/api/dispatches` は active 案件があっても新規作成可能（要確認）。本計画で「ホーム画面でアシスタンスボタンを抑止」しても URL 直打ち / オフライン同期等で多重発行の余地が残る
- **回避策**: POST `/api/dispatches` 側にも「自分に active な Dispatch があれば 409 Conflict」のガードを追加（**§8 派生課題として推奨**）

---

## §7 動作確認シナリオ

### 7.1 戻るボタンブロック

1. **DispatchClient**: 出動押下 → 戻るボタン → モーダル表示 → ホームに戻れない
2. **DispatchClient**: 現着押下 → 戻るボタン → 同上
3. **DispatchClient**: 搬送開始押下 → 同上
4. **DispatchClient**: 完了押下（onsite） → 同上
5. **SecondaryDispatchClient**: 各 step で同上
6. **ReportOnsiteClient**: 報告作成中（dispatch active）に戻る → モーダル
7. **ReportTransportClient**: 同上
8. **RecordClient**: 既存モーダル + 進行中ガードの統合動作

### 7.2 ブラウザバック・履歴 API

9. **Android Chrome**: 出動中にスワイプバック → ブロック
10. **Desktop Chrome**: 出動中にブラウザ戻るボタン → ブロック
11. **iOS Safari**: 出動中にスワイプバック → ブロック（[未確認] iOS の制約あり）
12. **Desktop Chrome**: 出動中にタブ閉じ → beforeunload 警告

### 7.3 案件キャンセル

13. **DispatchClient**: 出動押下 → キャンセルボタン → 確認 → status=CANCELLED → ホーム遷移
14. **5画面それぞれ**: 同上
15. **隊員ロール（admin@…）の他人案件**: cancel API 直接呼び出しで 403/404
16. **管理者ロール**: 他人案件もキャンセル可能

### 7.4 再ログイン時の復帰

17. 出動中に別タブでログアウト → 再ログイン → ホームに進行中バナー → クリックで出動画面復帰
18. 別端末でログイン → 同上
19. オフライン時のバナー挙動（[未確認] §6.5 実装次第）

### 7.5 採番の堅牢性

20. 同日内に 001, 002 作成 → 002 をキャンセル → 003 作成（新方式）→ 003 が衝突しない
21. 同日内に 001 作成 → キャンセル → 002 作成 → ユニーク制約違反なし

### 7.6 多重出動防止

22. ホーム画面で active バナー表示中 → アシスタンスボタングレーアウト確認
23. 休憩ボタン非表示確認
24. URL 直打ちで `/dispatch?assistanceId=...` に飛ぶケースの動作（[未確認] §6.7）

### 7.7 既存機能の非破壊確認

25. 振替完了後の自動遷移（DispatchClient L343）が動作
26. 報告兼請求項目の保存後遷移が動作
27. RecordClient の下書きモーダル「保存して戻る」「保存せず戻る」が動作

---

## §8 派生課題（別タスク扱い）

### 8.1 写真・入力途中値のブラウザ削除耐性

- 現状: 入力途中の値は IndexedDB / localStorage に保存されているか調査未着手
- 推奨: `lib/dispatch/draft-storage.ts` 等の実装有無を調査 → 永続化されていなければ別タスクで起票

### 8.2 既存 `handleCancelStep` のサイレント故障

- 調査レポート §6.3: DispatchClient L810-816 で `res.ok` チェックなし。SW 503 経由で楽観的応答 200 が返れば動くが、実サーバ 4xx/5xx で UI と DB が乖離する
- 別タスクで `res.ok` チェックを追加

### 8.3 多重出動防止のサーバ側ガード

- §6.7 のとおり、POST `/api/dispatches` に「自分に active な Dispatch があれば 409」のガードを追加すべき
- 別タスクで起票

### 8.4 オフライン時の active 状態キャッシュ

- §6.5 のとおり、localStorage / IndexedDB に last-known active 状態を保持する実装
- Phase 5 内で時間があれば実施、なければ別タスク

### 8.5 振替案件 -T のキャンセル可否

- 現状: 振替案件 -T で出動・現着の取消ボタンは非表示（DispatchClient L1061, L1101）。「案件キャンセル」ボタンは別軸
- **業務上、振替案件を受けた隊員がキャンセルできるかは未確認**
- 別タスクでユーザー確認

### 8.6 SW キャッシュバージョン管理の動作確認

- §6.4 のとおり、新ビルド配信時に古い SW がキャッシュした HTML を使い続けないか
- 別タスクで動作確認

---

## §9 残された未確認事項（ユーザー再確認が必要）

### 9.0 ユーザー確定事項（2026-05-04 miyagawakiyomi 確認済み）

以下は本計画書作成後、Super との対話でユーザー確定した事項。Phase 着手時に**変更不可**の前提として扱う。

| # | 確定内容 | 影響 Phase |
|---|---|---|
| A | **書類作成画面（ReportOnsiteClient / ReportTransportClient / RecordClient）はガード適用外**。現場対応中（DispatchClient / SecondaryDispatchClient）のみガード対象 | Phase 3, 6, 7 |
| B | 振替済み（status=TRANSFERRED）の元案件は本タスクの「案件キャンセル」対象外。9.2 を確定 | Phase 4 |
| C | キャンセル可能な状態は「現場で動いている案件のみ」= DISPATCHED / ONSITE / WORKING / TRANSPORTING / COMPLETED && returnTime IS NULL。それ以外（STANDBY / 終端各種）は対象外 | Phase 1, 4 |
| D | 派生課題の振り分け確定: (3) 多重出動サーバ側ガード・(4) active キャッシュ・(6) SW キャッシュ動作確認 → **本タスクに組み込み**。(1) 写真/入力途中値の永続化耐性・(2) handleCancelStep のサイレント故障 → **別タスク化**（本タスク完了後に引き継ぎノートに起票）。(5) 振替案件 -T のキャンセル可否 → **業務確認継続（9.3 として残す）** | Phase 1, 5, 8 |
| E | 9.6 アシスタンスボタン抑止: planner 推奨（グレーアウト + 押下時 alert）採用 | Phase 5 |
| F | 9.7 バナー遷移先: MVP は出動画面トップ（`/dispatch/[id]`）採用。深いリンクは派生課題化 | Phase 5 |
| **A'** | **9.0-A 例外（2026-05-05 ユーザー確定）**: 帰社後（returnTime IS NOT NULL）かつ `dispatch.isDraft === false` の状態は「書類作成未着手」とみなし、DispatchClient / SecondaryDispatchClient のガードを継続する。出動記録ボタン押下時に `dispatch.isDraft = true` を立て、その時点以降は §9.0-A 原則に従いガード対象外（書類作成画面ではホームに戻れる）とする。詳細は **Phase 5.5 補強タスク** 参照 | Phase 5.5, 6 |

> **9.0-A 例外の補足（2026-05-05 ユーザー確定）**
>
> §9.0-A の原則「書類作成画面はガード適用外」は維持する。ただし「現場対応の終端 → 書類作成への遷移点」を厳密化するため、以下の状態遷移を新たに定義する:
>
> - **`isDraft === false`**: 出動は完了したが、隊員はまだ書類作成画面に入っていない（帰社直後の状態）。この状態では DispatchClient のガードを継続し、戻るボタン押下で「進行中の案件があります」モーダルを表示する。ホームに戻るには「案件キャンセル」が必要。
> - **`isDraft === true`**: 出動記録ボタンが押下され、書類作成のドラフトが立った状態。この時点以降は §9.0-A 原則に従いガード対象外。書類作成画面（RecordClient 等）ではホームに戻れる。
>
> 状態遷移の起点は **DispatchClient L1544 付近の出動記録ボタン onClick** で、`PATCH /api/dispatches/[id]` により `isDraft: true` を送信する。送信成功後にのみ `router.push(/dispatch/${dispatchId}/record)` を実行する（楽観的更新は行わない）。

### 9.1 報告画面・記録画面の進行中ガード適用範囲（**確定: 9.0-A により適用外**）

- ~~質問~~ → 確定: 書類作成画面（ReportOnsite/Transport/RecordClient）はガード適用外
- 理由: 帰社後の事務作業は複数案件並行処理が業務上必要なため、ガードはむしろ業務阻害
- Phase 3 のスコープを「現場対応2画面（DispatchClient / SecondaryDispatchClient）」に絞る

### 9.2 振替後の元案件キャンセル可否（**確定: 9.0-B により対象外**）

- ~~質問~~ → 確定: TRANSFERRED 状態は本タスクのキャンセル対象外
- 実装: TRANSFERRED 状態ではキャンセルボタン非表示

### 9.3 振替案件 -T のキャンセル可否（§8.5 と関連・継続課題）

- **質問**: 振替案件 -T を引き受けた隊員がキャンセルできるか？
- **状態**: 業務確認継続。本タスクでは「-T 状態ではキャンセルボタン非表示」で実装し、別タスクで業務確認後に有効化を判断

### 9.4 採番堅牢化のスコープ

- **質問**: 主案件番号（YYYYMMDDNNN）だけでなく、2次搬送 (-2/-3) と振替 (-T/-T2) サフィックスの採番も堅牢化すべきか？
- **推奨**: Phase 1 ステップ 2 で実装内容を確認したうえでユーザー判断（影響なければ堅牢化、影響あれば既存維持）

### 9.5 iOS Safari の beforeunload 不発の許容

- **質問**: iOS Safari で beforeunload が発火しない仕様を許容するか？業務上致命的か？
- **推奨**: 「バナーとキャンセルボタンで業務カバー可能」として許容（§6.3）

### 9.6 ホーム画面のアシスタンスボタン抑止方法

- **質問**: グレーアウトのみか、押下で「進行中の案件があります」alert を出すか？
- **推奨**: グレーアウト + 押下時 alert の両方を実装（操作性 + 説明性の両立）

### 9.7 進行中バナーからの遷移先

- **質問**: バナークリック時の遷移先は出動画面トップ（`/dispatch/[id]`）でよいか？subPhase が ONSITE/TRANSPORTING の場合に深いリンク（report 等）に飛ぶべきか？
- **推奨**: MVP では出動画面トップのみ。出動画面側で step を復元する既存ロジック（L60-69 `getInitialStep`）に任せる

---

## 補足: 各 Phase の依存グラフ

```
Phase 1 (API)
  ├─→ Phase 2 (フック)
  │     ├─→ Phase 3 (戻るボタン制御)
  │     │     ├─→ Phase 4 (キャンセル UI)
  │     │     ├─→ Phase 6 (popstate/beforeunload)
  │     │     └─→ Phase 7 (その他遷移6件)
  │     └─→ Phase 5 (進行中バナー)
  │           └─→ Phase 5.5 (2026-05-05 仕様変更対応 / isDraft 状態遷移)
  │                 ├─→ Phase 6 (O-5 新基準の前提)
  │                 └─→ Phase 7 (isDraft 反映後の遷移整合性)
  └─→ Phase 4 (cancel API 直接依存)

Phase 8 ← Phase 1〜7 すべて（Phase 5.5 含む）
```

並列化可能箇所:
- Phase 3 と Phase 5 は Phase 2 完了後に並列実行可能（worktree 推奨）
- Phase 6 と Phase 7 は Phase 3 完了後に並列実行可能（ただし Phase 5.5 が先行することが望ましい — O-5 新基準と isDraft 反映が前提）
- Phase 5.5 は Phase 5 完了後に実施。Phase 6 / Phase 7 と並列化する場合は仕様競合に注意

---

## 注記

- 本計画書は untracked のまま残し、Phase 単位でユーザー承認を得てから次へ進む
- 各 Phase 完了時に「サイレント故障チェック」「修正前チェックリスト」を実施し、結果を本計画書に追記する
- 確定済み 5 論点の方針は変更不可。新たな疑問は §9 に追記する
