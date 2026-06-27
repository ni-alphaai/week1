// Per-skill mastery, computed from the attempt data the app already persists
// (LearnerState.skillStats, keyed on lesson.skillIds). This is plain
// deterministic arithmetic, so it works with AI off and needs no new storage.

import type { LearnerState, SkillStat } from '../storage/types'
import { isDue } from './leitner'
import type { Box } from './leitner'

const DAY_MS = 24 * 60 * 60 * 1000
// Half-life for success-rate decay, in days. After this many days without a
// correct answer, the decayed success rate halves.
const DECAY_HALF_LIFE_DAYS = 14

// Default cap on skills returned per dueSkills call.
const DUE_CAP = 5

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

// Success rate after exponential decay toward 0 since the last correct answer.
// A skill never answered correctly (lastCorrectAt null) does not decay — its
// raw rate is returned as-is. Returns 0 when there is no attempt data.
export function decayedSuccessRate(stat: SkillStat | undefined, now = Date.now()): number {
  if (!stat || stat.attempts === 0) return 0
  const raw = stat.correct / stat.attempts
  if (stat.lastCorrectAt == null) return raw
  const days = (now - stat.lastCorrectAt) / DAY_MS
  return raw * Math.pow(0.5, days / DECAY_HALF_LIFE_DAYS)
}

// Up to `cap` skill ids that are due for Leitner-scheduled review.
//
// Bootstrapping: we iterate the learner's *met skills* (Object.keys(state.skillStats))
// rather than Object.keys(state.review.boxes). A fresh learner who has completed
// lessons but never reviewed will have boxes === {} — if we iterated boxes, nothing
// would ever be due. By iterating skillStats we treat every met skill as box-1/
// never-reviewed when it has no box entry, so it is immediately due.
//
// Ordering: sort by lastReviewedAt ascending, never-reviewed (null → 0) first,
// so the session order is deterministic and testable.
// Note for future multi-item-per-skill: interleaving same-skill adjacency prevention
// would be added to this sort when box entries can contain multiple items.
export function dueSkills(state: LearnerState, now = Date.now(), cap = DUE_CAP): string[] {
  const boxes = state.review?.boxes ?? {}
  type Entry = { skillId: string; lastReviewedAt: number }
  const due: Entry[] = []

  for (const skillId of Object.keys(state.skillStats)) {
    const entry = boxes[skillId] ?? null
    const box: Box = entry?.box ?? 1
    const lastReviewedAt: number | null = entry?.lastReviewedAt ?? null
    if (isDue(box, lastReviewedAt, now)) {
      due.push({ skillId, lastReviewedAt: lastReviewedAt ?? 0 })
    }
  }

  // Soonest-due first: never-reviewed (lastReviewedAt=0) sorts before any real timestamp.
  due.sort((a, b) => a.lastReviewedAt - b.lastReviewedAt)
  return due.slice(0, cap).map((e) => e.skillId)
}
