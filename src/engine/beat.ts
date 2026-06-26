// Deterministic engine for "Dodge the Beat" rhythm puzzles.
//
// The count ticks 0..count-1. `expectedActions` is the ground truth (the
// subject's logic) derived from the step's rules. `runBeatProgram` interprets
// the learner's program, emitting one action per beat. `checkBeatProgram`
// compares them and points at the first wrong beat. No AI: the engine is the
// sole authority on correctness, exactly like checkProgram for move puzzles.

import type { BeatAction, BeatStep, Instruction, Predicate } from '../types'
import { isBeatAction } from '../types'

// Beat puzzles only use the count-based predicates. Anything else is false.
function evalBeatPredicate(predicate: Predicate, beat: number): boolean {
  switch (predicate.sensor) {
    case 'counterEven':
      return beat % 2 === 0
    case 'counterOdd':
      return beat % 2 !== 0
    case 'counterMod':
      return beat % predicate.divisor === predicate.remainder
    default:
      return false
  }
}

// The required action on each beat, first matching rule wins.
export function expectedActions(step: BeatStep): BeatAction[] {
  const out: BeatAction[] = []
  for (let beat = 0; beat < step.count; beat++) {
    let action: BeatAction = step.defaultAction
    for (const rule of step.rules) {
      if (evalBeatPredicate(rule.predicate, beat)) {
        action = rule.action
        break
      }
    }
    out.push(action)
  }
  return out
}

const MAX_GUARD = 10000

// Interpret the program, emitting one action per beat. An action card consumes
// the current beat and advances the count. Loops/ifs use the count-based
// predicates. Execution stops once `count` beats have been emitted.
export function runBeatProgram(step: BeatStep, instructions: Instruction[]): BeatAction[] {
  const out: BeatAction[] = []

  function execList(list: Instruction[]): void {
    for (const inst of list) {
      if (out.length >= step.count) return
      if (typeof inst === 'string') {
        if (isBeatAction(inst)) out.push(inst)
        continue
      }
      if (inst.kind === 'loop') {
        for (let i = 0; i < inst.count; i++) {
          if (out.length >= step.count) return
          execList(inst.body)
        }
      } else if (inst.kind === 'conditional') {
        const branch = evalBeatPredicate(inst.predicate, out.length) ? inst.then : inst.else
        execList(branch)
      } else if (inst.kind === 'while') {
        let guard = 0
        while (
          out.length < step.count &&
          guard++ < MAX_GUARD &&
          evalBeatPredicate(inst.predicate, out.length)
        ) {
          const before = out.length
          execList(inst.body)
          if (out.length === before) break // no progress -> stop, avoid infinite loop
        }
      }
    }
  }

  execList(instructions)
  return out
}

export interface BeatCheckResult {
  correct: boolean
  /** Index of the first beat whose action is wrong, or null when correct. */
  firstWrongBeat: number | null
  expected: BeatAction[]
  got: BeatAction[]
}

export function checkBeatProgram(step: BeatStep, instructions: Instruction[]): BeatCheckResult {
  const expected = expectedActions(step)
  const got = runBeatProgram(step, instructions)

  let firstWrongBeat: number | null = null
  for (let i = 0; i < expected.length; i++) {
    if (got[i] !== expected[i]) {
      firstWrongBeat = i
      break
    }
  }
  // Emitted too many beats (extra actions) is also wrong.
  if (firstWrongBeat === null && got.length > expected.length) {
    firstWrongBeat = expected.length
  }

  const correct = firstWrongBeat === null && got.length === expected.length
  return { correct, firstWrongBeat, expected, got }
}
