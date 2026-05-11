-- Create booking_requests table for online booking portal
CREATE TABLE IF NOT EXISTS booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  customer_address text NOT NULL,
  service_type text NOT NULL,
  preferred_date date NOT NULL,
  preferred_time text,
  notes text,
  status text DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Declined', 'Completed')),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;

-- RLS policy for booking_requests
CREATE POLICY "Users can view own booking requests" ON booking_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own booking requests" ON booking_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own booking requests" ON booking_requests
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own booking requests" ON booking_requests
  FOR DELETE USING (auth.uid() = user_id);

-- Policy for public booking (service function will handle this)
CREATE POLICY "Allow public booking inserts" ON booking_requests
  FOR INSERT WITH CHECK (true);
