import { describe, it, expect, vi } from 'vitest'

vi.mock('../ai/config', () => ({ aiAdaptiveEnabled: true, aiAdaptiveOn: () => true }))

import {
  recommendDirection,
  nextDifficultyDirection,
  pickByDifficulty,
  bandForDirection,
  targetLevelForDirection,
  TARGET_LEVELS,
} from './difficulty'

describe('recommendDirection', () => {
  it('keeps difficulty the same with no data', () => {
    expect(recommendDirection(null)).toBe('same')
  })
  it('goes harder when above the band', () => {
    expect(recommendDirection(0.95)).toBe('harder')
  })
  it('goes easier when below the band', () => {
    expect(recommendDirection(0.5)).toBe('easier')
  })
  it('stays in the sweet spot', () => {
    expect(recommendDirection(0.8)).toBe('same')
  })
})

describe('nextDifficultyDirection (adaptive flag on)', () => {
  it('delegates to recommendDirection when enabled', () => {
    expect(nextDifficultyDirection(0.95)).toBe('harder')
    expect(nextDifficultyDirection(0.4)).toBe('easier')
  })
})

describe('pickByDifficulty', () => {
  const pool = [{ optimal: 2 }, { optimal: 5 }, { optimal: 8 }]
  it('picks the closest harder puzzle', () => {
    expect(pickByDifficulty(pool, 4, 'harder')).toEqual({ optimal: 5 })
  })
  it('picks the closest easier puzzle', () => {
    expect(pickByDifficulty(pool, 4, 'easier')).toEqual({ optimal: 2 })
  })
  it('returns null when direction is same', () => {
    expect(pickByDifficulty(pool, 4, 'same')).toBeNull()
  })
  it('returns null when nothing fits the direction', () => {
    expect(pickByDifficulty([{ optimal: 3 }], 1, 'easier')).toBeNull()
  })
})

describe('bandForDirection', () => {
  it('maps each direction to an increasing move-count band', () => {
    const easier = bandForDirection('easier')
    const same = bandForDirection('same')
    const harder = bandForDirection('harder')
    expect(easier.maxMoves).toBeLessThanOrEqual(same.minMoves)
    expect(same.maxMoves).toBeLessThanOrEqual(harder.minMoves)
    expect(harder.minMoves).toBeGreaterThan(easier.maxMoves)
  })
})

describe('targetLevelForDirection', () => {
  it('maps easier/same/harder to internal levels 3/4/5', () => {
    expect(targetLevelForDirection('easier')).toBe(3)
    expect(targetLevelForDirection('same')).toBe(4)
    expect(targetLevelForDirection('harder')).toBe(5)
  })
  it('exposes the same mapping via TARGET_LEVELS', () => {
    expect(TARGET_LEVELS).toEqual({ easier: 3, same: 4, harder: 5 })
  })
})
