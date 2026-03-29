'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
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
  /** Pre-fill the name field when creating a new person */
  initialName?: string
  teams: string[]
  divisions: string[]
}

export function PersonModal({ open, onClose, person, onSaved, initialName, teams, divisions }: PersonModalProps) {
  const isEdit = !!person

  const [name,     setName]     = useState(person?.name     ?? initialName ?? '')
  const [team,     setTeam]     = useState(person?.team     ?? '')
  const [division, setDivision] = useState(person?.division ?? '')
  const [error,    setError]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Sync prefilled name each time the modal opens (useState ignores prop changes after mount)
  useEffect(() => {
    if (open && !isEdit) setName(initialName ?? '')
  }, [open])

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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit person' : 'Add person'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="pt-1">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pm-name">Name</FieldLabel>
              <Input
                id="pm-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Full name"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pm-team">Team</FieldLabel>
              <TeamCombobox
                id="pm-team"
                value={team}
                onChange={setTeam}
                options={teams}
                placeholder="Team name"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pm-division">Division</FieldLabel>
              <TeamCombobox
                id="pm-division"
                value={division}
                onChange={setDivision}
                options={divisions}
                placeholder="Division name"
              />
            </Field>
          </FieldGroup>
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          <DialogFooter>
            <Button type="submit" className="flex-1" disabled={isPending || !name.trim()}>
              {isPending ? 'Saving…' : isEdit ? 'Save' : 'Add'}
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
