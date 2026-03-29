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
