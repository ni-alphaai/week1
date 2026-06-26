import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Command } from '../types'

vi.mock('./config', () => ({
  aiEnabled: true,
  aiExplainEnabled: false,
  aiGenerationEnabled: true,
  aiAdaptiveEnabled: false,
  AI_MODEL: 'test',
  OPENAI_MODEL: 'gpt-4o-mini',
  OPENAI_STRONG_MODEL: 'gpt-4o',
  recaptchaSiteKey: undefined,
}))
vi.mock('./aiClient', () => ({ generateText: vi.fn() }))

import { generateText } from './aiClient'
import { generatePuzzle, __test } from './generation'
import type { PuzzleTemplate } from './generation'

// Navigation now targets level 4: a 6x6 grid, 3 rocks, and a 7-9 move path.
const template: PuzzleTemplate = {
  rows: 6,
  cols: 6,
  availableCommands: ['up', 'down', 'left', 'right'] as Command[],
  targetLevel: 4,
  successRule: 'reachGoal',
}

const mockedGen = vi.mocked(generateText)

// An on-target layout: start (0,0) -> goal (4,4), optimal 8, with 3 rocks parked
// off every shortest path (so they raise difficulty without changing optimal).
const validJson = JSON.stringify({
  start: { row: 0, col: 0 },
  goal: { row: 4, col: 4 },
  obstacles: [
    { row: 5, col: 5 },
    { row: 5, col: 4 },
    { row: 4, col: 5 },
  ],
})
// Unsolvable: goal fully walled off.
const unsolvableJson = JSON.stringify({
  start: { row: 0, col: 0 },
  goal: { row: 4, col: 4 },
  obstacles: [
    { row: 3, col: 4 },
    { row: 5, col: 4 },
    { row: 4, col: 3 },
    { row: 4, col: 5 },
  ],
})

beforeEach(() => mockedGen.mockReset())

describe('generatePuzzle', () => {
  it('returns a verified puzzle with the solver solution, optimal, and difficulty', async () => {
    mockedGen.mockResolvedValueOnce(validJson)
    const puzzle = await generatePuzzle(template)
    expect(puzzle).not.toBeNull()
    expect(puzzle!.aiGenerated).toBe(true)
    expect(puzzle!.optimal).toBe(8)
    expect(puzzle!.solution.length).toBe(8)
    // Internal difficulty score is set and meets the level-4 target.
    expect(puzzle!.difficulty).toBeGreaterThanOrEqual(4)
  })

  it('degrades to level 3 when every proposal misses the level-4 target', async () => {
    // Same 8-move path as the valid one but with NO rocks: in the move band yet
    // structurally under level 4. The level-4 gate rejects it on all four
    // attempts, then graceful degradation accepts it at level 3.
    const tooEasy = JSON.stringify({ start: { row: 0, col: 0 }, goal: { row: 4, col: 4 }, obstacles: [] })
    mockedGen.mockResolvedValue(tooEasy)
    const puzzle = await generatePuzzle(template)
    expect(puzzle).not.toBeNull()
    // Accepted only after dropping to level 3, so its score sits below 4.
    expect(puzzle!.difficulty).toBeGreaterThanOrEqual(3)
    expect(puzzle!.difficulty).toBeLessThan(4)
    // Three failed level-4 attempts, then the first level-3 attempt verifies.
    expect(mockedGen).toHaveBeenCalledTimes(5)
  })

  it('retries past an invalid proposal and accepts a later valid one', async () => {
    mockedGen.mockResolvedValueOnce('not json at all').mockResolvedValueOnce(validJson)
    const puzzle = await generatePuzzle(template)
    expect(puzzle).not.toBeNull()
    expect(mockedGen).toHaveBeenCalledTimes(2)
  })

  it('abstains (null) when every proposal fails verification', async () => {
    mockedGen.mockResolvedValue(unsolvableJson)
    const puzzle = await generatePuzzle(template)
    expect(puzzle).toBeNull()
  })

  it('passes the avoid signatures into the generation prompt', async () => {
    mockedGen.mockResolvedValueOnce(validJson)
    const avoid = [
      '{"start":{"row":0,"col":0},"goal":{"row":4,"col":4},"obstacles":[]}',
      '{"start":{"row":0,"col":0},"goal":{"row":3,"col":5},"obstacles":[]}',
    ]
    await generatePuzzle({ ...template, avoid })
    const prompt = mockedGen.mock.calls[0][0].prompt
    expect(prompt).toContain('Do NOT reproduce')
    expect(prompt).toContain(avoid[0])
    expect(prompt).toContain(avoid[1])
  })

  it('omits the avoid block entirely when no signatures are provided', async () => {
    mockedGen.mockResolvedValueOnce(validJson)
    await generatePuzzle(template)
    expect(mockedGen.mock.calls[0][0].prompt).not.toContain('Do NOT reproduce')
  })

  it('escalates to the strong model after the cheap-model attempts fail', async () => {
    // Genuinely unsolvable, so it fails at level 4 AND the level-3 fallback:
    // 4 attempts per level (2 cheap + 2 strong), repeated across both levels.
    mockedGen.mockResolvedValue(unsolvableJson)
    const puzzle = await generatePuzzle(template)
    expect(puzzle).toBeNull()
    expect(mockedGen).toHaveBeenCalledTimes(8)
    const models = mockedGen.mock.calls.map((c) => c[0].model)
    expect(models).toEqual([
      'gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o', 'gpt-4o',
      'gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o', 'gpt-4o',
    ])
    expect(mockedGen.mock.calls[0][0].timeoutMs).toBe(30000)
    expect(mockedGen.mock.calls[2][0].timeoutMs).toBe(60000)
  })
})

// ---------------------------------------------------------------------------
// Loop concept: the model proposes the whole puzzle + its nested solution.

const loopTemplate: PuzzleTemplate = {
  rows: 2,
  cols: 9,
  availableCommands: ['right', 'up', 'down'] as Command[],
  targetLevel: 5,
  successRule: 'reachGoal',
  concept: 'loops',
}

// A self-consistent loop puzzle: rocks force a Repeat that runs a hop-the-wall
// If rule the whole way (lesson 5 "Run, hop, run").
function loopJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    map: {
      start: { row: 1, col: 0 },
      goal: { row: 1, col: 8 },
      obstacles: [
        { row: 1, col: 3 },
        { row: 1, col: 6 },
      ],
    },
    availableCommands: ['right', 'up', 'down'],
    blocks: ['loop', 'if'],
    predicateOptions: [{ predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' }],
    loopRange: { min: 1, max: 8 },
    cardLimits: { right: 3, up: 1, down: 1, loop: 1, if: 1 },
    solution: [
      {
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
      },
    ],
    prompt: 'Two rocks block a long corridor — get past them to the treasure.',
    goal: 'Run, hop, run',
    hints: ['Teach one rule that hops a wall and steps ahead otherwise.'],
    ...overrides,
  })
}

describe('generatePuzzle (loops)', () => {
  it('returns a verified loop puzzle with nested solution and passthrough fields', async () => {
    mockedGen.mockResolvedValueOnce(loopJson())
    const puzzle = await generatePuzzle(loopTemplate)
    expect(puzzle).not.toBeNull()
    expect(puzzle!.concept).toBe('loops')
    expect(puzzle!.aiGenerated).toBe(true)
    expect(puzzle!.optimal).toBe(12)
    expect(puzzle!.blocks).toContain('loop')
    expect(puzzle!.cardLimits).toEqual({ right: 3, up: 1, down: 1, loop: 1, if: 1 })
    expect(puzzle!.loopRange).toEqual({ min: 1, max: 8 })
    expect(puzzle!.prompt).toMatch(/corridor/)
    expect(puzzle!.feedback?.hints.length).toBeGreaterThan(0)
    // The internal difficulty score is set (this richly-nested puzzle maxes out).
    expect(puzzle!.difficulty).toBe(5)
    // The nested solution is a real loop instruction.
    const top = puzzle!.solution[0]
    expect(typeof top === 'object' && top.kind === 'loop').toBe(true)
  })

  it('abstains when the loop is not actually forced by the card limits', async () => {
    // Loose limits let a flat path fit, so verification rejects every attempt at
    // every level — the requested level (4 attempts) plus the level-3 fallback.
    mockedGen.mockResolvedValue(loopJson({ cardLimits: { right: 10, up: 2, down: 2 } }))
    const puzzle = await generatePuzzle(loopTemplate)
    expect(puzzle).toBeNull()
    // Block concepts descend every level from the requested one down to 3
    // (5 -> [5,4,3]), 4 attempts each = 12 calls.
    expect(mockedGen).toHaveBeenCalledTimes(12)
  })

  it('retries past malformed JSON then accepts a valid loop puzzle', async () => {
    mockedGen.mockResolvedValueOnce('{ not valid').mockResolvedValueOnce(loopJson())
    const puzzle = await generatePuzzle(loopTemplate)
    expect(puzzle).not.toBeNull()
    expect(mockedGen).toHaveBeenCalledTimes(2)
  })

  it('includes multiple worked examples and the avoid block in the prompt', async () => {
    mockedGen.mockResolvedValueOnce(loopJson())
    await generatePuzzle({ ...loopTemplate, avoid: ['sig-A', 'sig-B'] })
    const prompt = mockedGen.mock.calls[0][0].prompt
    // Two curated exemplars are offered (plural header), not just one.
    expect(prompt).toContain('worked examples')
    expect(prompt).toContain('March down the hall')
    // The avoid signatures are threaded through.
    expect(prompt).toContain('Do NOT reproduce')
    expect(prompt).toContain('sig-A')
  })

  it('degrades a too-easy forced loop puzzle from level 4 down to level 3', async () => {
    // A single-move-body loop down a clear corridor: forced and a real loop, but
    // a short 5-move walk that scores ~3 — below the level-4 target yet fine for
    // level 3. The level-4 attempts all fail, then degradation accepts it.
    const level4Loop: PuzzleTemplate = {
      rows: 1,
      cols: 6,
      availableCommands: ['right'] as Command[],
      targetLevel: 4,
      successRule: 'reachGoal',
      concept: 'loops',
    }
    const subTarget = loopJson({
      map: { start: { row: 0, col: 0 }, goal: { row: 0, col: 5 }, obstacles: [] },
      availableCommands: ['right'],
      blocks: ['loop'],
      predicateOptions: [],
      cardLimits: { right: 1, loop: 1 },
      solution: [{ kind: 'loop', count: 5, body: ['right'], label: 'Repeat 5×' }],
    })
    mockedGen.mockResolvedValue(subTarget)
    const puzzle = await generatePuzzle(level4Loop)
    expect(puzzle).not.toBeNull()
    expect(puzzle!.concept).toBe('loops')
    expect(puzzle!.difficulty).toBeGreaterThanOrEqual(3)
    expect(puzzle!.difficulty).toBeLessThan(4)
    // The 5-move loop is out of the level-4 band (7-10), so all four level-4
    // attempts fail, then the first level-3 attempt (band 5-9) verifies.
    expect(mockedGen).toHaveBeenCalledTimes(5)
  })
})

// ---------------------------------------------------------------------------
// While concept: a corridor solved by two While loops.

const whileTemplate: PuzzleTemplate = {
  rows: 6,
  cols: 6,
  availableCommands: ['right', 'up'] as Command[],
  targetLevel: 4,
  successRule: 'reachGoal',
  concept: 'while',
}

function whileJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    map: { start: { row: 5, col: 0 }, goal: { row: 0, col: 5 }, obstacles: [] },
    availableCommands: ['right', 'up'],
    blocks: ['while'],
    predicateOptions: [
      { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
      { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
    ],
    loopRange: { min: 1, max: 1 },
    cardLimits: { right: 1, up: 1, while: 2 },
    solution: [
      { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['right'], label: 'Right is clear' },
      { kind: 'while', predicate: { sensor: 'clear', dir: 'up' }, body: ['up'], label: 'Up is clear' },
    ],
    prompt: 'Race across the floor and climb to the treasure.',
    goal: 'Run, then climb',
    hints: ['Two unknown distances means two While loops.'],
    ...overrides,
  })
}

describe('generatePuzzle (while)', () => {
  it('returns a verified while puzzle with nested while solution', async () => {
    mockedGen.mockResolvedValueOnce(whileJson())
    const puzzle = await generatePuzzle(whileTemplate)
    expect(puzzle).not.toBeNull()
    expect(puzzle!.concept).toBe('while')
    expect(puzzle!.optimal).toBe(10)
    const top = puzzle!.solution[0]
    expect(typeof top === 'object' && top.kind === 'while').toBe(true)
  })

  it('abstains when the solution omits a while block', async () => {
    mockedGen.mockResolvedValue(whileJson({ blocks: ['loop'], solution: ['right'] }))
    const puzzle = await generatePuzzle(whileTemplate)
    expect(puzzle).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Conditionals concept: a Repeat running an If/else "hop the wall" rule.

const condTemplate: PuzzleTemplate = {
  rows: 2,
  cols: 8,
  availableCommands: ['right', 'up', 'down'] as Command[],
  targetLevel: 4,
  successRule: 'reachGoal',
  concept: 'conditionals',
}

function condJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    map: {
      start: { row: 1, col: 0 },
      goal: { row: 1, col: 7 },
      obstacles: [
        { row: 1, col: 2 },
        { row: 1, col: 5 },
      ],
    },
    availableCommands: ['right', 'up', 'down'],
    blocks: ['loop', 'if'],
    predicateOptions: [{ predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' }],
    loopRange: { min: 1, max: 9 },
    cardLimits: { right: 3, up: 1, down: 1, loop: 1, if: 1 },
    solution: [
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
    ],
    prompt: 'Rocks block the corridor — teach one rule that handles a rock wherever it appears.',
    goal: 'Through the gauntlet',
    hints: ['When a wall is on the right, climb over it; else step ahead.'],
    ...overrides,
  })
}

describe('generatePuzzle (conditionals)', () => {
  it('returns a verified conditional puzzle with an if/else in the solution', async () => {
    mockedGen.mockResolvedValueOnce(condJson())
    const puzzle = await generatePuzzle(condTemplate)
    expect(puzzle).not.toBeNull()
    expect(puzzle!.concept).toBe('conditionals')
    expect(puzzle!.optimal).toBe(11)
    expect(puzzle!.blocks).toContain('if')
  })

  it('accepts even with loose limits (soft forcing), unlike loops', async () => {
    mockedGen.mockResolvedValueOnce(condJson({ cardLimits: { right: 10, up: 2, down: 2, loop: 1, if: 1 } }))
    const puzzle = await generatePuzzle(condTemplate)
    expect(puzzle).not.toBeNull()
    expect(puzzle!.concept).toBe('conditionals')
  })
})

describe('nested-Instruction JSON parser', () => {
  it('parses a nested loop/conditional solution', () => {
    const parsed = __test.parseLoopPuzzle(loopJson(), loopTemplate)
    expect(parsed).not.toBeNull()
    expect(parsed!.candidate.solution).toHaveLength(1)
    const loop = parsed!.candidate.solution[0]
    expect(typeof loop === 'object' && loop.kind === 'loop').toBe(true)
    if (typeof loop === 'object' && loop.kind === 'loop') {
      expect(loop.count).toBe(6)
      const cond = loop.body[0]
      expect(typeof cond === 'object' && cond.kind === 'conditional').toBe(true)
    }
  })

  it('rejects a solution with an invalid nested node', () => {
    const bad = loopJson({
      solution: [{ kind: 'loop', count: 3, body: ['sideways'], label: 'bad' }],
    })
    expect(__test.parseLoopPuzzle(bad, loopTemplate)).toBeNull()
  })

  it('rejects a proposal whose blocks omit loop', () => {
    const bad = loopJson({ blocks: ['if'] })
    expect(__test.parseLoopPuzzle(bad, loopTemplate)).toBeNull()
  })
})
