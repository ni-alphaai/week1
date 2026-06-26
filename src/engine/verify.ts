// Puzzle validator built on the solver. A generated puzzle is only shown to a
// child if it passes every check here: solvable, hard enough to be non-trivial,
// inside the requested difficulty band, and solvable with the offered cards.

import type {
  Action,
  BlockKind,
  CardLimits,
  Command,
  Instruction,
  MapConfig,
  Predicate,
  PredicateOption,
  StepFeedback,
  SuccessRule,
} from '../types'
import { isAction } from '../types'
import { solvePlainMoves, solveWithinLimits } from './solver'
import { countCards, isCommand, withinCardLimits } from './cards'
import { checkProgram } from './checker'
import { runInstructions } from './map'
import {
  difficultyScore,
  analyzeBlocks,
  countObstacles,
  cardTightness,
  type DifficultyFeatures,
} from './difficulty'

export interface DifficultyBand {
  minMoves: number
  maxMoves: number
}

// A target the verifier gates generated puzzles against: the internal structural
// difficulty score must reach `targetLevel`, and any provided structural minimum
// must be met. Unmet → a 'tooEasy' rejection. Difficulty is internal only.
export interface DifficultyTarget {
  /** Minimum acceptable structural difficulty score (1..5). */
  targetLevel: number
  /** Require max(rows, cols) ≥ this. */
  minGridSpan?: number
  /** Require a block nested at least two deep (e.g. an If inside a Repeat). */
  requireNesting?: boolean
  /** Require a conditional with a non-empty else branch. */
  requireBranch?: boolean
}

// Push 'tooEasy' onto `reasons` when the features miss the difficulty target
// (below the level score, or any required structural minimum unmet). Shared by
// navigation and concept validation so the gate behaves identically for both.
function gateDifficulty<R extends string>(
  features: DifficultyFeatures,
  target: DifficultyTarget,
  reasons: R[],
  tooEasy: R,
): void {
  const minimumsUnmet =
    (target.minGridSpan !== undefined && features.gridSpan < target.minGridSpan) ||
    (target.requireNesting === true && features.nestingDepth < 2) ||
    (target.requireBranch === true && !features.hasBranch)
  if (difficultyScore(features) < target.targetLevel || minimumsUnmet) {
    reasons.push(tooEasy)
  }
}

export interface ValidateOptions {
  availableCommands: Command[]
  band?: DifficultyBand
  /** Reject puzzles whose optimal is below this (too trivial). Default 2. */
  minMoves?: number
  /** Optional difficulty gate; when set, under-target puzzles are rejected. */
  difficulty?: DifficultyTarget
}

export type ValidationReason =
  | 'unsolvable'
  | 'trivial'
  | 'outOfBand'
  | 'paletteViolation'
  | 'tooEasy'

export interface PuzzleValidation {
  ok: boolean
  reasons: ValidationReason[]
  optimalMoves: number | null
  solution: Command[] | null
}

export function validatePuzzle(map: MapConfig, opts: ValidateOptions): PuzzleValidation {
  const solve = solvePlainMoves(map)
  if (!solve.solvable || solve.optimalMoves === null || solve.solution === null) {
    return { ok: false, reasons: ['unsolvable'], optimalMoves: null, solution: null }
  }

  const reasons: ValidationReason[] = []
  const optimal = solve.optimalMoves
  const minMoves = opts.minMoves ?? 2
  if (optimal < minMoves) reasons.push('trivial')
  if (opts.band && (optimal < opts.band.minMoves || optimal > opts.band.maxMoves)) {
    reasons.push('outOfBand')
  }
  const allowed = new Set<Command>(opts.availableCommands)
  if (solve.solution.some((cmd) => !allowed.has(cmd))) reasons.push('paletteViolation')

  // Navigation solutions are plain moves, so their features come straight from
  // the solver's path and the map (no card limits constrain a nav palette).
  if (opts.difficulty) {
    const features: DifficultyFeatures = {
      moves: solve.solution.length,
      blocks: 0,
      nestingDepth: 0,
      hasBranch: false,
      obstacles: countObstacles(map),
      gridSpan: Math.max(map.rows, map.cols),
      cardTightness: 0,
    }
    gateDifficulty(features, opts.difficulty, reasons, 'tooEasy')
  }

  return { ok: reasons.length === 0, reasons, optimalMoves: optimal, solution: solve.solution }
}

// ---------------------------------------------------------------------------
// Loop-concept verification ("verify, don't trust").
//
// A generated loop puzzle ships its own solution program. The engine is the
// sole authority: it replays the solution to confirm it wins, confirms the
// solution only uses the offered cards within the offered limits, proves a
// flat move-only program would NOT fit those limits (so a loop is forced),
// confirms a loop is actually present, and checks the executed move count lands
// in the requested difficulty band. Any failing reason discards the candidate.

export interface LoopPuzzleCandidate {
  map: MapConfig
  availableCommands: Command[]
  availableActions?: Action[]
  blocks: BlockKind[]
  predicateOptions: PredicateOption[]
  cardLimits: CardLimits
  solution: Instruction[]
}

export interface LoopValidateOptions {
  band: DifficultyBand
  successRule?: SuccessRule
  feedback?: StepFeedback
  /** Optional difficulty gate; when set, under-target puzzles are rejected. */
  difficulty?: DifficultyTarget
}

// Which block concept a puzzle is meant to teach. Drives the "concept present"
// check and whether forcing is proven strictly (loops/while) or left soft
// (conditionals — a static map always has a flat path, so a branch can never be
// *proven* required by the move-only solver).
export type Concept = 'loops' | 'while' | 'conditionals'

export interface ConceptValidateOptions extends LoopValidateOptions {
  concept: Concept
}

export type LoopValidationReason =
  | 'empty'
  | 'losing'
  | 'paletteViolation'
  | 'cardLimitViolation'
  | 'notForced'
  | 'noLoop'
  | 'noWhile'
  | 'noConditional'
  | 'outOfBand'
  | 'tooEasy'

export interface LoopPuzzleValidation {
  ok: boolean
  reasons: LoopValidationReason[]
  /** Executed (resolved) move count of the solution, or null if it never ran. */
  optimalMoves: number | null
}

const DEFAULT_LOOP_FEEDBACK: StepFeedback = {
  correct: 'You did it!',
  hints: ['Look for the part of the path that repeats.'],
}

function predicateKey(p: Predicate): string {
  return JSON.stringify(p)
}

// Walk the (nested) solution, recording which cards, blocks and predicates it
// actually relies on, so we can confirm they were all offered to the learner.
interface UsageReport {
  commands: Set<Command>
  actions: Set<Action>
  blocks: Set<BlockKind>
  predicates: Set<string>
}

function collectUsage(instructions: Instruction[], report: UsageReport): void {
  for (const inst of instructions) {
    if (typeof inst === 'string') {
      if (isCommand(inst)) report.commands.add(inst)
      else if (isAction(inst)) report.actions.add(inst)
      continue
    }
    if (inst.kind === 'loop') {
      report.blocks.add('loop')
      collectUsage(inst.body, report)
    } else if (inst.kind === 'while') {
      report.blocks.add('while')
      report.predicates.add(predicateKey(inst.predicate))
      collectUsage(inst.body, report)
    } else {
      report.blocks.add('if')
      report.predicates.add(predicateKey(inst.predicate))
      collectUsage(inst.then, report)
      collectUsage(inst.else, report)
    }
  }
}

// The container block each concept must demonstrate, and the rejection reason
// emitted when it is absent from the verified solution.
const REQUIRED_BLOCK: Record<Concept, BlockKind> = {
  loops: 'loop',
  while: 'while',
  conditionals: 'if',
}
const MISSING_BLOCK_REASON: Record<BlockKind, LoopValidationReason> = {
  loop: 'noLoop',
  while: 'noWhile',
  if: 'noConditional',
}

// Generalized concept verification. A generated puzzle ships its own solution
// program; the engine is the sole authority. It replays the solution to confirm
// it wins, confirms it only uses offered cards/blocks/predicates within limits,
// confirms the concept's required block is present, and checks the executed move
// count lands in the requested band. Forcing (no flat move-only program fits the
// limits) is proven STRICTLY for 'loops'/'while'; for 'conditionals' it is SOFT
// (a static map always has a flat path, so branching can never be *proven*
// required — we only require the conditional present, legal, and in-band).
export function validateConceptPuzzle(
  puzzle: LoopPuzzleCandidate,
  opts: ConceptValidateOptions,
): LoopPuzzleValidation {
  const reasons: LoopValidationReason[] = []

  if (puzzle.solution.length === 0) {
    return { ok: false, reasons: ['empty'], optimalMoves: null }
  }

  const successRule = opts.successRule ?? 'reachGoal'
  const feedback = opts.feedback ?? DEFAULT_LOOP_FEEDBACK

  // (a) The solution must actually win when replayed by the real interpreter.
  const run = runInstructions(puzzle.map, puzzle.solution)
  const moveCount = run.executed.filter((step) => !isAction(step)).length
  const check = checkProgram(
    { map: puzzle.map, successRule, optimal: moveCount, feedback },
    puzzle.solution,
  )
  if (!check.correct) reasons.push('losing')

  // (b) The solution may only use offered cards/blocks/predicates...
  const usage: UsageReport = {
    commands: new Set(),
    actions: new Set(),
    blocks: new Set(),
    predicates: new Set(),
  }
  collectUsage(puzzle.solution, usage)

  const offeredCommands = new Set<Command>(puzzle.availableCommands)
  const offeredActions = new Set<Action>(puzzle.availableActions ?? [])
  const offeredBlocks = new Set<BlockKind>(puzzle.blocks)
  const offeredPredicates = new Set<string>(
    puzzle.predicateOptions.map((opt) => predicateKey(opt.predicate)),
  )

  const paletteOk =
    [...usage.commands].every((c) => offeredCommands.has(c)) &&
    [...usage.actions].every((a) => offeredActions.has(a)) &&
    [...usage.blocks].every((b) => offeredBlocks.has(b)) &&
    [...usage.predicates].every((p) => offeredPredicates.has(p))
  if (!paletteOk) reasons.push('paletteViolation')

  // ...and stay within the per-card placement limits the editor enforces.
  if (!withinCardLimits(countCards(puzzle.solution), puzzle.cardLimits)) {
    reasons.push('cardLimitViolation')
  }

  // (c) For loops/while the concept block must be genuinely required: no flat
  // move-only program may fit the offered card limits. If one does, the block is
  // decorative — reject. Conditionals skip this (forcing isn't provable for a
  // branch on a static map).
  const strictForcing = opts.concept !== 'conditionals'
  if (strictForcing && solveWithinLimits(puzzle.map, puzzle.cardLimits)) {
    reasons.push('notForced')
  }

  // (d) The solution must actually contain the concept's required block.
  const requiredBlock = REQUIRED_BLOCK[opts.concept]
  if (!usage.blocks.has(requiredBlock)) {
    reasons.push(MISSING_BLOCK_REASON[requiredBlock])
  }

  // (e) The executed move count must land inside the requested band.
  const optimalMoves = check.correct ? moveCount : null
  if (moveCount < opts.band.minMoves || moveCount > opts.band.maxMoves) {
    reasons.push('outOfBand')
  }

  // (f) The puzzle must be structurally complex enough for its target level.
  if (opts.difficulty) {
    const shape = analyzeBlocks(puzzle.solution)
    const features: DifficultyFeatures = {
      moves: moveCount,
      blocks: shape.blocks,
      nestingDepth: shape.nestingDepth,
      hasBranch: shape.hasBranch,
      obstacles: countObstacles(puzzle.map),
      gridSpan: Math.max(puzzle.map.rows, puzzle.map.cols),
      cardTightness: cardTightness(puzzle.solution, puzzle.cardLimits),
    }
    gateDifficulty(features, opts.difficulty, reasons, 'tooEasy')
  }

  return { ok: reasons.length === 0, reasons, optimalMoves }
}

// Thin wrapper preserving the original loop-only entry point so existing callers
// and tests keep working.
export function validateLoopPuzzle(
  puzzle: LoopPuzzleCandidate,
  opts: LoopValidateOptions,
): LoopPuzzleValidation {
  return validateConceptPuzzle(puzzle, { ...opts, concept: 'loops' })
}
