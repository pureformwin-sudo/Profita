-- Add CRM workflow: Customer → Estimate → Job → Invoice → Payment
-- This adds the estimate_id column to jobs table for linking accepted estimates to jobs

-- Add estimate_id column to jobs table (nullable, since jobs can be created without estimates)
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES estimates(id) ON DELETE SET NULL;

-- Add invoice_id column to jobs table for reverse lookup (the invoice created from this job)
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_jobs_estimate_id ON jobs(estimate_id);
CREATE INDEX IF NOT EXISTS idx_jobs_invoice_id ON jobs(invoice_id);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
