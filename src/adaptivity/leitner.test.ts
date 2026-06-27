import { describe, it, expect } from 'vitest'
import { promote, reset, isDue, intervalDays, supportLevel, difficultyForBox } from './leitner'

const DAY = 24 * 60 * 60 * 1000

describe('leitner', () => {
  it('promote caps at box 5', () => {
    expect(promote(1)).toBe(2)
    expect(promote(5)).toBe(5)
  })
  it('reset returns box 1', () => { expect(reset()).toBe(1) })
  it('intervals grow 1/2/4/7/14', () => {
    expect([1, 2, 3, 4, 5].map(b => intervalDays(b as any))).toEqual([1, 2, 4, 7, 14])
  })
  it('never-reviewed skill is due', () => { expect(isDue(1, null, 1000)).toBe(true) })
  it('due once the box interval elapses', () => {
    const now = 100 * DAY
    expect(isDue(2, now - 2 * DAY, now)).toBe(true)   // exactly elapsed
    expect(isDue(2, now - 1 * DAY, now)).toBe(false)  // not yet
  })
  it('support and difficulty fade with box', () => {
    expect(supportLevel(1)).toBe('supported')
    expect(supportLevel(5)).toBe('faded')
    expect(difficultyForBox(1)).toBe(3)
    expect(difficultyForBox(5)).toBe(5)
  })
})
