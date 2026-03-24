'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Seat, SeatStatus } from '@/types'
import { SeatTooltip } from './SeatTooltip'

export const STATUS_COLOURS: Record<SeatStatus, string> = {
  AVAILABLE: '#22c55e',
  OCCUPIED:  '#ef4444',
  RESERVED:  '#f59e0b',
}

interface TooltipState {
  seat: Seat
  x: number
  y: number
}

interface SeatMapProps {
  svgContent: string
  initialSeats: Seat[]
}

export function SeatMap({ svgContent, initialSeats }: SeatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [sanitizedSvg, setSanitizedSvg] = useState('')
  const [seats, setSeats] = useState<Seat[]>(initialSeats)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Expose seat refresh so other components can call it later
  // (used after mutations in Step 7)
  const refreshSeats = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase.from('seats').select('*').order('label')
    if (data) setSeats(data as Seat[])
  }, [])

  // Sanitize SVG on mount (client-only)
  useEffect(() => {
    import('dompurify').then(({ default: DOMPurify }) => {
      const clean = DOMPurify.sanitize(svgContent, {
        USE_PROFILES: { svg: true, svgFilters: true },
      })
      setSanitizedSvg(clean)
    })
  }, [svgContent])

  // After SVG renders: make it responsive, colour seats, attach events
  useEffect(() => {
    if (!sanitizedSvg || !containerRef.current) return
    const container = containerRef.current

    // Make SVG fill its container
    const svgEl = container.querySelector('svg')
    if (svgEl) {
      svgEl.setAttribute('width', '100%')
      svgEl.setAttribute('height', 'auto')
      if (!svgEl.getAttribute('viewBox')) {
        const w = svgEl.getAttribute('width') || '1000'
        const h = svgEl.getAttribute('height') || '800'
        svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)
      }
    }

    // Build seat lookup
    const seatMap = new Map(seats.map((s) => [s.svg_rect_id, s]))

    // Colour and wire up each seat rect
    const cleanups: (() => void)[] = []

    seatMap.forEach((seat, rectId) => {
      const rect = container.querySelector(`#${rectId}`) as SVGRectElement | null
      if (!rect) return

      rect.setAttribute('fill', STATUS_COLOURS[seat.status])
      rect.style.cursor = 'pointer'

      const onOver = (e: MouseEvent) => setTooltip({ seat, x: e.clientX, y: e.clientY })
      const onMove = (e: MouseEvent) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)
      const onOut  = () => setTooltip(null)

      rect.addEventListener('mouseover', onOver)
      rect.addEventListener('mousemove', onMove)
      rect.addEventListener('mouseout', onOut)

      cleanups.push(() => {
        rect.removeEventListener('mouseover', onOver)
        rect.removeEventListener('mousemove', onMove)
        rect.removeEventListener('mouseout', onOut)
      })
    })

    return () => cleanups.forEach((fn) => fn())
  }, [sanitizedSvg, seats])

  if (!sanitizedSvg) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading floor plan…
      </div>
    )
  }

  return (
    <div className="relative p-4">
      <div
        ref={containerRef}
        className="w-full"
        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
      />
      {tooltip && <SeatTooltip seat={tooltip.seat} x={tooltip.x} y={tooltip.y} />}
    </div>
  )
}
