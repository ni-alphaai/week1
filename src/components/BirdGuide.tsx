import { useEffect, useMemo, useRef, useState } from 'react'
import { RicoBird, type BirdMood } from './RicoBird'
import { FormattedText, parseRich, richLength } from './FormattedText'

export type { BirdMood }

interface BirdGuideProps {
  message: string
  mood?: BirdMood
  label?: string
  variant?: 'inline' | 'sidebar'
  /** Reveal the message gradually, like a streaming assistant. Defaults to true. */
  typewriter?: boolean
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Reveals `total` characters over ~0.9–1.6s, scaling speed to the text length.
function useTypewriter(message: string, total: number, enabled: boolean): number {
  const [revealed, setRevealed] = useState(enabled ? 0 : total)
  const frame = useRef<number>(0)

  useEffect(() => {
    if (!enabled || prefersReducedMotion() || total === 0) {
      setRevealed(total)
      return
    }
    setRevealed(0)
    // Target ~1.8s reveal: ~100 ticks at an 18ms cadence.
    const TICK_MS = 18
    const charsPerTick = Math.max(1, Math.round(total / 100))
    let current = 0
    let last = performance.now()
    const tick = (now: number) => {
      if (now - last >= TICK_MS) {
        last = now
        current = Math.min(total, current + charsPerTick)
        setRevealed(current)
      }
      if (current < total) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, total, enabled])

  return revealed
}

const MOOD_META: Record<BirdMood, { label: string; chip: string }> = {
  explain: { label: 'Rico', chip: 'Your guide' },
  hint: { label: 'Rico', chip: 'Hint' },
  celebrate: { label: 'Rico', chip: 'Nice work' },
  oops: { label: 'Rico', chip: 'Try again' },
  petted: { label: 'Rico', chip: 'Yay!' },
}

export function BirdGuide({ message, mood = 'explain', label, variant = 'inline', typewriter = true }: BirdGuideProps) {
  const [visible, setVisible] = useState(false)
  const meta = MOOD_META[mood]
  const isSidebar = variant === 'sidebar'
  const total = useMemo(() => richLength(parseRich(message)), [message])
  const revealed = useTypewriter(message, total, typewriter)
  const typing = revealed < total

  useEffect(() => {
    setVisible(false)
    const t = window.setTimeout(() => setVisible(true), 30)
    return () => window.clearTimeout(t)
  }, [message, mood])

  return (
    <article
      className={`guide-card guide-card--${mood} ${isSidebar ? 'guide-card--sidebar' : ''} transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
      role="note"
      aria-live="polite"
    >
      <div className="guide-card__perch" aria-hidden="true">
        <div className="guide-card__perch-bg" />
        <RicoBird mood={mood} className="guide-card__bird" onClick={() => {}} />
      </div>

      <div className="guide-card__content">
        <header className="guide-card__header">
          <div className="guide-card__identity">
            <span className="guide-card__name">{label ?? meta.label}</span>
            <span className={`guide-card__chip guide-card__chip--${mood}`}>{meta.chip}</span>
          </div>
        </header>

        <div className={`guide-card__bubble guide-card__bubble--${mood}`}>
          <p className="guide-card__message whitespace-pre-line">
            <FormattedText text={message} reveal={typewriter ? revealed : undefined} />
            {typing && <span className="guide-caret" aria-hidden="true" />}
          </p>
        </div>
      </div>
    </article>
  )
}
