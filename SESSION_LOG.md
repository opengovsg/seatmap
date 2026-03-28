## 2026-03-28 — Fix draft mode seat coloring

**Changes:**
- Added `export const dynamic = 'force-dynamic'` to `src/app/map/page.tsx` to prevent Next.js from caching the server component
- Added temporary debug logs to `MapClient.tsx`, `SeatMap.tsx`, and `map/page.tsx` to trace where `svg_rect_id` was being lost (all removed after fix)
- Reverted `svg_rect_id` fallback from `'MISSING'` back to `''` after confirming the fix worked

**Decisions:**
- Root cause was Next.js dev server caching the server component in memory — a full server restart was required to pick up the new normalization code from a previous session. `force-dynamic` prevents this going forward.
- Kept the separate `svgRectMap` lookup approach (fetching `svg_rect_id` from the live `seats` table and merging) since the Supabase JS client strips unknown columns from `seat_drafts` responses

**Current state:**
Draft mode is fully working — seats render with correct colors in draft mode. Edits go to `seat_drafts`, admins can publish or discard from the Admin page.

**Next steps:**
- Consider showing a count of changed seats in the draft banner (e.g. "X seats differ from live")
- Consider adding a visual diff view in the admin page to show what will change on publish
- Remove `export const dynamic = 'force-dynamic'` if it causes performance issues in production (the Supabase auth cookie already opts out of caching, so it may be redundant)
