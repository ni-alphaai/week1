import { describe, it, expect } from 'vitest'
import type { Instruction } from '../types'
import { programToText } from './grounding'

describe('programToText', () => {
  it('serializes plain moves', () => {
    expect(programToText(['right', 'up'])).toBe('right, up')
  })

  it('reports an empty program', () => {
    expect(programToText([])).toBe('no cards at all')
  })

  it('preserves loop structure and count', () => {
    const prog: Instruction[] = [
      { kind: 'loop', count: 3, body: ['right', 'up'], label: 'Repeat 3x' },
    ]
    expect(programToText(prog)).toBe('Repeat 3x [right, up]')
  })

  it('preserves if/else structure with its label', () => {
    const prog: Instruction[] = [
      {
        kind: 'conditional',
        predicate: { sensor: 'bridgeOpen' },
        then: ['right'],
        else: ['up'],
        label: 'the bridge is open',
      },
    ]
    expect(programToText(prog)).toBe('If the bridge is open [then: right] [else: up]')
  })

  it('preserves while structure with its label', () => {
    const prog: Instruction[] = [
      {
        kind: 'while',
        predicate: { sensor: 'clear', dir: 'right' },
        body: ['right'],
        label: 'the path on the right is clear',
      },
    ]
    expect(programToText(prog)).toBe('While the path on the right is clear [right]')
  })
})
