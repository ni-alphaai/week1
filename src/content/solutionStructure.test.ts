import { describe, it, expect } from 'vitest'
import { solutionStructure, solutionsTooSimilar } from './solutionStructure'
import type { Instruction } from '../types'

describe('solutionStructure', () => {
  it('distinguishes loop-wrapped if from sequential if + while', () => {
    const loopHop: Instruction[] = [
      {
        kind: 'loop',
        count: 5,
        body: [
          {
            kind: 'conditional',
            predicate: { sensor: 'blocked', dir: 'right' },
            then: ['up', 'right', 'right', 'down'],
            else: ['right'],
            label: '',
          },
        ],
        label: '',
      },
    ]
    const hopThenMarch: Instruction[] = [
      {
        kind: 'conditional',
        predicate: { sensor: 'blocked', dir: 'right' },
        then: ['up', 'right', 'right', 'down'],
        else: [],
        label: '',
      },
      {
        kind: 'while',
        predicate: { sensor: 'clear', dir: 'right' },
        body: ['right'],
        label: '',
      },
    ]
    expect(solutionsTooSimilar(loopHop, hopThenMarch)).toBe(false)
    expect(solutionStructure(loopHop)).not.toBe(solutionStructure(hopThenMarch))
  })

  it('flags identical loop-if shapes', () => {
    const a: Instruction[] = [
      {
        kind: 'loop',
        count: 5,
        body: [
          {
            kind: 'conditional',
            predicate: { sensor: 'blocked', dir: 'right' },
            then: ['up', 'right', 'right', 'down'],
            else: ['right'],
            label: '',
          },
        ],
        label: '',
      },
    ]
    const b: Instruction[] = [
      {
        kind: 'loop',
        count: 6,
        body: [
          {
            kind: 'conditional',
            predicate: { sensor: 'blocked', dir: 'right' },
            then: ['down', 'right', 'right', 'up'],
            else: ['right'],
            label: '',
          },
        ],
        label: '',
      },
    ]
    expect(solutionsTooSimilar(a, b)).toBe(true)
  })
})
