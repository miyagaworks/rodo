# P0-13 緊急ロールバック SQL

作成日: 2026-04-29
対象: P0-13 マイグレーション `20260429043511_change_signature_to_blob_url`

設計書 10.2 節 (Level 2 スキーマロールバック) に基づく緊急用 SQL を保管する。
**本 SQL は通常運用では適用しない**。本番障害時のみ、宮川氏 + super-agent の合意のもと手動で `psql` から実行する。

---

## 適用判断基準

- 本番デプロイ後、署名フィールドへの書込が `value too long` 等で失敗し続ける
- アプリケーションが Level 1 (Vercel Instant Rollback) で旧コードに戻ったが、列タイプが `varchar(2048)` のままだと旧コード（DataURL 直書き）が動作しないとき
- shimoda 本番運用開始前であれば即時適用、運用後は影響範囲を super-agent と協議のうえ判断

## ロールバック手順

```sh
# 1. 本番 DB に直接接続
psql "$PRODUCTION_DATABASE_URL"

# 2. 以下の SQL をトランザクションで実行
```

```sql
BEGIN;

ALTER TABLE "WorkConfirmation" ALTER COLUMN "customerSignature" TYPE TEXT;
ALTER TABLE "WorkConfirmation" ALTER COLUMN "shopSignature" TYPE TEXT;
ALTER TABLE "WorkConfirmation" ALTER COLUMN "postApprovalSignature" TYPE TEXT;

-- 確認: 列タイプが text に戻ったこと
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'WorkConfirmation'
  AND column_name IN ('customerSignature', 'shopSignature', 'postApprovalSignature');

COMMIT;
```

## 注意

- 本 SQL を適用すると Prisma migration history との不整合が発生する。
  ロールバック後に再度 P0-13 をリリースする際は、再 migration を生成する必要がある。
- 既に Vercel Blob にアップロードされた URL は DB 列に保持されたまま。
  逆変換（URL → DataURL 再書き込み）は行わない。
- 本ファイルは Git 管理されるが、PR には migration として含めない（設計書 10.2 / プロンプト指示に従う）。
