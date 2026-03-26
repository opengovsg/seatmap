'use client'

import type { Seat, SeatStatus } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import {
  Combobox, ComboboxInput, ComboboxContent,
  ComboboxList, ComboboxItem,
} from '@/components/ui/combobox'
import { Search, X } from 'lucide-react'

const STAT_COLOURS: Record<SeatStatus, string> = {
  OCCUPIED:  '#848f99',
  AVAILABLE: '#22c55e',
  RESERVED:  '#f59e0b',
}

interface NavBarProps {
  seats:              Seat[]
  userEmail:          string
  teams:              string[]
  searchQuery:        string
  onSearchChange:     (q: string) => void
  statusFilter:       SeatStatus | null   // null = show all
  onStatusChange:     (status: SeatStatus | null) => void
  teamFilter:         string | null
  onTeamFilterChange: (team: string | null) => void
}

export function NavBar({
  seats, userEmail, teams,
  searchQuery, onSearchChange,
  statusFilter, onStatusChange,
  teamFilter, onTeamFilterChange,
}: NavBarProps) {
  const router = useRouter()

  const filtered  = statusFilter ? seats.filter((s) => s.status === statusFilter) : seats
  const occupied  = filtered.filter((s) => s.status === 'OCCUPIED').length
  const available = filtered.filter((s) => s.status === 'AVAILABLE').length
  const reserved  = filtered.filter((s) => s.status === 'RESERVED').length

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="border-b bg-background px-5 py-3 flex items-center gap-3 shrink-0 flex-wrap min-h-[56px]">

      {/* Logo */}
      <span className="font-semibold text-sm mr-1">SeatMap</span>

      {/* Search */}
      <div className="relative w-[300px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name or seat…"
          className="pl-8 pr-7 h-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Team filter — Combobox */}
      {teams.length > 0 && (
        <div className="w-[180px]">
          <Combobox
            items={teams}
            value={teamFilter ?? null}
            onValueChange={(v) => onTeamFilterChange(v ?? null)}
          >
            <ComboboxInput
              placeholder="All teams"
              showTrigger
              showClear={!!teamFilter}
              className="h-9 text-sm"
            />
            <ComboboxContent>
              <ComboboxList>
                {(t: string) => (
                  <ComboboxItem key={t} value={t}>{t}</ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      )}

      {/* Status filter — Select */}
      <Select
        value={statusFilter ?? '__all__'}
        onValueChange={(v) => onStatusChange(v === '__all__' ? null : v as SeatStatus)}
      >
        <SelectTrigger className="!h-9 text-sm w-[140px]">
          <span className="flex flex-1 text-left text-sm">
            {statusFilter === null      ? 'Show all'  :
             statusFilter === 'OCCUPIED'  ? 'Occupied'  :
             statusFilter === 'AVAILABLE' ? 'Available' : 'Reserved'}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Show all</SelectItem>
          <SelectItem value="OCCUPIED">Occupied</SelectItem>
          <SelectItem value="AVAILABLE">Available</SelectItem>
          <SelectItem value="RESERVED">Reserved</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex-1" />

      {/* Stats */}
      <div className="flex items-center gap-3 text-sm">
        <StatPill colour={STAT_COLOURS.OCCUPIED}  count={occupied}  />
        <StatPill colour={STAT_COLOURS.AVAILABLE} count={available} />
        <StatPill colour={STAT_COLOURS.RESERVED}  count={reserved}  />
      </div>

      {/* Audit log */}
      <a href="/audit" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        Audit log
      </a>

      {/* User + sign out */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="hidden sm:inline">{userEmail}</span>
        <button onClick={handleSignOut} className="hover:text-foreground transition-colors">
          Sign out
        </button>
      </div>
    </header>
  )
}

function StatPill({ colour, count }: { colour: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colour }} />
      <span className="font-medium tabular-nums">{count}</span>
    </span>
  )
}
