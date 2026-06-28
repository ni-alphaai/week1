// Shared WebGL / motion detection. A single detection path used by every 3D
// surface (the treasure-chest reward and the badge medal grid) so behavior —
// and the "fail closed when WebGL is missing" rule — lives in one place.

/** True when the user has asked the OS/browser to reduce motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * True when a WebGL context can actually be created (false in jsdom, on very
 * old browsers, or when contexts are exhausted). Probes with a throwaway
 * context and releases it immediately — browsers cap live WebGL contexts very
 * low, so leaking one probe per mount could starve the real renderer.
 */
export function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    if (!window.WebGLRenderingContext) return false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!ctx) return false
    ctx.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/**
 * Device-pixel-ratio for the badge medal canvas.
 *
 * The grid renders many coins into one shared canvas, so it stays capped at 2 (a
 * deliberate perf guard). The single-coin detail view (`draggable`) can afford to
 * supersample: rendering above the display resolution integrates several lighting
 * samples per pixel, which smooths both the silhouette and the specular crawl on
 * the reeded edge / struck emblem without flattening the premium finish. Capped at
 * 3 to keep the drawing buffer bounded.
 */
export function medalPixelRatio(deviceRatio: number, draggable: boolean): number {
  const base = Math.min(deviceRatio || 1, 2)
  return draggable ? Math.min(base * 2, 3) : base
}
