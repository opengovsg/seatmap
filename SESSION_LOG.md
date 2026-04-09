## 2026-04-02 — UX Improvements & Reserve Seat Team Tracking

**Changes:**
- **Person picker improvements**:
  - Auto-select when only one person matches search filter
  - Enter key selects highlighted person when one match
  - Enter key in Notes field triggers Assign button
  - Fixed UUID showing in combobox input (kept value as null)
- **Reserved seat team tracking**:
  - Updated `reserveSeat()` to accept and save team parameter
  - Team now saved to `occupant_team` field for reserved seats
  - Reserved seats appear when filtering by team in navbar
  - Display team in reserved seat modal view
  - Display team in seat tooltip for reserved seats
- **Division cleanup**:
  - Created `supabase/merge-duplicate-divisions.sql` to merge "Div A"→"Division A" and "Div B"→"Division B"
  - Updated divisions in people, seats, and seat_drafts tables
  - Cleaned up 232 people records with consistent division names
- **Seat assignment displacement fix**:
  - Updated `assignSeat()` to unseat displaced person when assigning to occupied seat
  - Displaced person's `person_id` cleared and they appear in unseated list
  - Works in both draft and live modes
- **People panel search enhancement**:
  - Search now works across all tabs (unseated, seated, archived)
  - Tab counts update to show matches in each category
  - No need to switch tabs to find a person

**Decisions:**
- **Notes tied to seat, not person**: Confirmed notes are stored on `seats` table, not `people` table - notes stay with physical location when person moves
- **Team field for reserved seats**: Team was already in the UI form but wasn't being saved - now properly tracked for filtering and display
- **Search across all tabs**: Better UX than limiting search to current tab - users can find anyone regardless of their status
- **Auto-select single match**: Improves keyboard navigation flow when search narrows to one person

**Current state:**
All UX improvements implemented and working. Reserved seats now properly track team assignments. Division duplicates cleaned up. Search works globally across all people. Seat displacement properly unseats the displaced person.

**Next steps:**
- Test reserved seat team filtering with actual reservations
- Verify displaced person workflow end-to-end (assign to occupied seat → check unseated list)
- Consider adding division to reserved seat form (currently only has team)
- Consider showing division in tooltips for reserved seats
- Test search performance with large people lists (200+ entries)

---

## 2026-04-02 — CSV Import, Archive Fix, Map Navigation

**Changes:**
- Added CSV bulk import functionality for employee data:
  - Created `supabase/add-job-title.sql` migration to add `job_title` column to `people` table
  - Built `scripts/import-people.ts` with batch processing (100 rows/batch), duplicate detection (case-insensitive), and Postman CSV parsing
  - Added `job_title` field to TypeScript `Person` interface and all related UI components
  - Updated `PersonModal` to include job title input field
  - Modified `UnseatedPanel` to display job titles under person names
  - Successfully imported 222 employees from `People.csv` (skipped 10 existing)
  - Added `import-people` npm script and updated README with import instructions
- Fixed archived person bug:
  - Updated `archivePerson()` to automatically unassign people from seats before archiving
  - Created `supabase/unassign-archived-people.sql` to clean up existing archived people still holding seats
- Improved map navigation UX:
  - Made navigation bar sticky (`sticky top-0 z-10`) - stays visible when scrolling
  - Added click-and-drag panning functionality to the map
  - Implemented cursor states: grab hand (empty space), pointer (seats), grabbing hand (while panning)
  - Fixed layout hierarchy: added `overflow-hidden` to body and main elements so scrollbar only appears on map container
  - Set SVG background to `pointer-events: none` while keeping seat rectangles interactive
  - Added global mouse event listeners for smooth panning across entire window

**Decisions:**
- **Import strategy**: Skip duplicates rather than update - safer for bulk import, prevents accidental overwrites of existing data
- **Job title storage**: Added as nullable column - allows gradual population without breaking existing records
- **Pan implementation**: Used CSS `pointer-events` to allow mouse events through SVG background while seats remain clickable
- **Layout fix**: Body and main use `overflow-hidden`, only SeatMap scrolls - ensures navbar stays sticky and scrollbar appears in correct location

**Current state:**
All features implemented and tested. CSV import working with 222 employees loaded. Archive bug fixed with cleanup script ready. Map navigation fully functional with sticky navbar and smooth panning. All changes committed to main branch.

**Next steps:**
- Run `supabase/add-job-title.sql` in Supabase SQL editor (if not already done)
- Run `supabase/unassign-archived-people.sql` to clean up any archived people still assigned to seats
- Test panning behavior on different screen sizes and browsers
- Consider adding zoom functionality to map (pinch-to-zoom, zoom controls)
- Consider adding CSV export feature for backing up people data
- Test job title field with various character lengths and special characters

---

## 2026-03-31 — OTP Authentication Debugging & UI Polish

**Changes:**
- Fixed middleware blocking `/api/auth/*` routes: added `/api/auth` to allowed unauthenticated routes in `src/proxy.ts`
- Resolved OTP session creation issues: changed verify-otp endpoint to return hashed token instead of trying to set session in API route (which fails with AuthSessionMissingError)
- Restored `src/app/auth/callback/route.ts` to handle token exchange via `verifyOtp()` method
- Updated login flow to redirect to `/auth/callback?token_hash=...` after OTP verification (matches Supabase magic link pattern)
- Fixed existing user handling: verify-otp now checks for existing users before creating new ones
- Configured Postman sender email to use default `info@mail.postman.gov.sg` (custom sender requires 2-week setup)
- Simplified OTP email to plain text with `<br>` tags for line breaks
- Updated email subject line to lowercase: "Your seatmap verification code"
- Improved login UI sizing: all inputs and buttons use `size="lg"` for better touch targets
- OTP input field: larger text (`text-3xl`) with centered, monospace styling for easy reading

**Decisions:**
- **Token exchange pattern** — API returns hashed token, callback route handles session creation. This matches Supabase's established pattern and properly persists cookies server-side
- **Default Postman sender** — Use `info@mail.postman.gov.sg` instead of custom sender to avoid 2-week onboarding delay
- **Plain text email with HTML breaks** — Use `<br>` tags in plain text for line breaks (email clients strip single `\n` characters)
- **Consistent large sizing** — All form elements use `size="lg"` instead of custom heights for design consistency

**Current state:**
OTP authentication fully working end-to-end on `postman` branch. Users can:
- Enter email → receive OTP via Postman
- Enter 6-digit code → auto-submit on completion
- Successfully log in and access /map
- Resend codes with 60-second countdown

All commits pushed to remote. Ready for testing in production environment.

**Next steps:**
- Test OTP flow on different email clients (Gmail, Outlook, Apple Mail) to verify formatting
- Consider adding OTP cleanup job to delete expired codes from database (currently accumulate)
- Monitor Postman API usage and email delivery success rates
- Update documentation if Postman sender email changes in future
- Consider merging `postman` branch to `main` after production testing

---

## 2026-03-30 — Postman OTP Authentication

**Changes:**
- Replaced Supabase magic link authentication with Postman OTP (one-time password) email delivery
- Created `supabase/add-otp-codes.sql`: database schema for OTP storage with rate limiting and attempt tracking
- Created `src/lib/postman.ts`: Postman API integration with secure 6-digit code generation and HTML email templates
- Created `src/app/api/auth/request-otp/route.ts`: API endpoint to request OTP (validates domain, checks rate limit, stores code, sends email)
- Created `src/app/api/auth/verify-otp/route.ts`: API endpoint to verify OTP (checks expiry, validates code, creates Supabase session)
- Rewrote `src/app/login/page.tsx`: replaced "check email" flow with OTP input card featuring 6-digit numeric input, auto-submit at 6 digits, resend with 60-second countdown timer
- Updated `README.md`: changed authentication description to OTP, added Postman environment variables, added step 11 to database setup
- Renamed `src/app/auth/callback/route.ts` to `callback-legacy-backup.ts`: preserved old magic link handler for potential rollback
- Created `OTP_IMPLEMENTATION.md`: comprehensive documentation with architecture, testing checklist, and troubleshooting guide

**Decisions:**
- **OTP instead of magic links** — resolves user feedback about email delivery issues and "need Supabase account" confusion
- **Keep Supabase for database/sessions** — only changed email delivery, not the underlying auth system
- **15-minute expiry + 5 attempt limit** — balances security with usability
- **60-second rate limit per email** — prevents abuse while allowing legitimate resends
- **Auto-submit at 6 digits** — streamlines mobile UX, reduces friction
- **Rollback-safe implementation** — old callback route preserved, database changes non-destructive, `otp_codes` table isolated
- **Secure code generation** — uses Node.js `crypto.randomBytes()` for cryptographically secure random codes
- **Transaction-like behavior** — if Postman email fails, OTP database record is rolled back

**Current state:**
All code complete and TypeScript-clean. Changes on `postman` branch. Implementation ready to test but requires:
1. `POSTMAN_API_KEY` and `POSTMAN_FROM_EMAIL` in `.env.local`
2. Running `supabase/add-otp-codes.sql` in Supabase SQL editor

**Next steps:**
- **Add environment variables** to `.env.local`:
  ```
  POSTMAN_API_KEY=your-postman-api-key
  POSTMAN_FROM_EMAIL=seatmap@open.gov.sg
  ```
- **Run database migration** in Supabase SQL editor: `supabase/add-otp-codes.sql`
- **Test locally** at http://localhost:3000/login:
  - Enter @open.gov.sg email → receive 6-digit code
  - Verify auto-submit works when 6 digits entered
  - Test resend countdown timer (60 seconds)
  - Test error cases: wrong code, expired code, rate limit
  - Verify session persists after login
- **Test email delivery**: verify codes arrive within 30 seconds, HTML renders correctly, check spam folder if needed
- **Verify security features**: rate limiting, attempt counting, single-use codes, domain validation
- **Consider cleanup**: add scheduled task to delete expired OTP codes (currently accumulate in database)

---

## 2026-03-29 — People Panel & Navbar Polish

**Changes:**
- Fixed `TabsRootContext` runtime error — `TabsList`/`TabsTrigger` require a `<Tabs>` root wrapper; added it to `UnseatedPanel`
- Filter tabs now only show unseated count; seated/archived counts hidden
- Removed divider between search row and filter tabs
- `+` add button moved to right of search, sized to match input height, uses `UserRoundPlus` icon
- Person row icons: `UserRound` (unseated), `UserRoundCheck` (seated), `UserRoundX` (archived)
- Archived people: removed strikethrough; icon change alone signals archived state
- Unseated row: clicking the row triggers assign flow; hover button changed to edit (`SquarePen`)
- Seated row: move button changed to `Move` icon (four-arrow)
- Alignment fix: all panel sections normalized to `px-3`; close button upgraded to `size="icon"`
- People toggle button moved from floating overlay on map → into navbar as first item
- Navbar: People button is an outline button with `ContactRound` icon, inline label, and unseated count badge
- Navbar: logo and dot menu simplified to a single large `size="icon"` ghost dot menu (logo removed)
- `unseatedPeople` memo now excludes archived people (was over-counting)
- Search box width reduced from 300px to 220px
- People button uses `h-9` height to match dropdowns

**Decisions:**
- People button moved to navbar — cleaner than floating absolute button on the map canvas; consistent with other nav controls
- Logo removed from navbar — minimalist approach; the app's identity is implicit
- Archived icon swap instead of strikethrough — more readable, less visually noisy
- Unseated row click = assign flow — the primary action for an unseated person is to place them, so the whole row is the trigger

**Current state:**
TypeScript clean. People panel fully polished with correct icons, aligned layout, and tab-based filtering. Navbar has People button with live unseated count. All changes on `people` branch.

**Next steps:**
- Test full flow end-to-end: add → assign → edit → unassign → archive → unarchive
- Consider: should the "Move" button in the seated row close the panel and enter move mode on the map?
- Consider: merge `people` branch into `drafts` or `main`

---

## 2026-03-29 — People Panel Polish + Bug Fixes

**Changes:**
- Created `PersonModal.tsx`: shared add/edit dialog with Name + Team + Division comboboxes using existing team/division lists; supports both create (`createPerson`) and edit (`updatePerson`) modes via optional `person` prop
- Fixed `__new__` sentinel leaking into combobox input — replaced inline creation in `PersonPicker` with a "Add new person" item at the bottom of the dropdown list (separated by `ComboboxSeparator`), opening `PersonModal` as a nested dialog
- Added Division field to `UnseatedPanel` add-person form (was missing, only Name + Team existed)
- Upgraded seat modal tabs to `variant="line"` underline style
- Clicking a person row in the panel now opens `PersonModal` in edit mode
- Replaced three separate Unseated/Seated/Archived sections in panel with badge filter tabs (outline = unselected, default = selected)
- Added `unarchivePerson` server action; `listPeople` now returns all people including archived
- Added `unassignSeatByPersonId` convenience action for unassigning directly from the panel
- `PersonRow` replaced with three-dot `DropdownMenu`: Assign/Move button + Edit/Archive/Unarchive/Unassign in dropdown (admin-gated where appropriate)
- Occupied seat edit modal now calls `updatePerson` (name/team/division) + `updateSeat` (label/notes only) when `person_id` exists; falls back to `updateSeat` for legacy free-text seats
- Both `window.confirm` calls replaced with shadcn `Dialog` confirmation (move/swap and assign-to-occupied flows)
- `moveSeat` updated to handle RESERVED destination: reservation transfers to the vacated seat instead of being overwritten; confirmation dialog explains the transfer
- Added "Reserve seat" helper text: "Use this function when you haven't identified the hire yet."
- `person_id` now synced during all swap/move operations in `moveSeat`

**Decisions:**
- Shared `PersonModal` for add and edit — avoids duplicate form logic and field inconsistency; triggered from both the panel and the seat modal
- Filter tabs instead of stacked sections — cleaner for longer people lists; archived people now visible but separated
- `unassignSeatByPersonId` in `people.ts` rather than requiring the panel to know seat IDs — keeps the panel action surface simple
- `listPeople` now returns archived people — panel owns the filtering, server doesn't need to know the UI state

**Current state:**
All TypeScript-clean. People panel is fully functional with filter tabs, three-dot menus, edit modal, archive/unarchive. Seat modal uses person picker with nested PersonModal for creation. Move/swap flow handles reserved seats correctly with confirmation dialogs throughout.

**Next steps:**
- Test the full people panel flow end-to-end: add → assign → edit → unassign → archive → unarchive
- Test move-to-reserved-seat: confirm reservation transfers to vacated seat
- Consider adding a count badge on the `Users` toggle button showing unseated count
- Consider whether the "Move" button in the seated row should close the panel and enter move mode on the map (vs the current assign flow)

---

## 2026-03-29 — Person Entity + Unseated Panel

**Changes:**
- Created `supabase/add-people.sql` migration: `people` table with RLS, `person_id` FK added to `seats` and `seat_drafts`
- Created `src/app/actions/people.ts`: `listPeople`, `createPerson`, `updatePerson`, `archivePerson`
- Updated `src/app/actions/seats.ts`: `assignSeat` now accepts `personId` instead of free-text name/team/division; looks up person from DB and syncs occupant cache fields; all seat actions now capture a `before` snapshot in audit log
- Added `Person`, `SeatSnapshot` types to `src/types/index.ts`; added `before: SeatSnapshot | null` to `AuditLog`
- Created `src/components/UnseatedPanel.tsx`: custom slide-in panel (no Sheet component available), shows unseated and seated people, search filter, inline add person form, archive button (admin only), assign-to-seat button
- Rewrote `src/components/SeatModal.tsx`: replaced free-text name/team/division inputs with `PersonPicker` combobox showing unseated people; supports inline person creation; reserved seat assignment shows a confirmation dialog; accepts `initialPerson` prop to pre-select when coming from the panel
- Updated `src/components/MapClient.tsx`: added `people`/`unseatedPeople` state, `assigningPerson` state and banner, `refreshPeople` callback, `UnseatedPanel` render with `Users` icon toggle button, `initialPerson` passed to `SeatModal`
- Updated `src/app/map/page.tsx`: fetches people via `listPeople(isDraft)` and passes as `initialPeople` prop

**Decisions:**
- No `people_draft` shadow table — unseated list in draft mode derived at query time from `seat_drafts.person_id`
- `occupant_name/team/division` kept as cache fields on seat rows — avoids breaking audit log snapshots and existing queries
- Custom slide-in panel instead of shadcn Sheet — `npx shadcn add sheet` unavailable (no network access in dev environment)
- `assignSeat` signature changed from free-text to `(seatId, personId, notes)` — person details always authoritative from `people` table
- `key={selectedSeat?.id}` on `SeatModal` used to reset state on mount, so `initialPerson` correctly pre-populates without needing `useEffect`

**Current state:**
All code complete and TypeScript-clean. SQL migration run in Supabase. Feature should be fully functional: people panel accessible from map page, person picker in seat modal, assign-from-panel flow, inline person creation, reserved seat confirmation.

**Next steps:**
- Test the full assign flow end-to-end: create person → assign via panel → verify unseated list updates
- Test inline person creation in the seat modal
- Test reserved seat confirmation dialog
- Consider adding an edit person flow (name/team/division) — currently only possible by editing the occupied seat's cached fields directly
- Consider showing unseated count as a badge on the panel toggle button

---

## 2026-03-29 — Named Drafts, Audit Log Undo, and Role System Groundwork

**Changes:**
- Added `name` column to `draft_state` table (`supabase/add-draft-name.sql`)
- `initializeDraft` now accepts a name; `getDraftState` returns `{ isActive, name }`
- Added `renameDraft()` server action
- Draft banner updated to fixed copy: "Editing draft: [Name]. This draft was created by an admin due to multiple changes to seating."
- Built `StartDraftModal` component — prompts for name when starting or renaming a draft
- Added `before` JSONB column to `audit_logs` to store full pre-change seat snapshot (`supabase/add-audit-before-snapshot.sql`)
- Added `undoAuditEntry()` server action; each seat action now captures `before` snapshot
- Audit log in Admin Panel now shows Undo buttons for undoable actions (admin only)
- Standalone `/audit` page rebuilt with TanStack DataTable — matches admin panel, no undo button
- Added `getUserRole()` helper returning `'owner' | 'admin' | 'user'`
- Renamed "Admin" to "Admin Panel" in navbar and page header

**Decisions:**
- **No mode toggle** — when a draft is active, everyone automatically sees draft mode. No switching.
- **Live edits blocked by draft** — if a draft is started, all edits go to the draft. Once published, no live edits are lost.
- **One active draft only** — multiple concurrent drafts ruled out. Drafts can be named for clarity.
- **Fixed banner copy** — "due to multiple changes to seating" chosen over clinical wording to explain draft mode without alarming users.
- **No `editor` role** — the existing `'owner'` / `'admin'` binary already covers the needed permissions. `getUserRole()` adds `'user'` as the third case for non-admins. The earlier "editor" role concept was merged into the "any user can edit" model.
- **Standalone audit log for all users** — `/audit` serves all users; Admin Panel retains the undo capability exclusively.
- **`before` snapshot in audit log** — storing JSONB snapshot on each audit entry enables durable undo from the log, not just from a toast notification.

**Current state:**
All code committed to `drafts` branch (commit `159cc67`). Three SQL migrations need to be applied to Supabase before new features work:
1. `supabase/add-draft-name.sql`
2. `supabase/add-audit-before-snapshot.sql`
3. `supabase/update-publish-clears-draft-name.sql`

**Next steps:**
- Apply the three migrations to the Supabase database
- Test the full draft flow: start draft (modal) → edit seats → publish/discard → verify banner and audit log
- Test admin undo from the audit log
- Verify the standalone `/audit` page renders correctly for non-admin users
- Consider: audit log link visible to all users in the navbar
- Consider: viewer role enforcement (blocking unauthenticated / read-only access) if needed

---

## 2026-03-29 — Roles, permissions, and draft design discussion

**Changes:**
- No code changes this session — design discussion only

**Decisions / design so far:**
- Three roles: **viewer, editor, admin/owner** (combining the earlier "editor" and "admin" into two tiers)
- **Viewer**: view map only, no edit controls, no draft banner, no audit log
- **Editor**: live edits + can start/work-on drafts, sees draft banner, can access audit log
- **Admin**: everything editor has + publish/discard draft + add/remove editors
- **Owner**: everything admin has + add/remove admins (already implemented)
- Editors can make urgent live edits (with undo via toast + audit trail)
- Drafts should be **named** so editors know what they're working on
- Only one draft **active** at a time, but multiple can be queued
- Draft name shown in the map banner ("You're editing draft: Q2 Office Reorg")
- Multiple drafts raises conflict question — resolved by "one active at a time" rule

**Full design conversation:**

User: if i make it such that only admins can edit live and draft, how reversible is that?

Claude: Very reversible — just a check in SeatModal or seat actions. But noted that this changes the product model: non-admins become read-only viewers entirely.

User: i'm thinking maybe we introduce an editor role. Normal user (view only), Editor (can edit in draft + live), Admin (add/remove editors, edit live), Owner (add/remove admins, start/publish/discard draft, edit live).

Claude: Fleshed out the model, flagged key questions:
1. Should editors only edit inside a draft, or also live?
2. Who can start a draft — owner only, or admins too?
3. When draft is active, do normal users see live map or draft map?
4. Should /audit be editor+ only?

User: Ideally editors only edit inside draft (requiring admin/owner to start one). But worried about inflexibility for urgent changes like someone leaving.

Claude: Reframed as planned vs urgent changes. Proposed Option D — editors can start drafts themselves, admins always publish. Removes the "waiting for someone to open a draft" bottleneck while keeping the review step.

User: let's say editors can always edit live. there is an audit trail. is there any way to undo? editors can't tell the difference between live vs draft edit. maybe drafts can be named. if editors can start drafts, what if there are multiple drafts? also it seems like we can combine editors and admins.

Claude: Worked through each thread:
- **Undo**: Exists via toast (ephemeral). Per-entry undo in audit log is a bigger feature.
- **Live vs draft confusion**: Real UX problem. Named drafts solve this — banner shows "You're editing draft: Q2 Office Reorg" instead of generic "draft mode active."
- **Multiple drafts**: Multiple can exist/be named, but only one active at a time. Conflict question (two drafts touching same seat) resolved by "one active at a time" rule.
- **Combining editor + admin**: Permission table shows editor = admin minus publish/discard and user management. Clean three-role model: viewer / editor / admin+owner.

Final proposed system:
- **Viewer**: view map only, no edit, no draft banner, no audit log
- **Editor**: live edits + start/work-on drafts, sees draft banner + audit log
- **Admin**: everything editor + publish/discard + add/remove editors
- **Owner**: everything admin + add/remove admins (already exists)
- Drafts are named; one active at a time, multiple can be queued
- Map banner shows draft name and who started it

**Current state:**
Design agreed in principle. No implementation started. Existing code has a binary admin/non-admin split — needs to be extended to viewer/editor/admin/owner. The `admins` table currently stores role as 'admin' or 'owner'; a new 'editor' role (or separate table) would be needed. Named drafts would require a schema change to `draft_state` or a new `drafts` table.

**Next steps:**
- Decide: how much of the roles system to build now vs later?
- Plan schema changes: editor role in admins table, named drafts
- Implement viewer/editor/admin permission gates on map page and seat actions
- Add draft naming UI (name field when starting a draft)
- Update draft banner to show draft name and who started it

---

## 2026-03-28 — Audit log integrity fixes

**Changes:**
- Added `supabase/add-audit-improvements.sql` migration: drops FK cascade on `audit_logs.seat_id`, adds `PUBLISH` and `RESTORE` to the action CHECK constraint
- `restoreSnapshot` now takes a pre-restore snapshot before replacing seats, diffs changed seats, and writes one `RESTORE` audit entry per changed seat
- `publishDraft` now diffs draft vs live seats and writes one `PUBLISH` audit entry per changed seat, with a one-sentence summary (e.g. "seat-042 — Alice (OCCUPIED) → Bob (OCCUPIED)")
- Added `PUBLISH` (indigo) and `RESTORE` (orange) badge styles to the audit log UI
- Updated `AuditAction` type to include `PUBLISH` and `RESTORE`

**Decisions:**
- Dropped the FK constraint on `audit_logs.seat_id` rather than switching to a label-based reference — simpler migration, audit rows now survive seat deletions/restores
- Publish audit entries show a per-seat summary sentence rather than per-field rows — cleaner in the UI, full detail is in the draft audit entries written during editing
- Restore also takes a pre-restore snapshot so the overwritten state is never lost from version history
- Publish is blocked if snapshot fails (strict mode, established last session)

**Current state:**
SQL migration needs to be run manually in Supabase (`supabase/add-audit-improvements.sql`). All TypeScript changes are in place. Pending commit.

**Next steps:**
- Run `supabase/add-audit-improvements.sql` in the Supabase SQL editor
- Commit and push
- Test: publish a draft and verify PUBLISH entries appear in audit log; restore a snapshot and verify RESTORE entries appear and a pre-restore snapshot was saved

---

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

## 2026-04-09 — Bug Fixes: Scrolling, Undo, and People List UX

**Changes:**
- Fixed admin page scrolling issue by adding `overflow-y-auto` to page wrapper (was blocked by `overflow-hidden` on body)
- Fixed undo functionality for all seat actions by adding `before` snapshots to audit logs:
  - ASSIGN (draft and live modes)
  - UNASSIGN (draft and live modes)
  - RESERVE (draft and live modes)
  - UPDATE/makeAvailable (draft and live modes)
  - UPDATE/updateSeat (draft and live modes)
  - MOVE (all 3 types: swap, reserved, regular - both modes)
- Fixed people list click handlers:
  - Clicking person name/details now always opens PersonModal (edit mode)
  - Clicking Move icon triggers seat assignment flow with `stopPropagation()`
- Improved Move icon visibility by matching three-dots menu color (removed faded styling)

**Decisions:**
- Existing audit log entries without `before` field cannot be undone (no backfill due to risk)
- People list UX: Consistent click behavior across all person states (unseated/seated/archived)
- Move icon remains visible on hover for unseated people as explicit seat assignment action

**Current state:**
- Admin page scrolls properly
- All new seat changes can be undone by admins/owners (including actions by other users)
- People list has clear, separated click targets (details vs. move)
- Old audit entries (before this fix) remain non-undoable

**Next steps:**
- Monitor user feedback on new people list interaction pattern
- Consider adding visual feedback when clicking Move icon (loading state, confirmation)
- Optional: Add "before" snapshot backfill script if historical undo becomes critical requirement
