import { useEffect, useState } from 'react'
import { isMuted, subscribeMuted, toggleMuted } from '../lib/sound'

export function useMuted(): boolean {
  const [muted, setMuted] = useState(isMuted)
  useEffect(() => subscribeMuted(setMuted), [])
  return muted
}

export function SoundToggle({ className = '' }: { className?: string }) {
  const muted = useMuted()
  return (
    <button
      type="button"
      onClick={toggleMuted}
      aria-pressed={!muted}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-muted transition hover:border-[var(--color-border-strong)] hover:text-accent ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        {muted ? (
          <path d="M16 8l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M16 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        )}
      </svg>
    </button>
  )
}
