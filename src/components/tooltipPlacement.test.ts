import { describe, it, expect } from 'vitest'
import { placeTooltip, type TooltipRect, type TooltipSize } from './tooltipPlacement'

const VIEWPORT = { width: 1000, height: 800 }
const TIP: TooltipSize = { width: 200, height: 60 }

// A tile comfortably in the middle of the viewport.
function tile(over: Partial<TooltipRect> = {}): TooltipRect {
  return { top: 400, left: 460, width: 80, height: 80, ...over }
}

describe('placeTooltip', () => {
  it('prefers above the tile, horizontally centered, when there is room', () => {
    const p = placeTooltip(tile(), TIP, VIEWPORT)
    expect(p.side).toBe('above')
    // Centered: tile center x = 460 + 40 = 500; left = 500 - 100 = 400.
    expect(p.left).toBe(400)
    // Above: top = tileTop(400) - gap(8) - tipHeight(60) = 332.
    expect(p.top).toBe(332)
  })

  it('flips below when the tile is near the top edge', () => {
    const p = placeTooltip(tile({ top: 4 }), TIP, VIEWPORT)
    expect(p.side).toBe('below')
    // Below: top = tileTop(4) + tileHeight(80) + gap(8) = 92.
    expect(p.top).toBe(92)
  })

  it('clamps into the viewport at the left edge', () => {
    const p = placeTooltip(tile({ left: 0 }), TIP, VIEWPORT)
    // Centered would be 40 - 100 = -60; clamped to the 8px margin.
    expect(p.left).toBe(8)
  })

  it('clamps into the viewport at the right edge', () => {
    const p = placeTooltip(tile({ left: 960 }), TIP, VIEWPORT)
    // Centered would be 1000 - 100 = 900; clamped to width - tip - margin = 792.
    expect(p.left).toBe(792)
  })
})
