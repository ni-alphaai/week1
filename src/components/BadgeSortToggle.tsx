import type { BadgeSort } from '../content/badgeSort'

const OPTIONS: { value: BadgeSort; label: string }[] = [
  { value: 'rarity', label: 'Rarity' },
  { value: 'date', label: 'Date' },
]

/** Compact segmented control to choose how a badge gallery is ordered. */
export function BadgeSortToggle({ value, onChange }: { value: BadgeSort; onChange: (sort: BadgeSort) => void }) {
  return (
    <div className="badge-sort" role="group" aria-label="Sort badges">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`badge-sort__btn${value === opt.value ? ' badge-sort__btn--active' : ''}`}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
