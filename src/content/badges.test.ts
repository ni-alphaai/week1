import { describe, it, expect } from 'vitest'
import type { Instruction, Lesson } from '../types'
import { emptyLearnerState } from '../storage/types'
import type { AwardCtx, LearnerState } from '../storage/types'
import { BADGES, BADGE_LABELS, evaluateBadges } from './badges'

const lesson: Lesson = {
  id: 'lesson-x',
  version: 1,
  title: 'Test Lesson',
  subtitle: 'fixture',
  sequence: 1,
  skillIds: ['sequencing'],
  steps: [
    { id: 'intro', type: 'concept', title: 'Hi', body: 'body' },
    {
      id: 'q1',
      type: 'sequence',
      goal: 'Reach treasure',
      prompt: 'p',
      map: { rows: 1, cols: 2, start: { row: 0, col: 0 }, goal: { row: 0, col: 1 } },
      availableCommands: ['right'],
      successRule: 'reachGoal',
      feedback: { correct: 'c', hints: ['h'] },
    },
  ],
}

function ctx(over: Partial<AwardCtx> & Pick<AwardCtx, 'correct' | 'program'>): AwardCtx {
  const state = over.state ?? emptyLearnerState('l1')
  return {
    state,
    lesson,
    stepId: 'q1',
    correct: over.correct,
    source: over.source ?? 'lesson',
    program: over.program,
    optimalSolved: over.optimalSolved ?? false,
    priorIncorrect: over.priorIncorrect ?? 0,
    solveMs: over.solveMs ?? 0,
  }
}

function withBadges(state: LearnerState, ids: string[]): LearnerState {
  return { ...state, badges: [...ids] }
}

const loop: Instruction = { kind: 'loop', count: 2, body: ['right'], label: 'Repeat 2' }
const whileBlock: Instruction = { kind: 'while', predicate: { sensor: 'atGem' }, body: ['right'], label: 'While' }
const ifBlock: Instruction = {
  kind: 'conditional',
  predicate: { sensor: 'atGem' },
  then: ['right'],
  else: [],
  label: 'If',
}

describe('BADGES / BADGE_LABELS', () => {
  it('exposes a label entry for every badge id', () => {
    for (const b of BADGES) {
      expect(BADGE_LABELS[b.id]).toEqual({ title: b.title, blurb: b.blurb })
    }
  })
})

describe('evaluateBadges — first-block badges', () => {
  it('awards first-loop on a correct solve using a Repeat block', () => {
    const ids = evaluateBadges(ctx({ correct: true, program: [loop] }))
    expect(ids).toContain('first-loop')
    expect(ids).not.toContain('first-while')
    expect(ids).not.toContain('first-if')
  })

  it('awards first-while on a correct solve using a While block', () => {
    const ids = evaluateBadges(ctx({ correct: true, program: [whileBlock] }))
    expect(ids).toContain('first-while')
  })

  it('awards first-if on a correct solve using an If block', () => {
    const ids = evaluateBadges(ctx({ correct: true, program: [ifBlock] }))
    expect(ids).toContain('first-if')
  })

  it('does not award a first-block badge on an incorrect solve', () => {
    expect(evaluateBadges(ctx({ correct: false, program: [loop] }))).not.toContain('first-loop')
  })

  it('detects blocks nested inside other blocks', () => {
    const nested: Instruction = { kind: 'loop', count: 2, body: [ifBlock], label: 'Repeat 2' }
    const ids = evaluateBadges(ctx({ correct: true, program: [nested] }))
    expect(ids).toContain('first-loop')
    expect(ids).toContain('first-if')
  })

  it('does not re-award a first-block badge already held', () => {
    const state = withBadges(emptyLearnerState('l1'), ['first-loop'])
    expect(evaluateBadges(ctx({ state, correct: true, program: [loop] }))).not.toContain('first-loop')
  })
})

describe('evaluateBadges — practice count badges', () => {
  it('awards practice-5 once practiceCorrect reaches 5', () => {
    const state = emptyLearnerState('l1')
    state.skillStats = {
      seq: {
        attempts: 5,
        correct: 5,
        struggles: 0,
        source: 'lesson',
        practiceAttempts: 5,
        practiceCorrect: 5,
        lastCorrectAt: null,
      },
    }
    expect(evaluateBadges(ctx({ state, correct: true, program: [] }))).toContain('practice-5')
    expect(evaluateBadges(ctx({ state, correct: true, program: [] }))).not.toContain('practice-20')
  })

  it('awards practice-20 once practiceCorrect reaches 20', () => {
    const state = emptyLearnerState('l1')
    state.skillStats = {
      seq: {
        attempts: 20,
        correct: 20,
        struggles: 0,
        source: 'lesson',
        practiceAttempts: 20,
        practiceCorrect: 20,
        lastCorrectAt: null,
      },
    }
    const ids = evaluateBadges(ctx({ state, correct: true, program: [] }))
    expect(ids).toContain('practice-5')
    expect(ids).toContain('practice-20')
  })
})

describe('evaluateBadges — comeback / optimal / speedy', () => {
  it('awards comeback-kid when solving after 3+ prior incorrect', () => {
    expect(evaluateBadges(ctx({ correct: true, program: [], priorIncorrect: 3 }))).toContain('comeback-kid')
    expect(evaluateBadges(ctx({ correct: true, program: [], priorIncorrect: 2 }))).not.toContain('comeback-kid')
  })

  it('awards optimal-solver when optimalSolved is true and correct', () => {
    expect(evaluateBadges(ctx({ correct: true, program: [], optimalSolved: true }))).toContain('optimal-solver')
    expect(evaluateBadges(ctx({ correct: true, program: [], optimalSolved: false }))).not.toContain('optimal-solver')
  })

  it('awards speedy when solveMs is positive and under 30s', () => {
    expect(evaluateBadges(ctx({ correct: true, program: [], solveMs: 12000 }))).toContain('speedy')
    expect(evaluateBadges(ctx({ correct: true, program: [], solveMs: 40000 }))).not.toContain('speedy')
    expect(evaluateBadges(ctx({ correct: true, program: [], solveMs: 0 }))).not.toContain('speedy')
  })
})

describe('evaluateBadges — idempotence', () => {
  it('never returns ids already present in state.badges', () => {
    const state = withBadges(emptyLearnerState('l1'), [
      'first-loop',
      'first-while',
      'first-if',
      'practice-5',
      'practice-20',
      'comeback-kid',
      'optimal-solver',
      'speedy',
    ])
    state.skillStats = {
      seq: {
        attempts: 20,
        correct: 20,
        struggles: 0,
        source: 'lesson',
        practiceAttempts: 20,
        practiceCorrect: 20,
        lastCorrectAt: null,
      },
    }
    const ids = evaluateBadges(
      ctx({
        state,
        correct: true,
        program: [loop, whileBlock, ifBlock],
        optimalSolved: true,
        priorIncorrect: 3,
        solveMs: 1000,
      }),
    )
    expect(ids).toEqual([])
  })
})
