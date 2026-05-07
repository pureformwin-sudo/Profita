-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  pay_type TEXT NOT NULL DEFAULT 'hourly' CHECK (pay_type IN ('hourly', 'per_job', 'percentage')),
  pay_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job workers - links employees to jobs with their earnings
CREATE TABLE IF NOT EXISTS job_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  hours_worked DECIMAL(5,2),
  amount_earned DECIMAL(10,2) NOT NULL DEFAULT 0,
  paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, employee_id)
);

-- Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_workers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employees
CREATE POLICY "Users can view their own employees"
  ON employees FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own employees"
  ON employees FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own employees"
  ON employees FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own employees"
  ON employees FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for job_workers (based on job ownership)
CREATE POLICY "Users can view job workers for their jobs"
  ON job_workers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_workers.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert job workers for their jobs"
  ON job_workers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_workers.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can update job workers for their jobs"
  ON job_workers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_workers.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete job workers for their jobs"
  ON job_workers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_workers.job_id AND jobs.user_id = auth.uid()
  ));

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_workers_employee ON job_workers(employee_id);
CREATE INDEX IF NOT EXISTS idx_job_workers_job ON job_workers(job_id);
CREATE INDEX IF NOT EXISTS idx_job_workers_paid ON job_workers(paid);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);
