'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty, ComboboxSeparator } from '@/components/ui/combobox'
import { UserPlus, UserRoundPlus } from 'lucide-react'
import type { Seat, Person } from '@/types'
import { assignSeat, unassignSeat, reserveSeat, makeAvailable, restoreSeat, updateSeat } from '@/app/actions/seats'
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
  onNewPersonRequested: (prefillName: string) => void
  notes: string
  onNotes: (v: string) => void
  isPending: boolean
  onSubmit: () => void  // kept for compatibility; button is rendered at call site
}) {
  const [search, setSearch] = useState('')

  const filtered = unseatedPeople.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <FieldGroup className="pt-3">
      {!selectedPerson ? (
        <Field>
          <FieldLabel>Person</FieldLabel>
          <div className="flex gap-2">
          <div className="flex-1" onChange={(e) => setSearch((e.target as HTMLInputElement).value)}>
            <Combobox value={null} onValueChange={(id) => {
              if (id === '__new__') { onNewPersonRequested(search); return }
              const person = unseatedPeople.find(p => p.id === id) ?? null
              onSelect(person)
            }}>
              <ComboboxInput
                placeholder="Search unseated people…"
                showTrigger
                showClear={false}
                className="w-full"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered.length === 1) {
                    e.preventDefault()
                    onSelect(filtered[0])
                  }
                }}
              />
              <ComboboxContent side="bottom" align="start">
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
          <Button size="icon" variant="outline" type="button" onClick={() => onNewPersonRequested(search)} title="Add new person" className="self-end">
            <UserRoundPlus className="size-4" />
          </Button>
          </div>
        </Field>
      ) : (
        <Field>
          <FieldLabel>Person</FieldLabel>
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
        </Field>
      )}

      {selectedPerson && (
        <Field>
          <FieldLabel htmlFor="assign-notes">Notes</FieldLabel>
          <Input
            id="assign-notes"
            value={notes}
            onChange={e => onNotes(e.target.value)}
            placeholder="Optional"
            onKeyDown={e => {
              if (e.key === 'Enter' && !isPending) {
                e.preventDefault()
                onSubmit()
              }
            }}
          />
        </Field>
      )}
    </FieldGroup>
  )
}

// ── Reserve form ───────────────────────────────────────────────────────────────
function ReserveForm({ notes, onNotes, team, onTeam, teams, isPending, onSubmit }: {
  notes: string; onNotes: (v: string) => void
  team: string; onTeam: (v: string) => void
  teams: string[]; isPending: boolean; onSubmit: () => void
}) {
  return (
    <FieldGroup className="pt-3">
      <p className="text-xs text-muted-foreground">Use this function when you haven&apos;t identified the hire yet.</p>
      <Field>
        <FieldLabel htmlFor="reserve-reason">Reason</FieldLabel>
        <Input id="reserve-reason" value={notes} onChange={e => onNotes(e.target.value)} placeholder="e.g. Holding for Design hire" autoFocus />
      </Field>
      <Field>
        <FieldLabel>Team</FieldLabel>
        <TeamCombobox value={team} onChange={onTeam} teams={teams} />
      </Field>
    </FieldGroup>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────
interface SeatModalProps {
  seat: Seat | null
  teams: string[]
  divisions: string[]
  unseatedPeople: Person[]
  initialPerson?: Person | null
  canEdit: boolean
  onClose: () => void
  onUpdated: () => Promise<void>
  onMoveStart: (seat: Seat) => void
}

export function SeatModal({ seat, teams, divisions, unseatedPeople, initialPerson, canEdit, onClose, onUpdated, onMoveStart }: SeatModalProps) {
  // Open straight to assign mode if a person was pre-selected from the panel
  const [mode, setMode] = useState<Mode>(() =>
    initialPerson && seat?.status !== 'OCCUPIED' ? 'edit' : 'view'
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Person picker state
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(initialPerson ?? null)
  const [showPersonModal, setShowPersonModal] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')

  // Inline notes editing on occupied view
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue,   setNotesValue]   = useState(seat?.notes ?? '')

  function handleSaveNotes() {
    const trimmed = notesValue.trim()
    startTransition(async () => {
      try {
        await updateSeat(seat!.id, { notes: trimmed || null })
        setNotesValue(trimmed)
        await onUpdated()
        setEditingNotes(false)
      } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    })
  }

  // Shared notes for assign forms
  const [notes, setNotes] = useState(seat?.status === 'OCCUPIED' ? (seat.notes ?? '') : '')

  // Reserve form state
  const [reserveNotes, setReserveNotes] = useState(seat?.status === 'RESERVED' ? (seat.notes ?? '') : '')
  const [reserveTeam,  setReserveTeam]  = useState('')

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

  const enterEdit = () => setMode('edit')

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
            <>
              {canEdit ? (
                <Tabs defaultValue="assign">
                  <TabsList variant="line" className="w-full border-b rounded-none">
                    <TabsTrigger value="assign" className="flex-1">Assign seat</TabsTrigger>
                    <TabsTrigger value="reserve" className="flex-1">Reserve seat</TabsTrigger>
                  </TabsList>
                  <TabsContent value="assign">
                    <PersonPicker
                      unseatedPeople={unseatedPeople}
                      selectedPerson={selectedPerson}
                      onSelect={setSelectedPerson}
                      onNewPersonRequested={(name) => { setNewPersonName(name); setShowPersonModal(true) }}
                      notes={notes} onNotes={setNotes}
                      isPending={isPending}
                      onSubmit={handleAssignSubmit}
                    />
                    <DialogFooter>
                      <Button size="lg" className="w-full" disabled={isPending || !selectedPerson} onClick={handleAssignSubmit}>
                        {isPending ? 'Saving…' : 'Assign'}
                      </Button>
                    </DialogFooter>
                  </TabsContent>
                  <TabsContent value="reserve">
                    <ReserveForm
                      notes={reserveNotes} onNotes={setReserveNotes}
                      team={reserveTeam} onTeam={setReserveTeam}
                      teams={teams} isPending={isPending}
                      onSubmit={() => run(() => reserveSeat(seat.id, reserveNotes.trim(), reserveTeam.trim()), 'Seat has been reserved.')}
                    />
                    <DialogFooter>
                      <Button size="lg" className="w-full" disabled={isPending} onClick={() => run(() => reserveSeat(seat.id, reserveNotes.trim(), reserveTeam.trim()), 'Seat has been reserved.')}>
                        {isPending ? 'Saving…' : 'Reserve'}
                      </Button>
                    </DialogFooter>
                  </TabsContent>
                </Tabs>
              ) : (
                <p className="text-sm text-muted-foreground py-4">This seat is available.</p>
              )}
            </>
          )}

          {/* ── OCCUPIED: view ── */}
          {seat.status === 'OCCUPIED' && mode === 'view' && (
            <>
              <FieldGroup>
                <Field>
                  <FieldLabel>Person</FieldLabel>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-muted/40">
                    <div>
                      <span className="font-medium">{seat.occupant_name}</span>
                      {seat.occupant_team && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {[seat.occupant_team, seat.occupant_division].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={enterEdit}
                      >
                        Change
                      </button>
                    )}
                  </div>
                </Field>
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>Notes</FieldLabel>
                    {canEdit && !editingNotes && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => { setNotesValue(seat.notes ?? ''); setEditingNotes(true) }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editingNotes ? (
                    <div className="relative">
                      <textarea
                        className="w-full rounded-md border px-3 py-2 pb-10 text-sm resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        rows={3}
                        value={notesValue}
                        onChange={e => setNotesValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingNotes(false) }}
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="absolute bottom-2 right-2"
                        onClick={handleSaveNotes}
                        disabled={isPending}
                      >
                        {isPending ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{notesValue || <span className="italic">None</span>}</p>
                  )}
                </Field>
              </FieldGroup>
              {canEdit && (
                <DialogFooter>
                  <div className="flex gap-2 w-full">
                    <Button size="lg" variant="outline" className="flex-1" onClick={() => { close(); onMoveStart(seat) }}>Move</Button>
                    <Button size="lg" variant="outline" className="flex-1" disabled={isPending}
                      onClick={() => run(() => unassignSeat(seat.id), 'Seat has been unassigned.')}>Unassign</Button>
                  </div>
                </DialogFooter>
              )}
            </>
          )}

          {/* ── OCCUPIED: change person ── */}
          {seat.status === 'OCCUPIED' && mode === 'edit' && (
            <>
              <PersonPicker
                unseatedPeople={unseatedPeople}
                selectedPerson={selectedPerson}
                onSelect={setSelectedPerson}
                onNewPersonRequested={(name) => { setNewPersonName(name); setShowPersonModal(true) }}
                notes={notes} onNotes={setNotes}
                isPending={isPending}
                onSubmit={() => run(() => assignSeat(seat.id, selectedPerson!.id, notes.trim()), 'Seat has been updated.')}
              />
              <DialogFooter>
                <Button size="lg" className="w-full" disabled={isPending || !selectedPerson} onClick={() => run(() => assignSeat(seat.id, selectedPerson!.id, notes.trim()), 'Seat has been updated.')}>
                  {isPending ? 'Saving…' : 'Assign'}
                </Button>
                <Button size="lg" variant="ghost" className="w-full" onClick={() => setMode('view')}>Back</Button>
              </DialogFooter>
            </>
          )}

          {/* ── RESERVED: view ── */}
          {seat.status === 'RESERVED' && mode === 'view' && (
            <>
              <div className="text-sm space-y-2">
                {seat.notes && <p className="text-muted-foreground">{seat.notes}</p>}
                {seat.occupant_team && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Team:</span> {seat.occupant_team}
                  </p>
                )}
              </div>
              {canEdit && (
                <DialogFooter>
                  <Button size="lg" onClick={enterAssign}>Assign person</Button>
                  <Button size="lg" variant="outline" disabled={isPending}
                    onClick={() => run(() => makeAvailable(seat.id), 'Seat has been made available.')}>Make available</Button>
                </DialogFooter>
              )}
            </>
          )}

          {/* ── RESERVED: assign ── */}
          {seat.status === 'RESERVED' && mode === 'edit' && !showReservedConfirm && (
            <>
              <PersonPicker
                unseatedPeople={unseatedPeople}
                selectedPerson={selectedPerson}
                onSelect={setSelectedPerson}
                onNewPersonRequested={(name) => { setNewPersonName(name); setShowPersonModal(true) }}
                notes={notes} onNotes={setNotes}
                isPending={isPending}
                onSubmit={handleAssignSubmit}
              />
              <DialogFooter>
                <Button size="lg" className="w-full" disabled={isPending || !selectedPerson} onClick={handleAssignSubmit}>
                  {isPending ? 'Saving…' : 'Assign'}
                </Button>
                <Button size="lg" variant="ghost" className="w-full" onClick={() => setMode('view')}>Back</Button>
              </DialogFooter>
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
        initialName={newPersonName}
        teams={teams}
        divisions={divisions}
      />
    </>
  )
}
