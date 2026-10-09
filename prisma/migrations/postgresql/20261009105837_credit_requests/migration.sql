-- CreateEnum
CREATE TYPE "CreditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CreditRequest" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" TEXT,
    "status" "CreditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "transactionId" TEXT,

    CONSTRAINT "CreditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditRequest_managerId_status_createdAt_idx" ON "CreditRequest"("managerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CreditRequest_playerId_createdAt_idx" ON "CreditRequest"("playerId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditRequest" ADD CONSTRAINT "CreditRequest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRequest" ADD CONSTRAINT "CreditRequest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
