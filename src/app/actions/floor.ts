'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { parseSvg } from '@/lib/svg-parser'

async function getEditorEmail(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? 'unknown'
}

export interface UploadResult {
  kept:       number
  added:      number
  removed:    string[]   // list of svg_rect_ids no longer in new SVG
  snapshotId: string
}

export interface Snapshot {
  id:         string
  floor_id:   string
  seat_count: number
  created_at: string
}

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user
}

// ── Upload a new floor plan SVG ───────────────────────────────────────────────
export async function uploadFloor(svgContent: string): Promise<UploadResult> {
  await requireAuth()
  const db = createAdminClient()

  // Load current floor
  const { data: floor, error: floorErr } = await db
    .from('floors')
    .select('id, svg_content')
    .single()

  if (floorErr || !floor) throw new Error('No floor found. Run the seed script first.')

  // Load current seats
  const { data: existingSeats, error: seatsErr } = await db
    .from('seats')
    .select('*')
    .eq('floor_id', floor.id)

  if (seatsErr) throw new Error('Failed to load seats: ' + seatsErr.message)

  // Save snapshot BEFORE making any changes
  const { data: snapshot, error: snapErr } = await db
    .from('floor_snapshots')
    .insert({
      floor_id:    floor.id,
      svg_content: floor.svg_content,
      seat_data:   existingSeats ?? [],
    })
    .select('id')
    .single()

  if (snapErr || !snapshot) throw new Error('Failed to save snapshot: ' + snapErr?.message)

  // Parse the new SVG
  const { modifiedSvg, seats: newSeats } = parseSvg(svgContent)

  if (newSeats.length === 0) {
    throw new Error('No seats found in the uploaded SVG. Check that seat rectangles are the correct colour.')
  }

  // Diff old vs new
  const newIds      = new Set(newSeats.map(s => s.svgRectId))
  const existingIds = new Set((existingSeats ?? []).map((s: { svg_rect_id: string }) => s.svg_rect_id))

  const added   = [...newIds].filter(id => !existingIds.has(id))
  const removed = [...existingIds].filter(id => !newIds.has(id))
  const kept    = [...newIds].filter(id => existingIds.has(id)).length

  // Update the floor SVG
  const { error: updateErr } = await db
    .from('floors')
    .update({ svg_content: modifiedSvg })
    .eq('id', floor.id)

  if (updateErr) throw new Error('Failed to update floor SVG: ' + updateErr.message)

  // Insert only the new seats
  if (added.length > 0) {
    const { error: insertErr } = await db.from('seats').insert(
      added.map(id => ({
        floor_id:    floor.id,
        svg_rect_id: id,
        label:       id,
        status:      'AVAILABLE',
      }))
    )
    if (insertErr) throw new Error('Failed to insert new seats: ' + insertErr.message)
  }

  return { kept, added: added.length, removed, snapshotId: snapshot.id }
}

// ── List all snapshots ────────────────────────────────────────────────────────
export async function listSnapshots(): Promise<Snapshot[]> {
  await requireAuth()
  const db = createAdminClient()

  const { data, error } = await db
    .from('floor_snapshots')
    .select('id, floor_id, seat_data, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error('Failed to load snapshots: ' + error.message)

  return (data ?? []).map(s => ({
    id:         s.id,
    floor_id:   s.floor_id,
    seat_count: Array.isArray(s.seat_data) ? s.seat_data.length : 0,
    created_at: s.created_at,
  }))
}

// ── Restore a snapshot ────────────────────────────────────────────────────────
export async function restoreSnapshot(snapshotId: string): Promise<void> {
  const user = await requireAuth()
  const email = user.email ?? 'unknown'
  const db = createAdminClient()

  // Load the target snapshot
  const { data: snap, error: snapErr } = await db
    .from('floor_snapshots')
    .select('id, floor_id, svg_content, seat_data, created_at')
    .eq('id', snapshotId)
    .single()

  if (snapErr || !snap) throw new Error('Snapshot not found')

  const restoredSeats = snap.seat_data as Array<Record<string, unknown>>
  if (!Array.isArray(restoredSeats)) throw new Error('Snapshot seat data is invalid')

  // Load current live seats + SVG before overwriting (for snapshot + audit diff)
  const [{ data: currentFloor }, { data: currentSeats }] = await Promise.all([
    db.from('floors').select('svg_content').eq('id', snap.floor_id).single(),
    db.from('seats').select('*').eq('floor_id', snap.floor_id),
  ])

  // Save snapshot of current state before restoring
  if (currentFloor && currentSeats) {
    const { error: preSnapErr } = await db.from('floor_snapshots').insert({
      floor_id:    snap.floor_id,
      svg_content: currentFloor.svg_content,
      seat_data:   currentSeats,
    })
    if (preSnapErr) throw new Error('Failed to save pre-restore snapshot: ' + preSnapErr.message)
  }

  // Restore the SVG
  const { error: floorErr } = await db
    .from('floors')
    .update({ svg_content: snap.svg_content })
    .eq('id', snap.floor_id)

  if (floorErr) throw new Error('Failed to restore floor SVG: ' + floorErr.message)

  // Replace all seats
  const { error: deleteErr } = await db.from('seats').delete().eq('floor_id', snap.floor_id)
  if (deleteErr) throw new Error('Failed to clear seats: ' + deleteErr.message)

  if (restoredSeats.length > 0) {
    const batchSize = 100
    for (let i = 0; i < restoredSeats.length; i += batchSize) {
      const { error: insertErr } = await db.from('seats').insert(restoredSeats.slice(i, i + batchSize))
      if (insertErr) throw new Error('Failed to restore seats: ' + insertErr.message)
    }
  }

  // Write audit entries — one per seat that changed
  const currentMap = new Map((currentSeats ?? []).map((s) => [s.id as string, s]))
  const auditRows: Record<string, unknown>[] = []

  for (const seat of restoredSeats) {
    const seatId = seat.id as string
    const current = currentMap.get(seatId)
    const oldSummary = current
      ? `${current.label} — ${current.occupant_name ?? 'empty'} (${current.status})`
      : null
    const newSummary = `${seat.label} — ${(seat.occupant_name as string | null) ?? 'empty'} (${seat.status})`
    if (oldSummary === newSummary) continue
    auditRows.push({
      seat_id:      seatId,
      editor_email: email,
      action:       'RESTORE',
      field:        'snapshot',
      old_value:    oldSummary,
      new_value:    newSummary,
    })
  }

  if (auditRows.length > 0) {
    const batchSize = 100
    for (let i = 0; i < auditRows.length; i += batchSize) {
      const { error: auditError } = await db.from('audit_logs').insert(auditRows.slice(i, i + batchSize))
      if (auditError) throw new Error('Audit log failed: ' + auditError.message)
    }
  }
}
