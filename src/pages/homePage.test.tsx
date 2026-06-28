// HomePage — badge grid integration tests (Task 8).
// Tests the HomeDashboard's "Your treasures" section: interactive BadgeMedalGrid,
// "N of M" count, detail card open/close. jsdom has no WebGL so the 3D path
// never activates — we exercise only the DOM path.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ─── Shared mutable holder (hoisted above imports) ────────────────────────────

const holder = vi.hoisted(() => ({
  earnedBadges: ['first-loop'] as string[],
  badgeAcquiredAt: { 'first-loop': Date.UTC(2025, 0, 1) } as Record<string, number>,
}))

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../context/LearnerContext', () => ({
  useLearner: () => ({
    ready: true,
    activeLearner: { id: 'kid-1', displayName: 'Alex' },
    state: {
      badges: holder.earnedBadges,
      badgeAcquiredAt: holder.badgeAcquiredAt,
      completedLessonIds: [],
      streak: { current: 0, longest: 0, lastDate: null },
      skillStats: {},
      stepStats: {},
      aiUsage: { explainServed: 0, explainFailed: 0, genServed: 0, genFailed: 0 },
    },
    signOut: vi.fn(),
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ enabled: false, user: null, signOutParent: vi.fn() }),
}))

vi.mock('../content/registry', () => ({
  course: { title: 'Brillant Course', lessonOrder: [] },
  getLesson: () => undefined,
  listLessons: () => [
    {
      id: 'lesson-1',
      title: 'Test',
      skillIds: [],
      steps: [],
      award: { id: 'combo-coder', title: 'Combo Coder', blurb: 'Completed the loops lesson.', rarity: 'uncommon' },
    },
  ],
}))

vi.mock('../storage/progress', () => ({
  courseCompletionPercent: () => 0,
  nextRecommendedLessonId: () => null,
}))

vi.mock('../adaptivity/mastery', () => ({
  dueSkills: () => [],
}))

vi.mock('../ai/config', () => ({
  aiGenerationOn: () => false,
}))

vi.mock('../lib/useAiEnabled', () => ({
  useAiEnabled: () => false,
}))

vi.mock('../ai/reviewPrefetch', () => ({
  warmReviewAhead: vi.fn(),
}))

vi.mock('../lib/sound', () => ({
  playSound: vi.fn(),
}))

vi.mock('../components/RicoBird', () => ({
  RicoBird: () => <div data-testid="rico-bird" />,
}))

vi.mock('../components/SoundToggle', () => ({
  SoundToggle: () => null,
}))

// BadgeMedalScene is never loaded in jsdom (no WebGL), but mock the dynamic
// import to avoid noise.
vi.mock('../components/BadgeMedalScene', () => ({
  createBadgeMedalScene: vi.fn(() => ({ dispose: vi.fn() })),
}))

// ─── Import page under test ───────────────────────────────────────────────────

import { HomePage } from './HomePage'

// ─── Helper ──────────────────────────────────────────────────────────────────

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <HomePage />
    </MemoryRouter>,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  holder.earnedBadges = ['first-loop']
  holder.badgeAcquiredAt = { 'first-loop': Date.UTC(2025, 0, 1) }
  vi.clearAllMocks()
})

describe('HomePage — badge grid (Task 8)', () => {
  it('renders the badge grid tiles (at least one per badge in listAllBadgeIds)', () => {
    renderHome()
    // BadgeMedalGrid renders one button per badge (earned + locked)
    const buttons = screen.getAllByRole('button')
    // At least the earned + locked achievement badges + lesson award should appear
    expect(buttons.length).toBeGreaterThan(1)
  })

  it('shows an "N of M" count in the header', () => {
    renderHome()
    // earnedBadges = ['first-loop'] (1 earned), total = BADGES.length + lesson awards
    expect(screen.getByText(/1 of \d+/)).toBeInTheDocument()
  })

  it('clicking a badge tile opens the detail card with role="dialog"', () => {
    renderHome()
    // Find the Loop Starter tile button and click it
    const loopTile = screen.getByText('Loop Starter').closest('button')
    expect(loopTile).not.toBeNull()
    fireEvent.click(loopTile!)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('the detail card shows the badge title after opening', () => {
    renderHome()
    const loopTile = screen.getByText('Loop Starter').closest('button')
    fireEvent.click(loopTile!)
    // title appears in the dialog heading
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/Loop Starter/)
  })

  it('pressing Escape closes the detail card', () => {
    renderHome()
    const loopTile = screen.getByText('Loop Starter').closest('button')
    fireEvent.click(loopTile!)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking the × button closes the detail card', () => {
    renderHome()
    const loopTile = screen.getByText('Loop Starter').closest('button')
    fireEvent.click(loopTile!)
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('empty-state hint is still shown when no badges are earned', () => {
    holder.earnedBadges = []
    holder.badgeAcquiredAt = {}
    renderHome()
    expect(screen.getByText(/Solve puzzles to earn your first treasure/i)).toBeInTheDocument()
  })
})
