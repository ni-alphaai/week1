import { describe, it, expect } from 'vitest'
import type { Step } from '../types'
import { revealsAnswer, extractDirections } from './leakGuard'

const solution: Step[] = ['right', 'right', 'up']

describe('revealsAnswer', () => {
  it('allows a single forward nudge', () => {
    expect(revealsAnswer('Maybe think about going right to start.', solution)).toBe(false)
  })

  it('allows answers with no directions at all', () => {
    expect(revealsAnswer('Look closely at where your explorer stops.', solution)).toBe(false)
  })

  it('allows up to two consecutive solution moves as a nudge', () => {
    expect(revealsAnswer('Go right then right again.', solution)).toBe(false)
  })

  it('blocks three or more consecutive solution moves', () => {
    expect(revealsAnswer('Go right, then right, then up.', solution)).toBe(true)
  })

  it('blocks reproducing the whole short solution', () => {
    expect(revealsAnswer('Just go right then right.', ['right', 'right'])).toBe(true)
  })

  it('blocks a counted run like "up three times"', () => {
    expect(revealsAnswer('You need to go up three times.', solution)).toBe(true)
  })

  it('blocks a number-then-direction like "three up"', () => {
    expect(revealsAnswer('Try three up moves.', solution)).toBe(true)
  })

  it('blocks "right two squares"', () => {
    expect(revealsAnswer('Move right two squares.', solution)).toBe(true)
  })

  it('returns false when there are no directional solution moves', () => {
    expect(revealsAnswer('go right then right', ['pickup', 'drop'] as Step[])).toBe(false)
  })

  it('extracts ordered direction words', () => {
    expect(extractDirections('first up, then to the right, never down')).toEqual(['up', 'right', 'down'])
  })
})
