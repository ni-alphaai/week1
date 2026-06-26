import { useCallback, useEffect, useState } from 'react'
import { useLearner } from '../context/LearnerContext'
import { BADGE_LABELS } from '../content/badges'
import { Confetti } from './Confetti'
import { BadgeIcon } from './icons'

const DISMISS_MS = 3500

// Self-contained celebratory toast: watches `pendingBadges` from the learner
// context and surfaces them one at a time. When a badge is showing it fires a
// confetti burst and auto-dismisses after ~3.5s (or on click), then consumes
// the queue so the next badge can appear. Renders null while idle.
export function BadgeToast(): React.ReactElement | null {
  const { pendingBadges, consumePendingBadges } = useLearner()
  const [current, setCurrent] = useState<string | null>(null)

  // Pull the next badge off the queue whenever we're idle and something is
  // waiting. Draining clears pendingBadges so we won't re-pick the same id.
  useEffect(() => {
    if (current !== null || pendingBadges.length === 0) return
    const drained = consumePendingBadges()
    if (drained.length === 0) return
    setCurrent(drained[0])
    // Any extra badges in this batch beyond the first are dropped; the queue is
    // typically short and the first is the headline. (Kept simple by design.)
  }, [current, pendingBadges, consumePendingBadges])

  const dismiss = useCallback(() => setCurrent(null), [])

  // Auto-dismiss the active toast after a beat.
  useEffect(() => {
    if (current === null) return
    const timer = setTimeout(dismiss, DISMISS_MS)
    return () => clearTimeout(timer)
  }, [current, dismiss])

  if (current === null) return null

  const label = BADGE_LABELS[current] ?? { title: current, blurb: '' }

  return (
    <>
      <Confetti count={28} />
      <div
        className="badge-toast animate-pop-in"
        role="status"
        aria-live="polite"
        onClick={dismiss}
      >
        <span className="badge-toast__medal" aria-hidden="true">
          <BadgeIcon className="h-7 w-7" />
        </span>
        <span className="badge-toast__body">
          <span className="badge-toast__kicker">Badge earned!</span>
          <span className="badge-toast__title">{label.title}</span>
          {label.blurb && <span className="badge-toast__blurb">{label.blurb}</span>}
        </span>
      </div>
    </>
  )
}
