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

async function writeAudit(
  seatId: string,
  action: string,
  editorEmail: string,
  opts?: { field?: string; oldValue?: string | null; newValue?: string | null }
) {
  const db = createAdminClient()
  const { error } = await db.from('audit_logs').insert({
    seat_id: seatId,
    editor_email: editorEmail,
    action,
    field: opts?.field ?? null,
    old_value: opts?.oldValue ?? null,
    new_value: opts?.newValue ?? null,
  })
  if (error) throw new Error('Audit log failed: ' + error.message)
}

export async function assignSeat(
  seatId: string,
  occupantName: string,
  occupantTeam: string,
  occupantDivision: string,
  notes: string
) {
  const db = createAdminClient()
  const email = await getEditorEmail()

  if (await isDraftActive()) {
    const { error } = await db.from('seat_drafts').update({
      status: 'OCCUPIED',
      occupant_name: occupantName,
      occupant_team: occupantTeam || null,
      occupant_division: occupantDivision || null,
      notes: notes || null,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }).eq('seat_id', seatId)
    if (error) throw new Error(error.message)
    await writeAudit(seatId, 'ASSIGN', email, { field: 'occupant_name', newValue: occupantName })
    return
  }

  const { data: old } = await db.from('seats').select('occupant_name').eq('id', seatId).single()

  const { error } = await db.from('seats').update({
    status: 'OCCUPIED',
    occupant_name: occupantName,
    occupant_team: occupantTeam || null,
    occupant_division: occupantDivision || null,
    notes: notes || null,
  }).eq('id', seatId)
  if (error) throw new Error(error.message)

  await writeAudit(seatId, 'ASSIGN', email, {
    field: 'occupant_name',
    oldValue: old?.occupant_name ?? null,
    newValue: occupantName,
  })
}

export async function unassignSeat(seatId: string) {
  const db = createAdminClient()
  const email = await getEditorEmail()

  if (await isDraftActive()) {
    const { data: old } = await db.from('seat_drafts').select('occupant_name').eq('seat_id', seatId).single()
    const { error } = await db.from('seat_drafts').update({
      status: 'AVAILABLE',
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

  const { data: old } = await db.from('seats').select('occupant_name').eq('id', seatId).single()

  const { error } = await db.from('seats').update({
    status: 'AVAILABLE',
    occupant_name: null,
    occupant_team: null,
    occupant_division: null,
  }).eq('id', seatId)
  if (error) throw new Error(error.message)

  await writeAudit(seatId, 'UNASSIGN', email, {
    field: 'occupant_name',
    oldValue: old?.occupant_name ?? null,
  })
}

export async function reserveSeat(seatId: string, notes: string) {
  const db = createAdminClient()
  const email = await getEditorEmail()

  if (await isDraftActive()) {
    const { error } = await db.from('seat_drafts').update({
      status: 'RESERVED',
      occupant_name: null,
      occupant_team: null,
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

  const { data: old } = await db.from('seats').select('status').eq('id', seatId).single()

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

  const fields = Object.keys(updates) as (keyof typeof updates)[]
  for (const field of fields) {
    if (old && updates[field] !== old[field]) {
      await writeAudit(seatId, 'UPDATE', email, {
        field,
        oldValue: old[field] ?? null,
        newValue: updates[field] ?? null,
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

export async function moveSeat(fromSeatId: string, toSeatId: string) {
  const db = createAdminClient()
  const email = await getEditorEmail()
  const drafting = await isDraftActive()
  const table = drafting ? 'seat_drafts' : 'seats'
  const idCol = drafting ? 'seat_id' : 'id'

  const { data: fromSeat } = await db.from(table).select('*').eq(idCol, fromSeatId).single()
  const { data: toSeat }   = await db.from(table).select('*').eq(idCol, toSeatId).single()
  if (!fromSeat || !toSeat) throw new Error('Seat not found')

  const isSwap = toSeat.status === 'OCCUPIED'

  const extra = drafting ? { updated_by: email, updated_at: new Date().toISOString() } : {}

  if (isSwap) {
    await db.from(table).update({
      occupant_name: toSeat.occupant_name,
      occupant_team: toSeat.occupant_team,
      occupant_division: toSeat.occupant_division,
      status: 'OCCUPIED',
      ...extra,
    }).eq(idCol, fromSeatId)

    await db.from(table).update({
      occupant_name: fromSeat.occupant_name,
      occupant_team: fromSeat.occupant_team,
      occupant_division: fromSeat.occupant_division,
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
  } else {
    await db.from(table).update({
      status: 'AVAILABLE',
      occupant_name: null,
      occupant_team: null,
      occupant_division: null,
      ...extra,
    }).eq(idCol, fromSeatId)

    await db.from(table).update({
      status: 'OCCUPIED',
      occupant_name: fromSeat.occupant_name,
      occupant_team: fromSeat.occupant_team,
      occupant_division: fromSeat.occupant_division,
      ...extra,
    }).eq(idCol, toSeatId)

    await writeAudit(fromSeatId, 'MOVE', email, {
      field: 'seat',
      oldValue: fromSeat.label,
      newValue: toSeat.label,
    })
  }

  return { isSwap, swapPersonName: isSwap ? (toSeat.occupant_name as string) : null }
}
