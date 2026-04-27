-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "billedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Dispatch_tenantId_billedAt_idx" ON "Dispatch"("tenantId", "billedAt");
