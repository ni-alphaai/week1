import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeTooltip, type TooltipPlacement, type TooltipRect } from './tooltipPlacement'

export interface BadgeTooltipProps {
  /** Stable id so the anchoring tile can reference it via aria-describedby. */
  id: string
  title: string
  blurb?: string
  /** The hovered/focused tile's viewport rect (getBoundingClientRect). */
  anchorRect: TooltipRect
  /** When true, skip the entrance fade/scale (prefers-reduced-motion). */
  reducedMotion?: boolean
}

/**
 * A styled hover/focus tooltip for an achievement tile, rendered into a portal
 * on document.body so the grid container can never clip it. Placement is
 * computed by the pure `placeTooltip` helper after the bubble measures itself,
 * so it anchors to the tile and flips/clamps near the viewport edges — unlike
 * the native `title` tooltip it replaces, which pinned to the page corner.
 */
export function BadgeTooltip({ id, title, blurb, anchorRect, reducedMotion = false }: BadgeTooltipProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null)

  // Measure the rendered bubble, then position it. Runs before paint so the
  // tooltip never flashes at the wrong spot. Re-runs when the anchor moves.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPlacement(
      placeTooltip(anchorRect, { width: rect.width, height: rect.height }, { width: window.innerWidth, height: window.innerHeight }),
    )
  }, [anchorRect, title, blurb])

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className={[
        'badge-tooltip',
        placement ? `badge-tooltip--${placement.side}` : '',
        reducedMotion ? '' : 'badge-tooltip--animate',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        top: placement ? placement.top : anchorRect.top,
        left: placement ? placement.left : anchorRect.left,
        // Hidden until measured/placed to avoid a one-frame flash at (anchor) origin.
        visibility: placement ? 'visible' : 'hidden',
      }}
    >
      <span className="badge-tooltip__title">{title}</span>
      {blurb ? <span className="badge-tooltip__blurb">{blurb}</span> : null}
    </div>,
    document.body,
  )
}
