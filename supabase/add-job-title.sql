-- Add job_title column to people table
-- Run this in the Supabase SQL Editor

ALTER TABLE people ADD COLUMN job_title TEXT;

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'people'
AND column_name = 'job_title';
