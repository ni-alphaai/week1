import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BadgeDetailCard } from './BadgeDetailCard'

// 'optimal-solver' is rare → Gold · Rare
const BADGE_ID = 'optimal-solver'

// Suppress listLessons() call inside badgeMeta — no lesson awards in tests.
vi.mock('../content/registry', () => ({
  listLessons: () => [],
  getLesson: () => undefined,
  registerGeneratedPuzzle: vi.fn(),
}))

// Acquired on 1 Jan 2025 00:00 UTC (deterministic).
const ACQUIRED_AT = Date.UTC(2025, 0, 1)

function renderCard(overrides: Partial<Parameters<typeof BadgeDetailCard>[0]> = {}) {
  const onClose = vi.fn()
  const result = render(
    <BadgeDetailCard
      badgeId={BADGE_ID}
      earned={true}
      acquiredAt={ACQUIRED_AT}
      earnedCount={5}
      totalCount={8}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { ...result, onClose }
}

// ─── Content tests ────────────────────────────────────────────────────────────

describe('BadgeDetailCard — earned badge content', () => {
  it('shows the badge title', () => {
    renderCard()
    // badgeMeta('optimal-solver').title = 'Optimal Solver'
    expect(screen.getByText('Optimal Solver')).toBeInTheDocument()
  })

  it('shows the blurb', () => {
    renderCard()
    expect(screen.getByText(/fewest moves/i)).toBeInTheDocument()
  })

  it('shows "Diamond · Rare" tier chip for a rare badge', () => {
    renderCard()
    expect(screen.getByText(/Diamond\s*·\s*Rare/i)).toBeInTheDocument()
  })

  it('shows an Earned date when acquiredAt is provided', () => {
    renderCard()
    // Compute the expected formatted date the same way the component does.
    const fmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    const expected = 'Earned ' + fmt.format(new Date(ACQUIRED_AT))
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('shows "Earned earlier" when acquiredAt is absent (legacy badge)', () => {
    renderCard({ acquiredAt: undefined })
    expect(screen.getByText(/Earned earlier/i)).toBeInTheDocument()
  })

  it('shows the overall progress count', () => {
    renderCard()
    expect(screen.getByText(/You've earned 5 of 8/i)).toBeInTheDocument()
  })
})

describe('BadgeDetailCard — locked badge content', () => {
  it('shows a Locked label when not earned', () => {
    renderCard({ earned: false, acquiredAt: undefined })
    expect(screen.getByText(/Locked/i)).toBeInTheDocument()
  })

  it('shows "How to earn" text when not earned', () => {
    renderCard({ earned: false, acquiredAt: undefined })
    expect(screen.getByText(/How to earn/i)).toBeInTheDocument()
  })

  it('does not show an earned date when not earned', () => {
    renderCard({ earned: false, acquiredAt: undefined })
    expect(screen.queryByText(/Earned \w+ \d/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Earned earlier/i)).not.toBeInTheDocument()
  })
})

// ─── Spotlight stage tests ──────────────────────────────────────────────────────

describe('BadgeDetailCard — spotlight stage', () => {
  it('renders a per-tier spotlight stage behind the medal (tier hook wired)', () => {
    const { container } = renderCard()
    // 'optimal-solver' → Diamond tier (see tier-chip test above).
    const stage = container.querySelector('.badge-stage')
    expect(stage).not.toBeNull()
    expect(stage).toHaveClass('badge-tier--diamond')
    expect(stage).toHaveAttribute('data-tier', 'diamond')
  })
})

// ─── Accessibility tests ──────────────────────────────────────────────────────

describe('BadgeDetailCard — accessibility', () => {
  it('has role="dialog" with aria-modal="true"', () => {
    renderCard()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('is labelled by the title (aria-labelledby resolves to the badge title)', () => {
    renderCard()
    const dialog = screen.getByRole('dialog')
    const labelId = dialog.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const labelEl = document.getElementById(labelId!)
    expect(labelEl).not.toBeNull()
    expect(labelEl!.textContent).toMatch(/Optimal Solver/)
  })

  it('moves focus into the dialog on mount (close button is focused)', () => {
    renderCard()
    const closeBtn = screen.getByRole('button', { name: /close/i })
    expect(document.activeElement).toBe(closeBtn)
  })
})

// ─── Interaction tests ────────────────────────────────────────────────────────

describe('BadgeDetailCard — close interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const { onClose } = renderCard()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the × button is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderCard()
    const closeBtn = screen.getByRole('button', { name: /close/i })
    await user.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderCard()
    // The backdrop is the outermost element with data-testid="badge-dialog-backdrop"
    const backdrop = screen.getByTestId('badge-dialog-backdrop')
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when clicking inside the card (not backdrop)', async () => {
    const user = userEvent.setup()
    const { onClose } = renderCard()
    const dialog = screen.getByRole('dialog')
    await user.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('restores focus to the previously-focused element after the dialog unmounts', () => {
    // Render a trigger button and focus it before opening the card.
    const { getByTestId, unmount: unmountTrigger } = render(
      <button type="button" data-testid="trigger">
        Open badge
      </button>,
    )
    const trigger = getByTestId('trigger') as HTMLElement
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    // Mount the dialog (focus moves to close button inside).
    const { unmount } = renderCard()
    const closeBtn = screen.getByRole('button', { name: /close/i })
    expect(document.activeElement).toBe(closeBtn)

    // Unmounting the dialog should restore focus to the trigger.
    unmount()
    expect(document.activeElement).toBe(trigger)

    unmountTrigger()
  })
})
