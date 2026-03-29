'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface StartDraftModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (name: string) => void
  isPending: boolean
  /** If provided, the modal is in rename mode instead of start mode */
  currentName?: string | null
}

export function StartDraftModal({ open, onClose, onConfirm, isPending, currentName }: StartDraftModalProps) {
  const isRename = currentName != null
  const [name, setName] = useState(currentName ?? '')

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setName(currentName ?? '')
      onClose()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onConfirm(name.trim())
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isRename ? 'Rename draft' : 'Start new draft'}</DialogTitle>
          <DialogDescription>
            {isRename
              ? 'Update the name of the active draft.'
              : 'Give this draft a name so editors know what changes are being prepared.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="draft-name">Draft name</Label>
            <Input
              id="draft-name"
              placeholder="e.g. Q2 Office Reorg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending
                ? isRename ? 'Renaming…' : 'Starting…'
                : isRename ? 'Rename draft' : 'Start draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
