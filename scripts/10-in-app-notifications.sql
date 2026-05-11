-- In-App Notifications System
-- Run this in your Supabase SQL editor

-- Create in_app_notifications table
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  icon text,
  read boolean DEFAULT false,
  -- Related record links
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  estimate_id uuid REFERENCES estimates(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES service_plans(id) ON DELETE SET NULL,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON in_app_notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON in_app_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON in_app_notifications(user_id, category);

-- Enable RLS
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own notifications" ON in_app_notifications;
CREATE POLICY "Users can view own notifications" ON in_app_notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notifications" ON in_app_notifications;
CREATE POLICY "Users can insert own notifications" ON in_app_notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON in_app_notifications;
CREATE POLICY "Users can update own notifications" ON in_app_notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON in_app_notifications;
CREATE POLICY "Users can delete own notifications" ON in_app_notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-expire old notifications (optional cleanup function)
-- Call this periodically to clean up old notifications
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  -- Delete notifications older than 30 days that are read
  DELETE FROM in_app_notifications 
  WHERE read = true 
    AND created_at < NOW() - INTERVAL '30 days';
  
  -- Delete expired notifications
  DELETE FROM in_app_notifications 
  WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
