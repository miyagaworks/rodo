
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "DispatchType" AS ENUM ('ONSITE', 'TRANSPORT');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('STANDBY', 'DISPATCHED', 'ONSITE', 'WORKING', 'TRANSPORTING', 'COMPLETED', 'STORED', 'RETURNED', 'CANCELLED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HighwayDirection" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "SituationType" AS ENUM ('ACCIDENT', 'BREAKDOWN');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('DIRECT', 'STORAGE');

-- CreateEnum
CREATE TYPE "ParkingLocation" AS ENUM ('EMERGENCY_PARKING', 'SHOULDER', 'DRIVING_LANE');

-- CreateEnum
CREATE TYPE "EtcPhase" AS ENUM ('DISPATCH_TO_ARRIVAL', 'COMPLETION_TO_RETURN');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessDayStartMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "passwordHash" TEXT,
    "image" TEXT,
    "vehicleId" TEXT,
    "monthlySalary" INTEGER,
    "overtimeRate" INTEGER,
    "transportationAllowance" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assistance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayAbbreviation" TEXT NOT NULL,
    "logoUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assistance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceCompany" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assistanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dispatchNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assistanceId" TEXT NOT NULL,
    "type" "DispatchType" NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'STANDBY',
    "vehicleId" TEXT,
    "departureOdo" INTEGER,
    "arrivalOdo" INTEGER,
    "transportStartOdo" INTEGER,
    "completionOdo" INTEGER,
    "returnOdo" INTEGER,
    "dispatchTime" TIMESTAMP(3),
    "arrivalTime" TIMESTAMP(3),
    "completionTime" TIMESTAMP(3),
    "returnTime" TIMESTAMP(3),
    "dispatchGpsLat" DOUBLE PRECISION,
    "dispatchGpsLng" DOUBLE PRECISION,
    "arrivalGpsLat" DOUBLE PRECISION,
    "arrivalGpsLng" DOUBLE PRECISION,
    "address" TEXT,
    "highwayName" TEXT,
    "highwayDirection" "HighwayDirection",
    "kiloPost" DOUBLE PRECISION,
    "customerName" TEXT,
    "vehicleName" TEXT,
    "plateRegion" TEXT,
    "plateClass" TEXT,
    "plateKana" TEXT,
    "plateNumber" TEXT,
    "situationType" "SituationType",
    "situationDetail" TEXT,
    "workStartTime" TIMESTAMP(3),
    "workEndTime" TIMESTAMP(3),
    "workDuration" INTEGER,
    "canDrive" BOOLEAN,
    "deliveryType" "DeliveryType",
    "memo" TEXT,
    "isHighway" BOOLEAN NOT NULL DEFAULT false,
    "weather" TEXT,
    "trafficControl" BOOLEAN,
    "parkingLocation" "ParkingLocation",
    "areaIcName" TEXT,
    "insuranceCompanyId" TEXT,
    "transportStartTime" TIMESTAMP(3),
    "parentDispatchId" TEXT,
    "isSecondaryTransport" BOOLEAN NOT NULL DEFAULT false,
    "transferStatus" "TransferStatus",
    "transferRequestedAt" TIMESTAMP(3),
    "transferredFromId" TEXT,
    "transferredToId" TEXT,
    "originalType" "DispatchType",
    "typeChangedAt" TIMESTAMP(3),
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchEtc" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "phase" "EtcPhase" NOT NULL,
    "highwayName" TEXT NOT NULL,
    "direction" "HighwayDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchEtc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchPhoto" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "departureOdo" INTEGER,
    "arrivalOdo" INTEGER,
    "transportStartOdo" INTEGER,
    "recoveryDistance" DOUBLE PRECISION,
    "transportDistance" DOUBLE PRECISION,
    "returnDistance" DOUBLE PRECISION,
    "completionOdo" INTEGER,
    "returnOdo" INTEGER,
    "recoveryHighway" INTEGER,
    "transportHighway" INTEGER,
    "returnHighway" INTEGER,
    "totalHighway" INTEGER,
    "departurePlaceName" TEXT,
    "arrivalPlaceName" TEXT,
    "transportPlaceName" TEXT,
    "transportShopName" TEXT,
    "transportPhone" TEXT,
    "transportAddress" TEXT,
    "transportContact" TEXT,
    "transportMemo" TEXT,
    "primaryCompletionItems" JSONB,
    "primaryCompletionNote" TEXT,
    "secondaryCompletionItems" JSONB,
    "secondaryCompletionNote" TEXT,
    "primaryAmount" INTEGER,
    "secondaryAmount" INTEGER,
    "storageType" TEXT,
    "storageRequired" BOOLEAN,
    "totalConfirmedAmount" INTEGER,
    "billingContactMemo" TEXT,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkConfirmation" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preApprovalChecks" JSONB,
    "customerSignature" TEXT,
    "customerName" TEXT,
    "customerDate" TIMESTAMP(3),
    "vehicleType" TEXT,
    "registrationNumber" TEXT,
    "workContent" TEXT,
    "shopCompanyName" TEXT,
    "shopContactName" TEXT,
    "shopSignature" TEXT,
    "postApprovalCheck" BOOLEAN NOT NULL DEFAULT false,
    "postApprovalSignature" TEXT,
    "postApprovalName" TEXT,
    "batteryDetails" JSONB,
    "notes" TEXT,
    "shareToken" TEXT,
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "pauseTime" TIMESTAMP(3),
    "resumeTime" TIMESTAMP(3),
    "totalBreakMinutes" INTEGER,
    "dispatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_idx" ON "Vehicle"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_plateNumber_key" ON "Vehicle"("tenantId", "plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "Assistance_tenantId_idx" ON "Assistance"("tenantId");

-- CreateIndex
CREATE INDEX "InsuranceCompany_tenantId_idx" ON "InsuranceCompany"("tenantId");

-- CreateIndex
CREATE INDEX "InsuranceCompany_assistanceId_idx" ON "InsuranceCompany"("assistanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_transferredFromId_key" ON "Dispatch"("transferredFromId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_transferredToId_key" ON "Dispatch"("transferredToId");

-- CreateIndex
CREATE INDEX "Dispatch_tenantId_idx" ON "Dispatch"("tenantId");

-- CreateIndex
CREATE INDEX "Dispatch_userId_idx" ON "Dispatch"("userId");

-- CreateIndex
CREATE INDEX "Dispatch_assistanceId_idx" ON "Dispatch"("assistanceId");

-- CreateIndex
CREATE INDEX "Dispatch_status_idx" ON "Dispatch"("status");

-- CreateIndex
CREATE INDEX "Dispatch_isDraft_idx" ON "Dispatch"("isDraft");

-- CreateIndex
CREATE INDEX "Dispatch_vehicleId_idx" ON "Dispatch"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_tenantId_dispatchNumber_key" ON "Dispatch"("tenantId", "dispatchNumber");

-- CreateIndex
CREATE INDEX "DispatchEtc_dispatchId_idx" ON "DispatchEtc"("dispatchId");

-- CreateIndex
CREATE INDEX "DispatchPhoto_dispatchId_idx" ON "DispatchPhoto"("dispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_dispatchId_key" ON "Report"("dispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkConfirmation_dispatchId_key" ON "WorkConfirmation"("dispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkConfirmation_shareToken_key" ON "WorkConfirmation"("shareToken");

-- CreateIndex
CREATE INDEX "BreakRecord_userId_idx" ON "BreakRecord"("userId");

-- CreateIndex
CREATE INDEX "BreakRecord_tenantId_idx" ON "BreakRecord"("tenantId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assistance" ADD CONSTRAINT "Assistance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCompany" ADD CONSTRAINT "InsuranceCompany_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCompany" ADD CONSTRAINT "InsuranceCompany_assistanceId_fkey" FOREIGN KEY ("assistanceId") REFERENCES "Assistance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_assistanceId_fkey" FOREIGN KEY ("assistanceId") REFERENCES "Assistance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_insuranceCompanyId_fkey" FOREIGN KEY ("insuranceCompanyId") REFERENCES "InsuranceCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_parentDispatchId_fkey" FOREIGN KEY ("parentDispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_transferredFromId_fkey" FOREIGN KEY ("transferredFromId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchEtc" ADD CONSTRAINT "DispatchEtc_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchPhoto" ADD CONSTRAINT "DispatchPhoto_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkConfirmation" ADD CONSTRAINT "WorkConfirmation_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakRecord" ADD CONSTRAINT "BreakRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakRecord" ADD CONSTRAINT "BreakRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakRecord" ADD CONSTRAINT "BreakRecord_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

