-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "acknowledgementNo" TEXT,
ADD COLUMN     "layerLevel" INTEGER,
ADD COLUMN     "receiverBankName" TEXT,
ADD COLUMN     "receiverIfsc" TEXT,
ADD COLUMN     "senderBankName" TEXT,
ADD COLUMN     "senderIfsc" TEXT,
ADD COLUMN     "sourceSheet" TEXT;

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "acknowledgementNo" TEXT NOT NULL,
    "withdrawalType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3),
    "accountNumber" TEXT,
    "location" TEXT,
    "atmTerminalId" TEXT,
    "deviceId" TEXT,
    "referenceId" TEXT,
    "sourceSheet" TEXT NOT NULL,
    "highRiskFlag" BOOLEAN NOT NULL DEFAULT false,
    "bankId" TEXT,
    "caseId" TEXT NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldAction" (
    "id" TEXT NOT NULL,
    "acknowledgementNo" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3),
    "status" TEXT,
    "remarks" TEXT,
    "sourceSheet" TEXT NOT NULL,
    "bankId" TEXT,
    "caseId" TEXT NOT NULL,

    CONSTRAINT "HoldAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAction" (
    "id" TEXT NOT NULL,
    "acknowledgementNo" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT,
    "responseTimeHours" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3),
    "remarks" TEXT,
    "sourceSheet" TEXT NOT NULL,
    "bankId" TEXT,
    "caseId" TEXT NOT NULL,

    CONSTRAINT "BankAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ifsc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAnalysis" (
    "id" TEXT NOT NULL,
    "acknowledgementNo" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "layers" JSONB NOT NULL,
    "banksInvolved" JSONB NOT NULL,
    "moneyTrail" JSONB NOT NULL,
    "timeline" JSONB NOT NULL,
    "withdrawalIntelligence" JSONB NOT NULL,
    "recovery" JSONB NOT NULL,
    "risk" JSONB NOT NULL,
    "patternInsights" JSONB NOT NULL,
    "bankInsights" JSONB NOT NULL,
    "caseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bank_name_ifsc_key" ON "Bank"("name", "ifsc");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAnalysis_acknowledgementNo_key" ON "CaseAnalysis"("acknowledgementNo");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAnalysis_caseId_key" ON "CaseAnalysis"("caseId");

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldAction" ADD CONSTRAINT "HoldAction_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldAction" ADD CONSTRAINT "HoldAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAction" ADD CONSTRAINT "BankAction_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAction" ADD CONSTRAINT "BankAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAnalysis" ADD CONSTRAINT "CaseAnalysis_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
