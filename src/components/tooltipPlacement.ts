// Pure placement math for the badge hover tooltip. Kept separate from the React
// component so it can be unit-tested in jsdom with no DOM/WebGL. The component
// (BadgeTooltip) measures its own size and the anchored tile's rect, then asks
// this helper where to sit.

export interface TooltipRect {
  top: number
  left: number
  width: number
  height: number
}

export interface TooltipSize {
  width: number
  height: number
}

export interface TooltipViewport {
  width: number
  height: number
}

export interface TooltipPlacement {
  top: number
  left: number
  side: 'above' | 'below'
}

/** Gap between the tile and the tooltip bubble (room for the caret). */
const GAP = 8
/** Keep the bubble this far from the viewport edges. */
const MARGIN = 8

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi)
}

/**
 * Position a tooltip relative to its anchor tile. Prefers sitting *above* the
 * tile (centered); flips *below* when there isn't room above; always clamps the
 * horizontal position so the bubble stays inside the viewport. This is what the
 * native `title` tooltip failed to do — near an edge it pinned to the page
 * corner instead of the element.
 */
export function placeTooltip(
  anchor: TooltipRect,
  tip: TooltipSize,
  viewport: TooltipViewport,
): TooltipPlacement {
  const anchorCenterX = anchor.left + anchor.width / 2
  const left = clamp(
    anchorCenterX - tip.width / 2,
    MARGIN,
    Math.max(MARGIN, viewport.width - tip.width - MARGIN),
  )

  const roomAbove = anchor.top >= tip.height + GAP + MARGIN
  if (roomAbove) {
    return { top: anchor.top - GAP - tip.height, left, side: 'above' }
  }
  return { top: anchor.top + anchor.height + GAP, left, side: 'below' }
}
