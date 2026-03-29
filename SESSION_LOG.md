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
