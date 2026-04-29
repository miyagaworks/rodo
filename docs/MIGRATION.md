# Prisma Migration 運用手順

## 背景

本プロジェクトは 2026-04-27 まで `prisma db push` 運用で開発されており、`prisma/migrations/` フォルダが存在しなかった。Phase 1（管理者ダッシュボード機能）で `Dispatch.billedAt` 列を追加するため、`prisma migrate dev` への移行が必要となり、ベースライン migration `0_init` を生成した。

`0_init` は **既存スキーマ全体の CREATE TABLE 文** を含むため、本番 DB に対して実行されるとテーブルが破壊される。本番反映時には特別な手順が必要。

## ローカル開発時の手順

通常通り:

```bash
# スキーマ変更後
npx prisma migrate dev --name <変更内容を表す名前>
```

`git pull` 後、初回の `prisma migrate dev` 実行時に shadow DB に対して `0_init` が再実行されるが、shadow DB は一時的なものなので問題ない。

## 本番反映時の必須手順（重要）

本番 DB には既存スキーマが存在するため、`0_init` を実行してはいけない。以下の順序で実施すること:

```bash
# 1. ベースライン 0_init を「適用済み」とマークする（SQL は実行されない）
npx prisma migrate resolve --applied 0_init

# 2. 新規 migration のみを流す
npx prisma migrate deploy
# → add_billed_at_to_dispatch のみが ALTER TABLE で適用される
```

手順1を省略すると、`prisma migrate deploy` が `0_init` の `CREATE TABLE` を実行しようとし、エラーまたは既存テーブル破壊を引き起こす。

## 確認方法

手順実行前に、本番反映される SQL を確認:

```bash
npx prisma migrate diff \
  --from-url $PRODUCTION_DATABASE_URL \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

出力に `ALTER TABLE "Dispatch" ADD COLUMN "billedAt"` のみ含まれることを確認。`CREATE TABLE` が含まれていたら手順1を実行していない可能性が高い。

## ロールバック時の注意

`add_billed_at_to_dispatch` を巻き戻す場合、`billedAt` 列を持つ既存データの請求済み記録が消失する。ロールバック前に必ずバックアップを取ること。

```sql
-- 巻き戻し用 SQL（手動実行）
DROP INDEX "Dispatch_tenantId_billedAt_idx";
ALTER TABLE "Dispatch" DROP COLUMN "billedAt";
```

巻き戻し後、`prisma migrate resolve --rolled-back add_billed_at_to_dispatch` で migration の状態を整える。

## 今後新しい migration を追加する場合

`0_init` には触らない。`npx prisma migrate dev --name <新しい変更名>` で新しい migration を追加するだけで良い。
