import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BadgeToast } from './BadgeToast'

// Mock the learner context so the toast can be driven in isolation: `pending`
// is what useLearner() reports, and consume() drains it (mirroring the real
// consumePendingBadges contract).
const holder = vi.hoisted(() => ({ pending: [] as string[] }))

vi.mock('../context/LearnerContext', () => ({
  useLearner: () => ({
    pendingBadges: holder.pending,
    consumePendingBadges: () => {
      const out = holder.pending
      holder.pending = []
      return out
    },
  }),
}))

describe('BadgeToast', () => {
  beforeEach(() => {
    holder.pending = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when there are no pending badges', () => {
    const { container } = render(<BadgeToast />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a celebratory toast for the first pending badge', () => {
    holder.pending = ['first-loop']
    render(<BadgeToast />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Badge earned!')).toBeInTheDocument()
    expect(screen.getByText('Loop Starter')).toBeInTheDocument()
  })

  it('falls back to the raw id when no label exists', () => {
    holder.pending = ['mystery-badge']
    render(<BadgeToast />)
    expect(screen.getByText('mystery-badge')).toBeInTheDocument()
  })

  it('auto-dismisses after the timeout', () => {
    holder.pending = ['speedy']
    render(<BadgeToast />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
