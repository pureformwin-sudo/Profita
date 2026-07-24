-- Link processing-fee expenses back to the originating payment, and guarantee
-- at most one processing-fee expense per payment (idempotency backstop).
-- Fully additive and safe to re-run.

-- 1. Add nullable payment_id to expenses (only fee expenses will set this).
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS payment_id uuid;

-- 2. FK to payments. ON DELETE SET NULL so deleting/refunding a payment does
--    not delete the expense row — it can be reconciled/handled explicitly later.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'expenses_payment_id_fkey'
      AND table_name = 'expenses'
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_payment_id_fkey
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Partial unique index: at most one expense may link to a given payment.
--    This is the hard guarantee against duplicate processing-fee expenses,
--    even under concurrent/re-save conditions.
CREATE UNIQUE INDEX IF NOT EXISTS expenses_payment_id_unique
  ON expenses (payment_id)
  WHERE payment_id IS NOT NULL;

-- 4. Backfill: link any previously auto-created processing-fee expenses to
--    their payment via the marker text written in notes ("... for payment <id>").
UPDATE expenses e
SET payment_id = p.id
FROM payments p
WHERE e.payment_id IS NULL
  AND e.category = 'Processing Fees'
  AND e.notes LIKE '%for payment ' || p.id::text
  AND NOT EXISTS (
    SELECT 1 FROM expenses e2 WHERE e2.payment_id = p.id
  );
