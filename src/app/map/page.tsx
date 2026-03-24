import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { NavBar } from '@/components/NavBar'
import { SeatMap } from '@/components/SeatMap'
import type { Seat } from '@/types'

export default async function MapPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Use admin client so RLS doesn't block server-side reads
  const db = createAdminClient()

  const { data: floor } = await db
    .from('floors')
    .select('id, name, svg_content')
    .single()

  const { data: seats } = await db
    .from('seats')
    .select('*')
    .order('label')

  if (!floor) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No floor plan found. Run <code>npm run seed</code> first.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar seats={(seats ?? []) as Seat[]} userEmail={user!.email ?? ''} />
      <main className="flex-1 overflow-auto bg-muted/30">
        <SeatMap svgContent={floor.svg_content} initialSeats={(seats ?? []) as Seat[]} />
      </main>
    </div>
  )
}
