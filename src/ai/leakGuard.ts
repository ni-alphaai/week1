// Deterministic anti-leak guard.
//
// The solution IS included in the prompt (for richer hints), so we must verify
// the model's reply does not hand over the answer. A reply "leaks" if it:
//   - reproduces a contiguous run of the solution's moves long enough to give
//     the path away (3+ in order, or the whole solution when it is shorter), or
//   - spells out a run of same-direction moves with a count ("up three times").
// Naming one or two moves as a nudge ("after going up, try right") is allowed,
// so genuine explanations are not blocked.

import type { Step } from '../types'

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const
type Direction = (typeof DIRECTIONS)[number]

function isDirection(token: string): token is Direction {
  return (DIRECTIONS as readonly string[]).includes(token)
}

/** Pull the ordered direction words out of free text. */
export function extractDirections(text: string): Direction[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  const out: Direction[] = []
  for (const word of words) if (isDirection(word)) out.push(word)
  return out
}

// "three up", "3 left", "up three times", "right 2 moves" — a counted run of one
// direction is effectively dictating multiple moves.
const NUMBER_THEN_DIR = /\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:up|down|left|right)\b/
const DIR_THEN_NUMBER =
  /\b(?:up|down|left|right)\s+(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\s*(?:times|moves|steps|tiles|squares)?\b/

export function revealsAnswer(reply: string, solutionSteps: Step[]): boolean {
  const text = reply.toLowerCase()
  const solution: Direction[] = []
  for (const step of solutionSteps) if (isDirection(step as string)) solution.push(step as Direction)
  if (solution.length === 0) return false

  if (NUMBER_THEN_DIR.test(text) || DIR_THEN_NUMBER.test(text)) return true

  const said = extractDirections(text)
  // A contiguous run of solution moves this long (or the whole solution, if it
  // is shorter) gives the path away. One or two moves are allowed as a nudge.
  const window = Math.min(3, solution.length)
  for (let i = 0; i + window <= solution.length; i++) {
    if (containsContiguous(said, solution.slice(i, i + window))) return true
  }
  return false
}

function containsContiguous(haystack: Direction[], needle: Direction[]): boolean {
  for (let j = 0; j + needle.length <= haystack.length; j++) {
    let match = true
    for (let k = 0; k < needle.length; k++) {
      if (haystack[j + k] !== needle[k]) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}
