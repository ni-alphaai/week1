import { describe, it, expect } from 'vitest'
import { emptyLearnerState } from '../storage/types'
import { lessonMastery, lessonSuccessRate } from './mastery'

describe('lessonMastery', () => {
  it('returns null success rate with no attempts', () => {
    const state = emptyLearnerState('l1')
    expect(lessonMastery(state, ['seq']).successRate).toBeNull()
  })

  it('aggregates attempts and correct across a lesson\'s skills', () => {
    const state = emptyLearnerState('l1')
    state.skillStats = {
      seq: { attempts: 4, correct: 3, struggles: 0 },
      loops: { attempts: 6, correct: 3, struggles: 1 },
    }
    const m = lessonMastery(state, ['seq', 'loops'])
    expect(m.attempts).toBe(10)
    expect(m.correct).toBe(6)
    expect(m.successRate).toBeCloseTo(0.6)
    expect(lessonSuccessRate(state, ['seq', 'loops'])).toBeCloseTo(0.6)
  })

  it('ignores skills with no recorded stats', () => {
    const state = emptyLearnerState('l1')
    state.skillStats = { seq: { attempts: 2, correct: 2, struggles: 0 } }
    const m = lessonMastery(state, ['seq', 'never-attempted'])
    expect(m.attempts).toBe(2)
    expect(m.successRate).toBe(1)
  })
})
