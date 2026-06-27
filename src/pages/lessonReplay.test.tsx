import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { emptyLearnerState } from '../storage/types'
import type { LearnerState } from '../storage/types'
import type { RunOutcome } from '../run/timeline'

// The same two-step lesson as lessonPageResume.test.tsx — concept + one puzzle.
// The puzzle now includes an initialProgram with the solution so the "Run program"
// button is always enabled during replay (program.length === 0 disables it otherwise).
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
      // Seeded so program.length > 0 and the Run button is enabled on replay.
      // initialProgram uses Instruction format: plain strings for move steps.
      initialProgram: ['right', 'right'],
      editableInitial: true,
    },
  ],
}

// Hoisted holder shared by mocks — needs to live here so vi.hoisted sees it.
const holder = vi.hoisted(() => ({
  deliverState: null as null | ((s: unknown) => void),
  // Settle trigger: mocked usePuzzleRun exposes this so tests can fire onSettle directly.
  triggerSettle: null as null | ((outcome: RunOutcome) => void),
  // Last LearnerState after a recordResult call (null if recordResult was never called).
  lastState: null as null | LearnerState,
  // Most recent state the component has, updated on every setState (delivery + recordResult).
  currentState: null as null | LearnerState,
}))

vi.mock('../context/LearnerContext', async () => {
  const React = await import('react')
  const progressMod = await import('../storage/progress')
  const activeLearner = { id: 'kid-1', displayName: 'Kid' }

  return {
    useLearner: () => {
      const [state, setState] = React.useState<LearnerState | null>(null)
      // Wrap setState so holder.currentState always tracks the live component state.
      const setStateTracked = React.useCallback((updater: LearnerState | null | ((prev: LearnerState | null) => LearnerState | null)) => {
        setState((prev) => {
          const next = typeof updater === 'function' ? updater(prev) : updater
          holder.currentState = next
          return next
        })
      }, [])
      React.useEffect(() => {
        holder.deliverState = setStateTracked
      }, [setStateTracked])

      // Wire recordResult through the real progress module so skillStats mutations
      // are observable. This is what makes the replay-guard test non-vacuous:
      // without the !isReplay gate, attempts increments; with it, nothing changes.
      const recordResult = React.useCallback(
        (
          lessonArg: Parameters<typeof progressMod.recordSequenceResult>[1],
          stepId: string,
          correct: boolean,
          commands: Parameters<typeof progressMod.recordSequenceResult>[4],
        ) => {
          setStateTracked((prev) => {
            const base = prev ?? emptyLearnerState('kid-1')
            const next = progressMod.recordSequenceResult(base, lessonArg, stepId, correct, commands)
            holder.lastState = next
            return next
          })
        },
        [],
      )

      return {
        ready: true,
        activeLearner,
        state,
        pendingBadges: [],
        ensureLesson: () => {},
        saveProgram: () => {},
        setCurrentStep: () => {},
        completeConcept: () => {},
        recordResult,
        recordPracticeResult: () => {},
        consumePendingBadges: () => [],
        clearPendingBadges: () => {},
      }
    },
  }
})

// usePuzzleRun: thin mock that exposes triggerSettle for direct test control,
// mirroring the pattern in reviewPage.test.tsx.
vi.mock('../run/usePuzzleRun', () => ({
  usePuzzleRun: ({ onSettle }: { onSettle?: (outcome: RunOutcome) => void }) => {
    const React = require('react')
    const [solved, setSolved] = React.useState(false)
    const [feedback, setFeedback] = React.useState<null | { status: string; message: string }>(null)

    React.useEffect(() => {
      holder.triggerSettle = (outcome: RunOutcome) => {
        setSolved(outcome.solved)
        setFeedback(
          outcome.solved
            ? { status: 'correct', message: 'Nice!' }
            : { status: 'incorrect', message: 'Try again.' },
        )
        onSettle?.(outcome)
      }
    }, [onSettle])

    return {
      frame: { activeStepIndex: -1, explorer: { row: 0, col: 0 }, particles: [], facing: 'right' },
      animating: false,
      solved,
      crashed: false,
      loopStuck: false,
      feedback,
      chips: [],
      handleRun: () => {
        holder.triggerSettle?.({
          solved: true,
          run: { steps: [], executed: [], status: 'solved', path: [], loopIterations: [] } as any,
          crashed: false,
          loopStuck: false,
          message: 'Nice!',
        })
      },
      reset: () => {},
    }
  },
}))

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
vi.mock('../components/CommandSequence', () => ({
  // Expose program length so tests can assert editors are blank on replay.
  CommandSequence: ({ program }: { program: unknown[] }) => (
    <div data-testid="program-editor">{program.length}</div>
  ),
}))
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

// A completed-lesson state that also has prior skillStats (simulating a learner who
// has already solved this lesson once before and has recorded attempts).
function completedLessonStateWithStats(): LearnerState {
  const state = completedLessonState()
  state.skillStats['sequencing'] = {
    attempts: 3,
    correct: 3,
    struggles: 0,
    source: 'lesson',
    practiceAttempts: 0,
    practiceCorrect: 0,
    lastCorrectAt: Date.now(),
  }
  return state
}

beforeEach(() => {
  holder.deliverState = null
  holder.triggerSettle = null
  holder.lastState = null
  holder.currentState = null
  // jsdom does not implement scrollIntoView; mock it so onSettle doesn't throw.
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

describe('LessonPage replay', () => {
  it('replay intent starts at step 0 (concept), not the reward screen', async () => {
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

  it('replay play step has blank editors — savedPrograms are not hydrated', async () => {
    render(
      <MemoryRouter initialEntries={['/lesson/lesson-test?replay=1']}>
        <Routes>
          <Route path="/lesson/:lessonId" element={<LessonPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(holder.deliverState).toBeTypeOf('function')
    act(() => holder.deliverState!(completedLessonState()))

    // Advance past the concept to the play step.
    const continueBtn = await screen.findByRole('button', { name: /continue/i })
    fireEvent.click(continueBtn)

    // The puzzle goal is now shown.
    expect(await screen.findByText('Reach the treasure')).toBeInTheDocument()
    // The program editor should be seeded from initialProgram (not savedPrograms).
    // completedLessonState sets savedPrograms.q1 = [{ kind:'move', ... }] (1 node),
    // but replay skips savedPrograms and seeds from initialProgram (2 nodes: right + right).
    expect(screen.getByTestId('program-editor').textContent).toBe('2')
  })

  it('replay solve does not mutate skillStats — recordResult is gated on !isReplay', async () => {
    render(
      <MemoryRouter initialEntries={['/lesson/lesson-test?replay=1']}>
        <Routes>
          <Route path="/lesson/:lessonId" element={<LessonPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(holder.deliverState).toBeTypeOf('function')
    const initialState = completedLessonStateWithStats()
    act(() => holder.deliverState!(initialState))

    // Advance past the concept to the play step.
    const continueBtn = await screen.findByRole('button', { name: /continue/i })
    fireEvent.click(continueBtn)
    expect(await screen.findByText('Reach the treasure')).toBeInTheDocument()

    // Trigger a successful solve during replay.
    expect(holder.triggerSettle).toBeTypeOf('function')
    act(() => {
      holder.triggerSettle!({
        solved: true,
        run: { steps: [], executed: [], status: 'solved', path: [], loopIterations: [] } as any,
        crashed: false,
        loopStuck: false,
        message: 'Nice!',
      })
    })

    // recordResult must NOT have been called — lastState remains null.
    expect(holder.lastState).toBeNull()
    // The component's current state was set by the delivery call (attempts=3) and
    // must NOT have been further mutated by recordResult during replay.
    // If the !isReplay gate were removed, recordResult would fire and increment
    // attempts to 4 — this assertion would fail, proving it discriminates.
    expect(holder.currentState?.skillStats['sequencing'].attempts).toBe(3)
  })
})
