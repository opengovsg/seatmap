-- Add started_at to draft_state so we know when the current draft began.
-- Used to delete audit log entries when a draft is discarded.
-- Run this in the Supabase SQL editor.

alter table draft_state add column started_at timestamptz;
