'use client'

import { useState, useTransition } from 'react'
import { X, Plus, Search, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import type { Person } from '@/types'
import { createPerson, archivePerson } from '@/app/actions/people'

interface UnseatedPanelProps {
  open: boolean
  onClose: () => void
  people: Person[]
  userIsAdmin: boolean
  onPersonAssign: (person: Person) => void
  onRefresh: () => Promise<void>
}

export function UnseatedPanel({ open, onClose, people, userIsAdmin, onPersonAssign, onRefresh }: UnseatedPanelProps) {
  const [search, setSearch]           = useState('')
  const [showAdd, setShowAdd]         = useState(false)
  const [newName, setNewName]         = useState('')
  const [newTeam, setNewTeam]         = useState('')
  const [newDivision, setNewDivision] = useState('')
  const [error, setError]             = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  const unseated = people.filter(p => !p.seat)
  const seated   = people.filter(p =>  p.seat)

  const filtered = (list: Person[]) =>
    list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  function handleAddPerson(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        await createPerson(newName.trim(), newTeam.trim(), newDivision.trim())
        await onRefresh()
        setNewName(''); setNewTeam(''); setNewDivision('')
        setShowAdd(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add person.')
      }
    })
  }

  function handleArchive(person: Person) {
    startTransition(async () => {
      try {
        await archivePerson(person.id)
        await onRefresh()
      } catch {
        // silently ignore
      }
    })
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={[
          'fixed top-0 left-0 z-40 h-full w-72 bg-background border-r shadow-lg flex flex-col',
          'transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <span className="font-semibold text-sm">People</span>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => setShowAdd(v => !v)} title="Add person">
              <Plus className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Add person form */}
        {showAdd && (
          <form onSubmit={handleAddPerson} className="px-4 py-3 border-b flex flex-col gap-2 shrink-0 bg-muted/40">
            <div className="flex flex-col gap-1">
              <Label htmlFor="new-name" className="text-xs">Name *</Label>
              <Input id="new-name" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Full name" autoFocus className="h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="new-team" className="text-xs">Team</Label>
              <Input id="new-team" value={newTeam} onChange={e => setNewTeam(e.target.value)}
                placeholder="Optional" className="h-8 text-sm" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isPending || !newName.trim()} className="flex-1">
                {isPending ? 'Adding…' : 'Add'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </form>
        )}

        {/* Search */}
        <div className="px-4 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search people…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">

          {/* Unseated */}
          <section>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Unseated ({filtered(unseated).length})
            </p>
            {filtered(unseated).length === 0 ? (
              <p className="text-xs text-muted-foreground">No unseated people.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {filtered(unseated).map(person => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    userIsAdmin={userIsAdmin}
                    onAssign={() => { onClose(); onPersonAssign(person) }}
                    onArchive={() => handleArchive(person)}
                    isPending={isPending}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Seated */}
          {seated.length > 0 && (
            <section>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Seated ({filtered(seated).length})
              </p>
              <ul className="flex flex-col gap-1">
                {filtered(seated).map(person => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    userIsAdmin={userIsAdmin}
                    onArchive={() => handleArchive(person)}
                    isPending={isPending}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

function PersonRow({ person, userIsAdmin, onAssign, onArchive, isPending }: {
  person: Person
  userIsAdmin: boolean
  onAssign?: () => void
  onArchive: () => void
  isPending: boolean
}) {
  const [hover, setHover] = useState(false)

  return (
    <li
      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <UserRound className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{person.name}</p>
        {(person.team || person.division) && (
          <p className="text-xs text-muted-foreground truncate">
            {[person.team, person.division].filter(Boolean).join(' · ')}
          </p>
        )}
        {person.seat && (
          <Badge variant="secondary" className="text-xs mt-0.5">{person.seat.label}</Badge>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {onAssign && !person.seat && (
          <Button size="icon-sm" variant="ghost" onClick={onAssign} title="Assign to seat" className="opacity-0 group-hover:opacity-100">
            <Plus className="size-3.5" />
          </Button>
        )}
        {userIsAdmin && hover && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onArchive}
            disabled={isPending}
            title="Archive person"
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  )
}
