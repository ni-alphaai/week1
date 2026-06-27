import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { emptyLearnerState } from '../storage/types'
import type { LearnerState } from '../storage/types'

// A two-step lesson: concept intro + one conditional play step (no hints, so the
// "Watch Rico" / "Try a smaller version" affordances show immediately).
const lesson = {
  id: 'lesson-test',
  title: 'Test Lesson',
  subtitle: '',
  sequence: 1,
  version: 1,
  skillIds: ['conditionals'],
  steps: [
    { id: 'c1', type: 'concept', title: 'Intro', body: 'Welcome.' },
    {
      id: 'q1',
      type: 'conditional',
      goal: 'Main puzzle goal',
      prompt: 'Solve the main puzzle.',
      map: { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 }, obstacles: [] },
      availableCommands: ['right'],
      feedback: { correct: 'Yes!', hints: [] },
      solution: ['right', 'right'],
    },
  ],
}

// The easier variant the smaller-version generator yields.
const variantStep = {
  id: 'variant-1',
  type: 'sequence',
  goal: 'Warm-up goal',
  prompt: 'Easier warm-up.',
  map: { rows: 1, cols: 2, start: { row: 0, col: 0 }, goal: { row: 0, col: 1 }, obstacles: [] },
  availableCommands: ['right'],
  successRule: 'reachGoal',
  feedback: { correct: 'Nice!', hints: [] },
  solution: ['right'],
}

const holder = vi.hoisted(() => ({ deliverState: null as null | ((s: unknown) => void) }))

vi.mock('../context/LearnerContext', async () => {
  const React = await import('react')
  const activeLearner = { id: 'kid-1', displayName: 'Kid' }
  const fns = {
    ensureLesson: () => {},
    saveProgram: () => {},
    setCurrentStep: () => {},
    completeConcept: () => {},
    recordResult: () => {},
    recordPracticeResult: () => {},
    consumePendingBadges: () => [],
    clearPendingBadges: () => {},
  }
  return {
    useLearner: () => {
      const [state, setState] = React.useState<unknown>(null)
      React.useEffect(() => {
        holder.deliverState = setState
      }, [])
      return { ready: true, activeLearner, state, pendingBadges: [], ...fns }
    },
  }
})

vi.mock('../content/registry', () => ({
  getLesson: () => lesson,
  getNextLessonId: () => null,
  registerGeneratedPuzzle: vi.fn(),
}))
vi.mock('../content/generated', () => ({
  conceptForLesson: () => 'conditionals',
  buildPracticeTemplate: () => ({ concept: 'conditionals' }),
  smallerVariantTemplate: () => ({ concept: 'conditionals' }),
  toPracticeStep: () => variantStep,
}))
vi.mock('../ai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/config')>()
  return { ...actual, aiGenerationEnabled: true, aiExplainEnabled: false, aiGenerationOn: () => true, aiExplainOn: () => false }
})
vi.mock('../ai/generation', () => ({ generatePuzzle: vi.fn(async () => null) }))
vi.mock('../ai/explain', () => ({ getExplanation: vi.fn(async () => ({ text: '', source: 'authored' })) }))
vi.mock('../ai/practicePrefetch', () => ({ ensurePrefetchDepth: vi.fn(), PREFETCH_QUEUE_DEPTH: 2 }))

// The variant prefetch: warmSmallerVariant resolves to a valid puzzle (readiness),
// and consumeSmallerVariant returns the puzzle to open on click — so any fallback
// to "Watch Rico" must be a consumption-logic bug.
const warmMock = vi.hoisted(() => ({ fn: vi.fn() }))
const consumeMock = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('../ai/variantPrefetch', () => ({
  warmSmallerVariant: (...args: unknown[]) => warmMock.fn(...args),
  peekSmallerVariant: vi.fn(() => null),
  consumeSmallerVariant: (...args: unknown[]) => consumeMock.fn(...args),
  clearSmallerVariant: vi.fn(),
}))

vi.mock('../lib/sound', () => ({ playSound: vi.fn() }))
vi.mock('../components/BadgeToast', () => ({ BadgeToast: () => null }))
vi.mock('../components/Confetti', () => ({ Confetti: () => null }))
vi.mock('../components/SoundToggle', () => ({ SoundToggle: () => null }))
vi.mock('../components/TreasureChestReward', () => ({ TreasureChestReward: () => null }))
vi.mock('../components/MapGrid', () => ({ MapGrid: () => null }))
vi.mock('../components/CommandSequence', () => ({ CommandSequence: () => null }))
vi.mock('../components/BirdGuide', () => ({
  BirdGuide: ({ message }: { message: string }) => <div>{message}</div>,
}))

import { LessonPage } from './LessonPage'

function renderLesson() {
  return render(
    <MemoryRouter initialEntries={['/lesson/lesson-test']}>
      <Routes>
        <Route path="/lesson/:lessonId" element={<LessonPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// A resume state: concept done, learner is mid-lesson on the conditional step
// having already missed it once (the classic "resume and I'm stuck" case).
function resumeState(): LearnerState {
  const state = emptyLearnerState('kid-1')
  state.lessonProgress[lesson.id] = {
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    status: 'in_progress',
    currentStepId: 'q1',
    completedStepIds: ['c1'],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    savedPrograms: {},
    openedAt: Date.now(),
  }
  state.stepStats['q1'] = { incorrect: 2, solved: false, source: 'lesson', timeSpentMs: 0 }
  return state
}

beforeEach(() => {
  holder.deliverState = null
  warmMock.fn.mockReset()
  warmMock.fn.mockReturnValue(Promise.resolve(variantStep))
  consumeMock.fn.mockReset()
  consumeMock.fn.mockReturnValue(variantStep)
})

describe('LessonPage smaller variant on resume', () => {
  it('warms the variant and opens it on click after resuming mid-lesson', async () => {
    renderLesson()
    expect(holder.deliverState).toBeTypeOf('function')
    act(() => holder.deliverState!(resumeState()))

    // Resumed onto the conditional play step.
    expect(await screen.findByText('Solve the main puzzle.')).toBeInTheDocument()
    // The variant was warmed in the background on resume.
    await waitFor(() => expect(warmMock.fn).toHaveBeenCalled())

    // No hints on this step, so "Try a smaller version" is available immediately.
    const btn = await screen.findByRole('button', { name: /Try a smaller version/i })
    fireEvent.click(btn)

    // It should open the easier variant, NOT fall back to "watch Rico".
    expect(await screen.findByText('Warm-up goal')).toBeInTheDocument()
    expect(screen.queryByText(/watch Rico instead/i)).not.toBeInTheDocument()
  })

  it('shows a disabled "Preparing…" state until the variant is ready, then enables it', async () => {
    // A variant whose generation is still in flight (deferred promise).
    let resolveVariant: (p: unknown) => void = () => {}
    const deferred = new Promise((res) => {
      resolveVariant = res
    })
    warmMock.fn.mockReturnValue(deferred)

    renderLesson()
    act(() => holder.deliverState!(resumeState()))
    await screen.findByText('Solve the main puzzle.')

    // While generation is in flight the affordance is a disabled "Preparing…",
    // not a clickable "Try a smaller version" — so the learner sees it coming.
    const preparing = await screen.findByRole('button', { name: /Preparing a smaller version/i })
    expect(preparing).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Try a smaller version of this puzzle' }),
    ).not.toBeInTheDocument()

    // Once it resolves to a valid puzzle, the button becomes enabled.
    await act(async () => {
      resolveVariant(variantStep)
      await deferred
    })
    const ready = await screen.findByRole('button', { name: 'Try a smaller version of this puzzle' })
    expect(ready).toBeEnabled()
  })

  it('hides the affordance when there is no variant to serve', async () => {
    // Readiness resolves to null (no AI puzzle and no authored fallback), so the
    // smaller-version affordance disappears and Rico's demo remains as fallback.
    warmMock.fn.mockReturnValue(Promise.resolve(null))

    renderLesson()
    act(() => holder.deliverState!(resumeState()))
    await screen.findByText('Solve the main puzzle.')

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /smaller version/i })).not.toBeInTheDocument(),
    )
    // A click-and-fail never happened: the button was never enabled.
    expect(screen.queryByRole('button', { name: 'Try a smaller version of this puzzle' })).not.toBeInTheDocument()
  })
})
