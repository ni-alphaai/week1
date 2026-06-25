import { describe, it, expect } from 'vitest'
import { getLesson } from '../content/registry'
import { checkProgram } from '../engine/checker'
import {
  completeConcept,
  ensureLesson,
  recordSequenceResult,
  resumeStepId,
} from '../storage/progress'
import { emptyLearnerState } from '../storage/types'

/**
 * Integration-style tests that walk a real lesson through the engine + progress
 * layer the way LessonPage does at runtime.
 */
describe('lesson flow integration', () => {
  const lesson = getLesson('lesson-1-sequencing-cargo')!
  const introStep = lesson.steps.find((s) => s.type === 'concept')!
  const firstPuzzle = lesson.steps.find((s) => s.type === 'sequence')!
  // Verified shortest-path solution for l1-q1.
  const solution = ['up', 'up', 'right', 'right', 'right', 'up'] as const

  it('resumes at the concept step for a fresh learner', () => {
    const state = ensureLesson(emptyLearnerState('kid-1'), lesson)
    expect(resumeStepId(lesson, state.lessonProgress[lesson.id].completedStepIds)).toBe(introStep.id)
  })

  it('advances resume point after concept is completed', () => {
    let state = ensureLesson(emptyLearnerState('kid-1'), lesson)
    state = completeConcept(state, lesson, introStep.id)
    expect(resumeStepId(lesson, state.lessonProgress[lesson.id].completedStepIds)).toBe(firstPuzzle.id)
  })

  it('marks a puzzle correct when the learner submits a valid program', () => {
    let state = ensureLesson(emptyLearnerState('kid-1'), lesson)
    state = completeConcept(state, lesson, introStep.id)

    if (firstPuzzle.type !== 'sequence') throw new Error('fixture mismatch')
    const result = checkProgram(
      {
        map: firstPuzzle.map,
        successRule: firstPuzzle.successRule,
        optimal: firstPuzzle.optimal,
        feedback: firstPuzzle.feedback,
      },
      [...solution],
    )
    expect(result.correct).toBe(true)

    state = recordSequenceResult(state, lesson, firstPuzzle.id, true, result.run.executed)
    expect(state.lessonProgress[lesson.id].completedStepIds).toContain(firstPuzzle.id)
    expect(state.stepStats[firstPuzzle.id]?.solved).toBe(true)
  })

  it('records incorrect attempts without marking the step solved', () => {
    let state = ensureLesson(emptyLearnerState('kid-1'), lesson)
    state = completeConcept(state, lesson, introStep.id)

    state = recordSequenceResult(state, lesson, firstPuzzle.id, false, [])
    expect(state.stepStats[firstPuzzle.id]?.solved).toBeFalsy()
    expect(state.stepStats[firstPuzzle.id]?.incorrect).toBeGreaterThanOrEqual(1)
  })
})

describe('if / else lesson flow', () => {
  const lesson = getLesson('lesson-4-if-else')!
  const puzzle = lesson.steps.find((s) => s.id === 'l2-q1')!

  it('routes around a wall using a runtime sensor block', () => {
    if (puzzle.type !== 'conditional') throw new Error('fixture mismatch')
    const result = checkProgram(
      { map: puzzle.map, successRule: 'reachGoal', feedback: puzzle.feedback },
      puzzle.solution,
    )
    expect(result.correct).toBe(true)
    // The authored solution uses a loop wrapping an if/else block that senses the wall.
    expect(puzzle.solution[0]).toMatchObject({ kind: 'loop' })
    const loop = puzzle.solution[0] as { kind: 'loop'; body: unknown[] }
    expect(loop.body[0]).toMatchObject({ kind: 'conditional' })
  })
})
