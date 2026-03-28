import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import type { AuditLog } from '@/types'

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function AuditPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params  = await searchParams
  const query   = params.q?.trim() ?? ''
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset  = (page - 1) * PAGE_SIZE

  const db = createAdminClient()

  let countReq = db.from('audit_logs').select('*', { count: 'exact', head: true })
  let dataReq  = db
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (query) {
    countReq = countReq.ilike('editor_email', `%${query}%`) as typeof countReq
    dataReq  = dataReq.ilike('editor_email',  `%${query}%`) as typeof dataReq
  }

  const [{ count }, { data: rawLogs }] = await Promise.all([countReq, dataReq])

  // Fetch seat labels separately (FK was dropped to preserve history across restores)
  const seatIds = [...new Set((rawLogs ?? []).map(l => l.seat_id as string).filter(Boolean))]
  const { data: seatRows } = seatIds.length > 0
    ? await db.from('seats').select('id, label').in('id', seatIds)
    : { data: [] }
  const seatLabelMap = new Map((seatRows ?? []).map(s => [s.id, s.label]))
  const logs = (rawLogs ?? []).map(l => ({ ...l, seat: { label: seatLabelMap.get(l.seat_id) ?? l.seat_id } }))

  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">
      <header className="border-b bg-background px-4 py-2 flex items-center gap-3 shrink-0">
        <a href="/map" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Map
        </a>
        <span className="font-semibold text-sm">Audit log</span>
        <div className="flex-1" />
        <form method="GET" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Filter by email or seat…"
            className="text-sm border rounded-md px-3 py-1.5 bg-background w-60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button type="submit"
            className="text-sm border rounded-md px-3 py-1.5 bg-background hover:bg-muted transition-colors">
            Filter
          </button>
          {query && (
            <a href="/audit"
              className="text-sm border rounded-md px-3 py-1.5 bg-background hover:bg-muted transition-colors">
              Clear
            </a>
          )}
        </form>
      </header>

      <main className="flex-1 overflow-auto p-4">
        {(!logs || logs.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-16">No audit log entries yet.</p>
        ) : (
          <>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Editor</th>
                  <th className="py-2 pr-4 font-medium">Seat</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {(logs as AuditLog[]).map((log) => (
                  <tr key={log.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-SG', {
                        dateStyle: 'short', timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2 pr-4">{log.editor_email}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{log.seat?.label ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {log.field && (
                        <span>
                          <span className="font-medium text-foreground">{log.field}</span>
                          {log.old_value && <span> {log.old_value} →</span>}
                          {log.new_value && <span> {log.new_value}</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6 text-sm">
                {page > 1 && (
                  <a href={`/audit?q=${query}&page=${page - 1}`}
                    className="border rounded-md px-3 py-1.5 hover:bg-muted transition-colors">
                    Previous
                  </a>
                )}
                <span className="text-muted-foreground">Page {page} of {totalPages}</span>
                {page < totalPages && (
                  <a href={`/audit?q=${query}&page=${page + 1}`}
                    className="border rounded-md px-3 py-1.5 hover:bg-muted transition-colors">
                    Next
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    ASSIGN:   'bg-green-100 text-green-800',
    UNASSIGN: 'bg-gray-100 text-gray-700',
    RESERVE:  'bg-amber-100 text-amber-800',
    MOVE:     'bg-blue-100 text-blue-800',
    UPDATE:   'bg-purple-100 text-purple-800',
    PUBLISH:  'bg-indigo-100 text-indigo-800',
    RESTORE:  'bg-orange-100 text-orange-800',
  }
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${styles[action] ?? 'bg-muted'}`}>
      {action}
    </span>
  )
}
