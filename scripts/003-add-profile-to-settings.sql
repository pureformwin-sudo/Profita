-- Add profile column to settings table for business profile data
ALTER TABLE settings ADD COLUMN IF NOT EXISTS profile jsonb DEFAULT '{"businessName": "", "ownerName": "", "phone": "", "serviceArea": "", "weeklyGoal": 1000, "taxRate": 15}'::jsonb;
