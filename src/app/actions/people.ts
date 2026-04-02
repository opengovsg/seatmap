'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Person } from '@/types'

async function requireAuth(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Not authenticated.')
  return user.email
}

/**
 * List all non-archived people with their current seat (if any).
 * In draft mode, seat assignment is derived from seat_drafts.
 */
export async function listPeople(isDraft = false): Promise<Person[]> {
  await requireAuth()
  const db = createAdminClient()

  const { data: people, error } = await db
    .from('people')
    .select('*')
    .order('name')

  if (error) throw new Error(error.message)

  const table = isDraft ? 'seat_drafts' : 'seats'
  const idCol  = isDraft ? 'seat_id'    : 'id'

  // Fetch all seats that have a person_id set
  const { data: seatRows } = await db
    .from(table)
    .select(`${idCol}, label, person_id`)
    .not('person_id', 'is', null)

  const seatByPerson = new Map(
    (seatRows ?? []).map((r) => {
      const row = r as unknown as Record<string, string | null>
      return [
        row.person_id as string,
        { id: row[idCol] as string, label: row.label as string },
      ] as const
    })
  )

  return (people ?? []).map((p) => ({
    ...p,
    seat: seatByPerson.get(p.id) ?? null,
  })) as Person[]
}

export async function createPerson(
  name: string,
  team: string,
  division: string,
  jobTitle: string,
): Promise<Person> {
  await requireAuth()
  const db = createAdminClient()

  const { data, error } = await db
    .from('people')
    .insert({
      name: name.trim(),
      team: team.trim() || null,
      division: division.trim() || null,
      job_title: jobTitle.trim() || null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return { ...data, seat: null } as Person
}

export async function updatePerson(
  personId: string,
  updates: { name?: string; team?: string | null; division?: string | null; job_title?: string | null },
): Promise<void> {
  await requireAuth()
  const db = createAdminClient()

  const cleaned = {
    ...(updates.name !== undefined      ? { name: updates.name.trim() }                      : {}),
    ...(updates.team !== undefined      ? { team: updates.team?.trim() || null }              : {}),
    ...(updates.division !== undefined  ? { division: updates.division?.trim() || null }      : {}),
    ...(updates.job_title !== undefined ? { job_title: updates.job_title?.trim() || null }   : {}),
  }

  const { error } = await db.from('people').update(cleaned).eq('id', personId)
  if (error) throw new Error(error.message)

  // Sync cached occupant fields on any live seat linked to this person
  if (Object.keys(cleaned).length > 0) {
    const seatFields: Record<string, string | null> = {}
    if (cleaned.name     !== undefined) seatFields.occupant_name     = cleaned.name
    if (cleaned.team     !== undefined) seatFields.occupant_team     = cleaned.team ?? null
    if (cleaned.division !== undefined) seatFields.occupant_division = cleaned.division ?? null

    if (Object.keys(seatFields).length > 0) {
      await db.from('seats').update(seatFields).eq('person_id', personId)
      await db.from('seat_drafts').update(seatFields).eq('person_id', personId)
    }
  }
}

export async function archivePerson(personId: string): Promise<void> {
  await requireAuth()

  // Unassign the person from their seat first (if they have one)
  await unassignSeatByPersonId(personId)

  // Then archive the person
  const db = createAdminClient()
  const { error } = await db.from('people').update({ is_archived: true }).eq('id', personId)
  if (error) throw new Error(error.message)
}

export async function unarchivePerson(personId: string): Promise<void> {
  await requireAuth()
  const db = createAdminClient()
  const { error } = await db.from('people').update({ is_archived: false }).eq('id', personId)
  if (error) throw new Error(error.message)
}

export async function deletePerson(personId: string): Promise<void> {
  await requireAuth()
  const db = createAdminClient()
  const { error } = await db.from('people').delete().eq('id', personId)
  if (error) throw new Error(error.message)
}

export async function unassignSeatByPersonId(personId: string): Promise<void> {
  await requireAuth()
  const { unassignSeat } = await import('@/app/actions/seats')
  const db = createAdminClient()

  // Try live seats first, then drafts
  const { data: seat } = await db.from('seats').select('id').eq('person_id', personId).single()
  if (seat) { await unassignSeat(seat.id); return }

  const { data: draft } = await db.from('seat_drafts').select('seat_id').eq('person_id', personId).single()
  if (draft) { await unassignSeat(draft.seat_id); return }
}
