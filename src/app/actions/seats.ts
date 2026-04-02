'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function getEditorEmail(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? 'unknown'
}

async function isDraftActive(): Promise<boolean> {
  const db = createAdminClient()
  const { data } = await db.from('draft_state').select('is_active').single()
  return data?.is_active ?? false
}

type SeatSnapshot = {
  status: string
  occupant_name: string | null
  occupant_team: string | null
  occupant_division: string | null
  notes: string | null
  label: string
}

async function writeAudit(
  seatId: string,
  action: string,
  editorEmail: string,
  opts?: { field?: string; oldValue?: string | null; newValue?: string | null; before?: SeatSnapshot | null }
) {
  const db = createAdminClient()
  const { error } = await db.from('audit_logs').insert({
    seat_id: seatId,
    editor_email: editorEmail,
    action,
    field: opts?.field ?? null,
    old_value: opts?.oldValue ?? null,
    new_value: opts?.newValue ?? null,
    before: opts?.before ?? null,
  })
  if (error) throw new Error('Audit log failed: ' + error.message)
}

export async function assignSeat(
  seatId: string,
  personId: string,
  notes: string,
) {
  const db = createAdminClient()
  const email = await getEditorEmail()

  // Look up person details to sync into occupant cache fields
  const { data: person, error: personError } = await db
    .from('people')
    .select('name, team, division')
    .eq('id', personId)
    .single()
  if (personError || !person) throw new Error('Person not found.')

  if (await isDraftActive()) {
    // Check if someone else is currently in this seat (will be displaced)
    const { data: currentSeat } = await db
      .from('seat_drafts')
      .select('person_id')
      .eq('seat_id', seatId)
      .single()

    // If seat has a different occupant, they become unseated
    if (currentSeat?.person_id && currentSeat.person_id !== personId) {
      // Clear their seat assignment by finding any other seats they might be in
      await db
        .from('seat_drafts')
        .update({ person_id: null })
        .eq('person_id', currentSeat.person_id)
    }

    const { error } = await db.from('seat_drafts').update({
      status: 'OCCUPIED',
      person_id: personId,
      occupant_name: person.name,
      occupant_team: person.team ?? null,
      occupant_division: person.division ?? null,
      notes: notes || null,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }).eq('seat_id', seatId)
    if (error) throw new Error(error.message)
    await writeAudit(seatId, 'ASSIGN', email, { field: 'occupant_name', newValue: person.name })
    return
  }

  const { data: old } = await db.from('seats').select('*').eq('id', seatId).single()

  // If seat has a different occupant, they become unseated
  if (old?.person_id && old.person_id !== personId) {
    // Clear their seat assignment
    await db
      .from('seats')
      .update({ person_id: null })
      .eq('person_id', old.person_id)
  }

  const { error } = await db.from('seats').update({
    status: 'OCCUPIED',
    person_id: personId,
    occupant_name: person.name,
    occupant_team: person.team ?? null,
    occupant_division: person.division ?? null,
    notes: notes || null,
  }).eq('id', seatId)
  if (error) throw new Error(error.message)

  await writeAudit(seatId, 'ASSIGN', email, {
    field: 'occupant_name',
    oldValue: old?.occupant_name ?? null,
    newValue: person.name,
    before: old ? { status: old.status, occupant_name: old.occupant_name, occupant_team: old.occupant_team, occupant_division: old.occupant_division, notes: old.notes, label: old.label } : null,
  })
}

export async function unassignSeat(seatId: string) {
  const db = createAdminClient()
  const email = await getEditorEmail()

  if (await isDraftActive()) {
    const { data: old } = await db.from('seat_drafts').select('occupant_name').eq('seat_id', seatId).single()
    const { error } = await db.from('seat_drafts').update({
      status: 'AVAILABLE',
      person_id: null,
      occupant_name: null,
      occupant_team: null,
      occupant_division: null,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }).eq('seat_id', seatId)
    if (error) throw new Error(error.message)
    await writeAudit(seatId, 'UNASSIGN', email, { field: 'occupant_name', oldValue: old?.occupant_name ?? null })
    return
  }

  const { data: old } = await db.from('seats').select('*').eq('id', seatId).single()

  const { error } = await db.from('seats').update({
    status: 'AVAILABLE',
    person_id: null,
    occupant_name: null,
    occupant_team: null,
    occupant_division: null,
  }).eq('id', seatId)
  if (error) throw new Error(error.message)

  await writeAudit(seatId, 'UNASSIGN', email, {
    field: 'occupant_name',
    oldValue: old?.occupant_name ?? null,
    before: old ? { status: old.status, occupant_name: old.occupant_name, occupant_team: old.occupant_team, occupant_division: old.occupant_division, notes: old.notes, label: old.label } : null,
  })
}

export async function reserveSeat(seatId: string, notes: string, team?: string) {
  const db = createAdminClient()
  const email = await getEditorEmail()

  if (await isDraftActive()) {
    const { error } = await db.from('seat_drafts').update({
      status: 'RESERVED',
      occupant_name: null,
      occupant_team: team || null,
      occupant_division: null,
      notes: notes || null,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }).eq('seat_id', seatId)
    if (error) throw new Error(error.message)
    await writeAudit(seatId, 'RESERVE', email, { field: 'status', newValue: notes ? `RESERVED — ${notes}` : 'RESERVED' })
    return
  }

  const { error } = await db.from('seats').update({
    status: 'RESERVED',
    occupant_team: team || null,
    notes: notes || null,
  }).eq('id', seatId)
  if (error) throw new Error(error.message)

  await writeAudit(seatId, 'RESERVE', email, {
    field: 'status',
    newValue: notes ? `RESERVED — ${notes}` : 'RESERVED',
  })
}

export async function makeAvailable(seatId: string) {
  const db = createAdminClient()
  const email = await getEditorEmail()

  if (await isDraftActive()) {
    const { data: old } = await db.from('seat_drafts').select('status').eq('seat_id', seatId).single()
    const { error } = await db.from('seat_drafts').update({
      status: 'AVAILABLE',
      occupant_name: null,
      occupant_team: null,
      occupant_division: null,
      notes: null,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }).eq('seat_id', seatId)
    if (error) throw new Error(error.message)
    await writeAudit(seatId, 'UPDATE', email, { field: 'status', oldValue: old?.status ?? null, newValue: 'AVAILABLE' })
    return
  }

  const { data: old } = await db.from('seats').select('*').eq('id', seatId).single()

  const { error } = await db.from('seats').update({
    status: 'AVAILABLE',
    occupant_name: null,
    occupant_team: null,
    occupant_division: null,
    notes: null,
  }).eq('id', seatId)
  if (error) throw new Error(error.message)

  await writeAudit(seatId, 'UPDATE', email, {
    field: 'status',
    oldValue: old?.status ?? null,
    newValue: 'AVAILABLE',
    before: old ? { status: old.status, occupant_name: old.occupant_name, occupant_team: old.occupant_team, occupant_division: old.occupant_division, notes: old.notes, label: old.label } : null,
  })
}

export async function updateSeat(
  seatId: string,
  updates: {
    label?: string
    occupant_name?: string
    occupant_team?: string | null
    occupant_division?: string | null
    notes?: string | null
  }
) {
  const db = createAdminClient()
  const email = await getEditorEmail()

  if (await isDraftActive()) {
    const { data: old } = await db.from('seat_drafts').select('*').eq('seat_id', seatId).single()
    const { error } = await db.from('seat_drafts').update({
      ...updates,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }).eq('seat_id', seatId)
    if (error) throw new Error(error.message)
    const fields = Object.keys(updates) as (keyof typeof updates)[]
    for (const field of fields) {
      if (old && updates[field] !== old[field]) {
        await writeAudit(seatId, 'UPDATE', email, { field, oldValue: old[field] ?? null, newValue: updates[field] ?? null })
      }
    }
    return
  }

  const { data: old } = await db.from('seats').select('*').eq('id', seatId).single()

  const { error } = await db.from('seats').update(updates).eq('id', seatId)
  if (error) throw new Error(error.message)

  const before = old ? { status: old.status, occupant_name: old.occupant_name, occupant_team: old.occupant_team, occupant_division: old.occupant_division, notes: old.notes, label: old.label } : null
  const fields = Object.keys(updates) as (keyof typeof updates)[]
  for (const field of fields) {
    if (old && updates[field] !== old[field]) {
      await writeAudit(seatId, 'UPDATE', email, {
        field,
        oldValue: old[field] ?? null,
        newValue: updates[field] ?? null,
        before,
      })
    }
  }
}

export async function restoreSeat(seatId: string, snapshot: {
  status: string
  occupant_name: string | null
  occupant_team: string | null
  occupant_division: string | null
  notes: string | null
  label: string
}) {
  const db = createAdminClient()
  const email = await getEditorEmail()

  if (await isDraftActive()) {
    const { error } = await db.from('seat_drafts').update({
      ...snapshot,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }).eq('seat_id', seatId)
    if (error) throw new Error(error.message)
    await writeAudit(seatId, 'UPDATE', email)
    return
  }

  const { error } = await db.from('seats').update(snapshot).eq('id', seatId)
  if (error) throw new Error(error.message)
  await writeAudit(seatId, 'UPDATE', email)
}

export async function undoAuditEntry(auditLogId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Not authenticated.')
  const { isAdmin } = await import('@/lib/admins')
  if (!(await isAdmin(user.email))) throw new Error('Admin access required.')

  const db = createAdminClient()
  const { data: log } = await db.from('audit_logs').select('*').eq('id', auditLogId).single()
  if (!log) throw new Error('Audit log entry not found.')
  if (!log.before) throw new Error('No snapshot available to undo this change.')

  const snapshot = log.before as { status: string; occupant_name: string | null; occupant_team: string | null; occupant_division: string | null; notes: string | null; label: string }
  await restoreSeat(log.seat_id, snapshot)
}

export async function moveSeat(fromSeatId: string, toSeatId: string) {
  const db = createAdminClient()
  const email = await getEditorEmail()
  const drafting = await isDraftActive()
  const table = drafting ? 'seat_drafts' : 'seats'
  const idCol = drafting ? 'seat_id' : 'id'

  const { data: fromSeat } = await db.from(table).select('*').eq(idCol, fromSeatId).single()
  const { data: toSeat }   = await db.from(table).select('*').eq(idCol, toSeatId).single()
  if (!fromSeat || !toSeat) throw new Error('Seat not found')

  const isSwap     = toSeat.status === 'OCCUPIED'
  const isReserved = toSeat.status === 'RESERVED'

  const extra = drafting ? { updated_by: email, updated_at: new Date().toISOString() } : {}

  if (isSwap) {
    // Swap occupants between two occupied seats
    await db.from(table).update({
      occupant_name: toSeat.occupant_name,
      occupant_team: toSeat.occupant_team,
      occupant_division: toSeat.occupant_division,
      person_id: toSeat.person_id ?? null,
      status: 'OCCUPIED',
      ...extra,
    }).eq(idCol, fromSeatId)

    await db.from(table).update({
      occupant_name: fromSeat.occupant_name,
      occupant_team: fromSeat.occupant_team,
      occupant_division: fromSeat.occupant_division,
      person_id: fromSeat.person_id ?? null,
      status: 'OCCUPIED',
      ...extra,
    }).eq(idCol, toSeatId)

    await writeAudit(fromSeatId, 'MOVE', email, {
      field: 'seat',
      oldValue: fromSeat.label,
      newValue: `${toSeat.label} (swapped with ${toSeat.occupant_name})`,
    })
    await writeAudit(toSeatId, 'MOVE', email, {
      field: 'seat',
      oldValue: toSeat.label,
      newValue: `${fromSeat.label} (swapped with ${fromSeat.occupant_name})`,
    })
  } else if (isReserved) {
    // Move person into reserved seat — reservation transfers to the vacated seat
    await db.from(table).update({
      status: 'RESERVED',
      notes: toSeat.notes ?? null,
      occupant_name: null,
      occupant_team: null,
      occupant_division: null,
      person_id: null,
      ...extra,
    }).eq(idCol, fromSeatId)

    await db.from(table).update({
      status: 'OCCUPIED',
      occupant_name: fromSeat.occupant_name,
      occupant_team: fromSeat.occupant_team,
      occupant_division: fromSeat.occupant_division,
      person_id: fromSeat.person_id ?? null,
      notes: null,
      ...extra,
    }).eq(idCol, toSeatId)

    await writeAudit(fromSeatId, 'MOVE', email, {
      field: 'seat',
      oldValue: fromSeat.label,
      newValue: `${toSeat.label} (reservation moved here)`,
    })
    await writeAudit(toSeatId, 'MOVE', email, {
      field: 'seat',
      oldValue: toSeat.label,
      newValue: fromSeat.label,
    })
  } else {
    // Move person to an available seat
    await db.from(table).update({
      status: 'AVAILABLE',
      occupant_name: null,
      occupant_team: null,
      occupant_division: null,
      person_id: null,
      ...extra,
    }).eq(idCol, fromSeatId)

    await db.from(table).update({
      status: 'OCCUPIED',
      occupant_name: fromSeat.occupant_name,
      occupant_team: fromSeat.occupant_team,
      occupant_division: fromSeat.occupant_division,
      person_id: fromSeat.person_id ?? null,
      ...extra,
    }).eq(idCol, toSeatId)

    await writeAudit(fromSeatId, 'MOVE', email, {
      field: 'seat',
      oldValue: fromSeat.label,
      newValue: toSeat.label,
    })
  }

  return { isSwap, isReserved, swapPersonName: isSwap ? (toSeat.occupant_name as string) : null }
}
