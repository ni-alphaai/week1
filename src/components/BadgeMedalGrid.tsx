import { useEffect, useRef } from 'react'
import { badgeMeta, type BadgeTier } from '../content/badges'
import { emblemFor } from './badgeEmblems'
import { LockIcon } from './icons'
import { prefersReducedMotion, supportsWebGL } from '../lib/webgl'

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
export function BadgeMedalGrid({ items, onSelect, className, interactive = true, showLabels = true }: BadgeMedalGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Per-tile elements, keyed by badgeId, handed to the scene for viewport/scissor.
  const tileRefs = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    if (!supportsWebGL() || prefersReducedMotion()) return
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let controller: BadgeMedalSceneController | null = null
    let cancelled = false

    // The set of tiles to render medals on (earned only); locked tiles keep
    // their DOM LockIcon and are skipped by the scene.
    const earned = items.filter((it) => it.earned)
    const tiles = earned
      .map((it) => {
        const el = tileRefs.current.get(it.badgeId)
        return el ? { badgeId: it.badgeId, tier: it.tier, element: el } : null
      })
      .filter((t): t is { badgeId: string; tier: BadgeTier; element: HTMLElement } => t !== null)

    if (tiles.length === 0) return

    // Mark tiles as 3D-active so the 2D emblem can be visually hidden (the
    // medal renders on top). If teardown happens the attribute is removed and
    // the 2D emblem reappears.
    for (const t of tiles) t.element.setAttribute('data-medal-3d', 'true')

    import('./BadgeMedalScene')
      .then(({ createBadgeMedalScene }) => {
        if (cancelled) return
        controller = createBadgeMedalScene({ canvas, container, tiles })
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
  }, [items])

  return (
    <div ref={containerRef} className={`badge-medal-grid${className ? ` ${className}` : ''}`} style={{ position: 'relative' }}>
      {/* Single shared canvas, pinned to the grid container (scrolls with it). */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="badge-medal-grid__canvas"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
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
            <span className="badge-tile__medal">
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
            <div
              key={item.badgeId}
              ref={(el) => {
                if (el) tileRefs.current.set(item.badgeId, el)
                else tileRefs.current.delete(item.badgeId)
              }}
              className={tileClass}
              title={meta.blurb || undefined}
            >
              {tileContent}
            </div>
          )
        }
        return (
          <button
            key={item.badgeId}
            type="button"
            ref={(el) => {
              if (el) tileRefs.current.set(item.badgeId, el)
              else tileRefs.current.delete(item.badgeId)
            }}
            onClick={() => onSelect(item.badgeId)}
            className={tileClass}
            title={meta.blurb || undefined}
          >
            {tileContent}
          </button>
        )
      })}
    </div>
  )
}
