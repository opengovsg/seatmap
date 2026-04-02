'use client'

import { useEffect, useRef, useState, memo } from 'react'
import type { Seat, SeatStatus } from '@/types'
import { SeatTooltip } from './SeatTooltip'

export const STATUS_COLOURS: Record<SeatStatus, string> = {
  AVAILABLE: '#22c55e',
  OCCUPIED:  '#5a6472',
  RESERVED:  '#f59e0b',
}

// Memoized so React won't re-render (and won't reset SVG fills) when tooltip state changes
const SvgContainer = memo(function SvgContainer({
  html,
  divRef,
}: {
  html: string
  divRef: React.RefObject<HTMLDivElement | null>
}) {
  return <div ref={divRef} className="w-full" dangerouslySetInnerHTML={{ __html: html }} />
})

interface TooltipState {
  seat: Seat
  x: number
  y: number
}

interface SeatMapProps {
  svgContent:    string
  seats:         Seat[]
  onSeatClick?:  (seat: Seat) => void
  moveSourceId?: string          // seat being moved — shown in amber
  activeIds?:    Set<string> | null  // when set, dim seats not in the set
}

export function SeatMap({ svgContent, seats, onSeatClick, moveSourceId, activeIds }: SeatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [sanitizedSvg, setSanitizedSvg] = useState('')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [scrollStart, setScrollStart] = useState({ left: 0, top: 0 })
  const [isOverSeat, setIsOverSeat] = useState(false)

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

    const svgEl = container.querySelector('svg')
    if (svgEl) {
      svgEl.setAttribute('width', '100%')
      svgEl.setAttribute('height', 'auto')
      if (!svgEl.getAttribute('viewBox')) {
        const w = svgEl.getAttribute('width') || '1000'
        const h = svgEl.getAttribute('height') || '800'
        svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)
      }
      // Allow pointer events through SVG background
      svgEl.style.pointerEvents = 'none'
    }

    const seatMap = new Map(seats.map((s) => [s.svg_rect_id, s]))
    const cleanups: (() => void)[] = []

    seatMap.forEach((seat, rectId) => {
      const rect = container.querySelector(`#${rectId}`) as SVGRectElement | null
      if (!rect) return

      // Dim seats that don't match the active filter
      const isActive = !activeIds || activeIds.has(seat.id)
      const colour = seat.id === moveSourceId
        ? '#f97316'
        : isActive
          ? STATUS_COLOURS[seat.status]
          : '#d1d5db'
      rect.setAttribute('fill', colour)
      rect.style.opacity = isActive ? '1' : '0.4'
      rect.style.cursor = 'pointer'
      // Re-enable pointer events for seat rects
      rect.style.pointerEvents = 'auto'

      const onOver  = (e: MouseEvent) => {
        setTooltip({ seat, x: e.clientX, y: e.clientY })
        setIsOverSeat(true)
      }
      const onMove  = (e: MouseEvent) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)
      const onOut   = () => {
        setTooltip(null)
        setIsOverSeat(false)
      }
      const onClick = () => onSeatClick?.(seat)

      rect.addEventListener('mouseover', onOver)
      rect.addEventListener('mousemove', onMove)
      rect.addEventListener('mouseout',  onOut)
      rect.addEventListener('click',     onClick)

      cleanups.push(() => {
        rect.removeEventListener('mouseover', onOver)
        rect.removeEventListener('mousemove', onMove)
        rect.removeEventListener('mouseout',  onOut)
        rect.removeEventListener('click',     onClick)
      })
    })

    return () => cleanups.forEach((fn) => fn())
  }, [sanitizedSvg, seats, onSeatClick, moveSourceId, activeIds])

  // Pan functionality - use global events to handle panning outside the container
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isPanning || !mapContainerRef.current) return
      const dx = e.clientX - panStart.x
      const dy = e.clientY - panStart.y
      mapContainerRef.current.scrollLeft = scrollStart.left - dx
      mapContainerRef.current.scrollTop = scrollStart.top - dy
    }

    const handleGlobalMouseUp = () => {
      setIsPanning(false)
    }

    if (isPanning) {
      window.addEventListener('mousemove', handleGlobalMouseMove)
      window.addEventListener('mouseup', handleGlobalMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove)
        window.removeEventListener('mouseup', handleGlobalMouseUp)
      }
    }
  }, [isPanning, panStart, scrollStart])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isOverSeat || e.button !== 0) return // Only left click, and not on seats
    e.preventDefault()
    setIsPanning(true)
    setPanStart({ x: e.clientX, y: e.clientY })
    if (mapContainerRef.current) {
      setScrollStart({
        left: mapContainerRef.current.scrollLeft,
        top: mapContainerRef.current.scrollTop,
      })
    }
  }

  if (!sanitizedSvg) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading floor plan…
      </div>
    )
  }

  const cursorClass = isPanning ? 'cursor-grabbing' : isOverSeat ? 'cursor-pointer' : 'cursor-grab'

  return (
    <div
      ref={mapContainerRef}
      className={`relative p-4 overflow-auto h-full ${cursorClass}`}
      onMouseDown={handleMouseDown}
      style={{ userSelect: isPanning ? 'none' : 'auto' }}
    >
      <SvgContainer html={sanitizedSvg} divRef={containerRef} />
      {tooltip && <SeatTooltip seat={tooltip.seat} x={tooltip.x} y={tooltip.y} />}
    </div>
  )
}
