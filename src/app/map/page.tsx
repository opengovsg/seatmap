import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { MapClient } from '@/components/MapClient'
import { getDraftState } from '@/app/actions/draft'
import { isAdmin } from '@/lib/admins'
import type { Seat } from '@/types'

export const dynamic = 'force-dynamic'

export default async function MapPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const [{ data: floor }, draftState, userIsAdmin] = await Promise.all([
    db.from('floors').select('id, name, svg_content').single(),
    getDraftState(),
    isAdmin(user.email ?? ''),
  ])
  const isDraft = draftState.isActive
  const draftName = draftState.name

  if (!floor) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No floor plan found. Run <code>npm run seed</code> first.
      </div>
    )
  }

  // Load seats from the draft table or the live table depending on mode
  const [{ data: seats }, { data: teamRows }, { data: divisionRows }, { data: svgRectRows }] = await Promise.all([
    isDraft
      ? db.from('seat_drafts').select('seat_id, floor_id, label, status, occupant_name, occupant_team, occupant_division, notes').eq('floor_id', floor.id).order('label')
      : db.from('seats').select('*').order('label'),
    isDraft
      ? db.from('seat_drafts').select('occupant_team').not('occupant_team', 'is', null)
      : db.from('seats').select('occupant_team').not('occupant_team', 'is', null),
    isDraft
      ? db.from('seat_drafts').select('occupant_division').not('occupant_division', 'is', null)
      : db.from('seats').select('occupant_division').not('occupant_division', 'is', null),
    // In draft mode, fetch svg_rect_id from live seats table (it never changes)
    isDraft
      ? db.from('seats').select('id, svg_rect_id').eq('floor_id', floor.id)
      : Promise.resolve({ data: null }),
  ])

  // Build a lookup from seat id → svg_rect_id for draft mode
  const svgRectMap = new Map((svgRectRows ?? []).map((r) => [r.id, r.svg_rect_id]))

  const normalizedSeats = isDraft
    ? (seats ?? []).map((r) => {
        const row = r as unknown as Record<string, string | null>
        return {
          id:                row.seat_id,
          floor_id:          row.floor_id,
          svg_rect_id:       svgRectMap.get(row.seat_id ?? '') ?? '',
          label:             row.label,
          status:            row.status,
          occupant_name:     row.occupant_name,
          occupant_team:     row.occupant_team,
          occupant_division: row.occupant_division,
          notes:             row.notes,
          created_at:        '',
        }
      })
    : (seats ?? [])

  const teams     = [...new Set((teamRows     ?? []).map((r) => r.occupant_team     as string))].sort()
  const divisions = [...new Set((divisionRows ?? []).map((r) => r.occupant_division as string))].sort()

  return (
    <div className="flex flex-col h-full">
      <MapClient
        floor={floor}
        initialSeats={normalizedSeats as Seat[]}
        teams={teams}
        divisions={divisions}
        userEmail={user.email ?? ''}
        isDraft={isDraft}
        draftName={draftName}
        userIsAdmin={userIsAdmin}
      />
    </div>
  )
}
