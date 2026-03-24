/**
 * One-time seed script: parses floor-plan.svg, detects seat rects,
 * injects IDs into the SVG, and populates the Supabase database.
 *
 * Run with: npx ts-node scripts/seed.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { parseSvg } from '../src/lib/svg-parser'

// Load .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

// Use service role key to bypass RLS for seeding
const supabase = createClient(supabaseUrl, serviceRoleKey)

async function seed() {
  console.log('Reading floor-plan.svg...')
  const svgPath = path.join(__dirname, '..', 'floor-plan.svg')
  const svgContent = fs.readFileSync(svgPath, 'utf-8')

  console.log('Parsing SVG...')
  const { modifiedSvg, seats, unmatched } = parseSvg(svgContent)

  console.log(`Found ${seats.length} seats`)
  if (unmatched > 0) {
    console.log(`  (${unmatched} non-matching coloured rects were ignored)`)
  }

  if (seats.length === 0) {
    console.error('No seats found. Check the colour matching in src/lib/svg-colours.ts')
    process.exit(1)
  }

  // Check if a floor already exists
  const { data: existingFloors } = await supabase.from('floors').select('id').limit(1)
  if (existingFloors && existingFloors.length > 0) {
    console.error('A floor already exists in the database. To re-seed, delete all rows from seats and floors first.')
    process.exit(1)
  }

  // Insert floor
  console.log('Inserting floor...')
  const { data: floor, error: floorError } = await supabase
    .from('floors')
    .insert({ name: 'Level 5', svg_content: modifiedSvg })
    .select()
    .single()

  if (floorError || !floor) {
    console.error('Failed to insert floor:', floorError)
    process.exit(1)
  }

  // Insert seats in batches
  console.log('Inserting seats...')
  const seatRows = seats.map((s) => ({
    floor_id: floor.id,
    svg_rect_id: s.svgRectId,
    label: s.svgRectId,
    status: 'AVAILABLE',
  }))

  const { error: seatsError } = await supabase.from('seats').insert(seatRows)

  if (seatsError) {
    console.error('Failed to insert seats:', seatsError)
    process.exit(1)
  }

  console.log(`\nDone! Seeded ${seats.length} seats for floor "${floor.name}" (id: ${floor.id})`)
}

seed().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
