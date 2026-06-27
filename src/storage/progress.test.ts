import { describe, it, expect } from 'vitest'
import type { Course, Lesson } from '../types'
import { emptyLearnerState } from './types'
import type { LearnerState } from './types'
import { listLessons } from '../content/registry'
import {
  completeConcept,
  courseCompletionPercent,
  ensureLesson,
  masteryScore,
  masteryTier,
  lessonHasProgress,
  migrate,
  nextRecommendedLessonId,
  recordPracticeResult,
  recordReview,
  recordSequenceResult,
  restartLesson,
  resumeStepId,
  saveProgram,
  stuckSteps,
  tickTimers,
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
    expect(next.skillStats['sequencing']).toEqual({
      attempts: 1,
      correct: 1,
      struggles: 0,
      source: 'lesson',
      practiceAttempts: 0,
      practiceCorrect: 0,
      lastCorrectAt: expect.any(Number),
    })
    expect(next.portfolio).toHaveLength(1)
    expect(next.portfolio[0]).toMatchObject({ lessonId: 'lesson-x', stepId: 'q1', commands: ['right'] })
    expect(next.streak.current).toBe(1)
    expect(next.streak.lastCompletedDate).toBe(localDate(0))
    expect(next.stepStats['q1'].source).toBe('lesson')
    expect(next.stepStats['q1'].timeSpentMs).toBeGreaterThanOrEqual(0)
    expect(next.lessonProgress['lesson-x'].openedAt).toBeNull()
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
    expect(state.stepStats['q1']).toEqual({
      incorrect: 1,
      solved: false,
      source: 'lesson',
      timeSpentMs: expect.any(Number),
    })
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
    expect(
      masteryScore({
        attempts: 0,
        correct: 0,
        struggles: 0,
        source: 'lesson',
        practiceAttempts: 0,
        practiceCorrect: 0,
        lastCorrectAt: null,
      }),
    ).toBe(0)
    expect(
      masteryScore({
        attempts: 4,
        correct: 3,
        struggles: 0,
        source: 'lesson',
        practiceAttempts: 0,
        practiceCorrect: 0,
        lastCorrectAt: null,
      }),
    ).toBe(75)
  })

  it('resumeStepId points at the first unfinished step', () => {
    expect(resumeStepId(lesson, [])).toBe('intro')
    expect(resumeStepId(lesson, ['intro', 'q1'])).toBe('q2')
    expect(resumeStepId(lesson, ['intro', 'q1', 'q2'])).toBe('q2')
  })

  describe('masteryTier', () => {
    function mkStat(attempts: number, correct: number): Parameters<typeof masteryTier>[0] {
      return { attempts, correct, struggles: 0, source: 'lesson', practiceAttempts: 0, practiceCorrect: 0, lastCorrectAt: null }
    }
    it('returns Novice with no stat', () => {
      expect(masteryTier(undefined)).toBe('Novice')
    })
    it('returns Novice below 2 attempts', () => {
      expect(masteryTier(mkStat(1, 1))).toBe('Novice')
    })
    it('returns Apprentice at >=2 attempts but score >=80 — below the Skilled floor', () => {
      // 80% over 2 attempts should NOT qualify as Skilled (floor is now >=3 attempts)
      expect(masteryTier(mkStat(2, 2))).toBe('Apprentice')
    })
    it('returns Skilled at >=80% and exactly 3 attempts', () => {
      expect(masteryTier(mkStat(3, 3))).toBe('Skilled')
    })
    it('returns Apprentice at >=2 attempts but score <80', () => {
      expect(masteryTier(mkStat(3, 2))).toBe('Apprentice') // 66%
    })
    it('returns Master at >=90% and >=4 attempts', () => {
      expect(masteryTier(mkStat(4, 4))).toBe('Master')
    })
    it('returns Skilled (not Master) at >=80% and 3 attempts even if score is 90', () => {
      // 3 attempts is below the Master floor of 4
      expect(masteryTier(mkStat(3, 3))).toBe('Skilled')
    })
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

describe('recordPracticeResult', () => {
  it('updates skill + step stats without completing the lesson, portfolio, or streak', () => {
    const next = recordPracticeResult(start(), lesson, 'q1', true)
    expect(next.stepStats['q1'].solved).toBe(true)
    expect(next.stepStats['q1'].source).toBe('practice')
    expect(next.skillStats['sequencing']).toMatchObject({
      attempts: 1,
      correct: 1,
      practiceAttempts: 1,
      practiceCorrect: 1,
      struggles: 0,
    })
    expect(next.portfolio).toHaveLength(0)
    expect(next.streak.current).toBe(0)
    expect(next.completedLessonIds).not.toContain('lesson-x')
    expect(next.lessonProgress['lesson-x'].status).toBe('in_progress')
    expect(next.lessonProgress['lesson-x'].openedAt).toBeNull()
  })

  it('counts incorrect attempts and flags a struggle on the second miss', () => {
    let state = recordPracticeResult(start(), lesson, 'q1', false)
    expect(state.stepStats['q1'].incorrect).toBe(1)
    expect(state.skillStats['sequencing'].struggles).toBe(0)
    expect(state.stepStats['q1'].solved).toBe(false)

    state = recordPracticeResult(state, lesson, 'q1', false)
    expect(state.stepStats['q1'].incorrect).toBe(2)
    expect(state.skillStats['sequencing'].struggles).toBe(1)
  })

  it('accumulates timeSpentMs from openedAt, clamped to 10 minutes, and clears it on correct', () => {
    const base = ensureLesson(start(), lesson)
    base.lessonProgress['lesson-x'].openedAt = 1000
    const now = 1000 + 20 * 60 * 1000 // 20 minutes later -> clamp to 10 min
    const next = recordPracticeResult(base, lesson, 'q1', true, now)
    expect(next.stepStats['q1'].timeSpentMs).toBe(10 * 60 * 1000)
    expect(next.lessonProgress['lesson-x'].openedAt).toBeNull()
  })
})

describe('recordReview', () => {
  it('stamps lastReviewedAt for the reviewed skill', () => {
    const next = recordReview(start(), lesson, 'sequencing', 'q1', true, 12345)
    expect(next.review.lastReviewedAt['sequencing']).toBe(12345)
    expect(next.stepStats['q1'].source).toBe('practice')
  })
})

const NOW = 1_000_000_000_000

describe('recordReview box movement', () => {
  it('correct promotes the targeted skill box and stamps lastReviewedAt', () => {
    const s1 = recordReview(start(), lesson, 'sequencing', 'q1', true, NOW)
    const entry = s1.review.boxes['sequencing']
    expect(entry.box).toBe(2) // starts at box 1, promoted to 2
    expect(entry.lastReviewedAt).toBe(NOW)
  })

  it('wrong resets the targeted skill to box 1', () => {
    let state = start()
    state = recordReview(state, lesson, 'sequencing', 'q1', true, NOW)  // box 2
    state = recordReview(state, lesson, 'sequencing', 'q1', true, NOW)  // box 3
    state = recordReview(state, lesson, 'sequencing', 'q1', false, NOW) // wrong -> box 1
    expect(state.review.boxes['sequencing'].box).toBe(1)
  })

  it('only the targeted skill box moves, others are unaffected', () => {
    const next = recordReview(start(), lesson, 'sequencing', 'q1', true, NOW)
    expect(next.review.boxes['conditionals']).toBeUndefined()
  })

  it('correct review counts as an attempt in mastery stats', () => {
    let state = start()
    state = recordReview(state, lesson, 'sequencing', 'q1', true, NOW)
    state = recordReview(state, lesson, 'sequencing', 'q1', true, NOW)
    state = recordReview(state, lesson, 'sequencing', 'q1', true, NOW)
    expect(state.skillStats['sequencing'].attempts).toBe(3)
    expect(state.skillStats['sequencing'].correct).toBe(3)
  })
})

describe('migrate', () => {
  it('fills missing fields on an old state and is idempotent', () => {
    const legacy = {
      learnerId: 'l1',
      completedLessonIds: [],
      lessonProgress: {
        'lesson-x': {
          lessonId: 'lesson-x',
          lessonVersion: 1,
          status: 'in_progress',
          currentStepId: 'q1',
          completedStepIds: [],
          startedAt: 1,
          updatedAt: 1,
          completedAt: null,
          savedPrograms: {},
        },
      },
      skillStats: { seq: { attempts: 1, correct: 1, struggles: 0 } },
      stepStats: { q1: { incorrect: 0, solved: true } },
      streak: { current: 0, longest: 0, lastCompletedDate: null },
      portfolio: [],
      badges: [],
    } as unknown as LearnerState

    const next = migrate(legacy)
    expect(next.skillStats['seq'].source).toBe('lesson')
    expect(next.skillStats['seq'].practiceAttempts).toBe(0)
    expect(next.skillStats['seq'].practiceCorrect).toBe(0)
    expect(next.skillStats['seq'].lastCorrectAt).toBeNull()
    expect(next.stepStats['q1'].source).toBe('lesson')
    expect(next.stepStats['q1'].timeSpentMs).toBe(0)
    expect(next.lessonProgress['lesson-x'].openedAt).toBeNull()
    expect(next.review).toEqual({ lastReviewedAt: {}, lastDueDate: null, dueQueue: [], boxes: {} })
    expect(next.aiUsage).toEqual({
      explainRequested: 0,
      explainServed: 0,
      explainFallback: 0,
      explainLeakBlocked: 0,
      genServed: 0,
      genAbstained: 0,
    })
    expect(migrate(next)).toEqual(next)
  })

  it('does not mutate the input state', () => {
    const legacy = { ...emptyLearnerState('l1') } as unknown as LearnerState
    delete (legacy as Record<string, unknown>).review
    const before = JSON.stringify(legacy)
    migrate(legacy)
    expect(JSON.stringify(legacy)).toBe(before)
  })
})

describe('tickTimers', () => {
  it('accumulates elapsed time into the current step and keeps the timer live', () => {
    const base = ensureLesson(start(), lesson)
    base.lessonProgress['lesson-x'].currentStepId = 'q1'
    base.lessonProgress['lesson-x'].openedAt = 1000
    const next = tickTimers(base, 4000)
    expect(next.stepStats['q1'].timeSpentMs).toBe(3000)
    expect(next.lessonProgress['lesson-x'].openedAt).toBe(4000)
  })

  it('clamps accumulated time to 10 minutes', () => {
    const base = ensureLesson(start(), lesson)
    base.lessonProgress['lesson-x'].currentStepId = 'q1'
    base.lessonProgress['lesson-x'].openedAt = 0
    const next = tickTimers(base, 30 * 60 * 1000)
    expect(next.stepStats['q1'].timeSpentMs).toBe(10 * 60 * 1000)
  })

  it('leaves lessons with no running timer alone', () => {
    const base = ensureLesson(start(), lesson)
    base.lessonProgress['lesson-x'].openedAt = null
    const next = tickTimers(base, 9999)
    expect(next.lessonProgress['lesson-x'].openedAt).toBeNull()
  })
})

describe('stuckSteps', () => {
  const firstPlayableStepId = (): { lessonId: string; stepId: string } => {
    const target = listLessons()[0]
    const stepId = target.steps.find((s) => s.type !== 'concept')?.id
    if (!stepId) throw new Error('fixture lesson has no playable step')
    return { lessonId: target.id, stepId }
  }

  it('lists authored steps failed twice and unsolved', () => {
    const { lessonId, stepId } = firstPlayableStepId()
    const state = start()
    state.stepStats[stepId] = { incorrect: 3, solved: false, source: 'lesson', timeSpentMs: 100 }
    const out = stuckSteps(state)
    expect(out.find((s) => s.lessonId === lessonId && s.stepId === stepId)).toMatchObject({
      lessonId,
      stepId,
      incorrect: 3,
      timeSpentMs: 100,
    })
  })

  it('skips solved steps even if they have many incorrect attempts', () => {
    const { stepId } = firstPlayableStepId()
    const state = start()
    state.stepStats[stepId] = { incorrect: 5, solved: true, source: 'lesson', timeSpentMs: 0 }
    expect(stuckSteps(state).find((s) => s.stepId === stepId)).toBeUndefined()
  })
})
