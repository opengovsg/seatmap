'use client'

import { useState } from 'react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { ArrowUpDown } from 'lucide-react'
import type { AuditLog } from '@/types'

const ACTION_STYLES: Record<string, string> = {
  ASSIGN:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  UNASSIGN: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  RESERVE:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  MOVE:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  UPDATE:   'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  PUBLISH:  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  RESTORE:  'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
}

const columns: ColumnDef<AuditLog>[] = [
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
]

interface AuditLogTableProps {
  logs: AuditLog[]
}

export function AuditLogTable({ logs }: AuditLogTableProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }])

  const table = useReactTable({
    data: logs,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Filter by editor, seat, or action…"
        value={globalFilter}
        onChange={e => setGlobalFilter(e.target.value)}
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
      <p className="text-xs text-muted-foreground">
        Showing {table.getRowModel().rows.length} of {logs.length} entries
      </p>
    </div>
  )
}
