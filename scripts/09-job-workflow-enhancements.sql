-- Job Workflow Enhancements
-- Adds fields for enhanced job tracking: time slots, paid amount, and expanded statuses

-- Add new columns to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS end_time text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;

-- Update status check constraint to allow new statuses
-- First drop existing constraint if it exists
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- Add new check constraint with all statuses
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check 
  CHECK (status IN ('Scheduled', 'On the way', 'In progress', 'Completed', 'Invoiced', 'Paid', 'Closed'));

-- Create index for faster status filtering
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
