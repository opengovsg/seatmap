import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
import { listSnapshots } from '@/app/actions/floor'
import { isAdmin, listAdmins } from '@/lib/admins'
import { getDraftState } from '@/app/actions/draft'
import { AdminClient } from './AdminClient'
import type { AuditLog } from '@/types'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const email = user.email ?? ''
  if (!(await isAdmin(email))) redirect('/map')

  const db = createAdminClient()

  const [snapshots, logsResult, admins, draftState, { data: floor }] = await Promise.all([
    listSnapshots(),
    db
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    listAdmins(),
    getDraftState(),
    db.from('floors').select('id').single(),
  ])
  const isDraft = draftState.isActive
  const draftName = draftState.name

  // Fetch seat labels separately and merge
  const rawLogs = logsResult.data ?? []
  const seatIds = [...new Set(rawLogs.map(l => l.seat_id as string).filter(Boolean))]
  const { data: seatRows } = seatIds.length > 0
    ? await db.from('seats').select('id, label').in('id', seatIds)
    : { data: [] }
  const seatLabelMap = new Map((seatRows ?? []).map(s => [s.id, s.label]))
  const logs = rawLogs.map(l => ({ ...l, seat: { label: seatLabelMap.get(l.seat_id) ?? l.seat_id } }))

  const userRole = admins.find(a => a.email === email)?.role ?? 'admin'

  // Count how many seats are in the draft if active
  const draftSeatCount = isDraft && floor
    ? await db.from('seat_drafts').select('seat_id', { count: 'exact', head: true }).eq('floor_id', floor.id).then(r => r.count ?? 0)
    : 0

  return (
    <div className="min-h-svh bg-background overflow-y-auto">
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <a href="/map" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to map
        </a>
        <h1 className="font-semibold text-sm">Admin Panel</h1>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        <AdminClient
          initialSnapshots={snapshots}
          initialLogs={(logs ?? []) as unknown as AuditLog[]}
          initialAdmins={admins}
          userEmail={email}
          userRole={userRole}
          isDraft={isDraft}
          draftName={draftName}
          draftSeatCount={draftSeatCount}
          floorId={floor?.id ?? ''}
        />
      </main>
    </div>
  )
}
