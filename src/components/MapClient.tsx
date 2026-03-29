'use client'

import { useState, useCallback, useMemo } from 'react'
import { SeatMap } from './SeatMap'
import { SeatModal } from './SeatModal'
import { NavBar } from './NavBar'
import { UnseatedPanel } from './UnseatedPanel'
import type { Seat, Floor, SeatStatus, Person } from '@/types'
import { moveSeat, restoreSeat } from '@/app/actions/seats'
import { listPeople } from '@/app/actions/people'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { FileEdit, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

function toastTimestamp() {
  return new Date().toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: '2-digit',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}


interface MapClientProps {
  floor:          Floor
  initialSeats:   Seat[]
  initialPeople:  Person[]
  teams:          string[]
  divisions:      string[]
  userEmail:      string
  isDraft:        boolean
  draftName:      string | null
  userIsAdmin:    boolean
}

export function MapClient({ floor, initialSeats, initialPeople, teams, divisions, userEmail, isDraft, draftName, userIsAdmin }: MapClientProps) {
  const [seats,           setSeats]           = useState<Seat[]>(initialSeats)
  const [people,          setPeople]          = useState<Person[]>(initialPeople)
  const [selectedSeat,    setSelectedSeat]    = useState<Seat | null>(null)
  const [movingFrom,      setMovingFrom]      = useState<Seat | null>(null)
  const [moveError,       setMoveError]       = useState<string | null>(null)
  const [panelOpen,       setPanelOpen]       = useState(false)
  const [assigningPerson, setAssigningPerson] = useState<Person | null>(null)

  // ── Filter state ────────────────────────────────────────────────────────────
  const [searchQuery,     setSearchQuery]     = useState('')
  const [statusFilter,    setStatusFilter]    = useState<SeatStatus | null>(null)
  const [teamFilter,      setTeamFilter]      = useState<string | null>(null)
  const [divisionFilter,  setDivisionFilter]  = useState<string | null>(null)

  // Compute the set of seat IDs that are "active" (highlighted) given current filters.
  // null means no filter active — all seats show at full brightness.
  const activeIds = useMemo<Set<string> | null>(() => {
    const query       = searchQuery.trim().toLowerCase()
    const hasSearch   = query.length > 0
    const hasTeam     = teamFilter !== null
    const hasStatus   = statusFilter !== null
    const hasDivision = divisionFilter !== null

    if (!hasSearch && !hasTeam && !hasStatus && !hasDivision) return null

    return new Set(
      seats
        .filter((seat) => {
          if (hasStatus   && seat.status             !== statusFilter)   return false
          if (hasTeam     && seat.occupant_team      !== teamFilter)     return false
          if (hasDivision && seat.occupant_division  !== divisionFilter) return false
          if (hasSearch) {
            const inLabel = seat.label.toLowerCase().includes(query)
            const inName  = seat.occupant_name?.toLowerCase().includes(query) ?? false
            if (!inLabel && !inName) return false
          }
          return true
        })
        .map((s) => s.id)
    )
  }, [seats, searchQuery, statusFilter, teamFilter, divisionFilter])

  const refreshPeople = useCallback(async () => {
    const updated = await listPeople(isDraft)
    setPeople(updated)
  }, [isDraft])

  // ── Seat interactions ────────────────────────────────────────────────────────
  const refreshSeats = useCallback(async () => {
    const supabase = createClient()
    if (isDraft) {
      const [{ data }, { data: svgRectRows }] = await Promise.all([
        supabase
          .from('seat_drafts')
          .select('seat_id, floor_id, label, status, occupant_name, occupant_team, occupant_division, notes')
          .eq('floor_id', floor.id)
          .order('label'),
        supabase.from('seats').select('id, svg_rect_id').eq('floor_id', floor.id),
      ])
      const svgRectMap = new Map((svgRectRows ?? []).map((r) => [r.id, r.svg_rect_id]))
      if (data) setSeats(data.map((r) => {
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
        } as unknown as Seat
      }))
    } else {
      const { data } = await supabase.from('seats').select('*').order('label')
      if (data) setSeats(data as Seat[])
    }
  }, [isDraft, floor.id])

  const handleSeatClick = useCallback((seat: Seat) => {
    if (assigningPerson) {
      if (seat.status === 'OCCUPIED') {
        const ok = window.confirm(`${seat.label} is already occupied by ${seat.occupant_name}.\n\nReplace with ${assigningPerson.name}?`)
        if (!ok) return
      }
      setSelectedSeat(seat)
      setAssigningPerson(null)
      return
    }

    if (movingFrom) {
      if (seat.id === movingFrom.id) { setMovingFrom(null); return }

      if (seat.status === 'OCCUPIED') {
        const ok = window.confirm(
          `${seat.label} is occupied by ${seat.occupant_name}.\n\nSwap ${movingFrom.occupant_name} with ${seat.occupant_name}?`
        )
        if (!ok) return
      }

      const fromSnapshot = { status: movingFrom.status, occupant_name: movingFrom.occupant_name, occupant_team: movingFrom.occupant_team, occupant_division: movingFrom.occupant_division, notes: movingFrom.notes, label: movingFrom.label }
      const toSnapshot = { status: seat.status, occupant_name: seat.occupant_name, occupant_team: seat.occupant_team, occupant_division: seat.occupant_division, notes: seat.notes, label: seat.label }
      const fromId = movingFrom.id
      const toId = seat.id

      moveSeat(fromId, toId)
        .then((result) => {
          refreshSeats()
          const message = result.isSwap ? 'Seats have been swapped.' : 'Seat has been moved.'
          toast(message, {
            description: toastTimestamp(),
            action: {
              label: 'Undo',
              onClick: async () => {
                await restoreSeat(fromId, fromSnapshot)
                await restoreSeat(toId, toSnapshot)
                await refreshSeats()
              },
            },
          })
        })
        .catch((e) => setMoveError(e.message))
        .finally(() => setMovingFrom(null))
      return
    }

    setSelectedSeat(seat)
  }, [assigningPerson, movingFrom, refreshSeats])

  const handleMoveStart = useCallback((seat: Seat) => {
    setMoveError(null)
    setMovingFrom(seat)
  }, [])

  const handlePersonAssign = useCallback((person: Person) => {
    setAssigningPerson(person)
  }, [])

  const handleRefreshPeople = useCallback(async () => {
    await refreshPeople()
  }, [refreshPeople])

  const unseatedPeople = useMemo(
    () => people.filter(p => !p.seat),
    [people]
  )

  return (
    <>
      <NavBar
        seats={seats}
        userEmail={userEmail}
        teams={teams}
        divisions={divisions}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        teamFilter={teamFilter}
        onTeamFilterChange={setTeamFilter}
        divisionFilter={divisionFilter}
        onDivisionFilterChange={setDivisionFilter}
      />

      {isDraft && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-800 flex items-center gap-2">
          <FileEdit className="size-3.5 shrink-0" />
          <span>
            {draftName ? <>Editing draft: <strong>{draftName}</strong>. </> : 'Draft mode. '}
            This draft was created by an admin due to multiple changes to seating.
          </span>
        </div>
      )}

      {movingFrom && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center justify-between">
          <span>
            Moving <strong>{movingFrom.occupant_name}</strong> from <strong>{movingFrom.label}</strong>.
            Click a destination seat, or{' '}
            <button className="underline font-medium" onClick={() => setMovingFrom(null)}>cancel</button>.
          </span>
        </div>
      )}

      {assigningPerson && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center justify-between">
          <span>
            Assigning <strong>{assigningPerson.name}</strong>. Click a seat to assign, or{' '}
            <button className="underline font-medium" onClick={() => setAssigningPerson(null)}>cancel</button>.
          </span>
        </div>
      )}

      {moveError && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-sm text-destructive">
          Move failed: {moveError}
          <button className="ml-3 underline" onClick={() => setMoveError(null)}>Dismiss</button>
        </div>
      )}

      <main className="relative flex-1 overflow-auto bg-muted/30">
        {/* People panel toggle button */}
        <Button
          size="icon-sm"
          variant="secondary"
          className="absolute top-3 left-3 z-20 shadow-sm"
          onClick={() => setPanelOpen(v => !v)}
          title="People"
        >
          <Users className="size-4" />
        </Button>

        <SeatMap
          svgContent={floor.svg_content}
          seats={seats}
          onSeatClick={handleSeatClick}
          moveSourceId={movingFrom?.id}
          activeIds={activeIds}
        />
      </main>

      <UnseatedPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        people={people}
        userIsAdmin={userIsAdmin}
        onPersonAssign={handlePersonAssign}
        onRefresh={handleRefreshPeople}
      />

      <SeatModal
        key={selectedSeat?.id}
        seat={selectedSeat}
        teams={teams}
        divisions={divisions}
        unseatedPeople={unseatedPeople}
        initialPerson={assigningPerson}
        onClose={() => {
          setSelectedSeat(null)
          setAssigningPerson(null)
        }}
        onUpdated={async () => {
          await refreshSeats()
          await refreshPeople()
        }}
        onMoveStart={handleMoveStart}
      />
    </>
  )
}
