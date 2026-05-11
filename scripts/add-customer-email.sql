-- Add email column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
