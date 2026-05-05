-- 過去の帰社済み・非active系ステータスの Dispatch を isDraft=true にバックフィル。
-- 2026-05-05 ユーザー確定の仕様変更（Phase 5.5）により、isDraft=false は
-- 「帰社後・書類作成未着手」として active 扱いされるが、過去案件は旧フローで
-- isDraft=false のまま帰社・書類作成済みのため、ガード対象外に確定する。
--
-- 関連: docs/plans/dispatch-floating-prevention.md Phase 5.5 リスク欄
UPDATE "Dispatch"
SET "isDraft" = true
WHERE "status" IN ('COMPLETED', 'RETURNED', 'STORED', 'TRANSFERRED', 'CANCELLED')
  AND "returnTime" IS NOT NULL
  AND "isDraft" = false;
