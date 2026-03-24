export type SeatStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED'

export type AuditAction = 'ASSIGN' | 'UNASSIGN' | 'MOVE' | 'RESERVE' | 'UPDATE'

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
  notes: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  seat_id: string
  editor_email: string
  action: AuditAction
  field: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  // Joined field
  seat?: { label: string }
}
