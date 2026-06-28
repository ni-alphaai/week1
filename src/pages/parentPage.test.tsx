// ParentPage — badge chip interaction tests (Task 8).
// Tests that earned badge chips are tappable and open the BadgeDetailCard.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../context/LearnerContext', () => ({
  useLearner: () => ({
    ready: true,
    activeLearner: { id: 'kid-1', displayName: 'Alex' },
    state: {
      badges: ['first-loop'],
      badgeAcquiredAt: { 'first-loop': Date.UTC(2025, 0, 1) },
      completedLessonIds: [],
      streak: { current: 2, longest: 3, lastDate: null },
      skillStats: {},
      stepStats: {},
      aiUsage: { explainServed: 0, explainFailed: 0, genServed: 0, genFailed: 0 },
    },
    signOut: vi.fn(),
  }),
}))

vi.mock('../content/registry', () => ({
  course: { title: 'Brillant Course', lessonOrder: [] },
  getLesson: () => undefined,
  listLessons: () => [],
}))

vi.mock('../storage/progress', () => ({
  courseCompletionPercent: () => 25,
  masteryScore: () => 50,
  masteryTier: () => 'Apprentice',
  skillStruggles: () => [],
  stuckSteps: () => [],
}))

vi.mock('../ai/config', () => ({
  aiAnyOn: () => false,
}))

vi.mock('../lib/useAiEnabled', () => ({
  useAiEnabled: () => false,
}))

vi.mock('../components/AiToggle', () => ({
  AiToggle: () => null,
}))

vi.mock('../components/ProgressRing', () => ({
  ProgressRing: () => <div data-testid="progress-ring" />,
}))

vi.mock('../lib/sound', () => ({
  playSound: vi.fn(),
}))

// ─── Import page under test ───────────────────────────────────────────────────

import { ParentPage } from './ParentPage'

// ─── Helper ──────────────────────────────────────────────────────────────────

function renderParent() {
  return render(
    <MemoryRouter initialEntries={['/parent']}>
      <ParentPage />
    </MemoryRouter>,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ParentPage — badge chips (Task 8)', () => {
  it('renders an earned badge chip as a button', () => {
    renderParent()
    // Loop Starter is the earned badge in our mock
    const chipBtn = screen.getByRole('button', { name: /Loop Starter/i })
    expect(chipBtn).toBeInTheDocument()
  })

  it('clicking an earned badge chip opens the detail card', () => {
    renderParent()
    const chipBtn = screen.getByRole('button', { name: /Loop Starter/i })
    fireEvent.click(chipBtn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('the detail card shows the badge title', () => {
    renderParent()
    const chipBtn = screen.getByRole('button', { name: /Loop Starter/i })
    fireEvent.click(chipBtn)
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/Loop Starter/)
  })

  it('pressing Escape closes the detail card', () => {
    renderParent()
    const chipBtn = screen.getByRole('button', { name: /Loop Starter/i })
    fireEvent.click(chipBtn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking × closes the detail card', () => {
    renderParent()
    const chipBtn = screen.getByRole('button', { name: /Loop Starter/i })
    fireEvent.click(chipBtn)
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
