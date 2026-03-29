import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { AuditLogTable } from '@/components/AuditLogTable'
import type { AuditLog } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { data: rawLogs } = await db
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  // Fetch seat labels separately (FK was dropped to preserve history across restores)
  const seatIds = [...new Set((rawLogs ?? []).map(l => l.seat_id as string).filter(Boolean))]
  const { data: seatRows } = seatIds.length > 0
    ? await db.from('seats').select('id, label').in('id', seatIds)
    : { data: [] }
  const seatLabelMap = new Map((seatRows ?? []).map(s => [s.id, s.label]))
  const logs = (rawLogs ?? []).map(l => ({ ...l, seat: { label: seatLabelMap.get(l.seat_id) ?? l.seat_id } }))

  return (
    <div className="flex flex-col h-full">
      <header className="border-b bg-background px-4 py-2 flex items-center gap-3 shrink-0">
        <a href="/map" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Map
        </a>
        <span className="font-semibold text-sm">Audit log</span>
      </header>
      <main className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
        <AuditLogTable logs={logs as AuditLog[]} />
      </main>
    </div>
  )
}
