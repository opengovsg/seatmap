-- Merge duplicate division names
-- Run this in the Supabase SQL Editor

-- Update people table: Div A -> Division A
UPDATE people
SET division = 'Division A'
WHERE division = 'Div A';

-- Update people table: Div B -> Division B
UPDATE people
SET division = 'Division B'
WHERE division = 'Div B';

-- Update seats table: Div A -> Division A
UPDATE seats
SET occupant_division = 'Division A'
WHERE occupant_division = 'Div A';

-- Update seats table: Div B -> Division B
UPDATE seats
SET occupant_division = 'Division B'
WHERE occupant_division = 'Div B';

-- Update seat_drafts table: Div A -> Division A
UPDATE seat_drafts
SET occupant_division = 'Division A'
WHERE occupant_division = 'Div A';

-- Update seat_drafts table: Div B -> Division B
UPDATE seat_drafts
SET occupant_division = 'Division B'
WHERE occupant_division = 'Div B';

-- Show summary of divisions after merge
SELECT division, COUNT(*) as count
FROM people
WHERE division IS NOT NULL
GROUP BY division
ORDER BY division;
