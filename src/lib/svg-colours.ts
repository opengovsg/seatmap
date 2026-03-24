// Colour matching config for SVG rect detection.
// The floor plan uses blue (#0000FF) for regular seats.

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

export function isBlueish(fill: string): boolean {
  if (!fill) return false
  const lower = fill.toLowerCase().trim()

  // Named colour
  if (lower === 'blue') return true

  // Hex colour — blue-ish means: high blue, low red, low green
  if (lower.startsWith('#')) {
    const rgb = hexToRgb(lower)
    if (!rgb) return false
    return rgb.b > 150 && rgb.r < 100 && rgb.g < 100
  }

  // rgb() notation
  const rgbMatch = lower.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1])
    const g = parseInt(rgbMatch[2])
    const b = parseInt(rgbMatch[3])
    return b > 150 && r < 100 && g < 100
  }

  return false
}

export const SEAT_COLOUR_CONFIG = {
  SEAT: {
    description: 'Blue rectangles',
    match: isBlueish,
  },
}
