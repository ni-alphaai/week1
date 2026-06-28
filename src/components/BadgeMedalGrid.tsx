import { useEffect, useId, useRef, useState } from 'react'
import { badgeMeta, type BadgeTier } from '../content/badges'
import { emblemFor } from './badgeEmblems'
import { LockIcon } from './icons'
import { prefersReducedMotion, supportsWebGL } from '../lib/webgl'
import { BadgeTooltip } from './BadgeTooltip'
import type { TooltipRect } from './tooltipPlacement'

// IMPORTANT: this module must NOT statically import three.js. The three.js
// scene controller lives in ./BadgeMedalScene and is pulled in via a dynamic
// import() only when the 3D path activates, so three stays code-split.
import type { BadgeMedalSceneController } from './BadgeMedalScene'

export interface BadgeMedalGridItem {
  badgeId: string
  tier: BadgeTier
  earned: boolean
}

export interface BadgeMedalGridProps {
  items: BadgeMedalGridItem[]
  onSelect: (badgeId: string) => void
  className?: string
  /** When false, tiles render as divs with no click handler (for detail-card medal slot). Default: true. */
  interactive?: boolean
  /** When false, the badge title label is omitted (for the compact solo medal in the detail card). Default: true. */
  showLabels?: boolean
  /** When true, the medal can be grabbed and spun with the pointer (single-medal detail view). Default: false. */
  draggable?: boolean
}

/**
 * A DOM-first grid of achievement medals. The grid is fully functional and
 * accessible with zero WebGL: every tile is a real <button> showing the badge
 * title and either its 2D emblem (earned) or a lock (locked).
 *
 * When WebGL is available and reduced-motion is off, a single shared WebGL
 * context is layered over the grid (see ./BadgeMedalScene): it renders one live
 * 3D medal per earned tile using viewport+scissor — never a context per tile.
 * The decorative canvas is aria-hidden; all real info stays in the DOM.
 */
export function BadgeMedalGrid({ items, onSelect, className, interactive = true, showLabels = true, draggable = false }: BadgeMedalGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Per-tile MEDAL-SLOT elements (the circular `.badge-tile__medal` span, not
  // the whole button), keyed by badgeId, handed to the scene for viewport/scissor.
  const tileRefs = useRef<Map<string, HTMLElement>>(new Map())
  // The tile currently hovered/focused, with its viewport rect, drives the
  // custom tooltip. Replaces the native `title` attribute, which the browser
  // pinned to the page corner near viewport edges.
  const [hovered, setHovered] = useState<{ badgeId: string; rect: TooltipRect } | null>(null)
  const tooltipIdBase = useId()

  function showTooltip(badgeId: string, el: HTMLElement) {
    const r = el.getBoundingClientRect()
    setHovered({ badgeId, rect: { top: r.top, left: r.left, width: r.width, height: r.height } })
  }
  function hideTooltip(badgeId: string) {
    setHovered((cur) => (cur && cur.badgeId === badgeId ? null : cur))
  }

  // Content signature so a referentially-new but content-equal `items` array
  // doesn't tear down and rebuild the WebGL context every render (which would
  // exhaust the browser's context cap and blank the medals).
  //
  // Order-INDEPENDENT on purpose: re-sorting the gallery hands us the same
  // badges in a new order. The scene reads each tile's live bounding rect every
  // frame, and tiles are keyed by badgeId so React moves (not recreates) the
  // DOM nodes — so a pure reorder needs no rebuild; the medals follow their
  // tiles. Recreating the renderer on the same canvas after forceContextLoss()
  // yields a dead context (blank coins), so we must NOT rebuild on reorder.
  const signature = items
    .map((it) => `${it.badgeId}:${it.tier}:${it.earned ? 1 : 0}`)
    .sort()
    .join('|')

  useEffect(() => {
    if (!supportsWebGL() || prefersReducedMotion()) return
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let controller: BadgeMedalSceneController | null = null
    let cancelled = false

    // All tiles get a 3D medallion: earned coins show their struck emblem,
    // locked ones render as a dim matte blank. The scene reads the `earned` flag.
    const tiles = items
      .map((it) => {
        const el = tileRefs.current.get(it.badgeId)
        return el ? { badgeId: it.badgeId, tier: it.tier, earned: it.earned, element: el } : null
      })
      .filter((t): t is { badgeId: string; tier: BadgeTier; earned: boolean; element: HTMLElement } => t !== null)

    if (tiles.length === 0) return

    // Mark tiles as 3D-active so the 2D emblem can be visually hidden (the
    // medal renders on top). If teardown happens the attribute is removed and
    // the 2D emblem reappears.
    for (const t of tiles) t.element.setAttribute('data-medal-3d', 'true')

    import('./BadgeMedalScene')
      .then(({ createBadgeMedalScene }) => {
        if (cancelled) return
        controller = createBadgeMedalScene({ canvas, container, tiles, draggable })
      })
      .catch(() => {
        // Fail closed: the 2D emblems already show. Undo the hide marker.
        for (const t of tiles) t.element.removeAttribute('data-medal-3d')
      })

    return () => {
      cancelled = true
      controller?.dispose()
      controller = null
      for (const t of tiles) t.element?.removeAttribute('data-medal-3d')
    }
    // `items` is read inside but is kept stable via `signature`; re-running only
    // when the badge content actually changes is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, draggable])

  return (
    <div ref={containerRef} className={`badge-medal-grid${className ? ` ${className}` : ''}`} style={{ position: 'relative' }}>
      {/* Single shared canvas, pinned to the grid container (scrolls with it). */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="badge-medal-grid__canvas"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          // Draggable (detail) medal captures the pointer to spin; the grid lets
          // clicks fall through to the tile buttons underneath. The detail canvas
          // also needs a z-index: the medal slot is position:relative, so without
          // one it paints over the coin face and swallows the grab.
          pointerEvents: draggable ? 'auto' : 'none',
          zIndex: draggable ? 1 : undefined,
          cursor: draggable ? 'grab' : undefined,
          touchAction: draggable ? 'none' : undefined,
        }}
      />
      {items.map((item) => {
        const meta = badgeMeta(item.badgeId)
        const tileClass = [
          'badge-tile',
          `badge-tier--${item.tier}`,
          item.earned ? 'badge-tile--earned' : 'badge-tile--locked',
        ].join(' ')
        const tileContent = (
          <>
            <span
              className="badge-tile__medal"
              ref={(el) => {
                if (el) tileRefs.current.set(item.badgeId, el)
                else tileRefs.current.delete(item.badgeId)
              }}
            >
              {item.earned ? (
                <span className="badge-tile__emblem">{emblemFor(item.badgeId, 'h-7 w-7')}</span>
              ) : (
                <LockIcon className="h-6 w-6" />
              )}
            </span>
            {showLabels && <span className="badge-tile__label">{meta.title}</span>}
          </>
        )
        if (!interactive) {
          return (
            <div key={item.badgeId} className={tileClass}>
              {tileContent}
            </div>
          )
        }
        const isHovered = hovered?.badgeId === item.badgeId
        return (
          <button
            key={item.badgeId}
            type="button"
            onClick={() => onSelect(item.badgeId)}
            className={tileClass}
            aria-describedby={isHovered ? `${tooltipIdBase}-${item.badgeId}` : undefined}
            onPointerEnter={(e) => showTooltip(item.badgeId, e.currentTarget)}
            onPointerLeave={() => hideTooltip(item.badgeId)}
            onFocus={(e) => showTooltip(item.badgeId, e.currentTarget)}
            onBlur={() => hideTooltip(item.badgeId)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') hideTooltip(item.badgeId)
            }}
          >
            {tileContent}
          </button>
        )
      })}
      {hovered && (
        <BadgeTooltip
          id={`${tooltipIdBase}-${hovered.badgeId}`}
          title={badgeMeta(hovered.badgeId).title}
          blurb={badgeMeta(hovered.badgeId).blurb}
          anchorRect={hovered.rect}
          reducedMotion={prefersReducedMotion()}
        />
      )}
    </div>
  )
}
