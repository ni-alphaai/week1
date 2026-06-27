import { describe, it, expect } from 'vitest'
import { emptyLearnerState } from '../storage/types'
import type { SkillStat } from '../storage/types'
import type { Box } from './leitner'
import { belowSkilled, decayedSuccessRate, dueSkills, lessonMastery, lessonSuccessRate } from './mastery'

const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY

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

// Helper: build a minimal LearnerState with given skillStats and review.boxes.
function stateWith(
  skillStatKeys: string[],
  boxes: Record<string, { box: Box; lastReviewedAt: number }> = {},
) {
  const state = emptyLearnerState('l1')
  for (const k of skillStatKeys) {
    state.skillStats[k] = stat({ attempts: 2, correct: 1 })
  }
  state.review.boxes = boxes
  return state
}

describe('dueSkills (Leitner)', () => {
  it('bootstrapping: met skills with no box entry are immediately due', () => {
    // The critical bootstrapping case: learner completed a lesson (skillStats populated)
    // but has never reviewed (boxes === {}). dueSkills must NOT return [].
    const state = stateWith(['loops', 'conditionals'])
    const due = dueSkills(state, NOW)
    expect(due).toContain('loops')
    expect(due).toContain('conditionals')
  })

  it('selects only skills whose box interval has elapsed', () => {
    // loops: box 1 (interval 1 day), last reviewed 2 days ago → due
    // conditionals: box 5 (interval 14 days), last reviewed 1 day ago → not due
    const state = stateWith(['loops', 'conditionals'], {
      loops: { box: 1, lastReviewedAt: NOW - 2 * DAY },
      conditionals: { box: 5, lastReviewedAt: NOW - 1 * DAY },
    })
    const due = dueSkills(state, NOW)
    expect(due).toEqual(['loops'])
  })

  it('caps results at the default 5, sorted by lastReviewedAt ascending', () => {
    // 6 met skills, all in box 1 with lastReviewedAt 0 (never reviewed) → all due,
    // but only 5 are returned. Since lastReviewedAt is identical (0), order among
    // them is undefined; we just assert length === 5.
    const state = stateWith(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(dueSkills(state, NOW)).toHaveLength(5)
  })

  it('honors the cap parameter', () => {
    const state = stateWith(['a', 'b', 'c'])
    expect(dueSkills(state, NOW, 2)).toHaveLength(2)
  })

  it('never-reviewed skills sort before recently-reviewed ones', () => {
    // 'never' has no box entry; 'recent' was reviewed just now (box 1, not yet due)
    // 'old' was reviewed 2 days ago (box 1, due)
    const state = stateWith(['never', 'old', 'recent'], {
      recent: { box: 1, lastReviewedAt: NOW },         // not due
      old: { box: 1, lastReviewedAt: NOW - 2 * DAY }, // due
      // 'never' has no entry → defaults to box 1 / null → due
    })
    const due = dueSkills(state, NOW)
    expect(due).toContain('never')
    expect(due).toContain('old')
    expect(due).not.toContain('recent')
    // never-reviewed sorts before old (null → 0 < any real timestamp)
    expect(due.indexOf('never')).toBeLessThan(due.indexOf('old'))
  })

  it('skills not in skillStats are never returned even if they are in boxes', () => {
    // boxes may have entries for skills the learner has never met; they must not appear
    const state = stateWith(['met'], {
      met: { box: 1, lastReviewedAt: NOW - 2 * DAY },
      unmet: { box: 1, lastReviewedAt: NOW - 2 * DAY },
    })
    const due = dueSkills(state, NOW)
    expect(due).toContain('met')
    expect(due).not.toContain('unmet')
  })
})

// belowSkilled: lesson-1-sequencing-cargo has skillIds ['sequencing', 'planning']
// Build a state with those skills at a given score and attempt count.
function stateAt(scorePercent: number, attempts: number) {
  const state = emptyLearnerState('l1')
  // correct = ceil(scorePercent * attempts / 100) so the achieved rate is >= scorePercent
  const correct = Math.ceil((scorePercent * attempts) / 100)
  const skillStat: SkillStat = {
    attempts,
    correct,
    struggles: 0,
    source: 'lesson',
    practiceAttempts: 0,
    practiceCorrect: 0,
    lastCorrectAt: null,
  }
  state.skillStats['sequencing'] = { ...skillStat }
  state.skillStats['planning'] = { ...skillStat }
  return state
}

describe('belowSkilled (Soft Gate predicate)', () => {
  it('is true at 80%/2 attempts — below the >=3 floor for Skilled', () => {
    expect(belowSkilled(stateAt(80, 2), 'lesson-1-sequencing-cargo')).toBe(true)
  })

  it('is false at 80%/3 attempts — exactly at Skilled', () => {
    expect(belowSkilled(stateAt(80, 3), 'lesson-1-sequencing-cargo')).toBe(false)
  })

  it('is true at 60%/5 attempts — score too low for Skilled', () => {
    expect(belowSkilled(stateAt(60, 5), 'lesson-1-sequencing-cargo')).toBe(true)
  })

  it('is true when a learner has no attempts yet', () => {
    const state = emptyLearnerState('l1')
    expect(belowSkilled(state, 'lesson-1-sequencing-cargo')).toBe(true)
  })

  it('is false when all skills are at Master tier', () => {
    expect(belowSkilled(stateAt(90, 4), 'lesson-1-sequencing-cargo')).toBe(false)
  })

  it('is false for an unknown lesson id (no skillIds)', () => {
    expect(belowSkilled(stateAt(80, 2), 'nonexistent-lesson')).toBe(false)
  })
})
