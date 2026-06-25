import { describe, it, expect } from 'vitest'
import { pickHint } from './hints'

describe('pickHint', () => {
  const hints = ['First nudge.', 'Second nudge.', 'Final nudge.']

  it('returns the first hint on the initial failure', () => {
    expect(pickHint(hints, 0)).toBe('First nudge.')
  })

  it('escalates hints with each prior failure', () => {
    expect(pickHint(hints, 1)).toBe('Second nudge.')
    expect(pickHint(hints, 2)).toBe('Final nudge.')
  })

  it('stays on the last hint after exhausting the list', () => {
    expect(pickHint(hints, 5)).toBe('Final nudge.')
  })

  it('returns a generic fallback when no hints exist', () => {
    expect(pickHint([], 0)).toMatch(/study the map/i)
  })
})
