-- Script 34: Enrich expenses for real business accounting (ADDITIVE ONLY).
-- Every column is nullable or has a safe default so all 38 existing rows are
-- untouched and keep behaving exactly as before.

-- Who was paid + why (business substantiation).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_purpose text;

-- Tax treatment is ALWAYS manual. Never auto-set to deductible.
-- Values: 'unreviewed' | 'likely_deductible' | 'not_deductible' | 'ask_accountant'
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_treatment text NOT NULL DEFAULT 'unreviewed';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_note text;

-- Transaction type keeps credit-card-bill payments / transfers OUT of expense
-- totals so money isn't double-counted. Existing rows default to a real expense.
-- Values: 'business_expense' | 'transfer'
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS transaction_type text NOT NULL DEFAULT 'business_expense';

-- Optional links to the job / customer the expense relates to.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

-- Receipt / document attachments. Array of { url, pathname, name, size, contentType, uploadedAt }.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Helpful indexes for the new filters (safe if they already exist).
CREATE INDEX IF NOT EXISTS idx_expenses_transaction_type ON expenses(transaction_type);
CREATE INDEX IF NOT EXISTS idx_expenses_tax_treatment ON expenses(tax_treatment);
CREATE INDEX IF NOT EXISTS idx_expenses_job_id ON expenses(job_id);
CREATE INDEX IF NOT EXISTS idx_expenses_customer_id ON expenses(customer_id);
