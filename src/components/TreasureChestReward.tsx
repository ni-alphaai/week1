import { Suspense, lazy, useMemo, type ReactNode } from 'react'

// Light wrapper around the three.js scene. The scene (and therefore three.js)
// is loaded lazily, so it only ships to learners who actually reach a reward
// and whose device can render it. Everything here is dependency-free.
const TreasureChestScene = lazy(() => import('./TreasureChestScene'))

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    if (!window.WebGLRenderingContext) return false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!ctx) return false
    // Release the probe context right away — browsers cap live WebGL contexts
    // (~16), and every reward screen probes, so leaking one per mount can
    // starve the real scene's renderer in a long session.
    ctx.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

export interface TreasureChestRewardProps {
  variant?: 'chest' | 'badge'
  size?: number
  /** Shown when 3D is unavailable (reduced motion, no WebGL, or while loading). */
  fallback: ReactNode
}

export function TreasureChestReward({ variant = 'chest', size = 200, fallback }: TreasureChestRewardProps) {
  // Decide once on mount: respect reduced-motion and skip WebGL where it can't
  // run (e.g. jsdom in tests), falling back to the static celebration art.
  const enable3d = useMemo(() => supportsWebGL() && !prefersReducedMotion(), [])
  if (!enable3d) return <>{fallback}</>
  return (
    <Suspense fallback={fallback}>
      <TreasureChestScene variant={variant} size={size} />
    </Suspense>
  )
}
