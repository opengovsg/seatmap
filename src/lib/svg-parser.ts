import * as cheerio from 'cheerio'
import { SEAT_COLOUR_CONFIG } from './svg-colours'

export interface ParsedSeat {
  svgRectId: string
  // x/y position for logging purposes
  x: number
  y: number
}

export interface ParseResult {
  modifiedSvg: string
  seats: ParsedSeat[]
  unmatched: number
}

export function parseSvg(svgContent: string): ParseResult {
  const $ = cheerio.load(svgContent, { xmlMode: true })
  const seats: ParsedSeat[] = []
  let seatCounter = 0
  let unmatched = 0

  // Find all <rect> elements anywhere in the SVG (handles nested <g> groups)
  $('rect').each((_, el) => {
    const fill = $(el).attr('fill') || $(el).css('fill') || ''

    if (SEAT_COLOUR_CONFIG.SEAT.match(fill)) {
      seatCounter++
      const id = `seat-${String(seatCounter).padStart(3, '0')}`
      $(el).attr('id', id)

      seats.push({
        svgRectId: id,
        x: parseFloat($(el).attr('x') || '0'),
        y: parseFloat($(el).attr('y') || '0'),
      })
    } else if (fill && fill !== 'none' && fill !== 'white' && fill !== '#ffffff' && fill !== '#fff') {
      // Log non-matching coloured rects for review
      unmatched++
    }
  })

  return {
    modifiedSvg: $.xml(),
    seats,
    unmatched,
  }
}
