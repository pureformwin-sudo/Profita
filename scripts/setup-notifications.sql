-- Notification Logs Table
-- Stores all sent notifications for history and debugging
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  rep_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  rep_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('lead_followup', 'appointment_confirmation', 'appointment_reminder', 'appointment_missed', 'invoice_sent', 'payment_reminder', 'job_completed', 'hot_lead_alert')),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  message TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('sent', 'failed', 'pending', 'scheduled')),
  error_message TEXT,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_logs_select_own" ON public.notification_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notification_logs_insert_own" ON public.notification_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notification_logs_update_own" ON public.notification_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notification_logs_delete_own" ON public.notification_logs FOR DELETE USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON public.notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_customer_id ON public.notification_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON public.notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_scheduled ON public.notification_logs(scheduled_for) WHERE status = 'scheduled';

-- Add notification preferences to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS notification_channel TEXT DEFAULT 'both' CHECK (notification_channel IN ('sms', 'email', 'both', 'none')),
ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_consent BOOLEAN DEFAULT true;

-- Notification Settings stored in settings table profile JSON
-- No new table needed - we'll use settings.profile.notification_settings
