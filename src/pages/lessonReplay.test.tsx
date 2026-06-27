import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { emptyLearnerState } from '../storage/types'
import type { LearnerState } from '../storage/types'

// The same two-step lesson as lessonPageResume.test.tsx — concept + one puzzle.
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

// Mocked useLearner — same pattern as lessonPageResume.test.tsx. Starts with
// state:null and exposes a setter so tests can deliver state after mount,
// reproducing the async-storage race.
const holder = vi.hoisted(() => ({
  deliverState: null as null | ((s: unknown) => void),
}))

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
  conceptForLesson: () => null,
  buildPracticeTemplate: () => null,
  smallerVariantTemplate: () => null,
  toPracticeStep: () => null,
}))
vi.mock('../ai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/config')>()
  return { ...actual, aiGenerationEnabled: false, aiExplainEnabled: false, aiGenerationOn: () => false, aiExplainOn: () => false }
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

// A fully-completed lesson: every step done, savedPrograms could be populated.
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
    // Simulate persisted saved programs to verify they are NOT hydrated on replay.
    savedPrograms: { q1: [{ kind: 'move', id: 'node-1', command: 'right', locked: false }] },
    openedAt: Date.now(),
  }
  state.completedLessonIds = [lesson.id]
  return state
}

beforeEach(() => {
  holder.deliverState = null
})

describe('LessonPage replay', () => {
  it('replay intent starts at step 0 (concept) with blank editors and keeps completion', async () => {
    render(
      <MemoryRouter initialEntries={['/lesson/lesson-test?replay=1']}>
        <Routes>
          <Route path="/lesson/:lessonId" element={<LessonPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(holder.deliverState).toBeTypeOf('function')
    act(() => holder.deliverState!(completedLessonState()))

    // stepIndex=0: the concept intro is shown, NOT the reward screen.
    expect(await screen.findByText('Intro chapter')).toBeInTheDocument()
    expect(screen.queryByText('Lesson complete')).not.toBeInTheDocument()
    // The puzzle step is not shown either (we are on step 0 = concept).
    expect(screen.queryByText('Reach the treasure')).not.toBeInTheDocument()
  })
})
