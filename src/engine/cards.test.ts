import { describe, it, expect } from 'vitest'
import type { Instruction } from '../types'
import { countCards, withinCardLimits } from './cards'

// The "hop the wall" rule from lesson 5's l5-q1, wrapped in a Repeat.
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

describe('countCards', () => {
  it('counts placements, not executions', () => {
    // One loop card, one if card, and the moves placed inside the body counted
    // ONCE each — never multiplied by the loop count.
    const counts = countCards([hopLoop])
    expect(counts).toEqual({ loop: 1, if: 1, up: 1, right: 3, down: 1 })
  })

  it('counts a flat move sequence', () => {
    expect(countCards(['right', 'right', 'up'])).toEqual({ right: 2, up: 1 })
  })

  it('counts while blocks and their predicates body once', () => {
    const prog: Instruction[] = [
      { kind: 'while', predicate: { sensor: 'clear', dir: 'up' }, body: ['up'], label: 'Up clear' },
    ]
    expect(countCards(prog)).toEqual({ while: 1, up: 1 })
  })

  it('returns an empty tally for an empty program', () => {
    expect(countCards([])).toEqual({})
  })
})

describe('withinCardLimits', () => {
  it('passes when every capped card is within budget', () => {
    const counts = countCards([hopLoop])
    expect(withinCardLimits(counts, { right: 3, up: 1, down: 1 })).toBe(true)
  })

  it('fails when a capped card is overused', () => {
    const counts = countCards([hopLoop])
    expect(withinCardLimits(counts, { right: 2 })).toBe(false)
  })

  it('treats cards absent from the limits as unlimited', () => {
    const counts = countCards(['right', 'right', 'right', 'right'])
    expect(withinCardLimits(counts, { up: 1 })).toBe(true)
  })
})
