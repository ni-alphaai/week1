import { describe, it, expect } from 'vitest'
import { emptyLearnerState } from '../storage/types'
import type { SkillStat } from '../storage/types'
import { decayedSuccessRate, dueSkills, lessonMastery, lessonSuccessRate } from './mastery'

const DAY = 24 * 60 * 60 * 1000

function stat(over: Partial<SkillStat>): SkillStat {
  return {
    attempts: 0,
    correct: 0,
    struggles: 0,
    source: 'lesson',
    practiceAttempts: 0,
    practiceCorrect: 0,
    lastCorrectAt: null,
    ...over,
  }
}

describe('lessonMastery', () => {
  it('returns null success rate with no attempts', () => {
    const state = emptyLearnerState('l1')
    expect(lessonMastery(state, ['seq']).successRate).toBeNull()
  })

  it('aggregates attempts and correct across a lesson\'s skills', () => {
    const state = emptyLearnerState('l1')
    state.skillStats = {
      seq: stat({ attempts: 4, correct: 3 }),
      loops: stat({ attempts: 6, correct: 3, struggles: 1 }),
    }
    const m = lessonMastery(state, ['seq', 'loops'])
    expect(m.attempts).toBe(10)
    expect(m.correct).toBe(6)
    expect(m.successRate).toBeCloseTo(0.6)
    expect(lessonSuccessRate(state, ['seq', 'loops'])).toBeCloseTo(0.6)
  })

  it('ignores skills with no recorded stats', () => {
    const state = emptyLearnerState('l1')
    state.skillStats = { seq: stat({ attempts: 2, correct: 2 }) }
    const m = lessonMastery(state, ['seq', 'never-attempted'])
    expect(m.attempts).toBe(2)
    expect(m.successRate).toBe(1)
  })
})

describe('decayedSuccessRate', () => {
  it('returns 0 when there is no stat or no attempts', () => {
    expect(decayedSuccessRate(undefined)).toBe(0)
    expect(decayedSuccessRate(stat({}))).toBe(0)
  })

  it('returns the raw rate when lastCorrectAt is null (no decay for legacy records)', () => {
    expect(decayedSuccessRate(stat({ attempts: 4, correct: 3 }))).toBeCloseTo(0.75)
  })

  it('halves the rate after one 14-day half-life', () => {
    const now = 10_000_000_000
    const s = stat({ attempts: 4, correct: 4, lastCorrectAt: now - 14 * DAY })
    expect(decayedSuccessRate(s, now)).toBeCloseTo(0.5)
  })

  it('decays further the longer the gap', () => {
    const now = 10_000_000_000
    const s = stat({ attempts: 4, correct: 4, lastCorrectAt: now - 28 * DAY })
    expect(decayedSuccessRate(s, now)).toBeCloseTo(0.25)
  })
})

describe('dueSkills', () => {
  it('caps at three results ordered by lowest decayed rate', () => {
    const now = 10_000_000_000
    const state = emptyLearnerState('l1')
    state.skillStats = {
      a: stat({ attempts: 4, correct: 1, lastCorrectAt: now }), // raw 0.25
      b: stat({ attempts: 4, correct: 2, lastCorrectAt: now }), // raw 0.5
      c: stat({ attempts: 4, correct: 3, lastCorrectAt: now }), // raw 0.75 — above 0.7, not due
      d: stat({ attempts: 4, correct: 0, lastCorrectAt: now }), // raw 0.0
    }
    const due = dueSkills(state, now)
    expect(due).toHaveLength(3)
    expect(due[0]).toBe('d') // lowest rate first
    expect(due).toContain('a')
    expect(due).toContain('b')
    expect(due).not.toContain('c')
  })

  it('marks a skill due when the last correct answer is older than 7 days', () => {
    const now = 10_000_000_000
    const state = emptyLearnerState('l1')
    state.skillStats = {
      fresh: stat({ attempts: 4, correct: 4, lastCorrectAt: now - DAY }),
      stale: stat({ attempts: 4, correct: 4, lastCorrectAt: now - 8 * DAY }),
    }
    const due = dueSkills(state, now)
    expect(due).toContain('stale')
    expect(due).not.toContain('fresh')
  })
})
