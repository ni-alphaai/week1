import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { emptyLearnerState } from '../storage/types'
import type { LearnerState } from '../storage/types'
import type { RunOutcome } from '../run/timeline'

// ---------------------------------------------------------------------------
// Hoisted fixtures
// ---------------------------------------------------------------------------
const holder = vi.hoisted(() => {
  // The authored puzzle we expose via reviewItemForSkill — a simple 1-row
  // corridor the explorer solves with one 'right'.
  const loopPuzzle = {
    id: 'l2-q1-review',
    type: 'sequence',
    goal: 'Use a loop to reach the treasure!',
    prompt: 'Repeat the move to reach the treasure.',
    map: { rows: 1, cols: 2, start: { row: 0, col: 0 }, goal: { row: 0, col: 1 } },
    availableCommands: ['right'],
    successRule: 'reachGoal',
    optimal: 1,
    solution: ['right'],
    feedback: { correct: 'Nice loop!', hints: ['Move right.'] },
    aiGenerated: false,
  }

  return {
    loopPuzzle,
    // Spy so tests can assert recordReview calls.
    recordReview: vi.fn(),
    // Deliver state: set after mount, simulates async store load.
    deliverState: null as null | ((s: LearnerState) => void),
    // Settle handle: allows tests to trigger a run outcome directly.
    triggerSettle: null as null | ((outcome: RunOutcome) => void),
    // Last state snapshot after recordReview mutates it — lets tests assert box resets.
    lastState: null as null | LearnerState,
  }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// AI is OFF for all tests in this file.
vi.mock('../ai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/config')>()
  return {
    ...actual,
    aiGenerationEnabled: false,
    aiGenerationOn: () => false,
    aiExplainEnabled: false,
    aiExplainOn: () => false,
    aiAdaptiveEnabled: false,
    aiAdaptiveOn: () => false,
  }
})

// Supply a stable authored puzzle for the 'loops' skill.
vi.mock('../content/reviewItems', () => ({
  reviewItemForSkill: (_skillId: string, box: number) => ({
    skillId: 'loops',
    box,
    puzzle: holder.loopPuzzle,
    source: 'authored',
    blankEditor: true,
  }),
  authoredItemForSkill: () => holder.loopPuzzle,
}))

// dueSkills returns skills from the seeded state.
vi.mock('../adaptivity/mastery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../adaptivity/mastery')>()
  return {
    ...actual,
    dueSkills: (state: LearnerState) => {
      return Object.keys(state.skillStats).filter(
        (skillId) => state.skillStats[skillId] !== undefined,
      )
    },
  }
})

// listLessons / getLesson — the loops skill lives in lesson-2-for-loops.
vi.mock('../content/registry', () => ({
  listLessons: () => [
    {
      id: 'lesson-2-for-loops',
      title: 'For Loops',
      subtitle: '',
      sequence: 2,
      version: 1,
      skillIds: ['loops', 'sequencing'],
      steps: [holder.loopPuzzle],
    },
  ],
  getLesson: (id: string) => {
    if (id === 'lesson-2-for-loops') {
      return {
        id: 'lesson-2-for-loops',
        title: 'For Loops',
        subtitle: '',
        sequence: 2,
        version: 1,
        skillIds: ['loops', 'sequencing'],
        steps: [holder.loopPuzzle],
      }
    }
    return undefined
  },
  registerGeneratedPuzzle: vi.fn(),
}))

// reviewPrefetch is AI-only — just no-op in these tests.
vi.mock('../ai/reviewPrefetch', () => ({
  warmReview: vi.fn(async () => null),
  warmReviewAhead: vi.fn(),
  clearReview: vi.fn(),
}))

vi.mock('../content/generated', () => ({
  conceptForLesson: () => null,
  buildPracticeTemplate: () => null,
  toPracticeStep: () => holder.loopPuzzle,
}))

vi.mock('../lib/sound', () => ({ playSound: vi.fn() }))
vi.mock('../components/BadgeToast', () => ({ BadgeToast: () => null }))
vi.mock('../components/Confetti', () => ({ Confetti: () => null }))
vi.mock('../components/SoundToggle', () => ({ SoundToggle: () => null }))
vi.mock('../components/TreasureChestReward', () => ({ TreasureChestReward: () => null }))
vi.mock('../components/BirdGuide', () => ({
  BirdGuide: ({ message }: { message: string }) => <div data-testid="bird">{message}</div>,
}))
vi.mock('../components/MapGrid', () => ({
  MapGrid: () => <div data-testid="map-grid" />,
}))
// CommandSequence: expose an onChange prop so tests can programmatically add blocks.
vi.mock('../components/CommandSequence', () => ({
  CommandSequence: ({ onChange }: { onChange: (nodes: unknown[]) => void }) => (
    <div data-testid="cmd-seq">
      <button
        type="button"
        data-testid="add-block"
        onClick={() => onChange([{ kind: 'move', instruction: 'left', locked: false }])}
      >
        Add wrong block
      </button>
    </div>
  ),
}))
vi.mock('../components/RunStrip', () => ({ RunStrip: () => null }))
vi.mock('../components/ObjectivesChips', () => ({ ObjectivesChips: () => null }))
vi.mock('../lib/useAiEnabled', () => ({ useAiEnabled: () => {} }))
vi.mock('../components/programNodes', () => ({
  nodeToInstruction: (n: { instruction: string }) => n.instruction,
  instructionToNode: (i: string) => ({ kind: 'move', instruction: i, locked: false }),
  iterationMap: () => new Map(),
}))

// LearnerContext: backed by the real progress module so storage mutations
// (recordReview → box update) are observable.
vi.mock('../context/LearnerContext', async () => {
  const React = await import('react')
  const progressMod = await import('../storage/progress')

  const activeLearner = { id: 'kid-1', displayName: 'Kid' }

  return {
    useLearner: () => {
      const [state, setState] = React.useState<LearnerState | null>(null)
      React.useEffect(() => {
        holder.deliverState = setState
      }, [])

      const recordReviewFn = React.useCallback(
        (
          lesson: Parameters<typeof progressMod.recordReview>[1],
          skillId: string,
          stepId: string,
          correct: boolean,
        ) => {
          setState((prev) => {
            const base = prev ?? emptyLearnerState('kid-1')
            const next = progressMod.recordReview(base, lesson, skillId, stepId, correct)
            holder.recordReview(lesson, skillId, stepId, correct)
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
        recordReview: recordReviewFn,
        pendingBadges: [],
        consumePendingBadges: () => [],
        clearPendingBadges: vi.fn(),
      }
    },
  }
})

// checkProgram: always return incorrect so running triggers onSettle(solved=false).
vi.mock('../engine/checker', () => ({
  checkProgram: () => ({
    solved: false,
    run: { steps: [], status: 'stuck' },
    feedback: { status: 'incorrect', message: 'That path was wrong.' },
  }),
}))

// usePuzzleRun: thin wrapper that exposes handleRun to fire onSettle directly.
vi.mock('../run/usePuzzleRun', () => ({
  usePuzzleRun: ({ onSettle }: { onSettle?: (outcome: RunOutcome) => void }) => {
    const React = require('react')
    const [solved, setSolved] = React.useState(false)
    const [feedback, setFeedback] = React.useState<null | { status: string; message: string }>(null)

    // Register settle trigger for direct test control.
    React.useEffect(() => {
      holder.triggerSettle = (outcome: RunOutcome) => {
        setSolved(outcome.solved)
        setFeedback(
          outcome.solved
            ? { status: 'correct', message: 'Good job!' }
            : { status: 'incorrect', message: 'That path was wrong.' },
        )
        onSettle?.(outcome)
      }
    }, [onSettle])

    return {
      frame: { activeStepIndex: -1, explorer: { row: 0, col: 0 }, particles: [] },
      animating: false,
      solved,
      crashed: false,
      loopStuck: false,
      feedback,
      chips: [],
      handleRun: () => {
        // Trigger settle with incorrect outcome by default.
        holder.triggerSettle?.({
          solved: false,
          run: { steps: [], status: 'stuck' } as any,
          feedback: { status: 'incorrect', message: 'That path was wrong.' },
        })
      },
      reset: () => {
        setSolved(false)
        setFeedback(null)
      },
    }
  },
}))

import { ReviewPage } from './ReviewPage'

function renderReview() {
  return render(
    <MemoryRouter initialEntries={['/review']}>
      <Routes>
        <Route path="/review" element={<ReviewPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Seed a learner state with one due skill ('loops') at box 3.
function seededState(): LearnerState {
  const state = emptyLearnerState('kid-1')
  state.skillStats['loops'] = {
    attempts: 5,
    correct: 4,
    struggles: 0,
    source: 'lesson',
    practiceAttempts: 0,
    practiceCorrect: 0,
    lastCorrectAt: Date.now() - 10_000,
  }
  state.review.boxes['loops'] = { box: 3, lastReviewedAt: 0 }
  return state
}

beforeEach(() => {
  holder.recordReview.mockReset()
  holder.deliverState = null
  holder.triggerSettle = null
  holder.lastState = null
})

describe('ReviewPage (AI off)', () => {
  it('renders an authored review item — not "unavailable" — when AI is off', async () => {
    renderReview()
    // Deliver seeded state so dueSkills returns ['loops'].
    act(() => holder.deliverState!(seededState()))

    // Should show the authored puzzle, not "Review is turned off".
    expect(await screen.findByText('Use a loop to reach the treasure!')).toBeInTheDocument()
    expect(screen.queryByText(/Review is turned off/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument()
  })

  it('shows "All caught up" when there are no due skills', async () => {
    renderReview()
    // State with no skillStats → dueSkills returns [].
    act(() => holder.deliverState!(emptyLearnerState('kid-1')))

    expect(await screen.findByText(/All caught up/i)).toBeInTheDocument()
    expect(screen.queryByText('Use a loop to reach the treasure!')).not.toBeInTheDocument()
  })

  it('records a wrong outcome and calls recordReview with correct=false', async () => {
    renderReview()
    act(() => holder.deliverState!(seededState()))

    // Wait for the puzzle to appear.
    expect(await screen.findByText('Use a loop to reach the treasure!')).toBeInTheDocument()

    // Trigger a failed run directly via usePuzzleRun mock.
    await act(async () => {
      holder.triggerSettle!({
        solved: false,
        run: { steps: [], status: 'stuck' } as any,
        feedback: { status: 'incorrect', message: 'That path was wrong.' },
      })
    })

    // Verify recordReview was called with correct=false.
    await waitFor(() => {
      expect(holder.recordReview).toHaveBeenCalledTimes(1)
    })
    const call = holder.recordReview.mock.calls[0]
    expect(call[0]).toMatchObject({ id: 'lesson-2-for-loops' }) // lesson
    expect(call[1]).toBe('loops')                                 // skillId
    expect(call[2]).toBe(holder.loopPuzzle.id)                    // stepId
    expect(call[3]).toBe(false)                                   // correct=false (wrong run)
  })

  it('recap shows box reset to 1 after a wrong run (box 3→1 ↓)', async () => {
    renderReview()
    act(() => holder.deliverState!(seededState()))

    // Wait for the puzzle to appear.
    expect(await screen.findByText('Use a loop to reach the treasure!')).toBeInTheDocument()

    // Trigger a failed run.
    await act(async () => {
      holder.triggerSettle!({
        solved: false,
        run: { steps: [], status: 'stuck' } as any,
        feedback: { status: 'incorrect', message: 'That path was wrong.' },
      })
    })

    // Wait for the "Finish review" button to appear (only item in queue → index+1 >= queue.length).
    const finishBtn = await screen.findByRole('button', { name: /Finish review/i })

    // Click to advance to the recap screen.
    await act(async () => {
      finishBtn.click()
    })

    // Recap must be visible.
    await screen.findByTestId('mastery-recap')

    // Box was at 3 before the session; a wrong run resets to 1.
    expect(screen.getByText(/Box 3→1/)).toBeInTheDocument()

    // Storage state reflects the reset: box should now be 1.
    await waitFor(() => {
      expect(holder.lastState?.review?.boxes?.['loops']?.box).toBe(1)
    })
  })
})
