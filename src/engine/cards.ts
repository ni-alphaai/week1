// Counts the cards a program *places*, matching exactly how `CommandSequence`
// enforces `cardLimits` in the editor. The verifier and the editor must agree:
// a puzzle that the solver accepts as legal under its limits must also be
// buildable in the UI, and vice versa.
//
// Placements, NOT executions: a `Repeat 6×` containing one Right card counts as
// one `loop` card plus one `right` card — never six. Containers count their own
// card (`loop` / `while` / `if`) and recurse into their bodies/branches, mirror-
// ing `countUsage` in CommandSequence which tallies each placed node once.

import type { CardLimits, Command, Instruction } from '../types'

const COMMANDS: readonly Command[] = ['up', 'down', 'left', 'right']

export function isCommand(step: string): step is Command {
  return (COMMANDS as readonly string[]).includes(step)
}

function tally(instructions: Instruction[], counts: CardLimits): void {
  for (const inst of instructions) {
    if (typeof inst === 'string') {
      // Plain moves count under their command key; action cards under their own.
      const key = inst
      counts[key] = (counts[key] ?? 0) + 1
      continue
    }
    if (inst.kind === 'loop') {
      counts.loop = (counts.loop ?? 0) + 1
      tally(inst.body, counts)
    } else if (inst.kind === 'while') {
      counts.while = (counts.while ?? 0) + 1
      tally(inst.body, counts)
    } else {
      // conditional → the palette/limit key for an If/else block is 'if'.
      counts.if = (counts.if ?? 0) + 1
      tally(inst.then, counts)
      tally(inst.else, counts)
    }
  }
}

// Tally placements per card kind across a (possibly nested) program.
export function countCards(instructions: Instruction[]): CardLimits {
  const counts: CardLimits = {}
  tally(instructions, counts)
  return counts
}

// True when `counts` never exceeds `limits` for any card that `limits` caps.
// Cards omitted from `limits` are unlimited, so they can never violate it.
export function withinCardLimits(counts: CardLimits, limits: CardLimits): boolean {
  for (const key of Object.keys(limits) as (keyof CardLimits)[]) {
    const cap = limits[key]
    if (cap === undefined) continue
    if ((counts[key] ?? 0) > cap) return false
  }
  return true
}
