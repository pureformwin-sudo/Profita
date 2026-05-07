-- Add items JSONB column to invoices and estimates tables
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
