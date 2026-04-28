-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "scheduledSecondaryAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Dispatch_tenantId_status_scheduledSecondaryAt_idx" ON "Dispatch"("tenantId", "status", "scheduledSecondaryAt");
