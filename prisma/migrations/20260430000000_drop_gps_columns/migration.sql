-- GPS API 連携の中止に伴い、Dispatch テーブルから GPS 4 列を削除する。
-- 背景:
--   当初 GPS API 連携を計画していたが、API 利用料が高額で費用対効果が薄く中止決定。
--   現場では SmartDrive 等のシガーソケット型 GPS 機器を継続利用するが、これらは
--   外部アプリで位置確認するものであり rodo アプリとは一切連携しない。
--   よって rodo アプリ内の GPS 関連実装は全層から完全削除する。
--
-- 注意:
--   本マイグレーションを適用すると、既存レコードの dispatchGpsLat/Lng / arrivalGpsLat/Lng
--   は完全に失われる。テスト環境のみで運用しており、過去データの保持要件は無し。
-- AlterTable
ALTER TABLE "Dispatch" DROP COLUMN "dispatchGpsLat";
ALTER TABLE "Dispatch" DROP COLUMN "dispatchGpsLng";
ALTER TABLE "Dispatch" DROP COLUMN "arrivalGpsLat";
ALTER TABLE "Dispatch" DROP COLUMN "arrivalGpsLng";
