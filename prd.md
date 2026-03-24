# SeatMap — OGP Office Seat Management Tool

## Problem

There's no single source of truth for which seats in the OGP office are occupied, available, or reserved. When new joiners arrive, the corp team has to manually check around to figure out where to put them. This tool fixes that by providing a visual, always-up-to-date seat map that anyone can view and editors can manage.

## Project Setup

### Stack (inherited from starter kit):

- shadcn/ui

### Auth

- login via Supabase magic link

### Deployment:

- Vercel for initial deployment (quick prototype)

## Data Model

## Design Decisions

- There is no person model
- Seat positions are NOT stored in the database — they live in the SVG. The SVG is the layout source of truth, the DB is the status/assignment source of truth
- `svgRectId` links each DB seat record to its corresponding `<rect>` element in the SVG
- `seatType` is derived from SVG colour on initial parse (blue → REGULAR, purple → HOT_DESK) and stored in DB. `HOT_DESK` is a seat type, not a status — hot desks can still be AVAILABLE, OCCUPIED, or RESERVED
- `Floor` model exists even though MVP is single-floor — avoids painful migration later
- `team` on Person is free text but should offer autocomplete from existing values in the UI
- SVG content stored directly in DB as text — no file upload or blob storage needed

## Features — MVP

### 1. Editor: Seat Management

SVG floor plan in the main area. Top navigation area with search and filters.

#### SVG Map (main area)

- SVG rendered inline in the page (not as an `<img>`) so individual `<rect>` elements can be styled
- On load, fetch all seats from DB with occupant details, then compute display status for each seat and set its `fill` colour:
  - 🟢 Green = Available (no occupant, status = AVAILABLE)
  - 🔴 Red = Occupied (has occupant, joinDate is null or past)
  - 🟡 Yellow/Amber = Reserved — either manual hold (no occupant, status = RESERVED) or auto-derived (has occupant with future joinDate)
- Hovering a seat rect shows a tooltip: seat label, seat type, display status, occupant name + team (if assigned), join date (if future), notes
- Clicking a seat rect opens a detail panel/popover with full info
- Legend showing colour meanings + seat type indicators

#### Search & Filter

- Search by occupant name or seat label (most users are going to search by name. Matching seats are highlighted on the map.
- Filter by status (Available / Occupied / Reserved)
- Filter/highlight by team — selecting a team (e.g. "Pair") highlights all seats for that team on the map and filters the sidebar. Non-matching seats are dimmed on the map, not hidden, so spatial context is preserved
- Summary stats bar: "42 occupied · 8 available · 3 reserved" with hot desk count shown separately. Stats update to reflect active filters. This is located in the top navigation area, to the right of the filters.

#### Manage seats

- Click a seat rect on the SVG to edit: change status, enter Occupant name, update seat notes, join date, leave date
- Editing actions are displayed in a modal window
- On hover, show a tooltip with the following information:
  - Seat label
  - Seat type
  - Display status
  - Occupant name + team (if assigned)
  - Join date (if future)
  - Notes
- **Assign person to seat:** Click an available seat → enter name of person (free text) → seat becomes Occupied
- **Move person:** Click an occupied seat → "Move" → click destination seat → person is moved, old seat auto-vacates to Available. If the destination seat is occupied, the displaced person swaps seats with the person who was in the old seat. The system handles this in a single transaction.
- **Unassign person:** Click an occupied seat → "Unassign" → person field is cleared, seat becomes Available
- **Remove person:** For leavers — clear the Person field. Seat becomes Available.
- Editors can rename seat labels if the auto-generated ones aren't useful
- Leave date is optional. If provided, the seat will become Available on the leave date. If not provided, the seat will remain Occupied until the editor manually changes the status to Available.

### 2. SVG Import

- Floor plan comes in the form of an SVG file
- For the MVP, the SVG file is hardcoded in the app. It's a file that I will provide. There is no upload functionality in the MVP.
- App parses the SVG, auto-detects all `<rect>` elements by fill colour:
  - Blue rects → REGULAR seats, labelled `seat-001`, `seat-002`, etc.
- Rects are detected by fill colour. Define acceptable colour ranges in config (e.g. blue = `#0000FF`-ish). Log any rects that don't match for manual review.
- App injects an `id` attribute into each detected rect in the SVG (e.g. `id="seat-001"`) and stores the modified SVG in the DB
- Creates corresponding Seat records in the DB
- Editor reviews the detected seats (count, positions look right) before confirming
- Re-importing an SVG should detect new/removed rects and reconcile with existing seat records

### 3. Audit Log Viewer

**All edits automatically create an AuditLog entry.**

Simple chronological feed of changes.

**Behaviour:**

- Reverse-chronological list of changes
- Each entry shows: timestamp, who changed it, what seat, what changed (old → new)
- Filter by seat label or by editor email
- Paginated (20 per page)

## Access Control

**For MVP, scope this out but don't fully implement. Plan for it in the architecture.**

Current approach (MVP):

- Anyone logged in can edit

Future approach (post-MVP):

- Role-based: `VIEWER` (default), `EDITOR`, `ADMIN`
- Editors are explicitly added by admins
- Consider restricting to specific email domains or a whitelist

## Technical Notes

### SVG Floor Plan Rendering

- Render SVG inline using `dangerouslySetInnerHTML` (sanitise first!) or a React SVG parser
- On the client, after render, query all seat rects by their `id` attribute and attach event listeners (hover, click)
- To colour a seat: `document.getElementById(svgRectId).setAttribute('fill', statusColour)`
- Or better: use React refs and manipulate the SVG DOM via React, not raw DOM queries
- SVG should be responsive — use `viewBox` and let it scale to container width

### SVG Parsing (Server-side)

// is this still needed with no svg upload in the mvp?

- Parse SVG on the server during import using a library like `svg-parser` or `cheerio`
- Detect `<rect>` elements by their `fill` attribute:
  - Blue-ish fills (configurable threshold) → REGULAR seats
- Also detect `<rect>` elements inside `<g>` groups — the SVG may have nested structure
- Handle both hex colours (`#0000FF`) and named colours (`blue`) and rgb() notation
- Assign sequential IDs: `seat-001`, `seat-002`, `hotseat-001`, etc.
- Inject `id` attributes into the SVG markup before storing
- Return a summary to the editor: "Found 48 regular seats and 6 hot desks"

### SVG Colour Config

Define acceptable colour ranges as constants. The user's SVG uses blue for regular desks and purple for hot desks. Be somewhat flexible with matching:

```typescript
const SEAT_COLOUR_CONFIG = {
  REGULAR: {
    description: "Blue rectangles",
    // Match by checking if the fill is "blue-ish"
    match: (fill: string) => isBlueish(fill),
  },
  HOT_DESK: {
    description: "Purple rectangles",
    match: (fill: string) => isPurplish(fill),
  },
};
```

### Seat Operations (Key Workflows)

These are the core actions the system needs to handle cleanly:

**Assign person to seat:**

1. Seat must be Available or manually Reserved
2. User enters name of Occupant
3. Display status auto-derives: OCCUPIED if joinDate is null/past, RESERVED if joinDate is future
4. Audit log: "Alice Chen assigned to seat-012"

**Unassign person from seat:**

1. User clicks "Unassign" button in the seat modal
2. Set `seat.occupantId` → null, `seat.status` → AVAILABLE
3. Audit log: "Alice Chen unassigned from seat-012"

**Move person to another seat (destination is empty):**

1. Vacate old seat: `oldSeat.occupantId` → null, `oldSeat.status` → AVAILABLE
2. Assign new seat: `newSeat.occupantId` → Occupant name (status auto-derives)
3. Single transaction, two audit log entries
4. Audit log: "Alice Chen moved from seat-012 to seat-034"

**Move person to another seat (destination is occupied — displaces someone):**

1. Swap occupants: `oldSeat.occupantId` ↔ `destSeat.occupantId`
2. Both seats update their display status based on the new occupants
3. Single transaction
4. Audit log: "Alice Chen moved from seat-012 to seat-034, swapping with Bob Tan"
5. The UI should warn the editor: "This seat is occupied by Bob Tan. Swap Alice Chen with Bob Tan?"

**Reserve a seat manually (no person):**

1. Seat must be Available (no occupant)
2. Set `seat.status` → RESERVED, add a note explaining why (e.g. "Holding for Design hire")
3. Audit log: "seat-034 reserved — Holding for Design hire"

**Person leaves the company:**

1. If manual removal:
   - Set `seat.occupantId` → null, `seat.status` → AVAILABLE
   - Audit log: "Alice Chen removed, seat-012 vacated"
2. If `leaveDate` is specified:
   - Seat remains OCCUPIED until the `leaveDate` is reached
   - Status auto-derives to AVAILABLE on the `leaveDate`
   - Audit log: "Alice Chen scheduled to leave on [date], seat-012 will be vacated"

### Audit Log Generation

- Create a shared utility `createAuditLog(seatId, action, field, oldValue, newValue, editorEmail)`
- Call this in every seat mutation procedure (in the same transaction where possible)
- Log the editor's email from the session

### Team Autocomplete

- `team` field on Person should offer suggestions from existing unique team values in the database
- Simple tRPC query: `SELECT DISTINCT team FROM Person WHERE team IS NOT NULL`
- This keeps it lightweight — no separate Team model needed

## Out of Scope (Future)

- **Draft seating plans** — Leadership can create draft plans to reorganise seating (e.g. after a reorg or new team spin-up) without affecting the live map. Clone current seat state into a draft, rearrange occupants, then apply when ready. Key details:
  - _Recommended approach:_ Clone-based drafts (Approach A). Clone all Seat records with a `draftId` FK. Edit the clones freely. "Apply" copies draft state back to live seats as a single batch audit log entry. Data duplication is negligible at this scale (~200 seats).
  - _Collaboration:_ TBD — at minimum, shareable read-only link for other leads to review.
  - _Draft lifecycle:_ Create → Edit → Review diff → Apply (or discard). Multiple drafts can exist but only one can be applied at a time.
- **Google Calendar availability integration** — Show real-time seat availability based on whether the assignee is WFH or in-office that day (via Google Calendar). Even if a seat is "occupied" (assigned), viewers could see it's actually free today because the assignee is working from home. This turns the static seat map into a live availability view for hybrid workers.
- Role-based access control (EDITOR / ADMIN roles with explicit assignment)
- Multiple floors/locations
- Seat booking system (temporary reservations for hot desks)
- Integration with HR systems for automatic occupant updates
- CSV import/export of seat assignments
- Notifications (e.g. email when a reserved seat becomes available)
