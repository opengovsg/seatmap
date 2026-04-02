import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface CSVRow {
  Name: string
  'Job Title': string
  Team: string
  Division: string
}

async function importPeople(csvPath: string) {
  // Initialize Supabase admin client
  const db = createClient(supabaseUrl, serviceRoleKey)

  // Read and parse CSV
  const csvContent = readFileSync(csvPath, 'utf-8')
  const records: CSVRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

  console.log(`Found ${records.length} rows in CSV`)

  // Get existing people names for deduplication
  const { data: existingPeople } = await db
    .from('people')
    .select('name')

  const existingNames = new Set(
    existingPeople?.map((p) => p.name.toLowerCase()) || []
  )

  // Filter out people who already exist
  const newPeople = records
    .filter((row) => {
      const nameExists = existingNames.has(row.Name.toLowerCase())
      if (nameExists) {
        console.log(`⏭️  Skipping ${row.Name} (already exists)`)
      }
      return !nameExists
    })
    .map((row) => ({
      name: row.Name.trim(),
      job_title: row['Job Title'].trim() || null,
      team: row.Team.trim() || null,
      division: row.Division.trim() || null,
      is_archived: false,
      // Note: No person_id means they're unseated by default
      // People will appear in the unseated list after import
    }))

  console.log(`Importing ${newPeople.length} new people...`)

  if (newPeople.length === 0) {
    console.log('✅ No new people to import')
    return
  }

  // Batch insert (100 rows at a time)
  const batchSize = 100
  let imported = 0
  let failed = 0

  for (let i = 0; i < newPeople.length; i += batchSize) {
    const batch = newPeople.slice(i, i + batchSize)

    const { error } = await db.from('people').insert(batch)

    if (error) {
      console.error(`❌ Batch ${i / batchSize + 1} failed:`, error.message)
      failed += batch.length
    } else {
      imported += batch.length
      console.log(`✅ Batch ${i / batchSize + 1}: Imported ${batch.length} people`)
    }
  }

  console.log('\n📊 Import Summary:')
  console.log(`   Total rows in CSV: ${records.length}`)
  console.log(`   Skipped (duplicates): ${records.length - newPeople.length}`)
  console.log(`   Successfully imported: ${imported}`)
  console.log(`   Failed: ${failed}`)
}

// Run the import
const csvPath = process.argv[2]

if (!csvPath) {
  console.error('Usage: npm run import-people <path-to-csv>')
  process.exit(1)
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const absolutePath = path.resolve(process.cwd(), csvPath)
importPeople(absolutePath).catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
