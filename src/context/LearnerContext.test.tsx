import { useEffect, useRef } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Lesson, Step } from '../types'
import type { LearnerState } from '../storage/types'
import { emptyLearnerState } from '../storage/types'

const backendMock = vi.hoisted(() => ({
  activeLearnerId: 'kid-1' as string | null,
  remoteState: null as LearnerState | null,
  saves: [] as Array<{
    state: LearnerState
    resolve: () => void
  }>,
}))

vi.mock('../storage/backend', () => ({
  listLearners: vi.fn(async () => [{ id: 'kid-1', displayName: 'Kid', createdAt: 1 }]),
  getActiveLearnerId: vi.fn(() => backendMock.activeLearnerId),
  setActiveLearnerId: vi.fn((_owner: string, id: string | null) => {
    backendMock.activeLearnerId = id
  }),
  loadState: vi.fn(async () => backendMock.remoteState ?? emptyLearnerState('kid-1')),
  saveState: vi.fn((_owner: string, state: LearnerState) => {
    const snapshot = structuredClone(state)
    return new Promise<void>((resolve) => {
      backendMock.saves.push({
        state: snapshot,
        resolve: () => {
          backendMock.remoteState = snapshot
          resolve()
        },
      })
    })
  }),
  createLearner: vi.fn(),
  deleteLearner: vi.fn(),
}))

const lesson: Lesson = {
  id: 'lesson-test',
  title: 'Test Lesson',
  subtitle: '',
  sequence: 1,
  version: 1,
  skillIds: ['sequencing'],
  steps: [
    {
      id: 'q1',
      type: 'sequence',
      goal: 'Reach the treasure',
      prompt: 'Move right.',
      map: { rows: 1, cols: 2, start: { row: 0, col: 0 }, goal: { row: 0, col: 1 } },
      availableCommands: ['right'],
      successRule: 'reachGoal',
      optimal: 1,
      solution: ['right'],
      feedback: { correct: 'Nice!', hints: [] },
    },
  ],
}

import { LearnerProvider, useLearner } from './LearnerContext'

function CompleteLessonOnce() {
  const ctx = useLearner()
  const ran = useRef(false)

  useEffect(() => {
    if (!ctx.ready || !ctx.state || ran.current) return
    ran.current = true
    ctx.ensureLesson(lesson)
    ctx.recordResult(lesson, 'q1', true, ['right'] as Step[])
  }, [ctx])

  return null
}

describe('LearnerProvider persistence', () => {
  beforeEach(() => {
    backendMock.activeLearnerId = 'kid-1'
    backendMock.remoteState = null
    backendMock.saves = []
  })

  it('writes the latest completed state after an older in-flight save finishes', async () => {
    render(
      <LearnerProvider ownerKey="parent-1">
        <CompleteLessonOnce />
      </LearnerProvider>,
    )

    await waitFor(() => expect(backendMock.saves).toHaveLength(1))

    const staleInProgressSave = backendMock.saves[0]
    expect(staleInProgressSave.state.completedLessonIds).toEqual([])

    await act(async () => {
      staleInProgressSave.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(backendMock.saves).toHaveLength(2))

    const completedSave = backendMock.saves[1]
    expect(completedSave.state.completedLessonIds).toEqual(['lesson-test'])

    await act(async () => {
      completedSave.resolve()
      await Promise.resolve()
    })

    expect(backendMock.remoteState?.completedLessonIds).toEqual(['lesson-test'])
    expect(backendMock.remoteState?.lessonProgress['lesson-test']?.status).toBe('completed')
  })
})
