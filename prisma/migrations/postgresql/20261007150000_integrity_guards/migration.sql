-- Integrity guards the Prisma schema language cannot express. Mirrors
-- prisma/migrations/sqlite (which has to use triggers throughout because SQLite
-- cannot add CHECK constraints after table creation).

-- A wallet may never go negative, whatever the application does.
ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_balance_nonnegative" CHECK ("balance" >= 0);

-- Every ledger row must be internally consistent: after = before + amount.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_balance_consistent"
  CHECK ("balanceAfter" = "balanceBefore" + "amount");

-- The ledger is append-only. A row may not be deleted, and once it has left
-- PENDING it may not change at all. A PENDING row may move to a final status
-- but its money, identity and ordering columns are frozen from insert.
CREATE FUNCTION "sportgo_ledger_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger rows cannot be deleted';
  END IF;

  IF OLD."status" <> 'PENDING'
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."balanceBefore" IS DISTINCT FROM OLD."balanceBefore"
     OR NEW."balanceAfter" IS DISTINCT FROM OLD."balanceAfter"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."walletId" IS DISTINCT FROM OLD."walletId"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'ledger rows are append-only';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Transaction_append_only"
BEFORE UPDATE OR DELETE ON "Transaction"
FOR EACH ROW EXECUTE FUNCTION "sportgo_ledger_guard"();

-- The audit trail cannot be edited or erased, by anyone, through any path.
CREATE FUNCTION "sportgo_audit_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit log rows are immutable';
END;
$$;

CREATE TRIGGER "AuditLog_immutable"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "sportgo_audit_guard"();

-- TRUNCATE bypasses row triggers, so it is blocked separately.
CREATE FUNCTION "sportgo_truncate_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE is not permitted on an append-only table';
END;
$$;

CREATE TRIGGER "AuditLog_no_truncate"
BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION "sportgo_truncate_guard"();

CREATE TRIGGER "Transaction_no_truncate"
BEFORE TRUNCATE ON "Transaction"
FOR EACH STATEMENT EXECUTE FUNCTION "sportgo_truncate_guard"();
