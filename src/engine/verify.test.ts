import { describe, it, expect } from 'vitest'
import type { Command, Instruction, MapConfig } from '../types'
import { validatePuzzle, validateLoopPuzzle, validateConceptPuzzle } from './verify'
import type { LoopPuzzleCandidate } from './verify'

const allDirs: Command[] = ['up', 'down', 'left', 'right']

describe('validatePuzzle', () => {
  it('accepts a solvable, in-band puzzle solvable with the offered cards', () => {
    const map: MapConfig = { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 2, col: 2 } }
    const v = validatePuzzle(map, { availableCommands: allDirs, band: { minMoves: 3, maxMoves: 6 } })
    expect(v.ok).toBe(true)
    expect(v.optimalMoves).toBe(4)
    expect(v.reasons).toEqual([])
  })

  it('rejects an unsolvable puzzle', () => {
    const map: MapConfig = {
      rows: 3,
      cols: 3,
      start: { row: 0, col: 0 },
      goal: { row: 2, col: 2 },
      obstacles: [
        { row: 2, col: 1 },
        { row: 1, col: 2 },
      ],
    }
    const v = validatePuzzle(map, { availableCommands: allDirs })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('unsolvable')
  })

  it('flags a trivial puzzle', () => {
    const map: MapConfig = { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 1 } }
    const v = validatePuzzle(map, { availableCommands: allDirs, minMoves: 2 })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('trivial')
  })

  it('flags out-of-band difficulty', () => {
    const map: MapConfig = { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 2, col: 2 } }
    const v = validatePuzzle(map, { availableCommands: allDirs, band: { minMoves: 6, maxMoves: 8 } })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('outOfBand')
  })

  it('flags a palette violation when a needed card is missing', () => {
    const map: MapConfig = { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 2, col: 2 } }
    const v = validatePuzzle(map, { availableCommands: ['right'] })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('paletteViolation')
  })
})

// Lesson 5 "Run, hop, run" corridor: rocks force a Repeat that runs an If rule.
const loopMap: MapConfig = {
  rows: 2,
  cols: 9,
  start: { row: 1, col: 0 },
  goal: { row: 1, col: 8 },
  obstacles: [
    { row: 1, col: 3 },
    { row: 1, col: 6 },
  ],
}

const hopLoop: Instruction = {
  kind: 'loop',
  count: 6,
  label: 'Repeat 6×',
  body: [
    {
      kind: 'conditional',
      predicate: { sensor: 'blocked', dir: 'right' },
      then: ['up', 'right', 'right', 'down'],
      else: ['right'],
      label: 'wall on the right',
    },
  ],
}

function loopCandidate(overrides: Partial<LoopPuzzleCandidate> = {}): LoopPuzzleCandidate {
  return {
    map: loopMap,
    availableCommands: ['right', 'up', 'down'],
    blocks: ['loop', 'if'],
    predicateOptions: [
      { predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' },
    ],
    cardLimits: { right: 3, up: 1, down: 1 },
    solution: [hopLoop],
    ...overrides,
  }
}

const loopBand = { minMoves: 6, maxMoves: 20 }

describe('validateLoopPuzzle', () => {
  it('accepts a verified loop puzzle where a loop is required', () => {
    const v = validateLoopPuzzle(loopCandidate(), { band: loopBand })
    expect(v.reasons).toEqual([])
    expect(v.ok).toBe(true)
    expect(v.optimalMoves).toBe(12)
  })

  it('rejects a puzzle whose limits permit a flat solution (loop not forced)', () => {
    // Loose card limits mean a plain move-only path along the top row fits, so
    // the Repeat is decorative.
    const v = validateLoopPuzzle(loopCandidate({ cardLimits: { right: 10, up: 2, down: 2 } }), {
      band: loopBand,
    })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('notForced')
  })

  it('rejects a solution that does not reach the goal', () => {
    const losing: Instruction = { kind: 'loop', count: 1, label: 'Repeat 1×', body: ['right'] }
    const v = validateLoopPuzzle(loopCandidate({ solution: [losing] }), { band: loopBand })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('losing')
  })

  it('rejects a card-limit violation', () => {
    const v = validateLoopPuzzle(loopCandidate({ cardLimits: { right: 1, up: 1, down: 1 } }), {
      band: loopBand,
    })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('cardLimitViolation')
  })

  it('rejects a palette violation when the solution uses an unoffered command', () => {
    const v = validateLoopPuzzle(loopCandidate({ availableCommands: ['right', 'down'] }), {
      band: loopBand,
    })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('paletteViolation')
  })

  it('rejects a solution that contains no loop', () => {
    // A flat program that happens to win but uses no Repeat block.
    const flat: Instruction[] = [
      'right',
      'right',
      'up',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'down',
    ]
    const v = validateLoopPuzzle(loopCandidate({ solution: flat, cardLimits: {} }), { band: loopBand })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('noLoop')
  })

  it('rejects an out-of-band solution', () => {
    const v = validateLoopPuzzle(loopCandidate(), { band: { minMoves: 1, maxMoves: 5 } })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('outOfBand')
  })
})

// The difficulty gate: a winning, forced loop puzzle that is structurally too
// simple for its target level is rejected as 'tooEasy', while a structurally
// rich one (the nested loop-with-if "Run, hop, run") passes the same target.
describe('validateConceptPuzzle difficulty gate', () => {
  // A bare single-loop corridor: forced (one Right card cannot walk six tiles)
  // and a real loop, but only ~3 on the internal score.
  const simpleCorridor: LoopPuzzleCandidate = {
    map: { rows: 1, cols: 6, start: { row: 0, col: 0 }, goal: { row: 0, col: 5 } },
    availableCommands: ['right'],
    blocks: ['loop'],
    predicateOptions: [],
    cardLimits: { right: 1, loop: 1 },
    solution: [{ kind: 'loop', count: 5, body: ['right'], label: 'Repeat 5×' }],
  }

  it("rejects a winning, forced puzzle that scores below target as 'tooEasy'", () => {
    const v = validateConceptPuzzle(simpleCorridor, {
      band: { minMoves: 3, maxMoves: 20 },
      concept: 'loops',
      difficulty: { targetLevel: 4 },
    })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('tooEasy')
    // It is otherwise a legal, forced loop — no other reason fires.
    expect(v.reasons).not.toContain('notForced')
    expect(v.reasons).not.toContain('noLoop')
  })

  it('accepts the same sub-target puzzle when the target drops to level 3', () => {
    // The graceful-degradation path: a puzzle rejected as 'tooEasy' at level 4
    // verifies cleanly once the target is lowered to level 3.
    const v = validateConceptPuzzle(simpleCorridor, {
      band: { minMoves: 3, maxMoves: 20 },
      concept: 'loops',
      difficulty: { targetLevel: 3 },
    })
    expect(v.ok).toBe(true)
    expect(v.reasons).toEqual([])
  })

  it('accepts an on-target, structurally rich puzzle', () => {
    const v = validateConceptPuzzle(loopCandidate(), {
      band: loopBand,
      concept: 'loops',
      difficulty: { targetLevel: 4, minGridSpan: 5 },
    })
    expect(v.reasons).toEqual([])
    expect(v.ok).toBe(true)
  })

  it("enforces requireBranch as a structural minimum", () => {
    // A forced loop with no conditional cannot satisfy requireBranch.
    const v = validateConceptPuzzle(simpleCorridor, {
      band: { minMoves: 3, maxMoves: 20 },
      concept: 'loops',
      difficulty: { targetLevel: 1, requireBranch: true },
    })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('tooEasy')
  })
})

// While concept: a corridor solved by two While loops (lesson 4 "Run, then
// climb"). One Right and one Up card means a flat row cannot reach the goal, so
// the While is genuinely forced (strict forcing applies to while, like loops).
const whileMap: MapConfig = { rows: 6, cols: 6, start: { row: 5, col: 0 }, goal: { row: 0, col: 5 } }

const whileSolution: Instruction[] = [
  { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['right'], label: 'Right is clear' },
  { kind: 'while', predicate: { sensor: 'clear', dir: 'up' }, body: ['up'], label: 'Up is clear' },
]

function whileCandidate(overrides: Partial<LoopPuzzleCandidate> = {}): LoopPuzzleCandidate {
  return {
    map: whileMap,
    availableCommands: ['right', 'up'],
    blocks: ['while'],
    predicateOptions: [
      { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
      { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
    ],
    cardLimits: { right: 1, up: 1 },
    solution: whileSolution,
    ...overrides,
  }
}

const wideBand = { minMoves: 6, maxMoves: 20 }

describe('validateConceptPuzzle (while)', () => {
  it('accepts a verified while puzzle where a while is required', () => {
    const v = validateConceptPuzzle(whileCandidate(), { band: wideBand, concept: 'while' })
    expect(v.reasons).toEqual([])
    expect(v.ok).toBe(true)
    expect(v.optimalMoves).toBe(10)
  })

  it('abstains when the solution contains no while', () => {
    // A flat path that wins but uses no While block (limits relaxed so it fits).
    const flat: Instruction[] = ['right', 'right', 'right', 'right', 'right', 'up', 'up', 'up', 'up', 'up']
    const v = validateConceptPuzzle(whileCandidate({ solution: flat, cardLimits: {} }), {
      band: wideBand,
      concept: 'while',
    })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('noWhile')
  })
})

// Conditionals concept: the lesson 2 "gauntlet" — a Repeat running an If/else
// "hop the wall" rule. Forcing is SOFT for conditionals: the validator must NOT
// apply the solveWithinLimits forcing rejection, even when a flat path fits.
const condMap: MapConfig = {
  rows: 2,
  cols: 8,
  start: { row: 1, col: 0 },
  goal: { row: 1, col: 7 },
  obstacles: [
    { row: 1, col: 2 },
    { row: 1, col: 5 },
  ],
}

const condSolution: Instruction[] = [
  {
    kind: 'loop',
    count: 5,
    label: 'Repeat 5×',
    body: [
      {
        kind: 'conditional',
        predicate: { sensor: 'blocked', dir: 'right' },
        then: ['up', 'right', 'right', 'down'],
        else: ['right'],
        label: 'wall on the right',
      },
    ],
  },
]

function condCandidate(overrides: Partial<LoopPuzzleCandidate> = {}): LoopPuzzleCandidate {
  return {
    map: condMap,
    availableCommands: ['right', 'up', 'down'],
    blocks: ['loop', 'if'],
    predicateOptions: [{ predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' }],
    cardLimits: { right: 3, up: 1, down: 1 },
    solution: condSolution,
    ...overrides,
  }
}

describe('validateConceptPuzzle (conditionals)', () => {
  it('accepts a verified conditional puzzle without proving strict forcing', () => {
    // Loose limits would let a flat path fit — for loops/while that is a
    // 'notForced' rejection, but conditionals must accept it (soft forcing).
    const v = validateConceptPuzzle(condCandidate({ cardLimits: { right: 10, up: 2, down: 2 } }), {
      band: wideBand,
      concept: 'conditionals',
    })
    expect(v.reasons).toEqual([])
    expect(v.ok).toBe(true)
    expect(v.optimalMoves).toBe(11)
  })

  it('abstains when the solution contains no if/else', () => {
    // A hand-laid path around both rocks that wins but never branches.
    const flat: Instruction[] = [
      'right',
      'up',
      'right',
      'right',
      'down',
      'right',
      'up',
      'right',
      'right',
      'down',
      'right',
    ]
    const v = validateConceptPuzzle(condCandidate({ solution: flat, cardLimits: {} }), {
      band: wideBand,
      concept: 'conditionals',
    })
    expect(v.ok).toBe(false)
    expect(v.reasons).toContain('noConditional')
    expect(v.reasons).not.toContain('notForced')
  })
})
