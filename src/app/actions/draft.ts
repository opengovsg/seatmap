'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admins'

async function requireAdmin(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Not authenticated.')
  if (!(await isAdmin(user.email))) throw new Error('Admin access required.')
  return user.email
}

export async function getDraftState(): Promise<boolean> {
  const db = createAdminClient()
  const { data } = await db.from('draft_state').select('is_active').single()
  return data?.is_active ?? false
}

export async function initializeDraft(floorId: string): Promise<void> {
  await requireAdmin()
  const db = createAdminClient()

  // Copy all current seats into seat_drafts
  const { data: seats, error: seatsError } = await db
    .from('seats')
    .select('id, floor_id, svg_rect_id, label, status, occupant_name, occupant_team, occupant_division, notes')
    .eq('floor_id', floorId)

  if (seatsError) throw new Error(seatsError.message)
  if (!seats || seats.length === 0) throw new Error('No seats found for this floor.')

  // Clear any stale draft rows first
  await db.from('seat_drafts').delete().eq('floor_id', floorId)

  const rows = seats.map((s) => ({
    seat_id:           s.id,
    floor_id:          s.floor_id,
    svg_rect_id:       s.svg_rect_id,
    label:             s.label,
    status:            s.status,
    occupant_name:     s.occupant_name,
    occupant_team:     s.occupant_team,
    occupant_division: s.occupant_division,
    notes:             s.notes,
    updated_by:        '',
    updated_at:        new Date().toISOString(),
  }))

  const { error: insertError } = await db.from('seat_drafts').insert(rows)
  if (insertError) throw new Error(insertError.message)

  const { error: stateError } = await db
    .from('draft_state')
    .update({ is_active: true })
    .eq('id', 1)
  if (stateError) throw new Error(stateError.message)
}

export async function publishDraft(floorId: string): Promise<void> {
  const email = await requireAdmin()
  const db = createAdminClient()

  // Load live seats + SVG + draft seats before publishing
  const [{ data: floor }, { data: liveSeats }, { data: draftSeats }] = await Promise.all([
    db.from('floors').select('svg_content').eq('id', floorId).single(),
    db.from('seats').select('*').eq('floor_id', floorId),
    db.from('seat_drafts').select('*').eq('floor_id', floorId),
  ])

  if (!floor) throw new Error('Floor not found.')
  if (!liveSeats) throw new Error('Failed to load live seats.')

  // Snapshot current live state before overwriting
  const { error: snapError } = await db.from('floor_snapshots').insert({
    floor_id:    floorId,
    svg_content: floor.svg_content,
    seat_data:   liveSeats,
  })
  if (snapError) throw new Error('Failed to save snapshot before publishing: ' + snapError.message)

  // Publish draft → live
  const { error } = await db.rpc('publish_seat_draft', { p_floor_id: floorId })
  if (error) throw new Error(error.message)

  // Write audit entries for each seat that changed
  const liveMap = new Map(liveSeats.map((s) => [s.id as string, s]))
  const auditRows: Record<string, unknown>[] = []
  const fields = ['status', 'occupant_name', 'occupant_team', 'occupant_division', 'notes', 'label'] as const

  for (const draft of (draftSeats ?? [])) {
    const live = liveMap.get(draft.seat_id as string)
    const changedFields = fields.filter((f) => (draft[f] ?? null) !== ((live?.[f]) ?? null))
    if (changedFields.length === 0) continue

    const oldSummary = live
      ? `${live.label} — ${live.occupant_name ?? 'empty'} (${live.status})`
      : null
    const newSummary = `${draft.label} — ${(draft.occupant_name as string | null) ?? 'empty'} (${draft.status})`

    auditRows.push({
      seat_id:      draft.seat_id,
      editor_email: email,
      action:       'PUBLISH',
      field:        `${changedFields.length} field${changedFields.length > 1 ? 's' : ''} changed`,
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

export async function discardDraft(floorId: string): Promise<void> {
  await requireAdmin()
  const db = createAdminClient()

  const { error: deleteError } = await db
    .from('seat_drafts')
    .delete()
    .eq('floor_id', floorId)
  if (deleteError) throw new Error(deleteError.message)

  const { error: stateError } = await db
    .from('draft_state')
    .update({ is_active: false })
    .eq('id', 1)
  if (stateError) throw new Error(stateError.message)
}
