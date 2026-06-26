import { describe, it, expect } from 'vitest'
import { loopWithEmptyIf, whileWithEmptyIf } from './scaffolds'

describe('scaffolds', () => {
  it('whileWithEmptyIf pins While + empty If for nested control-flow puzzles', () => {
    const scaffold = whileWithEmptyIf(
      { sensor: 'clear', dir: 'up' },
      'Up is clear',
      { sensor: 'clear', dir: 'right' },
      'Right is clear',
    )
    expect(scaffold.kind).toBe('while')
    expect(scaffold.body).toHaveLength(1)
    expect(scaffold.body[0]).toMatchObject({
      kind: 'conditional',
      then: [],
      else: [],
    })
  })

  it('loopWithEmptyIf pins Repeat + empty If for loop+conditional puzzles', () => {
    const scaffold = loopWithEmptyIf(
      1,
      { sensor: 'blocked', dir: 'right' },
      'wall on the right',
    )
    expect(scaffold.kind).toBe('loop')
    expect(scaffold.count).toBe(1)
    expect(scaffold.body[0]).toMatchObject({
      kind: 'conditional',
      then: [],
      else: [],
    })
  })
})
