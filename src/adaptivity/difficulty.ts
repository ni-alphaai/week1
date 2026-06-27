// Adaptive difficulty: keep the learner succeeding around the ~80% sweet spot
// (Bloom mastery / ZPD). Pure decision logic over a success rate; the actual
// serving is gated by the adaptive flag, so with AI off the lesson order and
// difficulty are unchanged (every decision is "same").

import { aiAdaptiveOn } from '../ai/config'
import type { DifficultyBand } from '../engine/verify'

// Target success band. Above -> make it harder; below -> make it easier.
const SUCCESS_BAND = { low: 0.7, high: 0.85 }

export type DifficultyDirection = 'easier' | 'same' | 'harder'

// Move-count bands the practice generator aims for, per direction.
const PRACTICE_BANDS: Record<DifficultyDirection, DifficultyBand> = {
  easier: { minMoves: 2, maxMoves: 4 },
  same: { minMoves: 4, maxMoves: 6 },
  harder: { minMoves: 6, maxMoves: 9 },
}

export function bandForDirection(direction: DifficultyDirection): DifficultyBand {
  return PRACTICE_BANDS[direction]
}

// Internal target difficulty level (1..5) the practice generator aims for, per
// direction. This is now the primary difficulty lever: generation builds a
// per-concept complexity profile from the target level and gates on an internal
// difficulty score. Level 4 ("same") matches authored content; "easier" and
// "harder" nudge one level down/up. Never shown to the learner.
export const TARGET_LEVELS: Record<DifficultyDirection, number> = {
  easier: 3,
  same: 4,
  harder: 5,
}

export function targetLevelForDirection(direction: DifficultyDirection): number {
  return TARGET_LEVELS[direction]
}

export function recommendDirection(successRate: number | null): DifficultyDirection {
  if (successRate === null) return 'same'
  if (successRate > SUCCESS_BAND.high) return 'harder'
  if (successRate < SUCCESS_BAND.low) return 'easier'
  return 'same'
}

// Flag-gated entry point used by the app. With adaptive off, always "same" so
// the MVP's fixed progression is preserved.
export function nextDifficultyDirection(successRate: number | null): DifficultyDirection {
  if (!aiAdaptiveOn()) return 'same'
  return recommendDirection(successRate)
}

// Pick the closest puzzle in the requested direction from a difficulty-tagged
// pool (e.g. solver `optimal` move counts). Returns null when nothing fits, so
// the caller keeps the current puzzle.
export function pickByDifficulty<T extends { optimal: number }>(
  pool: T[],
  currentOptimal: number,
  direction: DifficultyDirection,
): T | null {
  if (direction === 'same' || pool.length === 0) return null
  const harder = direction === 'harder'
  const candidates = pool.filter((p) =>
    harder ? p.optimal > currentOptimal : p.optimal < currentOptimal,
  )
  if (candidates.length === 0) return null
  candidates.sort(
    (a, b) => Math.abs(a.optimal - currentOptimal) - Math.abs(b.optimal - currentOptimal),
  )
  return candidates[0]
}
