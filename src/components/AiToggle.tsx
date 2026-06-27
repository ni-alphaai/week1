import { isAiOn, toggleAi } from '../lib/aiPreference'
import { useAiEnabled } from '../lib/useAiEnabled'
import { aiEnabled } from '../ai/config'

export function AiToggle({ className = '' }: { className?: string }) {
  if (!aiEnabled) return null

  useAiEnabled() // subscribes to preference changes so button re-renders
  const on = isAiOn()
  return (
    <button
      type="button"
      onClick={toggleAi}
      aria-pressed={on}
      aria-label={on ? 'Turn AI features off' : 'Turn AI features on'}
      className={`flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-muted transition hover:border-[var(--color-border-strong)] hover:text-accent ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
      Rico AI {on ? 'on' : 'off'}
    </button>
  )
}
