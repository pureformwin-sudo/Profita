-- ============================================================================
-- PROFITA SALESFORCE MODULE - COMPLETE DATABASE SETUP
-- ============================================================================
-- Run this entire script in your Supabase SQL Editor
-- This creates all tables for the D2D sales / CRM functionality
-- ============================================================================

-- ============================================================================
-- 1. TERRITORIES - Define sales territories/areas
-- ============================================================================

CREATE TABLE IF NOT EXISTS territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Territory info
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6', -- For map visualization
  
  -- Geographic bounds (optional - for map filtering)
  bounds JSONB, -- { north, south, east, west } or polygon coordinates
  zip_codes TEXT[], -- Array of zip codes in this territory
  
  -- Assignment
  assigned_rep_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Stats (denormalized for performance)
  total_leads INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  
  -- Metadata
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_territories_user ON territories(user_id);
CREATE INDEX IF NOT EXISTS idx_territories_rep ON territories(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_territories_active ON territories(user_id, active);

-- RLS
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "territories_all_own" ON territories;
CREATE POLICY "territories_all_own" ON territories FOR ALL 
  USING (auth.uid() = user_id);


-- ============================================================================
-- 2. LEADS - Core lead/prospect tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Ownership
  owner_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  territory_id UUID REFERENCES territories(id) ON DELETE SET NULL,
  
  -- Contact info
  name TEXT DEFAULT '',
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  
  -- Location for map pinning
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  
  -- Status tracking (D2D workflow)
  status TEXT NOT NULL DEFAULT 'knocked' CHECK (status IN (
    'knocked',      -- Initial door knock
    'not_home',     -- No answer
    'not_interested', -- Declined
    'callback',     -- Asked to come back
    'interested',   -- Showed interest
    'quoted',       -- Received a quote
    'follow_up',    -- Needs follow up
    'booked',       -- Appointment set
    'converted',    -- Became a customer
    'lost'          -- Lost opportunity
  )),
  
  -- Lead quality and source
  source TEXT DEFAULT 'd2d' CHECK (source IN ('d2d', 'referral', 'web', 'phone', 'social', 'other')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'hot')),
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100), -- Lead score 0-100
  
  -- Property info (for service businesses)
  property_type TEXT, -- 'single_family', 'multi_family', 'commercial', etc.
  property_size TEXT, -- 'small', 'medium', 'large'
  
  -- Notes and tags
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  
  -- Follow-up scheduling
  follow_up_date TIMESTAMPTZ,
  follow_up_reason TEXT,
  last_contact_at TIMESTAMPTZ,
  contact_attempts INTEGER DEFAULT 0,
  
  -- Conversion tracking
  converted_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  estimated_value DECIMAL(10,2),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_employee_id);
CREATE INDEX IF NOT EXISTS idx_leads_territory ON leads(territory_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(user_id, source);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(user_id, priority);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(user_id, follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_location ON leads(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads(converted_customer_id) WHERE converted_customer_id IS NOT NULL;

-- Full text search on name and address
CREATE INDEX IF NOT EXISTS idx_leads_search ON leads USING gin(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(address, '')));

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads_all_own" ON leads;
CREATE POLICY "leads_all_own" ON leads FOR ALL 
  USING (auth.uid() = user_id);


-- ============================================================================
-- 3. LEAD ACTIVITIES - Activity/interaction log
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Who performed the activity
  rep_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Activity type
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'knock',          -- Door knock attempt
    'call',           -- Phone call
    'voicemail',      -- Left voicemail
    'sms',            -- Text message
    'email',          -- Email sent
    'note',           -- General note
    'status_change',  -- Status was changed
    'quote_sent',     -- Quote was sent
    'quote_viewed',   -- Quote was viewed
    'follow_up_set',  -- Follow up scheduled
    'appointment',    -- Appointment set
    'meeting',        -- In-person meeting
    'converted',      -- Converted to customer
    'lost'            -- Marked as lost
  )),
  
  -- Status change tracking
  old_status TEXT,
  new_status TEXT,
  
  -- Content
  subject TEXT,
  notes TEXT,
  
  -- Additional metadata (call duration, email open status, etc.)
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_activities_user ON lead_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_rep ON lead_activities(rep_employee_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(lead_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON lead_activities(lead_id, created_at DESC);

-- RLS
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_activities_all_own" ON lead_activities;
CREATE POLICY "lead_activities_all_own" ON lead_activities FOR ALL 
  USING (auth.uid() = user_id);


-- ============================================================================
-- 4. FOLLOW UPS - Scheduled follow-up tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Link to lead (optional - can be standalone task)
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Assignment
  assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Task details
  title TEXT NOT NULL,
  description TEXT,
  follow_up_type TEXT DEFAULT 'call' CHECK (follow_up_type IN (
    'call', 'sms', 'email', 'visit', 'meeting', 'quote', 'other'
  )),
  
  -- Scheduling
  due_date DATE NOT NULL,
  due_time TIME,
  reminder_at TIMESTAMPTZ,
  
  -- Priority and status
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'overdue')),
  
  -- Completion
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  completion_notes TEXT,
  
  -- Recurrence (for recurring follow-ups)
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT, -- iCal RRULE format or simple: 'daily', 'weekly', 'monthly'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_lead ON follow_ups(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_follow_ups_customer ON follow_ups(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned ON follow_ups(assigned_to);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(user_id, due_date, status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(user_id, status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_overdue ON follow_ups(user_id, due_date) WHERE status = 'pending';

-- RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follow_ups_all_own" ON follow_ups;
CREATE POLICY "follow_ups_all_own" ON follow_ups FOR ALL 
  USING (auth.uid() = user_id);


-- ============================================================================
-- 5. QUOTES - Sales quotes/proposals
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Links
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Quote identification
  quote_number TEXT,
  title TEXT,
  
  -- Status workflow
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',      -- Being prepared
    'sent',       -- Sent to prospect
    'viewed',     -- Opened by prospect
    'accepted',   -- Accepted
    'rejected',   -- Declined
    'expired',    -- Past valid date
    'converted'   -- Converted to job/invoice
  )),
  
  -- Line items (stored as JSONB for flexibility)
  line_items JSONB DEFAULT '[]', -- [{description, quantity, unit_price, total}]
  
  -- Pricing
  subtotal DECIMAL(10,2) DEFAULT 0,
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  tax_rate DECIMAL(5,4) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  
  -- Terms and notes
  terms TEXT,
  notes TEXT,
  internal_notes TEXT,
  
  -- Validity
  valid_until DATE,
  
  -- Tracking
  sent_at TIMESTAMPTZ,
  sent_via TEXT, -- 'email', 'sms', 'link', etc.
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Conversion
  converted_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  converted_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quotes_number ON quotes(user_id, quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_valid ON quotes(user_id, valid_until) WHERE status IN ('draft', 'sent', 'viewed');

-- RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quotes_all_own" ON quotes;
CREATE POLICY "quotes_all_own" ON quotes FOR ALL 
  USING (auth.uid() = user_id);


-- ============================================================================
-- 6. BOOKINGS - Appointments / scheduled visits
-- ============================================================================

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Links
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  
  -- Assignment
  assigned_rep_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Booking details
  title TEXT NOT NULL,
  description TEXT,
  booking_type TEXT DEFAULT 'estimate' CHECK (booking_type IN (
    'estimate',   -- Quote/estimate visit
    'service',    -- Service appointment
    'follow_up',  -- Follow up meeting
    'consultation', -- Initial consultation
    'other'
  )),
  
  -- Scheduling
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  duration_minutes INTEGER DEFAULT 60,
  end_time TIME,
  
  -- Location
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',  -- Confirmed appointment
    'confirmed',  -- Customer confirmed
    'in_progress', -- Currently happening
    'completed',  -- Finished
    'cancelled',  -- Cancelled
    'no_show',    -- Customer didn't show
    'rescheduled' -- Moved to new time
  )),
  
  -- Customer info (for non-linked bookings)
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  
  -- Notes
  notes TEXT,
  internal_notes TEXT,
  
  -- Completion
  completed_at TIMESTAMPTZ,
  outcome TEXT, -- 'sold', 'not_interested', 'needs_follow_up', etc.
  outcome_notes TEXT,
  
  -- Reminders
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_lead ON bookings(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_rep ON bookings(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_type ON bookings(user_id, booking_type);
CREATE INDEX IF NOT EXISTS idx_bookings_upcoming ON bookings(user_id, scheduled_date, status) WHERE status IN ('scheduled', 'confirmed');

-- RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bookings_all_own" ON bookings;
CREATE POLICY "bookings_all_own" ON bookings FOR ALL 
  USING (auth.uid() = user_id);


-- ============================================================================
-- 7. SALES REP STATS - Daily/weekly performance tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_rep_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Time period
  date DATE NOT NULL,
  
  -- D2D Activity
  doors_knocked INTEGER DEFAULT 0,
  contacts_made INTEGER DEFAULT 0,
  not_homes INTEGER DEFAULT 0,
  not_interested INTEGER DEFAULT 0,
  callbacks INTEGER DEFAULT 0,
  
  -- Results
  leads_generated INTEGER DEFAULT 0,
  appointments_set INTEGER DEFAULT 0,
  quotes_sent INTEGER DEFAULT 0,
  quotes_accepted INTEGER DEFAULT 0,
  
  -- Revenue
  total_quoted DECIMAL(10,2) DEFAULT 0,
  total_sold DECIMAL(10,2) DEFAULT 0,
  
  -- Time tracking
  hours_worked DECIMAL(4,2),
  miles_traveled DECIMAL(6,2),
  
  -- Territories covered
  territories_worked UUID[],
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one record per rep per day
  UNIQUE(employee_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_rep_stats_user ON sales_rep_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_rep_stats_employee ON sales_rep_stats(employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_rep_stats_date ON sales_rep_stats(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_rep_stats_range ON sales_rep_stats(employee_id, date);

-- RLS
ALTER TABLE sales_rep_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_rep_stats_all_own" ON sales_rep_stats;
CREATE POLICY "sales_rep_stats_all_own" ON sales_rep_stats FOR ALL 
  USING (auth.uid() = user_id);


-- ============================================================================
-- 8. TRIGGERS - Auto-update timestamps and stats
-- ============================================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
DROP TRIGGER IF EXISTS update_territories_updated_at ON territories;
CREATE TRIGGER update_territories_updated_at
  BEFORE UPDATE ON territories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_follow_ups_updated_at ON follow_ups;
CREATE TRIGGER update_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sales_rep_stats_updated_at ON sales_rep_stats;
CREATE TRIGGER update_sales_rep_stats_updated_at
  BEFORE UPDATE ON sales_rep_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 9. TRIGGER: Auto-log lead status changes
-- ============================================================================

CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO lead_activities (
      user_id,
      lead_id,
      activity_type,
      old_status,
      new_status,
      notes
    ) VALUES (
      NEW.user_id,
      NEW.id,
      'status_change',
      OLD.status,
      NEW.status,
      'Status changed from ' || COALESCE(OLD.status, 'none') || ' to ' || NEW.status
    );
    
    -- Update last_contact_at
    NEW.last_contact_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_lead_status_change_trigger ON leads;
CREATE TRIGGER log_lead_status_change_trigger
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION log_lead_status_change();


-- ============================================================================
-- 10. TRIGGER: Update territory stats when lead changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_territory_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update old territory stats (if moving between territories)
  IF TG_OP = 'UPDATE' AND OLD.territory_id IS DISTINCT FROM NEW.territory_id THEN
    IF OLD.territory_id IS NOT NULL THEN
      UPDATE territories SET 
        total_leads = (SELECT COUNT(*) FROM leads WHERE territory_id = OLD.territory_id),
        total_conversions = (SELECT COUNT(*) FROM leads WHERE territory_id = OLD.territory_id AND status = 'converted'),
        updated_at = NOW()
      WHERE id = OLD.territory_id;
    END IF;
  END IF;
  
  -- Update new territory stats
  IF NEW.territory_id IS NOT NULL THEN
    UPDATE territories SET 
      total_leads = (SELECT COUNT(*) FROM leads WHERE territory_id = NEW.territory_id),
      total_conversions = (SELECT COUNT(*) FROM leads WHERE territory_id = NEW.territory_id AND status = 'converted'),
      updated_at = NOW()
    WHERE id = NEW.territory_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_territory_stats_trigger ON leads;
CREATE TRIGGER update_territory_stats_trigger
  AFTER INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_territory_stats();


-- ============================================================================
-- 11. TRIGGER: Auto-generate quote numbers
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM 'Q-(\d+)') AS INTEGER)), 0) + 1
    INTO next_num
    FROM quotes
    WHERE user_id = NEW.user_id;
    
    NEW.quote_number = 'Q-' || LPAD(next_num::TEXT, 5, '0');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generate_quote_number_trigger ON quotes;
CREATE TRIGGER generate_quote_number_trigger
  BEFORE INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION generate_quote_number();


-- ============================================================================
-- 12. TRIGGER: Mark follow-ups as overdue
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_overdue_follow_ups()
RETURNS void AS $$
BEGIN
  UPDATE follow_ups
  SET status = 'overdue', updated_at = NOW()
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 13. VIEWS - Useful aggregated views
-- ============================================================================

-- Lead pipeline summary view
CREATE OR REPLACE VIEW lead_pipeline_summary AS
SELECT 
  user_id,
  status,
  COUNT(*) as count,
  SUM(estimated_value) as total_value,
  AVG(score) as avg_score
FROM leads
GROUP BY user_id, status;

-- Today's follow-ups view
CREATE OR REPLACE VIEW todays_follow_ups AS
SELECT 
  f.*,
  l.name as lead_name,
  l.phone as lead_phone,
  l.address as lead_address,
  c.name as customer_name,
  e.name as assigned_to_name
FROM follow_ups f
LEFT JOIN leads l ON f.lead_id = l.id
LEFT JOIN customers c ON f.customer_id = c.id
LEFT JOIN employees e ON f.assigned_to = e.id
WHERE f.due_date = CURRENT_DATE
  AND f.status IN ('pending', 'in_progress');

-- Rep leaderboard view
CREATE OR REPLACE VIEW sales_rep_leaderboard AS
SELECT 
  s.employee_id,
  e.name as rep_name,
  s.user_id,
  SUM(s.doors_knocked) as total_doors,
  SUM(s.leads_generated) as total_leads,
  SUM(s.appointments_set) as total_appointments,
  SUM(s.total_sold) as total_revenue,
  CASE WHEN SUM(s.doors_knocked) > 0 
    THEN ROUND((SUM(s.leads_generated)::DECIMAL / SUM(s.doors_knocked)) * 100, 2)
    ELSE 0 
  END as conversion_rate
FROM sales_rep_stats s
JOIN employees e ON s.employee_id = e.id
WHERE s.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY s.employee_id, e.name, s.user_id
ORDER BY total_revenue DESC;


-- ============================================================================
-- 14. HELPER FUNCTIONS
-- ============================================================================

-- Function to convert lead to customer
CREATE OR REPLACE FUNCTION convert_lead_to_customer(
  p_lead_id UUID,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_lead leads%ROWTYPE;
  v_customer_id UUID;
BEGIN
  -- Get lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  
  -- Create customer
  INSERT INTO customers (
    user_id, name, address, phone, email, notes, sales_rep_id
  ) VALUES (
    p_user_id,
    COALESCE(v_lead.name, 'Unknown'),
    v_lead.address,
    v_lead.phone,
    v_lead.email,
    'Converted from lead on ' || TO_CHAR(NOW(), 'YYYY-MM-DD'),
    v_lead.owner_employee_id
  ) RETURNING id INTO v_customer_id;
  
  -- Update lead
  UPDATE leads SET 
    status = 'converted',
    converted_customer_id = v_customer_id,
    converted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_lead_id;
  
  -- Log activity
  INSERT INTO lead_activities (user_id, lead_id, activity_type, notes)
  VALUES (p_user_id, p_lead_id, 'converted', 'Lead converted to customer');
  
  RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to get lead stats for a date range
CREATE OR REPLACE FUNCTION get_lead_stats(
  p_user_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_leads BIGINT,
  new_leads BIGINT,
  converted BIGINT,
  lost BIGINT,
  conversion_rate DECIMAL,
  avg_time_to_convert INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_leads,
    COUNT(*) FILTER (WHERE created_at::DATE BETWEEN p_start_date AND p_end_date)::BIGINT as new_leads,
    COUNT(*) FILTER (WHERE status = 'converted')::BIGINT as converted,
    COUNT(*) FILTER (WHERE status = 'lost')::BIGINT as lost,
    CASE WHEN COUNT(*) > 0 
      THEN ROUND((COUNT(*) FILTER (WHERE status = 'converted')::DECIMAL / COUNT(*)) * 100, 2)
      ELSE 0 
    END as conversion_rate,
    AVG(converted_at - created_at) FILTER (WHERE converted_at IS NOT NULL) as avg_time_to_convert
  FROM leads
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 15. GRANTS - Ensure proper access
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant table access to authenticated users
GRANT ALL ON territories TO authenticated;
GRANT ALL ON leads TO authenticated;
GRANT ALL ON lead_activities TO authenticated;
GRANT ALL ON follow_ups TO authenticated;
GRANT ALL ON quotes TO authenticated;
GRANT ALL ON bookings TO authenticated;
GRANT ALL ON sales_rep_stats TO authenticated;

-- Grant view access
GRANT SELECT ON lead_pipeline_summary TO authenticated;
GRANT SELECT ON todays_follow_ups TO authenticated;
GRANT SELECT ON sales_rep_leaderboard TO authenticated;

-- Grant function access
GRANT EXECUTE ON FUNCTION convert_lead_to_customer TO authenticated;
GRANT EXECUTE ON FUNCTION get_lead_stats TO authenticated;


-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Tables created:
--   - territories (sales territory management)
--   - leads (core lead/prospect tracking)
--   - lead_activities (activity log)
--   - follow_ups (scheduled tasks)
--   - quotes (sales proposals)
--   - bookings (appointments)
--   - sales_rep_stats (performance tracking)
--
-- Features included:
--   - All RLS policies for multi-tenant security
--   - Indexes for common query patterns
--   - Auto-updating timestamps
--   - Auto-logging of status changes
--   - Auto-generating quote numbers
--   - Territory stats tracking
--   - Lead-to-customer conversion function
--   - Pipeline summary views
--   - Leaderboard view for sales competitions
-- ============================================================================
