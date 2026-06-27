import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// `vi.mock` factories are hoisted above imports, so the loop fixture they hand
// back must come from `vi.hoisted`. `holder.current` is what the mocked
// `toPracticeStep` returns; `holder.concept` is what the mocked
// `conceptForLesson` returns. Each test sets them before rendering.
const holder = vi.hoisted(() => {
  // A loop that walks the explorer right three times — the verified solution
  // for the corridor below, and a scaffold a test can pre-fill into the editor.
  const loopSolution = [{ kind: 'loop', count: 3, body: ['right'], label: 'Repeat 3×' }]
  const base = {
    id: 'practice-loop-test',
    type: 'sequence',
    goal: 'Use a loop to reach the treasure!',
    prompt: 'Repeat the move to reach the treasure.',
    map: { rows: 3, cols: 4, start: { row: 0, col: 0 }, goal: { row: 0, col: 3 } },
    availableCommands: ['right'],
    blocks: ['loop'],
    loopRange: { min: 1, max: 5 },
    // Only one plain Right card — so a flat row of moves can't win and a Repeat
    // block is genuinely required.
    cardLimits: { right: 1, loop: 1 },
    successRule: 'reachGoal',
    optimal: 3,
    feedback: { correct: 'Loop master!', hints: ['Try repeating a move.'] },
    solution: loopSolution,
    aiGenerated: true,
  }
  // A plain-move navigation puzzle: walk three steps right to the treasure.
  const navStep = {
    id: 'practice-nav-test',
    type: 'sequence',
    goal: 'Walk the cargo to the dock!',
    prompt: 'Move right to reach the treasure.',
    map: { rows: 3, cols: 4, start: { row: 0, col: 0 }, goal: { row: 0, col: 3 } },
    availableCommands: ['up', 'down', 'left', 'right'],
    successRule: 'reachGoal',
    optimal: 3,
    feedback: { correct: 'Nice route!', hints: ['Head toward the dock.'] },
    solution: ['right', 'right', 'right'],
    aiGenerated: true,
  }
  return {
    loopSolution,
    base,
    navStep,
    current: base as Record<string, unknown>,
    concept: 'loops' as string | null,
    // Spy for the mastery-persistence call, asserted by the #2 test below.
    recordPracticeResult: vi.fn(),
  }
})

// Keep the real flags (so the adaptivity helpers still find them) but force
// generation on for the practice player.
vi.mock('../ai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/config')>()
  return { ...actual, aiGenerationEnabled: true }
})
vi.mock('../ai/generation', () => ({ generatePuzzle: vi.fn(async () => ({ aiGenerated: true, difficulty: 4 })) }))
vi.mock('../ai/explain', () => ({ getExplanation: vi.fn(async () => ({ text: 'hint', source: 'authored' })) }))
vi.mock('../content/generated', () => ({
  toPracticeStep: () => holder.current,
  conceptForLesson: () => holder.concept,
  buildPracticeTemplate: () => (holder.concept ? { concept: holder.concept } : null),
  clearPracticeSession: vi.fn(),
  recordPracticePuzzle: vi.fn(),
}))
vi.mock('../content/registry', () => ({
  getLesson: () => ({
    id: 'lesson-test',
    title: 'Test Lesson',
    subtitle: '',
    sequence: 1,
    version: 1,
    skillIds: [],
    steps: [],
  }),
  registerGeneratedPuzzle: vi.fn(),
}))
vi.mock('../context/LearnerContext', () => ({
  useLearner: () => ({
    ready: true,
    activeLearner: { id: 'kid-1', name: 'Kid' },
    state: null,
    recordPracticeResult: holder.recordPracticeResult,
    pendingBadges: [],
    consumePendingBadges: () => [],
    clearPendingBadges: vi.fn(),
  }),
}))
// BadgeToast self-manages via context; stub it so the player tests don't depend
// on the concurrently-built component.
vi.mock('../components/BadgeToast', () => ({ BadgeToast: () => null }))

import { PracticePage } from './PracticePage'
import { generatePuzzle } from '../ai/generation'
import { clearPrefetch } from '../ai/practicePrefetch'

const mockGeneratePuzzle = vi.mocked(generatePuzzle)

function renderPractice() {
  return render(
    <MemoryRouter initialEntries={['/practice/lesson-test']}>
      <Routes>
        <Route path="/practice/:lessonId" element={<PracticePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderPracticeStrict() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/practice/lesson-test']}>
        <Routes>
          <Route path="/practice/:lessonId" element={<PracticePage />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

beforeEach(() => {
  // Reset the shared fixtures + generation mock so each test starts clean.
  holder.current = { ...holder.base }
  holder.concept = 'loops'
  holder.recordPracticeResult.mockReset()
  mockGeneratePuzzle.mockReset()
  mockGeneratePuzzle.mockResolvedValue({ aiGenerated: true, difficulty: 4 } as never)
  // The prefetch cache is module-level (survives navigation in the app); clear
  // it between tests so a leftover one-ahead slot can't leak across cases.
  clearPrefetch('lesson-test')
})

describe('PracticePage (loop puzzles)', () => {
  it('offers the Repeat block and enforces card limits for a generated loop step', async () => {
    // No scaffold: the editor opens empty so the limited cards show their counts.
    holder.current = { ...holder.base }
    renderPractice()

    expect(await screen.findByText(/Repeat …× block/)).toBeInTheDocument()
    // Right (limit 1) and the Repeat block (limit 1) each advertise "1 left".
    expect(screen.getAllByText('1 left').length).toBeGreaterThan(0)
  })

  it('solves the puzzle when a correct loop program is run', async () => {
    // Pre-fill the verified loop solution as an editable scaffold, then run it.
    holder.current = { ...holder.base, initialProgram: holder.loopSolution, editableInitial: true }
    renderPractice()

    await screen.findByText(/Repeat …× block/)
    fireEvent.click(screen.getByRole('button', { name: 'Run program' }))

    // Repeat 3× right reaches the goal -> solved -> the "Next puzzle" button shows.
    expect(await screen.findByText('Next puzzle', undefined, { timeout: 4000 })).toBeInTheDocument()
  })

  it('persists a correct run to mastery via recordPracticeResult', async () => {
    holder.current = { ...holder.base, initialProgram: holder.loopSolution, editableInitial: true }
    renderPractice()

    await screen.findByText(/Repeat …× block/)
    fireEvent.click(screen.getByRole('button', { name: 'Run program' }))

    // The end-of-run timer fires once the "Next puzzle" affordance appears.
    await screen.findByText('Next puzzle', undefined, { timeout: 4000 })

    expect(holder.recordPracticeResult).toHaveBeenCalledTimes(1)
    const call = holder.recordPracticeResult.mock.calls[0]
    // (lesson, stepId, correct, opts)
    expect(call[1]).toBe('practice-loop-test')
    expect(call[2]).toBe(true)
    expect(call[3]).toMatchObject({ optimalSolved: false })
  })

  it('offers a "Share this puzzle" button after a correct run', async () => {
    holder.current = { ...holder.base, initialProgram: holder.loopSolution, editableInitial: true }
    renderPractice()

    await screen.findByText(/Repeat …× block/)
    fireEvent.click(screen.getByRole('button', { name: 'Run program' }))
    await screen.findByText('Next puzzle', undefined, { timeout: 4000 })

    expect(screen.getByRole('button', { name: 'Share this puzzle' })).toBeInTheDocument()
  })

  it('auto-resets the "Link copied!" confirmation so the share button never sticks', async () => {
    holder.current = { ...holder.base, initialProgram: holder.loopSolution, editableInitial: true }
    renderPractice()

    await screen.findByText(/Repeat …× block/)
    fireEvent.click(screen.getByRole('button', { name: 'Run program' }))
    await screen.findByText('Next puzzle', undefined, { timeout: 4000 })

    fireEvent.click(screen.getByRole('button', { name: 'Share this puzzle' }))
    // Immediate confirmation…
    expect(screen.getByRole('button', { name: 'Link copied!' })).toBeInTheDocument()
    // …which resets on its own (the bug being guarded against was it sticking).
    expect(
      await screen.findByRole('button', { name: 'Share this puzzle' }, { timeout: 2500 }),
    ).toBeInTheDocument()
  })
})

describe('PracticePage (navigation puzzles)', () => {
  it('renders a generated navigation puzzle for a navigation lesson', async () => {
    holder.concept = 'navigation'
    holder.current = { ...holder.navStep }
    mockGeneratePuzzle.mockResolvedValue({
      map: holder.navStep.map,
      availableCommands: holder.navStep.availableCommands,
      solution: holder.navStep.solution,
      optimal: 3,
      difficulty: 4,
      concept: 'navigation',
      aiGenerated: true,
    } as never)

    renderPractice()

    expect(await screen.findByText('Walk the cargo to the dock!')).toBeInTheDocument()
    // Navigation puzzles are plain-move only — no Repeat block in the palette.
    expect(screen.queryByText(/Repeat …× block/)).not.toBeInTheDocument()
  })
})

describe('PracticePage (one-ahead prefetch)', () => {
  it('serves a prefetched puzzle on "Next puzzle" without a second loading state', async () => {
    // Solve the first (loop) puzzle so the "Next puzzle" button appears.
    holder.current = { ...holder.base, initialProgram: holder.loopSolution, editableInitial: true }
    renderPractice()

    await screen.findByText(/Repeat …× block/)
    fireEvent.click(screen.getByRole('button', { name: 'Run program' }))
    await screen.findByText('Next puzzle', undefined, { timeout: 4000 })

    // The first show already kicked off a background prefetch for the next one.
    expect(mockGeneratePuzzle.mock.calls.length).toBeGreaterThanOrEqual(2)

    // Swap in a distinct next puzzle, then advance.
    holder.current = { ...holder.navStep }
    fireEvent.click(screen.getByText('Next puzzle'))

    // The prefetched puzzle is served straight away…
    expect(await screen.findByText('Walk the cargo to the dock!')).toBeInTheDocument()
    // …and the loading spinner never reappeared (no second generate-on-demand).
    expect(screen.queryByText(/build you a fresh puzzle/)).not.toBeInTheDocument()
  })

  it('shows the building spinner when the queued prefetch has not resolved yet', async () => {
    holder.current = { ...holder.base, initialProgram: holder.loopSolution, editableInitial: true }
    // First generation (the shown puzzle) resolves immediately…
    mockGeneratePuzzle.mockReset()
    mockGeneratePuzzle.mockResolvedValueOnce({ aiGenerated: true, difficulty: 4 } as never)
    // …but the prefetch for the NEXT puzzle hangs, so consuming it must show the
    // spinner rather than freeze on the stale map.
    mockGeneratePuzzle.mockReturnValueOnce(new Promise(() => {}) as never)

    renderPractice()
    await screen.findByText(/Repeat …× block/)
    fireEvent.click(screen.getByRole('button', { name: 'Run program' }))
    await screen.findByText('Next puzzle', undefined, { timeout: 4000 })

    fireEvent.click(screen.getByText('Next puzzle'))
    // The unsettled prefetch falls back to the loading spinner.
    expect(await screen.findByText(/build you a fresh puzzle/)).toBeInTheDocument()
  })

  it('generates once per lesson under StrictMode (no duplicate load)', async () => {
    holder.current = { ...holder.base }
    renderPracticeStrict()

    await screen.findByText(/Repeat …× block/)
    // One on-demand generation for the shown puzzle + three queued ahead = 4.
    expect(mockGeneratePuzzle.mock.calls.length).toBe(4)
  })
})

describe('PracticePage (exit)', () => {
  it('renders a prominent Exit link back to the course', async () => {
    holder.current = { ...holder.base }
    renderPractice()

    await screen.findByText(/Repeat …× block/)
    const exit = screen.getByRole('link', { name: 'Exit' })
    expect(exit).toHaveAttribute('href', '/app')
  })
})
