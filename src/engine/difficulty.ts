// Internal structural difficulty score for puzzles (1..5). This is NEVER shown
// to a learner; it is the lever the generator gates on so AI practice puzzles
// match the STRUCTURAL complexity of authored "level 4" content rather than
// merely being longer. The score reads a handful of structural features of a
// solved puzzle and adds tuned weights, then clamps to 1..5.
//
// `difficultyScore` is deliberately pure and dependency-light: it scores a
// precomputed `DifficultyFeatures` value and never re-runs the interpreter. The
// extraction helpers below (which DO touch the engine) turn a (map, solution,
// cardLimits) triple into those features by replaying the solution once.

import type { CardLimits, Instruction, MapConfig } from '../types'
import { isAction } from '../types'
import { runInstructions } from './map'
import { countCards } from './cards'

// The structural features the score is computed from. All are derivable from a
// solved puzzle; see `extractFeatures` for how each is measured.
export interface DifficultyFeatures {
  /** Executed (resolved) move count of the solution — loop/while bodies count per run. */
  moves: number
  /** Count of loop/while/if nodes anywhere in the solution. */
  blocks: number
  /** Deepest block nesting (a loop containing an if is depth 2). */
  nestingDepth: number
  /** True when the solution contains an if/conditional with a non-empty else. */
  hasBranch: boolean
  /** Rocks plus special terrain tiles (ice/gates/doors/teleports/bridge). */
  obstacles: number
  /** max(rows, cols) of the grid. */
  gridSpan: number
  /** Ratio (0..1) of limited-card placements used to placements allotted; 0 if unlimited. */
  cardTightness: number
}

// Tuned additive weights. Calibrated against authored content so that:
//   l1-q1 (nav, 6 moves, 3 rocks, 4x4)            -> 3.5  (band 3..4)
//   l3-q1 (1 loop, 5 moves, 0 rocks, 1x6)         -> 3.0  (band 2..3)
//   l3-q3 (1 loop body [up,right]x4, 8 moves, 5x5)-> 4.25 (band 4..5)
//   l4-q2 (2 whiles, 10 moves, 6x6)               -> 5    (band 4..5)
//   l5-q1 (loop-with-if nested, 2 rocks, 2x9)     -> 5
// The moves bands are intentionally well separated (4-6 vs 7-9) because for the
// single-loop calibration puzzles the executed move count is the only feature
// that distinguishes a level-2 loop from a level-4 one.
export function difficultyScore(input: DifficultyFeatures): number {
  let score = 1

  if (input.moves >= 10) score += 2.25
  else if (input.moves >= 7) score += 1.75
  else if (input.moves >= 4) score += 0.5

  if (input.blocks >= 3) score += 2.0
  else if (input.blocks === 2) score += 1.5
  else if (input.blocks === 1) score += 0.5

  if (input.nestingDepth >= 2) score += 1.0
  if (input.hasBranch) score += 0.75

  if (input.obstacles >= 3) score += 2.0
  else if (input.obstacles >= 1) score += 0.5

  if (input.gridSpan >= 5) score += 0.5
  if (input.cardTightness >= 0.8) score += 0.5

  return Math.max(1, Math.min(5, score))
}

// Structural shape of a (possibly nested) solution: how many blocks it places,
// how deeply they nest, and whether any conditional has a real else branch.
export interface BlockShape {
  blocks: number
  nestingDepth: number
  hasBranch: boolean
}

// Walk the solution once, tallying block count, max nesting depth, and whether
// any conditional branches (non-empty else). Exported so the verifier can reuse
// it without duplicating tree-walking logic.
export function analyzeBlocks(instructions: Instruction[]): BlockShape {
  let blocks = 0
  let nestingDepth = 0
  let hasBranch = false

  const walk = (list: Instruction[], depth: number): void => {
    for (const inst of list) {
      if (typeof inst === 'string') continue
      blocks += 1
      const childDepth = depth + 1
      if (childDepth > nestingDepth) nestingDepth = childDepth
      if (inst.kind === 'loop' || inst.kind === 'while') {
        walk(inst.body, childDepth)
      } else {
        if (inst.else.length > 0) hasBranch = true
        walk(inst.then, childDepth)
        walk(inst.else, childDepth)
      }
    }
  }

  walk(instructions, 0)
  return { blocks, nestingDepth, hasBranch }
}

// Count impassable rocks plus special terrain features that raise difficulty.
export function countObstacles(map: MapConfig): number {
  return (
    (map.obstacles?.length ?? 0) +
    (map.ice?.length ?? 0) +
    (map.gates?.length ?? 0) +
    (map.doors?.length ?? 0) +
    (map.teleports?.length ?? 0) +
    (map.bridge ? 1 : 0)
  )
}

// How tightly the solution uses the cards it is allowed. Only LIMITED cards
// (those present in `cardLimits`) count toward both the used and allotted
// totals; an unbounded palette yields 0 (no pressure). Result is clamped 0..1.
export function cardTightness(solution: Instruction[], cardLimits?: CardLimits): number {
  if (!cardLimits) return 0
  const keys = Object.keys(cardLimits) as (keyof CardLimits)[]
  if (keys.length === 0) return 0
  const counts = countCards(solution)
  let allotted = 0
  let used = 0
  for (const key of keys) {
    const cap = cardLimits[key]
    if (cap === undefined) continue
    allotted += cap
    used += counts[key] ?? 0
  }
  if (allotted <= 0) return 0
  return Math.min(1, used / allotted)
}

// Turn a solved puzzle into its difficulty features. Replays the solution once
// (via the real interpreter) to count executed moves, then reads the rest of
// the structural features straight off the map and solution tree.
export function extractFeatures(
  map: MapConfig,
  solution: Instruction[],
  cardLimits?: CardLimits,
): DifficultyFeatures {
  const run = runInstructions(map, solution)
  const moves = run.executed.filter((step) => !isAction(step)).length
  const shape = analyzeBlocks(solution)
  return {
    moves,
    blocks: shape.blocks,
    nestingDepth: shape.nestingDepth,
    hasBranch: shape.hasBranch,
    obstacles: countObstacles(map),
    gridSpan: Math.max(map.rows, map.cols),
    cardTightness: cardTightness(solution, cardLimits),
  }
}

// Convenience: score a solved puzzle directly.
export function scoreFor(
  map: MapConfig,
  solution: Instruction[],
  cardLimits?: CardLimits,
): number {
  return difficultyScore(extractFeatures(map, solution, cardLimits))
}
