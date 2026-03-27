/**
 * Restores a floor snapshot: rolls back the SVG content AND all seat data
 * to exactly the state captured in the given snapshot.
 *
 * Run with:
 *   npx ts-node scripts/restore-snapshot.ts <snapshot-id>
 *
 * To list available snapshots:
 *   npx ts-node scripts/list-snapshots.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const snapshotId = process.argv[2]
if (!snapshotId) {
  console.error('Usage: npx ts-node scripts/restore-snapshot.ts <snapshot-id>')
  console.error('Run list-snapshots.ts to see available IDs.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function restoreSnapshot() {
  // ── 1. Load the snapshot ─────────────────────────────────────────────────────
  const { data: snap, error: snapErr } = await supabase
    .from('floor_snapshots')
    .select('id, floor_id, svg_content, seat_data, created_at')
    .eq('id', snapshotId)
    .single()

  if (snapErr || !snap) {
    console.error('Snapshot not found:', snapErr?.message ?? 'no data')
    process.exit(1)
  }

  const snapshotDate = new Date(snap.created_at).toLocaleString()
  console.log(`\nRestoring snapshot from ${snapshotDate} (${snap.id})...`)

  const seats = snap.seat_data as Array<Record<string, unknown>>
  if (!Array.isArray(seats) || seats.length === 0) {
    console.error('Snapshot seat_data is empty or invalid.')
    process.exit(1)
  }

  // ── 2. Save a snapshot of the CURRENT state before overwriting ────────────────
  const { data: currentSeats } = await supabase.from('seats').select('*')
  const { data: currentFloor } = await supabase
    .from('floors').select('svg_content').eq('id', snap.floor_id).single()

  if (currentFloor && currentSeats) {
    await supabase.from('floor_snapshots').insert({
      floor_id:    snap.floor_id,
      svg_content: currentFloor.svg_content,
      seat_data:   currentSeats,
    })
    console.log('✓ Current state backed up as a new snapshot before restore.')
  }

  // ── 3. Restore the SVG on the floor ─────────────────────────────────────────
  const { error: floorErr } = await supabase
    .from('floors')
    .update({ svg_content: snap.svg_content })
    .eq('id', snap.floor_id)

  if (floorErr) {
    console.error('Failed to restore floor SVG:', floorErr)
    process.exit(1)
  }

  // ── 4. Delete current seats and re-insert from snapshot ──────────────────────
  // Delete in a safe order (audit_logs reference seats via FK, but cascade handles it)
  const { error: deleteErr } = await supabase
    .from('seats')
    .delete()
    .eq('floor_id', snap.floor_id)

  if (deleteErr) {
    console.error('Failed to clear current seats:', deleteErr)
    process.exit(1)
  }

  // Re-insert in batches of 100
  const batchSize = 100
  for (let i = 0; i < seats.length; i += batchSize) {
    const batch = seats.slice(i, i + batchSize)
    const { error: insertErr } = await supabase.from('seats').insert(batch)
    if (insertErr) {
      console.error(`Failed to restore seats (batch ${i}):`, insertErr)
      process.exit(1)
    }
  }

  console.log(`✓ Restored ${seats.length} seats`)
  console.log('✓ SVG content restored')
  console.log('\nDone. Refresh the app to see the restored state.\n')
}

restoreSnapshot().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
