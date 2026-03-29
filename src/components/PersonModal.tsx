'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty,
} from '@/components/ui/combobox'
import type { Person } from '@/types'
import { createPerson, updatePerson } from '@/app/actions/people'

function TeamCombobox({ id, value, onChange, options, placeholder }: {
  id: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}) {
  return (
    <div onChange={(e) => onChange((e.target as HTMLInputElement).value)}>
      <Combobox value={value || null} onValueChange={(v) => onChange(v ?? '')}>
        <ComboboxInput
          id={id}
          placeholder={placeholder}
          showTrigger={options.length > 0}
          showClear={!!value}
          className="w-full"
        />
        {options.length > 0 && (
          <ComboboxContent>
            <ComboboxList>
              {options.map((t) => <ComboboxItem key={t} value={t}>{t}</ComboboxItem>)}
              <ComboboxEmpty>No match — type to add new</ComboboxEmpty>
            </ComboboxList>
          </ComboboxContent>
        )}
      </Combobox>
    </div>
  )
}

interface PersonModalProps {
  open: boolean
  onClose: () => void
  /** Provide to edit an existing person; omit to create a new one */
  person?: Person
  onSaved: (person: Person) => void
  teams: string[]
  divisions: string[]
}

export function PersonModal({ open, onClose, person, onSaved, teams, divisions }: PersonModalProps) {
  const isEdit = !!person

  const [name,     setName]     = useState(person?.name     ?? '')
  const [team,     setTeam]     = useState(person?.team     ?? '')
  const [division, setDivision] = useState(person?.division ?? '')
  const [error,    setError]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClose() {
    setName(''); setTeam(''); setDivision(''); setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        if (isEdit) {
          await updatePerson(person.id, {
            name: name.trim(),
            team: team.trim() || null,
            division: division.trim() || null,
          })
          onSaved({ ...person, name: name.trim(), team: team.trim() || null, division: division.trim() || null })
        } else {
          const created = await createPerson(name.trim(), team.trim(), division.trim())
          setName(''); setTeam(''); setDivision('')
          onSaved(created)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save person.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit person' : 'Add person'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3 pt-1">
          <div className="grid gap-1.5">
            <Label htmlFor="pm-name">Name *</Label>
            <Input
              id="pm-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pm-team">Team</Label>
            <TeamCombobox
              id="pm-team"
              value={team}
              onChange={setTeam}
              options={teams}
              placeholder="Team name"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pm-division">Division</Label>
            <TeamCombobox
              id="pm-division"
              value={division}
              onChange={setDivision}
              options={divisions}
              placeholder="Division name"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? 'Saving…' : isEdit ? 'Save' : 'Add'}
            </Button>
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
