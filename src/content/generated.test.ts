import { describe, it, expect } from 'vitest'
import type { Instruction, Lesson } from '../types'
import type { GeneratedPuzzle } from '../ai/generation'
import { runInstructions } from '../engine/map'
import { checkProgram } from '../engine/checker'
import {
  toPracticeStep,
  buildPracticeTemplate,
  smallerVariantTemplate,
  deriveSmallerVariantPuzzle,
  recordPracticePuzzle,
  clearPracticeSession,
  mapMechanicsFromStep,
} from './generated'

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

// A lesson that maps to a real generator concept, so the templates aren't null.
const loopLesson: Lesson = { ...lesson, id: 'lesson-2-for-loops', skillIds: ['loops'] }

describe('smallerVariantTemplate', () => {
  it('ignores session generation history so resuming does not over-constrain it', () => {
    clearPracticeSession(loopLesson.id)
    // Simulate the state a resuming learner returns to: the "Keep practicing"
    // prefetch already recorded puzzles for this lesson this session.
    recordPracticePuzzle(loopLesson.id, navPuzzle)
    recordPracticePuzzle(loopLesson.id, navPuzzle)

    // Regular practice carries that anti-repetition history…
    const practice = buildPracticeTemplate(loopLesson, { direction: 'easier' })
    expect(practice?.priorGenerated?.length ?? 0).toBeGreaterThan(0)

    // …but the smaller-variant template must not, so it generates the same
    // whether the learner is starting fresh or resuming mid-lesson.
    const variant = smallerVariantTemplate(loopLesson)
    expect(variant).not.toBeNull()
    expect(variant!.priorGenerated ?? []).toEqual([])

    clearPracticeSession(loopLesson.id)
  })
})

describe('deriveSmallerVariantPuzzle', () => {
  // Two authored play steps of different sizes; the easiest (fewest moves) wins.
  const bigStep = {
    id: 's-big',
    type: 'sequence' as const,
    goal: 'Long run',
    prompt: 'Go far.',
    map: { rows: 1, cols: 4, start: { row: 0, col: 0 }, goal: { row: 0, col: 3 }, obstacles: [] },
    availableCommands: ['right'] as const,
    successRule: 'reachGoal' as const,
    solution: ['right', 'right', 'right'] as Instruction[],
    feedback: { correct: 'Done.', hints: [] },
  }
  const smallStep = {
    id: 's-small',
    type: 'sequence' as const,
    goal: 'Short hop',
    prompt: 'One step.',
    map: { rows: 1, cols: 2, start: { row: 0, col: 0 }, goal: { row: 0, col: 1 }, obstacles: [] },
    availableCommands: ['right'] as const,
    successRule: 'reachGoal' as const,
    solution: ['right'] as Instruction[],
    feedback: { correct: 'Nice.', hints: [] },
  }

  it('returns the simplest authored play step as a solvable GeneratedPuzzle', () => {
    const l: Lesson = {
      ...loopLesson,
      steps: [
        { id: 'intro', type: 'concept', title: 'Hi', body: 'x' },
        bigStep,
        smallStep,
      ],
    }
    const puzzle = deriveSmallerVariantPuzzle(l)
    expect(puzzle).not.toBeNull()
    // Picked the 1-move step over the 3-move step.
    expect(puzzle!.optimal).toBe(1)
    expect(puzzle!.map).toEqual(smallStep.map)
    expect(puzzle!.concept).toBe('loops')
    // It is genuinely solvable with the carried solution.
    expect(runInstructions(puzzle!.map, puzzle!.solution).status).toBe('success')
  })

  it('returns null when the lesson has no authored play step', () => {
    const l: Lesson = { ...lesson, steps: [{ id: 'intro', type: 'concept', title: 'Hi', body: 'x' }] }
    expect(deriveSmallerVariantPuzzle(l)).toBeNull()
  })

  it('deriveSmallerVariantPuzzle keeps a mechanic-bearing step over a smaller plain step', () => {
    // plainSmall: 1-move, no mechanic
    const plainSmall = {
      id: 's-plain-small',
      type: 'sequence' as const,
      goal: 'Short hop',
      prompt: 'One step.',
      map: { rows: 1, cols: 2, start: { row: 0, col: 0 }, goal: { row: 0, col: 1 } },
      availableCommands: ['right'] as const,
      successRule: 'reachGoal' as const,
      solution: ['right'] as Instruction[],
      feedback: { correct: 'Nice.', hints: [] },
    }
    // mechanicStep: 2-move WITH a teleport off the solution path -> mapMechanicsFromStep detects 'teleports'
    // The teleport pair is at (0,3)/(0,4) — off the solution path [right,right] from (0,0) to (0,2)
    const mechanicStep = {
      id: 's-mechanic',
      type: 'sequence' as const,
      goal: 'Teleport run',
      prompt: 'Two steps.',
      map: {
        rows: 1,
        cols: 5,
        start: { row: 0, col: 0 },
        goal: { row: 0, col: 2 },
        teleports: [{ a: { row: 0, col: 3 }, b: { row: 0, col: 4 } }],
      },
      availableCommands: ['right'] as const,
      successRule: 'reachGoal' as const,
      solution: ['right', 'right'] as Instruction[],
      feedback: { correct: 'Done.', hints: [] },
    }
    const l: Lesson = {
      ...loopLesson,
      steps: [plainSmall, mechanicStep],
    }
    const variant = deriveSmallerVariantPuzzle(l)
    expect(variant).not.toBe(null)
    expect(mapMechanicsFromStep(variant!.map, variant!.availableActions).length).toBeGreaterThan(0)
  })
})
