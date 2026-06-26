import { describe, it, expect } from 'vitest'
import type { BeatStep, Conditional, Instruction, Loop } from '../types'
import { expectedActions, runBeatProgram, checkBeatProgram } from './beat'

const ifDiv = (divisor: number, then: Instruction[], els: Instruction[]): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'counterMod', divisor, remainder: 0 },
  then,
  else: els,
  label: `divides by ${divisor}`,
})
const repeat = (count: number, body: Instruction[]): Loop => ({
  kind: 'loop',
  count,
  body,
  label: `Repeat ${count}x`,
})

// Nested-If FizzBuzz: ask div-by-3 outside, div-by-5 inside; both -> super.
const correctSolution: Instruction[] = [
  repeat(16, [ifDiv(3, [ifDiv(5, ['super'], ['dash'])], [ifDiv(5, ['shield'], ['hold'])])]),
]

const fizzBuzz: BeatStep = {
  id: 'beat-fizzbuzz',
  type: 'beat',
  goal: 'FizzBuzz',
  prompt: '',
  count: 16,
  rules: [
    { predicate: { sensor: 'counterMod', divisor: 15, remainder: 0 }, action: 'super' },
    { predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 }, action: 'dash' },
    { predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 }, action: 'shield' },
  ],
  defaultAction: 'hold',
  availableActions: ['dash', 'shield', 'super', 'hold'],
  feedback: { correct: 'ok', hints: [] },
  solution: correctSolution,
}

describe('expectedActions (FizzBuzz over 0..15)', () => {
  it('maps the count to the right action, including the both-beats 0 and 15', () => {
    expect(expectedActions(fizzBuzz)).toEqual([
      'super', // 0 (div by 15)
      'hold', // 1
      'hold', // 2
      'dash', // 3
      'hold', // 4
      'shield', // 5
      'dash', // 6
      'hold', // 7
      'hold', // 8
      'dash', // 9
      'shield', // 10
      'hold', // 11
      'dash', // 12
      'hold', // 13
      'hold', // 14
      'super', // 15 (div by 15)
    ])
  })
})

describe('runBeatProgram + checkBeatProgram', () => {
  it('accepts the nested-If solution', () => {
    expect(runBeatProgram(fizzBuzz, correctSolution)).toEqual(expectedActions(fizzBuzz))
    const res = checkBeatProgram(fizzBuzz, correctSolution)
    expect(res.correct).toBe(true)
    expect(res.firstWrongBeat).toBeNull()
  })

  it('fails at beat 0 for the naive rule that forgets the both-beat', () => {
    // Checks div-by-3 then div-by-5 but never the combined case: beat 0 (div 15)
    // should be super, but this emits dash.
    const naive: Instruction[] = [
      repeat(16, [ifDiv(3, ['dash'], [ifDiv(5, ['shield'], ['hold'])])]),
    ]
    const res = checkBeatProgram(fizzBuzz, naive)
    expect(res.correct).toBe(false)
    expect(res.firstWrongBeat).toBe(0)
    expect(res.got[0]).toBe('dash')
    expect(res.expected[0]).toBe('super')
  })

  it('flags a wrong loop count (too few beats)', () => {
    const tooShort: Instruction[] = [
      repeat(10, [ifDiv(3, [ifDiv(5, ['super'], ['dash'])], [ifDiv(5, ['shield'], ['hold'])])]),
    ]
    const res = checkBeatProgram(fizzBuzz, tooShort)
    expect(res.correct).toBe(false)
    expect(res.firstWrongBeat).toBe(10)
  })
})
