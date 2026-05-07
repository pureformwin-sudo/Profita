-- Add new columns to income table
ALTER TABLE income ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'Paid';
ALTER TABLE income ADD COLUMN IF NOT EXISTS job_id uuid;

-- Add new columns to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'Cash';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurrence text DEFAULT 'none';

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  phone text,
  address text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  date date NOT NULL,
  job_type text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  expenses numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'Scheduled',
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Add foreign key from income to jobs (if job_id column exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'income_job_id_fkey'
  ) THEN
    ALTER TABLE income ADD CONSTRAINT income_job_id_fkey 
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Enable RLS on customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for customers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'customers_select_own') THEN
    CREATE POLICY customers_select_own ON customers FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'customers_insert_own') THEN
    CREATE POLICY customers_insert_own ON customers FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'customers_update_own') THEN
    CREATE POLICY customers_update_own ON customers FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'customers_delete_own') THEN
    CREATE POLICY customers_delete_own ON customers FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Enable RLS on jobs
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for jobs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jobs_select_own') THEN
    CREATE POLICY jobs_select_own ON jobs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jobs_insert_own') THEN
    CREATE POLICY jobs_insert_own ON jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jobs_update_own') THEN
    CREATE POLICY jobs_update_own ON jobs FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jobs_delete_own') THEN
    CREATE POLICY jobs_delete_own ON jobs FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
