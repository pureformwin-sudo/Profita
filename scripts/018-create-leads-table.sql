-- Create leads table for D2D/Salesforce functionality
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rep_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Contact info
  name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  
  -- Location (for map pins)
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  
  -- Lead status
  status TEXT NOT NULL DEFAULT 'knocked' CHECK (status IN (
    'knocked', 'not_home', 'not_interested', 'interested', 
    'quoted', 'booked', 'converted', 'lost'
  )),
  
  -- Follow-up tracking
  follow_up_date DATE,
  follow_up_reason TEXT,
  
  -- Additional info
  notes TEXT,
  source TEXT DEFAULT 'd2d',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_rep_employee_id ON leads(rep_employee_id);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date ON leads(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY leads_select_own ON leads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY leads_insert_own ON leads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY leads_update_own ON leads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY leads_delete_own ON leads FOR DELETE
  USING (auth.uid() = user_id);

-- Allow sales reps to access leads for their owner
CREATE POLICY leads_sales_rep_access ON leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      WHERE sru.user_id = auth.uid()
        AND sru.owner_user_id = leads.user_id
    )
  );

-- Create quotes table for Salesforce
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  rep_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Quote details
  quote_number TEXT,
  title TEXT,
  description TEXT,
  
  -- Pricing
  subtotal NUMERIC(12, 2) DEFAULT 0,
  tax_rate NUMERIC(5, 2) DEFAULT 0,
  tax_amount NUMERIC(12, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  total NUMERIC(12, 2) DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'
  )),
  
  -- Dates
  valid_until DATE,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  
  -- Additional
  notes TEXT,
  terms TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quote items table
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) DEFAULT 1,
  unit_price NUMERIC(12, 2) DEFAULT 0,
  total NUMERIC(12, 2) DEFAULT 0,
  
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for quotes
CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_lead_id ON quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);

-- Enable RLS for quotes
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quotes
CREATE POLICY quotes_select_own ON quotes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY quotes_insert_own ON quotes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY quotes_update_own ON quotes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY quotes_delete_own ON quotes FOR DELETE
  USING (auth.uid() = user_id);

-- Allow sales reps to access quotes for their owner
CREATE POLICY quotes_sales_rep_access ON quotes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      WHERE sru.user_id = auth.uid()
        AND sru.owner_user_id = quotes.user_id
    )
  );

-- RLS for quote items (through quote ownership)
CREATE POLICY quote_items_select_own ON quote_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND q.user_id = auth.uid()
    )
  );

CREATE POLICY quote_items_insert_own ON quote_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND q.user_id = auth.uid()
    )
  );

CREATE POLICY quote_items_update_own ON quote_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND q.user_id = auth.uid()
    )
  );

CREATE POLICY quote_items_delete_own ON quote_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND q.user_id = auth.uid()
    )
  );

-- Lead activity log table
CREATE TABLE IF NOT EXISTS lead_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rep_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'knock', 'call', 'sms', 'email', 'note', 'status_change', 'quote_sent', 'booked'
  )),
  
  -- For status changes
  old_status TEXT,
  new_status TEXT,
  
  -- Details
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lead activity
CREATE INDEX IF NOT EXISTS idx_lead_activity_lead_id ON lead_activity(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activity_user_id ON lead_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_activity_created_at ON lead_activity(created_at DESC);

-- Enable RLS for lead activity
ALTER TABLE lead_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lead activity
CREATE POLICY lead_activity_select_own ON lead_activity FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY lead_activity_insert_own ON lead_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY lead_activity_delete_own ON lead_activity FOR DELETE
  USING (auth.uid() = user_id);
