import type { Instruction, MapConfig, StepFeedback, SuccessRule } from '../types'
import { isAction } from '../types'
import { checkpointsVisitedInOrder, runInstructions, samePos } from './map'
import type { RunResult } from './map'

export interface CheckResult {
  correct: boolean
  /** Mechanical outcome only on failure — no solution spoilers. */
  message: string
  run: RunResult
}

export interface ProgramSpec {
  map: MapConfig
  successRule: SuccessRule
  optimal?: number
  feedback: StepFeedback
  requiresConditional?: boolean
}

function containsConditional(instructions: Instruction[]): boolean {
  for (const inst of instructions) {
    if (typeof inst === 'object') {
      if (inst.kind === 'conditional') return true
      if (inst.kind === 'loop' && containsConditional(inst.body)) return true
      if (inst.kind === 'while' && containsConditional(inst.body)) return true
    }
  }
  return false
}

// Deterministic, hand-written answer checking for both plain sequences and
// conditional programs. No AI, no generated content.
export function checkProgram(spec: ProgramSpec, instructions: Instruction[]): CheckResult {
  if (instructions.length === 0) {
    return {
      correct: false,
      run: runInstructions(spec.map, []),
      message: 'Your program is empty — add some command cards first.',
    }
  }

  if (spec.requiresConditional && !containsConditional(instructions)) {
    return {
      correct: false,
      run: runInstructions(spec.map, []),
      message: 'Use an If block — that is the whole point of this puzzle!',
    }
  }

  const run = runInstructions(spec.map, instructions)

  if (run.status !== 'success' && run.status !== 'missedGoal') {
    let message = 'Your explorer crashed into a blocked tile.'
    if (run.status === 'offMap') message = 'That sent your explorer off the edge of the map.'
    else if (run.status === 'badAction') message = run.actionError ?? 'That action could not be done here.'
    else if (run.status === 'loopStuck')
      message = 'Your loop never stopped — check its condition so it can finish.'
    return { correct: false, run, message }
  }

  const tasks = spec.map.tasks ?? []
  if (tasks.length > 0 && run.tasksCompleted < tasks.length) {
    const label = tasks[run.tasksCompleted].label
    const which = label ? `“${label}”` : `job ${run.tasksCompleted + 1}`
    if (run.carryingAtEnd) {
      return {
        correct: false,
        run,
        message: `Your explorer is still carrying ${which}. Drop it at its drop-off tile.`,
      }
    }
    return {
      correct: false,
      run,
      message: `Pick up and deliver ${which} before heading to the treasure.`,
    }
  }

  const checkpoints = spec.map.checkpoints ?? []
  if (checkpoints.length > 0) {
    const delivered = checkpointsVisitedInOrder(run.path, checkpoints)
    if (delivered < checkpoints.length) {
      if (samePos(run.end, spec.map.goal)) {
        return {
          correct: false,
          run,
          message: `You reached the treasure but missed delivery stop ${delivered + 1}. Visit every checkpoint in order.`,
        }
      }
      return {
        correct: false,
        run,
        message: `You missed delivery stop ${delivered + 1}. Drop the package at each numbered stop, in order.`,
      }
    }
  }

  if (run.status === 'missedGoal') {
    return {
      correct: false,
      run,
      message: 'Your explorer stopped, but not on the treasure.',
    }
  }

  if (spec.successRule === 'shortestPath') {
    const moveCount = run.executed.filter((step) => !isAction(step)).length
    const optimal = spec.optimal ?? moveCount
    if (moveCount > optimal) {
      return {
        correct: false,
        run,
        message: 'You reached the treasure, but used more moves than you needed.',
      }
    }
  }

  return { correct: true, run, message: spec.feedback.correct }
}
