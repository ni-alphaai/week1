// Per-skill mastery, computed from the attempt data the app already persists
// (LearnerState.skillStats, keyed on lesson.skillIds). This is plain
// deterministic arithmetic, so it works with AI off and needs no new storage.

import type { LearnerState } from '../storage/types'

export interface LessonMastery {
  attempts: number
  correct: number
  /** Fraction in [0,1], or null when there is no attempt data yet. */
  successRate: number | null
}

export function lessonMastery(state: LearnerState, skillIds: string[]): LessonMastery {
  let attempts = 0
  let correct = 0
  for (const id of skillIds) {
    const stat = state.skillStats[id]
    if (stat) {
      attempts += stat.attempts
      correct += stat.correct
    }
  }
  return { attempts, correct, successRate: attempts === 0 ? null : correct / attempts }
}

export function lessonSuccessRate(state: LearnerState, skillIds: string[]): number | null {
  return lessonMastery(state, skillIds).successRate
}
