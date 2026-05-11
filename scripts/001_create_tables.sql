-- Create profiles table linked to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create income table
CREATE TABLE IF NOT EXISTS public.income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  customer_name TEXT,
  job_type TEXT,
  payment_method TEXT,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create pending_income table
CREATE TABLE IF NOT EXISTS public.pending_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  expected_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create upcoming_expenses table
CREATE TABLE IF NOT EXISTS public.upcoming_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create settings table
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profit_allocation JSONB DEFAULT '{"profit": 50, "expenses": 30, "taxes": 15, "misc": 5}'::jsonb,
  expense_categories JSONB DEFAULT '["Fuel", "Equipment", "Supplies", "Marketing", "Software", "Other"]'::jsonb,
  dark_mode BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upcoming_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- Income policies
CREATE POLICY "income_select_own" ON public.income FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "income_insert_own" ON public.income FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "income_update_own" ON public.income FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "income_delete_own" ON public.income FOR DELETE USING (auth.uid() = user_id);

-- Expenses policies
CREATE POLICY "expenses_select_own" ON public.expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "expenses_insert_own" ON public.expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expenses_update_own" ON public.expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "expenses_delete_own" ON public.expenses FOR DELETE USING (auth.uid() = user_id);

-- Pending income policies
CREATE POLICY "pending_income_select_own" ON public.pending_income FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pending_income_insert_own" ON public.pending_income FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pending_income_update_own" ON public.pending_income FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pending_income_delete_own" ON public.pending_income FOR DELETE USING (auth.uid() = user_id);

-- Upcoming expenses policies
CREATE POLICY "upcoming_expenses_select_own" ON public.upcoming_expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "upcoming_expenses_insert_own" ON public.upcoming_expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "upcoming_expenses_update_own" ON public.upcoming_expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "upcoming_expenses_delete_own" ON public.upcoming_expenses FOR DELETE USING (auth.uid() = user_id);

-- Settings policies
CREATE POLICY "settings_select_own" ON public.settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "settings_insert_own" ON public.settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings_update_own" ON public.settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "settings_delete_own" ON public.settings FOR DELETE USING (auth.uid() = user_id);

-- Trigger to auto-create profile and default settings on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'name', ''),
    new.email
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.settings (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
