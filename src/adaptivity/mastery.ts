// Per-skill mastery, computed from the attempt data the app already persists
// (LearnerState.skillStats, keyed on lesson.skillIds). This is plain
// deterministic arithmetic, so it works with AI off and needs no new storage.

import type { LearnerState, SkillStat } from '../storage/types'
import { listLessons } from '../content/registry'

const DAY_MS = 24 * 60 * 60 * 1000
// Half-life for success-rate decay, in days. After this many days without a
// correct answer, the decayed success rate halves.
const DECAY_HALF_LIFE_DAYS = 14
// A skill is due if its decayed rate drops below this, or it has been longer
// than this many days since the last correct answer.
const DUE_RATE_THRESHOLD = 0.7
const DUE_RECENCY_DAYS = 7
const DUE_CAP = 3

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

// Up to DUE_CAP skill ids that warrant a review: decayed rate below threshold,
// last correct answer older than the recency window, or seen-but-never-attempted
// skills. Ordered by lowest decayed success rate first.
export function dueSkills(state: LearnerState, now = Date.now()): string[] {
  type Candidate = { skillId: string; rate: number; attempts: number; lastCorrectAt: number | null; seen: boolean }
  const candidates = new Map<string, Candidate>()

  for (const [skillId, stat] of Object.entries(state.skillStats)) {
    candidates.set(skillId, {
      skillId,
      rate: decayedSuccessRate(stat, now),
      attempts: stat.attempts,
      lastCorrectAt: stat.lastCorrectAt ?? null,
      seen: stat.attempts > 0,
    })
  }

  // Skills the learner has seen (any stepStat for a step teaching them) but
  // that have no skillStat yet — i.e. encountered but not yet attempted.
  for (const lesson of listLessons()) {
    const hasStepStat = lesson.steps.some((s) => state.stepStats[s.id] != null)
    if (!hasStepStat) continue
    for (const skillId of lesson.skillIds) {
      if (candidates.has(skillId)) {
        candidates.get(skillId)!.seen = true
        continue
      }
      const stat = state.skillStats[skillId]
      candidates.set(skillId, {
        skillId,
        rate: decayedSuccessRate(stat, now),
        attempts: stat?.attempts ?? 0,
        lastCorrectAt: stat?.lastCorrectAt ?? null,
        seen: true,
      })
    }
  }

  const due: Candidate[] = []
  for (const c of candidates.values()) {
    const stale =
      c.lastCorrectAt != null && now - c.lastCorrectAt > DUE_RECENCY_DAYS * DAY_MS
    const seenButUnattempted = c.attempts === 0 && c.seen
    if (c.rate < DUE_RATE_THRESHOLD || stale || seenButUnattempted) {
      due.push(c)
    }
  }
  due.sort((a, b) => a.rate - b.rate)
  return due.slice(0, DUE_CAP).map((c) => c.skillId)
}
