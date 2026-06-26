// Badge definitions + a pure evaluator. The evaluator is run after every
// recordResult / recordPracticeResult with an AwardCtx describing the attempt;
// it returns the ids that SHOULD be awarded and are not already held, so the
// caller can append them to state.badges and surface them as pending.

import type { Instruction, Lesson } from '../types'
import type { LearnerState } from '../storage/types'

export interface AwardCtx {
  state: LearnerState
  lesson: Lesson
  stepId: string
  correct: boolean
  source: 'lesson' | 'practice'
  program: Instruction[]
  optimalSolved: boolean
  priorIncorrect: number
  solveMs: number
}

export interface BadgeDef {
  id: string
  title: string
  blurb: string
  awardOn: (ctx: AwardCtx) => boolean
}

export const BADGES: BadgeDef[] = [
  {
    id: 'first-loop',
    title: 'Loop Starter',
    blurb: 'Solved a puzzle using a Repeat block for the first time.',
    awardOn: (ctx) => ctx.correct && containsBlock(ctx.program, 'loop') && !ctx.state.badges.includes('first-loop'),
  },
  {
    id: 'first-while',
    title: 'While Starter',
    blurb: 'Solved a puzzle using a While block for the first time.',
    awardOn: (ctx) => ctx.correct && containsBlock(ctx.program, 'while') && !ctx.state.badges.includes('first-while'),
  },
  {
    id: 'first-if',
    title: 'If Starter',
    blurb: 'Solved a puzzle using an If block for the first time.',
    awardOn: (ctx) =>
      ctx.correct && containsBlock(ctx.program, 'conditional') && !ctx.state.badges.includes('first-if'),
  },
  {
    id: 'practice-5',
    title: 'Practice Pro',
    blurb: 'Solved 5 practice puzzles.',
    awardOn: (ctx) => practiceCorrect(ctx.state) >= 5,
  },
  {
    id: 'practice-20',
    title: 'Practice Master',
    blurb: 'Solved 20 practice puzzles.',
    awardOn: (ctx) => practiceCorrect(ctx.state) >= 20,
  },
  {
    id: 'comeback-kid',
    title: 'Comeback Kid',
    blurb: 'Solved a puzzle after three or more tries.',
    awardOn: (ctx) => ctx.correct && ctx.priorIncorrect >= 3,
  },
  {
    id: 'optimal-solver',
    title: 'Optimal Solver',
    blurb: 'Solved a shortest-path puzzle using the fewest moves.',
    awardOn: (ctx) => ctx.correct && ctx.optimalSolved,
  },
  {
    id: 'speedy',
    title: 'Speedy',
    blurb: 'Solved a puzzle in under 30 seconds.',
    awardOn: (ctx) => ctx.correct && ctx.solveMs > 0 && ctx.solveMs < 30000,
  },
]

export const BADGE_LABELS: Record<string, { title: string; blurb: string }> = Object.fromEntries(
  BADGES.map((b) => [b.id, { title: b.title, blurb: b.blurb }]),
)

// Returns badge ids that SHOULD be awarded and are not already in state.badges.
export function evaluateBadges(ctx: AwardCtx): string[] {
  return BADGES.filter((b) => b.awardOn(ctx) && !ctx.state.badges.includes(b.id)).map((b) => b.id)
}

// Walks a program tree (including nested loop/while/if bodies) looking for a
// block of the given kind. Plain move/action steps are leaf instructions and
// carry no body.
function containsBlock(program: Instruction[], kind: 'loop' | 'while' | 'conditional'): boolean {
  for (const inst of program) {
    if (typeof inst === 'string') continue
    if (inst.kind === kind) return true
    if (inst.kind === 'conditional') {
      if (containsBlock(inst.then, kind) || containsBlock(inst.else, kind)) return true
    } else {
      // Loop / While both have a `body`.
      if (containsBlock(inst.body, kind)) return true
    }
  }
  return false
}

function practiceCorrect(state: LearnerState): number {
  return Object.values(state.skillStats).reduce((sum, st) => sum + (st.practiceCorrect ?? 0), 0)
}
