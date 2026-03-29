export type SeatStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED'

export type AuditAction = 'ASSIGN' | 'UNASSIGN' | 'MOVE' | 'RESERVE' | 'UPDATE' | 'PUBLISH' | 'RESTORE'

export interface Floor {
  id: string
  name: string
  svg_content: string
}

export interface Seat {
  id: string
  floor_id: string
  svg_rect_id: string
  label: string
  status: SeatStatus
  occupant_name: string | null
  occupant_team: string | null
  occupant_division: string | null
  notes: string | null
  created_at: string
}

export interface SeatSnapshot {
  status: string
  occupant_name: string | null
  occupant_team: string | null
  occupant_division: string | null
  notes: string | null
  label: string
}

export interface AuditLog {
  id: string
  seat_id: string
  editor_email: string
  action: AuditAction
  field: string | null
  old_value: string | null
  new_value: string | null
  before: SeatSnapshot | null
  created_at: string
  // Joined field
  seat?: { label: string }
}
