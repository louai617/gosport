/*
  Accounts are now created by their owner (superadmin -> manager -> player): there
  is no self-registration, and no e-mail address or phone number is collected.
  Roles gain MANAGER; ADMIN is renamed SUPERADMIN.

  Warnings:

  - You are about to drop the column `email` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerifiedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlayerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "dateOfBirth" DATETIME,
    "countryCode" TEXT NOT NULL DEFAULT 'TN',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "kycStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "ageDeclaredAt" DATETIME,
    "termsAcceptedAt" DATETIME,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "wageringBlocked" BOOLEAN NOT NULL DEFAULT false,
    "withdrawalsBlocked" BOOLEAN NOT NULL DEFAULT false,
    "restrictionReason" TEXT,
    "restrictedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlayerProfile" ("ageDeclaredAt", "countryCode", "createdAt", "dateOfBirth", "displayName", "firstName", "id", "kycStatus", "lastName", "locale", "marketingOptIn", "restrictedAt", "restrictionReason", "termsAcceptedAt", "updatedAt", "userId", "wageringBlocked", "withdrawalsBlocked") SELECT "ageDeclaredAt", "countryCode", "createdAt", "dateOfBirth", "displayName", "firstName", "id", "kycStatus", "lastName", "locale", "marketingOptIn", "restrictedAt", "restrictionReason", "termsAcceptedAt", "updatedAt", "userId", "wageringBlocked", "withdrawalsBlocked" FROM "PlayerProfile";
DROP TABLE "PlayerProfile";
ALTER TABLE "new_PlayerProfile" RENAME TO "PlayerProfile";
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");
CREATE INDEX "PlayerProfile_kycStatus_idx" ON "PlayerProfile"("kycStatus");
CREATE INDEX "PlayerProfile_countryCode_idx" ON "PlayerProfile"("countryCode");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PLAYER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME,
    "suspendedAt" DATETIME,
    "suspendedReason" TEXT,
    "createdById" TEXT,
    CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "createdById", "failedLoginCount", "id", "lastLoginAt", "lockedUntil", "mustChangePassword", "passwordHash", "role", "status", "suspendedAt", "suspendedReason", "updatedAt", "username") SELECT "createdAt", "createdById", "failedLoginCount", "id", "lastLoginAt", "lockedUntil", "mustChangePassword", "passwordHash", "role", "status", "suspendedAt", "suspendedReason", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "User_lastLoginAt_idx" ON "User"("lastLoginAt");
CREATE INDEX "User_createdById_idx" ON "User"("createdById");

-- The former single "ADMIN" role is the SUPERADMIN. (SQLite stores enums as text.)
UPDATE "User" SET "role" = 'SUPERADMIN' WHERE "role" = 'ADMIN';
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
