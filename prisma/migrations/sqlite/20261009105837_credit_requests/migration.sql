-- CreateTable
CREATE TABLE "CreditRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "transactionId" TEXT,
    CONSTRAINT "CreditRequest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CreditRequest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CreditRequest_managerId_status_createdAt_idx" ON "CreditRequest"("managerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CreditRequest_playerId_createdAt_idx" ON "CreditRequest"("playerId", "createdAt");
