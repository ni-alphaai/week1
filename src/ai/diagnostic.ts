// Deterministic, solution-agnostic diagnosis of a failed run.
//
// This is the grounding truth for the AI explanation: it reads the engine's
// RunResult (never the LLM) and classifies WHY the attempt failed. It does not
// reveal the solution and does not depend on any single canonical answer.

import type { MapConfig, SuccessRule, Instruction } from '../types'
import { isAction } from '../types'
import type { RunResult } from '../engine/map'
import { checkpointsVisitedInOrder, samePos } from '../engine/map'

export type FailureKind =
  | 'empty'
  | 'offMap'
  | 'crashed'
  | 'missedGoal'
  | 'loopStuck'
  | 'badAction'
  | 'tooManyMoves'
  | 'taskIncomplete'
  | 'checkpointMissed'
  | 'unknown'

export interface Diagnostic {
  kind: FailureKind
  /** Plain, factual, spoiler-free description of what happened. */
  summary: string
  /** Path index where the run stopped (or null). */
  failIndex: number | null
  /** Number of move cards (not actions) the run executed. */
  movesUsed: number
  /** Target move count for shortest-path puzzles, when relevant. */
  optimal?: number
  endedOnGoal: boolean
}

export interface DiagnosticInput {
  map: MapConfig
  successRule: SuccessRule
  optimal?: number
  instructions: Instruction[]
  run: RunResult
}

// Mirrors the priority order of checkProgram so the diagnostic always agrees
// with the authoritative checker about which failure to surface first.
export function buildDiagnostic(input: DiagnosticInput): Diagnostic {
  const { map, successRule, optimal, instructions, run } = input
  const movesUsed = run.executed.filter((step) => !isAction(step)).length
  const endedOnGoal = samePos(run.end, map.goal)

  const base = { failIndex: run.failIndex, movesUsed, optimal, endedOnGoal }

  if (instructions.length === 0) {
    return { ...base, kind: 'empty', summary: 'The program had no command cards in it.' }
  }

  if (run.status === 'badAction') {
    return {
      ...base,
      kind: 'badAction',
      summary: run.actionError ?? 'A pick-up or drop could not be done on that tile.',
    }
  }
  if (run.status === 'hitRock') {
    return { ...base, kind: 'crashed', summary: 'The explorer ran into a blocked tile (a rock or wall).' }
  }
  if (run.status === 'offMap') {
    return { ...base, kind: 'offMap', summary: 'The explorer walked off the edge of the map.' }
  }
  if (run.status === 'loopStuck') {
    return { ...base, kind: 'loopStuck', summary: 'A loop never stopped, so the program could not finish.' }
  }

  const tasks = map.tasks ?? []
  if (tasks.length > 0 && run.tasksCompleted < tasks.length) {
    return {
      ...base,
      kind: 'taskIncomplete',
      summary: run.carryingAtEnd
        ? 'The explorer was still carrying an item instead of dropping it at its delivery tile.'
        : 'A pick-up-and-deliver job was not finished before heading to the treasure.',
    }
  }

  const checkpoints = map.checkpoints ?? []
  if (checkpoints.length > 0 && checkpointsVisitedInOrder(run.path, checkpoints) < checkpoints.length) {
    return {
      ...base,
      kind: 'checkpointMissed',
      summary: 'A delivery stop was skipped or visited out of order.',
    }
  }

  if (run.status === 'missedGoal') {
    return { ...base, kind: 'missedGoal', summary: 'The explorer stopped, but not on the treasure.' }
  }

  if (successRule === 'shortestPath') {
    const target = optimal ?? movesUsed
    if (movesUsed > target) {
      return {
        ...base,
        kind: 'tooManyMoves',
        summary: `The explorer reached the treasure but used ${movesUsed} moves, more than the ${target} the puzzle asks for.`,
      }
    }
  }

  return { ...base, kind: 'unknown', summary: 'The attempt did not meet the puzzle goal.' }
}
