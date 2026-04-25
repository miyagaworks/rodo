# shimoda ハードコード調査レポート

調査対象: `~/Projects/rodo/app/`（`node_modules` / `.next` / `.git` を除外）
調査日: 2026-04-20
調査方法: Grep + ファイル精読（修正なし・観察のみ）

---

## サマリー

- 総検出件数: **約 38 件**（下記分類の合計。スタイル用途だけの色定数は除外）
- 分類別件数:
  - 文言・表示テキスト: **6 件**
  - 業務ロジック / 地理的バイアス: **3 件**
  - アセット（画像・ロゴ等）: **9 件**
  - 設定・メタデータ（ブランド "RODO"／DB名／CSP 等）: **13 件**
  - メール・通知: **0 件（該当機能なし、後述）**
  - DBシード・マスターデータ: **7 件**
- 緊急度の高い項目: **6 件**
  - `prisma/seed.ts` 全体（tenant-id / emails / 名前 / 車両番号ハードコード）
  - `components/HomeClient.tsx` `DISPLAY_CONFIG`（アシスタンス略称と静的ロゴパスを直結）
  - `components/dispatch/NumberPlateInput.tsx` 地名マスタ（広島県を先頭に固定）
  - `components/dispatch/RecordClient.tsx` HIGHWAY_OPTIONS（中国地方の高速を優先）
  - `public/logos/assistance-*.{svg,png}`（6社分のロゴ同梱）
  - `app/layout.tsx` / `manifest.json` の `RODO` ブランド（複数テナントに提供する際のサービス名の扱いを先に決める必要あり）

---

## 詳細（分類別）

### 1. 文言・表示テキスト

| ファイル | 行 | 内容 | 対処方針候補 |
|---|---|---|---|
| app/layout.tsx | 7 | `title: 'RODO'` | **D/C 要判断**: サービスブランドとして全テナント共通で固定するのか、テナントごとに変えるのか未決。SaaS 化する場合は「RODO（サービス名）」と「株式会社◯◯（テナント名）」を分けてテンプレート化する必要あり |
| app/layout.tsx | 8 | `description: 'ロードサービス専用アプリ'` | **D**: サービス共通文言（ロードサービス業界向けであることが前提）。ただしテナントキャッチコピーを上書き可にするなら A |
| public/manifest.json | 2-4 | `name/short_name/description` に `RODO` / `ロードサービス専用アプリ` | **D/C 要判断**: PWA マニフェスト。テナントごとに PWA を出す想定なら環境変数化 or ビルド時生成 |
| app/login/page.tsx | 131 | `© Senrigan {year}` | **D**: 運営元（開発会社）。テナントではないので残してよい。ただし「提供: Senrigan × 運営: 株式会社XXX」のような表示が将来必要なら再検討 |
| components/dispatch/ConfirmationClient.tsx | 407-411, 443, 530, 559, 577 | 作業確認書の注意事項・免責文言（計約 6 つの定型文）「不可抗力、経年劣化…」「バッテリージャンピング作業時における電装系…」「貴重品…」「保管料金が発生する場合がございます。」「保管中における、盗難・損傷については責任を負いかねます」「専門的な作業もございますので…」「作業が異常なく完了し、外観及び内装に新たな傷がない…」「今回の作業はあくまで応急処置です。早急に修理工場での点検・整備を…」 | **要判断（B か A）**: ロードサービス業界で概ね共通する文言だが、法務表現はテナント（＝運営会社）名義の文書のため、テナントごとに差し替え可能にすべきか判断が必要。初期値は共通テンプレート、テナント側で上書き可という設計が有力 |
| components/dispatch/ConfirmationClient.tsx | 534-541 | `"会社名"` プレースホルダ（入庫先担当者の会社名入力欄）／550 担当者様ご署名 | **D**: 入力フィールドのラベルであり、shimoda固有ではない |

### 2. 業務ロジック / 地理的バイアス

| ファイル | 行 | 内容 | 対処方針候補 |
|---|---|---|---|
| components/dispatch/NumberPlateInput.tsx | 10-46 | `PLATE_REGIONS` — ナンバープレート地名マスタ。`'広島県'` を最初のグループに置き、`'中国地方'` を 2 番目に配置。その後に関西・四国・九州…と続き、"その他全国" に残り全地方を詰め込む構成 | **要判断（A または C）**: 全国 134 地名は業務上必要。順序バイアス（広島県を先頭に固定）は shimoda 所在地を優先する UX なので、テナントごとに「優先表示地域」を設定できるようにする（Tenant.homeRegion 等）か、全国を五十音順にフラット化するかは要判断 |
| components/dispatch/RecordClient.tsx | 70-83 | `HIGHWAY_OPTIONS` — 高速道路マスタ。広島高速 1〜5 号線、広島自動車道、山陽自動車道 等、中国地方を先頭に 30 数件ハードコード | **要判断（B/A）**: 全国高速道路を網羅しているが「広島周辺が先頭」の並びは shimoda 向け。マスタをテナントスコープの DB テーブルに移す（A）、または全国共通マスタとして並び順だけテナント別にする（B + テナント設定）が候補 |
| components/HomeClient.tsx | 16-28 | `DISPLAY_CONFIG` — `displayAbbreviation` と静的ロゴパスを直結するマッピング。`'PA'/'SC'/'プライム'/'AWP'/'東京海上'/'グラン'` の 6 固定キー。`?? { logo: a.logoUrl ?? '' }` のフォールバックはあるが、ロゴ表示サイズ・テキストサイズの微調整は固定 6 キーでのみ有効 | **A**: DB の `Assistance.logoUrl` は既にテナントスコープのため、フォールバックに一本化し `DISPLAY_CONFIG` は撤廃するのが素直。ロゴサイズ等のスタイル微調整も DB 側（例: `displayStyle` JSON カラム）に持たせるか、CSS 側で汎用化する |

### 3. アセット（画像・ロゴ・PDF 等）

| ファイル | 行 | 内容 | 対処方針候補 |
|---|---|---|---|
| public/logos/assistance-pa.svg | — | アシスタンス PA 専用ロゴ | **A**: DB の `Assistance.logoUrl` が既存。shimoda 用の同梱をやめ、テナント導入時に Blob ストレージ等へアップロードする運用に移す |
| public/logos/assistance-sc.svg | — | アシスタンス SC 専用ロゴ | 同上 A |
| public/logos/assistance-prime.svg | — | プライム専用ロゴ | 同上 A |
| public/logos/assistance-awp.svg | — | AWP 専用ロゴ | 同上 A |
| public/logos/assistance-tokiomarine.png | — | 東京海上専用ロゴ | 同上 A |
| public/logos/assistance-gran.svg | — | グラン専用ロゴ | 同上 A |
| public/rodo-logo.svg | — | サービスブランド "RODO" ロゴ | **D/C 要判断**: サービスロゴなので共通扱いが自然だが、テナントごとに外観を差し替える要件があれば A |
| public/rodo-login-logo.svg, public/rodo-square-logo.svg | — | 同上の派生 | 同上 |
| public/icon-192.png, public/icon-512.png, public/favicon.ico | — | PWA アイコン / favicon | **D/C 要判断**: RODO ブランドアイコン。テナントごとに配信するなら C（環境変数 or ビルド時切替） |

補足: `public/icons/*` は「出動」「完了」「帰庫」等の汎用アイコン（SVG）で、shimoda 固有ではない。`public/icons/google-logo.svg` は Google ログインボタン用。

### 4. 設定・メタデータ

| ファイル | 行 | 内容 | 対処方針候補 |
|---|---|---|---|
| package.json | 2 | `"name": "app"` | **D**: 一般名で shimoda 要素なし |
| package.json | 全体 | `description`/`author` は未設定 | **D** |
| .env.example | 1 | `DATABASE_URL=".../rodo_dev"` | **C**: DB 名に `rodo` を含むが運用値。サービス共通 |
| public/sw.js | 3-5, 11-13 | `CACHE_NAME = 'rodo-v4'` 等 3 キャッシュ名＋プリキャッシュ対象に `rodo-*.svg` を列挙 | **C/D**: サービス名由来で shimoda ではないが、PWA をテナント別に切るならスコープ分離が必要 |
| lib/offline-db.ts | 57 | `DB_NAME = 'rodo-offline'` | **C/D**: 同上（IndexedDB 名）。ブランド改名時は要変更 |
| components/RodoLogoAnimated.tsx | 1-73 | ロゴアニメーションコンポーネント。"RODO" を前提にしたカスタム SVG パス | **D/C 要判断**: サービスロゴ。差し替え前提なら A/C |
| components/HomeClient.tsx | 97 | `<img src="/rodo-logo.svg" alt="RODO" />` | **D/C 要判断** |
| components/dispatch/ReportOnsiteClient.tsx | 352 | `<img src="/rodo-square-logo.svg" alt="RODO" />` | **D/C 要判断** |
| components/dispatch/ReportTransportClient.tsx | 454 | 同上 | **D/C 要判断** |
| app/layout.tsx | 20-28 | `theme-color: '#1C2948'`、CSP で `https://static.bizdeli.net / app.bizdeli.net` を許可、外部 script として `bizdeli.umd.js` を読み込み | **D**: BizDeli は住所検索 SaaS（全国共通）で shimoda 固有ではない。`NEXT_PUBLIC_BIZDELI_API_KEY` は既に環境変数化済み |
| next.config.ts | 21-23 | CSP に BizDeli ドメイン列挙 | 同上 D |
| public/manifest.json | 7 | `theme_color: '#1C2948'`, `background_color: '#C6D8FF'` | **D/C 要判断**: 紺＋淡青は現 UI のブランドパレット。テナント別テーマ化する方針なら A か CSS 変数 |
| 各コンポーネント（241 箇所・20 ファイル） | — | インラインスタイルに `#1C2948` / `#C6D8FF` / `#71A9F7` / `#D7AF70` 等の色値直書き | **要判断（A or D）**: shimoda 固有色ではないが、テナント別テーマを将来提供するなら CSS 変数化が必要。現段階では D（共通デザイン）で運用可 |

### 5. メール・通知

| ファイル | 行 | 内容 | 対処方針候補 |
|---|---|---|---|
| — | — | メール送信 / プッシュ通知 / SMS の実装は**見つからなかった**（Grep で該当機能・テンプレートなし） | — |

補足: NextAuth は認証のみでメール通知機能は未使用。`offline-fetch.ts` / `sw.js` の "オフラインです" 等のトースト的メッセージはサービス共通文言で shimoda 要素なし。

### 6. DBシード・マスターデータ

| ファイル | 行 | 内容 | 対処方針候補 |
|---|---|---|---|
| prisma/seed.ts | 17, 20 | `id: 'tenant-shimoda'` を where / create に固定 | **A**: 初期テナント作成用。SaaS 化時はテナント登録 API/管理画面経由で動的採番（cuid）に変更 |
| prisma/seed.ts | 21 | `name: '株式会社Shimoda'` | **A** |
| prisma/seed.ts | 28, 32, 42, 46, 59, 63, 147-152 | 管理者/隊員のメール `admin@shimoda.example.com` / `member1@shimoda.example.com` / `member2@shimoda.example.com` およびコンソール出力 | **A**: テナント別シード or 環境変数化（テナント登録フローで動的生成） |
| prisma/seed.ts | 47, 64 | `name: '田中太郎' / '鈴木次郎'` | **A**: デモデータ。shimoda 以外のテナントでは不要 |
| prisma/seed.ts | 50, 67 | `vehicleNumber: '広島 330 あ 1234' / '広島 330 い 5678'` | **A**: 広島ナンバーは shimoda 拠点前提 |
| prisma/seed.ts | 51-53, 68-70 | `monthlySalary: 250000 / 230000`, `overtimeRate: 1500 / 1400`, `transportationAllowance: 10000 / 8000` | **A**: ダミー給与データ。テナント個別 |
| prisma/seed.ts | 75-118 | アシスタンス 6 社（PA/SC/プライム/AWP/東京海上/グラン）＋関連損保会社のマスタ挿入 | **B/A**: Assistance と InsuranceCompany は既にテナントスコープ（`tenantId` 列あり）。shimoda が扱う 6 社の構成は他テナントで異なる可能性が高いため、初期シードではなく管理画面から登録する運用が望ましい。初期サンプルとして残すならテンプレート化（テナント作成時に選択式でコピー） |
| prisma/seed.ts | 13-14 | `adminPassword = 'admin1234'`, `memberPassword = 'member1234'` | **C**: 既に環境変数 `SEED_ADMIN_PASSWORD` / `SEED_MEMBER_PASSWORD` でオーバーライド可。デフォルト値はそのまま残してよい |

補足: `schema.prisma` では `Tenant` / `User` / `Assistance` / `InsuranceCompany` / `Dispatch` / `BreakRecord` 等すべて `tenantId` で分離済み。モデル側のマルチテナント基盤は整備済みで、ハードコードは主にシードと UI 側に集中している。

---

## 対処方針の類型

- **A. Tenant テーブルに移行**: 会社名・ロゴ等、テナントごとに必ず異なる情報
  - 該当: seed.ts の全行（会社名、メール、名前、車両番号、給与）、`public/logos/assistance-*`、HomeClient.tsx の `DISPLAY_CONFIG`（DB の logoUrl に寄せる）
- **B. フィーチャーフラグ化**: 使う/使わないが分かれる機能
  - 該当: （現時点では該当する機能フラグ候補はほぼなし。「達成賞」のような分岐機能は**存在しなかった**）
  - 将来候補: アシスタンスのシード（テナント作成時に「標準 6 社セットを適用」フラグで選択）
- **C. 環境変数化**: サービス共通で運営側が管理する値
  - 該当: `DATABASE_URL`、`NEXT_PUBLIC_BIZDELI_API_KEY`、`NEXTAUTH_*`、`GOOGLE_CLIENT_*`、`SEED_*_PASSWORD`（すでに環境変数化済み）。PWA マニフェスト／favicon をテナント別に出す場合はビルド時差替え
- **D. そのままで良い**: 全テナント共通
  - 該当: ACCIDENT_DETAILS / BREAKDOWN_DETAILS（事故・故障分類）、現場完了項目（ドーリー・現場清掃・養生・再積込）、バッテリー作業明細、`作業確認書` ラベル、「出動」「完了」「帰庫」等のステータスラベル、BizDeli 連携（全国住所検索）、© Senrigan 表記、tenant 分離済みの API 実装

---

## 所見

### ハードコードの分布傾向

- **shimoda という固有文字列**はほぼ **`prisma/seed.ts` に集中**している（1 ファイルのみ）。リテラル検出のみ見れば軽症。
- しかし**実害の大きい暗黙的ハードコードはシード以外に 3 箇所**ある:
  1. `components/HomeClient.tsx` の `DISPLAY_CONFIG` — シード由来の略称 6 キーに紐づく静的ロゴを UI 層で再保持しており、DB 移行の意図と矛盾する二重管理
  2. `components/dispatch/NumberPlateInput.tsx` の `PLATE_REGIONS` — 広島県を先頭に固定
  3. `components/dispatch/RecordClient.tsx` の `HIGHWAY_OPTIONS` — 中国地方の高速を先頭に列挙
- サービスブランド `RODO` は多数の場所に出現するが、これは「テナントをまたぐサービス名」なので shimoda ハードコードとは扱いが別。ただし**マルチテナントでブランドを分ける計画があるなら先に方針を固める**必要がある（layout / manifest / sw.js / offline-db / 各ロゴ参照）。
- 「達成賞」「shimoda 固有の業務フロー」「会社固有の連絡先（住所・電話・FAX）」は**一切検出されなかった**。当初の仮説にあった特殊業務は現状未実装と判断してよい（将来追加時に B フラグで個別対応）。

### 汎用化の難易度が高そうな項目

1. **アシスタンス略称と UI レイアウト微調整の紐付け**（HomeClient.tsx の DISPLAY_CONFIG）
   - ロゴ画像は DB 側にあるが、「ロゴの max-height」「テキストサイズ」「テキスト位置の微ずらし (textNudge)」など表示スタイル調整がコードに固定されている。デザイン崩れを許容しない限り、DB スキーマ拡張（display 設定 JSON 列など）か、または「略称ごと個別指定」をやめる割り切りが必要。
2. **`作業確認書` 本文の免責定型文**（ConfirmationClient.tsx 407-411, 443, 530, 559, 577）
   - 法務文書のため、テナントごとに法務確認が発生しうる。文言マスタをテナントスコープに持たせる場合、バージョン管理・監査要件が出てくる。初期は共通文言 + 上書き可にとどめるのが現実的。
3. **地名マスタ・高速道路マスタ**（NumberPlateInput / RecordClient）
   - データそのものは全国網羅。並び順だけテナント所在地で優先表示する要件が発生した場合、優先表示ロジック追加が必要。DB 化する価値までは低いので、`Tenant.homeRegion` のような設定＋クライアント側ソートで十分か要判断。

### 先に手を付けるべき項目の推奨順

1. **`prisma/seed.ts` を「シード」から「テナント作成フロー」に分離**（最優先・A）
   - テナント追加 API（管理者向け）を先に設計。既存 shimoda テナントは現状のシードで作られているため、新規テナント作成時にアシスタンス標準セットを適用するかを選べるフロー（B フラグ）を同時に用意。
2. **`components/HomeClient.tsx` DISPLAY_CONFIG のデータ駆動化**（A）
   - DB の `Assistance.logoUrl` に寄せ、UI コードから略称ハードコードを排除。新テナントが独自略称を使っても壊れない設計に。
3. **サービスブランドの扱いを確定**（C / D）
   - 「RODO は SaaS 全体の名称で不変」なのか「ホワイトラベル提供もある」のかを先に決定。後者なら manifest / layout / sw.js / offline-db / 各種ロゴ参照をまとめて環境変数またはテナント設定駆動にリファクタ。前者なら現状維持で良い。
4. **地名・高速マスタの並び順**（要判断）
   - 広島優先のまま運用できるか、他テナント導入時に実害が出るかは営業上の判断。並び順バイアスは軽微なので最後でも可。
5. **作業確認書の法務文言のマスタ化**（B/A）
   - マルチテナント化後、テナントから「自社の文言にしてほしい」と言われた時点で DB 化。先回りすると仕様が過剰になるのでペンディング可。

### 禁止事項として改めて指摘

- `components/HomeClient.tsx:16-28` の `DISPLAY_CONFIG` は、ユーザ向けコメントに「DB データ + 表示設定を合成」と書かれているが、実態は「6 キーの静的マッピングを DB 値で上書きしない」二重管理になっている。次にアシスタンスマスタを修正する際にここも同時修正できるよう、TODO コメントを付けるだけでも技術的負債の追跡になる（今回の修正対象外）。
- `prisma/seed.ts` は本番環境ガードあり（`NODE_ENV === 'production'` で終了）だが、`tenant-shimoda` という hard id でシードしているため、将来別の tenant を同時運用する開発環境で取り違えるリスクがある。テナント作成は seed.ts ではなく管理 API に一本化するのが安全。

---

## 未調査・不明点

- **`node_modules/next/dist/docs/`** — Next.js 16 独自ドキュメントがあるとのことだが、shimoda ハードコード検出とは無関係のため今回は開いていない。「proxy.ts（≒ middleware.ts 代替）」の命名規約については `app/proxy.ts` の存在を確認したが内容精査はスコープ外。
- **CI/デプロイ設定（`.github/` 等）** — プロジェクトルートに `.github/` が見えないため未調査。デプロイ設定に shimoda ドメインや環境名が含まれている可能性はあるが、このアプリディレクトリ内には検出なし。
- **ログ出力のテナント識別** — `auth.ts` は tenantId をセッションに載せているが、アプリログに shimoda の tenantId が直接書き込まれる箇所はなし。テレメトリを後から追加する場合の識別は cuid 経由。
