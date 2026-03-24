'use client'

import type { Seat } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface NavBarProps {
  seats: Seat[]
  userEmail: string
}

export function NavBar({ seats, userEmail }: NavBarProps) {
  const router = useRouter()

  const occupied  = seats.filter((s) => s.status === 'OCCUPIED').length
  const available = seats.filter((s) => s.status === 'AVAILABLE').length
  const reserved  = seats.filter((s) => s.status === 'RESERVED').length

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="border-b bg-background px-4 py-2 flex items-center gap-4 shrink-0">
      <span className="font-semibold text-sm mr-2">SeatMap</span>

      {/* Stats */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <StatPill colour="#ef4444" label="occupied"  count={occupied}  />
        <StatPill colour="#22c55e" label="available" count={available} />
        <StatPill colour="#f59e0b" label="reserved"  count={reserved}  />
      </div>

      <div className="flex-1" />

      {/* Audit log link */}
      <a href="/audit" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        Audit log
      </a>

      {/* User + sign out */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="hidden sm:inline">{userEmail}</span>
        <button
          onClick={handleSignOut}
          className="hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}

function StatPill({ colour, label, count }: { colour: string; label: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: colour }}
      />
      <span className="font-medium text-foreground">{count}</span>
      <span>{label}</span>
    </span>
  )
}
