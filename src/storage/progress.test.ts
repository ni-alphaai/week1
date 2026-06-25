import { describe, it, expect } from 'vitest'
import type { Course, Lesson } from '../types'
import { emptyLearnerState } from './types'
import type { LearnerState } from './types'
import {
  completeConcept,
  courseCompletionPercent,
  ensureLesson,
  masteryScore,
  lessonHasProgress,
  nextRecommendedLessonId,
  recordSequenceResult,
  restartLesson,
  resumeStepId,
  saveProgram,
} from './progress'

// A compact two-question lesson fixture so completion is easy to reason about.
const lesson: Lesson = {
  id: 'lesson-x',
  version: 3,
  title: 'Test Lesson',
  subtitle: 'fixture',
  sequence: 1,
  skillIds: ['sequencing'],
  steps: [
    { id: 'intro', type: 'concept', title: 'Hi', body: 'body' },
    {
      id: 'q1',
      type: 'sequence',
      goal: 'Reach treasure',
      prompt: 'p',
      map: { rows: 1, cols: 2, start: { row: 0, col: 0 }, goal: { row: 0, col: 1 } },
      availableCommands: ['right'],
      successRule: 'reachGoal',
      feedback: { correct: 'c', hints: ['Try a different order.'] },
    },
    {
      id: 'q2',
      type: 'sequence',
      goal: 'Reach treasure',
      prompt: 'p',
      map: { rows: 1, cols: 2, start: { row: 0, col: 0 }, goal: { row: 0, col: 1 } },
      availableCommands: ['right'],
      successRule: 'reachGoal',
      feedback: { correct: 'c', hints: ['Try a different order.'] },
    },
  ],
}

const course: Course = {
  id: 'programming-logic',
  title: 'Programming Logic',
  description: 'desc',
  lessonOrder: ['lesson-x', 'lesson-y'],
}

function start(): LearnerState {
  return emptyLearnerState('learner-1')
}

function localDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('ensureLesson', () => {
  it('creates in-progress lesson state with the lesson version', () => {
    const next = ensureLesson(start(), lesson)
    const progress = next.lessonProgress['lesson-x']
    expect(progress.status).toBe('in_progress')
    expect(progress.lessonVersion).toBe(3)
    expect(progress.currentStepId).toBe('intro')
  })

  it('does not overwrite existing progress', () => {
    const first = recordSequenceResult(start(), lesson, 'q1', true, ['right'])
    const again = ensureLesson(first, lesson)
    expect(again.lessonProgress['lesson-x'].completedStepIds).toContain('q1')
  })

  it('does not mutate the input state', () => {
    const state = start()
    ensureLesson(state, lesson)
    expect(state.lessonProgress['lesson-x']).toBeUndefined()
  })
})

describe('completeConcept', () => {
  it('marks the concept step complete', () => {
    const next = completeConcept(start(), lesson, 'intro')
    expect(next.lessonProgress['lesson-x'].completedStepIds).toContain('intro')
  })
})

describe('recordSequenceResult — correct answers', () => {
  it('marks the step solved, saves a portfolio artifact, and updates skills', () => {
    const next = recordSequenceResult(start(), lesson, 'q1', true, ['right'])
    expect(next.stepStats['q1'].solved).toBe(true)
    expect(next.skillStats['sequencing']).toEqual({ attempts: 1, correct: 1, struggles: 0 })
    expect(next.portfolio).toHaveLength(1)
    expect(next.portfolio[0]).toMatchObject({ lessonId: 'lesson-x', stepId: 'q1', commands: ['right'] })
    expect(next.streak.current).toBe(1)
    expect(next.streak.lastCompletedDate).toBe(localDate(0))
  })

  it('does not create a duplicate portfolio artifact when re-solving the same step', () => {
    let state = recordSequenceResult(start(), lesson, 'q1', true, ['right'])
    state = recordSequenceResult(state, lesson, 'q1', true, ['right'])
    expect(state.portfolio).toHaveLength(1)
  })

  it('completes the lesson once every step is solved', () => {
    let state = completeConcept(start(), lesson, 'intro')
    state = recordSequenceResult(state, lesson, 'q1', true, ['right'])
    expect(state.completedLessonIds).not.toContain('lesson-x')
    state = recordSequenceResult(state, lesson, 'q2', true, ['right'])
    expect(state.completedLessonIds).toContain('lesson-x')
    expect(state.lessonProgress['lesson-x'].status).toBe('completed')
    expect(state.lessonProgress['lesson-x'].completedAt).not.toBeNull()
  })
})

describe('recordSequenceResult — incorrect answers', () => {
  it('counts incorrect attempts and flags a struggle on the second miss', () => {
    let state = recordSequenceResult(start(), lesson, 'q1', false, ['right'])
    expect(state.stepStats['q1']).toEqual({ incorrect: 1, solved: false })
    expect(state.skillStats['sequencing'].struggles).toBe(0)

    state = recordSequenceResult(state, lesson, 'q1', false, ['right'])
    expect(state.stepStats['q1'].incorrect).toBe(2)
    expect(state.skillStats['sequencing'].struggles).toBe(1)
    expect(state.completedLessonIds).not.toContain('lesson-x')
  })

  it('still allows solving after misses (retry never blocks completion)', () => {
    let state = recordSequenceResult(start(), lesson, 'q1', false, ['right'])
    state = recordSequenceResult(state, lesson, 'q1', true, ['right'])
    expect(state.stepStats['q1'].solved).toBe(true)
    expect(state.skillStats['sequencing']).toMatchObject({ attempts: 2, correct: 1 })
  })
})

describe('streak', () => {
  it('does not increment twice on the same day', () => {
    let state = recordSequenceResult(start(), lesson, 'q1', true, ['right'])
    state = recordSequenceResult(state, lesson, 'q2', true, ['right'])
    expect(state.streak.current).toBe(1)
  })

  it('increments when the last completion was yesterday', () => {
    const state = start()
    state.streak = { current: 4, longest: 4, lastCompletedDate: localDate(-1) }
    const next = recordSequenceResult(state, lesson, 'q1', true, ['right'])
    expect(next.streak.current).toBe(5)
    expect(next.streak.longest).toBe(5)
  })

  it('resets to 1 when a day was skipped', () => {
    const state = start()
    state.streak = { current: 9, longest: 9, lastCompletedDate: localDate(-3) }
    const next = recordSequenceResult(state, lesson, 'q1', true, ['right'])
    expect(next.streak.current).toBe(1)
    expect(next.streak.longest).toBe(9)
  })
})

describe('selectors', () => {
  it('courseCompletionPercent reflects completed lessons', () => {
    const state = start()
    expect(courseCompletionPercent(state, course)).toBe(0)
    state.completedLessonIds = ['lesson-x']
    expect(courseCompletionPercent(state, course)).toBe(50)
  })

  it('nextRecommendedLessonId returns the first unfinished lesson', () => {
    const state = start()
    expect(nextRecommendedLessonId(state, course)).toBe('lesson-x')
    state.completedLessonIds = ['lesson-x']
    expect(nextRecommendedLessonId(state, course)).toBe('lesson-y')
    state.completedLessonIds = ['lesson-x', 'lesson-y']
    expect(nextRecommendedLessonId(state, course)).toBe('lesson-y')
  })

  it('masteryScore is correct/attempts as a percentage', () => {
    expect(masteryScore(undefined)).toBe(0)
    expect(masteryScore({ attempts: 0, correct: 0, struggles: 0 })).toBe(0)
    expect(masteryScore({ attempts: 4, correct: 3, struggles: 0 })).toBe(75)
  })

  it('resumeStepId points at the first unfinished step', () => {
    expect(resumeStepId(lesson, [])).toBe('intro')
    expect(resumeStepId(lesson, ['intro', 'q1'])).toBe('q2')
    expect(resumeStepId(lesson, ['intro', 'q1', 'q2'])).toBe('q2')
  })
})

describe('restartLesson', () => {
  it('resets lesson progress while keeping course completion', () => {
    let state = completeConcept(start(), lesson, 'intro')
    state = recordSequenceResult(state, lesson, 'q1', true, ['right'])
    state = recordSequenceResult(state, lesson, 'q2', true, ['right'])
    expect(state.completedLessonIds).toContain('lesson-x')

    const next = restartLesson(state, lesson)
    expect(next.lessonProgress['lesson-x'].completedStepIds).toEqual([])
    expect(next.lessonProgress['lesson-x'].currentStepId).toBe('intro')
    expect(next.lessonProgress['lesson-x'].savedPrograms).toEqual({})
    expect(next.completedLessonIds).toContain('lesson-x')
  })

  it('lessonHasProgress detects saved work', () => {
    let state = ensureLesson(start(), lesson)
    state = saveProgram(state, 'lesson-x', 'q1', ['right-0'])
    expect(lessonHasProgress(state, 'lesson-x')).toBe(true)
    expect(lessonHasProgress(start(), 'lesson-x')).toBe(false)
  })
})
