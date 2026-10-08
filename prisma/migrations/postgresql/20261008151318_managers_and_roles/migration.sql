/*
  Accounts are now created by their owner (superadmin -> manager -> player): there
  is no self-registration, and no e-mail address or phone number is collected.
  Roles gain MANAGER; ADMIN is renamed SUPERADMIN (rows follow the rename).

  Warnings:

  - You are about to drop the column `email` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerifiedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.
*/

-- AlterEnum
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'SUPERADMIN';
ALTER TYPE "Role" ADD VALUE 'MANAGER';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'CREDIT_TRANSFER';

-- DropIndex
DROP INDEX "User_email_key";
DROP INDEX "User_phone_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "email",
DROP COLUMN "emailVerifiedAt",
DROP COLUMN "phone";

-- AlterTable
ALTER TABLE "PlayerProfile" ALTER COLUMN "firstName" SET DEFAULT '',
ALTER COLUMN "lastName" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "User_createdById_idx" ON "User"("createdById");
