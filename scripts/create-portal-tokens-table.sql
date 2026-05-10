-- Customer Portal Tokens Table
-- Stores secure access tokens for customers to access their portal

-- Create the customer_portal_tokens table
CREATE TABLE IF NOT EXISTS customer_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Index for fast token lookups
  CONSTRAINT customer_portal_tokens_token_key UNIQUE (token)
);

-- Create index for customer_id lookups
CREATE INDEX IF NOT EXISTS idx_portal_tokens_customer_id ON customer_portal_tokens(customer_id);

-- Create index for token lookups
CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON customer_portal_tokens(token);

-- Enable RLS
ALTER TABLE customer_portal_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only company members can manage tokens

-- Select policy: Company members can view tokens for customers in their company
CREATE POLICY customer_portal_tokens_select ON customer_portal_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      JOIN company_members cm ON cm.company_id = c.company_id
      WHERE c.id = customer_portal_tokens.customer_id
      AND cm.user_id = auth.uid()
    )
  );

-- Insert policy: Company members can create tokens for customers in their company
CREATE POLICY customer_portal_tokens_insert ON customer_portal_tokens
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers c
      JOIN company_members cm ON cm.company_id = c.company_id
      WHERE c.id = customer_portal_tokens.customer_id
      AND cm.user_id = auth.uid()
    )
  );

-- Update policy: Company members can update tokens for customers in their company
CREATE POLICY customer_portal_tokens_update ON customer_portal_tokens
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      JOIN company_members cm ON cm.company_id = c.company_id
      WHERE c.id = customer_portal_tokens.customer_id
      AND cm.user_id = auth.uid()
    )
  );

-- Delete policy: Company members can delete tokens for customers in their company
CREATE POLICY customer_portal_tokens_delete ON customer_portal_tokens
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      JOIN company_members cm ON cm.company_id = c.company_id
      WHERE c.id = customer_portal_tokens.customer_id
      AND cm.user_id = auth.uid()
    )
  );

-- Grant public read access (for token validation without auth)
-- This allows the portal to validate tokens without requiring Supabase auth
CREATE POLICY customer_portal_tokens_public_select ON customer_portal_tokens
  FOR SELECT
  TO anon
  USING (true);
