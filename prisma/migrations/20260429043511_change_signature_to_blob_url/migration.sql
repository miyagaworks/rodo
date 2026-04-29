-- P0-13: 署名 3 列を Vercel Blob URL 専用に切り替え。
-- 旧: PNG DataURL を `text` で直接格納
-- 新: Vercel Blob HTTPS URL を `varchar(2048)` で格納
--
-- 注意:
--   このマイグレーションを適用する前に、scripts/migrate-signatures-to-blob.ts --apply で
--   既存 DataURL レコードを 0 件にする必要がある（>2048 文字でこのマイグレーションが失敗するため）。
--   詳細: docs/plans/p0-13-signature-blob-migration.md 7.3 節
-- AlterTable
ALTER TABLE "WorkConfirmation" ALTER COLUMN "customerSignature" SET DATA TYPE VARCHAR(2048);
ALTER TABLE "WorkConfirmation" ALTER COLUMN "shopSignature" SET DATA TYPE VARCHAR(2048);
ALTER TABLE "WorkConfirmation" ALTER COLUMN "postApprovalSignature" SET DATA TYPE VARCHAR(2048);
