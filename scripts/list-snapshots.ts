/**
 * Lists all floor snapshots with their IDs and timestamps.
 *
 * Run with:
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

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function listSnapshots() {
  const { data, error } = await supabase
    .from('floor_snapshots')
    .select('id, created_at, seat_data')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load snapshots:', error)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.log('No snapshots found.')
    return
  }

  console.log(`\n${data.length} snapshot(s) found:\n`)
  data.forEach((snap, i) => {
    const date     = new Date(snap.created_at).toLocaleString()
    const seatCount = Array.isArray(snap.seat_data) ? snap.seat_data.length : '?'
    console.log(`  ${i + 1}. ${date}`)
    console.log(`     id:    ${snap.id}`)
    console.log(`     seats: ${seatCount}`)
    console.log()
  })

  console.log('To restore a snapshot:')
  console.log('  npx ts-node scripts/restore-snapshot.ts <id>\n')
}

listSnapshots().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
