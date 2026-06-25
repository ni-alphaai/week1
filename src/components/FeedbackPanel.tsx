import { CheckCircleIcon } from './icons'

interface FeedbackPanelProps {
  status: 'correct' | 'incorrect'
  message: string
}

export function FeedbackPanel({ status, message }: FeedbackPanelProps) {
  const correct = status === 'correct'
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
        correct
          ? 'border-[rgb(61_158_95/0.35)] bg-[var(--color-success-soft)] text-[var(--color-success)]'
          : 'border-[rgb(201_162_39/0.22)] bg-[var(--color-hint-soft)] text-[var(--color-text)]'
      }`}
    >
      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--color-surface)]">
        {correct ? (
          <CheckCircleIcon className="h-5 w-5" />
        ) : (
          <span className="text-sm font-bold text-[var(--color-hint)]">!</span>
        )}
      </span>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide opacity-70">
          {correct ? 'Goal reached' : 'Keep trying'}
        </p>
        <p className="mt-0.5 leading-relaxed">{message}</p>
      </div>
    </div>
  )
}
