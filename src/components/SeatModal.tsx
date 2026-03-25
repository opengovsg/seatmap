'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from '@/components/ui/combobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { Seat } from '@/types'
import { assignSeat, unassignSeat, reserveSeat, makeAvailable, updateSeat } from '@/app/actions/seats'

type Mode = 'view' | 'edit'

const STATUS_LABELS = { AVAILABLE: 'Available', OCCUPIED: 'Occupied', RESERVED: 'Reserved' }
const STATUS_VARIANTS: Record<string, 'default' | 'destructive' | 'secondary'> = {
  AVAILABLE: 'default', OCCUPIED: 'destructive', RESERVED: 'secondary',
}

// ── Team combobox — allows free text or pick from existing teams ──────────────
// Wrapping div captures bubbled native onChange for free-text typing;
// onValueChange handles item selection from the dropdown.
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

// ── Assign form (used for AVAILABLE tab + RESERVED assign) ────────────────────
function AssignForm({ name, onName, team, onTeam, notes, onNotes, teams, isPending, onSubmit }: {
  name: string; onName: (v: string) => void
  team: string; onTeam: (v: string) => void
  notes: string; onNotes: (v: string) => void
  teams: string[]; isPending: boolean; onSubmit: () => void
}) {
  return (
    <div className="grid gap-3 pt-3">
      <div className="grid gap-1.5">
        <Label htmlFor="assign-name">Name *</Label>
        <Input id="assign-name" value={name} onChange={e => onName(e.target.value)} placeholder="Full name" autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label>Team</Label>
        <TeamCombobox value={team} onChange={onTeam} teams={teams} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="assign-notes">Notes</Label>
        <Input id="assign-notes" value={notes} onChange={e => onNotes(e.target.value)} placeholder="Optional" />
      </div>
      <Button size="sm" disabled={isPending || !name.trim()} onClick={onSubmit} className="mt-1">
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
      <div className="grid gap-1.5">
        <Label htmlFor="reserve-reason">Reason</Label>
        <Input id="reserve-reason" value={notes} onChange={e => onNotes(e.target.value)} placeholder="e.g. Holding for Design hire" autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label>Team</Label>
        <TeamCombobox value={team} onChange={onTeam} teams={teams} />
      </div>
      <Button size="sm" disabled={isPending} onClick={onSubmit} className="mt-1">
        {isPending ? 'Saving…' : 'Reserve'}
      </Button>
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────
interface SeatModalProps {
  seat: Seat | null; teams: string[]
  onClose: () => void; onUpdated: () => Promise<void>; onMoveStart: (seat: Seat) => void
}

export function SeatModal({ seat, teams, onClose, onUpdated, onMoveStart }: SeatModalProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name,  setName]  = useState('')
  const [team,  setTeam]  = useState('')
  const [notes, setNotes] = useState('')
  const [label, setLabel] = useState('')

  const close = () => { setMode('view'); setError(null); onClose() }

  const run = (fn: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try { await fn(); await onUpdated(); close() }
      catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    })
  }

  const enterEdit = () => {
    setName(seat?.occupant_name ?? '')
    setTeam(seat?.occupant_team ?? '')
    setNotes(seat?.notes ?? '')
    setLabel(seat?.label ?? '')
    setMode('edit')
  }

  const enterAssign = () => {
    setName(''); setTeam(''); setNotes('')
    setMode('edit')
  }

  if (!seat) return null

  return (
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
            <TabsList className="w-full">
              <TabsTrigger value="assign" className="flex-1">Assign seat</TabsTrigger>
              <TabsTrigger value="reserve" className="flex-1">Reserve seat</TabsTrigger>
            </TabsList>
            <TabsContent value="assign">
              <AssignForm
                name={name} onName={setName} team={team} onTeam={setTeam}
                notes={notes} onNotes={setNotes} teams={teams} isPending={isPending}
                onSubmit={() => run(() => assignSeat(seat.id, name.trim(), team.trim(), notes.trim()))}
              />
            </TabsContent>
            <TabsContent value="reserve">
              <ReserveForm
                notes={notes} onNotes={setNotes} team={team} onTeam={setTeam}
                teams={teams} isPending={isPending}
                onSubmit={() => run(() => reserveSeat(seat.id, notes.trim()))}
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
              <Button size="sm" onClick={enterEdit}>Edit</Button>
              <Button size="sm" variant="outline" onClick={() => { close(); onMoveStart(seat) }}>Move</Button>
              <Button size="sm" variant="outline" disabled={isPending}
                onClick={() => run(() => unassignSeat(seat.id))}>Unassign</Button>
            </DialogFooter>
          </>
        )}

        {/* ── OCCUPIED: edit ── */}
        {seat.status === 'OCCUPIED' && mode === 'edit' && (
          <>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-label">Seat label</Label>
                <Input id="edit-label" value={label} onChange={e => setLabel(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-name">Name *</Label>
                <Input id="edit-name" value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label>Team</Label>
                <TeamCombobox value={team} onChange={setTeam} teams={teams} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-notes">Notes</Label>
                <Input id="edit-notes" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" disabled={isPending || !name.trim()}
                onClick={() => run(() => updateSeat(seat.id, {
                  label: label.trim() || undefined,
                  occupant_name: name.trim(),
                  occupant_team: team.trim() || null,
                  notes: notes.trim() || null,
                }))}>
                {isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('view')}>Back</Button>
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
              <Button size="sm" onClick={enterAssign}>Assign person</Button>
              <Button size="sm" variant="outline" disabled={isPending}
                onClick={() => run(() => makeAvailable(seat.id))}>Make available</Button>
            </DialogFooter>
          </>
        )}

        {/* ── RESERVED: assign ── */}
        {seat.status === 'RESERVED' && mode === 'edit' && (
          <>
            <AssignForm
              name={name} onName={setName} team={team} onTeam={setTeam}
              notes={notes} onNotes={setNotes} teams={teams} isPending={isPending}
              onSubmit={() => run(() => assignSeat(seat.id, name.trim(), team.trim(), notes.trim()))}
            />
            <Button size="sm" variant="ghost" className="mt-1" onClick={() => setMode('view')}>Back</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
