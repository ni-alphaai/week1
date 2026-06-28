import { describe, it, expect } from 'vitest'
import { BADGES } from './badges'
import { BADGE_ENAMEL, enamelColorFor } from './badgeEnamel'

const HEX = /^#[0-9a-f]{6}$/

describe('badgeEnamel', () => {
  it('maps every achievement badge id to a valid enamel hex', () => {
    for (const b of BADGES) {
      expect(BADGE_ENAMEL[b.id], `missing enamel for ${b.id}`).toMatch(HEX)
    }
  })

  it('returns the explicit color for a mapped id', () => {
    expect(enamelColorFor('first-loop')).toBe(BADGE_ENAMEL['first-loop'])
  })

  it('gives distinct colors to distinct mapped concepts', () => {
    expect(enamelColorFor('first-loop')).not.toBe(enamelColorFor('first-if'))
  })

  it('returns a valid, stable color for unmapped ids', () => {
    const a = enamelColorFor('some-lesson-award-xyz')
    const b = enamelColorFor('some-lesson-award-xyz')
    expect(a).toMatch(HEX)
    expect(a).toBe(b)
  })

  it('returns valid hex for many arbitrary ids', () => {
    for (const id of ['lesson-1', 'lesson-2', 'maze-master', 'zzz', 'A']) {
      expect(enamelColorFor(id)).toMatch(HEX)
    }
  })
})
