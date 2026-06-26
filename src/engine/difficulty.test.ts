import { describe, it, expect } from 'vitest'
import type { CardLimits, Instruction, MapConfig } from '../types'
import { difficultyScore, scoreFor, analyzeBlocks, type DifficultyFeatures } from './difficulty'

// Baseline feature set (a trivial 2-move maze): every test tweaks one axis so
// the unit cases isolate the effect of a single feature.
const baseFeatures: DifficultyFeatures = {
  moves: 2,
  blocks: 0,
  nestingDepth: 0,
  hasBranch: false,
  obstacles: 0,
  gridSpan: 2,
  cardTightness: 0,
}

// ---------------------------------------------------------------------------
// CALIBRATION against authored content. The bands below are the contract: the
// generator gates on this score, so these must hold (see weights in difficulty.ts).

describe('difficultyScore calibration (authored puzzles)', () => {
  it('l1-q1 (nav, 6 moves, 3 rocks, 4x4) lands in 3..4', () => {
    const map: MapConfig = {
      rows: 4,
      cols: 4,
      start: { row: 3, col: 0 },
      goal: { row: 0, col: 3 },
      obstacles: [
        { row: 3, col: 1 },
        { row: 0, col: 2 },
        { row: 2, col: 2 },
      ],
    }
    const solution: Instruction[] = ['up', 'up', 'right', 'right', 'right', 'up']
    const score = scoreFor(map, solution)
    expect(score).toBeGreaterThanOrEqual(3)
    expect(score).toBeLessThanOrEqual(4)
  })

  it('l3-q1 (1 loop, 5 moves, 0 rocks, 1x6) lands in 2..3', () => {
    const map: MapConfig = { rows: 1, cols: 6, start: { row: 0, col: 0 }, goal: { row: 0, col: 5 } }
    const solution: Instruction[] = [{ kind: 'loop', count: 5, body: ['right'], label: 'Repeat 5×' }]
    const cardLimits: CardLimits = { right: 1, loop: 1 }
    const score = scoreFor(map, solution, cardLimits)
    expect(score).toBeGreaterThanOrEqual(2)
    expect(score).toBeLessThanOrEqual(3)
  })

  it('l3-q3 (1 loop body [up,right]x4, 8 moves, 5x5) lands in 4..5', () => {
    const map: MapConfig = { rows: 5, cols: 5, start: { row: 4, col: 0 }, goal: { row: 0, col: 4 } }
    const solution: Instruction[] = [
      { kind: 'loop', count: 4, body: ['up', 'right'], label: 'Repeat 4×' },
    ]
    const cardLimits: CardLimits = { up: 1, right: 1, loop: 1 }
    const score = scoreFor(map, solution, cardLimits)
    expect(score).toBeGreaterThanOrEqual(4)
    expect(score).toBeLessThanOrEqual(5)
  })

  it('l4-q2 (2 whiles, 10 moves, 6x6) lands in 4..5', () => {
    const map: MapConfig = { rows: 6, cols: 6, start: { row: 5, col: 0 }, goal: { row: 0, col: 5 } }
    const solution: Instruction[] = [
      { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['right'], label: 'Right is clear' },
      { kind: 'while', predicate: { sensor: 'clear', dir: 'up' }, body: ['up'], label: 'Up is clear' },
    ]
    const cardLimits: CardLimits = { right: 1, up: 1 }
    const score = scoreFor(map, solution, cardLimits)
    expect(score).toBeGreaterThanOrEqual(4)
    expect(score).toBeLessThanOrEqual(5)
  })

  it('l5-q1 (loop-with-if nested, 2 rocks, 2x9) scores 5', () => {
    const map: MapConfig = {
      rows: 2,
      cols: 9,
      start: { row: 1, col: 0 },
      goal: { row: 1, col: 8 },
      obstacles: [
        { row: 1, col: 3 },
        { row: 1, col: 6 },
      ],
    }
    const solution: Instruction[] = [
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
    ]
    const cardLimits: CardLimits = { right: 3, up: 1, down: 1 }
    expect(scoreFor(map, solution, cardLimits)).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Unit cases isolating individual feature effects.

describe('difficultyScore feature effects', () => {
  it('clamps to the 1..5 range', () => {
    expect(difficultyScore(baseFeatures)).toBe(1)
    expect(
      difficultyScore({
        moves: 20,
        blocks: 5,
        nestingDepth: 3,
        hasBranch: true,
        obstacles: 5,
        gridSpan: 10,
        cardTightness: 1,
      }),
    ).toBe(5)
  })

  it('more blocks yields a higher score', () => {
    const one = difficultyScore({ ...baseFeatures, blocks: 1 })
    const two = difficultyScore({ ...baseFeatures, blocks: 2 })
    const three = difficultyScore({ ...baseFeatures, blocks: 3 })
    expect(two).toBeGreaterThan(one)
    expect(three).toBeGreaterThan(two)
  })

  it('tight cards bump the score', () => {
    const loose = difficultyScore({ ...baseFeatures, cardTightness: 0.5 })
    const tight = difficultyScore({ ...baseFeatures, cardTightness: 0.9 })
    expect(tight).toBeGreaterThan(loose)
  })

  it('a real branch and deeper nesting both add', () => {
    const flat = difficultyScore({ ...baseFeatures, blocks: 2, nestingDepth: 1 })
    const nested = difficultyScore({ ...baseFeatures, blocks: 2, nestingDepth: 2 })
    const branched = difficultyScore({ ...baseFeatures, blocks: 2, nestingDepth: 2, hasBranch: true })
    expect(nested).toBeGreaterThan(flat)
    expect(branched).toBeGreaterThan(nested)
  })
})

describe('analyzeBlocks', () => {
  it('measures nesting depth and branch presence', () => {
    const solution: Instruction[] = [
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
    ]
    const shape = analyzeBlocks(solution)
    expect(shape.blocks).toBe(2)
    expect(shape.nestingDepth).toBe(2)
    expect(shape.hasBranch).toBe(true)
  })

  it('treats sibling loops as depth 1 and an empty else as no branch', () => {
    const solution: Instruction[] = [
      { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['right'], label: 'r' },
      {
        kind: 'conditional',
        predicate: { sensor: 'blocked', dir: 'up' },
        then: ['up'],
        else: [],
        label: 'u',
      },
    ]
    const shape = analyzeBlocks(solution)
    expect(shape.blocks).toBe(2)
    expect(shape.nestingDepth).toBe(1)
    expect(shape.hasBranch).toBe(false)
  })
})
