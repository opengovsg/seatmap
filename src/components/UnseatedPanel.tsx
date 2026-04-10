'use client'

import { useState, useTransition } from 'react'
import { X, Search, UserRound, UserRoundCheck, UserRoundX, UserRoundPlus, MoreHorizontal, Move } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Person } from '@/types'
import { archivePerson, unarchivePerson, unassignSeatByPersonId, deletePerson } from '@/app/actions/people'
import { PersonModal } from './PersonModal'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface UnseatedPanelProps {
  open: boolean
  onClose: () => void
  people: Person[]
  userIsAdmin: boolean
  canEdit: boolean
  teams: string[]
  divisions: string[]
  onPersonAssign: (person: Person) => void
  onRefresh: () => Promise<void>
}

type FilterTab = 'unseated' | 'seated' | 'archived'

export function UnseatedPanel({ open, onClose, people, userIsAdmin, canEdit, teams, divisions, onPersonAssign, onRefresh }: UnseatedPanelProps) {
  const [search, setSearch]               = useState('')
  const [filter, setFilter]               = useState<FilterTab>('unseated')
  const [showAdd, setShowAdd]             = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Person | null>(null)
  const [isPending, startTransition]      = useTransition()

  // Apply search filter first across ALL people
  const searchLower = search.toLowerCase()
  const searchFiltered = search.trim()
    ? people.filter(p => p.name.toLowerCase().includes(searchLower))
    : people

  const unseated = searchFiltered.filter(p => !p.is_archived && !p.seat)
  const seated   = searchFiltered.filter(p => !p.is_archived &&  p.seat)
  const archived = searchFiltered.filter(p =>  p.is_archived)

  const counts = { unseated: unseated.length, seated: seated.length, archived: archived.length }

  const filtered = filter === 'unseated' ? unseated : filter === 'seated' ? seated : archived

  function handleArchive(person: Person) {
    startTransition(async () => {
      try { await archivePerson(person.id); await onRefresh() } catch { /* ignore */ }
    })
  }

  function handleUnarchive(person: Person) {
    startTransition(async () => {
      try { await unarchivePerson(person.id); await onRefresh() } catch { /* ignore */ }
    })
  }

  function handleUnassign(person: Person) {
    startTransition(async () => {
      try { await unassignSeatByPersonId(person.id); await onRefresh() } catch { /* ignore */ }
    })
  }

  function handleDelete(person: Person) {
    startTransition(async () => {
      try { await deletePerson(person.id); setConfirmDelete(null); await onRefresh() } catch { /* ignore */ }
    })
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
      )}

      {/* Slide-in panel */}
      <div className={[
        'fixed top-0 left-0 z-40 h-full w-72 bg-background border-r shadow-lg flex flex-col',
        'transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b shrink-0">
          <span className="font-semibold text-sm">People</span>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Search + Add */}
        <div className="px-3 py-2 shrink-0 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search people…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          {canEdit && (
            <Button size="icon" variant="outline" onClick={() => setShowAdd(true)} title="Add person">
              <UserRoundPlus className="size-4" />
            </Button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="shrink-0">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
            <TabsList variant="line" className="w-full px-3">
              {(['unseated', 'seated', 'archived'] as FilterTab[]).map(tab => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="flex-1 capitalize text-xs gap-1"
                >
                  {tab}
                  {tab === 'unseated' && counts[tab] > 0 && (
                    <span className="text-muted-foreground">{counts[tab]}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground">No {filter} people.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map(person => (
                <PersonRow
                  key={person.id}
                  person={person}
                  userIsAdmin={userIsAdmin}
                  canEdit={canEdit}
                  onEdit={() => setEditingPerson(person)}
                  onAssign={filter !== 'archived' && canEdit ? () => { onClose(); onPersonAssign(person) } : undefined}
                  onUnassign={filter === 'seated' && canEdit ? () => handleUnassign(person) : undefined}
                  onArchive={filter !== 'archived' ? () => handleArchive(person) : undefined}
                  onUnarchive={filter === 'archived' ? () => handleUnarchive(person) : undefined}
                  onDelete={filter === 'archived' && userIsAdmin ? () => setConfirmDelete(person) : undefined}
                  isPending={isPending}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Add person modal */}
      <PersonModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={async () => { setShowAdd(false); await onRefresh() }}
        teams={teams}
        divisions={divisions}
      />

      {/* Edit person modal */}
      <PersonModal
        key={editingPerson?.id}
        open={!!editingPerson}
        person={editingPerson ?? undefined}
        onClose={() => setEditingPerson(null)}
        onSaved={async () => { setEditingPerson(null); await onRefresh() }}
        teams={teams}
        divisions={divisions}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete person?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{confirmDelete?.name}</span> will be permanently deleted. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="destructive" disabled={isPending} onClick={() => confirmDelete && handleDelete(confirmDelete)}>
              {isPending ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PersonRow({ person, userIsAdmin, canEdit, onEdit, onAssign, onUnassign, onArchive, onUnarchive, onDelete, isPending }: {
  person: Person
  userIsAdmin: boolean
  canEdit: boolean
  onEdit: () => void
  onAssign?: () => void
  onUnassign?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete?: () => void
  isPending: boolean
}) {
  return (
    <li className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors group">
      {person.is_archived
        ? <UserRoundX     className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        : person.seat
        ? <UserRoundCheck className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        : <UserRound      className="size-4 text-muted-foreground shrink-0 mt-0.5" />
      }

      {/* Name / meta — clickable to open details */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <p className={`text-sm font-medium truncate ${person.is_archived ? 'text-muted-foreground' : ''}`}>
          {person.name}
        </p>
        {person.job_title && (
          <p className="text-xs text-muted-foreground truncate">
            {person.job_title}
          </p>
        )}
        {(person.team || person.division) && (
          <p className="text-xs text-muted-foreground truncate">
            {[person.team, person.division].filter(Boolean).join(' · ')}
          </p>
        )}
        {person.seat && (
          <Badge variant="secondary" className="text-xs mt-0.5">{person.seat.label}</Badge>
        )}
      </div>

      {/* Action buttons — visible on hover */}
      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 mt-0.5">
        {onAssign && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onAssign() }}
            title="Pick a seat"
          >
            <Move className="size-3.5" />
          </Button>
        )}
        {/* Three-dot menu */}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" title="More options" />}>
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {canEdit && <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>}
            {onUnassign && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onUnassign} disabled={isPending}>
                  Unassign
                </DropdownMenuItem>
              </>
            )}
            {userIsAdmin && (
              <>
                <DropdownMenuSeparator />
                {onUnarchive ? (
                  <DropdownMenuItem onClick={onUnarchive} disabled={isPending}>
                    Unarchive
                  </DropdownMenuItem>
                ) : onArchive ? (
                  <DropdownMenuItem
                    onClick={onArchive}
                    disabled={isPending}
                    className="text-destructive focus:text-destructive"
                  >
                    Archive
                  </DropdownMenuItem>
                ) : null}
              </>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  disabled={isPending}
                  className="text-destructive focus:text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
