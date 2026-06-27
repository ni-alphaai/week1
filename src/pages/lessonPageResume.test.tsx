import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { emptyLearnerState } from '../storage/types'
import type { LearnerState } from '../storage/types'

// A tiny two-step lesson: a concept intro followed by one move puzzle. A learner
// who has finished the intro should resume on the puzzle, not the concept.
const lesson = {
  id: 'lesson-test',
  title: 'Test Lesson',
  subtitle: '',
  sequence: 1,
  version: 1,
  skillIds: ['sequencing'],
  steps: [
    { id: 'c1', type: 'concept', title: 'Intro chapter', body: 'Welcome aboard.' },
    {
      id: 'q1',
      type: 'sequence',
      goal: 'Reach the treasure',
      prompt: 'Move right to the treasure.',
      map: { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 }, obstacles: [] },
      availableCommands: ['right'],
      successRule: 'reachGoal',
      optimal: 2,
      feedback: { correct: 'Nice!', hints: ['Head right.'] },
      solution: ['right', 'right'],
    },
  ],
}

// The mocked useLearner starts with `state: null` (as on a hard reload before the
// persisted state arrives) and exposes its setter so a test can deliver state
// after mount, reproducing the resume race.
const holder = vi.hoisted(() => ({
  deliverState: null as null | ((s: unknown) => void),
}))

vi.mock('../context/LearnerContext', async () => {
  const React = await import('react')
  // Stable identities, matching the real useCallback-based provider. This is
  // essential: if these were recreated each render, the resume effect would
  // re-run on the state-delivery render and mask the very bug under test.
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
// conceptForLesson => null short-circuits the prefetch / smaller-variant effects.
vi.mock('../content/generated', () => ({
  conceptForLesson: () => null,
  buildPracticeTemplate: () => null,
  smallerVariantTemplate: () => null,
  toPracticeStep: () => null,
}))
vi.mock('../ai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/config')>()
  return { ...actual, aiGenerationEnabled: false, aiExplainEnabled: false }
})
vi.mock('../ai/generation', () => ({ generatePuzzle: vi.fn(async () => null) }))
vi.mock('../ai/explain', () => ({ getExplanation: vi.fn(async () => ({ text: '', source: 'authored' })) }))
vi.mock('../ai/practicePrefetch', () => ({ ensurePrefetchDepth: vi.fn(), PREFETCH_QUEUE_DEPTH: 2 }))
vi.mock('../lib/sound', () => ({ playSound: vi.fn() }))
vi.mock('../components/BadgeToast', () => ({ BadgeToast: () => null }))
vi.mock('../components/Confetti', () => ({ Confetti: () => null }))
vi.mock('../components/SoundToggle', () => ({ SoundToggle: () => null }))
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

// A mid-lesson saved state: the concept is done, the learner is on the puzzle.
function midLessonState(): LearnerState {
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
  return state
}

// A fully-finished lesson: every step complete. Re-opening it (e.g. via the
// course "Review" link) should land on the reward screen, not replay the puzzle.
function completedLessonState(): LearnerState {
  const state = emptyLearnerState('kid-1')
  state.lessonProgress[lesson.id] = {
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    status: 'completed',
    currentStepId: 'q1',
    completedStepIds: ['c1', 'q1'],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: Date.now(),
    savedPrograms: {},
    openedAt: Date.now(),
  }
  state.completedLessonIds = [lesson.id]
  return state
}

beforeEach(() => {
  holder.deliverState = null
})

describe('LessonPage resume', () => {
  it('resumes on the in-progress puzzle when persisted state arrives after mount', async () => {
    renderLesson()
    // Before state loads the page is still settling; deliver the saved state the
    // way the async store does on a hard reload at /lesson/:id.
    expect(holder.deliverState).toBeTypeOf('function')
    act(() => holder.deliverState!(midLessonState()))

    // The learner lands on the puzzle (resumeStepId skips the finished concept),
    // not back on the intro chapter.
    expect(await screen.findByText('Reach the treasure')).toBeInTheDocument()
    expect(screen.queryByText('Intro chapter')).not.toBeInTheDocument()
  })

  it('starts a fresh learner at the first (concept) step', async () => {
    renderLesson()
    expect(holder.deliverState).toBeTypeOf('function')
    act(() => holder.deliverState!(emptyLearnerState('kid-1')))

    expect(await screen.findByText('Intro chapter')).toBeInTheDocument()
    expect(screen.queryByText('Reach the treasure')).not.toBeInTheDocument()
  })

  it('opens a fully-completed lesson on the reward screen, not the final step', async () => {
    renderLesson()
    expect(holder.deliverState).toBeTypeOf('function')
    act(() => holder.deliverState!(completedLessonState()))

    // The completion/reward screen, not a replay of the last puzzle.
    expect(await screen.findByText('Lesson complete')).toBeInTheDocument()
    expect(screen.queryByText('Reach the treasure')).not.toBeInTheDocument()
  })
})
