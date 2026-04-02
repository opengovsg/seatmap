-- Unassign all archived people from their seats
-- Run this in the Supabase SQL Editor

-- Update live seats: set to AVAILABLE and clear occupant fields
UPDATE seats
SET
  status = 'AVAILABLE',
  person_id = NULL,
  occupant_name = NULL,
  occupant_team = NULL,
  occupant_division = NULL
WHERE person_id IN (
  SELECT id FROM people WHERE is_archived = true
);

-- Update draft seats: set to AVAILABLE and clear occupant fields
UPDATE seat_drafts
SET
  status = 'AVAILABLE',
  person_id = NULL,
  occupant_name = NULL,
  occupant_team = NULL,
  occupant_division = NULL
WHERE person_id IN (
  SELECT id FROM people WHERE is_archived = true
);

-- Show summary of what was changed
SELECT
  (SELECT COUNT(*) FROM seats WHERE person_id IS NULL AND status = 'AVAILABLE') as available_seats,
  (SELECT COUNT(*) FROM people WHERE is_archived = true) as archived_people,
  'Archived people have been unassigned from their seats' as message;
