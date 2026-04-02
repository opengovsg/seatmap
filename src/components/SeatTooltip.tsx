import { createPortal } from 'react-dom'
import { useRef, useLayoutEffect, useState } from 'react'
import type { Seat } from '@/types'
import { STATUS_COLOURS } from './SeatMap'

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  OCCUPIED:  'Occupied',
  RESERVED:  'Reserved',
}

interface SeatTooltipProps {
  seat: Seat
  x: number
  y: number
}

export function SeatTooltip({ seat, x, y }: SeatTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const offset = 12
  const [pos, setPos] = useState({ left: x + offset, top: y + offset })

  useLayoutEffect(() => {
    if (!ref.current) return
    const { offsetWidth: w, offsetHeight: h } = ref.current
    const vw = window.innerWidth
    const vh = window.innerHeight
    setPos({
      left: x + offset + w > vw ? x - offset - w : x + offset,
      top:  y + offset + h > vh ? y - offset - h : y + offset,
    })
  }, [x, y])

  const style: React.CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    zIndex: 9999,
    pointerEvents: 'none',
  }

  const content = (
    <div
      ref={ref}
      style={style}
      className="bg-popover text-popover-foreground border rounded-lg shadow-md p-3 text-sm min-w-40 max-w-64"
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="font-semibold">{seat.label}</span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: STATUS_COLOURS[seat.status] }}
        >
          {STATUS_LABELS[seat.status]}
        </span>
      </div>
      {seat.occupant_name && (
        <div className="mt-1">
          <span className="font-medium">{seat.occupant_name}</span>
          {seat.occupant_team && (
            <span className="text-muted-foreground"> · {seat.occupant_team}</span>
          )}
        </div>
      )}
      {seat.status === 'RESERVED' && seat.occupant_team && !seat.occupant_name && (
        <div className="mt-1 text-muted-foreground text-xs">
          {seat.occupant_team}
        </div>
      )}
      {seat.notes && (
        <p className="mt-1 text-muted-foreground text-xs">{seat.notes}</p>
      )}
    </div>
  )

  // Render in a portal so it isn't clipped by overflow:hidden parents
  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
