// emblemFor(badgeId, className?) → ReactNode
// Returns a single-color SVG emblem for the given achievement badge id.
// CSS tier framing (bronze/silver/gold) is applied via `currentColor` — callers
// pass a `className` to size and tint the icon.

import type { ReactNode } from 'react'

// ─── Individual emblem components ─────────────────────────────────────────────

// first-loop: circular/looping arrows (repeat symbol)
function LoopStarterEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 4a8 8 0 017 4.1L21 6v4h-4l1.6-1.6A6 6 0 1017.4 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17 21l-.5-4 3.5 1z" fill="currentColor" />
    </svg>
  )
}

// first-while: infinity loop symbol
function WhileStarterEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4M12 8c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4h-8C5.8 12 4 13.8 4 16s1.8 4 4 4 4-1.8 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

// first-if: branching / forking path
function IfStarterEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 4v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="10" r="2" fill="currentColor" />
      <path
        d="M10 12L6 18M14 12l4 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="6" cy="19" r="1.5" fill="currentColor" />
      <circle cx="18" cy="19" r="1.5" fill="currentColor" />
    </svg>
  )
}

// practice-5: puzzle piece
function Practice5Emblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4 8h5V5.5a2.5 2.5 0 015 0V8h5v5h-2.5a2.5 2.5 0 000 5H19v5H4V13h2.5a2.5 2.5 0 000-5H4V8z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  )
}

// practice-20: puzzle piece with star (clearly a "more" sibling of practice-5)
function Practice20Emblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M3 7h4.5V5a2 2 0 014 0v2H16v5h-2a2 2 0 000 4h2v5H3v-5h2a2 2 0 000-4H3V7z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M18.5 2l.7 1.8 2 .3-1.4 1.4.3 2-1.6-.9-1.6.9.3-2-1.4-1.4 2-.3z"
        fill="currentColor"
      />
    </svg>
  )
}

// comeback-kid: rising arrow / upward swoosh
function ComebackKidEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4 18c2-4 4-7 8-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M8 5l4 3-4 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="18" r="2" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

// optimal-solver: bullseye / concentric circles with center dot
function OptimalSolverEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.5" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.75" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  )
}

// speedy: lightning bolt
function SpeedyEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" />
    </svg>
  )
}

// generic fallback: clean star (used for lesson awards and unknown ids)
function GenericEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2l2.9 6 6.6.9-4.8 4.6 1.1 6.5L12 17l-5.8 3 1.1-6.5L2.5 9l6.6-.9z"
        fill="currentColor"
      />
    </svg>
  )
}

// ─── Registry ─────────────────────────────────────────────────────────────────

type EmblemComponent = (props: { className?: string }) => ReactNode

const EMBLEM_MAP: Record<string, EmblemComponent> = {
  'first-loop': LoopStarterEmblem,
  'first-while': WhileStarterEmblem,
  'first-if': IfStarterEmblem,
  'practice-5': Practice5Emblem,
  'practice-20': Practice20Emblem,
  'comeback-kid': ComebackKidEmblem,
  'optimal-solver': OptimalSolverEmblem,
  speedy: SpeedyEmblem,
}

/**
 * Returns the SVG emblem ReactNode for the given badge id.
 * Achievement badge ids get a unique emblem; lesson-awards and unknown ids
 * fall back to the generic star. Pass `className` to size/tint the icon.
 */
export function emblemFor(badgeId: string, className?: string): ReactNode {
  const Component = EMBLEM_MAP[badgeId] ?? GenericEmblem
  return <Component className={className} />
}
