import { describe, it, expect } from 'vitest'
import { sortBadgeIds, formatBadgeDate } from './badgeSort'

// Real achievement ids with known rarities (see badges.ts):
//   first-if      → common
//   first-loop    → common
//   first-while   → uncommon
//   practice-20   → uncommon
//   optimal-solver→ rare
//   speedy        → rare
const allEarned = () => true

describe('sortBadgeIds — rarity', () => {
  it('orders rarest first', () => {
    const out = sortBadgeIds(['first-if', 'first-while', 'optimal-solver'], 'rarity', {}, allEarned)
    expect(out).toEqual(['optimal-solver', 'first-while', 'first-if'])
  })

  it('within a rarity, earned badges come before locked ones', () => {
    const isEarned = (id: string) => id === 'first-if'
    const out = sortBadgeIds(['first-loop', 'first-if'], 'rarity', {}, isEarned)
    expect(out).toEqual(['first-if', 'first-loop'])
  })
})

describe('sortBadgeIds — date', () => {
  it('orders most-recently earned first', () => {
    const acquiredAt = { 'first-if': 100, 'first-loop': 300, 'first-while': 200 }
    const out = sortBadgeIds(['first-if', 'first-loop', 'first-while'], 'date', acquiredAt, allEarned)
    expect(out).toEqual(['first-loop', 'first-while', 'first-if'])
  })

  it('puts earned-without-a-date before locked badges', () => {
    const isEarned = (id: string) => id !== 'first-while'
    // first-if earned with date, first-loop earned but no date, first-while locked.
    const out = sortBadgeIds(['first-while', 'first-loop', 'first-if'], 'date', { 'first-if': 500 }, isEarned)
    expect(out).toEqual(['first-if', 'first-loop', 'first-while'])
  })
})

describe('formatBadgeDate', () => {
  it('returns empty string for missing or zero timestamps', () => {
    expect(formatBadgeDate(undefined)).toBe('')
    expect(formatBadgeDate(0)).toBe('')
  })

  it('formats a real timestamp into a non-empty label', () => {
    expect(formatBadgeDate(Date.UTC(2025, 0, 1))).not.toBe('')
  })
})
