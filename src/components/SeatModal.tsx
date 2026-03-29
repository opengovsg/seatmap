'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty, ComboboxSeparator } from '@/components/ui/combobox'
import { UserPlus } from 'lucide-react'
import type { Seat, Person } from '@/types'
import { assignSeat, unassignSeat, reserveSeat, makeAvailable, updateSeat, restoreSeat } from '@/app/actions/seats'
import { updatePerson } from '@/app/actions/people'
import { PersonModal } from './PersonModal'
import { toast } from 'sonner'

function toastTimestamp() {
  return new Date().toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: '2-digit',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

type Mode = 'view' | 'edit'

const STATUS_LABELS = { AVAILABLE: 'Available', OCCUPIED: 'Occupied', RESERVED: 'Reserved' }
const STATUS_VARIANTS: Record<string, 'default' | 'destructive' | 'secondary'> = {
  AVAILABLE: 'default', OCCUPIED: 'destructive', RESERVED: 'secondary',
}

// ── Team combobox — allows free text or pick from existing teams ──────────────
function TeamCombobox({ value, onChange, teams }: {
  value: string
  onChange: (v: string) => void
  teams: string[]
}) {
  return (
    <div onChange={(e) => onChange((e.target as HTMLInputElement).value)}>
      <Combobox value={value || null} onValueChange={(v) => onChange(v ?? '')}>
        <ComboboxInput placeholder="Team name" showTrigger={teams.length > 0} showClear={!!value} className="w-full" />
        {teams.length > 0 && (
          <ComboboxContent>
            <ComboboxList>
              {teams.map((t) => <ComboboxItem key={t} value={t}>{t}</ComboboxItem>)}
              <ComboboxEmpty>No match — type to add new</ComboboxEmpty>
            </ComboboxList>
          </ComboboxContent>
        )}
      </Combobox>
    </div>
  )
}

// ── Person picker ─────────────────────────────────────────────────────────────
// Shows unseated people. A "New person" button opens PersonModal to create one.
function PersonPicker({
  unseatedPeople,
  selectedPerson,
  onSelect,
  onNewPersonRequested,
  notes,
  onNotes,
  isPending,
  onSubmit,
}: {
  unseatedPeople: Person[]
  selectedPerson: Person | null
  onSelect: (person: Person | null) => void
  onNewPersonRequested: () => void
  notes: string
  onNotes: (v: string) => void
  isPending: boolean
  onSubmit: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = unseatedPeople.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="grid gap-3 pt-3">
      {!selectedPerson ? (
        <div className="grid gap-1.5">
          <Label>Person *</Label>
          <div onChange={(e) => setSearch((e.target as HTMLInputElement).value)}>
            <Combobox value={null} onValueChange={(id) => {
              if (id === '__new__') { onNewPersonRequested(); return }
              const person = unseatedPeople.find(p => p.id === id) ?? null
              onSelect(person)
            }}>
              <ComboboxInput
                placeholder="Search unseated people…"
                showTrigger
                showClear={false}
                className="w-full"
                autoFocus
              />
              <ComboboxContent>
                <ComboboxList>
                  {filtered.map(p => (
                    <ComboboxItem key={p.id} value={p.id}>
                      <span>{p.name}</span>
                      {(p.team || p.division) && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {[p.team, p.division].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </ComboboxItem>
                  ))}
                  {filtered.length === 0 && (
                    <ComboboxEmpty>No unseated people found</ComboboxEmpty>
                  )}
                  <ComboboxSeparator />
                  <ComboboxItem value="__new__" className="py-2">
                    <UserPlus className="size-3.5 mr-1.5" />
                    Add new person
                  </ComboboxItem>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label>Person</Label>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-muted/40">
            <div>
              <span className="font-medium">{selectedPerson.name}</span>
              {(selectedPerson.team || selectedPerson.division) && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {[selectedPerson.team, selectedPerson.division].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => onSelect(null)}
            >
              Change
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="assign-notes">Notes</Label>
        <Input id="assign-notes" value={notes} onChange={e => onNotes(e.target.value)} placeholder="Optional" />
      </div>
      <Button size="lg" disabled={isPending || !selectedPerson} onClick={onSubmit} className="mt-1 w-full">
        {isPending ? 'Saving…' : 'Assign'}
      </Button>
    </div>
  )
}

// ── Reserve form ───────────────────────────────────────────────────────────────
function ReserveForm({ notes, onNotes, team, onTeam, teams, isPending, onSubmit }: {
  notes: string; onNotes: (v: string) => void
  team: string; onTeam: (v: string) => void
  teams: string[]; isPending: boolean; onSubmit: () => void
}) {
  return (
    <div className="grid gap-3 pt-3">
      <p className="text-xs text-muted-foreground">Use this function when you haven&apos;t identified the hire yet.</p>
      <div className="grid gap-1.5">
        <Label htmlFor="reserve-reason">Reason</Label>
        <Input id="reserve-reason" value={notes} onChange={e => onNotes(e.target.value)} placeholder="e.g. Holding for Design hire" autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label>Team</Label>
        <TeamCombobox value={team} onChange={onTeam} teams={teams} />
      </div>
      <Button size="lg" disabled={isPending} onClick={onSubmit} className="mt-1 w-full">
        {isPending ? 'Saving…' : 'Reserve'}
      </Button>
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────
interface SeatModalProps {
  seat: Seat | null
  teams: string[]
  divisions: string[]
  unseatedPeople: Person[]
  initialPerson?: Person | null
  onClose: () => void
  onUpdated: () => Promise<void>
  onMoveStart: (seat: Seat) => void
}

export function SeatModal({ seat, teams, divisions, unseatedPeople, initialPerson, onClose, onUpdated, onMoveStart }: SeatModalProps) {
  // Open straight to assign mode if a person was pre-selected from the panel
  const [mode, setMode] = useState<Mode>(() =>
    initialPerson && seat?.status !== 'OCCUPIED' ? 'edit' : 'view'
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Person picker state
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(initialPerson ?? null)
  const [showPersonModal, setShowPersonModal] = useState(false)

  // Shared notes for assign forms
  const [notes, setNotes] = useState('')

  // Reserve form state
  const [reserveNotes, setReserveNotes] = useState('')
  const [reserveTeam,  setReserveTeam]  = useState('')

  // Edit mode state
  const [editName,     setEditName]     = useState('')
  const [editTeam,     setEditTeam]     = useState('')
  const [editDivision, setEditDivision] = useState('')
  const [editNotes,    setEditNotes]    = useState('')
  const [editLabel,    setEditLabel]    = useState('')

  // Confirmation for assigning to a reserved seat
  const [showReservedConfirm, setShowReservedConfirm] = useState(false)

  const close = () => {
    setMode('view')
    setError(null)
    setSelectedPerson(null)
    setNotes('')
    setShowReservedConfirm(false)
    onClose()
  }

  const run = (fn: () => Promise<void>, message: string) => {
    const snapshot = {
      status: seat!.status,
      occupant_name: seat!.occupant_name,
      occupant_team: seat!.occupant_team,
      occupant_division: seat!.occupant_division,
      notes: seat!.notes,
      label: seat!.label,
    }
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        await onUpdated()
        close()
        toast(message, {
          description: toastTimestamp(),
          action: {
            label: 'Undo',
            onClick: async () => {
              await restoreSeat(seat!.id, snapshot)
              await onUpdated()
            },
          },
        })
      }
      catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    })
  }

  function handleAssignSubmit() {
    if (!selectedPerson) return
    if (seat?.status === 'RESERVED' && !showReservedConfirm) {
      setShowReservedConfirm(true)
      return
    }
    run(() => assignSeat(seat!.id, selectedPerson.id, notes.trim()), 'Seat has been assigned.')
  }

  const enterEdit = () => {
    setEditName(seat?.occupant_name ?? '')
    setEditTeam(seat?.occupant_team ?? '')
    setEditDivision(seat?.occupant_division ?? '')
    setEditNotes(seat?.notes ?? '')
    setEditLabel(seat?.label ?? '')
    setMode('edit')
  }

  const enterAssign = () => {
    setSelectedPerson(null)
    setNotes('')
    setShowReservedConfirm(false)
    setMode('edit')
  }

  if (!seat) return null

  return (
    <>
      <Dialog open={!!seat} onOpenChange={(open) => { if (!open) close() }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {seat.label}
              <Badge variant={STATUS_VARIANTS[seat.status]}>{STATUS_LABELS[seat.status]}</Badge>
            </DialogTitle>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* ── AVAILABLE: tabs ── */}
          {seat.status === 'AVAILABLE' && (
            <Tabs defaultValue="assign">
              <TabsList variant="line" className="w-full border-b rounded-none">
                <TabsTrigger value="assign" className="flex-1">Assign seat</TabsTrigger>
                <TabsTrigger value="reserve" className="flex-1">Reserve seat</TabsTrigger>
              </TabsList>
              <TabsContent value="assign" className="min-h-[268px]">
                <PersonPicker
                  unseatedPeople={unseatedPeople}
                  selectedPerson={selectedPerson}
                  onSelect={setSelectedPerson}
                  onNewPersonRequested={() => setShowPersonModal(true)}
                  notes={notes} onNotes={setNotes}
                  isPending={isPending}
                  onSubmit={handleAssignSubmit}
                />
              </TabsContent>
              <TabsContent value="reserve" className="min-h-[268px]">
                <ReserveForm
                  notes={reserveNotes} onNotes={setReserveNotes}
                  team={reserveTeam} onTeam={setReserveTeam}
                  teams={teams} isPending={isPending}
                  onSubmit={() => run(() => reserveSeat(seat.id, reserveNotes.trim()), 'Seat has been reserved.')}
                />
              </TabsContent>
            </Tabs>
          )}

          {/* ── OCCUPIED: view ── */}
          {seat.status === 'OCCUPIED' && mode === 'view' && (
            <>
              <div className="text-sm space-y-1">
                {seat.occupant_name && (
                  <p className="font-medium">
                    {seat.occupant_name}
                    {seat.occupant_team && <span className="font-normal text-muted-foreground"> · {seat.occupant_team}</span>}
                  </p>
                )}
                {seat.notes && <p className="text-muted-foreground">{seat.notes}</p>}
              </div>
              <DialogFooter>
                <Button size="lg" onClick={enterEdit}>Edit</Button>
                <Button size="lg" variant="outline" onClick={() => { close(); onMoveStart(seat) }}>Move</Button>
                <Button size="lg" variant="outline" disabled={isPending}
                  onClick={() => run(() => unassignSeat(seat.id), 'Seat has been unassigned.')}>Unassign</Button>
              </DialogFooter>
            </>
          )}

          {/* ── OCCUPIED: edit ── */}
          {seat.status === 'OCCUPIED' && mode === 'edit' && (
            <>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-label">Seat label</Label>
                  <Input id="edit-label" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-name">Name *</Label>
                  <Input id="edit-name" value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                </div>
                <div className="grid gap-1.5">
                  <Label>Team</Label>
                  <TeamCombobox value={editTeam} onChange={setEditTeam} teams={teams} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Division</Label>
                  <TeamCombobox value={editDivision} onChange={setEditDivision} teams={divisions} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Input id="edit-notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button size="lg" disabled={isPending || !editName.trim()}
                  onClick={() => run(async () => {
                    if (seat.person_id) {
                      // Person entity exists — update person record (syncs cache fields automatically)
                      await updatePerson(seat.person_id, {
                        name: editName.trim(),
                        team: editTeam.trim() || null,
                        division: editDivision.trim() || null,
                      })
                      // Update label and notes on the seat directly
                      await updateSeat(seat.id, {
                        label: editLabel.trim() || undefined,
                        notes: editNotes.trim() || null,
                      })
                    } else {
                      // Legacy free-text seat — update everything on the seat
                      await updateSeat(seat.id, {
                        label: editLabel.trim() || undefined,
                        occupant_name: editName.trim(),
                        occupant_team: editTeam.trim() || null,
                        occupant_division: editDivision.trim() || null,
                        notes: editNotes.trim() || null,
                      })
                    }
                  }, 'Seat has been updated.')}>
                  {isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setMode('view')}>Back</Button>
              </DialogFooter>
            </>
          )}

          {/* ── RESERVED: view ── */}
          {seat.status === 'RESERVED' && mode === 'view' && (
            <>
              <div className="text-sm">
                {seat.notes && <p className="text-muted-foreground">{seat.notes}</p>}
              </div>
              <DialogFooter>
                <Button size="lg" onClick={enterAssign}>Assign person</Button>
                <Button size="lg" variant="outline" disabled={isPending}
                  onClick={() => run(() => makeAvailable(seat.id), 'Seat has been made available.')}>Make available</Button>
              </DialogFooter>
            </>
          )}

          {/* ── RESERVED: assign ── */}
          {seat.status === 'RESERVED' && mode === 'edit' && !showReservedConfirm && (
            <>
              <PersonPicker
                unseatedPeople={unseatedPeople}
                selectedPerson={selectedPerson}
                onSelect={setSelectedPerson}
                onNewPersonRequested={() => setShowPersonModal(true)}
                notes={notes} onNotes={setNotes}
                isPending={isPending}
                onSubmit={handleAssignSubmit}
              />
              <Button size="lg" variant="ghost" className="mt-1" onClick={() => setMode('view')}>Back</Button>
            </>
          )}

          {/* ── RESERVED: confirmation ── */}
          {seat.status === 'RESERVED' && mode === 'edit' && showReservedConfirm && (
            <div className="grid gap-4 pt-2">
              <p className="text-sm text-muted-foreground">
                This seat is reserved
                {seat.notes ? <> for: <span className="font-medium text-foreground">{seat.notes}</span></> : '.'}{' '}
                Assign{' '}
                <span className="font-medium text-foreground">{selectedPerson?.name}</span>{' '}
                anyway?
              </p>
              <DialogFooter>
                <Button size="lg" disabled={isPending} onClick={() =>
                  run(() => assignSeat(seat.id, selectedPerson!.id, notes.trim()), 'Seat has been assigned.')
                }>
                  {isPending ? 'Saving…' : 'Confirm assign'}
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setShowReservedConfirm(false)}>Back</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Nested PersonModal — opens on top of the seat modal */}
      <PersonModal
        open={showPersonModal}
        onClose={() => setShowPersonModal(false)}
        onSaved={(person) => {
          setSelectedPerson(person)
          setShowPersonModal(false)
        }}
        teams={teams}
        divisions={divisions}
      />
    </>
  )
}
