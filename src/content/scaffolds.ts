import type { Conditional, Loop, Predicate, While } from '../types'

/**
 * Locked editor scaffolds for lesson puzzles.
 *
 * When a simpler wrong pattern exists (two While loops, a flat Repeat, etc.),
 * pin the *correct* outer structure in `initialProgram` and leave inner branches
 * empty so the learner must combine the intended blocks.
 *
 * Scaffolds are locked by default (`editableInitial` unset); set
 * `editableInitial: true` only for debug puzzles where the learner edits a
 * broken program in place.
 */

export function emptyConditional(predicate: Predicate, label: string): Conditional {
  return { kind: 'conditional', predicate, then: [], else: [], label }
}

export function emptyWhile(predicate: Predicate, label: string): While {
  return { kind: 'while', predicate, body: [], label }
}

/** Locked Repeat block with an empty If inside — learner fills branches + count. */
export function loopWithEmptyIf(
  count: number,
  predicate: Predicate,
  label: string,
): Loop {
  return {
    kind: 'loop',
    count,
    body: [emptyConditional(predicate, label)],
    label: `Repeat ${count}×`,
  }
}

/** Locked While with an empty If inside — blocks the "two While loops" workaround. */
export function whileWithEmptyIf(
  whilePredicate: Predicate,
  whileLabel: string,
  ifPredicate: Predicate,
  ifLabel: string,
): While {
  return {
    kind: 'while',
    predicate: whilePredicate,
    body: [emptyConditional(ifPredicate, ifLabel)],
    label: whileLabel,
  }
}
