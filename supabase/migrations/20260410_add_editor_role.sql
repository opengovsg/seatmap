-- Add 'editor' role to admins table
-- This migration updates the role constraint to include the new 'editor' role
-- Existing 'owner' and 'admin' records remain valid (backward compatible)

-- Drop old constraint
alter table admins drop constraint if exists admins_role_check;

-- Add new constraint with editor role
alter table admins add constraint admins_role_check
  check (role in ('owner', 'admin', 'editor'));
