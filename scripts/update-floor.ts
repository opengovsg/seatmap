/**
 * Safe floor-plan updater.
 *
 * Replaces the stored SVG with a new floor-plan.svg WITHOUT wiping seat data:
 *   - Existing seats whose svg_rect_id still exists in the new SVG are left untouched
 *   - New seats found in the SVG are inserted as AVAILABLE
 *   - Seats whose svg_rect_id is gone from the new SVG are listed as warnings (not deleted)
 *
 * A full snapshot of the current SVG + seat data is saved BEFORE any changes,
 * so you can always roll back with:
 *   npx ts-node scripts/restore-snapshot.ts <snapshot-id>
 *
 * Run with:
 *   npx ts-node scripts/update-floor.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { parseSvg } from '../src/lib/svg-parser'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function updateFloor() {
  // ── 1. Load current floor from DB ────────────────────────────────────────────
  const { data: floor, error: floorErr } = await supabase
    .from('floors')
    .select('id, name, svg_content')
    .single()

  if (floorErr || !floor) {
    console.error('No floor found in database. Run seed.ts first.', floorErr)
    process.exit(1)
  }

  // ── 2. Load current seats ─────────────────────────────────────────────────────
  const { data: existingSeats, error: seatsErr } = await supabase
    .from('seats')
    .select('*')

  if (seatsErr || !existingSeats) {
    console.error('Failed to load seats:', seatsErr)
    process.exit(1)
  }

  // ── 3. Save snapshot BEFORE making any changes ────────────────────────────────
  const { data: snapshot, error: snapErr } = await supabase
    .from('floor_snapshots')
    .insert({
      floor_id:    floor.id,
      svg_content: floor.svg_content,
      seat_data:   existingSeats,
    })
    .select('id, created_at')
    .single()

  if (snapErr || !snapshot) {
    console.error('Failed to save snapshot — aborting to be safe.', snapErr)
    process.exit(1)
  }

  console.log(`\n✓ Snapshot saved (id: ${snapshot.id})`)
  console.log(`  Roll back any time with:`)
  console.log(`  npx ts-node scripts/restore-snapshot.ts ${snapshot.id}\n`)

  // ── 4. Parse the new SVG ─────────────────────────────────────────────────────
  const svgPath = path.join(__dirname, '..', 'floor-plan.svg')
  if (!fs.existsSync(svgPath)) {
    console.error('floor-plan.svg not found at project root.')
    process.exit(1)
  }

  const svgContent = fs.readFileSync(svgPath, 'utf-8')
  const { modifiedSvg, seats: newSeats, unmatched } = parseSvg(svgContent)

  if (unmatched > 0) console.log(`  (${unmatched} non-seat coloured rects ignored)`)
  if (newSeats.length === 0) {
    console.error('No seats found in new SVG. Check colour matching in svg-colours.ts')
    process.exit(1)
  }

  // ── 5. Diff old vs new seat IDs ───────────────────────────────────────────────
  const newIds      = new Set(newSeats.map(s => s.svgRectId))
  const existingIds = new Set(existingSeats.map(s => s.svg_rect_id))

  const kept    = [...newIds].filter(id => existingIds.has(id))
  const added   = [...newIds].filter(id => !existingIds.has(id))
  const removed = [...existingIds].filter(id => !newIds.has(id))

  // ── 6. Update SVG content on the floor ───────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('floors')
    .update({ svg_content: modifiedSvg })
    .eq('id', floor.id)

  if (updateErr) {
    console.error('Failed to update floor SVG:', updateErr)
    process.exit(1)
  }

  // ── 7. Insert new seats ───────────────────────────────────────────────────────
  if (added.length > 0) {
    const newRows = added.map(id => ({
      floor_id:    floor.id,
      svg_rect_id: id,
      label:       id,
      status:      'AVAILABLE',
    }))

    const { error: insertErr } = await supabase.from('seats').insert(newRows)
    if (insertErr) {
      console.error('Failed to insert new seats:', insertErr)
      process.exit(1)
    }
  }

  // ── 8. Report ─────────────────────────────────────────────────────────────────
  console.log('─────────────────────────────────────────')
  console.log(`✓ ${kept.length} seats preserved (data intact)`)
  if (added.length)   console.log(`+ ${added.length} new seats added as AVAILABLE`)
  if (removed.length) {
    console.log(`\n⚠  ${removed.length} seat(s) no longer in the new SVG (NOT deleted):`)
    removed.forEach(id => console.log(`   - ${id}`))
    console.log('\n   These seats still exist in the database with their data.')
    console.log('   Delete them manually in Supabase if they are no longer needed.')
  }
  console.log('─────────────────────────────────────────\n')
}

updateFloor().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
