import { describe, it, expect } from 'vitest'
import type { Instruction, Lesson } from '../types'
import type { GeneratedPuzzle } from '../ai/generation'
import { runInstructions } from '../engine/map'
import { checkProgram } from '../engine/checker'
import { toPracticeStep } from './generated'

const lesson: Lesson = {
  id: 'lesson-x',
  version: 1,
  title: 'Test Lesson',
  subtitle: '',
  sequence: 1,
  skillIds: ['seq'],
  steps: [],
}

const navPuzzle: GeneratedPuzzle = {
  map: { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 2, col: 2 } },
  availableCommands: ['up', 'down', 'left', 'right'],
  solution: ['down', 'down', 'right', 'right'],
  optimal: 4,
  concept: 'navigation',
  aiGenerated: true,
}

describe('toPracticeStep', () => {
  it('wraps a generated puzzle into a playable, solvable SequenceStep', () => {
    const step = toPracticeStep(navPuzzle, lesson)
    expect(step.type).toBe('sequence')
    expect(step.aiGenerated).toBe(true)
    expect(step.difficulty).toBe(4)
    expect(step.availableCommands).toEqual(['up', 'down', 'left', 'right'])

    // The carried solution actually solves the carried map.
    const run = runInstructions(step.map, step.solution)
    expect(run.status).toBe('success')

    const res = checkProgram(
      { map: step.map, successRule: step.successRule, optimal: step.optimal, feedback: step.feedback },
      step.solution,
    )
    expect(res.correct).toBe(true)
  })

  it('falls back to authored narrative when the puzzle has none', () => {
    const step = toPracticeStep(navPuzzle, lesson)
    expect(step.goal.length).toBeGreaterThan(0)
    expect(step.prompt.length).toBeGreaterThan(0)
    expect(step.feedback.correct.length).toBeGreaterThan(0)
    expect(step.feedback.hints.length).toBeGreaterThan(0)
  })

  it('gives each generated step a unique id', () => {
    const a = toPracticeStep(navPuzzle, lesson)
    const b = toPracticeStep(navPuzzle, lesson)
    expect(a.id).not.toBe(b.id)
  })

  it('uses the internal difficulty score when present, falling back to optimal otherwise', () => {
    // No difficulty field -> falls back to the move count (optimal).
    expect(toPracticeStep(navPuzzle, lesson).difficulty).toBe(4)
    // Internal difficulty score present -> it wins over the move count.
    const scored: GeneratedPuzzle = { ...navPuzzle, difficulty: 5 }
    expect(toPracticeStep(scored, lesson).difficulty).toBe(5)
  })

  it('passes through loop blocks, predicates, card limits, range and AI narrative', () => {
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
    const loopPuzzle: GeneratedPuzzle = {
      map: {
        rows: 2,
        cols: 9,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 8 },
        obstacles: [
          { row: 1, col: 3 },
          { row: 1, col: 6 },
        ],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['loop', 'if'],
      predicateOptions: [
        { predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' },
      ],
      loopRange: { min: 1, max: 8 },
      cardLimits: { right: 3, up: 1, down: 1 },
      solution: [hopLoop],
      prompt: 'Two rocks block a long corridor.',
      goal: 'Run, hop, run',
      feedback: { correct: 'Nice loop!', hints: ['Hop the wall.'] },
      optimal: 12,
      concept: 'loops',
      aiGenerated: true,
    }

    const step = toPracticeStep(loopPuzzle, lesson)
    expect(step.blocks).toEqual(['loop', 'if'])
    expect(step.predicateOptions).toHaveLength(1)
    expect(step.cardLimits).toEqual({ right: 3, up: 1, down: 1 })
    expect(step.loopRange).toEqual({ min: 1, max: 8 })
    expect(step.availableCommands).toEqual(['right', 'up', 'down'])
    expect(step.goal).toBe('Run, hop, run')
    expect(step.prompt).toBe('Two rocks block a long corridor.')
    expect(step.feedback.correct).toBe('Nice loop!')

    // The passed-through nested solution still solves the map.
    const run = runInstructions(step.map, step.solution)
    expect(run.status).toBe('success')
  })
})
