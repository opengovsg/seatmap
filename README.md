# SeatMap

An office seat management tool. View the floor plan, assign people to seats, reserve seats, and track changes via an audit log.

## Features

- Interactive SVG floor plan with colour-coded seats (available, occupied, reserved)
- Assign, move, and unassign people from seats
- Full audit log of every change, with one-click undo
- Draft mode — rearrange seats privately before publishing to the live map
- Floor plan snapshots and rollback
- People panel showing the full roster and who is unseated
- Admin panel for managing users, audit logs, and floor plan versions

## Tech stack

- [Next.js](https://nextjs.org) (App Router, Server Actions)
- [React 19](https://react.dev)
- [Supabase](https://supabase.com) — PostgreSQL database and magic link authentication
- [Tailwind CSS 4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) component library

## Environment setup

Create a `.env.local` file in the project root with the following variables. You'll find all of them in your Supabase project under **Settings → API**.

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
POSTMAN_API_KEY=your-postman-api-key
POSTMAN_FROM_EMAIL=seatmap@open.gov.sg
```

## Database setup

Run the following SQL files in order in the Supabase SQL editor:

1. `supabase/schema.sql` — core tables and policies
2. `supabase/add-floor-snapshots.sql` — floor plan versioning
3. `supabase/add-admins.sql` — admin user management
4. `supabase/add-audit-before-snapshot.sql`
5. `supabase/add-audit-improvements.sql`
6. `supabase/add-draft.sql` — draft mode
7. `supabase/add-draft-name.sql`
8. `supabase/add-draft-started-at.sql`
9. `supabase/update-publish-clears-draft-name.sql`
10. `supabase/add-people.sql` — people/roster management
11. `supabase/add-otp-codes.sql` — OTP authentication
12. `supabase/add-job-title.sql` — add job title field to people

Then seed the database with your floor plan:

```bash
npm run seed
```

## Authentication

Login uses OTP codes sent via Postman email API. Users enter their email, receive a 6-digit code, and authenticate by entering it — no password required.

By default, only `@open.gov.sg` email addresses are allowed. To change the allowed domain, update the `isAllowedEmail` function in both `src/app/login/page.tsx` and `src/app/api/auth/request-otp/route.ts`.

## Admin access

The first admin must be added directly in the Supabase database. Run this in the SQL editor, substituting your email:

```sql
INSERT INTO admins (email, role) VALUES ('you@open.gov.sg', 'owner');
```

After that, you can add and remove other admins from the Admin panel at `/admin`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to the login page — enter your work email to receive a magic link.

## Updating the floor plan

When you get a new SVG from the designer, use the safe update script rather than re-seeding. It preserves all existing seat assignments and only changes what's different.

### How to update

1. Replace `floor-plan.svg` in the project root with the new file
2. Run the update script:

```bash
npm run update-floor
```

The script will:
- Save a snapshot of the current state before making any changes
- Keep all existing seat assignments untouched
- Add any new seats from the SVG as Available
- Warn you about any seats that are no longer in the new SVG (but won't delete them)

### Rolling back

If something looks wrong after an update, you can restore any previous version:

```bash
# See all saved snapshots
npm run list-snapshots

# Restore a specific snapshot by ID
npm run restore-snapshot <snapshot-id>
```

Restoring rolls back both the SVG and all seat data (assignments, reservations, notes) to exactly the state they were in when the snapshot was taken.

## Importing People from CSV

To bulk import employees from a CSV file:

1. Prepare a CSV with these columns (exact header names required):
   - `Name` (required)
   - `Job Title` (optional)
   - `Team` (optional)
   - `Division` (optional)

2. Make sure the database migration is run (step 12 in Database Setup above):
   ```bash
   # In Supabase SQL editor, run: supabase/add-job-title.sql
   ```

3. Run the import script:
   ```bash
   npm run import-people path/to/employees.csv
   ```

**Import behavior:**
- Skips people who already exist (matched by name, case-insensitive)
- All imported people start as **unseated** (no seat assignment)
- Empty cells treated as null
- Imports in batches of 100 for reliability
- Shows summary of imported/skipped/failed rows

**Example CSV format:**
```
Name,Job Title,Team,Division
Alice Johnson,Senior Engineer,Engineering,Technology
Bob Smith,Product Manager,Product,Business
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run seed` | First-time setup: parse SVG and populate the database |
| `npm run update-floor` | Safely update the floor plan SVG without losing seat data |
| `npm run list-snapshots` | List all saved floor plan snapshots |
| `npm run restore-snapshot <id>` | Roll back to a previous snapshot |
| `npm run import-people <csv-path>` | Bulk import employees from CSV file |
