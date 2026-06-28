// BadgeDetailCard — accessible modal dialog showing badge detail.
// Controlled: parent manages open/close state. Task 8 will inject a 3D medal
// via the `medal` prop slot; by default the 2D emblem is shown.

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { badgeMeta } from '../content/badges'
import { emblemFor } from './badgeEmblems'
import { prefersReducedMotion } from '../lib/webgl'

// ─── Focus trap ───────────────────────────────────────────────────────────────

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BadgeDetailCardProps {
  badgeId: string
  earned: boolean
  /** epoch ms; from LearnerState.badgeAcquiredAt[badgeId] */
  acquiredAt?: number
  /** Learner's total earned badge count */
  earnedCount: number
  /** Total badges that exist */
  totalCount: number
  /** Optional visual slot — Task 8 injects a 3D medal; defaults to the 2D emblem */
  medal?: ReactNode
  onClose: () => void
}

// ─── Date formatter ───────────────────────────────────────────────────────────

const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BadgeDetailCard({
  badgeId,
  earned,
  acquiredAt,
  earnedCount,
  totalCount,
  medal,
  onClose,
}: BadgeDetailCardProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<Element | null>(null)

  const meta = badgeMeta(badgeId)
  const tierLabel = capitalize(meta.tier)
  const rarityLabel = capitalize(meta.rarity)

  // Focus management: save prior focus, focus close button on mount, restore on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement
    closeBtnRef.current?.focus()

    return () => {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus()
      }
    }
  }, [])

  // Trap Tab/Shift+Tab inside the dialog; Escape closes.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusable(dialogRef.current)
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    },
    [onClose],
  )

  // Backdrop click: only fire onClose if the click target IS the backdrop (not a child).
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  // Earned date display.
  let earnedLine: ReactNode
  if (earned) {
    if (acquiredAt != null) {
      earnedLine = (
        <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
          {'Earned ' + dateFormat.format(new Date(acquiredAt))}
        </span>
      )
    } else {
      earnedLine = (
        <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
          Earned earlier
        </span>
      )
    }
  } else {
    earnedLine = (
      <span className="text-sm text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1">
        <span
          aria-hidden="true"
          className="inline-block w-4 h-4 rounded-full border-2 border-current opacity-60"
        />
        Locked
      </span>
    )
  }

  // Animation: only apply if reduced motion is not preferred.
  const animate = !prefersReducedMotion()

  return (
    // Backdrop — full-screen overlay; click outside the card to close.
    <div
      data-testid="badge-dialog-backdrop"
      className={[
        'fixed inset-0 z-50 flex',
        // Mobile: pin to bottom (bottom-sheet feel); desktop: center.
        'items-end sm:items-center justify-center',
        // Translucent backdrop.
        'bg-black/40 backdrop-blur-sm',
        animate ? 'transition-opacity duration-200' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleBackdropClick}
    >
      {/* Dialog card */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className={[
          'relative w-full sm:max-w-sm mx-auto',
          // Mobile: rounded top corners only; desktop: fully rounded.
          'rounded-t-2xl sm:rounded-2xl',
          'bg-white dark:bg-slate-900',
          'shadow-2xl',
          'overflow-hidden',
          // Subtle scale-in when not reduced-motion.
          animate ? 'transition-transform duration-200 ease-out' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Close (×) button — top-right corner */}
        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={[
            'absolute top-3 right-3 z-10',
            'w-8 h-8 flex items-center justify-center',
            'rounded-full',
            'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200',
            'hover:bg-slate-100 dark:hover:bg-slate-800',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500',
            'transition-colors',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {/* × character — decorative, label on the button suffices for a11y */}
          <span aria-hidden="true" className="text-lg leading-none select-none">
            ×
          </span>
        </button>

        {/* ── Medal / emblem area ── */}
        <div
          className={[
            'flex justify-center items-center',
            'pt-8 pb-4',
            // Tier hook: Task 8's CSS can style the container by tier.
            `badge-tier--${meta.tier}`,
          ].join(' ')}
          data-tier={meta.tier}
        >
          {medal != null ? (
            medal
          ) : (
            <div
              className={[
                'w-20 h-20',
                earned ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600',
              ].join(' ')}
            >
              {emblemFor(badgeId, 'w-full h-full')}
            </div>
          )}
        </div>

        {/* ── Text content ── */}
        <div className="px-6 pb-6 space-y-3 text-center">
          {/* Title — referenced by aria-labelledby */}
          <h2
            id={titleId}
            className="text-xl font-bold tracking-tight text-slate-900 dark:text-white"
          >
            {meta.title}
          </h2>

          {/* Tier + rarity chip */}
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {`${tierLabel} · ${rarityLabel}`}
          </p>

          {/* Blurb — only shown for earned badges; locked badges see it in the "How to earn" line */}
          {earned && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {meta.blurb}
            </p>
          )}

          {/* Earned state */}
          <div className="pt-1">{earnedLine}</div>

          {/* Locked: how to earn */}
          {!earned && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium">How to earn:</span>{' '}
              {meta.blurb}
            </p>
          )}

          {/* Overall progress */}
          <p className="text-xs text-slate-400 dark:text-slate-500 pt-1">
            {`You've earned ${earnedCount} of ${totalCount} achievements`}
          </p>
        </div>
      </div>
    </div>
  )
}
