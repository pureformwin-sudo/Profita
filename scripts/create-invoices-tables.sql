-- Create estimates table
CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  estimate_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create estimate line items table
CREATE TABLE IF NOT EXISTS estimate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  terms TEXT,
  stripe_payment_intent_id TEXT,
  payment_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create invoice line items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for estimates
CREATE POLICY "estimates_select_own" ON estimates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "estimates_insert_own" ON estimates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "estimates_update_own" ON estimates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "estimates_delete_own" ON estimates FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for estimate_items (through estimate ownership)
CREATE POLICY "estimate_items_select_own" ON estimate_items FOR SELECT 
  USING (EXISTS (SELECT 1 FROM estimates WHERE estimates.id = estimate_items.estimate_id AND estimates.user_id = auth.uid()));
CREATE POLICY "estimate_items_insert_own" ON estimate_items FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM estimates WHERE estimates.id = estimate_items.estimate_id AND estimates.user_id = auth.uid()));
CREATE POLICY "estimate_items_update_own" ON estimate_items FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM estimates WHERE estimates.id = estimate_items.estimate_id AND estimates.user_id = auth.uid()));
CREATE POLICY "estimate_items_delete_own" ON estimate_items FOR DELETE 
  USING (EXISTS (SELECT 1 FROM estimates WHERE estimates.id = estimate_items.estimate_id AND estimates.user_id = auth.uid()));

-- RLS Policies for invoices
CREATE POLICY "invoices_select_own" ON invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "invoices_insert_own" ON invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "invoices_update_own" ON invoices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "invoices_delete_own" ON invoices FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for invoice_items (through invoice ownership)
CREATE POLICY "invoice_items_select_own" ON invoice_items FOR SELECT 
  USING (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid()));
CREATE POLICY "invoice_items_insert_own" ON invoice_items FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid()));
CREATE POLICY "invoice_items_update_own" ON invoice_items FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid()));
CREATE POLICY "invoice_items_delete_own" ON invoice_items FOR DELETE 
  USING (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid()));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_estimates_user_id ON estimates(user_id);
CREATE INDEX IF NOT EXISTS idx_estimates_customer_id ON estimates(customer_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate_id ON estimate_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
