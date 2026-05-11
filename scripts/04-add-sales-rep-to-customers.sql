-- Add sales_rep_id column to customers table to track who added them
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES employees(id);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_customers_sales_rep_id ON customers(sales_rep_id);
