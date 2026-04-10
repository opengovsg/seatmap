'use client'

import { useRef, useState, useTransition, useMemo, useEffect } from 'react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { uploadFloor, restoreSnapshot, listSnapshots, listAuditLogs } from '@/app/actions/floor'
import { addAdminAction, removeAdminAction, transferOwnershipAction, listAdminsAction, addEditorAction, removeEditorAction, listEditorsAction } from '@/app/actions/admins'
import { initializeDraft, publishDraft, discardDraft, getDraftSeatCount, renameDraft } from '@/app/actions/draft'
import { undoAuditEntry } from '@/app/actions/seats'
import { StartDraftModal } from '@/components/StartDraftModal'
import type { UploadResult, Snapshot } from '@/app/actions/floor'
import type { AdminRecord, AdminRole } from '@/lib/admins'
import type { AuditLog } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Upload, RotateCcw, AlertTriangle, ArrowUpDown, Undo2 } from 'lucide-react'

// ── Audit log columns ─────────────────────────────────────────────────────────
const ACTION_STYLES: Record<string, string> = {
  ASSIGN:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  UNASSIGN: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  RESERVE:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  MOVE:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  UPDATE:   'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  PUBLISH:  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  RESTORE:  'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
}

const UNDOABLE_ACTIONS = new Set(['ASSIGN', 'UNASSIGN', 'MOVE', 'RESERVE', 'UPDATE'])

function makeColumns(onUndo: (log: AuditLog) => void): ColumnDef<AuditLog>[] {
  return [
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <button className="flex items-center gap-1 text-left"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Time <ArrowUpDown className="size-3" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground whitespace-nowrap text-xs">
          {new Date(row.getValue('created_at')).toLocaleString('en-SG', {
            dateStyle: 'short', timeStyle: 'short',
          })}
        </span>
      ),
    },
    {
      accessorKey: 'editor_email',
      header: 'Editor',
      cell: ({ row }) => <span className="text-sm">{row.getValue('editor_email')}</span>,
    },
    {
      id: 'seat',
      header: 'Seat',
      accessorFn: (row) => row.seat?.label ?? '',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.seat?.label ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => {
        const action = row.getValue<string>('action')
        return (
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_STYLES[action] ?? 'bg-muted'}`}>
            {action}
          </span>
        )
      },
    },
    {
      id: 'change',
      header: 'Change',
      cell: ({ row }) => {
        const { field, old_value, new_value } = row.original
        if (!field) return null
        return (
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{field}</span>
            {old_value && <span> {old_value} →</span>}
            {new_value && <span> {new_value}</span>}
          </span>
        )
      },
    },
    {
      id: 'undo',
      header: '',
      cell: ({ row }) => {
        const log = row.original
        if (!UNDOABLE_ACTIONS.has(log.action) || !log.before) return null
        return (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => onUndo(log)}
            title="Undo this change"
          >
            <Undo2 className="size-3" />
            Undo
          </Button>
        )
      },
    },
  ]
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  initialSnapshots: Snapshot[]
  initialLogs: AuditLog[]
  initialAdmins: AdminRecord[]
  userEmail: string
  userRole: AdminRole
  isDraft: boolean
  draftName: string | null
  draftSeatCount: number
  floorId: string
}

export function AdminClient({ initialSnapshots, initialLogs, initialAdmins, userEmail, userRole, isDraft: initialIsDraft, draftName: initialDraftName, draftSeatCount: initialDraftSeatCount, floorId }: Props) {
  const fileRef                           = useRef<HTMLInputElement>(null)
  const [snapshots, setSnapshots]         = useState<Snapshot[]>(initialSnapshots)
  const [uploadResult, setUploadResult]   = useState<UploadResult | null>(null)
  const [uploadError, setUploadError]     = useState<string | null>(null)
  const [confirmId, setConfirmId]         = useState<string | null>(null)
  const [restoreMsg, setRestoreMsg]       = useState<string | null>(null)
  const [isPending, startTransition]      = useTransition()
  const [globalFilter, setGlobalFilter]   = useState('')
  const [sorting, setSorting]             = useState<SortingState>([{ id: 'created_at', desc: true }])
  const [snapPage, setSnapPage]           = useState(0)

  // ── Draft state ──
  const [isDraft, setIsDraft]             = useState(initialIsDraft)
  const [draftName, setDraftName]         = useState<string | null>(initialDraftName)
  const [draftSeatCount, setDraftSeatCount] = useState(initialDraftSeatCount)
  const [draftError, setDraftError]       = useState<string | null>(null)
  const [draftConfirm, setDraftConfirm]   = useState<'publish' | 'discard' | null>(null)
  const [draftModalMode, setDraftModalMode] = useState<'start' | 'rename' | null>(null)

  function handleInitDraft(name: string) {
    setDraftError(null)
    startTransition(async () => {
      try {
        await initializeDraft(floorId, name)
        setIsDraft(true)
        setDraftName(name)
        setDraftSeatCount(await getDraftSeatCount(floorId))
        setDraftModalMode(null)
      } catch (err) {
        setDraftError(err instanceof Error ? err.message : 'Failed to start draft.')
        setDraftModalMode(null)
      }
    })
  }

  function handleRenameDraft(name: string) {
    setDraftError(null)
    startTransition(async () => {
      try {
        await renameDraft(name)
        setDraftName(name)
        setDraftModalMode(null)
      } catch (err) {
        setDraftError(err instanceof Error ? err.message : 'Failed to rename draft.')
        setDraftModalMode(null)
      }
    })
  }

  function handlePublishDraft() {
    setDraftError(null)
    startTransition(async () => {
      try {
        await publishDraft(floorId)
        setIsDraft(false)
        setDraftConfirm(null)
        await Promise.all([refreshSnapshots(), refreshLogs()])
      } catch (err) {
        setDraftError(err instanceof Error ? err.message : 'Publish failed.')
        setDraftConfirm(null)
      }
    })
  }

  function handleDiscardDraft() {
    setDraftError(null)
    startTransition(async () => {
      try {
        await discardDraft(floorId)
        setIsDraft(false)
        setDraftConfirm(null)
        await refreshLogs()
      } catch (err) {
        setDraftError(err instanceof Error ? err.message : 'Discard failed.')
        setDraftConfirm(null)
      }
    })
  }

  // ── Admins state ──
  const [admins, setAdmins]               = useState<AdminRecord[]>(initialAdmins)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [adminError, setAdminError]       = useState<string | null>(null)
  const [adminMsg, setAdminMsg]           = useState<string | null>(null)
  const [transferEmail, setTransferEmail] = useState('')
  const [transferConfirm, setTransferConfirm] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  async function refreshAdmins() {
    setAdmins(await listAdminsAction())
  }

  function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault()
    setAdminError(null)
    setAdminMsg(null)
    startTransition(async () => {
      try {
        await addAdminAction(newAdminEmail.trim())
        setNewAdminEmail('')
        setAdminMsg(`${newAdminEmail.trim()} added as admin.`)
        await refreshAdmins()
      } catch (err) {
        setAdminError(err instanceof Error ? err.message : 'Failed to add admin.')
      }
    })
  }

  function handleRemoveAdmin(email: string) {
    setAdminError(null)
    setAdminMsg(null)
    startTransition(async () => {
      try {
        await removeAdminAction(email)
        setAdminMsg(`${email} removed.`)
        await refreshAdmins()
      } catch (err) {
        setAdminError(err instanceof Error ? err.message : 'Failed to remove admin.')
      }
    })
  }

  function handleTransferConfirm() {
    setTransferError(null)
    startTransition(async () => {
      try {
        await transferOwnershipAction(transferEmail.trim())
        // Page will reload and user will now see admin (non-owner) view
        window.location.reload()
      } catch (err) {
        setTransferError(err instanceof Error ? err.message : 'Transfer failed.')
        setTransferConfirm(false)
      }
    })
  }

  // ── Editors state ──
  const [editors, setEditors]               = useState<AdminRecord[]>([])
  const [newEditorEmail, setNewEditorEmail] = useState('')
  const [editorError, setEditorError]       = useState<string | null>(null)
  const [editorMsg, setEditorMsg]           = useState<string | null>(null)

  async function refreshEditors() {
    if (userRole === 'admin' || userRole === 'owner') {
      setEditors(await listEditorsAction())
    }
  }

  function handleAddEditor(e: React.FormEvent) {
    e.preventDefault()
    setEditorError(null)
    setEditorMsg(null)
    startTransition(async () => {
      try {
        await addEditorAction(newEditorEmail.trim())
        setNewEditorEmail('')
        setEditorMsg(`${newEditorEmail.trim()} added as editor.`)
        await refreshEditors()
      } catch (err) {
        setEditorError(err instanceof Error ? err.message : 'Failed to add editor.')
      }
    })
  }

  function handleRemoveEditor(email: string) {
    setEditorError(null)
    setEditorMsg(null)
    startTransition(async () => {
      try {
        await removeEditorAction(email)
        setEditorMsg(`${email} removed.`)
        await refreshEditors()
      } catch (err) {
        setEditorError(err instanceof Error ? err.message : 'Failed to remove editor.')
      }
    })
  }

  const [logs, setLogs]           = useState<AuditLog[]>(initialLogs)
  const [undoError, setUndoError] = useState<string | null>(null)

  // Load editors on mount if user is admin or owner
  useEffect(() => {
    refreshEditors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshLogs() {
    setLogs(await listAuditLogs() as AuditLog[])
  }

  function handleUndo(log: AuditLog) {
    setUndoError(null)
    startTransition(async () => {
      try {
        await undoAuditEntry(log.id)
        await refreshLogs()
      } catch (err) {
        setUndoError(err instanceof Error ? err.message : 'Undo failed.')
      }
    })
  }

  const columns = useMemo(() => makeColumns(handleUndo), [])

  const table = useReactTable({
    data: logs,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  })

  async function refreshSnapshots() {
    setSnapshots(await listSnapshots())
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadResult(null)
    setUploadError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const svgContent = ev.target?.result as string
      startTransition(async () => {
        try {
          setUploadResult(await uploadFloor(svgContent))
          await refreshSnapshots()
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed')
        } finally {
          if (fileRef.current) fileRef.current.value = ''
        }
      })
    }
    reader.readAsText(file)
  }

  function handleRestoreClick(id: string) { setConfirmId(id); setRestoreMsg(null) }

  function handleRestoreConfirm() {
    if (!confirmId) return
    startTransition(async () => {
      try {
        await restoreSnapshot(confirmId)
        setRestoreMsg('Restored successfully. Refresh the map to see changes.')
        await Promise.all([refreshSnapshots(), refreshLogs()])
      } catch (err) {
        setRestoreMsg(err instanceof Error ? err.message : 'Restore failed')
      } finally {
        setConfirmId(null)
      }
    })
  }

  return (
    <>
    <div className="flex flex-col gap-8">

      {/* ── Draft seating ── */}
      <Card>
        <CardHeader>
          <CardTitle>Draft seating</CardTitle>
          <CardDescription>
            Start a draft to let users rearrange seats without affecting the live map.
            Publish when ready, or discard to abandon changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!isDraft ? (
            <Button onClick={() => setDraftModalMode('start')} disabled={isPending} className="w-fit">
              Start draft
            </Button>
          ) : (
            <>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm text-muted-foreground">
                  Draft is active — <strong className="text-foreground">{draftSeatCount} seats</strong> in draft.
                  Changes are not live until published.
                </p>
                {draftName && (
                  <p className="text-sm text-muted-foreground">
                    Draft name: <strong className="text-foreground">{draftName}</strong>
                    {' '}
                    <button
                      className="text-xs underline underline-offset-2 hover:text-foreground"
                      onClick={() => setDraftModalMode('rename')}
                    >
                      Rename
                    </button>
                  </p>
                )}
              </div>
              {draftConfirm === 'publish' ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Publish draft and replace live seating?</span>
                  <Button size="sm" disabled={isPending} onClick={handlePublishDraft}>
                    {isPending ? 'Publishing…' : 'Yes, publish'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setDraftConfirm(null)}>Cancel</Button>
                </div>
              ) : draftConfirm === 'discard' ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Discard draft? All draft edits will be lost.</span>
                  <Button size="sm" variant="destructive" disabled={isPending} onClick={handleDiscardDraft}>
                    {isPending ? 'Discarding…' : 'Yes, discard'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setDraftConfirm(null)}>Cancel</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" disabled={isPending} onClick={() => setDraftConfirm('publish')}>Publish draft</Button>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => setDraftConfirm('discard')}>Discard draft</Button>
                </div>
              )}
            </>
          )}
          {draftError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {draftError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Audit log ── */}
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>All seat changes, most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            placeholder="Filter by editor, seat, or action…"
            value={globalFilter}
            onChange={e => { setGlobalFilter(e.target.value); table.setPageIndex(0) }}
            className="max-w-sm"
          />
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map(hg => (
                  <TableRow key={hg.id}>
                    {hg.headers.map(h => (
                      <TableHead key={h.id}>
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10 text-sm">
                      No audit log entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map(row => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} · {table.getFilteredRowModel().rows.length} entries
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                Next
              </Button>
            </div>
          </div>
          {undoError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {undoError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Editors Management ── */}
      {(userRole === 'admin' || userRole === 'owner') && (
        <Card>
          <CardHeader>
            <CardTitle>Editors</CardTitle>
            <CardDescription>
              Editors can edit seat assignments and manage people, but cannot access admin functions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">
                        No editors yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    editors
                      .slice()
                      .sort((a, b) => a.email.localeCompare(b.email))
                      .map(editor => (
                        <TableRow key={editor.email}>
                          <TableCell className="text-sm">{editor.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">Editor</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isPending}
                              onClick={() => handleRemoveEditor(editor.email)}
                              className="text-destructive hover:text-destructive"
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>

            <form onSubmit={handleAddEditor} className="flex gap-2 max-w-sm">
              <Input
                type="email"
                placeholder="colleague@open.gov.sg"
                value={newEditorEmail}
                onChange={e => setNewEditorEmail(e.target.value)}
                required
                disabled={isPending}
              />
              <Button type="submit" disabled={isPending || !newEditorEmail.trim()}>
                Add editor
              </Button>
            </form>

            {editorError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {editorError}
              </div>
            )}
            {editorMsg && <p className="text-sm text-muted-foreground">{editorMsg}</p>}
          </CardContent>
        </Card>
      )}

      {/* ── Admins (owner only) ── */}
      {userRole === 'owner' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Admins</CardTitle>
              <CardDescription>
                Admins can access this page. Only you (the owner) can add or remove them.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {admins
                      .filter(a => a.role === 'owner' || a.role === 'admin')
                      .slice()
                      .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.email.localeCompare(b.email)))
                      .map(admin => (
                        <TableRow key={admin.email}>
                          <TableCell className="text-sm">{admin.email}</TableCell>
                          <TableCell>
                            <Badge variant={admin.role === 'owner' ? 'default' : 'secondary'}>
                              {admin.role === 'owner' ? 'Owner' : 'Admin'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {admin.role !== 'owner' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isPending}
                                onClick={() => handleRemoveAdmin(admin.email)}
                                className="text-destructive hover:text-destructive"
                              >
                                Remove
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>

              <form onSubmit={handleAddAdmin} className="flex gap-2 max-w-sm">
                <Input
                  type="email"
                  placeholder="colleague@open.gov.sg"
                  value={newAdminEmail}
                  onChange={e => setNewAdminEmail(e.target.value)}
                  required
                  disabled={isPending}
                />
                <Button type="submit" disabled={isPending || !newAdminEmail.trim()}>
                  Add admin
                </Button>
              </form>

              {adminError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {adminError}
                </div>
              )}
              {adminMsg && <p className="text-sm text-muted-foreground">{adminMsg}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transfer ownership</CardTitle>
              <CardDescription>
                Transfer your owner role to another admin. You will be demoted to admin.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!transferConfirm ? (
                <form
                  onSubmit={e => { e.preventDefault(); setTransferConfirm(true); setTransferError(null) }}
                  className="flex gap-2 max-w-sm"
                >
                  <Input
                    type="email"
                    placeholder="new-owner@open.gov.sg"
                    value={transferEmail}
                    onChange={e => setTransferEmail(e.target.value)}
                    required
                    disabled={isPending}
                  />
                  <Button type="submit" variant="outline" disabled={isPending || !transferEmail.trim()}>
                    Transfer
                  </Button>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    Transfer ownership to <strong>{transferEmail}</strong>? You will become a regular admin.
                  </span>
                  <Button size="sm" variant="destructive" disabled={isPending} onClick={handleTransferConfirm}>
                    {isPending ? 'Transferring…' : 'Yes, transfer'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setTransferConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              )}
              {transferError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {transferError}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Upload section ── */}
      <Card>
        <CardHeader>
          <CardTitle>Upload new floor plan</CardTitle>
          <CardDescription>
            Existing seat assignments are preserved. New seats are added as Available.
            A snapshot is saved automatically before any changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <input ref={fileRef} type="file" accept=".svg" className="hidden"
            onChange={handleFileChange} disabled={isPending} />
          <Button onClick={() => fileRef.current?.click()} disabled={isPending} className="w-fit">
            <Upload className="size-4 mr-2" />
            {isPending ? 'Uploading…' : 'Choose SVG file'}
          </Button>

          {uploadError && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          {uploadResult && (
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm flex flex-col gap-2">
              <p className="font-medium">Upload complete</p>
              <div className="flex gap-4 text-muted-foreground">
                <span><strong className="text-foreground">{uploadResult.kept}</strong> seats preserved</span>
                <span><strong className="text-foreground">+{uploadResult.added}</strong> added</span>
                <span><strong className="text-foreground">{uploadResult.removed.length}</strong> removed from SVG</span>
              </div>
              {uploadResult.removed.length > 0 && (
                <p className="text-xs font-mono text-muted-foreground">
                  Removed: {uploadResult.removed.join(', ')}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Version history ── */}
      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>
            Every upload saves a snapshot. Restoring rolls back the SVG and all seat data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No snapshots yet.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {snapshots.slice(snapPage * 15, snapPage * 15 + 15).map(snap => (
                <div key={snap.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {new Date(snap.created_at).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {snap.seat_count} seats · <span className="font-mono">{snap.id.slice(0, 8)}…</span>
                    </span>
                  </div>
                  {confirmId === snap.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Restore this version?</span>
                      <Button size="sm" variant="destructive" disabled={isPending} onClick={handleRestoreConfirm}>
                        {isPending ? 'Restoring…' : 'Yes, restore'}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" disabled={isPending}
                      onClick={() => handleRestoreClick(snap.id)}>
                      <RotateCcw className="size-3.5 mr-1.5" />
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {snapshots.length > 15 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-3">
              <span>
                Page {snapPage + 1} of {Math.ceil(snapshots.length / 15)}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSnapPage(p => p - 1)} disabled={snapPage === 0}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSnapPage(p => p + 1)} disabled={snapPage >= Math.ceil(snapshots.length / 15) - 1}>
                  Next
                </Button>
              </div>
            </div>
          )}
          {restoreMsg && (
            <p className="mt-4 text-sm text-muted-foreground border-t pt-4">{restoreMsg}</p>
          )}
        </CardContent>
      </Card>

    </div>

    <StartDraftModal
      open={draftModalMode !== null}
      onClose={() => setDraftModalMode(null)}
      onConfirm={draftModalMode === 'rename' ? handleRenameDraft : handleInitDraft}
      isPending={isPending}
      currentName={draftModalMode === 'rename' ? draftName : undefined}
    />
    </>
  )
}
