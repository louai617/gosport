-- Integrity guards the Prisma schema language cannot express.
--
-- SQLite cannot add CHECK constraints after table creation, so the same rules
-- are expressed as triggers. The PostgreSQL migration uses real CHECK
-- constraints plus equivalent triggers — see prisma/migrations/postgresql.

-- A wallet may never go negative, whatever the application does.
CREATE TRIGGER "Wallet_balance_nonnegative_insert"
BEFORE INSERT ON "Wallet"
WHEN NEW."balance" < 0
BEGIN
  SELECT RAISE(ABORT, 'wallet balance cannot be negative');
END;

CREATE TRIGGER "Wallet_balance_nonnegative_update"
BEFORE UPDATE OF "balance" ON "Wallet"
WHEN NEW."balance" < 0
BEGIN
  SELECT RAISE(ABORT, 'wallet balance cannot be negative');
END;

-- Every ledger row must be internally consistent: after = before + amount.
CREATE TRIGGER "Transaction_balance_consistent"
BEFORE INSERT ON "Transaction"
WHEN NEW."balanceAfter" <> NEW."balanceBefore" + NEW."amount"
BEGIN
  SELECT RAISE(ABORT, 'ledger row is not balance-consistent');
END;

-- The ledger is append-only. A row may not be deleted, and once it has left
-- PENDING it may not change at all. A PENDING row may move to a final status
-- but its money, identity and ordering columns are frozen from insert.
CREATE TRIGGER "Transaction_no_delete"
BEFORE DELETE ON "Transaction"
BEGIN
  SELECT RAISE(ABORT, 'ledger rows cannot be deleted');
END;

CREATE TRIGGER "Transaction_append_only"
BEFORE UPDATE ON "Transaction"
WHEN OLD."status" <> 'PENDING'
  OR NEW."amount" IS NOT OLD."amount"
  OR NEW."balanceBefore" IS NOT OLD."balanceBefore"
  OR NEW."balanceAfter" IS NOT OLD."balanceAfter"
  OR NEW."type" IS NOT OLD."type"
  OR NEW."userId" IS NOT OLD."userId"
  OR NEW."walletId" IS NOT OLD."walletId"
  OR NEW."reference" IS NOT OLD."reference"
  OR NEW."idempotencyKey" IS NOT OLD."idempotencyKey"
  OR NEW."createdAt" IS NOT OLD."createdAt"
BEGIN
  SELECT RAISE(ABORT, 'ledger rows are append-only');
END;

-- The audit trail cannot be edited or erased, by anyone, through any path.
CREATE TRIGGER "AuditLog_no_update"
BEFORE UPDATE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'audit log rows are immutable');
END;

CREATE TRIGGER "AuditLog_no_delete"
BEFORE DELETE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'audit log rows are immutable');
END;
